"use strict";

// Reverse only the live row-11 HNF calls into the compact 430 x 11 source
// transform.  This module has no file-input or retained-transcript entry point.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const TRANSFORM_SCHEMA = "sagejs.pari-class-group/row11-compact-hnf-transform-v1";
const ROWS = 421, COLUMNS = 430, INITIAL = 427, KERNEL = 9, TARGETS = 11, PLACES = 3;
const INTEGER = /^-?(0|[1-9][0-9]*)$/;

class Row11TerminalClassClosureFailure extends Error {}
function fail(message) { throw new Row11TerminalClassClosureFailure(message); }
function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function arraySha(values) { return sha(Buffer.from(values.join("\n"))); }
function view(owner, length) {
  return (owner.toArray ? owner.toArray() : Array.from(owner)).slice(0, length);
}
function integer(value) {
  if (!value || value.kind !== "integer" || !INTEGER.test(value.value)) fail("invalid exported integer");
  return value.value;
}
function integerMatrix(matrix) {
  if (!matrix || matrix.kind !== "matrix" || !Array.isArray(matrix.values)) fail("invalid exported matrix");
  return matrix.values.flatMap(column => {
    if (column.kind !== "column" || !Array.isArray(column.values)) fail("invalid exported matrix column");
    return column.values.map(integer);
  });
}
function integerVector(vector, length, label) {
  if (!vector || !["column", "vector", "small-vector"].includes(vector.kind) ||
      !Array.isArray(vector.values) || vector.values.length !== length) fail(`${label} changed`);
  return vector.values.map(value => typeof value === "string" ? value : integer(value));
}
function realTriple(value) {
  if (value.kind === "integer") return [integer(value), "-1", "0"];
  if (value.kind !== "real" || !INTEGER.test(value.mantissa) ||
      !Number.isSafeInteger(value.precision) || !Number.isSafeInteger(value.exponent))
    fail("invalid exported real");
  return [value.mantissa, String(value.precision), String(value.exponent)];
}
function logMatrix(matrix) {
  if (!matrix || matrix.kind !== "matrix" || !Array.isArray(matrix.values)) fail("invalid exported log matrix");
  return matrix.values.flatMap(column => {
    if (column.kind !== "column" || !Array.isArray(column.values)) fail("invalid exported log column");
    return column.values.flatMap(value => value.kind === "complex"
      ? ["2", ...realTriple(value.real), ...realTriple(value.imag)]
      : ["1", ...realTriple(value), "0", "-1", "0"]);
  });
}
function signature(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = fs.readFileSync(source, "utf8").match(new RegExp(`def ${escaped}\\(([\\s\\S]*?)\\n\\)`));
  if (!match) fail(`missing native signature ${name}`);
  return match[1].trim().split("\n").map(line => line.trim().replace(/,$/, "").split(": "));
}
async function compiled(file, name) {
  const source = path.join(__dirname, file), built = await compileKernel({ sourcePath: source });
  const fn = require(built.modulePath)[name];
  if (!fn?.nativeAvailable) fail(`${name} did not compile natively`);
  return { fn, names: signature(source, name) };
}
function words(values, minimum = 1) {
  return values.reduce((answer, raw) => {
    let value = BigInt(raw); if (value < 0n) value = -value;
    return Math.max(answer, Math.ceil(Math.max(1, value.toString(2).length) / 64));
  }, minimum);
}
function allocate(kernel, names, lengths, explicit = {}, capacity = 16) {
  const values = {};
  for (const [name, kind] of names) {
    if (!kind.endsWith("Buffer")) {
      values[name] = typeof explicit[name] === "boolean" ? explicit[name] : BigInt(explicit[name]);
      continue;
    }
    const supplied = explicit[name], length = supplied === undefined ? lengths[name] : supplied.length;
    if (length === undefined) fail(`missing native length ${name}`);
    if (kind === "Int64Buffer")
      values[name] = kernel.createInt64Buffer(supplied === undefined ? length : supplied.map(BigInt));
    else
      values[name] = kernel.createIntegerBuffer(length,
        supplied === undefined ? capacity : words(supplied, capacity),
        supplied === undefined ? undefined : supplied.map(BigInt));
  }
  return values;
}
function floorDiv(value, divisor) {
  if (divisor <= 0n) fail("reverse HNF pivot is not positive");
  return value >= 0n ? value / divisor : -((-value + divisor - 1n) / divisor);
}
function reverseHnfFinal(output, step) {
  const { rows, depRows, columns, tail, fullH, fullDep, trailing, transform, diagonal } = step;
  const lig = rows + depRows, zc = columns - rows;
  if (output.length !== columns + tail) fail("wrong reverse HNF width");
  const work = Array(columns).fill(0n), inputTail = output.slice(columns);
  for (let column = 0; column < zc; column += 1) work[column] = output[column];
  const removed = diagonal.reduce((sum, value) => sum + Number(value), 0), newColumns = columns - removed;
  let unit = 0, nonunit = 0;
  for (let row = 0; row < rows; row += 1) {
    const destination = diagonal[row] ? newColumns + unit++ : zc + nonunit++;
    work[zc + row] = output[destination];
  }
  const b = trailing.slice();
  for (let row = rows - 1; row >= 0; row -= 1) {
    const pivot = fullH[(zc + row) * rows + row];
    for (let column = 0; column < tail; column += 1) {
      let quotient = b[column * lig + depRows + row];
      if (!diagonal[row]) quotient = floorDiv(quotient, pivot);
      if (!quotient) continue;
      for (let index = 0; index < depRows; index += 1)
        b[column * lig + index] -= quotient * fullDep[(zc + row) * depRows + index];
      for (let index = 0; index < rows; index += 1)
        b[column * lig + depRows + index] -= quotient * fullH[(zc + row) * rows + index];
      work[zc + row] -= quotient * inputTail[column];
    }
  }
  const input = Array(columns + tail).fill(0n);
  for (let source = 0; source < columns; source += 1)
    for (let column = 0; column < columns; column += 1)
      input[source] += transform[column * columns + source] * work[column];
  for (let column = 0; column < tail; column += 1) input[columns + column] = inputTail[column];
  return input;
}
function reverseAppend(output, step, raw) {
  const old = Array(step.oldTotal).fill(0n);
  for (let column = 0; column < step.zeroPrefix; column += 1) old[column] = output[column];
  const joined = reverseHnfFinal(output.slice(step.zeroPrefix), step.hnf);
  const lig = step.rows - step.bColumns, relationColumns = step.oldTotal - step.bColumns;
  for (let column = 0; column < step.newColumns; column += 1) {
    const coefficient = joined[column]; raw[step.oldTotal + column] += coefficient;
    for (let tail = 0; tail < step.bColumns; tail += 1)
      old[relationColumns + tail] -= coefficient * step.newRelations[column * step.rows + Number(step.perm[lig + tail]) - 1];
  }
  for (let column = 0; column < step.hRows + step.bColumns; column += 1)
    old[step.zeroPrefix + column] += joined[step.newColumns + column];
  return old;
}
function hnfStep(values, rows, depRows, columns, tail, trailingName, transformName) {
  return { rows, depRows, columns, tail,
    trailing: view(values[trailingName], (rows + depRows) * tail),
    transform: view(values[transformName], columns * columns),
    fullH: view(values.full_h, rows * columns),
    fullDep: view(values.full_dep, depRows * columns),
    diagonal: view(values.diagonal, rows) };
}
function compareCheckpoint(values, event, state, label) {
  const hRows = state[0], bColumns = state[2], depRows = state[3], columns = state[7];
  const actual = { h: view(values.result_h, hRows * hRows).map(String),
    dep: view(values.result_dep, depRows * hRows).map(String),
    b: view(values.result_b, (ROWS - bColumns) * bColumns).map(String),
    c: view(values.result_c, 7 * PLACES * columns).map(String),
    perm: view(values.perm, ROWS).map(String) };
  const expected = { h: integerMatrix(event.exactW), dep: integerMatrix(event.exactDep),
    b: integerMatrix(event.exactB), c: logMatrix(event.exactC),
    perm: integerVector(event.perm, ROWS, "HNF permutation") };
  for (const name of Object.keys(expected))
    if (JSON.stringify(actual[name]) !== JSON.stringify(expected[name])) fail(`${label} ${name} replay changed`);
  return sha(Buffer.from(JSON.stringify(actual)));
}
async function sourceTransform(trace) {
  const hnfs = trace.events.filter(event => event.event === "hnf");
  if (hnfs.length !== 3 || hnfs.map(event => event.relations).join(",") !== "427,428,430")
    fail("row-11 HNF schedule changed");
  const final = hnfs[2], records = final.relationRecords.flatMap(record => integerVector(record.R, ROWS, "relation"));
  const logs = logMatrix(final.exactEmbeddings), factor = trace.events.find(event => event.event === "factor_base");
  const initialPerm = integerVector(factor?.perm, ROWS, "initial permutation").map(BigInt);
  const initial = await compiled("hnfspec_complete.py", "pari_hnfspec_complete");
  const size = ROWS * INITIAL, logSize = 7 * PLACES * INITIAL, k0 = 4;
  const lengths = { mat:size,dense:k0*INITIAL,transform:INITIAL**2,vmax:INITIAL,found:1,sparse_state:13,
    bottom:(ROWS-k0)*INITIAL,updated_dense:k0*INITIAL,extra:size,cleanup_state:10,rank_matrix:size,
    occupied:INITIAL,pivots:ROWS,best:ROWS,profile:ROWS+1,rank_state:10,perm_work:ROWS,matbnew:size,
    dep:size,b:size,assembly_state:6,transformed_logs:logSize,full_h:size,hnf_transform:INITIAL**2,
    lam:INITIAL**2,d:INITIAL+1,hnf_state:11,full_dep:size,work_b:size,work_c:logSize,diagonal:ROWS,
    result_h:size,result_dep:size,result_b:ROWS*(INITIAL+ROWS),result_c:logSize,final_state:7,state:9,
    cup_arena:1200000,cup_frames:64,cup_solve_state:8,cup_state:8 };
  const iv = allocate(initial.fn, initial.names, lengths, { original:records.slice(0,size),rows:ROWS,
    columns:INITIAL,perm:initialPerm,k0,logs:logs.slice(0,logSize),log_rows:PLACES });
  if (initial.fn.gmp(...initial.names.map(([name]) => iv[name])) !== 0n) fail("initial source HNF did not complete");
  const states = [Array.from(iv.state, Number)], hashes = [compareCheckpoint(iv, hnfs[0], states[0], "427")];
  const assembly = Array.from(iv.assembly_state, Number);
  const initialStep = { columns:INITIAL, cleanupTransform:view(iv.transform, INITIAL**2),
    hnf:hnfStep(iv, assembly[0], assembly[1], assembly[2], assembly[4], "b", "hnf_transform") };
  let resident = { state:states[0], perm:view(iv.perm,ROWS), h:view(iv.result_h,states[0][0]**2),
    dep:view(iv.result_dep,states[0][3]*states[0][0]), b:view(iv.result_b,(ROWS-states[0][2])*states[0][2]),
    c:view(iv.result_c,7*PLACES*INITIAL) };
  const append = await compiled("hnfadd.py", "pari_hnfadd"), appendSteps = [];
  for (const nextTotal of [428, 430]) {
    const oldTotal=resident.state[7], newColumns=nextTotal-oldTotal, hRows=resident.state[0], bColumns=resident.state[2];
    const lig=ROWS-bColumns, width=hRows+newColumns, cWidth=width+bColumns, depRows=resident.state[3];
    const al={top:lig*newColumns,exact_product:lig*newColumns,log_product:7*PLACES*newColumns,
      adjusted_logs:7*PLACES*newColumns,joined:lig*width,joined_logs:7*PLACES*cWidth,rank_matrix:lig*width,
      occupied:width,pivots:lig,best:lig,profile:lig,rank_state:10,perm_work:ROWS,matb:lig*width,
      new_dep:lig*width,permuted_b:lig*bColumns,full_h:lig*width,transform:width*width,lam:width*width,
      d:width+1,hnf_state:11,full_dep:lig*width,work_b:lig*bColumns,work_c:7*PLACES*cWidth,
      diagonal:lig,final_c:7*PLACES*cWidth,result_h:lig*lig,result_dep:lig*lig,
      result_b:lig*(bColumns+lig),result_c:7*PLACES*nextTotal,final_state:7,state:9};
    const beforePerm=resident.perm.slice(), explicit={h:resident.h,h_rows:hRows,dep:resident.dep,b:resident.b,
      b_columns:bColumns,logs:resident.c,total_columns:oldTotal,log_rows:PLACES,perm:resident.perm,rows:ROWS,
      new_relations:records.slice(oldTotal*ROWS,nextTotal*ROWS),new_columns:newColumns,
      new_logs:logs.slice(oldTotal*7*PLACES,nextTotal*7*PLACES)};
    const av=allocate(append.fn,append.names,al,explicit);
    if (append.fn.gmp(...append.names.map(([name])=>av[name])) !== 0n) fail(`${nextTotal} source HNF did not complete`);
    const rankState=view(av.rank_state,10).map(Number), redundant=rankState[7], genuine=lig-redundant;
    const zeroPrefix=oldTotal-bColumns-hRows;
    appendSteps.push({oldTotal,newColumns,zeroPrefix,hRows,bColumns,perm:beforePerm,
      newRelations:explicit.new_relations.map(BigInt),rows:ROWS,
      hnf:hnfStep(av,genuine,redundant,width,bColumns,"permuted_b","transform")});
    const state=Array.from(av.state,Number);states.push(state);hashes.push(compareCheckpoint(av,hnfs[states.length-1],state,String(nextTotal)));
    resident={state,perm:view(av.perm,ROWS),h:view(av.result_h,state[0]**2),dep:view(av.result_dep,state[3]*state[0]),
      b:view(av.result_b,(ROWS-state[2])*state[2]),c:view(av.result_c,7*PLACES*nextTotal)};
  }
  if (states.map(state=>state[7]).join(",") !== "427,428,430" || resident.state[0] !== 2 || resident.state[2] !== 419)
    fail("terminal source HNF state changed");
  const transforms=[];
  for(let target=0;target<TARGETS;target++){
    let current=Array(COLUMNS).fill(0n);current[target]=1n;const raw=Array(COLUMNS).fill(0n);
    for(let index=appendSteps.length-1;index>=0;index--)current=reverseAppend(current,appendSteps[index],raw);
    const cleaned=reverseHnfFinal(current,initialStep.hnf);
    for(let source=0;source<INITIAL;source++)
      for(let column=0;column<INITIAL;column++)raw[source]+=initialStep.cleanupTransform[column*INITIAL+source]*cleaned[column];
    transforms.push(...raw);
  }
  const relationBig=records.map(BigInt), finalPerm=resident.perm.map(Number), h=resident.h;
  for(let target=0;target<TARGETS;target++)for(let row=0;row<ROWS;row++){
    let actual=0n;for(let source=0;source<COLUMNS;source++)actual+=relationBig[source*ROWS+row]*transforms[target*COLUMNS+source];
    let expected=0n;if(target>=KERNEL){const logical=finalPerm.indexOf(row+1);if(logical>=0&&logical<2)expected=h[(target-KERNEL)*2+logical];}
    if(actual!==expected)fail(`compact transform replay failed at ${target},${row}`);
  }
  return {schema:TRANSFORM_SCHEMA,shape:[COLUMNS,TARGETS],transform:transforms.map(String),hnfStates:states,
    hnfCheckpointSha256:hashes,maximumCoefficientBits:Math.max(...transforms.map(value=>(value<0n?-value:value).toString(2).length)),
    relationReplayCells:ROWS*TARGETS,genericSquareTransformMaterialized:false};
}

module.exports = { Row11TerminalClassClosureFailure, sourceTransform };

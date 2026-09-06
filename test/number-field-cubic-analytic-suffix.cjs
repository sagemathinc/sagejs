// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const { createNativeImportResolver } = require("../tools/native-kernel/native-imports.cjs");
const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = resolve(__dirname, "..");
const sourcePath = join(root, "src/lib/sagejs/number_fields/cubic_class_number_native.py");
const helperNames = ["_cubic_analytic_index_bounds", "_cubic_classify_analytic_index",
  "_cubic_saturate_analytic_unit", "_cubic_publish_analytic_relation_presentation"];

function expandActualHelpers() {
  const source = readFileSync(sourcePath, "utf8");
  const definitions = new Map();
  const matches = [...source.matchAll(/^(?:@native\n)?def ([\w]+)\(/gm)];
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    const end = matches[index + 1]?.index ?? source.indexOf("\n__all__ =", match.index);
    definitions.set(match[1], source.slice(match.index, end).replace(/^@native\n/, ""));
  }
  const needed = new Set();
  const pending = [...helperNames, "_cubic_regulator_bounds", "_cubic_log_interval_bounds",
    "_cubic_log_two_pi_bounds", "_cubic_arb_log_positive_rational_bounds"];
  while (pending.length) {
    const name = pending.pop();
    if (needed.has(name)) continue;
    needed.add(name);
    const body = definitions.get(name);
    assert.ok(body, name);
    for (const call of body.matchAll(/\b(_cubic_\w+)\s*\(/g)) {
      if (call[1] !== name && !needed.has(call[1])) pending.push(call[1]);
    }
  }
  return source.slice(0, matches[0].index) +
    [...needed].map(name => definitions.get(name)).join("\n\n");
}

test("actual analytic suffix preserves lazy allocation and fatal/insufficient distinctions", () => {
  const run = spawnSync(pythonExecutable(), [join(root, "test/fixtures/cubic-analytic-suffix.py"), sourcePath],
    {cwd: root, encoding: "utf8", timeout: 30_000});
  assert.equal(run.status, 0, `${run.error || ""}\n${run.stdout}${run.stderr}`);
  assert.deepEqual(JSON.parse(run.stdout), {interval_oracles: 48, classifier_cases: 11,
    lazy_root_cases: 10, publication_faults: 3});
});

test("analytic extraction remains one direct source-transparent fmpz closure", {
  timeout: 120_000,
}, async () => {
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath, {
    functions: ["certified_complex_cubic_class_group_v1"],
    resolveNativeImport: createNativeImportResolver({root, lowerSource, initialSourcePath: sourcePath}),
  });
  for (const fn of ir.functions) assert.equal(fn.analysis.backend.kind, "fmpz", fn.name);
  // The imported Frobenius splitting kernel adds one source-transparent entry.
  assert.equal(ir.functions.filter(fn => fn.hostCallable !== false).length, 22);
  const generated = generateHostCore(ir);
  for (const name of helperNames) {
    const fn = ir.functions.find(fn => fn.name === name);
    assert.ok(fn, name);
    assert.equal(fn.analysis.liveExactWorkspace?.scopes.length || 0, 0, name);
    assert.equal(fn.lexicallyNative, false, name);
    assert.equal(fn.hostCallable, false, name);
    assert.doesNotMatch(generated.header, new RegExp(`\\bsagejs_kernel_${name}\\(`));
    assert.match(generated.source, new RegExp(`\\bfmpz_native_${name}\\(`));
  }
});

const wrappers = String.raw`
@native
def analytic_interval_witness(values: IntegerBuffer, output: IntegerBuffer) -> int:
    if len(values) != 12 or len(output) != 4:
        return -2
    with NativeExactArena(1048576, 1048576) as arena:
        scratch = arena.integer_vector(1, 0)
        endpoints = arena.foreign_resource(fmpz_matrix, 1024, 1)
        row: uint64 = 0
        while row < 1024:
            endpoints[row, 0] = -911
            row += 1
        endpoints[12, 0] = values[0]
        endpoints[13, 0] = values[1]
        endpoints[16, 0] = values[2]
        endpoints[17, 0] = values[3]
        ready, lower, upper = _cubic_analytic_index_bounds(
            endpoints, values[4], values[5], values[6], values[7], values[8], values[9]
        )
        scratch[0] = lower
        output[0] = scratch[0]
        output[1] = upper
        output[2] = endpoints[18, 0]
        output[3] = endpoints[1023, 0]
        if not ready:
            return -2
        return _cubic_classify_analytic_index(lower, upper, values[10], values[11])


@native
def analytic_saturation_witness(
    coefficients: IntegerBuffer,
    seed: IntegerBuffer,
    unit: IntegerBuffer,
    output: IntegerBuffer,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> bool:
    if len(coefficients) != 4 or len(seed) != 37 or len(unit) != 3 or len(output) != 64:
        return False
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        workspace = arena.integer_vector(8192, 0)
        coordinates = arena.foreign_resource(fmpz_matrix, 9, 3)
        numerators = arena.foreign_resource(fmpz_matrix, 1, 1)
        denominators = arena.foreign_resource(fmpz_matrix, 1, 1)
        logs = arena.foreign_resource(fmpz_matrix, 2, 1)
        endpoints = arena.foreign_resource(fmpz_matrix, 1024, 1)
        index: uint64 = 0
        while index < 27:
            workspace[index] = seed[index]
            index += 1
        index = 0
        while index < 10:
            workspace[_NORM_FORM_OFFSET + index] = seed[27 + index]
            index += 1
        index = 0
        while index < 1024:
            endpoints[index, 0] = -733
            index += 1
        scale = 18446744073709551616
        precision: uint64 = 64
        # The independent test model supplies the class-number-formula
        # residue for the subgroup generated by alpha in x^3-x-1. It is not
        # a BF proof or a new class-group computation. All unit root probes,
        # regulator enclosures, and saturation arithmetic below are real.
        primitive_lower, primitive_upper = _cubic_regulator_bounds(
            numerators, denominators, logs, coefficients,
            1, 1, 0, 0, 1, 0, 1, 0, 1, 0, scale, precision
        )
        reg_log_lower, reg_log_upper = _cubic_log_interval_bounds(
            numerators, denominators, logs, primitive_lower, primitive_upper, scale, precision
        )
        pi_lower, pi_upper = _cubic_log_two_pi_bounds(
            numerators, denominators, logs, scale, precision
        )
        disc_lower, disc_upper = _cubic_arb_log_positive_rational_bounds(
            numerators, denominators, logs, 23, 1, precision
        )
        endpoints[12, 0] = disc_lower
        endpoints[13, 0] = disc_upper
        endpoints[16, 0] = 0
        endpoints[17, 0] = 0
        residue_ready, zeta_lower, zeta_upper = _cubic_analytic_index_bounds(
            endpoints, reg_log_lower, reg_log_upper, pi_lower, pi_upper, 0, 0
        )
        regulator_lower, regulator_upper = _cubic_regulator_bounds(
            numerators, denominators, logs, coefficients,
            1, 1, 0, 0, 1, 0, 1, unit[0], unit[1], unit[2], scale, precision
        )
        if not residue_ready or regulator_lower <= 0:
            return False
        (
            ready, unit_zero, unit_one, unit_two, result_regulator_lower,
            result_regulator_upper, result_log_lower, result_log_upper,
            result_pi_lower, result_pi_upper, index_lower, index_upper,
            log_two_lower, log_two_upper,
        ) = _cubic_saturate_analytic_unit(
            workspace, coefficients, coordinates, numerators, denominators,
            logs, endpoints, output, 1, 1, 0, 0, 1, 0, 1, 1, 0, 0,
            unit[0], unit[1], unit[2], regulator_lower, regulator_upper,
            scale, precision, zeta_lower, zeta_upper
        )
        if not ready:
            return False
        output[0] = _cubic_classify_analytic_index(
            index_lower, index_upper, log_two_lower, log_two_upper
        )
        output[1] = unit_zero
        output[2] = unit_one
        output[3] = unit_two
        output[4] = result_regulator_lower
        output[5] = result_regulator_upper
        output[6] = primitive_lower
        output[7] = primitive_upper
        output[8] = index_lower
        output[9] = index_upper
        output[10] = log_two_lower
        output[11] = log_two_upper
        output[12] = endpoints[18, 0]
        output[13] = endpoints[1023, 0]
        return True


@native
def analytic_publication_witness(
    output: IntegerBuffer,
    factors: IntegerBuffer,
    rows: IntegerBuffer,
    elements: IntegerBuffer,
    mode: uint64,
    index_lower: int,
    index_upper: int,
    log_two_lower: int,
    log_two_upper: int,
) -> bool:
    with NativeExactArena(1048576, 1048576) as arena:
        workspace = arena.integer_vector(8192, 0)
        relation_matrix = arena.foreign_resource(fmpz_matrix, 44, 2)
        relation_elements = arena.foreign_resource(fmpz_matrix, 44, 3)
        relation_matrix[0, 0] = 2
        relation_matrix[1, 1] = 6
        workspace[_ROW_SCRATCH_OFFSET] = 2
        workspace[_ROW_SCRATCH_OFFSET + 1] = 6
        factor: uint64 = 0
        while factor < 2:
            entry: uint64 = 0
            while entry < 9:
                workspace[_POWER_OFFSET + factor * _CUBIC_MAX_POWERS * 9 + entry] = (
                    100 * factor + entry + 1
                )
                if entry < 3:
                    relation_elements[factor, entry] = 10 * factor + entry + 1
                entry += 1
            factor += 1
        return _cubic_publish_analytic_relation_presentation(
            workspace, relation_matrix, relation_elements, output,
            factors, rows, elements, mode, 12, 2, 4, 17, 2, 1, 2,
            7, 8, 9, -123, 3, 9, 2, 9, 2, -1107,
            1494, 7, 9, 64, 100, 110, 350, 354,
            index_lower, index_upper, 2, 1, log_two_lower, log_two_upper
        )
`;

test("real analytic index and exact unit saturation agree across all arithmetic backends", {
  timeout: 240_000,
}, async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-analytic-suffix-"));
  t.after(() => rmSync(temporary, {recursive: true, force: true}));
  const fixture = join(temporary, "analytic_suffix.py");
  writeFileSync(fixture, expandActualHelpers() + "\n\n" + wrappers);
  const compiled = await compileKernel({sourcePath: fixture, cacheRoot: join(temporary, "cache")});
  const run = spawnSync(process.execPath, ["-e", String.raw`
const assert = require("node:assert/strict");
const {analytic_interval_witness: interval, analytic_saturation_witness: saturation,
  analytic_publication_witness: publish} = require(process.argv[1]);
for (const scale of [1n, (1n<<80n)+1n, (1n<<255n)+3n]) {
  for (const data of [
    [100n,101n,100n,101n,100n,101n,200n,201n,350n,354n,6n,7n],
    [101n,103n,3n,4n,-12n,-10n,20n,23n,-44n,-40n,6n,7n],
    [100n,101n,100n,101n,100n,101n,200n,201n,330n,334n,6n,7n],
    [100n,100n,100n,100n,100n,100n,200n,200n,347n,349n,6n,7n],
  ]) {
    const values=data.map(x=>x*scale);
    const lower=values[2]+values[4]+values[6]-(values[1]+1n)/2n-values[9];
    const upper=values[3]+values[5]+values[7]-values[0]/2n-values[8];
    const status=upper<lower||upper<0n||values[10]<=0n||values[11]<values[10] ? -1n
      :upper>=values[10]?0n:lower>0n?-1n:1n;
    for(const impl of [interval.javascript,interval.gmp,interval.fmpz]) {
      const output=interval.createIntegerBuffer(4,16);
      assert.equal(impl(interval.packIntegerBuffer(values,16),output),status);
      assert.deepEqual(output.toArray(),[lower,upper,-911n,-911n]);
    }
  }
}

// Multiplication in Z[a]/(a^3-a-1), independently implemented for test input
// generation. The determinant norm coefficients follow from this table.
function multiply(left,right) {
  const raw=Array(5).fill(0n);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)raw[i+j]+=left[i]*right[j];
  for(let i=4;i>=3;i--){raw[i-3]+=raw[i];raw[i-2]+=raw[i];}
  return raw.slice(0,3);
}
function power(unit,n) {
  let result=[1n,0n,0n];
  while(n-- >0)result=multiply(result,unit);
  return result;
}
const basis=[[1n,0n,0n],[0n,1n,0n],[0n,0n,1n]];
const seed=basis.flatMap(left=>basis.flatMap(right=>multiply(left,right))).concat(
  [1n,0n,-1n,1n,2n,1n,1n,0n,-1n,-3n]);
const coefficients=saturation.packIntegerBuffer([-1n,-1n,0n,1n],32);
const packedSeed=saturation.packIntegerBuffer(seed,32);
for(const exponent of [1,2,3,5,4,9,25,30,256,512]) {
  const unit=power([0n,1n,0n],exponent);
  const packedUnit=saturation.packIntegerBuffer(unit,32);
  // Root discovery is opportunistic, so no test assumes completeness of a
  // bounded probe. Any retained unit must still be an exact divisor-power
  // of the input, and the index classifier must report its remaining index.
  const allowed=new Map();
  for(let divisor=1;divisor<=exponent;divisor++)if(exponent%divisor===0){
    const alpha=power([0n,1n,0n],divisor),inverse=power([-1n,0n,1n],divisor);
    for(const vector of [alpha,inverse,alpha.map(x=>-x),inverse.map(x=>-x)])
      allowed.set(vector.join(','),divisor);
  }
  let first;
  for(const impl of [saturation.javascript,saturation.gmp,saturation.fmpz]) {
    const output=saturation.createIntegerBuffer(64,32);
    assert.equal(impl(coefficients,packedSeed,packedUnit,output,3<<20,3<<20),true,String(exponent));
    const values=output.toArray();
    const remaining=allowed.get(values.slice(1,4).join(','));
    assert.ok(remaining,String(exponent)+': '+values.slice(1,4));
    assert.equal(values[0],remaining===1?1n:0n,String(exponent)+': '+values.slice(0,14));
    if(exponent===2)assert.equal(remaining,1,'exercise actual successful square-root saturation');
    if(exponent===512)assert.ok(remaining>=2,'at most eight authenticated replacements');
    assert.ok(values[4] <= values[7]*BigInt(remaining) && values[6]*BigInt(remaining)<=values[5]);
    assert.deepEqual(values.slice(12,14),[-733n,-733n]);
    if(first)assert.deepEqual(values,first); else first=values;
    assert.deepEqual(packedUnit.toArray(),unit);
  }
}
for(const mode of [0n,1n])for(const impl of [publish.javascript,publish.gmp,publish.fmpz]) {
  const output=publish.packIntegerBuffer(Array(64).fill(-911n),8);
  const factors=publish.createIntegerBuffer(mode?18:1,8);
  const rows=publish.createIntegerBuffer(mode?4:1,8);
  const elements=publish.createIntegerBuffer(mode?6:1,8);
  assert.equal(impl(output,factors,rows,elements,mode,-4n,3n,6n,7n),true);
  const expected=Array(64).fill(0n);
  const fields={0:2,1:12,2:2,3:2,4:6,19:4,20:17,21:2,22:1,23:2,24:1,
    25:7,26:8,27:9,28:-123,29:3,30:9,31:2,32:9,33:2,34:-1107,35:1,
    36:1494,37:7,38:9,39:64,40:100,41:110,42:350,43:354,44:-4,45:3,46:2,47:1};
  for(const [key,value] of Object.entries(fields))expected[key]=BigInt(value);
  assert.deepEqual(output.toArray(),expected);
  if(mode){
    assert.deepEqual(rows.toArray(),[2n,0n,0n,6n]);
    assert.deepEqual(elements.toArray(),[1n,2n,3n,11n,12n,13n]);
    assert.deepEqual(factors.toArray(),[...Array.from({length:9},(_,i)=>BigInt(i+1)),
      ...Array.from({length:9},(_,i)=>BigInt(i+101))]);
  }
  for(const enclosure of [[-4n,6n,6n,7n],[1n,3n,6n,7n],[4n,3n,6n,7n],
    [-4n,-1n,6n,7n],[-4n,3n,7n,6n],[-4n,3n,0n,1n]]) {
    const rejected=publish.packIntegerBuffer(Array(64).fill(-911n),8);
    assert.equal(impl(rejected,factors,rows,elements,mode,...enclosure),false);
    assert.deepEqual(rejected.toArray(),Array(64).fill(-911n));
  }
  for(let bad=0;bad<3;bad++){
    const rejected=publish.packIntegerBuffer(Array(64).fill(-911n),8);
    const buffers=[18,4,6].map((n,i)=>publish.createIntegerBuffer(i===bad?1:n,8));
    assert.equal(impl(rejected,...buffers,1n,-4n,3n,6n,7n),false);
    assert.deepEqual(rejected.toArray(),Array(64).fill(-911n));
  }
  // The interval is valid, but its lower endpoint cannot be published in one
  // output limb. A real packed-buffer failure late in publication must not
  // leave the accepted marker visible, under any arithmetic backend.
  const narrowOutput=publish.packIntegerBuffer(Array(64).fill(-911n),1);
  assert.throws(()=>impl(narrowOutput,factors,rows,elements,mode,
    -(1n<<130n),3n,6n,7n),/capacity|word|fit|overflow/i);
  assert.notEqual(narrowOutput.toArray()[0],2n);
}
`, compiled.modulePath], {cwd: root,encoding: "utf8",timeout: 180_000});
  assert.equal(run.status, 0, `${run.error || ""}\n${run.stdout}${run.stderr}`);
});

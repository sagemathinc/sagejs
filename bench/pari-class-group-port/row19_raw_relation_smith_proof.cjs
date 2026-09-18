"use strict";

// Expand row 19's retained HNF ancestry and exact 9-by-9 Smith result into a
// dimension-compatible Smith proof for the actual 430-by-424 relation matrix.

const crypto = require("node:crypto");
const gap = require("./row19_class_unit_output_evidence_v2.cjs");
const output = require("./class_unit_output_evidence_v2.cjs");

const SCHEMA = "sagejs.pari-class-group/row19-raw-relation-smith-proof-v1";
const ROWS = 430, COLUMNS = 424, KERNEL = 6, CLASS = 9, TAIL = 415;
const sha = raw => crypto.createHash("sha256").update(raw).digest("hex");
const digest = value => output.sha256Canonical(value);

class Row19RawSmithFailure extends Error {}
function fail(message) { throw new Row19RawSmithFailure(message); }
function decode(payload, name) {
  const owner = payload.storage.find(candidate => candidate.name === name);
  if (!owner || owner.logicalLength !== String(owner.entries.length))
    fail(`missing retained owner ${name}`);
  return JSON.parse(Buffer.from(owner.entries.map(Number)).toString("ascii"));
}
function entries(payload, name, length) {
  const owner = payload.storage.find(candidate => candidate.name === name);
  if (!owner || owner.entries.length !== length ||
      owner.logicalLength !== String(length)) fail(`${name} changed`);
  return owner.entries.map(BigInt);
}
function strings(values) { return values.map(String); }

function buildRow19RawRelationSmithProof(raw) {
  // Reuse the reviewed fail-closed source authentication before expanding it.
  gap.assessRow19OutputEvidence(raw);
  const payload = JSON.parse(raw.toString("ascii")).payload;
  const relations = entries(payload, "relation-records", ROWS * COLUMNS);
  const transform = entries(payload, "principal-relation-transform", ROWS * ROWS);
  const terminal = decode(payload, "terminal-hnf-state");
  const presentation = decode(payload, "class-presentation");
  const permutation = terminal.perm.map(value => Number(value) - 1);
  if (permutation.length !== COLUMNS ||
      new Set(permutation).size !== COLUMNS ||
      permutation.some(value => value < 0 || value >= COLUMNS))
    fail("terminal factor-base permutation changed");
  const b = terminal.B.map(BigInt);
  const w = terminal.W.map(BigInt);
  const smithU = presentation.matrices.U.map(BigInt);
  const smithV = presentation.matrices.V.map(BigInt);
  const smithD = presentation.matrices.D.map(BigInt);
  if (b.length !== CLASS * TAIL || w.length !== CLASS * CLASS ||
      smithU.length !== CLASS * CLASS || smithV.length !== CLASS * CLASS ||
      smithD.length !== CLASS * CLASS) fail("terminal block dimensions changed");

  // `transform` is column-major T in the production owner.  The same flat
  // array is row-major T^t, hence it is the initial left transform for R=A^t.
  // Apply V^t to its nine class rows, then move identity rows first, normalized
  // class rows next, and the six relation dependencies last.
  const stagedLeft = transform.slice();
  for (let row = 0; row < CLASS; row += 1) {
    for (let column = 0; column < ROWS; column += 1) {
      let value = 0n;
      for (let inner = 0; inner < CLASS; inner += 1)
        value += smithV[row * CLASS + inner] * transform[(KERNEL + inner) * ROWS + column];
      stagedLeft[(KERNEL + row) * ROWS + column] = value;
    }
  }
  const classOrder = [1, 2, 3, 4, 5, 6, 7, 8, 0];
  const rowOrder = [
    ...Array.from({ length: TAIL }, (_, index) => KERNEL + CLASS + index),
    ...classOrder.map(index => KERNEL + index),
    ...Array.from({ length: KERNEL }, (_, index) => index),
  ];
  const left = rowOrder.flatMap(row =>
    stagedLeft.slice(row * ROWS, (row + 1) * ROWS));

  // In logical factor-base coordinates, clear B with
  // [[I,0],[-B^t,I]], apply U^t to the class columns, and finally move the
  // identity columns before the normalized class columns.  P^t converts the
  // logical coordinates back to the raw factor-base ordering.
  const columnOrder = [
    ...Array.from({ length: TAIL }, (_, index) => CLASS + index),
    ...classOrder,
  ];
  const logicalRight = Array(COLUMNS * COLUMNS).fill(0n);
  for (let finalColumn = 0; finalColumn < COLUMNS; finalColumn += 1) {
    const source = columnOrder[finalColumn];
    if (source >= CLASS) {
      logicalRight[source * COLUMNS + finalColumn] = 1n;
      continue;
    }
    for (let top = 0; top < CLASS; top += 1)
      logicalRight[top * COLUMNS + finalColumn] = smithU[top * CLASS + source];
    for (let tail = 0; tail < TAIL; tail += 1) {
      let value = 0n;
      for (let inner = 0; inner < CLASS; inner += 1)
        value -= b[tail * CLASS + inner] * smithU[inner * CLASS + source];
      logicalRight[(CLASS + tail) * COLUMNS + finalColumn] = value;
    }
  }
  const right = Array(COLUMNS * COLUMNS).fill(0n);
  for (let logical = 0; logical < COLUMNS; logical += 1) {
    const rawRow = permutation[logical];
    for (let column = 0; column < COLUMNS; column += 1)
      right[rawRow * COLUMNS + column] =
        logicalRight[logical * COLUMNS + column];
  }

  const diagonal = Array(ROWS * COLUMNS).fill(0n);
  for (let index = 0; index < TAIL; index += 1)
    diagonal[index * COLUMNS + index] = 1n;
  for (let index = 0; index < CLASS; index += 1) {
    const source = classOrder[index];
    diagonal[(TAIL + index) * COLUMNS + TAIL + index] =
      smithD[source * CLASS + source];
  }
  const diagonalFactors = Array.from({ length: COLUMNS }, (_, index) =>
    diagonal[index * COLUMNS + index]);
  if (diagonalFactors.slice(0, TAIL).some(value => value !== 1n) ||
      diagonalFactors.slice(TAIL).join(",") !== "3,3,3,3,3,3,3,3,6")
    fail("normalized raw Smith diagonal changed");

  const material = {
    d: strings(diagonal), u: strings(left), v: strings(right),
  };
  return Object.freeze({
    schema: SCHEMA,
    source: { correspondenceResultSha256: gap.CORRESPONDENCE_SHA256,
      relationMatrixSha256: digest(strings(relations)),
      retainedTransformSha256: digest(strings(transform)) },
    shapes: { d: [String(ROWS), String(COLUMNS)],
      u: [String(ROWS), String(ROWS)], v: [String(COLUMNS), String(COLUMNS)] },
    diagonalFactors: strings(diagonalFactors), classNumber: "39366",
    invariantFactors: ["3", "3", "3", "3", "3", "3", "3", "3", "6"],
    material,
    materialSha256: { d: digest(material.d), u: digest(material.u),
      v: digest(material.v) },
    identity: "U R V = D",
    qualifiedTiming: false,
  });
}

module.exports = Object.freeze({ COLUMNS, CLASS, KERNEL, ROWS, SCHEMA, TAIL,
  Row19RawSmithFailure, buildRow19RawRelationSmithProof });

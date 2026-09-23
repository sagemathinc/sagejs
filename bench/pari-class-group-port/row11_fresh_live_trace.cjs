"use strict";

// Construct the small PARI-shaped view consumed by the already reviewed exact
// row-11 replay code.  Every byte comes from owners born in this invocation;
// this is a view, not a retained transcript.

const assert = require("node:assert/strict");

const ROWS = 421, DEGREE = 4, PLACES = 3;
const FIELD_ID =
  "generated-sha256-147ddd296edb3764954d6142a499d17edcfecc635aec0181d4beda65d97ad4ab";

const integer = value => ({ kind: "integer", value: String(value) });
const column = values => ({ kind: "column", values: values.map(integer) });
const vector = values => ({ kind: "small-vector", values: values.map(String) });
const matrix = (values, rows, columns) => {
  assert.equal(values.length, rows * columns);
  return { kind: "matrix", values: Array.from({ length: columns }, (_, index) =>
    column(values.slice(index * rows, (index + 1) * rows))) };
};
function real(triple) {
  const [mantissa, precision, exponent] = triple.map(String);
  return precision === "-1" ? integer(mantissa) : { kind: "real", mantissa,
    precision: Number(precision), exponent: Number(exponent) };
}
function reals(packed) {
  assert.equal(packed.length % 3, 0);
  return Array.from({ length: packed.length / 3 }, (_, index) =>
    real(packed.slice(3 * index, 3 * index + 3)));
}
function logCell(packed) {
  assert.equal(packed.length, 7);
  if (String(packed[0]) === "1") return real(packed.slice(1, 4));
  assert.equal(String(packed[0]), "2");
  return { kind: "complex", real: real(packed.slice(1, 4)),
    imag: real(packed.slice(4, 7)) };
}
function logMatrix(packed, columns) {
  assert.equal(packed.length, 7 * PLACES * columns);
  return { kind: "matrix", values: Array.from({ length: columns }, (_, columnIndex) => ({
    kind: "column", values: Array.from({ length: PLACES }, (_, row) =>
      logCell(packed.slice(7 * (columnIndex * PLACES + row),
        7 * (columnIndex * PLACES + row + 1)))) })) };
}
function descriptor(value) {
  const tau = Array.from({ length: DEGREE * DEGREE }, (_, index) =>
    value.tau[(index % DEGREE) * DEGREE + Math.floor(index / DEGREE)]);
  return { kind: "vector", values: [integer(value.p), column(value.generator),
    integer(value.e), integer(value.f), matrix(tau, DEGREE, DEGREE)] };
}
function witnesses(records, generators, columns) {
  return Array.from({ length: columns }, (_, index) => ({
    R: vector(records.slice(index * ROWS, (index + 1) * ROWS)),
    m: column(generators.slice(index * DEGREE, (index + 1) * DEGREE)),
  }));
}

function buildFreshLiveTrace(prepared, root, live, terminal) {
  assert.equal(live.checkpoints.length, 3);
  assert.deepEqual(live.checkpoints.map(value => value.columns), [427, 428, 430]);
  const records = live.collectorValues.relation_records.toArray().slice(0, 430 * ROWS)
    .map(String);
  const generators = live.collectorValues.generators.toArray().slice(0, 430 * DEGREE)
    .map(String);
  const rawLogs = live.collectorValues.log_embeddings.toArray()
    .slice(0, 430 * PLACES * 7).map(String);
  const descriptors = root.selectedDescriptors.map(descriptor);
  const preparedEvent = { event: "prepared", multiplicationTensor:
    prepared.basis_table.map(String), embeddingM: Array.from({ length: 16 }, (_, index) =>
      real([prepared.admission_matrix_m[index], prepared.admission_matrix_p[index],
        prepared.admission_matrix_e[index]])),
    embeddingG: reals(prepared.preparation_embedding), zk: prepared.prep_zk.map(String) };
  const factorEvent = { event: "factor_base", LP: { kind: "vector", values: descriptors },
    perm: vector(root.factor.permutation) };
  const hnfEvents = live.checkpoints.map(checkpoint => {
    const hRows = Number(checkpoint.state[0]), bColumns = Number(checkpoint.state[2]);
    const depRows = ROWS - hRows - bColumns, columns = checkpoint.columns;
    return { event: "hnf", relations: columns,
      exactW: matrix(checkpoint.h, hRows, hRows),
      exactDep: matrix(checkpoint.dep, depRows, hRows),
      exactB: matrix(checkpoint.b, ROWS - bColumns, bColumns),
      exactC: logMatrix(checkpoint.c, columns),
      exactEmbeddings: logMatrix(rawLogs.slice(0, columns * PLACES * 7), columns),
      perm: vector(checkpoint.perm),
      relationRecords: witnesses(records, generators, columns) };
  });
  const accepted = terminal.attempts.at(-1);
  assert.equal(accepted.status, 0); assert.equal(accepted.classNumber, "4");
  const acceptance = { event: "acceptance", exactR: real(accepted.regulator),
    lattice: matrix(accepted.relationLattice, 2, 9) };
  const finalPermutation = live.checkpoints.at(-1).perm.map(Number);
  const classInput = { event: "class_group_input",
    relationRecords: hnfEvents.at(-1).relationRecords,
    Vbase: { kind: "vector", values: finalPermutation.map(index => descriptors[index - 1]) } };
  return { schema: "sagejs.pari-class-group/development-default-driver-trace-v1",
    field: { id: FIELD_ID, panelIndex: 11, degree: 4, signature: [2, 1],
      coefficients: root.field.polynomial.map(String) },
    events: [preparedEvent, factorEvent, ...hnfEvents, acceptance, classInput,
      { event: "result", classNumber: "4", invariants: ["2", "2"] }] };
}

module.exports = { buildFreshLiveTrace };

"use strict";

// Determine exactly how much of a full Smith proof for row 14 can be
// reconstructed from the retained fresh result.  This is deliberately a gap
// artifact: it never relabels the retained ten selected ancestry rows as an
// 806-by-806 left transform.

const gap = require("./row14_class_unit_output_evidence_v2.cjs");
const output = require("./class_unit_output_evidence_v2.cjs");

const SCHEMA = "sagejs.pari-class-group/row14-raw-smith-gap-v1";
const ROWS = 806, COLUMNS = 799, KERNEL = 7, CLASS = 3, TAIL = 796;

// FLINT's exact 3-by-3 decomposition, pinned here as ordinary mathematical
// evidence.  U * H * V = diag(1,8,24).
const SMALL_LEFT = Object.freeze([
  -1n, -5n, 9n,
  -1n, -4n, 8n,
  -1n, -9n, 12n,
]);
const SMALL_RIGHT = Object.freeze([
  1n, -7n, -4n,
  0n, 1n, -2n,
  0n, 0n, 1n,
]);
const SMALL_DIAGONAL = Object.freeze([
  1n, 0n, 0n,
  0n, 8n, 0n,
  0n, 0n, 24n,
]);

class Row14RawSmithGapFailure extends Error {}
function fail(message) { throw new Row14RawSmithGapFailure(message); }
function strings(values) { return values.map(String); }
function digest(values) { return output.sha256Canonical(strings(values)); }
function owner(payload, name, length) {
  const value = payload.storage.find(candidate => candidate.name === name);
  if (!value || value.logicalLength !== String(length) ||
      value.entries.length !== length) fail(`retained owner ${name} changed`);
  return value.entries.map(BigInt);
}
function multiply3(left, right) {
  return Array.from({ length: 9 }, (_, flat) => {
    const row = Math.floor(flat / 3), column = flat % 3;
    let value = 0n;
    for (let inner = 0; inner < 3; inner += 1)
      value += left[row * 3 + inner] * right[inner * 3 + column];
    return value;
  });
}

function buildRow14RawSmithGap(raw) {
  // The existing assessment authenticates the immutable correspondence bytes,
  // source identity, field, and all owner shapes before this narrower proof is
  // allowed to inspect them.
  gap.assessRow14OutputEvidence(raw);
  const payload = JSON.parse(raw.toString("ascii")).payload;
  const relations = owner(payload, "raw-relation-records", ROWS * COLUMNS);
  const classRows = owner(payload, "raw-to-presentation-transform", CLASS * ROWS);
  const kernelRows = owner(payload, "raw-to-unit-kernel-transform", KERNEL * ROWS);
  const h = owner(payload, "class-presentation", CLASS * CLASS);
  const b = owner(payload, "terminal-B", TAIL * CLASS);
  const permutation = owner(payload, "terminal-permutation", COLUMNS)
    .map(value => Number(value) - 1);
  if (new Set(permutation).size !== COLUMNS ||
      permutation.some(value => !Number.isSafeInteger(value) ||
        value < 0 || value >= COLUMNS)) fail("terminal permutation changed");
  if (multiply3(multiply3(SMALL_LEFT, h), SMALL_RIGHT)
    .some((value, index) => value !== SMALL_DIAGONAL[index]))
    fail("small Smith identity changed");

  // In terminal logical factor-base coordinates the retained HNF target is
  //
  //   [ 0  0 ]  (7 rows)
  //   [ H  0 ]  (3 rows)
  //   [ B  I ]  (796 rows).
  //
  // Clear B on the right, apply the small Smith right transform, and order
  // the 796 identity columns before the three class columns.  Convert from
  // logical back to raw factor-base coordinates with the retained permutation.
  const logicalRight = Array(COLUMNS * COLUMNS).fill(0n);
  for (let tail = 0; tail < TAIL; tail += 1)
    logicalRight[(CLASS + tail) * COLUMNS + tail] = 1n;
  for (let finalClass = 0; finalClass < CLASS; finalClass += 1) {
    const finalColumn = TAIL + finalClass;
    for (let top = 0; top < CLASS; top += 1)
      logicalRight[top * COLUMNS + finalColumn] =
        SMALL_RIGHT[top * CLASS + finalClass];
    for (let tail = 0; tail < TAIL; tail += 1) {
      let value = 0n;
      for (let inner = 0; inner < CLASS; inner += 1)
        value -= b[tail * CLASS + inner] *
          SMALL_RIGHT[inner * CLASS + finalClass];
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
  for (let index = 0; index < CLASS; index += 1)
    diagonal[(TAIL + index) * COLUMNS + TAIL + index] =
      SMALL_DIAGONAL[index * CLASS + index];

  // These are the ten final left rows that can be reconstructed exactly.  The
  // three normalized class rows occupy final rows 796..798; the seven kernel
  // rows occupy final rows 799..805.  Rows 0..795 require ancestry columns
  // which the production result did not retain.
  const normalizedClassRows = Array(CLASS * ROWS).fill(0n);
  for (let row = 0; row < CLASS; row += 1) {
    for (let column = 0; column < ROWS; column += 1) {
      for (let inner = 0; inner < CLASS; inner += 1)
        normalizedClassRows[row * ROWS + column] +=
          SMALL_LEFT[row * CLASS + inner] * classRows[inner * ROWS + column];
    }
  }
  const retainedLeftRows = [...normalizedClassRows, ...kernelRows];
  const retainedFinalRowIndices = [796, 797, 798, 799, 800, 801, 802, 803, 804, 805];

  const material = {
    d: strings(diagonal), retainedLeftRows: strings(retainedLeftRows),
    v: strings(right),
  };
  return Object.freeze({
    schema: SCHEMA,
    source: {
      correspondenceResultSha256: gap.CORRESPONDENCE_SHA256,
      relationMatrixSha256: digest(relations),
      terminalBSha256: digest(b),
      terminalPermutationSha256: digest(permutation.map(value => BigInt(value + 1))),
    },
    rawShape: [String(ROWS), String(COLUMNS)],
    reconstructedShapes: {
      d: [String(ROWS), String(COLUMNS)],
      retainedLeftRows: [String(KERNEL + CLASS), String(ROWS)],
      v: [String(COLUMNS), String(COLUMNS)],
    },
    retainedFinalRowIndices: retainedFinalRowIndices.map(String),
    diagonalFactors: [
      ...Array(TAIL).fill("1"), "1", "8", "24",
    ],
    classNumber: "192",
    invariantFactors: ["8", "24"],
    material,
    materialSha256: {
      d: output.sha256Canonical(material.d),
      retainedLeftRows: output.sha256Canonical(material.retainedLeftRows),
      v: output.sha256Canonical(material.v),
    },
    status: "missing-left-tail-ancestry",
    missing: {
      finalRowRange: ["0", "795"],
      leftRows: String(TAIL),
      coefficients: String(TAIL * ROWS),
      owner: "raw-smith-left-tail-ancestry-796x806",
      smallestGap:
        "retain or regenerate final HNF ancestry columns 10..805",
    },
    completed: {
      fullDiagonal: true,
      fullRightTransform: true,
      retainedLeftRows: String(KERNEL + CLASS),
      fullLeftTransform: false,
      fullSmithIdentity: false,
    },
    qualifiedTiming: false,
  });
}

module.exports = Object.freeze({ CLASS, COLUMNS, KERNEL, ROWS, SCHEMA, TAIL,
  SMALL_DIAGONAL, SMALL_LEFT, SMALL_RIGHT, Row14RawSmithGapFailure,
  buildRow14RawSmithGap });

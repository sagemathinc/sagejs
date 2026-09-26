#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { positiveDivisorFloor, authenticatePackedLogCheckpoint, embedHnfInputColumn,
  reverseHnfFinal, reverseAppend, reverseSchedule } =
  require("./relation_column_ancestry.cjs");

function linearCombination(columns, coefficients) {
  return columns[0].map((_, row) => columns.reduce((sum, column, index) =>
    sum + column[row] * coefficients[index], 0n));
}

function forwardHnfFinal(columns, owner) {
  const { rows, depRows, columns: width, tail, fullH, fullDep,
    trailing, transform, diagonal } = owner;
  const total = width + tail, lig = rows + depRows, zc = width - rows;
  assert.equal(columns.length, total);
  const transformed = [];
  for (let target = 0; target < width; target += 1)
    transformed.push(linearCombination(columns.slice(0, width),
      transform.slice(target * width, (target + 1) * width)));
  for (let column = 0; column < tail; column += 1)
    transformed.push(columns[width + column].slice());
  const b = trailing.slice();
  for (let row = rows - 1; row >= 0; row -= 1) {
    const h = fullH[(zc + row) * rows + row];
    for (let column = 0; column < tail; column += 1) {
      let quotient = b[column * lig + depRows + row];
      if (!diagonal[row]) quotient = positiveDivisorFloor(quotient, h);
      if (!quotient) continue;
      for (let k = 0; k < depRows; k += 1)
        b[column * lig + k] -= quotient * fullDep[(zc + row) * depRows + k];
      for (let k = 0; k < rows; k += 1)
        b[column * lig + depRows + k] -= quotient * fullH[(zc + row) * rows + k];
      transformed[width + column] = transformed[width + column].map(
        (value, index) => value - quotient * transformed[zc + row][index]);
    }
  }
  const output = Array(total), removed = diagonal.reduce((sum, value) => sum + Number(value), 0);
  const newColumns = width - removed;
  for (let column = 0; column < zc; column += 1) output[column] = transformed[column];
  let unit = 0, nonunit = 0;
  for (let row = 0; row < rows; row += 1) {
    const destination = diagonal[row] ? newColumns + unit++ : zc + nonunit++;
    output[destination] = transformed[zc + row];
  }
  for (let column = 0; column < tail; column += 1)
    output[width + column] = transformed[width + column];
  return output;
}

const cases = [
  [0n, 5n, 0n], [14n, 5n, 2n], [15n, 5n, 3n],
  [-15n, 5n, -3n], [-14n, 5n, -3n], [-1n, 5n, -1n],
];
for (const [value, divisor, expected] of cases)
  assert.equal(positiveDivisorFloor(value, divisor), expected);
assert.throws(() => positiveDivisorFloor(1n, 0n), /not positive/);
assert.throws(() => positiveDivisorFloor(1n, -2n), /not positive/);

// Symbolically execute the source's C-column operations on an identity input.
// This fixture includes a zero prefix, one removed unit row before one
// nonunit row (so the source's C-column compaction is nontrivial),
// dependent-row propagation, two trailing B columns, and negative nonmultiple
// floor division.
const step = {
  rows: 2, depRows: 1, columns: 3, tail: 2,
  fullH: [0n, 0n, 1n, 0n, 1n, 2n],
  fullDep: [0n, 3n, 4n],
  trailing: [-1n, -3n, 5n, 2n, 7n, -4n],
  transform: [1n, 0n, 0n, 2n, 1n, 0n, -1n, 3n, 1n],
  diagonal: [1n, 0n],
};
const width = step.columns + step.tail;
const identity = Array.from({ length: width }, (_, column) =>
  Array.from({ length: width }, (_, row) => BigInt(row === column)));
const work = Array(width);
for (let column = 0; column < step.columns; column += 1) {
  work[column] = Array(width).fill(0n);
  for (let source = 0; source < step.columns; source += 1)
    for (let row = 0; row < width; row += 1)
      work[column][row] += identity[source][row]
        * step.transform[column * step.columns + source];
}
for (let column = 0; column < step.tail; column += 1)
  work[step.columns + column] = identity[step.columns + column].slice();
const b = step.trailing.slice(), lig = step.rows + step.depRows, zc = 1;
for (let row = step.rows - 1; row >= 0; row -= 1) {
  const h = step.fullH[(zc + row) * step.rows + row];
  for (let column = 0; column < step.tail; column += 1) {
    let quotient = b[column * lig + step.depRows + row];
    if (!step.diagonal[row]) quotient = positiveDivisorFloor(quotient, h);
    if (!quotient) continue;
    for (let k = 0; k < step.depRows; k += 1)
      b[column * lig + k] -= quotient * step.fullDep[(zc + row) * step.depRows + k];
    for (let k = 0; k < step.rows; k += 1)
      b[column * lig + step.depRows + k] -= quotient
        * step.fullH[(zc + row) * step.rows + k];
    for (let k = 0; k < width; k += 1)
      work[step.columns + column][k] -= quotient * work[zc + row][k];
  }
}
const output = work.map(column => column.slice());
output[1] = work[2]; // compacted nonunit H column
output[2] = work[1]; // removed-unit column follows every retained H column
for (let column = 0; column < width; column += 1) {
  const selected = Array(width).fill(0n); selected[column] = 1n;
  assert.deepEqual(reverseHnfFinal(selected, step), output[column],
    `reverse hnffinal column ${column}`);
}

// `perm` is a logical-to-physical row map.  H row i therefore belongs at
// physical relation row perm[i]-1.  This also proves that class columns begin
// after the zero/kernel prefix, not at output column zero.
const permutation = [3, 1, 4, 2];
const relationRows = 4, relationColumns = 5, zeroPrefix = 3;
const relations = Array(relationRows * relationColumns).fill(0n);
const h = [24n, 0n, 5n, 8n]; // column-major 2 x 2
for (let column = 0; column < 2; column += 1)
  for (let logicalRow = 0; logicalRow < 2; logicalRow += 1)
    relations[(zeroPrefix + column) * relationRows
      + permutation[logicalRow] - 1] = h[column * 2 + logicalRow];
for (let column = 0; column < 2; column += 1) {
  const selected = Array(relationColumns).fill(0n);
  selected[zeroPrefix + column] = 1n;
  for (let physicalRow = 0; physicalRow < relationRows; physicalRow += 1) {
    const logicalRow = permutation.slice(0, 2).indexOf(physicalRow + 1);
    const expected = logicalRow < 0 ? 0n : h[column * 2 + logicalRow];
    const actual = selected.reduce((sum, coefficient, source) =>
      sum + coefficient * relations[source * relationRows + physicalRow], 0n);
    assert.equal(actual, expected, `permuted H column ${column}, row ${physicalRow}`);
  }
}

// A complete synthetic hnfadd reverse step.  Its newly appended raw column
// is first adjusted by the old B columns, then joined ahead of old H, and the
// local hnffinal performs a nontrivial unit/nonunit compaction.
const appendHnf = {
  rows: 2, depRows: 0, columns: 3, tail: 2,
  fullH: [0n, 0n, 1n, 0n, 1n, 2n], fullDep: [],
  trailing: [-1n, 3n, 4n, -3n],
  transform: [1n, 0n, 0n, 0n, 1n, 0n, 0n, 0n, 1n],
  diagonal: [1n, 0n],
};
const append = {
  oldTotal: 5, newColumns: 1, zeroPrefix: 1, hRows: 2, bColumns: 2,
  perm: [2, 4, 1, 3], newRelations: [2n, 7n, -3n, 9n], rows: 4,
  hnf: appendHnf,
};
const appendRawWidth = 6;
const oldBasis = Array.from({ length: append.oldTotal }, (_, column) =>
  Array.from({ length: appendRawWidth }, (_, row) => BigInt(row === column)));
const adjustedNew = Array(appendRawWidth).fill(0n);
adjustedNew[5] = 1n;
adjustedNew[3] = -2n;
adjustedNew[4] = 3n;
const joinedInput = [adjustedNew, ...oldBasis.slice(1)];
const localOutput = forwardHnfFinal(joinedInput, appendHnf);
const appendOutput = [oldBasis[0], ...localOutput];
for (let column = 0; column < appendRawWidth; column += 1) {
  const selected = Array(appendRawWidth).fill(0n); selected[column] = 1n;
  const raw = Array(appendRawWidth).fill(0n);
  const previous = reverseAppend(selected, append, raw);
  assert.deepEqual([...previous, raw[5]], appendOutput[column],
    `reverse hnfadd column ${column}`);
}

// Compose the same append with the nontrivial initial HNF step above. This is
// the operation used by the authentic row-14 coordinator: no square global
// transform is materialized, but every selected terminal column must map back
// to the original raw relations exactly.
const stagedOld = output.map(column => [...column, 0n]);
const composedNew = Array(appendRawWidth).fill(0n);
composedNew[5] = 1n;
for (let row = 0; row < appendRawWidth; row += 1) {
  composedNew[row] -= 2n * stagedOld[3][row];
  composedNew[row] += 3n * stagedOld[4][row];
}
const composedLocal = forwardHnfFinal(
  [composedNew, ...stagedOld.slice(1)], appendHnf);
const composedOutput = [stagedOld[0], ...composedLocal];
const initialStep = {
  columns: step.columns + step.tail,
  cleanupTransform: Array.from({ length: width * width }, (_, index) =>
    BigInt(index % (width + 1) === 0)),
  hnf: step,
};
for (let column = 0; column < appendRawWidth; column += 1) {
  const ancestry = reverseSchedule(appendRawWidth, [column], initialStep, [append])[0];
  assert.deepEqual(ancestry, composedOutput[column],
    `reverse composed schedule column ${column}`);
}

const largeShape = { totalRows: 799, genuineRows: 5, dependentRows: 2,
  width: 5, tail: 792 };
const largeCoefficients = Array(797).fill(0n);
largeCoefficients[0] = 1n; largeCoefficients[1] = 2n;
largeCoefficients[5] = 2n; largeCoefficients[796] = -3n;
const largeOwner = { ...largeShape,
  dependent: Array(10).fill(0n), active: Array(25).fill(0n),
  trailing: Array(7 * 792).fill(0n),
  preHnfPermutation: [1, 2, 3, 4, 5, 6, 7],
  postHnfPermutation: Array.from({ length: 792 }, (_, index) => index + 8),
};
largeOwner.dependent[0] = 11n;
largeOwner.active[5] = 13n;
largeOwner.trailing[0] = 17n;
const embedded = embedHnfInputColumn(largeCoefficients, largeOwner);
assert.equal(embedded.length, 799);
assert.equal(embedded[0], 45n);
assert.equal(embedded[2], 26n);
assert.equal(embedded[7], 2n);
assert.equal(embedded[798], -3n);
assert.equal(Object.hasOwn(embedded, "NaN"), false);
assert.throws(() => embedHnfInputColumn(largeCoefficients,
  { ...largeOwner, postHnfPermutation: largeOwner.postHnfPermutation.with(3, undefined) }),
  /invalid HNF input embedding permutation/);
assert.throws(() => embedHnfInputColumn(largeCoefficients,
  { ...largeOwner, postHnfPermutation: largeOwner.postHnfPermutation.with(3, 1) }),
  /invalid HNF input embedding permutation/);
let packedLogMutations = 0;
for (const columns of [802, 804, 805, 806]) {
  const values = [String(columns), "2", "-3", "320"];
  const digest = crypto.createHash("sha256").update(JSON.stringify(values)).digest("hex");
  assert.equal(authenticatePackedLogCheckpoint(values, digest), digest);
  assert.equal(authenticatePackedLogCheckpoint(
    [BigInt(columns), 2n, -3, "320"], digest), digest);
  assert.throws(() => authenticatePackedLogCheckpoint(values.with(1, "3"), digest),
    /hash changed/);
  packedLogMutations += 1;
}
assert.throws(() => authenticatePackedLogCheckpoint("not-an-array", "0".repeat(64)),
  /invalid packed-log checkpoint owner/);
assert.throws(() => authenticatePackedLogCheckpoint(["1"], "not-a-digest"),
  /invalid packed-log checkpoint owner/);
process.stdout.write(`${JSON.stringify({
  schema: "sagejs.pari-class-group/relation-column-ancestry-check-v1",
  signedFloorCases: cases.length, negativeNonmultiples: 2,
  invalidDivisorsRejected: 2, hnffinalColumns: width,
  reorderedUnitColumns: 1, permutationEmbeddingCells: 8,
  hnfaddColumns: appendRawWidth, composedScheduleColumns: appendRawWidth,
  largeShapeEmbedding: [5, 2, 5, 792],
  malformedPermutationsRejected: 2, packedLogStages: 4,
  packedLogMutationsRejected: packedLogMutations, malformedPackedLogOwnersRejected: 2,
})}\n`);

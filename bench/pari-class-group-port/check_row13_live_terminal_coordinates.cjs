#!/usr/bin/env node
"use strict";

// Cheap row-specific regression for the terminal-coordinate authority used by
// the live resident ancestry path. No native build or field computation runs.

const assert = require("node:assert/strict");
const gate = require("./row13_prepared_gate_c_host.cjs");
const { reverseHnfFinal } = require("./relation_column_ancestry.cjs");

function runCoordinateMutations() {

// Packed IntegerBuffer owners are structurally array-like (`length` exists)
// but intentionally have no numeric JavaScript properties.  State validation
// must use their exact projection, not `Array.from(owner)`.
const packedRankState = {
  length: 10,
  toArray: () => [0n, 0n, 0n, 0n, 0n, 0n, 0n, 3n, 12n, 0n],
};
assert(Number.isNaN(Array.from(packedRankState).map(Number)[8]));
assert.deepEqual(gate.exactIntegerState(packedRankState, 10,
  "synthetic append rank state"), [0, 0, 0, 0, 0, 0, 0, 3, 12, 0]);
assert.throws(() => gate.exactIntegerState({ length: 10 }, 10,
  "invalid append rank state"), /not a packed IntegerBuffer owner/);
assert.throws(() => gate.exactIntegerState({ length: 10,
  toArray: () => Array(10).fill(undefined) }, 10,
"invalid append rank state"), /non-integer slot/);

const permutation = Array.from({ length: 999 }, (_, index) => BigInt(index + 1));
permutation[0] = 705n;
permutation[704] = 1n;
const state = [1, 8, 998, 0, 7, 1, 0, 1006, 0];
const coordinates = gate.terminalCoordinates(state, permutation);
assert.deepEqual(coordinates, {
  totalColumns: 1006,
  zeroColumns: [0, 1, 2, 3, 4, 5, 6],
  presentationColumns: [7],
  activeFactorRows: [704],
  hRows: 1, bColumns: 998, dependentRows: 0,
});
const resident = { state, perm: permutation, h: [2n], dep: [] };
const expected = Array(999).fill(0n); expected[704] = 2n;
assert.deepEqual(gate.publishedHColumn(resident, 0), expected);
assert.throws(() => gate.terminalCoordinates(state.with(4, 8), permutation),
  /partition changed/);
assert.throws(() => gate.terminalCoordinates(state,
  permutation.with(1, permutation[0])), /permutation is invalid/);

// Authenticate a minimal terminal kernel/presentation pair, then swap the
// actual transform owners. Both roles must fail, rather than merely comparing
// their coordinate numbers.
const pairRecords = [...Array(999).fill(0n), ...expected];
const authenticatePair = (unitTransform, presentationTransform) => {
  assert.deepEqual(gate.relationProduct(pairRecords, 2, unitTransform),
    Array(999).fill(0n), "mutated unit transform is not a kernel relation");
  assert.deepEqual(gate.relationProduct(pairRecords, 2, presentationTransform),
    expected, "mutated presentation transform does not reproduce live H");
};
authenticatePair([1n, 0n], [0n, 1n]);
assert.throws(() => authenticatePair([0n, 1n], [1n, 0n]),
  /mutated unit transform|mutated presentation transform/);

// One removed unit row precedes one retained nonunit row. This is precisely
// the mixed compaction whose output-coordinate order must not be guessed.
const mixed = {
  rows: 2, depRows: 1, columns: 3, tail: 2,
  fullH: [0n, 0n, 1n, 0n, 1n, 2n],
  fullDep: [0n, 3n, 4n],
  trailing: [-1n, -3n, 5n, 2n, 7n, -4n],
  transform: [1n, 0n, 0n, 2n, 1n, 0n, -1n, 3n, 1n],
  diagonal: [1n, 0n],
};
const reversed = [
  [1n, 0n, 0n, 0n, 0n],
  [-1n, 3n, 1n, 0n, 0n],
  [2n, 1n, 0n, 0n, 0n],
  [12n, -1n, -2n, 1n, 0n],
  [-20n, -3n, 2n, 0n, 1n],
];
for (let column = 0; column < reversed.length; column += 1) {
  const selected = Array(reversed.length).fill(0n); selected[column] = 1n;
  assert.deepEqual(reverseHnfFinal(selected, mixed), reversed[column],
    `mixed unit/nonunit terminal column ${column}`);
}

return {
  schema: "sagejs.pari-class-group/row13-live-terminal-coordinate-check-v1",
  zeroColumns: coordinates.zeroColumns.length,
  presentationColumns: coordinates.presentationColumns.length,
  activeFactorRows: coordinates.activeFactorRows,
  exactIntegerStateProjection: true,
  mixedColumns: reversed.length,
  malformedStatesRejected: 2,
  swappedCoordinateRejected: true,
};
}

function main() {
  process.stdout.write(`${JSON.stringify(runCoordinateMutations())}\n`);
}

module.exports = { main, runCoordinateMutations };
if (require.main === module) main();

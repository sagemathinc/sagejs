"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

function array(owner) {
  return owner.toArray ? owner.toArray() : Array.from(owner);
}

function exactBuffer(fn, values, capacity = 4) {
  return fn.createIntegerBuffer(values.length, capacity, values);
}

(async () => {
  const sourcePath = path.join(__dirname, "row19_production_contracts.py");
  const built = await compileKernel({ sourcePath });
  const module = require(built.modulePath);
  const cup = module.pari_row19_cup_capacity_contract;
  const first = module.pari_row19_first_hnf_contract;
  const accept = module.pari_row19_terminal_acceptance_contract;
  const reverse = module.pari_row19_dense_reverse_selection;
  for (const fn of [cup, first, accept, reverse]) assert(fn.nativeAvailable);

  const cupState = Array(6).fill(77n);
  assert.equal(cup.gmp(84n, 78n, 160000n, cupState), 1n);
  assert.deepEqual(cupState, [84n, 78n, 6552n, 22n, 1153152n, 160000n]);
  assert.equal(cup.gmp(84n, 78n, 1153152n, cupState), 0n);
  assert.equal(cupState[4], 1153152n);
  const cupBefore = cupState.slice();
  assert.throws(() => cup.gmp(-1n, 78n, 1153152n, cupState));
  assert.deepEqual(cupState, cupBefore);

  const hnfState = [9n, 15n, 408n, 7n, 6n, 65n, 0n, 423n, 0n];
  const h = exactBuffer(first,
    Array.from({ length: 81 }, (_, i) => BigInt((i * 17) % 23 - 11)));
  const depValues = Array.from({ length: 63 }, (_, i) =>
    BigInt(i % 9 === 0 ? i + 1 : (i * 13) % 19 - 9));
  assert(depValues.some(Boolean));
  const dep = exactBuffer(first, depValues);
  const trailing = exactBuffer(first, Array(16 * 408).fill(0n), 1);
  const retained = exactBuffer(first, Array(63).fill(77n));
  const shape = Array(8).fill(77n);
  assert.equal(first.gmp(hnfState, h, dep, trailing, retained, shape), 0n);
  assert.deepEqual(array(retained), depValues);
  assert.deepEqual(shape, [424n, 423n, 9n, 7n, 408n, 6n, 65n, 423n]);
  const retainedBefore = array(retained), shapeBefore = shape.slice();
  const badState = hnfState.slice(); badState[3] = 0n;
  assert.throws(() => first.gmp(badState, h, dep, trailing, retained, shape));
  assert.deepEqual(array(retained), retainedBefore);
  assert.deepEqual(shape, shapeBefore);

  const acceptanceState = Array(5).fill(77n);
  assert.equal(accept.gmp([0n, 1n], 2n, [1n], [0n], 1n, acceptanceState), 0n);
  assert.deepEqual(acceptanceState, [2n, 1n, 1n, 0n, 1n]);
  const acceptanceBefore = acceptanceState.slice();
  assert.throws(() => accept.gmp(
    [0n, 1n], 2n, [0n, 1n], [1n, 0n], 2n, acceptanceState));
  assert.deepEqual(acceptanceState, acceptanceBefore);
  assert.throws(() => accept.gmp([0n, 1n], 2n, [0n], [0n], 1n,
    acceptanceState));
  assert.deepEqual(acceptanceState, acceptanceBefore);

  // Exercise the real first-HNF width, with six selected vectors (the rank of
  // the accepted relation kernel).  Coefficients are deliberately dense.
  const width = 423, targets = 6;
  const transformValues = Array.from({ length: width * width }, (_, index) => {
    const column = Math.floor(index / width), row = index % width;
    if (column === row) return 2n;
    return BigInt((column * 7 + row * 11) % 17 === 0 ? (row % 5) - 2 : 0);
  });
  const selectedValues = Array.from({ length: width * targets }, (_, index) =>
    BigInt((index * 19 + Math.floor(index / width) * 3) % 13 - 6));
  const expected = Array(width * targets).fill(0n);
  for (let target = 0; target < targets; target += 1)
    for (let source = 0; source < width; source += 1)
      for (let column = 0; column < width; column += 1)
        expected[target * width + source] +=
          transformValues[column * width + source]
          * selectedValues[target * width + column];
  const transform = exactBuffer(reverse, transformValues);
  const selected = exactBuffer(reverse, selectedValues);
  const output = exactBuffer(reverse, Array(width * targets).fill(77n));
  const started = process.hrtime.bigint();
  assert.equal(reverse.gmp(transform, selected, BigInt(width), BigInt(targets), output), 0n);
  const elapsedNanoseconds = process.hrtime.bigint() - started;
  assert.deepEqual(array(output), expected);
  const outputBefore = array(output);
  assert.throws(() => reverse.gmp(transform, selected, 431n, BigInt(targets), output));
  assert.deepEqual(array(output), outputBefore);

  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/row19-production-contracts-v1",
    cup: { rows: 84, columns: 78, oldEntries: 160000,
      requiredEntries: 1153152, sufficientStatus: 0, shortStatus: 1 },
    firstHnf: { rows: 424, columns: 423, h: [9, 9], dependent: [7, 9],
      trailing: [16, 408], dependentCellsRetained: 63 },
    acceptance: { hnfEvents: 2, acceptanceEvents: 1,
      acceptanceHnfOrdinals: [1], codes: [0] },
    reverseSelection: { width, targets, exactOutputCells: expected.length,
      elapsedNanoseconds: elapsedNanoseconds.toString() },
    guards: { cupAtomic: true, firstHnfAtomic: true,
      terminalOnly: true, reverseSelectionAtomic: true },
    nativeCoreBytes: fs.statSync(built.coreSourcePath).size,
    diagnosticOnly: true,
    qualifiedTiming: false,
  }));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

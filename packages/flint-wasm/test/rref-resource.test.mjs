import assert from "node:assert/strict";
import test from "node:test";

import { createPortableMatrixBackend } from "../portable-matrix.mjs";
import {
  createPortableRrefResourceBackend,
} from "../portable-rref-resource.mjs";

const rref = createPortableRrefResourceBackend(
  createPortableMatrixBackend(),
);

function integerBuffer(values, wordCapacity) {
  const sizes = new Int32Array(values.length);
  const limbs = new BigUint64Array(values.length * wordCapacity);
  for (let index = 0; index < values.length; index += 1) {
    const negative = values[index] < 0n;
    let magnitude = negative ? -values[index] : values[index];
    let words = 0;
    while (magnitude !== 0n) {
      limbs[index * wordCapacity + words] =
        magnitude & 0xffffffffffffffffn;
      magnitude >>= 64n;
      words += 1;
    }
    sizes[index] = negative ? -words : words;
  }
  return { length: values.length, wordCapacity, sizes, limbs };
}

function integerBufferEntries(buffer) {
  return Array.from({ length: buffer.length }, (_, index) => {
    const signedSize = buffer.sizes[index];
    let value = 0n;
    for (let word = Math.abs(signedSize) - 1; word >= 0; word -= 1) {
      value = (value << 64n) |
        buffer.limbs[index * buffer.wordCapacity + word];
    }
    return signedSize < 0 ? -value : value;
  });
}

test("retains one rational RREF until exact packed outputs are exported", () => {
  const largeNumerator = 2n ** 130n + 1n;
  const largeDenominator = 2n ** 258n + 93n;
  const numerators = [1n, 0n, largeNumerator, 0n, 1n, 1n];
  const denominators = [1n, 1n, 3n, 1n, 1n, largeDenominator];
  const result = rref.ffiFmpqRrefResultCreate(2n, 3n);
  assert.equal(rref.ffiFmpqRrefResultCompute(
    result,
    integerBuffer(numerators, 3),
    integerBuffer(denominators, 5),
    2n,
    3n,
  ), true);
  assert.equal(rref.ffiFmpqRrefResultRank(result), 2n);
  assert.equal(rref.ffiFmpqRrefResultNumeratorWordCapacity(result), 3n);
  assert.equal(rref.ffiFmpqRrefResultDenominatorWordCapacity(result), 5n);
  const outputNumerators = integerBuffer(Array(6).fill(0n), 3);
  const outputDenominators = integerBuffer(Array(6).fill(0n), 5);
  assert.equal(rref.ffiFmpqRrefResultExport(
    outputNumerators,
    outputDenominators,
    result,
    2n,
    3n,
  ), true);
  assert.deepEqual(integerBufferEntries(outputNumerators), numerators);
  assert.deepEqual(integerBufferEntries(outputDenominators), denominators);
  rref.ffiFmpqRrefResultClose(result);
  assert.throws(
    () => rref.ffiFmpqRrefResultRank(result),
    /open Sage\.js FLINT RREF result/,
  );
});

test("preflights both outputs before changing either packed buffer", () => {
  const result = rref.ffiFmpqRrefResultCreate(1n, 2n);
  rref.ffiFmpqRrefResultCompute(
    result,
    integerBuffer([1n, 2n ** 130n + 1n], 3),
    integerBuffer([1n, 2n ** 258n + 93n], 5),
    1n,
    2n,
  );
  const outputNumerators = integerBuffer([7n, 8n], 3);
  const outputDenominators = integerBuffer([11n, 12n], 1);
  assert.throws(
    () => rref.ffiFmpqRrefResultExport(
      outputNumerators,
      outputDenominators,
      result,
      1n,
      2n,
    ),
    /word capacity exceeded/,
  );
  assert.deepEqual(integerBufferEntries(outputNumerators), [7n, 8n]);
  assert.deepEqual(integerBufferEntries(outputDenominators), [11n, 12n]);
  rref.ffiFmpqRrefResultClose(result);
});

#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { join, resolve } = require("node:path");
const flint = require("../packages/flint");

const root = resolve(__dirname, "..");
const generatedDirectory = join(root, "packages", "flint", "build", "generated-ffi");
const manifest = require(join(generatedDirectory, "manifest.json"));
const generated = require(join(generatedDirectory, manifest.addon));
const accounted = generated.__sagejsFfiResourceExternalMemory;

const p = 2305843009213693951n;

function close(resource, closer) {
  closer(resource);
  closer(resource);
}

function matrix(rows, columns, entries, modulus = p) {
  return flint.ffiNmodMatrixFromEntries(
    new BigUint64Array(entries),
    BigInt(entries.length),
    BigInt(rows),
    BigInt(columns),
    modulus,
  );
}

function entries(resource) {
  const rows = Number(flint.ffiNmodMatrixNrows(resource));
  const columns = Number(flint.ffiNmodMatrixNcols(resource));
  return Array.from({ length: rows * columns }, (_, index) =>
    flint.ffiNmodMatrixEntry(
      resource,
      BigInt(Math.floor(index / columns)),
      BigInt(index % columns),
    ));
}

function uint64Values(region) {
  const bytes = flint.ffiFlintByteRegionCopyBytes(region);
  return Array.from(
    { length: bytes.length / 8 },
    (_, index) => bytes.readBigUInt64LE(index * 8),
  );
}

test("generated nmod resources retain word-prime matrices", () => {
  const source = matrix(3, 3, [1n,2n,3n, 0n,1n,4n, 5n,6n,0n]);
  assert.equal(flint.ffiNmodMatrixNrows(source), 3n);
  assert.equal(flint.ffiNmodMatrixNcols(source), 3n);
  assert.equal(flint.ffiNmodMatrixModulus(source), p);
  assert.equal(flint.ffiNmodMatrixEntry(source, 2n, 1n), 6n);
  assert.equal(flint.ffiNmodMatrixEntry(source, 3n, 0n), (1n << 64n) - 1n);
  assert.equal(flint.ffiNmodMatrixSetEntry(source, 0n, 0n, p - 1n), true);
  assert.throws(() => flint.ffiNmodMatrixSetEntry(source, 0n, 0n, p));

  const copy = flint.ffiNmodMatrixCopy(source);
  const negated = flint.ffiNmodMatrixNeg(copy);
  const zero = flint.ffiNmodMatrixAdd(copy, negated);
  const transposed = flint.ffiNmodMatrixTranspose(copy);
  const product = flint.ffiNmodMatrixMul(copy, transposed);
  assert.equal(flint.ffiNmodMatrixIsZero(zero), true);
  assert.equal(flint.ffiNmodMatrixEqual(source, copy), true);
  assert.equal(flint.ffiNmodMatrixNrows(product), 3n);

  const formatted = flint.ffiNmodMatrixFormat(copy);
  assert.match(flint.ffiFlintByteRegionCopyBytes(formatted).toString(), /2305843009213693950/);
  const serialized = flint.ffiNmodMatrixSerialize(copy, 8n);
  assert.equal(flint.ffiFlintByteRegionCopyBytes(serialized).length, 72);

  close(serialized, flint.ffiFlintByteRegionClose);
  close(formatted, flint.ffiFlintByteRegionClose);
  close(product, flint.ffiNmodMatrixClose);
  close(transposed, flint.ffiNmodMatrixClose);
  close(zero, flint.ffiNmodMatrixClose);
  close(negated, flint.ffiNmodMatrixClose);
  close(copy, flint.ffiNmodMatrixClose);
  close(source, flint.ffiNmodMatrixClose);
});

test("generated nmod algorithms stay resource-to-resource", () => {
  const source = matrix(3, 3, [1n,2n,3n, 0n,1n,4n, 5n,6n,0n]);
  const right = matrix(3, 1, [1n, 2n, 3n]);
  const inverse = flint.ffiNmodMatrixInv(source);
  const solution = flint.ffiNmodMatrixSolve(source, right);
  const reduced = flint.ffiNmodMatrixRref(source);
  const kernelSource = matrix(2, 4, [1n,2n,3n,4n, 2n,4n,6n,8n]);
  const kernel = flint.ffiNmodMatrixRightKernel(kernelSource);
  assert.equal(flint.ffiNmodMatrixRank(source), 3n);
  assert.equal(flint.ffiNmodMatrixDet(source), 1n);
  assert.equal(flint.ffiNmodMatrixTrace(source), 2n);
  assert.equal(flint.ffiNmodMatrixIsOne(reduced), true);
  assert.equal(flint.ffiNmodMatrixNrows(kernel), 3n);
  const identity = flint.ffiNmodMatrixMul(source, inverse);
  const recovered = flint.ffiNmodMatrixMul(source, solution);
  assert.equal(flint.ffiNmodMatrixIsOne(identity), true);
  assert.deepEqual(entries(recovered), [1n,2n,3n]);

  const characteristic = flint.ffiNmodMatrixCharpoly(source);
  const minimal = flint.ffiNmodMatrixMinpoly(source);
  assert.equal(flint.ffiFlintByteRegionCopyBytes(characteristic).length, 32);
  assert.ok(flint.ffiFlintByteRegionCopyBytes(minimal).length > 0);
  close(characteristic, flint.ffiFlintByteRegionClose);
  close(minimal, flint.ffiFlintByteRegionClose);
  for (const resource of [
    recovered, identity, kernel, kernelSource, reduced, solution, inverse, right,
    source,
  ]) {
    close(resource, flint.ffiNmodMatrixClose);
  }
});

test("generated nmod structural operations preserve resource ownership", () => {
  const source = matrix(3, 3, [1n,2n,3n, 4n,5n,6n, 7n,8n,9n]);
  const selectedRows = flint.ffiNmodMatrixSelectRows(
    source, new BigUint64Array([2n, 0n, 2n]), 3n,
  );
  const selectedColumns = flint.ffiNmodMatrixSelectColumns(
    source, new BigUint64Array([2n, 0n]), 2n,
  );
  assert.deepEqual(entries(selectedRows), [7n,8n,9n, 1n,2n,3n, 7n,8n,9n]);
  assert.deepEqual(entries(selectedColumns), [3n,1n, 6n,4n, 9n,7n]);

  const block = matrix(1, 2, [10n, 11n]);
  assert.equal(flint.ffiNmodMatrixSetBlock(source, 1n, 1n, block), true);
  assert.deepEqual(entries(source), [1n,2n,3n, 4n,10n,11n, 7n,8n,9n]);
  const stacked = flint.ffiNmodMatrixStack(source, source);
  const augmented = flint.ffiNmodMatrixAugment(source, source);
  assert.equal(flint.ffiNmodMatrixNrows(stacked), 6n);
  assert.equal(flint.ffiNmodMatrixNcols(augmented), 6n);

  const columnProduct = flint.ffiNmodMatrixMulVector(
    source, new BigUint64Array([1n, 2n, 3n]), 3n,
  );
  const rowProduct = flint.ffiNmodVectorMulMatrix(
    new BigUint64Array([1n, 2n, 3n]), 3n, source,
  );
  assert.deepEqual(uint64Values(columnProduct), [14n, 57n, 50n]);
  assert.deepEqual(uint64Values(rowProduct), [30n, 46n, 52n]);
  close(columnProduct, flint.ffiFlintByteRegionClose);
  close(rowProduct, flint.ffiFlintByteRegionClose);
  for (const resource of [augmented, stacked, block, selectedColumns, selectedRows, source]) {
    close(resource, flint.ffiNmodMatrixClose);
  }
});

test("nmod constructors reject invalid ownership inputs", () => {
  assert.throws(() => matrix(1, 1, [1n], 15n));
  assert.throws(() => flint.ffiNmodMatrixFromEntries(
    new BigUint64Array([1n]), 1n, 1n, 2n, p,
  ));
  assert.throws(() => matrix(1, 1, [p]));
});

test("nmod resource lifecycle remains bounded under repeated algorithms", () => {
  for (let round = 0; round < 100; round += 1) {
    const left = flint.ffiNmodMatrixRandom(8n, 8n, 65537n, BigInt(round + 1), 17n);
    const right = flint.ffiNmodMatrixCopy(left);
    const sum = flint.ffiNmodMatrixAdd(left, right);
    const product = flint.ffiNmodMatrixMul(sum, right);
    const reduced = flint.ffiNmodMatrixRref(product);
    const selected = flint.ffiNmodMatrixSelectRows(
      reduced, new BigUint64Array([7n, 0n, 3n]), 3n,
    );
    const bytes = flint.ffiNmodMatrixSerialize(reduced, 4n);
    assert.ok(accounted(left) > 0n);
    assert.equal(flint.ffiFlintByteRegionCopyBytes(bytes).length, 8 * 8 * 4);
    close(bytes, flint.ffiFlintByteRegionClose);
    for (const resource of [selected, reduced, product, sum, right, left]) {
      close(resource, flint.ffiNmodMatrixClose);
      assert.equal(accounted(resource), 0n);
    }
  }
});

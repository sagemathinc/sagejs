// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { packExactInt64Buffer } = require("../thin-cache-loader.cjs");

test("exact signed-64-bit packing preserves safe Number words and full BigInts", () => {
  const values = [
    -(1n << 63n),
    -Number.MAX_SAFE_INTEGER,
    -0x1_0000_0001,
    -0x1_0000_0000,
    -1,
    0,
    1,
    0xffff_ffff,
    0x1_0000_0000,
    0x1_0000_0001,
    Number.MAX_SAFE_INTEGER,
    (1n << 63n) - 1n,
  ];
  for (let index = 0; index < 128; index += 1) {
    const value = index * 70_368_744_177 - 4_503_599_627_370_495;
    values.push(value);
  }
  for (let offset = 0; offset < 64; offset += 1) {
    values.push(Number.MAX_SAFE_INTEGER - offset);
    values.push(-Number.MAX_SAFE_INTEGER + offset);
  }
  const packed = packExactInt64Buffer(values);
  assert.ok(packed instanceof BigInt64Array);
  assert.deepEqual(Array.from(packed), values.map(BigInt));
});

test("exact signed-64-bit packing rejects coercion and overflow", () => {
  for (const invalid of [true, "1", null, 1.5, NaN, Infinity,
    Number.MAX_SAFE_INTEGER + 1, 1n << 63n, -(1n << 63n) - 1n]) {
    assert.throws(() => packExactInt64Buffer([invalid]), TypeError);
  }
  assert.throws(() => packExactInt64Buffer(new Int32Array([1])), TypeError);
});

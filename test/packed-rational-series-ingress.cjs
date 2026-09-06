// sagejs-test-tier: unit
// sagejs-test-portable: false
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const flint = require("../packages/flint");

function integer(value) {
  const negative = value < 0n;
  if (negative) value = -value;
  const bytes = [];
  while (value) {
    bytes.push(Number(value & 255n));
    value >>= 8n;
  }
  const header = Buffer.alloc(4);
  header.writeUInt32LE(bytes.length + (negative ? 0x80000000 : 0));
  return Buffer.concat([header, Buffer.from(bytes)]);
}

test("packed series ingress preserves arbitrary exact coefficients and views", () => {
  const values = [[-(2n ** 130n + 1n), 3n], [0n, 1n], [7n, 2n ** 97n]];
  const packed = Buffer.concat(values.flatMap(([n, d]) => [integer(n), integer(d)]));
  const owner = Buffer.concat([Buffer.from([123]), packed, Buffer.from([234])]);
  const view = owner.subarray(1, owner.length - 1);
  const polynomial = flint.qqPolyPacked(3n, view);
  const expected = values.map(([numerator, denominator]) => ({numerator, denominator}));
  assert.deepEqual(flint.polyCoefficients(polynomial), expected);
  assert.equal(flint.polyToString(flint.qqPolyPacked(0n, new Uint8Array()), "q"), "0");
  for (let length = 0; length < packed.length; length++) {
    assert.throws(() => flint.qqPolyPacked(3n, packed.subarray(0, length)));
  }
  assert.throws(() => flint.qqPolyPacked(3n, owner));
  assert.throws(() => flint.qqPolyPacked(0n, packed));
  assert.throws(() => flint.qqPolyPacked(1n, new Uint16Array(10)));
  for (const denominator of [0n, -1n]) {
    assert.throws(() => flint.qqPolyPacked(1n,
      Buffer.concat([integer(1n), integer(denominator)])));
  }
  assert.deepEqual(flint.polyCoefficients(polynomial), expected);
});

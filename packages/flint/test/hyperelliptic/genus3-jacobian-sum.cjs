"use strict";

const assert = require("node:assert/strict");
const { join } = require("node:path");
const test = require("node:test");

const flint = require(join(
  __dirname,
  "..",
  "..",
  "build",
  "Release",
  "sagejs_flint.node",
));

const f = new BigUint64Array([1n, 1n, 0n, 0n, 0n, 0n, 0n, 1n]);
const h = new BigUint64Array(4);
const point = [1n, 0n, 1n, 0n, 0n, 1n, 0n, 0n];
const twice = [2n, 0n, 0n, 1n, 0n, 1n, 3n, 0n];
const identity = [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n];

test("packed genus-3 sums cross the Node boundary once", () => {
  const packed = new BigUint64Array([...point, ...point]);
  const result = flint.genus3JacobianSum(5n, f, h, packed, 2n, undefined);
  assert.equal(result.statusName, "ok");
  assert.deepEqual(Array.from(result.divisor), twice);
  assert.equal(result.diagnostics.groupOperations, 2n);

  const empty = flint.genus3JacobianSum(
    5n,
    f,
    h,
    new BigUint64Array(),
    0n,
    undefined,
  );
  assert.equal(empty.statusName, "ok");
  assert.deepEqual(Array.from(empty.divisor), identity);
});

test("packed genus-3 sums enforce shape and operation budgets", () => {
  const packed = new BigUint64Array([...point, ...point]);
  assert.equal(
    flint.genus3JacobianSum(5n, f, h, packed, 1n, undefined).statusName,
    "resource_limit",
  );
  assert.throws(
    () =>
      flint.genus3JacobianSum(
        5n,
        f,
        h,
        new BigUint64Array(7),
        10n,
        undefined,
      ),
    /divisible by 8/,
  );
});

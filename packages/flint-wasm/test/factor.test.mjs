import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { formatFactorization, instantiateFlintFactor } from "../index.mjs";

const wasm = await fs.readFile(
  new URL("../dist/flint-factor.wasm", import.meta.url),
);
const flint = await instantiateFlintFactor(wasm);

test("factors integers through the browser-compatible WASM boundary", () => {
  assert.deepEqual(flint.factor(2026n), {
    sign: 1,
    factors: [
      [2n, 1],
      [1013n, 1],
    ],
  });
  assert.equal(formatFactorization(flint.factor(2026n)), "2 * 1013");
});

test("preserves signs, exponents, units, and arbitrary precision", () => {
  assert.equal(formatFactorization(flint.factor(-12n)), "-1 * 2^2 * 3");
  assert.deepEqual(flint.factor(1n), { sign: 1, factors: [] });
  assert.deepEqual(flint.factor(-1n), { sign: -1, factors: [] });
  assert.equal(
    formatFactorization(flint.factor(923098402834028349082348209385n)),
    "5 * 43 * 3271 * 1312589710612682771192009",
  );
});

test("supports FLINT quadratic-sieve temporary files through WASI", () => {
  assert.equal(
    formatFactorization(flint.factor(2027n ** 22n - 1n)),
    "2^3 * 3 * 13^2 * 23 * 947 * 1013 * 8009 * 524701 * " +
      "102509021429236628338837 * 146131886639829984132902603887",
  );
});

test("rejects zero and lossy JavaScript numbers", () => {
  assert.throws(() => flint.factor(0), /cannot factor zero/);
  assert.throws(
    () => flint.factor(Number.MAX_SAFE_INTEGER + 1),
    /safe integer/,
  );
});

test("provides exact portable polynomial construction and arithmetic", () => {
  const x = flint.qqPolyGen();
  const two = flint.qqPolyConstant(2n, 1n);
  const one = flint.qqPolyConstant(1n, 1n);
  const value = flint.polyAdd(
    flint.polySub(
      flint.polyPow(x, 2n),
      flint.polyMul(two, x),
    ),
    one,
  );
  assert.equal(flint.polyToString(x, "x"), "x");
  assert.equal(
    flint.polyToString(value, "x"),
    "x^2 - 2*x + 1",
  );
  assert.equal(
    flint.polyToString(flint.qqPolyConstant(2n, 3n), "x"),
    "2/3",
  );
  assert.equal(
    flint.polyToString(
      flint.zzPolyToQQ(flint.zzPolyConstant(-5n)),
      "x",
    ),
    "-5",
  );
  assert.ok(
    flint.polyEqual(
      value,
      flint.polyPow(flint.polySub(x, one), 2n),
    ),
  );

  const z = flint.nmodPolyGen(5n);
  const reduced = flint.polyAdd(
    flint.polyPow(z, 2n),
    flint.nmodPolyConstant(6n, 5n),
  );
  assert.equal(flint.polyToString(reduced, "z"), "z^2 + 1");
});

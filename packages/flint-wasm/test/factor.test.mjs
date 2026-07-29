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

test("rejects zero and lossy JavaScript numbers", () => {
  assert.throws(() => flint.factor(0), /cannot factor zero/);
  assert.throws(
    () => flint.factor(Number.MAX_SAFE_INTEGER + 1),
    /safe integer/,
  );
});

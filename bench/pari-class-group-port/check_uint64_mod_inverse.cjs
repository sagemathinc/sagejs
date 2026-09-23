"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

function inverseReference(value, modulus) {
  let oldR = modulus;
  let r = value % modulus;
  let oldT = 0n;
  let t = 1n;
  while (r !== 0n) {
    const quotient = oldR / r;
    [oldR, r] = [r, oldR - quotient * r];
    [oldT, t] = [t, oldT - quotient * t];
  }
  if (oldR !== 1n) throw new RangeError("noninvertible residue");
  return (oldT % modulus + modulus) % modulus;
}

(async () => {
  const built = await compileKernel({
    sourcePath: path.join(__dirname, "int64_flx_small.py"),
  });
  const kernel = require(built.modulePath).uint64_pari_word_mod_inverse;
  const inputs = [];
  for (const modulus of [2n, 3n, 5n, 7n, 251n, 65537n]) {
    for (let value = 1n; value < modulus; value += 1n)
      inputs.push([value, modulus]);
  }
  const maximumPrime = 3037000493n;
  let state = 0x9e3779b97f4a7c15n;
  for (let iteration = 0; iteration < 10000; iteration += 1) {
    state = (state * 6364136223846793005n + 1442695040888963407n) &
      ((1n << 64n) - 1n);
    inputs.push([1n + state % (maximumPrime - 1n), maximumPrime]);
  }
  inputs.push([1n, maximumPrime]);
  inputs.push([maximumPrime - 1n, maximumPrime]);

  for (const backend of ["javascript", "gmp", "tagged"]) {
    for (const [value, modulus] of inputs) {
      const expected = inverseReference(value, modulus);
      const actual = kernel[backend](value, modulus);
      assert.equal(actual, expected, `${backend}: inverse(${value}, ${modulus})`);
      assert.equal(value * actual % modulus, 1n);
    }
  }

  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  const emitted = core.match(
    /static int native_uint64_pari_word_mod_inverse\([^;]*\)\n\{[\s\S]*?\n}\n/,
  );
  assert(emitted, "missing bounded modular inverse");
  assert.doesNotMatch(emitted[0], /\bmpz_/);
  assert.doesNotMatch(emitted[0], /\b(?:malloc|calloc|realloc|free)\(/);
  console.log(JSON.stringify({
    schema: "sagejs.check/uint64-pari-word-mod-inverse-v1",
    cases: inputs.length,
    backends: ["javascript", "gmp", "tagged"],
    maximumPrime: String(maximumPrime),
    emittedMpzOperations: 0,
    emittedHeapCalls: 0,
    coreSourcePath: built.coreSourcePath,
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

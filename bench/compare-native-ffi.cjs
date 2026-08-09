#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");

const root = join(__dirname, "..");

function median(values) {
  return [...values].sort((left, right) => left - right)[
    Math.floor(values.length / 2)
  ];
}

function time(name, fn, repeat, warmup = 100) {
  let answer;
  for (let index = 0; index < warmup; index += 1) answer = fn();
  const samples = [];
  for (let sample = 0; sample < 9; sample += 1) {
    const start = process.hrtime.bigint();
    for (let index = 0; index < repeat; index += 1) answer = fn();
    samples.push(Number(process.hrtime.bigint() - start) / repeat);
  }
  return { name, medianNanoseconds: median(samples), answer: String(answer) };
}

(async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-benchmark-"));
  try {
    const compiled = await compileKernel({
      sourcePath: join(root, "bench", "native-ffi-flint.py"),
      cacheRoot: temporary,
    });
    const kernel = require(compiled.modulePath);
    const flint = require("@sagemath/sagejs-flint");
    const prime = 18446744073709551557n;
    const left = ((2n ** 2048n) - 1n) * 65537n;
    const right = ((2n ** 1024n) - 1n) * 65537n;
    assert.equal(kernel.flint_word_is_prime(prime), true);
    assert.equal(kernel.flint_integer_gcd(left, right), flint.gcd(left, right));
    const rows = [
      time("prime/native isolated core", () =>
        kernel.flint_word_is_prime(prime), 10000),
      time("prime/generated dynamic", () =>
        kernel.flint_word_is_prime.javascript(prime), 10000),
      time("prime/direct addon", () => flint.wordIsPrime(prime), 10000),
      time("gcd/native isolated core", () =>
        kernel.flint_integer_gcd(left, right), 2000),
      time("gcd/generated dynamic", () =>
        kernel.flint_integer_gcd.javascript(left, right), 2000),
      time("gcd/direct addon", () => flint.gcd(left, right), 2000),
    ];
    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.benchmark/native-ffi-v1",
      workload: {
        primality: "64-bit prime near 2^64",
        gcd: "2048-bit and 1024-bit Mersenne multiples",
        warmup: 100,
        samples: 9,
      },
      declarationIdentities: compiled.ir.foreignLibraries.map(
        (library) => library.declarationIdentity,
      ),
      rows,
    }, null, 2)}\n`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

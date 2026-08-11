#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const sourcePath = join(
  root,
  "src",
  "lib",
  "sagejs",
  "kernels",
  "polynomial",
  "packed_prime_field.py",
);
const program = String.raw`
import time
F = GF(65537)
R = PolynomialRing(F, "x")
f = R([index % 65537 for index in range(20000)])
value = F(12345)
for _repeat in range(3):
    answer = f(value)
samples = []
for _repeat in range(9):
    started = time.perf_counter()
    answer = f(value)
    samples.append(1000 * (time.perf_counter() - started))
samples.sort()
print(int(answer.lift()), samples[len(samples) // 2])
`;

function measure(cache, environment) {
  const result = spawnSync(sagejs, ["--python"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_CACHE_DIR: cache, ...environment },
    input: program,
    timeout: 60_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const [value, milliseconds] = result.stdout.trim().split(/\s+/).map(Number);
  return { value, milliseconds };
}

const cache = mkdtempSync(join(tmpdir(), "sagejs-prime-poly-bench-"));
try {
  const compilation = spawnSync(
    sagejs,
    ["native", "compile", sourcePath, "--cache-root", cache],
    { cwd: root, encoding: "utf8", timeout: 60_000 },
  );
  if (compilation.error) throw compilation.error;
  assert.equal(compilation.status, 0, compilation.stderr || compilation.stdout);
  const native = measure(cache, { SAGEJS_NATIVE_REQUIRED: "1" });
  const dynamic = measure(cache, { SAGEJS_NATIVE_DISABLE: "1" });
  assert.equal(native.value, dynamic.value);
  console.log(JSON.stringify({
    schema: "sagejs.benchmark/packed-prime-polynomial-evaluate-v1",
    degree: 19999,
    modulus: 65537,
    value: 12345,
    result: native.value,
    milliseconds: {
      native: native.milliseconds,
      dynamic: dynamic.milliseconds,
    },
  }, null, 2));
} finally {
  rmSync(cache, { recursive: true, force: true });
}

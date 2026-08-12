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
  "gf2_packed.py",
);
const degree = Number(process.env.SAGEJS_GF2_PACKED_DEGREE || 262143);
const samples = Number(process.env.SAGEJS_GF2_PACKED_SAMPLES || 7);
const check = process.argv.includes("--check");

const program = String.raw`
import json
import time
from sagejs.polynomial_algorithms.gf2_packed_core import BitPolynomialStorage as B

degree = __DEGREE__
samples = __SAMPLES__
left_coefficients = [((index * 17 + 3) % 7) % 2 for index in range(degree)] + [1]
right_coefficients = [((index * 29 + 5) % 11) % 2 for index in range(degree)] + [1]
left = B.from_coefficients(left_coefficients)
right = B.from_coefficients(right_coefficients)


def measure(operation):
    for _repeat in range(2):
        result = operation()
    timings = []
    for _repeat in range(samples):
        started = time.perf_counter()
        result = operation()
        timings.append(1000 * (time.perf_counter() - started))
    timings.sort()
    return result, timings[len(timings) // 2]


added, add_ms = measure(lambda: left + right)
shifted, shift_ms = measure(lambda: left.shift_left(65))
weight, weight_ms = measure(lambda: left.weight())
serialized, serialize_ms = measure(lambda: left.to_bytes())
print("GF2_PACKED_CORE " + json.dumps({
    "degree": degree,
    "identity": [
        added.bit_length,
        added.weight(),
        shifted.shift_right(65) == left,
        weight,
        B.from_bytes(serialized) == left,
    ],
    "median_ms": {
        "add_xor": add_ms,
        "shift_left_65": shift_ms,
        "weight": weight_ms,
        "serialize": serialize_ms,
    },
    "storage_bytes": {
        "packed_words": len(left.words) * 8,
        "dense_uint64_coefficients": left.bit_length * 8,
        "versioned_serialization": len(serialized),
    },
}, sort_keys=True, separators=(",", ":")))
`
  .replaceAll("__DEGREE__", String(degree))
  .replaceAll("__SAMPLES__", String(samples));

function measure(cache, environment) {
  const result = spawnSync(sagejs, ["--python"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_CACHE_DIR: cache, ...environment },
    input: program,
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const line = result.stdout
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("GF2_PACKED_CORE "));
  assert.ok(line, "benchmark did not emit its result record");
  return JSON.parse(line.slice("GF2_PACKED_CORE ".length));
}

const cache = mkdtempSync(join(tmpdir(), "sagejs-gf2-packed-bench-"));
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
  assert.deepEqual(native.identity, dynamic.identity);
  assert.deepEqual(native.storage_bytes, dynamic.storage_bytes);
  if (check) {
    assert.equal(native.identity[2], true);
    assert.equal(native.identity[4], true);
    assert.ok(
      native.storage_bytes.dense_uint64_coefficients /
          native.storage_bytes.packed_words >=
        63,
    );
    for (const milliseconds of Object.values(native.median_ms)) {
      assert.ok(Number.isFinite(milliseconds) && milliseconds >= 0);
    }
  }
  console.log(JSON.stringify({
    schema: "sagejs.benchmark/gf2-polynomial-packed-core-v1",
    representation: "canonical-little-endian-uint64-bits",
    source_transparent_native: true,
    native,
    dynamic,
  }, null, 2));
} finally {
  rmSync(cache, { recursive: true, force: true });
}

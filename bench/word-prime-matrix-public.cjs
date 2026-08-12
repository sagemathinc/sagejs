#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { existsSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const { createSage } = require("../dist/tools/kernel.js");

const root = resolve(__dirname, "..");
const samples = Number(process.env.SAGEJS_WORD_PRIME_MATRIX_SAMPLES || 9);
const warmups = Number(process.env.SAGEJS_WORD_PRIME_MATRIX_WARMUPS || 4);
const size = Number(process.env.SAGEJS_WORD_PRIME_MATRIX_SIZE || 160);
const modulus = 65537n;

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function measure(operation) {
  for (let index = 0; index < warmups; index += 1) operation();
  const values = [];
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now();
    operation();
    values.push(performance.now() - started);
  }
  return median(values);
}

function deterministicEntries() {
  let state = 20260812n;
  const mask = (1n << 64n) - 1n;
  return Array.from({ length: size * size }, () => {
    state = (state * 6364136223846793005n + 1442695040888963407n) & mask;
    return state % modulus;
  });
}

function parseLastJson(output, label) {
  const lines = output.trim().split("\n").filter(Boolean);
  assert.ok(lines.length > 0, `${label} produced no output`);
  try {
    return JSON.parse(lines.at(-1));
  } catch (error) {
    throw new Error(`${label} did not end in JSON:\n${output}`, { cause: error });
  }
}

async function sageJsWorker() {
  const session = await createSage();
  try {
    await session.evaluate(String.raw`
import sagejs.runtime as runtime

_wp_size = ${size}
_wp_modulus = ${modulus}
_wp_field = GF(_wp_modulus)
_wp_entries = []
_wp_state = 20260812
for _wp_index in range(_wp_size * _wp_size):
    _wp_state = (_wp_state * 6364136223846793005 + 1442695040888963407) % 18446744073709551616
    _wp_entries.append(_wp_state % _wp_modulus)
_wp_matrix = matrix(_wp_field, _wp_size, _wp_entries)
_wp_resource_size = ${Math.min(80, size)}
_wp_resource_modulus = 2305843009213693951
_wp_resource_field = GF(_wp_resource_modulus)
_wp_resource_entries = [value % _wp_resource_modulus for value in _wp_entries[:_wp_resource_size * _wp_resource_size]]
_wp_resource_matrix = matrix(_wp_resource_field, _wp_resource_size, _wp_resource_entries)
assert _wp_matrix._has_nmod_matrix_resource()
assert not _wp_matrix._has_packed_prime_storage()
assert _wp_resource_matrix._has_nmod_matrix_resource()

def _wp_close(value):
    if value._has_nmod_matrix_resource():
        value._nmod_storage_cache.resource.close()

def _wp_construct():
    value = matrix(_wp_field, _wp_size, _wp_entries)
    _wp_close(value)

def _wp_multiply():
    value = _wp_matrix * _wp_matrix
    _wp_close(value)

def _wp_rank():
    source = _wp_matrix.__copy__()
    try:
        return source.rank()
    finally:
        _wp_close(source)

def _wp_rref():
    source = _wp_matrix.__copy__()
    value = source.rref()
    _wp_close(value)
    _wp_close(source)

def _wp_density():
    return _wp_matrix.density()

def _wp_resource_construct():
    value = matrix(_wp_resource_field, _wp_resource_size, _wp_resource_entries)
    _wp_close(value)

def _wp_resource_multiply():
    value = _wp_resource_matrix * _wp_resource_matrix
    _wp_close(value)

def _wp_resource_rank():
    source = _wp_resource_matrix.__copy__()
    try:
        return source.rank()
    finally:
        _wp_close(source)

def _wp_resource_rref():
    source = _wp_resource_matrix.__copy__()
    value = source.rref()
    _wp_close(value)
    _wp_close(source)

def _wp_resource_density():
    return _wp_resource_matrix.density()

def _wp_measure(operation):
    started = runtime.wall_time()
    operation()
    return (runtime.wall_time() - started) * 1000

def _wp_digest():
    product = _wp_matrix * _wp_matrix
    source = _wp_matrix.__copy__()
    reduced = source.rref()
    try:
        checksum = 0
        for index, value in enumerate(_wp_matrix.list()):
            checksum = (checksum + (index + 1) * value.lift()) % 18446744073709551557
        return [
            str(_wp_matrix.rank()),
            str(_wp_matrix.determinant().lift()),
            str(product.trace().lift()),
            str(reduced.trace().lift()),
            str(checksum),
        ]
    finally:
        _wp_close(reduced)
        _wp_close(source)
        _wp_close(product)

def _wp_resource_digest():
    product = _wp_resource_matrix * _wp_resource_matrix
    source = _wp_resource_matrix.__copy__()
    reduced = source.rref()
    try:
        checksum = 0
        for index, value in enumerate(_wp_resource_matrix.list()):
            checksum = (checksum + (index + 1) * value.lift()) % 18446744073709551557
        return [
            str(_wp_resource_matrix.rank()),
            str(_wp_resource_matrix.determinant().lift()),
            str(product.trace().lift()),
            str(reduced.trace().lift()),
            str(checksum),
        ]
    finally:
        _wp_close(reduced)
        _wp_close(source)
        _wp_close(product)
`);
    async function timingsFor(cases) {
      const timings = {};
      for (const [name, operation] of cases) {
        for (let index = 0; index < warmups; index += 1) {
          await session.evaluate(`_wp_measure(${operation})`);
        }
        const values = [];
        for (let index = 0; index < samples; index += 1) {
          const result = await session.evaluate(`_wp_measure(${operation})`);
          values.push(Number(result.repr));
        }
        timings[name] = median(values);
      }
      return timings;
    }
    const cases = [
      ["construct", "_wp_construct"],
      ["multiply", "_wp_multiply"],
      ["rank", "_wp_rank"],
      ["rref", "_wp_rref"],
      ["density", "_wp_density"],
    ];
    const resourceCases = cases.map(([name, operation]) => [
      name,
      operation.replace("_wp_", "_wp_resource_"),
    ]);
    const timings = await timingsFor(cases);
    const resourceTimings = await timingsFor(resourceCases);
    const digest = (await session.evaluate("':'.join(_wp_digest())"))
      .repr.slice(1, -1).split(":");
    const resourceDigest = (
      await session.evaluate("':'.join(_wp_resource_digest())")
    ).repr.slice(1, -1).split(":");
    console.log(JSON.stringify({
      timings,
      digest,
      resourceTimings,
      resourceDigest,
      resourceSize: Math.min(80, size),
    }));
  } finally {
    session.close();
  }
}

function runSageJs(disableNative) {
  const result = spawnSync(process.execPath, [__filename, "--sagejs-worker"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      ...(disableNative ? { SAGEJS_NATIVE_DISABLE: "1" } : {}),
    },
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return parseLastJson(result.stdout, disableNative ? "dynamic Sage.js" : "compiled Sage.js");
}

function runLegacyNapi() {
  const legacy = require("../packages/flint/build/Release/sagejs_flint.node");
  const entries = deterministicEntries();
  const source = legacy.nmodMatrix(size, size, entries, modulus);
  const timings = {
    construct: measure(() => legacy.nmodMatrix(size, size, entries, modulus)),
    multiply: measure(() => legacy.matrixMul(source, source)),
    rank: measure(() => legacy.matrixRank(source)),
    rref: measure(() => legacy.matrixRref(source)),
    density: null,
  };
  const product = legacy.matrixMul(source, source);
  const reduced = legacy.matrixRref(source);
  let checksum = 0n;
  for (let index = 0; index < entries.length; index += 1) {
    checksum = (checksum + BigInt(index + 1) * entries[index]) % 18446744073709551557n;
  }
  let productTrace = 0n;
  let reducedTrace = 0n;
  for (let index = 0; index < size; index += 1) {
    productTrace = (productTrace + legacy.matrixEntry(product, index, index)) % modulus;
    reducedTrace = (reducedTrace + legacy.matrixEntry(reduced, index, index)) % modulus;
  }
  return {
    timings,
    digest: [
      String(legacy.matrixRank(source)),
      String(legacy.matrixDet(source)),
      String(productTrace),
      String(reducedTrace),
      String(checksum),
    ],
  };
}

function sageExecutable() {
  const candidates = [
    process.env.SAGE,
    "/home/user/sagelite/sage",
    "/usr/local/bin/sage",
    "/usr/bin/sage",
  ].filter(Boolean);
  return candidates.find(existsSync);
}

function runSageMath() {
  const executable = sageExecutable();
  if (!executable) return { available: false, reason: "no native Sage executable found" };
  const code = String.raw`
import json, platform, statistics, time
p = ${modulus}
n = ${size}
samples = ${samples}
warmups = ${warmups}
F = GF(p)
entries = []
state = 20260812
for i in range(n*n):
    state = (state * 6364136223846793005 + 1442695040888963407) % 18446744073709551616
    entries.append(state % p)
A = matrix(F, n, entries)
def rref_of_copy():
    return A.__copy__().rref()
def measure(operation):
    for _ in range(warmups): operation()
    values = []
    for _ in range(samples):
        started = time.perf_counter()
        operation()
        values.append((time.perf_counter() - started) * 1000)
    return statistics.median(values)
timings = {
    'construct': measure(lambda: matrix(F, n, entries)),
    'multiply': measure(lambda: A * A),
    'rank': measure(lambda: A.__copy__().rank()),
    'rref': measure(rref_of_copy),
    'density': measure(lambda: A.density()),
}
product = A * A
reduced = A.rref()
checksum = sum((i + 1) * int(v) for i, v in enumerate(A.list())) % 18446744073709551557
digest = [str(int(A.rank())), str(int(A.determinant())), str(int(product.trace())), str(int(reduced.trace())), str(int(checksum))]
print(json.dumps({'timings': timings, 'digest': digest, 'python': platform.python_version()}))
`;
  const result = spawnSync(executable, ["-c", code], {
    cwd: root,
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return { available: false, reason: (result.stderr || result.stdout).trim() };
  }
  return { available: true, ...parseLastJson(result.stdout, "SageMath") };
}

async function main() {
  if (process.argv.includes("--sagejs-worker")) {
    await sageJsWorker();
    return;
  }
  assert.ok(Number.isInteger(size) && size > 0);
  assert.ok(Number.isInteger(samples) && samples > 0);
  assert.ok(Number.isInteger(warmups) && warmups >= 0);
  const compiled = runSageJs(false);
  const dynamic = runSageJs(true);
  const legacyNapi = runLegacyNapi();
  const sageMath = runSageMath();
  assert.deepEqual(dynamic.digest, compiled.digest);
  assert.deepEqual(dynamic.resourceDigest, compiled.resourceDigest);
  assert.deepEqual(legacyNapi.digest, compiled.digest);
  if (sageMath.available) assert.deepEqual(sageMath.digest, compiled.digest);

  const report = {
    schema: "sagejs.benchmark/packed-and-word-prime-matrix-v3",
    generatedAt: new Date().toISOString(),
    workload: {
      field: `GF(${modulus})`,
      shape: [size, size],
      entries: "64-bit LCG seed 20260812, then reduction modulo p",
      operations: ["construction", "square", "rank of a copy", "RREF", "density"],
      warmups,
      samples,
      statistic: "median wall-clock milliseconds; process startup and digest excluded",
    },
    equivalenceDigest: {
      fields: ["rank", "determinant", "square trace", "RREF trace", "weighted entry checksum"],
      value: compiled.digest,
      verifiedAcross: [
        "compiled Sage.js generated nmod_mat resource",
        "dynamic Sage.js generated nmod_mat resource adapter",
        "legacy handwritten N-API/FLINT",
        ...(sageMath.available ? ["SageMath"] : []),
      ],
    },
    largePrimeNmodWitness: {
      field: "GF(2305843009213693951)",
      shape: [compiled.resourceSize, compiled.resourceSize],
      representation: "generated owned FLINT nmod_mat resource",
      compiledTimingsMs: compiled.resourceTimings,
      dynamicTimingsMs: dynamic.resourceTimings,
      equivalenceDigest: compiled.resourceDigest,
    },
    methodology: {
      compiled: "public Sage.js generated nmod_mat resource storage with production typed-Python density traversal enabled",
      dynamic: "the same generated resource code under SAGEJS_NATIVE_DISABLE=1; resource-to-resource FLINT algorithms remain available while density uses dynamic Python",
      representationCrossover: "packed UInt64 plus Modular<float> below 256; generated canonical nmod_mat resources at and above 256; Modular<double> remains an explicit tested adapter rather than the canonical storage route",
      legacyNapi: "the superseded handwritten N-API API on a retained nmod_mat object",
      sageMath: "SageMath public dense GF(p) matrix API on the identical deterministic entries",
    },
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      cpu: os.cpus()[0]?.model || "unknown",
      logicalCpus: os.cpus().length,
    },
    resultsMs: {
      compiledSageJs: compiled.timings,
      dynamicSageJs: dynamic.timings,
      legacyNapi: legacyNapi.timings,
      sageMath,
    },
  };
  const writeIndex = process.argv.indexOf("--write-report");
  if (writeIndex !== -1) {
    const destination = process.argv[writeIndex + 1];
    if (!destination) throw new Error("--write-report requires a path");
    writeFileSync(resolve(destination), `${JSON.stringify(report, null, 2)}\n`);
  }
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`Dense word-prime matrix comparison: ${size}x${size} over GF(${modulus})`);
  console.log(`${warmups} warmups; median of ${samples} samples; digest ${compiled.digest.join(":")}`);
  for (const operation of Object.keys(compiled.timings)) {
    const values = [
      ["compiled", compiled.timings[operation]],
      ["dynamic", dynamic.timings[operation]],
      ["legacy N-API", legacyNapi.timings[operation]],
      ["SageMath", sageMath.available ? sageMath.timings[operation] : null],
    ];
    console.log(
      `  ${operation.padEnd(10)} ` + values.map(([name, value]) =>
        `${name}=${value === null ? "n/a" : `${value.toFixed(3)}ms`}`).join("  "),
    );
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});

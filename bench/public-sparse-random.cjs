#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { existsSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const { createSage } = require("../dist/tools/kernel.js");

const root = resolve(__dirname, "..");
const warmSamples = 5;
const check = process.argv.includes("--check");
const sage = process.env.SAGE || "/home/user/bin/sagelite";

const cases = [
  {
    id: "QQ-small-bounds-200x300-density-.2",
    rows: 200,
    columns: 300,
    density: 0.2,
    keywords: "num_bound=5, den_bound=5",
  },
  {
    id: "QQ-80x97-bit-bounds-200x300-density-.2",
    rows: 200,
    columns: 300,
    density: 0.2,
    keywords: "num_bound=2**80, den_bound=2**97",
  },
  {
    id: "QQ-17x521-bit-bounds-200x300-density-.2",
    rows: 200,
    columns: 300,
    density: 0.2,
    keywords: "num_bound=2**17, den_bound=2**521",
  },
  {
    id: "QQ-1n-200x300-density-.2",
    rows: 200,
    columns: 300,
    density: 0.2,
    keywords: "distribution='1/n'",
  },
  {
    id: "QQ-80x97-bit-bounds-1000x1000-density-.1",
    rows: 1000,
    columns: 1000,
    density: 0.1,
    keywords: "num_bound=2**80, den_bound=2**97",
    dynamic: false,
  },
];

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function expression(testCase, seed) {
  return `_timed_sparse_random(QQ, ${testCase.rows}, ${testCase.columns}, ${testCase.density}, ${seed}, ${testCase.keywords})`;
}

function parseMeasurement(repr) {
  const match = /^\(([-+0-9.eE]+), ['"]([0-9a-f]{64})['"]\)$/.exec(repr);
  assert.ok(match, `unexpected Sage.js measurement ${repr}`);
  return { elapsed_ms: Number(match[1]), digest: match[2] };
}

async function sageJsMeasurements({ nativeDisabled, includeScaling }) {
  const previousDisable = process.env.SAGEJS_NATIVE_DISABLE;
  if (nativeDisabled) process.env.SAGEJS_NATIVE_DISABLE = "1";
  else delete process.env.SAGEJS_NATIVE_DISABLE;
  const startupStarted = performance.now();
  const session = await createSage();
  const startupMs = performance.now() - startupStarted;
  try {
    const setupStarted = performance.now();
    await session.evaluate(String.raw`
from hashlib import sha256
import sagejs.ffi.flint as _sparse_flint
import sagejs.runtime as _sparse_runtime

def _timed_sparse_random(base, rows, columns, density, seed, **kwds):
    set_random_seed(seed)
    started = _sparse_runtime.wall_time()
    value = random_matrix(base, rows, columns, density=density, **kwds)
    elapsed = (_sparse_runtime.wall_time() - started) * 1000
    resource = value._rational_resource()
    region = _sparse_flint.fmpq_matrix_serialize(resource)
    try:
        digest = sha256(bytes(region.copy_bytes())).hexdigest()
    finally:
        region.close()
        resource.close()
    return elapsed, digest
`);
    const setupMs = performance.now() - setupStarted;
    const measurements = [];
    for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
      const testCase = cases[caseIndex];
      if (!includeScaling && testCase.dynamic === false) continue;
      const seedBase = 2026081200 + 100 * caseIndex;
      const first = parseMeasurement(
        (await session.evaluate(expression(testCase, seedBase))).repr,
      );
      const warm = [];
      for (let repeat = 0; repeat < warmSamples; repeat += 1) {
        warm.push(parseMeasurement(
          (await session.evaluate(
            expression(testCase, seedBase + repeat + 1),
          )).repr,
        ));
      }
      measurements.push({
        id: testCase.id,
        first_sample_ms: first.elapsed_ms,
        first_digest: first.digest,
        warm_samples_ms: warm.map((entry) => entry.elapsed_ms),
        warm_digests: warm.map((entry) => entry.digest),
        warm_median_ms: median(warm.map((entry) => entry.elapsed_ms)),
      });
    }
    return {
      mode: nativeDisabled ? "dynamic-native-disabled" : "compiled-native",
      startup_ms: startupMs,
      setup_ms: setupMs,
      measurements,
    };
  } finally {
    await session.close();
    if (previousDisable === undefined) delete process.env.SAGEJS_NATIVE_DISABLE;
    else process.env.SAGEJS_NATIVE_DISABLE = previousDisable;
  }
}

function sageMeasurements() {
  if (!existsSync(sage)) return null;
  const directory = mkdtempSync(join(tmpdir(), "sagejs-sparse-random-bench-"));
  try {
    const script = join(directory, "benchmark.py");
    writeFileSync(
      script,
      `import json\nimport time\n\nCASES = ${JSON.stringify(cases)}\nWARM_SAMPLES = ${warmSamples}\nresults = []\nfor case_index, case in enumerate(CASES):\n    namespace = {}\n    exec("kwds = dict(" + case["keywords"] + ")", namespace)\n    kwds = namespace["kwds"]\n    seed_base = 2026081200 + 100 * case_index\n    def run(seed):\n        set_random_seed(seed)\n        started = time.perf_counter()\n        value = random_matrix(QQ, case["rows"], case["columns"], density=case["density"], **kwds)\n        elapsed = 1000 * (time.perf_counter() - started)\n        return elapsed, sum(1 for entry in value.list() if entry)\n    first, first_nonzero = run(seed_base)\n    warm_results = [run(seed_base + repeat + 1) for repeat in range(WARM_SAMPLES)]\n    warm = [entry[0] for entry in warm_results]\n    ordered = sorted(warm)\n    results.append({"id": case["id"], "first_sample_ms": first, "first_nonzero": first_nonzero, "warm_samples_ms": warm, "warm_nonzero_counts": [entry[1] for entry in warm_results], "warm_median_ms": ordered[len(ordered) // 2]})\nprint(json.dumps(results, separators=(",", ":")))\n`,
    );
    const startupStarted = performance.now();
    const startup = spawnSync(sage, ["-c", "pass"], {
      cwd: root,
      encoding: "utf8",
      timeout: 300_000,
    });
    const startupMs = performance.now() - startupStarted;
    assert.equal(startup.status, 0, startup.stderr || startup.stdout);
    const processStarted = performance.now();
    const result = spawnSync(sage, [script], {
      cwd: root,
      encoding: "utf8",
      timeout: 300_000,
      env: {
        ...process.env,
        OPENBLAS_NUM_THREADS: "1",
        OMP_NUM_THREADS: "1",
      },
    });
    const processMs = performance.now() - processStarted;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return {
      startup_ms: startupMs,
      benchmark_process_ms: processMs,
      measurements: JSON.parse(result.stdout.trim().split("\n").at(-1)),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function main() {
  const rssBefore = process.memoryUsage().rss;
  const compiled = await sageJsMeasurements({
    nativeDisabled: false,
    includeScaling: true,
  });
  const rssAfterCompiled = process.memoryUsage().rss;
  const dynamic = await sageJsMeasurements({
    nativeDisabled: true,
    includeScaling: false,
  });
  const rssAfterAll = process.memoryUsage().rss;
  const sageOracle = sageMeasurements();
  const compiledById = new Map(
    compiled.measurements.map((entry) => [entry.id, entry]),
  );
  const equivalentCaseIds = [];
  for (const entry of dynamic.measurements) {
    const native = compiledById.get(entry.id);
    assert.ok(native);
    assert.equal(native.first_digest, entry.first_digest);
    assert.deepEqual(native.warm_digests, entry.warm_digests);
    equivalentCaseIds.push(entry.id);
  }
  const report = {
    schema: "sagejs.benchmark/qq-sparse-random-completion-v1",
    environment: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      sage_oracle: sageOracle === null ? null : sage,
    },
    workload: {
      warm_samples: warmSamples,
      policy: "session startup and helper setup are separate; each workload has one first sample followed by five same-session warm samples",
      random_state: "each compiled, dynamic, and SageMath sample uses the same explicit per-case seed",
      timed_region: "matrix construction only; serialization digest and resource close occur after timing",
      dynamic_scope: "native-disabled equivalence covers the four 200x300 cases; the 1000x1000 scaling case is excluded because its full Python fallback is intentionally non-production",
    },
    memory: {
      rss_before_bytes: rssBefore,
      rss_after_compiled_bytes: rssAfterCompiled,
      compiled_rss_delta_bytes: rssAfterCompiled - rssBefore,
      rss_after_all_sagejs_bytes: rssAfterAll,
      all_sagejs_rss_delta_bytes: rssAfterAll - rssBefore,
      max_rss_kib: process.resourceUsage().maxRSS,
    },
    equivalence: {
      compiled_vs_dynamic_exact_serialization: true,
      case_ids: equivalentCaseIds,
    },
    sagejs: { compiled, dynamic },
    sage: sageOracle,
  };

  if (check) {
    const byId = compiledById;
    const small = byId.get("QQ-small-bounds-200x300-density-.2");
    assert.ok(small);
    for (const entry of compiled.measurements) {
      assert.ok(Number.isFinite(entry.warm_median_ms));
      assert.ok(entry.warm_median_ms > 0);
      assert.match(entry.first_digest, /^[0-9a-f]{64}$/);
    }
    assert.equal(equivalentCaseIds.length, dynamic.measurements.length);
    for (const id of [
      "QQ-80x97-bit-bounds-200x300-density-.2",
      "QQ-17x521-bit-bounds-200x300-density-.2",
      "QQ-1n-200x300-density-.2",
    ]) {
      assert.ok(
        byId.get(id).warm_median_ms <= 5 * small.warm_median_ms,
        `${id} exceeded the same-shape small-bound 5x budget`,
      );
    }
    const scaling = byId.get("QQ-80x97-bit-bounds-1000x1000-density-.1");
    const wide = byId.get("QQ-80x97-bit-bounds-200x300-density-.2");
    assert.ok(
      scaling.warm_median_ms <= 15 * wide.warm_median_ms,
      "wide-bound work did not scale with selected entries",
    );
    assert.ok(
      report.memory.compiled_rss_delta_bytes < 256 * 1024 * 1024,
      "sparse random benchmark retained more than 256 MiB",
    );
    if (sageOracle !== null) {
      const oracleById = new Map(
        sageOracle.measurements.map((entry) => [entry.id, entry]),
      );
      for (const id of [
        "QQ-80x97-bit-bounds-200x300-density-.2",
        "QQ-17x521-bit-bounds-200x300-density-.2",
        "QQ-1n-200x300-density-.2",
      ]) {
        assert.ok(
          byId.get(id).warm_median_ms <=
            4 * oracleById.get(id).warm_median_ms,
          `${id} exceeded the same-host SageMath 4x budget`,
        );
      }
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

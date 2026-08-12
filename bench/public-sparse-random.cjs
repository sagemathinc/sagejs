#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { existsSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { createSage } = require("../dist/tools/kernel.js");

const root = resolve(__dirname, "..");
const samples = 5;
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
  },
];

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function expression(testCase) {
  return `_timed_sparse_random(QQ, ${testCase.rows}, ${testCase.columns}, ${testCase.density}, ${testCase.keywords})`;
}

async function sageJsMeasurements() {
  const session = await createSage();
  try {
    await session.evaluate(String.raw`
import sagejs.runtime as _sparse_runtime

def _timed_sparse_random(base, rows, columns, density, **kwds):
    started = _sparse_runtime.wall_time()
    value = random_matrix(base, rows, columns, density=density, **kwds)
    elapsed = (_sparse_runtime.wall_time() - started) * 1000
    value._rational_resource().close()
    return elapsed
`);
    const measurements = [];
    for (const testCase of cases) {
      const source = expression(testCase);
      const cold = Number((await session.evaluate(source)).repr);
      const warm = [];
      for (let repeat = 0; repeat < samples; repeat += 1) {
        warm.push(Number((await session.evaluate(source)).repr));
      }
      measurements.push({
        id: testCase.id,
        cold_ms: cold,
        warm_samples_ms: warm,
        warm_median_ms: median(warm),
      });
    }
    return measurements;
  } finally {
    await session.close();
  }
}

function sageMeasurements() {
  if (!existsSync(sage)) return null;
  const directory = mkdtempSync(join(tmpdir(), "sagejs-sparse-random-bench-"));
  try {
    const script = join(directory, "benchmark.py");
    writeFileSync(
      script,
      `import json\nimport time\n\nCASES = ${JSON.stringify(cases)}\nSAMPLES = ${samples}\nresults = []\nfor case in CASES:\n    namespace = {}\n    exec("kwds = dict(" + case["keywords"] + ")", namespace)\n    kwds = namespace["kwds"]\n    def run():\n        started = time.perf_counter()\n        random_matrix(QQ, case["rows"], case["columns"], density=case["density"], **kwds)\n        return 1000 * (time.perf_counter() - started)\n    cold = run()\n    warm = [run() for repeat in range(SAMPLES)]\n    ordered = sorted(warm)\n    results.append({"id": case["id"], "cold_ms": cold, "warm_samples_ms": warm, "warm_median_ms": ordered[len(ordered) // 2]})\nprint(json.dumps(results, separators=(",", ":")))\n`,
    );
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
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout.trim().split("\n").at(-1));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function main() {
  const rssBefore = process.memoryUsage().rss;
  const sagejs = await sageJsMeasurements();
  const rssAfter = process.memoryUsage().rss;
  const sageOracle = sageMeasurements();
  const report = {
    schema: "sagejs.benchmark/qq-sparse-random-completion-v1",
    environment: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      sage_oracle: sageOracle === null ? null : sage,
    },
    workload: {
      samples,
      policy: "one first call followed by five same-process warm samples",
      random_state: "shared deterministic Sage.js stream; no reseed between samples",
    },
    memory: {
      rss_before_bytes: rssBefore,
      rss_after_bytes: rssAfter,
      rss_delta_bytes: rssAfter - rssBefore,
      max_rss_kib: process.resourceUsage().maxRSS,
    },
    sagejs,
    sage: sageOracle,
  };

  if (check) {
    const byId = new Map(sagejs.map((entry) => [entry.id, entry]));
    const small = byId.get("QQ-small-bounds-200x300-density-.2");
    assert.ok(small);
    for (const entry of sagejs) {
      assert.ok(Number.isFinite(entry.warm_median_ms));
      assert.ok(entry.warm_median_ms > 0);
    }
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
      report.memory.rss_delta_bytes < 256 * 1024 * 1024,
      "sparse random benchmark retained more than 256 MiB",
    );
    if (sageOracle !== null) {
      const oracleById = new Map(sageOracle.map((entry) => [entry.id, entry]));
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

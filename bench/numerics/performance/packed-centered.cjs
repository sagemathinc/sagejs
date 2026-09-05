#!/usr/bin/env node
"use strict";

// Opportunity evidence for one checked arithmetic region, not describe().
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../../tools/native-kernel/compiler.cjs");
const { removeLoadedNativeCache } = require("../../../test/helpers/native-cache-cleanup.cjs");
const { repositoryIdentity, sha256 } = require("../../../scripts/numerical-computing/common.cjs");
const root = path.resolve(__dirname, "../../..");
const files = ["_packed.py", "_packed_centered.py"].map((name) =>
  path.join(root, "src/lib/sagejs/numerics/statistics", name));

function timed(call, expected) {
  for (let index = 0; index < 3; index++) assert.equal(call(), expected);
  const samples = [];
  for (let index = 0; index < 7; index++) {
    const start = performance.now();
    const answer = call();
    samples.push(performance.now() - start);
    assert.equal(answer, expected);
  }
  return { samples_ms: samples, median_ms: [...samples].sort((a, b) => a - b)[3] };
}

async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== "--output") {
    throw new Error("usage: packed-centered.cjs --output FILE");
  }
  const before = repositoryIdentity(root);
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-centered-bench-"));
  try {
    const start = performance.now();
    const artifacts = [];
    for (const sourcePath of files) artifacts.push(await compileKernel({ sourcePath, cacheRoot: cache }));
    const compilationMs = performance.now() - start;
    const sum = require(artifacts[0].modulePath).finite_sum;
    const prepare = require(artifacts[1].modulePath).prepare_centered;
    assert.equal(sum.nativeAvailable, true);
    assert.equal(prepare.nativeAvailable, true);
    const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
    const oracle = spawnSync(python, ["-I", "-c", `
import collections.abc, hashlib, json, math, platform, sys, time, typing
sys.path.insert(0, sys.argv[1])
from sagejs.numerics.statistics._core import centered_sum_squares
rows = []
for count in [1000, 20000, 100000]:
    values = [1e9 + ((index * 37) % 1000) / 10 for index in range(count)]
    def run():
        mean = math.fsum(values) / len(values)
        return centered_sum_squares(values, mean)
    expected = run()
    for _ in range(3):
        assert run() == expected
    samples = []
    for _ in range(7):
        start = time.perf_counter()
        value = run()
        samples.append((time.perf_counter() - start) * 1000)
        assert value == expected
    rows.append(dict(count=count, expected=expected, samples_ms=samples))
print(json.dumps(dict(python=platform.python_version(), rows=rows)))
`, path.join(root, "src/lib")], { cwd: root, encoding: "utf8", timeout: 120000 });
    if (oracle.error) throw oracle.error;
    assert.equal(oracle.status, 0, oracle.stderr);
    const reference = JSON.parse(oracle.stdout);
    const rows = [];
    for (const { count, expected } of reference.rows) {
      const original = Array.from({ length: count }, (_, index) => 1e9 + ((index * 37) % 1000) / 10);
      const allocate = () => ({ values: Float64Array.from(original), deviations: new Float64Array(count),
        normalized: new Float64Array(count), squares: new Float64Array(count), scratch: new Float64Array(count),
        output: new Float64Array(1), scale: new Float64Array(1) });
      const storage = allocate();
      const call = (sumFn, prepareFn, state) => {
        const total = (values) => {
          assert.equal(sumFn(values, state.scratch, state.output, count), 0);
          return state.output[0];
        };
        const mean = total(state.values) / count;
        assert.equal(prepareFn(state.values, state.deviations, state.normalized, state.squares,
          state.scale, mean, count), 0);
        const raw = total(state.squares);
        const correction = total(state.normalized);
        return (state.scale[0] * state.scale[0]) * (raw - correction * correction / count);
      };
      rows.push({ count, expected, core_calls: 4, reused_workspace_bytes: count * 8 * 5 + 16,
        native_reused: timed(() => call(sum, prepare, storage), expected),
        javascript_ir_reused: timed(() => call(sum.javascript, prepare.javascript, storage), expected),
        native_pack_allocate: timed(() => call(sum, prepare, allocate()), expected),
      });
    }
    assert.deepEqual(repositoryIdentity(root), before);
    const report = {
      schema: "sagejs.numerics.packed-centered-opportunity/v1",
      classification: "experimental-arithmetic-region-not-public-performance",
      source: before, collector_sha256: sha256(fs.readFileSync(__filename)),
      sources: files.map((file) => ({ path: path.relative(root, file), sha256: sha256(fs.readFileSync(file)) })),
      artifacts: artifacts.map((artifact) => ({ cache_key: artifact.cacheKey,
        core_sha256: sha256(fs.readFileSync(artifact.coreSourcePath)),
        addon_sha256: sha256(fs.readFileSync(artifact.addonPath)), addon_bytes: fs.statSync(artifact.addonPath).size })),
      compilation_ms: compilationMs,
      host: { platform: process.platform, architecture: process.arch, node: process.version,
        cpu: os.cpus()[0]?.model, load_average: os.loadavg() },
      policy: { warmups: 3, samples: 7, timed_scope: "mean and corrected centered sum of squares with core status checks",
        excluded: ["public ingress/conversion/budgets", "sort/quantile/MAD", "independent public validation",
          "result/trace/plots", "cold import", "peak RSS", "paired crossover and sustained reuse qualification"] },
      cpython_same_source: reference, rows,
    };
    const output = path.resolve(process.argv[3]);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    removeLoadedNativeCache(cache);
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

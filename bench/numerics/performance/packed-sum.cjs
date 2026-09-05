#!/usr/bin/env node
"use strict";

// A source-kernel opportunity measurement, never a public describe() result.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../../tools/native-kernel/compiler.cjs");
const { repositoryIdentity, sha256 } = require("../../../scripts/numerical-computing/common.cjs");

const root = path.resolve(__dirname, "../../..");
const sourcePath = path.join(root, "src/lib/sagejs/numerics/statistics/_packed.py");
const sizes = [1000, 20000, 100000];

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
    throw new Error("usage: node bench/numerics/performance/packed-sum.cjs --output FILE");
  }
  const before = repositoryIdentity(root);
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-packed-sum-bench-"));
  try {
    const start = performance.now();
    const artifact = await compileKernel({ sourcePath, cacheRoot: cache });
    const compileMs = performance.now() - start;
    const module = require(artifact.modulePath);
    assert.equal(module.finite_sum.nativeAvailable, true);
    const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
    const oracle = spawnSync(python, ["-I", "-c", `
import json, math, platform, time
records = []
for n in [1000, 20000, 100000]:
    values = [1e9 + ((i * 37) % 1000) / 10 for i in range(n)]
    expected = math.fsum(values)
    for i in range(3):
        assert math.fsum(values) == expected
    samples = []
    for i in range(7):
        start = time.perf_counter()
        answer = math.fsum(values)
        samples.append((time.perf_counter() - start) * 1000)
        assert answer == expected
    records.append(dict(count=n, expected=expected, samples_ms=samples))
print(json.dumps(dict(python=platform.python_version(), records=records)))
`], { cwd: root, encoding: "utf8", timeout: 120000 });
    if (oracle.error) throw oracle.error;
    assert.equal(oracle.status, 0, oracle.stderr);
    const reference = JSON.parse(oracle.stdout);
    const rows = [];
    for (const count of sizes) {
      const original = Array.from({ length: count }, (_, i) => 1e9 + ((i * 37) % 1000) / 10);
      const values = Float64Array.from(original);
      const scratch = new Float64Array(count);
      const output = new Float64Array(1);
      const expected = reference.records.find((row) => row.count === count).expected;
      const call = (fn, input, work, answer) => {
        assert.equal(fn(input, work, answer, count), 0);
        return answer[0];
      };
      rows.push({ count, expected,
        native_reused: timed(() => call(module.finite_sum, values, scratch, output), expected),
        javascript_ir_reused: timed(() => call(module.finite_sum.javascript, values, scratch, output), expected),
        native_pack_allocate: timed(() => call(module.finite_sum, Float64Array.from(original),
          new Float64Array(count), new Float64Array(1)), expected),
      });
    }
    assert.deepEqual(repositoryIdentity(root), before);
    const report = {
      schema: "sagejs.numerics.packed-sum-opportunity/v1",
      classification: "experimental-kernel-only-not-public-performance",
      source: before, source_sha256: sha256(fs.readFileSync(sourcePath)),
      collector_sha256: sha256(fs.readFileSync(__filename)),
      artifact: { cache_key: artifact.cacheKey, core_sha256: sha256(fs.readFileSync(artifact.coreSourcePath)),
        addon_sha256: sha256(fs.readFileSync(artifact.addonPath)),
        addon_bytes: fs.statSync(artifact.addonPath).size, compile_ms: compileMs },
      host: { platform: process.platform, architecture: process.arch, node: process.version,
        cpu: os.cpus()[0]?.model, load_average: os.loadavg() },
      policy: { warmups: 3, samples: 7, input: "finite binary64 offset corpus",
        timed_scope: "one low-level reduction with status check; copied mode adds input/scratch/output allocation",
        excluded: ["public input conversion/guards", "statistics validation/result/trace", "public sorting/MAD",
          "fresh import", "sustained allocation/peak memory", "paired crossover qualification"] },
      cpython_math_fsum: reference, rows,
    };
    const filename = path.resolve(process.argv[3]);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    fs.rmSync(cache, { recursive: true, force: true });
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

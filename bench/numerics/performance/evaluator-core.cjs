"use strict";

// Development microbenchmark, not a public solver or zero-crossing benchmark.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../../tools/native-kernel/compiler.cjs");
const { pythonPrefix } = require("./run.cjs");
const { removeLoadedNativeCache } = require("../../../test/helpers/native-cache-cleanup.cjs");
const root = path.resolve(__dirname, "../../..");
async function main() {
  const sourcePath = path.join(root, "src/lib/sagejs/numerics/_evaluation_core.py");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-evaluator-bench-"));
  try {
    const started = performance.now();
    const artifact = await compileKernel({ sourcePath, cacheRoot: directory });
    const prepareMs = performance.now() - started;
    const fn = require(artifact.modulePath).evaluate_program;
    assert.equal(fn.nativeAvailable, true);
    const args = [[1,7,0,6],[0,0,0,1],[0,0,0,2]].map(x => BigUint64Array.from(x, BigInt));
    args.push(new Float64Array([2]), new Float64Array([3]), new Float64Array(4), new Float64Array(1), 4n);
    const batch = 10000;
    const samples = { native: [], javascript: [] };
    // Alternate the order by block. Every call includes the generated host
    // adapter, validation and result transfer; buffers are prepared once.
    for (let block = 0; block < 10; block++) {
      for (const route of block % 2 ? ["javascript", "native"] : ["native", "javascript"]) {
        const call = route === "native" ? fn : fn.javascript;
        const begin = performance.now();
        let checksum = 0;
        for (let i = 0; i < batch; i++) checksum += call(...args) + args[6][0];
        const elapsed = performance.now() - begin;
        assert.equal(checksum, 7 * batch);
        if (block >= 3) samples[route].push(elapsed);
      }
    }
    const python = spawnSync(process.env.PYTHON || (process.platform === "win32" ? "python" : "python3"), ["-I", "-c", pythonPrefix(root) + `
import json, time
from sagejs.numerics._evaluation_core import evaluate_program
args = ([1,7,0,6], [0,0,0,1], [0,0,0,2], [2.0], [3.0], [0.0]*4, [0.0], 4)
samples = []
for block in range(10):
    start = time.perf_counter()
    checksum = 0.0
    for i in range(${batch}):
        checksum += evaluate_program(*args) + args[6][0]
    elapsed = (time.perf_counter() - start) * 1000
    assert checksum == ${7 * batch}
    if block >= 3:
        samples.append(elapsed)
print(json.dumps(samples))
`], { encoding: "utf8", timeout: 120000 });
    assert.equal(python.status, 0, python.stderr);
    samples.cpython = JSON.parse(python.stdout);
    console.log(JSON.stringify({ schema: "sagejs.evaluator-core-benchmark/v1",
      scope: "private-kernel-with-host-crossing-not-public-solver", batch,
      warmups: 3, samples_ms: samples, fresh_compile_ms: prepareMs,
      source_sha256: createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex"),
      host: { platform: process.platform, arch: process.arch, node: process.version, cpu: os.cpus()[0]?.model },
      gaps: ["public solver", "Wasm timings", "peak memory", "preparation crossover", "persistent-host replication"],
    }, null, 2));
  } finally { removeLoadedNativeCache(directory); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

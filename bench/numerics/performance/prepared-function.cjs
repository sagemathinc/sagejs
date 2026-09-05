"use strict";

// Development measurement of the public scalar API, not a solver target pass.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../../tools/native-kernel/compiler.cjs");
const { removeLoadedNativeCache } = require("../../../test/helpers/native-cache-cleanup.cjs");
const root = path.resolve(__dirname, "../../..");
const program = `
import json, time
from sagejs.numerics.evaluators import PreparedFunction
samples = {"native": [], "dynamic": []}
preparation = {"native": [], "dynamic": []}
routes = {}
for block in range(10):
    for backend in (["native", "dynamic"] if block % 2 else ["dynamic", "native"]):
        start = time.perf_counter()
        f = PreparedFunction("x*x-a", inputs=("x", "a"), backend=backend)
        prepared_ms = 1000*(time.perf_counter()-start)
        routes[backend] = f.to_dict()["execution_target"]
        start = time.perf_counter()
        checksum = 0.0
        for i in range(1000):
            checksum += f(3.0, 2.0)
        elapsed = 1000*(time.perf_counter()-start)
        assert checksum == 7000.0
        if block >= 3:
            samples[backend].append(elapsed)
        preparation[backend].append(prepared_ms)
        f.close()
assert routes == {"native": "native", "dynamic": "dynamic"}
print(json.dumps({"samples_ms":samples,"preparation_ms":preparation,"routes":routes}))
`;

async function main() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-prepared-benchmark-"));
  try {
    const cache = path.join(temporary, "cache");
    const start = performance.now();
    const artifact = await compileKernel({
      sourcePath: path.join(root, "src/lib/sagejs/numerics/_evaluation_core.py"),
      cacheRoot: cache,
    });
    const compileMs = performance.now() - start;
    const filename = path.join(temporary, "measurement.py");
    fs.writeFileSync(filename, program);
    const result = spawnSync(process.execPath, [
      "--require", path.join(root, "test/helpers/assert-no-exact-numerical-load.cjs"),
      path.join(root, "bin/sagejs"), "--python", filename,
    ], { cwd: root, encoding: "utf8", timeout: 120000, env: {
      ...process.env, SAGEJSPATH: path.join(root, "src/lib"),
      SAGEJS_NATIVE_CACHE_DIR: cache, SAGEJS_NATIVE_DISABLE: "0",
      SAGEJS_NATIVE_MODE: "auto", SAGEJS_NATIVE_REQUIRED: "0",
    }});
    assert.equal(result.status, 0, result.stderr + result.stdout);
    console.log(JSON.stringify({
      schema: "sagejs.prepared-function-development/v1",
      scope: "public-scalar-evaluation-not-solver", batch: 1000, warmups: 3,
      fresh_compile_ms: compileMs,
      source_sha256: Object.fromEntries([
        "src/lib/sagejs/numerics/evaluators.py",
        "src/lib/sagejs/numerics/_evaluation_core.py",
        "src/lib/sagejs/numerics/frontends/expressions.py",
      ].map(file => [file, createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex")])),
      source_dependencies: artifact.ir.nativeSourceDependencies || [],
      host: { platform: process.platform, arch: process.arch, node: process.version, cpu: os.cpus()[0]?.model },
      ...JSON.parse(result.stdout),
      gaps: ["public solver", "four-host replication", "browser", "memory", "cold process startup"],
    }, null, 2));
  } finally { removeLoadedNativeCache(temporary); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

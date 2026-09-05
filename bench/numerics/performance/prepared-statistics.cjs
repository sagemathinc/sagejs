#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../../tools/native-kernel/compiler.cjs");
const { repositoryIdentity, sha256 } = require("../../../scripts/numerical-computing/common.cjs");
const { pythonPrefix } = require("./run.cjs");
const { removeLoadedNativeCache } = require("../../../test/helpers/native-cache-cleanup.cjs");
const root = path.resolve(__dirname, "../../..");

async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== "--output") {
    throw new Error("usage: prepared-statistics.cjs --output FILE");
  }
  const output = path.resolve(process.argv[3]);
  if (fs.existsSync(output)) throw new Error("refusing to overwrite an existing measurement");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-prepared-statistics-bench-"));
  try {
    const before = repositoryIdentity(root);
    const program = fs.readFileSync(path.join(__dirname, "prepared-statistics.py"), "utf8");
    const files = ["_packed.py", "_packed_centered.py"];
    const artifacts = [];
    for (const file of files) {
      artifacts.push(await compileKernel({
        sourcePath: path.join(root, "src/lib/sagejs/numerics/statistics", file),
        cacheRoot: path.join(directory, "cache"),
      }));
    }
    const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
    const filename = path.join(directory, "run.py");
    fs.writeFileSync(filename, 'EXPECTED_NATIVE_BACKEND = "source-native"\n' + program);
    const records = [];
    for (const [runtime, command, args] of [
      ["cpython", python, ["-I", "-c", pythonPrefix(root) + '\nEXPECTED_NATIVE_BACKEND = "ordinary-python"\n' + program]],
      ["sagejs", process.execPath, [path.join(root, "bin/sagejs"), "--python", filename]],
    ]) {
      const start = performance.now();
      const result = spawnSync(command, args, {
        cwd: root, encoding: "utf8", timeout: 300000, maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, SAGEJSPATH: path.join(root, "src/lib"),
          SAGEJS_NATIVE_CACHE_DIR: path.join(directory, "cache"),
          SAGEJS_NATIVE_DISABLE: "0", SAGEJS_NATIVE_MODE: "auto", SAGEJS_NATIVE_REQUIRED: "0" },
      });
      if (result.error) throw result.error;
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const payload = JSON.parse(result.stdout.trim());
      assert.equal(payload.records.length, 6);
      records.push({ runtime, process_wall_ms: performance.now() - start, ...payload });
    }
    for (let index = 0; index < 6; index++) {
      assert.deepEqual(records[0].records[index].query.value, records[1].records[index].query.value);
      assert.deepEqual(records[0].records[index].query.validation, records[1].records[index].query.validation);
    }
    assert.deepEqual(repositoryIdentity(root), before);
    const statistics = path.join(root, "src/lib/sagejs/numerics/statistics");
    const report = {
      schema: "sagejs.prepared-statistics-development/v1",
      classification: "source-hashed-development-not-frozen-public-qualification",
      source: before,
      sources: fs.readdirSync(statistics).filter(name => name.endsWith(".py")).sort()
        .map(name => ({ path: "src/lib/sagejs/numerics/statistics/" + name,
          sha256: sha256(fs.readFileSync(path.join(statistics, name))) })),
      collector_sha256: sha256(fs.readFileSync(__filename)),
      workload_sha256: sha256(program),
      compiler_sha256: sha256(fs.readFileSync(path.join(root, "dist/compiler/compiler.js"))),
      artifacts: artifacts.map(artifact => ({ cache_key: artifact.cacheKey,
        core_sha256: sha256(fs.readFileSync(artifact.coreSourcePath)),
        addon_sha256: sha256(fs.readFileSync(artifact.addonPath)),
        addon_bytes: fs.statSync(artifact.addonPath).size })),
      host: { platform: process.platform, architecture: process.arch, node: process.version,
        cpu: os.cpus()[0]?.model, load_average: os.loadavg() },
      policy: { warmups: 3, samples: 7, observations: 20000,
        included: ["public query", "sorting/MAD", "independent validation", "structured result", "trace"],
        separate: ["copied input validation", "owned workspace preparation"],
        unmeasured: ["paired frozen-source comparison", "peak RSS", "browser/public-Wasm", "four-platform qualification", "npm/SEA"] },
      records,
    };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
    for (const batch of records) for (const record of batch.records) {
      console.log(batch.runtime, record.trace, record.route,
        "setup_ms=" + (record.setup_wall_ms ?? 0), "query_ms=" + record.query.median_ms);
    }
  } finally {
    removeLoadedNativeCache(directory);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

// sagejs-test-tier: native
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { compileKernel } = require("../../../tools/native-kernel/compiler.cjs");
const { pythonPrefix } = require("../../../bench/numerics/performance/run.cjs");
const { removeLoadedNativeCache } = require("../../helpers/native-cache-cleanup.cjs");

const root = path.resolve(__dirname, "../../..");
const source = fs.readFileSync(path.join(__dirname, "prepared-statistics.py"), "utf8");

function run(executable, args, env) {
  const result = spawnSync(executable, args, {
    cwd: root, encoding: "utf8", timeout: 180000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), "prepared statistics passed");
}

test("prepared statistics preserves CPython ownership, budgets, and fallback", () => {
  run(process.env.PYTHON || (process.platform === "win32" ? "python" : "python3"),
    ["-I", "-c", pythonPrefix(root) + '\nEXPECTED_BACKEND = "ordinary-python"\n' + source],
    { SAGEJS_NATIVE_DISABLE: "1" });
});

test("public prepared queries agree in dynamic and source-compiled Sage.js", { timeout: 420000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-prepared-statistics-"));
  try {
    const cache = path.join(directory, "cache");
    for (const file of ["../_packed_sum.py", "_packed_centered.py"]) {
      await compileKernel({ sourcePath: path.join(root, "src/lib/sagejs/numerics/statistics", file), cacheRoot: cache });
    }
    const staleCache = path.join(directory, "stale-cache");
    fs.mkdirSync(staleCache);
    const staleIndex = JSON.parse(fs.readFileSync(path.join(cache, "index.json"), "utf8"));
    for (const record of Object.values(staleIndex.sources)) record.sourceHash = "0".repeat(64);
    fs.writeFileSync(path.join(staleCache, "index.json"), JSON.stringify(staleIndex));
    for (const [mode, expected, selectedCache] of [
      ["dynamic", "ordinary-python", cache],
      ["native", "source-native", cache],
      ["javascript", "ordinary-python", cache],
      ["missing", "ordinary-python", path.join(directory, "absent-cache")],
      ["stale", "ordinary-python", staleCache],
    ]) {
      const filename = path.join(directory, mode + ".py");
      fs.writeFileSync(filename, `EXPECTED_BACKEND = ${JSON.stringify(expected)}\n` + source);
      run(process.execPath, ["--require", path.join(root, "test/helpers/assert-no-exact-numerical-load.cjs"),
        path.join(root, "bin/sagejs"), "--python", filename], {
        SAGEJSPATH: path.join(root, "src/lib"),
        SAGEJS_NATIVE_CACHE_DIR: selectedCache,
        SAGEJS_NATIVE_DISABLE: mode === "dynamic" ? "1" : "0",
        SAGEJS_NATIVE_MODE: ["dynamic", "javascript"].includes(mode) ? mode : "auto",
        SAGEJS_NATIVE_REQUIRED: "0",
      });
    }
  } finally {
    removeLoadedNativeCache(directory);
  }
});

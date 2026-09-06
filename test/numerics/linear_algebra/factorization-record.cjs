// sagejs-test-tier: integration
// sagejs-test-portable: true
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pythonPrefix } = require("../../../bench/numerics/performance/run.cjs");
const root = path.resolve(__dirname, "../../..");
test("factorization presentation is single-pass and detached in CPython and Sage.js", () => {
  const source = path.join(__dirname, "factorization-record.py");
  for (const [command, args] of [
    [process.env.PYTHON || (process.platform === "win32" ? "python" : "python3"),
      ["-I", "-c", pythonPrefix(root) + fs.readFileSync(source, "utf8")]],
    [process.execPath, ["--require", path.join(root, "test/helpers/assert-no-exact-numerical-load.cjs"),
      path.join(root, "bin/sagejs"), "--python", source]],
  ]) {
    const result = spawnSync(command, args, { cwd: root, encoding: "utf8", timeout: 120000,
      env: { ...process.env, SAGEJSPATH: path.join(root, "src/lib"), SAGEJS_NATIVE_DISABLE: "1" } });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdout.trim(), "factorization record passed");
  }
});

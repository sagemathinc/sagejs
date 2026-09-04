// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..", "..");
const suffix = process.platform === "win32" ? ".exe" : "";
const built = join(root, "build", "sea", `sagepython${suffix}`);

test("a relocated Python SEA executes explicit NLopt Nelder-Mead", {
  timeout: 120_000,
}, () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-nlopt-sea-"));
  try {
    const executable = join(temporary, `sagepython${suffix}`);
    const program = join(temporary, "nlopt.py");
    copyFileSync(built, executable);
    if (process.platform !== "win32") chmodSync(executable, 0o755);
    writeFileSync(program, [
      "from sagejs.numerics.optimization import minimize",
      "nm = minimize(lambda p: (p[0]-3.0)**2, [0.0], method='nlopt-nelder-mead')",
      "print(nm.method, nm.backend, nm.success, nm.validation.truth_level, abs(nm.value[0]-3.0) < 1e-6)",
      "",
    ].join("\n"));
    const result = spawnSync(executable, [program], {
      cwd: temporary,
      encoding: "utf8",
      timeout: 120_000,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout.trim(),
      "nlopt-nelder-mead nlopt-mit-wasm True heuristic True",
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

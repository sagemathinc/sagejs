#!/usr/bin/env node
// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { chmodSync, copyFileSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "../..");
const suffix = process.platform === "win32" ? ".exe" : "";
const built = join(root, "build", "sea", `sagepython${suffix}`);

test("the relocated Python SEA embeds and executes public cminpack", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-cminpack-sea-"));
  try {
    const executable = join(temporary, `sagepython${suffix}`);
    copyFileSync(built, executable);
    if (process.platform !== "win32") chmodSync(executable, 0o755);
    const program = join(temporary, "cminpack.py");
    writeFileSync(program, [
      "from sagejs.numerics.optimization import least_squares",
      "def residual(point):",
      "    x, y = point",
      "    return [10.0 * (y - x*x), 1.0 - x]",
      "answer = least_squares(residual, [-1.2, 1.0], method='cminpack-lmdif')",
      "print(answer.method)",
      "print(answer.backend)",
      "print(answer.success and answer.validation.passed)",
      "print(max(abs(answer.value[0]-1.0), abs(answer.value[1]-1.0)) < 1.0e-8)",
      "",
    ].join("\n"));
    const result = spawnSync(executable, [program], {
      cwd: temporary,
      encoding: "utf8",
      timeout: 120_000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(
      result.stdout.trim(),
      "cminpack-lmdif\ncminpack-wasm\nTrue\nTrue",
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { existsSync, mkdirSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const target = join(root, "build", "pytest-9.1.1-site-packages");
const manifest = join(target, ".sagejs-installed", "pytest.json");

function runPytest(fixture) {
  return spawnSync(
    process.execPath,
    [join(root, "bin", "sagejs-source.cjs"), "pytest", fixture],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, SAGEJS_SITE_PACKAGES: target },
    },
  );
}

async function main() {
  mkdirSync(target, { recursive: true });
  if (!existsSync(manifest)) {
    const { runPackageCli } = require("../dist/tools/python-packages.js");
    await runPackageCli({
      files: ["install", "pytest==9.1.1"],
      target,
    });
  }

  const passing = runPytest("test/fixtures/test_pytest_compat_pass.py");
  assert.equal(passing.status, 0, passing.stderr || passing.stdout);
  assert.match(passing.stdout, /4 passed/);

  const failing = runPytest("test/fixtures/test_pytest_compat_fail.py");
  assert.equal(failing.status, 1, failing.stderr || failing.stdout);
  assert.match(failing.stdout, /1 failed/);
  assert.match(failing.stdout, /test_failure_is_reported/);

  process.stdout.write(
    "Unmodified pytest fixtures, parametrization, raises, approx, and failure reporting passed.\n",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

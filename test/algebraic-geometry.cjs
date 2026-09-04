#!/usr/bin/env node
// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { join } = require("node:path");
const test = require("node:test");

const execFileAsync = promisify(execFile);
const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const fixtures = [
  "algebraic-geometry-polynomial.py",
  "algebraic-geometry-ideals.py",
  "algebraic-geometry-affine.py",
  "algebraic-geometry-projective.py",
  "algebraic-geometry-morphisms.py",
  "algebraic-geometry-jacobian.py",
  "algebraic-geometry-curves.py",
  "algebraic-geometry-zero-dimensional.py",
  "algebraic-geometry-metamorphic.py",
];

async function runFixture(filename) {
  try {
    await execFileAsync(process.execPath, [sagejs, join(__dirname, filename)], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
      maxBuffer: 8 * 1024 * 1024,
      timeout: 180_000,
    });
  } catch (error) {
    assert.fail(
      `${filename} failed\n${error.stdout ?? ""}\n${error.stderr ?? ""}\n${error}`,
    );
  }
}

test("portable full-runtime algebraic geometry fixtures", { timeout: 600_000 }, async () => {
  let next = 0;
  async function worker() {
    while (next < fixtures.length) {
      const filename = fixtures[next++];
      await runFixture(filename);
    }
  }
  await Promise.all([worker(), worker()]);
});

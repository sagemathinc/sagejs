#!/usr/bin/env node
// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const {
  SUPPORTED_TARGETS,
  assertArchiveLayout,
  fileDependency,
  resolveTarget,
  runInstalledNode,
  runRelocatedSeaLanguage,
  targetForHost,
} = require("../../scripts/package-qualification/runtime.cjs");
const {
  MARKER,
  numericalSmokeSource,
  parseNumericalSmoke,
} = require("../../scripts/package-qualification/numerical-smoke.cjs");

test("release targets map to native Node identities and packages", () => {
  assert.deepEqual(Object.keys(SUPPORTED_TARGETS), [
    "linux-x64",
    "linux-arm64",
    "macos-arm64",
    "windows-x64",
  ]);
  assert.equal(targetForHost("linux", "arm64"), "linux-arm64");
  assert.equal(targetForHost("darwin", "arm64"), "macos-arm64");
  assert.equal(targetForHost("win32", "x64"), "windows-x64");
  assert.equal(targetForHost("darwin", "x64"), undefined);
  assert.equal(
    resolveTarget("windows-x64", {
      platform: "win32",
      arch: "x64",
    }).packageName,
    "@sagemath/sagejs-win32-x64",
  );
  assert.throws(
    () => resolveTarget("windows-x64", { platform: "linux", arch: "x64" }),
    /cannot execute windows-x64 package artifacts on linux-x64/,
  );
  assert.throws(() => resolveTarget("plan9-x64"), /unsupported/);
});

test("package file dependencies use portable absolute file URLs", () => {
  const value = fileDependency(join(tmpdir(), "archive with space.tgz"));
  assert.match(value, /^file:\/\//);
  assert.match(value, /archive%20with%20space\.tgz$/);
});

test("archive checks require numerical resources and target executables", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-package-layout-"));
  try {
    const root = join(temporary, "root");
    const platform = join(temporary, "platform");
    for (const filename of [
      "dist/numerical/backend.cjs",
      "dist/numerical/cminpack.wasm",
      "dist/numerical/nlopt-backend.cjs",
      "dist/numerical/nlopt-methods.wasm",
    ]) {
      const output = join(root, "package", filename);
      mkdirSync(join(output, ".."), { recursive: true });
      writeFileSync(output, filename);
    }
    for (const filename of ["sagejs.exe", "sagepython.exe"]) {
      const output = join(platform, "package", "bin", filename);
      mkdirSync(join(output, ".."), { recursive: true });
      writeFileSync(output, filename);
    }
    const rootArchive = join(temporary, "root.tgz");
    const platformArchive = join(temporary, "platform.tgz");
    execFileSync("tar", ["-czf", rootArchive, "package"], { cwd: root });
    execFileSync("tar", ["-czf", platformArchive, "package"], { cwd: platform });
    assertArchiveLayout(rootArchive, platformArchive, "windows-x64");
    rmSync(join(root, "package", "dist", "numerical", "nlopt-methods.wasm"));
    execFileSync("tar", ["-czf", rootArchive, "package"], { cwd: root });
    assert.throws(
      () => assertArchiveLayout(rootArchive, platformArchive, "windows-x64"),
      /nlopt-methods/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("the representative smoke covers ordinary Python and both lazy backends", () => {
  const source = numericalSmokeSource();
  assert.match(source, /method="brent"/);
  assert.match(source, /method="cminpack-lmdif"/);
  assert.match(source, /method="nlopt-nelder-mead"/);
  const payload = {
    least_squares: "cminpack-lmdif",
    minimize: "nlopt-nelder-mead",
    root: "brent",
    truth_levels: [
      "validated_approximate",
      "validated_approximate",
      "validated_approximate",
    ],
  };
  assert.deepEqual(
    parseNumericalSmoke({
      status: 0,
      stdout: `noise\n${MARKER}${JSON.stringify(payload)}\n`,
      stderr: "",
    }),
    payload,
  );
  assert.throws(
    () => parseNumericalSmoke({ status: 0, stdout: "", stderr: "" }),
    /missing numerical smoke marker/,
  );
});

test("the installed Node hook is isolated, machine-readable, and stdin-safe", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-package-node-hook-"));
  try {
    const installedRoot = join(temporary, "node_modules", "@sagemath", "sagejs");
    mkdirSync(installedRoot, { recursive: true });
    const result = runInstalledNode(
      { directory: temporary, installedRoot },
      [
        'const { readFileSync } = require("node:fs");',
        "process.stdout.write(JSON.stringify({",
        "  input: readFileSync(0, 'utf8'),",
        "  root: process.env.SAGEJS_QUALIFICATION_INSTALLED_ROOT,",
        "}));",
      ].join("\n"),
      { input: "target-side callback" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      input: "target-side callback",
      root: installedRoot,
    });
    assert.ok(result.elapsedMs >= 0);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  assert.throws(
    () => runRelocatedSeaLanguage({}, "", "octave"),
    /unsupported qualification language/,
  );
});

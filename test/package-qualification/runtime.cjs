#!/usr/bin/env node
// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
  prepareFreshInstall,
  resolveTarget,
  runInstalledNode,
  runProcess,
  runRelocatedSeaLanguage,
  targetForHost,
} = require("../../scripts/package-qualification/runtime.cjs");
const {
  MARKER,
  numericalSmokeSource,
  parseNumericalSmoke,
} = require("../../scripts/package-qualification/numerical-smoke.cjs");
const {
  cleanupQualification,
} = require("../../scripts/test-npm-package.cjs");

function writeFixtureFile(root, filename) {
  const output = join(root, "package", filename);
  mkdirSync(join(output, ".."), { recursive: true });
  writeFileSync(output, filename);
}

function pack(directory, archive) {
  execFileSync("tar", ["-czf", archive, "package"], { cwd: directory });
}

function createArchives(temporary, targetName) {
  const target = SUPPORTED_TARGETS[targetName];
  const version = "1.2.3";
  const root = join(temporary, "root");
  const platform = join(temporary, "platform");
  for (const filename of [
    "dist/numerical/backend.cjs",
    "dist/numerical/cminpack.wasm",
    "dist/numerical/nlopt-backend.cjs",
    "dist/numerical/nlopt-methods.wasm",
  ]) {
    writeFixtureFile(root, filename);
  }
  const rootManifest = {
    name: "@sagemath/sagejs",
    version,
    optionalDependencies: { [target.packageName]: version },
  };
  writeFileSync(
    join(root, "package", "package.json"),
    JSON.stringify(rootManifest),
  );

  for (const name of ["sagejs", "sagepython"]) {
    writeFixtureFile(platform, `bin/${name}${target.executableSuffix}`);
  }
  const platformManifest = {
    name: target.packageName,
    version,
    os: [target.os],
    cpu: [target.arch],
    bin: {
      [`sagejs-${targetName}`]: `bin/sagejs${target.executableSuffix}`,
      [`sagepython-${targetName}`]: `bin/sagepython${target.executableSuffix}`,
    },
  };
  if (target.libc) platformManifest.libc = [target.libc];
  writeFileSync(
    join(platform, "package", "package.json"),
    JSON.stringify(platformManifest),
  );

  const rootArchive = join(temporary, "root.tgz");
  const platformArchive = join(temporary, "platform.tgz");
  pack(root, rootArchive);
  pack(platform, platformArchive);
  return {
    platform,
    platformArchive,
    platformManifest,
    root,
    rootArchive,
    rootManifest,
  };
}

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

test("archive checks require the root platform edge and exact target metadata", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-package-layout-"));
  try {
    const fixture = createArchives(temporary, "windows-x64");
    const {
      platform,
      platformArchive,
      platformManifest,
      root,
      rootArchive,
      rootManifest,
    } = fixture;
    assertArchiveLayout(rootArchive, platformArchive, "windows-x64");

    delete rootManifest.optionalDependencies["@sagemath/sagejs-win32-x64"];
    writeFileSync(
      join(root, "package", "package.json"),
      JSON.stringify(rootManifest),
    );
    pack(root, rootArchive);
    assert.throws(
      () => assertArchiveLayout(rootArchive, platformArchive, "windows-x64"),
      /must declare exact optional dependency/,
    );

    rootManifest.optionalDependencies["@sagemath/sagejs-win32-x64"] =
      rootManifest.version;
    writeFileSync(
      join(root, "package", "package.json"),
      JSON.stringify(rootManifest),
    );
    pack(root, rootArchive);
    platformManifest.cpu = ["arm64"];
    writeFileSync(
      join(platform, "package", "package.json"),
      JSON.stringify(platformManifest),
    );
    pack(platform, platformArchive);
    assert.throws(
      () => assertArchiveLayout(rootArchive, platformArchive, "windows-x64"),
      /Expected values to be strictly deep-equal/,
    );

    platformManifest.cpu = ["x64"];
    writeFileSync(
      join(platform, "package", "package.json"),
      JSON.stringify(platformManifest),
    );
    pack(platform, platformArchive);
    rmSync(join(root, "package", "dist", "numerical", "nlopt-methods.wasm"));
    pack(root, rootArchive);
    assert.throws(
      () => assertArchiveLayout(rootArchive, platformArchive, "windows-x64"),
      /nlopt-methods/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("failed owned installs remove their temporary consumer", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-package-cleanup-"));
  let consumer;
  try {
    const target = targetForHost();
    assert.ok(target, `unsupported test host ${process.platform}-${process.arch}`);
    const fixture = createArchives(temporary, target);
    assert.throws(
      () =>
        prepareFreshInstall({
          target,
          rootArchive: fixture.rootArchive,
          platformArchive: fixture.platformArchive,
          installRunner(_args, options) {
            consumer = options.cwd;
            const manifest = JSON.parse(
              readFileSync(join(consumer, "package.json"), "utf8"),
            );
            assert.deepEqual(Object.keys(manifest.dependencies), [
              "@sagemath/sagejs",
            ]);
            throw new Error("intentional install failure");
          },
        }),
      /intentional install failure/,
    );
    assert.ok(consumer);
    assert.equal(existsSync(consumer), false);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("keep retains only the named consumer and always removes relocation", () => {
  const calls = [];
  cleanupQualification({
    install: {
      directory: "consumer-directory",
      cleanup() {
        calls.push("install");
      },
    },
    relocated: {
      cleanup() {
        calls.push("relocated");
      },
    },
    keep: true,
    log(message) {
      calls.push(message);
    },
  });
  assert.deepEqual(calls, [
    "relocated",
    "Kept package qualification directory: consumer-directory",
  ]);
});

test("process timeout terminates descendants, not only their parent", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-process-tree-"));
  try {
    const sentinel = join(temporary, "descendant-survived");
    const descendant = [
      'const { writeFileSync } = require("node:fs");',
      `setTimeout(() => writeFileSync(${JSON.stringify(sentinel)}, "alive"), 700);`,
      "setInterval(() => {}, 1000);",
    ].join("\n");
    const parent = [
      'const { spawn } = require("node:child_process");',
      `spawn(process.execPath, ["-e", ${JSON.stringify(descendant)}], { stdio: "ignore" });`,
      "setInterval(() => {}, 1000);",
    ].join("\n");
    const result = runProcess(process.execPath, ["-e", parent], { timeout: 150 });
    assert.equal(result.timedOut, true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    assert.equal(existsSync(sentinel), false);
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

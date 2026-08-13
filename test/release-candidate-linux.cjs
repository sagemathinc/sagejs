"use strict";

const assert = require("node:assert/strict");
const {
  chmodSync,
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
  artifactMetadata,
  isolatedEnvironment,
  median,
  packageReleaseCandidate,
  parseArguments,
  treeUsage,
} = require("../scripts/release-candidate-linux.cjs");

test("Linux release arguments have explicit artifact and sample controls", () => {
  const parsed = parseArguments([
    "--math",
    "./math",
    "--python",
    "./python",
    "--output",
    "./report.json",
    "--warm-samples",
    "5",
    "--keep",
  ]);
  assert.match(parsed.math, /\/math$/);
  assert.match(parsed.python, /\/python$/);
  assert.match(parsed.output, /\/report\.json$/);
  assert.equal(parsed.warmSamples, 5);
  assert.equal(parsed.keep, true);
  assert.throws(
    () => parseArguments(["--warm-samples", "0"]),
    /positive integer/,
  );
  assert.throws(() => parseArguments(["--unknown"]), /unknown argument/);
});

test("release timing median handles odd and even observations", () => {
  assert.equal(median([7, 1, 3]), 3);
  assert.equal(median([7, 1, 3, 5]), 4);
  assert.throws(() => median([]), /median of no samples/);
});

test("isolated release environment has no Node or package-manager path", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-rc-env-test-"));
  const previousDisable = process.env.SAGEJS_NATIVE_DISABLE;
  try {
    process.env.SAGEJS_NATIVE_DISABLE = "1";
    const environment = isolatedEnvironment(directory, { EXTRA: "present" });
    assert.equal(environment.HOME, join(directory, "home"));
    assert.equal(environment.XDG_CACHE_HOME, join(directory, "cache"));
    assert.equal(environment.PATH, join(directory, "empty-path"));
    assert.equal(environment.EXTRA, "present");
    assert.equal(environment.NODE_PATH, undefined);
    assert.equal(environment.SAGEJS_NATIVE_DISABLE, undefined);
  } finally {
    if (previousDisable === undefined) delete process.env.SAGEJS_NATIVE_DISABLE;
    else process.env.SAGEJS_NATIVE_DISABLE = previousDisable;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("artifact evidence records stable bytes, mode, hash, and cache usage", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-rc-evidence-test-"));
  try {
    const artifact = join(directory, "sagejs");
    writeFileSync(artifact, "release artifact\n", { mode: 0o755 });
    mkdirSync(join(directory, "cache"));
    writeFileSync(join(directory, "cache", "entry"), "cached\n");
    assert.deepEqual(treeUsage(join(directory, "cache")), {
      bytes: 7,
      files: 1,
    });
    const metadata = artifactMetadata(artifact);
    assert.equal(metadata.bytes, 17);
    assert.equal(metadata.filename, "sagejs");
    assert.equal(metadata.mode, "755");
    assert.equal(metadata.sha256.length, 64);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Linux release archive is deterministic and installer-compatible", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-rc-package-test-"));
  try {
    const math = join(directory, "math");
    const python = join(directory, "python");
    for (const filename of [math, python]) {
      writeFileSync(filename, "#!/bin/sh\nexit 0\n");
      chmodSync(filename, 0o755);
    }
    const options = { math, python, releaseDirectory: join(directory, "release") };
    const first = packageReleaseCandidate(options);
    const firstBytes = readFileSync(first.archive);
    const firstChecksum = readFileSync(first.archiveChecksum, "utf8");
    const second = packageReleaseCandidate(options);
    assert.deepEqual(readFileSync(second.archive), firstBytes);
    assert.equal(readFileSync(second.archiveChecksum, "utf8"), firstChecksum);
    assert.match(firstChecksum, /^[0-9a-f]{64}  sagejs-linux-x64\.tar\.xz\n$/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

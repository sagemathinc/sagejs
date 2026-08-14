"use strict";

const assert = require("node:assert/strict");
const {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const { createBuildManifest, serialize } = require("../scripts/release-manifest.cjs");
const { nativeMathBuildProfile } = require("../scripts/native-math-profile.cjs");

const {
  artifactMetadata,
  assertEmptyTemporary,
  assertStableUsage,
  atomicWrite,
  fixedEnvironment,
  installerEnvironment,
  isolatedEnvironment,
  median,
  packageReleaseCandidate,
  parseArguments,
  publishReleaseCandidate,
  publishValidatedReleaseCandidate,
  runInstaller,
  treeUsage,
  validateExecutableReceipts,
  validateEmbeddedExecutable,
} = require("../scripts/release-candidate-linux.cjs");

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const TREE = "89abcdef0123456789abcdef0123456789abcdef";

function writeReceipts(directory, nativeMathProfile = undefined) {
  const target = {
    arch: "x64",
    endianness: "LE",
    libc: { family: "glibc", version: "2.28" },
    nodeAbi: "141",
    nodeNapi: "10",
    platform: "linux",
    wordBits: 64,
  };
  const source = {
    commit: COMMIT,
    contentSha256: "a".repeat(64),
    dirty: false,
    kind: "git-clean",
    tree: TREE,
  };
  const profile = nativeMathProfile || nativeMathBuildProfile({
    arch: "x64",
    compiler: { command: "cc", nativeFlag: null, version: "fixture" },
    cxxCompiler: { command: "c++", nativeFlag: null, version: "fixture" },
    endianness: "LE",
    environment: {},
    platform: "linux",
    requestedProfile: "portable",
  });
  const receipt = (nativeMathematics) => createBuildManifest({
    capabilities: {
      artifact: { kind: "single-executable", nativeMathematics },
      embeddedAssets: { assets: {}, schema: "sagejs.embedded-assets/v1" },
      nativeKernels: nativeMathematics ? { fixture: true } : null,
    },
    sagejsVersion: require("../package.json").version,
    source,
    target,
    toolchain: {
      nativeMathProfile: nativeMathematics ? profile : null,
      seaNode: { executableSha256: "b".repeat(64), version: "26.7.0" },
    },
  });
  const mathReceipt = join(directory, "sagejs-build-manifest.json");
  const pythonReceipt = join(directory, "sagepython-build-manifest.json");
  writeFileSync(mathReceipt, serialize(receipt(true)));
  writeFileSync(pythonReceipt, serialize(receipt(false)));
  return { mathReceipt, pythonReceipt };
}

function writeBaselineReceipt(directory, files) {
  const baselineReceipt = join(directory, "linux-baseline-receipt.json");
  const artifacts = Object.fromEntries([
    ["sea/sagejs", files.math],
    ["sea/sagejs-build-manifest.json", files.mathReceipt],
    ["sea/sagepython", files.python],
    ["sea/sagepython-build-manifest.json", files.pythonReceipt],
  ].map(([name, filename]) => [name, artifactMetadata(filename)]));
  writeFileSync(baselineReceipt, `${JSON.stringify({
    inspection: { aggregate: { dependencies: [] } },
    nodeVersion: "26.7.0",
    platform: "linux-x64",
    schema: "sagejs.linux-baseline-receipt-v1",
    seaArtifacts: {
      artifacts,
      nodeVersion: "26.7.0",
      platform: "linux-x64",
      schema: "sagejs.linux-baseline-sea-artifacts-v1",
      sourceCommit: COMMIT,
    },
    sourceCommit: COMMIT,
  }, null, 2)}\n`);
  return baselineReceipt;
}

test("Linux release arguments have explicit artifact and sample controls", () => {
  const parsed = parseArguments([
    "--baseline-receipt",
    "./baseline-receipt.json",
    "--math",
    "./math",
    "--python",
    "./python",
    "--math-receipt",
    "./math-receipt.json",
    "--python-receipt",
    "./python-receipt.json",
    "--output",
    "./report.json",
    "--warm-samples",
    "5",
    "--keep",
  ]);
  assert.match(parsed.math, /\/math$/);
  assert.match(parsed.baselineReceipt, /\/baseline-receipt\.json$/);
  assert.match(parsed.python, /\/python$/);
  assert.match(parsed.mathReceipt, /\/math-receipt\.json$/);
  assert.match(parsed.pythonReceipt, /\/python-receipt\.json$/);
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

test("release environments strictly allowlist variables", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-rc-env-test-"));
  try {
    const environment = isolatedEnvironment(directory, {
      SAGEJS_NATIVE_REQUIRED: "1",
    });
    assert.equal(environment.HOME, join(directory, "home"));
    assert.equal(environment.XDG_CACHE_HOME, join(directory, "cache"));
    assert.equal(environment.PATH, join(directory, "empty-path"));
    assert.equal(environment.SAGEJS_NATIVE_REQUIRED, "1");
    assert.equal(environment.NODE_PATH, undefined);
    assert.equal(environment.SAGEJS_NATIVE_DISABLE, undefined);
    assert.equal(environment.LD_PRELOAD, undefined);
    assert.equal(environment.LD_LIBRARY_PATH, undefined);
    assert.equal(environment.BASH_ENV, undefined);
    assert.equal(environment.ENV, undefined);
    assert.equal(environment.PYTHONPATH, undefined);
    assert.equal(environment.TAR_OPTIONS, undefined);
    assert.equal(environment.XZ_OPT, undefined);
    assert.throws(
      () => isolatedEnvironment(directory, { LD_PRELOAD: "/evil.so" }),
      /unsupported isolated runtime variable/,
    );
    const installer = installerEnvironment(join(directory, "installer"), {
      downloadBaseUrl: "file:///fixture",
      installDirectory: join(directory, "installed"),
    });
    assert.equal(installer.PATH, "/usr/bin:/bin");
    assert.equal(installer.LD_PRELOAD, undefined);
    assert.equal(installer.TAR_OPTIONS, undefined);
    assert.deepEqual(fixedEnvironment(), {
      LANG: "C",
      LC_ALL: "C",
      PATH: "/usr/bin:/bin",
      TZ: "UTC",
    });
  } finally {
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
    const link = join(directory, "artifact-link");
    symlinkSync("sagejs", link);
    assert.deepEqual(artifactMetadata(link), {
      ...metadata,
      filename: "artifact-link",
      symbolicLink: "sagejs",
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Linux release archive is deterministic and installer-compatible", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-rc-package-test-"));
  const ambient = {
    BASH_ENV: process.env.BASH_ENV,
    ENV: process.env.ENV,
    TAR_OPTIONS: process.env.TAR_OPTIONS,
    XZ_OPT: process.env.XZ_OPT,
  };
  const previousUmask = process.umask();
  try {
    const math = join(directory, "math");
    const python = join(directory, "python");
    for (const filename of [math, python]) {
      writeFileSync(filename, "#!/bin/sh\nexit 0\n");
      chmodSync(filename, 0o755);
    }
    const receipts = writeReceipts(directory);
    receipts.baselineReceipt = writeBaselineReceipt(directory, {
      math,
      python,
      ...receipts,
    });
    const options = {
      math,
      python,
      ...receipts,
      releaseDirectory: join(directory, "release"),
    };
    process.env.BASH_ENV = join(directory, "hostile-bash-env");
    process.env.ENV = join(directory, "hostile-env");
    process.env.TAR_OPTIONS = "--exclude=sagepython";
    process.env.XZ_OPT = "-0";
    process.umask(0o077);
    const packagingInternals = {
      validateEmbeddedExecutable: () => ({ fixture: true }),
    };
    const first = packageReleaseCandidate(options, packagingInternals);
    const firstBytes = readFileSync(first.archive);
    const firstChecksum = readFileSync(first.archiveChecksum, "utf8");
    process.umask(0o022);
    process.env.TAR_OPTIONS = "--exclude=LICENSE";
    process.env.XZ_OPT = "-9";
    const second = packageReleaseCandidate(options, packagingInternals);
    assert.deepEqual(readFileSync(second.archive), firstBytes);
    assert.equal(readFileSync(second.archiveChecksum, "utf8"), firstChecksum);
    assert.match(firstChecksum, /^[0-9a-f]{64}  sagejs-linux-x64\.tar\.xz\n$/);
    assert.equal(readdirSync(options.releaseDirectory).some((name) =>
      name.startsWith(".sagejs-")), false);
  } finally {
    process.umask(previousUmask);
    for (const [name, value] of Object.entries(ambient)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

test("build receipts are canonical, target-specific, and source-aligned", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-rc-receipt-test-"));
  try {
    const receipts = writeReceipts(directory);
    const validated = validateExecutableReceipts(receipts);
    assert.equal(validated.math.capabilities.artifact.nativeMathematics, true);
    assert.equal(validated.python.capabilities.artifact.nativeMathematics, false);
    const python = JSON.parse(readFileSync(receipts.pythonReceipt, "utf8"));
    python.source.commit = "f".repeat(40);
    // Recompute a valid identity to prove the cross-executable source check is
    // independent of each individual receipt's canonical validation.
    const changed = createBuildManifest({
      capabilities: python.capabilities,
      sagejsVersion: python.sagejsVersion,
      source: python.source,
      target: python.target,
      toolchain: python.toolchain,
    });
    writeFileSync(receipts.pythonReceipt, serialize(changed));
    assert.throws(
      () => validateExecutableReceipts(receipts),
      /different source identities/,
    );

    const alignedDirectory = join(directory, "aligned");
    mkdirSync(alignedDirectory);
    const aligned = writeReceipts(alignedDirectory);
    const math = JSON.parse(readFileSync(aligned.mathReceipt, "utf8"));
    math.target.libc.version = "2.38";
    writeFileSync(aligned.mathReceipt, serialize(createBuildManifest({
      capabilities: math.capabilities,
      sagejsVersion: math.sagejsVersion,
      source: math.source,
      target: math.target,
      toolchain: math.toolchain,
    })));
    assert.doesNotThrow(() => validateExecutableReceipts(aligned));

    const mismatched = JSON.parse(readFileSync(aligned.pythonReceipt, "utf8"));
    mismatched.target.nodeAbi = "142";
    writeFileSync(aligned.pythonReceipt, serialize(createBuildManifest({
      capabilities: mismatched.capabilities,
      sagejsVersion: mismatched.sagejsVersion,
      source: mismatched.source,
      target: mismatched.target,
      toolchain: mismatched.toolchain,
    })));
    assert.throws(
      () => validateExecutableReceipts(aligned),
      /different runtime target identities/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("embedded executable reports the exact sidecar receipt", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-rc-embedded-test-"));
  try {
    const receipts = writeReceipts(directory);
    const manifest = JSON.parse(readFileSync(receipts.mathReceipt, "utf8"));
    const executable = join(directory, "sagejs");
    writeFileSync(
      executable,
      `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(JSON.stringify({
        artifact: { kind: "single-executable" },
        buildReceipt: {
          availability: "available",
          manifest,
          source: "embedded",
        },
      }))});\n`,
      { mode: 0o755 },
    );
    assert.equal(
      validateEmbeddedExecutable(executable, manifest).artifact.kind,
      "single-executable",
    );
    assert.throws(
      () => validateEmbeddedExecutable(executable, { ...manifest, sagejsVersion: "0" }),
      /embedded receipt does not match its sidecar/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("atomic publication and reports leave only complete final files", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-rc-publish-test-"));
  try {
    const source = join(directory, "candidate.tar.xz");
    writeFileSync(source, "first archive\n");
    const published = publishReleaseCandidate(source, join(directory, "release"));
    assert.equal(readFileSync(published.archive, "utf8"), "first archive\n");
    assert.match(
      readFileSync(published.archiveChecksum, "utf8"),
      /^[0-9a-f]{64}  sagejs-linux-x64\.tar\.xz\n$/,
    );
    writeFileSync(source, "second archive\n");
    publishReleaseCandidate(source, join(directory, "release"));
    assert.equal(readFileSync(published.archive, "utf8"), "second archive\n");
    assert.equal(
      readdirSync(join(directory, "release")).some((name) =>
        name.startsWith(".sagejs-")),
      false,
    );
    const report = join(directory, "reports", "candidate.json");
    atomicWrite(report, "{\"ok\":true}\n");
    assert.equal(readFileSync(report, "utf8"), "{\"ok\":true}\n");
    assert.equal(
      readdirSync(join(directory, "reports")).some((name) =>
        name.startsWith(".sagejs-")),
      false,
    );
    const releaseDirectory = join(directory, "validated");
    const validated = publishValidatedReleaseCandidate(
      source,
      releaseDirectory,
      { ok: true },
    );
    assert.equal(validated.readinessRecord.schema, "sagejs.linux-release-readiness/v1");
    assert.deepEqual(
      JSON.parse(readFileSync(validated.readiness, "utf8")),
      validated.readinessRecord,
    );
    assert.throws(
      () => publishValidatedReleaseCandidate(
        source,
        releaseDirectory,
        { ok: false },
        { beforeReady: () => { throw new Error("report destination failed"); } },
      ),
      /report destination failed/,
    );
    assert.equal(
      existsSync(join(releaseDirectory, "sagejs-linux-x64.release.json")),
      false,
      "failed publication retained a readiness marker",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("installer rejects corruption without damage and atomically upgrades", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-rc-installer-test-"));
  try {
    const math = join(directory, "sagejs-input");
    const python = join(directory, "sagepython-input");
    writeFileSync(
      math,
      "#!/bin/sh\nif [ \"${1:-}\" = --version ]; then echo 'sagejs 0.2.0'; fi\n",
      { mode: 0o755 },
    );
    writeFileSync(python, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const receipts = writeReceipts(directory);
    receipts.baselineReceipt = writeBaselineReceipt(directory, {
      math,
      python,
      ...receipts,
    });
    const candidate = packageReleaseCandidate(
      {
        math,
        python,
        ...receipts,
        releaseDirectory: join(directory, "download"),
      },
      { validateEmbeddedExecutable: () => ({ fixture: true }) },
    );
    const installed = join(directory, "installed");

    const corrupt = join(directory, "corrupt");
    mkdirSync(corrupt);
    const archiveName = "sagejs-linux-x64.tar.xz";
    copyFileSync(candidate.archive, join(corrupt, archiveName));
    writeFileSync(
      join(corrupt, `${archiveName}.sha256`),
      `${"0".repeat(64)}  ${archiveName}\n`,
    );
    const failed = runInstaller(
      corrupt,
      installed,
      join(directory, "failed-state"),
      directory,
    );
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /SHA-256 verification failed/);
    assert.equal(existsSync(installed), false);

    const upgraded = runInstaller(
      join(directory, "download"),
      installed,
      join(directory, "upgrade-state"),
      directory,
    );
    assert.equal(upgraded.status, 0, upgraded.stderr || upgraded.stdout);
    assert.equal(readFileSync(join(installed, "sagejs"), "utf8"), readFileSync(math, "utf8"));
    assert.equal(
      readFileSync(join(installed, "sagepython"), "utf8"),
      readFileSync(python, "utf8"),
    );
    assert.equal(lstatSync(join(installed, "sagejs")).isSymbolicLink(), true);
    assert.equal(lstatSync(join(installed, "sagepython")).isSymbolicLink(), true);
    unlinkSync(join(installed, "sagepython"));
    const repairedLaunchers = runInstaller(
      join(directory, "download"),
      installed,
      join(directory, "launcher-repair-state"),
      directory,
    );
    assert.equal(
      repairedLaunchers.status,
      0,
      repairedLaunchers.stderr || repairedLaunchers.stdout,
    );
    assert.equal(lstatSync(join(installed, "sagepython")).isSymbolicLink(), true);

    const generationLink = readlinkSync(join(installed, ".sagejs-current"));
    const generation = join(installed, generationLink);
    writeFileSync(join(generation, "sagepython"), "corrupt generation\n", {
      mode: 0o755,
    });
    const repairedGeneration = runInstaller(
      join(directory, "download"),
      installed,
      join(directory, "generation-repair-state"),
      directory,
    );
    assert.equal(
      repairedGeneration.status,
      0,
      repairedGeneration.stderr || repairedGeneration.stdout,
    );
    assert.notEqual(readlinkSync(join(installed, ".sagejs-current")), generationLink);
    assert.equal(
      readFileSync(join(installed, "sagepython"), "utf8"),
      readFileSync(python, "utf8"),
    );
    const activeGeneration = readFileSync(
      join(installed, ".sagejs-current", "sagejs"),
      "utf8",
    );
    writeFileSync(
      math,
      "#!/bin/sh\nif [ \"${1:-}\" = --version ]; then echo 'sagejs 0.2.1'; fi\n",
      { mode: 0o755 },
    );
    writeFileSync(python, "#!/bin/sh\necho upgraded-python\n", { mode: 0o755 });
    receipts.baselineReceipt = writeBaselineReceipt(directory, {
      math,
      python,
      ...receipts,
    });
    packageReleaseCandidate(
      {
        math,
        python,
        ...receipts,
        releaseDirectory: join(directory, "download"),
      },
      { validateEmbeddedExecutable: () => ({ fixture: true }) },
    );
    const interrupted = runInstaller(
      join(directory, "download"),
      installed,
      join(directory, "interrupted-state"),
      directory,
      { SAGEJS_INSTALL_FAIL_BEFORE_SWITCH: "1" },
    );
    assert.notEqual(interrupted.status, 0);
    assert.match(interrupted.stderr, /injected failure/);
    assert.equal(
      readFileSync(join(installed, ".sagejs-current", "sagejs"), "utf8"),
      activeGeneration,
    );
    const completedUpgrade = runInstaller(
      join(directory, "download"),
      installed,
      join(directory, "completed-upgrade-state"),
      directory,
    );
    assert.equal(
      completedUpgrade.status,
      0,
      completedUpgrade.stderr || completedUpgrade.stdout,
    );
    assert.notEqual(
      readFileSync(join(installed, ".sagejs-current", "sagejs"), "utf8"),
      activeGeneration,
    );
    assert.match(
      readFileSync(join(installed, "sagepython"), "utf8"),
      /upgraded-python/,
    );
    assert.equal(
      readdirSync(installed).some((name) =>
        /^\.sagejs-current\.\d+$|\.link\.\d+$/.test(name)),
      false,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cache and temporary gates reject unbounded or residual state", () => {
  assert.doesNotThrow(() => assertStableUsage(
    { bytes: 100, files: 2 },
    { bytes: 200, files: 3 },
    "fixture",
  ));
  assert.throws(
    () => assertStableUsage(
      { bytes: 0, files: 0 },
      { bytes: 2 * 1024 * 1024, files: 0 },
      "fixture",
    ),
    /more than 1 MiB/,
  );
  assert.doesNotThrow(() => assertEmptyTemporary({ bytes: 0, files: 0 }, "fixture"));
  assert.throws(
    () => assertEmptyTemporary({ bytes: 1, files: 1 }, "fixture"),
    /left temporary files/,
  );
  assert.equal(existsSync("/definitely/not/a/sagejs/temp-file"), false);
  const directory = mkdtempSync(join(tmpdir(), "sagejs-rc-special-entry-"));
  try {
    symlinkSync("missing", join(directory, "dangling"));
    assert.throws(() => treeUsage(directory), /unsupported cache entry/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

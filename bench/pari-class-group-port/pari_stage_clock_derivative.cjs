#!/usr/bin/env node
"use strict";

// Reproducible builder for the benchmark-only PARI 2.17.4 stage-clock
// derivative.  All generated sources, objects, and executables live under
// /scratch (or an explicitly supplied scratch root), never in the repository.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { instrument, PRISTINE_SHA256, sha256 } = require(
  "./pari-stage-clock/instrument-buch2.cjs",
);

const ARCHIVE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const HERE = __dirname;
const BUILDER = __filename;
const DRIVER = path.join(HERE, "pari-stage-clock", "pari_stage_clock_driver.c");
const PATCHER = path.join(HERE, "pari-stage-clock", "instrument-buch2.cjs");
const VARIANTS = Object.freeze({
  h1: Object.freeze({
    authorityDriver: path.join(HERE, "pari_h1_outcome_c_adapter.c"),
    compileDefinitions: Object.freeze([]),
  }),
  row14: Object.freeze({
    authorityDriver: path.join(HERE, "row14_pari_prepared_timing_adapter.c"),
    compileDefinitions: Object.freeze([
      '-DSAGEJS_STAGE_AUTHORITY_ADAPTER="../row14_pari_prepared_timing_adapter.c"',
      '-DSAGEJS_STAGE_POLYNOMIAL="x^4-200000002*x-200000002"',
      "-DSAGEJS_STAGE_STACK_BYTES=1200000000",
      "-DSAGEJS_STAGE_MT_NBTHREADS=1",
    ]),
  }),
  row6: Object.freeze({
    authorityDriver: path.join(HERE, "row14_pari_prepared_timing_adapter.c"),
    compileDefinitions: Object.freeze([
      '-DSAGEJS_STAGE_AUTHORITY_ADAPTER="../row14_pari_prepared_timing_adapter.c"',
      '-DSAGEJS_STAGE_POLYNOMIAL="x^3-2000000000010*x+2000000000018"',
      "-DSAGEJS_STAGE_STACK_BYTES=1200000000",
      "-DSAGEJS_STAGE_MT_NBTHREADS=1",
      '-DSAGEJS_AUTHORITY_FIELD_ID="generated-sha256-55ba15494f03f38bf8f687ff4d2813e81184d71c84dbed9e1adc6af7ba62f0eb"',
      '-DSAGEJS_AUTHORITY_SAMPLE_SCHEMA="sagejs.pari-class-group/row6-pari-prepared-sample-v1"',
      '-DSAGEJS_AUTHORITY_POLYNOMIAL_ASCENDING_JSON="[\\\"2000000000018\\\",\\\"-2000000000010\\\",\\\"0\\\",\\\"1\\\"]"',
    ]),
  }),
});

function fileSha256(filename) {
  return sha256(fs.readFileSync(filename));
}

function run(command, args, options = {}) {
  const answer = spawnSync(command, args, {
    encoding: "utf8",
    timeout: options.timeout ?? 1_800_000,
    maxBuffer: 64 * 1024 * 1024,
    cwd: options.cwd,
    env: options.env ?? process.env,
  });
  assert.equal(
    answer.status,
    0,
    `${command} ${args.join(" ")} failed\n${answer.stdout}\n${answer.stderr}`,
  );
  return answer.stdout;
}

function readConfigValue(filename, key) {
  const source = fs.readFileSync(filename, "utf8");
  const match = source.match(new RegExp(`^${key}='([^']+)'$`, "m"));
  assert(match, `${key} missing from ${filename}`);
  return match[1];
}

function buildIdentity(archive, variant) {
  const configuration = VARIANTS[variant];
  assert(configuration, `unknown stage-clock variant ${variant}`);
  const pristineRoot = path.resolve(
    process.env.SAGEJS_PARI_ROOT || "/home/user/upstream/pari-2.17.4",
  );
  assert.equal(fileSha256(path.join(pristineRoot, "src", "basemath", "buch2.c")), PRISTINE_SHA256);
  const pristineObjectDirectory = path.join(pristineRoot, "Olinux-x86_64");
  const pristineLibraryPath = fs.realpathSync(path.join(pristineObjectDirectory, "libpari.so"));
  const identity = {
    schema: "sagejs.pari-class-group/pari-stage-clock-build-input-v1",
    archiveSha256: fileSha256(archive),
    pristineBuch2Sha256: PRISTINE_SHA256,
    patcherSha256: fileSha256(PATCHER),
    builderSha256: fileSha256(BUILDER),
    driverSha256: fileSha256(DRIVER),
    authorityDriverSha256: fileSha256(configuration.authorityDriver),
    pristineLibrarySha256: fileSha256(pristineLibraryPath),
    configureArguments: [
      "--graphic=none",
      "--without-readline",
      "--with-gmp",
      "--mt=pthread",
      "--enable-tls",
    ],
    compiler: process.env.CC || "cc",
  };
  // Preserve the already-qualified H1 cache identity.  Variant-specific fields
  // are necessary only for a nondefault authority driver.
  if (variant !== "h1") {
    identity.variant = variant;
    identity.compileDefinitions = configuration.compileDefinitions;
  }
  assert.equal(identity.archiveSha256, ARCHIVE_SHA256, "wrong PARI archive");
  return { configuration, identity, pristineRoot, pristineObjectDirectory,
    pristineLibraryPath };
}

function buildDerivative({
  archive = process.env.SAGEJS_PARI_ARCHIVE || "/home/user/upstream/pari-2.17.4.tar.gz",
  scratchRoot = process.env.SAGEJS_PARI_STAGE_SCRATCH || "/scratch/sagejs-runtime",
  jobs = Number(process.env.SAGEJS_PARI_BUILD_JOBS || 4),
  variant = "h1",
} = {}) {
  assert.equal(process.platform, "linux", "PARI stage-clock derivative is Linux-only");
  archive = path.resolve(archive);
  scratchRoot = path.resolve(scratchRoot);
  assert(Number.isSafeInteger(jobs) && jobs >= 1 && jobs <= 32, "invalid build job count");
  const { configuration, identity, pristineRoot, pristineObjectDirectory,
    pristineLibraryPath } = buildIdentity(archive, variant);
  const buildId = sha256(Buffer.from(JSON.stringify(identity))).slice(0, 16);
  const finalRoot = path.join(scratchRoot, variant === "h1"
    ? `pari-stage-clock-2.17.4-${buildId}`
    : `pari-stage-clock-2.17.4-${variant}-${buildId}`);
  const manifestPath = path.join(finalRoot, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert.deepEqual(manifest.input, identity, "cached derivative identity changed");
    assert.equal(fileSha256(manifest.executable), manifest.executableSha256);
    assert.equal(
      fileSha256(manifest.pristineExecutable),
      manifest.pristineExecutableSha256,
    );
    assert.equal(fileSha256(manifest.libraryPath), manifest.librarySha256);
    assert.equal(fileSha256(manifest.pristineLibraryPath), manifest.input.pristineLibrarySha256);
    assert.equal(fileSha256(manifest.instrumentedBuch2), manifest.instrumentedBuch2Sha256);
    return manifest;
  }

  fs.mkdirSync(scratchRoot, { recursive: true });
  const temporaryRoot = fs.mkdtempSync(
    path.join(scratchRoot, `pari-stage-clock-2.17.4-${buildId}-tmp-`),
  );
  const extracted = path.join(temporaryRoot, "pari-2.17.4");
  run("tar", ["-xzf", archive, "-C", temporaryRoot]);
  const buch2 = path.join(extracted, "src", "basemath", "buch2.c");
  assert.equal(fileSha256(buch2), PRISTINE_SHA256);
  const instrumented = instrument(fs.readFileSync(buch2, "utf8"));
  fs.writeFileSync(buch2, instrumented);

  const configureArguments = [
    ...identity.configureArguments,
    `--prefix=${path.join(finalRoot, "install")}`,
  ];
  run("./Configure", configureArguments, { cwd: extracted });
  run("make", [`-j${jobs}`, "all"], { cwd: extracted });

  const objectDirectory = path.join(
    extracted,
    readConfigValue(path.join(extracted, "Olinux-x86_64", "pari.cfg"), "objdir"),
  );
  // Configure's native x86-64 name is stable on the only qualified platform;
  // tolerate a future host spelling by finding pari.cfg if needed.
  let configuredObjectDirectory = objectDirectory;
  if (!fs.existsSync(path.join(configuredObjectDirectory, "pari.cfg"))) {
    const candidate = fs.readdirSync(extracted)
      .filter(name => name.startsWith("O"))
      .map(name => path.join(extracted, name))
      .find(name => fs.existsSync(path.join(name, "pari.cfg")));
    assert(candidate, "configured PARI object directory not found");
    configuredObjectDirectory = candidate;
  }
  const libraryPath = fs.realpathSync(path.join(configuredObjectDirectory, "libpari.so"));
  const executable = path.join(temporaryRoot, "pari-stage-clock-driver");
  const compiler = identity.compiler;
  const compileArguments = [
    "-O3", "-Wall", "-Wextra", "-fno-strict-aliasing", "-DNDEBUG",
    `-I${path.join(extracted, "src", "headers")}`,
    `-I${configuredObjectDirectory}`,
    ...configuration.compileDefinitions,
    DRIVER,
    `-L${configuredObjectDirectory}`,
    "-lpari", "-lm", "-o", executable,
  ];
  run(compiler, compileArguments);
  const pristineExecutable = path.join(temporaryRoot, "pari-stage-clock-pristine-control");
  const pristineCompileArguments = [
    "-O3", "-Wall", "-Wextra", "-fno-strict-aliasing", "-DNDEBUG",
    "-DSAGEJS_PRISTINE_CONTROL",
    ...configuration.compileDefinitions,
    `-I${path.join(pristineRoot, "src", "headers")}`,
    `-I${pristineObjectDirectory}`,
    DRIVER,
    `-L${pristineObjectDirectory}`,
    "-lpari", "-lm", "-o", pristineExecutable,
  ];
  run(compiler, pristineCompileArguments);

  const compilerVersion = run(compiler, ["--version"], { timeout: 30_000 }).split("\n")[0];
  const provisional = {
    schema: "sagejs.pari-class-group/pari-stage-clock-build-v1",
    input: identity,
    buildId,
    derivativeOnly: true,
    mathematicalAuthority: false,
    sourceRoot: extracted,
    objectDirectory: configuredObjectDirectory,
    libraryPath,
    instrumentedBuch2: buch2,
    executable,
    pristineExecutable,
    pristineObjectDirectory,
    pristineLibraryPath,
    compilerVersion,
    configureArguments,
    compileArguments,
    pristineCompileArguments,
    instrumentedBuch2Sha256: fileSha256(buch2),
    librarySha256: fileSha256(libraryPath),
    executableSha256: fileSha256(executable),
    pristineExecutableSha256: fileSha256(pristineExecutable),
  };
  // Paths embedded in the manifest must point at the stable directory after
  // the atomic rename.
  const rewriteRoot = value => value.replace(temporaryRoot, finalRoot);
  const manifest = {
    ...provisional,
    sourceRoot: rewriteRoot(provisional.sourceRoot),
    objectDirectory: rewriteRoot(provisional.objectDirectory),
    libraryPath: rewriteRoot(provisional.libraryPath),
    instrumentedBuch2: rewriteRoot(provisional.instrumentedBuch2),
    executable: rewriteRoot(provisional.executable),
    compileArguments: provisional.compileArguments.map(rewriteRoot),
    pristineExecutable: rewriteRoot(provisional.pristineExecutable),
    pristineCompileArguments: provisional.pristineCompileArguments.map(rewriteRoot),
  };
  fs.writeFileSync(path.join(temporaryRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.renameSync(temporaryRoot, finalRoot);
  return manifest;
}

if (require.main === module) {
  const manifest = buildDerivative();
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

module.exports = {
  ARCHIVE_SHA256,
  VARIANTS,
  buildDerivative,
  fileSha256,
};

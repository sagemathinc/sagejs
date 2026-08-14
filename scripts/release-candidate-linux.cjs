#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, dirname, extname, join, resolve } = require("node:path");
const { performance } = require("node:perf_hooks");
const { readBuildManifest } = require("./release-manifest.cjs");
const {
  validateNativeMathBuildProfile,
} = require("./native-math-profile.cjs");

const ROOT = resolve(__dirname, "..");
const EXPECTED_PYTHON = "python-runtime-ok";
const SUPPORTED_ARCHITECTURES = new Set(["arm64", "x64"]);
if (!SUPPORTED_ARCHITECTURES.has(process.arch)) {
  throw new Error(`unsupported Linux release architecture ${process.arch}`);
}
const PLATFORM = `linux-${process.arch}`;
const DISTRIBUTION_NAME = `sagejs-${PLATFORM}`;
const PACKAGE_VERSION = require("../package.json").version;
const SYSTEM_PATH = "/usr/bin:/bin";
const BUILD_RECEIPTS = Object.freeze({
  baseline: "linux-baseline-receipt.json",
  math: "sagejs-build-manifest.json",
  python: "sagepython-build-manifest.json",
});
const RUNTIME_EXTRA_VARIABLES = new Set([
  "SAGEJS_MODULE_CACHE_AUTO_CLEANUP",
  "SAGEJS_NATIVE_REQUIRED",
  "SAGEJS_NATIVE_TRACE",
]);
const INSTALLER_TEST_VARIABLES = new Set([
  "SAGEJS_INSTALL_FAIL_BEFORE_SWITCH",
]);

function receiptBeside(executable) {
  const extension = extname(executable);
  const stem = extension === ".exe"
    ? basename(executable, extension)
    : basename(executable);
  return join(dirname(executable), `${stem}-build-manifest.json`);
}

function withReceiptDefaults(options) {
  return {
    ...options,
    mathReceipt: options.mathReceipt || receiptBeside(options.math),
    pythonReceipt: options.pythonReceipt || receiptBeside(options.python),
  };
}

function parseArguments(argv) {
  const baselineDirectory = join(
    ROOT,
    "build",
    process.arch === "x64" ? "linux-baseline" : `linux-baseline-${PLATFORM}`,
  );
  const result = {
    baselineReceipt: join(baselineDirectory, "linux-baseline-receipt.json"),
    math: join(baselineDirectory, "sea", "sagejs"),
    python: join(baselineDirectory, "sea", "sagepython"),
    mathReceipt: undefined,
    pythonReceipt: undefined,
    output: undefined,
    releaseDirectory: join(ROOT, "build", "release"),
    keep: false,
    warmSamples: 3,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--baseline-receipt") {
      result.baselineReceipt = resolve(argv[++index] ?? "");
    } else if (argument === "--math") result.math = resolve(argv[++index] ?? "");
    else if (argument === "--python") {
      result.python = resolve(argv[++index] ?? "");
    } else if (argument === "--math-receipt") {
      result.mathReceipt = resolve(argv[++index] ?? "");
    } else if (argument === "--python-receipt") {
      result.pythonReceipt = resolve(argv[++index] ?? "");
    } else if (argument === "--output") {
      result.output = resolve(argv[++index] ?? "");
    } else if (argument === "--release-directory") {
      result.releaseDirectory = resolve(argv[++index] ?? "");
    } else if (argument === "--warm-samples") {
      result.warmSamples = Number(argv[++index]);
    } else if (argument === "--keep") result.keep = true;
    else throw new Error(`unknown argument: ${argument}`);
  }
  result.mathReceipt ||= receiptBeside(result.math);
  result.pythonReceipt ||= receiptBeside(result.python);
  if (!Number.isInteger(result.warmSamples) || result.warmSamples < 1) {
    throw new Error("--warm-samples must be a positive integer");
  }
  return result;
}

function runChecked(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function median(values) {
  assert.ok(values.length > 0, "cannot take the median of no samples");
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sha256(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

function treeUsage(directory) {
  let bytes = 0;
  let files = 0;
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const filename = join(current, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile()) {
        bytes += lstatSync(filename).size;
        files += 1;
      } else throw new Error(`unsupported cache entry ${filename}`);
    }
  };
  visit(directory);
  return { bytes, files };
}

function fixedEnvironment(path = SYSTEM_PATH) {
  return {
    LANG: "C",
    LC_ALL: "C",
    PATH: path,
    TZ: "UTC",
  };
}

function isolatedEnvironment(directory, extra = {}) {
  for (const name of Object.keys(extra)) {
    if (!RUNTIME_EXTRA_VARIABLES.has(name)) {
      throw new Error(`unsupported isolated runtime variable ${name}`);
    }
  }
  const emptyPath = join(directory, "empty-path");
  const home = join(directory, "home");
  const cache = join(directory, "cache");
  const temporary = join(directory, "tmp");
  for (const path of [emptyPath, home, cache, temporary]) {
    mkdirSync(path, { recursive: true, mode: 0o755 });
  }
  return {
    ...fixedEnvironment(emptyPath),
    HOME: home,
    SAGEJS_MODULE_CACHE_AUTO_CLEANUP: "0",
    TMPDIR: temporary,
    XDG_CACHE_HOME: cache,
    ...extra,
  };
}

function installerEnvironment(directory, values, extra = {}) {
  for (const name of Object.keys(extra)) {
    if (!INSTALLER_TEST_VARIABLES.has(name)) {
      throw new Error(`unsupported installer test variable ${name}`);
    }
  }
  const home = join(directory, "home");
  const temporary = join(directory, "tmp");
  mkdirSync(home, { recursive: true, mode: 0o755 });
  mkdirSync(temporary, { recursive: true, mode: 0o755 });
  return {
    ...fixedEnvironment(),
    HOME: home,
    SAGEJS_DOWNLOAD_BASE_URL: values.downloadBaseUrl,
    SAGEJS_INSTALL_DIR: values.installDirectory,
    SAGEJS_INSTALL_PLATFORM: PLATFORM,
    TMPDIR: temporary,
    ...extra,
  };
}

function artifactMetadata(filename) {
  const linkStat = lstatSync(filename);
  const targetStat = statSync(filename);
  const result = {
    bytes: targetStat.size,
    filename: basename(filename),
    mode: (targetStat.mode & 0o777).toString(8).padStart(3, "0"),
    sha256: sha256(filename),
  };
  if (linkStat.isSymbolicLink()) result.symbolicLink = readlinkSync(filename);
  return result;
}

function validateBaselineReceipt(options, receipts) {
  const baseline = JSON.parse(readFileSync(options.baselineReceipt, "utf8"));
  assert.equal(baseline.schema, "sagejs.linux-baseline-receipt-v1");
  assert.equal(baseline.platform, PLATFORM);
  assert.equal(baseline.sourceCommit, receipts.math.source.commit);
  assert.equal(baseline.sourceCommit, receipts.python.source.commit);
  assert.equal(baseline.nodeVersion, receipts.math.toolchain.seaNode.version);
  assert.equal(baseline.nodeVersion, receipts.python.toolchain.seaNode.version);
  assert.equal(
    baseline.inspection?.aggregate?.dependencies.some(
      (dependency) => dependency.toLowerCase() === "libatomic.so.1",
    ),
    false,
    "Linux baseline inputs depend on libatomic.so.1",
  );
  const expected = {
    "sea/sagejs": options.math,
    "sea/sagejs-build-manifest.json": options.mathReceipt,
    "sea/sagepython": options.python,
    "sea/sagepython-build-manifest.json": options.pythonReceipt,
  };
  assert.equal(
    baseline.seaArtifacts?.schema,
    "sagejs.linux-baseline-sea-artifacts-v1",
  );
  assert.equal(baseline.seaArtifacts?.sourceCommit, baseline.sourceCommit);
  assert.equal(baseline.seaArtifacts?.nodeVersion, baseline.nodeVersion);
  assert.equal(baseline.seaArtifacts?.platform, baseline.platform);
  for (const [name, filename] of Object.entries(expected)) {
    const recorded = baseline.seaArtifacts.artifacts?.[name];
    assert.ok(recorded, `baseline receipt omits ${name}`);
    const observed = artifactMetadata(filename);
    assert.equal(observed.sha256, recorded.sha256, `${name} hash mismatch`);
    assert.equal(observed.bytes, recorded.bytes, `${name} size mismatch`);
  }
  return baseline;
}

function visitFiles(directory, prefix = "") {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name;
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...visitFiles(filename, relativeName));
    else if (entry.isFile()) result.push(relativeName);
  }
  return result.sort();
}

function runtimeTargetIdentity(target) {
  return {
    arch: target.arch,
    endianness: target.endianness,
    libcFamily: target.libc?.family ?? null,
    nodeAbi: target.nodeAbi,
    nodeNapi: target.nodeNapi,
    platform: target.platform,
    wordBits: target.wordBits,
  };
}

function compareNumericVersions(left, right) {
  const parse = (value) => String(value).split(".").map((part) => {
    assert.match(part, /^\d+$/, `invalid numeric version ${value}`);
    return Number(part);
  });
  const leftParts = parse(left);
  const rightParts = parse(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function validateExecutableReceipts(options) {
  const math = readBuildManifest(options.mathReceipt);
  const python = readBuildManifest(options.pythonReceipt);
  for (const [name, receipt, nativeMathematics] of [
    ["sagejs", math, true],
    ["sagepython", python, false],
  ]) {
    assert.equal(receipt.sagejsVersion, PACKAGE_VERSION, `${name} version receipt mismatch`);
    assert.equal(receipt.target.platform, "linux", `${name} is not a Linux build`);
    assert.equal(receipt.target.arch, process.arch, `${name} architecture mismatch`);
    assert.equal(
      receipt.capabilities?.artifact?.nativeMathematics,
      nativeMathematics,
      `${name} native mathematics receipt mismatch`,
    );
  }
  assert.deepEqual(math.source, python.source, "SEA executables have different source identities");
  assert.deepEqual(
    runtimeTargetIdentity(math.target),
    runtimeTargetIdentity(python.target),
    "SEA executables have different runtime target identities",
  );
  assert.ok(
    compareNumericVersions(math.target.libc.version, python.target.libc.version) >= 0,
    "mathematics SEA cannot require an older libc than its Node runtime",
  );
  const profile = validateNativeMathBuildProfile(
    math.toolchain.nativeMathProfile,
    math.target,
  );
  assert.equal(
    profile.effectiveProfile,
    "portable",
    "release artifact must use the portable mathematics profile",
  );
  assert.equal(
    python.toolchain.nativeMathProfile,
    null,
    "sagepython receipt unexpectedly declares a mathematics profile",
  );
  const baseline = options.baselineReceipt
    ? validateBaselineReceipt(options, { math, python })
    : null;
  return { baseline, math, python };
}

function validateEmbeddedExecutable(executable, expectedReceipt) {
  const stateDirectory = mkdtempSync(join(tmpdir(), "sagejs-receipt-probe-"));
  let probe;
  try {
    probe = spawnSync(executable, ["capabilities", "--json"], {
      cwd: dirname(executable),
      encoding: "utf8",
      env: isolatedEnvironment(stateDirectory),
      timeout: 30_000,
    });
  } finally {
    rmSync(stateDirectory, { recursive: true, force: true });
  }
  if (probe.error) throw probe.error;
  assert.equal(probe.status, 0, probe.stderr || probe.stdout);
  const report = JSON.parse(probe.stdout);
  assert.equal(report.buildReceipt?.availability, "available");
  assert.equal(report.buildReceipt?.source, "embedded");
  assert.deepEqual(
    report.buildReceipt.manifest,
    expectedReceipt,
    `${basename(executable)} embedded receipt does not match its sidecar`,
  );
  assert.equal(report.artifact.kind, "single-executable");
  return report;
}

function atomicWrite(filename, contents, mode = 0o644) {
  const staged = stageAtomicWrite(filename, contents, mode);
  try {
    staged.commit();
  } finally {
    staged.cleanup();
  }
}

function stageAtomicWrite(filename, contents, mode = 0o644) {
  mkdirSync(dirname(filename), { recursive: true, mode: 0o755 });
  const temporary = mkdtempSync(join(dirname(filename), ".sagejs-publish-"));
  const staged = join(temporary, basename(filename));
  writeFileSync(staged, contents, { mode });
  chmodSync(staged, mode);
  let committed = false;
  return {
    cleanup() {
      rmSync(temporary, { recursive: true, force: true });
    },
    commit() {
      assert.equal(committed, false, "staged write already committed");
      renameSync(staged, filename);
      committed = true;
    },
  };
}

function publishReleaseCandidate(sourceArchive, releaseDirectory) {
  mkdirSync(releaseDirectory, { recursive: true, mode: 0o755 });
  const temporary = mkdtempSync(join(releaseDirectory, ".sagejs-linux-publish-"));
  const archive = join(releaseDirectory, `${DISTRIBUTION_NAME}.tar.xz`);
  const archiveChecksum = `${archive}.sha256`;
  try {
    const stagedArchive = join(temporary, basename(archive));
    const stagedChecksum = join(temporary, basename(archiveChecksum));
    copyFileSync(sourceArchive, stagedArchive);
    chmodSync(stagedArchive, 0o644);
    writeFileSync(
      stagedChecksum,
      `${sha256(stagedArchive)}  ${basename(archive)}\n`,
      { mode: 0o644 },
    );
    chmodSync(stagedChecksum, 0o644);
    // The checksum is the readiness marker. Removing it first means an
    // interrupted publication is absent or fails closed, never accepted as a
    // new archive with an old checksum.
    rmSync(archiveChecksum, { force: true });
    renameSync(stagedArchive, archive);
    renameSync(stagedChecksum, archiveChecksum);
    return { archive, archiveChecksum };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function publishValidatedReleaseCandidate(
  sourceArchive,
  releaseDirectory,
  report,
  options = {},
) {
  mkdirSync(releaseDirectory, { recursive: true, mode: 0o755 });
  const temporary = mkdtempSync(join(releaseDirectory, ".sagejs-linux-ready-"));
  const names = {
    archive: `${DISTRIBUTION_NAME}.tar.xz`,
    checksum: `${DISTRIBUTION_NAME}.tar.xz.sha256`,
    report: `${DISTRIBUTION_NAME}.report.json`,
    readiness: `${DISTRIBUTION_NAME}.release.json`,
  };
  const paths = Object.fromEntries(
    Object.entries(names).map(([key, name]) => [key, join(releaseDirectory, name)]),
  );
  try {
    const stagedArchive = join(temporary, names.archive);
    const stagedChecksum = join(temporary, names.checksum);
    const stagedReport = join(temporary, names.report);
    const stagedReadiness = join(temporary, names.readiness);
    copyFileSync(sourceArchive, stagedArchive);
    chmodSync(stagedArchive, 0o644);
    writeFileSync(
      stagedChecksum,
      `${sha256(stagedArchive)}  ${names.archive}\n`,
      { mode: 0o644 },
    );
    writeFileSync(stagedReport, `${JSON.stringify(report, null, 2)}\n`, {
      mode: 0o644,
    });
    const readiness = {
      artifacts: {
        [names.archive]: sha256(stagedArchive),
        [names.checksum]: sha256(stagedChecksum),
        [names.report]: sha256(stagedReport),
      },
      schema: "sagejs.linux-release-readiness/v1",
    };
    writeFileSync(stagedReadiness, `${JSON.stringify(readiness, null, 2)}\n`, {
      mode: 0o644,
    });
    // The readiness manifest is the transaction's commit record. Remove it
    // before replacing any payload and publish it last.
    rmSync(paths.readiness, { force: true });
    renameSync(stagedArchive, paths.archive);
    renameSync(stagedChecksum, paths.checksum);
    renameSync(stagedReport, paths.report);
    options.beforeReady?.();
    renameSync(stagedReadiness, paths.readiness);
    return { ...paths, readinessRecord: readiness };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function packageReleaseCandidate(options, internals = {}) {
  options = withReceiptDefaults(options);
  assert.ok(options.baselineReceipt, "authoritative Linux baseline receipt is required");
  const receipts = validateExecutableReceipts(options);
  const embeddedValidator = internals.validateEmbeddedExecutable ||
    validateEmbeddedExecutable;
  embeddedValidator(options.math, receipts.math);
  embeddedValidator(options.python, receipts.python);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-linux-package-"));
  try {
    const distribution = join(temporary, DISTRIBUTION_NAME);
    const licenseDirectory = join(distribution, "licenses");
    mkdirSync(licenseDirectory, { recursive: true, mode: 0o755 });
    for (const [source, target, mode] of [
      [options.math, join(distribution, "sagejs"), 0o755],
      [options.python, join(distribution, "sagepython"), 0o755],
      [options.mathReceipt, join(distribution, BUILD_RECEIPTS.math), 0o644],
      [options.pythonReceipt, join(distribution, BUILD_RECEIPTS.python), 0o644],
      [options.baselineReceipt, join(distribution, BUILD_RECEIPTS.baseline), 0o644],
      [join(ROOT, "LICENSE"), join(distribution, "LICENSE"), 0o644],
      [join(ROOT, "README.md"), join(distribution, "README.md"), 0o644],
      [join(ROOT, "DISTRIBUTION.md"), join(distribution, "DISTRIBUTION.md"), 0o644],
    ]) {
      copyFileSync(source, target);
      chmodSync(target, mode);
    }
    // Re-read the copied canonical receipts so packaging cannot accidentally
    // report one file while shipping another.
    assert.deepEqual(readBuildManifest(join(distribution, BUILD_RECEIPTS.math)), receipts.math);
    assert.deepEqual(readBuildManifest(join(distribution, BUILD_RECEIPTS.python)), receipts.python);
    assert.deepEqual(
      JSON.parse(readFileSync(join(distribution, BUILD_RECEIPTS.baseline), "utf8")),
      receipts.baseline,
    );
    for (const entry of readdirSync(join(ROOT, "licenses"), {
      withFileTypes: true,
    })) {
      if (!entry.isFile()) continue;
      const target = join(licenseDirectory, entry.name);
      copyFileSync(join(ROOT, "licenses", entry.name), target);
      chmodSync(target, 0o644);
    }
    const checksumEntries = visitFiles(distribution)
      .map(
        (relativeName) =>
          `${sha256(join(distribution, relativeName))}  ${relativeName}`,
      )
      .join("\n");
    writeFileSync(join(distribution, "SHA256SUMS"), `${checksumEntries}\n`, {
      mode: 0o644,
    });
    chmodSync(join(distribution, "SHA256SUMS"), 0o644);

    const stagedRelease = join(temporary, "release");
    mkdirSync(stagedRelease, { mode: 0o755 });
    const stagedArchive = join(stagedRelease, `${DISTRIBUTION_NAME}.tar.xz`);
    runChecked(
      "tar",
      [
        "--sort=name",
        "--mtime=@0",
        "--owner=0",
        "--group=0",
        "--numeric-owner",
        "--mode=u+rwX,go+rX,go-w",
        "--pax-option=delete=atime,delete=ctime",
        "-I",
        "xz -6 --threads=1",
        "-cf",
        stagedArchive,
        "-C",
        temporary,
        DISTRIBUTION_NAME,
      ],
      { cwd: ROOT, env: fixedEnvironment() },
    );
    chmodSync(stagedArchive, 0o644);
    return publishReleaseCandidate(stagedArchive, options.releaseDirectory);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function extractReleaseCandidate(archive, directory) {
  const extraction = join(directory, "extracted");
  mkdirSync(extraction, { mode: 0o755 });
  runChecked("tar", ["-xJf", archive, "-C", extraction], {
    env: fixedEnvironment(),
  });
  const distribution = join(extraction, DISTRIBUTION_NAME);
  assert.deepEqual(readdirSync(extraction), [DISTRIBUTION_NAME]);
  const required = [
    "DISTRIBUTION.md",
    "LICENSE",
    "README.md",
    "SHA256SUMS",
    BUILD_RECEIPTS.baseline,
    BUILD_RECEIPTS.math,
    BUILD_RECEIPTS.python,
    "licenses",
    "sagejs",
    "sagepython",
  ];
  assert.deepEqual(readdirSync(distribution).sort(), required.sort());
  const expectedChecksums = readFileSync(join(distribution, "SHA256SUMS"), "utf8")
    .trim()
    .split("\n")
    .map((line) => line.match(/^([0-9a-f]{64})  (.+)$/))
    .map((match) => {
      assert.ok(match, "invalid internal SHA256SUMS entry");
      return { digest: match[1], relativeName: match[2] };
    });
  assert.deepEqual(
    expectedChecksums.map(({ relativeName }) => relativeName),
    visitFiles(distribution).filter((name) => name !== "SHA256SUMS"),
  );
  for (const { digest, relativeName } of expectedChecksums) {
    assert.equal(sha256(join(distribution, relativeName)), digest);
  }
  for (const executable of ["sagejs", "sagepython"]) {
    assert.equal(
      lstatSync(join(distribution, executable)).mode & 0o111,
      0o111,
      `${executable} lost its executable mode in the archive`,
    );
  }
  return distribution;
}

function runArtifact(executable, script, options) {
  const started = performance.now();
  const result = spawnSync(executable, [script], {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env,
    timeout: options.timeout ?? 120_000,
  });
  const elapsedMs = performance.now() - started;
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout || `artifact terminated by ${result.signal}`,
  );
  return {
    elapsedMs,
    stderr: result.stderr.trim(),
    stdout: result.stdout.trim(),
  };
}

function writeFixtures(directory) {
  const startup = join(directory, "startup-release-smoke.sage");
  writeFileSync(startup, "print(2^100)\n");
  const python = join(directory, "python-release-smoke.py");
  writeFileSync(
    python,
    [
      "from mpmath import mp",
      "import hashlib, json",
      "mp.dps = 50",
      "assert str(mp.sqrt(2)) == '1.4142135623730950488016887242096980785696718753769'",
      "assert hashlib.sha256(b'sagejs').hexdigest().startswith('2b1438a')",
      "assert json.loads('{\"value\":12345678901234567890}')['value'] == 12345678901234567890",
      `print('${EXPECTED_PYTHON}')`,
      "",
    ].join("\n"),
  );
  return { python, startup };
}

function runInstaller(
  downloadDirectory,
  installDirectory,
  stateDirectory,
  cwd,
  extra = {},
) {
  return spawnSync("/bin/sh", [join(ROOT, "install.sh")], {
    cwd,
    encoding: "utf8",
    env: installerEnvironment(
      stateDirectory,
      {
        downloadBaseUrl: `file://${downloadDirectory}`,
        installDirectory,
      },
      extra,
    ),
    timeout: 120_000,
  });
}

function runAuthoritativeMathSmoke(executable, cwd, stateDirectory) {
  const run = () => {
    const started = performance.now();
    const result = spawnSync(
      process.execPath,
      [
        join(ROOT, "scripts", "release-math-smoke.cjs"),
        "--executable",
        executable,
        "--require-native",
        "--state-directory",
        stateDirectory,
        "--max-seconds",
        "60",
        "--json",
      ],
      {
        cwd,
        encoding: "utf8",
        env: isolatedEnvironment(join(stateDirectory, "verifier")),
        timeout: 120_000,
      },
    );
    const elapsedMs = performance.now() - started;
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return { elapsedMs, report: JSON.parse(result.stdout) };
  };
  const cold = run();
  const coldCache = treeUsage(join(stateDirectory, "cache"));
  const coldTemporary = treeUsage(join(stateDirectory, "tmp"));
  const warm = run();
  const warmCache = treeUsage(join(stateDirectory, "cache"));
  const warmTemporary = treeUsage(join(stateDirectory, "tmp"));
  assertStableUsage(coldCache, warmCache, "authoritative native mathematics");
  assertEmptyTemporary(coldTemporary, "cold authoritative mathematics smoke");
  assertEmptyTemporary(warmTemporary, "warm authoritative mathematics smoke");
  const m4ri = cold.report.native.witnesses.find(({ name }) =>
    name === "binary-m4ri-resource");
  assert.equal(m4ri?.observed, true, "authoritative smoke did not observe M4RI");
  assert.equal(
    cold.report.native.fallback.length,
    0,
    "authoritative native smoke observed a fallback route",
  );
  return { cold, coldCache, warm, warmCache };
}

function assertStableUsage(cold, warm, label) {
  assert.ok(
    warm.bytes <= cold.bytes + 1024 * 1024,
    `${label} cache grew by more than 1 MiB after warm runs`,
  );
  assert.ok(
    warm.files <= cold.files + 32,
    `${label} cache created more than 32 files after warm runs`,
  );
}

function assertEmptyTemporary(usage, label) {
  assert.deepEqual(usage, { bytes: 0, files: 0 }, `${label} left temporary files`);
}

function validateReleaseCandidate(options, internals = {}) {
  options = withReceiptDefaults(options);
  assert.equal(process.platform, "linux", "Linux release validation requires Linux");
  assert.equal(
    SUPPORTED_ARCHITECTURES.has(process.arch),
    true,
    "Linux release validation requires x64 or arm64",
  );
  for (const filename of [
    options.math,
    options.python,
    options.mathReceipt,
    options.pythonReceipt,
    options.baselineReceipt,
  ]) {
    assert.ok(filename, "SEA artifacts and receipts are required");
    assert.ok(lstatSync(filename).isFile(), `${filename} is not a regular file`);
  }

  const directory = mkdtempSync(join(tmpdir(), "sagejs-linux-rc-"));
  try {
    const staged = packageReleaseCandidate(
      {
        ...options,
        releaseDirectory: join(directory, "candidate"),
      },
      internals,
    );
    const workspace = join(directory, "workspace");
    mkdirSync(workspace, { mode: 0o755 });
    const distribution = extractReleaseCandidate(staged.archive, directory);
    const mathExecutable = join(distribution, "sagejs");
    const pythonExecutable = join(distribution, "sagepython");
    const fixtures = writeFixtures(workspace);
    const embeddedReceipts = {
      baseline: JSON.parse(
        readFileSync(join(distribution, BUILD_RECEIPTS.baseline), "utf8"),
      ),
      math: readBuildManifest(join(distribution, BUILD_RECEIPTS.math)),
      python: readBuildManifest(join(distribution, BUILD_RECEIPTS.python)),
    };
    const embeddedValidator = internals.validateEmbeddedExecutable ||
      validateEmbeddedExecutable;
    const embeddedCapabilityReports = {
      math: embeddedValidator(mathExecutable, embeddedReceipts.math),
      python: embeddedValidator(
        pythonExecutable,
        embeddedReceipts.python,
      ),
    };

    const installedDirectory = join(directory, "installed");

    const corruptDirectory = join(directory, "corrupt-download");
    mkdirSync(corruptDirectory, { mode: 0o755 });
    copyFileSync(staged.archive, join(corruptDirectory, basename(staged.archive)));
    writeFileSync(
      join(corruptDirectory, basename(staged.archiveChecksum)),
      `${"0".repeat(64)}  ${basename(staged.archive)}\n`,
      { mode: 0o644 },
    );
    const failedInstallState = join(directory, "failed-install-state");
    const failedInstall = runInstaller(
      corruptDirectory,
      installedDirectory,
      failedInstallState,
      workspace,
    );
    if (failedInstall.error) throw failedInstall.error;
    assert.notEqual(failedInstall.status, 0, "corrupt archive unexpectedly installed");
    assert.match(failedInstall.stderr, /SHA-256 verification failed/);
    assert.equal(lstatSync(installedDirectory, { throwIfNoEntry: false }), undefined);
    assertEmptyTemporary(
      treeUsage(join(failedInstallState, "tmp")),
      "failed installer",
    );

    const installState = join(directory, "install-state");
    const installResult = runInstaller(
      dirname(staged.archive),
      installedDirectory,
      installState,
      workspace,
    );
    if (installResult.error) throw installResult.error;
    assert.equal(installResult.status, 0, installResult.stderr || installResult.stdout);
    assert.ok(
      installResult.stdout.includes(`Installed sagejs ${PACKAGE_VERSION}`),
      installResult.stdout,
    );
    assert.equal(sha256(join(installedDirectory, "sagejs")), sha256(mathExecutable));
    assert.equal(
      sha256(join(installedDirectory, "sagepython")),
      sha256(pythonExecutable),
    );
    assert.equal(lstatSync(join(installedDirectory, "sagejs")).isSymbolicLink(), true);
    assert.equal(lstatSync(join(installedDirectory, "sagepython")).isSymbolicLink(), true);
    const activeBeforeFailure = readFileSync(
      join(installedDirectory, ".sagejs-current", "sagejs"),
    );
    assertEmptyTemporary(treeUsage(join(installState, "tmp")), "successful installer");

    // A second successful run is the real upgrade/reinstall path, including
    // replacement of existing executable files.
    const reinstallState = join(directory, "reinstall-state");
    const interruptedUpgrade = runInstaller(
      dirname(staged.archive),
      installedDirectory,
      reinstallState,
      workspace,
      { SAGEJS_INSTALL_FAIL_BEFORE_SWITCH: "1" },
    );
    if (interruptedUpgrade.error) throw interruptedUpgrade.error;
    assert.notEqual(interruptedUpgrade.status, 0);
    assert.match(interruptedUpgrade.stderr, /injected failure/);
    assert.deepEqual(
      readFileSync(join(installedDirectory, ".sagejs-current", "sagejs")),
      activeBeforeFailure,
      "failed upgrade changed the active generation",
    );
    const reinstall = runInstaller(
      dirname(staged.archive),
      installedDirectory,
      join(directory, "reinstall-success-state"),
      workspace,
    );
    if (reinstall.error) throw reinstall.error;
    assert.equal(reinstall.status, 0, reinstall.stderr || reinstall.stdout);
    assert.equal(sha256(join(installedDirectory, "sagejs")), sha256(mathExecutable));
    assert.equal(
      sha256(join(installedDirectory, "sagepython")),
      sha256(pythonExecutable),
    );
    assertEmptyTemporary(treeUsage(join(reinstallState, "tmp")), "failed reinstaller");

    const startupEnvironment = isolatedEnvironment(join(directory, "startup-state"));
    const pythonEnvironment = isolatedEnvironment(join(directory, "python-state"));
    const nodeProbe = spawnSync("node", ["--version"], {
      cwd: workspace,
      encoding: "utf8",
      env: startupEnvironment,
    });
    assert.equal(nodeProbe.error?.code, "ENOENT", "Node unexpectedly exists on isolated PATH");

    const startupCold = runArtifact(mathExecutable, fixtures.startup, {
      cwd: workspace,
      env: startupEnvironment,
    });
    assert.equal(startupCold.stdout, "1267650600228229401496703205376");
    const startupColdCache = treeUsage(
      join(directory, "startup-state", "cache"),
    );
    const startupWarm = [];
    for (let sample = 0; sample < options.warmSamples; sample += 1) {
      const startupRun = runArtifact(mathExecutable, fixtures.startup, {
        cwd: workspace,
        env: startupEnvironment,
      });
      assert.equal(startupRun.stdout, "1267650600228229401496703205376");
      startupWarm.push(startupRun.elapsedMs);
    }
    const installedEnvironment = isolatedEnvironment(
      join(directory, "installed-state"),
    );
    const installedStartup = runArtifact(
      join(installedDirectory, "sagejs"),
      fixtures.startup,
      { cwd: workspace, env: installedEnvironment },
    );
    assert.equal(installedStartup.stdout, "1267650600228229401496703205376");

    const pythonCold = runArtifact(pythonExecutable, fixtures.python, {
      cwd: workspace,
      env: pythonEnvironment,
    });
    assert.equal(pythonCold.stdout, EXPECTED_PYTHON);
    const pythonColdCache = treeUsage(join(directory, "python-state", "cache"));
    const coldCaches = {
      python: pythonColdCache,
      startup: startupColdCache,
    };
    const pythonWarm = [];
    for (let sample = 0; sample < options.warmSamples; sample += 1) {
      const pythonRun = runArtifact(pythonExecutable, fixtures.python, {
        cwd: workspace,
        env: pythonEnvironment,
      });
      assert.equal(pythonRun.stdout, EXPECTED_PYTHON);
      pythonWarm.push(pythonRun.elapsedMs);
    }
    const warmCaches = {
      python: treeUsage(join(directory, "python-state", "cache")),
      startup: treeUsage(join(directory, "startup-state", "cache")),
    };
    assertStableUsage(coldCaches.python, warmCaches.python, "sagepython");
    assertStableUsage(coldCaches.startup, warmCaches.startup, "sagejs startup");
    const runtimeTemporary = {
      python: treeUsage(join(directory, "python-state", "tmp")),
      startup: treeUsage(join(directory, "startup-state", "tmp")),
    };
    assertEmptyTemporary(runtimeTemporary.python, "sagepython runtime");
    assertEmptyTemporary(runtimeTemporary.startup, "sagejs runtime");
    const totalWarmCacheBytes = Object.values(warmCaches)
      .reduce((total, usage) => total + usage.bytes, 0);
    assert.ok(
      totalWarmCacheBytes < 100 * 1024 * 1024,
      `release smoke cache unexpectedly grew to ${totalWarmCacheBytes} bytes`,
    );

    const mathSmokeState = join(directory, "math-smoke-state");
    const mathSmoke = runAuthoritativeMathSmoke(
      mathExecutable,
      workspace,
      mathSmokeState,
    );

    const report = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      buildReceipts: embeddedReceipts,
      host: {
        arch: process.arch,
        glibc: process.report.getReport().header.glibcVersionRuntime ?? null,
        node: process.version,
        platform: process.platform,
      },
      isolation: {
        adjacentFiles: readdirSync(distribution).sort(),
        cleanHome: true,
        environmentPolicy: "strict-allowlist-v1",
        nodeAvailableOnPath: false,
        sourceCheckoutCurrentDirectory: false,
      },
      embeddedCapabilities: embeddedCapabilityReports,
      artifacts: {
        archive: artifactMetadata(staged.archive),
        archiveChecksum: readFileSync(staged.archiveChecksum, "utf8").trim(),
        sagejs: artifactMetadata(mathExecutable),
        sagejsBuildReceipt: artifactMetadata(
          join(distribution, BUILD_RECEIPTS.math),
        ),
        sagepython: artifactMetadata(pythonExecutable),
        sagepythonBuildReceipt: artifactMetadata(
          join(distribution, BUILD_RECEIPTS.python),
        ),
        installedSagejs: artifactMetadata(join(installedDirectory, "sagejs")),
        installedSagepython: artifactMetadata(
          join(installedDirectory, "sagepython"),
        ),
      },
      nativeMath: embeddedReceipts.math.toolchain.nativeMathProfile,
      cache: {
        afterCold: { ...coldCaches, math: mathSmoke.coldCache },
        afterWarm: { ...warmCaches, math: mathSmoke.warmCache },
        runtimeTemporaryAfterExit: {
          ...runtimeTemporary,
          math: treeUsage(join(mathSmokeState, "tmp")),
        },
      },
      timingsMs: {
        startup: {
          cold: startupCold.elapsedMs,
          installed: installedStartup.elapsedMs,
          warmMedian: median(startupWarm),
          warmSamples: startupWarm,
        },
        math: {
          cold: mathSmoke.cold.elapsedMs,
          coldReportedSeconds: mathSmoke.cold.report.seconds,
          warm: mathSmoke.warm.elapsedMs,
          warmReportedSeconds: mathSmoke.warm.report.seconds,
        },
        python: {
          cold: pythonCold.elapsedMs,
          warmMedian: median(pythonWarm),
          warmSamples: pythonWarm,
        },
      },
      nativeTrace: mathSmoke.cold.report.native.selections,
      checks: {
        artifactBoundBuildReceipts: true,
        cacheAndTemporaryBounds: true,
        corruptInstallRejected: true,
        deterministicReleaseArchive: true,
        exactMathematics: true,
        installer: true,
        installerUpgrade: true,
        m4riNativeWitness: true,
        nativeCapabilities: true,
        noAdjacentRuntime: true,
        noExternalNode: true,
        pythonRuntime: true,
      },
    };
    const reportContents = `${JSON.stringify(report, null, 2)}\n`;
    const externalReport = options.output
      ? stageAtomicWrite(options.output, reportContents)
      : null;
    try {
      publishValidatedReleaseCandidate(
        staged.archive,
        options.releaseDirectory,
        report,
        { beforeReady: () => externalReport?.commit() },
      );
    } finally {
      externalReport?.cleanup();
    }
    if (!options.keep) rmSync(directory, { recursive: true, force: true });
    return { directory: options.keep ? directory : undefined, report };
  } catch (error) {
    if (!options.keep) rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

function run(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const { directory, report } = validateReleaseCandidate(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (options.keep) console.error(`Kept isolated release workspace at ${directory}`);
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
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
  receiptBeside,
  runInstaller,
  stageAtomicWrite,
  treeUsage,
  validateBaselineReceipt,
  validateExecutableReceipts,
  validateEmbeddedExecutable,
  validateReleaseCandidate,
  withReceiptDefaults,
};

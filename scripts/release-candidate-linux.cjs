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
  readdirSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, dirname, join, resolve } = require("node:path");
const { performance } = require("node:perf_hooks");

const ROOT = resolve(__dirname, "..");
const EXPECTED_PYTHON = "python-runtime-ok";
const EXPECTED_MATH = "native-mathematics-ok";
const PLATFORM = "linux-x64";
const DISTRIBUTION_NAME = `sagejs-${PLATFORM}`;
const PACKAGE_VERSION = require("../package.json").version;

function parseArguments(argv) {
  const result = {
    math: join(ROOT, "build", "sea", "sagejs"),
    python: join(ROOT, "build", "sea", "sagepython"),
    output: undefined,
    releaseDirectory: join(ROOT, "build", "release"),
    keep: false,
    warmSamples: 3,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--math") result.math = resolve(argv[++index] ?? "");
    else if (argument === "--python") {
      result.python = resolve(argv[++index] ?? "");
    } else if (argument === "--output") {
      result.output = resolve(argv[++index] ?? "");
    } else if (argument === "--release-directory") {
      result.releaseDirectory = resolve(argv[++index] ?? "");
    } else if (argument === "--warm-samples") {
      result.warmSamples = Number(argv[++index]);
    } else if (argument === "--keep") result.keep = true;
    else throw new Error(`unknown argument: ${argument}`);
  }
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
      }
    }
  };
  visit(directory);
  return { bytes, files };
}

function isolatedEnvironment(directory, extra = {}) {
  const emptyPath = join(directory, "empty-path");
  const home = join(directory, "home");
  const cache = join(directory, "cache");
  const temporary = join(directory, "tmp");
  for (const path of [emptyPath, home, cache, temporary]) {
    mkdirSync(path, { recursive: true });
  }
  const environment = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (
      !name.startsWith("NODE_") &&
      !name.startsWith("npm_") &&
      !name.startsWith("PNPM_") &&
      !name.startsWith("SAGEJS_") &&
      name !== "NODE_PATH" &&
      name !== "HOME" &&
      name !== "PATH" &&
      name !== "XDG_CACHE_HOME" &&
      name !== "TMPDIR"
    ) {
      environment[name] = value;
    }
  }
  return {
    ...environment,
    HOME: home,
    PATH: emptyPath,
    TMPDIR: temporary,
    XDG_CACHE_HOME: cache,
    ...extra,
  };
}

function artifactMetadata(filename) {
  const stat = lstatSync(filename);
  return {
    bytes: stat.size,
    filename: basename(filename),
    mode: (stat.mode & 0o777).toString(8).padStart(3, "0"),
    sha256: sha256(filename),
  };
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

function packageReleaseCandidate(options) {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-linux-package-"));
  try {
    const distribution = join(temporary, DISTRIBUTION_NAME);
    const licenseDirectory = join(distribution, "licenses");
    mkdirSync(licenseDirectory, { recursive: true });
    for (const [source, target, mode] of [
      [options.math, join(distribution, "sagejs"), 0o755],
      [options.python, join(distribution, "sagepython"), 0o755],
      [join(ROOT, "LICENSE"), join(distribution, "LICENSE"), 0o644],
      [join(ROOT, "README.md"), join(distribution, "README.md"), 0o644],
      [join(ROOT, "DISTRIBUTION.md"), join(distribution, "DISTRIBUTION.md"), 0o644],
    ]) {
      copyFileSync(source, target);
      chmodSync(target, mode);
    }
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

    mkdirSync(options.releaseDirectory, { recursive: true });
    const archive = join(
      options.releaseDirectory,
      `${DISTRIBUTION_NAME}.tar.xz`,
    );
    const archiveChecksum = `${archive}.sha256`;
    rmSync(archive, { force: true });
    runChecked(
      "tar",
      [
        "--sort=name",
        "--mtime=@0",
        "--owner=0",
        "--group=0",
        "--numeric-owner",
        "--pax-option=delete=atime,delete=ctime",
        "-I",
        "xz -6 --threads=1",
        "-cf",
        archive,
        "-C",
        temporary,
        DISTRIBUTION_NAME,
      ],
      { cwd: ROOT },
    );
    writeFileSync(
      archiveChecksum,
      `${sha256(archive)}  ${basename(archive)}\n`,
      { mode: 0o644 },
    );
    return { archive, archiveChecksum };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function extractReleaseCandidate(archive, directory) {
  const extraction = join(directory, "extracted");
  mkdirSync(extraction);
  runChecked("tar", ["-xJf", archive, "-C", extraction]);
  const distribution = join(extraction, DISTRIBUTION_NAME);
  assert.deepEqual(readdirSync(extraction), [DISTRIBUTION_NAME]);
  const required = [
    "DISTRIBUTION.md",
    "LICENSE",
    "README.md",
    "SHA256SUMS",
    "licenses",
    "sagejs",
    "sagepython",
  ];
  assert.deepEqual(readdirSync(distribution).sort(), required);
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

  const math = join(directory, "math-release-smoke.sage");
  writeFileSync(
    math,
    [
      "assert str(factor(2026)) == '2 * 1013'",
      "A = matrix(ZZ, [[2, 3, 5], [7, 11, 13], [17, 19, 23]])",
      "assert A.det() == -78",
      "Q = matrix(QQ, [[1/2, 2/3], [3/5, 5/7]])",
      "assert Q.det() == -3/70",
      "assert Q.rref() == identity_matrix(QQ, 2)",
      "F = GF(97)",
      "M = identity_matrix(F, 64)",
      "assert M*M == M and M.rank() == 64 and M.rref() == M",
      "B = matrix(GF(2), [[1, 1, 0], [0, 1, 1], [1, 0, 1]])",
      "assert B.rank() == 2",
      "R = PolynomialRing(ZZ, 't')",
      "t = R.gen()",
      "assert (t^6 - 1)(2) == 63",
      "assert graphs.PetersenGraph().automorphism_group().order() == 120",
      `print('${EXPECTED_MATH}')`,
      "",
    ].join("\n"),
  );
  return { math, python, startup };
}

function nativeMathProvenance() {
  try {
    const { nativeMathBuildProvenance } = require(
      "./native-math-profile.cjs"
    );
    return nativeMathBuildProvenance(ROOT);
  } catch (error) {
    return { error: error.message };
  }
}

function sourceRevision() {
  return runChecked("git", ["rev-parse", "HEAD"], { cwd: ROOT }).stdout.trim();
}

function validateReleaseCandidate(options) {
  assert.equal(process.platform, "linux", "Linux release validation requires Linux");
  assert.equal(process.arch, "x64", "Linux release validation requires x64");
  for (const filename of [options.math, options.python]) {
    assert.ok(filename, "both SEA artifact paths are required");
    assert.ok(lstatSync(filename).isFile(), `${filename} is not a regular file`);
  }

  const { archive, archiveChecksum } = packageReleaseCandidate(options);
  const directory = mkdtempSync(join(tmpdir(), "sagejs-linux-rc-"));
  const workspace = join(directory, "workspace");
  mkdirSync(workspace);
  const distribution = extractReleaseCandidate(archive, directory);
  const mathExecutable = join(distribution, "sagejs");
  const pythonExecutable = join(distribution, "sagepython");
  const fixtures = writeFixtures(workspace);
  const installedDirectory = join(directory, "installed");
  const installResult = spawnSync("sh", [join(ROOT, "install.sh")], {
    cwd: workspace,
    encoding: "utf8",
    env: {
      ...process.env,
      SAGEJS_DOWNLOAD_BASE_URL: `file://${dirname(archive)}`,
      SAGEJS_INSTALL_DIR: installedDirectory,
      SAGEJS_INSTALL_PLATFORM: PLATFORM,
    },
    timeout: 120_000,
  });
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
  const startupEnvironment = isolatedEnvironment(join(directory, "startup-state"));
  const pythonEnvironment = isolatedEnvironment(join(directory, "python-state"));
  const mathEnvironment = {
    ...isolatedEnvironment(join(directory, "math-state")),
    SAGEJS_NATIVE_REQUIRED: "1",
    SAGEJS_NATIVE_TRACE: "1",
  };
  const nodeProbe = spawnSync("node", ["--version"], {
    cwd: workspace,
    encoding: "utf8",
    env: startupEnvironment,
  });
  assert.equal(nodeProbe.error?.code, "ENOENT", "Node unexpectedly exists on isolated PATH");

  try {
    const startupCold = runArtifact(mathExecutable, fixtures.startup, {
      cwd: workspace,
      env: startupEnvironment,
    });
    assert.equal(startupCold.stdout, "1267650600228229401496703205376");
    const startupWarm = [];
    for (let sample = 0; sample < options.warmSamples; sample += 1) {
      const startupRun = runArtifact(mathExecutable, fixtures.startup, {
        cwd: workspace,
        env: startupEnvironment,
      });
      assert.equal(startupRun.stdout, "1267650600228229401496703205376");
      startupWarm.push(startupRun.elapsedMs);
    }

    const pythonCold = runArtifact(pythonExecutable, fixtures.python, {
      cwd: workspace,
      env: pythonEnvironment,
    });
    assert.equal(pythonCold.stdout, EXPECTED_PYTHON);

    const mathCold = runArtifact(mathExecutable, fixtures.math, {
      cwd: workspace,
      env: mathEnvironment,
    });
    assert.match(mathCold.stdout, new RegExp(`${EXPECTED_MATH}$`));
    assert.match(mathCold.stdout, /Matrix\.(multiply|rank|rref)/);
    assert.match(mathCold.stdout, /declared-(fflas|flint)-isolated/);
    assert.match(mathCold.stdout, /generated-flint-resource/);
    const coldCaches = {
      math: treeUsage(join(directory, "math-state", "cache")),
      python: treeUsage(join(directory, "python-state", "cache")),
      startup: treeUsage(join(directory, "startup-state", "cache")),
    };

    const pythonWarm = [];
    const mathWarm = [];
    for (let sample = 0; sample < options.warmSamples; sample += 1) {
      const pythonRun = runArtifact(pythonExecutable, fixtures.python, {
        cwd: workspace,
        env: pythonEnvironment,
      });
      assert.equal(pythonRun.stdout, EXPECTED_PYTHON);
      pythonWarm.push(pythonRun.elapsedMs);

      const mathRun = runArtifact(mathExecutable, fixtures.math, {
        cwd: workspace,
        env: mathEnvironment,
      });
      assert.match(mathRun.stdout, new RegExp(`${EXPECTED_MATH}$`));
      mathWarm.push(mathRun.elapsedMs);
    }
    const warmCaches = {
      math: treeUsage(join(directory, "math-state", "cache")),
      python: treeUsage(join(directory, "python-state", "cache")),
      startup: treeUsage(join(directory, "startup-state", "cache")),
    };
    const runtimeTemporary = {
      math: treeUsage(join(directory, "math-state", "tmp")),
      python: treeUsage(join(directory, "python-state", "tmp")),
      startup: treeUsage(join(directory, "startup-state", "tmp")),
    };
    const totalWarmCacheBytes = Object.values(warmCaches)
      .reduce((total, usage) => total + usage.bytes, 0);
    assert.ok(
      totalWarmCacheBytes < 100 * 1024 * 1024,
      `release smoke cache unexpectedly grew to ${totalWarmCacheBytes} bytes`,
    );

    const nativeMath = nativeMathProvenance();
    assert.equal(
      nativeMath.selected?.effectiveProfile,
      "portable",
      "release artifact must be built with the portable mathematics profile",
    );
    assert.equal(
      nativeMath.installedMatchesSelected,
      true,
      "installed mathematics prefix does not match the selected portable profile",
    );
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      source: { revision: sourceRevision(), version: PACKAGE_VERSION },
      host: {
        arch: process.arch,
        glibc: process.report.getReport().header.glibcVersionRuntime ?? null,
        node: process.version,
        platform: process.platform,
      },
      isolation: {
        adjacentFiles: readdirSync(distribution).sort(),
        cleanHome: true,
        nodeAvailableOnPath: false,
        sourceCheckoutCurrentDirectory: false,
      },
      artifacts: {
        archive: artifactMetadata(archive),
        archiveChecksum: readFileSync(archiveChecksum, "utf8").trim(),
        sagejs: artifactMetadata(mathExecutable),
        sagepython: artifactMetadata(pythonExecutable),
        installedSagejs: artifactMetadata(join(installedDirectory, "sagejs")),
        installedSagepython: artifactMetadata(
          join(installedDirectory, "sagepython"),
        ),
      },
      nativeMath,
      cache: {
        afterCold: coldCaches,
        afterWarm: warmCaches,
        runtimeTemporaryAfterExit: runtimeTemporary,
      },
      timingsMs: {
        startup: {
          cold: startupCold.elapsedMs,
          warmMedian: median(startupWarm),
          warmSamples: startupWarm,
        },
        math: {
          cold: mathCold.elapsedMs,
          warmMedian: median(mathWarm),
          warmSamples: mathWarm,
        },
        python: {
          cold: pythonCold.elapsedMs,
          warmMedian: median(pythonWarm),
          warmSamples: pythonWarm,
        },
      },
      nativeTrace: mathCold.stdout
        .split("\n")
        .filter((line) => line.startsWith("[sagejs native]")),
      checks: {
        deterministicReleaseArchive: true,
        exactMathematics: true,
        installer: true,
        nativeCapabilities: true,
        noAdjacentRuntime: true,
        noExternalNode: true,
        pythonRuntime: true,
      },
    };
    if (options.output) {
      mkdirSync(dirname(options.output), { recursive: true });
      writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`);
    }
    return { directory, report };
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
  else rmSync(directory, { recursive: true, force: true });
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
  isolatedEnvironment,
  median,
  packageReleaseCandidate,
  parseArguments,
  treeUsage,
  validateReleaseCandidate,
};

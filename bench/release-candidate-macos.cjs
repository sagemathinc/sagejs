#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { cpus, release, tmpdir, totalmem } = require("node:os");
const { basename, join, resolve } = require("node:path");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");
const { readBuildManifest } = require("../scripts/release-manifest.cjs");
const {
  validateMacosArm64SeaNode,
} = require("../scripts/macos-release-node-authority.cjs");

function usage(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write(
    "Usage: node bench/release-candidate-macos.cjs --archive FILE " +
      "--build-manifest FILE [--output FILE] [--samples N]\n",
  );
  process.exit(2);
}

function parseArguments(arguments_) {
  const options = { archive: "", buildManifest: "", output: "", samples: 5 };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--archive") options.archive = arguments_[++index] ?? "";
    else if (argument === "--build-manifest") {
      options.buildManifest = arguments_[++index] ?? "";
    }
    else if (argument === "--output") options.output = arguments_[++index] ?? "";
    else if (argument === "--samples") options.samples = Number(arguments_[++index]);
    else if (argument === "--help" || argument === "-h") usage();
    else usage(`Unknown option: ${argument}`);
  }
  if (!options.archive) usage("--archive is required");
  if (!options.buildManifest) usage("--build-manifest is required");
  if (!Number.isInteger(options.samples) || options.samples < 1 || options.samples > 30) {
    usage("--samples must be an integer from 1 through 30");
  }
  return options;
}

function run(executable, arguments_, options) {
  const started = performance.now();
  const result = spawnSync(executable, arguments_, {
    encoding: "utf8",
    timeout: 60_000,
    ...options,
  });
  const milliseconds = performance.now() - started;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${executable} exited ${result.status}`);
  }
  return { milliseconds, stdout: result.stdout.trim() };
}

function statistics(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return {
    minimum_ms: ordered[0],
    median_ms: ordered[Math.floor(ordered.length / 2)],
    maximum_ms: ordered.at(-1),
    samples_ms: values,
  };
}

function isolatedEnvironment(home, cache, temporary) {
  const environment = {};
  for (const name of ["LANG", "LC_ALL", "LC_CTYPE", "TZ"]) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  return {
    ...environment,
    HOME: home,
    USERPROFILE: home,
    XDG_CACHE_HOME: cache,
    SAGEJS_NATIVE_CACHE_DIR: join(cache, "native"),
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    TMP: temporary,
    TEMP: temporary,
    TMPDIR: temporary,
  };
}

function inspectCommand(command, arguments_) {
  const result = spawnSync(command, arguments_, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    return {
      available: false,
      error:
        result.error?.message ??
        result.stderr?.trim() ??
        `${command} exited with status ${result.status}`,
    };
  }
  return { available: true, output: result.stdout };
}

function buildVersion(output) {
  const lines = output.split("\n");
  const metadata = {};
  for (const line of lines) {
    const match = line.trim().match(/^(platform|minos|sdk)\s+(.+)$/);
    if (match) metadata[match[1]] = match[2].trim();
  }
  return Object.keys(metadata).length > 0 ? metadata : null;
}

function machOMetadata(executable) {
  const architectures = inspectCommand("lipo", ["-archs", executable]);
  const dependencies = inspectCommand("otool", ["-L", executable]);
  let build = inspectCommand("vtool", ["-show-build", executable]);
  let buildTool = "vtool";
  if (!build.available) {
    build = inspectCommand("otool", ["-l", executable]);
    buildTool = "otool";
  }
  const parsedBuild = build.available ? buildVersion(build.output) : null;
  return {
    architecture: architectures.available
      ? architectures.output.trim().split(/\s+/).filter(Boolean)
      : architectures,
    deployment: build.available
      ? {
          tool: buildTool,
          build_version: parsedBuild,
          ...(parsedBuild ? {} : { raw: build.output.trim().slice(0, 4_000) }),
        }
      : { tool: buildTool, ...build },
    dynamic_dependencies: dependencies.available
      ? dependencies.output
          .split("\n")
          .slice(1)
          .map((line) => line.trim())
          .filter(Boolean)
      : dependencies,
  };
}

function contentManifest(directory) {
  const files = [];
  const visit = (current, prefix = "") => {
    const entries = readdirSync(current, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      const filename = join(current, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        visit(filename, relative);
      } else if (entry.isFile()) {
        const status = statSync(filename);
        files.push({
          path: relative,
          bytes: status.size,
          mode: `0${(status.mode & 0o777).toString(8)}`,
          sha256: createHash("sha256").update(readFileSync(filename)).digest("hex"),
        });
      }
    }
  };
  visit(directory);
  return files;
}

function validationCheckoutObservation() {
  const source = resolve(__dirname, "..");
  const commit = inspectCommand("git", ["-C", source, "rev-parse", "HEAD"]);
  const status = inspectCommand("git", ["-C", source, "status", "--porcelain"]);
  if (!commit.available || !status.available) {
    return { available: false, commit, status };
  }
  return {
    available: true,
    artifact_identity: false,
    commit: commit.output.trim(),
    dirty: status.output.trim().length > 0,
  };
}

const options = parseArguments(process.argv.slice(2));
if (process.platform !== "darwin" || process.arch !== "arm64") {
  throw new Error("the macOS release-candidate benchmark requires macOS arm64");
}
const archive = resolve(options.archive);
const buildReceipt = readBuildManifest(resolve(options.buildManifest));
const {
  node: builderNode,
  source: builderNodeSource,
} = validateMacosArm64SeaNode(buildReceipt);
const temporary = mkdtempSync(join(tmpdir(), "sagejs-macos-benchmark-"));
try {
  const extraction = join(temporary, "extracted");
  const work = join(temporary, "work");
  mkdirSync(extraction);
  mkdirSync(work);
  const extracted = spawnSync("ditto", ["-x", "-k", archive, extraction], {
    encoding: "utf8",
  });
  if (extracted.error) throw extracted.error;
  if (extracted.status !== 0) throw new Error(extracted.stderr);
  const entries = readdirSync(extraction);
  if (entries.length !== 1) throw new Error("release archive must contain one directory");
  const distribution = join(extraction, entries[0]);
  const sagejs = join(distribution, "sagejs");
  const sagepython = join(distribution, "sagepython");
  const program = join(work, "benchmark.sage");
  writeFileSync(
    program,
    [
      "A = matrix(QQ, [[1/2, 2/3], [3/5, 5/7]])",
      "assert (A^8).det() == A.det()^8",
      "assert matrix(GF(97), [[1,2], [3,5]]).rank() == 2",
      "assert str(factor(2026)) == '2 * 1013'",
      "",
    ].join("\n"),
  );

  const cold = [];
  const warm = [];
  const startup = [];
  const sharedHome = join(temporary, "warm-home");
  const sharedCache = join(temporary, "warm-cache");
  mkdirSync(sharedHome);
  mkdirSync(sharedCache);
  for (let index = 0; index < options.samples; index += 1) {
    const coldHome = join(temporary, `cold-home-${index}`);
    const coldCache = join(temporary, `cold-cache-${index}`);
    mkdirSync(coldHome);
    mkdirSync(coldCache);
    startup.push(
      run(sagejs, ["--version"], {
        cwd: work,
        env: isolatedEnvironment(coldHome, coldCache, temporary),
      }).milliseconds,
    );
    cold.push(
      run(sagejs, [program], {
        cwd: work,
        env: isolatedEnvironment(coldHome, coldCache, temporary),
      }).milliseconds,
    );
    warm.push(
      run(sagejs, [program], {
        cwd: work,
        env: isolatedEnvironment(sharedHome, sharedCache, temporary),
      }).milliseconds,
    );
  }
  const version = run(sagejs, ["--version"], {
    cwd: work,
    env: isolatedEnvironment(sharedHome, sharedCache, temporary),
  }).stdout;
  const report = {
    schema: "sagejs.release-candidate-benchmark-v1",
    platform: "macos-arm64",
    version,
    host: {
      os_release: release(),
      cpu: cpus()[0]?.model ?? "unknown",
      logical_cpus: cpus().length,
      total_memory_bytes: totalmem(),
    },
    builder: {
      known: true,
      node_version: builderNode.version,
      node_executable: "authenticated SEA build input",
      node_sha256: builderNode.executableSha256,
      node_dynamic_dependencies: "recorded by the SEA native-binary receipt",
      node_distribution: builderNodeSource.filename,
      node_distribution_sha256: builderNodeSource.sha256,
    },
    validation_node: {
      version: process.version,
      executable: basename(process.execPath),
      sha256: createHash("sha256")
        .update(readFileSync(process.execPath))
        .digest("hex"),
    },
    archive: basename(archive),
    archive_sha256: createHash("sha256").update(readFileSync(archive)).digest("hex"),
    packaging: {
      recipe:
        "find sagejs-macos-arm64 -type f -print | LC_ALL=C sort | " +
        "COPYFILE_DISABLE=1 /usr/bin/zip -X -q sagejs-macos-arm64.zip -@",
      byte_reproducible: false,
      contract:
        "The recipe and extracted-content manifest are reproducible; ZIP bytes " +
        "and their checksum identify this candidate but may vary with input mtimes.",
    },
    validation_checkout: validationCheckoutObservation(),
    extracted_content: contentManifest(distribution),
    executable_bytes: statSync(sagejs).size,
    mach_o: {
      sagejs: machOMetadata(sagejs),
      sagepython: machOMetadata(sagepython),
    },
    workload: "exact QQ power, GF(97) rank, and integer factorization",
    sample_policy: `${options.samples} alternating clean-home and persistent-home processes`,
    process_startup: statistics(startup),
    cold: statistics(cold),
    warm: statistics(warm),
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) writeFileSync(resolve(options.output), serialized);
  process.stdout.write(serialized);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

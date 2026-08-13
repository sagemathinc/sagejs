#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { homedir, tmpdir } = require("node:os");
const { basename, dirname, join, parse, resolve } = require("node:path");

const {
  assertNativeInputs,
} = require("../release-native-binary-inspector.cjs");

const ROOT = resolve(__dirname, "..", "..");
const NODE_VERSION = "26.7.0";
const NODE_SOURCE_SHA256 =
  "e6b182cbeeab032d1082ca4ac4fe15e3a57de691d3bde78ecf8a761fd56ee356";
const BUILD_IMAGE =
  "quay.io/pypa/manylinux_2_28_x86_64@" +
  "sha256:f854c50adf7b7a325bc4794316f3758d387a41d61f9e2ebca0f26c7dc8f761d4";
const RUNTIME_IMAGE =
  "registry.access.redhat.com/ubi8/ubi-minimal@" +
  "sha256:cca75ce8294bd67a18520f72d58692e213428b14615d91800ad26b32860adb62";
const POLICY_PATH = join(__dirname, "linux-x64-glibc-2.28-policy.json");

function parseArguments(arguments_) {
  const result = {
    allInputs: false,
    engine: undefined,
    keepImage: false,
    output: join(ROOT, "build", "linux-baseline"),
    sourceRef: "HEAD",
  };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--all-inputs") result.allInputs = true;
    else if (argument === "--engine") result.engine = arguments_[++index];
    else if (argument === "--keep-image") result.keepImage = true;
    else if (argument === "--output") result.output = resolve(arguments_[++index] ?? "");
    else if (argument === "--source-ref") result.sourceRef = arguments_[++index] ?? "";
    else if (argument === "--help" || argument === "-h") return { help: true };
    else throw new Error(`unknown argument: ${argument}`);
  }
  if (result.engine && !["docker", "podman"].includes(result.engine)) {
    throw new Error("--engine must be docker or podman");
  }
  if (!result.sourceRef) throw new Error("--source-ref must not be empty");
  return result;
}

function commandAvailable(command) {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

function selectEngine(requested) {
  if (requested) {
    if (!commandAvailable(requested)) throw new Error(`${requested} is unavailable`);
    return requested;
  }
  for (const candidate of ["podman", "docker"]) {
    if (commandAvailable(candidate)) return candidate;
  }
  throw new Error("podman or docker is required");
}

function run(command, arguments_, options = {}) {
  process.stdout.write(`+ ${command} ${arguments_.join(" ")}\n`);
  const result = spawnSync(command, arguments_, {
    cwd: options.cwd,
    encoding: options.encoding,
    env: options.env,
    stdio: options.stdio ?? "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} exited with status ${result.status}` +
        (result.stderr ? `:\n${result.stderr}` : ""),
    );
  }
  return result;
}

function assertRuntimeOmitsLibatomic(engine) {
  const result = spawnSync(
    engine,
    ["run", "--rm", RUNTIME_IMAGE, "rpm", "-q", "libatomic"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.error) throw result.error;
  if (result.status !== 1 || !/not installed/i.test(result.stdout + result.stderr)) {
    throw new Error(
      "the baseline runtime unexpectedly contains libatomic: " +
        `${result.stdout}${result.stderr}`,
    );
  }
}

function exportGitArchive(sourceRef, destination) {
  const descriptor = openSync(destination, "w");
  try {
    const result = spawnSync("git", ["archive", "--format=tar", sourceRef], {
      cwd: ROOT,
      stdio: ["ignore", descriptor, "inherit"],
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`git archive exited with status ${result.status}`);
    }
  } finally {
    closeSync(descriptor);
  }
}

function listNativeInputs(directory) {
  const inputs = [];
  const visit = (current, prefix = "") => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const filename = join(current, entry.name);
      if (entry.isDirectory()) visit(filename, relative);
      else if (entry.isFile() && (entry.name === "node" || entry.name.endsWith(".node"))) {
        inputs.push({
          label: relative,
          path: filename,
          role: entry.name === "node" ? "sea-template" : "embedded-addon",
        });
      }
    }
  };
  visit(directory);
  return inputs.sort((left, right) => left.label.localeCompare(right.label));
}

function validateReleaseInputs(directory) {
  const inputs = listNativeInputs(directory);
  assert.ok(inputs.some(({ label }) => label === "node"), "Node template is missing");
  const policy = JSON.parse(readFileSync(POLICY_PATH, "utf8"));
  return assertNativeInputs(inputs, policy);
}

function assertPortableMathProfile(profile) {
  assert.equal(profile?.schema, "sagejs.native-math-profile-v1");
  assert.equal(profile.effectiveProfile, "portable");
  assert.equal(profile.requestedProfile, "portable");
  assert.equal(profile.cpu, null);
  assert.equal(profile.abi?.platform, "linux");
  assert.equal(profile.abi?.arch, "x64");
  assert.equal(profile.compilers?.c?.nativeFlag, null);
  assert.equal(profile.compilers?.cxx?.nativeFlag, null);
  assert.equal(profile.buildOptions?.gmp?.configure?.includes("--enable-fat"), true);
  assert.equal(profile.buildOptions?.fflas?.gmpConfigure?.includes("--enable-fat"), true);
  assert.equal(profile.buildOptions?.openblas?.dynamicArch, true);
  const buildTokens = [];
  const collectStrings = (value) => {
    if (typeof value === "string") buildTokens.push(value);
    else if (Array.isArray(value)) value.forEach(collectStrings);
    else if (value && typeof value === "object") {
      Object.values(value).forEach(collectStrings);
    }
  };
  collectStrings(profile.buildOptions);
  assert.deepEqual(
    buildTokens.filter((token) => /^-(?:march|mcpu|mtune)(?:=|$)/.test(token)),
    [],
    "portable mathematics profile contains a host CPU compiler flag",
  );
  return profile;
}

function copyContainerfile(context) {
  copyFileSync(join(__dirname, "Containerfile"), join(context, "Containerfile"));
}

function assertSafeOutputDirectory(output) {
  const candidate = resolve(output);
  const forbidden = new Set([parse(candidate).root, resolve(homedir()), ROOT]);
  if (forbidden.has(candidate)) {
    throw new Error(`refusing broad Linux baseline output directory ${candidate}`);
  }
}

function buildReleaseInputs(options) {
  assertSafeOutputDirectory(options.output);
  const engine = selectEngine(options.engine);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-linux-baseline-"));
  const context = join(temporary, "context");
  const extracted = join(temporary, "extracted");
  const tag = `sagejs-linux-baseline:${process.pid}`;
  let container = null;
  try {
    mkdirSync(context);
    mkdirSync(extracted);
    copyContainerfile(context);
    if (options.allInputs) {
      exportGitArchive(options.sourceRef, join(context, "sagejs.tar"));
    } else {
      writeFileSync(join(context, "sagejs.tar"), "");
    }
    const target = options.allInputs ? "release-inputs" : "node-artifact";
    run(engine, [
      "build",
      "--file",
      join(context, "Containerfile"),
      "--target",
      target,
      "--tag",
      tag,
      "--build-arg",
      `BUILD_IMAGE=${BUILD_IMAGE}`,
      "--build-arg",
      `NODE_SOURCE_SHA256=${NODE_SOURCE_SHA256}`,
      "--build-arg",
      `NODE_VERSION=${NODE_VERSION}`,
      context,
    ]);
    container = run(engine, ["create", tag], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    }).stdout.trim();
    if (!container) throw new Error(`${engine} create did not return a container id`);
    run(engine, ["cp", `${container}:/release-inputs/.`, extracted]);

    const report = validateReleaseInputs(extracted);
    const mathProfile = options.allInputs
      ? assertPortableMathProfile(
          JSON.parse(readFileSync(join(extracted, "native-math-profile.json"), "utf8")),
        )
      : null;
    assertRuntimeOmitsLibatomic(engine);
    run(engine, [
      "run",
      "--rm",
      "--volume",
      `${extracted}:/candidate:ro,Z`,
      RUNTIME_IMAGE,
      "/candidate/node",
      "--version",
    ]);
    rmSync(options.output, { recursive: true, force: true });
    mkdirSync(dirname(options.output), { recursive: true });
    copyFileTree(extracted, options.output);
    const receipt = {
      buildImage: BUILD_IMAGE,
      nodeSourceSha256: NODE_SOURCE_SHA256,
      nodeVersion: NODE_VERSION,
      nativeMathProfile: mathProfile,
      policy: basename(POLICY_PATH),
      runtimeImage: RUNTIME_IMAGE,
      runtimeLibatomicPackagePresent: false,
      sourceRef: options.allInputs
        ? run("git", ["rev-parse", `${options.sourceRef}^{commit}`], {
            cwd: ROOT,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "inherit"],
          }).stdout.trim()
        : null,
      inspection: report,
    };
    writeFileSync(
      join(options.output, "linux-baseline-receipt.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    process.stdout.write(`Linux baseline inputs: ${options.output}\n`);
    return receipt;
  } finally {
    if (container) spawnSync(engine, ["rm", "--force", container], { stdio: "ignore" });
    if (!options.keepImage) spawnSync(engine, ["image", "rm", tag], { stdio: "ignore" });
    rmSync(temporary, { recursive: true, force: true });
  }
}

function copyFileTree(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) copyFileTree(from, to);
    else if (entry.isFile()) copyFileSync(from, to);
  }
}

function help() {
  process.stdout.write(`Usage: node scripts/linux-baseline/release-inputs.cjs [options]

Build a GCC-linked Node 26 template in manylinux_2_28 and prove that it runs
in a minimal UBI 8 container without libatomic. By default only Node is built.

  --all-inputs       Also build and inspect all Sage.js native addons
  --engine NAME      podman or docker (auto-detected by default)
  --keep-image       Retain the local intermediate image
  --output PATH      Output directory (default: build/linux-baseline)
  --source-ref REF   Committed Git tree used by --all-inputs (default: HEAD)
`);
}

module.exports = {
  BUILD_IMAGE,
  NODE_SOURCE_SHA256,
  NODE_VERSION,
  POLICY_PATH,
  RUNTIME_IMAGE,
  assertPortableMathProfile,
  assertSafeOutputDirectory,
  assertRuntimeOmitsLibatomic,
  buildReleaseInputs,
  listNativeInputs,
  parseArguments,
  selectEngine,
  validateReleaseInputs,
};

if (require.main === module) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) help();
    else buildReleaseInputs(options);
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  }
}

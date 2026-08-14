#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createHash, randomBytes } = require("node:crypto");
const {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { homedir, tmpdir } = require("node:os");
const { basename, dirname, join, parse, resolve } = require("node:path");

const STAGED_PROCESS = process.env.SAGEJS_LINUX_BASELINE_STAGED === "1";
const {
  assertNativeInputs,
} = require(
  STAGED_PROCESS
    ? "./release-native-binary-inspector.cjs"
    : "../release-native-binary-inspector.cjs"
);

const ROOT = process.env.SAGEJS_LINUX_BASELINE_ROOT
  ? resolve(process.env.SAGEJS_LINUX_BASELINE_ROOT)
  : resolve(__dirname, "..", "..");
const NODE_VERSION = "26.7.0";
const NODE_SOURCE_SHA256 =
  "e6b182cbeeab032d1082ca4ac4fe15e3a57de691d3bde78ecf8a761fd56ee356";
const PLATFORM_CONFIGS = Object.freeze({
  "linux-x64": Object.freeze({
    arch: "x64",
    buildImage:
      "quay.io/pypa/manylinux_2_28_x86_64@" +
      "sha256:f854c50adf7b7a325bc4794316f3758d387a41d61f9e2ebca0f26c7dc8f761d4",
    containerArchitecture: "amd64",
    policyPath: join(__dirname, "linux-x64-glibc-2.28-policy.json"),
    runtimeImage:
      "registry.access.redhat.com/ubi8/ubi-minimal@" +
      "sha256:cca75ce8294bd67a18520f72d58692e213428b14615d91800ad26b32860adb62",
  }),
  "linux-arm64": Object.freeze({
    arch: "arm64",
    buildImage:
      "quay.io/pypa/manylinux_2_28_aarch64@" +
      "sha256:b9dd5b2d6885fae144119ac934978003bcc413087ea08f602a960257205ec246",
    containerArchitecture: "arm64",
    policyPath: join(__dirname, "linux-arm64-glibc-2.28-policy.json"),
    runtimeImage:
      "registry.access.redhat.com/ubi8/ubi-minimal@" +
      "sha256:523ceff2d2063d7a44d406f09b9fc5fabaca7b534a877ba14c8f75c60500b11a",
  }),
});
const DEFAULT_PLATFORM = process.arch === "arm64" ? "linux-arm64" : "linux-x64";
// Retain the x64 exports for callers that consumed the original single-target
// authority. New code selects a complete immutable platform configuration.
const BUILD_IMAGE = PLATFORM_CONFIGS["linux-x64"].buildImage;
const RUNTIME_IMAGE = PLATFORM_CONFIGS["linux-x64"].runtimeImage;
const POLICY_PATH = PLATFORM_CONFIGS["linux-x64"].policyPath;
const CONTAINERFILE_PATH = join(__dirname, "Containerfile");
const INSPECTOR_PATH = STAGED_PROCESS
  ? join(__dirname, "release-native-binary-inspector.cjs")
  : join(__dirname, "..", "release-native-binary-inspector.cjs");
const OUTPUT_MARKER = ".sagejs-linux-baseline-output.json";
const OUTPUT_SCHEMA = "sagejs.linux-baseline-output-v1";
const RECEIPT_SCHEMA = "sagejs.linux-baseline-receipt-v1";
const IMAGE_OWNER_LABEL = "org.sagemath.sagejs.linux-baseline.token";
const GCC_PATH = "/opt/rh/gcc-toolset-14/root/usr/bin/gcc";
const PNPM_VERSION = "11.9.0";
const PNPM_TARBALL_URL = `https://registry.npmjs.org/pnpm/-/pnpm-${PNPM_VERSION}.tgz`;
const PNPM_TARBALL_SHA512 =
  "bd682d5d03fe525ef7c9fd6780c6884d1e756ac4c9c9fe00c538782824310dcf" +
  "90e3ddc4f53835f06dfaebd5085e41855e0bcbb3b60de2ac5bbab89e5036f03b";
const PNPM_TARBALL_INTEGRITY =
  "sha512-vWgtXQP+Ul73yf1ngMaITR51asTJyf4AxTh4KCQxDc+Q493E9Tg18G3669UIXkGFXgvLs7YN4qxburieUDbwOw==";
const NODE_CONFIGURE_ARGUMENTS = Object.freeze([
  `--prefix=/opt/sagejs-node`,
  "--partly-static",
]);

function parseArguments(arguments_) {
  const result = {
    allInputs: false,
    engine: undefined,
    keepImage: false,
    output: undefined,
    platform: DEFAULT_PLATFORM,
    sourceRef: "HEAD",
    sourceCommit: undefined,
    stagedContext: undefined,
  };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--all-inputs") result.allInputs = true;
    else if (argument === "--engine") result.engine = arguments_[++index];
    else if (argument === "--keep-image") result.keepImage = true;
    else if (argument === "--output") result.output = resolve(arguments_[++index] ?? "");
    else if (argument === "--platform") result.platform = arguments_[++index] ?? "";
    else if (argument === "--source-ref") result.sourceRef = arguments_[++index] ?? "";
    else if (argument === "--source-commit") result.sourceCommit = arguments_[++index] ?? "";
    else if (argument === "--staged-context") result.stagedContext = resolve(arguments_[++index] ?? "");
    else if (argument === "--help" || argument === "-h") return { help: true };
    else throw new Error(`unknown argument: ${argument}`);
  }
  if (result.engine && !["docker", "podman"].includes(result.engine)) {
    throw new Error("--engine must be docker or podman");
  }
  if (!Object.hasOwn(PLATFORM_CONFIGS, result.platform)) {
    throw new Error(
      `--platform must be one of ${Object.keys(PLATFORM_CONFIGS).join(", ")}`,
    );
  }
  result.output ||= join(
    ROOT,
    "build",
    result.platform === "linux-x64" ? "linux-baseline" : `linux-baseline-${result.platform}`,
  );
  if (!result.sourceRef) throw new Error("--source-ref must not be empty");
  if ((result.sourceCommit || result.stagedContext) && !STAGED_PROCESS) {
    throw new Error("internal staged arguments require the staged release process");
  }
  if (STAGED_PROCESS) {
    assert.match(result.sourceCommit, /^[0-9a-f]{40}$/);
    if (!result.stagedContext) throw new Error("the staged release context is missing");
  }
  return result;
}

function platformConfig(platform) {
  const config = PLATFORM_CONFIGS[platform];
  if (!config) throw new Error(`unsupported Linux baseline platform ${platform}`);
  return config;
}

function containerPlatform(config) {
  return `linux/${config.containerArchitecture}`;
}

function normalizeContainerArchitecture(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["amd64", "x64", "x86_64"].includes(normalized)) return "amd64";
  if (["arm64", "aarch64"].includes(normalized)) return "arm64";
  throw new Error(`unsupported container engine architecture ${JSON.stringify(value)}`);
}

function assertNativeEngineArchitecture(engine, config, options = {}) {
  const spawn = options.spawn || spawnSync;
  const result = spawn(engine, ["info", "--format", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${engine} could not report its server architecture: ` +
        `${result.stderr || result.stdout}`,
    );
  }
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${engine} returned invalid JSON from info`, { cause: error });
  }
  const observed =
    report.Architecture ??
    report.architecture ??
    report.Host?.Arch ??
    report.host?.arch;
  const architecture = normalizeContainerArchitecture(observed);
  assert.equal(
    architecture,
    config.containerArchitecture,
    `refusing emulated ${containerPlatform(config)} release build on native ` +
      `linux/${architecture}`,
  );
  return {
    architecture,
    reportedArchitecture: observed,
    selectedPlatform: containerPlatform(config),
  };
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

function assertRuntimeOmitsLibatomic(engine, config = platformConfig(DEFAULT_PLATFORM)) {
  const result = spawnSync(
    engine,
    [
      "run",
      "--rm",
      "--platform",
      containerPlatform(config),
      config.runtimeImage,
      "rpm",
      "-q",
      "libatomic",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.error) throw result.error;
  if (result.status !== 1 || !/not installed/i.test(result.stdout + result.stderr)) {
    throw new Error(
      "the baseline runtime unexpectedly contains libatomic: " +
        `${result.stdout}${result.stderr}`,
    );
  }
  return {
    image: config.runtimeImage,
    libatomicPackagePresent: false,
  };
}

function compilerIdentity(engine, config = platformConfig(DEFAULT_PLATFORM)) {
  const program = [
    "set -eu",
    `printf "path=%s\\n" "${GCC_PATH}"`,
    `printf "version=%s\\n" "$(${GCC_PATH} -dumpfullversion -dumpversion)"`,
    `printf "target=%s\\n" "$(${GCC_PATH} -dumpmachine)"`,
  ].join("; ");
  const output = run(
    engine,
    [
      "run",
      "--rm",
      "--platform",
      containerPlatform(config),
      config.buildImage,
      "sh",
      "-c",
      program,
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    },
  ).stdout;
  return Object.fromEntries(
    output
      .trim()
      .split("\n")
      .map((line) => line.split(/=(.*)/s).slice(0, 2)),
  );
}

function sha256File(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

function releaseAuthorityIdentity(options = {}) {
  const config = platformConfig(options.platform || DEFAULT_PLATFORM);
  const files = {
    containerfile: options.containerfile || CONTAINERFILE_PATH,
    policy: options.policy || config.policyPath,
    releaseDriver: options.releaseDriver || __filename,
    releaseInspector: options.releaseInspector || INSPECTOR_PATH,
  };
  return Object.fromEntries(
    Object.entries(files).map(([name, filename]) => [name, { sha256: sha256File(filename) }]),
  );
}

function resolveSourceCommit(sourceRef, options = {}) {
  const root = options.root || ROOT;
  return run("git", ["rev-parse", `${sourceRef}^{commit}`], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).stdout.trim();
}

function stageReleaseAuthority(directory, options = {}) {
  const config = platformConfig(options.platform || DEFAULT_PLATFORM);
  const sources = {
    containerfile: options.containerfile || CONTAINERFILE_PATH,
    policy: options.policy || config.policyPath,
    releaseDriver: options.releaseDriver || __filename,
    releaseInspector: options.releaseInspector || INSPECTOR_PATH,
  };
  mkdirSync(directory);
  const paths = {};
  for (const [name, source] of Object.entries(sources)) {
    const destination = join(directory, basename(source));
    copyFileSync(source, destination);
    chmodSync(destination, 0o400);
    paths[name] = destination;
  }
  const sourceCommit = options.sourceCommit;
  assert.match(sourceCommit, /^[0-9a-f]{40}$/);
  paths.sourceCommit = join(directory, "source-commit");
  writeFileSync(paths.sourceCommit, `${sourceCommit}\n`, { mode: 0o400 });
  return {
    identity: releaseAuthorityIdentity({ ...paths, platform: options.platform }),
    paths,
    sourceCommit: readFileSync(paths.sourceCommit, "utf8").trim(),
  };
}

function loadStagedAuthority(context, sourceCommit, platform = DEFAULT_PLATFORM) {
  const config = platformConfig(platform);
  const directory = join(context, ".authority");
  const paths = {
    containerfile: join(directory, "Containerfile"),
    policy: join(directory, basename(config.policyPath)),
    releaseDriver: join(directory, "release-inputs.cjs"),
    releaseInspector: join(directory, "release-native-binary-inspector.cjs"),
    sourceCommit: join(directory, "source-commit"),
  };
  const stagedCommit = readFileSync(paths.sourceCommit, "utf8").trim();
  assert.equal(stagedCommit, sourceCommit);
  return {
    identity: releaseAuthorityIdentity({ ...paths, platform }),
    paths,
    sourceCommit: stagedCommit,
  };
}

function launchStagedRelease(arguments_, options = {}) {
  const root = options.root || ROOT;
  const spawn = options.spawn || spawnSync;
  const sourceRef = parseArguments(arguments_).sourceRef || "HEAD";
  const platform = parseArguments(arguments_).platform;
  const sourceCommit = resolveSourceCommit(sourceRef, { root });
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-linux-baseline-launch-"));
  const context = join(temporary, "context");
  mkdirSync(context);
  const authority = stageReleaseAuthority(join(context, ".authority"), {
    ...(options.authoritySources || {}),
    platform,
    sourceCommit,
  });
  try {
    options.beforeExec?.(authority);
    const result = spawn(
      options.executable || process.execPath,
      [
        authority.paths.releaseDriver,
        ...arguments_,
        "--source-commit",
        sourceCommit,
        "--staged-context",
        context,
      ],
      {
        env: {
          ...process.env,
          SAGEJS_LINUX_BASELINE_ROOT: root,
          SAGEJS_LINUX_BASELINE_STAGED: "1",
        },
        stdio: "inherit",
      },
    );
    if (result.error) throw result.error;
    return result.status ?? 1;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function allocatePrivateImage(engine, options = {}) {
  const spawn = options.spawn || spawnSync;
  const entropy = options.randomBytes || randomBytes;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const token = entropy(24).toString("hex");
    const tag = `sagejs-linux-baseline:${token}`;
    const inspected = spawn(engine, ["image", "inspect", tag], { stdio: "ignore" });
    if (inspected.error && inspected.error.code !== "ENOENT") throw inspected.error;
    if (inspected.status !== 0) return { tag, token };
  }
  throw new Error("could not allocate a private Linux baseline image tag");
}

function removeOwnedImage(engine, image, options = {}) {
  const spawn = options.spawn || spawnSync;
  const inspected = spawn(engine, ["image", "inspect", image.tag], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (inspected.error || inspected.status !== 0) return false;
  let labels;
  try {
    labels = JSON.parse(inspected.stdout)?.[0]?.Config?.Labels;
  } catch {
    return false;
  }
  if (labels?.[IMAGE_OWNER_LABEL] !== image.token) return false;
  const removed = spawn(engine, ["image", "rm", image.tag], { stdio: "ignore" });
  return !removed.error && removed.status === 0;
}

function proveSeaTemplate(
  engine,
  nodeExecutable,
  policyPath = platformConfig(DEFAULT_PLATFORM).policyPath,
  config = platformConfig(DEFAULT_PLATFORM),
) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-linux-sea-"));
  try {
    const main = join(directory, "main.cjs");
    const configFile = join(directory, "sea-config.json");
    const executable = join(directory, "sagejs-sea-smoke");
    writeFileSync(main, 'console.log("sagejs-linux-sea-ok")\n');
    writeFileSync(
      configFile,
      `${JSON.stringify({
        main: "main.cjs",
        output: "sagejs-sea-smoke",
        disableExperimentalSEAWarning: true,
        useSnapshot: false,
        useCodeCache: false,
      })}\n`,
    );
    run(nodeExecutable, ["--build-sea", basename(configFile)], { cwd: directory });
    const inspection = assertNoLibatomic(
      assertNativeInputs(
        [{ label: "sagejs-sea-smoke", path: executable, role: "sea-smoke" }],
        JSON.parse(readFileSync(policyPath, "utf8")),
      ),
      "assembled SEA smoke",
    );
    const stdout = run(engine, [
      "run",
      "--rm",
      "--platform",
      containerPlatform(config),
      "--volume",
      `${directory}:/candidate:ro,Z`,
      config.runtimeImage,
      "/candidate/sagejs-sea-smoke",
    ], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    }).stdout.trim();
    assert.equal(stdout, "sagejs-linux-sea-ok");
    return { inspection, stdout };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function exportGitArchive(sourceCommit, destination, options = {}) {
  assert.match(sourceCommit, /^[0-9a-f]{40}$/);
  const descriptor = openSync(destination, "w");
  try {
    const result = spawnSync("git", ["archive", "--format=tar", sourceCommit], {
      cwd: options.root || ROOT,
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

function validateReleaseInputs(
  directory,
  policyPath = platformConfig(DEFAULT_PLATFORM).policyPath,
) {
  const inputs = listNativeInputs(directory);
  assert.ok(inputs.some(({ label }) => label === "node"), "Node template is missing");
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  return assertNoLibatomic(assertNativeInputs(inputs, policy), "release input set");
}

function assertNoLibatomic(report, label) {
  assert.equal(
    (report?.aggregate?.dependencies ?? []).some(
      (dependency) => dependency.toLowerCase() === "libatomic.so.1",
    ),
    false,
    `${label} depends on libatomic.so.1`,
  );
  return report;
}

function assertPortableMathProfile(
  profile,
  config = platformConfig(DEFAULT_PLATFORM),
) {
  assert.equal(profile?.schema, "sagejs.native-math-profile-v1");
  assert.equal(profile.effectiveProfile, "portable");
  assert.equal(profile.requestedProfile, "portable");
  assert.equal(profile.cpu, null);
  assert.equal(profile.abi?.platform, "linux");
  assert.equal(profile.abi?.arch, config.arch);
  assert.equal(profile.compilers?.c?.nativeFlag, null);
  assert.equal(profile.compilers?.cxx?.nativeFlag, null);
  if (config.arch === "x64") {
    assert.equal(profile.buildOptions?.gmp?.configure?.includes("--enable-fat"), true);
    assert.equal(profile.buildOptions?.fflas?.gmpConfigure?.includes("--enable-fat"), true);
  } else {
    assert.equal(profile.cpuPolicy?.baseline, "armv8-a");
    assert.equal(profile.buildOptions?.gmp?.cflags?.includes("-march=armv8-a"), true);
    assert.equal(profile.buildOptions?.fflas?.archnative, false);
  }
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
  const cpuFlags = buildTokens.filter((token) =>
    /^-(?:march|mcpu|mtune)(?:=|$)/.test(token),
  );
  assert.deepEqual(
    [...new Set(cpuFlags)].sort(),
    config.arch === "arm64" ? ["-march=armv8-a"] : [],
    "portable mathematics profile contains a host CPU compiler flag",
  );
  return profile;
}

function assertSafeOutputDirectory(output) {
  const candidate = resolve(output);
  const forbidden = new Set([parse(candidate).root, resolve(homedir()), ROOT]);
  if (forbidden.has(candidate)) {
    throw new Error(`refusing broad Linux baseline output directory ${candidate}`);
  }
}

function assertOwnedOutputDirectory(directory) {
  const marker = join(directory, OUTPUT_MARKER);
  let stat;
  try {
    if (!lstatSync(directory).isDirectory()) {
      throw new Error("output is not a directory");
    }
    stat = lstatSync(marker, { throwIfNoEntry: false });
  } catch (error) {
    throw new Error(`refusing to replace unowned Linux baseline output ${directory}`, {
      cause: error,
    });
  }
  if (!stat?.isFile()) {
    throw new Error(`refusing to replace unowned Linux baseline output ${directory}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(marker, "utf8"));
  } catch (error) {
    throw new Error(`invalid Linux baseline ownership marker in ${directory}`, {
      cause: error,
    });
  }
  if (parsed.schema !== OUTPUT_SCHEMA) {
    throw new Error(`invalid Linux baseline ownership marker in ${directory}`);
  }
}

function publishReleaseOutput(source, destination, receipt) {
  assertSafeOutputDirectory(destination);
  mkdirSync(dirname(destination), { recursive: true });
  const staging = mkdtempSync(
    join(dirname(destination), `.${basename(destination)}.publish-`),
  );
  let previous = null;
  try {
    copyFileTree(source, staging);
    writeFileSync(
      join(staging, "linux-baseline-receipt.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    writeFileSync(
      join(staging, OUTPUT_MARKER),
      `${JSON.stringify({ schema: OUTPUT_SCHEMA })}\n`,
    );
    if (existsSync(destination)) {
      assertOwnedOutputDirectory(destination);
      previous = mkdtempSync(
        join(dirname(destination), `.${basename(destination)}.previous-`),
      );
      rmSync(previous, { recursive: true });
      renameSync(destination, previous);
    }
    try {
      renameSync(staging, destination);
    } catch (error) {
      if (previous) renameSync(previous, destination);
      throw error;
    }
    if (previous) rmSync(previous, { recursive: true });
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function buildReleaseInputs(options) {
  if (!STAGED_PROCESS || !options.stagedContext || !options.sourceCommit) {
    throw new Error(
      "authoritative Linux release builds require the staged launcher process",
    );
  }
  assertSafeOutputDirectory(options.output);
  const engine = selectEngine(options.engine);
  const config = platformConfig(options.platform);
  const engineArchitecture = assertNativeEngineArchitecture(engine, config);
  const temporary = dirname(options.stagedContext);
  const context = options.stagedContext;
  const extracted = join(temporary, "extracted");
  const authority = loadStagedAuthority(context, options.sourceCommit, options.platform);
  const image = allocatePrivateImage(engine);
  let container = null;
  try {
    mkdirSync(extracted);
    if (options.allInputs) {
      exportGitArchive(authority.sourceCommit, join(context, "sagejs.tar"));
    } else {
      writeFileSync(join(context, "sagejs.tar"), "");
    }
    const target = options.allInputs ? "release-inputs" : "node-artifact";
    run(engine, [
      "build",
      "--platform",
      containerPlatform(config),
      "--file",
      authority.paths.containerfile,
      "--target",
      target,
      "--tag",
      image.tag,
      "--label",
      `${IMAGE_OWNER_LABEL}=${image.token}`,
      "--build-arg",
      `BUILD_IMAGE=${config.buildImage}`,
      "--build-arg",
      `NODE_SOURCE_SHA256=${NODE_SOURCE_SHA256}`,
      "--build-arg",
      `NODE_VERSION=${NODE_VERSION}`,
      "--build-arg",
      `PNPM_TARBALL_SHA512=${PNPM_TARBALL_SHA512}`,
      "--build-arg",
      `PNPM_TARBALL_URL=${PNPM_TARBALL_URL}`,
      context,
    ]);
    // Scratch artifact stages have neither CMD nor ENTRYPOINT. Supplying a
    // harmless command makes both Docker and Podman create an extractable
    // container without changing or executing the candidate binary.
    container = run(
      engine,
      [
        "create",
        "--platform",
        containerPlatform(config),
        image.tag,
        "/release-inputs/node",
        "--version",
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"],
      },
    ).stdout.trim();
    if (!container) throw new Error(`${engine} create did not return a container id`);
    run(engine, ["cp", `${container}:/release-inputs/.`, extracted]);

    const report = validateReleaseInputs(extracted, authority.paths.policy);
    const mathProfile = options.allInputs
      ? assertPortableMathProfile(
          JSON.parse(readFileSync(join(extracted, "native-math-profile.json"), "utf8")),
          config,
        )
      : null;
    const runtime = assertRuntimeOmitsLibatomic(engine, config);
    const runtimeProbe = run(engine, [
      "run",
      "--rm",
      "--platform",
      containerPlatform(config),
      "--volume",
      `${extracted}:/candidate:ro,Z`,
      config.runtimeImage,
      "/candidate/node",
      "--version",
    ], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    }).stdout.trim();
    assert.equal(runtimeProbe, `v${NODE_VERSION}`);
    const seaProbe = proveSeaTemplate(
      engine,
      join(extracted, "node"),
      authority.paths.policy,
      config,
    );
    const receipt = {
      schema: RECEIPT_SCHEMA,
      authority: authority.identity,
      buildImage: config.buildImage,
      compiler: compilerIdentity(engine, config),
      containerEngine: {
        name: engine,
        ...engineArchitecture,
      },
      configureArguments: NODE_CONFIGURE_ARGUMENTS,
      nodeSourceSha256: NODE_SOURCE_SHA256,
      nodeVersion: NODE_VERSION,
      pnpmDistribution: {
        integrity: PNPM_TARBALL_INTEGRITY,
        sha512: PNPM_TARBALL_SHA512,
        url: PNPM_TARBALL_URL,
        version: PNPM_VERSION,
      },
      nativeMathProfile: mathProfile,
      policy: JSON.parse(readFileSync(authority.paths.policy, "utf8")),
      platform: options.platform,
      runtimeImage: config.runtimeImage,
      runtimeProbe: {
        ...runtime,
        exitStatus: 0,
        stdout: runtimeProbe,
      },
      seaProbe,
      requestedSourceRef: options.sourceRef,
      sourceCommit: authority.sourceCommit,
      inspection: report,
    };
    publishReleaseOutput(extracted, options.output, receipt);
    process.stdout.write(`Linux baseline inputs: ${options.output}\n`);
    return receipt;
  } finally {
    if (container) spawnSync(engine, ["rm", "--force", container], { stdio: "ignore" });
    if (!options.keepImage) removeOwnedImage(engine, image);
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
  --output PATH      Output directory (default: build/linux-baseline-PLATFORM)
  --platform NAME    linux-x64 or linux-arm64 (default: current host)
  --source-ref REF   Committed Git tree used by --all-inputs (default: HEAD)
`);
}

module.exports = {
  BUILD_IMAGE,
  GCC_PATH,
  IMAGE_OWNER_LABEL,
  NODE_CONFIGURE_ARGUMENTS,
  NODE_SOURCE_SHA256,
  NODE_VERSION,
  OUTPUT_SCHEMA,
  PNPM_TARBALL_INTEGRITY,
  PNPM_TARBALL_SHA512,
  PNPM_TARBALL_URL,
  PNPM_VERSION,
  POLICY_PATH,
  PLATFORM_CONFIGS,
  RUNTIME_IMAGE,
  allocatePrivateImage,
  assertNoLibatomic,
  assertNativeEngineArchitecture,
  assertPortableMathProfile,
  assertSafeOutputDirectory,
  assertRuntimeOmitsLibatomic,
  buildReleaseInputs,
  compilerIdentity,
  exportGitArchive,
  launchStagedRelease,
  listNativeInputs,
  loadStagedAuthority,
  parseArguments,
  platformConfig,
  normalizeContainerArchitecture,
  publishReleaseOutput,
  releaseAuthorityIdentity,
  removeOwnedImage,
  resolveSourceCommit,
  proveSeaTemplate,
  selectEngine,
  stageReleaseAuthority,
  validateReleaseInputs,
};

if (require.main === module) {
  try {
    const arguments_ = process.argv.slice(2);
    if (!STAGED_PROCESS) {
      process.exitCode = launchStagedRelease(arguments_);
    } else {
      const options = parseArguments(arguments_);
      if (options.help) help();
      else buildReleaseInputs(options);
    }
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  }
}

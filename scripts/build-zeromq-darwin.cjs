#!/usr/bin/env node
"use strict";

const { createHash, randomUUID } = require("node:crypto");
const {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, dirname, join, relative, resolve, sep } = require("node:path");
const { createRequire } = require("node:module");
const { execFileSync, spawnSync } = require("node:child_process");

const { macosReleaseMinimum } = require("./darwin-native.cjs");
const {
  ZEROMQ_SOURCE,
  canonicalJson,
  createRuntimeNativeDependencyReceipt,
  readRuntimeNativeDependencyReceipt,
  sha256Bytes,
} = require("./runtime-native-dependency-receipt.cjs");

const root = resolve(__dirname, "..");
const buildRoot = join(root, "build", "zeromq-native");
const selectionFilename = join(buildRoot, "selection.json");
const SELECTION_SCHEMA = "sagejs.zeromq-native-selection-v1";
const VCPKG_BASELINE = "608d1dbcd6969679f82b1ca6b89d58939c9b228e";
const VCPKG_URL = "https://github.com/microsoft/vcpkg.git";
const PROJECT_OPTIONS_SHA256 =
  ZEROMQ_SOURCE.projectOptionsSha256;
const PROJECT_OPTIONS_URL =
  "https://github.com/aminya/project_options/archive/refs/tags/${PROJECT_OPTIONS_VERSION}.zip";
const SOURCE_URL =
  ZEROMQ_SOURCE.url;

function sha256File(filename) {
  return sha256Bytes(readFileSync(filename));
}

function commandIdentity(command, arguments_ = ["--version"], environment = process.env) {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `required ZeroMQ build command failed: ${command} ${arguments_.join(" ")}`,
      { cause: result.error },
    );
  }
  return {
    arguments: arguments_,
    command: basename(command),
    output: [result.stdout, result.stderr]
      .map((part) => String(part ?? "").trim())
      .filter(Boolean)
      .join("\n"),
  };
}

function darwinBuildToolEnvironment(environment) {
  const selected = { ...environment };
  if (spawnSync("libtoolize", ["--version"], {
    env: selected,
    stdio: "ignore",
  }).status === 0) return selected;
  const brew = spawnSync("brew", ["--prefix", "libtool"], {
    encoding: "utf8",
    env: selected,
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (brew.status === 0) {
    const gnubin = join(brew.stdout.trim(), "libexec", "gnubin");
    if (existsSync(gnubin)) {
      selected.PATH = `${gnubin}:${selected.PATH || "/usr/bin:/bin"}`;
    }
  }
  return selected;
}

function targetArchitecture(arch = process.arch) {
  if (arch === "arm64") return "arm64";
  if (arch === "x64") return "x64";
  throw new Error(`unsupported macOS ZeroMQ architecture: ${arch}`);
}

function tripletContents(arch, deploymentTarget) {
  const cmakeArch = arch === "x64" ? "x86_64" : "arm64";
  return [
    `set(VCPKG_TARGET_ARCHITECTURE ${arch})`,
    "set(VCPKG_CRT_LINKAGE dynamic)",
    "set(VCPKG_LIBRARY_LINKAGE static)",
    "set(VCPKG_CMAKE_SYSTEM_NAME Darwin)",
    `set(VCPKG_OSX_ARCHITECTURES ${cmakeArch})`,
    `set(VCPKG_OSX_DEPLOYMENT_TARGET ${deploymentTarget})`,
    "",
  ].join("\n");
}

function patchProjectOptionsHash(cmakeLists) {
  const before = `  URL ${PROJECT_OPTIONS_URL}\n`;
  if (!cmakeLists.includes(before)) {
    throw new Error("zeromq CMake source no longer has the audited project_options fetch");
  }
  return cmakeLists.replace(
    before,
    `${before}  URL_HASH SHA256=${PROJECT_OPTIONS_SHA256}\n`,
  );
}

function selectedBuildEnvironment(environment, values) {
  const result = { ...environment };
  for (const name of Object.keys(result)) {
    if (
      name.startsWith("npm_config_zmq_") ||
      name === "npm_config_macosx_deployment_target" ||
      name === "npm_config_build_from_source" ||
      name.startsWith("VCPKG_") ||
      name === "MACOSX_DEPLOYMENT_TARGET" ||
      name === "CMAKE_POLICY_VERSION_MINIMUM"
    ) delete result[name];
  }
  Object.assign(result, values, {
    CMAKE_POLICY_VERSION_MINIMUM: "3.5",
    MACOSX_DEPLOYMENT_TARGET: values.deploymentTarget,
    npm_config_build_from_source: "true",
    npm_config_macosx_deployment_target: values.deploymentTarget,
    npm_config_zmq_curve: "true",
    npm_config_zmq_draft: "true",
    npm_config_zmq_enable_sanitizer_undefined: "false",
    npm_config_zmq_no_sync_resolve: "false",
    npm_config_zmq_sodium: "true",
    npm_config_zmq_websockets: "false",
    npm_config_zmq_websockets_secure: "false",
    SOURCE_DATE_EPOCH: "0",
    ZERO_AR_DATE: "1",
  });
  delete result.deploymentTarget;
  return result;
}

function regularFile(filename, label) {
  const information = lstatSync(filename);
  if (
    !information.isFile() ||
    information.isSymbolicLink() ||
    realpathSync.native(filename) !== resolve(filename)
  ) throw new Error(`${label} is not a regular non-symlink file: ${filename}`);
  return filename;
}

function containedPath(base, path, label) {
  const rootPath = resolve(base);
  const filename = resolve(base, path);
  const lexical = relative(rootPath, filename);
  if (
    lexical === "" ||
    lexical === ".." ||
    lexical.startsWith(`..${sep}`) ||
    resolve(filename) !== filename
  ) throw new Error(`${label} escapes ${rootPath}`);
  return filename;
}

function writeJsonAtomic(filename, value) {
  mkdirSync(dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    renameSync(temporary, filename);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function readZeroMQSelection(options = {}) {
  const filename = options.filename || selectionFilename;
  const base = options.buildRoot || dirname(filename);
  const selection = JSON.parse(readFileSync(filename, "utf8"));
  if (
    selection?.schema !== SELECTION_SCHEMA ||
    Object.keys(selection).sort().join(",") !==
      ["addon", "receipt", "receiptIdentitySha256", "schema"].sort().join(",") ||
    !/^[0-9a-f]{64}$/.test(selection.receiptIdentitySha256 ?? "")
  ) throw new Error("ZeroMQ native selection is invalid");
  const addon = regularFile(
    containedPath(base, selection.addon, "ZeroMQ addon selection"),
    "ZeroMQ addon selection",
  );
  const receiptFilename = regularFile(
    containedPath(base, selection.receipt, "ZeroMQ receipt selection"),
    "ZeroMQ receipt selection",
  );
  const receipt = readRuntimeNativeDependencyReceipt(receiptFilename, {
    addonBytes: readFileSync(addon),
  });
  if (
    receipt === null ||
    receipt.identitySha256 !== selection.receiptIdentitySha256
  ) throw new Error("ZeroMQ native selection receipt is stale or invalid");
  return { addon, receipt, receiptFilename, selection };
}

function downloadSource(archive, environment) {
  mkdirSync(dirname(archive), { recursive: true });
  if (existsSync(archive) && sha256File(archive) === ZEROMQ_SOURCE.archiveSha256) {
    return;
  }
  rmSync(archive, { force: true });
  const temporary = `${archive}.${process.pid}.${randomUUID()}.tmp`;
  try {
    execFileSync("curl", [
      "--fail",
      "--location",
      "--retry",
      "3",
      "--output",
      temporary,
      SOURCE_URL,
    ], { env: environment, stdio: "inherit" });
    if (sha256File(temporary) !== ZEROMQ_SOURCE.archiveSha256) {
      throw new Error("downloaded zeromq source archive failed SHA-256 verification");
    }
    renameSync(temporary, archive);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function findAddon(directory) {
  const matches = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const filename = join(current, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile() && entry.name.endsWith(".node")) matches.push(filename);
    }
  };
  visit(directory);
  if (matches.length !== 1) {
    throw new Error(`expected one source-built ZeroMQ addon, found ${matches.length}`);
  }
  return matches[0];
}

function preparePinnedVcpkg(home, environment) {
  const repository = join(home, "vcpkg");
  mkdirSync(repository, { recursive: true });
  execFileSync("git", ["init", "--quiet", repository], {
    env: environment,
    stdio: "inherit",
  });
  execFileSync(
    "git",
    ["-C", repository, "remote", "add", "origin", VCPKG_URL],
    {
      env: environment,
      stdio: "inherit",
    },
  );
  execFileSync("git", [
    "-C",
    repository,
    "fetch",
    "--depth=1",
    "origin",
    VCPKG_BASELINE,
  ], {
    env: environment,
    stdio: "inherit",
  });
  execFileSync("git", ["-C", repository, "checkout", "--detach", "FETCH_HEAD"], {
    env: environment,
    stdio: "inherit",
  });
  execFileSync(join(repository, "bootstrap-vcpkg.sh"), ["-disableMetrics"], {
    cwd: repository,
    env: environment,
    stdio: "inherit",
  });
  const revision = execFileSync("git", ["-C", repository, "rev-parse", "HEAD"], {
    encoding: "utf8",
    env: environment,
  }).trim();
  if (revision !== VCPKG_BASELINE) {
    throw new Error(`vcpkg checkout resolved to unexpected revision ${revision}`);
  }
  return repository;
}

function buildZeroMQDarwin(options = {}) {
  if (process.platform !== "darwin" && options.allowNonDarwin !== true) {
    throw new Error("the source-owned ZeroMQ addon must be built on macOS");
  }
  const environment = darwinBuildToolEnvironment(
    options.environment || process.env,
  );
  const arch = targetArchitecture(options.arch || process.arch);
  const deploymentTarget = options.deploymentTarget || macosReleaseMinimum(environment);
  const zeromqPackage = dirname(require.resolve("zeromq/package.json"));
  const packageRequire = createRequire(join(zeromqPackage, "package.json"));
  const cmakeTs = packageRequire.resolve("cmake-ts/build/main.js");
  const cmakeTsPackageRoot = dirname(dirname(cmakeTs));
  const cmakeTsPackage = JSON.parse(
    readFileSync(join(cmakeTsPackageRoot, "package.json"), "utf8"),
  );
  const nodeAddonApi = dirname(packageRequire.resolve("node-addon-api/package.json"));
  const nodeAddonApiPackage = JSON.parse(
    readFileSync(join(nodeAddonApi, "package.json"), "utf8"),
  );
  const sdkRoot = execFileSync("xcrun", ["--sdk", "macosx", "--show-sdk-path"], {
    encoding: "utf8",
    env: environment,
  }).trim();
  const toolchain = {
    autoconf: commandIdentity("autoconf", ["--version"], environment),
    automake: commandIdentity("automake", ["--version"], environment),
    cmake: commandIdentity("cmake", ["--version"], environment),
    libtoolize: commandIdentity("libtoolize", ["--version"], environment),
    ninja: commandIdentity("ninja", ["--version"], environment),
    node: commandIdentity(process.execPath, ["--version"], environment),
  };
  const triplet = tripletContents(arch, deploymentTarget);
  const declaration = {
    build: {
      cmakePolicyVersionMinimum: "3.5",
      features: {
        curve: true,
        draft: true,
        noSyncResolve: false,
        sodium: true,
        websockets: false,
        websocketsSecure: false,
      },
      projectOptionsSha256: PROJECT_OPTIONS_SHA256,
      tripletSha256: sha256Bytes(triplet),
      vcpkgBaseline: VCPKG_BASELINE,
      vcpkgUrl: VCPKG_URL,
    },
    source: { ...ZEROMQ_SOURCE },
    target: {
      arch,
      deployment: { macos: deploymentTarget },
      nodeNapi: process.versions.napi,
      nodeVersion: process.versions.node,
      platform: "darwin",
    },
    toolchain: {
      cmakeTs: cmakeTsPackage.version,
      nodeAddonApi: nodeAddonApiPackage.version,
      sdk: basename(sdkRoot),
      tools: toolchain,
    },
  };
  const key = sha256Bytes(canonicalJson(declaration));
  const artifactDirectory = join(buildRoot, "artifacts", key);
  const addon = join(artifactDirectory, "zeromq.node");
  const receiptFilename = join(artifactDirectory, "receipt.json");
  if (existsSync(addon) && existsSync(receiptFilename)) {
    const receipt = readRuntimeNativeDependencyReceipt(receiptFilename, {
      addonBytes: readFileSync(addon),
      maximumMinimumMacos: deploymentTarget,
      target: declaration.target,
    });
    if (
      receipt !== null &&
      canonicalJson(receipt.build) === canonicalJson(declaration.build) &&
      canonicalJson(receipt.source) === canonicalJson(declaration.source) &&
      canonicalJson(receipt.toolchain) === canonicalJson(declaration.toolchain)
    ) {
      writeJsonAtomic(selectionFilename, {
        addon: relative(buildRoot, addon),
        receipt: relative(buildRoot, receiptFilename),
        receiptIdentitySha256: receipt.identitySha256,
        schema: SELECTION_SCHEMA,
      });
      return readZeroMQSelection();
    }
  }

  rmSync(artifactDirectory, { force: true, recursive: true });
  mkdirSync(join(buildRoot, "artifacts"), { recursive: true });
  const work = mkdtempSync(join(buildRoot, `.work-${key.slice(0, 12)}-`));
  try {
    const archive = join(buildRoot, "sources", "zeromq-6.5.0.tgz");
    downloadSource(archive, environment);
    execFileSync("tar", ["-xzf", archive, "-C", work], {
      env: environment,
      stdio: "inherit",
    });
    const source = join(work, "package");
    const sourcePackage = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
    if (sourcePackage.name !== "zeromq" || sourcePackage.version !== "6.5.0") {
      throw new Error("verified archive did not contain zeromq 6.5.0");
    }
    const cmakeLists = join(source, "CMakeLists.txt");
    writeFileSync(
      cmakeLists,
      patchProjectOptionsHash(readFileSync(cmakeLists, "utf8")),
    );
    const overlay = join(work, "triplets");
    mkdirSync(overlay);
    writeFileSync(join(overlay, `${arch}-osx.cmake`), triplet);
    mkdirSync(join(source, "node_modules"));
    symlinkSync(cmakeTsPackageRoot, join(source, "node_modules", "cmake-ts"));
    symlinkSync(nodeAddonApi, join(source, "node_modules", "node-addon-api"));
    const home = join(work, "home");
    const target = join(work, "target");
    const staging = join(work, "staging");
    const binaryCache = join(buildRoot, "vcpkg-binary-cache", `${arch}-${deploymentTarget}`);
    mkdirSync(home, { recursive: true });
    mkdirSync(binaryCache, { recursive: true });
    preparePinnedVcpkg(home, environment);
    const buildEnvironment = selectedBuildEnvironment(environment, {
      HOME: home,
      SDKROOT: sdkRoot,
      VCPKG_DEFAULT_BINARY_CACHE: binaryCache,
      VCPKG_OVERLAY_TRIPLETS: overlay,
      deploymentTarget,
    });
    execFileSync(process.execPath, [
      cmakeTs,
      "build",
      "--package-directory",
      source,
      "--target-directory",
      relative(source, target),
      "--staging-directory",
      relative(source, staging),
    ], {
      cwd: source,
      env: buildEnvironment,
      stdio: "inherit",
    });
    const builtAddon = findAddon(target);
    const temporaryArtifact = mkdtempSync(join(buildRoot, `.artifact-${key.slice(0, 12)}-`));
    try {
      const finalAddon = join(temporaryArtifact, "zeromq.node");
      copyFileSync(builtAddon, finalAddon);
      const addonBytes = readFileSync(finalAddon);
      const receipt = createRuntimeNativeDependencyReceipt({
        ...declaration,
        output: {
          sha256: sha256Bytes(addonBytes),
          size: addonBytes.length,
        },
      });
      writeFileSync(
        join(temporaryArtifact, "receipt.json"),
        `${JSON.stringify(receipt, null, 2)}\n`,
      );
      chmodSync(finalAddon, 0o444);
      chmodSync(join(temporaryArtifact, "receipt.json"), 0o444);
      renameSync(temporaryArtifact, artifactDirectory);
      chmodSync(artifactDirectory, 0o555);
      writeJsonAtomic(selectionFilename, {
        addon: relative(buildRoot, addon),
        receipt: relative(buildRoot, receiptFilename),
        receiptIdentitySha256: receipt.identitySha256,
        schema: SELECTION_SCHEMA,
      });
    } finally {
      if (existsSync(temporaryArtifact)) chmodSync(temporaryArtifact, 0o755);
      rmSync(temporaryArtifact, { force: true, recursive: true });
    }
  } finally {
    rmSync(work, { force: true, recursive: true });
  }
  return readZeroMQSelection();
}

if (require.main === module) {
  const result = buildZeroMQDarwin();
  process.stdout.write(`${JSON.stringify({
    addon: result.addon,
    receipt: result.receiptFilename,
    receiptIdentitySha256: result.receipt.identitySha256,
  }, null, 2)}\n`);
}

module.exports = {
  PROJECT_OPTIONS_SHA256,
  SELECTION_SCHEMA,
  SOURCE_URL,
  VCPKG_BASELINE,
  buildZeroMQDarwin,
  darwinBuildToolEnvironment,
  patchProjectOptionsHash,
  preparePinnedVcpkg,
  readZeroMQSelection,
  selectedBuildEnvironment,
  targetArchitecture,
  tripletContents,
};

#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { inspectBuildReceipt } = require("../../scripts/build-receipt.cjs");

const {
  ADAPTER_SCHEMA,
  BOUNDARIES,
  CENSUS_SCHEMA,
  CENSUS_STATUSES,
  SYSTEMS,
  TERMINAL_STATUSES,
  TIMING_SCHEMA,
  canonicalDigest,
  canonicalJson,
  sha256,
  validateAdapterResponse,
  validateTimingEvent,
} = require("./complex-cubic-frontier-schema.cjs");
const {
  loadFrozenSurveyCorpus,
} = require("./load-complex-cubic-frontier-survey.cjs");

const ROOT = path.resolve(__dirname, "../..");
const READY_MARKER = "SAGEJS_COMPLEX_CUBIC_FRONTIER_READY";
const RESPONSE_MARKER = "SAGEJS_COMPLEX_CUBIC_FRONTIER_RESPONSE|";
const WARMUP_MARKER = "SAGEJS_COMPLEX_CUBIC_FRONTIER_WARMUP|";
const WARMUP_SCHEMA = "sagejs.benchmark/complex-cubic-frontier-warmup-v1";
const WARMUP_ATTESTATION_SCHEMA =
  "sagejs.benchmark/complex-cubic-frontier-warmup-attestation-v2";
const RUNTIME_IDENTITY_SCHEMA =
  "sagejs.benchmark/complex-cubic-frontier-runtime-identity-v1";
const GP_CENSUS_MARKER = "SAGEJS_COMPLEX_CUBIC_GP_CENSUS|";
const GP_TIMING_MARKER = "SAGEJS_COMPLEX_CUBIC_GP_TIMING|";
const MINIMUM_ROOT_NS = 1_200_000_000n;
const RETAINED_ROUNDS = 11;
const CENSUS_PARTS_SCHEMA = "sagejs.benchmark/complex-cubic-frontier-census-part-v1";
const SAGE_CONDITIONAL_REPLAY_CONTRACT =
  "ordinary-object-exact-replay-bypassing-closed-cubic-authority";
const BDF_CLASS_CHARACTER_GRH =
  "GRH: L(s, chi) is nonzero whenever Re(s) > 1/2 for every nontrivial character chi of Cl(K)";
const BELABAS_FRIEDMAN_ZETA_GRH =
  "GRH: zeta_K(s) and zeta_Q(s) are nonzero whenever Re(s) > 1/2";
const NATIVE_RECEIPT_PROOF_CONTRACTS = Object.freeze({
  "exact-empty-generator-base-unconditional": Object.freeze([Object.freeze({
    assumptions: Object.freeze([]),
    theorem: "minkowski-generators-plus-empty-factor-base",
  })]),
  "exact-trivial-presentation-unconditional": Object.freeze([Object.freeze({
    assumptions: Object.freeze([]),
    theorem: "minkowski-generators-plus-trivial-relation-presentation",
  })]),
  "exact-empty-generator-base-conditional-grh": Object.freeze([Object.freeze({
    assumptions: Object.freeze([BDF_CLASS_CHARACTER_GRH]),
    theorem: "belabas-diaz-y-diaz-friedman-generators-plus-empty-factor-base",
  })]),
  "exact-trivial-presentation-conditional-grh": Object.freeze([Object.freeze({
    assumptions: Object.freeze([BDF_CLASS_CHARACTER_GRH]),
    theorem: "belabas-diaz-y-diaz-friedman-generators-plus-trivial-relation-presentation",
  })]),
  "exact-relations-conditional-grh": Object.freeze([
    Object.freeze({
      assumptions: Object.freeze([BELABAS_FRIEDMAN_ZETA_GRH]),
      theorem: "minkowski-generators-plus-belabas-friedman-index-one",
    }),
    Object.freeze({
      assumptions: Object.freeze([
        BDF_CLASS_CHARACTER_GRH,
        BELABAS_FRIEDMAN_ZETA_GRH,
      ]),
      theorem:
        "belabas-diaz-y-diaz-friedman-generators-plus-belabas-friedman-index-one",
    }),
  ]),
});
const DIRECT_CENSUS_PARTITIONS = Object.freeze({
  sagejs: Object.freeze({
    partition: "singleton-global-rank-v1",
    fields_per_shard: 1,
    shard_count: 1000,
  }),
  pari: Object.freeze({
    partition: "timing-stratum-v1",
    fields_per_shard: 50,
    shard_count: 20,
  }),
});
const THREAD_ENV = Object.freeze({
  OPENBLAS_NUM_THREADS: "1",
  OMP_NUM_THREADS: "1",
  MKL_NUM_THREADS: "1",
  BLIS_NUM_THREADS: "1",
  VECLIB_MAXIMUM_THREADS: "1",
  NUMEXPR_NUM_THREADS: "1",
  JULIA_NUM_THREADS: "1",
  FLINT_NUM_THREADS: "1",
});

function usage() {
  return `Usage: node ${path.relative(ROOT, __filename)} MODE --corpus PATH --output PATH [options]

Modes:
  --census              classify all 1,000 fields; timings are non-authoritative
  --timing              run the retained 20 x 50 x 11 timing protocol

Required for --timing:
  --census-file PATH    accepted census from the identical corpus and source tree

Options:
  --corpus PATH        committed content-addressed corpus manifest
  --asset-dir PATH     directory containing the survey asset (default: manifest directory)
  --systems LIST        comma-separated systems (default: sagejs,pari)
  --boundaries LIST     scalar-prepared,fresh-complete (default: both)
  --cpu N               logical CPU used through taskset on Linux (default: 0)
  --census-cpus LIST    isolated direct census workers (default: --cpu only)
  --census-parts-dir P  resumable authenticated parts (default: OUTPUT.parts)
  --no-census-parts     disable checkpoint read/write for exploratory census runs
  --timeout-seconds N   fresh process/system/round timeout (default: 3600)
  --sagejs PATH         Sage.js launcher (default: bin/sagejs)
  --gp PATH             direct GP launcher (default: gp)
  --adapter SYSTEM=PATH generic JSON adapter; repeatable (required for Magma/Hecke)
  --allow-dirty         permit exploratory output, marked non-promotable
  --dry-run             validate and emit the complete execution plan only
  --help                show this text

Conditional semantics are fixed: Sage.js calls K.class_number(proof=False),
direct GP calls bnfinit(...,0), Magma adapters attest Proof := "GRH", and Hecke
adapters attest class_group(...; GRH=true). No timeout cap is recorded as time.`;
}

function parseList(value, allowed, label) {
  const result = String(value).split(",").map((entry) => entry.trim()).filter(Boolean);
  if (result.length === 0 || new Set(result).size !== result.length ||
      result.some((entry) => !allowed.includes(entry))) {
    throw new Error(`${label} must be a unique subset of ${allowed.join(",")}`);
  }
  return result;
}

function positiveInteger(value, label, { zero = false } = {}) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < (zero ? 0 : 1)) {
    throw new Error(`${label} must be a ${zero ? "nonnegative" : "positive"} integer`);
  }
  return result;
}

function cpuList(value, label) {
  const entries = String(value).split(",").map((entry) => entry.trim()).filter(Boolean);
  if (entries.some((entry) => !/^(0|[1-9]\d*)$/.test(entry))) {
    throw new Error(`${label} must use canonical nonnegative integer CPU numbers`);
  }
  const result = entries.map((entry) => positiveInteger(entry, label, { zero: true }));
  if (result.length === 0 || new Set(result).size !== result.length) {
    throw new Error(`${label} must be a nonempty list of unique logical CPUs`);
  }
  return result;
}

function parseArguments(argv) {
  const options = {
    mode: null,
    corpus: null,
    assetDir: null,
    censusFile: null,
    output: null,
    systems: ["sagejs", "pari"],
    boundaries: [...BOUNDARIES],
    cpu: 0,
    censusCpus: null,
    censusPartsDir: null,
    censusPartsEnabled: true,
    timeoutSeconds: 3600,
    sagejs: process.env.SAGEJS_FRONTIER_EXECUTABLE || path.join(ROOT, "bin/sagejs"),
    gp: process.env.GP_ORACLE || process.env.PARI_ORACLE || "gp",
    adapters: {},
    allowDirty: false,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      console.log(usage());
      process.exit(0);
    }
    if (argument === "--census" || argument === "--timing") {
      if (options.mode) throw new Error("choose exactly one mode");
      options.mode = argument.slice(2);
      continue;
    }
    if (argument === "--allow-dirty") { options.allowDirty = true; continue; }
    if (argument === "--dry-run") { options.dryRun = true; continue; }
    if (argument === "--no-census-parts") { options.censusPartsEnabled = false; continue; }
    if (!["--corpus", "--asset-dir", "--census-file", "--output", "--systems", "--boundaries",
      "--cpu", "--census-cpus", "--census-parts-dir", "--timeout-seconds", "--sagejs", "--gp",
      "--adapter"].includes(argument)) {
      throw new Error(`unknown argument: ${argument}`);
    }
    if (index + 1 >= argv.length) throw new Error(`${argument} needs a value`);
    const value = argv[(index += 1)];
    if (argument === "--corpus") options.corpus = path.resolve(value);
    else if (argument === "--asset-dir") options.assetDir = path.resolve(value);
    else if (argument === "--census-file") options.censusFile = path.resolve(value);
    else if (argument === "--output") options.output = path.resolve(value);
    else if (argument === "--systems") options.systems = parseList(value, SYSTEMS, argument);
    else if (argument === "--boundaries") options.boundaries = parseList(value, BOUNDARIES, argument);
    else if (argument === "--cpu") options.cpu = positiveInteger(value, argument, { zero: true });
    else if (argument === "--census-cpus") options.censusCpus = cpuList(value, argument);
    else if (argument === "--census-parts-dir") options.censusPartsDir = path.resolve(value);
    else if (argument === "--timeout-seconds") options.timeoutSeconds = positiveInteger(value, argument);
    else if (argument === "--sagejs") options.sagejs = value;
    else if (argument === "--gp") options.gp = value;
    else {
      const separator = value.indexOf("=");
      if (separator < 1) throw new Error("--adapter must be SYSTEM=PATH");
      const system = value.slice(0, separator);
      if (!SYSTEMS.includes(system)) throw new Error(`unknown adapter system ${system}`);
      options.adapters[system] = path.resolve(value.slice(separator + 1));
    }
  }
  if (!options.mode || !options.corpus || !options.output) {
    throw new Error("one mode, --corpus, and --output are required");
  }
  if (options.mode === "timing" && !options.censusFile) {
    throw new Error("--timing requires --census-file");
  }
  if (options.mode === "timing" && options.censusCpus !== null) {
    throw new Error("--census-cpus is only valid with --census");
  }
  if (options.mode === "timing" && options.censusPartsDir !== null) {
    throw new Error("--census-parts-dir is only valid with --census");
  }
  if (options.mode === "timing" && !options.censusPartsEnabled) {
    throw new Error("--no-census-parts is only valid with --census");
  }
  if (!options.censusPartsEnabled && options.censusPartsDir !== null) {
    throw new Error("--no-census-parts conflicts with --census-parts-dir");
  }
  if (options.censusCpus === null) options.censusCpus = [options.cpu];
  if (options.mode === "census" && options.censusPartsEnabled && options.allowDirty) {
    throw new Error("resumable census parts require a clean Git worktree");
  }
  if (options.mode === "census" && options.censusPartsEnabled && options.censusPartsDir === null) {
    options.censusPartsDir = `${options.output}.parts`;
  }
  if (!options.systems.includes("sagejs") || !options.systems.includes("pari")) {
    throw new Error("frontier evidence requires both sagejs and pari");
  }
  return options;
}

function resolveExecutable(requested) {
  if (!requested) return null;
  const bases = requested.includes("/") || requested.includes("\\")
    ? [path.resolve(requested)]
    : (process.env.PATH || "").split(path.delimiter).map((directory) => path.join(directory, requested));
  for (const candidate of bases) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return fs.realpathSync(candidate);
    } catch {
      // Keep searching PATH.
    }
  }
  return null;
}

function pinnedLaunchWrapperIdentity() {
  const identify = (filename) => {
    if (!fs.existsSync(filename)) return null;
    const status = fs.lstatSync(filename);
    if (!status.isFile() || status.isSymbolicLink()) {
      throw new Error(`frontier launch wrapper must be a regular file: ${filename}`);
    }
    fs.accessSync(filename, fs.constants.X_OK);
    const bytes = fs.readFileSync(filename);
    return {
      path: filename,
      sha256: sha256(bytes),
      bytes: String(bytes.length),
    };
  };
  const payload = {
    schema: "sagejs.benchmark/complex-cubic-launch-wrappers-v1",
    taskset: identify("/usr/bin/taskset"),
    time: identify("/usr/bin/time"),
  };
  return {
    ...payload,
    available: payload.taskset !== null && payload.time !== null,
    sha256: canonicalDigest(payload),
  };
}

function lstatOrNull(filename) {
  try {
    return fs.lstatSync(filename);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function resolvePackageFresh(root, origin, packageName) {
  const source = `
const fs = require("node:fs");
const { createRequire } = require("node:module");
const resolved = createRequire(process.argv[1]).resolve(process.argv[2]);
process.stdout.write(fs.realpathSync(resolved));
`;
  const result = childProcess.spawnSync(
    process.execPath,
    ["-e", source, origin, packageName],
    {
      cwd: root,
      encoding: "utf8",
      env: { LANG: "C.UTF-8", LC_ALL: "C.UTF-8", TZ: "UTC" },
      timeout: 10_000,
    },
  );
  if (result.error || result.status !== 0 || result.signal !== null) {
    throw new Error(
      `candidate runtime closure cannot freshly resolve ${packageName}: ` +
        (result.error?.message || result.stderr ||
          `status=${result.status} signal=${result.signal}`),
    );
  }
  return result.stdout;
}

function expectedDirectSagejsExecutable(root = ROOT) {
  return fs.realpathSync(path.join(root, "bin/sagejs"));
}

function validateDirectSagejsTool(tool, root = ROOT) {
  if (tool?.system !== "sagejs" || tool.adapter_kind !== "generated-sagejs-python" ||
      tool.executable !== expectedDirectSagejsExecutable(root)) {
    throw new Error("direct frontier evidence must execute ROOT/bin/sagejs");
  }
  return tool;
}

const CANDIDATE_DIRECT_ENVIRONMENT_SCHEMA =
  "sagejs.benchmark/complex-cubic-direct-environment-v3";

function prepareCandidateDirectEnvironment(root = ROOT) {
  const cacheHome = path.join(
    root,
    "dist/runtime-cache/complex-cubic-frontier-xdg",
  );
  const historyDirectory = path.join(cacheHome, "sagejs");
  const historyFilename = path.join(historyDirectory, "history-python");
  fs.mkdirSync(historyDirectory, { recursive: true });
  if (!fs.existsSync(historyFilename)) {
    const descriptor = fs.openSync(historyFilename, "wx", 0o600);
    fs.closeSync(descriptor);
  }
  const status = fs.lstatSync(historyFilename);
  if (!status.isFile() || status.isSymbolicLink() || status.size !== 0) {
    throw new Error(
      "candidate direct environment requires an empty regular noninteractive history file",
    );
  }
  return cacheHome;
}

function candidateDirectEnvironmentIdentity(root = ROOT) {
  const nodeExecutable = fs.realpathSync(process.execPath);
  const sitePackages = "/nonexistent/sagejs-complex-cubic-frontier-site-packages";
  const dynamicCache = "/nonexistent/sagejs-complex-cubic-frontier-dynamic";
  const precompiledDynamicCache =
    "/nonexistent/sagejs-complex-cubic-frontier-precompiled-dynamic";
  const cacheHome = prepareCandidateDirectEnvironment(root);
  if (
    fs.existsSync(sitePackages) ||
    fs.existsSync(dynamicCache) ||
    fs.existsSync(precompiledDynamicCache)
  ) {
    throw new Error("candidate direct environment requires controlled absent paths");
  }
  const payload = {
    schema: CANDIDATE_DIRECT_ENVIRONMENT_SCHEMA,
    inheritance: "none",
    node_executable: {
      path: nodeExecutable,
      sha256: sha256(fs.readFileSync(nodeExecutable)),
      version: process.version,
      argv_prefix: [fs.realpathSync(path.join(root, "bin/sagejs"))],
    },
    environment: {
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      TZ: "UTC",
      XDG_CACHE_HOME: cacheHome,
      ...THREAD_ENV,
      SAGEJS_USE_SOURCE: "1",
      SAGEJS_NATIVE_MODE: "auto",
      SAGEJS_NATIVE_AUTOLOAD: "1",
      SAGEJS_NATIVE_REQUIRED: "1",
      SAGEJS_NATIVE_CACHE_DIR: path.join(root, "dist/native-kernels"),
      SAGEJS_MODULE_CACHE_AUTO_CLEANUP: "0",
      SAGEJS_PRECOMPILED_DYNAMIC_CACHE_DIR: precompiledDynamicCache,
      SAGEJS_DYNAMIC_CACHE_DIR: dynamicCache,
      SAGEJS_SITE_PACKAGES: sitePackages,
    },
    launch_wrappers: pinnedLaunchWrapperIdentity(),
  };
  return { ...payload, sha256: canonicalDigest(payload) };
}

function candidateRuntimeClosure(root = ROOT) {
  prepareCandidateDirectEnvironment(root);
  const hash = crypto.createHash("sha256");
  let fileCount = 0;
  let totalBytes = 0;
  const include = (relativeName) => {
    const normalized = relativeName.replaceAll("\\", "/");
    const filename = path.join(root, normalized);
    if (!fs.existsSync(filename)) {
      throw new Error(`candidate runtime closure is missing ${normalized}`);
    }
    const status = fs.lstatSync(filename);
    if (status.isDirectory()) {
      for (const name of fs.readdirSync(filename).sort()) {
        include(path.posix.join(normalized, name));
      }
      return;
    }
    hash.update(normalized);
    hash.update("\0");
    if (status.isSymbolicLink()) {
      throw new Error(
        `candidate runtime closure rejects symbolic-link input ${normalized}`,
      );
    } else if (status.isFile()) {
      const bytes = fs.readFileSync(filename);
      hash.update("file\0");
      hash.update(bytes);
      fileCount += 1;
      totalBytes += bytes.length;
    } else {
      throw new Error(`candidate runtime closure rejects non-file ${normalized}`);
    }
    hash.update("\0");
  };

  for (const name of [
    "bin/sagejs",
    "bin/sagejs-source.cjs",
    "bin/native-launcher.cjs",
    "bin/wasm-launcher.cjs",
    "dist/build-receipt.json",
    "dist/compiler",
    "dist/tools",
    "dist/module-cache",
    "dist/runtime-cache",
  ]) include(name);

  const cacheRoot = "dist/native-kernels";
  const cacheIndex = JSON.parse(
    fs.readFileSync(path.join(root, cacheRoot, "index.json"), "utf8"),
  );
  const source = path.join(root, "src/lib/sagejs/number_fields/cubic_class_number_native.py");
  const selected = cacheIndex?.sources?.[source];
  const selectedPack = cacheIndex?.packs?.find(
    (pack) => pack?.packKey === selected?.packKey,
  );
  if (
    cacheIndex?.schema !== "sagejs.native-cache/v4" ||
    cacheIndex?.complete !== true ||
    !selected ||
    !/^[0-9a-f]{64}$/.test(selected.cacheKey || "") ||
    !/^[0-9a-f]{64}$/.test(selected.packKey || "") ||
    !Array.isArray(selectedPack?.kernels) ||
    !selectedPack.kernels.includes(selected.cacheKey)
  ) {
    throw new Error(
      "candidate runtime closure has no production-packed cubic class-group kernel",
    );
  }
  const standaloneAddonName = path.posix.join(
    cacheRoot,
    selected.cacheKey,
    "build/Release/sagejs_native_kernel.node",
  );
  if (lstatOrNull(path.join(root, standaloneAddonName)) !== null) {
    throw new Error(
      "candidate runtime closure rejects the standalone native-addon fallback",
    );
  }
  const flintDeclaration = selected.foreignDeclarations?.find(
    (declaration) => declaration?.dynamicPackage === "@sagemath/sagejs-flint",
  );
  if (!flintDeclaration ||
      !/^flint@[0-9a-f]{64}$/.test(flintDeclaration.declarationIdentity || "")) {
    throw new Error("candidate runtime closure has no declared FLINT package boundary");
  }
  const runtimeRequireOrigin = path.join(root, "dist/tools/resources.js");
  const expectedFlintLoader = path.join(root, "packages/flint/index.cjs");
  const shadowCandidates = [
    "dist/tools/node_modules/@sagemath/sagejs-flint",
    "dist/node_modules/@sagemath/sagejs-flint",
  ];
  for (const candidate of shadowCandidates) {
    if (lstatOrNull(path.join(root, candidate)) !== null) {
      throw new Error(
        `candidate runtime closure rejects a nearer FLINT resolution entry ${candidate}`,
      );
    }
  }
  const workspaceLinkName = "node_modules/@sagemath/sagejs-flint";
  const workspaceLink = path.join(root, workspaceLinkName);
  const workspaceLinkStatus = lstatOrNull(workspaceLink);
  if (!workspaceLinkStatus?.isSymbolicLink() ||
      fs.realpathSync(workspaceLink) !== path.join(root, "packages/flint")) {
    throw new Error(
      "candidate runtime closure requires the workspace FLINT package link",
    );
  }
  const resolvedFlintLoader = resolvePackageFresh(
    root,
    runtimeRequireOrigin,
    "@sagemath/sagejs-flint",
  );
  if (resolvedFlintLoader !== expectedFlintLoader) {
    throw new Error(
      "candidate runtime closure rejects a shadowed or retargeted FLINT package",
    );
  }
  const flintResolution = {
    strategy: "fresh-node-create-require-v1",
    runtime_require_origin: "dist/tools/resources.js",
    rejected_nearer_entries: shadowCandidates,
    workspace_link: workspaceLinkName,
    workspace_link_target: fs.readlinkSync(workspaceLink),
    workspace_link_realpath: "packages/flint",
    resolved_loader: "packages/flint/index.cjs",
  };
  const flintManifestName = "packages/flint/build/generated-ffi/manifest.json";
  const flintDirectManifestName =
    "packages/flint/build/Release/sagejs_flint.manifest.json";
  const flintManifest = JSON.parse(
    fs.readFileSync(path.join(root, flintManifestName), "utf8"),
  );
  const flintDirectManifest = JSON.parse(
    fs.readFileSync(path.join(root, flintDirectManifestName), "utf8"),
  );
  if (flintManifest?.schema !== "sagejs.ffi/generated-host-adapter-v1" ||
      flintManifest.library !== flintDeclaration.declarationIdentity ||
      typeof flintManifest.addon !== "string" ||
      !/^[A-Za-z0-9_.-]+\.node$/.test(flintManifest.addon) ||
      !/^[0-9a-f]{64}$/.test(flintManifest.addon_hash || "")) {
    throw new Error("candidate runtime closure rejects the generated FLINT manifest");
  }
  const flintGeneratedAddonName = path.posix.join(
    "packages/flint/build/generated-ffi",
    flintManifest.addon,
  );
  const flintDirectAddonName = "packages/flint/build/Release/sagejs_flint.node";
  if (flintDirectManifest?.schema !== "sagejs.flint/direct-addon-v1" ||
      flintDirectManifest.addon !== "build/Release/sagejs_flint.node" ||
      !/^[0-9a-f]{64}$/.test(flintDirectManifest.addon_hash || "") ||
      sha256(fs.readFileSync(path.join(root, flintGeneratedAddonName))) !==
        flintManifest.addon_hash ||
      sha256(fs.readFileSync(path.join(root, flintDirectAddonName))) !==
        flintDirectManifest.addon_hash) {
    throw new Error("candidate runtime closure rejects inconsistent FLINT addons");
  }
  hash.update("native-cache-selection\0");
  hash.update(canonicalJson(selected));
  hash.update("\0");
  hash.update("flint-package-resolution\0");
  hash.update(canonicalJson(flintResolution));
  hash.update("\0");
  const packManifestName = path.posix.join(cacheRoot, "pack/index.json");
  const packName = path.posix.join(
    cacheRoot,
    "pack/sagejs_native_kernel_pack.node",
  );
  const packFilename = path.join(root, packName);
  const packStatus = fs.lstatSync(packFilename);
  if (!packStatus.isFile() || packStatus.size === 0) {
    throw new Error("candidate runtime closure requires a nonempty production native pack");
  }
  const packBytes = fs.readFileSync(packFilename);
  const packSha256 = sha256(packBytes);
  const packManifest = JSON.parse(
    fs.readFileSync(path.join(root, packManifestName), "utf8"),
  );
  if (
    packManifest?.schema !== "sagejs.native-pack/v2" ||
    packManifest?.packKey !== selected.packKey ||
    packManifest?.sha256 !== packSha256 ||
    packManifest?.bytes !== packBytes.length
  ) {
    throw new Error("candidate runtime closure rejects an inconsistent production native pack");
  }
  for (const name of [
    path.posix.join(cacheRoot, "index.json"),
    path.posix.join(cacheRoot, selected.cacheKey, "index.cjs"),
    packManifestName,
    packName,
    "packages/flint/package.json",
    "packages/flint/index.cjs",
    flintManifestName,
    flintGeneratedAddonName,
    flintDirectManifestName,
    flintDirectAddonName,
  ]) include(name);

  const directEnvironment = candidateDirectEnvironmentIdentity(root);
  hash.update("direct-process-environment\0");
  hash.update(canonicalJson(directEnvironment));
  hash.update("\0");

  return {
    schema: "sagejs.benchmark/complex-cubic-candidate-runtime-closure-v3",
    sha256: hash.digest("hex"),
    file_count: fileCount,
    total_bytes: String(totalBytes),
    native_cache_key: selected.cacheKey,
    standalone_native_addon: {
      path: standaloneAddonName,
      required_absent: true,
    },
    flint_runtime: {
      declaration_identity: flintDeclaration.declarationIdentity,
      package_resolution: flintResolution,
      resolved_loader: flintResolution.resolved_loader,
      generated_manifest: flintManifestName,
      generated_addon: flintGeneratedAddonName,
      generated_addon_sha256: flintManifest.addon_hash,
      direct_manifest: flintDirectManifestName,
      direct_addon: flintDirectAddonName,
      direct_addon_sha256: flintDirectManifest.addon_hash,
    },
    production_native_pack: {
      path: packName,
      pack_key: selected.packKey,
      sha256: packSha256,
      bytes: String(packBytes.length),
    },
    direct_process_environment: directEnvironment,
  };
}

function expectedWarmupObservations(records) {
  return records.map((record) => ({
    label: record.label,
    discriminant: record.discriminant,
    class_number: record.class_number,
    class_group_invariants: record.class_group_invariants,
  }));
}

function expectedWarmupResponse(records) {
  const expected = expectedWarmupObservations(records);
  return {
    schema: WARMUP_SCHEMA,
    record_count: records.length,
    native_pass_count: records.length,
    observations_sha256: sha256(compactCanonicalJson(expected)),
  };
}

function validateWarmupResponse(response, records) {
  const expected = expectedWarmupResponse(records);
  if (!hasExactKeys(response, [
    "schema", "record_count", "native_pass_count", "observations_sha256",
  ]) || canonicalDigest(response) !== canonicalDigest(expected)) {
    throw new Error("candidate direct environment warmup disagrees with the frozen survey");
  }
  return response;
}

function validateRuntimeWarmupAttestation(attestation, runtimeClosure, records = null) {
  if (!hasExactKeys(attestation, [
    "schema", "program_bundle_sha256", "record_count", "processes_per_pass",
    "observations_sha256", "pass_count", "response_bundle_sha256_by_pass",
    "runtime_closure_sha256_by_pass",
  ]) || attestation.schema !== WARMUP_ATTESTATION_SCHEMA ||
      attestation.record_count !== 1000 || attestation.processes_per_pass !== 20 ||
      attestation.pass_count !== 2 ||
      !/^[0-9a-f]{64}$/.test(attestation.program_bundle_sha256 || "") ||
      !/^[0-9a-f]{64}$/.test(attestation.observations_sha256 || "") ||
      !Array.isArray(attestation.response_bundle_sha256_by_pass) ||
      attestation.response_bundle_sha256_by_pass.length !== 2 ||
      !Array.isArray(attestation.runtime_closure_sha256_by_pass) ||
      attestation.runtime_closure_sha256_by_pass.length !== 2 ||
      attestation.response_bundle_sha256_by_pass.some((digest) =>
        !/^[0-9a-f]{64}$/.test(digest)) ||
      attestation.runtime_closure_sha256_by_pass.some((digest) =>
        digest !== runtimeClosure?.sha256)) {
    throw new Error("candidate runtime warmup attestation is malformed");
  }
  if (records !== null) {
    if (!Array.isArray(records) || records.length !== 1000) {
      throw new Error("candidate runtime warmup attestation requires 1,000 survey records");
    }
    const partitions = shardRecords({ records });
    if (partitions.length !== 20 || partitions.some((partition) => partition.length !== 50)) {
      throw new Error("candidate runtime warmup attestation requires 20 survey strata");
    }
    const expectedResponses = partitions.map(expectedWarmupResponse);
    const expectedResponseBundleDigest = canonicalDigest(expectedResponses);
    const expectedProgramBundleDigest = canonicalDigest(
      partitions.map((partition) => sha256(sageWarmupSource(partition))),
    );
    if (attestation.program_bundle_sha256 !== expectedProgramBundleDigest ||
        attestation.observations_sha256 !==
          expectedWarmupResponse(records).observations_sha256 ||
        attestation.response_bundle_sha256_by_pass.some((digest) =>
          digest !== expectedResponseBundleDigest)) {
      throw new Error("candidate runtime warmup attestation disagrees with the frozen survey");
    }
  } else if (attestation.response_bundle_sha256_by_pass[0] !==
      attestation.response_bundle_sha256_by_pass[1]) {
    throw new Error("candidate runtime warmup passes did not agree");
  }
  return attestation;
}

function bindWarmedRuntimeClosure(warmup, source, records) {
  const warmedRuntimeClosure = warmup?.candidate_runtime_closure;
  const recordedRuntimeClosure = source?.candidate_runtime_closure;
  if (!warmedRuntimeClosure || !recordedRuntimeClosure ||
      canonicalDigest(warmedRuntimeClosure) !== canonicalDigest(recordedRuntimeClosure)) {
    throw new Error("candidate runtime closure changed after its warm fixed-point proof");
  }
  validateRuntimeWarmupAttestation(warmup.attestation, recordedRuntimeClosure, records);
  return { ...source, candidate_runtime_warmup: warmup.attestation };
}

function assertRuntimeClosureUnchanged(recordedRuntimeClosure, currentRuntimeClosure) {
  if (!recordedRuntimeClosure || !currentRuntimeClosure ||
      canonicalDigest(recordedRuntimeClosure) !== canonicalDigest(currentRuntimeClosure)) {
    throw new Error("candidate runtime closure changed during the measured execution");
  }
  return currentRuntimeClosure;
}

function warmCandidateDirectEnvironment(corpus, root = ROOT, dependencies = {}) {
  const records = corpus?.records;
  if (!Array.isArray(records) || records.length !== 1000) {
    throw new Error("candidate direct environment warmup requires the full frozen survey");
  }
  const identifyEnvironment = dependencies.candidateDirectEnvironmentIdentity ||
    candidateDirectEnvironmentIdentity;
  const identifyClosure = dependencies.candidateRuntimeClosure || candidateRuntimeClosure;
  const spawn = dependencies.spawnSync || childProcess.spawnSync;
  const makeSource = dependencies.sageWarmupSource || sageWarmupSource;
  const partitions = shardRecords(corpus);
  if (partitions.length !== 20 || partitions.some((partition) => partition.length !== 50)) {
    throw new Error("candidate direct environment warmup requires 20 fifty-field strata");
  }
  const generatedSources = partitions.map(makeSource);
  const responsesByPass = [];
  const runPartition = (partition, generatedSource, shard) => {
    const identity = identifyEnvironment(root);
    const result = spawn(
      identity.node_executable.path,
      [path.join(root, "bin/sagejs"), "--python", "-"],
      {
        cwd: root,
        input: generatedSource,
        encoding: "utf8",
        env: identity.environment,
        timeout: 600_000,
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    if (result.error || result.status !== 0 || result.signal !== null) {
      throw new Error(
        `candidate direct environment warmup shard ${shard} failed: ` +
          (result.error?.message || result.stderr ||
            `status=${result.status} signal=${result.signal}`),
      );
    }
    const line = result.stdout.split(/\r?\n/).find((entry) =>
      entry.startsWith(WARMUP_MARKER));
    if (!line) throw new Error("candidate direct environment warmup emitted no result marker");
    const response = JSON.parse(line.slice(WARMUP_MARKER.length));
    return validateWarmupResponse(response, partition);
  };
  const runPass = () => {
    const responses = partitions.map((partition, shard) =>
      runPartition(partition, generatedSources[shard], shard));
    responsesByPass.push(responses);
  };

  runPass();
  const before = identifyClosure(root);
  runPass();
  const after = identifyClosure(root);
  if (canonicalDigest(before) !== canonicalDigest(after)) {
    throw new Error("candidate direct environment did not reach a stable runtime closure");
  }
  const attestation = {
    schema: WARMUP_ATTESTATION_SCHEMA,
    program_bundle_sha256: canonicalDigest(generatedSources.map(sha256)),
    record_count: records.length,
    processes_per_pass: partitions.length,
    observations_sha256: expectedWarmupResponse(records).observations_sha256,
    pass_count: responsesByPass.length,
    response_bundle_sha256_by_pass: responsesByPass.map(canonicalDigest),
    runtime_closure_sha256_by_pass: [before.sha256, after.sha256],
  };
  validateRuntimeWarmupAttestation(attestation, after, records);
  return { attestation, candidate_runtime_closure: after };
}

function sourceIdentity(allowDirty = false) {
  const run = (args) => childProcess.execFileSync("git", ["-C", ROOT, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const commit = run(["rev-parse", "HEAD"]);
  const tree = run(["rev-parse", "HEAD^{tree}"]);
  const dirty = run(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (dirty && !allowDirty) throw new Error("frontier evidence requires a clean Git worktree");
  const build = inspectBuildReceipt(ROOT);
  const receiptPath = path.join(ROOT, "dist/build-receipt.json");
  return {
    candidate_commit: commit,
    candidate_tree: tree,
    clean: dirty === "",
    promotion_eligible: dirty === "" && build.current,
    source_closure_sha256: sha256(`git-tree:${tree}`),
    build_receipt: {
      current: build.current,
      reason: build.reason,
      path: fs.existsSync(receiptPath) ? receiptPath : null,
      sha256: fs.existsSync(receiptPath) ? sha256(fs.readFileSync(receiptPath)) : null,
    },
    candidate_runtime_closure: candidateRuntimeClosure(ROOT),
  };
}

function hostIdentity(cpu) {
  const cpus = os.cpus();
  if (cpu >= cpus.length) throw new Error(`logical CPU ${cpu} does not exist on this host`);
  return {
    platform: process.platform,
    architecture: process.arch,
    release: os.release(),
    hostname: os.hostname(),
    total_memory_bytes: String(os.totalmem()),
    logical_cpu_count: cpus.length,
    selected_logical_cpu: cpu,
    selected_cpu_model: cpus[cpu].model,
    node: process.version,
    thread_environment: THREAD_ENV,
  };
}

const PORTABLE_CORPUS_IDENTITY_KEYS = Object.freeze([
  "manifest_id",
  "manifest_file_sha256",
  "survey_asset_filename",
  "survey_asset_gzip_sha256",
  "survey_asset_records_sha256",
  "labels_sha256",
  "records_sha256",
  "record_count",
]);

function portableCorpusIdentity(corpus) {
  return {
    manifest_id: corpus.manifest.id,
    manifest_file_sha256: corpus.manifest.file_sha256,
    survey_asset_filename: corpus.survey_asset.filename,
    survey_asset_gzip_sha256: corpus.survey_asset.gzip_sha256,
    survey_asset_records_sha256: corpus.survey_asset.records_sha256,
    labels_sha256: corpus.digests.labels_sha256,
    records_sha256: corpus.digests.records_sha256,
    record_count: corpus.records.length,
  };
}

function corpusIdentity(filename, corpus) {
  const portable = portableCorpusIdentity(corpus);
  return {
    manifest_path: filename,
    ...portable,
    identity_sha256: canonicalDigest(portable),
  };
}

function corpusIdentitiesMatch(recorded, current) {
  if (!recorded || !current || typeof recorded !== "object" || typeof current !== "object") {
    return false;
  }
  const project = (identity) => Object.fromEntries(
    PORTABLE_CORPUS_IDENTITY_KEYS.map((key) => [key, identity[key]]),
  );
  const recordedPortable = project(recorded);
  const currentPortable = project(current);
  return recorded.identity_sha256 === canonicalDigest(recordedPortable) &&
    current.identity_sha256 === canonicalDigest(currentPortable) &&
    recorded.identity_sha256 === current.identity_sha256;
}

function sourceIdentitiesMatchForTiming(recorded, current) {
  const recordedRuntime = recorded?.candidate_runtime_closure;
  const currentRuntime = current?.candidate_runtime_closure;
  const runtimeMatches =
    (recordedRuntime === undefined && currentRuntime === undefined) ||
    (recordedRuntime !== undefined && currentRuntime !== undefined &&
      canonicalDigest(recordedRuntime) === canonicalDigest(currentRuntime));
  const recordedWarmup = recorded?.candidate_runtime_warmup;
  const currentWarmup = current?.candidate_runtime_warmup;
  const warmupMatches =
    (recordedWarmup === undefined && currentWarmup === undefined) ||
    (recordedWarmup !== undefined && currentWarmup !== undefined &&
      canonicalDigest(recordedWarmup) === canonicalDigest(currentWarmup));
  return Boolean(recorded && current && recorded.clean === true && current.clean === true &&
    recorded.promotion_eligible === true && current.promotion_eligible === true &&
    recorded.candidate_tree === current.candidate_tree &&
    recorded.source_closure_sha256 === current.source_closure_sha256 &&
    recorded.build_receipt?.current === true && current.build_receipt?.current === true &&
    typeof recorded.build_receipt.sha256 === "string" &&
    recorded.build_receipt.sha256 === current.build_receipt.sha256 && runtimeMatches &&
    warmupMatches);
}

function toolPlan(options) {
  return options.systems.map((system) => {
    const requested = options.adapters[system] || (system === "sagejs" ? options.sagejs :
      system === "pari" ? options.gp : null);
    const executable = resolveExecutable(requested);
    let version = null;
    if (executable) {
      if (system === "sagejs" && !options.adapters[system]) {
        try { version = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"))).version; } catch {}
      } else if (system === "pari" && !options.adapters[system]) {
        try {
          const probe = childProcess.spawnSync(executable, ["--version"], {
            encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10_000,
          });
          if (probe.error || probe.status !== 0) throw probe.error || new Error("nonzero exit");
          version = `${probe.stdout || ""}\n${probe.stderr || ""}`
            .split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "version-probe-failed";
        } catch {
          version = "version-probe-failed";
        }
      } else version = "external-protocol-adapter";
    }
    const tool = {
      system,
      adapter_kind: options.adapters[system] ? "json-protocol" :
        system === "sagejs" ? "generated-sagejs-python" :
          system === "pari" ? "generated-direct-gp" : "missing",
      requested,
      executable,
      executable_sha256: executable ? sha256(fs.readFileSync(executable)) : null,
      version,
      status: executable ? "available" : "unavailable",
    };
    if (system === "sagejs" && !options.adapters[system] && executable) {
      validateDirectSagejsTool(tool);
    }
    return tool;
  });
}

function systemOrder(round, systems = SYSTEMS) {
  const offset = round % systems.length;
  return [...systems.slice(offset), ...systems.slice(0, offset)];
}

function shardRecords(corpus) {
  const shards = Array.from({ length: 20 }, () => []);
  for (const record of corpus.records) shards[record.selection.shard].push(record);
  return shards;
}

function directCensusShardRecords(corpus, system) {
  if (system === "sagejs") return corpus.records.map((record) => [record]);
  if (system === "pari") return shardRecords(corpus);
  throw new Error(`no direct census partition for ${system}`);
}

function pythonLiteral(value) {
  return JSON.stringify(value);
}

function sageCensusSource(records) {
  const fields = records.map((record) => ({ label: record.label, coefficients: record.coefficients }));
  return `import hashlib
import json

def exact_json(value):
    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, int):
        return str(value)
    if isinstance(value, (list, tuple)):
        return [exact_json(entry) for entry in value]
    if isinstance(value, dict):
        return {str(key): exact_json(entry) for key, entry in value.items()}
    raise TypeError("native receipt contains a non-JSON audit value: " + type(value).__name__)

records = json.loads(${pythonLiteral(JSON.stringify(fields))})
R = PolynomialRing(QQ, "x")
x = R.gen()
print(${pythonLiteral(READY_MARKER)}, flush=True)
payload = []
for record in records:
    try:
        polynomial = sum(int(value) * x**index for index, value in enumerate(record["coefficients"]))
        field = NumberField(polynomial, "a_" + record["label"].replace(".", "_"))
        discriminant = str(field.maximal_order().discriminant())
        class_number = str(field.class_number(proof=False))
        receipt = getattr(field, "_native_cubic_class_number_certificate", None)
        if receipt is not None:
            invariants = [str(value) for value in receipt.invariants]
            authenticated = bool(receipt.matches(field))
            receipt_payload = exact_json(receipt.to_dict())
            receipt_digest = hashlib.sha256(json.dumps(
                receipt_payload, sort_keys=True, separators=(",", ":")
            ).encode()).hexdigest()
            replay = bool(receipt.verify_conditional_grh(field))
            replay_contract = ${pythonLiteral(SAGE_CONDITIONAL_REPLAY_CONTRACT)}
            proof_status = receipt.proof_status
            status = "native-pass" if authenticated and replay else "native-certificate-failure"
            fallback_verified = None
        else:
            computation = field.class_unit_group(proof=False)
            group = computation.class_group() if computation.complete else None
            invariants = [] if group is None else [str(value) for value in group.invariants()]
            fallback_verified = bool(computation.complete and group.verify())
            authenticated = None
            replay = None
            replay_contract = None
            receipt_payload = None
            receipt_digest = None
            proof_status = computation.proof_status
            status = "native-decline-fallback-pass" if fallback_verified else "fallback-proof-failure"
        payload.append({
            "label": record["label"], "status": status, "discriminant": discriminant,
            "class_number": class_number, "class_group_invariants": invariants,
            "proof_status": proof_status, "native_receipt_authenticated": authenticated,
            "independent_exact_replay": replay, "fallback_verified": fallback_verified,
            "independent_exact_replay_contract": replay_contract,
            "receipt_digest": receipt_digest, "receipt": receipt_payload,
        })
    except Exception as error:
        payload.append({"label": record["label"], "status": "error", "reason": type(error).__name__ + ": " + str(error)})
print(${pythonLiteral(RESPONSE_MARKER)} + json.dumps({
    "schema": ${pythonLiteral(ADAPTER_SCHEMA)}, "mode": "census", "system": "sagejs",
    "status": "ok", "proof": "conditional-grh", "payload": {"records": payload},
}, sort_keys=True, separators=(",", ":")), flush=True)
`;
}

function sageWarmupSource(records) {
  const fields = records.map((record) => ({
    label: record.label,
    coefficients: record.coefficients,
    discriminant: record.discriminant,
    class_number: record.class_number,
    class_group_invariants: record.class_group_invariants,
  }));
  return `import hashlib
import json

def exact_json(value):
    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, int):
        return str(value)
    if isinstance(value, (list, tuple)):
        return [exact_json(entry) for entry in value]
    if isinstance(value, dict):
        return {str(key): exact_json(entry) for key, entry in value.items()}
    raise TypeError("native receipt contains a non-JSON audit value: " + type(value).__name__)

records = json.loads(${pythonLiteral(JSON.stringify(fields))})
R = PolynomialRing(QQ, "x")
x = R.gen()
print(${pythonLiteral(READY_MARKER)}, flush=True)
observations = []
for record in records:
    polynomial = sum(int(value) * x**index for index, value in enumerate(record["coefficients"]))
    field = NumberField(polynomial, "a_" + record["label"].replace(".", "_"))
    discriminant = str(field.maximal_order().discriminant())
    class_number = str(field.class_number(proof=False))
    receipt = getattr(field, "_native_cubic_class_number_certificate", None)
    invariants = [] if receipt is None else [str(value) for value in receipt.invariants]
    if discriminant != record["discriminant"]:
        raise AssertionError("warmup discriminant disagreement at " + record["label"])
    if class_number != record["class_number"] or invariants != record["class_group_invariants"]:
        raise AssertionError("warmup class-group disagreement at " + record["label"])
    if receipt is None or not receipt.matches(field):
        raise AssertionError("warmup has no authenticated native receipt at " + record["label"])
    if not receipt.verify_conditional_grh(field):
        raise AssertionError("warmup exact replay failed at " + record["label"])
    receipt_payload = exact_json(receipt.to_dict())
    json.dumps(receipt_payload, sort_keys=True, separators=(",", ":"))
    observations.append({
        "label": record["label"], "discriminant": discriminant,
        "class_number": class_number, "class_group_invariants": invariants,
    })
observations_sha256 = hashlib.sha256(json.dumps(
    observations, sort_keys=True, separators=(",", ":")
).encode()).hexdigest()
print(${pythonLiteral(WARMUP_MARKER)} + json.dumps({
    "schema": ${pythonLiteral(WARMUP_SCHEMA)}, "record_count": len(observations),
    "native_pass_count": len(observations), "observations_sha256": observations_sha256,
}, sort_keys=True, separators=(",", ":")), flush=True)
`;
}

function sageTimingSource(corpus, boundaries, round, minimumRootNs = MINIMUM_ROOT_NS) {
  const fields = corpus.records.map((record) => ({
    label: record.label, coefficients: record.coefficients, shard: record.selection.shard,
  }));
  const warmups = corpus.warmups.map((record) => ({ label: record.label, coefficients: record.coefficients }));
  return `import json
import time

records = json.loads(${pythonLiteral(JSON.stringify(fields))})
warmups = json.loads(${pythonLiteral(JSON.stringify(warmups))})
boundaries = json.loads(${pythonLiteral(JSON.stringify(boundaries))})
minimum_ns = ${minimumRootNs.toString()}
R = PolynomialRing(QQ, "x")
x = R.gen()

def fresh(record, suffix):
    polynomial = sum(int(value) * x**index for index, value in enumerate(record["coefficients"]))
    field = NumberField(polynomial, "a_" + record["label"].replace(".", "_") + "_" + suffix)
    field.maximal_order()
    return field

def run_batch(shard, boundary, iterations, serial):
    prepared = None
    if boundary == "scalar-prepared":
        prepared = [[fresh(record, "p_%s_%s_%s" % (serial, repeat, index))
                     for index, record in enumerate(shard)] for repeat in range(iterations)]
    all_answers = []
    per_field = [0] * len(shard)
    root_started = time.perf_counter_ns()
    for repeat in range(iterations):
        current = []
        for index, record in enumerate(shard):
            field_started = time.perf_counter_ns()
            field = prepared[repeat][index] if prepared is not None else fresh(
                record, "f_%s_%s_%s" % (serial, repeat, index))
            value = int(field.class_number(proof=False))
            per_field[index] += time.perf_counter_ns() - field_started
            current.append(str(value))
        all_answers.append(current)
    root_ns = time.perf_counter_ns() - root_started
    return root_ns, all_answers, per_field

print(${pythonLiteral(READY_MARKER)}, flush=True)
for index, record in enumerate(warmups):
    assert int(fresh(record, "warm_%s" % index).class_number(proof=False)) >= 1

shards = [[record for record in records if record["shard"] == shard] for shard in range(20)]
events = []
serial = 0
for boundary in boundaries:
    for shard_index, shard in enumerate(shards):
        iterations = 1
        while True:
            serial += 1
            calibration_ns, ignored, ignored_fields = run_batch(shard, boundary, iterations, serial)
            if calibration_ns >= minimum_ns:
                break
            iterations *= 2
            if iterations > 1048576:
                raise RuntimeError("calibration exceeded the repetition safety limit")
        while True:
            serial += 1
            root_ns, answers, per_field = run_batch(shard, boundary, iterations, serial)
            if root_ns >= minimum_ns:
                break
            iterations *= 2
            if iterations > 1048576:
                raise RuntimeError("retained repetition safety limit exceeded")
        first = answers[0]
        if any(answer != first for answer in answers):
            raise ArithmeticError("repeated class numbers changed within a retained shard")
        events.append({
            "boundary": boundary, "shard": shard_index, "iterations": iterations,
            "record_count": len(shard), "root_nanoseconds": str(root_ns),
            "answers": first,
            "per_field_nanoseconds": [str(value // iterations) for value in per_field],
        })
print(${pythonLiteral(RESPONSE_MARKER)} + json.dumps({
    "schema": ${pythonLiteral(ADAPTER_SCHEMA)}, "mode": "timing", "system": "sagejs",
    "status": "ok", "proof": "conditional-grh", "payload": {"round": ${round}, "events": events},
}, sort_keys=True, separators=(",", ":")), flush=True)
`;
}

function gpPolynomial(record) {
  for (const coefficient of record.coefficients) {
    if (!/^-?(?:0|[1-9][0-9]*)$/.test(coefficient)) throw new Error("unsafe GP coefficient");
  }
  return `Polrev([${record.coefficients.join(",")}])`;
}

function pariCensusSource(records, proof = "conditional-grh") {
  const flag = proof === "conditional-grh" ? 0 : 1;
  const certify = proof === "unconditional"
    ? "if(!bnfcertify(bnf,0), error(\"bnfcertify(bnf,0) returned false\"));" : "";
  const lines = [
    "default(parisizemax, 8589934592);",
    "allocatemem(1073741824);",
    `print("${READY_MARKER}");`,
  ];
  for (const record of records) {
    if (!/^[0-9.]+$/.test(record.label)) throw new Error(`unsafe GP label ${record.label}`);
    lines.push(`P=${gpPolynomial(record)};bnf=bnfinit(P,${flag});${certify}print("${GP_CENSUS_MARKER}${record.label}|",bnf.disc,"|",bnf.no,"|",Str(bnf.cyc));`);
  }
  lines.push("quit;");
  return `${lines.join("\n")}\n`;
}

function pariTimingSource(corpus, boundaries, round, minimumRootNs = MINIMUM_ROOT_NS) {
  const shards = shardRecords(corpus);
  const lines = [
    "default(parisizemax, 8589934592);",
    "allocatemem(1073741824);",
    `sagejs_run_batch(C,boundary,iterations)={my(prepared=List(),answers=vector(#C),per=vector(#C),position=1,bnf,P,t,root);if(boundary==0,for(repeat=1,iterations,for(i=1,#C,listput(prepared,nfinit(Polrev(C[i]))))));root=getwalltime();for(repeat=1,iterations,for(i=1,#C,t=getwalltime();if(boundary==0,bnf=bnfinit(prepared[position],0);position++,P=Polrev(C[i]);bnf=bnfinit(P,0));per[i]+=getwalltime()-t;if(repeat==iterations,answers[i]=[bnf.no,bnf.cyc])));root=getwalltime()-root;[root,answers,per]};`,
    `print("${READY_MARKER}");`,
  ];
  for (const warmup of corpus.warmups) {
    lines.push(`bnfinit(${gpPolynomial(warmup)},0);`);
  }
  boundaries.forEach((boundary) => {
    const boundaryCode = boundary === "scalar-prepared" ? 0 : 1;
    shards.forEach((records, shard) => {
      const coefficients = `[${records.map((record) =>
        `[${record.coefficients.join(",")}]`).join(",")}]`;
      lines.push(`C=${coefficients};iterations=1;cal=sagejs_run_batch(C,${boundaryCode},iterations);while(cal[1]*1000000<${minimumRootNs.toString()},iterations*=2;if(iterations>1048576,error("calibration exceeded repetition safety limit"));cal=sagejs_run_batch(C,${boundaryCode},iterations));ret=sagejs_run_batch(C,${boundaryCode},iterations);while(ret[1]*1000000<${minimumRootNs.toString()},iterations*=2;if(iterations>1048576,error("retained repetition safety limit exceeded"));ret=sagejs_run_batch(C,${boundaryCode},iterations));print("${GP_TIMING_MARKER}${boundary}|${shard}|",iterations,"|",ret[1]*1000000,"|",Str(ret[2]),"|",Str(ret[3]));`);
    });
  });
  lines.push("quit;");
  return `${lines.join("\n")}\n`;
}

function protocolRequest(corpus, mode, system, options = {}) {
  return {
    schema: "sagejs.benchmark/complex-cubic-frontier-adapter-request-v1",
    mode,
    system,
    proof: "conditional-grh",
    proof_setting: system === "magma" ? "Proof := \"GRH\"" :
      system === "hecke" ? "class_group(...; GRH=true)" : null,
    boundaries: mode === "timing" ? options.boundaries ?? [] : [],
    round: mode === "timing" ? options.round ?? null : null,
    minimum_retained_root_nanoseconds: MINIMUM_ROOT_NS.toString(),
    warmups: corpus.warmups,
    shards: shardRecords(corpus),
  };
}

function externalCensusProgramDigest(tool, corpus) {
  if (tool.adapter_kind !== "json-protocol" || typeof tool.executable !== "string") {
    throw new Error(`${tool.system} has no external census program to regenerate`);
  }
  const adapterModule = require(tool.executable);
  if (typeof adapterModule.source !== "function") {
    throw new Error(`${tool.system} adapter does not expose deterministic source(request)`);
  }
  return sha256(adapterModule.source(protocolRequest(corpus, "census", tool.system)));
}

function parseGpCensus(stdout, records) {
  const byLabel = new Map();
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith(GP_CENSUS_MARKER)) continue;
    const [label, discriminant, classNumber, invariantsText] = line.slice(GP_CENSUS_MARKER.length).split("|");
    byLabel.set(label, {
      label, status: "ok", discriminant, class_number: classNumber,
      class_group_invariants: normalizePariInvariants(JSON.parse(invariantsText)),
      proof_status: "exact-relations-conditional-grh",
    });
  }
  return {
    schema: ADAPTER_SCHEMA, mode: "census", system: "pari", proof: "conditional-grh",
    status: byLabel.size === records.length ? "ok" : "error",
    payload: { records: records.map((record) => byLabel.get(record.label) || {
      label: record.label, status: "error", reason: "direct GP emitted no census record",
    }) },
  };
}

function normalizePariInvariants(values) {
  if (!Array.isArray(values)) throw new Error("PARI class-group invariants are malformed");
  const normalized = values.map(String).reverse();
  let previous = 1n;
  for (const value of normalized) {
    if (!/^[1-9][0-9]*$/.test(value) || BigInt(value) < 2n || BigInt(value) % previous !== 0n) {
      throw new Error("PARI class-group invariants are not divisibility ordered");
    }
    previous = BigInt(value);
  }
  return normalized;
}

function parseGpTiming(stdout, corpus, boundaries, round) {
  const events = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith(GP_TIMING_MARKER)) continue;
    const [boundary, shardText, iterationsText, rootNs, answersText, perFieldText] =
      line.slice(GP_TIMING_MARKER.length).split("|");
    const answers = JSON.parse(answersText).map(([classNumber, invariants]) => ({
      class_number: String(classNumber),
      class_group_invariants: normalizePariInvariants(invariants),
    }));
    const iterations = Number(iterationsText);
    events.push({
      boundary,
      shard: Number(shardText),
      iterations,
      record_count: answers.length,
      root_nanoseconds: rootNs,
      answers,
      per_field_nanoseconds: JSON.parse(perFieldText).map((milliseconds) =>
        String(Math.trunc(Number(milliseconds) * 1_000_000 / iterations))),
    });
  }
  const expected = boundaries.length * 20;
  return {
    schema: ADAPTER_SCHEMA, mode: "timing", system: "pari", proof: "conditional-grh",
    status: events.length === expected ? "ok" : "error", payload: { round, events },
  };
}

function makeTimingEvent(raw, system, round, orderPosition, corpus) {
  const records = shardRecords(corpus)[raw.shard];
  if (!BOUNDARIES.includes(raw.boundary) || !Number.isSafeInteger(raw.iterations) ||
      raw.iterations < 1 || raw.record_count !== records.length) {
    throw new Error(`${system} emitted a malformed retained timing event`);
  }
  const expected = records.map((record) => ({
    class_number: record.class_number, class_group_invariants: record.class_group_invariants,
  }));
  const rawAnswers = raw.answers.map((value) => typeof value === "string"
    ? { class_number: value }
    : value);
  for (let index = 0; index < expected.length; index += 1) {
    if (rawAnswers[index]?.class_number !== expected[index].class_number) {
      throw new Error(`${system} timing answer disagrees at ${records[index].label}`);
    }
    if (rawAnswers[index]?.class_group_invariants &&
        JSON.stringify(rawAnswers[index].class_group_invariants) !==
          JSON.stringify(expected[index].class_group_invariants)) {
      throw new Error(`${system} timing invariants disagree at ${records[index].label}`);
    }
  }
  const answerDigest = canonicalDigest(rawAnswers);
  return validateTimingEvent({
    round,
    order_position: orderPosition,
    system,
    boundary: raw.boundary,
    shard: raw.shard,
    proof: "conditional-grh",
    status: "ok",
    iterations: raw.iterations,
    record_count: records.length,
    root_nanoseconds: raw.root_nanoseconds,
    root_source: "one-contiguous-monotonic-timer",
    phase_sum_used: false,
    digest_inside_root: false,
    answer_digest: answerDigest,
    per_field_nanoseconds: raw.per_field_nanoseconds,
  });
}

function splitLines(state, chunk, onLine) {
  state.buffer += chunk;
  while (true) {
    const newline = state.buffer.indexOf("\n");
    if (newline < 0) break;
    const line = state.buffer.slice(0, newline).replace(/\r$/, "");
    state.buffer = state.buffer.slice(newline + 1);
    onLine(line);
  }
}

function runFreshProcess(spec, options = {}) {
  const nowNs = options.nowNs || (() => process.hrtime.bigint());
  const spawn = options.spawn || childProcess.spawn;
  return new Promise((resolve) => {
    const launched = nowNs();
    const child = spawn(spec.executable, spec.args, {
      cwd: ROOT,
      env: spec.replaceEnv
        ? { ...spec.env }
        : { ...process.env, ...THREAD_ENV, ...spec.env },
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdoutState = { buffer: "" };
    let stdout = "";
    let stderr = "";
    let ready = null;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform !== "win32" && Number.isSafeInteger(child.pid)) {
        try {
          process.kill(-child.pid, "SIGKILL");
          return;
        } catch {
          // Fall back to the immediate child if its process group has already exited.
        }
      }
      child.kill("SIGKILL");
    }, spec.timeoutSeconds * 1000);
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      splitLines(stdoutState, text, (line) => {
        if (line === READY_MARKER && ready === null) ready = nowNs();
      });
    });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ status: "error", reason: error.message, stdout, stderr, launched, ready, ended: nowNs() });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const ended = nowNs();
      resolve({
        status: timedOut ? "timeout" : code === 0 ? "ok" : "error",
        reason: timedOut ? "wall timeout" : code === 0 ? null : `exit ${code}, signal ${signal}`,
        stdout, stderr, launched, ready, ended,
      });
    });
    child.stdin.end(spec.input);
  });
}

function pinnedSpec(executable, args, input, options) {
  const wrappers = pinnedLaunchWrapperIdentity();
  if (!wrappers.available) {
    throw new Error(
      "retained frontier evidence requires /usr/bin/taskset and /usr/bin/time",
    );
  }
  if (!options.launchWrapperIdentity ||
      canonicalDigest(options.launchWrapperIdentity) !== canonicalDigest(wrappers)) {
    throw new Error("retained frontier launch wrappers changed after source binding");
  }
  return {
    executable: wrappers.time.path,
    args: ["-f", "SAGEJS_COMPLEX_CUBIC_FRONTIER_MAX_RSS_KIB|%M", wrappers.taskset.path,
      "-c", String(options.cpu), executable, ...args],
    input,
    env: options.env || {},
    replaceEnv: options.replaceEnv === true,
    timeoutSeconds: options.timeoutSeconds,
  };
}

function directProcessEnvironment(tool, root = ROOT) {
  if (tool.system !== "sagejs" || tool.adapter_kind !== "generated-sagejs-python") {
    return {};
  }
  return { ...candidateDirectEnvironmentIdentity(root).environment };
}

function responseFromStdout(stdout) {
  const line = stdout.split(/\r?\n/).find((entry) => entry.startsWith(RESPONSE_MARKER));
  if (!line) throw new Error("adapter emitted no response marker");
  return JSON.parse(line.slice(RESPONSE_MARKER.length));
}

function recordLabelsDigest(records) {
  return sha256(`${records.map((record) => record.label).join("\n")}\n`);
}

function directCensusProgramDigest(system, records) {
  if (system === "sagejs") return sha256(sageCensusSource(records));
  if (system === "pari") return sha256(pariCensusSource(records));
  throw new Error(`no direct census source for ${system}`);
}

function censusPartKey(corpus, tool, source, options, batch) {
  if (tool.system !== "sagejs" || batch.corpus.records.length !== 1) {
    throw new Error("authenticated census parts are defined only for Sage.js singleton shards");
  }
  if (!source.clean || !source.build_receipt?.current ||
      typeof source.build_receipt.sha256 !== "string") {
    throw new Error("authenticated census parts require clean source and a current build receipt");
  }
  const record = batch.corpus.records[0];
  const host = hostIdentity(options.cpu);
  const key = {
    system: "sagejs",
    mode: "census",
    proof: "conditional-grh",
    partition: DIRECT_CENSUS_PARTITIONS.sagejs.partition,
    global_rank: record.selection.global_rank,
    label: record.label,
    corpus_identity_sha256: canonicalDigest(portableCorpusIdentity(corpus)),
    record_sha256: canonicalDigest(record),
    source_closure_sha256: source.source_closure_sha256,
    candidate_tree: source.candidate_tree,
    build_receipt_sha256: source.build_receipt.sha256,
    candidate_runtime_closure_sha256:
      source.candidate_runtime_closure?.sha256 ?? null,
    adapter_kind: tool.adapter_kind,
    executable_sha256: tool.executable_sha256,
    generated_program_sha256: directCensusProgramDigest("sagejs", [record]),
    thread_environment_sha256: canonicalDigest(THREAD_ENV),
    direct_process_environment_sha256:
      source.candidate_runtime_closure?.direct_process_environment?.sha256 ?? null,
    platform: host.platform,
    architecture: host.architecture,
    direct_cpus: options.censusCpus,
  };
  return { key, key_sha256: canonicalDigest(key) };
}

function censusPartFilename(partsDir, expected) {
  const rank = String(expected.key.global_rank).padStart(4, "0");
  return path.join(
    partsDir,
    `${rank}-${expected.key.label}-${expected.key_sha256}.json`,
  );
}

function compactCanonicalJson(value) {
  return JSON.stringify(JSON.parse(canonicalJson(value)));
}

function hasExactKeys(value, keys) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join("\n") === [...keys].sort().join("\n"));
}

function nativeReceiptProofContractIsValid(receipt) {
  const contracts = NATIVE_RECEIPT_PROOF_CONTRACTS[receipt?.proof_status];
  if (!contracts || !Array.isArray(receipt.assumptions)) return false;
  return contracts.some((contract) =>
    receipt.theorem === contract.theorem &&
    JSON.stringify(receipt.assumptions) === JSON.stringify(contract.assumptions)
  );
}

function nativeRelationTranscriptIsValid(receipt) {
  if (!["exact-trivial-presentation-conditional-grh",
    "exact-empty-generator-base-conditional-grh",
    "exact-relations-conditional-grh"].includes(receipt?.proof_status)) {
    return true;
  }
  const transcript = receipt.relation_transcript;
  const factorCount = Number(receipt.factor_base_size);
  const relationCount = Number(receipt.relation_count);
  const exactInteger = (value) =>
    typeof value === "string" && /^-?(?:0|[1-9][0-9]*)$/.test(value);
  return Number.isSafeInteger(factorCount) && factorCount >= 0 &&
    Number.isSafeInteger(relationCount) && relationCount >= factorCount &&
    transcript && typeof transcript === "object" && !Array.isArray(transcript) &&
    transcript.schema ===
      "sagejs.number-fields/complex-cubic-relation-transcript-v1" &&
    Array.isArray(transcript.factor_ideal_hnf_order_coordinates) &&
    transcript.factor_ideal_hnf_order_coordinates.length === factorCount &&
    transcript.factor_ideal_hnf_order_coordinates.every((matrix) =>
      Array.isArray(matrix) && matrix.length === 3 && matrix.every((row) =>
        Array.isArray(row) && row.length === 3 && row.every(exactInteger))) &&
    Array.isArray(transcript.relation_rows) &&
    transcript.relation_rows.length === relationCount &&
    transcript.relation_rows.every((row) =>
      Array.isArray(row) && row.length === factorCount && row.every((value) =>
        exactInteger(value) && !value.startsWith("-"))) &&
    Array.isArray(transcript.principal_element_order_coordinates) &&
    transcript.principal_element_order_coordinates.length === relationCount &&
    transcript.principal_element_order_coordinates.every((row) =>
      Array.isArray(row) && row.length === 3 && row.every(exactInteger));
}

function validateCheckpointObservation(observed, expected) {
  if (!observed || observed.label !== expected.label ||
      !["native-pass", "native-decline-fallback-pass"].includes(observed.status) ||
      observed.discriminant !== expected.discriminant ||
      observed.class_number !== expected.class_number ||
      JSON.stringify(observed.class_group_invariants) !==
        JSON.stringify(expected.class_group_invariants)) {
    throw new Error(`census checkpoint for ${expected.label} disagrees with the frozen oracle`);
  }
  if (observed.status === "native-pass") {
    const receipt = observed.receipt;
    if (observed.native_receipt_authenticated !== true ||
        observed.independent_exact_replay !== true || observed.fallback_verified !== null ||
        observed.independent_exact_replay_contract !== SAGE_CONDITIONAL_REPLAY_CONTRACT ||
        !receipt || typeof receipt !== "object" || Array.isArray(receipt) ||
        typeof observed.receipt_digest !== "string" ||
        !/^[0-9a-f]{64}$/.test(observed.receipt_digest) ||
        observed.receipt_digest !== sha256(compactCanonicalJson(receipt)) ||
        receipt.schema !== "sagejs.number-fields/certified-complex-cubic-native-v4" ||
        JSON.stringify(receipt.polynomial_coefficients) !==
          JSON.stringify(expected.coefficients) ||
        receipt.field_discriminant !== expected.discriminant ||
        // This is the literal input-polynomial order index. The LMFDB corpus
        // selection dimension is not an equality oracle for that basis-dependent value.
        typeof receipt.equation_order_index !== "string" ||
        !/^[1-9][0-9]*$/.test(receipt.equation_order_index) ||
        receipt.class_number !== expected.class_number ||
        JSON.stringify(receipt.invariants) !== JSON.stringify(expected.class_group_invariants) ||
        receipt.proof_status !== observed.proof_status ||
        !nativeReceiptProofContractIsValid(receipt) ||
        !nativeRelationTranscriptIsValid(receipt)) {
      throw new Error(`census checkpoint for ${expected.label} has an invalid native proof branch`);
    }
  } else if (typeof observed.proof_status !== "string" ||
      !/^exact(?:-[a-z0-9]+)*-(?:conditional-grh|unconditional)$/.test(observed.proof_status) ||
      observed.native_receipt_authenticated !== null ||
      observed.independent_exact_replay !== null || observed.fallback_verified !== true ||
      observed.independent_exact_replay_contract !== null ||
      observed.receipt !== null || observed.receipt_digest !== null) {
    throw new Error(`census checkpoint for ${expected.label} has an invalid fallback proof branch`);
  }
}

function validateSuccessfulCensusInvocation(invocation, expected, batch, options) {
  const response = invocation?.response;
  const processEvidence = invocation?.process;
  validateAdapterResponse(response, { mode: "census", system: "sagejs" });
  validateCensusProcessEvidence(processEvidence);
  const records = response?.payload?.records;
  if (response.status !== "ok" || !processEvidence || processEvidence.system !== "sagejs" ||
      processEvidence.mode !== "census" || processEvidence.census_shard !== batch.shard ||
      processEvidence.status !== "ok" || processEvidence.response_validation_error !== null ||
      processEvidence.response_sha256 !== canonicalDigest(response) ||
      processEvidence.record_labels_sha256 !== recordLabelsDigest(batch.corpus.records) ||
      processEvidence.generated_program_sha256 !== expected.key.generated_program_sha256 ||
      processEvidence.affinity_logical_cpus?.length !== 1 ||
      !options.censusCpus.includes(processEvidence.affinity_logical_cpus[0]) ||
      processEvidence.runtime_identity !== null ||
      processEvidence.runtime_closure_sha256 !==
        expected.key.direct_process_environment_sha256 ||
      !Array.isArray(records) || records.length !== 1) {
    throw new Error(`census checkpoint for shard ${batch.shard} is not a verified success`);
  }
  validateCheckpointObservation(records[0], batch.corpus.records[0]);
  return invocation;
}

function makeCensusPart(invocation, expected) {
  const payload = {
    schema: CENSUS_PARTS_SCHEMA,
    schema_version: 1,
    key: expected.key,
    key_sha256: expected.key_sha256,
    response: invocation.response,
    process: invocation.process,
  };
  return { ...payload, part_sha256: canonicalDigest(payload) };
}

function validateCensusPart(part, expected, batch, options) {
  if (!hasExactKeys(part, [
    "schema", "schema_version", "key", "key_sha256", "response", "process", "part_sha256",
  ]) || !hasExactKeys(part.key, Object.keys(expected.key)) ||
      part.schema !== CENSUS_PARTS_SCHEMA || part.schema_version !== 1 ||
      part.key_sha256 !== expected.key_sha256 ||
      canonicalDigest(part.key) !== part.key_sha256 ||
      canonicalDigest(part.key) !== canonicalDigest(expected.key)) {
    throw new Error(`malformed or stale census checkpoint for shard ${batch.shard}`);
  }
  const { part_sha256: recordedDigest, ...payload } = part;
  if (typeof recordedDigest !== "string" || canonicalDigest(payload) !== recordedDigest) {
    throw new Error(`stale census checkpoint digest for shard ${batch.shard}`);
  }
  return validateSuccessfulCensusInvocation({
    response: part.response,
    process: part.process,
  }, expected, batch, options);
}

function readCensusPart(filename, expected, batch, options) {
  if (!fs.existsSync(filename)) return null;
  let part;
  try {
    part = JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (error) {
    throw new Error(`cannot read census checkpoint ${filename}: ${error.message}`);
  }
  return validateCensusPart(part, expected, batch, options);
}

function fsyncDirectory(directory) {
  // Windows does not support fsync on a directory handle (it reports EPERM).
  // The file itself has already been fsynced before publication, so retain the
  // strongest durability primitive available on that platform.
  if (process.platform === "win32") return;
  const descriptor = fs.openSync(directory, "r");
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function publishJsonExclusive(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const encoded = canonicalJson(value);
  if (fs.existsSync(filename)) {
    if (fs.readFileSync(filename, "utf8") !== encoded) {
      throw new Error(`refusing to overwrite conflicting checkpoint ${filename}`);
    }
    return;
  }
  const temporary = `${filename}.tmp-${process.pid}-${process.hrtime.bigint()}`;
  try {
    const descriptor = fs.openSync(temporary, "wx");
    try {
      fs.writeFileSync(descriptor, encoded);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    try {
      fs.linkSync(temporary, filename);
    } catch (error) {
      if (error.code !== "EEXIST" || fs.readFileSync(filename, "utf8") !== encoded) throw error;
    }
    fsyncDirectory(path.dirname(filename));
  } finally {
    try {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    } catch {
      // A stale temporary file is never addressed as a checkpoint.
    }
  }
}

function writeJsonAtomic(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp-${process.pid}-${process.hrtime.bigint()}`;
  try {
    const descriptor = fs.openSync(temporary, "wx");
    try {
      fs.writeFileSync(descriptor, canonicalJson(value));
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporary, filename);
    fsyncDirectory(path.dirname(filename));
  } finally {
    try {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    } catch {
      // The addressed output was already published or this orphan is harmless.
    }
  }
}

function validateIdentityArtifact(artifact, label) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact) ||
      typeof artifact.role !== "string" || artifact.role.length === 0 ||
      typeof artifact.path !== "string" || !path.isAbsolute(artifact.path) ||
      !Number.isSafeInteger(artifact.bytes) || artifact.bytes <= 0 ||
      typeof artifact.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(artifact.sha256) ||
      (artifact.file_count !== undefined &&
        (!Number.isSafeInteger(artifact.file_count) || artifact.file_count <= 0))) {
    throw new Error(`${label} is malformed`);
  }
  return artifact;
}

function runtimeClosureDigest(identity) {
  const {
    identity_sha256: _identityDigest,
    generated_program_sha256: _programDigest,
    ...closure
  } = identity;
  return canonicalDigest(closure);
}

function validateRuntimeIdentity(identity, system, expectedProgramSha256 = null) {
  const expectedProofSetting = system === "magma"
    ? 'ClassGroup(order : Proof := "GRH")'
    : system === "hecke"
      ? "class_group(order; GRH=true, redo=true)"
      : null;
  if (!identity || typeof identity !== "object" || Array.isArray(identity) ||
      identity.schema !== RUNTIME_IDENTITY_SCHEMA || identity.system !== system ||
      typeof identity.version !== "string" || identity.version.length === 0 ||
      typeof identity.executable !== "string" || !path.isAbsolute(identity.executable) ||
      identity.proof_setting !== expectedProofSetting ||
      typeof identity.proof_semantics !== "string" || identity.proof_semantics.length === 0 ||
      !identity.environment || typeof identity.environment !== "object" ||
      Array.isArray(identity.environment) ||
      !Array.isArray(identity.artifacts) || identity.artifacts.length === 0 ||
      typeof identity.generated_program_sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(identity.generated_program_sha256) ||
      typeof identity.identity_sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(identity.identity_sha256)) {
    throw new Error(`${system} emitted a malformed runtime identity`);
  }
  const artifacts = [
    ...identity.artifacts.map((artifact, index) =>
      validateIdentityArtifact(artifact, `${system} runtime identity artifact ${index}`)),
    validateIdentityArtifact(identity.adapter, `${system} runtime identity adapter`),
    validateIdentityArtifact(identity.helper, `${system} runtime identity helper`),
  ];
  const roles = artifacts.map((artifact) => artifact.role);
  if (new Set(roles).size !== roles.length || identity.adapter.role !== "protocol-adapter" ||
      identity.helper.role !== "protocol-helper") {
    throw new Error(`${system} emitted duplicate or invalid runtime identity artifact roles`);
  }
  const { identity_sha256: recordedDigest, ...payload } = identity;
  if (canonicalDigest(payload) !== recordedDigest) {
    throw new Error(`${system} emitted a stale runtime identity digest`);
  }
  if (expectedProgramSha256 !== null &&
      identity.generated_program_sha256 !== expectedProgramSha256) {
    throw new Error(`${system} runtime identity does not match the request-derived program`);
  }
  return identity;
}

function interpretAdapterProcessResult(
  tool,
  corpus,
  mode,
  options,
  processResult,
  expectedProgramSha256,
) {
  let response;
  let runtimeIdentity = null;
  let responseValidationError = null;
  try {
    if (processResult.status !== "ok") {
      response = {
        schema: ADAPTER_SCHEMA, mode, system: tool.system, status: processResult.status,
        proof: "conditional-grh", payload: null,
      };
    } else if (tool.system === "pari" && tool.adapter_kind !== "json-protocol") {
      response = mode === "census" ? parseGpCensus(processResult.stdout, corpus.records) :
        parseGpTiming(processResult.stdout, corpus, options.boundaries, options.round);
    } else response = responseFromStdout(processResult.stdout);
    validateAdapterResponse(response, { mode, system: tool.system });
    runtimeIdentity = response.status === "ok" && tool.adapter_kind === "json-protocol"
      ? validateRuntimeIdentity(
        response.payload?.runtime_identity,
        tool.system,
        expectedProgramSha256,
      )
      : null;
    if (processResult.status === "ok" && processResult.ready === null) {
      throw new Error(`${tool.system} adapter never emitted the ready marker`);
    }
  } catch (error) {
    // A malformed direct census shard is a measured failed region, not
    // grounds for discarding evidence from every other independent shard.
    // External adapters authenticate one whole-corpus runtime closure, and timing
    // responses are retained evidence roots, so both continue to fail closed.
    if (mode !== "census" || tool.adapter_kind === "json-protocol") throw error;
    responseValidationError = error instanceof Error ? error.message : String(error);
    response = {
      schema: ADAPTER_SCHEMA, mode, system: tool.system, status: "error",
      proof: "conditional-grh", payload: null,
    };
    validateAdapterResponse(response, { mode, system: tool.system });
  }
  return { response, runtimeIdentity, responseValidationError };
}

async function invokeAdapter(tool, corpus, mode, options = {}) {
  if (tool.status !== "available") {
    return { response: {
      schema: ADAPTER_SCHEMA, mode, system: tool.system, status: "unavailable",
      proof: "conditional-grh", payload: null,
    }, process: null };
  }
  let args;
  let input;
  let adapterRequest = null;
  let expectedProgramSha256 = null;
  if (tool.adapter_kind === "json-protocol") {
    args = [];
    adapterRequest = protocolRequest(corpus, mode, tool.system, options);
    input = `${JSON.stringify(adapterRequest)}\n`;
    const adapterModule = require(tool.executable);
    if (typeof adapterModule.source !== "function") {
      throw new Error(`${tool.system} adapter does not expose deterministic source(request)`);
    }
    expectedProgramSha256 = sha256(adapterModule.source(adapterRequest));
  } else if (tool.system === "sagejs") {
    args = ["--python", "-"];
    input = mode === "census" ? sageCensusSource(corpus.records) :
      sageTimingSource(corpus, options.boundaries, options.round);
  } else if (tool.system === "pari") {
    args = ["-q"];
    input = mode === "census" ? pariCensusSource(corpus.records) :
      pariTimingSource(corpus, options.boundaries, options.round);
  } else {
    throw new Error(`${tool.system} requires --adapter ${tool.system}=PATH`);
  }
  if (expectedProgramSha256 === null) expectedProgramSha256 = sha256(input);
  const directSagejs = tool.system === "sagejs" &&
    tool.adapter_kind === "generated-sagejs-python";
  if (directSagejs) validateDirectSagejsTool(tool);
  const directEnvironment = directSagejs
    ? options.directEnvironmentIdentity ?? candidateDirectEnvironmentIdentity()
    : null;
  const launchedExecutable = directEnvironment === null
    ? tool.executable
    : directEnvironment.node_executable.path;
  if (directEnvironment !== null) args = [tool.executable, ...args];
  const processResult = await runFreshProcess(pinnedSpec(launchedExecutable, args, input, {
    ...options,
    env: directEnvironment === null
      ? directProcessEnvironment(tool)
      : { ...directEnvironment.environment },
    replaceEnv: directSagejs,
  }));
  const { response, runtimeIdentity, responseValidationError } = interpretAdapterProcessResult(
    tool, corpus, mode, options, processResult, expectedProgramSha256,
  );
  const processEvidence = {
    system: tool.system,
    mode,
    execution_epoch: options.executionEpoch,
    round: options.round ?? null,
    census_shard: mode === "census" ? options.censusShard ?? null : null,
    record_labels_sha256: mode === "census"
      ? recordLabelsDigest(corpus.records)
      : null,
    status: processResult.status,
    response_validation_error: responseValidationError,
    response_sha256: canonicalDigest(response),
    generated_program_sha256: expectedProgramSha256,
    launched_monotonic_nanoseconds: processResult.launched.toString(),
    ended_monotonic_nanoseconds: processResult.ended.toString(),
    launch_to_ready_nanoseconds: processResult.ready === null ? null :
      (processResult.ready - processResult.launched).toString(),
    process_wall_nanoseconds: (processResult.ended - processResult.launched).toString(),
    timeout_seconds: options.timeoutSeconds,
    affinity_logical_cpus: [options.cpu],
    peak_rss_bytes: (() => {
      const match = /SAGEJS_COMPLEX_CUBIC_FRONTIER_MAX_RSS_KIB\|(\d+)/.exec(processResult.stderr);
      return match ? String(BigInt(match[1]) * 1024n) : null;
    })(),
    stderr_sha256: sha256(processResult.stderr),
    runtime_identity: runtimeIdentity,
    runtime_closure_sha256: runtimeIdentity === null
      ? directEnvironment?.sha256 ?? null
      : runtimeClosureDigest(runtimeIdentity),
  };
  return { response, process: processEvidence };
}

function censusBatchPlan(corpus, tool) {
  if (tool.status !== "available" || tool.adapter_kind === "json-protocol") {
    return [{ shard: null, corpus }];
  }
  return directCensusShardRecords(corpus, tool.system).map((records, shard) => ({
    shard,
    corpus: { ...corpus, records },
  }));
}

async function runBoundedCensusBatches(batches, cpus, invoke) {
  if (!Array.isArray(cpus) || cpus.length === 0) {
    throw new Error("bounded census execution requires at least one logical CPU");
  }
  const results = Array(batches.length);
  let nextIndex = 0;
  await Promise.all(cpus.slice(0, batches.length).map(async (cpu) => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= batches.length) return;
      results[index] = await invoke(batches[index], cpu);
    }
  }));
  return results;
}

async function runCensusBatchWithCheckpoint(
  corpus,
  tool,
  source,
  options,
  batch,
  cpu,
  invoke = invokeAdapter,
) {
  const eligible = tool.system === "sagejs" && tool.status === "available" &&
    tool.adapter_kind === "generated-sagejs-python";
  const checkpointed = eligible && options.censusPartsEnabled;
  let expected = null;
  let filename = null;
  if (checkpointed) {
    expected = censusPartKey(corpus, tool, source, options, batch);
    filename = censusPartFilename(options.censusPartsDir, expected);
    const invocation = readCensusPart(filename, expected, batch, options);
    if (invocation !== null) return { batch, invocation, checkpoint: "reused" };
  }
  const invocation = await invoke(tool, batch.corpus, "census", {
    ...options,
    cpu,
    censusShard: batch.shard,
  });
  if (checkpointed) {
    try {
      validateSuccessfulCensusInvocation(invocation, expected, batch, options);
    } catch {
      return { batch, invocation, checkpoint: "not-published" };
    }
    publishJsonExclusive(filename, makeCensusPart(invocation, expected));
    return { batch, invocation, checkpoint: "published" };
  }
  return { batch, invocation, checkpoint: eligible ? "disabled" : "not-applicable" };
}

function mergeCensusInvocations(tool, corpus, entries) {
  const records = [];
  for (const entry of entries) {
    const expected = entry.batch.corpus.records;
    const response = entry.invocation.response;
    if (response.status === "ok") {
      if (!response.payload || !Array.isArray(response.payload.records) ||
          response.payload.records.length !== expected.length) {
        throw new Error(`${tool.system} census shard emitted the wrong record count`);
      }
      records.push(...response.payload.records);
      continue;
    }
    const status = response.status === "unavailable" ? "comparator-unavailable" : response.status;
    records.push(...expected.map((record) => ({
      label: record.label,
      status,
      reason: `${tool.system} census process ${response.status}`,
    })));
  }
  if (records.length !== corpus.records.length) {
    throw new Error(`${tool.system} census shards do not cover the frozen corpus`);
  }
  return {
    schema: ADAPTER_SCHEMA,
    mode: "census",
    system: tool.system,
    status: "ok",
    proof: "conditional-grh",
    payload: { records },
  };
}

const CENSUS_PROCESS_KEYS = Object.freeze([
  "system", "mode", "execution_epoch", "round", "census_shard", "record_labels_sha256", "status",
  "response_validation_error", "response_sha256", "generated_program_sha256",
  "launched_monotonic_nanoseconds", "ended_monotonic_nanoseconds",
  "launch_to_ready_nanoseconds", "process_wall_nanoseconds", "timeout_seconds",
  "affinity_logical_cpus", "peak_rss_bytes", "stderr_sha256", "runtime_identity",
  "runtime_closure_sha256",
]);

function validateCensusProcessEvidence(processEvidence) {
  const positiveDecimal = (value) => typeof value === "string" && /^[1-9][0-9]*$/.test(value);
  const digest = (value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
  if (!hasExactKeys(processEvidence, CENSUS_PROCESS_KEYS) ||
      !SYSTEMS.includes(processEvidence.system) || processEvidence.mode !== "census" ||
      !digest(processEvidence.execution_epoch) ||
      processEvidence.round !== null ||
      !(processEvidence.census_shard === null ||
        (Number.isSafeInteger(processEvidence.census_shard) &&
          processEvidence.census_shard >= 0 && processEvidence.census_shard <= 999)) ||
      !digest(processEvidence.record_labels_sha256) ||
      !TERMINAL_STATUSES.includes(processEvidence.status) ||
      !(processEvidence.response_validation_error === null ||
        typeof processEvidence.response_validation_error === "string") ||
      !digest(processEvidence.response_sha256) ||
      !digest(processEvidence.generated_program_sha256) ||
      !positiveDecimal(processEvidence.launched_monotonic_nanoseconds) ||
      !positiveDecimal(processEvidence.ended_monotonic_nanoseconds) ||
      !(processEvidence.launch_to_ready_nanoseconds === null ||
        positiveDecimal(processEvidence.launch_to_ready_nanoseconds)) ||
      !positiveDecimal(processEvidence.process_wall_nanoseconds) ||
      !Number.isSafeInteger(processEvidence.timeout_seconds) ||
      processEvidence.timeout_seconds < 1 ||
      !Array.isArray(processEvidence.affinity_logical_cpus) ||
      processEvidence.affinity_logical_cpus.length !== 1 ||
      !Number.isSafeInteger(processEvidence.affinity_logical_cpus[0]) ||
      processEvidence.affinity_logical_cpus[0] < 0 ||
      !(processEvidence.peak_rss_bytes === null || positiveDecimal(processEvidence.peak_rss_bytes)) ||
      !digest(processEvidence.stderr_sha256) ||
      !(processEvidence.runtime_identity === null ||
        (typeof processEvidence.runtime_identity === "object" &&
          !Array.isArray(processEvidence.runtime_identity))) ||
      !(processEvidence.runtime_closure_sha256 === null ||
        digest(processEvidence.runtime_closure_sha256))) {
    throw new Error("timing requires schema-valid census process evidence");
  }
  const launched = BigInt(processEvidence.launched_monotonic_nanoseconds);
  const ended = BigInt(processEvidence.ended_monotonic_nanoseconds);
  const wall = BigInt(processEvidence.process_wall_nanoseconds);
  if (ended < launched || wall !== ended - launched ||
      (processEvidence.status === "ok" &&
        (processEvidence.launch_to_ready_nanoseconds === null ||
          BigInt(processEvidence.launch_to_ready_nanoseconds) > wall))) {
    throw new Error("timing requires internally consistent census process clocks");
  }
  return processEvidence;
}

function censusResponseFromObservations(censusByLabel, records, system, runtimeIdentity = null) {
  const payload = {
    records: records.map((record) => censusByLabel.get(record.label)?.observations?.[system]),
  };
  if (runtimeIdentity !== null) payload.runtime_identity = runtimeIdentity;
  return {
    schema: ADAPTER_SCHEMA,
    mode: "census",
    system,
    status: "ok",
    proof: "conditional-grh",
    payload,
  };
}

function validateCensusContents(census, corpus, tools) {
  if (!Array.isArray(census.records) || census.records.length !== corpus.records.length) {
    throw new Error("timing requires exactly the frozen census records");
  }
  const censusByLabel = new Map();
  census.records.forEach((record, index) => {
    const expected = corpus.records[index];
    if (!record || record.label !== expected.label || censusByLabel.has(record.label) ||
        canonicalDigest(record.expected) !== canonicalDigest({
          discriminant: expected.discriminant,
          class_number: expected.class_number,
          class_group_invariants: expected.class_group_invariants,
          oracle: "LMFDB record with used_grh=false",
        }) || !record.observations || typeof record.observations !== "object") {
      throw new Error("timing requires census records in authenticated frozen order");
    }
    for (const tool of tools) {
      const observed = record.observations[tool.system];
      if (tool.system === "sagejs") {
        validateCheckpointObservation(observed, expected);
      } else if (!observed || observed.label !== expected.label || observed.status !== "ok" ||
          observed.discriminant !== expected.discriminant ||
          observed.class_number !== expected.class_number ||
          JSON.stringify(observed.class_group_invariants) !==
            JSON.stringify(expected.class_group_invariants)) {
        throw new Error(`${tool.system} census observation disagrees with the frozen oracle`);
      }
    }
    censusByLabel.set(record.label, record);
  });
  const responses = tools.map((tool) =>
    censusResponseFromObservations(censusByLabel, corpus.records, tool.system));
  const recomputed = combineCensus(corpus, responses);
  const recordedSummary = {
    counts: census.summary?.counts,
    agreement: census.summary?.agreement,
    coverage_complete: census.summary?.coverage_complete,
  };
  if (canonicalDigest(recomputed.records) !== canonicalDigest(census.records) ||
      canonicalDigest(recomputed.summary) !== canonicalDigest(recordedSummary)) {
    throw new Error("timing requires a census whose records and summary recompute exactly");
  }
  return censusByLabel;
}

function validateCensusProcessTopology(census, corpus, tools) {
  const processes = census.summary?.processes;
  if (!Array.isArray(processes)) {
    throw new Error("timing requires authenticated census process evidence");
  }
  const availableTools = tools.filter((tool) => tool.status === "available");
  const execution = census.execution;
  const checkpointing = execution?.checkpointing;
  if (!hasExactKeys(execution, [
    "scheduler", "direct_cpus", "external_cpu", "direct_partitions",
    "max_live_direct_processes_per_cpu", "timing_authority", "checkpointing",
  ]) || !hasExactKeys(checkpointing, [
    "schema", "enabled", "scope", "parts_dir", "reused", "published",
    "not_published", "disabled",
  ]) || execution.scheduler !== "dynamic-next-shard-on-idle-cpu-list-v1" ||
      !Array.isArray(execution.direct_cpus) || execution.direct_cpus.length === 0 ||
      new Set(execution.direct_cpus).size !== execution.direct_cpus.length ||
      execution.direct_cpus.some((cpu) => !Number.isSafeInteger(cpu) || cpu < 0) ||
      !Number.isSafeInteger(execution.external_cpu) || execution.external_cpu < 0 ||
      canonicalDigest(execution.direct_partitions) !== canonicalDigest(DIRECT_CENSUS_PARTITIONS) ||
      execution.max_live_direct_processes_per_cpu !== 1 ||
      execution.timing_authority !== "none-census-is-non-authoritative" ||
      !checkpointing || checkpointing.schema !== CENSUS_PARTS_SCHEMA ||
      checkpointing.scope !== "verified-sagejs-singletons-only" ||
      typeof checkpointing.enabled !== "boolean" ||
      (checkpointing.enabled && (typeof checkpointing.parts_dir !== "string" ||
        !path.isAbsolute(checkpointing.parts_dir))) ||
      (!checkpointing.enabled && checkpointing.parts_dir !== null)) {
    throw new Error("timing requires an authenticated census execution topology");
  }
  const checkpointCounts = ["reused", "published", "not_published", "disabled"];
  if (checkpointCounts.some((key) => !Number.isSafeInteger(checkpointing[key]) ||
      checkpointing[key] < 0) ||
      (checkpointing.enabled && checkpointing.not_published !== 0) ||
      (!checkpointing.enabled && checkpointCounts.slice(0, 3)
        .some((key) => checkpointing[key] !== 0))) {
    throw new Error("timing requires valid census checkpoint accounting");
  }
  const sageTool = availableTools.find((tool) => tool.system === "sagejs");
  const eligibleSage = sageTool?.adapter_kind === "generated-sagejs-python";
  const singletonCount = DIRECT_CENSUS_PARTITIONS.sagejs.shard_count;
  if ((eligibleSage && checkpointing.enabled &&
        (checkpointing.reused + checkpointing.published !== singletonCount ||
          checkpointing.not_published !== 0 || checkpointing.disabled !== 0)) ||
      (eligibleSage && !checkpointing.enabled &&
        (checkpointing.disabled !== singletonCount || checkpointing.reused !== 0 ||
          checkpointing.published !== 0 || checkpointing.not_published !== 0)) ||
      (!eligibleSage && checkpointCounts.some((key) => checkpointing[key] !== 0))) {
    throw new Error("timing requires exact Sage.js singleton checkpoint accounting");
  }
  const expectedProcessCount = availableTools.reduce((count, tool) =>
    count + (tool.adapter_kind === "json-protocol"
      ? 1
      : directCensusShardRecords(corpus, tool.system).length), 0);
  if (processes.length !== expectedProcessCount || processes.some((process) =>
    !process || process.mode !== "census" ||
    !availableTools.some((tool) => tool.system === process.system))) {
    throw new Error("timing requires exactly the expected census process topology");
  }

  if (!hasExactKeys(census.summary, ["counts", "agreement", "coverage_complete", "processes"])) {
    throw new Error("timing requires a schema-valid census summary");
  }

  processes.forEach(validateCensusProcessEvidence);
  const censusByLabel = validateCensusContents(census, corpus, tools);

  const runtimeClosures = new Map();
  for (const tool of availableTools) {
    const matching = processes.filter((process) => process.system === tool.system);
    if (tool.adapter_kind === "json-protocol") {
      if (matching.length !== 1 || matching[0].census_shard !== null ||
          matching[0].status !== "ok" || matching[0].response_validation_error != null ||
          matching[0].record_labels_sha256 !== recordLabelsDigest(corpus.records) ||
          matching[0].affinity_logical_cpus?.length !== 1 ||
          matching[0].affinity_logical_cpus[0] !== execution.external_cpu) {
        throw new Error(`timing requires one successful full-corpus ${tool.system} census process`);
      }
      const process = matching[0];
      const expectedProgram = externalCensusProgramDigest(tool, corpus);
      if (process.generated_program_sha256 !== expectedProgram) {
        throw new Error(`${tool.system} census program does not match independent regeneration`);
      }
      const expectedResponse = censusResponseFromObservations(
        censusByLabel,
        corpus.records,
        tool.system,
        process.runtime_identity,
      );
      if (process.response_sha256 !== canonicalDigest(expectedResponse)) {
        throw new Error(`${tool.system} census process is not bound to its observations`);
      }
      const identity = validateRuntimeIdentity(
        process.runtime_identity,
        tool.system,
        expectedProgram,
      );
      const closure = runtimeClosureDigest(identity);
      if (process.runtime_closure_sha256 !== closure) {
        throw new Error(`${tool.system} census runtime closure digest is stale`);
      }
      runtimeClosures.set(tool.system, closure);
      continue;
    }

    const directShards = directCensusShardRecords(corpus, tool.system);
    const expectedDirectRuntimeClosure = tool.system === "sagejs" &&
      census.source?.candidate_runtime_closure?.direct_process_environment?.sha256
      ? census.source.candidate_runtime_closure.direct_process_environment.sha256
      : null;
    if (matching.length !== directShards.length) {
      throw new Error(
        `timing requires exactly ${directShards.length} ${tool.system} census shard processes`,
      );
    }
    const byShard = new Map();
    for (const process of matching) {
      if (!Number.isSafeInteger(process.census_shard) || process.census_shard < 0 ||
          process.census_shard >= directShards.length || byShard.has(process.census_shard) ||
          process.status !== "ok" || process.response_validation_error != null ||
          process.runtime_identity !== null ||
          process.runtime_closure_sha256 !== expectedDirectRuntimeClosure) {
        throw new Error(`${tool.system} census shard process topology is invalid`);
      }
      byShard.set(process.census_shard, process);
    }
    for (let shard = 0; shard < directShards.length; shard += 1) {
      const process = byShard.get(shard);
      const expectedProgram = directCensusProgramDigest(tool.system, directShards[shard]);
      if (process?.record_labels_sha256 !== recordLabelsDigest(directShards[shard]) ||
          process.affinity_logical_cpus?.length !== 1 ||
          !execution.direct_cpus.includes(process.affinity_logical_cpus[0]) ||
          process.generated_program_sha256 !== expectedProgram) {
        throw new Error(`${tool.system} census shard ${shard} label digest is stale`);
      }
      const expectedResponse = censusResponseFromObservations(
        censusByLabel,
        directShards[shard],
        tool.system,
      );
      if (process.response_sha256 !== canonicalDigest(expectedResponse)) {
        throw new Error(`${tool.system} census shard ${shard} is not bound to its observations`);
      }
    }
  }
  const directProcesses = processes.filter((processEvidence) =>
    availableTools.some((tool) => tool.system === processEvidence.system &&
      tool.adapter_kind !== "json-protocol"));
  const epochs = new Set(directProcesses.map((processEvidence) => processEvidence.execution_epoch));
  for (const epoch of epochs) for (const cpu of execution.direct_cpus) {
    const intervals = directProcesses.filter((processEvidence) =>
      processEvidence.execution_epoch === epoch &&
      processEvidence.affinity_logical_cpus[0] === cpu).map((processEvidence) => ({
      start: BigInt(processEvidence.launched_monotonic_nanoseconds),
      end: BigInt(processEvidence.ended_monotonic_nanoseconds),
    })).sort((left, right) => left.start < right.start ? -1 : left.start > right.start ? 1 : 0);
    if (intervals.some((interval, index) => index > 0 &&
        intervals[index - 1].end > interval.start)) {
      throw new Error(`direct census processes overlap within execution epoch on logical CPU ${cpu}`);
    }
  }
  return runtimeClosures;
}

function combineCensus(corpus, responses) {
  const responseMaps = new Map();
  const expectedLabels = new Set(corpus.records.map((record) => record.label));
  for (const response of responses) {
    if (response.status === "ok") {
      if (!response.payload || !Array.isArray(response.payload.records) ||
          response.payload.records.length !== corpus.records.length) {
        throw new Error(`${response.system} emitted the wrong census record count`);
      }
      const records = new Map();
      for (const record of response.payload.records) {
        if (!record || typeof record.label !== "string" || !expectedLabels.has(record.label) ||
            records.has(record.label) ||
            !["ok", ...CENSUS_STATUSES].includes(record.status)) {
          throw new Error(`${response.system} emitted malformed, duplicate, or foreign census data`);
        }
        records.set(record.label, record);
      }
      responseMaps.set(response.system, records);
    }
  }
  const records = corpus.records.map((expected) => {
    const observations = {};
    let status = null;
    let unavailable = false;
    let timedOut = false;
    for (const response of responses) {
      const observed = responseMaps.get(response.system)?.get(expected.label) || {
        label: expected.label,
        status: TERMINAL_STATUSES.includes(response.status) ? response.status : "error",
      };
      observations[response.system] = observed;
      if (response.system === "sagejs" && CENSUS_STATUSES.includes(observed.status)) status = observed.status;
      if (["unavailable", "comparator-unavailable"].includes(observed.status)) unavailable = true;
      if (observed.status === "timeout") timedOut = true;
      if (observed.status === "error") status = "error";
      if (observed.discriminant && observed.discriminant !== expected.discriminant) {
        status = "cross-system-disagreement";
      }
      if (observed.class_number && observed.class_number !== expected.class_number) {
        status = "cross-system-disagreement";
      }
      if (observed.class_group_invariants &&
          JSON.stringify(observed.class_group_invariants) !== JSON.stringify(expected.class_group_invariants)) {
        status = "cross-system-disagreement";
      }
    }
    if (timedOut && !["cross-system-disagreement", "error"].includes(status)) status = "timeout";
    if (unavailable && ![
      "cross-system-disagreement", "error", "timeout", "native-certificate-failure",
      "fallback-proof-failure",
    ].includes(status)) {
      status = "comparator-unavailable";
    }
    return {
      label: expected.label,
      expected: {
        discriminant: expected.discriminant,
        class_number: expected.class_number,
        class_group_invariants: expected.class_group_invariants,
        oracle: "LMFDB record with used_grh=false",
      },
      status: status || "comparator-unavailable",
      observations,
    };
  });
  const counts = {};
  records.forEach((record) => { counts[record.status] = (counts[record.status] || 0) + 1; });
  const agreement = records.every((record) =>
    !["cross-system-disagreement", "error", "native-certificate-failure", "fallback-proof-failure"]
      .includes(record.status));
  const coverageComplete = responses.every((response) => response.status === "ok") &&
    records.every((record) => !["comparator-unavailable", "timeout", "error"]
      .includes(record.status));
  return { records, summary: { counts, agreement, coverage_complete: coverageComplete } };
}

function quantile(values, probability) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(probability * sorted.length) - 1)];
}

function summarizeValues(values) {
  return {
    count: values.length,
    median: quantile(values, 0.5),
    geometric_mean: values.length === 0 ? null :
      Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length),
    p90: quantile(values, 0.9),
    p95: quantile(values, 0.95),
    p99: quantile(values, 0.99),
    worst: values.length === 0 ? null : Math.max(...values),
    within_1x: values.filter((value) => value <= 1).length,
    within_3x: values.filter((value) => value <= 3).length,
    within_10x: values.filter((value) => value <= 10).length,
  };
}

function deterministicBootstrap(valuesByShard, iterations = 2000) {
  const shards = [...valuesByShard.keys()].sort((left, right) => left - right);
  if (shards.length === 0) return { seed: "complex-cubic-frontier-bootstrap-v1", iterations, lower: null, upper: null };
  let state = 0x8f31a25d;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
  const samples = [];
  for (let sample = 0; sample < iterations; sample += 1) {
    const selected = [];
    for (let index = 0; index < shards.length; index += 1) {
      selected.push(...valuesByShard.get(shards[Math.floor(random() * shards.length)]));
    }
    samples.push(Math.exp(selected.reduce((sum, value) => sum + Math.log(value), 0) /
      selected.length));
  }
  return {
    seed: "complex-cubic-frontier-bootstrap-v1",
    iterations,
    lower: quantile(samples, 0.025),
    upper: quantile(samples, 0.975),
  };
}

function timingMetrics(events, corpus, census) {
  const metrics = {};
  const recordsByShard = shardRecords(corpus);
  const censusByLabel = new Map(census.records.map((record) => [record.label, record]));
  for (const boundary of BOUNDARIES) {
    const sage = events.filter((event) => event.boundary === boundary && event.system === "sagejs");
    const pari = events.filter((event) => event.boundary === boundary && event.system === "pari");
    const pariMap = new Map(pari.map((event) => [`${event.round}:${event.shard}`, event]));
    const shardRatios = [];
    const fieldRatios = [];
    const ratiosByShard = new Map();
    const stratified = new Map();
    for (const event of sage) {
      const other = pariMap.get(`${event.round}:${event.shard}`);
      if (!other || event.status !== "ok" || other.status !== "ok") continue;
      const sageMean = Number(BigInt(event.root_nanoseconds)) / event.iterations;
      const pariMean = Number(BigInt(other.root_nanoseconds)) / other.iterations;
      const ratio = sageMean / pariMean;
      shardRatios.push(ratio);
      if (!ratiosByShard.has(event.shard)) ratiosByShard.set(event.shard, []);
      ratiosByShard.get(event.shard).push(ratio);
      const records = recordsByShard[event.shard];
      records.forEach((record, index) => {
        const pariNs = Number(BigInt(other.per_field_nanoseconds[index]));
        const sageNs = Number(BigInt(event.per_field_nanoseconds[index]));
        if (pariNs <= 0) return;
        const fieldRatio = sageNs / pariNs;
        fieldRatios.push(fieldRatio);
        const route = censusByLabel.get(record.label)?.status || "unknown";
        const dimensions = record.selection.stratum.split("/");
        const keys = [
          `discriminant:${dimensions[0]}`,
          `class-group:${dimensions[1]}`,
          `equation-order:${dimensions[2]}`,
          `ramification:${dimensions[3]}`,
          `route:${route}`,
        ];
        for (const key of keys) {
          if (!stratified.has(key)) stratified.set(key, []);
          stratified.get(key).push(fieldRatio);
        }
      });
    }
    const corpusTotals = {};
    for (const system of SYSTEMS) {
      corpusTotals[system] = [];
      for (let round = 0; round < RETAINED_ROUNDS; round += 1) {
        const selected = events.filter((event) => event.boundary === boundary &&
          event.system === system && event.round === round && event.status === "ok");
        if (selected.length !== 20) continue;
        corpusTotals[system].push(selected.reduce((sum, event) =>
          sum + Number(BigInt(event.root_nanoseconds)) / event.iterations, 0));
      }
    }
    metrics[boundary] = {
      absolute_corpus_nanoseconds_by_round: corpusTotals,
      paired_shards: summarizeValues(shardRatios),
      paired_fields_diagnostic_only: summarizeValues(fieldRatios),
      paired_shard_geometric_mean_bootstrap_95: deterministicBootstrap(ratiosByShard),
      stratified_field_diagnostics: Object.fromEntries(
        [...stratified.entries()].sort(([left], [right]) => left.localeCompare(right))
          .map(([key, values]) => [key, summarizeValues(values)]),
      ),
    };
  }
  return metrics;
}

function selectFrontierCandidate(corpus, census, events) {
  const compare = (left, right) => {
    const discriminant = BigInt(left.discriminant_absolute) - BigInt(right.discriminant_absolute);
    if (discriminant !== 0n) return discriminant < 0n ? -1 : 1;
    const index = BigInt(left.equation_order_index) - BigInt(right.equation_order_index);
    if (index !== 0n) return index < 0n ? -1 : 1;
    const classNumber = BigInt(left.class_number) - BigInt(right.class_number);
    if (classNumber !== 0n) return classNumber < 0n ? -1 : 1;
    return left.label.localeCompare(right.label);
  };
  const censusByLabel = new Map(census.records.map((record) => [record.label, record]));
  const decline = [...corpus.records].sort(compare).find((record) =>
    censusByLabel.get(record.label)?.observations?.sagejs?.status ===
      "native-decline-fallback-pass" || censusByLabel.get(record.label)?.status ===
      "native-decline-fallback-pass");
  if (decline) {
    return {
      label: decline.label,
      reason: "smallest-discriminant-native-decline",
      discriminant_absolute: decline.discriminant_absolute,
      class_number: decline.class_number,
      equation_order_index: decline.equation_order_index,
    };
  }
  const shards = shardRecords(corpus);
  const fieldRatios = new Map(corpus.records.map((record) => [record.label, []]));
  const sage = events.filter((event) => event.boundary === "scalar-prepared" &&
    event.system === "sagejs" && event.status === "ok");
  const pari = new Map(events.filter((event) => event.boundary === "scalar-prepared" &&
    event.system === "pari" && event.status === "ok").map((event) =>
    [`${event.round}:${event.shard}`, event]));
  for (const event of sage) {
    const other = pari.get(`${event.round}:${event.shard}`);
    if (!other) continue;
    shards[event.shard].forEach((record, index) => {
      const denominator = Number(BigInt(other.per_field_nanoseconds[index]));
      if (denominator > 0) fieldRatios.get(record.label).push(
        Number(BigInt(event.per_field_nanoseconds[index])) / denominator,
      );
    });
  }
  const slower = corpus.records.filter((record) => {
    const ratios = fieldRatios.get(record.label);
    return ratios.length === 11 && quantile(ratios, 0.5) >= 3 &&
      ratios.filter((ratio) => ratio > 1).length >= 9;
  }).sort(compare)[0];
  if (!slower) return null;
  const ratios = fieldRatios.get(slower.label);
  return {
    label: slower.label,
    reason: "smallest-discriminant-stable-threefold-slowdown",
    discriminant_absolute: slower.discriminant_absolute,
    class_number: slower.class_number,
    equation_order_index: slower.equation_order_index,
    scalar_prepared_ratio_median: quantile(ratios, 0.5),
    slower_rounds: ratios.filter((ratio) => ratio > 1).length,
  };
}

async function runCensus(corpus, tools, source, options) {
  const responses = [];
  const processes = [];
  const checkpointCounts = { reused: 0, published: 0, not_published: 0, disabled: 0 };
  for (const tool of tools) {
    const batches = censusBatchPlan(corpus, tool);
    const directShards = tool.status === "available" && tool.adapter_kind !== "json-protocol";
    const cpus = directShards ? options.censusCpus : [options.cpu];
    const entries = await runBoundedCensusBatches(batches, cpus, (batch, cpu) =>
      runCensusBatchWithCheckpoint(corpus, tool, source, options, batch, cpu));
    for (const entry of entries) {
      if (entry.invocation.process !== null) processes.push(entry.invocation.process);
      const checkpointKey = entry.checkpoint.replace("-", "_");
      if (Object.hasOwn(checkpointCounts, checkpointKey)) checkpointCounts[checkpointKey] += 1;
    }
    responses.push(mergeCensusInvocations(tool, corpus, entries));
  }
  const combined = combineCensus(corpus, responses);
  return {
    schema: CENSUS_SCHEMA,
    schema_version: 1,
    recorded_at: new Date().toISOString(),
    corpus: corpusIdentity(options.corpus, corpus),
    source,
    host: hostIdentity(options.cpu),
    proof_contract: {
      request: "conditional-grh",
      sagejs: "K.class_number(proof=False)",
      pari: "bnfinit(P,0)",
      magma: "Proof := \"GRH\"",
      hecke: "class_group(...; GRH=true)",
      lmfdb_oracle: "used_grh=false",
      receipt_carrier: "live-authenticated-with-independent-exact-recomputation",
      sagejs_independent_replay: SAGE_CONDITIONAL_REPLAY_CONTRACT,
    },
    systems: tools.map((tool) => tool.system),
    tools,
    execution: {
      scheduler: "dynamic-next-shard-on-idle-cpu-list-v1",
      direct_cpus: options.censusCpus,
      external_cpu: options.cpu,
      direct_partitions: DIRECT_CENSUS_PARTITIONS,
      max_live_direct_processes_per_cpu: 1,
      timing_authority: "none-census-is-non-authoritative",
      checkpointing: {
        schema: CENSUS_PARTS_SCHEMA,
        enabled: options.censusPartsEnabled,
        scope: "verified-sagejs-singletons-only",
        parts_dir: options.censusPartsDir,
        ...checkpointCounts,
      },
    },
    records: combined.records,
    summary: { ...combined.summary, processes },
  };
}

async function runTiming(corpus, census, tools, source, options) {
  const currentCorpusIdentity = corpusIdentity(options.corpus, corpus);
  if (census.schema !== CENSUS_SCHEMA ||
      !corpusIdentitiesMatch(census.corpus, currentCorpusIdentity) ||
      !sourceIdentitiesMatchForTiming(census.source, source) ||
      JSON.stringify(census.systems) !== JSON.stringify(tools.map((tool) => tool.system)) ||
      canonicalDigest(census.tools) !== canonicalDigest(tools) ||
      !census.summary.agreement || !census.summary.coverage_complete) {
    throw new Error("timing requires a complete agreeing census for the identical corpus and source tree");
  }
  const censusRuntimeClosures = validateCensusProcessTopology(census, corpus, tools);
  const events = [];
  const processes = [];
  for (let round = 0; round < RETAINED_ROUNDS; round += 1) {
    const order = systemOrder(round, tools.map((tool) => tool.system));
    for (let position = 0; position < order.length; position += 1) {
      const tool = tools.find((entry) => entry.system === order[position]);
      const invocation = await invokeAdapter(tool, corpus, "timing", {
        ...options, round, boundaries: options.boundaries,
      });
      if (tool.adapter_kind === "json-protocol" && invocation.response.status === "ok" &&
          invocation.process.runtime_closure_sha256 !== censusRuntimeClosures.get(tool.system)) {
        throw new Error(`${tool.system} runtime closure changed after the accepted census`);
      }
      processes.push(invocation.process);
      if (invocation.response.status !== "ok") {
        for (const boundary of options.boundaries) for (let shard = 0; shard < 20; shard += 1) {
          events.push(validateTimingEvent({
            round, order_position: position, system: tool.system, boundary, shard,
            proof: "conditional-grh", status: invocation.response.status,
            iterations: 0, record_count: 50, root_nanoseconds: null,
            root_source: "one-contiguous-monotonic-timer", phase_sum_used: false,
            digest_inside_root: false, answer_digest: null, per_field_nanoseconds: [],
          }));
        }
        continue;
      }
      if (invocation.response.payload.round !== round ||
          invocation.response.payload.events.length !== options.boundaries.length * 20) {
        throw new Error(`${tool.system} emitted the wrong retained timing event count`);
      }
      const eventKeys = invocation.response.payload.events.map((event) =>
        `${event.boundary}:${event.shard}`);
      const expectedKeys = options.boundaries.flatMap((boundary) =>
        Array.from({ length: 20 }, (_, shard) => `${boundary}:${shard}`));
      if (new Set(eventKeys).size !== eventKeys.length ||
          expectedKeys.some((key) => !eventKeys.includes(key))) {
        throw new Error(`${tool.system} emitted duplicate or missing retained shard roots`);
      }
      for (const raw of invocation.response.payload.events) {
        events.push(makeTimingEvent(raw, tool.system, round, position, corpus));
      }
    }
  }
  return {
    schema: TIMING_SCHEMA,
    schema_version: 1,
    recorded_at: new Date().toISOString(),
    corpus: currentCorpusIdentity,
    census: { path: options.censusFile, sha256: sha256(fs.readFileSync(options.censusFile)) },
    source,
    host: hostIdentity(options.cpu),
    protocol: {
      retained_rounds: 11,
      shard_count: 20,
      fields_per_shard: 50,
      excluded_warmup_fields: corpus.warmups.length,
      calibration: "discarded doubling until each shard root is at least 1.2 seconds",
      minimum_retained_root_nanoseconds: MINIMUM_ROOT_NS.toString(),
      process_scope: "one fresh pinned single-threaded process per system and round",
      system_order: "left rotation by retained round",
      root_source: "one-contiguous-monotonic-timer",
      phase_sum_used: false,
      digest_inside_root: false,
      timeout_accounting: "right-censored; cap is never substituted as observed duration",
      boundaries: {
        "scalar-prepared": {
          sagejs: "fresh isomorphic field and maximal order before root; K.class_number(proof=False) inside",
          pari: "nfinit(P) before root; bnfinit(nf,0) inside",
          relationship: "PARI output is a superset; one-sided frontier evidence",
        },
        "fresh-complete": {
          sagejs: "coefficients through polynomial, field, maximal order, and K.class_number(proof=False)",
          pari: "bnfinit(P,0) from polynomial coefficients",
          relationship: "PARI output is a superset; one-sided frontier evidence",
        },
      },
    },
    tools,
    processes,
    events,
    metrics: {
      ...timingMetrics(events, corpus, census),
      frontier_candidate: selectFrontierCandidate(corpus, census, events),
    },
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  options.executionEpoch = sha256([
    process.pid,
    Date.now(),
    process.hrtime.bigint(),
    Math.random(),
    os.hostname(),
  ].join(":"));
  const corpus = loadFrozenSurveyCorpus(options.corpus, options.assetDir);
  const warmup = options.dryRun ? null : warmCandidateDirectEnvironment(corpus);
  let source = sourceIdentity(options.allowDirty);
  if (warmup) source = bindWarmedRuntimeClosure(warmup, source, corpus.records);
  options.directEnvironmentIdentity =
    source.candidate_runtime_closure.direct_process_environment;
  options.launchWrapperIdentity =
    source.candidate_runtime_closure.direct_process_environment.launch_wrappers;
  const tools = toolPlan(options);
  for (const cpu of options.censusCpus) hostIdentity(cpu);
  const plan = {
    schema: "sagejs.benchmark/complex-cubic-frontier-plan-v1",
    mode: options.mode,
    corpus: corpusIdentity(options.corpus, corpus),
    source,
    host: hostIdentity(options.cpu),
    systems: tools,
    cpu: options.cpu,
    census_execution: {
      scheduler: "dynamic-next-shard-on-idle-cpu-list-v1",
      direct_cpus: options.censusCpus,
      external_cpu: options.cpu,
      direct_partitions: DIRECT_CENSUS_PARTITIONS,
      max_live_direct_processes_per_cpu: 1,
      timing_authority: "none-census-is-non-authoritative",
      checkpointing: {
        schema: CENSUS_PARTS_SCHEMA,
        enabled: options.censusPartsEnabled,
        scope: "verified-sagejs-singletons-only",
        parts_dir: options.censusPartsDir,
      },
    },
    thread_environment: THREAD_ENV,
    boundaries: options.boundaries,
    retained_rounds: 11,
    shards: 20,
    fields_per_shard: 50,
  };
  if (options.dryRun) {
    writeJsonAtomic(options.output, plan);
    console.log(canonicalJson(plan));
    return;
  }
  const evidence = options.mode === "census"
    ? await runCensus(corpus, tools, source, options)
    : await runTiming(
      corpus,
      JSON.parse(fs.readFileSync(options.censusFile, "utf8")),
      tools,
      source,
      options,
    );
  assertRuntimeClosureUnchanged(
    source.candidate_runtime_closure,
    candidateRuntimeClosure(ROOT),
  );
  writeJsonAtomic(options.output, evidence);
  console.log(`${options.output}: ${evidence.schema}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  CENSUS_PARTS_SCHEMA,
  DIRECT_CENSUS_PARTITIONS,
  MINIMUM_ROOT_NS,
  READY_MARKER,
  RESPONSE_MARKER,
  WARMUP_MARKER,
  WARMUP_SCHEMA,
  WARMUP_ATTESTATION_SCHEMA,
  RETAINED_ROUNDS,
  THREAD_ENV,
  candidateDirectEnvironmentIdentity,
  candidateRuntimeClosure,
  assertRuntimeClosureUnchanged,
  bindWarmedRuntimeClosure,
  prepareCandidateDirectEnvironment,
  warmCandidateDirectEnvironment,
  combineCensus,
  censusBatchPlan,
  censusPartFilename,
  censusPartKey,
  directCensusShardRecords,
  directProcessEnvironment,
  externalCensusProgramDigest,
  corpusIdentitiesMatch,
  corpusIdentity,
  interpretAdapterProcessResult,
  invokeAdapter,
  makeTimingEvent,
  mergeCensusInvocations,
  normalizePariInvariants,
  nativeRelationTranscriptIsValid,
  pariCensusSource,
  pariTimingSource,
  portableCorpusIdentity,
  parseArguments,
  parseGpCensus,
  parseGpTiming,
  protocolRequest,
  quantile,
  recordLabelsDigest,
  readCensusPart,
  runFreshProcess,
  runBoundedCensusBatches,
  runCensusBatchWithCheckpoint,
  sageCensusSource,
  sageWarmupSource,
  sageTimingSource,
  shardRecords,
  systemOrder,
  timingMetrics,
  summarizeValues,
  validateCensusPart,
  validateCheckpointObservation,
  deterministicBootstrap,
  selectFrontierCandidate,
  sourceIdentitiesMatchForTiming,
  toolPlan,
  runtimeClosureDigest,
  validateCensusProcessEvidence,
  validateCensusProcessTopology,
  validateDirectSagejsTool,
  validateRuntimeIdentity,
  validateRuntimeWarmupAttestation,
  validateWarmupResponse,
};

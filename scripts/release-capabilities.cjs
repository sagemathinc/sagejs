#!/usr/bin/env node

"use strict";

// This reporter is deliberately observational. Do not import build scripts or
// require native addons here: those paths may probe a compiler, reconcile
// generated output, load a binary, provision dependencies, or publish caches.

const { createHash } = require("node:crypto");
const {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} = require("node:fs");
const {
  arch: osArch,
  homedir,
  platform: osPlatform,
  release,
  endianness,
} = require("node:os");
const {
  basename,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  BUILD_MANIFEST_SCHEMA,
  canonicalJson,
  validateBuildManifest,
} = require("./release-manifest.cjs");
const {
  validateNativeMathBuildProfile,
} = require("./native-math-profile.cjs");
const {
  readNativeDependencyReceipt,
  validateSeaNativeDependencyBindings,
} = require("./native-dependency-receipt.cjs");
const {
  validateSeaRuntimeNativeDependencyBindings,
} = require("./runtime-native-dependency-receipt.cjs");

const SCHEMA = "sagejs.release-capabilities-v3";
const BUILD_MANIFEST_ASSET = "release/build-manifest.json";
const EMBEDDED_ASSET_SCHEMA = "sagejs.embedded-assets/v1";
const NATIVE_BINARY_RECEIPT_SCHEMA = "sagejs.native-binary-receipt/v1";
const NATIVE_BINARY_REPORT_SCHEMA = "sagejs.native-binary-inspection-v1";
const NODE_TEMPLATE_LABEL = "sea/node-template";
const NODE_TEMPLATE_ROLE = "executable-template";
const EMBEDDED_ADDON_ROLE = "embedded-node-addon";
const MATH_PROFILE_VARIABLE = "SAGEJS_NATIVE_MATH_PROFILE";

const ADAPTERS = Object.freeze([
  {
    addon: "sagejs_flint_ffi.node",
    fallback: "typed-python exact arithmetic",
    id: "flint",
    package: "flint",
    requiredFiles: ["build/Release/sagejs_flint.node"],
    seaAssets: [
      "native/sagejs_flint.node",
      "native/sagejs_flint_ffi.node",
      "native/sagejs_flint_ffi_manifest.json",
    ],
  },
  {
    addon: "sagejs_fflas_ffi.node",
    fallback: "FLINT or typed-python dense prime arithmetic",
    id: "fflas-ffpack",
    package: "fflas",
    requiredFiles: [],
    seaAssets: [
      "native/sagejs_fflas_ffi.node",
      "native/sagejs_fflas_ffi_manifest.json",
    ],
  },
  {
    addon: "sagejs_igraph_ffi.node",
    fallback: "ordinary Python graph algorithms",
    id: "igraph",
    package: "graph",
    requiredFiles: ["build/Release/sagejs_graph.node"],
    seaAssets: [
      "native/sagejs_graph.node",
      "native/sagejs_igraph_ffi.node",
      "native/sagejs_igraph_ffi_manifest.json",
    ],
  },
  {
    addon: "sagejs_m4ri_ffi.node",
    fallback: "compiler-owned packed GF(2) arithmetic",
    id: "m4ri",
    package: "m4ri",
    requiredFiles: [],
    seaAssets: [
      "native/sagejs_m4ri_ffi.node",
      "native/sagejs_m4ri_ffi_manifest.json",
    ],
  },
]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

function portablePath(filename) {
  return filename.split(sep).join("/");
}

function below(parent, child) {
  const suffix = relative(parent, child);
  return suffix === "" ||
    (!suffix.startsWith(`..${sep}`) &&
      suffix !== ".." &&
      !isAbsolute(suffix));
}

function displayedPath(filename, context) {
  const absolute = resolve(filename);
  if (context.includePaths) return portablePath(absolute);
  if (below(context.root, absolute)) {
    const name = relative(context.root, absolute);
    return name === "" ? "." : portablePath(name);
  }
  if (below(context.home, absolute)) {
    const name = relative(context.home, absolute);
    return name === "" ? "<home>" : `<home>/${portablePath(name)}`;
  }
  return `<external>/${basename(absolute)}`;
}

function readJson(filename) {
  try {
    return JSON.parse(readFileSync(filename, "utf8"));
  } catch {
    return null;
  }
}

function parseJson(value) {
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function sha256(filename) {
  try {
    return createHash("sha256").update(readFileSync(filename)).digest("hex");
  } catch {
    return null;
  }
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function embeddedAssetReceipt(buildManifest, name, bytes) {
  if (bytes === null) return "missing";
  const declaration = buildManifest?.capabilities?.embeddedAssets;
  if (
    declaration?.schema !== EMBEDDED_ASSET_SCHEMA ||
    declaration.assets === null ||
    typeof declaration.assets !== "object" ||
    Array.isArray(declaration.assets)
  ) return "receipt-unavailable";
  const receipt = declaration.assets[name];
  if (
    receipt === null ||
    typeof receipt !== "object" ||
    Array.isArray(receipt) ||
    Object.keys(receipt).sort().join(",") !== "sha256,size" ||
    !/^[0-9a-f]{64}$/.test(receipt.sha256 ?? "") ||
    !Number.isSafeInteger(receipt.size) ||
    receipt.size < 0
  ) return "receipt-invalid";
  return receipt.size === bytes.length && receipt.sha256 === sha256Bytes(bytes)
    ? "verified"
    : "receipt-mismatch";
}

function exactKeys(value, keys) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function uniqueSortedStrings(value) {
  return Array.isArray(value) &&
    value.every((item) => typeof item === "string") &&
    JSON.stringify(value) === JSON.stringify(
      [...new Set(value)].sort((left, right) => left.localeCompare(right)),
    );
}

function compareVersions(left, right) {
  const a = String(left).split(".").map(Number);
  const b = String(right).split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function uniqueNumericVersions(value) {
  return Array.isArray(value) &&
    value.every((item) => typeof item === "string") &&
    new Set(value).size === value.length &&
    JSON.stringify(value) === JSON.stringify([...value].sort(compareVersions));
}

function maximumVersion(values) {
  return values.reduce(
    (maximum, value) =>
      maximum === null || compareVersions(value, maximum) > 0 ? value : maximum,
    null,
  );
}

function binaryArchitectures(file) {
  return file.format === "macho" ? file.architectures : [file.architecture];
}

function validSymbolFamilies(file) {
  if (file.format !== "elf") return true;
  const families = file.symbolVersionFamilies;
  if (families === null || typeof families !== "object" || Array.isArray(families)) {
    return false;
  }
  const allowed = new Set(["CXXABI", "GCC", "GLIBC", "GLIBCXX"]);
  for (const [family, record] of Object.entries(families)) {
    if (
      !allowed.has(family) ||
      !exactKeys(record, ["maximum", "versions"]) ||
      !uniqueNumericVersions(record.versions) ||
      typeof record.maximum !== "string" ||
      maximumVersion(record.versions) !== record.maximum
    ) return false;
  }
  return (families.GLIBC?.maximum ?? null) === (file.maximumGlibc ?? null);
}

function validPeCertificateTable(table, fileSize) {
  if (
    !exactKeys(table, ["offset", "size"]) ||
    !Number.isSafeInteger(table.offset) ||
    !Number.isSafeInteger(table.size) ||
    table.offset < 0 ||
    table.size < 0 ||
    (table.offset === 0) !== (table.size === 0)
  ) return false;
  if (table.offset === 0) return true;
  return table.offset % 8 === 0 &&
    table.offset <= fileSize &&
    table.size <= fileSize - table.offset;
}

function validNativeBinaryFileShape(file) {
  const common = ["dependencies", "format", "label", "role", "sha256", "size"];
  if (file.format === "elf") {
    if (!exactKeys(file, [...common,
      "architecture",
      "endianness",
      "glibcVersions",
      "interpreter",
      "machine",
      "maximumGlibc",
      "osAbi",
      "requiredSymbolVersions",
      "rpaths",
      "symbolVersionFamilies",
      "wordSize",
    ])) return false;
    return file.endianness === "little" &&
      file.wordSize === 64 &&
      Number.isSafeInteger(file.machine) &&
      Number.isSafeInteger(file.osAbi) &&
      (file.interpreter === null || typeof file.interpreter === "string") &&
      uniqueSortedStrings(file.rpaths) &&
      uniqueSortedStrings(file.requiredSymbolVersions) &&
      Array.isArray(file.glibcVersions) &&
      JSON.stringify(file.glibcVersions) ===
        JSON.stringify(file.symbolVersionFamilies.GLIBC?.versions ?? []);
  }
  if (file.format === "macho") {
    if (!exactKeys(file, [...common,
      "architectures",
      "maximumMinimumMacos",
      "rpaths",
      "slices",
      "universal",
    ]) ||
      !uniqueSortedStrings(file.architectures) ||
      !uniqueSortedStrings(file.rpaths) ||
      !Array.isArray(file.slices) ||
      file.universal !== (file.slices.length > 1)
    ) return false;
    for (const slice of file.slices) {
      if (
        !exactKeys(slice, [
          "architecture",
          "declaredMinimumMacos",
          "dependencies",
          "endianness",
          "machine",
          "minimumMacos",
          "rpaths",
          "wordSize",
        ]) ||
        typeof slice.architecture !== "string" ||
        !Number.isSafeInteger(slice.machine) ||
        slice.wordSize !== 64 ||
        slice.endianness !== "little" ||
        (slice.minimumMacos !== null && typeof slice.minimumMacos !== "string") ||
        !uniqueNumericVersions(slice.declaredMinimumMacos) ||
        !uniqueSortedStrings(slice.dependencies) ||
        !uniqueSortedStrings(slice.rpaths)
      ) return false;
    }
    return JSON.stringify(file.architectures) ===
      JSON.stringify(file.slices.map(({ architecture }) => architecture)) &&
      JSON.stringify(file.dependencies) === JSON.stringify(
        [...new Set(file.slices.flatMap(({ dependencies }) => dependencies))]
          .sort((left, right) => left.localeCompare(right)),
      ) &&
      JSON.stringify(file.rpaths) === JSON.stringify(
        [...new Set(file.slices.flatMap(({ rpaths }) => rpaths))]
          .sort((left, right) => left.localeCompare(right)),
      ) &&
      file.maximumMinimumMacos === maximumVersion(
        file.slices.map(({ minimumMacos }) => minimumMacos).filter(Boolean),
      );
  }
  if (file.format === "pe") {
    return exactKeys(file, [...common,
      "architecture",
      "certificateTable",
      "delayDependencies",
      "machine",
      "subsystem",
      "wordSize",
    ]) &&
      file.wordSize === 64 &&
      Number.isSafeInteger(file.machine) &&
      Number.isSafeInteger(file.subsystem) &&
      validPeCertificateTable(file.certificateTable, file.size) &&
      uniqueSortedStrings(file.delayDependencies);
  }
  return false;
}

function nativeBinaryReceiptContract(buildManifest, embedded) {
  const receipt = buildManifest?.toolchain?.nativeBinaries;
  if (
    !exactKeys(receipt, ["report", "reportSha256", "schema"]) ||
    receipt.schema !== NATIVE_BINARY_RECEIPT_SCHEMA ||
    !/^[0-9a-f]{64}$/.test(receipt.reportSha256 ?? "") ||
    receipt.reportSha256 !== sha256Bytes(canonicalJson(receipt.report))
  ) return false;
  const report = receipt.report;
  if (
    !exactKeys(report, [
      "aggregate",
      "files",
      "inputSetSha256",
      "ok",
      "policy",
      "schema",
      "violations",
    ]) ||
    report.schema !== NATIVE_BINARY_REPORT_SCHEMA ||
    report.ok !== true ||
    !Array.isArray(report.violations) ||
    report.violations.length !== 0 ||
    !Array.isArray(report.files) ||
    report.files.length === 0 ||
    !/^[0-9a-f]{64}$/.test(report.inputSetSha256 ?? "")
  ) return false;

  const target = buildManifest.target;
  const expectedFormat = { darwin: "macho", linux: "elf", win32: "pe" }[
    target.platform
  ];
  const expectedLabels = [
    NODE_TEMPLATE_LABEL,
    ...[...embedded.assets].filter((name) => name.endsWith(".node")),
  ].sort((left, right) => left.localeCompare(right));
  const policy = report.policy;
  const policyKeys = [
    "architectures",
    "exactArchitectures",
    "format",
    "requiredLabels",
    ...(target.platform === "darwin" ? ["maximumMinimumMacos"] : []),
  ];
  if (
    !exactKeys(policy, policyKeys) ||
    JSON.stringify(policy.architectures) !== JSON.stringify([target.arch]) ||
    policy.exactArchitectures !== true ||
    policy.format !== expectedFormat ||
    JSON.stringify(policy.requiredLabels) !== JSON.stringify(expectedLabels) ||
    (target.platform === "darwin" &&
      !/^\d+(?:\.\d+){1,2}$/.test(policy.maximumMinimumMacos ?? ""))
  ) return false;
  const files = [...report.files].sort((left, right) =>
    String(left?.label).localeCompare(String(right?.label)));
  if (
    JSON.stringify(files.map((file) => file?.label)) !== JSON.stringify(expectedLabels) ||
    new Set(files.map((file) => file?.label)).size !== files.length
  ) return false;

  for (const file of files) {
    const expectedRole = file.label === NODE_TEMPLATE_LABEL
      ? NODE_TEMPLATE_ROLE
      : EMBEDDED_ADDON_ROLE;
    if (
      file.role !== expectedRole ||
      file.format !== expectedFormat ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      !/^[0-9a-f]{64}$/.test(file.sha256 ?? "") ||
      !uniqueSortedStrings(file.dependencies) ||
      !validNativeBinaryFileShape(file) ||
      (file.delayDependencies !== undefined &&
        !uniqueSortedStrings(file.delayDependencies)) ||
      !validSymbolFamilies(file) ||
      JSON.stringify([...binaryArchitectures(file)].sort()) !==
        JSON.stringify([target.arch])
    ) return false;
    if (target.platform === "darwin") {
      for (const slice of file.slices) {
        const declared = maximumVersion(slice.declaredMinimumMacos);
        if (
          declared === null ||
          slice.minimumMacos !== declared ||
          compareVersions(
            slice.minimumMacos,
            policy.maximumMinimumMacos,
          ) > 0
        ) return false;
      }
    }
    if (file.label === NODE_TEMPLATE_LABEL) {
      if (file.sha256 !== buildManifest.toolchain?.seaNode?.executableSha256) {
        return false;
      }
    } else {
      const bytes = embedded.bytes(file.label);
      if (
        bytes === null ||
        file.size !== bytes.length ||
        file.sha256 !== sha256Bytes(bytes)
      ) return false;
    }
  }
  const expectedInputSetSha256 = sha256Bytes(JSON.stringify(files.map(
    ({ label, role, sha256, size }) => ({ label, role, sha256, size }),
  )));
  if (report.inputSetSha256 !== expectedInputSetSha256) return false;

  const aggregate = report.aggregate;
  if (!exactKeys(aggregate, [
    "architectures",
    "dependencies",
    "formats",
    "maximumGlibc",
    "maximumMinimumMacos",
    "maximumSymbolVersions",
  ])) return false;
  const architectures = [...new Set(files.flatMap(binaryArchitectures))]
    .sort((left, right) => left.localeCompare(right));
  const dependencies = [...new Set(files.flatMap((file) => [
    ...file.dependencies,
    ...(file.delayDependencies ?? []),
  ]))].sort((left, right) => left.localeCompare(right));
  const formats = [...new Set(files.map((file) => file.format))]
    .sort((left, right) => left.localeCompare(right));
  const maximumGlibc = maximumVersion(
    files.map((file) => file.maximumGlibc).filter(Boolean),
  );
  const maximumMinimumMacos = maximumVersion(
    files.map((file) => file.maximumMinimumMacos).filter(Boolean),
  );
  const maximumSymbolVersions = {};
  for (const family of ["CXXABI", "GCC", "GLIBC", "GLIBCXX"]) {
    const maximum = maximumVersion(
      files.map((file) => file.symbolVersionFamilies?.[family]?.maximum).filter(Boolean),
    );
    if (maximum !== null) maximumSymbolVersions[family] = maximum;
  }
  if (
    JSON.stringify(aggregate.architectures) !== JSON.stringify(architectures) ||
    JSON.stringify(aggregate.dependencies) !== JSON.stringify(dependencies) ||
    JSON.stringify(aggregate.formats) !== JSON.stringify(formats) ||
    aggregate.maximumGlibc !== maximumGlibc ||
    aggregate.maximumMinimumMacos !== maximumMinimumMacos ||
    JSON.stringify(aggregate.maximumSymbolVersions) !==
      JSON.stringify(maximumSymbolVersions)
  ) return false;
  if (
    target.platform === "darwin" &&
    (maximumMinimumMacos === null ||
      compareVersions(maximumMinimumMacos, policy.maximumMinimumMacos) > 0)
  ) return false;
  return target.platform !== "linux" ||
    (target.libc?.family === "glibc" && target.libc.version === maximumGlibc);
}

function embeddedReceiptContract(buildManifest, embedded) {
  if (buildManifest === null) return false;
  const capabilities = buildManifest.capabilities;
  if (!exactKeys(capabilities, [
    "artifact",
    "embeddedAssets",
    "nativeDependencies",
    "nativeKernels",
    "runtimeNativeDependencies",
  ])) {
    return false;
  }
  const artifact = capabilities.artifact;
  if (
    !exactKeys(artifact, ["kind", "nativeMathematics"]) ||
    artifact.kind !== "single-executable" ||
    typeof artifact.nativeMathematics !== "boolean"
  ) return false;
  const embeddedAssets = capabilities.embeddedAssets;
  if (
    !exactKeys(embeddedAssets, ["assets", "schema"]) ||
    embeddedAssets.schema !== EMBEDDED_ASSET_SCHEMA ||
    embeddedAssets.assets === null ||
    typeof embeddedAssets.assets !== "object" ||
    Array.isArray(embeddedAssets.assets)
  ) return false;
  const declaredNames = Object.keys(embeddedAssets.assets).sort();
  const actualNames = [...embedded.assets]
    .filter((name) => name !== BUILD_MANIFEST_ASSET)
    .sort();
  if (JSON.stringify(declaredNames) !== JSON.stringify(actualNames)) return false;
  if (declaredNames.some((name) =>
    embeddedAssetReceipt(buildManifest, name, embedded.bytes(name)) !== "verified")) {
    return false;
  }
  if (!nativeBinaryReceiptContract(buildManifest, embedded)) return false;
  try {
    validateSeaRuntimeNativeDependencyBindings(
      capabilities.runtimeNativeDependencies,
      {
        assets: embedded.assets,
        binaryLabels: buildManifest.toolchain.nativeBinaries.report.files
          .map(({ label }) => label),
        bytes: embedded.bytes,
        maximumMinimumMacos:
          buildManifest.toolchain.nativeBinaries.report.aggregate
            .maximumMinimumMacos,
        target: buildManifest.target,
      },
    );
  } catch {
    return false;
  }
  const nativeProfile = buildManifest.toolchain.nativeMathProfile;
  if (!artifact.nativeMathematics) {
    if (
      capabilities.nativeDependencies !== null ||
      capabilities.nativeKernels !== null ||
      nativeProfile !== null
    ) return false;
    return !Object.keys(embeddedAssets.assets).some((name) =>
      name.startsWith("native-kernels/") ||
      /^native\/sagejs_(?:flint|fflas|igraph|graph|m4ri)/.test(name));
  }
  if (
    capabilities.nativeDependencies === null ||
    capabilities.nativeKernels === null ||
    nativeProfile === null ||
    embeddedKernelDeclaration(buildManifest) === null
  ) return false;
  try {
    validateNativeMathBuildProfile(nativeProfile, buildManifest.target);
    validateSeaNativeDependencyBindings(capabilities.nativeDependencies, {
      assets: embedded.assets,
      binaryLabels: buildManifest.toolchain.nativeBinaries.report.files
        .map(({ label }) => label),
      bytes: embedded.bytes,
      mathProfile: nativeProfile,
      maximumMinimumMacos:
        buildManifest.toolchain.nativeBinaries.report.aggregate
          .maximumMinimumMacos,
      target: buildManifest.target,
    });
  } catch {
    return false;
  }
  const required = ADAPTERS
    .filter((adapter) =>
      !(adapter.id === "m4ri" && buildManifest.target.platform === "win32"))
    .flatMap((adapter) => adapter.seaAssets);
  return required.every((name) => declaredNames.includes(name));
}

function directoryPresence(filename) {
  try {
    if (!statSync(filename).isDirectory()) return "absent";
    return readdirSync(filename).length === 0 ? "empty" : "nonempty";
  } catch {
    return "absent";
  }
}

function safeGit(root, arguments_) {
  const result = spawnSync("git", arguments_, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 5000,
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim();
}

function gitObservation(root, runGit = safeGit) {
  if (!existsSync(join(root, ".git"))) {
    return {
      commit: null,
      commonDirectory: null,
      dirty: null,
      present: false,
    };
  }
  const commit = runGit(root, ["rev-parse", "HEAD"]);
  const changes = runGit(root, [
    "-c",
    "core.fsmonitor=false",
    "status",
    "--porcelain=v1",
    "--untracked-files=normal",
  ]);
  const commonDirectory = runGit(root, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  return {
    commit: commit && /^[0-9a-f]{40}$/.test(commit) ? commit : null,
    commonDirectory: commonDirectory || null,
    dirty: changes === null ? null : changes !== "",
    present: true,
  };
}

function runtimeLibc(platform, report) {
  if (platform === "darwin") return "libc";
  if (platform === "win32") return "msvc";
  try {
    return report().header.glibcVersionRuntime ? "glibc" : "musl";
  } catch {
    return "unknown";
  }
}

function currentEmbeddedContext() {
  try {
    const sea = require("node:sea");
    if (!sea.isSea()) return null;
    const assets = new Set(sea.getAssetKeys());
    const bytes = (name) =>
      assets.has(name) ? Buffer.from(sea.getAsset(name)) : null;
    return {
      assets,
      bytes,
      text: (name) => bytes(name)?.toString("utf8") ?? null,
    };
  } catch {
    return null;
  }
}

function embeddedContext(options) {
  if (options.seaAssets === undefined && options.embeddedAssets === undefined) {
    return currentEmbeddedContext();
  }
  const contents = options.embeddedAssets || {};
  const assets = new Set([
    ...(options.seaAssets || []),
    ...Object.keys(contents),
  ]);
  const bytes = (name) => Object.hasOwn(contents, name)
    ? Buffer.from(contents[name])
    : null;
  return {
    assets,
    bytes,
    text: (name) => bytes(name)?.toString("utf8") ?? null,
  };
}

function artifactContext(root, options, embedded) {
  return {
    kind: options.artifactKind ||
      (embedded !== null
        ? "single-executable"
        : existsSync(join(root, ".git"))
          ? "source-checkout"
          : "npm-package"),
    target: `${options.platform}-${options.arch}`,
  };
}

function buildReceipt(options, embedded) {
  let source = null;
  let manifest = null;
  if (options.buildManifest !== undefined) {
    source = "explicit";
    manifest = options.buildManifest;
  } else if (embedded?.assets.has(BUILD_MANIFEST_ASSET)) {
    source = "embedded";
    manifest = parseJson(embedded.text(BUILD_MANIFEST_ASSET));
  }
  try {
    validateBuildManifest(manifest);
    if (embedded !== null && !embeddedReceiptContract(manifest, embedded)) {
      throw new Error("embedded receipt contract is invalid");
    }
    if (
      embedded !== null &&
      (manifest.target.platform !== options.platform ||
        manifest.target.arch !== options.arch ||
        manifest.target.endianness !== options.endianness ||
        manifest.target.nodeAbi !== options.versions.modules ||
        manifest.target.nodeNapi !== options.versions.napi)
    ) {
      throw new Error("embedded receipt target does not match this runtime");
    }
  } catch {
    return {
      availability: "unavailable",
      reason: source === null
        ? "no immutable release build manifest"
        : "invalid immutable release build manifest",
      source,
    };
  }
  return {
    availability: "available",
    manifest: stable(manifest),
    source,
  };
}

function runtimePolicy(environment) {
  const mode = environment.SAGEJS_NATIVE_MODE || "auto";
  const modeValid = ["auto", "dynamic", "javascript", "native"].includes(mode);
  const autoloadRequested = environment.SAGEJS_NATIVE_AUTOLOAD ?? null;
  const requiredRequested = environment.SAGEJS_NATIVE_REQUIRED === "1";
  const warnRequested = environment.SAGEJS_NATIVE_WARN_FALLBACK === "1";
  const disableRequested = environment.SAGEJS_NATIVE_DISABLE === "1";
  const nativeRequired = modeValid &&
    (mode === "native" || (mode === "auto" && requiredRequested));
  const cacheDiscovery = !modeValid
    ? "invalid"
    : mode === "dynamic"
      ? "disabled-by-mode"
      : mode === "auto" && autoloadRequested === "0"
        ? "disabled-by-autoload"
        : "enabled";
  const addonLoading = !modeValid
    ? "invalid"
    : mode === "dynamic" || mode === "javascript"
      ? "disabled-by-mode"
      : mode === "auto" && disableRequested
        ? "disabled-by-disable"
        : "enabled";
  return {
    addonLoading: {
      disableRequested,
      effective: addonLoading,
      scope: "generated @native addon loading; not generated FFI",
    },
    cacheDiscovery: {
      autoloadRequested,
      effective: cacheDiscovery,
      scope: "@native cache discovery",
    },
    fallback: {
      effective: !modeValid
        ? "invalid"
        : nativeRequired
        ? "required"
        : warnRequested ? "warn" : "allow",
      warnRequested,
    },
    mode: {
      effectiveCandidatePolicy: !modeValid
        ? "invalid"
        : mode === "native"
          ? "native-required"
          : mode,
      requested: mode,
      valid: modeValid,
    },
    required: {
      effective: modeValid ? nativeRequired : "invalid",
      requested: requiredRequested,
      scope: "@native resolution",
    },
  };
}

function inspectAdapter(definition, context) {
  const directory = join(
    context.root,
    "packages",
    definition.package,
    "build",
    "generated-ffi",
  );
  const manifest = readJson(join(directory, "manifest.json"));
  const addonName = typeof manifest?.addon === "string"
    ? manifest.addon
    : definition.addon;
  const addonPath = join(directory, addonName);
  const sourcePath = join(
    context.root,
    "packages",
    definition.package,
    "generated",
    "ffi_host.py",
  );
  const hashesPresent =
    typeof manifest?.addon_hash === "string" &&
    typeof manifest?.source_hash === "string";
  const manifestCurrent = hashesPresent &&
    sha256(addonPath) === manifest.addon_hash &&
    sha256(sourcePath) === manifest.source_hash;
  const compiled =
    manifest?.schema === "sagejs.ffi/generated-host-adapter-v1" &&
    existsSync(addonPath) &&
    manifestCurrent &&
    definition.requiredFiles.every((filename) =>
      existsSync(
        join(context.root, "packages", definition.package, filename),
      ));
  const embeddedReceipts = context.embedded === null
    ? []
    : definition.seaAssets.map((asset) => embeddedAssetReceipt(
        context.buildManifest,
        asset,
        context.embedded.bytes(asset),
      ));
  const embeddedFilesVerified = embeddedReceipts.length !== 0 &&
    embeddedReceipts.every((receipt) => receipt === "verified");
  const embeddedManifestAsset = definition.seaAssets.find((asset) =>
    asset.endsWith("_manifest.json"));
  const embeddedAddonAsset = `native/${definition.addon}`;
  const embeddedManifest = embeddedManifestAsset === undefined
    ? null
    : parseJson(context.embedded?.text(embeddedManifestAsset));
  const embeddedAddon = context.embedded?.bytes(embeddedAddonAsset) ?? null;
  const embeddedIntegrity = embeddedFilesVerified &&
    embeddedManifest?.schema === "sagejs.ffi/generated-host-adapter-v1" &&
    embeddedManifest.addon === definition.addon &&
    typeof embeddedManifest.addon_hash === "string" &&
    embeddedAddon !== null &&
    sha256Bytes(embeddedAddon) === embeddedManifest.addon_hash;
  const platformUnavailable =
    definition.id === "m4ri" && context.platform === "win32";
  let candidate;
  let manifestIntegrity;
  if (platformUnavailable) {
    candidate = "unavailable";
    manifestIntegrity = "platform-capability-disabled";
  } else if (embeddedIntegrity) {
    candidate = "bundled";
    manifestIntegrity = "verified-embedded";
  } else if (context.embedded === null && compiled) {
    candidate = "compiled";
    manifestIntegrity = "verified";
  } else {
    candidate = "unavailable";
    manifestIntegrity = embeddedReceipts.length !== 0
      ? embeddedReceipts.includes("missing")
        ? "embedded-missing"
        : "embedded-receipt-mismatch"
      : manifest !== null && !manifestCurrent
        ? "mismatch"
        : "not-installed";
  }
  return {
    candidate,
    fallback: {
      availability: "not-probed",
      declaration: "declared",
      implementation: definition.fallback,
    },
    id: definition.id,
    kind: "generated-ffi-adapter",
    loadability: "not-probed",
    manifestIntegrity,
    selection: "not-probed",
  };
}

function nativeKernelRecordValid(record) {
  return record !== null &&
    typeof record === "object" &&
    /^[0-9a-f]{64}$/.test(record.cacheKey ?? "") &&
    /^[0-9a-f]{64}$/.test(record.sourceHash ?? "") &&
    Number.isSafeInteger(record.nativeAbi) &&
    Array.isArray(record.foreignDeclarations);
}

function expectedProductionSources(root) {
  const manifest = readJson(join(root, "architecture", "native-kernels.json"));
  if (!Array.isArray(manifest?.kernels)) return null;
  const sources = manifest.kernels
    .filter((kernel) => kernel.id?.endsWith("-production"))
    .map((kernel) => kernel.source)
    .filter((source) => typeof source === "string" && source.startsWith("src/lib/"))
    .map((source) => source.slice("src/lib/".length));
  return sources.length === 0 ? null : [...new Set(sources)].sort();
}

function validateKernelIndex(index, readAsset, expectedSources) {
  if (index?.schema !== "sagejs.native-cache/v3") return false;
  if (!Array.isArray(expectedSources) || expectedSources.length === 0) return false;
  const records = index.logicalSources;
  if (records === null || typeof records !== "object") return false;
  const names = Object.keys(records).sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedSources)) {
    return false;
  }
  if (names.length === 0) return false;
  return names.every((name) => {
    const record = records[name];
    if (!nativeKernelRecordValid(record)) return false;
    return readAsset(`${record.cacheKey}/index.cjs`) &&
      readAsset(
        `${record.cacheKey}/build/Release/sagejs_native_kernel.node`,
      );
  });
}

function embeddedKernelDeclaration(buildManifest) {
  const declaration = buildManifest?.capabilities?.nativeKernels;
  const exactKeys = [
    "authorityPath",
    "authoritySha256",
    "expected",
    "indexIdentitySha256",
    "indexPath",
    "indexSha256",
    "logicalSources",
    "schema",
  ];
  if (
    declaration === null ||
    typeof declaration !== "object" ||
    Array.isArray(declaration) ||
    Object.keys(declaration).sort().join(",") !== exactKeys.sort().join(",") ||
    declaration.schema !== "sagejs.native-kernel-receipt/v1" ||
    declaration.authorityPath !== "architecture/native-kernels.json" ||
    declaration.indexPath !== "native-kernels/index.json" ||
    !/^[0-9a-f]{64}$/.test(declaration.authoritySha256 ?? "") ||
    !/^[0-9a-f]{64}$/.test(declaration.indexSha256 ?? "") ||
    !Number.isSafeInteger(declaration.expected) ||
    declaration.expected <= 0 ||
    !/^[0-9a-f]{64}$/.test(declaration.indexIdentitySha256 ?? "") ||
    !Array.isArray(declaration.logicalSources) ||
    declaration.logicalSources.some((source) =>
      typeof source !== "string" ||
      source.length === 0 ||
      source.startsWith("/") ||
      source.includes("\\") ||
      source.split("/").some((part) => part === "" || part === "." || part === "..")) ||
    new Set(declaration.logicalSources).size !== declaration.logicalSources.length ||
    declaration.expected !== declaration.logicalSources.length
  ) return null;
  return {
    indexIdentitySha256: declaration.indexIdentitySha256,
    indexSha256: declaration.indexSha256,
    logicalSources: [...declaration.logicalSources].sort(),
  };
}

function validateEmbeddedKernelIndex(context, index, indexBytes) {
  const declaration = embeddedKernelDeclaration(context.buildManifest);
  if (declaration === null || indexBytes === null) return false;
  if (
    embeddedAssetReceipt(
      context.buildManifest,
      "native-kernels/index.json",
      indexBytes,
    ) !== "verified" ||
    sha256Bytes(indexBytes) !== declaration.indexSha256 ||
    sha256Bytes(Buffer.from(canonicalJson(index))) !==
      declaration.indexIdentitySha256
  ) return false;
  return validateKernelIndex(
    index,
    (name) => {
      const asset = `native-kernels/${name}`;
      return embeddedAssetReceipt(
        context.buildManifest,
        asset,
        context.embedded.bytes(asset),
      ) === "verified";
    },
    declaration.logicalSources,
  );
}

function inspectNativeKernels(context) {
  // A relocated SEA has no authoritative neighboring checkout. Its immutable
  // build receipt declares the exact logical source set instead.
  const expected = context.embedded === null
    ? expectedProductionSources(context.root)
    : null;
  let candidate = "unavailable";
  let integrity = "not-installed";
  if (context.embedded?.assets.has("native-kernels/index.json")) {
    const indexBytes = context.embedded.bytes("native-kernels/index.json");
    const index = parseJson(indexBytes?.toString("utf8") ?? "");
    const complete = validateEmbeddedKernelIndex(context, index, indexBytes);
    integrity = complete ? "complete" : "incomplete";
    candidate = complete ? "bundled" : "unavailable";
  } else if (context.embedded === null) {
    const index = readJson(join(context.nativeKernelCache, "index.json"));
    if (index !== null) {
      const complete = validateKernelIndex(
        index,
        (name) => existsSync(join(context.nativeKernelCache, name)),
        expected,
      );
      integrity = complete ? "complete" : "incomplete";
      candidate = complete ? "compiled" : "unavailable";
    }
  }
  return {
    candidate,
    fallback: {
      availability: "not-probed",
      declaration: "declared",
      implementation: "the same typed Python source body",
    },
    id: "typed-python-native-kernels",
    integrity,
    kind: "@native-production-cache",
    loadability: "not-probed",
    selection: "not-probed",
  };
}

function findInstalledMathProfile(root, target, environment) {
  const platform = target.platform;
  const defaultPrefix = platform === "win32"
    ? join(
        root,
        "packages",
        "flint",
        ".native",
        "vcpkg-installed",
        "x64-windows-static-release",
      )
    : join(root, "packages", "flint", ".native", "prefix");
  const prefix = resolve(environment.SAGEJS_FLINT_PREFIX || defaultPrefix);
  const stamp = readNativeDependencyReceipt(
    join(prefix, ".sagejs-flint-dependencies.json"),
    { prefix },
  );
  const candidate = stamp?.mathProfile ?? null;
  return { prefix, profile: validatedMathProfile(candidate, target) };
}

function validatedMathProfile(profile, target) {
  try {
    return validateNativeMathBuildProfile(profile, target);
  } catch {
    return null;
  }
}

function requestedMathBuildProfile(platform, arch, environment) {
  const requested = environment[MATH_PROFILE_VARIABLE] || "portable";
  const requestValid = ["portable", "cpu-native"].includes(requested);
  const cpuNativeSupported = ["linux", "darwin"].includes(platform) &&
    ["x64", "arm64"].includes(arch);
  return {
    effective: requestValid && requested === "cpu-native" && cpuNativeSupported
      ? "cpu-native"
      : "portable",
    requestValid,
    requested,
    buildProbe: "not-run",
  };
}

function profileCompatibility(request, installed) {
  if (installed === null) return "not-observed";
  if (!request.requestValid) return "invalid-build-request";
  if (installed.effectiveProfile === undefined) return "unknown";
  return installed.effectiveProfile === request.effective
    ? "effective-build-request-match"
    : "build-request-mismatch";
}

function cacheRecord(id, filename, context) {
  return {
    id,
    inspection: "not-inspected",
    path: displayedPath(filename, context),
    presence: directoryPresence(filename),
  };
}

function collectReleaseCapabilities(options = {}) {
  const root = resolve(options.root || join(__dirname, ".."));
  const environment = options.environment || process.env;
  const platform = options.platform || osPlatform();
  const arch = options.arch || osArch();
  const versions = options.versions || process.versions;
  const home = resolve(options.home || homedir());
  const embedded = embeddedContext(options);
  const packageManifest = readJson(join(root, "package.json")) || {};
  const git = options.git || gitObservation(root, options.runGit);
  const artifact = artifactContext(
    root,
    { ...options, platform, arch },
    embedded,
  );
  const receipt = buildReceipt(
    {
      ...options,
      arch,
      endianness: options.endianness || endianness(),
      platform,
      versions,
    },
    embedded,
  );
  const runtimeCompiled = existsSync(join(root, "dist", "tools", "kernel.js")) &&
    existsSync(join(root, "dist", "compiler", "compiler.js"));
  const runtimeBundled = embedded !== null &&
    receipt.availability === "available" &&
    embeddedAssetReceipt(
      receipt.manifest,
      "compiler/compiler.js",
      embedded.bytes("compiler/compiler.js"),
    ) === "verified";
  const runtimeCandidate = runtimeBundled
    ? "bundled"
    : embedded === null && runtimeCompiled ? "compiled" : "unavailable";
  const cacheBase = resolve(environment.XDG_CACHE_HOME || join(home, ".cache"));
  const moduleCache = join(cacheBase, "sagejs", "modules");
  const dynamicCache = resolve(
    environment.SAGEJS_DYNAMIC_CACHE_DIR || join(cacheBase, "sagejs", "dynamic"),
  );
  const nativeKernelCache = resolve(
    environment.SAGEJS_NATIVE_CACHE_DIR || join(root, "dist", "native-kernels"),
  );
  const commonDirectory = git.commonDirectory
    ? resolve(git.commonDirectory)
    : null;
  const sharedNativeCache = resolve(
    environment.SAGEJS_PARALLEL_NATIVE_CACHE ||
      (commonDirectory
        ? join(commonDirectory, "sagejs-native-artifacts")
        : join(cacheBase, "sagejs", "parallel-native-artifacts")),
  );
  const displayContext = {
    home,
    includePaths: options.includePaths === true,
    root,
  };
  const mathBuildRequest = requestedMathBuildProfile(
    platform,
    arch,
    environment,
  );
  const observedTarget = receipt.availability === "available"
    ? receipt.manifest.target
    : {
        arch,
        endianness: options.endianness || endianness(),
        platform,
        wordBits: ["x64", "arm64"].includes(arch) ? 64 : null,
      };
  // A SEA's nearby checkout is not part of its build receipt. Observe an
  // installed dependency prefix only for non-SEA source/package execution.
  const installedMath = embedded === null
    ? findInstalledMathProfile(root, observedTarget, environment)
    : { prefix: null, profile: null };
  const builtMath = receipt.availability === "available"
    ? validatedMathProfile(
        receipt.manifest.toolchain.nativeMathProfile ?? null,
        observedTarget,
      )
    : null;
  const observedMath = builtMath ?? installedMath.profile;
  const capabilityContext = {
    buildManifest: receipt.availability === "available"
      ? receipt.manifest
      : null,
    embedded,
    nativeKernelCache,
    platform,
    root,
  };
  const capabilities = [
    {
      candidate: runtimeCandidate,
      id: "python-sage-compiler",
      kind: "runtime",
      loadability: "not-probed",
      selection: "not-probed",
    },
    inspectNativeKernels(capabilityContext),
    ...ADAPTERS.map((definition) => inspectAdapter(definition, capabilityContext)),
  ].sort((left, right) => left.id.localeCompare(right.id));
  return stable({
    artifact,
    buildReceipt: receipt,
    caches: [
      cacheRecord("dynamic-code", dynamicCache, displayContext),
      cacheRecord("module", moduleCache, displayContext),
      cacheRecord("native-kernel", nativeKernelCache, displayContext),
      cacheRecord("shared-native-artifacts", sharedNativeCache, displayContext),
    ],
    capabilities,
    nativeMathProfile: {
      buildRequest: mathBuildRequest,
      compatibility: profileCompatibility(mathBuildRequest, observedMath),
      observedBuild: observedMath === null
        ? null
        : {
            effective: observedMath.effectiveProfile ??
              observedMath.effective ?? null,
            fingerprint: observedMath.fingerprint ?? null,
            requested: observedMath.requestedProfile ??
              observedMath.requested ?? null,
            source: builtMath !== null
              ? "build-manifest"
              : "installed-profile-stamp",
          },
      installedPrefix: installedMath.prefix === null
        ? null
        : displayedPath(installedMath.prefix, displayContext),
    },
    nativePolicy: runtimePolicy(environment),
    observation: {
      claim: "stable-runtime-observation",
      observational: true,
    },
    runtimeObservation: {
      checkout: {
        commit: git.commit ?? null,
        dirty: git.dirty ?? null,
        present: git.present ?? false,
      },
      host: {
        arch,
        libc: options.libc || runtimeLibc(
          platform,
          options.processReport || (() => process.report.getReport()),
        ),
        node: {
          abi: versions.modules || null,
          napi: versions.napi || null,
          version: versions.node || null,
        },
        platform,
        release: options.hostRelease || release(),
      },
      package: {
        name: packageManifest.name || null,
        version: packageManifest.version || null,
      },
    },
    schema: SCHEMA,
  });
}

function formatReleaseCapabilities(report) {
  const runtime = report.runtimeObservation;
  const receipt = report.buildReceipt;
  const buildIdentity = receipt.availability === "available"
    ? `${receipt.manifest.sagejsVersion} ` +
      `(${receipt.manifest.source.commit.slice(0, 12)})`
    : "unavailable";
  return [
    `Sage.js runtime ${runtime.package.version ?? "unknown"} ` +
      `(${runtime.checkout.commit?.slice(0, 12) ?? "no checkout commit"}` +
      `${runtime.checkout.dirty ? ", dirty" : ""})`,
    `Artifact: ${report.artifact.kind} for ${report.artifact.target}; ` +
      `validated build receipt=${buildIdentity}; final artifact identity is external`,
    `Host: ${runtime.host.platform}/${runtime.host.arch} ${runtime.host.libc}; ` +
      `Node ${runtime.host.node.version} ABI ${runtime.host.node.abi}`,
    `@native policy: mode=${report.nativePolicy.mode.requested}, ` +
      `cache=${report.nativePolicy.cacheDiscovery.effective}, ` +
      `addon=${report.nativePolicy.addonLoading.effective}, ` +
      `required=${report.nativePolicy.required.effective}, ` +
      `fallback=${report.nativePolicy.fallback.effective}`,
    `Native math profile: build-request=${report.nativeMathProfile.buildRequest.effective}, ` +
      `observed=${report.nativeMathProfile.observedBuild?.effective ?? "none"}, ` +
      `compatibility=${report.nativeMathProfile.compatibility}`,
    "Capability candidates (loadability and selection are not probed):",
    ...report.capabilities.map((capability) =>
      `  ${capability.id.padEnd(29)} ${capability.candidate.padEnd(11)} ` +
      `load=${capability.loadability} select=${capability.selection}`),
    "Caches:",
    ...report.caches.map((cache) =>
      `  ${cache.id.padEnd(29)} ${cache.presence}; ` +
      `${cache.inspection} ${cache.path}`),
  ].map(safeText).join("\n");
}

function safeText(value) {
  return String(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, (character) =>
    `\\u${character.codePointAt(0).toString(16).padStart(4, "0")}`);
}

function parseArguments(arguments_) {
  const options = { json: false, includePaths: false };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--paths") options.includePaths = true;
    else if (argument === "--root" && index + 1 < arguments_.length) {
      options.root = arguments_[++index];
    } else {
      throw new Error(
        "usage: release-capabilities.cjs [--json] [--paths] [--root PATH]",
      );
    }
  }
  return options;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const report = collectReleaseCapabilities(options);
  process.stdout.write(
    options.json
      ? `${JSON.stringify(report, null, 2)}\n`
      : `${formatReleaseCapabilities(report)}\n`,
  );
}

module.exports = {
  BUILD_MANIFEST_ASSET,
  BUILD_MANIFEST_SCHEMA,
  EMBEDDED_ASSET_SCHEMA,
  SCHEMA,
  collectReleaseCapabilities,
  formatReleaseCapabilities,
  nativeBinaryReceiptContract,
  parseArguments,
  stable,
  validatedMathProfile,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message || error}\n`);
    process.exitCode = 1;
  }
}

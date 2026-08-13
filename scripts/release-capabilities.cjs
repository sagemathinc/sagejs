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

const SCHEMA = "sagejs.release-capabilities-v2";
const BUILD_MANIFEST_SCHEMA = "sagejs.release-build-manifest-v1";
const BUILD_MANIFEST_ASSET = "release/build-manifest.json";
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

function hasDirectoryEntries(filename) {
  try {
    return statSync(filename).isDirectory() && readdirSync(filename).length !== 0;
  } catch {
    return false;
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

function validBuildManifest(value) {
  return value !== null &&
    typeof value === "object" &&
    value.schema === BUILD_MANIFEST_SCHEMA &&
    typeof value.version === "string" &&
    /^[0-9a-f]{40}$/.test(value.commit) &&
    value.target !== null &&
    typeof value.target === "object" &&
    typeof value.target.platform === "string" &&
    typeof value.target.arch === "string";
}

function artifactIdentity(options, embedded) {
  let source = null;
  let manifest = null;
  if (options.buildManifest !== undefined) {
    source = "explicit";
    manifest = options.buildManifest;
  } else if (embedded?.assets.has(BUILD_MANIFEST_ASSET)) {
    source = "embedded";
    manifest = parseJson(embedded.text(BUILD_MANIFEST_ASSET));
  }
  if (!validBuildManifest(manifest)) {
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
  return {
    autoload: {
      effective: modeValid && mode === "auto" && autoloadRequested === "0"
        ? "disabled"
        : "enabled",
      requested: autoloadRequested,
      scope: "@native cache discovery",
    },
    disable: {
      effective: modeValid && mode === "auto" && disableRequested,
      requested: disableRequested,
      scope: "@native addon loading in auto mode only; not generated FFI",
    },
    fallback: {
      effective: nativeRequired
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
      effective: nativeRequired,
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
  const embeddedFilesPresent = context.embedded !== null &&
    definition.seaAssets.every((asset) => context.embedded.assets.has(asset));
  const embeddedManifestAsset = definition.seaAssets.find((asset) =>
    asset.endsWith("_manifest.json"));
  const embeddedAddonAsset = `native/${definition.addon}`;
  const embeddedManifest = embeddedManifestAsset === undefined
    ? null
    : parseJson(context.embedded?.text(embeddedManifestAsset));
  const embeddedAddon = context.embedded?.bytes(embeddedAddonAsset) ?? null;
  const embeddedIntegrity = embeddedFilesPresent &&
    embeddedManifest?.schema === "sagejs.ffi/generated-host-adapter-v1" &&
    embeddedManifest.addon === definition.addon &&
    typeof embeddedManifest.addon_hash === "string" &&
    embeddedAddon !== null &&
    createHash("sha256").update(embeddedAddon).digest("hex") ===
      embeddedManifest.addon_hash;
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
  } else if (compiled) {
    candidate = "compiled";
    manifestIntegrity = "verified";
  } else {
    candidate = "unavailable";
    manifestIntegrity = embeddedFilesPresent
      ? "embedded-mismatch"
      : manifest !== null && !manifestCurrent
        ? "mismatch"
        : "not-installed";
  }
  return {
    candidate,
    fallbackCandidate: context.runtimeAvailable ? "available" : "unavailable",
    fallbackImplementation: definition.fallback,
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
  const records = index.logicalSources;
  if (records === null || typeof records !== "object") return false;
  const names = Object.keys(records).sort();
  if (expectedSources !== null &&
      JSON.stringify(names) !== JSON.stringify(expectedSources)) {
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

function inspectNativeKernels(context) {
  const expected = expectedProductionSources(context.root);
  let candidate = "unavailable";
  let integrity = "not-installed";
  if (context.embedded?.assets.has("native-kernels/index.json")) {
    const index = parseJson(context.embedded.text("native-kernels/index.json"));
    const complete = validateKernelIndex(
      index,
      (name) => context.embedded.assets.has(`native-kernels/${name}`),
      expected,
    );
    integrity = complete ? "complete" : "incomplete";
    candidate = complete ? "bundled" : "unavailable";
  } else {
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
    fallbackCandidate: context.runtimeAvailable ? "available" : "unavailable",
    fallbackImplementation: "the same typed Python source body",
    id: "typed-python-native-kernels",
    integrity,
    kind: "@native-production-cache",
    loadability: "not-probed",
    selection: "not-probed",
  };
}

function findInstalledMathProfile(root, platform, environment) {
  const defaultPrefix = platform === "win32"
    ? join(
        root,
        "packages",
        "flint",
        ".native",
        "vcpkg-installed",
        "x64-windows-static-md-release",
      )
    : join(root, "packages", "flint", ".native", "prefix");
  const prefix = resolve(environment.SAGEJS_FLINT_PREFIX || defaultPrefix);
  const stamp = readJson(join(prefix, ".sagejs-flint-dependencies.json"));
  const profile = stamp?.build?.mathBuildProfile ??
    stamp?.identity?.mathBuildProfile ?? null;
  return { prefix, profile };
}

function selectedMathProfile(platform, arch, environment) {
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
    selectionProbe: "not-run",
  };
}

function profileCompatibility(selected, installed) {
  if (installed === null) return "not-observed";
  if (!selected.requestValid) return "invalid-selection";
  if (installed.effectiveProfile === undefined) return "unknown";
  return installed.effectiveProfile === selected.effective
    ? "effective-profile-match"
    : "profile-mismatch";
}

function cacheRecord(id, filename, context) {
  return {
    id,
    path: displayedPath(filename, context),
    readiness: hasDirectoryEntries(filename) ? "warm" : "cold",
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
  const immutableIdentity = artifactIdentity(options, embedded);
  const runtimeCompiled = existsSync(join(root, "dist", "tools", "kernel.js")) &&
    existsSync(join(root, "dist", "compiler", "compiler.js"));
  const runtimeBundled = embedded !== null &&
    embedded.assets.has("compiler/compiler.js");
  const runtimeCandidate = runtimeBundled
    ? "bundled"
    : runtimeCompiled ? "compiled" : "unavailable";
  const runtimeAvailable = runtimeCandidate !== "unavailable";
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
  const selectedMath = selectedMathProfile(platform, arch, environment);
  // A SEA's nearby checkout is not part of its immutable identity. Observe an
  // installed dependency prefix only for non-SEA source/package execution.
  const installedMath = embedded === null
    ? findInstalledMathProfile(root, platform, environment)
    : { prefix: null, profile: null };
  const builtMath = immutableIdentity.availability === "available"
    ? immutableIdentity.manifest.nativeMathProfile ?? null
    : null;
  const observedMath = builtMath ?? installedMath.profile;
  const capabilityContext = {
    embedded,
    nativeKernelCache,
    platform,
    root,
    runtimeAvailable,
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
    artifactIdentity: immutableIdentity,
    caches: [
      cacheRecord("dynamic-code", dynamicCache, displayContext),
      cacheRecord("module", moduleCache, displayContext),
      cacheRecord("native-kernel", nativeKernelCache, displayContext),
      cacheRecord("shared-native-artifacts", sharedNativeCache, displayContext),
    ],
    capabilities,
    nativeMathProfile: {
      compatibility: profileCompatibility(selectedMath, observedMath),
      observedBuild: observedMath === null
        ? null
        : {
            effective: observedMath.effectiveProfile ??
              observedMath.effective ?? null,
            fingerprint: observedMath.fingerprint ?? null,
            requested: observedMath.requestedProfile ??
              observedMath.requested ?? null,
            source: builtMath !== null ? "build-manifest" : "installed-prefix",
          },
      installedPrefix: installedMath.prefix === null
        ? null
        : displayedPath(installedMath.prefix, displayContext),
      runtimeSelection: selectedMath,
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
  const artifactIdentity = report.artifactIdentity;
  const identity = artifactIdentity.availability === "available"
    ? `${artifactIdentity.manifest.version} ` +
      `(${artifactIdentity.manifest.commit.slice(0, 12)})`
    : "unavailable";
  return [
    `Sage.js runtime ${runtime.package.version ?? "unknown"} ` +
      `(${runtime.checkout.commit?.slice(0, 12) ?? "no checkout commit"}` +
      `${runtime.checkout.dirty ? ", dirty" : ""})`,
    `Artifact: ${report.artifact.kind} for ${report.artifact.target}; ` +
      `immutable identity=${identity}`,
    `Host: ${runtime.host.platform}/${runtime.host.arch} ${runtime.host.libc}; ` +
      `Node ${runtime.host.node.version} ABI ${runtime.host.node.abi}`,
    `@native policy: mode=${report.nativePolicy.mode.requested}, ` +
      `autoload=${report.nativePolicy.autoload.effective}, ` +
      `required=${report.nativePolicy.required.effective}, ` +
      `fallback=${report.nativePolicy.fallback.effective}`,
    `Native math profile: runtime=${report.nativeMathProfile.runtimeSelection.effective}, ` +
      `observed=${report.nativeMathProfile.observedBuild?.effective ?? "none"}, ` +
      `compatibility=${report.nativeMathProfile.compatibility}`,
    "Capability candidates (loadability and selection are not probed):",
    ...report.capabilities.map((capability) =>
      `  ${capability.id.padEnd(29)} ${capability.candidate.padEnd(11)} ` +
      `load=${capability.loadability} select=${capability.selection}`),
    "Caches:",
    ...report.caches.map((cache) =>
      `  ${cache.id.padEnd(29)} ${cache.readiness} ${cache.path}`),
  ].join("\n");
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
  SCHEMA,
  collectReleaseCapabilities,
  formatReleaseCapabilities,
  parseArguments,
  stable,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message || error}\n`);
    process.exitCode = 1;
  }
}

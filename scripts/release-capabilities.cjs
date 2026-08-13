#!/usr/bin/env node

"use strict";

// This reporter is deliberately observational.  In particular, do not import
// build scripts or require native addons here: several of those paths probe a
// compiler, reconcile generated output, or load a binary as a side effect.

const {
  createHash,
} = require("node:crypto");
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

const SCHEMA = "sagejs.release-capabilities-v1";
const NATIVE_DISABLED_VARIABLE = "SAGEJS_NATIVE_DISABLE";
const MATH_PROFILE_VARIABLE = "SAGEJS_NATIVE_MATH_PROFILE";

const ADAPTERS = Object.freeze([
  {
    id: "flint",
    addon: "sagejs_flint_ffi.node",
    package: "flint",
    requiredFiles: ["build/Release/sagejs_flint.node"],
    seaAssets: [
      "native/sagejs_flint.node",
      "native/sagejs_flint_ffi.node",
      "native/sagejs_flint_ffi_manifest.json",
    ],
    fallback: "typed-python exact arithmetic",
  },
  {
    id: "fflas-ffpack",
    addon: "sagejs_fflas_ffi.node",
    package: "fflas",
    requiredFiles: [],
    seaAssets: [
      "native/sagejs_fflas_ffi.node",
      "native/sagejs_fflas_ffi_manifest.json",
    ],
    fallback: "FLINT or typed-python dense prime arithmetic",
  },
  {
    id: "igraph",
    addon: "sagejs_igraph_ffi.node",
    package: "graph",
    requiredFiles: ["build/Release/sagejs_graph.node"],
    seaAssets: [
      "native/sagejs_graph.node",
      "native/sagejs_igraph_ffi.node",
      "native/sagejs_igraph_ffi_manifest.json",
    ],
    fallback: "ordinary Python graph algorithms",
  },
  {
    id: "m4ri",
    addon: "sagejs_m4ri_ffi.node",
    package: "m4ri",
    requiredFiles: [],
    seaAssets: [
      "native/sagejs_m4ri_ffi.node",
      "native/sagejs_m4ri_ffi_manifest.json",
    ],
    fallback: "compiler-owned packed GF(2) arithmetic",
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
  // Do not disclose workspace names, account names, mounted-volume layouts,
  // or arbitrary paths supplied in environment variables by default.
  return `<external>/${basename(absolute)}`;
}

function readJson(filename) {
  try {
    return JSON.parse(readFileSync(filename, "utf8"));
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

function gitProvenance(root, runGit = safeGit) {
  if (!existsSync(join(root, ".git"))) {
    return { commit: null, dirty: null, present: false };
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
    dirty: changes === null ? null : changes !== "",
    present: true,
    commonDirectory: commonDirectory || null,
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

function artifactContext(root, options, seaAssets) {
  const kind = options.artifactKind ||
    (seaAssets !== null ? "single-executable" :
      existsSync(join(root, ".git")) ? "source-checkout" : "npm-package");
  return {
    kind,
    nativeAssetsEmbedded: seaAssets === null
      ? null
      : [...seaAssets].some((name) => name.startsWith("native/")),
    target: `${options.platform}-${options.arch}`,
  };
}

function currentSeaAssets() {
  try {
    const sea = require("node:sea");
    return sea.isSea() ? new Set(sea.getAssetKeys()) : null;
  } catch {
    return null;
  }
}

function nativeSelection(installed, fallbackAvailable, nativeDisabled) {
  if (!nativeDisabled && installed !== "unavailable") return "native";
  if (fallbackAvailable) return "fallback";
  return "unavailable";
}

function selectedState(installed, selected) {
  if (selected === "native") return installed;
  return selected;
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
  const manifestCurrent =
    (typeof manifest?.addon_hash !== "string" ||
      sha256(addonPath) === manifest.addon_hash) &&
    (typeof manifest?.source_hash !== "string" ||
      sha256(sourcePath) === manifest.source_hash);
  const compiled =
    manifest?.schema === "sagejs.ffi/generated-host-adapter-v1" &&
    existsSync(addonPath) &&
    manifestCurrent &&
    definition.requiredFiles.every((filename) =>
      existsSync(
        join(context.root, "packages", definition.package, filename),
      ));
  const bundled = context.seaAssets !== null &&
    definition.seaAssets.every((asset) => context.seaAssets.has(asset));
  const platformUnavailable =
    definition.id === "m4ri" && context.platform === "win32";
  const installed = platformUnavailable
    ? "unavailable"
    : bundled ? "bundled" : compiled ? "compiled" : "unavailable";
  const fallbackAvailable = context.runtimeAvailable;
  const selected = nativeSelection(
    installed,
    fallbackAvailable,
    context.nativeDisabled || platformUnavailable,
  );
  return {
    fallback: fallbackAvailable ? "available" : "unavailable",
    fallbackImplementation: definition.fallback,
    id: definition.id,
    installed,
    integrity: bundled
      ? "embedded"
      : compiled
        ? typeof manifest.addon_hash === "string" &&
            typeof manifest.source_hash === "string"
          ? "verified"
          : "unverified"
        : manifest !== null && !manifestCurrent
          ? "mismatch"
          : "not-installed",
    readiness: selected === "unavailable" ? "cold" : "warm",
    selected,
    state: selectedState(installed, selected),
  };
}

function inspectNativeKernels(context) {
  const directory = context.nativeKernelCache;
  const index = readJson(join(directory, "index.json"));
  const diskModules = index?.schema === "sagejs.native-cache/v3" &&
    Object.keys(index.logicalSources ?? {}).length !== 0;
  const bundled = context.seaAssets !== null &&
    context.seaAssets.has("native-kernels/index.json") &&
    [...context.seaAssets].some((name) =>
      /^native-kernels\/[0-9a-f]{64}\/index\.cjs$/.test(name));
  const installed = bundled
    ? "bundled"
    : diskModules ? "compiled" : "unavailable";
  const fallbackAvailable = context.runtimeAvailable;
  let selected;
  if (context.nativeDisabled) {
    selected = fallbackAvailable ? "fallback" : "unavailable";
  }
  else if (installed !== "unavailable") selected = "native";
  else if (context.artifact.kind === "source-checkout" && fallbackAvailable) {
    selected = "compile-on-first-use";
  } else selected = fallbackAvailable ? "fallback" : "unavailable";
  return {
    fallback: fallbackAvailable ? "available" : "unavailable",
    fallbackImplementation: "the same typed Python source body",
    id: "typed-python-native-kernels",
    installed,
    readiness: selected === "compile-on-first-use" ? "cold" :
      selected === "unavailable" ? "cold" : "warm",
    selected,
    state: selected === "compile-on-first-use"
      ? "cold"
      : selectedState(installed, selected),
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
  return { prefix, profile, stampPresent: stamp !== null };
}

function selectedMathProfile(platform, arch, environment) {
  const requested = environment[MATH_PROFILE_VARIABLE] || "portable";
  const requestValid = ["portable", "cpu-native"].includes(requested);
  const cpuNativeSupported = ["linux", "darwin"].includes(platform) &&
    ["x64", "arm64"].includes(arch);
  const effective = requestValid &&
    requested === "cpu-native" &&
    cpuNativeSupported
    ? "cpu-native"
    : "portable";
  return {
    effective,
    requestValid,
    requested,
    selectionProbe: "not-run",
  };
}

function profileCompatibility(selected, installed) {
  if (installed === null) return "not-installed";
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
  const seaAssets = options.seaAssets === undefined
    ? currentSeaAssets()
    : new Set(options.seaAssets);
  const packageManifest = readJson(join(root, "package.json")) || {};
  const git = options.git || gitProvenance(root, options.runGit);
  const artifact = artifactContext(
    root,
    { ...options, platform, arch },
    seaAssets,
  );
  const runtimeCompiled = existsSync(join(root, "dist", "tools", "kernel.js")) &&
    existsSync(join(root, "dist", "compiler", "compiler.js"));
  const runtimeBundled = seaAssets !== null && seaAssets.has("compiler/compiler.js");
  const runtimeInstalled = runtimeBundled
    ? "bundled"
    : runtimeCompiled ? "compiled" : "unavailable";
  const runtimeAvailable = runtimeInstalled !== "unavailable";
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
  const installedMath = findInstalledMathProfile(root, platform, environment);
  const selectedMath = selectedMathProfile(platform, arch, environment);
  const nativeDisabled = environment[NATIVE_DISABLED_VARIABLE] === "1";
  const capabilityContext = {
    artifact,
    nativeDisabled,
    nativeKernelCache,
    platform,
    root,
    runtimeAvailable,
    seaAssets,
  };
  const capabilities = [
    {
      fallback: "unavailable",
      id: "python-sage-compiler",
      installed: runtimeInstalled,
      readiness: runtimeAvailable ? "warm" : "cold",
      selected: runtimeAvailable ? "runtime" : "unavailable",
      state: runtimeInstalled,
    },
    inspectNativeKernels(capabilityContext),
    ...ADAPTERS.map((definition) => inspectAdapter(definition, capabilityContext)),
  ].sort((left, right) => left.id.localeCompare(right.id));
  return stable({
    artifact,
    caches: [
      cacheRecord("dynamic-code", dynamicCache, displayContext),
      cacheRecord("module", moduleCache, displayContext),
      cacheRecord("native-kernel", nativeKernelCache, displayContext),
      cacheRecord("shared-native-artifacts", sharedNativeCache, displayContext),
    ],
    capabilities,
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
    identity: {
      commit: git.commit ?? null,
      dirty: git.dirty ?? null,
      name: packageManifest.name || null,
      version: packageManifest.version || null,
    },
    nativeMathProfile: {
      compatibility: profileCompatibility(selectedMath, installedMath.profile),
      installed: installedMath.profile === null
        ? null
        : {
            effective: installedMath.profile.effectiveProfile ?? null,
            fingerprint: installedMath.profile.fingerprint ?? null,
            requested: installedMath.profile.requestedProfile ?? null,
          },
      installedPrefix: displayedPath(installedMath.prefix, displayContext),
      selected: selectedMath,
    },
    nativeSelectionDisabled: nativeDisabled,
    observational: true,
    schema: SCHEMA,
  });
}

function formatReleaseCapabilities(report) {
  const rows = report.capabilities.map((capability) =>
    `  ${capability.id.padEnd(29)} ${capability.state.padEnd(11)} ` +
      `${capability.readiness} (selected: ${capability.selected})`);
  const profile = report.nativeMathProfile;
  return [
    `Sage.js ${report.identity.version ?? "unknown"} ` +
      `(${report.identity.commit?.slice(0, 12) ?? "no commit"}` +
      `${report.identity.dirty ? ", dirty" : ""})`,
    `Artifact: ${report.artifact.kind} for ${report.artifact.target}`,
    `Host: ${report.host.platform}/${report.host.arch} ${report.host.libc}; ` +
      `Node ${report.host.node.version} ABI ${report.host.node.abi}`,
    `Native math profile: selected=${profile.selected.effective}, ` +
      `installed=${profile.installed?.effective ?? "none"}, ` +
      `compatibility=${profile.compatibility}`,
    "Capabilities:",
    ...rows,
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

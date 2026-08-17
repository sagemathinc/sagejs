"use strict";

// Source builds default to a relocatable, CPU-portable mathematics stack.
// Controlled benchmarks and local installations may instead select the
// fingerprinted cpu-native profile with SAGEJS_NATIVE_MATH_PROFILE=cpu-native.
// Keep all policy and identity construction here so dependency builders and
// the shared worktree cache cannot disagree about what they are building.

const { createHash } = require("node:crypto");
const {
  existsSync,
  readFileSync,
} = require("node:fs");
const {
  arch: hostArch,
  cpus,
  endianness,
  platform: hostPlatform,
} = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const PROFILE_ENVIRONMENT_VARIABLE = "SAGEJS_NATIVE_MATH_PROFILE";
const PORTABLE_PROFILE = "portable";
const CPU_NATIVE_PROFILE = "cpu-native";
const PROFILE_SCHEMA = "sagejs.native-math-profile-v1";

const NATIVE_MATH_DEPENDENCY_VERSIONS = Object.freeze({
  ffpoly: "1.2.7",
  fflasFfpack: "2.5.0",
  flint: "3.6.0",
  givaro: "4.2.2",
  gmp: "6.3.0",
  mpc: "1.4.1",
  mpfr: "4.2.2",
  openblas: "0.3.33",
  smalljac: "4.1.3",
});

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableJson(value[key])]),
    );
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function commandOutput(command, arguments_, environment) {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    return `unavailable:${result.error.code || result.error.message}`;
  }
  const output = [result.stdout, result.stderr]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join("|");
  return result.status === 0 ? output : `${result.status}|${output}`;
}

const compilerFlagSupport = new Map();

function compilerAcceptsFlag(command, flag, language, environment) {
  const key = `${command}\0${flag}\0${language}\0${environment.PATH || ""}`;
  if (compilerFlagSupport.has(key)) return compilerFlagSupport.get(key);
  const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";
  const result = spawnSync(
    command,
    [flag, "-x", language, "-c", "-o", nullDevice, "-"],
    {
      encoding: "utf8",
      env: environment,
      input: "int main(void) { return 0; }\n",
      stdio: ["pipe", "ignore", "ignore"],
    },
  );
  const supported = !result.error && result.status === 0;
  compilerFlagSupport.set(key, supported);
  return supported;
}

function readLinuxCpuFeatures() {
  try {
    const contents = readFileSync("/proc/cpuinfo", "utf8");
    const match = contents.match(/^(?:flags|Features)\s*:\s*(.*)$/m);
    return match ? match[1].trim().split(/\s+/) : [];
  } catch {
    return [];
  }
}

function readDarwinCpuFeatures(environment) {
  const names = [
    "machdep.cpu.features",
    "machdep.cpu.leaf7_features",
    "hw.optional.arm.FEAT_AES",
    "hw.optional.arm.FEAT_SHA256",
    "hw.optional.arm.FEAT_DotProd",
  ];
  const result = spawnSync("sysctl", ["-n", ...names], {
    encoding: "utf8",
    env: environment,
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.error || result.status !== 0) return [];
  return result.stdout.trim().split(/\s+/).filter(Boolean);
}

function cpuIdentity(options) {
  if (options.cpu !== undefined) return stableJson(options.cpu);
  const platform = options.platform;
  const environment = options.environment;
  const processors = cpus();
  const features = platform === "linux"
    ? readLinuxCpuFeatures()
    : platform === "darwin"
      ? readDarwinCpuFeatures(environment)
      : [];
  return stableJson({
    features: [...new Set(features)].sort(),
    model: processors[0]?.model?.trim() || "unknown",
  });
}

function compilerIdentity(options, nativeFlag, language) {
  const override = language === "c++"
    ? options.cxxCompiler ?? options.compiler
    : options.compiler;
  if (override !== undefined) return stableJson(override);
  const command = language === "c++"
    ? options.environment.CXX || (options.platform === "win32" ? "clang-cl" : "c++")
    : options.environment.CC || (options.platform === "win32" ? "clang-cl" : "cc");
  return stableJson({
    command,
    nativeFlag,
    nativeFlagSupported: nativeFlag === null
      ? false
      : compilerAcceptsFlag(command, nativeFlag, language, options.environment),
    target: commandOutput(command, ["-dumpmachine"], options.environment),
    version: commandOutput(command, ["--version"], options.environment),
  });
}

function requestedProfile(environment) {
  const requested = environment[PROFILE_ENVIRONMENT_VARIABLE] || PORTABLE_PROFILE;
  if (![PORTABLE_PROFILE, CPU_NATIVE_PROFILE].includes(requested)) {
    throw new Error(
      `${PROFILE_ENVIRONMENT_VARIABLE} must be ${PORTABLE_PROFILE} or ` +
      `${CPU_NATIVE_PROFILE}, got ${JSON.stringify(requested)}`,
    );
  }
  return requested;
}

function nativeTuningFlag(platform, arch) {
  if (!['linux', 'darwin'].includes(platform)) return null;
  if (arch === "x64") return "-march=native";
  if (arch === "arm64") return "-mcpu=native";
  return null;
}

function nativeMathBuildProfile(options = {}) {
  const environment = options.environment || process.env;
  const platform = options.platform || hostPlatform();
  const arch = options.arch || hostArch();
  const requested = options.requestedProfile || requestedProfile(environment);
  const cpuNativeSupported =
    platform !== "win32" &&
    ["linux", "darwin"].includes(platform) &&
    ["x64", "arm64"].includes(arch);
  const effective = requested === CPU_NATIVE_PROFILE && cpuNativeSupported
    ? CPU_NATIVE_PROFILE
    : PORTABLE_PROFILE;
  const proposedNativeFlag = effective === CPU_NATIVE_PROFILE
    ? nativeTuningFlag(platform, arch)
    : null;
  const compiler = compilerIdentity(
    { ...options, arch, environment, platform },
    proposedNativeFlag,
    "c",
  );
  const cxxCompiler = compilerIdentity(
    { ...options, arch, environment, platform },
    proposedNativeFlag,
    "c++",
  );
  const nativeFlag = compiler.nativeFlagSupported ? proposedNativeFlag : null;
  const cxxNativeFlag = cxxCompiler.nativeFlagSupported
    ? proposedNativeFlag
    : null;
  const commonCFlags = ["-O3", "-fPIC"];
  const tunedCFlags = nativeFlag === null
    ? commonCFlags
    : [...commonCFlags, nativeFlag];
  const tunedCxxFlags = cxxNativeFlag === null
    ? commonCFlags
    : [...commonCFlags, cxxNativeFlag];
  const gmpConfigure = ["--disable-shared", "--enable-static", "--with-pic"];
  if (effective === PORTABLE_PROFILE && arch === "x64") {
    gmpConfigure.push("--enable-fat");
  }
  const openBlasTarget = effective === PORTABLE_PROFILE
    ? arch === "x64"
      ? "PRESCOTT"
      : arch === "arm64"
        ? "ARMV8"
        : null
    : null;
  const identity = stableJson({
    abi: {
      arch,
      endianness: options.endianness || endianness(),
      platform,
      wordBits: ["x64", "arm64"].includes(arch) ? 64 : null,
    },
    buildOptions: {
      fflas: {
        cxxflags: tunedCxxFlags,
        gmpConfigure: [...gmpConfigure, "--enable-cxx"],
      },
      flint: {
        cflags: tunedCFlags,
        configure: [
          "--enable-static",
          "--disable-shared",
          "--with-pic",
          "--with-gmp=<prefix>",
          "--with-mpfr=<prefix>",
          "--with-blas=<prefix>",
        ],
        fftSmall: nativeFlag === null ? "compiler-default" : "auto-detect",
      },
      gmp: {
        cflags: [...tunedCFlags, "-std=gnu17"],
        configure: gmpConfigure,
      },
      mpc: { cflags: tunedCFlags },
      mpfr: { cflags: tunedCFlags },
      openblas: {
        build: "threaded-cblas-dynamic-v1",
        cflags: commonCFlags,
        dynamicArch: true,
        target: openBlasTarget,
      },
    },
    compilers: { c: compiler, cxx: cxxCompiler },
    cpu: effective === CPU_NATIVE_PROFILE
      ? cpuIdentity({ ...options, environment, platform })
      : null,
    dependencies: {
      ...NATIVE_MATH_DEPENDENCY_VERSIONS,
    },
    effectiveProfile: effective,
    fallbackReason: requested !== effective
      ? `${platform}/${arch} uses the portable mathematics profile`
      : null,
    requestedProfile: requested,
    schema: PROFILE_SCHEMA,
  });
  return {
    ...identity,
    fingerprint: sha256(JSON.stringify(identity)),
  };
}

function flintObservedCapabilities(prefix) {
  const header = join(prefix, "include", "flint", "flint-config.h");
  if (!existsSync(header)) return { flintFftSmall: null };
  const contents = readFileSync(header, "utf8");
  return {
    flintFftSmall: /^#define FLINT_HAVE_FFT_SMALL 1$/m.test(contents),
  };
}

function nativeMathBuildProvenance(repositoryRoot, options = {}) {
  const selected = nativeMathBuildProfile(options);
  const defaultPrefix = process.platform === "win32"
    ? join(
        repositoryRoot,
        "packages",
        "flint",
        ".native",
        "vcpkg-installed",
        "x64-windows-static-md-release",
      )
    : join(repositoryRoot, "packages", "flint", ".native", "prefix");
  const prefix = resolve(
    options.prefix || process.env.SAGEJS_FLINT_PREFIX || defaultPrefix,
  );
  const stampPath = join(prefix, ".sagejs-flint-dependencies.json");
  let installed = null;
  if (existsSync(stampPath)) {
    try {
      installed = JSON.parse(readFileSync(stampPath, "utf8"));
    } catch (error) {
      installed = { error: `invalid build stamp: ${error.message || error}` };
    }
  }
  const installedFingerprint =
    installed?.build?.mathBuildProfile?.fingerprint ??
    installed?.identity?.mathBuildProfile?.fingerprint ??
    installed?.identity?.fingerprint ??
    null;
  return stableJson({
    installed,
    installedMatchesSelected: installedFingerprint === selected.fingerprint,
    prefix,
    selected,
    stampPath,
  });
}

module.exports = {
  CPU_NATIVE_PROFILE,
  NATIVE_MATH_DEPENDENCY_VERSIONS,
  PORTABLE_PROFILE,
  PROFILE_ENVIRONMENT_VARIABLE,
  flintObservedCapabilities,
  nativeMathBuildProfile,
  nativeMathBuildProvenance,
  stableJson,
};

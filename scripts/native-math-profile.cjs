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
const PORTABLE_CPU_POLICY_SCHEMA = "sagejs.portable-cpu-policy-v1";

// These spellings cover the compiler switches accepted by Sage.js builders.
// The release contract rejects every host-selected variant instead of trying
// to infer whether a particular build machine happened to make it harmless.
const HOST_NATIVE_FLAG_PATTERNS = Object.freeze([
  /(?:^|[=,])native(?:$|[,])/,
  /^-m(?:arch|cpu|tune)=native$/,
  /^\/arch:(?:AVX|AVX2|AVX512)$/i,
]);

function portableTargetPolicy(platform, arch) {
  if ((platform === "linux" || platform === "darwin") && arch === "x64") {
    return Object.freeze({
      baseline: "x86-64-v1",
      compilerFlags: ["-march=x86-64", "-mtune=generic"],
      deployment: platform === "darwin" ? "macos-deployment-target" : "elf-abi",
      releaseSupported: true,
    });
  }
  if (platform === "linux" && arch === "arm64") {
    return Object.freeze({
      baseline: "armv8-a",
      compilerFlags: ["-march=armv8-a"],
      deployment: "elf-abi",
      releaseSupported: true,
    });
  }
  if (platform === "darwin" && arch === "arm64") {
    return Object.freeze({
      // Apple Silicon starts with the M1 generation. The deployment target
      // selects the compatible compiler target; adding -mcpu here would turn
      // the build host into an accidental minimum requirement.
      baseline: "apple-silicon-m1",
      compilerFlags: [],
      deployment: "macos-deployment-target",
      releaseSupported: true,
    });
  }
  if (platform === "win32" && arch === "x64") {
    return Object.freeze({
      baseline: "windows-x64",
      compilerFlags: [],
      deployment: "windows-sdk",
      releaseSupported: true,
    });
  }
  return Object.freeze({
    baseline: "unsupported",
    compilerFlags: [],
    deployment: "unsupported",
    releaseSupported: false,
  });
}

function openBlasDynamicTargets(platform, arch) {
  if (arch === "x64") return ["NEHALEM", "SANDYBRIDGE", "HASWELL", "ZEN"];
  if (arch === "arm64") {
    return platform === "darwin"
      ? ["CORTEXA53", "NEOVERSEN1", "VORTEXM4"]
      : ["CORTEXA53", "NEOVERSEN1", "NEOVERSEV1", "NEOVERSEN2"];
  }
  return [];
}

function hasHostNativeFlag(flags) {
  return flags.some((flag) => HOST_NATIVE_FLAG_PATTERNS.some(
    (pattern) => pattern.test(String(flag)),
  ));
}

function fingerprintedProfile(identity) {
  const canonical = stableJson(identity);
  return {
    ...canonical,
    fingerprint: sha256(JSON.stringify(canonical)),
  };
}

function deriveNativeMathBuildProfile(profile, transform) {
  validateNativeMathBuildProfile(profile);
  const identity = structuredClone(profile);
  delete identity.fingerprint;
  transform(identity);
  return fingerprintedProfile(identity);
}

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
  const cpuNativeTargetSupported =
    platform !== "win32" &&
    ["linux", "darwin"].includes(platform) &&
    ["x64", "arm64"].includes(arch);
  const proposedNativeFlag =
    requested === CPU_NATIVE_PROFILE && cpuNativeTargetSupported
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
  const cpuNativeCompilerSupported = proposedNativeFlag !== null &&
    compiler.nativeFlagSupported && cxxCompiler.nativeFlagSupported;
  const effective = requested === CPU_NATIVE_PROFILE && cpuNativeCompilerSupported
    ? CPU_NATIVE_PROFILE
    : PORTABLE_PROFILE;
  const targetPolicy = portableTargetPolicy(platform, arch);
  const nativeFlag = effective === CPU_NATIVE_PROFILE ? proposedNativeFlag : null;
  const cxxNativeFlag = nativeFlag;
  const commonCFlags = ["-O3", "-fPIC"];
  const portableCFlags = [...commonCFlags, ...targetPolicy.compilerFlags];
  const tunedCFlags = nativeFlag === null
    ? portableCFlags
    : [...commonCFlags, nativeFlag];
  const tunedCxxFlags = cxxNativeFlag === null
    ? portableCFlags
    : [...commonCFlags, cxxNativeFlag];
  const gmpConfigure = ["--disable-shared", "--enable-static", "--with-pic"];
  if (
    effective === PORTABLE_PROFILE &&
    arch === "x64" &&
    platform !== "win32"
  ) {
    gmpConfigure.push("--enable-fat");
  }
  const openblasTargets = platform === "win32"
    ? []
    : openBlasDynamicTargets(platform, arch);
  const windowsTarget = platform === "win32";
  const cpuPolicy = {
    baseline: effective === PORTABLE_PROFILE ? targetPolicy.baseline : "build-host",
    dependencyDispatch: {
      fflasFfpack: windowsTarget ? "unavailable" : "archnative-disabled",
      flint: "compiler-baseline-plus-runtime-dispatched-dependencies",
      gmp: effective === PORTABLE_PROFILE && arch === "x64" && !windowsTarget
        ? "runtime-fat"
        : windowsTarget
          ? "vcpkg-generic-x64"
          : "compiler-baseline",
      igraph: "compiler-baseline",
      m4ri: windowsTarget ? "unavailable" : "compiler-baseline-fixed-cache-model",
      openblas: windowsTarget
        ? "vcpkg-generic-x64"
        : openblasTargets.length > 0
        ? "runtime-dynamic"
        : "unavailable",
    },
    forbiddenHostNativeFlags: [
      "-march=native",
      "-mcpu=native",
      "-mtune=native",
      "/arch:AVX*",
    ],
    releaseEligible: requested === PORTABLE_PROFILE &&
      effective === PORTABLE_PROFILE &&
      targetPolicy.releaseSupported,
    schema: PORTABLE_CPU_POLICY_SCHEMA,
    targetSelection: targetPolicy.deployment,
  };
  const identity = {
    abi: {
      arch,
      endianness: options.endianness || endianness(),
      platform,
      wordBits: ["x64", "arm64"].includes(arch) ? 64 : null,
    },
    buildOptions: {
      fflas: {
        archnative: false,
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
        cflags: portableCFlags,
        dynamicArch: !windowsTarget,
        dynamicList: openblasTargets,
        // OpenBLAS prepends PRESCOTT on x64 and ARMV8 on arm64 whenever a
        // DYNAMIC_LIST is supplied; record that implicit compatible fallback.
        fallbackTarget: windowsTarget
          ? "GENERIC"
          : arch === "x64"
          ? "PRESCOTT"
          : arch === "arm64"
            ? "ARMV8"
            : null,
      },
      optionalX64Accelerators: platform === "linux" && arch === "x64"
        ? {
            cflags: [
              ...tunedCFlags,
              "-fomit-frame-pointer",
              "-funroll-loops",
              "-m64",
              "-std=gnu99",
            ],
            instructionPolicy: effective === CPU_NATIVE_PROFILE
              ? "compiler-native"
              : "x86-64-v1-inline-assembly",
          }
        : { cflags: [], instructionPolicy: "unavailable" },
    },
    compilers: { c: compiler, cxx: cxxCompiler },
    cpu: effective === CPU_NATIVE_PROFILE
      ? cpuIdentity({ ...options, environment, platform })
      : null,
    cpuPolicy,
    dependencies: {
      ...NATIVE_MATH_DEPENDENCY_VERSIONS,
    },
    effectiveProfile: effective,
    fallbackReason: requested !== effective
      ? !cpuNativeTargetSupported
        ? `${platform}/${arch} uses the portable mathematics profile`
        : `the selected C and C++ compilers do not both support ${proposedNativeFlag}`
      : null,
    requestedProfile: requested,
    schema: PROFILE_SCHEMA,
  };
  return fingerprintedProfile(identity);
}

function validateNativeMathBuildProfile(profile, target = undefined) {
  if (
    profile === null ||
    typeof profile !== "object" ||
    Array.isArray(profile) ||
    profile.schema !== PROFILE_SCHEMA ||
    ![PORTABLE_PROFILE, CPU_NATIVE_PROFILE].includes(profile.requestedProfile) ||
    ![PORTABLE_PROFILE, CPU_NATIVE_PROFILE].includes(profile.effectiveProfile) ||
    !/^[0-9a-f]{64}$/.test(profile.fingerprint ?? "")
  ) {
    throw new Error("native mathematics profile is invalid");
  }
  const identity = { ...profile };
  delete identity.fingerprint;
  if (sha256(JSON.stringify(stableJson(identity))) !== profile.fingerprint) {
    throw new Error("native mathematics profile fingerprint is invalid");
  }
  if (
    target !== undefined &&
    (profile.abi?.platform !== target.platform ||
      profile.abi?.arch !== target.arch ||
      profile.abi?.endianness !== target.endianness ||
      profile.abi?.wordBits !== target.wordBits)
  ) {
    throw new Error("native mathematics profile does not match its target");
  }
  return profile;
}

function nestedStrings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(nestedStrings);
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(nestedStrings);
  }
  return [];
}

function validatePortableReleaseCpuProfile(profile) {
  validateNativeMathBuildProfile(profile);
  const policy = portableTargetPolicy(profile.abi.platform, profile.abi.arch);
  if (
    profile.requestedProfile !== PORTABLE_PROFILE ||
    profile.effectiveProfile !== PORTABLE_PROFILE ||
    profile.cpu !== null ||
    !policy.releaseSupported ||
    profile.cpuPolicy?.schema !== PORTABLE_CPU_POLICY_SCHEMA ||
    profile.cpuPolicy?.releaseEligible !== true ||
    profile.cpuPolicy?.baseline !== policy.baseline ||
    profile.cpuPolicy?.targetSelection !== policy.deployment
  ) {
    throw new Error("native mathematics profile is not release CPU-portable");
  }
  const expectedFlags = ["-O3", "-fPIC", ...policy.compilerFlags];
  for (const flags of [
    profile.buildOptions?.flint?.cflags,
    profile.buildOptions?.mpfr?.cflags,
    profile.buildOptions?.mpc?.cflags,
    profile.buildOptions?.fflas?.cxxflags,
  ]) {
    if (JSON.stringify(flags) !== JSON.stringify(expectedFlags)) {
      throw new Error("portable compiler baseline flags do not match the target policy");
    }
  }
  const windowsTarget = profile.abi.platform === "win32";
  const accelerate = profile.cpuPolicy?.dependencyDispatch?.openblas ===
    "apple-accelerate";
  const expectedOpenBlasTargets = windowsTarget
    ? []
    : openBlasDynamicTargets(profile.abi.platform, profile.abi.arch);
  if (
    profile.buildOptions?.fflas?.archnative !== false ||
    (
      !windowsTarget &&
      profile.abi.arch === "x64" &&
      !profile.buildOptions?.gmp?.configure?.includes("--enable-fat")
    ) ||
    (accelerate
      ? profile.buildOptions?.openblas !== undefined
      : profile.buildOptions?.openblas?.dynamicArch !== !windowsTarget ||
        profile.buildOptions?.openblas?.fallbackTarget !==
          (windowsTarget
            ? "GENERIC"
            : profile.abi.arch === "x64"
              ? "PRESCOTT"
              : "ARMV8") ||
        JSON.stringify(profile.buildOptions?.openblas?.dynamicList) !==
          JSON.stringify(expectedOpenBlasTargets))
  ) {
    throw new Error("portable dependency dispatch policy is incomplete");
  }
  if (hasHostNativeFlag(nestedStrings(profile.buildOptions))) {
    throw new Error("portable profile contains a build-host CPU tuning flag");
  }
  return profile;
}

function flintObservedCapabilities(prefix) {
  const header = join(prefix, "include", "flint", "flint-config.h");
  if (!existsSync(header)) return { flintFftSmall: null };
  const contents = readFileSync(header, "utf8");
  return {
    flintFftSmall: /^#define FLINT_HAVE_FFT_SMALL 1$/m.test(contents),
  };
}

function parseGmpConfigureObservation(contents) {
  const pathMatch = contents.match(/^path=\s*(.*?)\s*$/m);
  const hostMatch = contents.match(/^host_cpu='([^']*)'$/m);
  const cflagsMatch = contents.match(/^CFLAGS='([^']*)'$/m);
  if (!pathMatch || !hostMatch || !cflagsMatch) {
    throw new Error("GMP configure log is missing CPU selection evidence");
  }
  return stableJson({
    cflags: cflagsMatch[1].trim().split(/\s+/).filter(Boolean),
    hostCpu: hostMatch[1],
    mpnPath: pathMatch[1].trim().split(/\s+/).filter(Boolean),
  });
}

function validateGmpConfigureObservation(profile, observation) {
  validateNativeMathBuildProfile(profile);
  if (profile.effectiveProfile !== PORTABLE_PROFILE) return observation;
  const expectedFlags = profile.buildOptions.gmp.cflags;
  if (JSON.stringify(observation?.cflags) !== JSON.stringify(expectedFlags)) {
    throw new Error("GMP configure CFLAGS do not match the portable profile");
  }
  if (profile.abi.platform === "darwin" && profile.abi.arch === "arm64") {
    if (
      observation.hostCpu !== "aarch64" ||
      JSON.stringify(observation.mpnPath) !== JSON.stringify(["arm64", "generic"])
    ) {
      throw new Error("portable Apple Silicon GMP selected a host-specific MPN path");
    }
  }
  return observation;
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
  PORTABLE_CPU_POLICY_SCHEMA,
  PROFILE_ENVIRONMENT_VARIABLE,
  deriveNativeMathBuildProfile,
  flintObservedCapabilities,
  nativeMathBuildProfile,
  nativeMathBuildProvenance,
  openBlasDynamicTargets,
  parseGmpConfigureObservation,
  portableTargetPolicy,
  stableJson,
  validateNativeMathBuildProfile,
  validateGmpConfigureObservation,
  validatePortableReleaseCpuProfile,
};

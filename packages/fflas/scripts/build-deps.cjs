"use strict";

const { availableParallelism, cpus } = require("node:os");
const { createHash } = require("node:crypto");
const {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { basename, dirname, join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const packageRoot = resolve(__dirname, "..");
const repositoryRoot = resolve(packageRoot, "..", "..");
const buildRoot = join(packageRoot, ".native");
const prefix = resolve(
  process.env.SAGEJS_FFLAS_PREFIX || join(buildRoot, "prefix"),
);
const flintPrefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(repositoryRoot, "packages", "flint", ".native", "prefix"),
);
const downloads = join(buildRoot, "downloads");
const sources = join(buildRoot, "sources");
const configuredJobs = process.env.SAGEJS_BUILD_JOBS;
if (configuredJobs !== undefined && !/^[1-9][0-9]*$/.test(configuredJobs)) {
  throw new Error(
    `SAGEJS_BUILD_JOBS must be a positive integer, got ${JSON.stringify(configuredJobs)}`,
  );
}
const jobs =
  configuredJobs ||
  String(Math.min(8, availableParallelism?.() || cpus().length || 2));
const publicHeader = join(
  packageRoot,
  "include",
  "sagejs",
  "fflas_matrix_ffi.h",
);
const {
  NATIVE_MATH_DEPENDENCY_VERSIONS,
  nativeMathBuildProfile,
  parseGmpConfigureObservation,
  validateGmpConfigureObservation,
} = require(join(repositoryRoot, "scripts", "native-math-profile.cjs"));
const {
  commandIdentity,
  readNativeDependencyReceipt,
  writeNativeDependencyReceipt,
} = require(join(repositoryRoot, "scripts", "native-dependency-receipt.cjs"));
const {
  appleAccelerateSdkInputs,
  fflasMathBuildProfile,
  macosDeploymentTarget: selectedMacosDeploymentTarget,
} = require(join(repositoryRoot, "scripts", "darwin-native.cjs"));
const macosDeploymentTarget = process.platform === "darwin"
  ? selectedMacosDeploymentTarget()
  : undefined;
const mathBuildProfile = fflasMathBuildProfile(nativeMathBuildProfile());
const mathBuildOptions = mathBuildProfile.buildOptions;

const dependencies = [
  {
    name: "gmp",
    version: NATIVE_MATH_DEPENDENCY_VERSIONS.gmp,
    url: "https://gmplib.org/download/gmp/gmp-6.3.0.tar.xz",
    mirrors: ["https://ftp.gnu.org/gnu/gmp/gmp-6.3.0.tar.xz"],
    sha256: "a3c2b80201b89e68616f4ad30bc66aee4927c3ce50e33929ca819d5c43538898",
    archive: process.env.SAGEJS_GMP_TARBALL,
  },
  {
    name: "givaro",
    version: NATIVE_MATH_DEPENDENCY_VERSIONS.givaro,
    url: "https://github.com/linbox-team/givaro/releases/download/v4.2.2/givaro-4.2.2.tar.gz",
    sha256: "53e9fb290deb0e20799c62d250d65c2226013d60b4cebe6b0b54c73000cb8fff",
    archive: process.env.SAGEJS_GIVARO_TARBALL,
  },
  {
    name: "fflas-ffpack",
    version: NATIVE_MATH_DEPENDENCY_VERSIONS.fflasFfpack,
    url: "https://github.com/linbox-team/fflas-ffpack/releases/download/v2.5.0/fflas-ffpack-2.5.0.tar.gz",
    sha256: "dafb4c0835824d28e4f823748579be6e4c8889c9570c6ce9cce1e186c3ebbb23",
    archive: process.env.SAGEJS_FFLAS_FFPACK_TARBALL,
  },
];

function run(command, arguments_, options = {}) {
  process.stdout.write(`+ ${command} ${arguments_.join(" ")}\n`);
  const result = spawnSync(command, arguments_, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...(macosDeploymentTarget
        ? { MACOSX_DEPLOYMENT_TARGET: macosDeploymentTarget }
        : {}),
      ...options.env,
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}

function digest(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

function blasIdentity() {
  if (process.platform === "darwin") {
    const { stub, cblasHeader } = appleAccelerateSdkInputs();
    return {
      provider: "apple-accelerate",
      sdkStubSha256: digest(stub),
      sdkCblasHeaderSha256: digest(cblasHeader),
    };
  }
  return { provider: "openblas-from-sagejs-flint" };
}

function aggregateDependency(selected = dependencies) {
  const sources = selected
    .map(({ name, sha256, version }) => ({ name, sha256, version }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return {
    name: "fflas-stack",
    sha256: createHash("sha256").update(JSON.stringify(sources)).digest("hex"),
    version: NATIVE_MATH_DEPENDENCY_VERSIONS.fflasFfpack,
  };
}

function receiptExpectation(configuration, observed, options = {}) {
  const platform = options.platform || process.platform;
  const profile = options.mathBuildProfile || mathBuildProfile;
  return {
    build: { configuration, observed },
    capability: platform !== "win32",
    dependency: aggregateDependency(options.dependencies),
    deployment: platform === "darwin"
      ? { macos: options.macosDeploymentTarget || macosDeploymentTarget }
      : null,
    interface: {
      header: "include/sagejs/fflas_matrix_ffi.h",
      sha256: digest(publicHeader),
    },
    mathProfile: profile,
    package: "fflas",
    toolchain: options.toolchain || {
      build: platform === "win32" ? null : commandIdentity("make"),
      compilers: profile.compilers,
    },
  };
}

function reusableBuildReceipt(stampPath, expectedConfiguration, targetPrefix = prefix) {
  const receipt = readNativeDependencyReceipt(stampPath, {
    prefix: targetPrefix,
  });
  if (receipt === null) return false;
  try {
    validateGmpConfigureObservation(
      expectedConfiguration.mathBuildProfile,
      receipt.build?.observed?.gmpConfigure,
    );
    return readNativeDependencyReceipt(stampPath, {
      expectation: receiptExpectation(
        expectedConfiguration,
        receipt.build.observed,
        {
          mathBuildProfile: expectedConfiguration.mathBuildProfile,
          macosDeploymentTarget: expectedConfiguration.macosDeploymentTarget,
          platform: expectedConfiguration.mathBuildProfile.abi.platform,
        },
      ),
      prefix: targetPrefix,
    }) !== null;
  } catch {
    return false;
  }
}

async function obtainArchive(dependency) {
  mkdirSync(downloads, { recursive: true });
  const filename = dependency.archive
    ? resolve(dependency.archive)
    : join(downloads, basename(dependency.url));
  if (existsSync(filename)) {
    const actual = digest(filename);
    if (actual === dependency.sha256) return filename;
    if (dependency.archive) {
      throw new Error(
        `${dependency.name} archive SHA-256 is ${actual}, expected ${dependency.sha256}`,
      );
    }
    rmSync(filename, { force: true });
  }

  const failures = [];
  for (const url of [dependency.url, ...(dependency.mirrors || [])]) {
    for (let attempt = 1; attempt <= 3; ++attempt) {
      try {
        process.stdout.write(`Downloading ${url} (attempt ${attempt}/3)\n`);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        const contents = Buffer.from(await response.arrayBuffer());
        const actual = createHash("sha256").update(contents).digest("hex");
        if (actual !== dependency.sha256) {
          throw new Error(`SHA-256 is ${actual}, expected ${dependency.sha256}`);
        }
        writeFileSync(filename, contents);
        return filename;
      } catch (error) {
        failures.push(`${url} attempt ${attempt}: ${error.message || error}`);
      }
    }
  }
  throw new Error(
    `unable to obtain ${dependency.name}:\n${failures.join("\n")}`,
  );
}

function extract(archive, dependency) {
  const source = join(sources, `${dependency.name}-${dependency.version}`);
  rmSync(source, { recursive: true, force: true });
  mkdirSync(source, { recursive: true });
  run("tar", ["xf", archive, "-C", source, "--strip-components=1"]);
  return source;
}

function installHeader() {
  const destination = join(prefix, "include", "sagejs", "fflas_matrix_ffi.h");
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(publicHeader, destination);
}

function installBlasLinkArtifact() {
  mkdirSync(join(prefix, "lib"), { recursive: true });
  mkdirSync(join(prefix, "include"), { recursive: true });
  if (process.platform === "darwin") {
    rmSync(join(prefix, "lib", "libopenblas.a"), { force: true });
    rmSync(join(prefix, "include", "f77blas.h"), { force: true });
    rmSync(join(prefix, "include", "openblas_config.h"), { force: true });
    const { stub, cblasHeader } = appleAccelerateSdkInputs();
    copyFileSync(stub, join(prefix, "lib", "Accelerate.tbd"));
    copyFileSync(cblasHeader, join(prefix, "include", "cblas.h"));
  } else {
    rmSync(join(prefix, "lib", "Accelerate.tbd"), { force: true });
    const library = join(flintPrefix, "lib", "libopenblas.a");
    if (!existsSync(library)) {
      throw new Error(
        `OpenBLAS is unavailable at ${library}; build packages/flint first`,
      );
    }
    copyFileSync(library, join(prefix, "lib", "libopenblas.a"));
    for (const name of ["cblas.h", "f77blas.h", "openblas_config.h"]) {
      copyFileSync(
        join(flintPrefix, "include", name),
        join(prefix, "include", name),
      );
    }
  }
}

function makeFflasPrefixRelocatable(targetPrefix = prefix) {
  const replaceInstalledPrefix = (filename, transform) => {
    if (!existsSync(filename)) return;
    const before = readFileSync(filename, "utf8");
    const after = transform(before);
    if (after.includes(targetPrefix)) {
      throw new Error(`FFLAS metadata still embeds its build prefix: ${filename}`);
    }
    writeFileSync(filename, after);
  };
  for (const name of ["fflas-ffpack-config", "givaro-config"]) {
    replaceInstalledPrefix(join(targetPrefix, "bin", name), (contents) =>
      contents
        .replaceAll(targetPrefix, "${prefix}")
        .replace(
          /^prefix=.*$/m,
          'prefix=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)',
        )
    );
  }
  const pkgconfig = join(targetPrefix, "lib", "pkgconfig");
  if (existsSync(pkgconfig)) {
    for (const name of readdirSync(pkgconfig).filter((entry) => entry.endsWith(".pc"))) {
      replaceInstalledPrefix(join(pkgconfig, name), (contents) =>
        contents
          .replaceAll(targetPrefix, "${prefix}")
          .replace(/^prefix=.*$/m, "prefix=${pcfiledir}/../..")
          .replace(/^exec_prefix=.*$/m, "exec_prefix=${prefix}")
          .replace(/^libdir=.*$/m, "libdir=${prefix}/lib")
          .replace(/^includedir=.*$/m, "includedir=${prefix}/include")
      );
    }
  }
  const library = join(targetPrefix, "lib");
  if (existsSync(library)) {
    for (const name of readdirSync(library).filter((entry) => entry.endsWith(".la"))) {
      // Libtool archives encode absolute installation paths and are not used
      // by the generated adapter, which links the static archives directly.
      rmSync(join(library, name), { force: true });
    }
  }
}

function buildGmp(source) {
  const configure = [
    `--prefix=${prefix}`,
    ...mathBuildOptions.fflas.gmpConfigure,
  ];
  run("./configure", configure, {
    cwd: source,
    env: {
      CFLAGS: mathBuildOptions.gmp.cflags.join(" "),
      CXXFLAGS: mathBuildOptions.fflas.cxxflags.join(" "),
    },
  });
  const configureObservation = parseGmpConfigureObservation(
    readFileSync(join(source, "config.log"), "utf8"),
  );
  validateGmpConfigureObservation(mathBuildProfile, configureObservation);
  run("make", [`-j${jobs}`], { cwd: source });
  run("make", ["install"], { cwd: source });
  return configureObservation;
}

function buildGivaro(source) {
  run(
    "./configure",
    [
      `--prefix=${prefix}`,
      `--with-gmp=${prefix}`,
      "--without-archnative",
      "--disable-shared",
      "--enable-static",
    ],
    {
      cwd: source,
      env: {
        CPPFLAGS: `-I${join(prefix, "include")}`,
        CXXFLAGS: mathBuildOptions.fflas.cxxflags.join(" "),
        LDFLAGS: `-L${join(prefix, "lib")}`,
      },
    },
  );
  run("make", [`-j${jobs}`], { cwd: source });
  run("make", ["install"], { cwd: source });
}

function buildFflasFfpack(source) {
  const include = join(prefix, "include");
  const library = join(prefix, "lib");
  const blasLibraries = process.platform === "darwin"
    ? "-framework Accelerate"
    : `-L${library} -lopenblas`;
  run(
    "./configure",
    [
      `--prefix=${prefix}`,
      "--without-archnative",
      "--disable-shared",
      "--enable-static",
      "--disable-openmp",
      "--disable-precompilation",
    ],
    {
      cwd: source,
      env: {
        CPPFLAGS: `-I${include}`,
        CXXFLAGS: mathBuildOptions.fflas.cxxflags.join(" "),
        LDFLAGS: `-L${library}`,
        LIBS: `-lgivaro -lgmpxx -lgmp ${blasLibraries}`,
        GIVARO_CFLAGS: `-I${include}`,
        GIVARO_LIBS: `-L${library} -lgivaro -lgmpxx -lgmp`,
        BLAS_CFLAGS: `-I${include}`,
        BLAS_LIBS: blasLibraries,
      },
    },
  );
  run("make", [`-j${jobs}`], { cwd: source });
  run("make", ["install"], { cwd: source });
}

async function buildDependencies() {
  installHeader();
  const stampPath = join(prefix, ".sagejs-fflas-dependencies.json");
  const expectedStamp = {
    fflasFfpack: "2.5.0",
    givaro: "4.2.2",
    gmp: "6.3.0-cxx",
    blas: blasIdentity(),
    mathBuildProfile,
    ...(macosDeploymentTarget ? { macosDeploymentTarget } : {}),
  };

  if (process.platform === "win32") {
    mkdirSync(prefix, { recursive: true });
    installHeader();
    writeNativeDependencyReceipt(
      stampPath,
      receiptExpectation(expectedStamp, { capability: "unavailable" }),
      prefix,
    );
    process.stdout.write("FFLAS capability disabled on native Windows\n");
    return;
  }
  const supported =
    (process.platform === "linux" &&
      (process.arch === "x64" || process.arch === "arm64")) ||
    (process.platform === "darwin" &&
      (process.arch === "x64" || process.arch === "arm64"));
  if (!supported) {
    throw new Error(`unsupported FFLAS host ${process.platform}/${process.arch}`);
  }

  if (
    existsSync(join(prefix, "lib", "libgmpxx.a")) &&
    existsSync(join(prefix, "lib", "libgivaro.a")) &&
    existsSync(join(
      prefix,
      "lib",
      process.platform === "darwin" ? "Accelerate.tbd" : "libopenblas.a",
    )) &&
    existsSync(join(prefix, "include", "fflas-ffpack", "fflas-ffpack.h")) &&
    reusableBuildReceipt(stampPath, expectedStamp)
  ) {
    process.stdout.write(`Using FFLAS dependencies in ${prefix}\n`);
    return;
  }

  mkdirSync(prefix, { recursive: true });
  mkdirSync(sources, { recursive: true });
  installBlasLinkArtifact();
  const archives = new Map();
  for (const dependency of dependencies) {
    archives.set(dependency.name, await obtainArchive(dependency));
  }
  const source = (name) => {
    const dependency = dependencies.find((item) => item.name === name);
    return extract(archives.get(name), dependency);
  };
  const gmpConfigure = buildGmp(source("gmp"));
  buildGivaro(source("givaro"));
  buildFflasFfpack(source("fflas-ffpack"));
  installHeader();
  makeFflasPrefixRelocatable();
  writeNativeDependencyReceipt(
    stampPath,
    receiptExpectation(expectedStamp, { gmpConfigure }),
    prefix,
  );
  process.stdout.write(`FFLAS dependencies installed in ${prefix}\n`);
}

async function main() {
  const arguments_ = process.argv.slice(2);
  const cacheBuild = arguments_.length === 1 && arguments_[0] === "--cache-build";
  if (arguments_.length !== 0 && !cacheBuild) {
    throw new Error(`unknown FFLAS dependency build option: ${arguments_.join(" ")}`);
  }
  if (
    !cacheBuild &&
    process.env.SAGEJS_FFLAS_PREFIX === undefined &&
    process.env.SAGEJS_FLINT_PREFIX === undefined
  ) {
    const {
      fflasUsesFlintPrefix,
      prepareNativeDependencies,
      restoreNativeDependencies,
    } = require("../../../scripts/native-worktree-cache.cjs");
    const restored = restoreNativeDependencies(repositoryRoot, ["fflas"]);
    if (restored.every(({ status }) => ["present", "restored"].includes(status))) {
      for (const result of restored) {
        process.stdout.write(`Native cache ${result.id}: ${result.status}\n`);
      }
      return;
    }
    const results = prepareNativeDependencies(
      repositoryRoot,
      fflasUsesFlintPrefix() ? ["flint", "fflas"] : ["fflas"],
    );
    for (const result of results) {
      process.stdout.write(`Native cache ${result.id}: ${result.status}\n`);
    }
    return;
  }
  await buildDependencies();
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  makeFflasPrefixRelocatable,
  receiptExpectation,
  reusableBuildReceipt,
};

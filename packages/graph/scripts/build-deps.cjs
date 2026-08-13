"use strict";

const { availableParallelism, cpus } = require("node:os");
const { createHash } = require("node:crypto");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  copyFileSync,
  readdirSync,
  writeFileSync,
} = require("node:fs");
const { basename, join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  nativeMathBuildProfile,
} = require("../../../scripts/native-math-profile.cjs");
const {
  commandIdentity,
  readNativeDependencyReceipt,
  writeNativeDependencyReceipt,
} = require("../../../scripts/native-dependency-receipt.cjs");

const packageRoot = resolve(__dirname, "..");
const buildRoot = join(packageRoot, ".native");
const prefix = resolve(
  process.env.SAGEJS_GRAPH_PREFIX || join(buildRoot, "prefix"),
);
const downloads = join(buildRoot, "downloads");
const sources = join(buildRoot, "sources");
const build = join(buildRoot, "build", "igraph-1.0.1");
const stamp = join(prefix, ".sagejs-igraph-1.0.1");
const publicHeader = join(packageRoot, "include", "sagejs", "igraph_ffi.h");

function installSagejsHeader() {
  const destination = join(prefix, "include", "sagejs", "igraph_ffi.h");
  mkdirSync(join(prefix, "include", "sagejs"), { recursive: true });
  copyFileSync(publicHeader, destination);
}

function makePrefixRelocatable() {
  const pkgconfig = join(prefix, "lib", "pkgconfig");
  if (!existsSync(pkgconfig)) return;
  for (const name of readdirSync(pkgconfig).filter((entry) => entry.endsWith(".pc"))) {
    const filename = join(pkgconfig, name);
    const before = readFileSync(filename, "utf8");
    const after = before
      .replaceAll(prefix, "${prefix}")
      .replace(/^prefix=.*$/m, "prefix=${pcfiledir}/../..")
      .replace(/^exec_prefix=.*$/m, "exec_prefix=${prefix}")
      .replace(/^libdir=.*$/m, "libdir=${prefix}/lib")
      .replace(/^includedir=.*$/m, "includedir=${prefix}/include");
    if (after.includes(prefix)) {
      throw new Error(`igraph metadata still embeds its build prefix: ${filename}`);
    }
    writeFileSync(filename, after);
  }
}
const configuredJobs = process.env.SAGEJS_BUILD_JOBS;
if (configuredJobs !== undefined && !/^[1-9][0-9]*$/.test(configuredJobs)) {
  throw new Error(
    `SAGEJS_BUILD_JOBS must be a positive integer, got ${JSON.stringify(configuredJobs)}`,
  );
}
const jobs =
  configuredJobs ||
  String(Math.min(8, availableParallelism?.() || cpus().length || 2));

const dependency = {
  name: "igraph",
  version: "1.0.1",
  url: "https://github.com/sagemathinc/sagejs/releases/download/native-sources-1/igraph-1.0.1.tar.gz",
  mirrors: [
    "https://github.com/igraph/igraph/releases/download/1.0.1/igraph-1.0.1.tar.gz",
  ],
  sha256: "969f2d7d22f67e788d8638c9a8c96615f50d7819c08978b3ef4a787bb6daa96c",
  archive: process.env.SAGEJS_IGRAPH_TARBALL,
};

const inheritedBuildEnvironment = Object.freeze([
  "AR",
  "ARFLAGS",
  "CC",
  "CMAKE_GENERATOR",
  "CMAKE_GENERATOR_INSTANCE",
  "CMAKE_GENERATOR_PLATFORM",
  "CMAKE_GENERATOR_TOOLSET",
  "CMAKE_PREFIX_PATH",
  "CMAKE_TOOLCHAIN_FILE",
  "CPATH",
  "CPPFLAGS",
  "CXX",
  "DESTDIR",
  "LD",
  "LDFLAGS",
  "LIB",
  "LIBPATH",
  "MACOSX_DEPLOYMENT_TARGET",
  "PKG_CONFIG",
  "PKG_CONFIG_LIBDIR",
  "PKG_CONFIG_PATH",
  "SDKROOT",
  "SOURCE_DATE_EPOCH",
  "ZERO_AR_DATE",
]);

function selectedEnvironment(environment) {
  const names = new Set(inheritedBuildEnvironment);
  for (const name of Object.keys(environment)) {
    if (name.startsWith("CMAKE_")) names.add(name);
  }
  return Object.fromEntries([...names].sort().map((name) => [
    name,
    environment[name] ?? null,
  ]));
}

function igraphLtoSetting(platform = process.platform) {
  // MSVC's /GL archives contain compiler intermediate representation rather
  // than ordinary COFF objects. The generated FFI adapter is linked with
  // clang-cl/lld-link, which cannot consume those archive members.
  return platform === "win32" ? "OFF" : "ON";
}

function cmakeOptions(platform = process.platform) {
  return [
    "-DBUILD_SHARED_LIBS=OFF",
    "-DBUILD_TESTING=OFF",
    "-DIGRAPH_GLPK_SUPPORT=OFF",
    "-DIGRAPH_INFOMAP_SUPPORT=OFF",
    "-DIGRAPH_GRAPHML_SUPPORT=OFF",
    "-DIGRAPH_OPENMP_SUPPORT=OFF",
    `-DIGRAPH_ENABLE_LTO=${igraphLtoSetting(platform)}`,
    "-DIGRAPH_USE_INTERNAL_ARPACK=ON",
    "-DIGRAPH_USE_INTERNAL_BLAS=ON",
    "-DIGRAPH_USE_INTERNAL_GMP=ON",
    "-DIGRAPH_USE_INTERNAL_LAPACK=ON",
    "-DIGRAPH_USE_INTERNAL_PLFIT=ON",
  ];
}

function expectedBuild(options = {}) {
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const environment = options.environment || process.env;
  const mathProfile = options.mathProfile || nativeMathBuildProfile({
    arch,
    environment,
    platform,
  });
  const deploymentTarget = platform === "darwin"
    ? options.macosDeploymentTarget || environment.MACOSX_DEPLOYMENT_TARGET || "13.0"
    : null;
  return {
    build: {
      cflags: platform === "win32"
        ? []
        : [...mathProfile.buildOptions.flint.cflags, "-DNDEBUG"],
      cmake: cmakeOptions(platform),
      configuration: "Release",
      cxxflags: platform === "win32"
        ? []
        : [...mathProfile.buildOptions.fflas.cxxflags, "-DNDEBUG"],
      generatorArchitecture: platform === "win32" ? "x64" : null,
      environment: selectedEnvironment(environment),
      instructionPolicy: platform === "win32"
        ? "msvc-x64-baseline"
        : mathProfile.effectiveProfile === "cpu-native"
          ? "compiler-native"
          : "compiler-target-baseline",
      positionIndependentCode: platform !== "win32",
    },
    dependency: {
      name: dependency.name,
      sha256: dependency.sha256,
      version: dependency.version,
    },
    deployment: deploymentTarget === null ? null : { macos: deploymentTarget },
    interface: {
      header: "include/sagejs/igraph_ffi.h",
      sha256: digest(publicHeader),
    },
    mathProfile,
    package: "igraph",
    toolchain: options.toolchain || {
      build: commandIdentity("cmake"),
      compilers: platform === "win32"
        ? {
          c: commandIdentity("cl", []),
          cxx: commandIdentity("cl", []),
          selection: "cmake-visual-studio-x64-default",
        }
        : mathProfile.compilers,
    },
  };
}

function cmakeValue(contents, name) {
  const match = contents.match(new RegExp(`^set\\(${name} "([^"]*)"\\)$`, "m"));
  return match ? match[1] : null;
}

function observedWindowsToolchain() {
  const compilerFiles = [];
  const visit = (directory) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filename = join(directory, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.name === "CMakeCCompiler.cmake") compilerFiles.push(filename);
    }
  };
  visit(join(build, "CMakeFiles"));
  if (compilerFiles.length !== 1) {
    throw new Error("unable to identify the configured Windows C compiler");
  }
  const compiler = readFileSync(compilerFiles[0], "utf8");
  const cache = readFileSync(join(build, "CMakeCache.txt"), "utf8");
  const cacheValue = (name) => {
    const match = cache.match(new RegExp(`^${name}:[^=]*=(.*)$`, "m"));
    return match ? match[1] : null;
  };
  const command = cmakeValue(compiler, "CMAKE_C_COMPILER");
  if (!command) throw new Error("configured Windows C compiler path is absent");
  return {
    build: commandIdentity("cmake"),
    compilers: {
      c: {
        ...commandIdentity(command, []),
        id: cmakeValue(compiler, "CMAKE_C_COMPILER_ID"),
        version: cmakeValue(compiler, "CMAKE_C_COMPILER_VERSION"),
      },
      generator: cacheValue("CMAKE_GENERATOR"),
      generatorInstance: cacheValue("CMAKE_GENERATOR_INSTANCE"),
      generatorPlatform: cacheValue("CMAKE_GENERATOR_PLATFORM"),
      generatorToolset: cacheValue("CMAKE_GENERATOR_TOOLSET"),
      selection: "cmake-configured-toolchain",
    },
  };
}

function run(command, arguments_, options = {}) {
  process.stdout.write(`+ ${command} ${arguments_.join(" ")}\n`);
  const result = spawnSync(command, arguments_, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
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

async function obtainArchive() {
  mkdirSync(downloads, { recursive: true });
  const filename = dependency.archive
    ? resolve(dependency.archive)
    : join(downloads, basename(dependency.url));
  if (existsSync(filename)) {
    const actual = digest(filename);
    if (actual === dependency.sha256) return filename;
    if (dependency.archive) {
      throw new Error(
        `igraph archive SHA-256 is ${actual}, expected ${dependency.sha256}`,
      );
    }
    rmSync(filename, { force: true });
  }

  const failures = [];
  for (const url of [dependency.url, ...dependency.mirrors]) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        process.stdout.write(`Downloading ${url} (attempt ${attempt}/3)\n`);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        const contents = Buffer.from(await response.arrayBuffer());
        const actual = createHash("sha256").update(contents).digest("hex");
        if (actual !== dependency.sha256) {
          throw new Error(
            `SHA-256 is ${actual}, expected ${dependency.sha256}`,
          );
        }
        writeFileSync(filename, contents);
        return filename;
      } catch (error) {
        failures.push(`${url} attempt ${attempt}: ${error.message}`);
      }
    }
  }
  throw new Error(`unable to obtain igraph:\n${failures.join("\n")}`);
}

function configureAndBuild(source, expected) {
  mkdirSync(build, { recursive: true });
  const configure = [
    "-S",
    source,
    "-B",
    build,
    `-DCMAKE_INSTALL_PREFIX=${prefix}`,
    ...expected.build.cmake,
  ];
  if (process.platform === "win32") {
    configure.push("-A", "x64");
  } else {
    configure.push("-DCMAKE_BUILD_TYPE=Release", "-DCMAKE_POSITION_INDEPENDENT_CODE=ON");
  }
  if (process.platform === "darwin") {
    configure.push(
      `-DCMAKE_OSX_DEPLOYMENT_TARGET=${expected.deployment.macos}`,
    );
  }
  run("cmake", configure, {
    env: process.platform === "win32" ? {} : {
      CFLAGS: expected.build.cflags.join(" "),
      CXXFLAGS: expected.build.cxxflags.join(" "),
    },
  });
  if (process.platform === "win32") {
    expected = expectedBuild({ toolchain: observedWindowsToolchain() });
  }
  run("cmake", [
    "--build",
    build,
    "--config",
    "Release",
    "--target",
    "install",
    "--parallel",
    jobs,
  ]);
  mkdirSync(prefix, { recursive: true });
  installSagejsHeader();
  makePrefixRelocatable();
  writeNativeDependencyReceipt(stamp, expected, prefix);
}

async function main() {
  const expected = expectedBuild();
  if (
    process.platform !== "win32" &&
    readNativeDependencyReceipt(stamp, { expectation: expected, prefix })
  ) {
    installSagejsHeader();
    process.stdout.write(`Reusing igraph ${dependency.version} from ${prefix}\n`);
    return;
  }
  const archive = await obtainArchive();
  const source = join(sources, `igraph-${dependency.version}`);
  rmSync(source, { recursive: true, force: true });
  mkdirSync(sources, { recursive: true });
  run("cmake", ["-E", "tar", "xzf", archive], { cwd: sources });
  rmSync(build, { recursive: true, force: true });
  if (process.env.SAGEJS_GRAPH_PREFIX !== undefined && existsSync(prefix)) {
    throw new Error(
      `refusing to replace unreceipted or stale explicit igraph prefix ${prefix}`,
    );
  }
  rmSync(prefix, { recursive: true, force: true });
  configureAndBuild(source, expected);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  cmakeOptions,
  expectedBuild,
  igraphLtoSetting,
  selectedEnvironment,
};

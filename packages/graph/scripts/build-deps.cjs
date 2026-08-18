"use strict";

const { availableParallelism, cpus } = require("node:os");
const { createHash } = require("node:crypto");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  copyFileSync,
  writeFileSync,
} = require("node:fs");
const { basename, join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const packageRoot = resolve(__dirname, "..");
const repositoryRoot = resolve(packageRoot, "..", "..");
const {
  prebuiltPackageIsCurrent,
} = require("../../../scripts/native-prebuilt-dependencies.cjs");
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

function igraphLtoSetting(_platform = process.platform) {
  // Portable static archives must contain ordinary machine-code objects.
  // GCC and Clang LTO archives contain compiler-version-specific intermediate
  // representation, and MSVC /GL archives likewise cannot be linked by the
  // clang-cl/lld-link adapter toolchain. Cross-machine prebuilds therefore
  // disable LTO on every platform.
  return "OFF";
}

function expectedStamp(platform = process.platform) {
  return `${JSON.stringify(
    {
      sha256: dependency.sha256,
      lto: igraphLtoSetting(platform),
      platform,
    },
    null,
    2,
  )}\n`;
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

function cmakeCommand(platform = process.platform) {
  if (process.env.SAGEJS_CMAKE) return resolve(process.env.SAGEJS_CMAKE);
  const available = spawnSync("cmake", ["--version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (!available.error && available.status === 0) return "cmake";
  if (platform !== "win32") return "cmake";

  const programFilesX86 = process.env["ProgramFiles(x86)"] ||
    "C:\\Program Files (x86)";
  const vswhere = join(
    programFilesX86,
    "Microsoft Visual Studio",
    "Installer",
    "vswhere.exe",
  );
  if (existsSync(vswhere)) {
    const discovered = spawnSync(vswhere, [
      "-latest",
      "-products",
      "*",
      "-requires",
      "Microsoft.VisualStudio.Component.VC.CMake.Project",
      "-property",
      "installationPath",
    ], { encoding: "utf8", windowsHide: true });
    if (discovered.status === 0 && discovered.stdout.trim()) {
      const candidate = join(
        discovered.stdout.trim(),
        "Common7",
        "IDE",
        "CommonExtensions",
        "Microsoft",
        "CMake",
        "CMake",
        "bin",
        "cmake.exe",
      );
      if (existsSync(candidate)) return candidate;
    }
  }
  const buildTools = join(
    "C:\\BuildTools",
    "Common7",
    "IDE",
    "CommonExtensions",
    "Microsoft",
    "CMake",
    "CMake",
    "bin",
    "cmake.exe",
  );
  if (existsSync(buildTools)) return buildTools;
  throw new Error(
    "CMake is required to build igraph; install the Visual Studio CMake " +
      "component or set SAGEJS_CMAKE",
  );
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

function configureAndBuild(source) {
  const cmake = cmakeCommand();
  mkdirSync(build, { recursive: true });
  const configure = [
    "-S",
    source,
    "-B",
    build,
    `-DCMAKE_INSTALL_PREFIX=${prefix}`,
    "-DBUILD_SHARED_LIBS=OFF",
    "-DBUILD_TESTING=OFF",
    "-DIGRAPH_GLPK_SUPPORT=OFF",
    "-DIGRAPH_INFOMAP_SUPPORT=OFF",
    "-DIGRAPH_GRAPHML_SUPPORT=OFF",
    "-DIGRAPH_OPENMP_SUPPORT=OFF",
    `-DIGRAPH_ENABLE_LTO=${igraphLtoSetting()}`,
    "-DIGRAPH_USE_INTERNAL_ARPACK=ON",
    "-DIGRAPH_USE_INTERNAL_BLAS=ON",
    "-DIGRAPH_USE_INTERNAL_GMP=ON",
    "-DIGRAPH_USE_INTERNAL_LAPACK=ON",
    "-DIGRAPH_USE_INTERNAL_PLFIT=ON",
  ];
  if (process.platform === "win32") {
    configure.push("-A", "x64");
  } else {
    configure.push("-DCMAKE_BUILD_TYPE=Release", "-DCMAKE_POSITION_INDEPENDENT_CODE=ON");
  }
  if (process.platform === "darwin") {
    configure.push(
      `-DCMAKE_OSX_DEPLOYMENT_TARGET=${process.env.MACOSX_DEPLOYMENT_TARGET || "13.0"}`,
    );
  }
  run(cmake, configure);
  run(cmake, [
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
  writeFileSync(stamp, expectedStamp());
}

async function main() {
  const library = join(
    prefix,
    "lib",
    process.platform === "win32" ? "igraph.lib" : "libigraph.a",
  );
  if (prebuiltPackageIsCurrent(
    repositoryRoot,
    "graph",
    prefix,
    [library, stamp],
  )) {
    process.stdout.write(`Using prebuilt igraph dependencies in ${prefix}\n`);
    return;
  }
  if (existsSync(stamp) && readFileSync(stamp, "utf8") === expectedStamp()) {
    installSagejsHeader();
    process.stdout.write(`Reusing igraph ${dependency.version} from ${prefix}\n`);
    return;
  }
  const cmake = cmakeCommand();
  const archive = await obtainArchive();
  const source = join(sources, `igraph-${dependency.version}`);
  if (!existsSync(join(source, "CMakeLists.txt"))) {
    mkdirSync(sources, { recursive: true });
    run(cmake, ["-E", "tar", "xzf", archive], { cwd: sources });
  }
  configureAndBuild(source);
  installSagejsHeader();
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { cmakeCommand, expectedStamp, igraphLtoSetting };

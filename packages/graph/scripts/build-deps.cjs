"use strict";

const { availableParallelism, cpus } = require("node:os");
const { createHash } = require("node:crypto");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { basename, join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const packageRoot = resolve(__dirname, "..");
const buildRoot = join(packageRoot, ".native");
const prefix = resolve(
  process.env.SAGEJS_GRAPH_PREFIX || join(buildRoot, "prefix"),
);
const downloads = join(buildRoot, "downloads");
const sources = join(buildRoot, "sources");
const build = join(buildRoot, "build", "igraph-1.0.1");
const stamp = join(prefix, ".sagejs-igraph-1.0.1");
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

function configureAndBuild(source) {
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
    "-DIGRAPH_ENABLE_LTO=ON",
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
  run("cmake", configure);
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
  writeFileSync(stamp, `${dependency.sha256}\n`);
}

async function main() {
  if (existsSync(stamp)) {
    process.stdout.write(`Reusing igraph ${dependency.version} from ${prefix}\n`);
    return;
  }
  const archive = await obtainArchive();
  const source = join(sources, `igraph-${dependency.version}`);
  if (!existsSync(join(source, "CMakeLists.txt"))) {
    mkdirSync(sources, { recursive: true });
    run("cmake", ["-E", "tar", "xzf", archive], { cwd: sources });
  }
  configureAndBuild(source);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

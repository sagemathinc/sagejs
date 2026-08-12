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
const buildRoot = join(packageRoot, ".native");
const prefix = resolve(
  process.env.SAGEJS_M4RI_PREFIX || join(buildRoot, "prefix"),
);
const downloads = join(buildRoot, "downloads");
const sources = join(buildRoot, "sources");
const publicHeader = join(
  packageRoot,
  "include",
  "sagejs",
  "m4ri_matrix_ffi.h",
);
const configuredJobs = process.env.SAGEJS_BUILD_JOBS;
if (configuredJobs !== undefined && !/^[1-9][0-9]*$/.test(configuredJobs)) {
  throw new Error(
    `SAGEJS_BUILD_JOBS must be a positive integer, got ${JSON.stringify(configuredJobs)}`,
  );
}
const jobs = configuredJobs ||
  String(Math.min(8, availableParallelism?.() || cpus().length || 2));
const macosDeploymentTarget = process.platform === "darwin"
  ? process.env.MACOSX_DEPLOYMENT_TARGET || "13.0"
  : undefined;
const dependency = {
  version: "20260122",
  url: "https://github.com/malb/m4ri/releases/download/20260122/m4ri-20260122.tar.gz",
  sha256: "7e033ca1fd36be8861e2f67d9d124c398fc0d830209bb0226462485876346404",
  archive: process.env.SAGEJS_M4RI_TARBALL,
};

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

function installHeader() {
  const destination = join(prefix, "include", "sagejs", "m4ri_matrix_ffi.h");
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(publicHeader, destination);
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
      throw new Error(`M4RI archive SHA-256 is ${actual}, expected ${dependency.sha256}`);
    }
    rmSync(filename, { force: true });
  }
  const response = await fetch(dependency.url);
  if (!response.ok) {
    throw new Error(`unable to download M4RI: ${response.status} ${response.statusText}`);
  }
  const contents = Buffer.from(await response.arrayBuffer());
  const actual = createHash("sha256").update(contents).digest("hex");
  if (actual !== dependency.sha256) {
    throw new Error(`M4RI archive SHA-256 is ${actual}, expected ${dependency.sha256}`);
  }
  writeFileSync(filename, contents);
  return filename;
}

function makePrefixRelocatable() {
  const pkgconfig = join(prefix, "lib", "pkgconfig");
  if (existsSync(pkgconfig)) {
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
        throw new Error(`M4RI metadata still embeds its build prefix: ${filename}`);
      }
      writeFileSync(filename, after);
    }
  }
  for (const name of existsSync(join(prefix, "lib"))
    ? readdirSync(join(prefix, "lib")).filter((entry) => entry.endsWith(".la"))
    : []) {
    rmSync(join(prefix, "lib", name), { force: true });
  }
}

async function main() {
  const stamp = join(prefix, ".sagejs-m4ri-dependencies.json");
  const supported =
    ((process.platform === "linux" || process.platform === "darwin") &&
      (process.arch === "x64" || process.arch === "arm64"));
  if (process.platform === "win32") {
    mkdirSync(prefix, { recursive: true });
    installHeader();
    writeFileSync(
      stamp,
      `${JSON.stringify({ capability: false, platform: "win32" }, null, 2)}\n`,
    );
    process.stdout.write("M4RI capability disabled on native Windows\n");
    return;
  }
  if (!supported) throw new Error(`unsupported M4RI host ${process.platform}/${process.arch}`);
  const expected = {
    version: dependency.version,
    sha256: dependency.sha256,
    threadSafe: true,
    ...(macosDeploymentTarget ? { macosDeploymentTarget } : {}),
  };
  if (
    existsSync(stamp) &&
    existsSync(join(prefix, "lib", "libm4ri.a")) &&
    JSON.stringify(JSON.parse(readFileSync(stamp, "utf8"))) === JSON.stringify(expected)
  ) {
    installHeader();
    process.stdout.write(`Reusing M4RI ${dependency.version} from ${prefix}\n`);
    return;
  }
  rmSync(prefix, { recursive: true, force: true });
  const archive = await obtainArchive();
  const source = join(sources, `m4ri-${dependency.version}`);
  rmSync(source, { recursive: true, force: true });
  mkdirSync(source, { recursive: true });
  run("tar", ["xf", archive, "-C", source, "--strip-components=1"]);
  run(
    "./configure",
    [
      `--prefix=${prefix}`,
      "--disable-shared",
      "--enable-static",
      "--with-pic",
      "--disable-png",
      "--disable-openmp",
      "--without-papi",
      "--enable-thread-safe",
      "--disable-dependency-tracking",
    ],
    { cwd: source, env: { CFLAGS: "-O3 -fPIC -std=gnu17" } },
  );
  run("make", [`-j${jobs}`], { cwd: source });
  run("make", ["install"], { cwd: source });
  installHeader();
  makePrefixRelocatable();
  writeFileSync(stamp, `${JSON.stringify(expected, null, 2)}\n`);
  rmSync(sources, { recursive: true, force: true });
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

"use strict";

const {
  availableParallelism,
  cpus,
} = require("node:os");
const {
  createHash,
} = require("node:crypto");
const {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const {
  basename,
  dirname,
  join,
  resolve,
} = require("node:path");
const {
  spawnSync,
} = require("node:child_process");

const packageRoot = resolve(__dirname, "..");
const buildRoot = join(packageRoot, ".native");
const prefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX || join(buildRoot, "prefix")
);
const downloads = join(buildRoot, "downloads");
const sources = join(buildRoot, "sources");
const configuredJobs = process.env.SAGEJS_BUILD_JOBS;
if (configuredJobs !== undefined && !/^[1-9][0-9]*$/.test(configuredJobs)) {
  throw new Error(
    `SAGEJS_BUILD_JOBS must be a positive integer, got ${JSON.stringify(configuredJobs)}`
  );
}
const jobs =
  configuredJobs ||
  String(Math.min(8, availableParallelism?.() || cpus().length || 2));

const dependencies = [
  {
    name: "gmp",
    version: "6.3.0",
    url: "https://gmplib.org/download/gmp/gmp-6.3.0.tar.xz",
    mirrors: ["https://ftp.gnu.org/gnu/gmp/gmp-6.3.0.tar.xz"],
    sha256: "a3c2b80201b89e68616f4ad30bc66aee4927c3ce50e33929ca819d5c43538898",
    archive: process.env.SAGEJS_GMP_TARBALL,
  },
  {
    name: "mpfr",
    version: "4.2.2",
    url: "https://ftp.gnu.org/gnu/mpfr/mpfr-4.2.2.tar.xz",
    sha256: "b67ba0383ef7e8a8563734e2e889ef5ec3c3b898a01d00fa0a6869ad81c6ce01",
    archive: process.env.SAGEJS_MPFR_TARBALL,
  },
  {
    name: "mpc",
    version: "1.4.1",
    url: "https://ftp.gnu.org/gnu/mpc/mpc-1.4.1.tar.xz",
    sha256: "91204cd32f164bd3b7c992d4a6a8ce6519511aadab30f78b6982d0bf8d73e931",
    archive: process.env.SAGEJS_MPC_TARBALL,
  },
  {
    name: "flint",
    version: "3.6.0",
    url: "https://flintlib.org/download/flint-3.6.0.tar.gz",
    sha256: "b95e2c7792f5eea4a1c8d2d42c4098434756832e57a094b295eb5dfdc9b4c36b",
    archive: process.env.SAGEJS_FLINT_TARBALL,
  },
  {
    name: "ffpoly",
    version: "1.2.7",
    url: "https://math.mit.edu/~drew/ff_poly_v1.2.7.tar",
    sha256: "ffbe5c7f7ce077f3fedb530656b0f7ae95268cf23a38c9adfc3f654a65973b13",
    archive: process.env.SAGEJS_FFPOLY_TARBALL,
  },
  {
    name: "smalljac",
    version: "4.1.3",
    url: "https://math.mit.edu/~drew/smalljac_v4.1.3.tar",
    sha256: "5a145509e491bba19bf73d8104576083286bd35aea2a149c7c516e9ea5ca8ec7",
    archive: process.env.SAGEJS_SMALLJAC_TARBALL,
  },
];

function run(command, args, options = {}) {
  process.stdout.write(`+ ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function obtainArchive(dependency) {
  mkdirSync(downloads, { recursive: true });
  const path = dependency.archive
    ? resolve(dependency.archive)
    : join(downloads, basename(dependency.url));

  if (existsSync(path)) {
    const actual = digest(path);
    if (actual === dependency.sha256) return path;
    if (dependency.archive) {
      throw new Error(
        `${dependency.name} archive SHA-256 is ${actual}, expected ${dependency.sha256}`
      );
    }
    process.stdout.write(
      `Discarding corrupt cached ${dependency.name} archive (${actual})\n`
    );
    rmSync(path, { force: true });
  }

  const urls = [dependency.url, ...(dependency.mirrors || [])];
  const failures = [];
  for (const url of urls) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        process.stdout.write(
          `Downloading ${url} (attempt ${attempt}/3)\n`
        );
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        const contents = Buffer.from(await response.arrayBuffer());
        const actual = createHash("sha256").update(contents).digest("hex");
        if (actual !== dependency.sha256) {
          throw new Error(
            `SHA-256 is ${actual}, expected ${dependency.sha256}`
          );
        }
        writeFileSync(path, contents);
        return path;
      } catch (error) {
        const message = `${url} attempt ${attempt}: ${error.message || error}`;
        failures.push(message);
        process.stderr.write(`${message}\n`);
        if (attempt < 3) {
          await new Promise((resolveDelay) =>
            setTimeout(resolveDelay, 1000 * 2 ** (attempt - 1))
          );
        }
      }
    }
  }
  throw new Error(
    `unable to download verified ${dependency.name} archive:\n${failures.join("\n")}`
  );
}

function extract(archive, dependency) {
  const source = join(sources, `${dependency.name}-${dependency.version}`);
  rmSync(source, { recursive: true, force: true });
  mkdirSync(source, { recursive: true });
  run("tar", ["xf", archive, "-C", source, "--strip-components=1"]);
  return source;
}

function buildGmp(source) {
  const configure = [
    `--prefix=${prefix}`,
    "--disable-shared",
    "--enable-static",
    "--with-pic",
  ];
  if (process.arch === "x64") configure.push("--enable-fat");
  run("./configure", configure, {
    cwd: source,
    // GMP 6.3's configure probes use pre-C23 unprototyped functions.
    env: { CFLAGS: "-O3 -fPIC -std=gnu17" },
  });
  run("make", [`-j${jobs}`], { cwd: source });
  run("make", ["check"], { cwd: source });
  run("make", ["install"], { cwd: source });
}

function buildMpfr(source) {
  run(
    "./configure",
    [
      `--prefix=${prefix}`,
      "--disable-shared",
      "--enable-static",
      `--with-gmp=${prefix}`,
    ],
    {
      cwd: source,
      env: { CFLAGS: "-O3 -fPIC" },
    }
  );
  run("make", [`-j${jobs}`, "CFLAGS=-O3 -fPIC"], { cwd: source });
  run("make", ["install"], { cwd: source });
}

function buildMpc(source) {
  run(
    "./configure",
    [
      `--prefix=${prefix}`,
      "--disable-shared",
      "--enable-static",
      `--with-gmp=${prefix}`,
      `--with-mpfr=${prefix}`,
    ],
    {
      cwd: source,
      env: { CFLAGS: "-O3 -fPIC" },
    }
  );
  run("make", [`-j${jobs}`], { cwd: source });
  run("make", ["install"], { cwd: source });
}

function buildFlint(source) {
  run(
    "./configure",
    [
      `--prefix=${prefix}`,
      "--enable-static",
      "--disable-shared",
      "--with-pic",
      `--with-gmp=${prefix}`,
      `--with-mpfr=${prefix}`,
    ],
    {
      cwd: source,
      env: { CFLAGS: "-O3 -fPIC" },
    }
  );
  run("make", [`-j${jobs}`], { cwd: source });
  run("make", ["install"], { cwd: source });
}

function installFiles(source, paths, destination) {
  for (const path of paths) {
    const target = join(destination, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(source, path), target);
  }
}

function buildFfpoly(source) {
  const cflags =
    "-O3 -fPIC -fomit-frame-pointer -funroll-loops -m64 -std=gnu99";
  run(
    "make",
    [
      `-j${jobs}`,
      "libff_poly.a",
      `CFLAGS=${cflags}`,
      `INCLUDES=-I${join(prefix, "include")}`,
    ],
    { cwd: source }
  );
  installFiles(source, ["libff_poly.a"], join(prefix, "lib"));
  installFiles(source, ["ff_poly.h"], join(prefix, "include"));
  installFiles(
    source,
    [
      "asm.h",
      "cstd.h",
      "ff.h",
      "ff2k.h",
      "ffext.h",
      "ffmontgomery64.h",
      "ffpoly.h",
      "ffpolybig.h",
      "ffpolyfromroots.h",
      "ffpolysmall.h",
      "ntutil.h",
      "polyparse.h",
    ],
    join(prefix, "include", "ff_poly")
  );
}

function buildSmalljac(source) {
  const cflags =
    "-O3 -fPIC -fomit-frame-pointer -funroll-loops -m64 -std=gnu99";
  run(
    "make",
    [
      `-j${jobs}`,
      "libsmalljac.a",
      `CFLAGS=${cflags}`,
      `INCLUDES=-I${join(prefix, "include")}`,
    ],
    { cwd: source }
  );
  installFiles(source, ["libsmalljac.a"], join(prefix, "lib"));
  installFiles(source, ["smalljac.h"], join(prefix, "include"));
}

async function main() {
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error(
      "the native smalljac/ffpoly backend currently requires x86-64 Linux"
    );
  }
  const stampPath = join(prefix, ".sagejs-flint-dependencies.json");
  const expectedStamp = {
    ffpoly: dependencies.find(({ name }) => name === "ffpoly").version,
    flint: dependencies.find(({ name }) => name === "flint").version,
    gmp: dependencies.find(({ name }) => name === "gmp").version,
    mpc: dependencies.find(({ name }) => name === "mpc").version,
    mpfr: dependencies.find(({ name }) => name === "mpfr").version,
    smalljac: dependencies.find(({ name }) => name === "smalljac").version,
  };

  if (
    existsSync(join(prefix, "lib", "libgmp.a")) &&
    existsSync(join(prefix, "lib", "libflint.a")) &&
    existsSync(join(prefix, "lib", "libff_poly.a")) &&
    existsSync(join(prefix, "lib", "libmpc.a")) &&
    existsSync(join(prefix, "lib", "libmpfr.a")) &&
    existsSync(join(prefix, "lib", "libsmalljac.a")) &&
    existsSync(stampPath) &&
    JSON.stringify(JSON.parse(readFileSync(stampPath, "utf8"))) ===
      JSON.stringify(expectedStamp)
  ) {
    process.stdout.write(`Using native dependencies in ${prefix}\n`);
    return;
  }

  mkdirSync(prefix, { recursive: true });
  mkdirSync(sources, { recursive: true });
  const archives = new Map();
  for (const dependency of dependencies) {
    archives.set(dependency.name, await obtainArchive(dependency));
  }
  const source = (name) => {
    const dependency = dependencies.find((entry) => entry.name === name);
    return extract(archives.get(name), dependency);
  };
  buildGmp(source("gmp"));
  buildMpfr(source("mpfr"));
  buildMpc(source("mpc"));
  buildFlint(source("flint"));
  buildFfpoly(source("ffpoly"));
  buildSmalljac(source("smalljac"));
  writeFileSync(stampPath, `${JSON.stringify(expectedStamp, null, 2)}\n`);
  process.stdout.write(`Native dependencies installed in ${prefix}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

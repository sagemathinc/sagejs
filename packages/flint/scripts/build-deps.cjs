"use strict";

const {
  availableParallelism,
  cpus,
} = require("node:os");
const {
  createHash,
} = require("node:crypto");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const {
  basename,
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
const jobs = String(
  Math.min(8, availableParallelism?.() || cpus().length || 2)
);

const dependencies = [
  {
    name: "gmp",
    version: "6.3.0",
    url: "https://gmplib.org/download/gmp/gmp-6.3.0.tar.xz",
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
    version: "3.5.0",
    url: "https://flintlib.org/download/flint-3.5.0.tar.gz",
    sha256: "3982f385f00610a944e0152eb0a29893b2366fa640e8f5f3076c47564cf7e2a6",
    archive: process.env.SAGEJS_FLINT_TARBALL,
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

  if (!existsSync(path)) {
    process.stdout.write(`Downloading ${dependency.url}\n`);
    const response = await fetch(dependency.url);
    if (!response.ok) {
      throw new Error(
        `download failed: ${response.status} ${response.statusText}`
      );
    }
    writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  }

  const actual = digest(path);
  if (actual !== dependency.sha256) {
    throw new Error(
      `${dependency.name} archive SHA-256 is ${actual}, expected ${dependency.sha256}`
    );
  }
  return path;
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

async function main() {
  const stampPath = join(prefix, ".sagejs-flint-dependencies.json");
  const expectedStamp = {
    flint: dependencies[3].version,
    gmp: dependencies[0].version,
    mpc: dependencies[2].version,
    mpfr: dependencies[1].version,
  };

  if (
    existsSync(join(prefix, "lib", "libgmp.a")) &&
    existsSync(join(prefix, "lib", "libflint.a")) &&
    existsSync(join(prefix, "lib", "libmpc.a")) &&
    existsSync(join(prefix, "lib", "libmpfr.a")) &&
    existsSync(stampPath) &&
    JSON.stringify(JSON.parse(readFileSync(stampPath, "utf8"))) ===
      JSON.stringify(expectedStamp)
  ) {
    process.stdout.write(`Using native dependencies in ${prefix}\n`);
    return;
  }

  mkdirSync(prefix, { recursive: true });
  mkdirSync(sources, { recursive: true });
  const gmpArchive = await obtainArchive(dependencies[0]);
  const mpfrArchive = await obtainArchive(dependencies[1]);
  const mpcArchive = await obtainArchive(dependencies[2]);
  const flintArchive = await obtainArchive(dependencies[3]);
  buildGmp(extract(gmpArchive, dependencies[0]));
  buildMpfr(extract(mpfrArchive, dependencies[1]));
  buildMpc(extract(mpcArchive, dependencies[2]));
  buildFlint(extract(flintArchive, dependencies[3]));
  writeFileSync(stampPath, `${JSON.stringify(expectedStamp, null, 2)}\n`);
  process.stdout.write(`Native dependencies installed in ${prefix}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

"use strict";

const {
  availableParallelism,
  cpus,
} = require("node:os");
const {
  createHash,
} = require("node:crypto");
const {
  cpSync,
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
  relative,
  resolve,
} = require("node:path");
const {
  spawnSync,
} = require("node:child_process");

const packageRoot = resolve(__dirname, "..");
const repositoryRoot = resolve(packageRoot, "..", "..");
const {
  prebuiltPackageIsCurrent,
} = require("../../../scripts/native-prebuilt-dependencies.cjs");
const {
  NATIVE_MATH_DEPENDENCY_VERSIONS,
  flintObservedCapabilities,
  nativeMathBuildProfile,
} = require(join(repositoryRoot, "scripts", "native-math-profile.cjs"));
const mathBuildProfile = nativeMathBuildProfile();
const mathBuildOptions = mathBuildProfile.buildOptions;
const buildRoot = join(packageRoot, ".native");
const windowsTriplet = "x64-windows-static-md-release";
const defaultPrefix = process.platform === "win32"
  ? join(buildRoot, "vcpkg-installed", windowsTriplet)
  : join(buildRoot, "prefix");
const prefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX || defaultPrefix
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
const forcePortableSmalljac =
  process.env.SAGEJS_FORCE_PORTABLE_SMALLJAC === "1";
const macosDeploymentTarget = process.platform === "darwin"
  ? process.env.MACOSX_DEPLOYMENT_TARGET || "13.0"
  : undefined;
const {
  ECLIB_REVISION,
  ECLIB_SOURCE_NAME,
  ECLIB_SOURCE_PATH,
} = require("./eclib-source.cjs");
const {
  prepareSources,
} = require("./portable-smalljac/prepare-sources.cjs");

const dependencies = [
  {
    name: "eclib",
    version: ECLIB_REVISION,
    url: `https://github.com/JohnCremona/eclib/archive/${ECLIB_REVISION}.tar.gz`,
    sha256: "ec3efe86c385c4dcb8a748423333b45059446666f0b28984c24b05549a566d88",
    archive: process.env.SAGEJS_ECLIB_TARBALL,
  },
  {
    name: "gmp",
    version: NATIVE_MATH_DEPENDENCY_VERSIONS.gmp,
    url: "https://gmplib.org/download/gmp/gmp-6.3.0.tar.xz",
    mirrors: ["https://ftp.gnu.org/gnu/gmp/gmp-6.3.0.tar.xz"],
    sha256: "a3c2b80201b89e68616f4ad30bc66aee4927c3ce50e33929ca819d5c43538898",
    archive: process.env.SAGEJS_GMP_TARBALL,
  },
  {
    name: "mpfr",
    version: NATIVE_MATH_DEPENDENCY_VERSIONS.mpfr,
    url: "https://ftp.gnu.org/gnu/mpfr/mpfr-4.2.2.tar.xz",
    sha256: "b67ba0383ef7e8a8563734e2e889ef5ec3c3b898a01d00fa0a6869ad81c6ce01",
    archive: process.env.SAGEJS_MPFR_TARBALL,
  },
  {
    name: "mpc",
    version: NATIVE_MATH_DEPENDENCY_VERSIONS.mpc,
    url: "https://ftp.gnu.org/gnu/mpc/mpc-1.4.1.tar.xz",
    sha256: "91204cd32f164bd3b7c992d4a6a8ce6519511aadab30f78b6982d0bf8d73e931",
    archive: process.env.SAGEJS_MPC_TARBALL,
  },
  {
    name: "openblas",
    version: NATIVE_MATH_DEPENDENCY_VERSIONS.openblas,
    url: "https://github.com/OpenMathLib/OpenBLAS/releases/download/v0.3.33/OpenBLAS-0.3.33.tar.gz",
    sha256: "6761af1d9f5d353ab4f0b7497be2643313b36c8f31caec0144bfef198e71e6ab",
    archive: process.env.SAGEJS_OPENBLAS_TARBALL,
  },
  {
    name: "flint",
    version: NATIVE_MATH_DEPENDENCY_VERSIONS.flint,
    url: "https://flintlib.org/download/flint-3.6.0.tar.gz",
    sha256: "b95e2c7792f5eea4a1c8d2d42c4098434756832e57a094b295eb5dfdc9b4c36b",
    archive: process.env.SAGEJS_FLINT_TARBALL,
  },
  {
    name: "ffpoly",
    version: NATIVE_MATH_DEPENDENCY_VERSIONS.ffpoly,
    url: "https://github.com/sagemathinc/sagejs/releases/download/native-sources-1/ff_poly_v1.2.7.tar",
    mirrors: ["https://math.mit.edu/~drew/ff_poly_v1.2.7.tar"],
    sha256: "ffbe5c7f7ce077f3fedb530656b0f7ae95268cf23a38c9adfc3f654a65973b13",
    archive: process.env.SAGEJS_FFPOLY_TARBALL,
  },
  {
    name: "smalljac",
    version: NATIVE_MATH_DEPENDENCY_VERSIONS.smalljac,
    url: "https://github.com/sagemathinc/sagejs/releases/download/native-sources-1/smalljac_v4.1.3.tar",
    mirrors: ["https://math.mit.edu/~drew/smalljac_v4.1.3.tar"],
    sha256: "5a145509e491bba19bf73d8104576083286bd35aea2a149c7c516e9ea5ca8ec7",
    archive: process.env.SAGEJS_SMALLJAC_TARBALL,
  },
];

function run(command, args, options = {}) {
  process.stdout.write(`+ ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    windowsVerbatimArguments: options.windowsVerbatimArguments,
    env: {
      ...process.env,
      ...(macosDeploymentTarget
        ? { MACOSX_DEPLOYMENT_TARGET: macosDeploymentTarget }
        : {}),
      ...options.env,
    },
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}

function patchWindowsFlintHeaders() {
  const headers = ["flint.h", "longlong.h"];
  const before = "#if defined(__GNUC__)";
  const after = "#if defined(__GNUC__) || defined(__clang__)";
  for (const name of headers) {
    const header = join(prefix, "include", "flint", name);
    const contents = readFileSync(header, "utf8");
    if (contents.includes(after)) continue;
    if (!contents.includes(before)) {
      throw new Error(
        `unable to locate the FLINT clang-cl guard in ${header}`
      );
    }
    writeFileSync(header, contents.replace(before, after));
  }
  process.stdout.write(
    "Enabled FLINT's GNU-compatible header paths for clang-cl\n"
  );
}

function buildWindowsDependencies() {
  if (process.arch !== "x64") {
    throw new Error("the native Windows FLINT backend currently requires x64");
  }
  if (prebuiltPackageIsCurrent(repositoryRoot, "flint", prefix, [
    join(prefix, "lib", "flint.lib"),
    join(prefix, "lib", "openblas.lib"),
  ])) {
    process.stdout.write(`Using prebuilt FLINT dependencies in ${prefix}\n`);
    return;
  }

  const manifest = JSON.parse(
    readFileSync(join(packageRoot, "vcpkg.json"), "utf8")
  );
  const baseline = manifest["builtin-baseline"];
  const managedVcpkg = !process.env.VCPKG_ROOT;
  const vcpkgRoot = resolve(
    process.env.VCPKG_ROOT || join(buildRoot, "vcpkg")
  );
  const vcpkg = join(vcpkgRoot, "vcpkg.exe");

  if (managedVcpkg && !existsSync(join(vcpkgRoot, ".git"))) {
    mkdirSync(dirname(vcpkgRoot), { recursive: true });
    run("git", [
      "clone",
      "--filter=blob:none",
      "https://github.com/microsoft/vcpkg.git",
      vcpkgRoot,
    ]);
  }
  if (managedVcpkg) {
    run("git", ["fetch", "--depth=1", "origin", baseline], {
      cwd: vcpkgRoot,
    });
    run("git", ["checkout", "--detach", baseline], { cwd: vcpkgRoot });
  }
  if (!existsSync(vcpkg)) {
    run(
      process.env.ComSpec || "cmd.exe",
      [
        "/d",
        "/s",
        "/c",
        join(vcpkgRoot, "bootstrap-vcpkg.bat"),
        "-disableMetrics",
      ],
      { cwd: vcpkgRoot }
    );
  }

  const installRoot = dirname(prefix);
  if (basename(prefix) !== windowsTriplet) {
    throw new Error(
      `SAGEJS_FLINT_PREFIX on Windows must end in ${windowsTriplet}`
    );
  }
  run(
    vcpkg,
    [
      "install",
      `--triplet=${windowsTriplet}`,
      `--x-manifest-root=${packageRoot}`,
      `--x-install-root=${installRoot}`,
      `--overlay-triplets=${join(packageRoot, "scripts", "triplets")}`,
      `--overlay-ports=${join(packageRoot, "scripts", "vcpkg-ports")}`,
    ],
    {
      cwd: packageRoot,
      env: { VCPKG_MAX_CONCURRENCY: jobs },
    }
  );
  patchWindowsFlintHeaders();
  process.stdout.write(`Native dependencies installed in ${prefix}\n`);
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error || result.status !== 0) return undefined;
  return result.stdout.trim();
}

function findVisualStudioEnvironment() {
  const candidates = [];
  if (process.env.VSINSTALLDIR) {
    candidates.push(
      join(process.env.VSINSTALLDIR, "VC", "Auxiliary", "Build", "vcvars64.bat"),
    );
  }
  candidates.push("C:\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat");
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  if (programFilesX86) {
    const vswhere = join(
      programFilesX86,
      "Microsoft Visual Studio",
      "Installer",
      "vswhere.exe",
    );
    if (existsSync(vswhere)) {
      const installation = capture(vswhere, [
        "-latest",
        "-products",
        "*",
        "-requires",
        "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
        "-property",
        "installationPath",
      ]);
      if (installation) {
        candidates.push(
          join(installation, "VC", "Auxiliary", "Build", "vcvars64.bat"),
        );
      }
    }
  }
  const vcvars = candidates.find((candidate) => existsSync(candidate));
  if (!vcvars) {
    throw new Error(
      "smalljac requires Visual Studio C++ tools with clang-cl on native Windows",
    );
  }
  return vcvars;
}

async function buildWindowsSmalljac() {
  const ffpoly = dependencies.find(({ name }) => name === "ffpoly");
  const smalljac = dependencies.find(({ name }) => name === "smalljac");
  const stampPath = join(prefix, ".sagejs-smalljac-dependencies.json");
  const expectedBuild = {
    ffpoly: ffpoly.version,
    smalljac: smalljac.version,
    ffpolyPortability: digest(
      join(packageRoot, "patches", "ffpoly-portability.patch"),
    ),
    smalljacPortability: digest(
      join(packageRoot, "patches", "smalljac-portability.patch"),
    ),
    arithmetic: "portable-fixed-width-v2",
    abi: "int64-v1",
  };
  if (
    existsSync(join(prefix, "lib", "ff_poly.lib")) &&
    existsSync(join(prefix, "lib", "smalljac.lib")) &&
    existsSync(join(prefix, "include", "smalljac.h")) &&
    existsSync(stampPath) &&
    JSON.stringify(JSON.parse(readFileSync(stampPath, "utf8")).build) ===
      JSON.stringify(expectedBuild)
  ) {
    process.stdout.write(`Using portable smalljac dependencies in ${prefix}\n`);
    return;
  }

  const ffpolySource = extract(await obtainArchive(ffpoly), ffpoly);
  const smalljacSource = extract(await obtainArchive(smalljac), smalljac);
  prepareSources(ffpolySource, smalljacSource, { windows: true });
  const vcvars = findVisualStudioEnvironment();
  const powershell = [
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File",
    `"${join(__dirname, "portable-smalljac", "build-windows.ps1")}"`,
    `-FfpolySource "${ffpolySource}"`,
    `-SmalljacSource "${smalljacSource}"`,
    `-Prefix "${prefix}"`,
  ].join(" ");
  const command = `call "${vcvars}" >nul && ${powershell}`;
  run(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], {
    windowsVerbatimArguments: true,
  });
  writeFileSync(
    stampPath,
    `${JSON.stringify({ build: expectedBuild }, null, 2)}\n`,
  );
  process.stdout.write(`Portable smalljac installed in ${prefix}\n`);
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
  // Windows tar parses absolute drive-letter operands as `host:file` syntax.
  // Both paths share the package build root, so make both operands relative
  // to the archive directory and keep drive letters out of tar's arguments.
  const archiveDirectory = dirname(archive);
  run(
    "tar",
    [
      "xf",
      basename(archive),
      "-C",
      relative(archiveDirectory, source),
      "--strip-components=1",
    ],
    { cwd: archiveDirectory },
  );
  return source;
}

async function prepareEclibSource() {
  const dependency = dependencies.find(({ name }) => name === "eclib");
  const archive = await obtainArchive(dependency);
  const source = extract(archive, dependency);
  if (basename(source) !== ECLIB_SOURCE_NAME) {
    throw new Error(`unexpected eclib source path ${source}`);
  }
  run(
    "git",
    [
      "apply",
      "--whitespace=nowarn",
      join(packageRoot, "patches", "eclib-flint-rank.patch"),
    ],
    {
      cwd: source,
      // The extracted source lives inside the Sage.js worktree but is not
      // part of it.  Prevent Git from discovering the parent repository and
      // silently skipping paths that are intentionally relative to eclib.
      env: { GIT_CEILING_DIRECTORIES: packageRoot },
    },
  );
  if (source !== ECLIB_SOURCE_PATH) {
    rmSync(ECLIB_SOURCE_PATH, { recursive: true, force: true });
    mkdirSync(dirname(ECLIB_SOURCE_PATH), { recursive: true });
    cpSync(source, ECLIB_SOURCE_PATH, { recursive: true });
  }
  process.stdout.write(
    `Prepared FLINT-only eclib rank source ${ECLIB_REVISION}\n`,
  );
}

function buildGmp(source) {
  const configure = [
    `--prefix=${prefix}`,
    ...mathBuildOptions.gmp.configure,
  ];
  run("./configure", configure, {
    cwd: source,
    // GMP 6.3's configure probes use pre-C23 unprototyped functions.
    env: { CFLAGS: mathBuildOptions.gmp.cflags.join(" ") },
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
      env: { CFLAGS: mathBuildOptions.mpfr.cflags.join(" ") },
    }
  );
  run(
    "make",
    [`-j${jobs}`, `CFLAGS=${mathBuildOptions.mpfr.cflags.join(" ")}`],
    { cwd: source },
  );
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
      env: { CFLAGS: mathBuildOptions.mpc.cflags.join(" ") },
    }
  );
  run("make", [`-j${jobs}`], { cwd: source });
  run("make", ["install"], { cwd: source });
}

function buildOpenBlas(source) {
  const options = [
    "NOFORTRAN=1",
    "NO_LAPACK=1",
    "NO_LAPACKE=1",
    "NO_SHARED=1",
    "ONLY_CBLAS=1",
    "NO_EXPRECISION=1",
    "USE_THREAD=1",
    "NUM_THREADS=64",
    "DYNAMIC_ARCH=1",
    "CFLAGS=-O3 -fPIC",
  ];
  // DYNAMIC_ARCH controls the optimized kernels, but OpenBLAS still tunes its
  // dispatcher and other common objects for the build host unless TARGET is
  // explicit. Those objects execute before dispatch and must use the oldest
  // CPU supported by each portable artifact.
  if (mathBuildOptions.openblas.target) {
    options.push(`TARGET=${mathBuildOptions.openblas.target}`);
  }
  if (process.arch === "x64") {
    options.push(
      "DYNAMIC_LIST=NEHALEM SANDYBRIDGE HASWELL ZEN",
    );
  } else if (process.arch === "arm64") {
    options.push(
      process.platform === "darwin"
        ? "DYNAMIC_LIST=CORTEXA53 NEOVERSEN1 VORTEXM4"
        : "DYNAMIC_LIST=CORTEXA53 NEOVERSEN1 NEOVERSEV1 NEOVERSEN2",
    );
  }
  run("make", [`-j${jobs}`, "libs", ...options], { cwd: source });
  run("make", [`PREFIX=${prefix}`, "install", ...options], { cwd: source });
}

function buildFlint(source) {
  const configure = mathBuildOptions.flint.configure.map((option) =>
    option.replace("<prefix>", prefix)
  );
  run(
    "./configure",
    [
      `--prefix=${prefix}`,
      ...configure,
    ],
    {
      cwd: source,
      env: { CFLAGS: mathBuildOptions.flint.cflags.join(" ") },
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
  const forcePortable = forcePortableSmalljac || process.arch !== "x64";
  const cflags = [
    "-O3",
    "-fPIC",
    "-fomit-frame-pointer",
    "-funroll-loops",
    "-std=gnu99",
    ...(forcePortable ? ["-DSAGEJS_FFPOLY_PORTABLE=1"] : []),
  ].join(" ");
  run(
    "make",
    [
      `-j${jobs}`,
      "libff_poly.a",
      `CC=${process.env.CC || "cc"}`,
      `CFLAGS=${cflags}`,
      `CPPFLAGS=-I${join(prefix, "include")}`,
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
      "sagejs_ffpoly_word.h",
    ],
    join(prefix, "include", "ff_poly")
  );
}

function buildSmalljac(source) {
  const cflags =
    "-O3 -fPIC -fomit-frame-pointer -funroll-loops -std=gnu99";
  const includes = `-I${join(prefix, "include")}`;
  run(
    "make",
    [
      `-j${jobs}`,
      "libsmalljac.a",
      `CC=${process.env.CC || "cc"}`,
      `CFLAGS=${cflags}`,
      `CPPFLAGS=${includes}`,
      `INCLUDES=${includes}`,
    ],
    { cwd: source }
  );
  installFiles(source, ["libsmalljac.a"], join(prefix, "lib"));
  installFiles(source, ["smalljac.h"], join(prefix, "include"));
}

async function main() {
  await prepareEclibSource();
  if (process.platform === "win32") {
    buildWindowsDependencies();
    await buildWindowsSmalljac();
    return;
  }
  const supportedUnix =
    (process.platform === "linux" &&
      (process.arch === "x64" || process.arch === "arm64")) ||
    (process.platform === "darwin" &&
      (process.arch === "arm64" || process.arch === "x64"));
  const smalljacAccelerator = supportedUnix;
  if (!supportedUnix) {
    throw new Error(
      `the native FLINT backend does not yet support ${process.platform}/${process.arch}`
    );
  }
  const prebuiltRequired = [
    "libgmp.a",
    "libflint.a",
    "libmpc.a",
    "libmpfr.a",
    "libopenblas.a",
    ...(smalljacAccelerator ? ["libff_poly.a", "libsmalljac.a"] : []),
  ].map((name) => join(prefix, "lib", name));
  if (prebuiltPackageIsCurrent(
    repositoryRoot,
    "flint",
    prefix,
    prebuiltRequired,
  ) && !forcePortableSmalljac) {
    process.stdout.write(`Using prebuilt FLINT dependencies in ${prefix}\n`);
    return;
  }
  const stampPath = join(prefix, ".sagejs-flint-dependencies.json");
  const expectedBuild = {
    ...(smalljacAccelerator
      ? { ffpoly: dependencies.find(({ name }) => name === "ffpoly").version }
      : {}),
    flint: dependencies.find(({ name }) => name === "flint").version,
    gmp: dependencies.find(({ name }) => name === "gmp").version,
    mpc: dependencies.find(({ name }) => name === "mpc").version,
    mpfr: dependencies.find(({ name }) => name === "mpfr").version,
    openblas:
      dependencies.find(({ name }) => name === "openblas").version,
    openblasBuild: "threaded-cblas-dynamic-v1",
    ffpolyPortability: digest(
      join(packageRoot, "patches", "ffpoly-portability.patch"),
    ),
    smalljacPortability: digest(
      join(packageRoot, "patches", "smalljac-portability.patch"),
    ),
    smalljacArithmetic:
      forcePortableSmalljac || process.arch !== "x64"
        ? "portable-v1"
        : "gnu-x86-64-asm",
    ...(smalljacAccelerator
      ? {
          smalljac:
            dependencies.find(({ name }) => name === "smalljac").version,
        }
      : {}),
    ...(macosDeploymentTarget ? { macosDeploymentTarget } : {}),
    mathBuildProfile,
  };

  if (
    existsSync(join(prefix, "lib", "libgmp.a")) &&
    existsSync(join(prefix, "lib", "libflint.a")) &&
    existsSync(join(prefix, "lib", "libmpc.a")) &&
    existsSync(join(prefix, "lib", "libmpfr.a")) &&
    existsSync(join(prefix, "lib", "libopenblas.a")) &&
    (!smalljacAccelerator ||
      (existsSync(join(prefix, "lib", "libff_poly.a")) &&
        existsSync(join(prefix, "lib", "libsmalljac.a")))) &&
    existsSync(stampPath) &&
    JSON.stringify(JSON.parse(readFileSync(stampPath, "utf8")).build) ===
      JSON.stringify(expectedBuild)
  ) {
    process.stdout.write(`Using native dependencies in ${prefix}\n`);
    return;
  }

  mkdirSync(prefix, { recursive: true });
  mkdirSync(sources, { recursive: true });
  const archives = new Map();
  const selectedDependencies = dependencies.filter(
    ({ name }) => name !== "eclib" &&
      (smalljacAccelerator ||
        (name !== "ffpoly" && name !== "smalljac"))
  );
  for (const dependency of selectedDependencies) {
    archives.set(dependency.name, await obtainArchive(dependency));
  }
  const source = (name) => {
    const dependency = dependencies.find((entry) => entry.name === name);
    return extract(archives.get(name), dependency);
  };
  buildGmp(source("gmp"));
  buildMpfr(source("mpfr"));
  buildMpc(source("mpc"));
  buildOpenBlas(source("openblas"));
  buildFlint(source("flint"));
  if (smalljacAccelerator) {
    const ffpolySource = source("ffpoly");
    const smalljacSource = source("smalljac");
    prepareSources(ffpolySource, smalljacSource);
    buildFfpoly(ffpolySource);
    buildSmalljac(smalljacSource);
  }
  const buildStamp = {
    build: expectedBuild,
    observed: flintObservedCapabilities(prefix),
  };
  writeFileSync(stampPath, `${JSON.stringify(buildStamp, null, 2)}\n`);
  process.stdout.write(`Native dependencies installed in ${prefix}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

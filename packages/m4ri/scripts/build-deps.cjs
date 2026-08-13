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

const {
  nativeMathBuildProfile,
} = require("../../../scripts/native-math-profile.cjs");
const {
  commandIdentity,
  readNativeDependencyReceipt,
  writeNativeDependencyReceipt,
} = require("../../../scripts/native-dependency-receipt.cjs");

const packageRoot = resolve(__dirname, "..");
const repositoryRoot = resolve(packageRoot, "..", "..");
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
  name: "m4ri",
  version: "20260122",
  url: "https://github.com/malb/m4ri/releases/download/20260122/m4ri-20260122.tar.gz",
  sha256: "7e033ca1fd36be8861e2f67d9d124c398fc0d830209bb0226462485876346404",
  archive: process.env.SAGEJS_M4RI_TARBALL,
};

const baseConfigureOptions = [
  "--disable-shared",
  "--enable-static",
  "--with-pic",
  "--disable-png",
  "--disable-openmp",
  "--without-papi",
  "--enable-thread-safe",
  "--disable-dependency-tracking",
];

const portableCacheBytes = Object.freeze({
  l1: 32 * 1024,
  l2: 256 * 1024,
  l3: 8 * 1024 * 1024,
});

const inheritedBuildEnvironment = Object.freeze([
  "AR",
  "ARFLAGS",
  "AS",
  "CC",
  "C_INCLUDE_PATH",
  "CONFIG_SITE",
  "CPATH",
  "DESTDIR",
  "CPP",
  "CPPFLAGS",
  "LD",
  "LDFLAGS",
  "LIBRARY_PATH",
  "MACOSX_DEPLOYMENT_TARGET",
  "NM",
  "OBJCOPY",
  "PKG_CONFIG",
  "PKG_CONFIG_LIBDIR",
  "PKG_CONFIG_PATH",
  "RANLIB",
  "SDKROOT",
  "SOURCE_DATE_EPOCH",
  "STRIP",
  "ZERO_AR_DATE",
]);

function selectedEnvironment(environment) {
  if (environment.CONFIG_SITE !== undefined) {
    throw new Error(
      "CONFIG_SITE is unsupported for reproducible M4RI dependency builds",
    );
  }
  if (environment.DESTDIR !== undefined) {
    throw new Error("DESTDIR is unsupported for M4RI dependency builds");
  }
  return Object.fromEntries(inheritedBuildEnvironment.map((name) => [
    name,
    environment[name] ?? null,
  ]));
}

function configureOptions(mathProfile) {
  const options = [...baseConfigureOptions];
  if (mathProfile.effectiveProfile === "portable") {
    options.push(
      `--with-cachesize=${portableCacheBytes.l1}:` +
      `${portableCacheBytes.l2}:${portableCacheBytes.l3}`,
    );
  }
  return options;
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
  const cflags = platform === "win32"
    ? []
    : [...mathProfile.buildOptions.flint.cflags, "-std=gnu17"];
  const deployment = platform === "darwin"
    ? { macos: options.macosDeploymentTarget || macosDeploymentTarget }
    : null;
  return {
    build: {
      cflags,
      cachePolicy: platform === "win32"
        ? "unavailable"
        : mathProfile.effectiveProfile === "portable"
          ? { kind: "fixed-portable", ...portableCacheBytes }
          : { kind: "configure-detected" },
      configure: platform === "win32" ? [] : configureOptions(mathProfile),
      environment: selectedEnvironment(environment),
      instructionPolicy: platform === "win32"
        ? "unavailable"
        : mathProfile.effectiveProfile === "cpu-native"
          ? "compiler-native"
          : mathProfile.cpuPolicy.baseline,
      threadSafe: platform !== "win32",
    },
    capability: platform !== "win32",
    dependency: {
      name: dependency.name,
      sha256: dependency.sha256,
      version: dependency.version,
    },
    deployment,
    interface: {
      header: "include/sagejs/m4ri_matrix_ffi.h",
      sha256: digest(publicHeader),
    },
    mathProfile,
    package: "m4ri",
    toolchain: {
      archiver: platform === "win32"
        ? null
        : commandIdentity(environment.AR || "ar"),
      build: platform === "win32" ? null : commandIdentity("make"),
      compilers: mathProfile.compilers,
      linker: platform === "win32"
        ? null
        : commandIdentity(environment.LD || "ld"),
      ranlib: platform === "win32"
        ? null
        : commandIdentity(environment.RANLIB || "ranlib"),
    },
  };
}

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

async function buildDependencies() {
  const stamp = join(prefix, ".sagejs-m4ri-dependencies.json");
  const expected = expectedBuild();
  const supported =
    ((process.platform === "linux" || process.platform === "darwin") &&
      (process.arch === "x64" || process.arch === "arm64"));
  if (process.platform === "win32") {
    if (readNativeDependencyReceipt(stamp, { expectation: expected, prefix })) {
      installHeader();
      process.stdout.write("Reusing disabled native Windows M4RI capability\n");
      return;
    }
    if (process.env.SAGEJS_M4RI_PREFIX !== undefined && existsSync(prefix)) {
      throw new Error(
        `refusing to replace unreceipted or stale explicit M4RI prefix ${prefix}`,
      );
    }
    rmSync(prefix, { recursive: true, force: true });
    mkdirSync(prefix, { recursive: true });
    installHeader();
    writeNativeDependencyReceipt(stamp, expected, prefix);
    process.stdout.write("M4RI capability disabled on native Windows\n");
    return;
  }
  if (!supported) throw new Error(`unsupported M4RI host ${process.platform}/${process.arch}`);
  if (
    existsSync(join(prefix, "lib", "libm4ri.a")) &&
    readNativeDependencyReceipt(stamp, { expectation: expected, prefix }) !== null
  ) {
    installHeader();
    process.stdout.write(`Reusing M4RI ${dependency.version} from ${prefix}\n`);
    return;
  }
  if (process.env.SAGEJS_M4RI_PREFIX !== undefined && existsSync(prefix)) {
    throw new Error(
      `refusing to replace unreceipted or stale explicit M4RI prefix ${prefix}`,
    );
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
      ...expected.build.configure,
    ],
    { cwd: source, env: { CFLAGS: expected.build.cflags.join(" ") } },
  );
  run("make", [`-j${jobs}`], { cwd: source });
  run("make", ["install"], { cwd: source });
  if (!existsSync(join(prefix, "lib", "libm4ri.a"))) {
    throw new Error("M4RI build did not install libm4ri.a into its prefix");
  }
  installHeader();
  makePrefixRelocatable();
  writeNativeDependencyReceipt(stamp, expected, prefix);
  rmSync(sources, { recursive: true, force: true });
}

async function main() {
  const arguments_ = process.argv.slice(2);
  const cacheBuild = arguments_.length === 1 && arguments_[0] === "--cache-build";
  if (arguments_.length !== 0 && !cacheBuild) {
    throw new Error(`unknown M4RI dependency build option: ${arguments_.join(" ")}`);
  }
  if (!cacheBuild && process.env.SAGEJS_M4RI_PREFIX === undefined) {
    const {
      prepareNativeDependencies,
      restoreNativeDependencies,
    } = require("../../../scripts/native-worktree-cache.cjs");
    const restored = restoreNativeDependencies(repositoryRoot, ["m4ri"]);
    if (restored.every(({ status }) => ["present", "restored"].includes(status))) {
      for (const result of restored) {
        process.stdout.write(`Native cache ${result.id}: ${result.status}\n`);
      }
      return;
    }
    const results = prepareNativeDependencies(repositoryRoot, ["m4ri"]);
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
  configureOptions,
  expectedBuild,
  portableCacheBytes,
  selectedEnvironment,
};

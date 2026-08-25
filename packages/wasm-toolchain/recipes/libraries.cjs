"use strict";

const {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { spawnSync } = require("node:child_process");
const { dirname, join, resolve } = require("node:path");

let commandObserver = null;

function subprocessEnvironment(overrides = {}) {
  return {
    PATH: process.platform === "darwin"
      ? "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
      : "/usr/local/bin:/usr/bin:/bin",
    LC_ALL: "C",
    LANG: "C",
    TZ: "UTC",
    SOURCE_DATE_EPOCH: "1704067200",
    ZERO_AR_DATE: "1",
    CONFIG_SITE: "/dev/null",
    MAKEFLAGS: "",
    MFLAGS: "",
    PKG_CONFIG_PATH: "",
    CPATH: "",
    LIBRARY_PATH: "",
    ...overrides,
  };
}

function run(command, args, { cwd, env, capture = false } = {}) {
  const environment = subprocessEnvironment(env);
  commandObserver?.({
    command,
    arguments: [...args],
    cwd: cwd ?? process.cwd(),
    environment,
  });
  process.stdout.write(`+ ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} exited with status ${result.status ?? "unknown"}` +
      (capture ? `\n${result.stdout}${result.stderr}` : ""),
    );
  }
  return capture ? result.stdout.trim() : "";
}

function setCommandObserver(observer) {
  commandObserver = observer;
}

function extractSource(archive, destination) {
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  run("tar", ["-xf", archive, "-C", destination]);
  const directories = readdirSync(destination, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(destination, entry.name));
  if (directories.length !== 1) {
    throw new Error(`expected one source root in ${archive}`);
  }
  return directories[0];
}

function compilerEnvironment(context, source, extra = {}) {
  const pathMappings = [
    [resolve(source), "/sagejs/native-source"],
    [resolve(context.paths.root), "/sagejs/toolchain"],
    [dirname(dirname(resolve(context.paths.fenvCompatibility))),
      "/sagejs/wasm-toolchain"],
  ];
  const maps = pathMappings.flatMap(([from, to]) => [
    `-ffile-prefix-map=${from}=${to}`,
    `-fdebug-prefix-map=${from}=${to}`,
    `-fmacro-prefix-map=${from}=${to}`,
  ]);
  const target = `--target=${context.lock.build.target}`;
  const sysroot = `--sysroot=${context.paths.sysroot}`;
  const targetPolicy = [
    target,
    sysroot,
    "-D__wasi__",
    "-D_WASI_EMULATED_SIGNAL",
    "-D_WASI_EMULATED_PROCESS_CLOCKS",
  ].join(" ");
  return {
    AR: context.paths.llvmAr,
    RANLIB: context.paths.llvmRanlib,
    STRIP: context.paths.llvmStrip,
    CC: `${context.paths.clang} ${targetPolicy}`,
    CXX: `${context.paths.clangxx} ${targetPolicy}`,
    CC_FOR_BUILD: "cc",
    CXX_FOR_BUILD: "c++",
    CFLAGS: [...context.lock.build.cFlags, ...maps].join(" "),
    CXXFLAGS: [...context.lock.build.cFlags, ...maps].join(" "),
    LDFLAGS: "-lwasi-emulated-signal",
    LC_ALL: "C",
    LANG: "C",
    TZ: "UTC",
    SOURCE_DATE_EPOCH: "1704067200",
    ...extra,
  };
}

function normalizeGeneratedMacro(filename, name, value) {
  const source = readFileSync(filename, "utf8");
  const expression = new RegExp(`^#define[ \\t]+${name}[ \\t]+.*$`, "gm");
  const matches = source.match(expression) ?? [];
  if (matches.length !== 1) {
    throw new Error(`${filename} must define ${name} exactly once`);
  }
  writeFileSync(filename, source.replace(expression, `#define ${name} ${JSON.stringify(value)}`));
}

function normalizeCompilerMetadata(context, filename, prefix) {
  const compiler = "clang --target=wasm32-wasip1 " +
    "--sysroot=/sagejs/toolchain/sdk/share/wasi-sysroot " +
    "-D__wasi__ -D_WASI_EMULATED_SIGNAL " +
    "-D_WASI_EMULATED_PROCESS_CLOCKS";
  normalizeGeneratedMacro(filename, `${prefix}_CC`, compiler);
  normalizeGeneratedMacro(
    filename,
    `${prefix}_CFLAGS`,
    context.lock.build.cFlags.join(" "),
  );
}

function buildTriplet() {
  const key = `${process.platform}-${process.arch}`;
  const triplets = {
    "linux-x64": "x86_64-pc-linux-gnu",
    "linux-arm64": "aarch64-unknown-linux-gnu",
    "darwin-x64": "x86_64-apple-darwin",
    "darwin-arm64": "aarch64-apple-darwin",
  };
  const triplet = triplets[key];
  if (!triplet) {
    throw new Error(`unsupported canonical builder platform ${key}`);
  }
  return triplet;
}

function configure(source, prefix, context, args, extra = {}) {
  const env = compilerEnvironment(context, source, extra);
  run(join(source, "configure"), [
    `--build=${buildTriplet()}`,
    "--host=wasm32-wasi",
    `--prefix=${prefix}`,
    ...args,
  ], { cwd: source, env });
  return env;
}

function makeInstall(source, context, env, makeArguments = []) {
  run("make", [`-j${context.lock.build.jobs}`, ...makeArguments], { cwd: source, env });
  run("make", ["install", ...makeArguments], { cwd: source, env });
}

function buildGmp(context, archive) {
  const source = extractSource(archive, join(context.work, "gmp-source"));
  const prefix = context.paths.libraries.gmp.prefix;
  rmSync(prefix, { recursive: true, force: true });
  const env = configure(source, prefix, context, [
    "--disable-assembly",
    "--disable-shared",
    "--enable-static",
    "--disable-cxx",
  ], { ABI: "standard" });
  const config = join(source, "config.h");
  const contents = readFileSync(config, "utf8").replace(
    "#define HAVE_OBSTACK_VPRINTF 1",
    "#define HAVE_OBSTACK_VPRINTF 0",
  );
  require("node:fs").writeFileSync(config, contents);
  makeInstall(source, context, env);
  normalizeCompilerMetadata(context, join(prefix, "include", "gmp.h"), "__GMP");
}

function buildMpfr(context, archive) {
  const source = extractSource(archive, join(context.work, "mpfr-source"));
  const prefix = context.paths.libraries.mpfr.prefix;
  const gmp = context.paths.libraries.gmp.prefix;
  rmSync(prefix, { recursive: true, force: true });
  const env = configure(source, prefix, context, [
    `--with-gmp=${gmp}`,
    "--disable-shared",
    "--enable-static",
    "--disable-thread-safe",
  ], {
    CPPFLAGS: `-I${join(gmp, "include")}`,
    LDFLAGS: `-L${join(gmp, "lib")} -lwasi-emulated-signal`,
  });
  makeInstall(source, context, env);
}

function buildMpc(context, archive) {
  const source = extractSource(archive, join(context.work, "mpc-source"));
  const prefix = context.paths.libraries.mpc.prefix;
  const gmp = context.paths.libraries.gmp.prefix;
  const mpfr = context.paths.libraries.mpfr.prefix;
  rmSync(prefix, { recursive: true, force: true });
  const env = configure(source, prefix, context, [
    `--with-gmp=${gmp}`,
    `--with-mpfr=${mpfr}`,
    "--disable-shared",
    "--enable-static",
  ], {
    CPPFLAGS: `-I${join(gmp, "include")} -I${join(mpfr, "include")}`,
    LDFLAGS: `-L${join(gmp, "lib")} -L${join(mpfr, "lib")} -lwasi-emulated-signal`,
  });
  makeInstall(source, context, env);
}

function buildFlint(context, archive) {
  const source = extractSource(archive, join(context.work, "flint-source"));
  const prefix = context.paths.libraries.flint.prefix;
  const gmp = context.paths.libraries.gmp.prefix;
  const mpfr = context.paths.libraries.mpfr.prefix;
  const compatibility = context.paths.fenvCompatibility;
  rmSync(prefix, { recursive: true, force: true });
  const base = compilerEnvironment(context, source);
  const env = configure(source, prefix, context, [
    `--with-gmp=${gmp}`,
    `--with-mpfr=${mpfr}`,
    "--disable-shared",
    "--enable-static",
    "--disable-pthread",
    "--disable-thread-safe",
    "--disable-assembly",
  ], {
    CPPFLAGS: `-I${join(gmp, "include")} -I${join(mpfr, "include")}`,
    CFLAGS: `${base.CFLAGS} -include ${compatibility}`,
    LDFLAGS: `-L${join(gmp, "lib")} -L${join(mpfr, "lib")} -lwasi-emulated-signal`,
    LD: context.paths.wasmLd,
  });
  makeInstall(source, context, env, [`LD=${context.paths.wasmLd}`]);
}

function buildM4ri(context, archive) {
  const source = extractSource(archive, join(context.work, "m4ri-source"));
  const prefix = context.paths.libraries.m4ri.prefix;
  rmSync(prefix, { recursive: true, force: true });
  const env = configure(source, prefix, context, [
    "--disable-shared",
    "--enable-static",
    "--disable-sse2",
    "--disable-png",
    "--with-cachesize=32768:262144:8388608",
  ]);
  makeInstall(source, context, env);
  normalizeCompilerMetadata(
    context,
    join(prefix, "include", "m4ri", "m4ri_config.h"),
    "__M4RI",
  );
}

function removeBuildMetadata(prefix) {
  for (const directory of [join(prefix, "lib"), join(prefix, "lib", "pkgconfig")]) {
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isFile() && (entry.name.endsWith(".la") || entry.name.endsWith(".pc"))) {
        rmSync(join(directory, entry.name), { force: true });
      }
    }
  }
}

function buildLibraries(context, archives) {
  buildGmp(context, archives.gmp);
  buildMpfr(context, archives.mpfr);
  buildMpc(context, archives.mpc);
  buildFlint(context, archives.flint);
  buildM4ri(context, archives.m4ri);
  for (const dependency of Object.values(context.paths.libraries)) {
    if (existsSync(dependency.prefix)) removeBuildMetadata(dependency.prefix);
  }
}

module.exports = {
  buildLibraries,
  compilerEnvironment,
  extractSource,
  normalizeGeneratedMacro,
  run,
  setCommandObserver,
  subprocessEnvironment,
};

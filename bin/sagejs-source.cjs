"use strict";

function load(mod) {
  return require("../dist/tools/" + mod);
}

const path = require("path");
const argv = load("cli").argv;

// Interactive input uses mathematics-friendly Sage syntax by default.  Program
// files follow their extension so `sagejs program.py` behaves like Python while
// `sagejs program.sage` enables Sage preparsing.  The executable name and
// explicit language flags take precedence over extension inference.
const executable = process.env.SAGEJS_EXECUTABLE_NAME || path.basename(process.argv[1]);
let sageMode = executable !== "sagepython";
const explicitLanguageMode =
  argv.python ||
  argv.sage ||
  argv.magma ||
  argv.macaulay2 ||
  argv.m2 ||
  argv.maple ||
  argv.matlab ||
  argv.wolfram ||
  argv.mathematica;
if (
  !explicitLanguageMode &&
  argv.files.length > 0 &&
  argv.files.every((filename) => path.extname(filename).toLowerCase() === ".py")
) {
  sageMode = false;
}
if (argv.python) sageMode = false;
if (argv.sage) sageMode = true;
if (
  argv.magma || argv.macaulay2 || argv.m2 || argv.maple || argv.matlab ||
  argv.wolfram || argv.mathematica
) sageMode = true;
argv.sage = sageMode;

if (argv.install_jupyter_kernel) {
  const installArguments = ["--mode", argv.jupyter_kernel_mode];
  if (argv.user) installArguments.push("--user");
  if (argv.sys_prefix) installArguments.push("--sys-prefix");
  if (argv.prefix) installArguments.push("--prefix", argv.prefix);
  load("jupyter-kernel").installKernelSpec(
    argv.jupyter_kernel_mode,
    installArguments,
  );
  process.exit(0);
}

const basePath = path.resolve(
  argv.base_path
    ? argv.base_path
    : path.normalize(path.join(path.dirname(module.filename), ".."))
);
const srcPath = path.join(basePath, "src");
const compilerPath = path.join(basePath, "dist", "compiler");

if (argv.mode === "self") {
  if (argv.files.length > 0) {
    console.error("WARN: Ignoring input files since --self was passed");
  }
  load("self")(
    basePath,
    srcPath,
    compilerPath,
    argv.complete,
    argv.profile
  ).then(() => {
    if (argv.test) {
      console.log("\nRunning test suite...\n");
      argv.files = [];
      return load("test").default(argv, basePath, srcPath, compilerPath);
    }
  }).catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
} else if (argv.mode === "test") {
  load("test").default(argv, basePath, srcPath, compilerPath).catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
} else if (argv.mode === "lint") {
  load("lint").cli(argv, basePath, srcPath, compilerPath).catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
} else if (argv.mode === "repl") {
  load("repl").default({
    show_js: !argv.no_js,
    sage: sageMode,
    magma: !!argv.magma,
    macaulay2: !!argv.macaulay2,
    m2: !!argv.m2,
    maple: !!argv.maple,
    matlab: !!argv.matlab,
    wolfram: !!argv.wolfram,
    mathematica: !!argv.mathematica,
    emitSage: !!argv.emit_sage,
    tokens: argv.tokens,
  });
} else if (argv.mode === "msgfmt") {
  load("msgfmt").cli(argv, basePath, srcPath, compilerPath);
} else if (argv.mode === "docs") {
  load("docs").runDocumentationCli(argv, basePath).catch((error) => {
    console.error(error?.message ?? String(error));
    process.exitCode = 1;
  });
} else if (argv.mode === "compile") {
  load("compile").default({ argv, src_path: srcPath, lib_path: compilerPath });
} else {
  throw Error(`unknown mode "${argv.mode}"`);
}

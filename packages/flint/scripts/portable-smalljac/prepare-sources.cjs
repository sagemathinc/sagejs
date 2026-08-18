"use strict";

const {
  copyFileSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const packageRoot = resolve(__dirname, "..", "..");

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_CEILING_DIRECTORIES: packageRoot },
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout}${result.stderr}`,
    );
  }
}

function normalize(path) {
  writeFileSync(path, readFileSync(path, "utf8").replace(/\r\n/g, "\n"));
}

function fixedWidthWindowsSource(contents) {
  return contents
    .replace(/\bunsigned\s+long\b/g, "uint64_t")
    .replace(/\blong\b/g, "int64_t")
    .replace(/\bULONG_MAX\b/g, "UINT64_MAX")
    .replace(/\bLONG_MAX\b/g, "INT64_MAX")
    .replace(/\bLONG_MIN\b/g, "INT64_MIN")
    .replace(/\b([0-9]+|0[xX][0-9a-fA-F]+)UL\b/g, "$1ULL")
    .replace(/\b([0-9]+|0[xX][0-9a-fA-F]+)L\b/g, "$1LL")
    .replace(/%lu/g, "%llu")
    .replace(/%ld/g, "%lld")
    .replace(/%lx/g, "%llx")
    .replace(/%lX/g, "%llX")
    .replace(/\batol\s*\(/g, "sagejs_ffpoly_atol64(")
    .replace(/\brandom\s*\(/g, "sagejs_ffpoly_random64(")
    .replace(/#include <unistd\.h>/g, [
      "#if !defined(_WIN32)",
      "#include <unistd.h>",
      "#endif",
    ].join("\n"));
}

function transformDirectory(directory) {
  for (const name of readdirSync(directory)) {
    if (!/\.[ch]$/.test(name) || name === "sagejs_ffpoly_word.h") continue;
    const path = join(directory, name);
    normalize(path);
    const transformed = fixedWidthWindowsSource(readFileSync(path, "utf8"));
    writeFileSync(
      path,
      name.endsWith(".c") ? `#include <stdint.h>\n${transformed}` : transformed,
    );
  }
}

function prepareSources(ffpolySource, smalljacSource, options = {}) {
  normalize(join(ffpolySource, "cstd.h"));
  normalize(join(smalljacSource, "cstd.h"));
  copyFileSync(
    join(__dirname, "sagejs_ffpoly_word.h"),
    join(ffpolySource, "sagejs_ffpoly_word.h"),
  );
  run(
    "git",
    ["apply", "--whitespace=nowarn", join(packageRoot, "patches", "ffpoly-portability.patch")],
    ffpolySource,
  );
  run(
    "git",
    ["apply", "--whitespace=nowarn", join(packageRoot, "patches", "smalljac-portability.patch")],
    smalljacSource,
  );
  if (options.windows) {
    transformDirectory(ffpolySource);
    transformDirectory(smalljacSource);
  }
}

if (require.main === module) {
  const [, , ffpolySource, smalljacSource, ...flags] = process.argv;
  if (!ffpolySource || !smalljacSource) {
    throw new Error(
      "usage: node prepare-sources.cjs FFPOLY_SOURCE SMALLJAC_SOURCE [--windows]",
    );
  }
  prepareSources(resolve(ffpolySource), resolve(smalljacSource), {
    windows: flags.includes("--windows"),
  });
}

module.exports = { fixedWidthWindowsSource, prepareSources };

#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const packageRoot = resolve(__dirname, "..");
const repositoryRoot = resolve(packageRoot, "..", "..");
const { prepareSources } = require(
  "../../flint/scripts/portable-smalljac/prepare-sources.cjs"
);

const ffpolySources = Object.freeze([
  ["cstd.c", "cstd.o"],
  ["ff.c", "ff.o"],
  ["ff2k.c", "ff2k.o"],
  ["ffext.c", "ffext.o"],
  ["ffpoly.c", "ffpoly_small.o"],
  ["ffpolyfromroots.c", "ffpolyfromroots.o"],
  ["ffpolysmall.c", "ffpolysmall.o"],
  ["polyparse.c", "polyparse.o"],
]);

const smalljacSources = Object.freeze([
  "ecurve.c",
  "ecurve_ladic.c",
  "ecurve_ff2.c",
  "hcpoly.c",
  "hecurve.c",
  "hecurve1.c",
  "hecurve2_ladic.c",
  "hecurve2.c",
  "igusa.c",
  "jac.c",
  "jacorder.c",
  "jacstructure.c",
  "nfpoly.c",
  "pointcount.c",
  "prime.c",
  "smalljac.c",
  "smalljac_special.c",
  "smalljactab.c",
  "smalljac_g23.c",
  "smalljac_tiny.c",
  "mpzpolyutil.c",
  "mpzutil.c",
  "polyparse.c",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function run(command, args, options = {}) {
  process.stdout.write(`+ ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: options.capture ? "utf8" : undefined,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} exited with status ${result.status ?? "unknown"}` +
        (options.capture ? `\n${result.stdout}${result.stderr}` : ""),
    );
  }
  return result.stdout;
}

async function download(dependency, destination) {
  const configured = process.env[dependency.archiveEnvironment];
  if (configured) {
    copyFileSync(resolve(configured), destination);
  } else {
    let lastError;
    for (const url of [dependency.url, ...(dependency.mirrors ?? [])]) {
      try {
        const response = await fetch(url, { redirect: "follow" });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
        lastError = undefined;
        break;
      } catch (error) {
        lastError = new Error(`unable to download ${url}: ${error.message}`);
      }
    }
    if (lastError) throw lastError;
  }
  const actual = sha256(readFileSync(destination));
  if (actual !== dependency.sourceSha256) {
    throw new Error(
      `${dependency.version} source digest ${actual} != ${dependency.sourceSha256}`,
    );
  }
}

function extractedDirectory(root, archive) {
  run("tar", ["-xf", archive, "-C", root]);
  const directories = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name));
  if (directories.length !== 1) {
    throw new Error(`expected one top-level source directory in ${archive}`);
  }
  return directories[0];
}

function reproducibleSourceFlags(sourceRoot) {
  const source = resolve(sourceRoot);
  const canonical = "/sagejs/native-source";
  return [
    `-ffile-prefix-map=${source}=${canonical}`,
    `-fdebug-prefix-map=${source}=${canonical}`,
    `-fmacro-prefix-map=${source}=${canonical}`,
  ];
}

function compileArchive({
  clang,
  llvmAr,
  sysroot,
  sourceRoot,
  objects,
  archive,
  includes,
}) {
  const objectRoot = join(sourceRoot, ".sagejs-wasm-objects");
  mkdirSync(objectRoot, { recursive: true });
  const outputs = [];
  for (const entry of objects) {
    const sourceName = Array.isArray(entry) ? entry[0] : entry;
    const objectName = Array.isArray(entry)
      ? entry[1]
      : `${basename(sourceName, ".c")}.o`;
    const output = join(objectRoot, objectName);
    run(clang, [
      "--target=wasm32-wasip1",
      `--sysroot=${sysroot}`,
      "-O2",
      "-fomit-frame-pointer",
      "-fvisibility=hidden",
      "-std=gnu99",
      "-DSAGEJS_FFPOLY_PORTABLE=1",
      ...reproducibleSourceFlags(sourceRoot),
      ...includes.flatMap((directory) => ["-I", directory]),
      "-c",
      join(sourceRoot, sourceName),
      "-o",
      output,
    ]);
    outputs.push(output);
  }
  mkdirSync(resolve(archive, ".."), { recursive: true });
  run(llvmAr, ["rcs", archive, ...outputs]);
}

function installHeaders(source, destination, { nested = false } = {}) {
  const include = nested ? join(destination, "include", "ff_poly") : join(destination, "include");
  mkdirSync(include, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".h")) {
      copyFileSync(join(source, entry.name), join(include, entry.name));
    }
  }
  if (nested) copyFileSync(join(source, "ff_poly.h"), join(destination, "include", "ff_poly.h"));
}

async function buildSmalljacToolchain(cowasmRoot, lock) {
  const ffpoly = lock.libraries.ffpoly;
  const smalljac = lock.libraries.smalljac;
  if (ffpoly?.recipe !== "sagejs-portable-smalljac" ||
      smalljac?.recipe !== "sagejs-portable-smalljac") {
    throw new Error("the toolchain lock lacks the portable ffpoly/smalljac recipes");
  }
  const sdk = join(
    cowasmRoot,
    "core", "build", "build", "wasi-sdk", "dist", "wasi-sdk-next", "native",
  );
  const clang = join(sdk, "bin", "clang");
  const llvmAr = join(sdk, "bin", "llvm-ar");
  const sysroot = join(sdk, "share", "wasi-sysroot");
  const gmpPrefix = join(cowasmRoot, ...lock.libraries.gmp.prefix.split("/"));
  const ffpolyPrefix = join(cowasmRoot, ...ffpoly.prefix.split("/"));
  const smalljacPrefix = join(cowasmRoot, ...smalljac.prefix.split("/"));
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-wasm-smalljac-"));
  try {
    const ffpolyArchive = join(temporary, "ffpoly.tar");
    const smalljacArchive = join(temporary, "smalljac.tar");
    await download(ffpoly, ffpolyArchive);
    await download(smalljac, smalljacArchive);
    const ffpolyExtract = join(temporary, "ffpoly-source");
    const smalljacExtract = join(temporary, "smalljac-source");
    mkdirSync(ffpolyExtract);
    mkdirSync(smalljacExtract);
    const ffpolySource = extractedDirectory(ffpolyExtract, ffpolyArchive);
    const smalljacSource = extractedDirectory(smalljacExtract, smalljacArchive);
    prepareSources(ffpolySource, smalljacSource, { windows: true });

    rmSync(ffpolyPrefix, { recursive: true, force: true });
    rmSync(smalljacPrefix, { recursive: true, force: true });
    const ffpolyLibrary = join(ffpolyPrefix, "lib", ffpoly.archiveName);
    const smalljacLibrary = join(smalljacPrefix, "lib", smalljac.archiveName);
    compileArchive({
      clang,
      llvmAr,
      sysroot,
      sourceRoot: ffpolySource,
      objects: ffpolySources,
      archive: ffpolyLibrary,
      includes: [ffpolySource, join(gmpPrefix, "include")],
    });
    installHeaders(ffpolySource, ffpolyPrefix, { nested: true });
    compileArchive({
      clang,
      llvmAr,
      sysroot,
      sourceRoot: smalljacSource,
      objects: smalljacSources,
      archive: smalljacLibrary,
      includes: [
        smalljacSource,
        join(ffpolyPrefix, "include"),
        join(gmpPrefix, "include"),
      ],
    });
    mkdirSync(join(smalljacPrefix, "include"), { recursive: true });
    copyFileSync(
      join(smalljacSource, "smalljac.h"),
      join(smalljacPrefix, "include", "smalljac.h"),
    );
    for (const [dependency, prefix, archive] of [
      [ffpoly, ffpolyPrefix, ffpolyLibrary],
      [smalljac, smalljacPrefix, smalljacLibrary],
    ]) {
      writeFileSync(join(prefix, ".sagejs-portable-wasm.json"), `${JSON.stringify({
        schema: "sagejs.portable-smalljac-wasm/v1",
        version: dependency.version,
        sourceSha256: dependency.sourceSha256,
        archiveSha256: sha256(readFileSync(archive)),
      }, null, 2)}\n`);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const cowasmRoot = process.argv[2];
  if (!cowasmRoot) throw new Error("usage: build-smalljac-toolchain.cjs COWASM_ROOT");
  const lock = JSON.parse(readFileSync(join(packageRoot, "toolchain", "lock.json"), "utf8"));
  buildSmalljacToolchain(resolve(cowasmRoot), lock).catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildSmalljacToolchain,
  ffpolySources,
  reproducibleSourceFlags,
  smalljacSources,
};

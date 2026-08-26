"use strict";

const { createHash } = require("node:crypto");
const {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { basename, join, resolve } = require("node:path");
const { prepareSources } = require(
  "../../flint/scripts/portable-smalljac/prepare-sources.cjs"
);
const { extractSource, run } = require("./libraries.cjs");

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

function reproduciblePathFlags(sourceRoot, destination) {
  const source = resolve(sourceRoot);
  return [
    `-ffile-prefix-map=${source}=${destination}`,
    `-fdebug-prefix-map=${source}=${destination}`,
    `-fmacro-prefix-map=${source}=${destination}`,
  ];
}

function reproducibleSourceFlags(sourceRoot) {
  return reproduciblePathFlags(sourceRoot, "/sagejs/native-source");
}

function compileArchive({ context, sourceRoot, objects, archive, includes }) {
  const objectRoot = join(sourceRoot, ".sagejs-wasm-objects");
  mkdirSync(objectRoot, { recursive: true });
  const outputs = [];
  for (const entry of objects) {
    const sourceName = Array.isArray(entry) ? entry[0] : entry;
    const objectName = Array.isArray(entry)
      ? entry[1]
      : `${basename(sourceName, ".c")}.o`;
    const output = join(objectRoot, objectName);
    run(context.paths.clang, [
      `--target=${context.lock.build.target}`,
      `--sysroot=${context.paths.sysroot}`,
      "-O2",
      "-fomit-frame-pointer",
      "-fvisibility=hidden",
      "-std=gnu99",
      "-DSAGEJS_FFPOLY_PORTABLE=1",
      ...reproducibleSourceFlags(sourceRoot),
      ...reproduciblePathFlags(context.paths.root, "/sagejs/toolchain"),
      ...includes.flatMap((directory) => ["-I", directory]),
      "-c",
      join(sourceRoot, sourceName),
      "-o",
      output,
    ]);
    outputs.push(output);
  }
  mkdirSync(resolve(archive, ".."), { recursive: true });
  run(context.paths.llvmAr, ["rcsD", archive, ...outputs]);
}

function installHeaders(source, destination, { nested = false } = {}) {
  const include = nested
    ? join(destination, "include", "ff_poly")
    : join(destination, "include");
  mkdirSync(include, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".h")) {
      copyFileSync(join(source, entry.name), join(include, entry.name));
    }
  }
  if (nested) {
    copyFileSync(join(source, "ff_poly.h"), join(destination, "include", "ff_poly.h"));
  }
}

function buildSmalljac(context, archives) {
  const ffpolySource = extractSource(archives.ffpoly, join(context.work, "ffpoly-source"));
  const smalljacSource = extractSource(archives.smalljac, join(context.work, "smalljac-source"));
  prepareSources(ffpolySource, smalljacSource, { windows: true });

  const gmpPrefix = context.paths.libraries.gmp.prefix;
  const ffpolyPrefix = context.paths.libraries.ffpoly.prefix;
  const smalljacPrefix = context.paths.libraries.smalljac.prefix;
  rmSync(ffpolyPrefix, { recursive: true, force: true });
  rmSync(smalljacPrefix, { recursive: true, force: true });
  const ffpolyArchive = join(ffpolyPrefix, "lib", context.lock.libraries.ffpoly.archiveName);
  const smalljacArchive = join(
    smalljacPrefix,
    "lib",
    context.lock.libraries.smalljac.archiveName,
  );
  compileArchive({
    context,
    sourceRoot: ffpolySource,
    objects: ffpolySources,
    archive: ffpolyArchive,
    includes: [ffpolySource, join(gmpPrefix, "include")],
  });
  installHeaders(ffpolySource, ffpolyPrefix, { nested: true });
  compileArchive({
    context,
    sourceRoot: smalljacSource,
    objects: smalljacSources,
    archive: smalljacArchive,
    includes: [smalljacSource, join(ffpolyPrefix, "include"), join(gmpPrefix, "include")],
  });
  mkdirSync(join(smalljacPrefix, "include"), { recursive: true });
  copyFileSync(
    join(smalljacSource, "smalljac.h"),
    join(smalljacPrefix, "include", "smalljac.h"),
  );
  for (const [name, archive] of [["ffpoly", ffpolyArchive], ["smalljac", smalljacArchive]]) {
    const dependency = context.lock.libraries[name];
    writeFileSync(join(context.paths.libraries[name].prefix, ".sagejs-portable-wasm.json"), `${JSON.stringify({
      schema: "sagejs.portable-smalljac-wasm/v2",
      version: dependency.version,
      sourceSha256: context.sources[name].sha256,
      archiveSha256: sha256(readFileSync(archive)),
    }, null, 2)}\n`);
  }
}

module.exports = {
  buildSmalljac,
  ffpolySources,
  reproduciblePathFlags,
  reproducibleSourceFlags,
  smalljacSources,
};

"use strict";

const {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { join, relative } = require("node:path");
const { Script } = require("node:vm");

const root = join(__dirname, "..");
const outputDirectory = join(root, "dist", "runtime-cache");

function cacheScript(source, filename, outputFilename) {
  const script = new Script(source, {
    filename,
    produceCachedData: true,
  });
  const cachedData = script.createCachedData();
  writeFileSync(outputFilename, cachedData);
  return cachedData.length;
}

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

const compilerFilename = join(root, "dist", "compiler", "compiler.js");
const compilerSource = readFileSync(compilerFilename, "utf8");
const compilerCacheSize = cacheScript(
  compilerSource,
  relative(root, compilerFilename),
  join(outputDirectory, "compiler.bin"),
);

// This import now consumes the compiler cache written immediately above.
const createCompiler = require("../dist/tools/compiler.js").default;
const {
  generateRuntimeBootstrapSource,
  runtimeBootstrapFilename,
} = require("../dist/tools/runtime-bootstrap.js");
const compiler = createCompiler();
const runtimeCaches = {};
for (const mode of ["sage", "python"]) {
  const source = generateRuntimeBootstrapSource(compiler, mode);
  const sourceFilename = join(
    outputDirectory,
    `runtime-bootstrap-${mode}.js`,
  );
  writeFileSync(sourceFilename, source);
  runtimeCaches[mode] = cacheScript(
    source,
    runtimeBootstrapFilename(mode),
    join(outputDirectory, `runtime-bootstrap-${mode}.bin`),
  );
}

writeFileSync(
  join(outputDirectory, "manifest.json"),
  `${JSON.stringify(
    {
      node: process.versions.node,
      v8: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
      compilerCacheSize,
      runtimeCaches,
    },
    null,
    2,
  )}\n`,
);

console.log(
  `Cached compiler and Sage/Python runtimes for Node ${process.versions.node} ` +
    `(${process.platform}-${process.arch})`,
);

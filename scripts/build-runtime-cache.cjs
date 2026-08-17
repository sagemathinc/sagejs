"use strict";

const {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { join } = require("node:path");
const { Script } = require("node:vm");

const root = join(__dirname, "..");
const outputDirectory = join("dist", "runtime-cache");

function cacheScript(source, filename, outputFilename) {
  const script = new Script(source, {
    filename,
    produceCachedData: true,
  });
  const cachedData = script.createCachedData();
  writeFileSync(outputFilename, cachedData);
  return cachedData.length;
}

async function main() {
process.chdir(root);
rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

const compilerFilename = join("dist", "compiler", "compiler.js");
const compilerSource = readFileSync(compilerFilename, "utf8");
const compilerCacheSize = cacheScript(
  compilerSource,
  compilerFilename,
  join(outputDirectory, "compiler.bin"),
);

// This import now consumes the compiler cache written immediately above.
const createCompiler = require("../dist/tools/compiler.js").default;
const {
  generateRuntimeBootstrapSource,
  runtimeBootstrapFilename,
} = require("../dist/tools/runtime-bootstrap.js");
const { createPythonCompilerFrontend } = require(
  "../dist/tools/python/compiler-frontend.js"
);
const compiler = createCompiler();
const runtimeCaches = {};
for (const mode of ["sage", "python"]) {
  const frontend = await createPythonCompilerFrontend(compiler, mode);
  const source = generateRuntimeBootstrapSource(compiler, mode, frontend);
  frontend.close();
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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

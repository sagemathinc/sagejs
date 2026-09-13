"use strict";

// Reference-only merge evidence: replay a reviewed committed catalog through
// the production generator. This does not load or qualify a Sage runtime.
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const { join, resolve } = require("node:path");
const esbuild = require("esbuild");

const root = resolve(__dirname, "../..");
const mainParent = "02a683d213072c3129da1f71e2aa47de447cfc4a";
const prParent = "419a10fb1f34c6ade3fa41061fd6143bfe51f875";

async function main() {
  for (const parent of [mainParent, prParent]) {
    execFileSync("git", ["merge-base", "--is-ancestor", parent, "HEAD"], { cwd: root });
  }
  const referencePath = "website/reference-data.json";
  const current = JSON.parse(readFileSync(join(root, referencePath), "utf8"));
  const mainReference = JSON.parse(execFileSync("git", [
    "show", `${mainParent}:${referencePath}`,
  ], { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }));
  assert.deepEqual(current.docs, mainReference.docs, "retain the exact current-main catalog");

  const documentationPath = join(root, "tools/documentation.ts");
  const documentation = new Module(documentationPath, module);
  documentation.paths = module.paths;
  documentation._compile(esbuild.transformSync(readFileSync(documentationPath, "utf8"), {
    loader: "ts", format: "cjs", target: "es2022",
  }).code, documentationPath);

  const generatorPath = join(root, "scripts/generate-docs.cjs");
  const generatorSource = readFileSync(generatorPath, "utf8");
  const entrypoint = generatorSource.lastIndexOf("main().catch(");
  assert.ok(entrypoint > 0, "production generator entrypoint must remain identifiable");
  const generator = new Module(generatorPath, module);
  generator.paths = module.paths;
  generator.require = name => {
    if (name === "../dist/tools/kernel.js") {
      return { createSage: async () => ({
        documentation: async () => current.docs,
        close: async () => {},
      }) };
    }
    if (name === "../dist/tools/documentation.js") return documentation.exports;
    return Module.createRequire(generatorPath)(name);
  };
  const previousArgv = process.argv;
  process.argv = [process.execPath, generatorPath, "--check"];
  try {
    generator._compile(generatorSource.slice(0, entrypoint) + "module.exports = main;\n", generatorPath);
    await generator.exports();
    assert.notEqual(process.exitCode, 1, "production generator check must pass");
  } finally {
    process.argv = previousArgv;
  }
  console.log(`Committed-catalog replay passed: ${current.docs.entries.length} exact main entries, current source coordinates, and production asset hashes. No fresh runtime validation.`);

  const testPath = join(root, "test/documentation.cjs");
  const tests = new Module(testPath, module);
  tests.paths = module.paths;
  tests.require = name => name === "../dist/tools/documentation.js"
    ? documentation.exports : Module.createRequire(testPath)(name);
  tests._compile(readFileSync(testPath, "utf8"), testPath);
  require(join(root, "test/reference-examples.cjs"));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { Script } = require("node:vm");

const root = join(__dirname, "..");
const cacheDirectory = join(root, "dist", "runtime-cache");
const manifest = JSON.parse(
  readFileSync(join(cacheDirectory, "manifest.json"), "utf8"),
);

assert.equal(manifest.node, process.versions.node);
assert.equal(manifest.v8, process.versions.v8);
assert.equal(manifest.platform, process.platform);
assert.equal(manifest.arch, process.arch);

function acceptsCache(sourceFilename, cacheFilename, scriptFilename) {
  const source = readFileSync(sourceFilename, "utf8");
  const cachedData = readFileSync(cacheFilename);
  const script = new Script(source, {
    filename: scriptFilename,
    cachedData,
  });
  assert.equal(script.cachedDataRejected, false);

  // A stale or incompatible cache must be rejected without affecting source
  // compilation. This is the fallback used by npm installs on another V8.
  const stale = new Script(`${source}\n`, {
    filename: scriptFilename,
    cachedData,
  });
  assert.equal(stale.cachedDataRejected, true);
}

acceptsCache(
  join(root, "dist", "compiler", "compiler.js"),
  join(cacheDirectory, "compiler.bin"),
  "dist/compiler/compiler.js",
);
for (const mode of ["sage", "python"]) {
  acceptsCache(
    join(cacheDirectory, `runtime-bootstrap-${mode}.js`),
    join(cacheDirectory, `runtime-bootstrap-${mode}.bin`),
    `sagejs/runtime-bootstrap-${mode}.js`,
  );
}

assert.deepEqual(
  readFileSync(join(cacheDirectory, "runtime-bootstrap-sage.js")),
  readFileSync(join(cacheDirectory, "runtime-bootstrap-python.js")),
  "the SEA stores one shared runtime bootstrap source",
);

console.log("Compiler and runtime V8 caches passed.");

"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { Script } = require("node:vm");

const {
  CODE_CACHE_DIAGNOSTICS_ENV,
  codeCacheDiagnostics,
  observeCodeCache,
} = require("../dist/tools/code-cache.js");

const root = join(__dirname, "..");
const cacheDirectory = join(root, "dist", "runtime-cache");
const manifest = JSON.parse(
  readFileSync(join(cacheDirectory, "manifest.json"), "utf8"),
);

assert.equal(manifest.node, process.versions.node);
assert.equal(manifest.v8, process.versions.v8);
assert.equal(manifest.platform, process.platform);
assert.equal(manifest.arch, process.arch);

function acceptsCache(sourceFilename, cacheFilename, scriptFilename, component) {
  const source = readFileSync(sourceFilename, "utf8");
  const cachedData = readFileSync(cacheFilename);
  const script = new Script(source, {
    filename: scriptFilename,
    cachedData,
  });
  assert.equal(script.cachedDataRejected, false);
  assert.equal(
    observeCodeCache(script, component, {
      environment: { [CODE_CACHE_DIAGNOSTICS_ENV]: "error" },
    }),
    false,
  );

  // A stale or incompatible cache must be rejected without affecting source
  // compilation. This is the fallback used by npm installs on another V8.
  const stale = new Script(`${source}\n`, {
    filename: scriptFilename,
    cachedData,
  });
  assert.equal(stale.cachedDataRejected, true);
  assert.throws(
    () =>
      observeCodeCache(stale, component, {
        environment: { [CODE_CACHE_DIAGNOSTICS_ENV]: "error" },
      }),
    new RegExp(`code cache rejected: ${component.replace(/[()]/g, "\\$&")}`),
  );
}

assert.equal(codeCacheDiagnostics({}), "off");
assert.equal(
  codeCacheDiagnostics({ [CODE_CACHE_DIAGNOSTICS_ENV]: "warn" }),
  "warn",
);
assert.throws(
  () => codeCacheDiagnostics({ [CODE_CACHE_DIAGNOSTICS_ENV]: "maybe" }),
  /must be off, warn, or error/,
);

acceptsCache(
  join(root, "dist", "compiler", "compiler.js"),
  join(cacheDirectory, "compiler.bin"),
  "dist/compiler/compiler.js",
  "compiler",
);
for (const mode of ["sage", "python"]) {
  acceptsCache(
    join(cacheDirectory, `runtime-bootstrap-${mode}.js`),
    join(cacheDirectory, `runtime-bootstrap-${mode}.bin`),
    `sagejs/runtime-bootstrap-${mode}.js`,
    `runtime bootstrap (${mode})`,
  );
}

// Lazy modules use the same observer before rebuilding their rejected local
// bytecode cache. Exercise that named path independently so a future refactor
// cannot make release measurements silently accept it.
assert.throws(
  () =>
    observeCodeCache({ cachedDataRejected: true }, "lazy module mpmath", {
      environment: { [CODE_CACHE_DIAGNOSTICS_ENV]: "error" },
    }),
  /code cache rejected: lazy module mpmath/,
);

console.log("Compiler and runtime V8 caches passed.");

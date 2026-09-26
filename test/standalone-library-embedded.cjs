// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const filename = join(root, "tools", "standalone-library.cjs");
const library = require(filename);
const embedded = library.embeddedStandaloneLibrarySnapshot();

test("embedded standalone module lists do not read Python source at SEA startup", () => {
  const script = `
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const readFileSync = fs.readFileSync;
    fs.readFileSync = (filename, ...options) => {
      if (typeof filename === "string" && filename.endsWith(".py")) {
        throw new Error("SEA startup read external Python source: " + filename);
      }
      return readFileSync(filename, ...options);
    };
    globalThis.__sagejs_embedded_standalone_library__ = ${JSON.stringify(embedded)};
    const library = require(${JSON.stringify(filename)});
    for (const [name, exported] of Object.entries({
      builtins: "BUILTINS_STANDALONE_MODULES",
      core: "CORE_STANDALONE_MODULES",
      matrix: "MATRIX_STANDALONE_MODULES",
      extension: "EXTENSION_STANDALONE_MODULES",
      baselib: "BASELIB_STANDALONE_MODULES",
      cache: "BASELIB_STANDALONE_CACHE_MODULES",
    })) {
      assert.deepEqual(library[exported], globalThis.__sagejs_embedded_standalone_library__[name]);
    }
  `;
  const result = spawnSync(process.execPath, ["-"], {
    cwd: root,
    encoding: "utf8",
    input: script,
    timeout: 30_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

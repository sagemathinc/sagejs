"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const test = require("node:test");
const { buildBrowserStandardLibrary } = require("../scripts/browser-python-resources.cjs");

test("browser source assembly preserves module records and rejects missing/stale required source", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-browser-python-"));
  try {
    const sourceDirectory = path.join(directory, "lib");
    const cacheDirectory = path.join(directory, "cache");
    fs.mkdirSync(path.join(sourceDirectory, "example"), { recursive: true });
    fs.mkdirSync(cacheDirectory);
    const source = "answer = 42\n";
    const cache = { signature: createHash("sha1").update(source).digest("hex"), javascript: "answer = 42;" };
    const sourcePath = path.join(sourceDirectory, "example/__init__.py");
    const cachePath = path.join(cacheDirectory, "example.json");
    fs.writeFileSync(sourcePath, source);
    fs.writeFileSync(cachePath, JSON.stringify(cache));
    const output = path.join(directory, "stdlib.json");
    const options = { sourceDirectory, cacheDirectory, requiredModules: ["example"], output };
    assert.deepEqual(buildBrowserStandardLibrary(options), [sourcePath, cachePath]);
    assert.deepEqual(JSON.parse(fs.readFileSync(output)), {
      modules: { example: { package: true, source, cache } }, preload: ["example"],
    });
    assert.throws(() => buildBrowserStandardLibrary({ ...options, requiredModules: ["missing"] }), /missing/);
    fs.writeFileSync(sourcePath, source + "# changed\n");
    assert.throws(() => buildBrowserStandardLibrary(options), /stale/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

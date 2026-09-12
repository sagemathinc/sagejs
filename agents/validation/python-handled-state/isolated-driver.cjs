"use strict";
// Reviewed followup: one creation case per fresh process, no forced GC.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const sha = filename => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const [filenameArgument, name] = process.argv.slice(2);
assert.ok(["plain_create", "owned_create"].includes(name));
const filename = path.resolve(filenameArgument);
const identity = JSON.parse(fs.readFileSync(path.join(path.dirname(filename), "identity.json")));
const artifact = identity.artifacts.find(item => item.filename === path.basename(filename));
assert.ok(artifact);
assert.equal(sha(filename), artifact.sha256);
assert.equal(sha(path.join(__dirname, "driver.cjs")), identity.driverSha256);
assert.equal(sha(path.join(__dirname, "fixture.py")), identity.fixtureSha256);
const compiled = new Module(filename, module);
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(fs.readFileSync(filename, "utf8") + '\nmodule.exports = ρσ_modules["__main__"];\n', filename);
const api = compiled.exports;
assert.equal(api.correctness(), true);
const n = 20000;
const samples = [];
for (let iteration = 0; iteration < 10; iteration++) {
  const heapBefore = process.memoryUsage().heapUsed;
  const begin = process.hrtime.bigint();
  const result = api[name](n);
  const seconds = Number(process.hrtime.bigint() - begin) / 1e9;
  const heapAfter = process.memoryUsage().heapUsed;
  assert.equal(result.length, n);
  api.validate_created(result);
  samples.push({ iteration, warmup: iteration < 3, seconds, heapBefore, heapAfter });
}
console.log(JSON.stringify({ schema: "sagejs.handled-state-isolated-cost/v1", node: process.version,
  nodeSha256: sha(process.execPath), artifact, fixtureSha256: identity.fixtureSha256,
  mixedDriverSha256: identity.driverSha256, driverSha256: sha(__filename), correctness: true,
  name, n, samples }));

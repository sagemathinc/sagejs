// sagejs-test-tier: integration
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {spawnSync} = require("node:child_process");
const {resolve} = require("node:path");
const {readFileSync} = require("node:fs");

for (const name of ["extension-geometry", "extension-zero-dimensional"]) {
  test(name, {timeout: 300000}, () => {
    const result = spawnSync(process.execPath,
      [resolve(__dirname, "../bin/sagejs"), resolve(__dirname, name + ".py")], {
        env: {...process.env, SAGEJS_NATIVE_DISABLE: "1"}, timeout: 295000, encoding: "utf8",
      });
    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    assert.match(result.stdout, /finite-extension .* passed/);
  });
}

test("extension geometry matches independent Sage fixtures", {timeout: 300000}, () => {
  const fixtures = require("./fixtures/extension-geometry-sage-oracles-v1.json");
  assert.equal(fixtures.schema, "sagejs.extension-geometry-sage-oracles/v1");
  const source = "import json\n_extension_geometry_cases = json.loads(" +
    JSON.stringify(JSON.stringify(fixtures.cases)) + ")\n" +
    readFileSync(resolve(__dirname, "extension-geometry-oracles.py"), "utf8");
  const result = spawnSync(process.execPath, [resolve(__dirname, "../bin/sagejs")], {
    env: {...process.env, SAGEJS_NATIVE_DISABLE: "1"}, timeout: 295000,
    input: source, encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  assert.match(result.stdout, /finite-extension geometry matches independent Sage fixtures passed/);
});

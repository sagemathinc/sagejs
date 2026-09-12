// sagejs-test-tier: integration
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {spawnSync} = require("node:child_process");
const {resolve} = require("node:path");
const {readFileSync} = require("node:fs");

function run(source, marker) {
  const result = spawnSync(process.execPath, [resolve(__dirname, "../bin/sagejs")], {
    env: {...process.env, SAGEJS_NATIVE_DISABLE: "1"}, timeout: 235000,
    input: source, encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  assert.match(result.stdout, marker);
}

test("public extension ideals preserve proof, certificates, and FGLM", {timeout: 240000}, () => {
  run(readFileSync(resolve(__dirname, "extension-ideals.py"), "utf8"),
    /finite-extension exact ideals, certificates, and FGLM passed/);
});

test("public extension ideals match 108 independent Sage fixtures", {timeout: 240000}, () => {
  const cases = require("./fixtures/extension-fields-sage-oracles-v1.json").cases;
  run("import json\n_extension_field_cases = json.loads(" +
    JSON.stringify(JSON.stringify(cases)) + ")\n" +
    readFileSync(resolve(__dirname, "extension-ideal-oracles.py"), "utf8"),
    /public extension ideals match independent Sage fixtures/);
});

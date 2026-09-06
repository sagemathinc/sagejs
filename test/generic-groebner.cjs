// sagejs-test-tier: integration
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const { readFileSync } = require("node:fs");

test("generic exact-field ideals agree with 108 independent Sage fixtures", {
  timeout: 180000,
}, () => {
  const cases = require("./fixtures/extension-fields-sage-oracles-v1.json").cases;
  const source = "import json\n_extension_field_cases = json.loads(" +
    JSON.stringify(JSON.stringify(cases)) + ")\n" +
    readFileSync(resolve(__dirname, "generic-groebner.py"), "utf8");
  const result = spawnSync(process.execPath, [resolve(__dirname, "../bin/sagejs")], {
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" }, timeout: 175000,
    input: source, encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  assert.match(result.stdout, /generic exact-field Sage fixtures passed/);
});

// sagejs-test-tier: unit
// sagejs-test-portable: false
"use strict";
const test = require("node:test");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { resolve } = require("node:path");
test("exact number-field public polynomial operations", {timeout: 120000}, async () => {
  await promisify(execFile)(process.execPath, [resolve(__dirname, "../bin/sagejs"),
    resolve(__dirname, "number-field-polynomial.py")], {
    env: {...process.env, SAGEJS_NATIVE_DISABLE: "1"}, timeout: 115000,
  });
});

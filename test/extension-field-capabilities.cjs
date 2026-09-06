// sagejs-test-tier: unit
// sagejs-test-portable: false
"use strict";
const test = require("node:test");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { resolve } = require("node:path");

test("extension ideals use v2 while geometry and packed rational routes remain gated", { timeout: 60000 }, async () => {
  await promisify(execFile)(process.execPath, [resolve(__dirname, "../bin/sagejs"),
    resolve(__dirname, "extension-field-capabilities.py")], {
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" }, timeout: 55000,
  });
});

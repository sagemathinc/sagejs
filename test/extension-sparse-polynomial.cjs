// sagejs-test-tier: unit
// sagejs-test-portable: false
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { resolve } = require("node:path");

test("exact sparse substrate preserves real coefficient parents and canonical packets",
  { timeout: 60000 }, async () => {
    const { stdout } = await promisify(execFile)(process.execPath,
      [resolve(__dirname, "../bin/sagejs"), resolve(__dirname, "extension-sparse-polynomial.py")],
      { env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" }, timeout: 55000 });
    assert.match(stdout, /exact sparse polynomial arithmetic and coordinate packets passed/);
  });

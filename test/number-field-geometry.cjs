// sagejs-test-tier: unit
// sagejs-test-portable: false
"use strict";
const test = require("node:test");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { resolve } = require("node:path");
for (const fixture of ["ideals", "geometry", "factorization", "decomposition", "oracles"]) {
  test(`exact number-field ${fixture}`, { timeout: 360000 }, async () => {
    await promisify(execFile)(process.execPath, [resolve(__dirname, "../bin/sagejs"),
      resolve(__dirname, `number-field-${fixture}.py`)], {
      cwd: resolve(__dirname, ".."),
      env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" }, timeout: 350000,
    });
  });
}

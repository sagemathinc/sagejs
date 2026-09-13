// sagejs-test-tier: integration
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

test("finite-extension public multivariate operations and pinned resource spill", {timeout:180000}, () => {
  const result = spawnSync(process.execPath, [resolve(__dirname,"../bin/sagejs"),
    resolve(__dirname,"extension-multivariate.py")], {
    env:{...process.env,SAGEJS_NATIVE_DISABLE:"1"}, timeout:175000, encoding:"utf8",
  });
  assert.equal(result.status,0,result.stdout+result.stderr+String(result.error??""));
  assert.match(result.stdout,/finite-extension public multivariate arithmetic and bounded spill passed/);
});

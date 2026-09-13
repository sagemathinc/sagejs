"use strict";
const assert = require("node:assert/strict");
const {spawnSync} = require("node:child_process");
const {resolve, join} = require("node:path");
const root = resolve(__dirname, "../..");

module.exports = function disabledNativePublicCenter(generators, timeout = 30_000) {
  const result = spawnSync(process.execPath,
    [join(root, "bin", "sagejs"), "--python"], {
      cwd: root,
      encoding: "utf8",
      env: {...process.env, SAGEJS_NATIVE_DISABLE: "1"},
      input: [
        `G=PermutationGroup(${JSON.stringify(generators)})`,
        "expected=G._portable_center().gens()",
        `H=PermutationGroup(${JSON.stringify(generators)})`,
        "actual=H.center().gens()",
        "r=H._last_center_acceleration",
        "print([H.order(),repr(actual)==repr(expected),r.route,r.reason,r.boundaryCrossings,r.work])",
      ].join("\n"),
      timeout,
    });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim().split("\n")[0];
};

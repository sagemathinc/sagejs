// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

test("cubic reconstruction authenticates regulator before any publication", (t) => {
  const candidates = process.platform === "win32"
    ? [["py", "-3"], ["python"], ["python3"]]
    : [["python3"], ["python"]];
  const command = candidates.find(([exe, ...args]) =>
    spawnSync(exe, [...args, "--version"], { encoding: "utf8" }).status === 0);
  if (!command) return t.skip("CPython is needed for source-extracted fault injection");
  const [exe, ...args] = command;
  const root = path.resolve(__dirname, "..");
  const result = spawnSync(exe, [...args,
    path.join(__dirname, "fixtures/cubic-reconstructed-regulator-guard.py"),
    path.join(root, "src/lib/sagejs/number_fields/cubic_class_number_native.py"),
  ], { encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(JSON.parse(result.stdout), {
    accepted: 5, rejected_before_publication: 7,
    analytic_failure_before_publication: 1,
  });
});

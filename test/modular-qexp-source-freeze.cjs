// sagejs-test-tier: unit
// sagejs-test-portable: true
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  REQUIRED_CHECKS,
  verifySourceFreeze,
} = require("../bench/modular/qexp-correctness/source-freeze.cjs");

test("the exact modular q-expansion source bundle is frozen", () => {
  const manifest = verifySourceFreeze();
  assert.equal(manifest.files.length, 35);
  assert.ok(manifest.files.some(({ path }) =>
    path === "src/lib/sagejs/modular_forms/gamma1.py"));
  assert.deepEqual(manifest.required_checks, REQUIRED_CHECKS);
  assert.match(manifest.bundle_sha256, /^[0-9a-f]{64}$/u);
});

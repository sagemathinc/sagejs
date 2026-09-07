// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { inventory, packageEntrypoint } = require("../scripts/release/inventory.cjs");
const { classification } = require("../scripts/release/policy.cjs");
const { plan, targets } = require("../scripts/release/stages.cjs");

test("runner inventory has reviewed coverage for every profile and target without changing enforcement", () => {
  const result = inventory();
  assert.deepEqual(result.unreviewed, []);
  assert.deepEqual(result.stalePolicy, []);
  assert.equal(result.instances.length, 79);
  assert.equal(new Set(result.instances.map((stage) => stage.key)).size, 79);
  assert.ok(result.instances.every((stage) => stage.policy.requiredNow));
  assert.ok(result.instances.every((stage) => stage.packageEntrypoints.every((entry) => entry.resolved)));
  assert.ok(result.instances.every((stage) => stage.timeoutSeconds > 0 && Array.isArray(stage.inputs)));
  for (const target of targets) {
    assert.deepEqual(result.instances.filter((stage) => stage.profile === "native" && stage.target === target)
      .map((stage) => stage.id), plan("native", undefined, target).map((stage) => stage.id));
  }
  assert.ok(result.incompleteScopes.includes("workflow and authenticated GitHub API dependency edges"));
});

test("unknown stages remain required; startup is not confused with optional timing", () => {
  assert.equal(classification("future-expensive-test").requiredNow, true);
  assert.equal(classification("future-expensive-test").reviewed, false);
  assert.equal(classification("startup").proposedClass, "P");
  assert.equal(classification("integration-performance").proposedClass, "C");
  assert.equal(classification("wasm-chromium-timings").proposedClass, "R");
  assert.equal(classification("wasm-chromium-timings").requiredNow, true);
  assert.throws(() => plan("native", undefined, "linux-mips"), /unsupported/);
});

test("test file discovery is exhaustive within declared selectors and preserves mixed assertions", () => {
  const stages = inventory().instances.filter((stage) => stage.profile === "native" && stage.target === "linux-x64");
  const correctness = stages.find((stage) => stage.id === "integration").testFiles;
  const performance = stages.find((stage) => stage.id === "integration-performance").testFiles;
  const expected = require("./node-test-manifest.cjs").integration;
  assert.deepEqual([...correctness, ...performance].sort(), [...expected].sort());
  assert.ok(!correctness.some((file) => performance.includes(file)));
  assert.ok(performance.includes("test/dense-prime-host-boundary.cjs"));
});

test("package script bodies are inspectable, unresolved invocations are explicit, and shell is never evaluated", () => {
  assert.equal(packageEntrypoint(["node", "anything"]), null);
  const entry = packageEntrypoint(["pnpm", "--dir", "packages/flint", "test:eclib:corpus"]);
  assert.equal(entry.manifest, "packages/flint/package.json");
  assert.equal(typeof entry.body, "string");
  assert.match(entry.manifestSha256, /^[0-9a-f]{64}$/);
  assert.equal(packageEntrypoint(["pnpm", "unknown-script"]).resolved, false);
  assert.throws(() => packageEntrypoint(["pnpm", "--dir", "../outside", "test"]), /escapes/);
});

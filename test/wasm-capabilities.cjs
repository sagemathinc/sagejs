"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  productionClosure,
  publicReport,
  validateManifest,
  validateReport,
} = require("../scripts/check-wasm-capabilities.cjs");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(
  path.join(root, "architecture", "wasm-capabilities.json"),
  "utf8",
));
const report = JSON.parse(fs.readFileSync(
  path.join(root, "architecture", "wasm-capabilities-report.json"),
  "utf8",
));

test("all current Wasm-relevant capability kinds are reviewed", () => {
  const result = validateManifest(manifest);
  const counts = Object.groupBy(result.capabilities, (item) => item.kind);
  assert.equal(counts["napi-export"].length, 311);
  assert.equal(counts["declared-ffi-function"].length, 412);
  assert.equal(counts["declared-ffi-resource"].length, 29);
  assert.equal(counts["production-kernel"].length, 31);
  assert.equal(counts["runtime-intrinsic"].length, 137);
  assert.equal(counts["specialist-capability"].length, 8);
  assert.equal(result.capabilities.length, 928);
  assert.equal(productionClosure().size, 69);
});

test("an unreviewed N-API operation fails closed", () => {
  const changed = structuredClone(manifest);
  changed.capabilities = changed.capabilities.filter((item) =>
    item.id !== "napi:@sagemath/sagejs-flint:nfFactorDegreesBatch"
  );
  assert.throws(
    () => validateManifest(changed),
    /unclassified WebAssembly capabilities.*nfFactorDegreesBatch/s,
  );
});

test("Wasm-ready declarations require an explicit production-closure decision", () => {
  const changed = structuredClone(manifest);
  const item = changed.capabilities.find((entry) =>
    entry.wasm_declared === true && entry.wasm_closure.status === "planned"
  );
  assert.ok(item);
  delete item.wasm_closure.explanation;
  assert.throws(
    () => validateManifest(changed),
    /omitted from the Wasm closure without explanation/,
  );
});

test("portable fallbacks require registered differential evidence", () => {
  const changed = structuredClone(manifest);
  const item = changed.capabilities.find((entry) =>
    entry.disposition === "portable-fallback"
  );
  item.tests = ["production-kernel-differential"];
  changed.policy.test_evidence["production-kernel-differential"].differential = false;
  assert.throws(
    () => validateManifest(changed),
    /portable fallback lacks differential test evidence/,
  );
});

test("shared mathematical cores cannot contain Node-API symbols", () => {
  const changed = structuredClone(manifest);
  const item = changed.capabilities.find((entry) =>
    entry.id === "napi:@sagemath/sagejs-flint:nfFactorDegreesBatch"
  );
  item.shared_core = "packages/flint/src/number_field_zeta.c";
  assert.throws(
    () => validateManifest(changed),
    /purported shared core contains Node-API symbols/,
  );
});

test("compiled and shared capabilities cannot claim unreceipted availability", () => {
  const changed = structuredClone(manifest);
  const kernel = changed.capabilities.find((entry) =>
    entry.kind === "production-kernel"
  );
  kernel.status = "available";
  assert.throws(
    () => validateManifest(changed),
    /production capability receipt and availability status disagree/,
  );
});

test("the public machine report is deterministic and excludes review internals", () => {
  const expected = validateReport(report, manifest);
  assert.deepEqual(expected.counts, report.counts);
  assert.equal(report.schema, "sagejs.wasm-capability-report/v1");
  assert.equal(report.capabilities.length, manifest.capabilities.length);
  assert.equal("review_note" in report.capabilities[0], false);
  assert.equal(typeof report.capabilities[0].explanation, "string");
  const stale = structuredClone(report);
  stale.capabilities[0].status = "stale";
  assert.throws(() => validateReport(stale, manifest), /report is stale/);
  assert.deepEqual(publicReport(manifest), report);
});

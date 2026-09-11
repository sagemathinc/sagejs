// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const api = require("./export.cjs");
const { reconcile, labelMetadata } = require("./reconcile.cjs");
const coverage = require("./source-coverage.cjs");
const policy = require("./source-coverage-policy.json");
const root = path.resolve(__dirname, "../../../..");
const seal = (x, key) => ({ ...x, [key]: api.digest(x) });
function pool(rows = []) {
  const records = rows.map(r => { const m = labelMetadata(r.label); return { ...r, degree: m.degree,
    signature: m.signature, r1: m.signature[0], r2: m.signature[1], discriminant_sign: m.discriminant.startsWith("-") ? -1 : 1,
    discriminant_absolute: m.discriminant.replace("-", "") }; });
  return seal({ schema: "sagejs.general-class-unit-candidate-pool.v2", policy: { schema: "sagejs.general-class-unit-candidate-policy.v2" },
    records, selected_count: records.length, records_sha256: api.digest(records),
    labels_sha256: api.sha256(records.map(r => r.label).join("\n") + (records.length ? "\n" : "")) }, "pool_sha256");
}
test("exact Sylvester bound is recomputed and monicity is mandatory", () => {
  assert.equal(coverage.discriminantBoundSquared([2,0,0,1]), 18225n);
  assert.equal(coverage.discriminantBoundSquared([1,-1,0,0,1]), 2255067n);
  assert.throws(() => coverage.discriminantBoundSquared([1,0,2]), /monic/);
});
test("reviewed pinned policy closes only its finite source presentations", () => {
  const result = coverage.compileCoverage(policy, root, pool());
  assert.equal(result.report.presentations.length, 21);
  assert.equal(result.supplement.records.length, 5);
  assert.equal(result.report.scope.generic_override_history, "unresolved");
  assert.equal(result.report.source_coverage_approved, false);
  assert.equal(result.report.holdout_eligible, null);
});
test("source hash mutation fails closed", () => {
  const p = structuredClone(policy); p.sources[0].input.sha256 = "0".repeat(64);
  assert.throws(() => coverage.compileCoverage(p, root, pool()), /source hash/);
});
test("false bound claims and overlapping pools fail closed", () => {
  const p = structuredClone(policy); p.presentations[0].bound_squared = "1";
  assert.throws(() => coverage.compileCoverage(p, root, pool()), /false discriminant bound/);
  assert.throws(() => coverage.compileCoverage(policy, root,
    pool([{ label: "4.0.229.1", coefficients: ["1","-1","0","0","1"] }])), /does not exclude/);
});
test("source asserted discriminant requires exact pinned fixture case and polynomial", () => {
  for (const change of [{ field_discriminant: "7291333" }, { fixture_id: "absent" }, { coefficients: ["1","0","0","0","0","1"] }]) {
    const p = structuredClone(policy); Object.assign(p.presentations.find(r => r.id === "ford-letard2"), change);
    assert.throws(() => coverage.compileCoverage(p, root, pool()), /fixture discriminant/);
  }
});
test("generic input capability cannot be promoted to actual exposure", () => {
  const p = structuredClone(policy); p.presentations[0].source_id = "generic-frontier";
  assert.throws(() => coverage.compileCoverage(p, root, pool()), /generic capability/);
  p.scope.generic_override_history = "all-unseen";
  assert.throws(() => coverage.compileCoverage(p, root, pool()), /universal history/);
});
test("five historical quadratics quarantine without claiming Sage execution", () => {
  const compiled = coverage.compileCoverage(policy, root, pool());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-coverage-test-"));
  try {
    const raw = api.canonical(compiled.supplement); fs.writeFileSync(path.join(dir, "supplement.json"), raw);
    const inventory = api.exportInventory({ schema: api.MANIFEST_SCHEMA, sources: [{ id: "reviewed", path: "supplement.json",
      sha256: api.sha256(raw), kind: "explicit-presentations-v1", category: "historical-quarantine" }] }, dir);
    const p = pool(compiled.supplement.records.map(({ label, coefficients }) => ({ label, coefficients })));
    const result = reconcile(p, inventory, { schema_version: 1, cases: [], oracle_baseline: { oracles: {
      sage_pari: { records: [] }, magma: { records: [] } } } }, "a".repeat(64));
    assert.equal(result.counts.quarantined, 5);
    assert.ok(result.candidates.every(c => c.holdout_eligible === false));
    assert.ok(inventory.records.every(r => r.category === "historical-quarantine"));
    assert.equal(result.source_coverage_approved, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

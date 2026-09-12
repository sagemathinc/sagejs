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
const policyV2 = require("./source-coverage-policy-v2.json");
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
  assert.throws(() => coverage.compileCoverage(policy, root,
    pool([{ label: "4.0.1000000000000000000000000.1", coefficients: ["1","-1","0","0","1"] }])), /exact presentation conflicts/);
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
test("v2 pins the finite 65-path checklist and expands exactly 30 LCG samples", () => {
  const p = pool(policyV2.presentations.filter(r => r.disposition === "historical-quarantine").map(({ label, coefficients }) => ({ label, coefficients })));
  const result = coverage.compileCoverage(policyV2, root, p);
  assert.equal(result.report.lexical_checklist.files.length, 65);
  assert.equal(result.report.presentations.length, policyV2.presentations.length + 30);
  const generated = result.report.presentations.filter(r => r.id.startsWith("test-round4-lcg-"));
  assert.equal(generated.length, 30);
  assert.ok(generated.every(r => r.proof.possible_pool_candidates === 0));
  assert.equal(result.supplement.records.length, 5);
  const p2 = structuredClone(policyV2); p2.lexical_checklist.files[0].sha256 = "0".repeat(64);
  assert.throws(() => coverage.compileCoverage(p2, root, pool()), /checklist/);
  p2.lexical_checklist.sha256 = api.digest(p2.lexical_checklist.files);
  assert.throws(() => coverage.compileCoverage(p2, root, pool()), /source hash/);
});
test("LCG arithmetic uses exact declared state and keeps reducible prospective inputs", () => {
  const rows = coverage.lcgPresentations(policyV2.families[0]);
  assert.deepEqual(rows[0].coefficients, ["-2", "3", "1"]);
  assert.deepEqual(rows[9].coefficients, ["2", "-3", "1"]);
  assert.equal(coverage.quadraticPossible(rows[2].coefficients, []).reducible_over_Q, true);
  assert.throws(() => coverage.lcgPresentations({ ...policyV2.families[0], seed: "1730" }), /unreviewed/);
});
test("quadratic index test is exact, signed, and cannot ignore compatible discriminants", () => {
  const candidates = [{ degree: 2, discriminant: "17" }, { degree: 2, discriminant: "-17" }];
  assert.equal(coverage.quadraticPossible(["-2","3","1"], candidates).possible_pool_candidates, 1);
  assert.equal(coverage.quadraticPossible(["4","-1","1"], [{ degree: 2, discriminant: "-15" }]).possible_pool_candidates, 1);
  assert.equal(coverage.quadraticPossible(["4","-1","1"], [{ degree: 2, discriminant: "-5" }]).possible_pool_candidates, 0);
  assert.throws(() => coverage.compileCoverage(policyV2, root, pool([{ label: "2.2.17.1", coefficients: ["-4","-1","1"] }])), /quadratic index/);
});
test("rational scaling and large translations verify coefficient identities", () => {
  for (const row of policyV2.presentations.filter(r => r.transform)) assert.ok(coverage.verifyTransform(row));
  const translated = structuredClone(policyV2.presentations.find(r => r.id === "shift500-quartic"));
  translated.transform.input_coefficients[0] = "1";
  assert.throws(() => coverage.verifyTransform(translated), /translation identity/);
  const scaled = structuredClone(policyV2.presentations.find(r => r.id === "rational-quartic-scale2"));
  scaled.transform.scale = "3";
  assert.throws(() => coverage.verifyTransform(scaled), /rational scale identity/);
});
test("global discriminant assertions are literal-bound and never use local order data", () => {
  const p = structuredClone(policyV2), r = p.presentations.find(r => r.id === "selector-large-global-cubic");
  r.field_discriminant = "-9187623906865338526460728740401846948308";
  assert.throws(() => coverage.compileCoverage(p, root, pool()), /global discriminant literal/);
  const q = structuredClone(policyV2); q.presentations.find(r => r.id === "roots-degree16").coefficients = ["1","0","1"];
  assert.throws(() => coverage.compileCoverage(q, root, pool()), /inside campaign/);
});
test("a smaller valid historical source manifest cannot drop pinned exposure evidence", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-history-binding-test-"));
  try {
    const source = (id, coefficients) => {
      const raw = api.canonical({ schema: "sagejs.general-frontier/exposure-presentations-v1", records: [{ id, coefficients }] });
      fs.writeFileSync(path.join(dir, id + ".json"), raw);
      return { id, path: id + ".json", sha256: api.sha256(raw), kind: "explicit-presentations-v1", category: "historical-quarantine" };
    };
    const manifest = { schema: api.MANIFEST_SCHEMA, sources: [source("one", ["-2","0","1"]), source("two", ["-3","0","1"])] };
    const pinned = api.exportInventory(manifest, dir);
    assert.equal(coverage.bindHistoricalInventory(manifest, dir, pinned).records.length, 2);
    assert.throws(() => coverage.bindHistoricalInventory({ ...manifest, sources: manifest.sources.slice(0, 1) }, dir, pinned), /drops or changes/);
    assert.throws(() => coverage.bindHistoricalInventory({ ...manifest, sources: manifest.sources.map(s => ({ ...s, category: "reference-only" })) }, dir, pinned), /drops or changes/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const api = require("./export.cjs");
const { reconcile, fromManifest, INPUT_SCHEMA, labelMetadata } = require("./reconcile.cjs");
const HASH = "a".repeat(64);
const seal = (x, key) => ({ ...x, [key]: api.digest(x) });
function pool(rows = [{ label: "2.2.5.1", coefficients: ["-1", "-1", "1"] }]) {
  const records = rows.map((r) => { const m = labelMetadata(r.label); return {
    ...r, degree: m.degree, signature: m.signature, r1: m.signature[0], r2: m.signature[1],
    discriminant_sign: m.discriminant.startsWith("-") ? -1 : 1, discriminant_absolute: m.discriminant.replace("-", ""),
  }; });
  return seal({ schema: "sagejs.general-class-unit-candidate-pool.v2", policy: { schema: "sagejs.general-class-unit-candidate-policy.v2" },
    records, selected_count: records.length, records_sha256: api.digest(records),
    labels_sha256: api.sha256(records.map((r) => r.label).join("\n") + (records.length ? "\n" : "")) }, "pool_sha256");
}
function inventory(rows, { kind = "explicit-presentations-v1", category = "historical-quarantine" } = {}) {
  const records = rows.map((r, i) => {
    const body = { ...api.normalizeRecord(r, i, { invalid: r.invalid === true }), source_id: "fixture", category };
    return { ...body, evidence_sha256: api.digest(body) };
  });
  return seal({ schema: api.OUTPUT_SCHEMA, sources: [{ id: "fixture", kind, category, sha256: HASH }], records }, "inventory_sha256");
}
function oracle(cases = [], records = []) {
  return { schema_version: 1, cases, oracle_baseline: { oracles: { sage_pari: { records }, magma: { records: structuredClone(records) } } } };
}
test("same-label and exact-coefficient quarantines have explicit reasons", () => {
  const x = reconcile(pool(), inventory([{ label: "2.2.5.1" }]), oracle(), HASH);
  assert.equal(x.counts.quarantined, 1); assert.equal(x.candidates[0].reasons[0].kind, "exact-source-asserted-label");
  const y = reconcile(pool(), inventory([{ coefficients: ["-1", "-1", "1"] }]), oracle(), HASH);
  assert.ok(y.candidates[0].reasons.some((r) => r.kind === "exact-coefficients"));
});
test("distinct equal-discriminant labels are quarantined but never merged", () => {
  const p = pool([{ label: "3.1.10015.1", coefficients: ["-45", "24", "-1", "1"] }, { label: "3.1.10015.2", coefficients: ["95", "4", "-1", "1"] }]);
  const r = reconcile(p, inventory([{ label: "3.1.10015.3" }]), oracle(), HASH);
  assert.equal(r.candidates.length, 2); assert.equal(r.counts.quarantined, 2); assert.equal(r.distinct_fields, null);
  for (const c of r.candidates) assert.equal(c.reasons[0].kind, "possible-same-field-bucket-not-isomorphism");
});
test("canonical labels without coefficients supply signed discriminant and signature", () => {
  const r = reconcile(pool(), inventory([{ label: "3.1.10015.3" }]), oracle(), HASH);
  assert.deepEqual(r.source_assertions[0].signature, [1, 1]); assert.equal(r.source_assertions[0].field_discriminant, "-10015");
  assert.equal(r.candidates[0].holdout_eligible, null);
});
test("agreeing pinned oracle records fill missing field metadata", () => {
  const c = { id: "radical", polynomial: ["-5", "0", "1"] };
  const i = inventory([c], { kind: "class-unit-oracles" });
  const o = oracle([c], [{ id: c.id, field_discriminant: "5", signature: [2, 0] }]);
  const r = reconcile(pool(), i, o, HASH);
  assert.equal(r.metadata_joins.length, 1); assert.equal(r.unresolved_metadata.length, 0); assert.equal(r.counts.quarantined, 1);
  assert.throws(() => reconcile(pool(), i, o, "b".repeat(64)), /not bound/);
});
test("missing metadata remains unresolved and conservatively blocks compatible candidates", () => {
  const c = { id: "radical", polynomial: ["-5", "0", "1"] };
  const r = reconcile(pool(), inventory([c], { kind: "class-unit-oracles" }), oracle([c]), HASH);
  assert.equal(r.unresolved_metadata.length, 1); assert.equal(r.counts.quarantined, 1);
  assert.equal(r.candidates[0].reasons[0].kind, "unresolved-historical-metadata");
});
test("conflicting independent oracle values fail closed", () => {
  const c = { id: "radical", polynomial: ["-5", "0", "1"] };
  const i = inventory([c], { kind: "class-unit-oracles" }), o = oracle([c], [{ id: c.id, field_discriminant: "5", signature: [2, 0] }]);
  o.oracle_baseline.oracles.magma.records[0].field_discriminant = "8";
  assert.throws(() => reconcile(pool(), i, o, HASH), /conflicting oracle/);
});
test("conflicting case polynomials and label metadata fail closed", () => {
  const c = { id: "radical", polynomial: ["-5", "0", "1"] };
  assert.throws(() => reconcile(pool(), inventory([c], { kind: "class-unit-oracles" }), oracle([{ ...c, polynomial: ["-2", "0", "1"] }]), HASH), /polynomial conflict/);
  assert.throws(() => reconcile(pool(), inventory([{ label: "2.2.5.1", field_discriminant: "8" }]), oracle(), HASH), /label\/discriminant/);
  assert.throws(() => reconcile(pool(), inventory([{ coefficients: ["-5", "0", "1"], field_discriminant: "-5", signature: [2, 0] }]), oracle(), HASH), /sign conflicts/);
});
test("identical polynomial metadata cannot disagree across records", () => {
  const coefficients = ["-5", "0", "1"];
  assert.throws(() => reconcile(pool(), inventory([{ id: "a", coefficients, field_discriminant: "5" },
    { id: "b", coefficients, field_discriminant: "8" }]), oracle(), HASH), /identical polynomial/);
});
test("reference-only and selection-only matches do not become Sage exposure", () => {
  for (const category of ["reference-only", "selection-only"]) {
    const r = reconcile(pool(), inventory([{ label: "2.2.5.1" }], { category }), oracle(), HASH);
    assert.equal(r.counts.quarantined, 0); assert.equal(r.candidates[0].holdout_eligible, null);
  }
});
test("explicit additional exposure category controls conservative pilot quarantine", () => {
  const extra = { schema: "sagejs.general-frontier/additional-exposure-v1", category: "reference-only", records: [{ id: "pilot", label: "2.2.5.1", coefficients: ["-1", "-1", "1"] }] };
  const i = inventory([]);
  assert.equal(reconcile(pool(), i, oracle(), HASH, extra).counts.quarantined, 0);
  extra.category = "historical-quarantine";
  assert.equal(reconcile(pool(), i, oracle(), HASH, extra).counts.quarantined, 1);
  extra.records[0].id = null;
  assert.throws(() => reconcile(pool(), i, oracle(), HASH, extra), /additional exposure row/);
});
test("additional label buckets and unlabeled missing metadata stay conservative", () => {
  const extra = { schema: "sagejs.general-frontier/additional-exposure-v1", category: "prior-sage-exposure",
    records: [{ id: "asserted-other-label", label: "2.2.5.2", coefficients: ["-5", "0", "1"] }] };
  let r = reconcile(pool(), inventory([]), oracle(), HASH, extra);
  assert.equal(r.candidates[0].reasons[0].kind, "explicit-additional-possible-same-field-bucket");
  extra.records = [{ id: "unknown-polynomial", coefficients: ["-7", "0", "1"] }];
  r = reconcile(pool(), inventory([]), oracle(), HASH, extra);
  assert.equal(r.additional_unresolved_metadata.length, 1);
  assert.equal(r.candidates[0].reasons[0].kind, "explicit-additional-unresolved-metadata");
});
test("declared-invalid inputs do not quarantine a whole degree bucket", () => {
  const r = reconcile(pool(), inventory([{ coefficients: ["-1", "0", "1"], invalid: true }]), oracle(), HASH);
  assert.equal(r.unresolved_metadata.length, 0); assert.equal(r.counts.quarantined, 0);
});
test("pool digests, schemas, duplicate labels, and metadata are checked", () => {
  const p = pool(), i = inventory([]); p.records[0].discriminant_absolute = "8";
  assert.throws(() => reconcile(p, i, oracle(), HASH), /digest|sha256 mismatch/);
  const duplicate = pool([{ label: "2.2.5.1", coefficients: ["-5", "0", "1"] }, { label: "2.2.5.1", coefficients: ["-1", "-1", "1"] }]);
  assert.throws(() => reconcile(duplicate, i, oracle(), HASH), /duplicate pool/);
  const { pool_sha256, ...body } = pool(); body.records[0].r1 = 0; body.records_sha256 = api.digest(body.records);
  assert.throws(() => reconcile(seal(body, "pool_sha256"), i, oracle(), HASH), /signature/);
});
test("tampered inventory evidence fails even after updating envelope digest", () => {
  const { inventory_sha256, ...body } = inventory([{ label: "2.2.5.1" }]); body.records[0].category = "reference-only";
  assert.throws(() => reconcile(pool(), seal(body, "inventory_sha256"), oracle(), HASH), /evidence digest/);
});
test("counts retain all degree/signature cells and never approve holdouts", () => {
  const r = reconcile(pool(), inventory([]), oracle(), HASH);
  assert.equal(r.per_degree.length, 9); assert.equal(r.per_degree.reduce((n, d) => n + d.signatures.length, 0), 34);
  assert.equal(r.source_coverage_approved, false); assert.equal(r.candidates[0].holdout_eligible, null);
});
test("manifest loader checks every raw input hash", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-reconciliation-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (name, data) => { const raw = JSON.stringify(data); fs.writeFileSync(path.join(root, name), raw); return { path: name, sha256: api.sha256(raw) }; };
  const m = { schema: INPUT_SCHEMA, pool: put("pool.json", pool()), inventory: put("inventory.json", inventory([])), oracle_fixture: put("oracle.json", oracle()) };
  assert.equal(fromManifest(m, root).result.counts.total, 1);
  fs.appendFileSync(path.join(root, "oracle.json"), " "); assert.throws(() => fromManifest(m, root), /raw input SHA256/);
});

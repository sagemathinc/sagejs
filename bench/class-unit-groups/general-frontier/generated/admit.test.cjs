"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const api = require("../exposure/export.cjs"), admission = require("./admit.cjs");
function record(n = 3, k = 4, j = 0) {
  const a = 2n * (10n ** BigInt(k) + 2n * BigInt(j) + 1n), b = 2n * (10n ** BigInt(k) + 4n * BigInt(j) + 1n);
  const coefficients = (n === 3 ? [b, -a, 0n, 1n] : [-b, -a, 0n, 0n, 1n]).map(String);
  const coefficient_sha256 = api.digest({ schema: "sagejs.monic-polynomial-coefficients.v1", degree: n, coefficients });
  const signature = n === 3 ? [3, 0] : [2, 1];
  return { label: `generated-sha256-${coefficient_sha256}`, degree: n, decimal_scale: k, parameter_index: j,
    family: n === 3 ? "eisenstein2-real-cubic" : "eisenstein2-mixed-quartic", coefficients,
    coefficient_sha256, signature, r1: signature[0], r2: signature[1], unit_rank: 2,
    equation_discriminant: (n === 3 ? 4n * a ** 3n - 27n * b ** 2n : -256n * b ** 3n - 27n * a ** 4n).toString() };
}
function paired(r, d = r.equation_discriminant, ns = "1000000000") {
  const engine = name => ({ label: r.label, coefficients: r.coefficients, engine: name, sample: 1, status: "ok",
    signature: r.signature, discriminant: d, class_number: "1", class_invariants: [], torsion_order: "2",
    worker_nanoseconds: ns, receipt_sha256: "a".repeat(64), regulator: { type: "test-only" } });
  return { label: r.label, sample: 1, status: "paired-discovery", pari: engine("pari"), hecke: engine("hecke"),
    faster_worker_nanoseconds: ns, reference_at_least_one_second: BigInt(ns) >= 10n ** 9n,
    reference_at_least_ten_seconds: BigInt(ns) >= 10n ** 10n };
}
function fixture() {
  const records = [];
  for (const n of [3, 4]) for (const k of [4, 6, 8, 10, 12, 16, 20]) for (let j = 0; j < 8; j++) records.push(record(n, k, j));
  return [
    { schema: "sagejs.rank-two-supplement.v1", records, export_sha256: "a".repeat(64) },
    { schema: "sagejs.general-frontier-paired-discovery.v1", qualification_evidence: false, independent_replay: false, rows: records.filter(r => r.parameter_index < 2).map(r => paired(r)) },
    { schema: "sagejs.general-class-unit-source-union.v1", records: [] },
    { schema: "sagejs.general-frontier/conservative-exposure-reconciliation-v2", source_coverage_approved: false, source_assertions: [], additional_source_assertions: [] },
    { schema: "sagejs.general-frontier/source-coverage-report-v3", source_coverage_approved: false, presentations: [], scope: { universal_history_claim: false } },
  ];
}
test("actual cubic index11 and index17 are derived, not equated to equation D", () => {
  assert.equal(admission.indexFromDiscriminants(record().equation_discriminant, "264452882644"), "11");
  assert.equal(admission.indexFromDiscriminants(record(3, 10, 1).equation_discriminant, "110726643660899653971764705876"), "17");
});
test("reject nonsquare, opposite-sign, zero, noninteger and noncanonical discriminants", () => {
  for (const [e, d] of [["12", "2"], ["12", "-3"], ["12", "0"], ["12", "5"], ["012", "3"], [12, "3"]]) assert.throws(() => admission.indexFromDiscriminants(e, d));
});
test("exact generated identities retain giant coefficients", () => {
  const r = record(4, 20, 7); assert.deepEqual(admission.recordIdentity(r).coefficients, r.coefficients);
  assert(BigInt(r.coefficients[0]) < -BigInt(Number.MAX_SAFE_INTEGER));
});
test("reject generated label, family, coefficient, degree and signature conflicts", () => {
  for (const update of [{ label: "3.3.49.1" }, { family: "invented" }, { degree: 4 }, { signature: [1, 1] }, { coefficients: ["2", "0", "0", "1"] }, { parameter_index: 8 }]) assert.throws(() => admission.recordIdentity({ ...record(), ...update }));
});
test("reject paired discriminant and signature disagreements", () => {
  const r = record(), identity = admission.recordIdentity(r);
  const p = paired(r, "264452882644"); p.hecke.discriminant = r.equation_discriminant;
  assert.throws(() => admission.pairObservation(identity, p), /discriminant disagreement/);
  p.hecke.discriminant = p.pari.discriminant; p.hecke.signature = [1, 1];
  assert.throws(() => admission.pairObservation(identity, p), /signature conflict/);
});
test("reject coefficients, class summaries and cost flags that contradict the pair", () => {
  const r = record(), id = admission.recordIdentity(r);
  for (const mutate of [p => { p.hecke.coefficients = ["2", "0", "0", "1"]; }, p => { p.hecke.class_number = "2"; }, p => { p.reference_at_least_ten_seconds = true; }, p => { p.status = "exact-summary-disagreement"; }]) {
    const p = paired(r); mutate(p); assert.throws(() => admission.pairObservation(id, p));
  }
});
test("censored result never supplies field metadata or qualified time band", () => {
  const r = record(), p = paired(r); p.hecke.status = "timeout"; p.status = "censored-or-missing";
  delete p.faster_worker_nanoseconds; assert.equal(admission.pairObservation(admission.recordIdentity(r), p), null);
});
test("family roles stay discovery, development-only and unassigned reserve", () => {
  const out = admission.buildCompanion(...fixture());
  assert.equal(out.records.filter(r => r.declaration === "development-only").length, 56);
  assert.equal(out.records.filter(r => r.declaration === "reserve-unassigned").length, 28);
  assert(out.records.every(r => r.holdout_eligible !== true && r.qualification_evidence === false));
  assert.equal(out.distinct_field_count, null); assert.equal(out.source_coverage_approved, false);
});
test("reject omitted, duplicate or reserved-index paired membership", () => {
  for (const mutate of [f => f[1].rows.pop(), f => f[1].rows.push(f[1].rows[0]), f => { f[1].rows[0] = paired(f[0].records[2]); }]) {
    const f = fixture(); mutate(f); assert.throws(() => admission.buildCompanion(...f));
  }
});
test("distinct LMFDB labels with equal D are coordinated, never merged", () => {
  const f = fixture(), r = f[0].records[0];
  for (const suffix of [1, 2]) f[2].records.push({ label: `3.3.${r.equation_discriminant}.${suffix}`, degree: 3, signature: [3, 0], coefficients: ["2", "0", "0", "1"], discriminant_absolute: r.equation_discriminant, discriminant_sign: 1 });
  const out = admission.buildCompanion(...f).records[0];
  assert.equal(out.union_possible_same_field_labels.length, 2); assert.equal(out.holdout_eligible, null);
});
test("historical field_discriminant and additional discriminant spellings both quarantine", () => {
  const f = fixture(), r = f[0].records[0];
  f[3].source_assertions.push({ quarantine: true, category: "historical-quarantine", degree: 3, signature: [3, 0], field_discriminant: r.equation_discriminant, source_id: "old", source_record_id: "one" });
  f[3].additional_source_assertions.push({ quarantine: true, category: "prior-sage-exposure", degree: 3, signature: [3, 0], discriminant: r.equation_discriminant, id: "actual" });
  const out = admission.buildCompanion(...f).records[0]; assert.equal(out.historical_quarantine_reasons.length, 2); assert.equal(out.holdout_eligible, false);
});
test("reference-only evidence is not promoted to prior Sage exposure", () => {
  const f = fixture(), r = f[0].records[0]; f[3].source_assertions.push({ quarantine: false, category: "reference-only", polynomial_sha256: api.digest(r.coefficients) });
  const out = admission.buildCompanion(...f).records[0]; assert.equal(out.exposure, "unknown"); assert.equal(out.reference_category, "reference-only");
});
test("coefficient-only historical quarantine propagates across generated buckets without merging", () => {
  const make = id => ({ id, observation: { bucket_key: "3:3,0:49" }, historical_quarantine_reasons: [], union_possible_same_field_labels: ["3.3.49.1"], exposure: "unknown", holdout_eligible: null });
  const a = make("presentation-a"), b = make("presentation-b");
  a.historical_quarantine_reasons.push({ kind: "historical-exact-polynomial" });
  const proposals = admission.coordinateBuckets([a, b]);
  assert.deepEqual(a.generated_possible_same_field_ids, [b.id]);
  assert.deepEqual(b.generated_possible_same_field_ids, [a.id]);
  assert.equal(b.holdout_eligible, false); assert.equal(b.exposure, "historical-quarantine");
  assert.equal(proposals.length, 1); assert.equal(proposals[0].isomorphism_asserted, false);
});
test("unexposed equal-D generated presentations remain distinct and unknown", () => {
  const rows = ["a", "b"].map(id => ({ id, observation: { bucket_key: "4:2,1:-283" }, historical_quarantine_reasons: [], union_possible_same_field_labels: [], exposure: "unknown", holdout_eligible: null }));
  assert.deepEqual(admission.coordinateBuckets(rows), []);
  assert.equal(rows.length, 2); assert(rows.every(r => r.holdout_eligible === null && r.generated_possible_same_field_ids.length === 1));
});
test("coefficient-only historical evidence quarantines even without field metadata", () => {
  const f = fixture(), r = f[0].records[0]; f[3].source_assertions.push({ quarantine: true, category: "historical-quarantine", polynomial_sha256: api.digest(r.coefficients), source_id: "old", source_record_id: "poly" });
  assert.equal(admission.buildCompanion(...f).records[0].holdout_eligible, false);
});
test("finite bound is recomputed and not treated as discriminant equality", () => {
  const r = admission.recordIdentity(record()); const observation = { field_discriminant: "264452882644" };
  const c = require("../exposure/source-coverage.cjs"); const p = { id: "same", source_id: "test", coefficients: r.coefficients, disposition: "sylvester-bound-outside-pool", proof: { discriminant_bound_squared: c.discriminantBoundSquared(r.coefficients).toString() } };
  assert.equal(admission.finiteCoverage(r, observation, { presentations: [p] }).reasons.length, 1);
  p.proof.discriminant_bound_squared = "1"; assert.throws(() => admission.finiteCoverage(r, observation, { presentations: [p] }), /bound mismatch/);
});
test("unknown schemas and finite dispositions fail closed", () => {
  for (const i of [0, 1, 2, 3, 4]) { const f = fixture(); f[i].schema = "unknown"; assert.throws(() => admission.buildCompanion(...f)); }
  const f = fixture(); f[4].presentations.push({ id: "bad", coefficients: ["2", "0", "0", "1"], disposition: "assume-unseen" }); assert.throws(() => admission.buildCompanion(...f));
  assert.throws(() => admission.fromManifest({ schema: admission.SCHEMA }, "."), /schema keys/);
});
test("raw source mutation and descriptor schema changes are rejected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "generated-admission-test-"));
  try {
    const p = path.join(dir, "input.json"); fs.writeFileSync(p, "{}"); const d = { path: p, sha256: api.sha256("{}") };
    assert.deepEqual(admission.loadPinned(d, dir).value, {});
    assert.throws(() => admission.loadPinned({ ...d, trusted: true }, dir), /schema keys/);
    fs.writeFileSync(p, "[]"); assert.throws(() => admission.loadPinned(d, dir), /hash mismatch/);
  } finally { fs.rmSync(dir, { recursive: true }); }
});

// sagejs-test-tier: specialized
"use strict";

// Offline packaging only: this file never executes a CAS or changes selection.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const SEED = "sagejs-general-class-unit-smoke-20260912-v1";
const PINS = {
  "source-union-v1.json": "ba4faf16efaa5c442673b8425148ea0e5c1ac4f5fd079285d4e261821945c264",
  "reference-panel-fill98-reconciliation-v1/joint-feasibility.json": "766f3f33657504cc18a280db4bb758be3932f8350e2629d2a0a597eb157e5edb",
  "reference-panel-fill98-reconciliation-v1/summary.json": "f1f3a2b014a1fa9802dfd3875f181a802228434f1e3e473209c80605ddb7d2dd",
  "generated-admission-v1/admission.json": "d80fc3a0b571248823398fa40fa3eade653dedb074643d16124902fa12fbedf7",
  "joint-identity-v1/reconciliation.json": "5ea62a41c5fb0b9e30ce062349669a610477ec264938ff7562f9e96ce6c7b25c",
  "provisional-selection-v1/selection.json": "289b243e7a42fc74f624dd00d80408feee209a9e8585c3a57f8ce3625e507053",
};
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const canonical = (x) => JSON.stringify(x, function (_key, value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]])) : value;
});
const digest = (x) => hash(canonical(x));
const jsonl = (rows) => rows.map(canonical).join("\n") + "\n";
const integer = (x) => typeof x === "string" && /^(0|-?[1-9][0-9]*)$/.test(x);
const abs = (x) => BigInt(x) < 0n ? -BigInt(x) : BigInt(x);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function smokeIds(fields) {
  const result = [];
  for (let n = 2; n <= 10; ++n) {
    const rows = fields.filter((r) => r.degree === n && r.role === "development").sort((a, b) =>
      compare(abs(a.discriminant), abs(b.discriminant)) || compare(digest([SEED, a.id]), digest([SEED, b.id])));
    const chosen = new Set();
    for (let r2 = 0; r2 <= Math.floor(n / 2); ++r2) {
      const row = rows.find((r) => r.signature[1] === r2);
      assert.ok(row, "smoke signature availability");
      chosen.add(row.id);
    }
    for (const row of rows) {
      if (chosen.size === 10) break;
      chosen.add(row.id);
    }
    assert.equal(chosen.size, 10);
    result.push(...chosen);
  }
  return result.sort();
}

function validate(fields, manifest, observations) {
  assert.equal(manifest.schema, "sagejs.general-class-unit-corpus.v1");
  assert.equal(manifest.identity_membership_frozen, true);
  assert.equal(manifest.performance_qualified, false);
  assert.equal(manifest.m0_complete, false);
  assert.deepEqual(manifest.source_pins, PINS, "accepted evidence pins");
  assert.equal(manifest.selection_uses_sagejs_results, false);
  assert.equal(manifest.plan_sha256, "aceadd86d81f796740e9fa1e02c5d1a57854453ecc0d1774f3f09bf2dcd14403");
  assert.deepEqual(manifest.authorized_milestones, ["M0", "M1", "M2", "M3", "M4", "M5"]);
  assert.equal(manifest.optimization_campaign_limit, 12);
  assert.equal(fields.length, 1800);
  assert.equal(new Set(fields.map((r) => r.id)).size, 1800);
  assert.equal(new Set(fields.map((r) => r.polynomial_sha256)).size, 1800);
  assert.equal(manifest.coverage_sha256, hash(jsonl(fields)), "coverage content hash");
  assert.equal(manifest.observations_sha256, hash(jsonl(observations)), "observations content hash");
  const byId = new Map(observations.map((r) => [r.id, r]));
  assert.equal(byId.size, 526);
  assert.equal(observations.filter((r) => r.paired).length, 439);
  assert.equal(observations.filter((r) => !r.paired).length, 87);
  let one = 0, ten = 0;
  for (const row of fields) {
    assert.ok(["development", "holdout"].includes(row.role));
    assert.ok(Number.isInteger(row.degree) && row.degree >= 2 && row.degree <= 10);
    assert.equal(typeof row.performance, "boolean");
    assert.equal(row.signature.length, 2);
    assert.ok(row.signature.every((x) => Number.isInteger(x) && x >= 0));
    assert.equal(row.signature[0] + 2 * row.signature[1], row.degree);
    assert.equal(row.unit_rank, row.signature[0] + row.signature[1] - 1);
    assert.ok(row.coefficients.every(integer));
    assert.equal(row.coefficients.length, row.degree + 1);
    assert.equal(row.coefficients.at(-1), "1");
    assert.equal(digest(row.coefficients), row.polynomial_sha256);
    assert.ok(integer(row.discriminant) && BigInt(row.discriminant) !== 0n);
    assert.equal(BigInt(row.discriminant) < 0n, row.signature[1] % 2 === 1);
    if (row.source.declared_role === "development-only") assert.equal(row.role, "development");
    if (row.performance) {
      const observation = byId.get(row.id);
      assert.ok(observation?.paired, "every panel member has an actual paired observation");
      assert.equal(observation.polynomial_sha256, row.polynomial_sha256);
      assert.equal(observation.degree, row.degree);
      assert.deepEqual(observation.signature, row.signature);
      assert.equal(observation.discriminant, row.discriminant);
      assert.ok(integer(observation.faster_worker_nanoseconds));
      const ns = BigInt(observation.faster_worker_nanoseconds);
      assert.ok(ns >= 0n);
      one += Number(ns >= 1000000000n);
      ten += Number(ns >= 10000000000n);
    }
  }
  for (let n = 2; n <= 10; ++n) {
    for (const [i, role] of ["development", "holdout"].entries()) {
      const rows = fields.filter((r) => r.degree === n && r.role === role);
      assert.equal(rows.length, i === 0 ? 120 : 80);
      assert.equal(rows.filter((r) => r.performance).length, i === 0 ? 24 : 16);
      for (let r2 = 0; r2 <= Math.floor(n / 2); ++r2)
        assert.equal(rows.filter((r) => r.signature[1] === r2).length, manifest.signature_quotas[n][i][r2]);
    }
  }
  assert.equal(one, manifest.discovery_at_least_one_second);
  assert.equal(ten, manifest.discovery_at_least_ten_seconds);
  assert.ok(one >= 120 && ten >= 40, "discovery cost quotas");
  assert.deepEqual(smokeIds(fields), manifest.smoke_ids);
  assert.equal(fields.filter((r) => r.source.kind === "generated").length, 48);
  assert.equal(fields.filter((r) => r.class_number === null).length, 89, "unknown class numbers retained");
  return {coverage: fields.length, performance: 360, smoke: manifest.smoke_ids.length, one, ten};
}

function build(evidence) {
  const read = (name) => {
    const bytes = fs.readFileSync(path.join(evidence, name));
    assert.equal(hash(bytes), PINS[name], "pinned input " + name);
    return JSON.parse(bytes);
  };
  const union = read("source-union-v1.json");
  const joint = read("reference-panel-fill98-reconciliation-v1/joint-feasibility.json");
  const summary = read("reference-panel-fill98-reconciliation-v1/summary.json");
  const admission = read("generated-admission-v1/admission.json");
  const identity = read("joint-identity-v1/reconciliation.json");
  const selection = read("provisional-selection-v1/selection.json");
  assert.equal(joint.reference_pairing_complete, true);
  assert.equal(admission.admitted_as_exact_number_field_presentations, true);
  assert.equal(identity.phase_results.buckets.counts["nonisomorphic-pari-exact"], 2954);
  assert.equal(identity.phase_results.buckets.all_complete, true);
  const sources = new Map(union.records.map((r) => [r.label, r]));
  const generated = new Map(admission.records.map((r) => [r.id, r]));
  const fields = joint.assignments.map((a) => {
    const isGenerated = generated.has(a.id);
    const r = generated.get(a.id) || sources.get(a.id);
    assert.ok(r, "exact selected source identity");
    const coefficients = r.coefficients;
    assert.equal(digest(coefficients), a.polynomial_sha256);
    return {
      ...a, coefficients, degree: r.degree, signature: r.signature,
      unit_rank: r.signature[0] + r.signature[1] - 1,
      discriminant: isGenerated ? r.field_discriminant : String(BigInt(r.discriminant_absolute) * BigInt(r.discriminant_sign)),
      equation_order_index: isGenerated ? r.basis_consistency.equation_order_index : r.equation_order_index,
      class_number: r.class_number ?? null,
      class_invariants: isGenerated ? r.class_invariants : r.class_group,
      source: isGenerated ? {
        kind: "generated", record_sha256: digest(r), declared_role: r.declared_role,
        family: r.family, decimal_scale: r.decimal_scale, parameter_index: r.parameter_index,
      } : {kind: "LMFDB", record_sha256: digest(r), url: "https://www.lmfdb.org/NumberField/" + r.label, acquisitions: r.sources},
    };
  }).sort((a, b) => compare(a.id, b.id));
  const observations = summary.records.map((r) => ({...r}));
  const manifest = {
    schema: "sagejs.general-class-unit-corpus.v1", frozen_at: "2026-09-12",
    identity_membership_frozen: true, performance_qualified: false, m0_complete: false,
    plan_sha256: "aceadd86d81f796740e9fa1e02c5d1a57854453ecc0d1774f3f09bf2dcd14403",
    authorized_milestones: ["M0", "M1", "M2", "M3", "M4", "M5"], optimization_campaign_limit: 12,
    coverage_sha256: hash(jsonl(fields)), observations_sha256: hash(jsonl(observations)),
    source_pins: PINS, selection_uses_sagejs_results: false,
    signature_quotas: selection.quotas, smoke_seed: SEED, smoke_ids: smokeIds(fields),
    discovery_at_least_one_second: summary.selection_witness.one,
    discovery_at_least_ten_seconds: summary.selection_witness.ten,
    identity_evidence: "2954 exact PARI nfisisom negative pairs; other pairs separated by source/reference field metadata. Not independent maximal-order certificates.",
    generated_admission: "48 exact Eisenstein/Sturm presentations,35 development/13 initial-reference-only holdout;32 explicitly development-only entries stay in development.",
    holdout_policy: "Do not execute or tune Sage.js on holdouts before candidate freeze; reference-only observation is not algorithm development. Smoke uses development only.",
    request_caps: {coverage: {wall_seconds: 600, memory_bytes: 4294967296}, stress: {wall_seconds: 1800, memory_bytes: 17179869184}},
    incomplete: ["Matched100/200-bit complete-request baselines and repeat/batch qualification", "90 additional stress identities and90 unconditional reference cases", "Complete M0 capability/phase report and M1 smoke outcomes", "Public custody of full raw source/reference evidence archive"],
    cost_caveats: ["Single-sample cost discovery, not qualified comparison", "PARI working precision differs from Hecke regulator enclosure accuracy", "Panel98 observed apt process only after runs; overlap unknown", "All87 prior unpaired discovery identities remain in observations.jsonl"],
  };
  validate(fields, manifest, observations);
  return {fields, manifest, observations};
}

function load(directory = __dirname) {
  const rows = (name) => fs.readFileSync(path.join(directory, name), "utf8").trimEnd().split("\n").map(JSON.parse);
  const fields = rows("coverage.jsonl"), observations = rows("observations.jsonl");
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json")));
  validate(fields, manifest, observations);
  return {fields, manifest, observations};
}

function requests(data, set = "smoke") {
  assert.ok(["smoke", "development", "development-performance"].includes(set), "holdouts require a separate candidate-freeze authorization");
  validate(data.fields, data.manifest, data.observations);
  const smoke = new Set(data.manifest.smoke_ids);
  return data.fields.filter((r) => set === "smoke" ? smoke.has(r.id) : r.role === "development" && (set === "development" || r.performance))
    .map((r) => ({label: r.id, coefficients: r.coefficients.slice()}));
}

if (require.main === module) {
  const mode = process.argv[2];
  if (mode === "build") {
    const {fields, manifest, observations} = build(process.argv[3]);
    for (const [name, bytes] of Object.entries({"coverage.jsonl": jsonl(fields), "observations.jsonl": jsonl(observations), "manifest.json": JSON.stringify(manifest, null, 2) + "\n"})) {
      const target = path.join(__dirname, name);
      if (fs.existsSync(target)) assert.equal(fs.readFileSync(target, "utf8"), bytes, "immutable freeze drift");
      else fs.writeFileSync(target, bytes, {flag: "wx"});
    }
  } else if (mode === "requests") console.log(JSON.stringify(requests(load(), process.argv[3] || "smoke")));
  else { assert.equal(mode, "check"); const data = load(); console.log(JSON.stringify(validate(data.fields, data.manifest, data.observations))); }
}
module.exports = {hash, digest, jsonl, build, load, validate, smokeIds, requests};

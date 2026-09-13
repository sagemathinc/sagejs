// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const api = require("./export.cjs");
const P = ["-5", "0", "1"];
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-exposure-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifest = { schema: api.MANIFEST_SCHEMA, sources: [] };
  const put = (name, value) => {
    const bytes = Buffer.from(typeof value === "string" ? value : JSON.stringify(value));
    fs.writeFileSync(path.join(root, name), bytes);
    return { path: name, sha256: api.sha256(bytes) };
  };
  const source = (id, category = "prior-sage-exposure", records = [{ id: "field", coefficients: P }]) => {
    const descriptor = { id, category, kind: "explicit-presentations-v1",
      ...put(`${id}.json`, { schema: "sagejs.general-frontier/exposure-presentations-v1", records }) };
    manifest.sources.push(descriptor);
    return descriptor;
  };
  const candidates = (records) => { manifest.candidates = put("candidates.json", { schema: "sagejs.general-frontier/exposure-candidates-v1", records }); };
  return { root, manifest, put, source, candidates, run: () => api.exportInventory(manifest, root) };
}

test("exact coefficient normalization preserves giant integers", () => {
  assert.deepEqual(api.coefficients(["-123456789012345678901234567890", 0, "1"]), ["-123456789012345678901234567890", "0", "1"]);
  for (const value of [9007199254740992, "01", "+1", "1e3", "-0", 1.5, null]) assert.throws(() => api.coefficients([value, "1"]), /exact integer/);
  assert.throws(() => api.coefficients([1, 0]), /trailing zero/);
});
test("malformed labels and degree contradictions fail closed", () => {
  for (const label of ["filename:3.1.23.1", "3.2.23.1", "3.1.23.1.extra", "2.2.0.1"]) assert.throws(() => api.normalizeRecord({ label }, 0), /label/);
  assert.throws(() => api.normalizeRecord({ label: "3.1.23.1", coefficients: P }, 0), /degree mismatch/);
});
test("unknown manifest schema and keys fail closed", (t) => {
  const f = fixture(t); f.source("one");
  assert.throws(() => api.exportInventory({ ...f.manifest, schema: "future" }, f.root), /unknown manifest/);
  assert.throws(() => api.exportInventory({ ...f.manifest, guess: true }, f.root), /unknown or missing/);
});
test("unknown source kind, category and payload schema fail closed", (t) => {
  const f = fixture(t), s = f.source("one");
  s.kind = "future"; assert.throws(f.run, /unknown source kind/);
  s.kind = "explicit-presentations-v1"; s.category = "apparently-unseen"; assert.throws(f.run, /category/);
  s.category = "prior-sage-exposure";
  Object.assign(s, f.put("one.json", { schema: "future", records: [] }));
  assert.throws(f.run, /unknown explicit/);
});
test("raw-source hashes are mandatory and checked", (t) => {
  const f = fixture(t); f.source("one");
  fs.appendFileSync(path.join(f.root, "one.json"), " ");
  assert.throws(f.run, /hash mismatch/);
});
test("historical union cannot be supplied with a replacement hash", () => {
  assert.throws(() => api.decodeSource({ kind: "historical-3259-labels", category: "historical-quarantine" }, Buffer.from("3.1.23.1\n")), /pinned SHA256/);
});
test("duplicate source identities are rejected", (t) => {
  const f = fixture(t); f.source("one"); f.manifest.sources.push({ ...f.manifest.sources[0] });
  assert.throws(f.run, /duplicate source id/);
});
test("source descriptor ordering does not affect inventory digest", (t) => {
  const f = fixture(t); f.source("z"); f.source("a", "reference-only");
  const before = f.run(); f.manifest.sources.reverse();
  assert.deepEqual(f.run(), before);
});
test("record ordering preserves semantic evidence but changes raw provenance", (t) => {
  const f = fixture(t), rows = [{ coefficients: P }, { coefficients: ["-2", "0", "1"] }];
  const s = f.source("one", "prior-sage-exposure", rows);
  const before = f.run();
  Object.assign(s, f.put("one.json", { schema: "sagejs.general-frontier/exposure-presentations-v1", records: rows.reverse() }));
  const after = f.run();
  assert.deepEqual(after.records, before.records);
  assert.notEqual(after.inventory_sha256, before.inventory_sha256);
});
test("reference and selection-only matches never assert unseen or eligible", (t) => {
  const f = fixture(t); f.source("one", "reference-only"); f.source("two", "selection-only");
  f.candidates([{ id: "seen-by-reference", coefficients: P }, { id: "unlisted", coefficients: ["-7", "0", "1"] }]);
  for (const c of f.run().candidates) { assert.equal(c.prior_sage_exposure, null); assert.equal(c.holdout_eligible, null); }
  assert.equal(f.run().candidates.find((r) => r.id === "unlisted").exposure_status, "unknown");
});
test("exact coefficients propagate prior exposure to another asserted label", (t) => {
  const f = fixture(t); f.source("one", "prior-sage-exposure", [{ label: "2.2.5.1", coefficients: P }]);
  f.candidates([{ id: "alias", coefficients: P }]);
  const c = f.run().candidates[0];
  assert.equal(c.prior_sage_exposure, true); assert.equal(c.holdout_eligible, false);
  assert.match(c.same_field_reconciliation, /pending/);
});
test("label-only matches are source assertions, not independent field certification", (t) => {
  const f = fixture(t); f.source("one", "historical-quarantine", [{ label: "2.2.5.1" }]);
  f.candidates([{ id: "a", label: "2.2.5.1", coefficients: P }]);
  const out = f.run();
  assert.equal(out.candidates[0].holdout_eligible, false);
  assert.equal(out.candidates[0].prior_sage_exposure, null);
  assert.equal(out.records[0].label_status, "source-asserted-not-independently-verified");
  assert.equal(out.distinct_fields, null);
});
test("different presentations of the same quadratic remain unresolved", (t) => {
  const f = fixture(t); f.source("one");
  f.candidates([{ id: "shifted", coefficients: ["-1", "-1", "1"] }]);
  const c = f.run().candidates[0];
  assert.equal(c.exposure_status, "unknown"); assert.equal(c.holdout_eligible, null);
});
test("duplicate labels retain multiple presentations without counting fields", (t) => {
  const f = fixture(t); f.source("one", "historical-quarantine", [{ label: "2.2.5.1", coefficients: P }, { label: "2.2.5.1", coefficients: ["-1", "-1", "1"] }]);
  const out = f.run(); assert.equal(out.counts.source_asserted_labels, 1); assert.equal(out.counts.distinct_coefficient_arrays, 2); assert.equal(out.distinct_fields, null);
});
test("declared invalid inputs are retained and quarantined", (t) => {
  const f = fixture(t); f.source("invalid", "reference-only", [{ id: "reducible", coefficients: ["-1", "0", "0", "0", "1"], invalid: true }, { id: "nonmonic", coefficients: [1, 0, 2], invalid: true }]);
  f.candidates([{ id: "reducible", coefficients: ["-1", "0", "0", "0", "1"] }]);
  const out = f.run(); assert.equal(out.counts.declared_invalid_records, 2); assert.equal(out.candidates[0].holdout_eligible, false);
});
test("candidate schemas, duplicate IDs, and malformed rows are rejected", (t) => {
  const f = fixture(t); f.source("one"); f.candidates([{ id: "a", coefficients: P }, { id: "a", coefficients: P }]);
  assert.throws(f.run, /duplicate candidate/);
  f.manifest.candidates = f.put("candidates.json", { schema: "future", records: [] });
  assert.throws(f.run, /unknown candidate/);
  f.candidates([{ id: "a", coefficients: P, holdout_eligible: true }]);
  assert.throws(f.run, /unknown or missing/);
  f.manifest.sources[0] = { ...f.manifest.sources[0], ...f.put("one.json", { schema: "sagejs.general-frontier/exposure-presentations-v1", records: [null] }) };
  assert.throws(f.run, /expected object/);
});
test("all tracked inventory fixture adapters export offline", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "historical-sources.local.json")));
  manifest.sources = manifest.sources.filter((s) => !path.isAbsolute(s.path));
  const out = api.exportInventory(manifest, __dirname);
  assert.equal(out.counts.sources, 8); assert.equal(out.counts.evidence_records, 713);
  assert.equal(out.counts.declared_invalid_records, 2);
  assert.equal(out.records.filter((r) => r.source_id === "maximal-order505" && r.degree >= 2 && r.degree <= 10).length, 365);
  assert.equal(out.records.filter((r) => r.source_id === "quadratic14").length, 14);
});
test("tracked fixture schema/version changes are not silently accepted", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "historical-sources.local.json")));
  for (const source of manifest.sources.filter((s) => !path.isAbsolute(s.path))) {
    const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, source.path)));
    if (data.schema !== undefined) data.schema = "future-schema";
    else if (data.schemaVersion !== undefined) data.schemaVersion = 999;
    else data.schema_version = 999;
    assert.throws(() => api.decodeSource(source, Buffer.from(JSON.stringify(data))), /unknown/, source.id);
  }
});
test("source signature and nested coefficient degree contradictions fail", () => {
  assert.throws(() => api.normalizeRecord({ label: "2.2.5.1", signature: [0, 1], coefficients: P }, 0), /signature mismatch/);
  assert.throws(() => api.normalizeRecord({ polynomial: { coefficientOrder: "ascending", coefficients: P, degree: 3 } }, 0), /nested polynomial degree/);
});
test("candidates require explicit nonempty IDs and coefficient arrays even with labels", (t) => {
  const f = fixture(t); f.source("one");
  for (const id of [null, "", 42]) {
    f.candidates([{ id, label: "2.2.5.1", coefficients: P }]);
    assert.throws(f.run, /candidate id/);
  }
  for (const coefficients of [null, "-5,0,1", { coefficientOrder: "ascending", coefficients: P }]) {
    f.candidates([{ id: "a", label: "2.2.5.1", coefficients }]);
    assert.throws(f.run, /candidate coefficients must be an array/);
  }
  f.candidates([{ id: null, label: "2.2.5.1", coefficients: null }]);
  assert.throws(f.run, /candidate id/);
});
test("label-only records cannot contradict their declared degree", () => {
  assert.throws(() => api.normalizeRecord({ label: "2.2.5.1", degree: 3 }, 0), /degree mismatch/);
  assert.throws(() => api.normalizeRecord({ label: "2.2.5.1", degree: "2" }, 0), /degree mismatch/);
  assert.equal(api.normalizeRecord({ label: "2.2.5.1", degree: 2 }, 0).degree, 2);
});
test("polynomial aliases cannot silently compete, even if equal", () => {
  for (const polynomial of [["-2", "0", "1"], P, null]) {
    assert.throws(() => api.normalizeRecord({ coefficients: P, polynomial }, 0), /competing coefficients\/polynomial aliases/);
  }
  assert.throws(() => api.normalizeRecord({ label: "2.2.5.1", coefficients: null }, 0), /coefficients must be an array/);
  assert.throws(() => api.normalizeRecord({ label: "2.2.5.1", polynomial: null }, 0), /polynomial cannot be null/);
});
test("CLI publishes exclusively and never overwrites an inventory", (t) => {
  const f = fixture(t); f.source("one"); f.put("manifest.json", f.manifest);
  const output = path.join(f.root, "out.json");
  const args = [path.join(__dirname, "export.cjs"), "--manifest", path.join(f.root, "manifest.json"), "--output", output];
  const a = spawnSync(process.execPath, args, { encoding: "utf8" }); assert.equal(a.status, 0, a.stderr);
  const original = fs.readFileSync(output); const b = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.notEqual(b.status, 0); assert.deepEqual(fs.readFileSync(output), original);
});

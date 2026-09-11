// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const api = require("./candidate-pool.cjs");

function rawRow(overrides = {}) {
  return {
    label: "3.1.23.1", degree: 3, coeffs: ["-1", "-1", "0", "1"],
    r2: 1, disc_sign: -1, disc_abs: "23", disc_rad: "23", index: "1",
    monogenic: 1, galt: 2, galois_label: "3T2", num_ram: 1,
    class_number: "1", class_group: [], regulator: "0.28119957432296",
    torsion_order: 2, used_grh: true, narrow_class_number: null,
    narrow_class_group: null, unit_signature_rank: null,
    ...overrides,
  };
}
function cell(channel = "all") { return api.cells().find((item) => item.id === `n3-r2-1-d0-${channel}`); }
function sampleRows(count = 15) {
  return Array.from({ length: count }, (_, i) => rawRow({ label: `3.1.${23 + i}.1`, disc_abs: String(23 + i) }));
}
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-general-candidates-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("policy spans all 34 signatures and eight discriminant bands with null-h channels", () => {
  assert.equal(new Set(api.cells().map((item) => `${item.degree}:${item.r2}`)).size, 34);
  assert.equal(api.cells().length, 544);
  assert.equal(api.POLICY.state, "candidate-pool-only-reference-timeband-selection-pending");
  assert.equal(api.POLICY.selection_uses_sagejs_results, false);
  assert.ok(2 * 8 * api.POLICY.selected_per_cell >= 200);
  assert.throws(() => api.POLICY.degrees.push(11), TypeError);
  for (let i = 0; i < 7; i += 1) {
    const bands = api.cells().filter((item) => item.degree === 2 && item.r2 === 0 && item.channel === "all");
    assert.equal(bands[i].upper_exclusive, bands[i + 1].lower_inclusive);
  }
});

test("normalization preserves null metadata and giant exact coefficient strings", () => {
  const huge = "9".repeat(400);
  const raw = rawRow({ coeffs: [huge, `-${huge}`, "0", "1"], class_number: null,
    class_group: null, regulator: null, index: null, torsion_order: null, used_grh: null });
  const record = api.normalizeRow(raw);
  assert.equal(record.coefficients[0], huge);
  assert.equal(record.class_number, null);
  assert.equal(record.class_group, null);
  assert.equal(record.regulator, null);
  assert.equal(record.equation_order_index, null);
  assert.deepEqual(record.signature, [1, 1]);
  assert.equal(record.unit_rank, 1);
  assert.equal(api.normalizeRow(rawRow({ regulator: "2.4e+5000" })).regulator, "2.4e+5000");
  assert.equal(api.normalizeRow(rawRow({ monogenic: -1 })).monogenic, -1);
});

test("normalization validates all degrees and label signature/discriminant identity", () => {
  for (const degree of api.POLICY.degrees) for (let r2 = 0; r2 <= Math.floor(degree / 2); r2 += 1) {
    const raw = rawRow({ degree, r2, label: `${degree}.${degree - 2 * r2}.23.1`,
      disc_sign: r2 % 2 ? -1 : 1, coeffs: ["-1", ...Array(degree - 1).fill("0"), "1"] });
    assert.equal(api.normalizeRow(raw).unit_rank, degree - r2 - 1);
  }
  for (const bad of [rawRow({ label: "3.3.23.1" }), rawRow({ disc_abs: "24" }), rawRow({ disc_sign: 1 })]) {
    assert.throws(() => api.normalizeRow(bad));
  }
});

test("malformed rows fail without implicit numeric conversions or missing/null conflation", () => {
  const malformed = [
    { ...rawRow(), extra: 1 }, rawRow({ coeffs: [-1, -1, 0, 1] }),
    rawRow({ coeffs: ["-1", "-1", "00", "1"] }), rawRow({ coeffs: ["-1", "-1", "0", "2"] }),
    rawRow({ class_number: 1 }), rawRow({ class_number: "0" }),
    rawRow({ class_group: ["2"] }), rawRow({ class_group: ["1"] }),
    rawRow({ regulator: "NaN" }), rawRow({ regulator: "-1" }),
    rawRow({ used_grh: "true" }), rawRow({ torsion_order: 0 }),
    rawRow({ label: "3.01.23.1" }), rawRow({ label: "3.1.23.1';DROP TABLE nf_fields" }),
    rawRow({ galois_label: "unsafe\nlabel" }), rawRow({ index: "1.0" }),
    rawRow({ monogenic: 2 }),
  ];
  const missing = rawRow(); delete missing.class_number; malformed.push(missing);
  malformed.forEach((raw) => assert.throws(() => api.normalizeRow(raw)));
  assert.equal(api.normalizeRow(rawRow({ class_number: null, class_group: ["2"] })).class_number, null);
});

test("SQL has bounded numeric windows, literal safe cells, and preserves null class groups", () => {
  const sql = api.selectionSql(cell());
  assert.match(sql, /LIMIT 128/);
  assert.match(sql, /f\.disc_abs >= 1\n    AND f\.disc_abs < 1000000/);
  assert.match(sql, /ORDER BY f\.disc_abs, f\.label COLLATE "C"/);
  assert.match(sql, /CASE WHEN f\.class_group IS NULL THEN NULL ELSE/);
  assert.doesNotMatch(sql, /class_number IS NOT NULL/);
  assert.match(api.selectionSql(cell("missing-h")), /AND f\.class_number IS NULL/);
  assert.throws(() => api.selectionSql({ ...cell(), lower_inclusive: "0;DELETE" }));
});

test("window validation rejects duplicates, overflow, wrong degree, band, or missing-h channel", () => {
  assert.throws(() => api.validateWindow([rawRow(), rawRow()], cell()), /duplicate/);
  assert.throws(() => api.validateWindow(sampleRows(129), cell()), /row cap/);
  assert.throws(() => api.validateWindow([rawRow()], cell("missing-h")), /outside/);
  assert.throws(() => api.validateWindow([rawRow({ label: "3.1.1000000.1", disc_abs: "1000000" })], cell()), /outside/);
});

test("seeded selection, source hashes and pool are independent of input order", () => {
  const rows = sampleRows(65);
  const exportIdentity = api.identity();
  assert.deepEqual(api.selectedRows(rows, cell()), api.selectedRows([...rows].reverse(), cell()));
  assert.equal(api.selectedRows(rows, cell()).length, 40);
  const first = api.receipt(cell(), rows, exportIdentity);
  const second = api.receipt(cell(), [...rows].reverse(), exportIdentity);
  assert.equal(first.raw_rows_sha256, second.raw_rows_sha256);
  const otherCell = api.cells().find((item) => item.id === "n2-r2-0-d0-all");
  const empty = api.receipt(otherCell, [], exportIdentity);
  assert.deepEqual(api.assemble(exportIdentity, [first, empty]), api.assemble(exportIdentity, [empty, first]));
});

test("exposure exclusions are sorted/deduplicated and applied before bounded selection", () => {
  const rows = sampleRows(65);
  const excluded = rows.slice(0, 3).map((raw) => raw.label);
  assert.deepEqual(api.identity([...excluded, excluded[0]]), api.identity([...excluded].reverse()));
  assert.equal(api.selectedRows(rows, cell(), excluded).length, 40);
  assert.ok(api.selectedRows(rows, cell(), excluded).every((raw) => !excluded.includes(raw.label)));
  assert.throws(() => api.exclusions(["3.1.23.1; SELECT 1"]));
});

test("historical exposure marks development-only candidates without discarding them", () => {
  const exportIdentity = api.identity([], null, ["3.1.23.1", "3.1.23.1"]);
  assert.deepEqual(exportIdentity.exposed_labels, ["3.1.23.1"]);
  const pool = api.assemble(exportIdentity, [api.receipt(cell(), [rawRow()], exportIdentity)]);
  assert.equal(pool.selected_count, 1);
  assert.equal(pool.records[0].exposure, "historically-exposed-development-only");
  assert.equal(pool.records[0].holdout_eligible, false);
  assert.equal(pool.records[0].final_role, null);
  const unreviewedIdentity = api.identity();
  const unreviewed = api.assemble(unreviewedIdentity, [api.receipt(cell(), [rawRow()], unreviewedIdentity)]);
  assert.equal(unreviewed.records[0].holdout_eligible, null);
});

test("duplicate labels across channels merge provenance; differing raw source rows fail", () => {
  const exportIdentity = api.identity();
  const raw = rawRow({ class_number: null, class_group: null, regulator: null });
  const all = api.receipt(cell(), [raw], exportIdentity);
  const missing = api.receipt(cell("missing-h"), [raw], exportIdentity);
  const pool = api.assemble(exportIdentity, [all, missing]);
  assert.equal(pool.selected_count, 1);
  assert.equal(pool.records[0].source_cells.length, 2);
  assert.equal(pool.records[0].final_role, null);
  assert.equal(pool.records[0].reference_time_band, "pending");
  const available = pool.availability_by_degree.find((entry) => entry.degree === 3);
  assert.equal(available.distinct_labels, 1);
  assert.equal(available.missing_class_number, 1);
  assert.equal(available.candidate_shortfall_to_coverage_count, 199);
  assert.equal(available.final_selection_qualified, false);
  const changed = api.receipt(cell("missing-h"), [{ ...raw, regulator: "5" }], exportIdentity);
  assert.throws(() => api.assemble(exportIdentity, [all, changed]), /source changed/);
  assert.throws(() => api.assemble(exportIdentity, [all, all]), /duplicate cell attempt/);
});

test("receipt hashes bind raw source, selection SQL, status, and campaign/exclusions", () => {
  const exportIdentity = api.identity();
  const original = api.receipt(cell(), [rawRow()], exportIdentity);
  assert.equal(api.validateReceipt(original, exportIdentity), original);
  assert.throws(() => api.validateReceipt({ ...original, status: "empty" }, exportIdentity), /digest/);
  assert.throws(() => api.validateReceipt(original, api.identity(["3.1.23.1"])), /identity/);
  const forged = { ...original, selected_labels: [] };
  delete forged.receipt_sha256; forged.receipt_sha256 = api.digest(forged);
  assert.throws(() => api.validateReceipt(forged, exportIdentity), /projection/);
});

test("campaign binding accepts parent contract but rejects inconsistent selection semantics", () => {
  const campaign = { schema: "sagejs.general-class-unit-campaign.v1", corpus: {
    seed: api.POLICY.seed, degrees: api.POLICY.degrees,
    coverage_per_degree: api.POLICY.coverage_targets_per_degree,
    performance_per_degree: api.POLICY.performance_targets_per_degree,
    performance_minimum_reference_one_second: api.POLICY.minimum_reference_one_second,
    performance_minimum_reference_ten_seconds: api.POLICY.minimum_reference_ten_seconds,
    missing_class_numbers_allowed: true, selection_uses_sagejs_results: false,
  } };
  const exportIdentity = api.identity([], campaign);
  assert.equal(exportIdentity.campaign_sha256, api.digest(campaign));
  assert.equal(api.assemble(exportIdentity, []).selected_count, 0);
  assert.throws(() => api.identity([], { ...campaign, corpus: { ...campaign.corpus, missing_class_numbers_allowed: false } }));
});

test("query client caps time/bytes, forces read-only, and never puts credentials in arguments", () => {
  let observed;
  const query = api.queryCell(cell(), (command, args, options) => {
    observed = { command, args, options };
    return { status: 0, stdout: `${JSON.stringify(rawRow())}\n` };
  }, { LMFDB_PGPASSWORD: "never-print-this-password", PGOPTIONS: "untrusted" });
  assert.equal(query.failure, null);
  assert.equal(query.rows.length, 1);
  assert.equal(observed.command, "psql");
  assert.equal(observed.options.timeout, 30000);
  assert.equal(observed.options.maxBuffer, 8 * 1024 * 1024);
  assert.match(observed.options.env.PGOPTIONS, /default_transaction_read_only=on -c statement_timeout=20000/);
  assert.equal(observed.options.env.PGPASSWORD, "never-print-this-password");
  assert.ok(observed.args.every((argument) => !argument.includes("never-print-this-password")));
});

test("query failures are explicit, credential-free, and distinct from empty cells", () => {
  const attempts = [
    [{ error: { code: "ENOENT" } }, "client-unavailable"],
    [{ error: { code: "ETIMEDOUT" } }, "query-timeout"],
    [{ error: { code: "ENOBUFS" } }, "response-cap"],
    [{ status: 1, stderr: "server secret: statement timeout" }, "query-timeout"],
    [{ status: 1, stderr: "server secret: connection refused" }, "query-error"],
    [{ status: 0, stdout: "not JSON" }, "malformed-response"],
    [{ status: 0, stdout: `${JSON.stringify({ ...rawRow(), class_number: 1 })}\n` }, "malformed-response"],
  ];
  for (const [response, failure] of attempts) {
    assert.deepEqual(api.queryCell(cell(), () => response, {}), { rows: [], failure });
  }
  assert.deepEqual(api.queryCell(cell(), () => ({ status: 0, stdout: "" }), {}), { rows: [], failure: null });
  assert.deepEqual(api.queryCell(cell(), () => { throw new Error("secret connection value"); }, {}), { rows: [], failure: "query-error" });
});

test("resume pins completed/empty cells, records retries, and honors invocation query cap", (t) => {
  const directory = temporary(t);
  const exportIdentity = api.identity();
  let calls = 0;
  const query = () => { calls += 1; return { rows: [], failure: "query-timeout" }; };
  const first = api.fetchCells(directory, exportIdentity, [cell().id], 1, false, query);
  assert.equal(first.queried, 1);
  assert.equal(first.pool.cells.find((item) => item.cell_id === cell().id).status, "error");
  api.fetchCells(directory, exportIdentity, [cell().id], 1, false, query);
  assert.equal(calls, 1);
  api.fetchCells(directory, exportIdentity, [cell().id], 1, true, () => ({ rows: [rawRow()], failure: null }));
  const loaded = api.loadExport(directory);
  assert.equal(loaded.receipts.length, 2);
  assert.equal(loaded.pool.selected_count, 1);
  api.fetchCells(directory, exportIdentity, [cell().id], 1, true, query);
  assert.equal(calls, 1);
  assert.equal(api.fetchCells(directory, exportIdentity, [], 2, false, () => ({ rows: [], failure: null })).queried, 2);
  assert.throws(() => api.fetchCells(directory, api.identity(["3.1.23.1"]), [], 1, false, query), /identity changed/);
  assert.throws(() => api.fetchCells(directory, exportIdentity, [], 35), /1–34/);
});

test("directory locks prevent parallel writers and offline check detects pool tampering", (t) => {
  const directory = temporary(t);
  const exportIdentity = api.identity();
  api.fetchCells(directory, exportIdentity, [cell().id], 1, false, () => ({ rows: [], failure: null }));
  fs.writeFileSync(path.join(directory, "fetch.lock"), "");
  assert.throws(() => api.fetchCells(directory, exportIdentity, [], 1), /EEXIST/);
  fs.unlinkSync(path.join(directory, "fetch.lock"));
  const poolPath = path.join(directory, "pool.json");
  const pool = JSON.parse(fs.readFileSync(poolPath));
  pool.selected_count = 999;
  fs.writeFileSync(poolPath, JSON.stringify(pool));
  assert.throws(() => api.main(["check", "--directory", directory]), /pool projection/);
});

test("changed source contents within retry history remain visible rather than silently overwritten", () => {
  const exportIdentity = api.identity();
  const first = api.receipt(cell(), [rawRow()], exportIdentity);
  const later = api.receipt(cell(), [rawRow({ regulator: "2" })], exportIdentity, 2);
  assert.throws(() => api.assemble(exportIdentity, [first, later]), /source changed/);
});

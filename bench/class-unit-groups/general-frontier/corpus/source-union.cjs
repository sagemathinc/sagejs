#!/usr/bin/env node
"use strict";

// Offline membership/provenance union, not mathematical qualification.
const fs = require("node:fs");
const path = require("node:path");
const base = require("./candidate-pool.cjs");
const hard = require("./hard-windows.cjs");
const same = (a, b) => base.canonicalJson(a) === base.canonicalJson(b);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const fail = (message) => { throw new Error(message); };

function snapshot(filename, expected) {
  const bytes = fs.readFileSync(filename);
  if (!same(JSON.parse(bytes.toString("utf8")), expected)) fail(`source snapshot changed or projection mismatch: ${filename}`);
  return base.sha256(bytes);
}

function buildUnion(v2Directory, hardDirectory) {
  const v2 = base.loadExport(v2Directory);
  const v2IdentityHash = snapshot(path.join(v2Directory, "export.json"), v2.exportIdentity);
  const v2PoolHash = snapshot(path.join(v2Directory, "pool.json"), v2.pool);
  const hp = hard.replay(hardDirectory);
  const hardIdentity = hard.validateManifest(JSON.parse(fs.readFileSync(path.join(hardDirectory, "manifest.json"), "utf8")));
  if (hardIdentity.manifest_sha256 !== hp.manifest_sha256) fail("hard-window manifest changed during replay");
  const hardIdentityHash = snapshot(path.join(hardDirectory, "manifest.json"), hardIdentity);
  const records = new Map();

  function add(raw, normalized, provenance, historicallyExposed) {
    const fields = base.normalizeRow(raw);
    if (Object.entries(fields).some(([key, value]) => !same(value, normalized[key]))) fail(`source record projection mismatch: ${fields.label}`);
    if (base.digest(raw) !== provenance.source_row_sha256) fail(`raw source hash mismatch: ${fields.label}`);
    const earlier = records.get(fields.label);
    if (earlier) {
      const conflicts = Object.keys(fields).filter((key) => !same(fields[key], earlier.fields[key]));
      if (conflicts.length) fail(`duplicate label metadata disagreement: ${fields.label}: ${conflicts.join(", ")}`);
      earlier.sources.push(provenance);
      earlier.historicallyExposed ||= historicallyExposed;
    } else records.set(fields.label, { fields, sources: [provenance], historicallyExposed });
  }

  const latest = new Map();
  for (const item of v2.receipts) {
    const previous = latest.get(item.cell.id);
    if (!previous || previous.attempt < item.attempt) latest.set(item.cell.id, item);
  }
  for (const record of v2.pool.records) {
    if (!record.source_cells.length) fail(`missing v2 source membership: ${record.label}`);
    for (const cell of record.source_cells) {
      const item = latest.get(cell);
      const raw = item?.raw_rows.find((r) => r.label === record.label);
      if (!raw || !item.selected_labels.includes(record.label)) fail(`missing selected v2 source: ${record.label}`);
      add(raw, record, {
        source_kind: "candidate-pool-v2", acquisition_sha256: v2.pool.export_sha256,
        acquisition_pool_sha256: v2.pool.pool_sha256, cell_id: cell, attempt: item.attempt,
        source_row_sha256: record.source_row_sha256, source_receipt_sha256: item.receipt_sha256,
      }, record.holdout_eligible === false || record.exposure === "historically-exposed-development-only");
    }
  }
  for (const record of hp.records) {
    const item = JSON.parse(fs.readFileSync(path.join(hardDirectory, `${record.source_window}.receipt.json`), "utf8"));
    const dispatch = JSON.parse(fs.readFileSync(path.join(hardDirectory, `${record.source_window}.dispatch.json`), "utf8"));
    hard.validateReceipt(item, dispatch, hardIdentity);
    if (item.receipt_sha256 !== record.source_receipt_sha256) fail("hard-window receipt changed during replay");
    const raw = item.raw_rows.find((r) => r.label === record.label);
    if (!raw || !item.selected_labels.includes(record.label)) fail(`missing selected hard-window source: ${record.label}`);
    add(raw, record, {
      source_kind: "hard-window-v1", acquisition_sha256: hp.manifest_sha256,
      acquisition_pool_sha256: hp.pool_sha256, window_id: record.source_window,
      source_row_sha256: record.source_row_sha256, source_receipt_sha256: item.receipt_sha256,
      source_dispatch_sha256: item.ticket_sha256,
    }, false);
  }

  const ordered = [...records.values()].map(({ fields, sources, historicallyExposed }) => {
    sources.sort((a, b) => compare(base.canonicalJson(a), base.canonicalJson(b)));
    if (new Set(sources.map((s) => base.digest(s))).size !== sources.length) fail(`duplicate provenance: ${fields.label}`);
    return { ...fields, source_kind: "validated-source-union-v1", sources,
      exposure: historicallyExposed ? "historically-exposed-development-only" : "exposure-audit-pending",
      holdout_eligible: historicallyExposed ? false : null,
      reference_time_band: "pending", final_role: null };
  }).sort((a, b) => a.degree - b.degree ||
    (BigInt(a.discriminant_absolute) < BigInt(b.discriminant_absolute) ? -1 :
      BigInt(a.discriminant_absolute) > BigInt(b.discriminant_absolute) ? 1 : compare(a.label, b.label)));

  const body = {
    schema: "sagejs.general-class-unit-source-union.v1", source_kind: "validated-source-union-v1",
    source: base.SOURCE, qualification_evidence: false, independent_replay: false,
    producer_sha256: base.sha256(fs.readFileSync(__filename)),
    selection_uses_sagejs_results: false, frozen: false,
    state: "validated-source-membership-only-selection-pending",
    acquisitions: [
      { source_kind: "candidate-pool-v2", acquisition_sha256: v2.pool.export_sha256,
        identity_file_sha256: v2IdentityHash, pool_sha256: v2.pool.pool_sha256,
        pool_file_sha256: v2PoolHash, cells: v2.pool.cells, selected_count: v2.pool.records.length },
      { source_kind: "hard-window-v1", acquisition_sha256: hp.manifest_sha256,
        identity_file_sha256: hardIdentityHash, pool_sha256: hp.pool_sha256,
        windows: hp.windows, selected_count: hp.records.length },
    ],
    duplicate_label_count: ordered.filter((r) => new Set(r.sources.map((s) => s.source_kind)).size > 1).length,
    records: ordered, selected_count: ordered.length, records_sha256: base.digest(ordered),
    distinctness: "Exact normalized metadata agreement for duplicate LMFDB labels; no field-isomorphism proof for distinct labels or generated presentations",
  };
  return { ...body, union_sha256: base.digest(body) };
}

function main(argv) {
  argv = [...argv];
  if (!argv.length || argv[0] === "--help") {
    console.log("Usage: source-union.cjs --v2-directory DIR --hard-directory DIR --output NEW.json\nOffline validation and immutable union; no eligibility or final selection implied."); return;
  }
  const options = {};
  while (argv.length) {
    const key = argv.shift(), value = argv.shift();
    if (!["--v2-directory", "--hard-directory", "--output"].includes(key) || options[key] || !value || value.startsWith("--")) fail("unknown, duplicate or incomplete option");
    options[key] = value;
  }
  if (Object.keys(options).length !== 3) fail("both source directories and new output are required");
  const requested = path.resolve(options["--output"]);
  const output = path.join(fs.realpathSync(path.dirname(requested)), path.basename(requested));
  for (const key of ["--v2-directory", "--hard-directory"]) {
    const relative = path.relative(fs.realpathSync(options[key]), output);
    if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) fail("union output must be outside source acquisition directories");
  }
  const union = buildUnion(options["--v2-directory"], options["--hard-directory"]);
  hard.immutableJson(output, union);
  console.log(JSON.stringify({ schema: union.schema, selected_count: union.selected_count,
    duplicate_label_count: union.duplicate_label_count, union_sha256: union.union_sha256,
    qualification_evidence: false, frozen: false }));
}
if (require.main === module) { try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { buildUnion, main };

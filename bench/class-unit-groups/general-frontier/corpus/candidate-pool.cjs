#!/usr/bin/env node
"use strict";

// Developer-only data acquisition; no Sage.js or external-CAS computation.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCHEMA = "sagejs.general-class-unit-candidate-pool.v1";
const SEED = "sagejs-general-class-unit-rank-two-2026-09-11-v1";
function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
const POLICY = deepFreeze({
  schema: "sagejs.general-class-unit-candidate-policy.v1",
  seed: SEED,
  degrees: [2, 3, 4, 5, 6, 7, 8, 9, 10],
  discriminant_exponents: [0, 6, 12, 18, 24, 36, 60, 100, 200],
  channels: ["all", "missing-h"],
  window_rows: 128,
  selected_per_cell: 40,
  statement_timeout_ms: 20000,
  connect_timeout_seconds: 8,
  process_timeout_ms: 30000,
  response_byte_cap: 8 * 1024 * 1024,
  max_cells_per_invocation: 34,
  state: "candidate-pool-only-reference-timeband-selection-pending",
  coverage_targets_per_degree: { development: 120, holdout: 80 },
  performance_targets_per_degree: { development: 24, holdout: 16 },
  minimum_reference_one_second: 120,
  minimum_reference_ten_seconds: 40,
  selection_uses_sagejs_results: false,
  window_rule: "First 128 rows by numeric disc_abs then bytewise label in each bounded cell; not a uniform database sample",
});
const SOURCE = Object.freeze({
  provider: "The LMFDB Collaboration",
  dataset: "LMFDB Number Fields",
  table: "nf_fields",
  url: "https://www.lmfdb.org/NumberField/",
  connection_documentation: "https://beta.lmfdb.org/api/options",
  license: "CC-BY-SA-4.0",
  license_url: "https://creativecommons.org/licenses/by-sa/4.0/",
});
const RAW_KEYS = [
  "label", "degree", "coeffs", "r2", "disc_sign", "disc_abs", "disc_rad",
  "index", "monogenic", "galt", "galois_label", "num_ram", "class_number",
  "class_group", "regulator", "torsion_order", "used_grh", "narrow_class_number",
  "narrow_class_group", "unit_signature_rank",
];

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function digest(value) { return sha256(canonicalJson(value)); }
function fail(message) { throw new Error(message); }
function same(left, right) { return canonicalJson(left) === canonicalJson(right); }
function byteCompare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function integerText(value, positive = false) {
  return typeof value === "string" && (positive ? /^[1-9][0-9]*$/ : /^(0|-?[1-9][0-9]*)$/).test(value);
}
function smallInteger(value, lower, upper) {
  return Number.isSafeInteger(value) && value >= lower && value <= upper;
}

function validateLabel(label) {
  if (typeof label !== "string" || !/^(?:[2-9]|10)\.(?:0|[1-9][0-9]*)\.[1-9][0-9]*\.[1-9][0-9]*$/.test(label)) {
    fail("invalid degree-2–10 LMFDB label");
  }
  const [degree, r1] = label.split(".").map(Number);
  if (!smallInteger(r1, 0, degree) || (degree - r1) % 2 || String(r1) !== label.split(".")[1]) {
    fail("invalid LMFDB label signature");
  }
  return label;
}

function normalizeRow(raw) {
  if (!raw || typeof raw !== "object" || !same(Object.keys(raw).sort(), [...RAW_KEYS].sort())) {
    fail("source row has missing or unexpected columns");
  }
  validateLabel(raw.label);
  if (!smallInteger(raw.degree, 2, 10) || !smallInteger(raw.r2, 0, Math.floor(raw.degree / 2))) {
    fail(`${raw.label}: invalid degree/signature`);
  }
  const r1 = raw.degree - 2 * raw.r2;
  const parts = raw.label.split(".");
  if (parts[0] !== String(raw.degree) || parts[1] !== String(r1) || parts[2] !== raw.disc_abs) {
    fail(`${raw.label}: label disagrees with field metadata`);
  }
  if (!Array.isArray(raw.coeffs) || raw.coeffs.length !== raw.degree + 1 ||
      raw.coeffs.at(-1) !== "1" || raw.coeffs.some((value) => !integerText(value))) {
    fail(`${raw.label}: coefficients must be canonical exact monic integer strings`);
  }
  if (!integerText(raw.disc_abs, true) || raw.disc_sign !== (raw.r2 % 2 ? -1 : 1)) {
    fail(`${raw.label}: invalid discriminant`);
  }
  for (const key of ["disc_rad", "index", "class_number", "narrow_class_number"]) {
    if (raw[key] !== null && !integerText(raw[key], true)) fail(`${raw.label}: invalid ${key}`);
  }
  for (const key of ["class_group", "narrow_class_group"]) {
    if (raw[key] !== null && (!Array.isArray(raw[key]) || raw[key].some((v) => !integerText(v, true) || BigInt(v) < 2n))) {
      fail(`${raw.label}: invalid ${key}`);
    }
  }
  for (const [group, order] of [["class_group", "class_number"], ["narrow_class_group", "narrow_class_number"]]) {
    if (raw[group] !== null && raw[order] !== null && raw[group].reduce((a, b) => a * BigInt(b), 1n) !== BigInt(raw[order])) {
      fail(`${raw.label}: ${group} order mismatch`);
    }
  }
  if (raw.regulator !== null && (typeof raw.regulator !== "string" || !/^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(raw.regulator))) {
    fail(`${raw.label}: invalid regulator decimal`);
  }
  if (raw.monogenic !== null && ![-1, 0, 1].includes(raw.monogenic)) fail(`${raw.label}: invalid monogenic code`);
  for (const key of ["galt", "num_ram", "unit_signature_rank"]) {
    if (raw[key] !== null && !smallInteger(raw[key], 0, Number.MAX_SAFE_INTEGER)) fail(`${raw.label}: invalid ${key}`);
  }
  if (raw.torsion_order !== null && !smallInteger(raw.torsion_order, 1, Number.MAX_SAFE_INTEGER)) fail(`${raw.label}: invalid torsion`);
  if (raw.used_grh !== null && typeof raw.used_grh !== "boolean") fail(`${raw.label}: invalid proof flag`);
  if (raw.galois_label !== null && (typeof raw.galois_label !== "string" || !/^[0-9]+T[0-9]+$/.test(raw.galois_label))) {
    fail(`${raw.label}: invalid Galois label`);
  }
  return {
    label: raw.label, degree: raw.degree, coefficients: [...raw.coeffs],
    r1, r2: raw.r2, signature: [r1, raw.r2], unit_rank: raw.degree - raw.r2 - 1,
    discriminant_absolute: raw.disc_abs, discriminant_sign: raw.disc_sign,
    discriminant_radical: raw.disc_rad, equation_order_index: raw.index,
    monogenic: raw.monogenic, galois_transitive_group: raw.galt,
    galois_label: raw.galois_label, ramified_prime_count: raw.num_ram,
    class_number: raw.class_number, class_group: raw.class_group,
    regulator: raw.regulator, torsion_order: raw.torsion_order,
    used_grh: raw.used_grh, narrow_class_number: raw.narrow_class_number,
    narrow_class_group: raw.narrow_class_group, unit_signature_rank: raw.unit_signature_rank,
  };
}

function cells() {
  const result = [];
  for (const degree of POLICY.degrees) for (let r2 = 0; r2 <= Math.floor(degree / 2); r2 += 1) {
    for (let band = 0; band + 1 < POLICY.discriminant_exponents.length; band += 1) {
      for (const channel of POLICY.channels) result.push({
        id: `n${degree}-r2-${r2}-d${band}-${channel}`,
        degree, r2, band, channel,
        lower_inclusive: (10n ** BigInt(POLICY.discriminant_exponents[band])).toString(),
        upper_exclusive: (10n ** BigInt(POLICY.discriminant_exponents[band + 1])).toString(),
      });
    }
  }
  return result;
}

function validateCell(cell) {
  const expected = cells().find((item) => item.id === cell?.id);
  if (!expected || !same(expected, cell)) fail("cell is not in the pinned policy");
  return cell;
}

function selectionSql(cell) {
  validateCell(cell);
  return `COPY (
SELECT row_to_json(record) FROM (
  SELECT f.label, f.degree,
    ARRAY(SELECT c::text FROM unnest(f.coeffs) c) AS coeffs,
    f.r2, f.disc_sign, f.disc_abs::text AS disc_abs,
    f.disc_rad::text AS disc_rad, f.index::text AS index,
    f.monogenic, f.galt, f.galois_label, f.num_ram,
    f.class_number::text AS class_number,
    CASE WHEN f.class_group IS NULL THEN NULL ELSE
      ARRAY(SELECT c FROM jsonb_array_elements_text(f.class_group) c)
    END AS class_group,
    f.regulator::text AS regulator, f.torsion_order, f.used_grh,
    f.narrow_class_number::text AS narrow_class_number,
    CASE WHEN f.narrow_class_group IS NULL THEN NULL ELSE
      ARRAY(SELECT c::text FROM unnest(f.narrow_class_group) c)
    END AS narrow_class_group,
    f.unit_signature_rank
  FROM nf_fields f
  WHERE f.degree = ${cell.degree} AND f.r2 = ${cell.r2}
    AND f.disc_abs >= ${cell.lower_inclusive}
    AND f.disc_abs < ${cell.upper_exclusive}${cell.channel === "missing-h" ? "\n    AND f.class_number IS NULL" : ""}
  ORDER BY f.disc_abs, f.label COLLATE "C"
  LIMIT ${POLICY.window_rows}
) record
) TO STDOUT;\n`;
}

function rowCompare(a, b) {
  if (a.degree !== b.degree) return a.degree - b.degree;
  const delta = BigInt(a.disc_abs) - BigInt(b.disc_abs);
  return delta < 0n ? -1 : delta > 0n ? 1 : byteCompare(a.label, b.label);
}

function validateWindow(rows, cell) {
  validateCell(cell);
  if (!Array.isArray(rows) || rows.length > POLICY.window_rows) fail("source window exceeds row cap");
  const seen = new Set();
  for (const raw of rows) {
    normalizeRow(raw);
    if (seen.has(raw.label)) fail(`duplicate source label ${raw.label}`);
    seen.add(raw.label);
    if (raw.degree !== cell.degree || raw.r2 !== cell.r2 ||
        BigInt(raw.disc_abs) < BigInt(cell.lower_inclusive) || BigInt(raw.disc_abs) >= BigInt(cell.upper_exclusive) ||
        (cell.channel === "missing-h" && raw.class_number !== null)) fail(`${raw.label}: outside source cell`);
  }
  return [...rows].sort(rowCompare);
}

function exclusions(labels) {
  if (!Array.isArray(labels)) fail("exclusions must be a JSON array of LMFDB labels");
  labels.forEach(validateLabel);
  return [...new Set(labels)].sort(byteCompare);
}

function selectedRows(rows, cell, excludedLabels = []) {
  const excluded = new Set(exclusions(excludedLabels));
  return validateWindow(rows, cell).filter((raw) => !excluded.has(raw.label)).sort((a, b) => {
    const key = (raw) => sha256(`${SEED}\u0000candidate\u0000${cell.id}\u0000${raw.label}`);
    return byteCompare(key(a), key(b)) || byteCompare(a.label, b.label);
  }).slice(0, POLICY.selected_per_cell).sort(rowCompare);
}

function identity(excludedLabels = [], campaign = null, exposedLabels = []) {
  const labels = exclusions(excludedLabels);
  const exposed = exclusions(exposedLabels);
  if (campaign !== null && (campaign.schema !== "sagejs.general-class-unit-campaign.v1" ||
      campaign.corpus?.seed !== SEED || !same(campaign.corpus.degrees, POLICY.degrees) ||
      !same(campaign.corpus.coverage_per_degree, POLICY.coverage_targets_per_degree) ||
      !same(campaign.corpus.performance_per_degree, POLICY.performance_targets_per_degree) ||
      campaign.corpus.performance_minimum_reference_one_second !== POLICY.minimum_reference_one_second ||
      campaign.corpus.performance_minimum_reference_ten_seconds !== POLICY.minimum_reference_ten_seconds ||
      campaign.corpus.missing_class_numbers_allowed !== true || campaign.corpus.selection_uses_sagejs_results !== false)) {
    fail("campaign conflicts with pinned candidate policy");
  }
  return {
    schema: "sagejs.general-class-unit-candidate-export.v1", policy: POLICY, source: SOURCE,
    excluded_labels: labels, excluded_labels_sha256: digest(labels),
    exposed_labels: exposed, exposed_labels_sha256: digest(exposed),
    campaign_sha256: campaign === null ? null : digest(campaign),
  };
}

function receipt(cell, rows, exportIdentity, attempt = 1, failure = null) {
  const normalized = validateWindow(rows, cell);
  const result = {
    schema: "sagejs.general-class-unit-candidate-cell.v1",
    export_sha256: digest(exportIdentity), cell, attempt,
    captured_at: new Date().toISOString(),
    status: failure ? "error" : normalized.length ? "ok" : "empty",
    failure, selection_sql: selectionSql(cell), query_sha256: sha256(selectionSql(cell)),
    raw_rows: normalized, raw_rows_sha256: digest(normalized),
    window_limit_reached: normalized.length === POLICY.window_rows,
    selected_labels: selectedRows(normalized, cell, exportIdentity.excluded_labels).map((row) => row.label),
  };
  return { ...result, receipt_sha256: digest(result) };
}

function validateReceipt(value, exportIdentity) {
  if (!value || value.schema !== "sagejs.general-class-unit-candidate-cell.v1") fail("invalid cell receipt schema");
  const { receipt_sha256: checksum, ...body } = value;
  if (checksum !== digest(body)) fail("cell receipt digest mismatch");
  if (value.export_sha256 !== digest(exportIdentity)) fail("cell export identity mismatch");
  if (!smallInteger(value.attempt, 1, 999999) || !Number.isFinite(Date.parse(value.captured_at))) fail("invalid attempt identity");
  const expected = receipt(value.cell, value.raw_rows, exportIdentity, value.attempt, value.failure);
  expected.captured_at = value.captured_at;
  delete expected.receipt_sha256;
  if (!same(expected, body)) fail("cell receipt projection mismatch");
  if (value.failure !== null && (value.raw_rows.length ||
      !["query-timeout", "query-error", "client-unavailable", "response-cap", "malformed-response"].includes(value.failure))) {
    fail("invalid failure receipt");
  }
  return value;
}

function assemble(exportIdentity, receipts) {
  if (!same(exportIdentity, identity(exportIdentity.excluded_labels, null, exportIdentity.exposed_labels))) {
    // A campaign hash is a binding, not a request to load a mutable campaign again.
    const expected = identity(exportIdentity.excluded_labels, null, exportIdentity.exposed_labels);
    expected.campaign_sha256 = exportIdentity.campaign_sha256;
    if (!same(exportIdentity, expected) || (expected.campaign_sha256 !== null && !/^[0-9a-f]{64}$/.test(expected.campaign_sha256))) fail("invalid export policy");
  }
  const attempts = new Set();
  const latest = new Map();
  const allSources = new Map();
  for (const item of receipts) {
    validateReceipt(item, exportIdentity);
    const key = `${item.cell.id}:${item.attempt}`;
    if (attempts.has(key)) fail("duplicate cell attempt");
    attempts.add(key);
    for (const raw of item.raw_rows) {
      if (allSources.has(raw.label) && !same(allSources.get(raw.label), raw)) fail(`source changed across cells: ${raw.label}`);
      allSources.set(raw.label, raw);
    }
    const previous = latest.get(item.cell.id);
    if (!previous || previous.attempt < item.attempt) latest.set(item.cell.id, item);
  }
  const records = new Map();
  const summaries = cells().map((cell) => {
    const item = latest.get(cell.id);
    if (!item) return { cell_id: cell.id, status: "pending" };
    for (const raw of selectedRows(item.raw_rows, cell, exportIdentity.excluded_labels)) {
      if (!records.has(raw.label)) records.set(raw.label, {
        ...normalizeRow(raw), source_row_sha256: digest(raw),
        source_cells: [],
        exposure: exportIdentity.exposed_labels.includes(raw.label) ? "historically-exposed-development-only" : "exposure-audit-pending",
        holdout_eligible: exportIdentity.exposed_labels.includes(raw.label) ? false : null,
        reference_time_band: "pending", final_role: null,
      });
      records.get(raw.label).source_cells.push(cell.id);
    }
    return { cell_id: cell.id, status: item.status, attempt: item.attempt,
      receipt_sha256: item.receipt_sha256, row_count: item.raw_rows.length,
      selected_count: item.selected_labels.length, window_limit_reached: item.window_limit_reached };
  });
  const ordered = [...records.values()].sort((a, b) => rowCompare(
    { ...a, disc_abs: a.discriminant_absolute }, { ...b, disc_abs: b.discriminant_absolute },
  ));
  const availability = POLICY.degrees.map((degree) => {
    const selected = ordered.filter((record) => record.degree === degree);
    const signatureCounts = Array.from({ length: Math.floor(degree / 2) + 1 }, (_, r2) => ({
      signature: [degree - 2 * r2, r2], unit_rank: degree - r2 - 1,
      distinct_labels: selected.filter((record) => record.signature[1] === r2).length,
    }));
    return {
      degree, distinct_labels: selected.length,
      missing_class_number: selected.filter((record) => record.class_number === null).length,
      candidate_shortfall_to_coverage_count: Math.max(0,
        POLICY.coverage_targets_per_degree.development + POLICY.coverage_targets_per_degree.holdout - selected.length),
      signature_counts: signatureCounts,
      final_selection_qualified: false,
    };
  });
  const result = {
    schema: SCHEMA, state: POLICY.state, export_sha256: digest(exportIdentity),
    policy: POLICY, source: SOURCE, cells: summaries,
    records: ordered, records_sha256: digest(ordered),
    labels_sha256: sha256(`${ordered.map((row) => row.label).join("\n")}${ordered.length ? "\n" : ""}`),
    selected_count: ordered.length,
    availability_by_degree: availability,
    distinctness: "LMFDB field labels only; alternative polynomials require exact isomorphism reconciliation before final selection",
    final_selection_pending: ["matched-reference-costs", "coverage-and-performance-quotas", "exposure-audit", "supplementary-family-isomorphisms"],
  };
  return { ...result, pool_sha256: digest(result) };
}

function queryCell(cell, spawn = spawnSync, env = process.env) {
  const query = selectionSql(cell);
  let run;
  try {
    run = spawn("psql", ["-X", "-qAt", "--set=ON_ERROR_STOP=1",
      `--host=${env.LMFDB_PGHOST || "devmirror.lmfdb.xyz"}`,
      `--port=${env.LMFDB_PGPORT || "5432"}`,
      `--dbname=${env.LMFDB_PGDATABASE || "lmfdb"}`,
      `--username=${env.LMFDB_PGUSER || "lmfdb"}`, "--command", query], {
      encoding: "utf8", timeout: POLICY.process_timeout_ms,
      maxBuffer: POLICY.response_byte_cap, killSignal: "SIGKILL",
      env: { ...env, PGPASSWORD: env.LMFDB_PGPASSWORD || "lmfdb",
        PGCONNECT_TIMEOUT: String(POLICY.connect_timeout_seconds),
        PGOPTIONS: `-c default_transaction_read_only=on -c statement_timeout=${POLICY.statement_timeout_ms}` },
    });
  } catch { return { rows: [], failure: "query-error" }; }
  // Never persist/log connection values or server error text (which can contain them).
  if (run.error?.code === "ENOENT") return { rows: [], failure: "client-unavailable" };
  if (run.error?.code === "ENOBUFS") return { rows: [], failure: "response-cap" };
  if (run.error?.code === "ETIMEDOUT" || /statement timeout/.test(run.stderr || "")) return { rows: [], failure: "query-timeout" };
  if (run.error || run.status !== 0) return { rows: [], failure: "query-error" };
  if (Buffer.byteLength(run.stdout || "") > POLICY.response_byte_cap) return { rows: [], failure: "response-cap" };
  try {
    // COPY text doubles backslashes; decode its escaping before parsing JSON.
    const rows = (run.stdout || "").split(/\r?\n/).filter(Boolean).map((line) =>
      JSON.parse(line.replace(/\\([\\ntbrfv])/g, (_match, code) => ({ "\\": "\\", n: "\n", t: "\t", b: "\b", r: "\r", f: "\f", v: "\v" })[code])),
    );
    return { rows: validateWindow(rows, cell), failure: null };
  } catch { return { rows: [], failure: "malformed-response" }; }
}

function readJson(filename) { return JSON.parse(fs.readFileSync(filename, "utf8")); }
function writeJson(filename, value) {
  const temporary = `${filename}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    fs.renameSync(temporary, filename);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function loadExport(directory) {
  const exportIdentity = readJson(path.join(directory, "export.json"));
  const filenames = fs.readdirSync(directory).filter((name) => name.endsWith(".receipt.json")).sort(byteCompare);
  const receipts = filenames.map((name) => readJson(path.join(directory, name)));
  return { exportIdentity, receipts, pool: assemble(exportIdentity, receipts) };
}

function fetchCells(directory, exportIdentity, requestedCells, maxCells = 1, retryErrors = false, query = queryCell) {
  if (!smallInteger(maxCells, 1, POLICY.max_cells_per_invocation)) fail("--max-cells must be 1–34");
  const requested = new Set(requestedCells);
  for (const id of requested) if (!cells().some((cell) => cell.id === id)) fail(`unknown cell ${id}`);
  fs.mkdirSync(directory, { recursive: true });
  const lock = path.join(directory, "fetch.lock");
  const descriptor = fs.openSync(lock, "wx");
  try {
    const identityPath = path.join(directory, "export.json");
    if (fs.existsSync(identityPath)) {
      if (!same(readJson(identityPath), exportIdentity)) fail("resume policy/exclusions/campaign identity changed; use a new directory");
    } else writeJson(identityPath, exportIdentity);
    const loaded = loadExport(directory);
    const receipts = loaded.receipts;
    let queried = 0;
    for (const cell of cells()) {
      if (requested.size && !requested.has(cell.id)) continue;
      const earlier = receipts.filter((item) => item.cell.id === cell.id).sort((a, b) => a.attempt - b.attempt);
      const latest = earlier.at(-1);
      if (latest && (latest.status !== "error" || !retryErrors)) continue;
      if (queried >= maxCells) break;
      const result = query(cell);
      const item = receipt(cell, result.rows, exportIdentity, (latest?.attempt || 0) + 1, result.failure);
      writeJson(path.join(directory, `${cell.id}.${String(item.attempt).padStart(6, "0")}.receipt.json`), item);
      receipts.push(item);
      queried += 1;
    }
    const pool = assemble(exportIdentity, receipts);
    writeJson(path.join(directory, "pool.json"), pool);
    return { queried, pool };
  } finally { fs.closeSync(descriptor); fs.unlinkSync(lock); }
}

function main(argv) {
  const command = argv.shift();
  if (!command || command === "--help") {
    console.log("Usage: node candidate-pool.cjs plan|fetch|check [--directory DIR] [--cell ID ...] [--max-cells 1..34] [--exclude-labels JSON] [--exposed-labels JSON] [--campaign JSON] [--retry-errors]\nplan/check are offline; fetch defaults to one bounded cell. Existing successful/empty receipts are never refetched.");
    return;
  }
  if (!["plan", "fetch", "check"].includes(command)) fail("unknown command");
  const options = { cells: [], maxCells: 1, retryErrors: false };
  const keys = { "--directory": "directory", "--max-cells": "maxCells", "--exclude-labels": "excluded", "--exposed-labels": "exposed", "--campaign": "campaign" };
  while (argv.length) {
    const key = argv.shift();
    if (key === "--retry-errors") options.retryErrors = true;
    else if (key === "--cell" || keys[key]) {
      const value = argv.shift();
      if (!value || value.startsWith("--")) fail(`${key} requires a value`);
      if (key === "--cell") options.cells.push(value);
      else options[keys[key]] = value;
    } else fail(`unknown option ${key}`);
  }
  if (!/^[1-9][0-9]*$/.test(String(options.maxCells)) || !smallInteger(Number(options.maxCells), 1, 34)) fail("--max-cells must be 1–34");
  const exportIdentity = identity(options.excluded ? readJson(options.excluded) : [],
    options.campaign ? readJson(options.campaign) : null, options.exposed ? readJson(options.exposed) : []);
  if (command === "plan") {
    console.log(JSON.stringify({ export: exportIdentity, cells: cells(), total_cells: cells().length,
      maximum_selected_before_deduplication: cells().length * POLICY.selected_per_cell }, null, 2));
    return;
  }
  if (!options.directory) fail("--directory is required");
  if (command === "check") {
    const loaded = loadExport(options.directory);
    if (!same(loaded.pool, readJson(path.join(options.directory, "pool.json")))) fail("pool projection/digest mismatch");
    if ((options.excluded || options.exposed || options.campaign) && !same(loaded.exportIdentity, exportIdentity)) fail("requested export identity mismatch");
    console.log(JSON.stringify({ status: "valid", candidates: loaded.pool.selected_count,
      availability_by_degree: loaded.pool.availability_by_degree,
      cells: loaded.pool.cells.reduce((out, cell) => ({ ...out, [cell.status]: (out[cell.status] || 0) + 1 }), {}),
      state: loaded.pool.state }));
    return;
  }
  const result = fetchCells(options.directory, exportIdentity, options.cells, Number(options.maxCells), options.retryErrors);
  console.log(JSON.stringify({ queried: result.queried, candidates: result.pool.selected_count,
    availability_by_degree: result.pool.availability_by_degree,
    cells: result.pool.cells.reduce((out, cell) => ({ ...out, [cell.status]: (out[cell.status] || 0) + 1 }), {}),
    state: result.pool.state, pool_sha256: result.pool.pool_sha256 }));
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { POLICY, SOURCE, RAW_KEYS, canonicalJson, sha256, digest, normalizeRow,
  cells, selectionSql, validateWindow, exclusions, selectedRows, identity, receipt,
  validateReceipt, assemble, queryCell, fetchCells, loadExport, main };

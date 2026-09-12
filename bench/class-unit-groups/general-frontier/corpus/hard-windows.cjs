#!/usr/bin/env node
"use strict";

// Developer-only acquisition. Only the explicit fetch command can query a server.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const base = require("./candidate-pool.cjs");
const { canonicalJson, sha256, digest, normalizeRow, SOURCE } = base;
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const fail = (message) => { throw new Error(message); };
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const power = (n) => (10n ** BigInt(n)).toString();
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const WINDOWS = freeze([
  [8, 0, power(37), power(38)], [8, 0, power(38), power(39)],
  [8, 4, power(37), power(38)], [8, 4, power(38), power(39)],
  [9, 0, power(40), power(41)], [9, 4, power(38), power(39)],
  [10, 5, (25n * 10n ** 35n).toString(), power(37)],
  [10, 4, power(41), power(42)],
].map(([degree, r2, lower_inclusive, upper_exclusive], i) => ({
  id: `hard-${String(i + 1).padStart(2, "0")}-n${degree}-r2-${r2}`,
  degree, r2, lower_inclusive, upper_exclusive,
})));
const POLICY = freeze({
  schema: "sagejs.general-class-unit-hard-window-policy.v1",
  seed: "sagejs-general-class-unit-hard-windows-2026-09-11-v1",
  windows: WINDOWS, window_rows: 128, selected_per_window: 8,
  statement_timeout_ms: 20000, connect_timeout_seconds: 8,
  process_timeout_ms: 30000, response_byte_cap: 8 * 1024 * 1024,
  max_queries: 8, automatic_retries: false,
  selection_uses_sagejs_results: false,
  window_rule: "First 128 by numeric disc_abs then bytewise label; seeded selection after exclusions; not uniform sampling",
});
const FAILURES = ["query-timeout", "query-error", "client-unavailable", "response-cap", "malformed-response"];
function producer() {
  return { tool_sha256: sha256(fs.readFileSync(__filename)), normalizer_sha256: sha256(fs.readFileSync(require.resolve("./candidate-pool.cjs"))) };
}
function connection(env) {
  return { host: env.LMFDB_PGHOST || "devmirror.lmfdb.xyz", port: env.LMFDB_PGPORT || "5432",
    database: env.LMFDB_PGDATABASE || "lmfdb", username: env.LMFDB_PGUSER || "lmfdb" };
}
function windowIdentity(window) {
  const expected = WINDOWS.find((w) => w.id === window?.id);
  if (!expected || !same(expected, window)) fail("window is not in pinned hard-window policy");
  return window;
}

function selectionSql(window) {
  windowIdentity(window);
  // v2 selectionSql/queryCell cannot accept these windows. Reuse its exact row
  // representation, not its cell identity or validators.
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
    END AS narrow_class_group, f.unit_signature_rank
  FROM nf_fields f
  WHERE f.degree = ${window.degree} AND f.r2 = ${window.r2}
    AND f.disc_abs >= ${window.lower_inclusive}
    AND f.disc_abs < ${window.upper_exclusive}
  ORDER BY f.disc_abs, f.label COLLATE "C"
  LIMIT ${POLICY.window_rows}
) record
) TO STDOUT;\n`;
}

function validateRows(rows, window) {
  windowIdentity(window);
  if (!Array.isArray(rows) || rows.length > POLICY.window_rows) fail("window row cap exceeded");
  const seen = new Set();
  let previous = null;
  for (const row of rows) {
    normalizeRow(row);
    if (row.degree !== window.degree || row.r2 !== window.r2 ||
        BigInt(row.disc_abs) < BigInt(window.lower_inclusive) ||
        BigInt(row.disc_abs) >= BigInt(window.upper_exclusive) || seen.has(row.label)) fail("row outside window or duplicated");
    if (previous && (BigInt(previous.disc_abs) > BigInt(row.disc_abs) ||
        (previous.disc_abs === row.disc_abs && compare(previous.label, row.label) >= 0))) fail("source rows not in declared order");
    seen.add(row.label); previous = row;
  }
  return rows;
}
function labelsFromInput(text) {
  const value = JSON.parse(text);
  if (!Array.isArray(value)) fail("exclusion inputs must be arrays of labels or input records");
  const labels = value.map((r) => typeof r === "string" ? r : r?.label);
  if (labels.some((label) => typeof label !== "string" || !/^[a-z0-9.-]+$/.test(label))) fail("invalid exclusion label");
  return [...new Set(labels)].sort(compare);
}
function sourceInputs(filenames) {
  if (!filenames.length || filenames.length > 64) fail("supply 1..64 explicit --exclude-input files, including active inputs");
  const names = filenames.map((f) => path.resolve(f)).sort(compare);
  if (new Set(names).size !== names.length) fail("duplicate exclusion input path");
  let total = 0;
  return names.map((filename) => {
    const bytes = fs.readFileSync(filename); total += bytes.length;
    if (total > POLICY.response_byte_cap) fail("exclusion input byte cap exceeded");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { path: filename, sha256: sha256(bytes), json: text, labels: labelsFromInput(text) };
  });
}
function manifest(inputs) {
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 64) fail("missing pinned exclusion inputs");
  const names = new Set(); let total = 0;
  for (const input of inputs) {
    if (typeof input.path !== "string" || names.has(input.path) || typeof input.json !== "string" ||
        input.sha256 !== sha256(input.json) || !same(input.labels, labelsFromInput(input.json))) fail("invalid pinned exclusion source");
    names.add(input.path); total += Buffer.byteLength(input.json);
  }
  if (total > POLICY.response_byte_cap) fail("exclusion input byte cap exceeded");
  const excluded_labels = [...new Set(inputs.flatMap((input) => input.labels))].sort(compare);
  const body = {
    schema: "sagejs.general-class-unit-hard-window-export.v1", policy: POLICY, source: SOURCE,
    producer: producer(),
    selection_uses_sagejs_results: false, qualification_evidence: false,
    exclusion_inputs: inputs, excluded_labels, excluded_labels_sha256: digest(excluded_labels),
  };
  return { ...body, manifest_sha256: digest(body) };
}
function validateManifest(value) {
  if (!same(value, manifest(value.exclusion_inputs))) fail("manifest policy/projection mismatch");
  return value;
}
function select(rows, window, identity) {
  const excluded = new Set(identity.excluded_labels);
  return validateRows(rows, window).filter((r) => !excluded.has(r.label)).sort((a, b) =>
    compare(sha256(`${POLICY.seed}\0${window.id}\0${a.label}`), sha256(`${POLICY.seed}\0${window.id}\0${b.label}`)) || compare(a.label, b.label),
  ).slice(0, POLICY.selected_per_window);
}
function parseRaw(raw, window) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  const rows = text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(
    line.replace(/\\([\\ntbrfv])/g, (_match, c) => ({ "\\": "\\", n: "\n", t: "\t", b: "\b", r: "\r", f: "\f", v: "\v" })[c]),
  ));
  return validateRows(rows, window);
}
function queryWindow(window, spawn = spawnSync, env = process.env) {
  const sql = selectionSql(window);
  const endpoint = connection(env);
  let run;
  try {
    run = spawn("psql", ["-X", "-qAt", "--set=ON_ERROR_STOP=1",
      `--host=${endpoint.host}`, `--port=${endpoint.port}`, `--dbname=${endpoint.database}`,
      `--username=${endpoint.username}`, "--command", sql], {
      timeout: POLICY.process_timeout_ms, maxBuffer: POLICY.response_byte_cap, killSignal: "SIGKILL",
      env: { ...env, PGPASSWORD: env.LMFDB_PGPASSWORD || "lmfdb", PGCONNECT_TIMEOUT: "8",
        PGOPTIONS: "-c default_transaction_read_only=on -c statement_timeout=20000" },
    });
  } catch { return { raw: Buffer.alloc(0), failure: "query-error", response_truncated: false }; }
  const stdout = Buffer.from(run.stdout || ""), stderr = Buffer.from(run.stderr || "");
  const response_truncated = stdout.length > POLICY.response_byte_cap || run.error?.code === "ENOBUFS";
  const raw = stdout.subarray(0, POLICY.response_byte_cap);
  let failure = null;
  if (run.error?.code === "ENOENT") failure = "client-unavailable";
  else if (run.error?.code === "ENOBUFS" || stdout.length + stderr.length > POLICY.response_byte_cap) failure = "response-cap";
  else if (run.error?.code === "ETIMEDOUT" || /statement timeout/.test(stderr.toString())) failure = "query-timeout";
  else if (run.error || run.status !== 0) failure = "query-error";
  else { try { parseRaw(raw, window); } catch { failure = "malformed-response"; } }
  // Never retain server stderr or credentials. Partial stdout is bounded and raw.
  return { raw, failure, response_truncated };
}

function ticket(window, identity, env = process.env) {
  windowIdentity(window); validateManifest(identity);
  const body = {
    schema: "sagejs.general-class-unit-hard-window-dispatch.v1", window,
    manifest_sha256: identity.manifest_sha256, query_sha256: sha256(selectionSql(window)),
    selection_sql: selectionSql(window), dispatched_at: new Date().toISOString(),
    provenance: { ...producer(),
      node: process.version, client: "psql", connection_sha256: digest(connection(env)),
      connection: "LMFDB_PG environment or documented read-only public defaults; credentials not retained" },
  };
  return { ...body, ticket_sha256: digest(body) };
}
function validateTicket(value, identity) {
  const { ticket_sha256, ...body } = value;
  windowIdentity(value.window);
  if (digest(body) !== ticket_sha256 || value.schema !== "sagejs.general-class-unit-hard-window-dispatch.v1" ||
      value.manifest_sha256 !== identity.manifest_sha256 || value.selection_sql !== selectionSql(value.window) ||
      value.query_sha256 !== sha256(value.selection_sql) || !Number.isFinite(Date.parse(value.dispatched_at)) ||
      value.provenance?.tool_sha256 !== identity.producer.tool_sha256 || value.provenance?.normalizer_sha256 !== identity.producer.normalizer_sha256 ||
      !/^[a-f0-9]{64}$/.test(value.provenance?.connection_sha256) || value.provenance.client !== "psql" || typeof value.provenance.node !== "string") fail("invalid dispatch ticket");
}
function receipt(dispatch, result, identity) {
  validateTicket(dispatch, identity);
  if (!Buffer.isBuffer(result.raw) || result.raw.length > POLICY.response_byte_cap ||
      (result.failure !== null && !FAILURES.includes(result.failure)) || typeof result.response_truncated !== "boolean" ||
      (result.response_truncated && result.failure !== "response-cap")) fail("invalid query result");
  const rows = result.failure ? [] : parseRaw(result.raw, dispatch.window);
  const body = {
    schema: "sagejs.general-class-unit-hard-window-receipt.v1", window_id: dispatch.window.id,
    manifest_sha256: identity.manifest_sha256, ticket_sha256: dispatch.ticket_sha256,
    status: result.failure ? "error" : rows.length ? "ok" : "empty", failure: result.failure,
    raw_stdout_base64: result.raw.toString("base64"), raw_stdout_sha256: sha256(result.raw),
    response_truncated: result.response_truncated, raw_rows: rows, raw_rows_sha256: digest(rows),
    window_limit_reached: rows.length === POLICY.window_rows,
    selected_labels: select(rows, dispatch.window, identity).map((r) => r.label),
  };
  return { ...body, receipt_sha256: digest(body) };
}
function validateReceipt(value, dispatch, identity) {
  const raw = Buffer.from(value.raw_stdout_base64 || "", "base64");
  if (raw.toString("base64") !== value.raw_stdout_base64 ||
      !same(value, receipt(dispatch, { raw, failure: value.failure, response_truncated: value.response_truncated }, identity))) fail("receipt projection/digest mismatch");
  return value;
}
function immutableJson(filename, value) {
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temporary, "wx"); fs.writeFileSync(fd, JSON.stringify(value, null, 2) + "\n"); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.linkSync(temporary, filename);
    // Windows does not support fsync on a directory descriptor.
    if (process.platform !== "win32") { const dir = fs.openSync(path.dirname(filename), "r"); try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); } }
  } finally { if (fd !== undefined) fs.closeSync(fd); if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
const read = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));
function replay(directory) {
  const identity = validateManifest(read(path.join(directory, "manifest.json")));
  const known = new Set(["manifest.json", "fetch.lock"]);
  const windows = [], records = [];
  for (const window of WINDOWS) {
    const ticketName = `${window.id}.dispatch.json`, receiptName = `${window.id}.receipt.json`;
    known.add(ticketName); known.add(receiptName);
    const dispatched = fs.existsSync(path.join(directory, ticketName)), received = fs.existsSync(path.join(directory, receiptName));
    if (received && !dispatched) fail("receipt without dispatch ticket");
    if (!dispatched) { windows.push({ window_id: window.id, status: "not-dispatched" }); continue; }
    const dispatch = read(path.join(directory, ticketName)); validateTicket(dispatch, identity);
    if (dispatch.window.id !== window.id) fail("ticket filename/window mismatch");
    if (!received) { windows.push({ window_id: window.id, status: "interrupted-or-in-progress", ticket_sha256: dispatch.ticket_sha256 }); continue; }
    const item = validateReceipt(read(path.join(directory, receiptName)), dispatch, identity);
    windows.push({ window_id: window.id, status: item.status, failure: item.failure,
      receipt_sha256: item.receipt_sha256, row_count: item.raw_rows.length, selected_count: item.selected_labels.length });
    for (const raw of select(item.raw_rows, window, identity)) records.push({ ...normalizeRow(raw),
      source_kind: "hard-window-v1", source_window: window.id, source_row_sha256: digest(raw),
      source_receipt_sha256: item.receipt_sha256, exposure: "exposure-audit-pending", holdout_eligible: null,
      reference_time_band: "pending", final_role: null });
  }
  for (const name of fs.readdirSync(directory)) if (!known.has(name)) fail(`unexpected acquisition artifact: ${name}`);
  if (new Set(records.map((r) => r.label)).size !== records.length) fail("duplicate selected labels");
  const body = { schema: "sagejs.general-class-unit-hard-window-pool.v1", source_kind: "hard-window-v1",
    policy: POLICY, source: SOURCE, manifest_sha256: identity.manifest_sha256,
    qualification_evidence: false, independent_replay: false, selection_uses_sagejs_results: false,
    windows, records, selected_count: records.length, records_sha256: digest(records) };
  return { ...body, pool_sha256: digest(body) };
}
function fetch(directory, query = queryWindow) {
  const identity = validateManifest(read(path.join(directory, "manifest.json")));
  const lock = path.join(directory, "fetch.lock"), fd = fs.openSync(lock, "wx");
  try {
    const before = replay(directory);
    if (before.windows.some((w) => w.status === "interrupted-or-in-progress")) fail("unresolved dispatch; no automatic retry or continuation");
    let queried = 0;
    for (const window of WINDOWS) {
      if (fs.existsSync(path.join(directory, `${window.id}.dispatch.json`))) continue;
      const dispatch = ticket(window, identity);
      immutableJson(path.join(directory, `${window.id}.dispatch.json`), dispatch);
      const result = query(window);
      immutableJson(path.join(directory, `${window.id}.receipt.json`), receipt(dispatch, result, identity));
      queried++;
    }
    return { queried, pool: replay(directory) };
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
function main(argv) {
  const command = argv.shift();
  if (!command || command === "--help") { console.log("Usage: hard-windows.cjs plan --directory NEW --exclude-input INPUT.json [...] | fetch --directory DIR | check|replay --directory DIR [--output NEW_POOL.json]\nOnly fetch performs queries; maximum eight fixed windows, no retries. Exclusion inputs must include all prior and active screening inputs."); return; }
  if (!["plan", "fetch", "check", "replay"].includes(command)) fail("unknown command");
  const options = { inputs: [] };
  while (argv.length) {
    const key = argv.shift(), value = argv.shift();
    if (!value || value.startsWith("--")) fail("option requires value");
    if (key === "--exclude-input") options.inputs.push(value);
    else if (["--directory", "--output"].includes(key)) { if (options[key]) fail("duplicate option"); options[key] = value; }
    else fail("unknown option");
  }
  const directory = options["--directory"];
  if (!directory) fail("--directory is required");
  if (command === "plan") {
    if (options["--output"]) fail("plan does not accept --output");
    const identity = manifest(sourceInputs(options.inputs));
    fs.mkdirSync(directory); immutableJson(path.join(directory, "manifest.json"), identity);
    console.log(JSON.stringify({ manifest_sha256: identity.manifest_sha256, excluded: identity.excluded_labels.length, windows: WINDOWS })); return;
  }
  if (options.inputs.length || (command === "fetch" && options["--output"])) fail("exclusions are pinned by plan; fetch output is retained as receipts");
  if (options["--output"] && path.resolve(path.dirname(options["--output"])) === path.resolve(directory)) fail("replay output must be outside the acquisition directory");
  const result = command === "fetch" ? fetch(directory) : { pool: replay(directory) };
  if (options["--output"]) immutableJson(options["--output"], result.pool);
  console.log(JSON.stringify(result));
}
if (require.main === module) { try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { POLICY, WINDOWS, selectionSql, validateRows, sourceInputs, manifest, validateManifest,
  select, parseRaw, queryWindow, ticket, receipt, validateReceipt, immutableJson, replay, fetch, main };

// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const api = require("./hard-windows.cjs");
const base = require("./candidate-pool.cjs");

function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-hard-windows-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function row(window = api.WINDOWS[0], index = 1) {
  const raw = Object.fromEntries(base.RAW_KEYS.map((key) => [key, null]));
  const d = (BigInt(window.lower_inclusive) + BigInt(index)).toString();
  return { ...raw, label: `${window.degree}.${window.degree - 2 * window.r2}.${d}.1`,
    degree: window.degree, r2: window.r2, disc_abs: d, disc_sign: window.r2 % 2 ? -1 : 1,
    coeffs: ["-1", ...Array(window.degree - 1).fill("0"), "1"] };
}
function identity(excluded = []) {
  const json = JSON.stringify(excluded);
  return api.manifest([{ path: "/offline/pinned-input.json", json, sha256: base.sha256(json), labels: excluded }]);
}
function result(rows = [], failure = null) {
  const text = rows.map((r) => JSON.stringify(r).replaceAll("\\", "\\\\")).join("\n");
  return { raw: Buffer.from(text + (text ? "\n" : "")), failure, response_truncated: false };
}
function initialize(dir, excluded = []) { api.immutableJson(path.join(dir, "manifest.json"), identity(excluded)); }
const clone = (value) => JSON.parse(JSON.stringify(value));

test("eight fixed windows are distinct from v2, bounded and not mutable", () => {
  assert.equal(api.WINDOWS.length, 8);
  assert.equal(api.POLICY.max_queries, 8);
  assert.equal(api.POLICY.window_rows, 128);
  assert.equal(api.POLICY.selected_per_window, 8);
  assert.equal(api.POLICY.selection_uses_sagejs_results, false);
  assert.equal(api.WINDOWS[6].lower_inclusive, (25n * 10n ** 35n).toString());
  assert.throws(() => api.WINDOWS.push({}), TypeError);
  for (const window of api.WINDOWS) {
    assert.throws(() => base.selectionSql(window), /pinned policy/);
    const sql = api.selectionSql(window);
    assert.match(sql, /ORDER BY f.disc_abs, f.label COLLATE "C"\n  LIMIT 128/);
    assert.ok(sql.includes(`f.disc_abs >= ${window.lower_inclusive}`));
    assert.ok(sql.includes(`f.disc_abs < ${window.upper_exclusive}`));
    assert.throws(() => api.selectionSql({ ...window, lower_inclusive: "1" }), /pinned/);
  }
});

test("pinned input bytes and exclusions replay without rereading mutable inputs", (t) => {
  const dir = temporary(t), input = path.join(dir, "prior.json"), active = path.join(dir, "active72.json");
  fs.writeFileSync(input, JSON.stringify([{ label: row().label, coefficients: row().coeffs }]));
  fs.writeFileSync(active, JSON.stringify(["generated-rank-two-2"]));
  const sources = api.sourceInputs([input, active]);
  const pinned = api.manifest(sources);
  fs.writeFileSync(input, "[]");
  assert.deepEqual(api.validateManifest(pinned), pinned);
  assert.deepEqual(pinned.excluded_labels, [row().label, "generated-rank-two-2"].sort());
  assert.throws(() => api.sourceInputs([]), /explicit/);
  assert.throws(() => api.sourceInputs([input, input]), /duplicate/);
  const tampered = clone(pinned); tampered.exclusion_inputs[0].json = "[]";
  assert.throws(() => api.validateManifest(tampered), /invalid/);
  const mutated = clone(pinned); mutated.excluded_labels = [];
  assert.throws(() => api.validateManifest(mutated), /projection/);
});

test("selection is bounded, deterministic and applies exclusions before selection", () => {
  const window = api.WINDOWS[0], rows = Array.from({ length: 128 }, (_, i) => row(window, i + 1));
  const excluded = rows.slice(0, 120).map((r) => r.label).sort();
  const selected = api.select(rows, window, identity(excluded));
  assert.equal(selected.length, 8);
  assert.deepEqual(new Set(selected.map((r) => r.label)), new Set(rows.slice(120).map((r) => r.label)));
  assert.deepEqual(api.select(rows, window, identity(excluded)), selected);
  assert.throws(() => api.validateRows([...rows, row(window, 129)], window), /cap/);
  assert.throws(() => api.validateRows([rows[1], rows[0]], window), /order/);
  assert.throws(() => api.validateRows([rows[0], rows[0]], window), /duplicated/);
  assert.throws(() => api.validateRows([row(api.WINDOWS[1])], window), /outside/);
});

test("receipt replays exact raw response and rejects rehashed altered projections", () => {
  const window = api.WINDOWS[0], id = identity(), dispatch = api.ticket(window, id);
  const item = api.receipt(dispatch, result([row(window)]), id);
  assert.equal(item.schema, "sagejs.general-class-unit-hard-window-receipt.v1");
  assert.deepEqual(api.validateReceipt(item, dispatch, id), item);
  for (const key of ["raw_rows", "selected_labels"]) {
    const changed = clone(item); changed[key] = [];
    const { receipt_sha256, ...body } = changed; changed.receipt_sha256 = base.digest(body);
    assert.throws(() => api.validateReceipt(changed, dispatch, id), /projection/);
  }
  const changed = clone(item); changed.raw_stdout_base64 += "!";
  assert.throws(() => api.validateReceipt(changed, dispatch, id), /projection/);
  assert.throws(() => api.validateReceipt(item, api.ticket(api.WINDOWS[1], id), id), /outside/);
});

test("query uses bounded read-only psql arguments and decodes COPY escaping", () => {
  const window = api.WINDOWS[0], r = row(window), expected = result([r]);
  const output = api.queryWindow(window, (command, args, options) => {
    assert.equal(command, "psql");
    assert.ok(args.includes("--set=ON_ERROR_STOP=1"));
    assert.equal(options.timeout, 30000);
    assert.equal(options.maxBuffer, 8 * 1024 * 1024);
    assert.equal(options.killSignal, "SIGKILL");
    assert.equal(options.env.PGCONNECT_TIMEOUT, "8");
    assert.equal(options.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=20000");
    assert.equal(options.env.PGPASSWORD, "private-value");
    return { status: 0, stdout: expected.raw, stderr: Buffer.alloc(0) };
  }, { LMFDB_PGPASSWORD: "private-value" });
  assert.equal(output.failure, null);
  assert.deepEqual(api.parseRaw(output.raw, window), [r]);
  assert.equal(JSON.stringify(output).includes("private-value"), false);
});

test("query errors, caps, malformed responses and empty responses are retained", () => {
  const window = api.WINDOWS[0], id = identity(), dispatch = api.ticket(window, id);
  const cases = [
    [{ error: { code: "ENOENT" } }, "client-unavailable"],
    [{ error: { code: "ETIMEDOUT" }, stdout: "partial" }, "query-timeout"],
    [{ error: { code: "ENOBUFS" } }, "response-cap"],
    [{ status: 1, stderr: "secret credentials" }, "query-error"],
    [{ status: 1, stderr: "statement timeout secret" }, "query-timeout"],
    [{ status: 0, stdout: "malformed" }, "malformed-response"],
    [{ status: 0, stdout: Buffer.from([255]) }, "malformed-response"],
    [{ status: 0, stdout: Buffer.alloc(api.POLICY.response_byte_cap + 1) }, "response-cap"],
    [{ status: 0, stdout: "", stderr: "" }, null],
  ];
  for (const [run, failure] of cases) {
    const answer = api.queryWindow(window, () => run, {});
    assert.equal(answer.failure, failure);
    assert.ok(answer.raw.length <= api.POLICY.response_byte_cap);
    const item = api.receipt(dispatch, answer, id);
    assert.deepEqual(api.validateReceipt(item, dispatch, id), item);
    assert.equal(item.status, failure ? "error" : "empty");
    assert.equal(JSON.stringify(item).includes("secret"), false);
  }
  assert.equal(api.queryWindow(window, () => { throw new Error("private"); }).failure, "query-error");
});

test("one fetch dispatches at most eight; repeated fetch never retries success empty or error", (t) => {
  const dir = temporary(t); initialize(dir); let queried = 0;
  const query = (window) => { queried++; return queried === 1 ? result([row(window)]) : result([], queried === 2 ? "query-timeout" : null); };
  const first = api.fetch(dir, query);
  assert.equal(first.queried, 8); assert.equal(queried, 8);
  assert.equal(first.pool.records.length, 1);
  assert.equal(first.pool.records[0].source_kind, "hard-window-v1");
  assert.equal(first.pool.qualification_evidence, false);
  assert.equal(first.pool.windows.filter((w) => w.status === "empty").length, 6);
  assert.equal(api.fetch(dir, query).queried, 0); assert.equal(queried, 8);
  assert.deepEqual(api.replay(dir), first.pool);
  const file = path.join(dir, api.WINDOWS[0].id + ".receipt.json"), before = fs.readFileSync(file);
  assert.throws(() => api.immutableJson(file, {}), /EEXIST/);
  assert.deepEqual(fs.readFileSync(file), before);
});

test("interrupted dispatch is durable and fails closed without more queries", (t) => {
  const dir = temporary(t); initialize(dir); let calls = 0;
  assert.throws(() => api.fetch(dir, () => { calls++; throw new Error("interrupted fixture"); }), /interrupted fixture/);
  assert.equal(api.replay(dir).windows[0].status, "interrupted-or-in-progress");
  assert.throws(() => api.fetch(dir, () => { calls++; return result(); }), /unresolved dispatch/);
  assert.equal(calls, 1);
  assert.equal(fs.existsSync(path.join(dir, "fetch.lock")), false);
});

test("lock, unexpected files and mismatched ticket filename fail closed", (t) => {
  const dir = temporary(t); initialize(dir);
  fs.writeFileSync(path.join(dir, "fetch.lock"), "held");
  assert.throws(() => api.fetch(dir, () => assert.fail("must not query")), /EEXIST/);
  fs.unlinkSync(path.join(dir, "fetch.lock"));
  api.immutableJson(path.join(dir, api.WINDOWS[0].id + ".dispatch.json"), api.ticket(api.WINDOWS[1], identity()));
  assert.throws(() => api.replay(dir), /filename/);
});

test("plan and offline replay never fetch and require explicit exclusion inputs", (t) => {
  const root = temporary(t), dir = path.join(root, "acquisition"), input = path.join(root, "active.json");
  fs.writeFileSync(input, "[]");
  const original = console.log; console.log = () => {};
  try {
    assert.throws(() => api.main(["plan", "--directory", dir]), /explicit/);
    api.main(["plan", "--directory", dir, "--exclude-input", input]);
    api.main(["check", "--directory", dir]);
    api.main(["replay", "--directory", dir, "--output", path.join(root, "pool.json")]);
    assert.equal(api.replay(dir).windows.every((w) => w.status === "not-dispatched"), true);
    assert.throws(() => api.main(["plan", "--directory", dir, "--exclude-input", input]), /EEXIST/);
    assert.throws(() => api.main(["fetch", "--directory", dir, "--exclude-input", input]), /pinned/);
    assert.throws(() => api.main(["replay", "--directory", dir, "--output", path.join(dir, "pool.json")]), /outside/);
    assert.throws(() => api.main(["check", "--directory", dir, "--max-queries", "9"]), /unknown/);
  } finally { console.log = original; }
});

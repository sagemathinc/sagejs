// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const base = require("./candidate-pool.cjs");
const hard = require("./hard-windows.cjs");
const union = require("./source-union.cjs");

function setup(t, { sameLabel = false, exposed = false, conflict = false, pending = false, empty = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-source-union-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const v2 = path.join(dir, "v2"), hw = path.join(dir, "hard");
  fs.mkdirSync(v2); fs.mkdirSync(hw);
  function row(index) {
    const d = (BigInt(hard.WINDOWS[0].lower_inclusive) + BigInt(index)).toString();
    return { ...Object.fromEntries(base.RAW_KEYS.map((k) => [k, null])), label: `8.8.${d}.1`,
      degree: 8, r2: 0, disc_abs: d, disc_sign: 1, coeffs: ["-1", "0", "0", "0", "0", "0", "0", "0", "1"] };
  }
  const first = row(1), second = row(sameLabel ? 1 : 2);
  if (conflict) second.regulator = "2.500";
  const identity = base.identity([], null, exposed ? [first.label] : []);
  const cell = base.cells().find((c) => c.id === "n8-r2-0-d5-all");
  const receipt = base.receipt(cell, empty ? [] : [first], identity);
  hard.immutableJson(path.join(v2, "export.json"), identity);
  hard.immutableJson(path.join(v2, cell.id + ".000001.receipt.json"), receipt);
  hard.immutableJson(path.join(v2, "pool.json"), base.assemble(identity, [receipt]));
  const text = "[]";
  const manifest = hard.manifest([{ path: "/offline/exclusions.json", json: text, sha256: base.sha256(text), labels: [] }]);
  hard.immutableJson(path.join(hw, "manifest.json"), manifest);
  if (!pending) hard.fetch(hw, (window) => ({
    raw: Buffer.from(window.id === hard.WINDOWS[0].id && !empty ? JSON.stringify(second) + "\n" : ""),
    failure: window.id === hard.WINDOWS[1].id ? "query-timeout" : null, response_truncated: false,
  }));
  return { dir, v2, hw, first, second };
}

test("validated union keeps both source kinds and normalized membership fields", (t) => {
  const f = setup(t), result = union.buildUnion(f.v2, f.hw);
  assert.equal(result.schema, "sagejs.general-class-unit-source-union.v1");
  assert.equal(result.selected_count, 2);
  assert.deepEqual(result.records.map((r) => r.label), [f.first.label, f.second.label]);
  assert.deepEqual(result.records.map((r) => r.sources[0].source_kind), ["candidate-pool-v2", "hard-window-v1"]);
  for (const record of result.records) {
    assert.equal(record.degree, 8); assert.deepEqual(record.signature, [8, 0]);
    assert.equal(record.coefficients.length, 9);
    assert.equal(record.discriminant_sign, 1); assert.match(record.discriminant_absolute, /^[0-9]+$/);
    assert.equal(record.holdout_eligible, null); assert.equal(record.final_role, null);
    assert.equal(record.reference_time_band, "pending");
    for (const source of record.sources) {
      assert.match(source.source_row_sha256, /^[a-f0-9]{64}$/);
      assert.match(source.source_receipt_sha256, /^[a-f0-9]{64}$/);
      assert.match(source.acquisition_sha256, /^[a-f0-9]{64}$/);
    }
  }
  assert.equal(result.frozen, false); assert.equal(result.qualification_evidence, false);
  assert.equal(result.independent_replay, false);
  assert.equal(result.acquisitions[1].windows[1].status, "error");
  assert.ok(result.acquisitions[0].cells.some((c) => c.status === "pending"));
  assert.deepEqual(union.buildUnion(f.v2, f.hw), result);
});

test("duplicate exact metadata retains both provenances and conservative exposure", (t) => {
  const f = setup(t, { sameLabel: true, exposed: true });
  const result = union.buildUnion(f.v2, f.hw);
  assert.equal(result.selected_count, 1); assert.equal(result.duplicate_label_count, 1);
  assert.equal(result.records[0].sources.length, 2);
  assert.equal(result.records[0].holdout_eligible, false);
  assert.equal(result.records[0].exposure, "historically-exposed-development-only");
});

test("duplicate label with changed source metadata fails even if not a core invariant", (t) => {
  const f = setup(t, { sameLabel: true, conflict: true });
  assert.throws(() => union.buildUnion(f.v2, f.hw), /metadata disagreement.*regulator/);
});

test("empty and incomplete acquisitions remain explicitly empty or pending", (t) => {
  const f = setup(t, { empty: true, pending: true });
  const result = union.buildUnion(f.v2, f.hw);
  assert.equal(result.records.length, 0);
  assert.equal(result.acquisitions[1].windows.every((w) => w.status === "not-dispatched"), true);
  const manifest = hard.validateManifest(JSON.parse(fs.readFileSync(path.join(f.hw, "manifest.json"))));
  hard.immutableJson(path.join(f.hw, hard.WINDOWS[0].id + ".dispatch.json"), hard.ticket(hard.WINDOWS[0], manifest));
  assert.equal(union.buildUnion(f.v2, f.hw).acquisitions[1].windows[0].status, "interrupted-or-in-progress");
});

test("fabricated label membership and stale v2 pool projection are rejected", (t) => {
  const f = setup(t), filename = path.join(f.v2, "pool.json");
  const pool = JSON.parse(fs.readFileSync(filename));
  pool.records[0].label = pool.records[0].label.replace(/\.1$/, ".2");
  pool.records_sha256 = base.digest(pool.records);
  const { pool_sha256, ...body } = pool; pool.pool_sha256 = base.digest(body);
  fs.writeFileSync(filename, JSON.stringify(pool));
  assert.throws(() => union.buildUnion(f.v2, f.hw), /projection mismatch/);
});

test("corrupted hard receipt and missing source acquisition are rejected", (t) => {
  const f = setup(t), filename = path.join(f.hw, hard.WINDOWS[0].id + ".receipt.json");
  const item = JSON.parse(fs.readFileSync(filename)); item.selected_labels = [];
  fs.writeFileSync(filename, JSON.stringify(item));
  assert.throws(() => union.buildUnion(f.v2, f.hw), /projection/);
  assert.throws(() => union.buildUnion(path.join(f.dir, "missing"), f.hw), /ENOENT/);
});

test("CLI only publishes a new output outside acquisition directories", (t) => {
  const f = setup(t), output = path.join(f.dir, "union.json");
  const args = ["--v2-directory", f.v2, "--hard-directory", f.hw];
  const log = console.log; console.log = () => {};
  try {
    assert.throws(() => union.main(args), /required/);
    for (const directory of [f.v2, f.hw]) assert.throws(() => union.main([...args, "--output", path.join(directory, "union.json")]), /outside/);
    union.main([...args, "--output", output]);
    const before = fs.readFileSync(output);
    assert.throws(() => union.main([...args, "--output", output]), /EEXIST/);
    assert.deepEqual(fs.readFileSync(output), before);
    assert.throws(() => union.main([...args, "--fetch", "yes", "--output", output]), /unknown/);
  } finally { console.log = log; }
});

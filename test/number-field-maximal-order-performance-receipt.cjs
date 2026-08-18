"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const stem = "number-field-maximal-order-current-head-0abc59da-2026-08-18";
const jsonPath = path.join(root, "bench", "results", `${stem}.json`);
const markdownPath = path.join(root, "bench", "results", `${stem}.md`);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

function readReceipt() {
  return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
}

test("current-head maximal-order receipt has stable payload integrity", () => {
  const receipt = readReceipt();
  const expected = receipt.integrity.payload_sha256;
  delete receipt.integrity;
  const actual = crypto
    .createHash("sha256")
    .update(JSON.stringify(stable(receipt)))
    .digest("hex");
  assert.equal(actual, expected);
});

test("current-head maximal-order receipt covers every original gate", () => {
  const receipt = readReceipt();
  assert.equal(
    receipt.identity.measured_commit,
    "0abc59da72b735bbb4d90a03f980e3ffafde7b09",
  );
  assert.equal(receipt.acceptance_gates.length, 36);
  assert.equal(new Set(receipt.acceptance_gates.map((gate) => gate.id)).size, 36);
  assert.equal(receipt.completion_definition.length, 9);
  assert.deepEqual(receipt.acceptance_summary, {
    pass: 7,
    partial: 6,
    fail: 10,
    not_remeasured: 11,
    not_established: 2,
  });
});

test("retained public samples are exact and match declared counts", () => {
  const receipt = readReceipt();
  assert.equal(receipt.measurements.six_public_cases.length, 6);
  for (const entry of receipt.measurements.six_public_cases) {
    assert.equal(entry.checked_public.exact_verifier, true, entry.id);
    assert.equal(
      entry.checked_public.raw_samples_ms.length,
      entry.checked_public.samples,
      entry.id,
    );
    assert.equal(entry.fused_public_hook.certificate_equal, true, entry.id);
    assert.equal(
      entry.native_order_kernel.raw_samples_us.length,
      entry.native_order_kernel.samples,
      entry.id,
    );
    assert.equal(entry.native_order_kernel.exact, true, entry.id);
  }
  assert.equal(receipt.measurements.t8_bad_generator.exact_verifier, true);
  assert.equal(receipt.measurements.precision_degree_12.exact_verifier, true);
  assert.equal(receipt.measurements.vector010_round4_local.exact, true);
  assert.equal(receipt.measurements.worker_vector001.exact_equivalent, true);
});

test("markdown receipt names its JSON integrity and gate outcomes", () => {
  const receipt = readReceipt();
  const markdown = fs.readFileSync(markdownPath, "utf8");
  assert.match(markdown, new RegExp(receipt.integrity.payload_sha256));
  for (const gate of receipt.acceptance_gates) {
    assert.match(markdown, new RegExp(`\\| ${gate.id.replace(".", "\\.")} \\|`));
  }
  assert.match(markdown, /Ten original gates fail/);
});

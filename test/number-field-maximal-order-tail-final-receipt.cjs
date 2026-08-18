"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { digest } = require("../tools/number-field-maximal-order/runner.cjs");

const receiptPath = path.join(
  __dirname,
  "..",
  "bench",
  "results",
  "number-field-maximal-order-tail-final-2dbfd840-2026-08-18.json",
);
const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));

test("final maximal-order tail receipt retains its authenticated payload", () => {
  assert.equal(receipt.schema, "sagejs.number-fields/maximal-order-tail-final-receipt-v1");
  const { integrity, ...payload } = receipt;
  assert.equal(integrity.algorithm, "sha256(stable-json(receipt-without-integrity))");
  assert.equal(
    integrity.payload_sha256,
    "6f5e1401c5f44d344dde2aaca877727181f9d8a67ad9b02530c252bfe7ad0b7a",
  );
  assert.equal(digest(payload), integrity.payload_sha256);

  assert.deepEqual(
    {
      commit: receipt.measurement_identity.commit,
      tree: receipt.measurement_identity.tree,
      clean: receipt.measurement_identity.clean,
      native_index_sha256: receipt.measurement_identity.native_index_sha256,
      production_native_complete: receipt.measurement_identity.production_native_complete,
      production_native_module_count: receipt.measurement_identity.production_native_module_count,
    },
    {
      commit: "2dbfd8401dbe7eac3298d81ee8d91510fbec5548",
      tree: "05da5cc38a4f146ef2c434dcc882d592b7d1c091",
      clean: true,
      native_index_sha256: "629cb3fc33eedc675add0af8b58c12fea5d6a79dad77f07c2b0e23375dd4be77",
      production_native_complete: true,
      production_native_module_count: 22,
    },
  );
});

test("final maximal-order tail rows are exact copies with expected terminal states", () => {
  const expected = {
    "pari-large-prime-quadratic-compositum": {
      report: "c7b291b8066dec2ace71008385fcdcccd23094249fef651cd3bd59645de9cf8a",
      payload: "3b34da2093bbc5fcbdd2a7370f06e2f158f7c78c882b04bb8d158f855332ac72",
      row: "7dbf737c25a931b5b447f91f2fe37fba8dc81d8d072041cd9aa988991b60bb72",
      status: "ok",
      median: 3801.546335220337,
      peak: 775468,
    },
    "hecke-degree-90": {
      report: "cba2201b931ee774a824bbf84704ee60527b5c18290ff7b0e6d6627dfc91cd58",
      payload: "cefb5d736c52197304c2237ce05c69d3ab4b2d9b8749815befa18a658e825185",
      row: "c93b909f1295ed8f99413654a1dd7532c631611acc78ba9bef8397999d4d3c89",
      status: "crash",
      median: null,
      peak: 712928,
    },
    "regression-x64-plus-2pow16": {
      report: "8bcb11ef2962d8f25b879d3b20cd15739740696f20c3496e3c2cafa89ba0b740",
      payload: "2fd6fdca53387e893f16b5401c694227a08f9f8957dc5e265a6e1c2dbf5c3212",
      row: "0bc12debfe5f2be74c513eaf75a684bfb78394977462090ace22d5b1bb5a2118",
      status: "ok",
      median: 2991.5688037872314,
      peak: 486356,
    },
  };

  assert.deepEqual(Object.keys(receipt.primary_reports).sort(), Object.keys(expected).sort());
  for (const [caseId, values] of Object.entries(expected)) {
    const report = receipt.primary_reports[caseId];
    assert.equal(report.source_report_sha256, values.report);
    assert.equal(report.source_payload_sha256, values.payload);
    assert.equal(report.raw_row_sha256, values.row);
    assert.equal(digest(report.raw_row), values.row);
    assert.equal(report.raw_row.case_id, caseId);
    assert.equal(report.raw_row.boundary, "warm-public");
    assert.equal(report.raw_row.status, values.status);
    assert.equal(report.raw_row.statistics?.median_ms ?? null, values.median);
    assert.equal(report.raw_row.peak_rss_kb, values.peak);
  }

  assert.equal(
    receipt.primary_reports["pari-large-prime-quadratic-compositum"].raw_row.verification
      .verified,
    true,
  );
  assert.equal(
    receipt.primary_reports["regression-x64-plus-2pow16"].raw_row.verification.verified,
    true,
  );
  assert.match(
    receipt.primary_reports["hecke-degree-90"].raw_row.stderr,
    /change_in_bytes < kMaxReasonableBytes/,
  );
});

test("degree-90 diagnosis fixes the remaining boundary at the eager packed order table", () => {
  const diagnosis = receipt.degree90_stage_diagnosis;
  assert.equal(
    diagnosis.source_stdout_sha256,
    "0f8cfb2d3e7c78ede5bacb85125cfd7af596f411fb31d17f792e27ebcc6f063f",
  );
  assert.equal(diagnosis.diagnostic_policy.outer_bound_ms, 120000);
  assert.equal(diagnosis.diagnostic_policy.stopped_after_boundary_confirmation, true);
  assert.equal(diagnosis.primary_failure.status, "crash");
  assert.match(diagnosis.primary_failure.reason, /SIGTRAP/);

  const decomposition = diagnosis.markers.find((marker) => marker.event === "decompose-end");
  assert.equal(decomposition.duration_s, 6.693860054016113);
  assert.equal(decomposition.components.filter((component) => component.state === "proven-prime").length, 17);
  assert.deepEqual(decomposition.components.at(-1), {
    bits: 1341,
    exponent: 10,
    state: "composite",
  });

  const replacement = diagnosis.markers.find((marker) => marker.event === "split-replacement");
  assert.deepEqual(replacement.replacements, [
    { bits: 22, exponent: 30, state: "proven-prime" },
    { bits: 1277, exponent: 10, state: "composite" },
  ]);
  const finalMarker = diagnosis.markers.at(-1);
  assert.deepEqual(
    {
      event: finalMarker.event,
      support_bits: finalMarker.support_bits,
      state: finalMarker.state,
      duration_s: finalMarker.duration_s,
    },
    {
      event: "composite-dedekind-data-end",
      support_bits: 1277,
      state: "enlarge",
      duration_s: 1.0517079830169678,
    },
  );

  const boundary = diagnosis.exact_boundary;
  assert.equal(boundary.function, "_order_multiplication_table");
  assert.equal(boundary.degree, 90);
  for (const capacity of boundary.packed_capacity_examples) {
    const expectedWords = Math.max(
      16,
      Math.floor((4 * boundary.degree * (capacity.maximum_bits + 1) + 63) / 64) + 8,
    );
    assert.equal(capacity.word_capacity, expectedWords);
    assert.equal(capacity.table_entries, boundary.degree ** 3);
    assert.equal(
      capacity.requested_bytes,
      capacity.word_capacity * 8 * capacity.table_entries,
    );
  }
  assert.ok(boundary.packed_capacity_examples[0].requested_bytes > 39 * 1024 ** 3);
});

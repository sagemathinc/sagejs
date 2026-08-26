// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const REPORT_PATH = path.join(
  ROOT,
  "bench/results/number-field-maximal-order-corpus-505-0abc59da-2026-08-18.json",
);
const CORPUS_PATH = path.join(
  ROOT,
  "test/fixtures/number-field-maximal-order-corpus.json",
);
const TERMINAL_STATES = new Set([
  "ok",
  "invalid",
  "disagreement",
  "timeout",
  "crash",
  "unavailable",
  "unsupported",
]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

test("the 505-case report preserves complete bounded raw evidence", () => {
  const reportBytes = fs.readFileSync(REPORT_PATH);
  const report = JSON.parse(reportBytes);
  const corpusBytes = fs.readFileSync(CORPUS_PATH);
  const corpus = JSON.parse(corpusBytes);

  assert.equal(
    sha256(reportBytes),
    "c3cf0ccd85771ae2a364f2f1776827e751580fa309b7956ce236c05071dbad04",
  );
  assert.equal(
    report.integrity.report_payload_sha256,
    sha256(stableJson({ ...report, integrity: undefined })),
  );
  assert.equal(
    report.integrity.raw_standard_ids_sha256,
    sha256(
      report.standard_records
        .map((record) => `${record.case_id}\t${record.status}`)
        .join("\n"),
    ),
  );
  assert.equal(
    report.integrity.raw_stress_ids_sha256,
    sha256(
      report.stress_records
        .map((record) => `${record.case_id}\t${record.status}`)
        .join("\n"),
    ),
  );

  assert.equal(report.identity.sagejs_commit, "0abc59da72b735bbb4d90a03f980e3ffafde7b09");
  assert.equal(report.identity.sagejs_tree, "d8afd700931b9a8cb4ddd89c8d2364e0407404fd");
  assert.equal(report.identity.tracked_worktree_status, "");
  // The report is an immutable measurement of the pre-adjudication corpus.
  // The current fixture intentionally differs because the addprimes oracle was
  // corrected after this run; the historical invalid row remains preserved.
  assert.equal(
    report.identity.corpus.manifest_digest,
    "e6bf006b01c7cd47d6b0f7fc70db142d85b725ad8d45aeee38aa7775a55b3c07",
  );
  assert.equal(report.identity.corpus.byte_sha256, "695152efb47b614b15f08a140f7f65d11c32d997588c8ccd6f7962f2f025f52f");
  assert.equal(
    corpus.manifestDigest,
    "8d2542159374a799aaf2d726498020a437bee407fab01325ec458f7ee47f46ea",
  );
  assert.equal(
    sha256(corpusBytes),
    "03aca43a4f02bf148ef2a538f132086e99fd66b7c0c26b3cb8b304d3040a1a0f",
  );
  assert.notEqual(report.identity.corpus.manifest_digest, corpus.manifestDigest);
  assert.notEqual(report.identity.corpus.byte_sha256, sha256(corpusBytes));
  assert.equal(report.identity.flint_addon.sha256, "f6017e952166adfe0cb87b26e467902dbb607989908d434bdfb70562240cfb1d");
  assert.equal(report.identity.production_native_registry.sha256, "63020b64e01983bfa62dcc18b5859503044465ba0f8d4c5ceb560e9cb59ea380");
  assert.deepEqual(
    Object.keys(report.identity.production_native_registry.relevant_logical_sources).sort(),
    [
      "sagejs/kernels/matrix/word_prime_krylov.py",
      "sagejs/number_fields/bl_composite_kernel.py",
      "sagejs/number_fields/field_analysis_resource.py",
    ],
  );

  const standardIds = corpus.cases
    .filter((entry) => entry.tier === "standard")
    .map((entry) => entry.id);
  const stressIds = corpus.cases
    .filter((entry) => entry.tier === "stress")
    .map((entry) => entry.id);
  assert.equal(standardIds.length, 489);
  assert.equal(stressIds.length, 16);
  assert.deepEqual(report.standard_records.map((record) => record.case_id), standardIds);
  assert.deepEqual(report.stress_records.map((record) => record.case_id), stressIds);
  assert(report.standard_records.every((record) => TERMINAL_STATES.has(record.status)));
  assert(report.stress_records.every((record) => TERMINAL_STATES.has(record.status)));
  assert(report.standard_records.every((record) => record.timeout_ms === 5_000));
  assert(report.standard_records.every((record) => record.uniform_policy === true));
  assert(report.standard_records.every((record) => record.longer_diagnostic_substituted === false));

  assert.deepEqual(report.summary.standard_state_counts, {
    ok: 477,
    invalid: 1,
    disagreement: 0,
    timeout: 11,
    crash: 0,
    unavailable: 0,
    unsupported: 0,
  });
  assert.equal(
    Object.values(report.summary.standard_state_counts).reduce(
      (total, count) => total + count,
      0,
    ),
    489,
  );
  assert.equal(report.summary.standard_terminal_accounting_complete, true);
  assert.equal(report.summary.standard_independently_verified_lattices, 477);
  assert.equal(report.summary.standard_certificate_mismatches, 1);
  assert.equal(report.summary.standard_independently_wrong_lattices, 0);
  assert.equal(report.summary.zero_wrong_lattice_accounting, true);

  const accepted = report.standard_records.filter((record) => record.status === "ok");
  assert.equal(accepted.length, 477);
  for (const record of accepted) {
    assert.equal(record.verification.verified, true, record.case_id);
    assert(
      Object.values(record.verification.checks).every(Boolean),
      record.case_id,
    );
    assert.equal(record.statistics.sample_count, 1, record.case_id);
  }

  const timeoutIds = report.standard_records
    .filter((record) => record.status === "timeout")
    .map((record) => record.case_id);
  assert.deepEqual(timeoutIds, report.summary.uniform_timeout_ids);
  assert.deepEqual(timeoutIds, [
    "pari-round4-vector-010",
    "pari-round4-vector-139",
    "pari-round4-vector-420",
    "pari-round4-vector-422",
    "pari-round4-vector-429",
    "regression-x64-plus-2pow16",
    "regression-degree-24",
    "pari-2011",
    "pari-large-prime-quadratic-compositum",
    "hecke-degree-90",
    "hecke-precision-degree-12",
  ]);
  assert.deepEqual(
    report.longer_diagnostic_records.map((record) => record.case_id),
    timeoutIds,
  );
  assert(
    report.longer_diagnostic_records.every(
      (record) =>
        record.timeout_ms === 30_000 &&
        record.non_substituting === true &&
        record.substituted_into_uniform_results === false,
    ),
  );
  assert.deepEqual(report.summary.longer_diagnostic_state_counts, {
    ok: 6,
    invalid: 0,
    disagreement: 0,
    timeout: 5,
    crash: 0,
    unavailable: 0,
    unsupported: 0,
  });

  assert.equal(report.worker_recovery_records.length, 23);
  assert(
    report.worker_recovery_records.every(
      (record) =>
        record.status === "ok" &&
        record.verification.verified === true &&
        record.excluded_from_uniform_results === true &&
        record.non_substituting === true,
    ),
  );
  assert.deepEqual(report.summary.worker_recovery_state_counts, {
    ok: 23,
    invalid: 0,
    disagreement: 0,
    timeout: 0,
    crash: 0,
    unavailable: 0,
    unsupported: 0,
  });

  assert.equal(report.stress_records.length, 16);
  for (const record of report.stress_records) {
    assert.equal(record.status, "ok", record.case_id);
    assert.equal(record.verification.verified, true, record.case_id);
    assert.equal(record.verification.current_sagejs_lattice_executed, false);
    assert.equal(record.verification.multiplication_closure_recomputed, false);
    assert.match(record.public_execution, /not-run/);
  }
});

test("the addprimes invalid row is retained and adjudicated as a corpus defect", () => {
  const report = JSON.parse(fs.readFileSync(REPORT_PATH));
  const record = report.standard_records.find(
    (entry) => entry.case_id === "addprimes-degree-7",
  );
  const adjudication = report.certificate_adjudications.find(
    (entry) => entry.case_id === "addprimes-degree-7",
  );

  assert.equal(record.status, "invalid");
  assert.equal(record.statistics, null);
  assert.equal(record.rejected_statistics.sample_count, 1);
  assert.equal(record.verification.verified, false);
  assert.deepEqual(record.verification.checks, {
    nonsingular: true,
    contains_one: true,
    contains_equation_order: true,
    multiplication_closed: true,
    discriminant_index_identity: true,
    frozen_certificate: false,
  });
  assert.deepEqual(record.verification.errors, [
    "field discriminant disagrees with the frozen certificate",
    "equation-order index disagrees with the frozen certificate",
    "canonical basis lattice disagrees with the frozen certificate",
  ]);

  assert.equal(adjudication.uniform_status_preserved, "invalid");
  assert.equal(adjudication.classification, "frozen-corpus-certificate-defect");
  assert.equal(adjudication.independent_oracle.status, "ok");
  assert.equal(adjudication.independent_oracle.timeout_ms, 5_000);
  assert.equal(
    adjudication.independent_oracle.field_discriminant,
    adjudication.sagejs_returned.field_discriminant,
  );
  assert.equal(
    adjudication.independent_oracle.equation_order_index,
    adjudication.sagejs_returned.equation_order_index,
  );
  assert.equal(
    adjudication.independent_oracle.canonical_basis_digest,
    adjudication.sagejs_returned.canonical_basis_digest,
  );
  assert.notEqual(
    adjudication.sagejs_returned.canonical_basis_digest,
    adjudication.frozen.canonical_basis_digest,
  );
});

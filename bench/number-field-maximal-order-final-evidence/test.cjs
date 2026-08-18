"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const test = require("node:test");

const ROOT = resolve(__dirname, "../..");
const CLI = resolve(ROOT, "bench/number-field-maximal-order-final-evidence.cjs");
const {
  BOUNDARY_CONTRACTS,
  finalizeEvidenceReport,
  terminalAccounting,
  verifyEvidenceIntegrity,
} = require("./accounting.cjs");
const {
  buildEvidenceManifest,
  loadCorpus,
} = require("./corpus.cjs");
const {
  evaluateGates,
  gatePayloadDigest,
} = require("./gates.cjs");
const {
  groupDiagnosticRows,
  makeColdRecord,
  planEvidenceRun,
  runColdEvidence,
} = require("./runner.cjs");

function verifiedRecord(caseId, system, boundary, timingMs = 1) {
  return {
    case_id: caseId,
    system,
    implementation_family: system === "pari" ? "pari-sage" : "sagejs",
    boundary,
    status: "ok",
    timeout_ms: 5_000,
    samples: [{ timing_ms: timingMs }],
    statistics: {
      median_ms: timingMs,
      mad_ms: 0,
      minimum_ms: timingMs,
      maximum_ms: timingMs,
      sample_count: 1,
    },
    verification: {
      verified: true,
      canonical_basis: { digest: `${caseId}-basis` },
    },
  };
}

function finalReport(records, expectedRecords = records) {
  return finalizeEvidenceReport({
    generated_at: "2026-08-18T00:00:00.000Z",
    profile: "synthetic",
    implementation_families: {
      "pari-sage": {
        members: ["pari", "sage"],
        independence: "shared PARI maximal-order implementation",
      },
      sagejs: {
        members: ["sagejs", "sagejs-dynamic", "sagejs-native"],
        independence: "implementation under test",
      },
    },
    records,
    cases: [...new Set(records.map((record) => record.case_id))].map((id) => ({ id })),
    summary: {},
  }, {
    expectedRecords,
    identity: {
      source: { commit: "a".repeat(40), tree: "b".repeat(40), clean: true },
      platform: {
        platform: "linux",
        architecture: "x64",
        hostname: "evidence-test",
      },
      native_artifacts: {},
    },
    loadStart: { load_average_1m_5m_15m: [0, 0, 0] },
    loadEnd: { load_average_1m_5m_15m: [0, 0, 0] },
    runKind: "uniform-primary",
    selection: "quick",
  });
}

test("final selections are derived from the corrected 505-case corpus", () => {
  const corpus = loadCorpus();
  assert.equal(corpus.cases.length, 505);
  assert.equal(buildEvidenceManifest({ selection: "standard" }).cases.length, 489);
  assert.equal(buildEvidenceManifest({ selection: "stress" }).cases.length, 16);
  assert.equal(buildEvidenceManifest({ selection: "round4" }).cases.length, 477);
  assert.equal(buildEvidenceManifest({ selection: "hecke" }).cases.length, 6);
  assert.equal(buildEvidenceManifest({ selection: "equivalent" }).cases.length, 34);
  const addprimes = corpus.cases.find((entry) => entry.id === "addprimes-degree-7");
  assert.equal(addprimes.fieldDiscriminant, "-1654803061237150235374988302272");
  assert.equal(addprimes.equationOrderIndex, "558573");
  assert.equal(
    addprimes.basis.digest,
    "8fb192c7a7e9aade6fef4192eff1ae429b33be25f1a5462924e34e725bc9877b",
  );
});

test("raw terminal accounting rejects omission, duplication, and unknown states", () => {
  const expected = [
    { case_id: "a", system: "sagejs", boundary: "warm-public" },
    { case_id: "b", system: "sagejs", boundary: "warm-public" },
  ];
  const complete = terminalAccounting([
    { ...expected[0], status: "ok", verification: { verified: true } },
    { ...expected[1], status: "timeout" },
  ], expected);
  assert.equal(complete.complete, true);
  assert.deepEqual(complete.state_counts, {
    ok: 1,
    invalid: 0,
    disagreement: 0,
    timeout: 1,
    crash: 0,
    unavailable: 0,
    unsupported: 0,
  });

  const broken = terminalAccounting([
    { ...expected[0], status: "ok" },
    { ...expected[0], status: "mystery" },
  ], expected);
  assert.equal(broken.complete, false);
  assert.equal(broken.missing_keys.length, 1);
  assert.equal(broken.duplicate_keys.length, 1);
  assert.equal(broken.unknown_states.length, 1);
});

test("finalized evidence labels family and boundary semantics and authenticates payload", () => {
  const report = finalReport([
    {
      ...verifiedRecord("motivating-degree-7", "sagejs", "native-public", 3),
      optional_adapter_field: undefined,
    },
  ]);
  assert.equal(report.raw_terminal_accounting.complete, true);
  assert.equal(report.oracle_matrix.sagejs.state_counts.ok, 1);
  assert.match(report.boundary_contracts["native-public"].caveat, /not a direct/);
  assert.equal(verifyEvidenceIntegrity(report).verified, true);
  assert.equal(
    verifyEvidenceIntegrity(JSON.parse(JSON.stringify(report))).verified,
    true,
  );
  report.records[0].statistics.median_ms = 4;
  assert.equal(verifyEvidenceIntegrity(report).verified, false);
  assert.equal(BOUNDARY_CONTRACTS["native-kernel"].class, "direct-local-kernel");
});

test("cold records retain exact verification and reject invalid timing", () => {
  const cold = makeColdRecord({
    ...verifiedRecord("motivating-degree-7", "sagejs", "warm-public", 2),
    process_startup_ms: 10,
    request_wall_ms: 7,
  });
  assert.equal(cold.boundary, "cold-application");
  assert.equal(cold.inner_boundary, "warm-public");
  assert.equal(cold.statistics.median_ms, 17);

  const invalid = makeColdRecord({
    ...cold,
    boundary: "warm-public",
    status: "invalid",
  });
  assert.equal(invalid.statistics, null);
  assert.equal(invalid.rejected_statistics.median_ms, 17);
});

test("cold runner rejects policies that would reuse a process", async () => {
  await assert.rejects(
    runColdEvidence({ selection: "quick", samples: 2 }),
    /exactly one fresh-process sample/,
  );
  await assert.rejects(
    runColdEvidence({ selection: "quick", warmups: 1 }),
    /zero warmups/,
  );
});

test("bounded diagnostics select raw terminal rows without substitution", () => {
  const primary = finalReport([
    { case_id: "a", system: "sagejs", boundary: "warm-public", status: "timeout" },
    { case_id: "b", system: "sagejs", boundary: "warm-public", status: "ok" },
    { case_id: "c", system: "pari", boundary: "nfbasis", status: "timeout" },
  ]);
  const groups = groupDiagnosticRows(primary, ["timeout"]);
  assert.deepEqual(groups.map((entry) => [entry.system, entry.boundary, entry.caseIds]), [
    ["sagejs", "warm-public", ["a"]],
    ["pari", "nfbasis", ["c"]],
  ]);
});

test("gate evaluator does not mistake forced public native mode for a native kernel", () => {
  const report = finalReport([
    verifiedRecord("motivating-degree-7", "sagejs", "warm-public", 1.5),
    verifiedRecord("pure-bad-generator-n8-c2pow32", "sagejs", "warm-public", 20),
    verifiedRecord("motivating-degree-7", "sagejs", "native-public", 1),
  ]);
  const receipt = evaluateGates([report]);
  const byId = new Map(receipt.gates.map((entry) => [entry.id, entry]));
  assert.equal(byId.get("performance.t8-public").status, "pass");
  assert.equal(byId.get("performance.native-micro").status, "not-measured");
  assert.equal(byId.get("corpus.corrected-standard").status, "partial");
  assert.equal(byId.get("evidence.integrity").status, "pass");
  const roundTripped = JSON.parse(JSON.stringify(receipt));
  assert.equal(gatePayloadDigest(roundTripped), roundTripped.integrity.payload_sha256);
});

test("direct hard-local ratio gates use only true native-kernel rows", () => {
  const report = finalReport([
    verifiedRecord("pari-2510", "sagejs", "native-kernel", 12),
    verifiedRecord("pari-2510", "pari", "nfbasis", 10),
    verifiedRecord("pari-1710", "sagejs", "native-kernel", 9),
    verifiedRecord("pari-1710", "pari", "nfbasis", 10),
  ]);
  const receipt = evaluateGates([report]);
  const hard = receipt.gates.find((entry) => entry.id === "performance.hard-local-2510-1710");
  assert.equal(hard.status, "pass");
  assert(Math.abs(hard.evidence.geometric_mean - Math.sqrt(1.08)) < 1e-12);
});

test("CLI validates and plans the full standard matrix without executing it", () => {
  const validate = spawnSync(process.execPath, [CLI, "validate"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(validate.status, 0, validate.stderr);
  assert.match(validate.stdout, /standard=489/);
  assert.match(validate.stdout, /stress=16/);

  const plan = spawnSync(process.execPath, [CLI, "plan", "--selection", "standard"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(plan.status, 0, plan.stderr);
  const payload = JSON.parse(plan.stdout);
  assert.equal(payload.case_count, 489);
  assert.equal(payload.expected_record_count, 489);
  assert.deepEqual(payload.systems, ["sagejs"]);
  assert.deepEqual(payload.boundaries, { sagejs: ["warm-public"] });
  assert.equal(planEvidenceRun({ selection: "stress" }).case_count, 16);
});

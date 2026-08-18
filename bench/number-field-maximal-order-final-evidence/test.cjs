"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { resolve } = require("node:path");
const test = require("node:test");

const ROOT = resolve(__dirname, "../..");
const CLI = resolve(ROOT, "bench/number-field-maximal-order-final-evidence.cjs");
const PLATFORM_CLI = resolve(ROOT, "tools/number-field-maximal-order/platform-validation.cjs");
const {
  BOUNDARY_CONTRACTS,
  finalizeEvidenceReport,
  terminalAccounting,
  verifyEvidenceIntegrity,
} = require("./accounting.cjs");
const {
  buildEvidenceManifest,
  buildRandomizedEvidenceManifest,
  directEvidencePlan,
  loadCorpus,
  SAGEJS_EVIDENCE_BOUNDARIES,
  translatePolynomial,
} = require("./corpus.cjs");
const {
  evaluateGates,
  gatePayloadDigest,
} = require("./gates.cjs");
const {
  groupDiagnosticRows,
  loadPlatformValidation,
  makeColdRecord,
  planEvidenceRun,
  runColdEvidence,
} = require("./runner.cjs");
const {
  readProcessTreeRssKilobytes,
} = require("../../tools/number-field-maximal-order/process.cjs");
const {
  REQUIRED_CHECKS,
  platformReceiptDigest,
  runCheck,
  validatePlatformValidationReceipt,
} = require("../../tools/number-field-maximal-order/platform-validation.cjs");

function verifiedRecord(caseId, system, boundary, timingMs = 1, options = {}) {
  const sampleCount = options.sampleCount ?? 3;
  return {
    case_id: caseId,
    system,
    implementation_family: system === "pari" ? "pari-sage" : "sagejs",
    boundary,
    status: "ok",
    timeout_ms: 5_000,
    samples: Array.from({ length: sampleCount }, () => ({ timing_ms: timingMs })),
    statistics: {
      median_ms: timingMs,
      mad_ms: 0,
      minimum_ms: timingMs,
      maximum_ms: timingMs,
      sample_count: sampleCount,
    },
    verification: {
      verified: true,
      canonical_basis: { digest: `${caseId}-basis` },
    },
    ...options.fields,
  };
}

function unavailableRecord(caseId, system, boundary) {
  return { case_id: caseId, system, boundary, status: "unavailable" };
}

function syntheticPlatformReceipt(target, sourceCommit = "a".repeat(40), sourceTree = "b".repeat(40)) {
  const receipt = {
    schema: "sagejs.number-fields/platform-validation-v1",
    target,
    source_commit: sourceCommit,
    source_tree: sourceTree,
    source_clean: true,
    checks: Object.fromEntries(REQUIRED_CHECKS.map((name) => [name, {
      status: "pass",
      argv: ["node", `test/${name}.cjs`],
      command: `node test/${name}.cjs`,
      duration_ms: 1,
      peak_rss_kb: name === "representative_performance" ? 1024 : null,
      peak_rss_scope: name === "representative_performance" ? "process-tree" : null,
    }])),
  };
  receipt.integrity = {
    algorithm: "sha256(stable-json(receipt-without-integrity))",
    payload_sha256: platformReceiptDigest(receipt),
  };
  return receipt;
}

function finalReport(records, expectedRecords = records, options = {}) {
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
    ...(options.raw || {}),
  }, {
    expectedRecords,
    identity: options.identity || {
      source: { commit: "a".repeat(40), tree: "b".repeat(40), clean: true },
      platform: {
        platform: "linux",
        architecture: "x64",
        hostname: "evidence-test",
      },
      native_artifacts: Object.fromEntries([
        "packages/flint/build/Release/sagejs_flint.node",
        "packages/flint/build/generated-ffi/sagejs_flint_ffi.node",
        "dist/tools/kernel.js",
        "dist/native-kernels/index.json",
      ].map((path) => [path, { status: "ok", sha256: "d".repeat(64) }])),
      production_native: {
        status: "ok",
        complete: true,
        index: { status: "ok", sha256: "c".repeat(64) },
        modules: {},
      },
    },
    loadStart: { load_average_1m_5m_15m: [0, 0, 0] },
    loadEnd: { load_average_1m_5m_15m: [0, 0, 0] },
    runKind: "uniform-primary",
    selection: "quick",
    platformValidation: options.platformValidation || null,
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

test("all stress cases have an honest direct polynomial-to-HNF strategy", () => {
  const manifest = buildEvidenceManifest({ selection: "stress" });
  assert.equal(manifest.cases.length, 16);
  assert(manifest.cases.every((entry) => entry.native_kernel_eligible));
  assert.equal(
    manifest.cases.filter(
      (entry) => entry.direct_evidence.strategy === "authenticated-composite-analysis",
    ).length,
    11,
  );
  assert.equal(
    manifest.cases.filter(
      (entry) => entry.direct_evidence.strategy === "certified-prime-resource",
    ).length,
    5,
  );
  const unsupported = directEvidencePlan({
    localIndexFactors: [{ value: String(1n << 80n), valuation: 1, state: "proven-prime" }],
  });
  assert.equal(unsupported.supported, false);
  assert.equal(unsupported.strategy, "unsupported");
});

test("seeded equivalent-generator schedules are exact and reproducible", () => {
  assert.deepEqual(translatePolynomial(["1", "0", "1"], 2), ["5", "4", "1"]);
  const first = buildRandomizedEvidenceManifest({ seed: 123, count: 4 });
  const repeated = buildRandomizedEvidenceManifest({ seed: 123, count: 4 });
  const different = buildRandomizedEvidenceManifest({ seed: 124, count: 4 });
  assert.deepEqual(first.randomized_generator_schedule, repeated.randomized_generator_schedule);
  assert.notDeepEqual(first.randomized_generator_schedule, different.randomized_generator_schedule);
  assert.equal(first.cases.length, 4);
  assert(first.cases.every((entry) => entry.corpus_tags.includes("randomized-generator")));
  assert(first.randomized_generator_schedule.transformations.every((entry) =>
    /^[0-9a-f]{64}$/.test(entry.polynomial_digest),
  ));
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

test("RSS accounting identifies the measured process-tree scope", () => {
  const sample = readProcessTreeRssKilobytes(process.pid);
  assert(Number.isFinite(sample.kilobytes));
  assert(sample.kilobytes > 0);
  assert(sample.observed_processes >= 1);
  assert.equal(sample.scope, process.platform === "linux" ? "process-tree" : "process-only");
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

test("warm public micro coverage excludes the separately governed hard-local cases", () => {
  const ids = [
    "motivating-degree-7",
    "sage-essential-discriminant",
    "lmfdb-3.1.431.1",
    "lmfdb-5.1.17161.1",
  ];
  const receipt = evaluateGates([finalReport(
    ids.map((caseId) => verifiedRecord(caseId, "sagejs", "warm-public", 1.5)),
  )]);
  const micro = receipt.gates.find((entry) => entry.id === "performance.warm-public-micro");
  assert.equal(micro.status, "pass");
  assert.deepEqual(micro.evidence.expected_ids, ids);
});

test("native micro eligibility comes from best references below one millisecond", () => {
  let receipt = evaluateGates([finalReport([
    verifiedRecord("motivating-degree-7", "pari", "nfbasis", 0.2),
    verifiedRecord("motivating-degree-7", "sagejs", "native-kernel", 0.24),
    verifiedRecord("pari-2510", "pari", "nfbasis", 1.1),
    verifiedRecord("pari-2510", "sagejs", "native-kernel", 0.4),
  ])]);
  let native = receipt.gates.find((entry) => entry.id === "performance.native-micro");
  assert.equal(native.status, "pass");
  assert.deepEqual(native.evidence.eligible_ids, ["motivating-degree-7"]);

  receipt = evaluateGates([finalReport([
    verifiedRecord("motivating-degree-7", "pari", "nfbasis", 0.2),
    verifiedRecord("motivating-degree-7", "sagejs", "native-kernel", 0.26),
  ])]);
  native = receipt.gates.find((entry) => entry.id === "performance.native-micro");
  assert.equal(native.status, "fail");
});

test("direct-reference ratio cannot pass from one eligible row", () => {
  const report = finalReport([
    verifiedRecord("pari-2510", "sagejs", "native-kernel", 1),
    verifiedRecord("pari-2510", "pari", "nfbasis", 1.1),
  ]);
  const ratio = evaluateGates([report]).gates.find(
    (entry) => entry.id === "performance.direct-reference-ratio",
  );
  assert.equal(ratio.status, "partial");
  assert.equal(ratio.evidence.minimum_case_count, 2);
});

test("oracle coverage accepts explicit optional unavailability but not omission", () => {
  const caseId = "motivating-degree-7";
  const records = [
    verifiedRecord(caseId, "sagejs", "warm-public", 1),
    verifiedRecord(caseId, "sagejs-dynamic", "dynamic-public", 1),
    unavailableRecord(caseId, "pari", "nfbasis"),
    unavailableRecord(caseId, "pari", "nfinit"),
    unavailableRecord(caseId, "sage", "warm-public"),
    unavailableRecord(caseId, "hecke", "core"),
    unavailableRecord(caseId, "oscar", "warm-public"),
    unavailableRecord(caseId, "oscar", "cold-application"),
    unavailableRecord(caseId, "magma", "warm-public"),
  ];
  let oracle = evaluateGates([finalReport(records)]).gates.find(
    (entry) => entry.id === "correctness.oracle-coverage",
  );
  assert.equal(oracle.status, "pass");

  oracle = evaluateGates([finalReport(records.slice(0, -1))]).gates.find(
    (entry) => entry.id === "correctness.oracle-coverage",
  );
  assert.equal(oracle.status, "partial");
  assert(oracle.evidence.failures.includes("magma-public"));
});

test("cold boundary coverage is representative and availability-aware", () => {
  const ids = [
    "motivating-degree-7",
    "sage-essential-discriminant",
    "lmfdb-3.1.431.1",
    "lmfdb-5.1.17161.1",
  ];
  const records = ids.flatMap((caseId) => [
    verifiedRecord(caseId, "sagejs", "cold-application", 20),
    unavailableRecord(caseId, "sage", "cold-application"),
    unavailableRecord(caseId, "oscar", "cold-application"),
  ]);
  const cold = evaluateGates([finalReport(records)]).gates.find(
    (entry) => entry.id === "performance.cold-boundary-coverage",
  );
  assert.equal(cold.status, "pass");
});

test("algorithm overlap requires a complete declared supported set", () => {
  const caseId = "motivating-degree-7";
  const boundaries = ["dynamic-public", "round2-local", "round4-local", "om-local"];
  let report = finalReport(
    boundaries.map((boundary) => verifiedRecord(caseId, "sagejs", boundary, 1)),
  );
  let overlap = evaluateGates([report]).gates.find(
    (entry) => entry.id === "correctness.algorithm-overlap",
  );
  assert.equal(report.algorithm_overlap_support.evaluation_complete, true);
  assert.equal(overlap.status, "pass");

  report = finalReport(boundaries.slice(0, -1).map((boundary) =>
    verifiedRecord(caseId, "sagejs", boundary, 1),
  ));
  overlap = evaluateGates([report]).gates.find(
    (entry) => entry.id === "correctness.algorithm-overlap",
  );
  assert.equal(overlap.status, "partial");
});

test("performance gates reject single-sample timings and accept cache identity only untimed", () => {
  const report = finalReport([
    verifiedRecord("pure-bad-generator-n8-c2pow32", "sagejs", "warm-public", 20, {
      sampleCount: 1,
      fields: { cache_identity: { applicable: true, same_object: true, timed: false } },
    }),
  ]);
  let receipt = evaluateGates([report]);
  let byId = new Map(receipt.gates.map((entry) => [entry.id, entry]));
  assert.equal(byId.get("performance.t8-public").status, "fail");
  assert.equal(byId.get("evidence.performance-samples").status, "fail");
  assert.equal(byId.get("evidence.peak-memory").status, "fail");
  assert.equal(byId.get("api.cache-identity").status, "pass");

  const timedReport = finalReport([
    verifiedRecord("pure-bad-generator-n8-c2pow32", "sagejs", "warm-public", 20, {
      fields: { cache_identity: { applicable: true, same_object: true, timed: true } },
    }),
  ]);
  receipt = evaluateGates([timedReport]);
  byId = new Map(receipt.gates.map((entry) => [entry.id, entry]));
  assert.equal(byId.get("api.cache-identity").status, "fail");
});

test("OM selection requires an untraced choice paired with traced execution evidence", () => {
  const warm = verifiedRecord("motivating-degree-7", "sagejs", "warm-public", 1, {
    fields: {
      algorithm_selection: {
        local_decisions: [{
          algorithm: "om-maxmin",
          metrics: { auto_eligibility: { round2: { eligible: true } } },
        }],
      },
      selected_algorithm: "om",
    },
  });
  const traced = verifiedRecord(
    "motivating-degree-7",
    "sagejs",
    "traced-public-diagnostic",
    2,
    { fields: { executed_algorithms: ["om-maxmin"] } },
  );
  const control = verifiedRecord(
    "motivating-degree-7",
    "sagejs",
    "round2-local",
    2,
  );
  const receipt = evaluateGates([finalReport([warm, traced, control])]);
  assert.equal(
    receipt.gates.find((entry) => entry.id === "selection.om-automatic").status,
    "pass",
  );
});

test("parallel gate requires production selection, exact equality, and process-tree RSS", () => {
  const tiny = [
    "motivating-degree-7",
    "sage-essential-discriminant",
    "lmfdb-3.1.431.1",
    "lmfdb-5.1.17161.1",
    "pari-2510",
    "pari-1710",
  ].map((caseId) => verifiedRecord(caseId, "sagejs", "warm-public", 1, {
    fields: { algorithm_selection: { parallel_gate: { selected: false } } },
  }));
  const sequential = verifiedRecord("many-prime", "sagejs", "sequential-public", 12, {
    fields: { scheduler: { parallel_decision: { selected: false } } },
  });
  const parallel = verifiedRecord("many-prime", "sagejs", "parallel-public", 8, {
    fields: {
      scheduler: { parallel_decision: { selected: true } },
      peak_rss_kb: 250_000,
      peak_rss_scope: "process-tree",
      peak_rss_observed_processes: 3,
      memory_limit_mb: 512,
    },
  });
  const receipt = evaluateGates([finalReport([...tiny, sequential, parallel])]);
  assert.equal(
    receipt.gates.find((entry) => entry.id === "performance.parallel-public").status,
    "pass",
  );
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

  const boundaryPlan = planEvidenceRun({
    selection: "quick",
    sagejsBoundaries: SAGEJS_EVIDENCE_BOUNDARIES,
  });
  assert.equal(boundaryPlan.expected_record_count, 2 * SAGEJS_EVIDENCE_BOUNDARIES.length);
  assert.deepEqual(boundaryPlan.boundaries.sagejs, SAGEJS_EVIDENCE_BOUNDARIES);
});

test("platform validation receipts bind target, commit, and named production checks", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "sagejs-platform-evidence-"));
  const path = resolve(directory, "receipt.json");
  const identity = {
    source: { commit: "a".repeat(40), tree: "b".repeat(40) },
    platform: { platform: "linux", architecture: "x64" },
  };
  const receipt = syntheticPlatformReceipt(
    "linux-x64",
    identity.source.commit,
    identity.source.tree,
  );
  try {
    writeFileSync(path, JSON.stringify(receipt));
    const loaded = loadPlatformValidation(path, identity);
    assert.equal(loaded.target, "linux-x64");
    assert.match(loaded.receipt_sha256, /^[0-9a-f]{64}$/);
    assert.equal(validatePlatformValidationReceipt(receipt, identity).valid, true);
    writeFileSync(path, JSON.stringify({ ...receipt, source_commit: "b".repeat(40) }));
    assert.throws(() => loadPlatformValidation(path, identity), /source commit/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("platform matrix gate requires the strengthened same-source receipt on all targets", () => {
  const targets = [
    ["linux", "x64"],
    ["linux", "arm64"],
    ["darwin", "arm64"],
    ["win32", "x64"],
  ];
  const reports = targets.map(([platform, architecture]) => finalReport([], [], {
    identity: {
      source: { commit: "a".repeat(40), tree: "b".repeat(40), clean: true },
      platform: {
        platform,
        architecture,
        hostname: `${platform}-${architecture}-test`,
      },
      native_artifacts: {},
      production_native: { status: "ok", complete: true },
    },
    platformValidation: syntheticPlatformReceipt(`${platform}-${architecture}`),
  }));
  let platformGate = evaluateGates(reports).gates.find(
    (entry) => entry.id === "platform.supported-matrix",
  );
  assert.equal(platformGate.status, "pass");

  const broken = structuredClone(reports.at(-1).platform_validation);
  delete broken.checks.dynamic_fallback;
  broken.integrity.payload_sha256 = platformReceiptDigest(broken);
  reports[reports.length - 1] = finalReport([], [], {
    identity: reports.at(-1).identity,
    platformValidation: broken,
  });
  platformGate = evaluateGates(reports).gates.find(
    (entry) => entry.id === "platform.supported-matrix",
  );
  assert.equal(platformGate.status, "partial");
});

test("platform validation producer exposes the fixed named command plan", () => {
  const result = spawnSync(process.execPath, [PLATFORM_CLI, "plan"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(plan.checks), [...REQUIRED_CHECKS]);
  assert(plan.checks.representative_performance.includes(
    "test/number-field-maximal-order-public-micro-perf.cjs",
  ));
});

test("platform validation check execution records representative RSS and exact argv", async () => {
  const check = await runCheck(
    "representative_performance",
    [process.execPath, "-e", "setTimeout(() => {}, 80)"],
    { timeoutMs: 5_000 },
  );
  assert.equal(check.status, "pass", check.failure_output_tail);
  assert.deepEqual(check.argv.slice(0, 2), [process.execPath, "-e"]);
  assert(Number.isFinite(check.peak_rss_kb));
  assert(check.peak_rss_kb > 0);
  assert.match(check.stdout_sha256, /^[0-9a-f]{64}$/);
});

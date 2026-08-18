"use strict";

const { digest } = require("../../tools/number-field-maximal-order/runner.cjs");
const { loadCorpus } = require("./corpus.cjs");
const { recordKey, verifyEvidenceIntegrity } = require("./accounting.cjs");

const MICRO_CASES = Object.freeze([
  "motivating-degree-7",
  "sage-essential-discriminant",
  "lmfdb-3.1.431.1",
  "lmfdb-5.1.17161.1",
  "pari-2510",
  "pari-1710",
]);

const HARD_LOCAL_CASES = Object.freeze(["pari-2510", "pari-1710"]);
const LONG_TAIL_CASES = Object.freeze([
  "pari-round4-vector-010",
  "pari-round4-vector-429",
  "regression-x64-plus-2pow16",
  "pari-large-prime-quadratic-compositum",
  "hecke-degree-90",
  "hecke-precision-degree-12",
]);

function targetKey(report) {
  const platform = report.identity?.platform || report.environment || {};
  return `${platform.platform || "unknown"}-${platform.architecture || "unknown"}`;
}

function hostKey(report) {
  const platform = report.identity?.platform || report.environment || {};
  return `${targetKey(report)}@${platform.hostname || platform.host || "unknown"}`;
}

function accepted(record) {
  return record?.status === "ok" &&
    record.verification?.verified === true &&
    Number.isFinite(record.statistics?.median_ms);
}

function performanceAccepted(record, minimumSamples = 3) {
  return accepted(record) &&
    record.statistics.sample_count >= minimumSamples &&
    Array.isArray(record.samples) &&
    record.samples.length >= minimumSamples &&
    record.samples.every((sample) => Number.isFinite(Number(sample.timing_ms)));
}

function gate(id, status, requirement, evidence, detail = null) {
  return { id, status, requirement, evidence, detail };
}

function coverageGate(id, requirement, records, expectedIds) {
  const byId = new Map(records.map((record) => [record.case_id, record]));
  const missing = expectedIds.filter((idValue) => !byId.has(idValue));
  const failures = expectedIds
    .filter((idValue) => byId.has(idValue) && !accepted(byId.get(idValue)))
    .map((idValue) => ({ id: idValue, status: byId.get(idValue).status }));
  const status = records.length === 0
    ? "not-measured"
    : missing.length
      ? "partial"
      : failures.length
        ? "fail"
        : "pass";
  return gate(id, status, requirement, {
    expected: expectedIds.length,
    observed_unique: byId.size,
    accepted: [...byId.values()].filter(accepted).length,
    missing,
    failures,
  });
}

function uniqueRecords(reports, predicate) {
  const selected = reports.flatMap((report) =>
    (report.records || []).filter((record) => predicate(record, report)),
  );
  const grouped = new Map();
  for (const row of selected) {
    const key = recordKey(row);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return {
    records: [...grouped.values()].filter((rows) => rows.length === 1).map((rows) => rows[0]),
    duplicates: [...grouped]
      .filter(([, rows]) => rows.length > 1)
      .map(([key, rows]) => ({ key, count: rows.length })),
  };
}

function comparisonRows(reports, sagejsBoundary, caseFilter = () => true) {
  const sagejs = uniqueRecords(reports, (record) =>
    record.system === "sagejs" && record.boundary === sagejsBoundary && caseFilter(record.case_id),
  ).records.filter(performanceAccepted);
  const references = uniqueRecords(reports, (record) =>
    caseFilter(record.case_id) &&
    ((record.system === "pari" && ["nfbasis", "nfinit"].includes(record.boundary)) ||
      (record.system === "hecke" && record.boundary === "core")),
  ).records.filter(performanceAccepted);
  const byCase = new Map();
  for (const record of sagejs) {
    byCase.set(record.case_id, {
      case_id: record.case_id,
      sagejs_ms: record.statistics.median_ms,
      sagejs_samples: record.statistics.sample_count,
    });
  }
  for (const record of references) {
    const row = byCase.get(record.case_id);
    if (!row) continue;
    if (!row.reference_ms || record.statistics.median_ms < row.reference_ms) {
      row.reference_ms = record.statistics.median_ms;
      row.reference_system = record.system;
      row.reference_boundary = record.boundary;
      row.reference_samples = record.statistics.sample_count;
    }
  }
  return [...byCase.values()]
    .filter((row) => Number.isFinite(row.reference_ms))
    .map((row) => ({ ...row, ratio: row.sagejs_ms / row.reference_ms }));
}

function geometricMean(values) {
  if (!values.length) return null;
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

function evaluateGates(reports, options = {}) {
  if (!reports.length) throw new Error("at least one evidence report is required");
  const corpus = loadCorpus(options.corpusPath);
  const targets = [...new Set(reports.map(targetKey))];
  const hosts = [...new Set(reports.map(hostKey))];
  const requestedHost = options.referenceHost || (hosts.length === 1 ? hosts[0] : null);
  const referenceReports = requestedHost
    ? reports.filter((report) =>
        hostKey(report) === requestedHost || targetKey(report) === requestedHost,
      )
    : [];
  const primaryReports = referenceReports.filter(
    (report) => report.evidence_contract?.run_kind === "uniform-primary",
  );
  const gates = [];

  const integrityFailures = reports
    .map((report, index) => ({ index, ...verifyEvidenceIntegrity(report) }))
    .filter((result) => !result.verified);
  gates.push(gate(
    "evidence.integrity",
    integrityFailures.length ? "fail" : "pass",
    "Every input report has a valid stable payload digest.",
    { report_count: reports.length, failures: integrityFailures },
  ));

  const accountingFailures = reports
    .map((report, index) => ({
      index,
      complete: report.raw_terminal_accounting?.complete === true,
      run_kind: report.evidence_contract?.run_kind,
    }))
    .filter((entry) => !entry.complete);
  gates.push(gate(
    "evidence.terminal-accounting",
    accountingFailures.length ? "fail" : "pass",
    "Every expected case/system/boundary has exactly one explicit terminal state.",
    { failures: accountingFailures },
  ));

  gates.push(gate(
    "evidence.reference-host",
    requestedHost ? "pass" : "not-measured",
    "Performance gates use one explicit same-host source/native identity.",
    { available_hosts: hosts, selected: requestedHost },
    requestedHost ? null : "Pass --reference-host when evidence contains multiple hosts.",
  ));

  const primaryKeys = new Map();
  for (const [reportIndex, report] of primaryReports.entries()) {
    for (const record of report.records || []) {
      const key = recordKey(record);
      if (!primaryKeys.has(key)) primaryKeys.set(key, []);
      primaryKeys.get(key).push(reportIndex);
    }
  }
  const crossReportDuplicates = [...primaryKeys]
    .filter(([, reportIndexes]) => reportIndexes.length > 1)
    .map(([key, reportIndexes]) => ({ key, report_indexes: reportIndexes }));
  gates.push(gate(
    "evidence.cross-report-uniqueness",
    !requestedHost ? "not-measured" : crossReportDuplicates.length ? "fail" : "pass",
    "A reference-host case/system/boundary has exactly one primary measurement across input reports.",
    { duplicates: crossReportDuplicates },
  ));

  const sourceIdentities = [...new Set(primaryReports.map((report) => JSON.stringify({
    commit: report.identity?.source?.commit || null,
    tree: report.identity?.source?.tree || null,
  })))].map((value) => JSON.parse(value));
  const missingSourceIdentity = sourceIdentities.some((identity) => !identity.commit || !identity.tree);
  gates.push(gate(
    "evidence.source-identity",
    primaryReports.length === 0 ? "not-measured" :
      missingSourceIdentity || sourceIdentities.length !== 1 ? "fail" : "pass",
    "All same-host primary comparisons use one exact Sage.js commit and tree.",
    { identities: sourceIdentities },
  ));

  const dirtyPrimary = primaryReports.flatMap((report, reportIndex) =>
    report.identity?.source?.clean === true ? [] : [{
      report_index: reportIndex,
      status: report.identity?.source?.tracked_and_untracked_status || null,
    }],
  );
  gates.push(gate(
    "evidence.clean-source",
    primaryReports.length === 0 ? "not-measured" : dirtyPrimary.length ? "fail" : "pass",
    "Every primary measurement is taken from the exact clean committed source tree.",
    { dirty_reports: dirtyPrimary },
  ));

  const sampledBoundaries = new Set([
    "warm-public",
    "dynamic-public",
    "native-public",
    "native-kernel",
    "round2-local",
    "round4-local",
    "om-local",
    "sequential-public",
    "parallel-public",
    "nfbasis",
    "nfinit",
    "core",
  ]);
  const sampledRecords = primaryReports.flatMap((report, reportIndex) =>
    report.evidence_contract?.selection === "randomized" ? [] :
      (report.records || []).filter((record) =>
        accepted(record) && sampledBoundaries.has(record.boundary),
      ).map((record) => ({ report, reportIndex, record })),
  );
  const undersampledRecords = sampledRecords
    .filter(({ record }) => !performanceAccepted(record))
    .map(({ reportIndex, record }) => ({
      report_index: reportIndex,
      key: recordKey(record),
      sample_count: record.statistics?.sample_count ?? 0,
    }));
  gates.push(gate(
    "evidence.performance-samples",
    sampledRecords.length === 0 ? "not-measured" : undersampledRecords.length ? "fail" : "pass",
    "Every accepted non-randomized performance row retains at least three finite raw samples.",
    { observed: sampledRecords.length, failures: undersampledRecords },
  ));

  const memoryFailures = sampledRecords.flatMap(({ report, reportIndex, record }) => {
    const limit = Number(record.memory_limit_mb);
    const peak = Number(record.peak_rss_kb);
    const expectedScope = report.identity?.platform?.platform === "linux" ? "process-tree" : null;
    const errors = [];
    if (!Number.isFinite(peak) || peak <= 0) errors.push("missing-peak-rss");
    if (!Number.isFinite(limit) || limit <= 0) errors.push("missing-memory-policy");
    if (Number.isFinite(peak) && Number.isFinite(limit) && peak > limit * 1024) {
      errors.push("peak-exceeds-policy");
    }
    if (!record.peak_rss_scope) errors.push("missing-rss-scope");
    if (expectedScope && record.peak_rss_scope !== expectedScope) {
      errors.push(`expected-${expectedScope}`);
    }
    return errors.length ? [{ report_index: reportIndex, key: recordKey(record), errors }] : [];
  });
  gates.push(gate(
    "evidence.peak-memory",
    sampledRecords.length === 0 ? "not-measured" : memoryFailures.length ? "fail" : "pass",
    "Every accepted performance row records scoped peak RSS within its explicit memory policy.",
    { observed: sampledRecords.length, failures: memoryFailures },
  ));

  const sagejsSelectionRecords = sampledRecords.filter(({ record }) =>
    record.system.startsWith("sagejs"),
  );
  const selectionFailures = sagejsSelectionRecords
    .filter(({ record }) => !record.algorithm_selection)
    .map(({ reportIndex, record }) => ({ report_index: reportIndex, key: recordKey(record) }));
  gates.push(gate(
    "evidence.algorithm-selection",
    sagejsSelectionRecords.length === 0 ? "not-measured" :
      selectionFailures.length ? "fail" : "pass",
    "Every accepted Sage.js performance row emits its deterministic algorithm-selection evidence.",
    { observed: sagejsSelectionRecords.length, failures: selectionFailures },
  ));

  const sagejsReports = primaryReports.filter((report) =>
    (report.records || []).some((record) => record.system.startsWith("sagejs")),
  );
  const requiredNativeArtifacts = [
    "packages/flint/build/Release/sagejs_flint.node",
    "packages/flint/build/generated-ffi/sagejs_flint_ffi.node",
    "dist/tools/kernel.js",
    "dist/native-kernels/index.json",
  ];
  const missingNativeArtifacts = sagejsReports.flatMap((report, reportIndex) => {
    const missing = requiredNativeArtifacts.filter(
      (path) => report.identity?.native_artifacts?.[path]?.status !== "ok" ||
        !/^[0-9a-f]{64}$/.test(report.identity?.native_artifacts?.[path]?.sha256 || ""),
    );
    const production = report.identity?.production_native;
    if (production?.complete === true && production?.index?.status === "ok" && !missing.length) {
      return [];
    }
    return [{
      report_index: reportIndex,
      missing_artifacts: missing,
      production_native: production || null,
    }];
  });
  gates.push(gate(
    "evidence.native-artifact-identity",
    sagejsReports.length === 0 ? "not-measured" :
      missingNativeArtifacts.length ? "fail" : "pass",
    "Every Sage.js primary report hashes both FLINT addons, the runtime bundle, the actual production index, and every current wrapper/addon module.",
    {
      sagejs_report_count: sagejsReports.length,
      required_artifacts: requiredNativeArtifacts,
      failures: missingNativeArtifacts,
    },
  ));

  const standardIds = corpus.cases.filter((entry) => entry.tier === "standard").map((entry) => entry.id);
  const stressEntries = corpus.cases.filter((entry) => entry.tier === "stress");
  const stressIds = stressEntries.map((entry) => entry.id);
  const round4Ids = corpus.cases.filter((entry) => entry.tags.includes("pari-round4")).map((entry) => entry.id);
  const heckeIds = corpus.cases.filter((entry) => entry.provenance.source === "hecke").map((entry) => entry.id);
  const equivalentIds = corpus.cases.filter((entry) => entry.tags.includes("equivalent-generator")).map((entry) => entry.id);

  const publicRows = uniqueRecords(primaryReports, (record) =>
    record.system === "sagejs" && record.boundary === "warm-public",
  ).records;
  gates.push(coverageGate(
    "corpus.corrected-standard",
    "All 489 corrected standard cases return independently verified public lattices under one uniform policy.",
    publicRows.filter((record) => standardIds.includes(record.case_id)),
    standardIds,
  ));
  gates.push(coverageGate(
    "corpus.stress-public",
    "All 16 stress cases execute the current public lattice path and verify independently.",
    publicRows.filter((record) => stressIds.includes(record.case_id)),
    stressIds,
  ));
  gates.push(coverageGate(
    "corpus.round4",
    "Every frozen PARI Round-4 fixture executes and verifies on the current public path.",
    publicRows.filter((record) => round4Ids.includes(record.case_id)),
    round4Ids,
  ));
  gates.push(coverageGate(
    "corpus.hecke-regressions",
    "All selected Hecke absolute-field regressions execute and verify publicly.",
    publicRows.filter((record) => heckeIds.includes(record.case_id)),
    heckeIds,
  ));

  const fixedEquivalent = coverageGate(
    "corpus.equivalent-generators",
    "Frozen equivalent-generator cases and a recorded randomized transformation schedule pass.",
    publicRows.filter((record) => equivalentIds.includes(record.case_id)),
    equivalentIds,
  );
  const randomizedSchedules = primaryReports.flatMap(
    (report) => report.randomized_generator_schedules || [],
  );
  const publicById = new Map(publicRows.map((record) => [record.case_id, record]));
  const randomizedFailures = randomizedSchedules.flatMap((schedule) =>
    (schedule.transformations || []).flatMap((transformation) => {
      const record = publicById.get(transformation.case_id);
      if (!record) return [{ case_id: transformation.case_id, reason: "missing-record" }];
      if (!accepted(record)) return [{ case_id: transformation.case_id, reason: record.status }];
      if (record.polynomial_digest !== transformation.polynomial_digest) {
        return [{ case_id: transformation.case_id, reason: "polynomial-digest" }];
      }
      return [];
    }),
  );
  if (fixedEquivalent.status === "pass") {
    if (randomizedSchedules.length === 0) {
      fixedEquivalent.status = "partial";
      fixedEquivalent.detail =
        "Frozen transformed generators pass, but no randomized seed schedule is attached.";
    } else if (randomizedFailures.length) {
      fixedEquivalent.status = "fail";
      fixedEquivalent.detail = "One or more scheduled randomized transformations lacks accepted exact evidence.";
    }
  }
  fixedEquivalent.evidence.randomized_schedule_count = randomizedSchedules.length;
  fixedEquivalent.evidence.randomized_failures = randomizedFailures;
  gates.push(fixedEquivalent);

  const cacheRows = primaryReports.flatMap((report) => report.cache_identity_api?.records || []);
  const cacheByKey = new Map(cacheRows.map((record) => [record.case_id, record]));
  const cacheFailures = publicRows.filter(accepted).flatMap((publicRecord) => {
    const cacheRecord = cacheByKey.get(publicRecord.case_id);
    if (!cacheRecord) return [{ case_id: publicRecord.case_id, reason: "missing-evidence" }];
    if (!cacheRecord.same_object) return [{ ...cacheRecord, reason: "different-object" }];
    if (cacheRecord.timed) return [{ ...cacheRecord, reason: "timed-second-call" }];
    return [];
  });
  gates.push(gate(
    "api.cache-identity",
    publicRows.filter(accepted).length === 0 ? "not-measured" :
      cacheFailures.length ? "fail" : "pass",
    "The cached second call returns the identical order object and is excluded from every performance timing.",
    { expected: publicRows.filter(accepted).length, observed: cacheRows.length, failures: cacheFailures },
  ));

  const microRows = MICRO_CASES.map((id) => publicRows.find((record) => record.case_id === id));
  const presentMicro = microRows.filter(Boolean);
  const slowMicro = presentMicro
    .filter((record) => !performanceAccepted(record) || record.statistics.median_ms > 2)
    .map((record) => ({
      id: record.case_id,
      status: record.status,
      median_ms: record.statistics?.median_ms ?? null,
      sample_count: record.statistics?.sample_count ?? 0,
    }));
  gates.push(gate(
    "performance.warm-public-micro",
    presentMicro.length === 0 ? "not-measured" :
      presentMicro.length < MICRO_CASES.length ? "partial" : slowMicro.length ? "fail" : "pass",
    "Each warm public microcase is at most 2 ms on the reference host.",
    { expected_ids: MICRO_CASES, observed: presentMicro.length, failures: slowMicro },
  ));

  const nativeMicro = uniqueRecords(primaryReports, (record) =>
    record.system === "sagejs" && record.boundary === "native-kernel" &&
    MICRO_CASES.includes(record.case_id),
  ).records;
  const slowNativeMicro = nativeMicro
    .filter((record) => !performanceAccepted(record) || record.statistics.median_ms > 0.25)
    .map((record) => ({
      id: record.case_id,
      median_ms: record.statistics?.median_ms ?? null,
      sample_count: record.statistics?.sample_count ?? 0,
    }));
  gates.push(gate(
    "performance.native-micro",
    nativeMicro.length === 0 ? "not-measured" :
      nativeMicro.length < MICRO_CASES.length ? "partial" : slowNativeMicro.length ? "fail" : "pass",
    "Each eligible direct native microkernel is at most 0.25 ms.",
    { expected_ids: MICRO_CASES, observed: nativeMicro.length, failures: slowNativeMicro },
    nativeMicro.length === 0
      ? "native-public records are intentionally not accepted as direct local-kernel evidence"
      : null,
  ));

  const t8 = publicRows.find((record) => record.case_id === "pure-bad-generator-n8-c2pow32");
  gates.push(gate(
    "performance.t8-public",
    !t8 ? "not-measured" : !performanceAccepted(t8) || t8.statistics.median_ms > 25 ? "fail" : "pass",
    "Checked public T(8, 2^32) completes within 25 ms.",
    {
      status: t8?.status || null,
      median_ms: t8?.statistics?.median_ms ?? null,
      sample_count: t8?.statistics?.sample_count ?? 0,
    },
  ));

  const directRatios = comparisonRows(primaryReports, "native-kernel");
  const eligibleRatios = directRatios.filter((row) => row.reference_ms >= 1);
  const directGm = geometricMean(eligibleRatios.map((row) => row.ratio));
  const overTwo = eligibleRatios.filter((row) => row.ratio > 2);
  gates.push(gate(
    "performance.direct-reference-ratio",
    eligibleRatios.length === 0 ? "not-measured" :
      directGm <= 1.25 && overTwo.length === 0 ? "pass" : "fail",
    "For references at least 1 ms, direct Sage.js geometric-mean ratio is at most 1.25 and no unexplained case exceeds 2.",
    { case_count: eligibleRatios.length, geometric_mean: directGm, over_two: overTwo, rows: eligibleRatios },
  ));

  const hardRows = comparisonRows(
    primaryReports,
    "native-kernel",
    (caseId) => HARD_LOCAL_CASES.includes(caseId),
  );
  gates.push(gate(
    "performance.hard-local-2510-1710",
    hardRows.length === 0 ? "not-measured" :
      hardRows.length < HARD_LOCAL_CASES.length ? "partial" :
        hardRows.every((row) => row.ratio <= 2) &&
          geometricMean(hardRows.map((row) => row.ratio)) <= 1.25
          ? "pass" : "fail",
    "#2510 and #1710 are each within 2x and have geometric-mean direct ratio at most 1.25.",
    { rows: hardRows, geometric_mean: geometricMean(hardRows.map((row) => row.ratio)) },
  ));

  const tailPublic = LONG_TAIL_CASES.map((id) => publicRows.find((record) => record.case_id === id));
  const tailFailures = tailPublic.filter(Boolean).filter((record) =>
    !performanceAccepted(record) || record.statistics.median_ms >= 5_000,
  );
  gates.push(gate(
    "performance.long-tails-under-policy",
    tailPublic.filter(Boolean).length === 0 ? "not-measured" :
      tailPublic.filter(Boolean).length < LONG_TAIL_CASES.length ? "partial" :
        tailFailures.length ? "fail" : "pass",
    "Every retained long tail returns an exact public result below the five-second standard policy.",
    {
      expected_ids: LONG_TAIL_CASES,
      observed: tailPublic.filter(Boolean).length,
      failures: tailFailures.map((record) => ({
        id: record.case_id,
        status: record.status,
        median_ms: record.statistics?.median_ms ?? null,
        sample_count: record.statistics?.sample_count ?? 0,
      })),
    },
  ));

  const stressSet = new Set(stressIds);
  const stressRatios = comparisonRows(
    primaryReports,
    "native-kernel",
    (caseId) => stressSet.has(caseId),
  );
  gates.push(gate(
    "performance.stress-direct",
    stressRatios.length === 0 ? "not-measured" :
      stressRatios.length < stressIds.length ? "partial" :
        stressRatios.every((row) => row.ratio <= 1) ? "pass" : "fail",
    "Every scalable stress case is no slower than the faster direct PARI/Hecke reference.",
    { expected: stressIds.length, rows: stressRatios },
  ));

  const sageRows = uniqueRecords(primaryReports, (record) =>
    record.system === "sage" && record.boundary === "warm-public",
  ).records.filter(performanceAccepted);
  const sageByCase = new Map(sageRows.map((record) => [record.case_id, record]));
  const publicComparisons = publicRows
    .filter(performanceAccepted)
    .filter((record) => sageByCase.has(record.case_id))
    .map((record) => ({
      case_id: record.case_id,
      sagejs_ms: record.statistics.median_ms,
      sage_ms: sageByCase.get(record.case_id).statistics.median_ms,
      ratio: record.statistics.median_ms / sageByCase.get(record.case_id).statistics.median_ms,
    }));
  gates.push(gate(
    "performance.public-vs-sage-standard",
    publicComparisons.length === 0 ? "not-measured" :
      publicComparisons.length < standardIds.length ? "partial" :
        publicComparisons.every((row) => row.ratio <= 1) ? "pass" : "fail",
    "Warm Sage.js maximal_order is no slower than Sage across all 489 standard cases.",
    {
      expected: standardIds.length,
      observed: publicComparisons.length,
      regressions: publicComparisons.filter((row) => row.ratio > 1),
    },
  ));

  const overlapBoundaries = ["dynamic-public", "round2-local", "round4-local", "om-local"];
  const overlapByCase = new Map();
  for (const record of uniqueRecords(primaryReports, (row) =>
    row.system.startsWith("sagejs") && overlapBoundaries.includes(row.boundary),
  ).records.filter(accepted)) {
    if (!overlapByCase.has(record.case_id)) overlapByCase.set(record.case_id, new Map());
    overlapByCase.get(record.case_id).set(
      record.boundary,
      record.verification.canonical_basis?.digest || null,
    );
  }
  const overlapRows = [...overlapByCase].filter(([, values]) => values.size === overlapBoundaries.length);
  const overlapDisagreements = overlapRows.filter(([, values]) => new Set(values.values()).size !== 1);
  gates.push(gate(
    "correctness.algorithm-overlap",
    overlapRows.length === 0 ? "not-measured" : overlapDisagreements.length ? "fail" : "pass",
    "Dynamic, Round 2, Round 4, and OM return the same canonical lattice wherever all are supported.",
    { overlap_case_count: overlapRows.length, disagreements: overlapDisagreements.map(([id]) => id) },
  ));

  const tracedDiagnostics = uniqueRecords(primaryReports, (record) =>
    record.system === "sagejs" && record.boundary === "traced-public-diagnostic",
  ).records.filter(accepted);
  const tracedByCase = new Map(tracedDiagnostics.map((record) => [record.case_id, record]));
  const omSelections = publicRows.filter((record) => {
    const selected = record.selected_algorithm === "om" ||
      record.algorithm_selection?.local_decisions?.some(
        (decision) => decision.algorithm === "om-maxmin",
      );
    const diagnostic = tracedByCase.get(record.case_id);
    return accepted(record) && selected &&
      diagnostic?.executed_algorithms?.includes("om-maxmin");
  });
  gates.push(gate(
    "selection.om-automatic",
    omSelections.length ? "pass" : "not-measured",
    "OM is automatically selected on at least one independently verified region where it wins end to end.",
    {
      selected_case_ids: omSelections.map((record) => record.case_id),
      requirement_note:
        "A warm optimized selection is paired with a separately labeled traced diagnostic proving actual OM execution.",
    },
  ));

  const sequential = uniqueRecords(primaryReports, (record) => record.boundary === "sequential-public").records;
  const parallel = uniqueRecords(primaryReports, (record) => record.boundary === "parallel-public").records;
  const sequentialByCase = new Map(
    sequential.filter(performanceAccepted).map((record) => [record.case_id, record]),
  );
  const parallelRows = parallel
    .filter(performanceAccepted)
    .filter((record) => sequentialByCase.has(record.case_id));
  const parallelComparisons = parallelRows.map((record) => ({
    case_id: record.case_id,
    parallel_ms: record.statistics.median_ms,
    sequential_ms: sequentialByCase.get(record.case_id).statistics.median_ms,
    speedup: sequentialByCase.get(record.case_id).statistics.median_ms / record.statistics.median_ms,
    samples: record.statistics.sample_count,
    exact_lattice_equal:
      record.verification.canonical_basis?.digest ===
      sequentialByCase.get(record.case_id).verification.canonical_basis?.digest,
    production_parallel_selected:
      record.scheduler?.parallel_decision?.selected === true,
    sequential_control_selected:
      sequentialByCase.get(record.case_id).scheduler?.parallel_decision?.selected === false,
    peak_rss_kb: record.peak_rss_kb ?? null,
    peak_rss_scope: record.peak_rss_scope ?? null,
    peak_rss_observed_processes: record.peak_rss_observed_processes ?? null,
    memory_limit_mb: record.memory_limit_mb ?? null,
    memory_within_policy:
      Number.isFinite(record.peak_rss_kb) && Number.isFinite(record.memory_limit_mb) &&
      record.peak_rss_kb <= record.memory_limit_mb * 1024,
  }));
  const tinySchedulerFailures = MICRO_CASES.flatMap((caseId) => {
    const record = publicRows.find((row) => row.case_id === caseId);
    if (!record) return [{ case_id: caseId, reason: "missing-warm-public" }];
    if (!accepted(record)) return [{ case_id: caseId, reason: record.status }];
    if (record.algorithm_selection?.parallel_gate?.selected !== false) {
      return [{ case_id: caseId, reason: "parallel-not-declined" }];
    }
    return [];
  });
  const invalidParallel = parallelComparisons.filter((row) =>
    !row.exact_lattice_equal ||
    !row.production_parallel_selected ||
    !row.sequential_control_selected ||
    !row.memory_within_policy ||
    row.peak_rss_scope !== "process-tree" ||
    row.peak_rss_observed_processes < 2,
  );
  const stableSpeedup = parallelComparisons.some((row) => row.speedup > 1.05);
  gates.push(gate(
    "performance.parallel-public",
    parallelComparisons.length === 0 ? "not-measured" :
      stableSpeedup && invalidParallel.length === 0 && tinySchedulerFailures.length === 0
        ? "pass" : "fail",
    "The production worker path has a stable public speedup on many-prime work without tiny-case regression.",
    {
      comparisons: parallelComparisons,
      invalid_parallel_rows: invalidParallel,
      tiny_scheduler_failures: tinySchedulerFailures,
    },
  ));

  const requiredTargets = ["linux-x64", "linux-arm64", "darwin-arm64", "win32-x64"];
  const platformMetadata = reports.flatMap((report) => report.platform_validation ? [{
    target: targetKey(report),
    ...report.platform_validation,
  }] : []);
  const completePlatformTargets = platformMetadata
    .filter((entry) =>
      ["exactness", "production_autoload", "resource_lifecycle", "corruption"].every(
        (name) => entry.checks?.[name]?.status === "pass",
      ),
    )
    .map((entry) => entry.target);
  gates.push(gate(
    "platform.supported-matrix",
    platformMetadata.length === 0 ? "not-measured" :
      requiredTargets.every((target) => completePlatformTargets.includes(target)) ? "pass" : "partial",
    "Linux x64/arm64, macOS arm64, and native Windows x64 pass exactness, autoload, lifecycle, and corruption checks.",
    { required_targets: requiredTargets, observed_targets: targets, platform_metadata: platformMetadata },
  ));

  const summary = Object.fromEntries(
    ["pass", "fail", "partial", "not-measured"].map((status) => [
      status,
      gates.filter((entry) => entry.status === status).length,
    ]),
  );
  const receipt = {
    schema: "sagejs.number-fields/maximal-order-final-gate-evaluation-v1",
    generated_at: new Date().toISOString(),
    reference_host: requestedHost,
    input_reports: reports.map((report) => ({
      payload_sha256: report.integrity?.payload_sha256 || null,
      target: targetKey(report),
      host: hostKey(report),
      run_kind: report.evidence_contract?.run_kind || null,
      selection: report.evidence_contract?.selection || null,
    })),
    gates,
    summary,
  };
  receipt.integrity = {
    algorithm: "sha256(stable-json(receipt-without-integrity))",
    payload_sha256: gatePayloadDigest(receipt),
  };
  return receipt;
}

function gatesMarkdown(receipt) {
  return [
    "# Maximal-order final gate evaluation",
    "",
    `Reference host: ${receipt.reference_host || "not selected"}. Payload: \`${receipt.integrity.payload_sha256}\`.`,
    "",
    "| Gate | Status | Requirement |",
    "| --- | --- | --- |",
    ...receipt.gates.map((entry) =>
      `| ${entry.id} | ${entry.status} | ${entry.requirement.replaceAll("|", "\\|")} |`,
    ),
    "",
    ...Object.entries(receipt.summary).map(([status, count]) => `- ${status}: ${count}`),
    "",
  ].join("\n");
}

function gatePayloadDigest(receipt) {
  const payload = { ...receipt };
  delete payload.integrity;
  return digest(JSON.parse(JSON.stringify(payload)));
}

module.exports = {
  HARD_LOCAL_CASES,
  LONG_TAIL_CASES,
  MICRO_CASES,
  accepted,
  comparisonRows,
  evaluateGates,
  gatesMarkdown,
  geometricMean,
  gatePayloadDigest,
  hostKey,
  targetKey,
};

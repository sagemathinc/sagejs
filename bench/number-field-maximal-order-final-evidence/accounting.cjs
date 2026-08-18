"use strict";

const {
  TERMINAL_STATES,
  digest,
} = require("../../tools/number-field-maximal-order/runner.cjs");

const BOUNDARY_CONTRACTS = Object.freeze({
  "warm-public": {
    class: "public",
    runtime: "persistent and warmed",
    field: "freshly constructed for every retained sample",
    timed_region: "public maximal_order call only",
    excluded_but_recorded:
      "field construction, basis/discriminant materialization, and independent verification",
  },
  "dynamic-public": {
    class: "public-dynamic-fallback",
    runtime: "persistent with SAGEJS_NATIVE_DISABLE=1",
    field: "freshly constructed for every retained sample",
    timed_region: "public maximal_order call with the dynamic Round-2 request",
    caveat: "this is not a direct local-kernel boundary",
  },
  "native-public": {
    class: "public-forced-native",
    runtime: "persistent with production-native capability available when current",
    field: "freshly constructed for every retained sample",
    timed_region: "public maximal_order call with algorithm='native'",
    caveat: "this includes public orchestration and is not a direct local/native kernel timing",
  },
  "native-kernel": {
    class: "direct-local-kernel",
    timed_region: "polynomial/local component to canonical HNF without public Order construction",
    requirement:
      "a record using this label must retain exact-equivalence verification and native artifact identity",
  },
  "cold-application": {
    class: "cold-public",
    runtime: "new process for each case, system, and sample",
    field: "freshly constructed",
    timed_region:
      "process startup and loading through field/order construction, basis materialization, and result protocol",
    excluded_but_required_for_acceptance:
      "the parent independent exact lattice verification runs after the timed result arrives",
  },
  nfbasis: {
    class: "direct-external-core",
    timed_region: "GP/PARI nfbasis on an already parsed polynomial",
    implementation_family: "pari-sage",
  },
  nfinit: {
    class: "direct-external-core",
    timed_region: "GP/PARI nfinit on an already parsed polynomial",
    implementation_family: "pari-sage",
  },
  core: {
    class: "direct-external-core",
    timed_region: "Hecke maximal_order on a freshly constructed uncached field",
    implementation_family: "hecke-oscar",
  },
  "sequential-public": {
    class: "public-scheduler-comparison",
    timed_region: "fresh-field public maximal_order with sequential local execution forced",
  },
  "parallel-public": {
    class: "public-scheduler-comparison",
    timed_region: "fresh-field public maximal_order with the production worker graph forced",
  },
  "round2-local": { class: "forced-local-algorithm" },
  "round4-local": { class: "forced-local-algorithm" },
  "om-local": { class: "forced-local-algorithm" },
});

function recordKey(record) {
  return `${record.case_id}\t${record.system}\t${record.boundary}`;
}

function expectedMatrix(manifest, systems) {
  const profile = manifest.profiles.final;
  const selected = systems?.length ? systems : Object.keys(profile.systems);
  const expected = [];
  for (const caseSpec of manifest.cases) {
    for (const system of selected) {
      for (const boundary of profile.systems[system] || []) {
        expected.push({ case_id: caseSpec.id, system, boundary });
      }
    }
  }
  return expected;
}

function terminalAccounting(records, expectedRecords) {
  const observed = new Map();
  const unknownStates = [];
  for (const record of records) {
    const key = recordKey(record);
    if (!observed.has(key)) observed.set(key, []);
    observed.get(key).push(record);
    if (!TERMINAL_STATES.has(record.status)) {
      unknownStates.push({ key, status: record.status });
    }
  }
  const expectedKeys = expectedRecords.map(recordKey);
  const expectedSet = new Set(expectedKeys);
  const duplicates = [...observed]
    .filter(([, rows]) => rows.length !== 1)
    .map(([key, rows]) => ({ key, count: rows.length }));
  const missing = expectedKeys.filter((key) => !observed.has(key));
  const unexpected = [...observed.keys()].filter((key) => !expectedSet.has(key));
  const stateCounts = Object.fromEntries(
    [...TERMINAL_STATES].map((state) => [
      state,
      records.filter((record) => record.status === state).length,
    ]),
  );
  const terminalCount = Object.values(stateCounts).reduce((sum, count) => sum + count, 0);
  return {
    expected_record_count: expectedKeys.length,
    observed_record_count: records.length,
    unique_observed_key_count: observed.size,
    terminal_record_count: terminalCount,
    state_counts: stateCounts,
    missing_keys: missing,
    duplicate_keys: duplicates,
    unexpected_keys: unexpected,
    unknown_states: unknownStates,
    complete:
      missing.length === 0 &&
      duplicates.length === 0 &&
      unexpected.length === 0 &&
      unknownStates.length === 0 &&
      terminalCount === records.length,
    accepted_verified_count: records.filter(
      (record) => record.status === "ok" && record.verification?.verified === true,
    ).length,
    rejected_exactness_count: records.filter((record) =>
      ["invalid", "disagreement"].includes(record.status),
    ).length,
  };
}

function oracleMatrix(records, families) {
  return Object.fromEntries(
    Object.entries(families).map(([family, definition]) => {
      const familyRecords = records.filter(
        (record) =>
          record.implementation_family === family ||
          definition.members.includes(record.system),
      );
      return [family, {
        members: definition.members,
        independence: definition.independence,
        systems_observed: [...new Set(familyRecords.map((record) => record.system))].sort(),
        boundaries_observed: [...new Set(familyRecords.map((record) => record.boundary))].sort(),
        state_counts: Object.fromEntries(
          [...TERMINAL_STATES].map((state) => [
            state,
            familyRecords.filter((record) => record.status === state).length,
          ]),
        ),
      }];
    }),
  );
}

function payloadDigest(report) {
  const payload = { ...report };
  delete payload.integrity;
  // Evidence is exchanged as JSON.  Adapter failure rows can contain optional
  // properties whose value is `undefined`; JSON omits those properties.  Hash
  // the exact JSON data model so an artifact verifies identically before and
  // after it is written and parsed again.
  return digest(JSON.parse(JSON.stringify(payload)));
}

function finalizeEvidenceReport(rawReport, {
  expectedRecords,
  identity,
  loadStart,
  loadEnd,
  runKind = "uniform-primary",
  selection,
  diagnosticParent = null,
  notes = [],
} = {}) {
  const records = rawReport.records || [];
  const families = rawReport.implementation_families || {};
  const usedBoundaries = [...new Set(records.map((record) => record.boundary))].sort();
  const report = {
    ...rawReport,
    schema: "https://sagejs.org/schemas/number-field-maximal-order-final-evidence-v1.json",
    schema_version: 1,
    evidence_contract: {
      run_kind: runKind,
      selection,
      uniform_primary: runKind === "uniform-primary",
      non_substituting: runKind === "bounded-diagnostic",
      diagnostic_parent: diagnosticParent,
      exact_verification_required_before_timing_acceptance: true,
      cached_second_call_excluded_from_performance_evidence: true,
      notes,
    },
    identity,
    host_load: { start: loadStart, end: loadEnd },
    boundary_contracts: Object.fromEntries(
      usedBoundaries.map((boundary) => [
        boundary,
        BOUNDARY_CONTRACTS[boundary] || {
          class: "unclassified",
          error: "boundary has no final-evidence semantics",
        },
      ]),
    ),
    oracle_matrix: oracleMatrix(records, families),
    raw_terminal_accounting: terminalAccounting(records, expectedRecords || []),
    raw_runner_summary: rawReport.summary || null,
  };
  report.summary = {
    terminal_accounting_complete: report.raw_terminal_accounting.complete,
    state_counts: report.raw_terminal_accounting.state_counts,
    accepted_verified_count: report.raw_terminal_accounting.accepted_verified_count,
    rejected_exactness_count: report.raw_terminal_accounting.rejected_exactness_count,
  };
  report.integrity = {
    algorithm: "sha256(stable-json(report-without-integrity))",
    payload_sha256: payloadDigest(report),
    raw_record_keys_sha256: digest(records.map(recordKey)),
  };
  return report;
}

function verifyEvidenceIntegrity(report) {
  const expected = report.integrity?.payload_sha256;
  return {
    verified: typeof expected === "string" && payloadDigest(report) === expected,
    expected: expected || null,
    actual: payloadDigest(report),
  };
}

module.exports = {
  BOUNDARY_CONTRACTS,
  expectedMatrix,
  finalizeEvidenceReport,
  oracleMatrix,
  payloadDigest,
  recordKey,
  terminalAccounting,
  verifyEvidenceIntegrity,
};

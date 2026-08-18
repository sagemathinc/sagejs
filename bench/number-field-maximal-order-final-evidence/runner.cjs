"use strict";

const { readFileSync, writeFileSync } = require("node:fs");

const {
  runManifest,
} = require("../../tools/number-field-maximal-order/runner.cjs");
const {
  SAGEJS_EVIDENCE_BOUNDARIES,
  SYSTEM_BOUNDARIES,
  buildRandomizedEvidenceManifest,
  buildEvidenceManifest,
} = require("./corpus.cjs");
const {
  expectedMatrix,
  finalizeEvidenceReport,
  verifyEvidenceIntegrity,
} = require("./accounting.cjs");
const { collectIdentity, loadSnapshot, sha256 } = require("./identity.cjs");
const {
  validatePlatformValidationReceipt,
} = require("../../tools/number-field-maximal-order/platform-validation.cjs");

function normalizeSystems(manifest, systems) {
  const selected = systems?.length ? systems : ["sagejs"];
  const known = manifest.profiles.final.systems;
  const missing = selected.filter((system) => !known[system]);
  if (missing.length) throw new Error(`unknown systems: ${missing.join(", ")}`);
  return [...new Set(selected)];
}

function runConfig(options, extra = {}) {
  return {
    profile: "final",
    samples: options.samples,
    warmups: options.warmups,
    timeoutMs: options.timeoutMs,
    memoryMb: options.memoryMb,
    systemMemoryMb: options.systemMemoryMb,
    enableMagma: options.enableMagma,
    sage: options.sage,
    pari: options.pari,
    julia: options.julia,
    magma: options.magma,
    heckeProject: options.heckeProject,
    oscarProject: options.oscarProject,
    ...extra,
  };
}

function evidenceSystemBoundaries(options = {}) {
  const boundaries = Object.fromEntries(
    Object.entries(SYSTEM_BOUNDARIES).map(([system, values]) => [system, [...values]]),
  );
  if (options.sagejsBoundaries?.length) {
    const unknown = options.sagejsBoundaries.filter(
      (boundary) => !SAGEJS_EVIDENCE_BOUNDARIES.includes(boundary),
    );
    if (unknown.length) throw new Error(`unknown Sage.js evidence boundaries: ${unknown.join(", ")}`);
    boundaries.sagejs = [...new Set(options.sagejsBoundaries)];
  }
  return boundaries;
}

function requireCleanSource(identity) {
  if (!identity.source.clean) {
    throw new Error(
      "final evidence requires a clean source tree; commit or remove every tracked/untracked change first",
    );
  }
}

function loadPlatformValidation(path, identity) {
  if (!path) return null;
  const bytes = readFileSync(path);
  const receipt = JSON.parse(bytes);
  if (receipt.schema !== "sagejs.number-fields/platform-validation-v1") {
    throw new Error("platform validation receipt has an unsupported schema");
  }
  const validation = validatePlatformValidationReceipt(receipt, identity);
  if (!validation.valid) {
    throw new Error(`invalid platform validation receipt: ${validation.errors.join("; ")}`);
  }
  return { ...receipt, receipt_sha256: sha256(bytes), receipt_path: path };
}

async function runPrimaryEvidence(options = {}) {
  const manifest = buildEvidenceManifest({
    selection: options.selection || "standard",
    caseIds: options.caseIds,
    corpusPath: options.corpusPath,
    timeoutMs: options.timeoutMs,
    warmups: options.warmups ?? 0,
    samples: options.samples ?? 1,
    systemBoundaries: evidenceSystemBoundaries(options),
  });
  const systems = normalizeSystems(manifest, options.systems);
  const identity = collectIdentity();
  requireCleanSource(identity);
  const platformValidation = loadPlatformValidation(options.platformValidationPath, identity);
  const loadStart = loadSnapshot();
  const raw = await runManifest(
    manifest,
    runConfig(options, { systems }),
  );
  const loadEnd = loadSnapshot();
  return finalizeEvidenceReport(raw, {
    expectedRecords: expectedMatrix(manifest, systems),
    identity,
    loadStart,
    loadEnd,
    runKind: "uniform-primary",
    selection: options.selection || "standard",
    platformValidation,
    notes: [
      "Every raw row is retained under one uniform policy; longer diagnostics belong in a separate report.",
      "The default runner executes Sage.js warm-public only. External systems and alternate Sage.js modes are opt-in and family-labeled.",
    ],
  });
}

async function runRandomizedGeneratorEvidence(options = {}) {
  const manifest = buildRandomizedEvidenceManifest({
    seed: options.randomizedSeed ?? 20260818,
    count: options.randomizedCount ?? 8,
    corpusPath: options.corpusPath,
    timeoutMs: options.timeoutMs,
    warmups: options.warmups ?? 0,
    samples: options.samples ?? 1,
    systemBoundaries: evidenceSystemBoundaries(options),
  });
  const systems = normalizeSystems(manifest, options.systems);
  const identity = collectIdentity();
  requireCleanSource(identity);
  const platformValidation = loadPlatformValidation(options.platformValidationPath, identity);
  const loadStart = loadSnapshot();
  const raw = await runManifest(manifest, runConfig(options, { systems }));
  raw.randomized_generator_schedules = [manifest.randomized_generator_schedule];
  const loadEnd = loadSnapshot();
  return finalizeEvidenceReport(raw, {
    expectedRecords: expectedMatrix(manifest, systems),
    identity,
    loadStart,
    loadEnd,
    runKind: "uniform-primary",
    selection: "randomized",
    platformValidation,
    notes: [
      "The authenticated schedule retains its seed, parents, translations, and generated polynomial digests.",
      "Every generated result is independently checked; no transformed basis is trusted in advance.",
    ],
  });
}

function coldBoundaryFor(system) {
  const boundaries = SYSTEM_BOUNDARIES[system];
  if (!boundaries) throw new Error(`unknown cold evidence system ${system}`);
  return boundaries[0];
}

function makeColdRecord(record) {
  const timing = Number(record.process_startup_ms) + Number(record.request_wall_ms);
  const timingAvailable = Number.isFinite(timing);
  const accepted = record.status === "ok" && record.verification?.verified === true;
  const statistics = timingAvailable ? {
    median_ms: timing,
    mad_ms: 0,
    minimum_ms: timing,
    maximum_ms: timing,
    sample_count: 1,
  } : null;
  return {
    ...record,
    boundary: "cold-application",
    inner_boundary: record.boundary,
    samples: timingAvailable ? [{
      timing_ms: timing,
      stages: {
        process_startup_and_loading: record.process_startup_ms,
        request_through_result_protocol: record.request_wall_ms,
      },
    }] : [],
    statistics: accepted ? statistics : null,
    rejected_statistics: !accepted && timingAvailable ? statistics : record.rejected_statistics,
    note:
      "A new adapter process was created for this case/system; the timed request includes field/order construction, materialization, and result transport. Parent exact verification is required for acceptance but excluded from the timing.",
  };
}

async function runColdEvidence(options = {}) {
  if ((options.samples ?? 1) !== 1 || (options.warmups ?? 0) !== 0) {
    throw new Error(
      "cold evidence uses exactly one fresh-process sample and zero warmups per case/system",
    );
  }
  const selection = options.selection || "quick";
  const outer = buildEvidenceManifest({
    selection,
    caseIds: options.caseIds,
    corpusPath: options.corpusPath,
    timeoutMs: options.timeoutMs,
    warmups: 0,
    samples: 1,
  });
  const systems = normalizeSystems(outer, options.systems);
  const identity = collectIdentity();
  requireCleanSource(identity);
  const platformValidation = loadPlatformValidation(options.platformValidationPath, identity);
  const loadStart = loadSnapshot();
  const records = [];
  let template = null;
  for (const caseSpec of outer.cases) {
    for (const system of systems) {
      const innerBoundary = coldBoundaryFor(system);
      const manifest = buildEvidenceManifest({
        selection: "all",
        caseIds: [caseSpec.id],
        corpusPath: options.corpusPath,
        timeoutMs: options.timeoutMs,
        warmups: 0,
        samples: 1,
        systemBoundaries: { [system]: [innerBoundary] },
      });
      const raw = await runManifest(
        manifest,
        runConfig(options, {
          systems: [system],
          warmups: 0,
          samples: 1,
          enableMagma: options.enableMagma || system === "magma",
        }),
      );
      template ||= raw;
      records.push(makeColdRecord(raw.records[0]));
    }
  }
  const loadEnd = loadSnapshot();
  const raw = {
    ...template,
    generated_at: new Date().toISOString(),
    manifest_id: outer.id,
    manifest_digest: outer.policy_digest,
    corpus: outer.corpus_metadata,
    profile: `${selection}-cold`,
    cases: outer.cases.map((entry) => ({
      id: entry.id,
      degree: entry.polynomial.coefficients.length - 1,
      provenance: entry.provenance,
    })),
    records,
    cold_records: records,
  };
  const expectedRecords = outer.cases.flatMap((entry) =>
    systems.map((system) => ({
      case_id: entry.id,
      system,
      boundary: "cold-application",
    })),
  );
  return finalizeEvidenceReport(raw, {
    expectedRecords,
    identity,
    loadStart,
    loadEnd,
    runKind: "cold-boundary",
    selection,
    platformValidation,
    notes: [
      "Cold evidence is case-complete: unlike the legacy include-cold switch, every case/system gets a fresh process.",
      "Cold timings are accepted only when the returned lattice passes the same parent exact verifier.",
    ],
  });
}

function groupDiagnosticRows(primary, states) {
  const wanted = new Set(states);
  const groups = new Map();
  for (const record of primary.records || []) {
    if (!wanted.has(record.status)) continue;
    if (record.boundary === "cold-application") {
      throw new Error("cold-application diagnostics must be rerun with the cold runner");
    }
    const key = `${record.system}\t${record.boundary}`;
    if (!groups.has(key)) {
      groups.set(key, {
        system: record.system,
        boundary: record.boundary,
        caseIds: [],
        primaryRows: [],
      });
    }
    groups.get(key).caseIds.push(record.case_id);
    groups.get(key).primaryRows.push(record);
  }
  return [...groups.values()];
}

async function runDiagnosticEvidence(primaryPath, options = {}) {
  const primaryBytes = readFileSync(primaryPath);
  const primary = JSON.parse(primaryBytes);
  const primaryIntegrity = verifyEvidenceIntegrity(primary);
  if (!primaryIntegrity.verified) {
    throw new Error(`primary evidence integrity failed for ${primaryPath}`);
  }
  if (primary.evidence_contract?.run_kind !== "uniform-primary") {
    throw new Error("diagnostics require a uniform-primary evidence report");
  }
  const groups = groupDiagnosticRows(primary, options.diagnosticStates || ["timeout"]);
  if (!groups.length) throw new Error("primary report has no selected diagnostic terminal states");
  const identity = collectIdentity();
  requireCleanSource(identity);
  const platformValidation = loadPlatformValidation(options.platformValidationPath, identity);
  const loadStart = loadSnapshot();
  const records = [];
  const cases = new Map();
  let template = null;
  for (const group of groups) {
    const manifest = buildEvidenceManifest({
      selection: "all",
      caseIds: group.caseIds,
      corpusPath: options.corpusPath,
      timeoutMs: options.timeoutMs ?? 30_000,
      warmups: options.warmups ?? 0,
      samples: options.samples ?? 1,
      systemBoundaries: { [group.system]: [group.boundary] },
    });
    for (const entry of manifest.cases) cases.set(entry.id, entry);
    const raw = await runManifest(
      manifest,
      runConfig(options, {
        systems: [group.system],
        enableMagma: options.enableMagma || group.system === "magma",
      }),
    );
    template ||= raw;
    const primaryByCase = new Map(group.primaryRows.map((row) => [row.case_id, row]));
    for (const record of raw.records) {
      records.push({
        ...record,
        diagnostic_of: {
          primary_record_key: `${record.case_id}\t${record.system}\t${record.boundary}`,
          primary_status: primaryByCase.get(record.case_id)?.status || null,
          primary_timeout_ms: primaryByCase.get(record.case_id)?.timeout_ms || null,
        },
        non_substituting: true,
      });
    }
  }
  const loadEnd = loadSnapshot();
  const expectedRecords = groups.flatMap((group) =>
    group.caseIds.map((caseId) => ({
      case_id: caseId,
      system: group.system,
      boundary: group.boundary,
    })),
  );
  const raw = {
    ...template,
    generated_at: new Date().toISOString(),
    manifest_id: "sagejs-number-field-maximal-order-final-diagnostic-v1",
    manifest_digest: sha256(primaryBytes),
    corpus: primary.corpus,
    profile: "bounded-diagnostic",
    cases: [...cases.values()].map((entry) => ({
      id: entry.id,
      degree: entry.polynomial.coefficients.length - 1,
      provenance: entry.provenance,
    })),
    records,
    cold_records: [],
  };
  return finalizeEvidenceReport(raw, {
    expectedRecords,
    identity,
    loadStart,
    loadEnd,
    runKind: "bounded-diagnostic",
    selection: primary.evidence_contract.selection,
    diagnosticParent: {
      path: primaryPath,
      byte_sha256: sha256(primaryBytes),
      payload_sha256: primary.integrity.payload_sha256,
      selected_states: options.diagnosticStates || ["timeout"],
    },
    platformValidation,
    notes: [
      "These rows never replace the raw primary terminal states or contribute to uniform-policy corpus gates.",
    ],
  });
}

function planEvidenceRun(options = {}) {
  const manifest = buildEvidenceManifest({
    selection: options.selection || "standard",
    caseIds: options.caseIds,
    corpusPath: options.corpusPath,
    timeoutMs: options.timeoutMs,
    warmups: options.warmups ?? 0,
    samples: options.samples ?? 1,
    systemBoundaries: evidenceSystemBoundaries(options),
  });
  const systems = normalizeSystems(manifest, options.systems);
  const expected = expectedMatrix(manifest, systems);
  return {
    schema: "sagejs.number-fields/maximal-order-final-evidence-plan-v1",
    selection: options.selection || "standard",
    corpus: manifest.corpus_metadata,
    systems,
    case_count: manifest.cases.length,
    expected_record_count: expected.length,
    timeout_ms: options.timeoutMs ?? manifest.profiles.final.timeout_ms,
    warmups: options.warmups ?? manifest.profiles.final.warmups,
    samples: options.samples ?? manifest.profiles.final.samples,
    boundaries: Object.fromEntries(
      systems.map((system) => [system, manifest.profiles.final.systems[system]]),
    ),
    case_ids: manifest.cases.map((entry) => entry.id),
  };
}

function evidenceMarkdown(report) {
  const counts = report.raw_terminal_accounting.state_counts;
  const rows = Object.entries(counts).map(([state, count]) => `| ${state} | ${count} |`);
  return [
    `# Maximal-order final evidence: ${report.profile}`,
    "",
    `Payload: \`${report.integrity.payload_sha256}\``,
    "",
    `Run kind: **${report.evidence_contract.run_kind}**. Terminal accounting: **${report.raw_terminal_accounting.complete ? "complete" : "incomplete"}** (${report.raw_terminal_accounting.observed_record_count}/${report.raw_terminal_accounting.expected_record_count}).`,
    "",
    "| State | Raw count |",
    "| --- | ---: |",
    ...rows,
    "",
    `Accepted independently verified rows: **${report.raw_terminal_accounting.accepted_verified_count}**.`,
    "",
    "Diagnostic reports are non-substituting; only uniform-primary rows are eligible for corpus completion gates.",
    "",
  ].join("\n");
}

function writeEvidence(report, jsonPath, markdownPath) {
  if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  if (markdownPath) writeFileSync(markdownPath, evidenceMarkdown(report));
}

module.exports = {
  evidenceMarkdown,
  evidenceSystemBoundaries,
  groupDiagnosticRows,
  loadPlatformValidation,
  makeColdRecord,
  planEvidenceRun,
  runColdEvidence,
  runDiagnosticEvidence,
  runPrimaryEvidence,
  runRandomizedGeneratorEvidence,
  writeEvidence,
};

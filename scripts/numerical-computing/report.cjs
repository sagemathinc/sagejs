"use strict";

const path = require("node:path");

const {
  canonicalJson,
  contentId,
  sha256,
} = require("./common.cjs");
const {
  REPORT_SCHEMA,
  validateMatrixPolicy,
} = require("./contracts.cjs");
const { verifyReceipt } = require("./receipt.cjs");

function receiptMatches(row, receipt) {
  const match = row.match;
  const subject = receipt.runtime.subject;
  return receipt.corpus.snapshot.id === match.corpus_id &&
    receipt.corpus.sha256 === match.corpus_sha256 &&
    receipt.source_bundle.sha256 === match.source_bundle_sha256 &&
    receipt.capability_manifest.snapshot.id === match.capability_manifest_id &&
    receipt.capability_manifest.snapshot.backend.id === match.backend_id &&
    receipt.capability_manifest.snapshot.backend.version === match.backend_version &&
    receipt.platform.id === match.platform &&
    subject.kind === match.subject_kind &&
    subject.name === match.subject_name &&
    subject.version === match.subject_version &&
    subject.engine === match.subject_engine;
}

function rowEvidence(row, receiptRecord, requireClean) {
  if (receiptRecord === null) {
    return {
      row_id: row.id,
      status: "missing",
      reasons: ["no measured receipt matches this required matrix row"],
      receipt: null,
      bindings: null,
      coverage: null,
      metrics: null,
    };
  }
  const receipt = receiptRecord.receipt;
  const reasons = [];
  if (receipt.status !== "passed") reasons.push("receipt contains failed or missing case evidence");
  if (requireClean && !receipt.repository.clean) reasons.push("receipt was collected from a dirty checkout");
  const capabilities = new Map(
    receipt.capability_manifest.snapshot.capabilities.map((item) => [item.id, item]),
  );
  const observed = new Set(receipt.runtime.observed_capability_ids);
  for (const id of row.required_capabilities) {
    const capability = capabilities.get(id);
    if (capability?.status !== "available" || !observed.has(id)) {
      reasons.push(`required capability ${id} lacks available, observed evidence`);
    }
  }
  const artifactDigests = new Map(receipt.artifacts.map((item) => [item.name, item.sha256]));
  for (const artifact of row.required_artifacts) {
    if (artifactDigests.get(artifact.name) !== artifact.sha256) {
      reasons.push(`required artifact ${artifact.name} lacks its exact digest`);
    }
  }
  const phases = new Set(
    receipt.cases.filter((item) => item.status === "passed").map((item) => item.program_phase),
  );
  for (const phase of row.required_program_phases) {
    if (!phases.has(phase)) reasons.push(`required program phase ${phase} is absent from the corpus`);
  }
  const passingLayers = new Set(
    receipt.cases.filter((item) => item.status === "passed").map((item) => item.layer),
  );
  for (const layer of row.required_case_layers) {
    if (!passingLayers.has(layer)) reasons.push(`required case layer ${layer} lacks passing evidence`);
  }
  const peakRss = receipt.cases.reduce((maximum, item) =>
    Math.max(maximum, item.metrics.rss_peak_sampled_bytes ?? 0), 0) || null;
  const processMaxRss = receipt.cases.reduce((maximum, item) =>
    Math.max(maximum, item.metrics.process_max_rss_bytes ?? 0), 0) || null;
  return {
    row_id: row.id,
    status: reasons.length === 0 ? "passed" : "failed",
    reasons,
    receipt: {
      path: receiptRecord.path,
      id: receipt.id,
      collected_at: receipt.collected_at,
      repository_commit: receipt.repository.commit,
      platform: receipt.platform.id,
      machine_id: receipt.platform.machine_id,
      collector: receipt.runtime.collector,
      subject: receipt.runtime.subject,
    },
    bindings: {
      corpus_sha256: receipt.corpus.sha256,
      source_bundle_sha256: receipt.source_bundle.sha256,
      adapter_sha256: receipt.adapter.sha256,
      capability_manifest_id: receipt.capability_manifest.snapshot.id,
      capability_manifest_sha256: receipt.capability_manifest.sha256,
      artifacts: receipt.artifacts.map((item) => ({ name: item.name, sha256: item.sha256 })),
    },
    coverage: {
      program_phases: [...phases].sort(),
      case_layers: [...passingLayers].sort(),
    },
    metrics: {
      startup: receipt.metrics.startup,
      total_wall_ms: receipt.metrics.total_wall_ms,
      rss_peak_sampled_bytes: peakRss,
      process_max_rss_bytes: processMaxRss,
      payload: receipt.metrics.payload,
      cases: receipt.cases.map((item) => ({
        id: item.case_id,
        program_phase: item.program_phase,
        layer: item.layer,
        workload_tier: item.workload_tier,
        campaign: item.campaign,
        wall_ms: item.metrics.wall_ms,
        rss_peak_sampled_bytes: item.metrics.rss_peak_sampled_bytes,
        process_max_rss_bytes: item.metrics.process_max_rss_bytes,
        adapter_phases_ms: item.metrics.adapter_phases_ms,
      })),
    },
  };
}

function buildReport(policyValue, receiptRecords) {
  const policy = validateMatrixPolicy(policyValue);
  const validatedReceipts = receiptRecords.map((record) => ({
    path: record.path.split(path.sep).join("/"),
    receipt: verifyReceipt(record.value, {
      historical: true,
      requireClean: policy.require_clean,
    }).receipt,
  }));
  const used = new Set();
  const rows = policy.rows.map((row) => {
    const matches = validatedReceipts.filter((record) => receiptMatches(row, record.receipt));
    if (matches.length > 1) {
      return {
        row_id: row.id,
        status: "failed",
        reasons: [`${matches.length} receipts match; matrix evidence must be unambiguous`],
        receipt: null,
        bindings: null,
        coverage: null,
        metrics: null,
      };
    }
    if (matches.length === 1) used.add(matches[0].receipt.id);
    return rowEvidence(row, matches[0] ?? null, policy.require_clean);
  });
  const unmatchedReceiptIds = validatedReceipts
    .filter((record) => !used.has(record.receipt.id))
    .map((record) => record.receipt.id)
    .sort();
  const core = {
    schema: REPORT_SCHEMA,
    policy: {
      id: policy.id,
      sha256: sha256(canonicalJson(policy)),
      require_clean: policy.require_clean,
      required_rows: policy.rows.length,
    },
    status: rows.every((row) => row.status === "passed") ? "passed" : "failed",
    rows,
    unmatched_receipt_ids: unmatchedReceiptIds,
  };
  return { ...core, id: contentId(core) };
}

function markdownReport(report) {
  const lines = [
    `# Numerical qualification report: ${report.policy.id}`,
    "",
    `Status: **${report.status.toUpperCase()}**`,
    "",
    `Policy SHA-256: \`${report.policy.sha256}\``,
    "",
    "| Required row | Status | Platform / runtime | Phases | Layers | Receipt | Source | Total ms | Peak RSS bytes | Artifact bytes |",
    "|---|---:|---|---|---|---|---|---:|---:|---:|",
  ];
  for (const row of report.rows) {
    const runtime = row.receipt === null
      ? "unmeasured"
      : `${row.receipt.platform} / ${row.receipt.subject.kind}:${row.receipt.subject.name}`;
    lines.push([
      `| ${row.row_id}`,
      row.status,
      runtime,
      row.coverage?.program_phases.join(", ") ?? "missing",
      row.coverage?.case_layers.join(", ") ?? "missing",
      row.receipt?.id ?? "missing",
      row.bindings?.source_bundle_sha256 ?? "missing",
      row.metrics?.total_wall_ms ?? "—",
      row.metrics?.rss_peak_sampled_bytes ?? "—",
      row.metrics?.payload.artifact_installed_bytes ?? "—",
      "|",
    ].join(" | "));
    for (const reason of row.reasons) {
      lines.push(`| ↳ ${reason} |  |  |  |  |  |  |  |  |  |`);
    }
  }
  if (report.unmatched_receipt_ids.length !== 0) {
    lines.push("", "Unmatched receipts (not qualification evidence for a required row):", "");
    for (const id of report.unmatched_receipt_ids) lines.push(`- \`${id}\``);
  }
  lines.push("", "Missing rows deliberately retain null receipt, binding, and metric fields; no values are inferred.", "");
  return lines.join("\n");
}

module.exports = {
  buildReport,
  markdownReport,
  receiptMatches,
};

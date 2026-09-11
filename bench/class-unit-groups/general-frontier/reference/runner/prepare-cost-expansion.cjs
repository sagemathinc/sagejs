"use strict";

// A second, explicit acquisition round selected only from reference costs.
// This is not a performance-panel freeze or a faster-reference classification.
const fs = require("node:fs");
const crypto = require("node:crypto");
const { loadExport } = require("../../corpus/candidate-pool.cjs");
const boundaries = [0, 6, 12, 18, 24, 36, 60, 100, 200];
const seed = "general-frontier-reference-cost-expansion-v1";
const hash = (x) => crypto.createHash("sha256").update(x).digest("hex");

function cell(record) {
  const d = BigInt(record.discriminant_absolute);
  const band = boundaries.findIndex((lo, i) => i + 1 < boundaries.length
    && d >= 10n ** BigInt(lo) && d < 10n ** BigInt(boundaries[i + 1]));
  if (band < 0) throw new Error("discriminant outside acquisition policy");
  return `${record.degree}:${record.signature.join(",")}:${band}`;
}

function select(pool, reports, perCell = 12) {
  if (!Number.isSafeInteger(perCell) || perCell < 1 || perCell > 16)
    throw new Error("per-cell count must be 1..16");
  const byLabel = new Map(pool.records.map((r) => [r.label, r]));
  if (byLabel.size !== pool.records.length) throw new Error("duplicate candidate label");
  const exposed = new Set(), promising = new Set();
  for (const report of reports) {
    if (report.schema !== "sagejs.general-frontier-cost-screen-review.v1"
        || report.qualification_evidence !== false || !Array.isArray(report.rows))
      throw new Error("expected an explicit cost-screen review");
    for (const row of report.rows) {
      const record = byLabel.get(row.label);
      if (!record) throw new Error("review label absent from candidate pool");
      if (!/^[0-9a-f]{64}$/.test(row.receipt_sha256)) throw new Error("missing receipt digest");
      if (!["ok", "timeout", "error", "output-limit"].includes(row.reviewed_status))
        throw new Error("unknown reviewed status");
      exposed.add(row.label);
      if (row.reviewed_status === "ok"
          && (!Number.isSafeInteger(row.elapsed_milliseconds) || row.elapsed_milliseconds < 0))
        throw new Error("invalid elapsed cost");
      if (row.reviewed_status === "timeout"
          || (row.reviewed_status === "ok" && row.elapsed_milliseconds >= 1000))
        promising.add(cell(record));
    }
  }
  const groups = new Map([...promising].sort().map((c) => [c, []]));
  for (const record of pool.records) {
    const group = groups.get(cell(record));
    if (group && !exposed.has(record.label)) group.push(record);
  }
  const selected = [...groups].flatMap(([key, records]) => records
    .sort((a, b) => hash(seed + key + a.label).localeCompare(hash(seed + key + b.label)))
    .slice(0, perCell).map((r) => ({ cell: key, ...r })));
  if (selected.length > 200) throw new Error("batch exceeds 200; explicitly lower per-cell count");
  return { selected, promising_cells: [...groups.keys()], prior_screen_labels: [...exposed].sort() };
}

if (require.main === module) {
  const [directory, output, ...reviewPaths] = process.argv.slice(2);
  if (!directory || !output || !reviewPaths.length)
    throw new Error("usage: prepare-cost-expansion.cjs POOL_DIRECTORY OUTPUT REVIEW...");
  const { pool } = loadExport(directory);
  const inputs = reviewPaths.map((path) => ({ path, bytes: fs.readFileSync(path) }));
  const chosen = select(pool, inputs.map((x) => JSON.parse(x.bytes)));
  const records = chosen.selected.map(({ label, coefficients }) => ({ label, coefficients }));
  const policy = {
    schema: "sagejs.general-frontier-reference-cost-expansion.v1", seed, boundaries,
    candidate_pool_sha256: hash(JSON.stringify(pool)),
    reviews: inputs.map(({ path, bytes }) => ({ path, sha256: hash(bytes) })),
    trigger: "any completed PARI cost >=1000ms or censored timeout in signature/discriminant cell",
    per_cell: 12, request_cap_seconds: 60, worst_case_request_wall_seconds: 60 * records.length,
    qualification_evidence: false, faster_reference_classified: false,
    selection_uses_sagejs_results: false,
    promising_cells: chosen.promising_cells, prior_screen_labels: chosen.prior_screen_labels,
    fields: chosen.selected.map(({ label, cell }) => ({ label, cell })),
  };
  fs.writeFileSync(output, JSON.stringify(records, null, 2) + "\n", { flag: "wx" });
  fs.writeFileSync(output + ".selection.json", JSON.stringify(policy, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ fields: records.length, cells: chosen.promising_cells.length,
    worst_case_request_wall_seconds: policy.worst_case_request_wall_seconds }));
}

module.exports = { select };

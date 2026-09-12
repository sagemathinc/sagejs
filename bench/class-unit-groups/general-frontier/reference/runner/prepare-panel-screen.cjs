"use strict";

// Bounded cost discovery across every populated signature/discriminant cell.
// This is not the final performance panel, and consumes no Sage.js outcomes.
const fs = require("node:fs");
const crypto = require("node:crypto");
const { loadExport } = require("../../corpus/candidate-pool.cjs");
const seed = "general-frontier-all-signatures-cost-screen-v1";
const boundaries = [0, 6, 12, 18, 24, 36, 60, 100, 200];
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

function select(pool, count = 2, minimumExponent = 0) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 4) throw new Error("count must be 1..4");
  if (!boundaries.includes(minimumExponent) || minimumExponent === 200) throw new Error("minimum must be a declared lower band boundary");
  const cells = new Map();
  for (const record of pool.records) {
    const discriminant = BigInt(record.discriminant_absolute);
    const band = boundaries.findIndex((exponent, i) => i + 1 < boundaries.length
      && discriminant >= 10n ** BigInt(exponent)
      && discriminant < 10n ** BigInt(boundaries[i + 1]));
    if (band < 0) throw new Error("discriminant outside declared bands");
    if (discriminant < 10n ** BigInt(minimumExponent)) continue;
    const key = `${record.degree}:${record.signature.join(",")}:${band}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(record);
  }
  const chosen = [...cells.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([cell, values]) =>
    values.sort((a, b) => hash(seed + cell + a.label).localeCompare(hash(seed + cell + b.label)))
      .slice(0, count).map((record) => ({ cell, ...record })));
  if (chosen.length > 200) throw new Error("screen exceeds 200-field batch cap; predeclare a smaller batch policy");
  return chosen;
}

if (require.main === module) {
  const [directory, destination, count = "2", minimumExponent = "0"] = process.argv.slice(2);
  if (!directory || !destination) throw new Error("usage: prepare-panel-screen.cjs CANDIDATE_EXPORT OUTPUT [COUNT_PER_CELL]");
  const { pool } = loadExport(directory);
  const chosen = select(pool, Number(count), Number(minimumExponent));
  const records = chosen.map(({ label, coefficients }) => ({ label, coefficients }));
  fs.writeFileSync(destination, JSON.stringify(records, null, 2) + "\n", { flag: "wx" });
  fs.writeFileSync(destination + ".selection.json", JSON.stringify({
    seed, boundaries, minimum_discriminant_exponent: Number(minimumExponent),
    per_populated_cell: Number(count), candidate_pool_sha256: hash(JSON.stringify(pool)),
    request: "reference-cost-discovery-not-frozen-panel", selection_uses_sagejs_results: false,
    fields: chosen.map(({ label, cell }) => ({ label, cell })),
  }, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ fields: records.length, signatures: new Set(chosen.map((r) => r.signature.join(","))).size }));
}

module.exports = { select };

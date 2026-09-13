"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");
const { loadExport } = require("../../corpus/candidate-pool.cjs");

const seed = "general-frontier-rank-two-reference-pilot-v1";
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

function select(pool, count, minimumDiscriminantExponent = 0) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 40) throw new Error("count must be 1..40");
  if (!Number.isSafeInteger(minimumDiscriminantExponent) || minimumDiscriminantExponent < 0 || minimumDiscriminantExponent > 200) throw new Error("invalid discriminant exponent");
  return [[3, 0], [2, 1], [4, 0]].flatMap((signature) => {
    const candidates = pool.records.filter((r) => JSON.stringify(r.signature) === JSON.stringify(signature)
      && BigInt(r.discriminant_absolute) >= 10n ** BigInt(minimumDiscriminantExponent))
      .sort((a, b) => hash(seed + a.label).localeCompare(hash(seed + b.label)));
    if (candidates.length < count) throw new Error(`insufficient candidates for ${signature}`);
    return candidates.slice(0, count).map(({ label, coefficients }) => ({ label, coefficients }));
  });
}

if (require.main === module) {
  const [directory, destination, count = "2", minimumExponent = "0"] = process.argv.slice(2);
  if (!directory || !destination) throw new Error("usage: prepare-screen.cjs CANDIDATE_EXPORT OUTPUT [COUNT_PER_SIGNATURE]");
  const exported = loadExport(directory);
  const pool = exported.pool;
  const records = select(pool, Number(count), Number(minimumExponent));
  fs.writeFileSync(destination, JSON.stringify(records, null, 2) + "\n", { flag: "wx" });
  fs.writeFileSync(destination + ".selection.json", JSON.stringify({
    seed, minimum_discriminant_exponent: Number(minimumExponent), candidate_pool_sha256: hash(JSON.stringify(pool)),
    request: "reference-screen-only-not-frozen-bridge",
    selection_uses_sagejs_results: false,
    fields: records.map((record) => record.label),
  }, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ fields: records.length, labels: records.map((record) => record.label) }));
}

module.exports = { select };

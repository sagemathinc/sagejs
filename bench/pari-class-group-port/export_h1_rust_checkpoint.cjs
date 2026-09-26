"use strict";

// Export the exact live relation/HNF seam used by the Rust backend experiment.
// This is diagnostic data only: the Rust timing starts after parsing it, and a
// full prepared-prefix result is not claimed until Rust also owns collection.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const adapter = require("./h1_unified_complete_adapter.cjs");
const { sanitizePreparedInput } = require("./h1_outcome_c_adapter.cjs");

const SNAPSHOT_NAMES = [
  "relation_records",
  "relation_state",
  "relation_metadata",
  "generators",
  "log_embeddings",
  "hnf_original",
  "hnf_perm",
  "hnf_result_h",
  "hnf_result_dep",
  "hnf_result_b",
  "hnf_result_c",
  "hnf_assembly_state",
  "hnf_final_state",
  "hnf_state",
  "class_invariants",
  "class_number",
  "attempt_state",
  "bridge_state",
];

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function main() {
  const inputPath = path.resolve(process.argv[2] ?? "");
  const outputPath = path.resolve(process.argv[3] ?? "");
  assert(inputPath && outputPath,
    "usage: node export_h1_rust_checkpoint.cjs INPUT.json OUTPUT.json");
  const inputBytes = fs.readFileSync(inputPath);
  const rawInput = JSON.parse(inputBytes);
  const residentSource = fs.readFileSync(path.join(
    __dirname, "resident_generated_class_attempt.py"), "utf8");
  const preparedInput = sanitizePreparedInput(rawInput, residentSource).record;
  const result = await adapter.probeSagePreparedH1({
    preparedInput,
    stopAfterClass: true,
    snapshotNames: SNAPSHOT_NAMES,
  });
  assert.equal(result.status, "101", "class-stop sentinel changed");
  assert.deepEqual(result.hnfState.slice(0, 9),
    ["0", "7", "66", "0", "7", "8", "0", "73", "0"]);
  const checkpoint = {
    schema: "sagejs.pari-class-group/h1-rust-seam-v1",
    fieldId: adapter.FIELD_ID,
    polynomialAscending: ["20034", "-20018", "0", "1"],
    sourcePreparedInputSha256: sha256(inputBytes),
    sourcePreparedValueSha256: adapter.digest(preparedInput),
    logicalShape: { relationRows: 66, relationColumns: 73, degree: 3 },
    terminal: {
      status: result.status,
      hnfState: result.hnfState,
      bridgeState: result.bridgeState,
    },
    owners: result.snapshots,
  };
  const encoded = `${JSON.stringify(checkpoint)}\n`;
  fs.writeFileSync(outputPath, encoded);
  process.stdout.write(`${JSON.stringify({
    outputPath,
    bytes: Buffer.byteLength(encoded),
    sha256: sha256(encoded),
  })}\n`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

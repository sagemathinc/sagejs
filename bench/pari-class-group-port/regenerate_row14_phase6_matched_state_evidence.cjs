#!/usr/bin/env node
"use strict";

// Deterministic publisher for the small admission envelope.  The large
// mathematical owners remain immutable compressed fixtures and are replayed
// before this file writes anything.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const replayApi = require("./row14_phase6_static_math_replay.cjs");
const verifier = require("./row14_phase6_matched_state_verifier.cjs");

const digestFile = filename => crypto.createHash("sha256")
  .update(fs.readFileSync(filename)).digest("hex");
const sources = [
  "check_row14_general_ideal_maps.cjs",
  "class_unit_output_evidence_v2.cjs",
  "field3_relation_replay_map.py",
  "independent_rich_quartic_class_replay.py",
  "row14_class_unit_output_evidence_v2.cjs",
  "row14_full_raw_smith_ancestry.cjs",
  "row14_general_ideal_maps.py",
  "h1_exclusive_stage_timing.cjs",
  "row14_live_native_provenance.cjs",
  "row14_phase6_static_math_replay.cjs",
  "row14_rank2_c5_c6.py",
  "row14_signed_generator_witness.py",
  "row14_terminal_class_owner.py",
];

function main() {
  const replay = replayApi.replayStaticAuthority();
  const summary = replayApi.replaySummary(replay);
  const outputSha256 = summary.outputSha256;
  const coverage = Object.fromEntries(verifier.COVERAGE_KEYS.map(key => [key, true]));
  const evidence = {
    schema: verifier.EVIDENCE_SCHEMA, panelIndex: verifier.PANEL_INDEX,
    field: { id: verifier.FIELD_ID,
      polynomialAscending: verifier.POLYNOMIAL },
    classUnitOutput: replay.output, classUnitOutputSha256: outputSha256,
    matchedState: verifier.matchedState(), coverage,
    mutationFamilies: verifier.MUTATION_FAMILIES,
    workAuthority: { classHnfColumns: "3", degree: "4",
      factorBaseSize: "799", logEmbeddingColumns: "2",
      logEmbeddingRows: "3", relationCount: "806" },
    nativeCallAuthority: {
      formula: "18 + 2*(collectionPasses-1) + (acceptedCheckpoints-1)",
      roots: ["prepared-initial", "gate-collector-hnf", "post-terminal",
        "rank-two-unit-suffix", "class-group-assembly"],
    },
    replayAuthority: { schema: replay.schema,
      replaySha256: summary.replaySha256, summary },
    sourceAuthorities: { fixtures: replayApi.AUTHORITY_SHA256,
      replaySources: Object.fromEntries(sources.map(basename =>
        [basename, digestFile(path.join(__dirname, basename))])) },
  };
  fs.writeFileSync(path.join(__dirname,
    "row14_phase6_matched_state_evidence_v2.json"),
  `${JSON.stringify(evidence, null, 2)}\n`);
}

if (require.main === module) main();

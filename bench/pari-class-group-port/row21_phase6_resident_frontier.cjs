"use strict";

// Honest readiness boundary after the first successful row-21 resident fusion.
// It deliberately does not offer a timing adapter for the whole prepared
// computation until every downstream mathematical stage shares this owner.

const fs = require("node:fs");
const path = require("node:path");

const HERE = __dirname;
const boundary = Object.freeze({
  schema: "sagejs.pari-class-group/row21-phase6-resident-frontier-v1",
  fieldId: "5.3.1009349859375.3",
  preparedAuthoritySha256:
    "63378e8424e81d0d5653d965ef18a518b78ec7f78b66f57afcc55052849ac95f",
  completedResidentPrefix: Object.freeze({
    source: "row21_phase6_factor_base_root.py",
    nativeCalls: 1,
    stages: Object.freeze(["prime-degree catalog", "initial bound selection",
      "prime descriptor recovery", "prime-ideal HNF", "subfactor base",
      "initial five-relation frontier"]),
    factorOwnerSha256:
      "7784eef663b7ca2fad9259f2efe642a14aac511331d0ca9de93fae050aebc533",
    relationOwnerSha256:
      "55f1f55a6b02a5d703834af49a716280f7841f3b399af92cdaf258c4b9855233",
    filesystemInsideClock: false,
    subprocessesInsideClock: false,
    serializationInsideClock: false,
  }),
  wholePreparedKernelAvailable: false,
  firstMissingResidentEdge: Object.freeze({
    from: "pari_row21_phase6_factor_base_root",
    to: "pari_connected_relation_hnf",
    reason: "the connected HNF root still receives host-projected descriptor, ideal, packet, permutation, and subfactor arrays instead of the live prefix buffers",
  }),
  downstreamHostCuts: Object.freeze([
    "row21_first_hnf_coordinator.cjs publishes a compressed owner",
    "row21_acceptance_coordinator.cjs authenticates and republishes projected HNF/log state",
    "row21_live_unit_coordinator.cjs publishes a compressed unit owner",
    "row21_fresh_prepared_transaction.cjs spawns CPython for final assembly and replay",
  ]),
  honesty: Object.freeze({
    connectedCorrectnessRoot: "row21_honesty_resident_root.py",
    selectedBounds: Object.freeze({ C1: "5", C2: "31", KCZ: "3", KCZ2: "10" }),
    defaultBounds: Object.freeze({ C1: "57", C2: "57", KCZ: "15", KCZ2: "15" }),
    applicableToDefaultMatchedRun: false,
    reason: "the default matched run has equal bounds and skips honesty; the unequal-bound root is a separate correctness fixture and cannot be substituted into the timed matched computation",
  }),
});

function inspect() {
  for (const name of ["row21_phase6_factor_base_root.py",
    "connected_relation_hnf.py", "row21_honesty_resident_root.py",
    "row21_fresh_prepared_transaction.cjs"]) {
    if (!fs.existsSync(path.join(HERE, name)))
      throw new Error(`row21 Phase-6 source disappeared: ${name}`);
  }
  return boundary;
}

function createWholePreparedAdapter() {
  const error = new Error(
    "row 21 has a resident factor/relation-prefix root, but no whole prepared-kernel root");
  error.code = "SAGEJS_PHASE6_NO_RESIDENT_KERNEL";
  error.frontier = inspect();
  throw error;
}

module.exports = { boundary, createWholePreparedAdapter, inspect };

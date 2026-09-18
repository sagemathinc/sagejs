"use strict";

// Benchmark-only row-14 relation/HNF diagnostic.  Authentication, compilation,
// allocation and result validation occur outside the native stage clocks.  The
// ordinary matched-clock build does not enable these clocks.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const gate = require("./row14_prepared_gate_c_host.cjs");
const matched = require("./row14_matched_kernel_clock_host.cjs");
const timing = require("./row14_sage_prepared_timing_adapter.cjs");

const EXPECTED_STATES = Object.freeze([
  [3, 10, 792, 4, 7, 105, 0, 802, 0],
  [4, 11, 793, 2, 7, 1, 0, 804, 0],
  [2, 9, 796, 1, 7, 3, 0, 805, 0],
  [3, 10, 796, 0, 7, 0, 0, 806, 0],
]);
const EXPECTED_RESULT_SHA256 =
  "1c669dd03269ef25e1c79e08c104f416062465380964515c6079902a96aacfef";
const EXPECTED_RNG_SHA256 =
  "c1084b71784a5c2d2769417798403180447aee7620f68d264b34e25c8e3414ad";

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validateTrace(entry) {
  const trace = entry.trace;
  assert(trace !== null, `missing native trace for ${entry.label}`);
  assert.equal(trace.failed, false);
  assert.equal(trace.clockFailed, false);
  const visits = trace.visits.reduce((sum, visit) => sum + BigInt(visit.nanoseconds), 0n);
  const totals = Object.values(trace.totalsNanoseconds)
    .reduce((sum, value) => sum + BigInt(value), 0n);
  assert.equal(visits, BigInt(trace.rootNanoseconds));
  assert.equal(totals, BigInt(trace.rootNanoseconds));
}

function summarize(profile) {
  for (const entry of profile.native) validateTrace(entry);
  const outerTotal = profile.outer.reduce((sum, stage) => sum + BigInt(stage.nanoseconds), 0n);
  assert(outerTotal <= BigInt(profile.gateNanoseconds));
  const calls = profile.native.map(entry => ({
    label: entry.label,
    rootNanoseconds: entry.trace.rootNanoseconds,
    totalsNanoseconds: entry.trace.totalsNanoseconds,
  }));
  return {
    gateNanoseconds: profile.gateNanoseconds,
    attributedOuterNanoseconds: String(outerTotal),
    unattributedOuterNanoseconds: String(BigInt(profile.gateNanoseconds) - outerTotal),
    outer: profile.outer,
    nativeCalls: calls,
    allocations: profile.allocations,
    generatedCode: profile.builds,
  };
}

async function runProfile() {
  const authenticated = timing.authenticateAndHydrate();
  const { prepared, root } = authenticated;
  // Reproduce the matched process residency before profiling Gate C, and warm
  // the diagnostic variants so their one-time build is never attributed.
  const resident = await matched.prepareResident(prepared);
  assert.equal(resident.preparedEnvelope.authoritySha256, prepared.authoritySha256);
  await gate.warmPreparedGateC({ profile: true });
  const live = await gate.runPreparedGateC(prepared, root, { profile: true });
  assert.deepEqual(live.checkpoints.map(checkpoint => checkpoint.state), EXPECTED_STATES);
  assert.equal(live.collectionPasses, 8);
  assert.deepEqual(live.collectorValues.relation_state.toArray().map(String),
    ["806", "8110", "0", "0", "806", "806"]);
  assert.deepEqual(live.preparedRng, root.rng);
  assert.deepEqual(live.passTrace.map(pass => pass.after), [804, 805, 805, 805, 805, 805, 806]);
  const resultDigest = digest({
    checkpoints: live.checkpoints,
    relationState: live.collectorValues.relation_state.toArray().map(String),
    relationRecords: live.collectorValues.relation_records.toArray()
      .slice(0, 806 * 799).map(String),
    logs: live.collectorValues.log_embeddings.toArray().slice(0, 806 * 3 * 7).map(String),
    rng: live.preparedRng,
  });
  assert.equal(resultDigest, EXPECTED_RESULT_SHA256);
  assert.equal(digest(live.preparedRng), EXPECTED_RNG_SHA256);
  return {
    schema: "sagejs.pari-class-group/row14-relation-hnf-profile-v1",
    boundary: "authenticated prepared root through accepted 806-column HNF",
    exact: { resultDigest, relationState: ["806", "8110", "0", "0", "806", "806"],
      checkpointStates: EXPECTED_STATES, rngSha256: digest(live.preparedRng) },
    profile: summarize(live.profile),
    maximumRssKiB: String(process.resourceUsage().maxRSS),
    limits: { addressSpaceBytes: 4 * 1024 ** 3, cpuSeconds: 600,
      wallTimeoutSeconds: 600, nodeOldSpaceMiB: 3072 },
    formalTimingReceiptModified: false,
  };
}

module.exports = { runProfile };

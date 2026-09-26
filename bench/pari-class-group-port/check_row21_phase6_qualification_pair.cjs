#!/usr/bin/env node
"use strict";

// Unqualified repeated-fresh protocol smoke only. This does not enable the
// registry, run a qualification campaign, approve a timing host, or open a
// reserve field.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const core = require("./qualification_execution_core.cjs");
const fresh = require("./row21_phase6_fresh_adapter.cjs");
const sage = require("./row21_phase6_sage_prepared_adapter.cjs");

const canonical = value => Buffer.from(`${JSON.stringify(value)}\n`);
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const sha256File = filename => sha256(fs.readFileSync(filename));

function sourceAuthorities() {
  const files = {
    checker: __filename,
    freshAdapter: require.resolve("./row21_phase6_fresh_adapter.cjs"),
    sageAdapter: require.resolve("./row21_phase6_sage_prepared_adapter.cjs"),
    pariAdapter: require.resolve("./row21_phase6_pari_prepared_adapter.cjs"),
    pariHelper: path.join(__dirname, "row21_phase6_pari_prepared_adapter.c"),
    executionCore: require.resolve("./qualification_execution_core.cjs"),
    aggregateComposer: require.resolve(
      "./row21_phase6_prepared_aggregate_source.cjs"),
    generatedAggregate: path.join(__dirname,
      "row21_phase6_prepared_aggregate_root.generated.py"),
    exactFinalResult: require.resolve("./row21_phase6_final_result.cjs"),
  };
  return Object.fromEntries(Object.entries(files).map(([name, filename]) =>
    [name, { filename: path.basename(filename), sha256: sha256File(filename) }]));
}

function receiptAuthority(report) {
  const authenticated = structuredClone(report);
  delete authenticated.receiptAuthoritySha256;
  return sha256(canonical(authenticated));
}

function verifyReport(report) {
  assert.equal(report.qualifiedTiming, false);
  assert.equal(report.campaignExecuted, false);
  assert.equal(report.executionEnabled, false);
  assert.equal(report.reserveOpeningEnabled, false);
  assert.equal(report.reservesOpened, false);
  assert.equal(report.exactSymmetricGroupStructureProjection, true);
  assert.equal(report.exactIndependentReplayParity, true);
  assert.notEqual(report.sagejs.batch.outputDigest,
    report.sagejs.batch.replayDigest, "replay must not be an output clone");
  assert.deepEqual(report.sourceAuthorities, sourceAuthorities(),
    "row-21 receipt source authority changed");
  assert.equal(report.receiptAuthoritySha256, receiptAuthority(report),
    "row-21 receipt authority changed");
  return report;
}

async function main() {
  const output = process.argv[2] ||
    "/scratch/row21-phase6-unqualified-fresh-protocol-v3.json";
  const adapters = {};
  const batches = {};
  for (const implementation of ["sagejs", "pari"]) {
    const adapter = await fresh.createRow21FreshPreparedAdapter(
      { panelIndex: 21, implementation });
    adapters[implementation] = adapter;
    batches[implementation] = await core.executeFreshBatch(adapter, {
      boundary: "prepared-kernel", fieldId: sage.FIELD_ID,
      repetitions: 2, seed: "1", tier: "diagnostic",
    });
  }
  for (const digest of ["outputDigest", "replayDigest", "rngDigest",
    "workDigest"])
    assert.equal(batches.sagejs[digest], batches.pari[digest],
      `row 21 differs in ${digest}`);
  assert.notEqual(batches.sagejs.outputDigest, batches.sagejs.replayDigest,
    "independent replay unexpectedly clones output");
  assert.equal(batches.sagejs.resourceCounters.mathematicalCalls, "2");
  assert.equal(batches.pari.resourceCounters.mathematicalCalls, "2");
  assert.equal(batches.pari.resourceCounters.bnfinit0CallCount, "2");
  assert.equal(adapters.sagejs.observations.length, 2);
  assert(adapters.sagejs.observations.every(value =>
    value.boundary.nativeCallsInsideClock === 1 &&
    value.boundary.resetRecipeComplete === true &&
    value.exactSageEvidence.exactCapabilityReplay === true &&
    value.exactSageEvidence.exactUnitWitnessCount === "3"));
  assert.deepEqual(adapters.sagejs.observations[0].exactSageEvidence,
    adapters.sagejs.observations[1].exactSageEvidence);
  assert.deepEqual(adapters.sagejs.observations[0].provenance,
    adapters.sagejs.observations[1].provenance);
  assert.equal(adapters.pari.observations.length, 2);
  assert.equal(adapters.pari.observations[0].terminalRngSha256,
    adapters.pari.observations[1].terminalRngSha256,
    "fresh pristine PARI helpers changed terminal RNG state");
  assert.equal(batches.pari.threadCpuNanoseconds, null,
    "subprocess PARI thread CPU must be explicitly unavailable");

  const report = {
    schema: "sagejs.pari-class-group/row21-phase6-unqualified-fresh-protocol-v3",
    qualifiedTiming: false, campaignExecuted: false, executionEnabled: false,
    reserveOpeningEnabled: false, reservesOpened: false,
    fieldId: sage.FIELD_ID, projectionSchema: sage.PROJECTION_SCHEMA,
    replaySchema: sage.REPLAY_SCHEMA,
    exactSymmetricGroupStructureProjection: true,
    regulatorComparisonScope: "nonzero-only-not-equal-value",
    exactIndependentReplayParity: true,
    exactSageUnitCapabilityReplay: true,
    matchedSeedAuthority: true, terminalRngCrossArmMaterialized: false,
    pariFreshTerminalRngDeterministic: true,
    observedWorkCountersEqual: true,
    sourceAuthorities: sourceAuthorities(),
    sagejs: { batch: batches.sagejs,
      provenance: adapters.sagejs.provenance,
      observations: adapters.sagejs.observations },
    pari: { batch: batches.pari, provenance: adapters.pari.provenance,
      observations: adapters.pari.observations },
    note: "Development-host diagnostic clocks are protocol evidence only and are not qualification timings.",
  };
  report.receiptAuthoritySha256 = receiptAuthority(report);
  verifyReport(report);
  const bytes = canonical(report);
  fs.writeFileSync(output, bytes, { flag: "wx" });
  verifyReport(JSON.parse(fs.readFileSync(output, "utf8")));
  process.stdout.write(`${JSON.stringify({ output, sha256: sha256(bytes),
    receiptAuthoritySha256: report.receiptAuthoritySha256,
    exactSymmetricGroupStructureProjection: true, qualifiedTiming: false })}\n`);
}

module.exports = { main, receiptAuthority, sourceAuthorities, verifyReport };

if (require.main === module)
  main().catch(error => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });

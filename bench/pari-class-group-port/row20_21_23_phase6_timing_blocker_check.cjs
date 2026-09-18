#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");

const probes = [
  require("./row20_phase6_timing_blocker_probe.cjs").row20,
  require("./row21_phase6_timing_blocker_probe.cjs"),
  require("./row23_phase6_timing_blocker_probe.cjs"),
];

async function main() {
  const executeFresh = !process.argv.includes("--admission-only");
  const corpusArgument = process.argv.find(value => value.startsWith("--corpus="));
  const corpusDirectory = corpusArgument
    ? corpusArgument.slice("--corpus=".length)
    : "/scratch/sagejs-pari-fresh-prepared-corpus-v1";
  const results = [];
  for (const probe of probes) {
    const result = await probe.runProbe({ corpusDirectory, executeFresh });
    assert.equal(result.admission.matchedTimingReady, false);
    assert.equal(result.admission.qualifiedTiming, false);
    assert.equal(result.admission.ratioPublished, false);
    assert.equal(result.commonProjection.ready, true);
    assert(result.boundary.blockers.length >= 3);
    if (executeFresh) {
      assert.equal(result.freshCorrectness.authenticatedPreparedInput, true);
      assert.equal(result.freshCorrectness.correspondenceComplete, true);
    }
    results.push(result);
  }
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row20-21-23-phase6-blocker-check-v1",
    executeFresh, rows: results, matchedTimingRows: [],
    blockedRows: results.map(result => result.panelIndex), timingSamplesTaken: 0,
  }, null, 2)}\n`);
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

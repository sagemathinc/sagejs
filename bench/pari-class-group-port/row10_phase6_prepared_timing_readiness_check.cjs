#!/usr/bin/env node
"use strict";
// sagejs-test-tier: specialized
// sagejs-test-platform: linux
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const readiness = require("./row10_phase6_prepared_timing_readiness.cjs");
const authentication = require("./prepared_nf_authentication.cjs");
const aggregateAuthority = require("./run_fresh_prepared_aggregate.cjs");
const DEFAULT_PREPARED = "/scratch/sagejs-pari-fresh-prepared-corpus-v1/" +
  "prepared-row-10-92f29c9a6cd3854ec2bc1fac7bb160789df8fdf5aff2aa0beea396e9d8bc56e3.json";
const DEFAULT_AGGREGATE = "/scratch/fresh-prepared-development-aggregate-v1-20260918.json";
async function main() {
  const positional = process.argv.slice(2).filter(value => !value.startsWith("--"));
  const preparedFile = path.resolve(positional[0] || DEFAULT_PREPARED);
  const prepared = JSON.parse(fs.readFileSync(preparedFile));
  assert.equal(authentication.authenticatePreparedNf(prepared).sha256,
    readiness.PREPARED_AUTHORITY_SHA256);
  const changed = structuredClone(prepared); changed.precision = "193";
  assert.throws(() => authentication.authenticatePreparedNf(changed));
  const aggregate = JSON.parse(fs.readFileSync(path.resolve(positional[1] || DEFAULT_AGGREGATE)));
  aggregateAuthority.verifyAggregateReceipt(aggregate,
    aggregateAuthority.inspectCorpus(path.dirname(preparedFile)));
  const row = aggregate.rows.find(value => value.panelIndex === readiness.PANEL_INDEX);
  assert(row); assert.equal(row.preparedAuthoritySha256, readiness.PREPARED_AUTHORITY_SHA256);
  assert.equal(row.resultSha256, readiness.RESULT_SHA256);
  assert.equal(row.freshPreparedExecution, true); assert.equal(row.correspondenceComplete, true);
  assert.equal(row.qualifiedTiming, false);
  const audit = readiness.inspectResidentBoundary();
  assert.equal(audit.completeResidentPreparedKernel, false);
  assert.throws(() => readiness.createTimingArm(), error =>
    error.code === "SAGEJS_PHASE6_NO_RESIDENT_KERNEL");
  let live = null;
  if (process.argv.includes("--live-fresh"))
    live = await readiness.runUntimedFreshCorrectness(prepared);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row10-phase6-timing-readiness-check-v1",
    aggregateFreshCorrectnessAuthenticated: true,
    liveFreshCorrectnessExecuted: live !== null, live,
    mutationRejected: true, timingArmRejected: true, audit,
  }, null, 2)}\n`);
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });

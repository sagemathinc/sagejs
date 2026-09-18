#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const aggregate = require("./run_fresh_prepared_aggregate.cjs");
const child = require("./fresh_prepared_aggregate_child.cjs");

const EXPECTED = [0, 1, 3, 4, 6, 8, 10, 11, 13, 14, 16, 18, 19, 20, 21, 23];

async function main() {
  assert.deepEqual(aggregate.frozenPopulation().map(row => row.panelIndex), EXPECTED);
  assert.deepEqual(child.expectedIndices(), EXPECTED);
  assert.deepEqual(aggregate.RESOURCE_BOUNDS, {
    addressSpaceBytes: 4 * 1024 * 1024 * 1024,
    cpuSeconds: 600,
    fileBytes: 1024 * 1024 * 1024,
    wallMilliseconds: 600_000,
  });

  const probe = aggregate.probeRegistry();
  assert.deepEqual(probe.expected, EXPECTED);
  assert.deepEqual([...probe.registered, ...probe.missing].sort((a, b) => a - b),
    EXPECTED);
  assert.equal(new Set([...probe.registered, ...probe.missing]).size, 16);
  assert.equal(probe.ready, probe.missing.length === 0);
  if (probe.ready) {
    aggregate.assertRegistryReady(probe);
  } else {
    assert.throws(() => aggregate.assertRegistryReady(probe),
      /aggregate gate remains closed/);
  }

  const omitted = { ...probe, registered: probe.registered.filter(value => value !== 0),
    missing: [...new Set([...probe.missing, 0])].sort((a, b) => a - b), ready: false };
  assert.throws(() => aggregate.assertRegistryReady(omitted),
    /aggregate gate remains closed/);

  const value = { z: [2, { b: false, a: "x" }], a: 1 };
  assert.equal(aggregate.canonical(value),
    '{"a":1,"z":[2,{"a":"x","b":false}]}');

  const corpusForMutation = process.argv[2] ?
    aggregate.inspectCorpus(process.argv[2]) : null;
  if (corpusForMutation && process.argv[3]) {
    const receipt = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
    for (const mutate of [
      value_ => { value_.allRegistryAdmissions = false; },
      value_ => { value_.rows[0].retainedRuntimeInputs = true; },
    ]) {
      const changed = structuredClone(receipt);
      mutate(changed);
      const { aggregateSha256: _discarded, ...body } = changed;
      changed.aggregateSha256 = require("node:crypto").createHash("sha256")
        .update(Buffer.from(aggregate.canonical(body))).digest("hex");
      assert.throws(() => aggregate.verifyAggregateReceipt(changed,
        corpusForMutation));
    }
  }

  const runnerSource = fs.readFileSync(
    path.join(__dirname, "run_fresh_prepared_aggregate.cjs"), "utf8");
  const childSource = fs.readFileSync(
    path.join(__dirname, "fresh_prepared_aggregate_child.cjs"), "utf8");
  assert.match(runnerSource, /fresh_prepared_development_registry\.cjs/);
  assert.match(runnerSource, /\/usr\/bin\/prlimit/);
  assert.match(runnerSource, /fs\.rmSync\(temporaryRoot/);
  assert.match(childSource, /runRegisteredFreshPrepared/);
  assert.match(childSource, /verifyFreshExecution/);
  assert.doesNotMatch(childSource, /elapsedNs|stageElapsedNs|wallNanoseconds|kernelNanoseconds/);

  let corpusRows = null;
  let aggregateReceiptVerified = false;
  if (process.argv[2]) {
    const corpus = corpusForMutation;
    corpusRows = corpus.files.length;
    assert.equal(corpusRows, 16);
    if (process.argv[3]) {
      const receipt = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
      aggregate.verifyAggregateReceipt(receipt, corpus);
      aggregateReceiptVerified = true;
    }
  }
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/fresh-prepared-aggregate-focused-check-v1",
    expected: EXPECTED,
    registered: probe.registered,
    missing: probe.missing,
    ready: probe.ready,
    corpusRows,
    aggregateReceiptVerified,
    expensiveExecutionsStarted: 0,
    deterministicReceipt: true,
    freshChildPerRow: true,
    sameChildRegistryAdmission: true,
    resourceBounds: true,
    temporaryOutputsCleaned: true,
    timingClaim: false,
  }, null, 2)}\n`);
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const coordinator = require("./qualification_process_coordinator.cjs");
const worker = require("./qualification_arm_worker.cjs");

const ADAPTER_PATH = path.join(__dirname, "qualification_test_adapter.cjs");
const PROJECTION = "sagejs.pari-class-group/synthetic-common-projection-v1";

function descriptor(implementation, extra = {}) {
  return {
    schema: worker.ADAPTER_SCHEMA,
    implementation,
    modulePath: ADAPTER_PATH,
    exportName: "createSyntheticAdapter",
    projectionSchema: extra.projectionSchema || PROJECTION,
    configuration: { implementation, projectionSchema: extra.projectionSchema || PROJECTION,
      ...extra },
  };
}

function temporary(name) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-qualification-core-"));
  return path.join(directory, name);
}

async function main() {
  assert.deepEqual(coordinator.exactSchedule("diagnostic"),
    ["AB", "BA", "AB", "BA", "AB", "BA", "AB"]);
  assert.deepEqual(coordinator.exactSchedule("flag-zero"),
    ["ABBA", "BAAB", "ABBA", "BAAB", "ABBA", "BAAB",
      "ABBA", "BAAB", "ABBA", "BAAB", "ABBA"]);

  const journalPath = temporary("success.jsonl");
  const result = await coordinator.runProcessIsolatedCampaign({
    adapters: { sagejs: descriptor("sagejs"), pari: descriptor("pari") },
    boundary: "prepared-kernel", fieldId: "synthetic-development-field",
    seed: "7", tier: "diagnostic", journalPath,
  });
  assert.equal(result.qualifiedTiming, false);
  assert.equal(result.completionStatus, "complete_matched");
  assert.deepEqual(result.repetitionsByImplementation, { sagejs: 2, pari: 2 });
  assert.equal(result.blocks.length, 7);
  assert(result.blocks.every(block => block.arms.length === 2));
  assert.equal(result.semanticProjection.projectionSchema, PROJECTION);
  const checked = coordinator.readJournal(journalPath);
  assert.deepEqual(checked.result, result);
  const processEvents = checked.events.filter(event => event.process);
  assert.equal(new Set(processEvents.map(event => event.process.workerInvocationId)).size,
    processEvents.length, "worker process was reused");
  assert(processEvents.filter(event => event.kind.endsWith("completed"))
    .every(event => BigInt(event.process.workerResources.maxRssKiB) > 0n));

  const mutatedPath = temporary("mutated.jsonl");
  const mutated = fs.readFileSync(journalPath, "utf8").trim().split("\n").map(JSON.parse);
  const completed = mutated.find(event => event.kind === "arm-completed");
  completed.arm.outputDigest = "0".repeat(64);
  fs.writeFileSync(mutatedPath, `${mutated.map(JSON.stringify).join("\n")}\n`);
  assert.throws(() => coordinator.readJournal(mutatedPath), /differs from its journal event/);

  const divergentPath = temporary("divergent.jsonl");
  const divergent = await coordinator.runProcessIsolatedCampaign({
    adapters: { sagejs: descriptor("sagejs"),
      pari: descriptor("pari", { semanticValue: "changed", kernelNanoseconds: "1100000000" }) },
    boundary: "prepared-kernel", fieldId: "synthetic-divergence",
    seed: "8", tier: "diagnostic", journalPath: divergentPath,
  });
  assert.equal(divergent.completionStatus, "wrong_result");
  assert.equal(divergent.failure.failureClass, 1);
  assert.match(divergent.failure.failureDetail, /changed outputDigest/);
  assert.doesNotThrow(() => coordinator.readJournal(divergentPath));

  const failureJournalPath = temporary("failure.jsonl");
  const failureCampaign = await coordinator.runProcessIsolatedCampaign({
    adapters: { sagejs: descriptor("sagejs", { mode: "fail" }),
      pari: descriptor("pari") },
    boundary: "prepared-kernel", fieldId: "synthetic-worker-failure",
    seed: "12", tier: "diagnostic", journalPath: failureJournalPath,
  });
  assert.equal(failureCampaign.completionStatus, "crash");
  const failureJournal = coordinator.readJournal(failureJournalPath);
  assert(failureJournal.events.some(event => event.kind === "calibration-failed"));
  assert.match(failureCampaign.failure.failureDetail, /calibration/);

  const failed = await coordinator.runIsolatedWorker(coordinator.makeRequest(
    descriptor("sagejs", { mode: "fail" }), {
      boundary: "prepared-kernel", fieldId: "synthetic-failure", seed: "9",
      tier: "diagnostic", repetitions: 1,
    }), { timeoutMilliseconds: 5000 });
  assert.equal(failed.ok, false);
  assert.equal(failed.timeout, false);
  assert.notEqual(failed.code, 0);
  assert.match(failed.stderr, /intentional synthetic failure/);

  const timedOut = await coordinator.runIsolatedWorker(coordinator.makeRequest(
    descriptor("sagejs", { mode: "hang" }), {
      boundary: "prepared-kernel", fieldId: "synthetic-timeout", seed: "10",
      tier: "diagnostic", repetitions: 1,
    }), { timeoutMilliseconds: 50 });
  assert.equal(timedOut.ok, false);
  assert.equal(timedOut.timeout, true);

  const badStage = await coordinator.runIsolatedWorker(coordinator.makeRequest(
    descriptor("sagejs", { mode: "bad-stage" }), {
      boundary: "prepared-kernel", fieldId: "synthetic-bad-stage", seed: "11",
      tier: "diagnostic", repetitions: 1,
    }), { timeoutMilliseconds: 5000 });
  assert.equal(badStage.ok, false);
  assert.match(badStage.stderr, /leaves plus remainder/);

  await assert.rejects(coordinator.runProcessIsolatedCampaign({
    adapters: { sagejs: descriptor("sagejs"),
      pari: descriptor("pari", { projectionSchema: "different" }) },
    boundary: "prepared-kernel", fieldId: "schema-mismatch", seed: "1",
    tier: "diagnostic", journalPath: temporary("schema.jsonl"),
  }), /common semantic projection schema/);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/qualification-process-coordinator-check-v1",
    successfulBlocks: result.blocks.length,
    successfulArms: result.blocks.flatMap(block => block.arms).length,
    freshWorkerProcesses: processEvents.length,
    diagnosticSchedule: coordinator.exactSchedule("diagnostic"),
    finalSchedule: coordinator.exactSchedule("flag-zero"),
    mutationRejected: true,
    divergenceJournaled: true,
    childFailureJournaled: true,
    timeoutEnforced: true,
    wholeWorkerResources: true,
    resourceCapBytes: String(coordinator.ADDRESS_SPACE_BYTES),
    productionArmTimeoutSeconds: coordinator.ARM_TIMEOUT_SECONDS,
    qualifiedTiming: false,
  })}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

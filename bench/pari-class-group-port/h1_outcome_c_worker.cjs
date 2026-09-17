#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  ExclusiveStageTimer,
  validateArm,
} = require("./h1_exclusive_stage_timing.cjs");

const CORRESPONDENCE_COMPLETE_STATUS = "pari-correspondence-complete-internal-h1";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonical(value[key])]),
    );
  }
  return value;
}

function digest(value) {
  return crypto.createHash("sha256").update(
    typeof value === "string" || Buffer.isBuffer(value)
      ? value
      : JSON.stringify(canonical(value)),
  ).digest("hex");
}

function exactKeys(value, keys, name) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${name} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${name} has unexpected fields`);
}

function parseArguments(argv) {
  const answer = { implementation: null, adapter: null, selfTestClockStep: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--implementation") answer.implementation = argv[++index];
    else if (argument === "--adapter") answer.adapter = path.resolve(argv[++index]);
    else if (argument === "--self-test-clock-step") {
      answer.selfTestClockStep = BigInt(argv[++index]);
      assert(answer.selfTestClockStep > 0n);
    } else throw new Error(`unknown worker argument: ${argument}`);
  }
  assert(["sagejs", "pari"].includes(answer.implementation));
  assert(answer.adapter, "worker adapter is required");
  return answer;
}

function deterministicClock(step) {
  let now = -step;
  return () => {
    now += step;
    return now;
  };
}

function validateRequest(request, implementation) {
  exactKeys(request, [
    "schema", "fieldId", "seed", "pairIndex", "repetitions",
    "implementation", "preparedInputSha256", "preparedInput",
  ], "worker request");
  assert.equal(request.schema, 1);
  assert.equal(request.fieldId, "pari-2.17.4:x^3-20018*x+20034");
  assert.equal(request.implementation, implementation);
  assert(Number.isInteger(request.pairIndex) && request.pairIndex >= 0);
  assert(Number.isInteger(request.repetitions) && request.repetitions >= 1);
  assert.match(request.seed, /^(0|[1-9][0-9]*)$/);
  assert.equal(digest(request.preparedInput), request.preparedInputSha256);
}

async function runWorker({ request, implementation, adapterPath, clock }) {
  validateRequest(request, implementation);
  const adapter = require(adapterPath);
  assert.equal(typeof adapter.runPreparedH1, "function", "adapter must export runPreparedH1");
  const timer = new ExclusiveStageTimer(clock);
  const results = [], replays = [], rngStates = [], workRecords = [];
  let terminalStatus = null;
  timer.begin();
  for (let repetition = 0; repetition < request.repetitions; repetition += 1) {
    timer.switchStage("unattributed-remainder");
    const output = await adapter.runPreparedH1({
      implementation,
      seed: request.seed,
      preparedInput: structuredClone(request.preparedInput),
      switchStage: stage => timer.switchStage(stage),
    });
    exactKeys(output, [
      "correspondenceComplete", "result", "replay", "rng", "work",
      "terminalStatus",
    ], "prepared h1 adapter output");
    assert.equal(
      output.correspondenceComplete,
      true,
      "worker refuses a candidate-only or live-oracle-composed result",
    );
    assert.equal(
      output.terminalStatus,
      CORRESPONDENCE_COMPLETE_STATUS,
      "worker requires the audited correspondence-complete terminal status",
    );
    exactKeys(output.replay, [
      "status", "resultSha256", "authoritySha256",
    ], "cold replay record");
    assert.equal(output.replay.status, "cold-replay-authenticated");
    assert.equal(
      output.replay.resultSha256,
      digest(output.result),
      "cold replay is not bound to the returned result",
    );
    assert.match(output.replay.authoritySha256, /^[0-9a-f]{64}$/);
    terminalStatus ??= output.terminalStatus;
    assert.equal(output.terminalStatus, terminalStatus);
    results.push(output.result);
    replays.push(output.replay);
    rngStates.push(output.rng);
    workRecords.push(output.work);
  }
  timer.switchStage("unattributed-remainder");
  const trace = timer.finish();
  for (const [name, values] of Object.entries({
    result: results,
    replay: replays,
    rng: rngStates,
    work: workRecords,
  })) {
    const expected = digest(values[0]);
    assert(
      values.every(value => digest(value) === expected),
      `${name} changed across fresh repetitions`,
    );
  }
  const arm = {
    position: 0,
    label: implementation === "sagejs" ? "A" : "B",
    implementation,
    repetitions: request.repetitions,
    ...trace,
    timerReadOverheadNanoseconds: "0",
    resultDigest: digest(results[0]),
    replayDigest: digest(replays[0]),
    rngDigest: digest(rngStates[0]),
    workDigest: digest(workRecords[0]),
    terminalStatus,
  };
  validateArm(arm);
  return {
    schema: 1,
    implementation,
    requestSha256: digest(request),
    preparedInputSha256: request.preparedInputSha256,
    selfTestClock: clock !== process.hrtime.bigint,
    arm,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const request = JSON.parse(fs.readFileSync(0, "utf8"));
  const clock = options.selfTestClockStep === null
    ? process.hrtime.bigint
    : deterministicClock(options.selfTestClockStep);
  const response = await runWorker({
    request,
    implementation: options.implementation,
    adapterPath: options.adapter,
    clock,
  });
  process.stdout.write(JSON.stringify(response) + "\n");
}

module.exports = {
  CORRESPONDENCE_COMPLETE_STATUS,
  canonical,
  digest,
  runWorker,
  validateRequest,
};

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

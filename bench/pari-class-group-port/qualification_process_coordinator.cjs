"use strict";

// Field-neutral, process-isolated acquisition for Phase-6 matched measurements.
// It does not select/open fields, approve a host, acquire the global timing
// lock, or promote a receipt to qualified evidence.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const core = require("./qualification_execution_core.cjs");
const sealed = require("./run_class_unit_qualification.cjs");
const worker = require("./qualification_arm_worker.cjs");

const CAMPAIGN_SCHEMA = "sagejs.pari-class-group/process-isolated-campaign-v1";
const JOURNAL_SCHEMA = "sagejs.pari-class-group/process-isolated-journal-v1";
const WORKER_PATH = path.join(__dirname, "qualification_arm_worker.cjs");
const ADDRESS_SPACE_BYTES = 4 * 1024 * 1024 * 1024;
const ARM_TIMEOUT_SECONDS = 600;
const MAX_CAPTURE_BYTES = 1024 * 1024;

function now() { return new Date().toISOString(); }

function appendJournal(filename, event) {
  const fd = fs.openSync(filename, "a", 0o600);
  try {
    fs.writeSync(fd, `${JSON.stringify(event)}\n`, null, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function createJournal(filename, declaration) {
  const fd = fs.openSync(filename, "wx", 0o600);
  try {
    fs.writeSync(fd, `${JSON.stringify({ schema: JOURNAL_SCHEMA, kind: "declaration",
      at: now(), ...declaration })}\n`, null, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function boundedAppend(state, chunk) {
  if (state.truncated) return;
  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  const remaining = MAX_CAPTURE_BYTES - state.bytes;
  if (remaining <= 0) { state.truncated = true; return; }
  state.parts.push(bytes.subarray(0, remaining));
  state.bytes += Math.min(bytes.length, remaining);
  if (bytes.length > remaining) state.truncated = true;
}

function finishCapture(state) {
  return { text: Buffer.concat(state.parts).toString("utf8"), truncated: state.truncated };
}

function validateWorkerResources(value) {
  assert(value && typeof value === "object" && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), ["involuntaryContextSwitches", "maxRssKiB",
    "systemCpuMicroseconds", "userCpuMicroseconds", "voluntaryContextSwitches"].sort());
  for (const [key, item] of Object.entries(value)) {
    assert.equal(typeof item, "string", `worker resource ${key} must be an integer string`);
    assert.match(item, /^(0|[1-9][0-9]*)$/, `worker resource ${key} is not canonical`);
  }
  assert(BigInt(value.maxRssKiB) > 0n, "worker peak RSS must be positive");
  return value;
}

function spawnArguments({ nodePath, workerPath }) {
  return [`--as=${ADDRESS_SPACE_BYTES}`, `--cpu=${ARM_TIMEOUT_SECONDS}`, "--",
    nodePath, workerPath];
}

async function runIsolatedWorker(request, {
  timeoutMilliseconds = ARM_TIMEOUT_SECONDS * 1000,
  nodePath = process.execPath,
  workerPath = WORKER_PATH,
  spawnProcess = spawn,
} = {}) {
  assert(Number.isSafeInteger(timeoutMilliseconds) && timeoutMilliseconds > 0 &&
    timeoutMilliseconds <= ARM_TIMEOUT_SECONDS * 1000,
  "worker timeout must be positive and at most 600 seconds");
  worker.validateRequest(request);
  const requestSha256 = sealed.canonicalDigest(request);
  const workerInvocationId = crypto.randomUUID();
  const started = process.hrtime.bigint();
  const stdout = { parts: [], bytes: 0, truncated: false };
  const stderr = { parts: [], bytes: 0, truncated: false };
  let timeout = false;
  return await new Promise((resolve, reject) => {
    const child = spawnProcess("/usr/bin/prlimit", spawnArguments({ nodePath, workerPath }), {
      detached: true,
      env: { ...process.env, OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1",
        MKL_NUM_THREADS: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let settled = false;
    const timer = setTimeout(() => {
      timeout = true;
      try { process.kill(-child.pid, "SIGTERM"); } catch {}
      setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 250).unref();
    }, timeoutMilliseconds);
    child.stdout.on("data", chunk => boundedAppend(stdout, chunk));
    child.stderr.on("data", chunk => boundedAppend(stderr, chunk));
    // A worker that fails before consuming its request can close stdin first.
    // Its close event below is authoritative; avoid turning that expected pipe
    // race into an unhandled coordinator exception.
    child.stdin.on("error", error => {
      if (error.code !== "EPIPE")
        boundedAppend(stderr, Buffer.from(`coordinator stdin error: ${error.message}\n`));
    });
    child.once("error", error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const elapsedNanoseconds = String(process.hrtime.bigint() - started);
      const out = finishCapture(stdout), err = finishCapture(stderr);
      const base = { workerInvocationId, pid: child.pid, code, signal, timeout, elapsedNanoseconds,
        stdoutTruncated: out.truncated, stderr: err.text, stderrTruncated: err.truncated };
      if (timeout || code !== 0 || signal !== null || out.truncated) {
        resolve({ ok: false, ...base, response: null });
        return;
      }
      try {
        const response = JSON.parse(out.text);
        assert.deepEqual(Object.keys(response).sort(), ["batch", "implementation",
          "projectionSchema", "requestNonce", "requestSha256", "schema",
          "workerResources"].sort(), "worker response has unexpected fields");
        assert.equal(response.schema, worker.RESPONSE_SCHEMA);
        assert.equal(response.requestNonce, request.requestNonce);
        assert.equal(response.requestSha256, requestSha256);
        assert.equal(response.implementation, request.descriptor.implementation);
        assert.equal(response.projectionSchema, request.descriptor.projectionSchema);
        validateWorkerResources(response.workerResources);
        resolve({ ok: true, ...base, response });
      } catch (error) {
        resolve({ ok: false, ...base, response: null,
          protocolError: error.message });
      }
    });
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

function makeRequest(descriptor, measurement) {
  return {
    schema: worker.REQUEST_SCHEMA,
    requestNonce: crypto.randomBytes(16).toString("hex"),
    action: "measure-arm",
    descriptor,
    measurement,
  };
}

function failureFromExecution(execution, context) {
  if (execution.timeout) return { completionStatus: "timeout", failureClass: 9,
    failureDetail: `${context} exceeded the 600-second arm limit` };
  if (execution.protocolError) return { completionStatus: "measurement_invalid", failureClass: 10,
    failureDetail: `${context} violated the worker protocol: ${execution.protocolError}` };
  if (execution.signal !== null) return { completionStatus: "crash", failureClass: 9,
    failureDetail: `${context} terminated by ${execution.signal}` };
  return { completionStatus: "crash", failureClass: 9,
    failureDetail: `${context} exited with status ${execution.code}` };
}

function exactSchedule(tier) {
  const schedule = core.scheduleForTier(tier);
  const expected = tier === "diagnostic" ? sealed.stageDiagnosticSchedule()
    : sealed.finalQualificationSchedule();
  assert.deepEqual(schedule, expected, "qualification schedule changed");
  return schedule;
}

function initialCommon(descriptors) {
  const schemas = new Set(Object.values(descriptors).map(value => value.projectionSchema));
  assert.equal(schemas.size, 1,
    "Sage.js and PARI adapters must declare one common semantic projection schema");
  return { projectionSchema: [...schemas][0], outputDigest: null, replayDigest: null,
    rngDigest: null, workDigest: null };
}

function compareBatch(common, batch, context) {
  for (const key of ["outputDigest", "replayDigest", "rngDigest", "workDigest"]) {
    if (common[key] === null) common[key] = batch[key];
    else assert.equal(batch[key], common[key], `${context} changed ${key}`);
  }
}

async function measure(descriptor, measurement, options) {
  return runIsolatedWorker(makeRequest(descriptor, measurement), options);
}

async function calibrate(descriptor, base, journalPath, options) {
  let repetitions = 1;
  for (let generation = 0; generation <= 30; generation += 1) {
    const request = { ...base, repetitions };
    appendJournal(journalPath, { kind: "calibration-started", at: now(),
      implementation: descriptor.implementation, generation, repetitions });
    const execution = await measure(descriptor, request, options);
    appendJournal(journalPath, { kind: execution.ok ? "calibration-completed" : "calibration-failed",
      at: now(), implementation: descriptor.implementation, generation, repetitions,
      process: { workerInvocationId: execution.workerInvocationId,
        pid: execution.pid, code: execution.code, signal: execution.signal,
        timeout: execution.timeout, elapsedNanoseconds: execution.elapsedNanoseconds,
        stderr: execution.stderr, stdoutTruncated: execution.stdoutTruncated,
        stderrTruncated: execution.stderrTruncated,
        protocolError: execution.protocolError || null,
        workerResources: execution.ok ? execution.response.workerResources : null },
      observedNanoseconds: execution.ok ? execution.response.batch.wallNanoseconds : null });
    if (!execution.ok) return { ok: false, execution,
      failure: failureFromExecution(execution, `${descriptor.implementation} calibration`) };
    if (BigInt(execution.response.batch.wallNanoseconds) >= sealed.ONE_SECOND_NS) {
      return { ok: true, repetitions, generation,
        observedNanoseconds: execution.response.batch.wallNanoseconds };
    }
    repetitions *= 2;
    assert(Number.isSafeInteger(repetitions), "calibration repetition count overflowed");
  }
  return { ok: false, execution: null, failure: { completionStatus: "measurement_invalid",
    failureClass: 10, failureDetail: `${descriptor.implementation} calibration did not reach one second` } };
}

function terminalResult(base, { blocks, calibrations, common, failure = null }) {
  return {
    schema: CAMPAIGN_SCHEMA,
    qualifiedTiming: false,
    fieldId: base.fieldId,
    boundary: base.boundary,
    tier: base.tier,
    seed: base.seed,
    limits: { addressSpaceBytes: String(ADDRESS_SPACE_BYTES), armTimeoutSeconds: ARM_TIMEOUT_SECONDS },
    calibration: calibrations,
    repetitionsByImplementation: Object.fromEntries(Object.entries(calibrations)
      .filter(([, value]) => value?.ok).map(([key, value]) => [key, value.repetitions])),
    semanticProjection: common,
    blocks,
    completionStatus: failure === null ? "complete_matched" : failure.completionStatus,
    failure,
    note: "Unqualified acquisition only; host approval, timing lock, provenance, reserve policy, and receipt promotion remain external gates.",
  };
}

async function runProcessIsolatedCampaign({ adapters, boundary, fieldId, seed, tier,
  journalPath }, options = {}) {
  assert.equal(options.timeoutMilliseconds, undefined,
    "campaign arms always use the fixed 600-second timeout");
  assert(journalPath && path.isAbsolute(journalPath), "journal path must be absolute");
  assert.equal(fs.existsSync(journalPath), false, "refusing to overwrite a journal");
  assert(typeof fieldId === "string" && fieldId.length > 0);
  assert.match(seed, /^(0|[1-9][0-9]*)$/);
  assert(["diagnostic", "flag-zero", "compact-flag-one"].includes(tier));
  for (const implementation of ["sagejs", "pari"]) {
    worker.validateDescriptor(adapters[implementation]);
    assert.equal(adapters[implementation].implementation, implementation);
  }
  const common = initialCommon(adapters);
  const base = { boundary, fieldId, seed, tier };
  const schedule = exactSchedule(tier);
  createJournal(journalPath, { fieldId, boundary, tier, seed,
    schedule, projectionSchema: common.projectionSchema,
    limits: { addressSpaceBytes: String(ADDRESS_SPACE_BYTES), armTimeoutSeconds: ARM_TIMEOUT_SECONDS } });
  const calibrations = {};
  const blocks = [];
  for (const implementation of ["sagejs", "pari"]) {
    calibrations[implementation] = await calibrate(adapters[implementation], base,
      journalPath, options);
    if (!calibrations[implementation].ok) {
      const result = terminalResult(base, { blocks, calibrations, common,
        failure: calibrations[implementation].failure });
      appendJournal(journalPath, { kind: "final", at: now(), result });
      return result;
    }
  }
  for (const [blockIndex, order] of schedule.entries()) {
    const block = { blockIndex, order, startedAt: now(), finishedAt: null, arms: [] };
    appendJournal(journalPath, { kind: "block-started", at: block.startedAt,
      blockIndex, order });
    for (const [position, label] of [...order].entries()) {
      const implementation = sealed.implementationForLabel(label);
      const repetitions = calibrations[implementation].repetitions;
      appendJournal(journalPath, { kind: "arm-started", at: now(), blockIndex,
        position, label, implementation, repetitions });
      const execution = await measure(adapters[implementation],
        { ...base, repetitions }, options);
      if (!execution.ok) {
        const failure = failureFromExecution(execution,
          `block ${blockIndex} arm ${position} ${implementation}`);
        appendJournal(journalPath, { kind: "arm-failed", at: now(), blockIndex,
          position, label, implementation, repetitions, failure,
          process: { workerInvocationId: execution.workerInvocationId,
            pid: execution.pid, code: execution.code, signal: execution.signal,
            timeout: execution.timeout, elapsedNanoseconds: execution.elapsedNanoseconds,
            stderr: execution.stderr, stdoutTruncated: execution.stdoutTruncated,
            stderrTruncated: execution.stderrTruncated,
            protocolError: execution.protocolError || null } });
        block.finishedAt = now();
        blocks.push(block);
        const result = terminalResult(base, { blocks, calibrations, common, failure });
        appendJournal(journalPath, { kind: "final", at: now(), result });
        return result;
      }
      const batch = execution.response.batch;
      let divergence = null;
      try { compareBatch(common, batch, `block ${blockIndex} ${implementation} arm ${position}`); }
      catch (error) { divergence = error; }
      if (divergence !== null) {
        const digestName = /changed (outputDigest|replayDigest|rngDigest|workDigest)/
          .exec(divergence.message)?.[1];
        const failure = digestName === "replayDigest"
          ? { completionStatus: "replay_failure", failureClass: 8,
            failureDetail: divergence.message }
          : digestName === "workDigest"
            ? { completionStatus: "work_divergence", failureClass: 1,
              failureDetail: divergence.message }
            : { completionStatus: "wrong_result",
              failureClass: digestName === "rngDigest" ? 3 : 1,
              failureDetail: divergence.message };
        appendJournal(journalPath, { kind: "arm-diverged", at: now(), blockIndex,
          position, label, implementation, repetitions, failure,
          process: { workerInvocationId: execution.workerInvocationId,
            pid: execution.pid, code: execution.code, signal: execution.signal,
            timeout: execution.timeout, elapsedNanoseconds: execution.elapsedNanoseconds,
            stderr: execution.stderr, stdoutTruncated: execution.stdoutTruncated,
            stderrTruncated: execution.stderrTruncated,
            workerResources: execution.response.workerResources },
          digests: { outputDigest: batch.outputDigest, replayDigest: batch.replayDigest,
            rngDigest: batch.rngDigest, workDigest: batch.workDigest } });
        block.finishedAt = now();
        blocks.push(block);
        const result = terminalResult(base, { blocks, calibrations, common, failure });
        appendJournal(journalPath, { kind: "final", at: now(), result });
        return result;
      }
      const { stageTiming, ...receiptArm } = batch;
      const arm = { position, label, implementation, ...receiptArm,
        exitStatus: 0, timeout: false };
      block.arms.push(arm);
      appendJournal(journalPath, { kind: "arm-completed", at: now(), blockIndex,
        position, label, implementation, repetitions,
        process: { workerInvocationId: execution.workerInvocationId,
          pid: execution.pid, code: execution.code, signal: execution.signal,
          timeout: false, elapsedNanoseconds: execution.elapsedNanoseconds,
          stderr: execution.stderr, stdoutTruncated: execution.stdoutTruncated,
          stderrTruncated: execution.stderrTruncated,
          workerResources: execution.response.workerResources }, arm, stageTiming });
    }
    block.finishedAt = now();
    blocks.push(block);
    appendJournal(journalPath, { kind: "block-completed", at: block.finishedAt,
      blockIndex, order, armCount: block.arms.length });
  }
  const result = terminalResult(base, { blocks, calibrations, common });
  appendJournal(journalPath, { kind: "final", at: now(), result });
  return result;
}

function readJournal(filename) {
  const lines = fs.readFileSync(filename, "utf8").trim().split("\n").map(JSON.parse);
  assert(lines.length >= 2, "journal is incomplete");
  assert.equal(lines[0].schema, JOURNAL_SCHEMA);
  assert.equal(lines[0].kind, "declaration");
  assert.equal(lines.at(-1).kind, "final");
  assert.equal(lines.filter(line => line.kind === "declaration").length, 1);
  assert.equal(lines.filter(line => line.kind === "final").length, 1);
  const declaration = lines[0], result = lines.at(-1).result;
  assert.equal(result.schema, CAMPAIGN_SCHEMA);
  for (const key of ["fieldId", "boundary", "tier", "seed"])
    assert.equal(result[key], declaration[key], `journal changed ${key}`);
  assert.deepEqual(result.limits, declaration.limits, "journal changed resource limits");
  assert.equal(result.semanticProjection.projectionSchema, declaration.projectionSchema,
    "journal changed the semantic projection schema");
  assert.deepEqual(declaration.schedule, exactSchedule(declaration.tier),
    "journal declaration changed the frozen schedule");

  const workerInvocationIds = [];
  const completedArms = new Map();
  const completedBlocks = new Set();
  const starts = new Set();
  for (const event of lines.slice(1, -1)) {
    if (event.kind === "calibration-completed" || event.kind === "calibration-failed") {
      assert(event.process && Number.isInteger(event.process.pid),
        "calibration terminal event is missing process identity");
      assert.match(event.process.workerInvocationId,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      workerInvocationIds.push(event.process.workerInvocationId);
    }
    if (event.kind === "block-started") {
      assert.equal(event.order, declaration.schedule[event.blockIndex]);
      assert.equal(starts.has(`block:${event.blockIndex}`), false, "duplicate block start");
      starts.add(`block:${event.blockIndex}`);
    }
    if (event.kind === "arm-started") {
      const key = `${event.blockIndex}:${event.position}`;
      assert.equal(starts.has(`block:${event.blockIndex}`), true, "arm precedes block start");
      assert.equal(starts.has(`arm:${key}`), false, "duplicate arm start");
      assert.equal(event.label, declaration.schedule[event.blockIndex][event.position]);
      assert.equal(event.implementation, sealed.implementationForLabel(event.label));
      starts.add(`arm:${key}`);
    }
    if (["arm-completed", "arm-failed", "arm-diverged"].includes(event.kind)) {
      const key = `${event.blockIndex}:${event.position}`;
      assert.equal(starts.has(`arm:${key}`), true, "arm terminal event precedes start");
      assert.equal(completedArms.has(key), false, "duplicate arm terminal event");
      completedArms.set(key, event);
      if (event.process) {
        assert(Number.isInteger(event.process.pid), "arm terminal event has no process identity");
        assert.match(event.process.workerInvocationId,
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        workerInvocationIds.push(event.process.workerInvocationId);
      }
    }
    if (event.kind === "block-completed") {
      assert.equal(starts.has(`block:${event.blockIndex}`), true);
      assert.equal(completedBlocks.has(event.blockIndex), false, "duplicate block completion");
      completedBlocks.add(event.blockIndex);
    }
  }
  assert.equal(new Set(workerInvocationIds).size, workerInvocationIds.length,
    "every calibration probe and retained arm must use a fresh child process");
  for (const block of result.blocks) {
    assert.equal(block.order, declaration.schedule[block.blockIndex]);
    for (const arm of block.arms) {
      const event = completedArms.get(`${block.blockIndex}:${arm.position}`);
      assert(event && event.kind === "arm-completed",
        "result arm lacks an authenticated completed event");
      assert.equal(sealed.canonicalDigest(arm), sealed.canonicalDigest(event.arm),
        "result arm differs from its journal event");
    }
    if (block.arms.length === block.order.length)
      assert.equal(completedBlocks.has(block.blockIndex), true,
        "complete result block lacks a completion event");
  }
  if (result.completionStatus === "complete_matched") {
    assert.equal(result.blocks.length, declaration.schedule.length);
    assert(result.blocks.every(block => block.arms.length === block.order.length));
    assert.equal(result.failure, null);
  } else {
    assert(result.failure && result.failure.completionStatus === result.completionStatus,
      "failed journal lacks its terminal failure record");
  }
  return { events: lines, result };
}

module.exports = {
  ADDRESS_SPACE_BYTES,
  ARM_TIMEOUT_SECONDS,
  CAMPAIGN_SCHEMA,
  JOURNAL_SCHEMA,
  WORKER_PATH,
  createJournal,
  exactSchedule,
  makeRequest,
  readJournal,
  runIsolatedWorker,
  runProcessIsolatedCampaign,
  validateWorkerResources,
};

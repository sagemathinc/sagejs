"use strict";

const assert = require("node:assert/strict");
const {
  ALL_STAGES,
  ExclusiveStageTimer,
  NAMED_STAGES,
  RESIDUAL_STAGE,
} = require("./h1_exclusive_stage_timing.cjs");

const SCHEMA = "sagejs.pari-class-group/unified-h1-diagnostic-stages-v1";
const STAGE_COUNTERS = Object.freeze({
  "relation-retry": Object.freeze([
    "relationAttempts", "acceptedRelations", "relationPrecisionRetries",
  ]),
  "sparse-hnf-snf-transform": Object.freeze([
    "hnfRows", "hnfColumns", "smithPivots", "transformColumns",
  ]),
  "unit-regulator": Object.freeze([
    "unitAttempts", "acceptedUnits", "regulatorEvaluations",
    "unitPrecisionRetries",
  ]),
  "honesty-generators-final": Object.freeze([
    "honestyChecks", "generatorChecks", "replayChecks", "publications",
  ]),
});
const COUNTER_STAGE = new Map();
for (const [stage, names] of Object.entries(STAGE_COUNTERS)) {
  for (const name of names) {
    assert(!COUNTER_STAGE.has(name), `diagnostic counter is assigned twice: ${name}`);
    COUNTER_STAGE.set(name, stage);
  }
}
const COUNTER_NAMES = Object.freeze([...COUNTER_STAGE.keys()]);

function exactKeys(value, keys, name) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${name} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${name} has unexpected fields`);
}

function unsigned(value, name) {
  assert.equal(typeof value, "string", `${name} must be a decimal string`);
  assert.match(value, /^(0|[1-9][0-9]{0,29})$/, `${name} is not canonical`);
  return BigInt(value);
}

function canonicalCounters(stage, counters) {
  assert(NAMED_STAGES.includes(stage), `unknown diagnostic stage: ${stage}`);
  assert(counters && typeof counters === "object" && !Array.isArray(counters));
  assert(Object.keys(counters).length > 0, `${stage} did not publish a work counter`);
  const allowed = new Set(STAGE_COUNTERS[stage]);
  const result = {};
  for (const [name, value] of Object.entries(counters)) {
    assert(allowed.has(name), `${name} cannot be charged to ${stage}`);
    result[name] = String(unsigned(String(value), `${stage}.${name}`));
  }
  return result;
}

function zeroCounterTotals() {
  return Object.fromEntries(COUNTER_NAMES.map(name => [name, "0"]));
}

function timingTotals(trace) {
  const root = unsigned(trace.rootNanoseconds, "inclusive root nanoseconds");
  assert(root > 0n, "inclusive root must be positive");
  const totals = Object.fromEntries(ALL_STAGES.map(stage => [stage, 0n]));
  let cursor = 0n;
  for (const [ordinal, segment] of trace.segments.entries()) {
    exactKeys(segment, [
      "ordinal", "stage", "startNanoseconds", "endNanoseconds",
    ], `segment ${ordinal}`);
    assert.equal(segment.ordinal, ordinal, "segment ordinals are not contiguous");
    assert(ALL_STAGES.includes(segment.stage), "segment has unknown stage");
    const start = unsigned(segment.startNanoseconds, "segment start");
    const end = unsigned(segment.endNanoseconds, "segment end");
    assert.equal(start, cursor, "segments overlap or leave a gap");
    assert(end > start, "segment must have positive duration");
    assert(end <= root, "segment exceeds inclusive root");
    totals[segment.stage] += end - start;
    cursor = end;
  }
  assert.equal(cursor, root, "segments do not cover the inclusive root");
  let claimedSum = 0n;
  for (const stage of ALL_STAGES) {
    const claimed = unsigned(
      trace.stageTotalsNanoseconds[stage], `${stage} total`,
    );
    assert.equal(claimed, totals[stage], `${stage} total changed`);
    claimedSum += claimed;
  }
  assert.equal(claimedSum, root, "stage totals do not conserve the inclusive root");
  return totals;
}

function validateDiagnosticTrace(trace) {
  exactKeys(trace, [
    "schema", "diagnosticOnly", "qualifiedTiming", "finalTimingRun",
    "implementation", "stageHooksAvailable", "rootNanoseconds", "segments",
    "stageTotalsNanoseconds", "stageRecords", "counterTotals",
  ], "diagnostic trace");
  assert.equal(trace.schema, SCHEMA);
  assert.equal(trace.diagnosticOnly, true);
  assert.equal(trace.qualifiedTiming, false);
  assert.equal(trace.finalTimingRun, false);
  assert(["sagejs", "pari"].includes(trace.implementation));
  const totals = timingTotals(trace);
  exactKeys(trace.stageTotalsNanoseconds, ALL_STAGES, "stage totals");
  exactKeys(trace.counterTotals, COUNTER_NAMES, "counter totals");

  if (!trace.stageHooksAvailable) {
    assert.equal(trace.implementation, "pari", "only the PARI adapter lacks stage hooks");
    assert.deepEqual(trace.stageRecords, [], "whole-root mode cannot claim stage records");
    for (const stage of NAMED_STAGES)
      assert.equal(totals[stage], 0n, "whole-root mode claimed named-stage time");
    assert.equal(totals[RESIDUAL_STAGE], unsigned(trace.rootNanoseconds, "root"));
    assert.deepEqual(trace.counterTotals, zeroCounterTotals());
    return trace;
  }

  assert.equal(trace.implementation, "sagejs", "exclusive stage hooks are Sage.js-only");
  assert.deepEqual(
    trace.stageRecords.map(record => record.stage),
    NAMED_STAGES,
    "unified diagnostic stages must execute once in source order",
  );
  const recomputedCounters = Object.fromEntries(COUNTER_NAMES.map(name => [name, 0n]));
  for (const [index, record] of trace.stageRecords.entries()) {
    exactKeys(record, ["stage", "invocation", "nanoseconds", "counters"], `stage record ${index}`);
    assert.equal(record.invocation, 1, "a unified stage was entered more than once");
    const stageNanoseconds = unsigned(record.nanoseconds, `${record.stage} record time`);
    assert(stageNanoseconds > 0n, `${record.stage} has no measured interval`);
    assert.equal(stageNanoseconds, totals[record.stage], `${record.stage} record/time mismatch`);
    const counters = canonicalCounters(record.stage, record.counters);
    assert.deepEqual(record.counters, counters, `${record.stage} counters are not canonical`);
    for (const [name, value] of Object.entries(counters))
      recomputedCounters[name] += BigInt(value);
  }
  for (const name of COUNTER_NAMES) {
    assert.equal(
      unsigned(trace.counterTotals[name], `${name} total`),
      recomputedCounters[name],
      `${name} counter total changed`,
    );
  }
  return trace;
}

class UnifiedH1DiagnosticRecorder {
  constructor({ implementation = "sagejs", clock = process.hrtime.bigint } = {}) {
    assert.equal(implementation, "sagejs", "exclusive diagnostic hooks are Sage.js-only");
    this.implementation = implementation;
    this.timer = new ExclusiveStageTimer(clock);
    this.started = false;
    this.finished = false;
    this.active = null;
    this.records = [];
  }

  begin() {
    assert.equal(this.started, false, "diagnostic root was already started");
    this.timer.begin();
    this.started = true;
  }

  enter(stage) {
    assert(this.started && !this.finished, "diagnostic root is not active");
    assert.equal(this.active, null, "diagnostic stages cannot nest or overlap");
    assert.equal(
      stage, NAMED_STAGES[this.records.length],
      "diagnostic stages must follow unified source order",
    );
    this.timer.switchStage(stage);
    this.active = stage;
  }

  leave(stage, counters) {
    assert.equal(this.active, stage, "cannot close a different diagnostic stage");
    const canonical = canonicalCounters(stage, counters);
    this.timer.switchStage(RESIDUAL_STAGE);
    this.records.push({ stage, invocation: 1, counters: canonical });
    this.active = null;
  }

  finish() {
    assert(this.started && !this.finished, "diagnostic root is not active");
    assert.equal(this.active, null, "cannot finish inside a diagnostic stage");
    assert.equal(this.records.length, NAMED_STAGES.length, "unified stages are incomplete");
    const timing = this.timer.finish();
    this.finished = true;
    const counterTotals = zeroCounterTotals();
    const stageRecords = this.records.map(record => {
      for (const [name, value] of Object.entries(record.counters))
        counterTotals[name] = String(BigInt(counterTotals[name]) + BigInt(value));
      return {
        ...record,
        nanoseconds: timing.stageTotalsNanoseconds[record.stage],
      };
    });
    return validateDiagnosticTrace({
      schema: SCHEMA,
      diagnosticOnly: true,
      qualifiedTiming: false,
      finalTimingRun: false,
      implementation: this.implementation,
      stageHooksAvailable: true,
      ...timing,
      stageRecords,
      counterTotals,
    });
  }
}

async function runUnifiedH1Diagnostic({ operations, clock = process.hrtime.bigint }) {
  exactKeys(operations, NAMED_STAGES, "unified diagnostic operations");
  for (const stage of NAMED_STAGES)
    assert.equal(typeof operations[stage], "function", `${stage} operation is not callable`);
  const recorder = new UnifiedH1DiagnosticRecorder({ clock });
  const outputs = {};
  recorder.begin();
  for (const stage of NAMED_STAGES) {
    recorder.enter(stage);
    const answer = await operations[stage](Object.freeze({ ...outputs }));
    exactKeys(answer, ["value", "counters"], `${stage} answer`);
    outputs[stage] = answer.value;
    recorder.leave(stage, answer.counters);
  }
  return { outputs, diagnostic: recorder.finish() };
}

async function runPariWholeRootDiagnostic({ operation, clock = process.hrtime.bigint }) {
  assert.equal(typeof operation, "function");
  const timer = new ExclusiveStageTimer(clock);
  timer.begin();
  const value = await operation();
  const timing = timer.finish();
  const diagnostic = validateDiagnosticTrace({
    schema: SCHEMA,
    diagnosticOnly: true,
    qualifiedTiming: false,
    finalTimingRun: false,
    implementation: "pari",
    stageHooksAvailable: false,
    ...timing,
    stageRecords: [],
    counterTotals: zeroCounterTotals(),
  });
  return { value, diagnostic };
}

module.exports = {
  COUNTER_NAMES,
  SCHEMA,
  STAGE_COUNTERS,
  UnifiedH1DiagnosticRecorder,
  runPariWholeRootDiagnostic,
  runUnifiedH1Diagnostic,
  validateDiagnosticTrace,
};

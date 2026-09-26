"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");

const SCHEMA_PATH = path.join(
  __dirname,
  "h1-exclusive-stage-timing-receipt.schema.json",
);
const NAMED_STAGES = Object.freeze([
  "relation-retry",
  "sparse-hnf-snf-transform",
  "unit-regulator",
  "honesty-generators-final",
]);
const RESIDUAL_STAGE = "unattributed-remainder";
const ALL_STAGES = Object.freeze([...NAMED_STAGES, RESIDUAL_STAGE]);
const STAGE_SET = new Set(ALL_STAGES);
const AGGREGATION = "median-of-positive-root-gap-pair-fractions-v1";

function unsigned(value, name, { positive = false } = {}) {
  assert.equal(typeof value, "string", `${name} must be a decimal string`);
  assert.match(value, /^(0|[1-9][0-9]{0,29})$/, `${name} is not canonical`);
  const result = BigInt(value);
  if (positive) assert(result > 0n, `${name} must be positive`);
  return result;
}

function signed(value, name) {
  assert.equal(typeof value, "string", `${name} must be a decimal string`);
  assert.match(value, /^-?(0|[1-9][0-9]{0,59})$/, `${name} is not canonical`);
  assert.notEqual(value, "-0", `${name} is not canonical`);
  return BigInt(value);
}

function implementationForLabel(label) {
  assert(["A", "B"].includes(label));
  return label === "A" ? "sagejs" : "pari";
}

function median(values) {
  assert(values.length > 0);
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function closeEnough(left, right) {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) <=
    Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right)) * 64;
}

class ExclusiveStageTimer {
  constructor(clock = process.hrtime.bigint) {
    assert.equal(typeof clock, "function");
    this.clock = clock;
    this.started = false;
    this.finished = false;
    this.rootStart = 0n;
    this.segmentStart = 0n;
    this.currentStage = RESIDUAL_STAGE;
    this.segments = [];
  }

  begin() {
    assert.equal(this.started, false, "exclusive timer was already started");
    this.rootStart = this.clock();
    assert.equal(typeof this.rootStart, "bigint");
    this.segmentStart = this.rootStart;
    this.started = true;
  }

  #closeCurrent(now) {
    assert(now >= this.segmentStart, "monotonic timer moved backwards");
    if (now === this.segmentStart) return;
    this.segments.push({
      ordinal: this.segments.length,
      stage: this.currentStage,
      startNanoseconds: String(this.segmentStart - this.rootStart),
      endNanoseconds: String(now - this.rootStart),
    });
  }

  switchStage(stage) {
    assert(this.started && !this.finished, "exclusive timer is not active");
    assert(STAGE_SET.has(stage), `unknown exclusive timing stage: ${stage}`);
    const now = this.clock();
    this.#closeCurrent(now);
    this.currentStage = stage;
    this.segmentStart = now;
  }

  finish() {
    assert(this.started && !this.finished, "exclusive timer is not active");
    const now = this.clock();
    this.#closeCurrent(now);
    this.finished = true;
    const rootNanoseconds = now - this.rootStart;
    assert(rootNanoseconds > 0n, "exclusive root timer must be positive");
    const stageTotalsNanoseconds = Object.fromEntries(
      ALL_STAGES.map(stage => [stage, "0"]),
    );
    for (const segment of this.segments) {
      const duration = BigInt(segment.endNanoseconds) - BigInt(segment.startNanoseconds);
      stageTotalsNanoseconds[segment.stage] = String(
        BigInt(stageTotalsNanoseconds[segment.stage]) + duration,
      );
    }
    return {
      rootNanoseconds: String(rootNanoseconds),
      segments: this.segments.map(segment => ({ ...segment })),
      stageTotalsNanoseconds,
    };
  }
}

function validateSchema(receipt, schemaPath = SCHEMA_PATH) {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    allowUnionTypes: true,
    validateFormats: false,
  });
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const validate = ajv.compile(schema);
  if (!validate(receipt)) {
    throw new assert.AssertionError({
      message: `h1 stage receipt schema violation: ${ajv.errorsText(validate.errors, {
        separator: "; ",
      })}`,
    });
  }
}

function validateArm(arm) {
  const root = unsigned(arm.rootNanoseconds, "root nanoseconds", { positive: true });
  let cursor = 0n;
  const totals = Object.fromEntries(ALL_STAGES.map(stage => [stage, 0n]));
  for (const [ordinal, segment] of arm.segments.entries()) {
    assert.equal(segment.ordinal, ordinal, "segment ordinals must be contiguous");
    assert(STAGE_SET.has(segment.stage), "segment has an unknown stage");
    const start = unsigned(segment.startNanoseconds, "segment start");
    const end = unsigned(segment.endNanoseconds, "segment end", { positive: true });
    assert.equal(start, cursor, "exclusive segments must be gap-free and nonoverlapping");
    assert(end > start, "exclusive segments must have positive duration");
    assert(end <= root, "exclusive segment exceeds its root");
    totals[segment.stage] += end - start;
    cursor = end;
  }
  assert.equal(cursor, root, "exclusive segments must cover the entire root");
  let total = 0n;
  for (const stage of ALL_STAGES) {
    const claimed = unsigned(
      arm.stageTotalsNanoseconds[stage],
      `${stage} total`,
    );
    assert.equal(claimed, totals[stage], `${stage} total does not match segments`);
    if (stage !== RESIDUAL_STAGE) {
      assert(claimed > 0n, `${stage} was not measured by the exclusive root`);
    }
    total += claimed;
  }
  assert.equal(total, root, "stage totals double count or omit root time");
  unsigned(arm.timerReadOverheadNanoseconds, "timer read overhead");
  assert.equal(arm.implementation, implementationForLabel(arm.label));
}

function attributionForPair(pair) {
  const sagejs = pair.arms.find(arm => arm.implementation === "sagejs");
  const pari = pair.arms.find(arm => arm.implementation === "pari");
  assert(sagejs && pari, "each pair must contain Sage.js and PARI exactly once");
  const sageRepetitions = BigInt(sagejs.repetitions);
  const pariRepetitions = BigInt(pari.repetitions);
  const denominator = sageRepetitions * pariRepetitions;
  const gap = (sageValue, pariValue) =>
    unsigned(sageValue, "Sage.js duration") * pariRepetitions -
    unsigned(pariValue, "PARI duration") * sageRepetitions;
  const stageGapNumerators = Object.fromEntries(
    ALL_STAGES.map(stage => [
      stage,
      String(gap(
        sagejs.stageTotalsNanoseconds[stage],
        pari.stageTotalsNanoseconds[stage],
      )),
    ]),
  );
  const rootGapNumerator = gap(sagejs.rootNanoseconds, pari.rootNanoseconds);
  const stageGapSum = ALL_STAGES.reduce(
    (sum, stage) => sum + BigInt(stageGapNumerators[stage]),
    0n,
  );
  assert.equal(stageGapSum, rootGapNumerator, "stage gaps do not partition root gap");
  const namedPositive = NAMED_STAGES.reduce((sum, stage) => {
    const value = BigInt(stageGapNumerators[stage]);
    return sum + (value > 0n ? value : 0n);
  }, 0n);
  const residualGap = BigInt(stageGapNumerators[RESIDUAL_STAGE]);
  const residualPositive = residualGap > 0n ? residualGap : 0n;
  const positiveBurden = namedPositive + residualPositive;
  const fraction = rootGapNumerator > 0n && positiveBurden > 0n
    ? Number(namedPositive) / Number(positiveBurden)
    : null;
  return {
    pairIndex: pair.pairIndex,
    commonDenominator: String(denominator),
    rootGapNumerator: String(rootGapNumerator),
    stageGapNumerators,
    namedPositiveGapNumerator: String(namedPositive),
    unattributedPositiveGapNumerator: String(residualPositive),
    attributedGapFraction: fraction,
  };
}

function deriveSummary(pairs) {
  const pairAttributions = pairs.map(attributionForPair);
  const fractions = pairAttributions
    .map(item => item.attributedGapFraction)
    .filter(value => value !== null);
  return {
    pairCount: pairs.length,
    pairAttributions,
    attributedGapFraction: fractions.length ? median(fractions) : null,
    aggregation: AGGREGATION,
    qualifiedForFinalTiming: false,
  };
}

function validateReceipt(receipt, { schemaPath = SCHEMA_PATH } = {}) {
  validateSchema(receipt, schemaPath);
  assert.equal(receipt.qualifiedTiming, false, "diagnostic schema cannot claim final timing");
  assert(receipt.pairs.length >= 7, "stage diagnostics require at least seven pairs");
  for (const [pairIndex, pair] of receipt.pairs.entries()) {
    assert.equal(pair.pairIndex, pairIndex);
    assert.equal(pair.order, pairIndex % 2 === 0 ? "AB" : "BA");
    assert.equal(pair.arms.length, 2);
    assert.deepEqual(pair.arms.map(arm => arm.label).join(""), pair.order);
    for (const [position, arm] of pair.arms.entries()) {
      assert.equal(arm.position, position);
      validateArm(arm);
    }
    const [first, second] = pair.arms;
    for (const key of ["resultDigest", "replayDigest", "rngDigest", "workDigest"]) {
      assert.equal(first[key], second[key], `matched ${key} changed across implementations`);
    }
  }
  const expected = deriveSummary(receipt.pairs);
  assert.equal(receipt.summary.pairCount, expected.pairCount);
  assert.equal(receipt.summary.aggregation, expected.aggregation);
  assert.equal(receipt.summary.qualifiedForFinalTiming, false);
  assert.equal(receipt.summary.pairAttributions.length, expected.pairAttributions.length);
  for (const [index, actual] of receipt.summary.pairAttributions.entries()) {
    const wanted = expected.pairAttributions[index];
    for (const key of [
      "pairIndex",
      "commonDenominator",
      "rootGapNumerator",
      "stageGapNumerators",
      "namedPositiveGapNumerator",
      "unattributedPositiveGapNumerator",
    ]) assert.deepEqual(actual[key], wanted[key], `derived attribution changed: ${key}`);
    assert(closeEnough(actual.attributedGapFraction, wanted.attributedGapFraction));
  }
  assert(closeEnough(
    receipt.summary.attributedGapFraction,
    expected.attributedGapFraction,
  ));
  return receipt;
}

module.exports = {
  AGGREGATION,
  ALL_STAGES,
  ExclusiveStageTimer,
  NAMED_STAGES,
  RESIDUAL_STAGE,
  SCHEMA_PATH,
  attributionForPair,
  deriveSummary,
  validateArm,
  validateReceipt,
  validateSchema,
};

"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
  ALL_STAGES,
  NAMED_STAGES,
  RESIDUAL_STAGE,
} = require("./h1_exclusive_stage_timing.cjs");
const { STAGE_COUNTERS } = require("./h1_unified_diagnostic_stages.cjs");

const SCHEMA = "sagejs.pari-class-group/complete-h1-matched-diagnostic-v1";
const FIELD_ID = "pari-2.17.4:x^3-20018*x+20034";
const ROOT_BOUNDARY = "prepared-nfinit-complete-class-unit-h1";
const MINIMUM_PAIRS = 7;
const DIGEST_KEYS = Object.freeze([
  "resultDigest", "replayDigest", "rngDigest", "workDigest",
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])]),
  );
  return value;
}

function digest(value) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(canonical(value))).digest("hex");
}

function exactKeys(value, keys, name) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${name} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${name} has unexpected fields`);
}

function unsigned(value, name, { positive = false } = {}) {
  assert.equal(typeof value, "string", `${name} must be a decimal string`);
  assert.match(value, /^(0|[1-9][0-9]{0,29})$/, `${name} is not canonical`);
  const result = BigInt(value);
  if (positive) assert(result > 0n, `${name} must be positive`);
  return result;
}

function stageShape(value) {
  exactKeys(value, ALL_STAGES, "stage-shaped value");
  return value;
}

function validateSegments(arm) {
  const root = unsigned(arm.rootNanoseconds, "inclusive root", { positive: true });
  const totals = Object.fromEntries(ALL_STAGES.map(stage => [stage, 0n]));
  let cursor = 0n;
  for (const [ordinal, segment] of arm.segments.entries()) {
    exactKeys(segment, [
      "ordinal", "stage", "startNanoseconds", "endNanoseconds",
    ], `segment ${ordinal}`);
    assert.equal(segment.ordinal, ordinal, "segment ordinals are not contiguous");
    assert(ALL_STAGES.includes(segment.stage), "segment has an unknown stage");
    const start = unsigned(segment.startNanoseconds, "segment start");
    const end = unsigned(segment.endNanoseconds, "segment end", { positive: true });
    assert.equal(start, cursor, "segments overlap or leave a gap");
    assert(end > start, "segment must have positive duration");
    assert(end <= root, "segment exceeds inclusive root");
    totals[segment.stage] += end - start;
    cursor = end;
  }
  assert.equal(cursor, root, "segments do not cover the inclusive root");
  stageShape(arm.stageTotalsNanoseconds);
  let total = 0n;
  for (const stage of ALL_STAGES) {
    const claimed = unsigned(arm.stageTotalsNanoseconds[stage], `${stage} total`);
    assert.equal(claimed, totals[stage], `${stage} total does not match segments`);
    total += claimed;
  }
  assert.equal(total, root, "stage totals do not conserve the inclusive root");
  return totals;
}

function validateCounters(arm, totals) {
  exactKeys(arm.stageHooks, NAMED_STAGES, "stage hooks");
  exactKeys(arm.stageCounters, NAMED_STAGES, "stage counters");
  for (const stage of NAMED_STAGES) {
    assert.equal(typeof arm.stageHooks[stage], "boolean", `${stage} hook flag is not boolean`);
    const counters = arm.stageCounters[stage];
    assert(counters && typeof counters === "object" && !Array.isArray(counters));
    if (!arm.stageHooks[stage]) {
      assert.equal(totals[stage], 0n, `${stage} has timing without a reviewed hook`);
      assert.deepEqual(counters, {}, `${stage} has counters without a reviewed hook`);
      continue;
    }
    assert.equal(arm.implementation, "sagejs", "PARI cannot claim internal stage hooks");
    assert(totals[stage] > 0n, `${stage} hook has no measured duration`);
    assert(Object.keys(counters).length > 0, `${stage} hook has no work counters`);
    const allowed = new Set(STAGE_COUNTERS[stage]);
    for (const [name, value] of Object.entries(counters)) {
      assert(allowed.has(name), `${name} cannot be charged to ${stage}`);
      unsigned(value, `${stage}.${name}`);
    }
  }
  if (arm.implementation === "pari") {
    assert(NAMED_STAGES.every(stage => arm.stageHooks[stage] === false));
    assert.equal(totals[RESIDUAL_STAGE], unsigned(arm.rootNanoseconds, "PARI root"));
  }
}

function validateArm(arm) {
  exactKeys(arm, [
    "position", "label", "implementation", "repetitions",
    "preparedInputSha256", "rootNanoseconds", "segments",
    "stageTotalsNanoseconds", "stageHooks", "stageCounters",
    ...DIGEST_KEYS, "terminalStatus",
  ], "diagnostic arm");
  assert(["sagejs", "pari"].includes(arm.implementation));
  assert.equal(arm.label, arm.implementation === "sagejs" ? "A" : "B");
  assert(Number.isInteger(arm.position) && arm.position >= 0 && arm.position <= 1);
  assert(Number.isInteger(arm.repetitions) && arm.repetitions >= 1);
  assert.match(arm.preparedInputSha256, /^[0-9a-f]{64}$/);
  for (const key of DIGEST_KEYS) assert.match(arm[key], /^[0-9a-f]{64}$/);
  assert.equal(typeof arm.terminalStatus, "string");
  assert(arm.terminalStatus.length > 0);
  const totals = validateSegments(arm);
  validateCounters(arm, totals);
  return arm;
}

function stageGap(sagejs, pari, stage) {
  return unsigned(sagejs.stageTotalsNanoseconds[stage], "Sage.js stage") *
    BigInt(pari.repetitions) -
    unsigned(pari.stageTotalsNanoseconds[stage], "PARI stage") *
    BigInt(sagejs.repetitions);
}

function attributionForPair(pair) {
  const sagejs = pair.arms.find(arm => arm.implementation === "sagejs");
  const pari = pair.arms.find(arm => arm.implementation === "pari");
  assert(sagejs && pari, "pair must contain Sage.js and PARI");
  const gaps = Object.fromEntries(
    ALL_STAGES.map(stage => [stage, String(stageGap(sagejs, pari, stage))]),
  );
  const rootGap = unsigned(sagejs.rootNanoseconds, "Sage.js root") *
    BigInt(pari.repetitions) -
    unsigned(pari.rootNanoseconds, "PARI root") * BigInt(sagejs.repetitions);
  assert.equal(
    ALL_STAGES.reduce((sum, stage) => sum + BigInt(gaps[stage]), 0n),
    rootGap,
    "stage gaps do not partition the root gap",
  );
  const namedPositive = NAMED_STAGES.reduce((sum, stage) => {
    const value = BigInt(gaps[stage]);
    return sum + (value > 0n ? value : 0n);
  }, 0n);
  const residual = BigInt(gaps[RESIDUAL_STAGE]);
  const residualPositive = residual > 0n ? residual : 0n;
  const positiveBurden = namedPositive + residualPositive;
  return {
    pairIndex: pair.pairIndex,
    commonDenominator: String(BigInt(sagejs.repetitions) * BigInt(pari.repetitions)),
    rootGapNumerator: String(rootGap),
    stageGapNumerators: gaps,
    namedPositiveGapNumerator: String(namedPositive),
    residualPositiveGapNumerator: String(residualPositive),
    attributedGapFraction: rootGap > 0n && positiveBurden > 0n
      ? Number(namedPositive) / Number(positiveBurden)
      : null,
  };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function deriveSummary(pairs) {
  const pairAttributions = pairs.map(attributionForPair);
  return {
    pairCount: pairs.length,
    pairAttributions,
    attributedGapFraction: median(pairAttributions
      .map(value => value.attributedGapFraction)
      .filter(value => value !== null)),
    qualifiedForFinalTiming: false,
  };
}

function closeEnough(left, right) {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) <=
    Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right)) * 64;
}

function validateReceipt(receipt) {
  exactKeys(receipt, [
    "schema", "diagnosticOnly", "qualifiedTiming", "finalTimingRun",
    "fieldId", "rootBoundary", "preparedInputSha256", "seed", "pairs",
    "summary",
  ], "matched diagnostic receipt");
  assert.equal(receipt.schema, SCHEMA);
  assert.equal(receipt.diagnosticOnly, true);
  assert.equal(receipt.qualifiedTiming, false);
  assert.equal(receipt.finalTimingRun, false);
  assert.equal(receipt.fieldId, FIELD_ID);
  assert.equal(receipt.rootBoundary, ROOT_BOUNDARY);
  assert.match(receipt.preparedInputSha256, /^[0-9a-f]{64}$/);
  assert.match(receipt.seed, /^(0|[1-9][0-9]*)$/);
  assert(Array.isArray(receipt.pairs) && receipt.pairs.length >= MINIMUM_PAIRS);
  let referenceDigests = null;
  let referenceTerminalStatus = null;
  for (const [pairIndex, pair] of receipt.pairs.entries()) {
    exactKeys(pair, ["pairIndex", "order", "arms"], `pair ${pairIndex}`);
    assert.equal(pair.pairIndex, pairIndex);
    assert.equal(pair.order, pairIndex % 2 === 0 ? "AB" : "BA");
    assert.equal(pair.arms.length, 2);
    assert.equal(pair.arms.map(arm => arm.label).join(""), pair.order);
    pair.arms.forEach((arm, position) => {
      validateArm(arm);
      assert.equal(arm.position, position);
      assert.equal(arm.preparedInputSha256, receipt.preparedInputSha256);
    });
    for (const key of DIGEST_KEYS) {
      assert.equal(pair.arms[0][key], pair.arms[1][key], `matched ${key} differs`);
      if (referenceDigests) assert.equal(pair.arms[0][key], referenceDigests[key],
        `${key} changed across pairs`);
    }
    referenceDigests ??= Object.fromEntries(DIGEST_KEYS.map(key => [key, pair.arms[0][key]]));
    assert.equal(pair.arms[0].terminalStatus, pair.arms[1].terminalStatus);
    referenceTerminalStatus ??= pair.arms[0].terminalStatus;
    assert.equal(pair.arms[0].terminalStatus, referenceTerminalStatus,
      "terminal status changed across pairs");
  }
  const expected = deriveSummary(receipt.pairs);
  assert.equal(receipt.summary.pairCount, expected.pairCount);
  assert.equal(receipt.summary.qualifiedForFinalTiming, false);
  assert.deepEqual(receipt.summary.pairAttributions, expected.pairAttributions);
  assert(closeEnough(receipt.summary.attributedGapFraction, expected.attributedGapFraction));
  return receipt;
}

async function runMatchedDiagnostic({
  preparedInput, seed, executeArm, pairCount = MINIMUM_PAIRS,
}) {
  assert.equal(typeof executeArm, "function");
  assert(Number.isInteger(pairCount) && pairCount >= MINIMUM_PAIRS);
  assert.match(seed, /^(0|[1-9][0-9]*)$/);
  assert.equal(preparedInput.schema, "sagejs.pari-class-group/sanitized-prepared-h1-v1");
  assert.equal(preparedInput.fieldId, FIELD_ID);
  const preparedInputSha256 = digest(preparedInput);
  const pairs = [];
  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const order = pairIndex % 2 === 0 ? ["sagejs", "pari"] : ["pari", "sagejs"];
    const arms = [];
    for (const [position, implementation] of order.entries()) {
      const raw = await executeArm({
        implementation, pairIndex, position, seed,
        preparedInput: structuredClone(preparedInput), preparedInputSha256,
      });
      arms.push(validateArm({
        position,
        label: implementation === "sagejs" ? "A" : "B",
        implementation,
        ...raw,
      }));
    }
    pairs.push({ pairIndex, order: arms.map(arm => arm.label).join(""), arms });
  }
  return validateReceipt({
    schema: SCHEMA,
    diagnosticOnly: true,
    qualifiedTiming: false,
    finalTimingRun: false,
    fieldId: FIELD_ID,
    rootBoundary: ROOT_BOUNDARY,
    preparedInputSha256,
    seed,
    pairs,
    summary: deriveSummary(pairs),
  });
}

module.exports = {
  FIELD_ID,
  MINIMUM_PAIRS,
  ROOT_BOUNDARY,
  SCHEMA,
  attributionForPair,
  deriveSummary,
  digest,
  runMatchedDiagnostic,
  validateArm,
  validateReceipt,
};

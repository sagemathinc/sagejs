"use strict";

// Host-side owner/retry orchestration for the authentic totally-real cubic H1
// suffix.  All arithmetic leaves remain ordinary source-transparent Python.
// This wrapper deliberately knows neither a successful precision nor a retry
// count: every continuation follows the status of an attempt that actually
// ran and pari_live_retry_transition.

const crypto = require("node:crypto");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const HERE = __dirname;
const PRECI = 3n;
const LARGE = 2n;
const OUTPUT_SENTINEL = 0x5a5a5a5an;
const TRANSLATED_RESOURCE_CEILING = 4096n;

function integerArray(name, value, length) {
  if (!Array.isArray(value) || value.length !== length)
    throw new TypeError(`${name} must contain exactly ${length} integers`);
  return value.map((entry) => BigInt(entry));
}

function exactDigest(exact) {
  const hash = crypto.createHash("sha256");
  for (const [name, owner] of Object.entries(exact)) {
    hash.update(name);
    hash.update("\0");
    for (const entry of owner) {
      hash.update(entry.toString());
      hash.update("\0");
    }
  }
  return hash.digest("hex");
}

const zeros = (length) => Array(length).fill(0n);
const values = (buffer) => buffer.toArray ? buffer.toArray() : Array.from(buffer);
const I = (fn, length, data = zeros(length)) =>
  fn.createIntegerBuffer(length, 32768, data);
const S = (fn, length, data = zeros(length)) => fn.createInt64Buffer(data);
const F = (fn, length) => fn.createFloat64Buffer(Array(length).fill(0));

function cubicNorm(unit, tensor) {
  const multiplication = Array(9).fill(0n);
  for (let i = 0; i < 9; i += 1)
    for (let j = 0; j < 3; j += 1)
      multiplication[i] += unit[j] * tensor[9 * j + i];
  return multiplication[0] *
      (multiplication[4] * multiplication[8] - multiplication[7] * multiplication[5]) -
    multiplication[3] *
      (multiplication[1] * multiplication[8] - multiplication[7] * multiplication[2]) +
    multiplication[6] *
      (multiplication[1] * multiplication[5] - multiplication[4] * multiplication[2]);
}

function embeddingArguments(fn, exact, precision) {
  return [
    I(fn, 3, exact.residentM),
    I(fn, 3, exact.residentP),
    I(fn, 3, exact.residentE),
    precision,
    I(fn, 6), I(fn, 6), I(fn, 6),
    I(fn, 9), I(fn, 9), I(fn, 9), S(fn, 4),
  ];
}

function sunitArguments(fn, exact, matrix, precision, coefficientWords) {
  const output = I(fn, 42);
  const phases = I(fn, 6);
  const state = S(fn, 5);
  return {
    output,
    phases,
    state,
    arguments: [
      I(fn, 9, matrix[0]), I(fn, 9, matrix[1]), I(fn, 9, matrix[2]),
      I(fn, 3 * 73, exact.principalGenerators),
      I(fn, 2 * 73, exact.retainedTransform), 73n, precision,
      I(fn, 21 * 73), I(fn, 42), I(fn, 42), I(fn, 42), output,
      I(fn, 6), phases, I(fn, 3), I(fn, 3),
      I(fn, coefficientWords), I(fn, coefficientWords),
      I(fn, coefficientWords), I(fn, coefficientWords), I(fn, 128),
      S(fn, 4), state,
    ],
  };
}

function unitArguments(
  fn, exact, rebuiltLogs, rebuiltPhases, matrix, precision, coefficientWords,
) {
  const cleanLogs = [];
  for (let column = 0; column < 6; column += 1)
    cleanLogs.push(...rebuiltLogs.slice(7 * column + 1, 7 * column + 4));
  const embedding = [];
  // The rebuild owner is row-major; PARI's getfu solve packet is
  // column-major.  This is a layout conversion, not a numerical rebuild.
  for (let column = 0; column < 3; column += 1)
    for (let row = 0; row < 3; row += 1) {
      const i = 3 * row + column;
      embedding.push(matrix[0][i], matrix[1][i], matrix[2][i]);
    }
  const units = I(fn, 6, Array(6).fill(OUTPUT_SENTINEL));
  const logs = I(fn, 18, Array(18).fill(OUTPUT_SENTINEL));
  const outputPhases = S(fn, 6, Array(6).fill(77n));
  const outputFactor = I(fn, 4, Array(4).fill(OUTPUT_SENTINEL));
  const state = S(fn, 8);
  return {
    units,
    logs,
    outputPhases,
    outputFactor,
    state,
    arguments: [
      I(fn, 18, cleanLogs), S(fn, 6, rebuiltPhases),
      I(fn, 4, exact.factorTransform), I(fn, 27, embedding),
      I(fn, 27, exact.multiplicationBasis), precision, precision,
      I(fn, 18), I(fn, 18), I(fn, 18), S(fn, 6), I(fn, 18),
      I(fn, 27), I(fn, 18), I(fn, 18), I(fn, 6), I(fn, 9), I(fn, 3),
      I(fn, 6), I(fn, 4), units, logs, outputPhases, outputFactor,
      state, S(fn, 3), I(fn, coefficientWords), I(fn, coefficientWords),
      I(fn, coefficientWords), I(fn, coefficientWords),
      I(fn, coefficientWords), I(fn, 128),
    ],
  };
}

async function createH1PrecisionRetryDriver(options = {}) {
  const compile = options.compileKernel || compileKernel;
  const builds = await Promise.all([
    compile({ sourcePath: path.join(HERE, "cubic_embedding_precision_rebuild.py") }),
    compile({ sourcePath: path.join(HERE, "cubic_precision_rebuild.py") }),
    compile({ sourcePath: path.join(HERE, "unit_reconstruction_signed.py") }),
    compile({ sourcePath: path.join(HERE, "live_retry_control.py") }),
  ]);
  const embeddingFn = require(builds[0].modulePath)
    .pari_cubic_embedding_precision_rebuild;
  const sunitFn = require(builds[1].modulePath)
    .pari_cubic_sunit_precision_rebuild;
  const getfuFn = require(builds[2].modulePath).pari_getfu_signed_real_cubic;
  const transitionFn = require(builds[3].modulePath).pari_live_retry_transition;
  if (![embeddingFn, sunitFn, getfuFn, transitionFn]
    .every((fn) => fn.nativeAvailable && typeof fn.tagged === "function"))
    throw new Error("native H1 retry leaf unavailable");

  return function runH1PrecisionRetry(input) {
    const initialPrecision = BigInt(input.initialPrecision);
    const resourceCap = BigInt(input.resourceCap);
    if (initialPrecision < 64n || initialPrecision % 64n !== 0n)
      throw new RangeError("initial precision must be a positive 64-bit multiple");
    if (resourceCap < initialPrecision || resourceCap % 64n !== 0n)
      throw new RangeError("resource cap must be an eligible precision");
    if (initialPrecision > TRANSLATED_RESOURCE_CEILING)
      throw new RangeError("initial precision exceeds translated resource ceiling");
    const effectiveResourceCap = resourceCap < TRANSLATED_RESOURCE_CEILING
      ? resourceCap
      : TRANSLATED_RESOURCE_CEILING;
    // Conservative coefficient storage for log(2)'s slowest atanh series.
    // It is derived from the declared cap, not an observed successful run.
    const coefficientWords = Number((effectiveResourceCap + 7n) / 8n) + 1;
    const exact = {
      residentM: integerArray("resident root mantissas", input.residentRoots.m, 3),
      residentP: integerArray("resident root precisions", input.residentRoots.p, 3),
      residentE: integerArray("resident root exponents", input.residentRoots.e, 3),
      principalGenerators: integerArray(
        "principal generators", input.principalGenerators, 3 * 73,
      ),
      retainedTransform: integerArray("retained transform", input.retainedTransform, 2 * 73),
      factorTransform: integerArray("unit factor transform", input.factorTransform, 4),
      multiplicationBasis: integerArray("multiplication basis", input.multiplicationBasis, 27),
    };
    const ownerDigest = exactDigest(exact);
    const attempts = [];
    let precision = initialPrecision;

    for (;;) {
      const eargs = embeddingArguments(embeddingFn, exact, precision);
      const embeddingStatus = embeddingFn.tagged(...eargs);
      if (embeddingStatus !== 0n)
        throw new Error(`embedding rebuild failed with status ${embeddingStatus}`);
      const matrix = eargs.slice(7, 10).map(values);
      const rebuilt = sunitArguments(
        sunitFn, exact, matrix, precision, coefficientWords,
      );
      const sunitStatus = sunitFn.tagged(...rebuilt.arguments);
      if (sunitStatus !== 0n)
        throw new Error(`S-unit rebuild failed with status ${sunitStatus}`);
      const unit = unitArguments(
        getfuFn, exact, values(rebuilt.output), values(rebuilt.phases), matrix,
        precision, coefficientWords,
      );
      const status = getfuFn.tagged(...unit.arguments);
      const candidates = values(unit.arguments[18]);
      attempts.push({
        precision,
        status,
        unitState: values(unit.state),
        rebuildState: values(rebuilt.state),
        candidateNorms: [
          cubicNorm(candidates.slice(0, 3), exact.multiplicationBasis),
          cubicNorm(candidates.slice(3, 6), exact.multiplicationBasis),
        ],
      });

      // A narrowly scoped fault-injection seam verifies the invariant without
      // granting production callers mutable access to a published result.
      if (options.testAfterAttempt)
        options.testAfterAttempt({ attempt: attempts.length, exact });
      if (exactDigest(exact) !== ownerDigest)
        throw new Error("retained exact owner changed across precision retry");

      if (status === 0n) {
        return {
          status: "success",
          precision,
          attempts,
          units: values(unit.units),
          logs: values(unit.logs),
          phases: values(unit.outputPhases),
          factor: values(unit.outputFactor),
          exactOwnerDigest: ownerDigest,
        };
      }
      if (
        values(unit.units).some((entry) => entry !== OUTPUT_SENTINEL) ||
        values(unit.logs).some((entry) => entry !== OUTPUT_SENTINEL) ||
        values(unit.outputPhases).some((entry) => entry !== 77n) ||
        values(unit.outputFactor).some((entry) => entry !== OUTPUT_SENTINEL)
      )
        throw new Error("failed unit attempt modified transactional output");
      if (status === LARGE)
        return { status: "large", precision, attempts, exactOwnerDigest: ownerDigest };
      if (status !== PRECI)
        return {
          status: "failure",
          precision,
          reason: status,
          attempts,
          exactOwnerDigest: ownerDigest,
        };
      if (precision === effectiveResourceCap)
        return { status: "resource-cap", precision, attempts, exactOwnerDigest: ownerDigest };

      const retryState = S(transitionFn, 6);
      transitionFn.tagged(PRECI, precision, 0n, 0n, 0n, retryState);
      let next = values(retryState)[3];
      // The cap is a caller-declared storage boundary, not a predicted success
      // point.  Try it once when PARI's next transition crosses that boundary.
      if (next > effectiveResourceCap) next = effectiveResourceCap;
      if (next <= precision)
        throw new Error("precision retry policy did not advance");
      precision = next;
    }
  };
}

module.exports = {
  TRANSLATED_RESOURCE_CEILING,
  createH1PrecisionRetryDriver,
  exactDigest,
};

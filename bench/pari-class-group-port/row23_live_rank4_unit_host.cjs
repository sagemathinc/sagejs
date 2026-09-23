"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const CACHE_ROOT = "/scratch/sagejs-native-cache-row23-live-unit-bridge";
const COLUMNS = 9;
const DEGREE = 5;
const RANK = 4;
const LOG_WIDTH = 7;
const TRIPLE_WIDTH = 3;

function array(owner, length = owner.length) {
  return (owner.toArray ? owner.toArray() : Array.from(owner)).slice(0, length);
}

function strings(owner, length = owner.length) {
  return array(owner, length).map(String);
}

function numbers(owner, length = owner.length) {
  return array(owner, length).map(Number);
}

function digest(owner) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(strings(owner))).digest("hex");
}

function words(values, minimum = 1) {
  let result = minimum;
  for (const raw of values || []) {
    let value = BigInt(raw);
    if (value < 0n) value = -value;
    result = Math.max(result,
      Math.ceil(Math.max(1, value.toString(2).length) / 64));
  }
  return result;
}

function integer(fn, length, values, capacity = 32) {
  return fn.createIntegerBuffer(length, Math.max(capacity, words(values)),
    values === undefined ? undefined : values.map(BigInt));
}

function floats(fn, length) {
  return fn.createFloat64Buffer(length);
}

function integerReduction(fn, lattice) {
  const square = COLUMNS * COLUMNS;
  const owners = {
    original: integer(fn, RANK * COLUMNS, lattice),
    u1: integer(fn, RANK * COLUMNS),
    state: integer(fn, 5),
    basis: integer(fn, RANK * COLUMNS),
    transform: integer(fn, square),
    gram: integer(fn, square),
    mu: floats(fn, square),
    muExponents: integer(fn, square),
    r: floats(fn, square),
    rExponents: integer(fn, square),
    s: floats(fn, COLUMNS),
    sExponents: integer(fn, COLUMNS),
    approximate: floats(fn, RANK * COLUMNS),
    floatGram: floats(fn, square),
    alpha: integer(fn, COLUMNS),
    column: integer(fn, COLUMNS),
    columnExponents: integer(fn, COLUMNS),
    normalized: floats(fn, COLUMNS),
    temporary: floats(fn, COLUMNS),
    dpeFloatScratch: floats(fn, COLUMNS),
    integerScratch: integer(fn, COLUMNS),
  };
  const status = Number(fn.gmp(owners.original, BigInt(COLUMNS), owners.u1,
    owners.state, owners.basis, owners.transform, owners.gram, owners.mu,
    owners.muExponents, owners.r, owners.rExponents, owners.s,
    owners.sExponents, owners.approximate, owners.floatGram, owners.alpha,
    owners.column, owners.columnExponents, owners.normalized, owners.temporary,
    owners.dpeFloatScratch, owners.integerScratch));
  assert.equal(status, 0, "row-23 live integer lattice reduction failed");
  return { status, owners };
}

function realReduction(fn, triples) {
  const square = RANK * RANK;
  const entries = DEGREE * RANK;
  const owners = {
    triples: integer(fn, entries * TRIPLE_WIDTH, triples),
    integers: integer(fn, entries),
    u2: integer(fn, square),
    basis: integer(fn, entries),
    transform: integer(fn, square),
    gram: integer(fn, square),
    mu: floats(fn, square),
    muExponents: integer(fn, square),
    r: floats(fn, square),
    rExponents: integer(fn, square),
    s: floats(fn, RANK),
    sExponents: integer(fn, RANK),
    approximate: floats(fn, entries),
    floatGram: floats(fn, square),
    alpha: integer(fn, RANK),
    column: integer(fn, DEGREE),
    columnExponents: integer(fn, DEGREE),
    normalized: floats(fn, DEGREE),
    temporary: floats(fn, DEGREE),
    dpeFloatScratch: floats(fn, DEGREE),
    integerScratch: integer(fn, DEGREE),
    state: integer(fn, 2),
  };
  const status = Number(fn.gmp(owners.triples, BigInt(DEGREE), owners.integers,
    owners.u2, owners.basis, owners.transform, owners.gram, owners.mu,
    owners.muExponents, owners.r, owners.rExponents, owners.s,
    owners.sExponents, owners.approximate, owners.floatGram, owners.alpha,
    owners.column, owners.columnExponents, owners.normalized, owners.temporary,
    owners.dpeFloatScratch, owners.integerScratch, owners.state));
  assert.equal(status, 0, "row-23 live real lattice reduction failed");
  return { status, owners };
}

function rowMajorRealTriples(packedLogs) {
  const result = Array(DEGREE * RANK * TRIPLE_WIDTH).fill(0n);
  const source = array(packedLogs);
  for (let row = 0; row < DEGREE; row += 1) {
    for (let column = 0; column < RANK; column += 1) {
      const from = LOG_WIDTH * (column * DEGREE + row) + 1;
      const to = TRIPLE_WIDTH * (row * RANK + column);
      for (let cell = 0; cell < TRIPLE_WIDTH; cell += 1)
        result[to + cell] = source[from + cell];
    }
  }
  return result;
}

function prepareGetfu(fn, clean, factor) {
  const packed = DEGREE * RANK * LOG_WIDTH;
  const real = DEGREE * RANK * TRIPLE_WIDTH;
  const owners = {
    matep: integer(fn, packed),
    arch: integer(fn, packed),
    candidateA: integer(fn, packed),
    archReal: integer(fn, real),
    cleanReal: integer(fn, real),
  };
  const status = Number(fn.gmp(clean, factor, owners.matep, owners.arch,
    owners.candidateA, owners.archReal, owners.cleanReal));
  assert.equal(status, 0, "row-23 live getfu preparation failed");
  return { status, owners };
}

async function runLiveRank4UnitBridge(firstHnfResult, acceptanceResult) {
  assert.equal(firstHnfResult?.status, 0, "row-23 first HNF is not complete");
  assert.equal(acceptanceResult?.status, 0, "row-23 acceptance is not complete");
  assert(firstHnfResult.values?.hnf_result_c,
    "row-23 live first-HNF packed-log owner is missing");
  assert.equal(acceptanceResult.lattice?.length, RANK * COLUMNS,
    "row-23 live acceptance lattice must be 4 by 9");
  assert.equal(acceptanceResult.regulator?.length, TRIPLE_WIDTH,
    "row-23 live acceptance regulator must be one packed real");

  const sourcePath = path.join(__dirname, "row23_rank4_unit_lattice.py");
  const built = await compileKernel({ sourcePath, cacheRoot: CACHE_ROOT });
  const module = require(built.modulePath);
  const integerKernel = module.pari_unit_integer_lattice_rank_four;
  const realKernel = module.pari_unit_real_lattice_rank_four;
  const composeKernel = module.pari_unit_compose_rank_four;
  const transformKernel = module.pari_log_matrix_transform;
  const cleanKernel = module.pari_cleanarchunit_50_quintic;
  const prepareKernel = module.pari_prepare_getfu_50_quintic;
  for (const fn of [integerKernel, realKernel, composeKernel, transformKernel,
    cleanKernel, prepareKernel]) assert(fn?.nativeAvailable, "row-23 native unit kernel unavailable");

  const packedLength = DEGREE * RANK * LOG_WIDTH;
  const sourceLogs = strings(firstHnfResult.values.hnf_result_c);
  assert(sourceLogs.length >= DEGREE * COLUMNS * LOG_WIDTH,
    "row-23 live first-HNF packed-log owner is too short");
  const firstNineLogs = integer(transformKernel, DEGREE * COLUMNS * LOG_WIDTH,
    sourceLogs.slice(0, DEGREE * COLUMNS * LOG_WIDTH));

  const integerStage = integerReduction(integerKernel, acceptanceResult.lattice);
  const firstLogs = integer(transformKernel, packedLength);
  assert.equal(Number(transformKernel.gmp(firstNineLogs, integerStage.owners.u1,
    BigInt(DEGREE), BigInt(COLUMNS), BigInt(RANK), false, firstLogs)), 0,
  "row-23 live first log transform failed");

  const realStage = realReduction(realKernel, rowMajorRealTriples(firstLogs));
  const U = integer(composeKernel, RANK * COLUMNS);
  assert.equal(Number(composeKernel.gmp(integerStage.owners.u1, BigInt(COLUMNS),
    realStage.owners.u2, U)), 0, "row-23 live unit transform composition failed");

  const unitLogs = integer(transformKernel, packedLength);
  assert.equal(Number(transformKernel.gmp(firstNineLogs, U, BigInt(DEGREE),
    BigInt(COLUMNS), BigInt(RANK), false, unitLogs)), 0,
  "row-23 live final log transform failed");

  const regulator = integer(cleanKernel, TRIPLE_WIDTH, acceptanceResult.regulator);
  const clean = integer(cleanKernel, packedLength);
  const cleanState = integer(cleanKernel, 7);
  const cleanScratch = integer(cleanKernel, packedLength);
  const cleanStatus = Number(cleanKernel.gmp(unitLogs, regulator, 256n,
    integer(cleanKernel, 3), integer(cleanKernel, 1024), integer(cleanKernel, 1024),
    integer(cleanKernel, 1024), integer(cleanKernel, 1024), integer(cleanKernel, 2048),
    cleanScratch, clean, cleanState));
  assert.equal(cleanStatus, 0, "row-23 live cleanarchunit rejected the accepted regulator");

  const identityValues = Array(RANK * RANK).fill(0n);
  for (let index = 0; index < RANK; index += 1)
    identityValues[index * RANK + index] = 1n;
  const identity = integer(prepareKernel, RANK * RANK, identityValues);
  const identityPreparation = prepareGetfu(prepareKernel, clean, identity);
  const privateRealStage = realReduction(realKernel,
    rowMajorRealTriples(identityPreparation.owners.matep));
  const privateFactorValues = [];
  const privateU2 = array(privateRealStage.owners.u2);
  for (let column = 0; column < RANK; column += 1)
    for (let row = 0; row < RANK; row += 1)
      privateFactorValues.push(privateU2[RANK * row + column]);
  const factor = integer(prepareKernel, RANK * RANK, privateFactorValues);
  const finalPreparation = prepareGetfu(prepareKernel, clean, factor);

  const published = {
    U: strings(U),
    factor: strings(factor),
    candidateA: strings(finalPreparation.owners.candidateA),
    archReal: strings(finalPreparation.owners.archReal),
  };
  return {
    schema: "sagejs.pari-class-group/row23-live-rank4-unit-bridge-v1",
    status: 0,
    terminalStatus: "stopped-before-bounded-four-rhs-reconstruction",
    publishable: false,
    correspondenceComplete: false,
    boundedGetfuExecuted: false,
    candidateAKind: "packed-logarithm-matrix",
    states: {
      integer: numbers(integerStage.owners.state),
      real: numbers(realStage.owners.state),
      cleanarch: numbers(cleanState),
      privateGetfuReal: numbers(privateRealStage.owners.state),
    },
    ...published,
    hashes: Object.fromEntries(Object.entries({ U, factor,
      candidateA: finalPreparation.owners.candidateA,
      archReal: finalPreparation.owners.archReal })
      .map(([name, owner]) => [name, digest(owner)])),
    owners: {
      sourceLogs: firstHnfResult.values.hnf_result_c,
      firstNineLogs,
      acceptedLattice: integerStage.owners.original,
      acceptedRegulator: regulator,
      u1: integerStage.owners.u1,
      firstLogs,
      u2: realStage.owners.u2,
      U,
      unitLogs,
      clean,
      identity,
      identityCandidateA: identityPreparation.owners.candidateA,
      privateGetfuU2: privateRealStage.owners.u2,
      factor,
      candidateA: finalPreparation.owners.candidateA,
      archReal: finalPreparation.owners.archReal,
      cleanReal: finalPreparation.owners.cleanReal,
    },
    nextBlocker: {
      code: "missing-totally-real-exponentiation-rhs",
      stage: "bounded_getfu_reconstruction",
      missing: "source-transparent totally-real exponentiation from logarithmic candidateA to a 5x4 embedding RHS",
      reason: "bounded_getfu_reconstruction exists, but candidateA is a logarithmic packet and cannot honestly be supplied as its reconstruction RHS",
    },
    native: { sourcePath, cacheKey: built.cacheKey },
  };
}

module.exports = { CACHE_ROOT, runLiveRank4UnitBridge };

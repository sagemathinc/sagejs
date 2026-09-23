"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const resident = require("./row23_phase6_resident_kernel_host.cjs");
const hnfHost = require("./row23_first_hnf_host.cjs");

const SOURCE = path.join(__dirname, "row23_phase6_suffix_root.py");
const CACHE_ROOT = "/scratch/sagejs-native-cache-row23-phase6-suffix-root";

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

function integer(fn, length, capacity, values) {
  return fn.createIntegerBuffer(length, Math.max(capacity, words(values)),
    values === undefined ? undefined : values.map(BigInt));
}

function embedding(prepared) {
  const result = [];
  for (let column = 0; column < 5; column += 1)
    for (let row = 0; row < 5; row += 1) {
      const index = 5 * row + column;
      result.push(prepared.admission_matrix_m[index],
        prepared.admission_matrix_p[index], prepared.admission_matrix_e[index]);
    }
  return result;
}

async function compileSuffix() {
  const built = await compileKernel({ sourcePath: SOURCE, cacheRoot: CACHE_ROOT });
  const fn = require(built.modulePath).pari_row23_phase6_suffix_root;
  assert(fn?.nativeAvailable, "row-23 suffix root native module unavailable");
  return { built, fn };
}

async function runSuffix(inputPath = resident.DEFAULT_INPUT) {
  const preparedOwner = await resident.prepareResident(inputPath);
  const live = await hnfHost.runFirstHnf(preparedOwner.prepared,
    preparedOwner.factorOwner);
  assert.equal(live.status, 0, "row-23 live HNF prefix failed");
  const { built, fn } = await compileSuffix();
  const prepared = preparedOwner.prepared;
  const owners = {
    polynomial: integer(fn, 6, 16, prepared.prep_polynomial),
    multiplicationBasis: integer(fn, 125, 32, prepared.basis_table),
    analyticPrimes: integer(fn, 1230, 1, prepared.analytic_primes),
    catalogWorkspace: integer(fn, 12000, 32),
    patternOffsets: integer(fn, 1230, 2),
    patternCounts: integer(fn, 1230, 2),
    patternDegrees: integer(fn, 6150, 2),
    patternMultiplicities: integer(fn, 6150, 2),
    embeddingMatrix: integer(fn, 75, 4096, embedding(prepared)),
    workArena: integer(fn, 6144, 32),
    exactArena: integer(fn, 2574, 4096),
    outputUnits: integer(fn, 20, 4096, Array(20).fill(991)),
    outputNorms: integer(fn, 4, 4096),
    outputClassNumber: integer(fn, 1, 32),
    outputInvariants: integer(fn, 1, 32),
    rootState: fn.createInt64Buffer(24),
  };
  const started = process.hrtime.bigint();
  const status = Number(fn.gmp(
    owners.polynomial, owners.multiplicationBasis, owners.analyticPrimes, 1230n,
    BigInt(prepared.analytic_discriminant),
    BigInt(prepared.analytic_roots_of_unity), owners.catalogWorkspace,
    owners.patternOffsets, owners.patternCounts, owners.patternDegrees,
    owners.patternMultiplicities, live.values.hnf_result_h,
    live.values.hnf_result_c, owners.embeddingMatrix, owners.workArena,
    owners.exactArena, owners.outputUnits, owners.outputNorms,
    owners.outputClassNumber, owners.outputInvariants, owners.rootState));
  const elapsedNanoseconds = String(process.hrtime.bigint() - started);
  const array = owner => (owner.toArray ? owner.toArray() : Array.from(owner));
  return { status, elapsedNanoseconds,
    state: array(owners.rootState).map(Number),
    classNumber: array(owners.outputClassNumber).map(String),
    invariants: array(owners.outputInvariants).map(String),
    units: array(owners.outputUnits).map(String),
    norms: array(owners.outputNorms).map(String),
    built: { cacheKey: built.cacheKey, modulePath: built.modulePath }, owners };
}

module.exports = { CACHE_ROOT, SOURCE, compileSuffix, runSuffix };

if (require.main === module) runSuffix().then(result => {
  const { owners: _owners, ...published } = result;
  process.stdout.write(`${JSON.stringify(published)}\n`);
}).catch(error => { console.error(error.stack || error); process.exitCode = 1; });

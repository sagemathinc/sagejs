"use strict";

// Authenticated prepared-input lifecycle for the row-23 one-call root.
// Compilation, authentication, allocation, reset, projection, and replay all
// remain outside the measured native invocation.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const authentication = require("./prepared_nf_authentication.cjs");
const emitter = require("./row23_phase6_prepared_emitter.cjs");
const firstHnf = require("./row23_first_hnf_host.cjs");

const DEFAULT_INPUT =
  "/scratch/sagejs-pari-fresh-prepared-corpus-v1/" +
  "prepared-row-23-1d342f14fe9f2cac7a49e75727952a65401f8af01f7d754dd256372c2f7ee154.json";
const PREPARED_AUTHORITY_SHA256 =
  "0bb8aa6665e3cfdb5184f53cb4ded97655007da9d08e9969c052f81a3640a299";
const EXPECTED_UNITS_SHA256 =
  "2f8c5f4ce98e4ccdcfcdc9cd2fc8bbaac38949093eb4aa5484af2584be9850bc";
const CACHE_ROOT = "/scratch/sagejs-native-cache-row23-phase6-prepared-root";
const RESIDENT_CAPABILITIES = new WeakSet();
const RESULT_CAPABILITIES = new WeakSet();

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const canonicalSha256 = value => sha256(Buffer.from(JSON.stringify(value)));

function deepFreeze(value) {
  if (value && typeof value === "object" && !ArrayBuffer.isView(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function signature() {
  emitter.writePreparedSource();
  return emitter.signature(emitter.OUTPUT_SOURCE, emitter.EXPORT);
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

function view(owner, length = owner.length) {
  return (owner.toArray ? owner.toArray() : Array.from(owner))
    .slice(0, length).map(String);
}

function save(owner) {
  if (owner.sizes && owner.limbs) {
    const sizes = owner.sizes.slice(), limbs = owner.limbs.slice();
    return () => { owner.sizes.set(sizes); owner.limbs.set(limbs); };
  }
  const values = owner.slice();
  return () => owner.set(values);
}

function aggregateInputs(prepared) {
  let ball = 2;
  for (let degree = 5; degree > 1; degree -= 2)
    ball *= 2 * Math.PI / degree;
  return {
    n: 5, precision: 192, scale: 2000 / ball, track_small: 1,
    admission_real_count: 5, admission_mode: 2,
    admission_factorlimit: BigInt(prepared.admission_factorlimit),
    admission_prime_limit: BigInt(prepared.admission_prime_limit),
    nrelid: 4, track_fact: 1, jid0: 0, e0: 0, extra_count: -1,
    search_count: 31, construct_primes: 0, outer_mode: 0, outer_ru: 5,
    log_precision: 192, initial_additional: 9, initial_target: 40, hnf_k0: 4,
    analytic_prime_count: 1230,
    analytic_discriminant: BigInt(prepared.analytic_discriminant),
    analytic_roots_of_unity: BigInt(prepared.analytic_roots_of_unity),
    admission_matrix_m: prepared.admission_matrix_m,
    admission_matrix_p: prepared.admission_matrix_p,
    admission_matrix_e: prepared.admission_matrix_e,
    admission_primes: prepared.admission_primes,
    admission_products: prepared.admission_products,
    preparation_rounded_embedding: prepared.preparation_rounded_embedding,
    preparation_embedding: prepared.preparation_embedding,
    basis_table: prepared.basis_table,
    analytic_polynomial: prepared.prep_polynomial,
    analytic_primes: prepared.analytic_primes,
    suffix_embedding_matrix: embedding(prepared),
  };
}

function factorInputs(prepared) {
  const runtime = prepared.admission_primes.map(Number);
  let primeCount = runtime.findIndex(value => value > 257);
  assert.notEqual(primeCount, -1, "row-23 prime catalog lacks its 263 sentinel");
  primeCount += 1;
  return {
    factor_invzk: prepared.prep_invzk,
    factor_equation_index: BigInt(prepared.prep_index),
    factor_primes: prepared.admission_primes.slice(0, primeCount),
    factor_prime_count: primeCount,
  };
}

function lengths(prepared, factor) {
  const aggregate = firstHnf.zeroLengths();
  const primeCount = Number(factor.factor_prime_count), capacity = 5 * primeCount;
  return {
    ...aggregate,
    factor_invzk: 25, factor_primes: primeCount,
    factor_descriptor_workspace: 12000, factor_descriptor_scratch: 165,
    factor_descriptor_ranks: 5, factor_descriptor_state: 4,
    factor_index_workspace: 12600, factor_index_descriptors: 165,
    factor_index_ranks: 5, factor_index_ideals: 125,
    factor_index_norms: 5, factor_index_state: 5,
    factor_degree_scratch: 5, factor_exponent_scratch: 5,
    factor_factor_workspace: 32, factor_factor_state: 3,
    factor_pattern_offsets: primeCount, factor_pattern_counts: primeCount,
    factor_pattern_degrees: capacity, factor_pattern_multiplicities: capacity,
    factor_full_offsets: primeCount, factor_full_counts: primeCount,
    factor_full_degrees: capacity, factor_configuration: 3,
    factor_bound_norms: 6, factor_constants_logs: primeCount + 2,
    factor_sums: 2, factor_factor_logs: primeCount + 1,
    factor_complete_groups: 258, factor_selected_indices: capacity,
    factor_base_state: 8, factor_selected_descriptors: 31 * 33,
    factor_selected_ideals: 31 * 25, factor_selected_norms: 31,
    factor_group_offsets: 20, factor_group_sizes: 20,
    factor_group_complete: 20, factor_hnf_multiplication: 25,
    factor_hnf_work: 25, factor_hnf_pivots: 5,
    factor_subfactor_bad: 31, factor_subfactor_configuration: 1,
    factor_subfactor_order: 31, factor_subfactor_scratch: 31,
    factor_subfactor_stack: 3 * 31 + 3, factor_subfactor_chosen: 31,
    factor_subfactor_rejected: 31, factor_permutation: 31,
    factor_subfactor_state: 4, factor_resident_state: 12,
    admission_prime_offsets: 258, admission_prime_counts: 258,
    admission_group_tau: 31 * 25, admission_group_e: 31,
    admission_group_f: 31, admission_group_inert: 31,
    subfactor: 3, extra: 4, relation_primes: 31, ramification: 31,
    search_ideals: 31, packet_ids: 31, packet_ideals: 31 * 25,
    packet_norms: 31, packet_primes: 31, packet_generators: 31 * 5,
    packet_inert: 31, outer_state: 19, outer_minidx: 31,
    outer_present: 31, outer_live: 31, outer_perm: 31,
    outer_multiplier: 31, initial_primes: 20, initial_offsets: 20,
    initial_counts: 20, initial_complete: 20, hnf_perm: 31,
    analytic_polynomial: 6, analytic_primes: 1230,
    catalog_workspace: 12000, pattern_offsets: 1230,
    pattern_counts: 1230, pattern_degrees: 6150,
    pattern_multiplicities: 6150, suffix_embedding_matrix: 75,
    suffix_work_arena: 6144, suffix_exact_arena: 2574,
    output_units: 20, output_norms: 4, output_class_number: 1,
    output_invariants: 1, suffix_state: 24, aggregate_state: 4,
  };
}

function minimumCapacity(name) {
  if (name === "suffix_exact_arena" || name === "suffix_embedding_matrix" ||
      name === "output_units") return 4096;
  if (name === "suffix_work_arena" || name === "catalog_workspace") return 32;
  if (name.startsWith("factor_descriptor") || name.startsWith("factor_index") ||
      name === "factor_selected_descriptors") return 32;
  if (name === "factor_selected_ideals" || name === "factor_hnf_multiplication" ||
      name === "factor_hnf_work") return 16;
  if (name.startsWith("hnf_")) return 16;
  if (["relation_records", "relation_basis", "relation_hashes",
    "relation_metadata", "relation", "relation_scratch", "generators",
    "hnf_cup_arena", "hnf_cup_frames"].includes(name)) return 1;
  return 8;
}

async function preparePrepared(inputPath = DEFAULT_INPUT,
  { precompiledModulePath = process.env.SAGEJS_ROW23_PREPARED_MODULE || "" } = {}) {
  const prepared = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const authority = authentication.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, PREPARED_AUTHORITY_SHA256,
    "prepared input is outside the reviewed row-23 corridor");
  const sourcePath = emitter.writePreparedSource();
  let built, fn;
  if (precompiledModulePath) {
    fn = require(precompiledModulePath)[emitter.EXPORT];
    built = { cacheKey: path.basename(path.dirname(precompiledModulePath)),
      modulePath: precompiledModulePath, sourcePath };
  } else {
    built = await compileKernel({ sourcePath, cacheRoot: CACHE_ROOT });
    fn = require(built.modulePath)[emitter.EXPORT];
  }
  assert.equal(fn?.nativeAvailable, true,
    "row-23 prepared aggregate native module unavailable");
  const names = signature(), supplied = {
    ...aggregateInputs(prepared), ...factorInputs(prepared),
  };
  const shapes = lengths(prepared, supplied);
  let ownerBytes = 0;
  const owners = Object.fromEntries(names.map(([name, kind]) => {
    if (!kind.endsWith("Buffer")) {
      assert.notEqual(supplied[name], undefined, `missing scalar ${name}`);
      return [name, kind === "float" ? Number(supplied[name]) : BigInt(supplied[name])];
    }
    const initial = supplied[name];
    const length = initial === undefined ? shapes[name] : initial.length;
    assert.notEqual(length, undefined, `missing prepared owner shape ${name}`);
    if (kind === "Float64Buffer") {
      ownerBytes += 8 * length;
      return [name, fn.createFloat64Buffer(initial === undefined ? length :
        initial.map(Number))];
    }
    if (kind === "Int64Buffer") {
      ownerBytes += 8 * length;
      return [name, fn.createInt64Buffer(initial === undefined ? length :
        initial.map(BigInt))];
    }
    const capacity = words(initial, minimumCapacity(name));
    ownerBytes += length * (4 + 8 * capacity);
    return [name, fn.createIntegerBuffer(length, capacity,
      initial === undefined ? undefined : initial.map(BigInt))];
  }));
  assert(ownerBytes < 512 * 1024 ** 2,
    "row-23 prepared aggregate owners exceed 512 MiB");
  const reset = Object.values(owners).filter(value => typeof value === "object")
    .map(save);
  const resident = { authority, prepared: structuredClone(prepared), built, fn,
    names, owners, ownerBytes, reset, sourcePath };
  RESIDENT_CAPABILITIES.add(resident);
  return Object.freeze(resident);
}

const PREPARED_OWNER_NAMES = new Set([
  "factor_invzk", "factor_primes", "admission_matrix_m",
  "admission_matrix_p", "admission_matrix_e", "admission_primes",
  "admission_products", "preparation_rounded_embedding",
  "preparation_embedding", "basis_table", "analytic_polynomial",
  "analytic_primes", "suffix_embedding_matrix",
]);

function assertNoRetainedAnswer(resident) {
  assert(RESIDENT_CAPABILITIES.has(resident), "unbranded row-23 resident");
  for (const [name, value] of Object.entries(resident.owners)) {
    if (typeof value !== "object" || PREPARED_OWNER_NAMES.has(name)) continue;
    if (value.sizes) {
      assert(value.sizes.every(item => item === 0),
        `${name} retained an exact answer before invocation`);
      assert(value.limbs.every(item => item === 0n),
        `${name} retained exact answer limbs before invocation`);
    } else {
      assert(Array.from(value).every(item => item === 0 || item === 0n),
        `${name} retained an answer before invocation`);
    }
  }
}

function projection(resident) {
  const o = resident.owners;
  const factorState = view(o.factor_resident_state, 12);
  const baseState = view(o.factor_base_state, 8);
  const descriptorCount = Number(factorState[2]), groupCount = Number(factorState[3]);
  const factor = {
    residentState: factorState,
    baseState,
    rationalPrimes: view(o.initial_primes, groupCount),
    descriptors: view(o.factor_selected_descriptors, descriptorCount * 33),
    ideals: view(o.factor_selected_ideals, descriptorCount * 25),
    norms: view(o.factor_selected_norms, descriptorCount),
    permutation: view(o.factor_permutation, descriptorCount),
    subfactor: view(o.subfactor, Number(factorState[4])),
  };
  const units = view(o.output_units, 20);
  const result = {
    schema: "sagejs.pari-class-group/row23-phase6-prepared-result-v1",
    preparedAuthoritySha256: resident.authority.sha256,
    factor: {
      residentState: factor.residentState, baseState: factor.baseState,
      rationalPrimesSha256: canonicalSha256(factor.rationalPrimes),
      descriptorsSha256: canonicalSha256(Array.from({ length: descriptorCount },
        (_, i) => factor.descriptors.slice(i * 33, (i + 1) * 33))),
      idealsSha256: canonicalSha256(Array.from({ length: descriptorCount },
        (_, i) => factor.ideals.slice(i * 25, (i + 1) * 25))),
      normsSha256: canonicalSha256(factor.norms),
      permutationSha256: canonicalSha256(factor.permutation),
      subfactorSha256: canonicalSha256(factor.subfactor),
    },
    work: {
      aggregateState: view(o.aggregate_state, 4).map(Number),
      suffixState: view(o.suffix_state, 24).map(Number),
      relationState: view(o.relation_state, 6),
      chainState: view(o.chain_state, 4).map(Number),
      hnfState: view(o.hnf_state, 9).map(Number),
    },
    classGroup: { classNumber: view(o.output_class_number, 1)[0],
      invariantFactors: view(o.output_invariants, 1) },
    unitGroup: { rank: 4, unitsSha256: canonicalSha256(units),
      units, norms: view(o.output_norms, 4) },
  };
  return deepFreeze(result);
}

function verifyProjection(value) {
  assert.deepEqual(value.factor.residentState.slice(0, 5),
    ["0", "31", "31", "20", "3"]);
  assert(Number(value.factor.residentState[5]) > 0);
  assert(Number(value.factor.residentState[6]) > 0);
  assert.deepEqual(value.factor.residentState.slice(7),
    ["1", "3", "123", "123", "212661420005067101028135239405341"]);
  assert.deepEqual(value.factor.baseState,
    ["123", "123", "31", "20", "20", "31",
      "212661420005067101028135239405341", "1"]);
  assert.equal(value.factor.rationalPrimesSha256,
    "977f9ed93f68b3efd26729d694b31db853a02e20ab92feeb0a511a5e5da1d41e");
  assert.equal(value.factor.descriptorsSha256,
    "d215d90dec0bec0b8f51f4a6b6c6b957cdbcc0ad4c023afeceaaca3f9c148e9d");
  assert.equal(value.factor.idealsSha256,
    "ce86399398f5bb0f633d8cff1594cdcdf3983ce7a45ca2a8577bd119cda98d5f");
  assert.equal(value.factor.normsSha256,
    "fd6a585fa6608b0a2ca5342470f698c2cb5a43e722147381b0f5aa2dd576f68e");
  assert.equal(value.factor.permutationSha256,
    "874649fc521ce20bf898b9c3d201724d27547f590be1ed649b616c2b2dc6da0f");
  assert.equal(value.factor.subfactorSha256,
    "c1a9f25c1237d04f6fa73c0725e5e3cfdf9337680b549da6c08016dfad31aa3f");
  assert.deepEqual(value.work.aggregateState, [0, 0, 0, 1]);
  assert.deepEqual(value.work.relationState, ["40", "450", "0", "1", "0", "40"]);
  assert.deepEqual(value.work.chainState, [3, 0, 0, 40]);
  assert.deepEqual(value.work.hnfState, [1, 10, 30, 0, 9, 3, 0, 40, 0]);
  assert.deepEqual(value.classGroup, { classNumber: "6", invariantFactors: ["6"] });
  assert.equal(value.unitGroup.unitsSha256, EXPECTED_UNITS_SHA256);
  assert.deepEqual(value.unitGroup.norms, ["-1", "1", "1", "1"]);
  return value;
}

function runPrepared(resident) {
  assert(RESIDENT_CAPABILITIES.has(resident), "unbranded row-23 resident");
  assert.equal(authentication.authenticatePreparedNf(resident.prepared).sha256,
    PREPARED_AUTHORITY_SHA256);
  resident.reset.forEach(reset => reset());
  assertNoRetainedAnswer(resident);
  const started = process.hrtime.bigint();
  const status = Number(resident.fn.gmp(...resident.names.map(([name]) =>
    resident.owners[name])));
  const elapsedNanoseconds = String(process.hrtime.bigint() - started);
  assert.equal(status, 0, "row-23 prepared aggregate failed");
  const resultProjection = verifyProjection(projection(resident));
  const receipt = {
    schema: "sagejs.pari-class-group/row23-phase6-prepared-receipt-v1",
    elapsedNanoseconds, ownerBytes: resident.ownerBytes,
    preparedAuthoritySha256: PREPARED_AUTHORITY_SHA256,
    result: resultProjection,
    boundary: { nativeCallsInsideClock: 1, factorOwnerRuntimeInput: false,
      retainedAnswerRuntimeInput: false, allocationInsideClock: false,
      resetInsideClock: false, authenticationInsideClock: false,
      projectionInsideClock: false, replayInsideClock: false,
      filesystemInsideClock: false, serializationInsideClock: false },
  };
  Object.defineProperty(receipt, "resident", { enumerable: false,
    configurable: false, writable: false, value: resident });
  deepFreeze(receipt);
  RESULT_CAPABILITIES.add(receipt);
  return receipt;
}

function replayPreparedResult(receipt) {
  assert(RESULT_CAPABILITIES.has(receipt),
    "row-23 result lacks its same-run replay capability");
  const replayed = verifyProjection(projection(receipt.resident));
  assert.deepEqual(replayed, receipt.result,
    "row-23 live result owners changed after publication");
  return replayed;
}

function verifyPreparedReceipt(receipt) {
  replayPreparedResult(receipt);
  assert(Object.isFrozen(receipt));
  assert.equal(receipt.boundary.nativeCallsInsideClock, 1);
  assert.equal(receipt.boundary.retainedAnswerRuntimeInput, false);
  return receipt;
}

module.exports = { CACHE_ROOT, DEFAULT_INPUT, EXPECTED_UNITS_SHA256,
  PREPARED_AUTHORITY_SHA256, assertNoRetainedAnswer, preparePrepared,
  projection, replayPreparedResult, runPrepared, signature,
  verifyPreparedReceipt, verifyProjection };

if (require.main === module) preparePrepared().then(runPrepared).then(receipt =>
  process.stdout.write(`${JSON.stringify(receipt)}\n`)
).catch(error => { console.error(error.stack || error); process.exitCode = 1; });

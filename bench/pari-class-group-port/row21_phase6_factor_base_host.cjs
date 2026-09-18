"use strict";

// Host lifecycle for the first row-21 Phase-6 resident fusion cut.  Compile,
// authentication, allocation, reset and projection are outside the root clock.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const authentication = require("./prepared_nf_authentication.cjs");

const SOURCE = path.join(__dirname, "row21_phase6_factor_base_root.py");
const EXPORT = "pari_row21_phase6_factor_base_root";
const AUTHORITY =
  "63378e8424e81d0d5653d965ef18a518b78ec7f78b66f57afcc55052849ac95f";
const DEFAULT_INPUT =
  "/scratch/sagejs-pari-fresh-prepared-corpus-v1/" +
  "prepared-row-21-f33a1c37bb9f7bcafbe20a0e22b0c0434a29070843fa98e90ea3368db2302397.json";

function signature() {
  const match = fs.readFileSync(SOURCE, "utf8").match(
    new RegExp(`def ${EXPORT}\\(([\\s\\S]*?)\\n\\) -> int:`));
  assert(match);
  return match[1].trim().split("\n").map(line =>
    line.trim().replace(/,$/, "").split(": "));
}
function view(owner, length = owner.length) {
  return (owner.toArray ? owner.toArray() : Array.from(owner))
    .slice(0, length).map(String);
}
function words(values, minimum = 1) {
  let result = minimum;
  for (const raw of values || []) {
    const value = BigInt(raw), absolute = value < 0n ? -value : value;
    result = Math.max(result,
      Math.ceil(Math.max(1, absolute.toString(2).length) / 64));
  }
  return result;
}
function save(owner) {
  if (owner.sizes && owner.limbs) {
    const sizes = owner.sizes.slice(), limbs = owner.limbs.slice();
    return () => { owner.sizes.set(sizes); owner.limbs.set(limbs); };
  }
  const values = owner.slice();
  return () => owner.set(values);
}

async function prepareResident(inputPath = DEFAULT_INPUT) {
  const prepared = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  assert.equal(authentication.authenticatePreparedNf(prepared).sha256, AUTHORITY);
  const built = await compileKernel({ sourcePath: SOURCE });
  const fn = require(built.modulePath)[EXPORT];
  assert.equal(fn?.nativeAvailable, true);
  const runtime = prepared.admission_primes.map(Number);
  let primeCount = runtime.findIndex(value => value > 257);
  assert.notEqual(primeCount, -1); primeCount += 1;
  const primes = runtime.slice(0, primeCount), capacity = 5 * primeCount;
  const I = (length, wordCapacity = 8, values) => fn.createIntegerBuffer(
    length, Math.max(wordCapacity, words(values)),
    values === undefined ? undefined : values.map(BigInt));
  const F = length => fn.createFloat64Buffer(length);
  const owners = {
    polynomial: I(6, 8, prepared.prep_polynomial),
    basis_table: I(125, 16, prepared.basis_table),
    matrix_m: I(25, 16, prepared.admission_matrix_m),
    matrix_p: I(25, 4, prepared.admission_matrix_p),
    matrix_e: I(25, 16, prepared.admission_matrix_e),
    discriminant: BigInt(prepared.analytic_discriminant),
    equation_index: BigInt(prepared.prep_index),
    primes: I(primeCount, 2, primes), prime_count: BigInt(primeCount),
    descriptor_workspace: I(12000, 32), descriptor_scratch: I(165, 32),
    descriptor_ranks: I(5, 2), descriptor_state: I(4, 2),
    degree_scratch: I(5, 2), exponent_scratch: I(5, 2),
    factor_workspace: I(32, 8), factor_state: I(3, 2),
    pattern_offsets: I(primeCount, 2), pattern_counts: I(primeCount, 2),
    pattern_degrees: I(capacity, 2), pattern_multiplicities: I(capacity, 2),
    full_offsets: I(primeCount, 2), full_counts: I(primeCount, 2),
    full_degrees: I(capacity, 2), configuration: F(3), bound_norms: I(6, 2),
    constants_logs: F(primeCount + 2), sums: F(2), factor_logs: F(primeCount + 1),
    selected_primes: I(primeCount, 2), prime_offsets: I(258, 2),
    prime_counts: I(258, 2), complete_groups: I(258, 2),
    selected_indices: I(capacity, 2), base_state: I(8, 16),
    selected_descriptors: I(24 * 33, 32), selected_ideals: I(24 * 25, 16),
    selected_norms: I(24, 8), group_offsets: I(15, 2), group_sizes: I(15, 2),
    group_complete: I(15, 2), hnf_multiplication: I(25, 16),
    hnf_work: I(25, 16), hnf_pivots: I(5, 2), subfactor_bad: I(24, 2),
    subfactor_configuration: F(1), subfactor_order: I(24, 2),
    subfactor_scratch: I(24, 2), subfactor_stack: I(3 * 24 + 3, 2),
    subfactor_chosen: I(24, 2), subfactor_rejected: I(24, 2),
    permutation: I(24, 2), subfactor_state: I(4, 4),
    relation_ramification: I(24, 2), relation_state: I(6, 2),
    relation_basis: I(24 * 24, 2), relation_records: I(370 * 24, 2),
    relation_hashes: I(370, 2), relation_metadata: I(370 * 3, 2),
    relation: I(24, 2), relation_scratch: I(24, 2),
    relation_generators: I(370 * 5, 2), frontier_state: I(10, 4),
    resident_state: I(8, 4),
  };
  const names = signature();
  assert.deepEqual(names.map(([name]) => name), Object.keys(owners));
  const reset = Object.values(owners).filter(value => typeof value === "object")
    .map(save);
  return Object.freeze({ prepared, built, fn, names, owners, reset });
}

function projection(resident) {
  const { owners } = resident;
  const state = view(owners.resident_state, 8);
  assert.deepEqual(state, ["0", "24", "24", "15", "4", "100", "123", "1"]);
  const base = view(owners.base_state, 8);
  assert.deepEqual(base.slice(0, 6), ["57", "57", "24", "15", "15", "24"]);
  const groups = Number(state[3]), descriptors = Number(state[2]);
  return Object.freeze({
    schema: "sagejs.pari-class-group/row21-phase6-factor-base-projection-v1",
    residentState: Object.freeze(state), baseState: Object.freeze(base),
    rationalPrimes: Object.freeze(view(owners.selected_primes, groups)),
    groupOffsets: Object.freeze(view(owners.group_offsets, groups)),
    groupSizes: Object.freeze(view(owners.group_sizes, groups)),
    groupComplete: Object.freeze(view(owners.group_complete, groups)),
    descriptors: Object.freeze(view(owners.selected_descriptors, descriptors * 33)),
    ideals: Object.freeze(view(owners.selected_ideals, descriptors * 25)),
    norms: Object.freeze(view(owners.selected_norms, descriptors)),
    permutation: Object.freeze(view(owners.permutation, descriptors)),
    subfactorState: Object.freeze(view(owners.subfactor_state, 4)),
    frontierState: Object.freeze(view(owners.frontier_state, 10)),
    relationState: Object.freeze(view(owners.relation_state, 6)),
    initialRelationRecords: Object.freeze(view(owners.relation_records, 5 * 24)),
    initialRelationHashes: Object.freeze(view(owners.relation_hashes, 5)),
    initialRelationMetadata: Object.freeze(view(owners.relation_metadata, 5 * 3)),
    initialRelationGenerators: Object.freeze(view(owners.relation_generators, 5 * 5)),
  });
}

function runInvocation(resident) {
  resident.reset.forEach(reset => reset());
  const started = process.hrtime.bigint();
  const status = resident.fn.gmp(...resident.names.map(([name]) => resident.owners[name]));
  const stopped = process.hrtime.bigint();
  assert.equal(status, 0n);
  return Object.freeze({ kernelNanoseconds: String(stopped - started),
    projection: projection(resident), boundary: Object.freeze({
      nativeCallsInsideClock: 1, subprocessesInsideClock: false,
      filesystemInsideClock: false, serializationInsideClock: false,
      allocationInsideClock: false, resetInsideClock: false,
    }) });
}

module.exports = { AUTHORITY, DEFAULT_INPUT, EXPORT, SOURCE, prepareResident,
  projection, runInvocation };

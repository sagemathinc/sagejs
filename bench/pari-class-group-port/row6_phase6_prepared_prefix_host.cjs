"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const authentication = require("./prepared_nf_authentication.cjs");
const source = require("./row6_phase6_prepared_prefix_source.cjs");

const SOURCE = path.join(__dirname, "row6_phase6_prepared_prefix_root.generated.py");
const EXPORT = "pari_row6_phase6_prepared_prefix_root";
const DEGREE = 3, MAX_IDEALS = 2048;
const MAX_ADDITIONAL_RELATIONS = 5 + DEGREE - 1;
const MAX_RELATION_COLUMNS = MAX_IDEALS + MAX_ADDITIONAL_RELATIONS;
const CAPACITY = 10 * MAX_RELATION_COLUMNS + 50;
const PREPARED_AUTHORITY_SHA256 =
  "1620c2d7e9ab145eb7400c3dd0e5dc8c2c689ef88f250f2800dde05768b493a0";

function packed(buffer, start, end) {
  return buffer.toArray().slice(start, end).map(String);
}

function prepareWithKernel(prepared, built, fn) {
  assert.equal(authentication.authenticatePreparedNf(prepared).sha256,
    PREPARED_AUTHORITY_SHA256);
  assert.equal(fn?.nativeAvailable, true);
  const ib = (length, words = 8, values) => fn.createIntegerBuffer(
    length, words, values === undefined ? undefined : values.map(BigInt));
  const fb = (length, values) => fn.createFloat64Buffer(
    values === undefined ? length : values.map(Number));
  const p = prepared.admission_primes.length, descriptors = p * DEGREE;
  const productValues = prepared.admission_products.map(BigInt);
  const productWords = Math.max(1, ...productValues.map(value =>
    Math.ceil((value < 0n ? -value : value).toString(2).length / 64)));
  const factor = {
    polynomial: ib(4, 4, prepared.prep_polynomial),
    discriminant: BigInt(prepared.analytic_discriminant),
    real_places: BigInt(prepared.admission_real_count), complex_pairs: 0n,
    precision: BigInt(prepared.precision), equation_index: BigInt(prepared.prep_index),
    roots_of_unity: BigInt(prepared.analytic_roots_of_unity),
    zkden: BigInt(prepared.prep_zkden), invzk: ib(9, 8, prepared.prep_invzk),
    zk: ib(9, 8, prepared.prep_zk), zk_degrees: ib(3, 2, prepared.prep_zk_degrees),
    basis_table: ib(27, 8, prepared.basis_table),
    embedding_m: ib(9, 8, prepared.admission_matrix_m),
    embedding_p: ib(9, 2, prepared.admission_matrix_p),
    embedding_e: ib(9, 8, prepared.admission_matrix_e),
    runtime_primes: ib(p, 1, prepared.admission_primes),
    runtime_products: ib(productValues.length, productWords, productValues),
    factor_limit: BigInt(prepared.admission_factorlimit),
    prime_limit: BigInt(prepared.admission_prime_limit),
    index_work: ib(2048, 40), degree_workspace: ib(393, 4),
    factor_degrees: ib(3, 2), factor_exponents: ib(3, 2),
    group_degrees: ib(3, 2), group_counts: ib(3, 2), local_state: ib(3, 2),
    pattern_offsets: ib(p, 2), pattern_counts: ib(p, 2),
    pattern_degrees: ib(descriptors, 2), pattern_multiplicities: ib(descriptors, 2),
    full_offsets: ib(p, 2), full_counts: ib(p, 2), full_degrees: ib(descriptors, 2),
    degree_state: ib(4, 2), base_norms: ib(4, 2),
    base_configuration: fb(3), base_constants_logs: fb(p + 2),
    base_sums: fb(2), base_factor_logs: fb(p + 1), selected_primes: ib(p, 2),
    prime_offsets: ib(65538, 2), prime_counts: ib(65538, 2),
    complete_groups: ib(65538, 2), selected_indices: ib(descriptors, 2),
    base_state: ib(7, 256), random_state: ib(66, 1),
    kummer_factorwork: ib(16994, 8), kummer_factor: ib(4, 8),
    kummer_diagnostic: ib(3, 8), kummer_minpoly_diagnostic: ib(1, 8),
    kummer_polywork: ib(64, 8), kummer_u: ib(3, 8), kummer_t: ib(3, 8),
    kummer_rational: ib(6, 8), kummer_primitive: ib(3, 8),
    kummer_column: ib(3, 8), kummer_resultant_work: ib(12, 16),
    kummer_resultant_trace: ib(25, 16), kummer_u_output: ib(3, 8),
    kummer_tau_output: ib(9, 16), kummer_descriptor_state: ib(12, 8),
    kummer_unsorted: ib(48, 16), kummer_generators: ib(9, 8),
    kummer_residue_degrees: ib(3, 2), kummer_order: ib(3, 2),
    kummer_sort_diagnostic: ib(2, 2), kummer_decomposition_output: ib(48, 16),
    kummer_decomposition_state: ib(3, 2), catalog_primes: ib(descriptors, 2),
    catalog_e: ib(descriptors, 2), catalog_f: ib(descriptors, 2),
    catalog_inert: ib(descriptors, 2), catalog_generators: ib(descriptors * 3, 8),
    catalog_tau: ib(descriptors * 9, 16), requested_counts: ib(p, 2),
    kummer_state: ib(4, 2), packet_generator: ib(3, 8),
    packet_multiplication: ib(9, 8), packet_work: ib(9, 8),
    packet_pivots: ib(3, 2), packet_ideal: ib(9, 8),
    packet_ideals: ib(MAX_IDEALS * 9, 8), packet_norms: ib(MAX_IDEALS, 2),
    relation_primes: ib(MAX_IDEALS, 2), ramification: ib(MAX_IDEALS, 2),
    residue_degrees: ib(MAX_IDEALS, 2), inert_flags: ib(MAX_IDEALS, 2),
    selected_tau: ib(MAX_IDEALS * 9, 16), initial_primes: ib(MAX_IDEALS, 2),
    initial_offsets: ib(MAX_IDEALS, 2), initial_counts: ib(MAX_IDEALS, 2),
    initial_complete: ib(MAX_IDEALS, 2), bad_flags: ib(MAX_IDEALS, 2),
    sub_configuration: fb(1), sub_order: ib(MAX_IDEALS, 2),
    sub_scratch: ib(MAX_IDEALS, 2), sub_stack: ib(3 * MAX_IDEALS + 3, 2),
    sub_chosen: ib(MAX_IDEALS, 2), sub_rejected: ib(MAX_IDEALS, 2),
    permutation: ib(MAX_IDEALS, 2), subfactor: ib(MAX_IDEALS, 2),
    minidx: ib(MAX_IDEALS, 2), root_state: ib(14, 2),
  };
  const initial = {
    relation_state: ib(6, 2), relation_basis: ib(MAX_IDEALS * MAX_IDEALS, 1),
    relation_records: ib(CAPACITY * MAX_IDEALS, 1), relation_hashes: ib(CAPACITY, 1),
    relation_metadata: ib(CAPACITY * 3, 1), relation: ib(MAX_IDEALS, 1),
    relation_scratch: ib(MAX_IDEALS, 1), relation_generators: ib(CAPACITY * 3, 1),
    root_state: ib(12, 2),
  };
  const inputs = {};
  for (const [name] of source.signature("row6_prepared_factor_base_root.py",
    "pari_row6_prepared_factor_base_root")) inputs[`factor_${name}`] = factor[name];
  for (const [name] of source.signature("row6_prepared_initial_relations.py",
    "pari_row6_prepared_initial_relations"))
    if (Object.hasOwn(initial, name)) inputs[`initial_${name}`] = initial[name];
  return Object.freeze({ built, factor, fn, initial, inputs,
    args: Object.freeze(Object.values(inputs)) });
}

async function prepare(prepared) {
  const built = await compileKernel({ sourcePath: SOURCE });
  const fn = require(built.modulePath)[EXPORT];
  return prepareWithKernel(prepared, built, fn);
}

function run(resident) {
  const status = resident.fn.gmp(...resident.args);
  assert.equal(status, 0n);
  const projection = Object.freeze({
    factorRootState: Object.freeze(packed(resident.factor.root_state, 0, 14)),
    factorBaseDimensions: Object.freeze(packed(resident.factor.base_state, 0, 6)),
    initialRootState: Object.freeze(packed(resident.initial.root_state, 0, 12)),
    relationState: Object.freeze(packed(resident.initial.relation_state, 0, 6)),
    rng: Object.freeze(packed(resident.factor.random_state, 0, 66)),
  });
  assert.deepEqual(projection.factorRootState,
    ["1", "9196", "9196", "1130", "740", "740", "1130", "4",
      "1130", "0", "1048576", "65537", "2048", "11905"]);
  assert.deepEqual(projection.initialRootState,
    ["1", "203", "1137", "934", "4", "927", "11420", "1130",
      "740", "7", "1130", "0"]);
  assert.deepEqual(projection.relationState,
    ["203", "11420", "927", "7", "0", "1137"]);
  return Object.freeze({ status, projection });
}

module.exports = { EXPORT, PREPARED_AUTHORITY_SHA256, SOURCE,
  prepare, prepareWithKernel, run };

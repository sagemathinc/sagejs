"use strict";

// Allocation/authentication host for the one-call row-19 prepared aggregate.
// compileKernel(), module loading, owner allocation, and prepared-nf copying
// all happen in prepare(); invokeNative() is exactly one already-bound GMP call.
// Projection of live owners into ordinary JavaScript values happens separately.

const assert = require("node:assert/strict");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const authentication = require("./prepared_nf_authentication.cjs");
const collection = require("./row19_first_collection_host.cjs");
const firstHnf = require("./row19_first_hnf_host.cjs");
const terminal = require("./row19_terminal_continuation_host.cjs");
const source = require("./row19_phase6_prepared_aggregate_source.cjs");

const SOURCE = path.join(__dirname,
  "row19_phase6_prepared_aggregate_root.generated.py");
const EXPORT = "pari_row19_phase6_prepared_aggregate_root";
const PREPARED = new WeakSet();
const LIVE = new WeakMap();

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

function factorLengths(prepared) {
  const primes = prepared.admission_primes.length;
  const slots = primes * 3;
  const analytic = prepared.analytic_primes.length;
  return {
    index_workspace: 12000, index_descriptors: 225, index_ranks: 15,
    index_states: 20, degree_workspace: 393, factor_degrees: 3,
    factor_exponents: 3, group_degrees: 3, group_counts: 3, local_state: 3,
    pattern_offsets: primes, pattern_counts: primes, pattern_degrees: slots,
    pattern_multiplicities: slots, full_offsets: primes, full_counts: primes,
    full_degrees: slots, degree_state: 4, base_norms: 4,
    base_configuration: 3, base_constants_logs: primes + 2, base_sums: 2,
    base_factor_logs: primes + 1, selected_primes: primes,
    prime_offsets: 65538, prime_counts: 65538, complete_groups: 65538,
    selected_indices: slots, factor_product: 1, random_state: 66,
    kummer_factorwork: 16994, kummer_factor: 4, kummer_diagnostic: 3,
    kummer_minpoly_diagnostic: 1, kummer_polywork: 64, kummer_u: 3,
    kummer_t: 3, kummer_rational: 6, kummer_primitive: 3,
    kummer_column: 3, kummer_resultant_work: 12,
    kummer_resultant_trace: 25, kummer_u_output: 3,
    kummer_tau_output: 9, kummer_descriptor_state: 12,
    kummer_unsorted: 48, kummer_generators: 9,
    kummer_residue_degrees: 3, kummer_order: 3,
    kummer_sort_diagnostic: 2, kummer_decomposition_output: 48,
    kummer_decomposition_state: 3, catalog_primes: slots, catalog_e: slots,
    catalog_f: slots, catalog_inert: slots, catalog_generators: slots * 3,
    catalog_tau: slots * 9, requested_counts: primes, kummer_state: 4,
    packet_generator: 3, packet_multiplication: 9, packet_work: 9,
    packet_pivots: 3, packet_ideal: 9, packet_ideals: 424 * 9,
    packet_norms: 424, relation_primes: 424, ramification: 424,
    residue_degrees: 424, inert_flags: 424, selected_tau: 424 * 9,
    rational_primes: 307, rational_offsets: 307, rational_counts: 307,
    rational_complete: 307, bad_flags: 424, sub_configuration: 1,
    sub_order: 424, sub_scratch: 424, sub_stack: 3 * 424 + 3,
    sub_chosen: 424, sub_rejected: 424, permutation: 424, subfactor: 3,
    relation_state: 6, relation_basis: 424 * 424,
    relation_records: 4350 * 424, relation_hashes: 4350,
    relation_metadata: 4350 * 3, relation_scratch: 424,
    relation_generators: 4350 * 3, analytic_workspace: 393,
    analytic_factor_degrees: 3, analytic_factor_exponents: 3,
    analytic_group_degrees: 3, analytic_group_counts: 3,
    analytic_local_state: 3, analytic_offsets: analytic,
    analytic_counts: analytic, analytic_degrees: analytic * 3,
    analytic_multiplicities: analytic * 3, analytic_full_offsets: analytic,
    analytic_full_counts: analytic, analytic_full_degrees: analytic * 3,
    analytic_state: 4, root_state: 16,
  };
}

function suppliedFactor(prepared) {
  return {
    polynomial: prepared.prep_polynomial,
    discriminant: prepared.analytic_discriminant,
    real_places: prepared.admission_real_count,
    complex_pairs: (Number(prepared.n) - Number(prepared.admission_real_count)) / 2,
    precision: prepared.precision, equation_index: prepared.prep_index,
    roots_of_unity: prepared.analytic_roots_of_unity,
    zkden: prepared.prep_zkden, invzk: prepared.prep_invzk,
    zk: prepared.prep_zk, zk_degrees: prepared.prep_zk_degrees,
    basis_table: prepared.basis_table, embedding_m: prepared.admission_matrix_m,
    embedding_p: prepared.admission_matrix_p,
    embedding_e: prepared.admission_matrix_e,
    runtime_primes: prepared.admission_primes,
    runtime_products: prepared.admission_products,
    preparation_rounded_embedding: prepared.preparation_rounded_embedding,
    preparation_embedding: prepared.preparation_embedding,
    factor_limit: prepared.admission_factorlimit,
    prime_limit: prepared.admission_prime_limit,
    analytic_primes: prepared.analytic_primes,
  };
}

function allLengths(prepared) {
  const lengths = {};
  for (const [name, length] of Object.entries(factorLengths(prepared)))
    lengths[`factor_${name}`] = length;
  for (const [name, length] of Object.entries(collection.zeroLengths()))
    lengths[`collector_${name}`] = length;
  lengths.collector_packet_ids = 424;
  lengths.collector_packet_generators = 424 * 3;
  lengths.collector_outer_minidx = 424;
  lengths.collector_outer_perm = 424;
  lengths.collector_outer_state = 20;
  lengths.collector_extra = 3;
  lengths.collector_outer_present = 424;
  lengths.collector_outer_live = 424;
  lengths.collector_outer_multiplier = 424;
  lengths.hnf_original = 424 * 423;
  lengths.hnf_perm = 424;
  lengths.hnf_logs = 14 * 423;
  for (const [name, length] of Object.entries(firstHnf.hnfLengths()))
    lengths[`hnf_${name}`] = length;
  lengths.next_control = 3;
  const analytic = {
    log_discriminant: 1, coefficients: 7, table: 31, tail: 1,
    logarithms: prepared.analytic_primes.length, log_inverse_residue: 1,
    inverse_residue: 3, exp_cache: 3, pi_cache: 3, a: 64, b: 64, p: 64,
    q: 64, stack: 128, inverse_hr: 3, state: 2,
  };
  for (const [name, length] of Object.entries(analytic))
    lengths[`analytic_${name}`] = length;
  const terminalLengths = {
    ...terminal.appendSizes([9, 15, 408, 7, 6, 69, 0, 423, 0], 7),
    ...terminal.acceptanceSizes(),
  };
  lengths.terminal_new_relations = 424 * 7;
  for (const [name, length] of Object.entries(terminalLengths))
    lengths[`terminal_${name}`] = length;
  lengths.cup_cup_arena = 8 * 16 * 16 * 5;
  lengths.cup_cup_frames = 18;
  lengths.cup_cup_solve_state = 8;
  lengths.cup_cup_state = 8;
  Object.assign(lengths, {
    class_invariants_output: 9, class_class_number_output: 1,
    class_m1_output: 81, class_uir_output: 81, class_class_state_output: 12,
    kernel_workspace: 89475, kernel_kernel_output: 2580,
    kernel_presentation_output: 3870, kernel_state_output: 12,
    unit_dependency_output: 430, unit_inverse_output: 430,
    unit_multiples_output: 6, unit_state_output: 10,
    witness_coefficients_output: 3870, witness_valuations_output: 3816,
    witness_support_output: 9, witness_state_output: 10,
  });
  return lengths;
}

function initialValues(prepared) {
  const supplied = suppliedFactor(prepared);
  return Object.fromEntries(Object.entries(supplied).map(
    ([name, value]) => [`factor_${name}`, value],
  ));
}

async function prepare(preparedInput, options = {}) {
  const authority = authentication.authenticatePreparedNf(preparedInput);
  const generated = source.generate();
  assert.equal(require("node:fs").readFileSync(SOURCE, "utf8"), generated,
    "stale row19 prepared aggregate source");
  const built = await compileKernel({ sourcePath: SOURCE,
    ...(options.cacheRoot ? { cacheRoot: options.cacheRoot } : {}) });
  const fn = require(built.modulePath)[EXPORT];
  assert.equal(fn?.nativeAvailable, true);
  const signature = source.signature(path.basename(SOURCE), EXPORT);
  const lengths = allLengths(preparedInput);
  const supplied = initialValues(preparedInput);
  supplied.class_manifest = { factor_count: 424n, relation_count: 430n,
    class_dimension: 9n };
  supplied.kernel_manifest = { factor_count: 424n, first_columns: 423n,
    relation_count: 430n, kernel_rank: 6n };
  supplied.unit_manifest = { relation_count: 430n, kernel_rank: 6n,
    log_stride: 14n, degree: 3n };
  supplied.witness_manifest = { factor_count: 424n, relation_count: 430n,
    class_dimension: 9n };
  const compact = new Set([
    "factor_relation_records", "factor_relation_hashes",
    "factor_relation_metadata", "factor_relation_scratch",
    "collector_relation", "collector_relation_scratch", "hnf_cup_arena",
    "hnf_cup_frames", "cup_cup_arena", "cup_cup_frames",
  ]);
  const values = {};
  let ownerBytesUpperBound = 0;
  for (const [name, kind] of signature) {
    if (Object.hasOwn(supplied, name)) {
      const value = supplied[name];
      if (!kind.endsWith("Buffer")) {
        values[name] = kind === "float" ? Number(value) :
          kind.includes("Manifest") ? value : BigInt(value);
        continue;
      }
    }
    if (!kind.endsWith("Buffer"))
      throw new Error(`missing row19 aggregate scalar ${name}: ${kind}`);
    const input = supplied[name];
    const length = input === undefined ? lengths[name] : input.length;
    assert.notEqual(length, undefined, `missing row19 aggregate owner ${name}`);
    if (kind === "Float64Buffer") {
      ownerBytesUpperBound += 8 * length;
      values[name] = fn.createFloat64Buffer(
        input === undefined ? length : input.map(Number));
    } else if (kind === "Int64Buffer") {
      ownerBytesUpperBound += 8 * length;
      values[name] = fn.createInt64Buffer(
        input === undefined ? length : input.map(BigInt));
    } else {
      const minimumCapacity = name === "factor_factor_product" ? 64 :
        compact.has(name) ? 1 : 16;
      const capacity = words(input, minimumCapacity);
      ownerBytesUpperBound += length * (4 + 8 * capacity);
      values[name] = fn.createIntegerBuffer(length, capacity,
        input === undefined ? undefined : input.map(BigInt));
    }
  }
  assert(ownerBytesUpperBound < 4 * 1024 ** 3,
    `row19 aggregate owners exceed 4 GiB: ${ownerBytesUpperBound}`);
  const names = Object.freeze(signature.map(([name]) => name));
  const context = Object.freeze({ authoritySha256: authority.sha256, built, fn,
    names, args: Object.freeze(names.map(name => values[name])), values,
    ownerBytesUpperBound });
  PREPARED.add(context);
  return context;
}

function invokeNative(context) {
  assert(PREPARED.has(context), "unbranded row19 prepared aggregate context");
  const status = context.fn.gmp(...context.args);
  assert.equal(status, 0n);
  return context;
}

function projectNative(context) {
  assert(PREPARED.has(context), "unbranded row19 prepared aggregate result");
  const result = Object.freeze({
    schema: "sagejs.pari-class-group/row19-prepared-aggregate-result-v1",
    panelIndex: 19, fieldId: "3.1.1086061775432017340256300.107",
    preparedAuthoritySha256: context.authoritySha256,
    classNumber: String(context.values.class_class_number_output.toArray()[0]),
    invariants: Object.freeze(
      context.values.class_invariants_output.toArray().map(String)),
    factorState: Object.freeze(
      context.values.factor_root_state.toArray().map(String)),
    relationState: Object.freeze(
      context.values.factor_relation_state.toArray().map(String)),
    firstHnfState: Object.freeze(Array.from(context.values.hnf_state).map(Number)),
    terminalState: Object.freeze(
      Array.from(context.values.terminal_state).map(Number)),
    terminalAcceptanceState: Object.freeze(
      Array.from(context.values.terminal_accept_acceptance_state).map(Number)),
    classState: Object.freeze(
      Array.from(context.values.class_class_state_output).map(Number)),
    kernelState: Object.freeze(
      Array.from(context.values.kernel_state_output).map(Number)),
    unitState: Object.freeze(
      Array.from(context.values.unit_state_output).map(Number)),
    witnessState: Object.freeze(
      Array.from(context.values.witness_state_output).map(Number)),
    ownerBytesUpperBound: context.ownerBytesUpperBound,
    nativeCallsInsideTimedBoundary: 1,
    nativeArtifactLookupsInsideTimedBoundary: 0,
    subprocessesInsideTimedBoundary: 0,
    serializedOwnersInsideTimedBoundary: 0,
    correspondenceComplete: true,
    publicComplete: false,
    qualifiedTiming: false,
  });
  LIVE.set(result, context.values);
  return result;
}

function runNative(context) {
  return projectNative(invokeNative(context));
}

function liveOwners(result) {
  const values = LIVE.get(result);
  assert(values, "unbranded row19 prepared aggregate result");
  return values;
}

module.exports = { EXPORT, SOURCE, allLengths, factorLengths, liveOwners,
  invokeNative, prepare, projectNative, runNative };

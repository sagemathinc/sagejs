"use strict";

// Host lifecycle for the resident row-21 factor-base through acceptance root.
// Authentication, compilation, allocation, reset, and projection stay outside
// the single native invocation clock.

const assert = require("node:assert/strict");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const source = require("./row21_phase6_acceptance_source.cjs");
const connectedHost = require("./row21_phase6_connected_hnf_host.cjs");

function words(values, minimum = 1) {
  let result = minimum;
  for (const raw of values || []) {
    let value = BigInt(raw); if (value < 0n) value = -value;
    result = Math.max(result, Math.ceil(Math.max(1, value.toString(2).length) / 64));
  }
  return result;
}
function save(owner) {
  if (owner.sizes && owner.limbs) {
    const sizes = owner.sizes.slice(), limbs = owner.limbs.slice();
    return () => { owner.sizes.set(sizes); owner.limbs.set(limbs); };
  }
  const values = owner.slice(); return () => owner.set(values);
}
function view(owner, length = owner.length) {
  return (owner.toArray ? owner.toArray() : Array.from(owner))
    .slice(0, length).map(String);
}

async function prepareResident() {
  source.materialize();
  const connected = await connectedHost.prepareResident();
  const built = await compileKernel({ sourcePath: source.OUTPUT });
  const fn = require(built.modulePath)[source.EXPORT];
  assert.equal(fn?.nativeAvailable, true);
  const signature = require("./row21_phase6_connected_source.cjs")
    .signature(source.OUTPUT, source.EXPORT);
  const I = (length, capacity = 16, values) => fn.createIntegerBuffer(
    length, Math.max(capacity, words(values)),
    values === undefined ? undefined : values.map(BigInt));
  const L = (length, values) => fn.createInt64Buffer(
    values === undefined ? length : values.map(BigInt));
  const F = (length, values) => fn.createFloat64Buffer(
    values === undefined ? length : values.map(Number));
  const prepared = connected.prefix.prepared;
  const primes = prepared.analytic_primes.map(Number), groups = 5 * primes.length;
  const size = 4 * 9, square = 16, reconstruction = 24;
  const lengths = {
    t_workspace: 12000, t_pattern_offsets: primes.length,
    t_pattern_counts: primes.length, t_pattern_degrees: groups,
    t_pattern_multiplicities: groups, t_state: 4,
    t_log_discriminant: 1, t_coefficients: 7, t_table: 31, t_tail: 1,
    t_logarithms: primes.length, t_log_inverse_residue: 1,
    t_inverse_residue: 3, t_exp_cache: 3, t_pi_cache: 3,
    t_a: 64, t_b: 64, t_p: 64, t_q: 64, t_stack: 128, t_inverse_hr: 3,
    t_analytic_state: 2,
    t_accept_h: 0, t_accept_logs: 96, t_accept_class_number: 1,
    t_accept_zeta_factor: 3, t_accept_post_hnf_state: 3,
    t_accept_prepared: 3 * size, t_accept_selected: 9,
    t_accept_prep_state: 3, t_accept_rank_work: 3 * size,
    t_accept_rank_occupied: 4, t_accept_rank_pivots: 9,
    t_accept_rank_state: 3, t_accept_integer_input: size,
    t_accept_integer_work: size, t_accept_integer_occupied: 4,
    t_accept_integer_pivots: 9, t_accept_integer_best: 9,
    t_accept_integer_state: 10, t_accept_basis: 3 * square,
    t_accept_minor: 3 * square, t_accept_det_work: 3 * square,
    t_accept_det_result: 3, t_accept_det_pivots: 4, t_accept_det_state: 5,
    t_accept_inverse_work: 3 * square, t_accept_inverse_rhs: 3 * square,
    t_accept_inverse: 3 * square, t_accept_inverse_pivots: 4,
    t_accept_inverse_state: 3, t_accept_product: 3 * square,
    t_accept_inverse_slice: 3 * square, t_accept_multiple: 3,
    t_accept_coordinates: 3 * reconstruction, t_accept_multiple_state: 4,
    t_accept_rational_work: 3 * reconstruction, t_accept_lattice: reconstruction,
    t_accept_hnf_work: reconstruction, t_accept_hnf_column: 3,
    t_accept_hnf_output: reconstruction, t_accept_hnf_state: 15,
    t_accept_regulator: 3, t_accept_relations: reconstruction,
    t_accept_denominator: 1, t_accept_reconstruction_state: 4,
    t_accept_hnf_row_pivots: 3, t_accept_hnf_heights: 8,
    t_accept_acceptance_state: 3, terminal_state: 5,
  };
  const values = { ...connected.argumentsByName,
    t_primes: I(primes.length, 2, primes), t_prime_count: BigInt(primes.length),
    t_roots_of_unity: BigInt(prepared.analytic_roots_of_unity),
    t_accept_cache_changed: true };
  for (const { name, kind } of signature) {
    if (Object.hasOwn(values, name)) continue;
    const length = lengths[name];
    assert.notEqual(length, undefined, `missing resident owner ${name}`);
    values[name] = kind === "Float64Buffer" ? F(length) :
      kind === "Int64Buffer" ? L(length) : I(length, 32);
  }
  const reset = [...connected.reset, ...Object.entries(values)
    .filter(([name, value]) => name.startsWith("t_") || name === "terminal_state")
    .filter(([, value]) => typeof value === "object").map(([, value]) => save(value))];
  return Object.freeze({ connected, built, fn, signature, values, reset });
}

function projection(resident) {
  const v = resident.values;
  return Object.freeze({
    terminalState: Object.freeze(view(v.terminal_state, 5)),
    connectedState: Object.freeze(view(v.connected_state, 5)),
    analyticState: Object.freeze(view(v.t_analytic_state, 2)),
    postHnfState: Object.freeze(view(v.t_accept_post_hnf_state, 3)),
    multipleState: Object.freeze(view(v.t_accept_multiple_state, 4)),
    acceptanceState: Object.freeze(view(v.t_accept_acceptance_state, 3)),
    reconstructionState: Object.freeze(view(v.t_accept_reconstruction_state, 4)),
    classNumber: view(v.t_accept_class_number, 1)[0],
    regulator: Object.freeze(view(v.t_accept_regulator, 3)),
    relations: Object.freeze(view(v.t_accept_relations, 24)),
  });
}

function runInvocation(resident) {
  resident.reset.forEach(reset => reset());
  const started = process.hrtime.bigint();
  const status = resident.fn.gmp(...resident.signature.map(({ name }) => resident.values[name]));
  const stopped = process.hrtime.bigint();
  assert.equal(status, 0n);
  return Object.freeze({ kernelNanoseconds: String(stopped - started),
    projection: projection(resident), boundary: Object.freeze({
      nativeCallsInsideClock: 1, filesystemInsideClock: false,
      subprocessesInsideClock: false, serializationInsideClock: false,
      allocationInsideClock: false, resetInsideClock: false,
    }) });
}

module.exports = { prepareResident, projection, runInvocation };

"use strict";

const assert = require("node:assert/strict");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const source = require("./row21_phase6_unit_source.cjs");
const signature = require("./row21_phase6_connected_source.cjs").signature;
const acceptanceHost = require("./row21_phase6_acceptance_host.cjs");

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

const lengths = Object.freeze({
  u_u1: 24, u_integer_state: 5, u_integer_basis: 24,
  u_integer_transform: 64, u_integer_gram: 64, u_integer_mu: 64,
  u_integer_mu_exponents: 64, u_integer_r: 64, u_integer_r_exponents: 64,
  u_integer_s: 8, u_integer_s_exponents: 8, u_integer_approximate: 24,
  u_integer_float_gram: 64, u_integer_alpha: 8, u_integer_column: 8,
  u_integer_column_exponents: 8, u_integer_normalized: 8,
  u_integer_temporary: 8, u_integer_dpe_float_scratch: 8,
  u_integer_integer_scratch: 8, u_first_logs: 84, u_first_triples: 36,
  u_real_integers: 12, u_u2: 9, u_real_basis: 12, u_real_transform: 9,
  u_real_gram: 9, u_real_mu: 9, u_real_mu_exponents: 9, u_real_r: 9,
  u_real_r_exponents: 9, u_real_s: 3, u_real_s_exponents: 3,
  u_real_approximate: 12, u_real_float_gram: 9, u_real_alpha: 3,
  u_real_column: 4, u_real_column_exponents: 4, u_real_normalized: 4,
  u_real_temporary: 4, u_real_dpe_float_scratch: 4,
  u_real_integer_scratch: 4, u_real_state: 2, u_unit_transform: 24,
  u_unit_logs: 84, u_clean_pi_cache: 3, u_clean_a: 1024,
  u_clean_b: 1024, u_clean_p: 1024, u_clean_q: 1024, u_clean_stack: 2048,
  u_clean_scratch: 84, u_cleaned: 84, u_clean_state: 7, u_identity: 9,
  u_first_matep: 84, u_first_arch: 84, u_first_factored_clean: 84,
  u_first_arch_real: 36, u_first_arch_imag: 36, u_first_clean_real: 36,
  u_first_clean_imag: 36, u_getfu_triples: 36, u_getfu_real_integers: 12,
  u_getfu_u2: 9, u_getfu_real_basis: 12, u_getfu_real_transform: 9,
  u_getfu_real_gram: 9, u_getfu_real_mu: 9, u_getfu_real_mu_exponents: 9,
  u_getfu_real_r: 9, u_getfu_real_r_exponents: 9, u_getfu_real_s: 3,
  u_getfu_real_s_exponents: 3, u_getfu_real_approximate: 12,
  u_getfu_real_float_gram: 9, u_getfu_real_alpha: 3,
  u_getfu_real_column: 4, u_getfu_real_column_exponents: 4,
  u_getfu_real_normalized: 4, u_getfu_real_temporary: 4,
  u_getfu_real_dpe_float_scratch: 4, u_getfu_real_integer_scratch: 4,
  u_getfu_real_state: 2, u_factor: 9, u_final_matep: 84, u_final_arch: 84,
  u_final_factored_clean: 84, u_final_arch_real: 36, u_final_arch_imag: 36,
  u_final_clean_real: 36, u_final_clean_imag: 36, u_embedding_real: 60,
  u_embedding_imag: 60, u_getfu_exponential_real: 36,
  u_getfu_exponential_imag: 36, u_getfu_split_matrix: 75,
  u_getfu_split_rhs: 45, u_getfu_solve_work: 75, u_getfu_solve_rhs: 45,
  u_getfu_solved: 45, u_getfu_rounded: 15, u_getfu_multiplication: 25,
  u_getfu_inverse: 5, u_getfu_candidate_units: 15, u_output_units: 15,
  u_output_logs_real: 36, u_output_logs_imag: 36, u_getfu_state: 8,
  u_getfu_pivots: 5, u_getfu_exp_cache: 3, u_getfu_pi_cache: 3,
  u_getfu_a: 512, u_getfu_b: 512, u_getfu_p: 512, u_getfu_q: 512,
  u_getfu_stack: 91, u_inverse_multiplication: 25, u_output_inverses: 15,
  unit_terminal_state: 14, u_norm_matrix: 25, u_norm_work: 25,
  u_output_norms: 3, u_output_real_signs: 9,
});

async function prepareResident(inputPath) {
  source.materialize();
  const acceptance = await acceptanceHost.prepareResident(inputPath);
  const built = await compileKernel({ sourcePath: source.OUTPUT });
  const fn = require(built.modulePath)[source.EXPORT];
  assert.equal(fn?.nativeAvailable, true);
  const names = signature(source.OUTPUT, source.EXPORT);
  const I = (length, capacity = 2048, values) => fn.createIntegerBuffer(
    length, Math.max(capacity, words(values)),
    values === undefined ? undefined : values.map(BigInt));
  const values = { ...acceptance.values };
  for (const { name, kind } of names) {
    if (Object.hasOwn(values, name)) continue;
    const length = lengths[name];
    assert.notEqual(length, undefined, `missing row21 unit owner ${name}`);
    values[name] = kind === "Float64Buffer" ? fn.createFloat64Buffer(length) :
      kind === "Int64Buffer" ? fn.createInt64Buffer(length) : I(length);
  }
  const reset = [...acceptance.reset, ...Object.entries(values)
    .filter(([name, value]) => name.startsWith("u_") || name === "unit_terminal_state")
    .filter(([, value]) => typeof value === "object").map(([, value]) => save(value))];
  return Object.freeze({ acceptance, built, fn, names, values, reset });
}

function projection(resident) {
  const v = resident.values;
  return Object.freeze({
    terminalState: Object.freeze(view(v.unit_terminal_state, 14)),
    acceptanceState: Object.freeze(view(v.t_accept_acceptance_state, 3)),
    integerState: Object.freeze(view(v.u_integer_state, 5)),
    realState: Object.freeze(view(v.u_real_state, 2)),
    cleanState: Object.freeze(view(v.u_clean_state, 7)),
    getfuRealState: Object.freeze(view(v.u_getfu_real_state, 2)),
    getfuState: Object.freeze(view(v.u_getfu_state, 8)),
    integerTransform: Object.freeze(view(v.u_u1, 24)),
    realTransform: Object.freeze(view(v.u_u2, 9)),
    relationToUnit: Object.freeze(view(v.u_unit_transform, 24)),
    factor: Object.freeze(view(v.u_factor, 9)),
    units: Object.freeze(view(v.u_output_units, 15)),
    inverses: Object.freeze(view(v.u_output_inverses, 15)),
    norms: Object.freeze(view(v.u_output_norms, 3)),
    realSigns: Object.freeze(view(v.u_output_real_signs, 9)),
    logsReal: Object.freeze(view(v.u_output_logs_real, 36)),
    logsImag: Object.freeze(view(v.u_output_logs_imag, 36)),
  });
}

function runInvocation(resident) {
  resident.reset.forEach(reset => reset());
  const started = process.hrtime.bigint();
  const status = resident.fn.gmp(...resident.names.map(({ name }) => resident.values[name]));
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

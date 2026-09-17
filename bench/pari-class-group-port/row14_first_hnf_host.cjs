"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const ROWS = 799;
const DEGREE = 4;
const PLACES = 3;
const TARGET = 806;
const RESERVE = 8110;

function signature(source) {
  return fs.readFileSync(source, "utf8")
    .match(/def pari_connected_relation_hnf\(([\s\S]*?)\n\)/)[1]
    .trim().split("\n")
    .map(line => line.trim().replace(/,$/, "").split(": "));
}

function zeroLengths() {
  const n = DEGREE, rows = ROWS, columns = TARGET, k0 = 4;
  const size = rows * columns, square = columns * columns;
  const logs = 7 * PLACES * columns;
  return {
    matrix: 3*n*n, ideal: n*n, reduction: 3*n*n, vectors: 3*n*n,
    betas: 3*n, norms: 3*n, column: 3*n, float_q: (n+1)**2,
    float_v: n+1, bound: 1, cache: 3, a: 64, b: 64, p: 64, q: 64,
    stack: 128, x: n+1, y: n+1, z: n+1, inc: n+1, state: 5,
    cursor_output: n+1, element: n, counters: 4,
    admission_embedding_m: n, admission_embedding_p: n,
    admission_embedding_e: n, admission_ideal: n*n,
    admission_rational_factors: 16, admission_rational_exponents: 16,
    admission_tau: n*n, admission_x: n, admission_y: n, admission_spare: n,
    admission_stack: 32, admission_primitive: n*n, admission_columns: n*n,
    admission_values: n, admission_temporary: n, admission_indices: 128,
    admission_exponents: 128, diagnostic: 3, relation: rows,
    relation_state: 6, relation_basis: rows*rows,
    relation_records: rows*RESERVE, relation_hashes: RESERVE,
    relation_metadata: 3*RESERVE, relation_scratch: rows,
    generators: DEGREE*RESERVE, progress: 4,
    preparation_original: n*n, preparation_basis: n*n,
    preparation_transform: n*n, preparation_flags: 2,
    preparation_rank_diagnostic: 3, preparation_selection: n+1,
    preparation_stages: n, preparation_flatter_input: n*n,
    preparation_current: n*n, preparation_flatter_transform: n*n,
    preparation_total_work: n*n, preparation_step_t: n*n,
    preparation_step_s: n*n, preparation_product: n*n,
    preparation_next_basis: n*n, preparation_y: n,
    preparation_diagnostic: 7, preparation_r1: 3*n, preparation_r2: 3*n,
    preparation_r3: 3*n, preparation_t1: n, preparation_t2: n,
    preparation_t3: n, preparation_integers: n, preparation_inverse: 3*n,
    preparation_first: 3*n, preparation_second: 3*n,
    preparation_final: 3*n, preparation_rounded: n,
    preparation_mu: n*n, preparation_r: n*n, preparation_s: n,
    preparation_approximate: n*n, preparation_exponents: n,
    preparation_float_gram: n*n, preparation_gram: n*n,
    preparation_mu_exponents: n*n, preparation_r_exponents: n*n,
    preparation_s_exponents: n, preparation_alpha: n,
    preparation_column_exponents: n, preparation_float_scratch: n,
    preparation_temporary: 1, preparation_state: 1,
    schedule: 4, hnf_generator: n, hnf_matrix: n*n, hnf_work: n*n,
    hnf_pivots: n, power_ideal: n*n, power_alpha: n, power_metadata: n,
    power_primitive: n, power_temporary: n, power_diagnostic: 3,
    power_multiplication: n*n, power_work: 3*n*n+n,
    power_triangular: n*(n+1), power_moduli: n,
    product_primitive: n*n, product_matrix: 2*n*n,
    log_completed: 1, log_embeddings: RESERVE*7*PLACES,
    log_coordinates: n, log_column: 7*PLACES, log_cache: 3,
    log_pi_cache: 3, log_a: 64, log_b: 64, log_p: 64, log_q: 64,
    log_stack: 128, hnf_original: size, hnf_mat: size,
    hnf_dense: k0*columns, hnf_transform: square, hnf_vmax: columns,
    hnf_found: 1, hnf_sparse_state: 13,
    hnf_bottom: (rows-k0)*columns, hnf_updated_dense: k0*columns,
    hnf_extra: size, hnf_cleanup_state: 10, hnf_rank_matrix: size,
    hnf_occupied: columns, hnf_rank_pivots: rows, hnf_best: rows,
    hnf_profile: rows+1, hnf_rank_state: 10, hnf_perm_work: rows,
    hnf_matbnew: size, hnf_dep: size, hnf_b: size, hnf_assembly_state: 6,
    hnf_transformed_logs: logs, hnf_full_h: size,
    hnf_hnf_transform: square, hnf_lam: square, hnf_d: columns+1,
    hnf_hnf_state: 11, hnf_full_dep: size, hnf_work_b: size,
    hnf_work_c: logs, hnf_diagonal: rows, hnf_result_h: size,
    hnf_result_dep: size, hnf_result_b: rows*(columns+rows),
    hnf_result_c: logs, hnf_final_state: 7, hnf_state: 9,
    chain_state: 4, hnf_cup_arena: 2_881_440, hnf_cup_frames: 64,
    hnf_cup_solve_state: 8, hnf_cup_state: 8,
  };
}

function words(values, minimum = 1) {
  let result = minimum;
  for (const raw of values || []) {
    const value = BigInt(raw), absolute = value < 0n ? -value : value;
    result = Math.max(result, Math.ceil(Math.max(1, absolute.toString(2).length) / 64));
  }
  return result;
}

async function runFirstHnf(metadata, { hnfWords = 16, searchCount = ROWS } = {}) {
  assert.equal(metadata.schema,
    "sagejs.pari-class-group/row14-connected-factor-metadata-v1");
  const source = path.join(__dirname, "connected_relation_hnf.py");
  const names = signature(source), built = await compileKernel({ sourcePath: source });
  const fn = require(built.modulePath).pari_connected_relation_hnf;
  const lengths = zeroLengths();
  const prepared = metadata.prepared, factor = metadata.factor;
  const input = {
    n: DEGREE, precision: 192, scale: metadata.policy.scale, track_small: 1,
    admission_real_count: 2, admission_mode: 2,
    admission_factor_product: factor.factorProduct,
    admission_factorlimit: 1048576, admission_prime_limit: 65537,
    nrelid: 4, track_fact: 1, jid0: 0, e0: 0, extra_count: -1,
    search_count: searchCount, construct_primes: 0, outer_mode: 1, outer_ru: PLACES,
    log_precision: 192, initial_additional: 7, initial_target: TARGET,
    hnf_k0: metadata.policy.hnfK0,
    admission_matrix_m: prepared.admission_matrix_m,
    admission_matrix_p: prepared.admission_matrix_p,
    admission_matrix_e: prepared.admission_matrix_e,
    admission_primes: prepared.admission_primes,
    admission_products: prepared.admission_products,
    preparation_rounded_embedding: prepared.preparation_rounded_embedding,
    preparation_embedding: prepared.preparation_embedding,
    admission_prime_offsets: Array(metadata.policy.C2 + 1).fill("-1"),
    admission_prime_counts: Array(metadata.policy.C2 + 1).fill("0"),
    admission_group_tau: factor.groupTau,
    admission_group_e: factor.ramification,
    admission_group_f: factor.residueDegrees,
    admission_group_inert: Array(ROWS).fill("0"),
    relation_primes: factor.relationPrimes,
    ramification: factor.ramification,
    search_ideals: factor.searchIdeals,
    packet_ids: factor.packetIds,
    packet_ideals: factor.packetIdeals,
    packet_norms: factor.packetNorms,
    basis_table: prepared.basis_table,
    packet_primes: factor.relationPrimes,
    packet_generators: factor.generators,
    packet_inert: factor.inertFlags,
    initial_primes: factor.rationalPrimes,
    initial_offsets: factor.groupOffsets,
    initial_counts: factor.groupCounts,
    initial_complete: factor.groupComplete,
    hnf_perm: factor.permutation,
    subfactor: factor.subfactor,
    extra: Array(metadata.policy.hnfK0).fill("0"),
    outer_state: [String(metadata.policy.need), String(metadata.policy.Nrelid),
      "0", "0", String(ROWS + 1), ...Array(14).fill("0")],
    outer_minidx: Array.from({ length: ROWS }, (_, i) => String(i + 1)),
    outer_present: Array(ROWS).fill("0"), outer_live: Array(ROWS).fill("0"),
    outer_perm: factor.permutation, outer_multiplier: Array(ROWS).fill("0"),
  };
  for (let i = 0; i < factor.rationalPrimes.length; i += 1) {
    const prime = Number(factor.rationalPrimes[i]);
    input.admission_prime_offsets[prime] = factor.groupOffsets[i];
    input.admission_prime_counts[prime] = factor.groupCounts[i];
  }
  const empty = [];
  for (const name of empty) input[name] = [];
  const hnfNames = new Set(names.filter(([name]) => name.startsWith("hnf_")).map(([name]) => name));
  let ownerBytes = 0;
  const values = Object.fromEntries(names.map(([name, kind]) => {
    if (!Object.hasOwn(input, name)) input[name] = undefined;
    if (!kind.endsWith("Buffer")) {
      assert.notEqual(input[name], undefined, `missing scalar ${name}`);
      return [name, kind === "float" ? Number(input[name]) : BigInt(input[name])];
    }
    const supplied = input[name];
    const length = supplied === undefined ? lengths[name] : supplied.length;
    assert.notEqual(length, undefined, `missing owner shape ${name}`);
    if (kind === "Float64Buffer") {
      ownerBytes += 8*length;
      return [name, fn.createFloat64Buffer(supplied === undefined ? length : supplied.map(Number))];
    }
    if (kind === "Int64Buffer") {
      ownerBytes += 8*length;
      return [name, fn.createInt64Buffer(supplied === undefined ? length : supplied.map(BigInt))];
    }
    let capacity = hnfNames.has(name) ? hnfWords : 8;
    if (name === "relation_records" || name === "relation_basis" ||
        name === "relation_hashes" || name === "relation_metadata" ||
        name === "relation" || name === "relation_scratch" || name === "generators" ||
        name === "hnf_cup_arena" || name === "hnf_cup_frames") capacity = 1;
    capacity = words(supplied, capacity);
    ownerBytes += length*(4+8*capacity);
    return [name, fn.createIntegerBuffer(length, capacity,
      supplied === undefined ? undefined : supplied.map(BigInt))];
  }));
  assert(ownerBytes < 3.5*1024**3, "row-14 first-HNF owners exceed 3.5 GiB");
  const view = value => value.toArray ? value.toArray() : Array.from(value);
  let status;
  try {
    status = fn.gmp(...names.map(([name]) => values[name]));
  } catch (error) {
    error.row14State = Object.fromEntries([
      "relation_state", "chain_state", "hnf_sparse_state",
      "hnf_cleanup_state", "hnf_rank_state", "hnf_state",
    ].map(name => [name, view(values[name]).map(String)]));
    throw error;
  }
  return { status: Number(status), ownerBytes, built, values, relationState:
    view(values.relation_state).map(String), chainState: view(values.chain_state).map(Number),
    hnfState: view(values.hnf_state).map(Number) };
}

module.exports = { runFirstHnf, zeroLengths };

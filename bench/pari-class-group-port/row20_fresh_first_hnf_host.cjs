"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const ROWS = 7;
const DEGREE = 5;
const PLACES = 3;
const TARGET = 14;
const RESERVE = 200;

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
    hnf_pivots: n, power_ideal: n*n, power_alpha: n, power_metadata: 5,
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
    chain_state: 4, hnf_cup_arena: 160_000, hnf_cup_frames: 32,
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

async function runFirstHnf(prepared, factorOwner, {
  hnfWords = 16, residentBuilt = undefined, residentNames = undefined,
  defer = false,
} = {}) {
  assert.equal(factorOwner.schema,
    "sagejs.pari-class-group/row20-fresh-prepared-factor-base-v1");
  assert.equal(prepared.n, "5");
  const source = path.join(__dirname, "row20_connected_relation_hnf.py");
  const names = residentNames || signature(source);
  const built = residentBuilt || await compileKernel({ sourcePath: source });
  const fn = require(built.modulePath).pari_connected_relation_hnf;
  const lengths = zeroLengths();
  const factor = factorOwner.factorBase;
  const descriptors = factor.descriptors;
  const relationPrimes = descriptors.map(record => record[0]);
  const ramification = descriptors.map(record => record[1]);
  const residueDegrees = descriptors.map(record => record[2]);
  const generators = descriptors.flatMap(record => record.slice(3, 8));
  const groupTau = descriptors.flatMap(record => {
    const columnMajor = record.slice(8, 33);
    return Array.from({ length: DEGREE * DEGREE }, (_, index) => {
      const row = Math.floor(index / DEGREE), column = index % DEGREE;
      return columnMajor[column * DEGREE + row];
    });
  });
  const inertFlags = descriptors.map(record =>
    record.slice(3, 8).every(value => BigInt(value) === 0n) ? "1" : "0");
  const rationalPrimes = factor.rationalPrimes;
  const groupOffsets = [], groupCounts = [], groupComplete = [];
  let descriptor = 0;
  for (const rawPrime of rationalPrimes) {
    const prime = Number(rawPrime), start = descriptor;
    let localDegree = 0;
    while (descriptor < ROWS && Number(descriptors[descriptor][0]) === prime) {
      localDegree += Number(descriptors[descriptor][1]) * Number(descriptors[descriptor][2]);
      descriptor += 1;
    }
    groupOffsets.push(String(start));
    groupCounts.push(String(descriptor - start));
    groupComplete.push(localDegree === DEGREE ? "1" : "0");
  }
  assert.equal(descriptor, ROWS);
  const primeOffsets = Array(58).fill("-1"), primeCounts = Array(58).fill("0");
  rationalPrimes.forEach((rawPrime, index) => {
    const prime = Number(rawPrime);
    primeOffsets[prime] = groupOffsets[index];
    primeCounts[prime] = groupCounts[index];
  });
  let ball = 2;
  for (let degree = DEGREE; degree > 1; degree -= 2)
    ball *= 2 * Math.PI / degree;
  const input = {
    n: DEGREE, precision: 192, scale: 2000 / ball, track_small: 1,
    admission_real_count: 1, admission_mode: 2,
    admission_factor_product: factorOwner.bounds.prodZ,
    admission_factorlimit: 1048576, admission_prime_limit: 65537,
    nrelid: 4, track_fact: 1, jid0: 0, e0: 0, extra_count: -1,
    search_count: ROWS, construct_primes: 0, outer_mode: 0, outer_ru: PLACES,
    log_precision: 192, initial_additional: 7, initial_target: TARGET,
    hnf_k0: 4,
    admission_matrix_m: prepared.admission_matrix_m,
    admission_matrix_p: prepared.admission_matrix_p,
    admission_matrix_e: prepared.admission_matrix_e,
    admission_primes: prepared.admission_primes,
    admission_products: prepared.admission_products,
    preparation_rounded_embedding: prepared.preparation_rounded_embedding,
    preparation_embedding: prepared.preparation_embedding,
    admission_prime_offsets: primeOffsets,
    admission_prime_counts: primeCounts,
    admission_group_tau: groupTau,
    admission_group_e: ramification,
    admission_group_f: residueDegrees,
    admission_group_inert: inertFlags,
    relation_primes: relationPrimes,
    ramification,
    search_ideals: factor.permutation,
    packet_ids: Array.from({ length: ROWS }, (_, i) => String(i + 1)),
    packet_ideals: factor.ideals.flat(),
    packet_norms: factor.norms,
    basis_table: prepared.basis_table,
    packet_primes: relationPrimes,
    packet_generators: generators,
    packet_inert: inertFlags,
    initial_primes: rationalPrimes,
    initial_offsets: groupOffsets,
    initial_counts: groupCounts,
    initial_complete: groupComplete,
    hnf_perm: factor.permutation,
    subfactor: factor.subfactor,
    extra: Array(4).fill("0"),
    outer_state: ["11", "4",
      "0", "0", String(ROWS + 1), ...Array(14).fill("0")],
    outer_minidx: Array.from({ length: ROWS }, (_, i) => String(i + 1)),
    outer_present: Array(ROWS).fill("0"), outer_live: Array(ROWS).fill("0"),
    outer_perm: factor.permutation, outer_multiplier: Array(ROWS).fill("0"),
  };
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
  assert(ownerBytes < 512*1024**2, "row-20 fresh first-HNF owners exceed 512 MiB");
  const invocation = { ownerBytes, built, fn, values, names,
    args: names.map(([name]) => values[name]) };
  if (defer) return invocation;
  return invokeFirstHnf(invocation);
}

function invokeFirstHnf(invocation) {
  const { ownerBytes, built, fn, values, names, args } = invocation;
  const view = value => value.toArray ? value.toArray() : Array.from(value);
  let status;
  try {
    status = fn.gmp(...args);
  } catch (error) {
    error.row20State = Object.fromEntries([
      "relation_state", "chain_state", "hnf_sparse_state",
      "hnf_cleanup_state", "hnf_rank_state", "hnf_state",
    ].map(name => [name, view(values[name]).map(String)]));
    throw error;
  }
  return { status: Number(status), ownerBytes, built, values, names, relationState:
    view(values.relation_state).map(String), chainState: view(values.chain_state).map(Number),
    hnfState: view(values.hnf_state).map(Number),
    collectorState: Object.fromEntries([
      "schedule", "progress", "state", "counters", "diagnostic",
      "preparation_state", "preparation_flags", "preparation_rank_diagnostic",
      "preparation_selection", "preparation_stages", "preparation_diagnostic",
    ].map(name => [name, view(values[name]).map(String)])) };
}

module.exports = { invokeFirstHnf, runFirstHnf, signature, zeroLengths };

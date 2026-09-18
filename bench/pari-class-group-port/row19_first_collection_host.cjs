"use strict";

// First authentic row-19 relation collection pass.  The host accepts only the
// prepared nf projection and the independently derived prepared-prefix owner.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const ROWS = 424, DEGREE = 3, PLACES = 2, TARGET = 430, RESERVE = 4350;
const INITIAL = 71, FIRST_COLUMNS = 423;

function signature(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = fs.readFileSync(source, "utf8").match(
    new RegExp(`def ${escaped}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing signature ${name}`);
  return match[1].trim().split("\n").map(line =>
    line.trim().replace(/,$/, "").split(": "));
}

function zeroLengths() {
  const n = DEGREE;
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
    admission_exponents: 128, diagnostic: 3, relation: ROWS,
    relation_state: 6, relation_basis: ROWS*ROWS,
    relation_records: ROWS*RESERVE, relation_hashes: RESERVE,
    relation_metadata: 3*RESERVE, relation_scratch: ROWS,
    generators: DEGREE*RESERVE, progress: 4,
    preparation_original: n*n, preparation_basis: n*n,
    preparation_transform: n*n, preparation_flags: 2,
    preparation_rank_diagnostic: 3, preparation_selection: 5,
    preparation_stages: 4, preparation_flatter_input: n*n,
    preparation_current: n*n, preparation_flatter_transform: n*n,
    preparation_total_work: n*n, preparation_step_t: n*n,
    preparation_step_s: n*n, preparation_product: n*n,
    preparation_next_basis: n*n, preparation_y: n,
    preparation_diagnostic: 7, preparation_r1: 12, preparation_r2: 12,
    preparation_r3: 12, preparation_t1: 4, preparation_t2: 4,
    preparation_t3: 4, preparation_integers: 4, preparation_inverse: 12,
    preparation_first: 12, preparation_second: 12, preparation_final: 12,
    preparation_rounded: 4, preparation_mu: n*n, preparation_r: n*n,
    preparation_s: n, preparation_approximate: n*n, preparation_exponents: n,
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
    log_stack: 128,
  };
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

function validateBoundary(prepared, prefix) {
  assert.equal(String(prepared.prep_index), "254541");
  assert.equal(String(prepared.prep_zkden), "254541");
  assert.equal(Number(prepared.n), DEGREE);
  assert.equal(Number(prepared.admission_real_count), 1);
  assert.equal(Number(prepared.precision), 192);
  assert.equal(prefix.schema,
    "sagejs.pari-class-group/row19-prepared-prefix-probe-v1");
  assert.deepEqual(prefix.field.polynomial, prepared.prep_polynomial.map(String));
  assert.equal(prefix.field.discriminant, String(prepared.analytic_discriminant));
  assert.deepEqual(prefix.field.signature, [1, 1]);
  assert.equal(prefix.factor.KC, ROWS);
  assert.equal(prefix.factor.KCZ, 307);
  assert.equal(prefix.factor.permutation.length, ROWS);
  assert.deepEqual(prefix.factor.subfactor.map(String), ["12", "14", "16"]);
  assert.equal(prefix.factor.packetIdeals.length, ROWS * DEGREE * DEGREE);
  assert.equal(prefix.relations.initialCount, INITIAL);
  assert.equal(prefix.relations.target, TARGET);
  assert.deepEqual(prefix.relations.state.map(String),
    ["71", "4350", "353", "6", "0", "430"]);
  assert.equal(prefix.relations.basis.length, ROWS * ROWS);
  assert.equal(prefix.relations.records.length, INITIAL * ROWS);
  assert.equal(prefix.diagnostic.oracleDataConsumed, false);
  assert.equal(prefix.diagnostic.stoppedBeforeRandomRelationSearch, true);
}

function collectorInput(prepared, prefix) {
  validateBoundary(prepared, prefix);
  const factor = prefix.factor, relations = prefix.relations;
  const offsets = Array(Number(prepared.admission_prime_limit) + 1).fill("-1");
  const counts = Array(offsets.length).fill("0");
  for (let i = 0; i < factor.rationalPrimes.length; i += 1) {
    const prime = Number(factor.rationalPrimes[i]);
    offsets[prime] = factor.groupOffsets[i];
    counts[prime] = factor.groupCounts[i];
  }
  return {
    n: DEGREE, precision: 192,
    scale: 2000 / (2 * ((2 * Math.PI) / 3)), track_small: 1,
    admission_real_count: 1, admission_mode: 2,
    admission_factor_product: factor.prodZ,
    admission_factorlimit: prepared.admission_factorlimit,
    admission_prime_limit: prepared.admission_prime_limit,
    nrelid: 4, track_fact: 1, jid0: 0, e0: 0, extra_count: -1,
    search_count: ROWS, construct_primes: 0, outer_mode: 1,
    outer_ru: PLACES, log_precision: 192, scalar_prefix_count: INITIAL,
    admission_matrix_m: prepared.admission_matrix_m,
    admission_matrix_p: prepared.admission_matrix_p,
    admission_matrix_e: prepared.admission_matrix_e,
    admission_primes: prepared.admission_primes,
    admission_products: prepared.admission_products,
    preparation_rounded_embedding: prepared.preparation_rounded_embedding,
    preparation_embedding: prepared.preparation_embedding,
    admission_prime_offsets: offsets, admission_prime_counts: counts,
    admission_group_tau: factor.tau,
    admission_group_e: factor.ramification,
    admission_group_f: factor.residueDegrees,
    admission_group_inert: factor.inert,
    relation_primes: factor.primes, ramification: factor.ramification,
    search_ideals: factor.permutation,
    packet_ids: Array.from({ length: ROWS }, (_, index) => String(index + 1)),
    packet_ideals: factor.packetIdeals, packet_norms: factor.packetNorms,
    basis_table: prepared.basis_table, packet_primes: factor.primes,
    packet_generators: factor.generators.flat(), packet_inert: factor.inert,
    subfactor: factor.subfactor, extra: Array(factor.subfactor.length).fill("0"),
    relation_state: relations.state,
    relation_basis: relations.basis,
    relation_records: [...relations.records,
      ...Array((RESERVE - INITIAL) * ROWS).fill("0")],
    relation_hashes: [...relations.hashes,
      ...Array(RESERVE - INITIAL).fill("0")],
    relation_metadata: [...relations.metadata,
      ...Array((RESERVE - INITIAL) * 3).fill("0")],
    generators: [...relations.generators,
      ...Array((RESERVE - INITIAL) * DEGREE).fill("0")],
    relation: Array(ROWS).fill("0"), relation_scratch: Array(ROWS).fill("0"),
    schedule: ["0", "0", "0", "0"], log_completed: ["0"],
    outer_state: [String(TARGET - INITIAL), "4", "0", "0", String(ROWS + 1),
      ...Array(14).fill("0")],
    outer_minidx: Array.from({ length: ROWS }, (_, index) => String(index + 1)),
    outer_present: Array(ROWS).fill("0"), outer_live: Array(ROWS).fill("0"),
    outer_perm: factor.permutation, outer_multiplier: Array(ROWS).fill("0"),
  };
}

async function runFirstCollection(prepared, prefix, options = {}) {
  const source = path.join(__dirname, "collected_log_embeddings.py");
  const built = await compileKernel({ sourcePath: source,
    ...(options.cacheRoot ? { cacheRoot: options.cacheRoot } : {}) });
  const fn = require(built.modulePath).pari_collect_and_log_relations;
  assert(fn?.nativeAvailable);
  const names = signature(source, "pari_collect_and_log_relations");
  const input = collectorInput(prepared, prefix), lengths = zeroLengths();
  const compact = new Set(["relation_records", "relation_hashes",
    "relation_metadata", "relation", "relation_scratch"]);
  const values = {}; let ownerBytesUpperBound = 0;
  for (const [name, kind] of names) {
    const supplied = input[name];
    if (!kind.endsWith("Buffer")) {
      assert.notEqual(supplied, undefined, `missing scalar ${name}`);
      values[name] = kind === "float" ? Number(supplied) : BigInt(supplied);
      continue;
    }
    const length = supplied === undefined ? lengths[name] : supplied.length;
    assert.notEqual(length, undefined, `missing owner shape ${name}`);
    if (kind === "Float64Buffer") {
      ownerBytesUpperBound += 8 * length;
      values[name] = fn.createFloat64Buffer(
        supplied === undefined ? length : supplied.map(Number));
    } else if (kind === "Int64Buffer") {
      ownerBytesUpperBound += 8 * length;
      values[name] = fn.createInt64Buffer(
        supplied === undefined ? length : supplied.map(BigInt));
    } else {
      const capacity = words(supplied, compact.has(name) ? 1 : 16);
      ownerBytesUpperBound += length * (4 + 8 * capacity);
      values[name] = fn.createIntegerBuffer(length, capacity,
        supplied === undefined ? undefined : supplied.map(BigInt));
    }
  }
  const initialRecords = values.relation_records.toArray().slice(0, INITIAL * ROWS);
  const initialHashes = values.relation_hashes.toArray().slice(0, INITIAL);
  const initialMetadata = values.relation_metadata.toArray().slice(0, INITIAL * 3);
  const initialGenerators = values.generators.toArray().slice(0, INITIAL * DEGREE);
  const status = fn.gmp(...names.map(([name]) => values[name]));
  assert(status === 0n || status === 1n);
  assert.deepEqual(values.relation_state.toArray().map(String),
    ["423", "4350", "7", "0", "0", "423"]);
  assert.equal(Number(values.log_completed.toArray()[0]), FIRST_COLUMNS);
  assert.deepEqual(values.relation_records.toArray().slice(0, INITIAL * ROWS),
    initialRecords);
  assert.deepEqual(values.relation_hashes.toArray().slice(0, INITIAL), initialHashes);
  assert.deepEqual(values.relation_metadata.toArray().slice(0, INITIAL * 3),
    initialMetadata);
  assert.deepEqual(values.generators.toArray().slice(0, INITIAL * DEGREE),
    initialGenerators);
  return { built, values, ownerBytesUpperBound };
}

module.exports = { ROWS, DEGREE, PLACES, RESERVE, INITIAL, FIRST_COLUMNS,
  validateBoundary, collectorInput, runFirstCollection, zeroLengths };

"use strict";

// Host lifecycle for the connected prepared prefix through first genuine HNF.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadThinCachedKernel } = require(
  "../../tools/native-kernel/thin-cache-loader.cjs");
const authentication = require("./prepared_nf_authentication.cjs");
const prefixHost = require("./row6_phase6_prepared_prefix_host.cjs");
const source = require("./row6_phase6_gate_prefix_source.cjs");
const { ROW6_PREPARED_LAYOUT, assertLayout } = require(
  "./row6_phase6_whole_prepared_layout.cjs");

const PREPARED_DATA_KEYS = Object.freeze([
  "admission_factorlimit", "admission_matrix_e", "admission_matrix_m",
  "admission_matrix_p", "admission_prime_limit", "admission_primes",
  "admission_products", "admission_real_count", "analytic_discriminant",
  "analytic_primes", "analytic_roots_of_unity", "basis_table", "n",
  "precision", "prep_index", "prep_invzk", "prep_polynomial", "prep_zk",
  "prep_zk_degrees", "prep_zkden", "preparation_embedding",
  "preparation_rounded_embedding",
]);

const SOURCE = path.join(__dirname, "row6_phase6_gate_prefix_root.generated.py");
const EXPORT = source.ROOT;
const CACHE_ROOT = path.join(__dirname, ".sagejs-native-kernels");
const THIN_EXPECTED = Object.freeze({
  sourceHash: "b72d49a9baa97a5c017492f35090aadb1355dde7f6981985d9de9c8718cbc5f7",
  cacheKey: "98795c5696a9f6a7e2282c72e70dcfa68caf311981e7dd7ff95af5dcdecd26c5",
  nativeAbi: 24,
  manifestHash: "1126accd9b1b2ba610daf4be06b27162828f38e32870565bc971580a72ee179a",
  addonHash: "f5c022102f525ee72b2b58379a79829e45baa4ac875048c7c94d7d8ddb7ea636",
  signatureHash: "e219a4998e8690157b38cf276856534091b938a160e61dc686948d32b813d33e",
});
const STORAGE_PLAN_REVIEWED = false;
const ROW6_CAPACITY_LEDGER = Object.freeze({
  "hnf.transform": Object.freeze({ highWater: 1, capacity: 16 }),
  "hnf.hnf_transform": Object.freeze({ highWater: 1, capacity: 16 }),
  "hnf.lam": Object.freeze({ highWater: 11, capacity: 16 }),
  "hnf.d": Object.freeze({ highWater: 11, capacity: 16 }),
  "hnf.full_h": Object.freeze({ highWater: 1, capacity: 16 }),
  "hnf.full_dep": Object.freeze({ highWater: 0, capacity: 16 }),
  "hnf.work_b": Object.freeze({ highWater: 1, capacity: 16 }),
  "hnf.transformed_logs": Object.freeze({ highWater: 6, capacity: 8 }),
  "hnf.work_c": Object.freeze({ highWater: 6, capacity: 8 }),
  "hnf.result_c": Object.freeze({ highWater: 6, capacity: 8 }),
  "ancestry.current": Object.freeze({ highWater: 1, capacity: 64 }),
  "ancestry.old": Object.freeze({ highWater: 1, capacity: 64 }),
  "ancestry.joined": Object.freeze({ highWater: 2, capacity: 64 }),
  "ancestry.work": Object.freeze({ highWater: 1, capacity: 64 }),
  "ancestry.trailing_work": Object.freeze({ highWater: 1, capacity: 32 }),
  "ancestry.raw_to_all": Object.freeze({ highWater: 2, capacity: 64 }),
  "ancestry.accepted_arch": Object.freeze({ highWater: 5, capacity: 16 }),
  "ancestry.phase_pi": Object.freeze({ highWater: 5, capacity: 16 }),
});

function signature(file, name) { return source.signature(file, name); }

function allocate(fn, names, input, lengths, options = {}) {
  const compact = options.compact || new Set(), wide = options.wide || new Set();
  const capacities = options.capacities || {};
  const output = {};
  let allocatedBytes = 0;
  for (const [name, kind] of names) {
    const supplied = input[name];
    if (!kind.endsWith("Buffer")) {
      assert.notEqual(supplied, undefined, `missing scalar ${name}`);
      output[name] = kind === "float" ? Number(supplied) : BigInt(supplied);
      continue;
    }
    const length = supplied === undefined ? lengths[name] : supplied.length;
    assert.notEqual(length, undefined, `missing length ${name}`);
    if (kind === "Float64Buffer") {
      output[name] = fn.createFloat64Buffer(
        supplied === undefined ? length : supplied.map(Number));
      allocatedBytes += length * 8;
    } else if (kind === "Int64Buffer") {
      output[name] = fn.createInt64Buffer(
        supplied === undefined ? length : supplied.map(BigInt));
      allocatedBytes += length * 8;
    } else {
      // Buffer widths are policy ceilings.  They must never be inferred from
      // a serialized answer or from the values produced by an earlier stage.
      const capacity = capacities[name] ?? (compact.has(name) ?
        options.compactWords : wide.has(name) ? options.wideWords :
          options.minimumWords);
      assert(Number.isSafeInteger(capacity) && capacity > 0,
        `missing fixed word ceiling ${name}`);
      try {
        output[name] = fn.createIntegerBuffer(length, capacity,
          supplied === undefined ? undefined : supplied.map(BigInt));
      } catch (error) {
        const status = fs.readFileSync("/proc/self/status", "utf8");
        const virtual = status.match(/^VmSize:\s+.*$/m)?.[0] || "VmSize: unknown";
        error.message += ` while allocating ${name}[${length}]x${capacity}; ` +
          `familyBytes=${allocatedBytes}; ${virtual}`;
        throw error;
      }
      allocatedBytes += length * (4 + 8 * capacity);
    }
  }
  return output;
}

function validatePreparedEnvelopeShape(preparedEnvelope) {
  assert(preparedEnvelope && typeof preparedEnvelope === "object" &&
    !Array.isArray(preparedEnvelope), "prepared envelope must be an object");
  assert.deepEqual(Object.keys(preparedEnvelope).sort(),
    ["authoritySha256", "data"],
    "row 6 public preparation accepts only the prepared-number-field envelope");
  assert(preparedEnvelope.data && typeof preparedEnvelope.data === "object" &&
    !Array.isArray(preparedEnvelope.data), "prepared data must be an object");
  assert.deepEqual(Object.keys(preparedEnvelope.data).sort(), PREPARED_DATA_KEYS,
    "prepared data contains an unreviewed field");
}

function assertAuthenticatedEnvelope(preparedEnvelope, authority) {
  assert(authority && typeof authority.sha256 === "string",
    "prepared authentication result is missing its digest");
  assert.equal(preparedEnvelope.authoritySha256, authority.sha256,
    "prepared envelope authority is not authenticated data");
}

function validatePreparedOnlyBoundary(preparedEnvelope) {
  validatePreparedEnvelopeShape(preparedEnvelope);
  const authority = authentication.authenticatePreparedNf(preparedEnvelope.data);
  assert.equal(authority.sha256, prefixHost.PREPARED_AUTHORITY_SHA256,
    "prepared mathematical authority changed");
  assertAuthenticatedEnvelope(preparedEnvelope, authority);
  return authority;
}

function preparedCollectorInput(preparedEnvelope) {
  const prepared = preparedEnvelope.data;
  return {
    n: 3, precision: 192,
    scale: 2000 / (2 * ((2 * Math.PI) / 3)), track_small: 1,
    admission_real_count: 3, admission_mode: 2,
    nrelid: 4, track_fact: 1, jid0: 0, e0: 0, extra_count: -1,
    search_count: 0,
    construct_primes: 0, outer_mode: 1, outer_ru: 3,
    log_precision: 192,
    // Deliberate non-answer sentinels.  The root obtains both logical values
    // from the live initial-relation and factor states before collection.
    scalar_prefix_count: 0,
    admission_matrix_m: prepared.admission_matrix_m,
    admission_matrix_p: prepared.admission_matrix_p,
    admission_matrix_e: prepared.admission_matrix_e,
    preparation_rounded_embedding: prepared.preparation_rounded_embedding,
    preparation_embedding: prepared.preparation_embedding,
  };
}

function layoutLengths() {
  const d = ROW6_PREPARED_LAYOUT.dimensions;
  const n = d.degree, rows = d.maxFactorIdeals;
  const columns = d.maxRelationColumns, capacity = d.maxRelationCapacity;
  const size = rows * columns, square = columns * columns;
  const logs = 7 * d.places * columns, k0 = n + 1;
  return {
    matrix: 3*n*n, ideal: n*n, reduction: 3*n*n, vectors: 3*n*n,
    betas: 3*n, norms: 3*n, column: 3*n, float_q: (n+1)**2,
    float_v: n+1, bound: 1, cache: 3, a: 64, b: 64, p: 64, q: 64,
    stack: 128, x: n+1, y: n+1, z: n+1, inc: n+1, state: 5,
    cursor_output: n+1, element: n, counters: 4,
    admission_embedding_m: n, admission_embedding_p: n,
    admission_embedding_e: n, admission_ideal: n*n,
    admission_rational_factors: 16, admission_rational_exponents: 16,
    admission_tau: n*n, admission_x: n, admission_y: n,
    admission_spare: n, admission_stack: 32, admission_primitive: n*n,
    admission_columns: n*n, admission_values: n, admission_temporary: n,
    admission_indices: 128, admission_exponents: 128, diagnostic: 3,
    relation: rows, relation_state: 6, relation_basis: rows*rows,
    relation_records: rows*capacity, relation_hashes: capacity,
    relation_metadata: 3*capacity, relation_scratch: rows,
    generators: n*capacity, progress: 4,
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
    preparation_first: 12, preparation_second: 12,
    preparation_final: 12, preparation_rounded: 4,
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
    log_completed: 1, log_embeddings: capacity*7*d.places,
    log_coordinates: n, log_column: 7*d.places, log_cache: 3,
    log_pi_cache: 3, log_a: 64, log_b: 64, log_p: 64, log_q: 64,
    log_stack: 128, hnf_original: size, hnf_mat: size,
    hnf_dense: k0*columns, hnf_transform: square, hnf_vmax: columns,
    hnf_found: 1, hnf_sparse_state: 13,
    hnf_bottom: (rows-k0)*columns, hnf_updated_dense: k0*columns,
    hnf_extra: size, hnf_cleanup_state: 10, hnf_rank_matrix: size,
    hnf_occupied: columns, hnf_rank_pivots: rows, hnf_best: rows,
    hnf_profile: rows+1, hnf_rank_state: 10, hnf_perm_work: rows,
    hnf_matbnew: size, hnf_dep: size, hnf_b: size,
    hnf_assembly_state: 6, hnf_transformed_logs: logs,
    hnf_full_h: size, hnf_hnf_transform: square, hnf_lam: square,
    hnf_d: columns+1, hnf_hnf_state: 11, hnf_full_dep: size,
    hnf_work_b: size, hnf_work_c: logs, hnf_diagonal: rows,
    hnf_result_h: size, hnf_result_dep: size,
    hnf_result_b: rows*(columns+rows), hnf_result_c: logs,
    hnf_final_state: 7, hnf_state: 9, chain_state: 4,
    hnf_cup_arena: 8_000_000, hnf_cup_frames: 64,
    hnf_cup_solve_state: 8, hnf_cup_state: 8,
    admission_prime_offsets: d.maxRuntimePrimes + 1,
    admission_prime_counts: d.maxRuntimePrimes + 1,
    extra: d.degree + 1,
    packet_ids: rows,
    packet_generators: d.degree * rows,
    outer_state: 19,
    outer_present: rows, outer_live: rows, outer_perm: rows,
    outer_multiplier: rows,
  };
}

function appendLayoutLengths() {
  const d = ROW6_PREPARED_LAYOUT.dimensions;
  const a = ROW6_PREPARED_LAYOUT.appendCeilings;
  const lig = d.maxFactorIdeals;
  const width = a.maxHRows + a.maxNewColumnsPerCheckpoint;
  const cWidth = d.maxRelationColumns;
  return {
    new_relations: d.maxFactorIdeals * a.maxNewColumnsPerCheckpoint,
    top: lig * a.maxNewColumnsPerCheckpoint,
    exact_product: lig * a.maxNewColumnsPerCheckpoint,
    log_product: 7 * d.places * a.maxNewColumnsPerCheckpoint,
    adjusted_logs: 7 * d.places * a.maxNewColumnsPerCheckpoint,
    joined: lig * width, joined_logs: 7 * d.places * cWidth,
    rank_matrix: lig * width, occupied: width, pivots: lig, best: lig,
    profile: lig, rank_state: 10, perm_work: d.maxFactorIdeals,
    matb: lig * width, new_dep: lig * width,
    permuted_b: lig * d.maxFactorIdeals, full_h: lig * width,
    transform: width * width, lam: width * width, d: width + 1,
    hnf_state: 11, full_dep: lig * width,
    work_b: lig * d.maxFactorIdeals, work_c: 7 * d.places * cWidth,
    diagonal: lig, final_c: 7 * d.places * cWidth,
    result_h: lig * lig, result_dep: lig * lig,
    result_b: lig * (d.maxFactorIdeals + lig),
    result_c: 7 * d.places * cWidth, final_state: 7, state: 9,
  };
}

async function prepare(preparedEnvelope) {
  assert.equal(arguments.length, 1,
    "factor/relation owners are forbidden at the prepared-only boundary");
  validatePreparedOnlyBoundary(preparedEnvelope);
  const layout = assertLayout();
  if (!STORAGE_PLAN_REVIEWED) {
    const error = new Error(
      "row-6 prepared-only maximum storage requires reviewed phase-lifetime reuse");
    error.code = "SAGEJS_ROW6_MAX_STORAGE_PLAN_REQUIRED";
    throw error;
  }
  const aggregateNames = signature(
    "row6_phase6_gate_prefix_root.generated.py", EXPORT);
  const fn = loadThinCachedKernel({ sourcePath: SOURCE, cacheRoot: CACHE_ROOT,
    entry: EXPORT, signature: aggregateNames, expected: THIN_EXPECTED });
  const outputPath = path.join(CACHE_ROOT, THIN_EXPECTED.cacheKey);
  const built = Object.freeze({ cacheKey: THIN_EXPECTED.cacheKey,
    coreSourcePath: path.join(outputPath, "kernel_core.c"),
    modulePath: path.join(outputPath, "index.cjs"), outputPath });
  assert.equal(fn?.nativeAvailable, true);
  const prefix = prefixHost.prepareWithKernel(preparedEnvelope.data, built, fn);
  const lengths = layoutLengths();
  const collectorInput = preparedCollectorInput(preparedEnvelope);
  const collectorNames = signature(
    "collected_log_embeddings.py", "pari_collect_and_log_relations");
  const collectorAliases = source.COLLECTOR_ALIASES;
  const collectorOwnedNames = collectorNames.filter(([name]) => !collectorAliases[name]);
  const collector = allocate(fn, collectorOwnedNames, collectorInput, lengths, {
    minimumWords: layout.integerWords.collectorDefault,
    compactWords: layout.integerWords.collectorCompact,
    wideWords: layout.integerWords.collectorDefault,
    compact: new Set(["relation_records", "relation_hashes", "relation_metadata",
      "relation", "relation_scratch"]),
  });

  const hnfNames = signature("hnfspec_complete.py", "pari_hnfspec_complete");
  const hnfLengths = Object.fromEntries(hnfNames.map(([name]) => [name,
    lengths[name === "pivots" ? "hnf_rank_pivots" : `hnf_${name}`]]));
  const hnfInput = {};
  const hnfLogicalNames = new Set(["rows", "columns", "k0", "log_rows"]);
  const hnfOwnedNames = hnfNames.filter(([name]) =>
    !source.HNF_ALIASES[name] && !hnfLogicalNames.has(name));
  const hnf = allocate(fn, hnfOwnedNames, hnfInput, hnfLengths, {
    minimumWords: layout.integerWords.hnfDefault,
    compactWords: layout.integerWords.collectorCompact,
    wideWords: layout.integerWords.hnfWide,
    compact: new Set(["cup_arena", "cup_frames"]),
    capacities: { transformed_logs: layout.integerWords.hnfLogs,
      work_c: layout.integerWords.hnfLogs,
      result_c: layout.integerWords.hnfLogs },
    wide: new Set(["transform", "full_h", "hnf_transform", "lam", "d",
      "full_dep", "work_b"]),
  });
  hnf.original = fn.createInt64Buffer(
    layout.dimensions.maxFactorIdeals * layout.dimensions.maxRelationColumns);
  hnf.perm = fn.createInt64Buffer(layout.dimensions.maxFactorIdeals);

  const inputs = { ...prefix.inputs };
  for (const [name] of collectorOwnedNames) inputs[`gate_${name}`] = collector[name];
  for (const [name] of hnfOwnedNames) inputs[`gate_initial_hnf_${name}`] = hnf[name];
  // Aliased HNF operands still appear as explicit root parameters.
  inputs.gate_initial_hnf_original = hnf.original;
  inputs.gate_initial_hnf_perm = hnf.perm;
  const appendNames = signature("hnfadd.py", "pari_hnfadd");
  const appendBorrowed = new Set(["h", "dep", "b", "logs", "perm", "new_logs"]);
  const appendSizes = appendLayoutLengths();
  const appendOwned = appendNames.filter(([name, kind]) =>
    kind.endsWith("Buffer") && !appendBorrowed.has(name));
  const appendPolicy = { minimumWords: layout.integerWords.append,
    compactWords: layout.integerWords.append,
    wideWords: layout.integerWords.append };
  const append1 = allocate(fn, appendOwned, {}, appendSizes, appendPolicy);
  const append2 = allocate(fn, appendOwned, {}, appendSizes, appendPolicy);
  for (const [name] of appendOwned) {
    inputs[`gate_append1_${name}`] = append1[name];
    inputs[`gate_append2_${name}`] = append2[name];
  }
  inputs.gate_next_control = fn.createInt64Buffer(3);
  const ancestry = {
    perm1: fn.createInt64Buffer(layout.dimensions.maxFactorIdeals),
    perm2: fn.createInt64Buffer(layout.dimensions.maxFactorIdeals),
    current: fn.createIntegerBuffer(layout.dimensions.maxRelationColumns, 64),
    old: fn.createIntegerBuffer(layout.dimensions.maxRelationColumns, 64),
    joined: fn.createIntegerBuffer(layout.dimensions.maxRelationColumns, 64),
    work: fn.createIntegerBuffer(layout.dimensions.maxRelationColumns, 64),
    trailing_work: fn.createIntegerBuffer(
      layout.dimensions.maxFactorIdeals ** 2, 32),
    raw_to_all: fn.createIntegerBuffer(
      layout.ancestryCeilings.maxSelectedRows *
      layout.dimensions.maxRelationColumns, 64),
    accepted_arch: fn.createIntegerBuffer(
      7 * layout.dimensions.places * layout.ancestryCeilings.maxKernelRows, 16),
    accepted_signs: fn.createInt64Buffer(
      layout.dimensions.places * layout.ancestryCeilings.maxKernelRows),
    phase_pi: fn.createIntegerBuffer(3, 16),
    active_rows: fn.createInt64Buffer(layout.ancestryCeilings.maxClassRows),
    state: fn.createInt64Buffer(3),
  };
  for (const [name, value] of Object.entries(ancestry))
    inputs[`gate_ancestry_${name}`] = value;
  const names = aggregateNames;
  return Object.freeze({ ancestry, append1, append2, built, collector, fn, hnf,
    inputs, names: Object.freeze(names.map(Object.freeze)), prefix });
}

function run(resident) {
  const args = resident.names.map(([name]) => {
    const value = resident.inputs[name];
    assert.notEqual(value, undefined, `missing aggregate input ${name}`);
    return value;
  });
  const status = resident.fn.gmp(...args);
  assert.equal(status, 0n);
  const projection = Object.freeze({
    factor: resident.prefix.factor.root_state.toArray().slice(0, 14).map(String),
    initial: resident.prefix.initial.root_state.toArray().slice(0, 12).map(String),
    relation: resident.prefix.initial.relation_state.toArray().slice(0, 6).map(String),
    hnf: Array.from(resident.hnf.state).slice(0, 9).map(String),
    final: Array.from(resident.append2.state).slice(0, 9).map(String),
    assembly: Array.from(resident.hnf.assembly_state).slice(0, 6).map(String),
    ancestry: Array.from(resident.ancestry.state).map(String),
  });
  assert.deepEqual(projection.relation, ["1137", "11420", "0", "0", "1137", "1137"]);
  assert.deepEqual(projection.hnf, ["2", "9", "1124", "4", "7", "145", "0", "1133", "0"]);
  assert.deepEqual(projection.final, ["2", "9", "1128", "0", "7", "1", "0", "1137", "0"]);
  assert.deepEqual(projection.ancestry, ["9", "7", "2"]);
  return Object.freeze({ status, projection });
}

function createProcessCoordinatorAdapter(preparedEnvelope) {
  assert.equal(arguments.length, 1,
    "factor/relation owners are forbidden at the prepared-only boundary");
  return Object.freeze({
    timingEligible: false,
    prepareSample: () => prepare(preparedEnvelope),
    runCorrectness: resident => run(resident),
    runSample: () => {
      const error = new Error("row 6 resident Gate-C root is not the whole prepared kernel");
      error.code = "SAGEJS_PHASE6_INCOMPLETE_RESIDENT_CUT";
      throw error;
    },
    commonProjection: sample => sample.projection,
  });
}

module.exports = { EXPORT, ROW6_CAPACITY_LEDGER, ROW6_PREPARED_LAYOUT, SOURCE,
  STORAGE_PLAN_REVIEWED, appendLayoutLengths, createProcessCoordinatorAdapter, prepare,
  assertAuthenticatedEnvelope, layoutLengths, preparedCollectorInput, run,
  validatePreparedOnlyBoundary, validatePreparedEnvelopeShape };

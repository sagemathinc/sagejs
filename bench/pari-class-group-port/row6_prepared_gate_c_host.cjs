"use strict";

// Gate C for frozen row 6.  This host accepts only authenticated prepared
// data and the immutable factor/initial-relation owner chain; W0 is never a
// runtime input.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const semantic = require("./row6_prepared_semantic_authority.cjs");

const ROWS = 1130, DEGREE = 3, PLACES = 3, TARGET = 1137, RESERVE = 11420;
const FIRST_COLUMNS = 1133;

function signature(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = fs.readFileSync(source, "utf8").match(
    new RegExp(`def ${escaped}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing signature ${name}`);
  return match[1].trim().split("\n").map(line =>
    line.trim().replace(/,$/, "").split(": "));
}

function array(owner) { return owner.toArray ? owner.toArray() : Array.from(owner); }

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
    chain_state: 4, hnf_cup_arena: 8_000_000, hnf_cup_frames: 64,
    hnf_cup_solve_state: 8, hnf_cup_state: 8,
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

async function compile(sourceName, exportName) {
  const source = path.join(__dirname, sourceName);
  const built = await compileKernel({ sourcePath: source });
  const fn = require(built.modulePath)[exportName];
  assert(fn?.nativeAvailable);
  return { fn, names: signature(source, exportName), built };
}

function validateBoundary(prepared, factor, initial) {
  assert.equal(factor.schema,
    "sagejs.pari-class-group/row6-prepared-factor-base-owner-v1");
  assert.equal(initial.schema,
    "sagejs.pari-class-group/row6-prepared-initial-relations-owner-v1");
  assert.equal(factor.authority.preparedAuthoritySha256, prepared.authoritySha256);
  assert.equal(initial.authority.preparedAuthoritySha256, prepared.authoritySha256);
  if (initial.authority.factorOwnerSemanticSha256 !== undefined) {
    assert.equal(initial.authority.factorOwnerSemanticSha256,
      semantic.semanticSha256(factor));
  } else {
    assert.equal(initial.authority.factorOwnerSha256, factor.ownerSha256);
  }
  assert.deepEqual(factor.rootState.slice(0, 7),
    ["1", "9196", "9196", "1130", "740", "740", "1130"]);
  assert.deepEqual(initial.rootState,
    ["1", "203", "1137", "934", "4", "927", "11420", "1130",
      "740", "7", "1130", "0"]);
  assert.deepEqual(initial.relations.state,
    ["203", "11420", "927", "7", "0", "1137"]);
  assert.deepEqual(factor.field.polynomial, prepared.data.prep_polynomial);
  assert.equal(factor.field.discriminant, prepared.data.analytic_discriminant);
  assert.equal(factor.factor.permutation.length, ROWS);
  assert.deepEqual(factor.factor.subfactor, ["3", "5", "7", "9"]);
  assert.equal(initial.relations.records.length, 203);
}

function denseInitial(initial) {
  const basis = Array(ROWS * ROWS).fill("0");
  for (const [column, row, value] of initial.relations.basisEntries)
    basis[Number(column) * ROWS + Number(row)] = value;
  const records = Array(203 * ROWS).fill("0"), hashes = [], metadata = [], generators = [];
  for (let i = 0; i < initial.relations.records.length; i += 1) {
    const record = initial.relations.records[i];
    for (const [row, value] of record.entries) records[i * ROWS + Number(row)] = value;
    hashes.push(String(record.sourceNz));
    metadata.push(String(i + 1), String(record.origin), String(record.automorphism));
    generators.push(...record.generator.map(String));
  }
  return { basis, records, hashes, metadata, generators };
}

function collectorInput(preparedEnvelope, factor, initial) {
  const prepared = preparedEnvelope.data, f = factor.factor, dense = denseInitial(initial);
  const offsets = Array(Number(factor.rootState[2]) + 1).fill("-1");
  const counts = Array(offsets.length).fill("0");
  for (let i = 0; i < f.rationalPrimes.length; i += 1) {
    offsets[Number(f.rationalPrimes[i])] = f.groupOffsets[i];
    counts[Number(f.rationalPrimes[i])] = f.groupCounts[i];
  }
  return {
    // PARI's degree-three ball volume is 2 * (2*pi/3); preserve that
    // evaluation order rather than reusing the quartic 4000/pi^2 policy.
    n: DEGREE, precision: 192,
    scale: 2000 / (2 * ((2 * Math.PI) / 3)), track_small: 1,
    admission_real_count: 3, admission_mode: 2,
    admission_factor_product: factor.baseState[6], admission_factorlimit: 1048576,
    admission_prime_limit: 65537, nrelid: 4, track_fact: 1,
    jid0: 0, e0: 0, extra_count: -1, search_count: ROWS,
    construct_primes: 0, outer_mode: 1, outer_ru: PLACES,
    log_precision: 192, scalar_prefix_count: 203,
    admission_matrix_m: prepared.admission_matrix_m,
    admission_matrix_p: prepared.admission_matrix_p,
    admission_matrix_e: prepared.admission_matrix_e,
    admission_primes: prepared.admission_primes,
    admission_products: prepared.admission_products,
    preparation_rounded_embedding: prepared.preparation_rounded_embedding,
    preparation_embedding: prepared.preparation_embedding,
    admission_prime_offsets: offsets, admission_prime_counts: counts,
    admission_group_tau: f.tau, admission_group_e: f.ramification,
    admission_group_f: f.residueDegrees, admission_group_inert: f.inertFlags,
    relation_primes: f.relationPrimes, ramification: f.ramification,
    search_ideals: f.permutation,
    packet_ids: Array.from({ length: ROWS }, (_, i) => String(i + 1)),
    packet_ideals: f.packetIdeals, packet_norms: f.packetNorms,
    basis_table: prepared.basis_table, packet_primes: f.relationPrimes,
    packet_generators: factor.selectedDescriptors.flatMap(row => row.generator),
    packet_inert: f.inertFlags, subfactor: f.subfactor,
    extra: Array(f.subfactor.length).fill("0"),
    relation_state: initial.relations.state, relation_basis: dense.basis,
    relation_records: [...dense.records, ...Array((RESERVE - 203) * ROWS).fill("0")],
    relation_hashes: [...dense.hashes, ...Array(RESERVE - 203).fill("0")],
    relation_metadata: [...dense.metadata, ...Array((RESERVE - 203) * 3).fill("0")],
    generators: [...dense.generators, ...Array((RESERVE - 203) * DEGREE).fill("0")],
    relation: Array(ROWS).fill("0"), relation_scratch: Array(ROWS).fill("0"),
    schedule: ["0", "0", "0", "0"], log_completed: ["0"],
    outer_state: ["934", "4", "0", "0", String(ROWS + 1), ...Array(14).fill("0")],
    outer_minidx: f.minidx, outer_present: Array(ROWS).fill("0"),
    outer_live: Array(ROWS).fill("0"), outer_perm: f.permutation,
    outer_multiplier: Array(ROWS).fill("0"),
  };
}

function allocate(compiled, input, lengths, { minimumWords = 8,
  compact = new Set(), wide = new Set(), wideWords = 16, reuse = {} } = {}) {
  let bytes = 0; const values = {};
  for (const [name, kind] of compiled.names) {
    if (reuse[name] !== undefined) { values[name] = reuse[name]; continue; }
    const supplied = input[name];
    if (!kind.endsWith("Buffer")) {
      assert.notEqual(supplied, undefined, `missing scalar ${name}`);
      values[name] = kind === "float" ? Number(supplied) : BigInt(supplied); continue;
    }
    const length = supplied === undefined ? lengths[name] : supplied.length;
    assert.notEqual(length, undefined, `missing owner shape ${name}`);
    if (kind === "Float64Buffer") {
      bytes += 8 * length;
      values[name] = compiled.fn.createFloat64Buffer(
        supplied === undefined ? length : supplied.map(Number));
    } else if (kind === "Int64Buffer") {
      bytes += 8 * length;
      values[name] = compiled.fn.createInt64Buffer(
        supplied === undefined ? length : supplied.map(BigInt));
    } else {
      const capacity = words(supplied, compact.has(name) ? 1 :
        (wide.has(name) ? wideWords : minimumWords));
      bytes += length * (4 + 8 * capacity);
      try {
        values[name] = compiled.fn.createIntegerBuffer(length, capacity,
          supplied === undefined ? undefined : supplied.map(BigInt));
      } catch (error) {
        error.message += ` while allocating ${name}[${length}]x${capacity}; cumulative=${bytes}`;
        throw error;
      }
    }
  }
  return { values, bytes };
}

async function firstPreparedHnf(prepared, factor, initial) {
  validateBoundary(prepared, factor, initial);
  const lengths = zeroLengths();
  const collector = await compile("collected_log_embeddings.py", "pari_collect_and_log_relations");
  const compact = new Set(["relation_records", "relation_hashes", "relation_metadata",
    "relation", "relation_scratch"]);
  const collectorOwner = collectorInput(prepared, factor, initial);
  const allocated = allocate(collector, collectorOwner, lengths,
    { minimumWords: 16, compact });
  let cv = allocated.values;
  const status = collector.fn.gmp(...collector.names.map(([name]) => cv[name]));
  assert(status === 0n || status === 1n);
  const collectedState = cv.relation_state.toArray().map(String);
  if (collectedState[0] !== "1133") {
    throw new Error(JSON.stringify({ collectedState,
      counters: Array.from(cv.counters).map(String),
      progress: Array.from(cv.progress).map(String),
      schedule: Array.from(cv.schedule).map(String),
      outerState: Array.from(cv.outer_state).map(String),
      preparationState: Array.from(cv.preparation_state).map(String),
      firstCollectedHashes: cv.relation_hashes.toArray().slice(203, 223).map(String),
      firstCollectedGenerators: cv.generators.toArray().slice(203 * DEGREE,
        223 * DEGREE).map(String),
      tailHashes: cv.relation_hashes.toArray().slice(
        Math.max(0, Number(collectedState[0]) - 12), Number(collectedState[0])).map(String) }));
  }
  assert.deepEqual(collectedState, ["1133", "11420", "4", "0", "0", "1133"]);
  assert.equal(Number(cv.log_completed.toArray()[0]), FIRST_COLUMNS);

  // Match PARI's stack discipline: retain only the live cache/log/scheduler
  // owners across HNF, then rebuild collector scratch after HNF has released
  // its much larger temporary graph.  Keeping both complete scratch graphs
  // resident crosses the 4 GiB Gate-C ceiling for this 1,130-row field.
  const durableNames = ["relation_state", "relation_basis", "relation_records",
    "relation_hashes", "relation_metadata", "generators", "schedule",
    "log_completed", "log_embeddings", "search_ideals", "outer_state",
    "outer_perm"];
  const durable = Object.fromEntries(durableNames.map(name => [name, cv[name]]));
  for (const name of durableNames) collectorOwner[name] = undefined;
  for (const name of Object.keys(cv)) if (!durableNames.includes(name)) cv[name] = null;
  cv = null;
  if (global.gc) global.gc();

  const hnf = await compile("hnfspec_complete.py", "pari_hnfspec_complete");
  const hnfInput = { rows: ROWS, columns: FIRST_COLUMNS, k0: 4, log_rows: PLACES,
    original: durable.relation_records.toArray().slice(0, ROWS * FIRST_COLUMNS),
    perm: factor.factor.permutation, logs: durable.log_embeddings.toArray() };
  const hnfLengths = Object.fromEntries(hnf.names.map(([name]) =>
    [name, lengths[name === "pivots" ? "hnf_rank_pivots" : `hnf_${name}`]]));
  const hnfWide = new Set(["transform", "full_h", "hnf_transform", "lam", "d",
    "full_dep", "work_b"]);
  const ha = allocate(hnf, hnfInput, hnfLengths,
    { minimumWords: 6, compact: new Set(["cup_arena", "cup_frames"]), wide: hnfWide });
  assert.equal(hnf.fn.gmp(...hnf.names.map(([name]) => ha.values[name])), 0n);
  const state = Array.from(ha.values.state).map(Number);
  assert.deepEqual([state[0], state[2], state[3], state[7]],
    [2, 1124, 4, FIRST_COLUMNS]);
  return { collector, collectorOwner, durable, lengths, compact, hnf: ha.values,
    ownerBytes: allocated.bytes + ha.bytes };
}

async function runPreparedGateC(prepared, factor, initial) {
  const first = await firstPreparedHnf(prepared, factor, initial);
  const firstState = Array.from(first.hnf.state).map(Number);
  const resident = {
    h: first.hnf.result_h.toArray().slice(0, firstState[0] ** 2),
    dep: first.hnf.result_dep.toArray().slice(0,
      (ROWS - firstState[2] - firstState[0]) * firstState[0]),
    b: first.hnf.result_b.toArray().slice(0, (ROWS - firstState[2]) * firstState[2]),
    c: first.hnf.result_c.toArray().slice(0, 7 * PLACES * FIRST_COLUMNS),
    perm: Array.from(first.hnf.perm), state: firstState,
  };
  first.hnf = null; if (global.gc) global.gc();
  const restored = allocate(first.collector, first.collectorOwner, first.lengths,
    { minimumWords: 16, compact: first.compact, reuse: first.durable });
  const cv = restored.values;
  const snapshot = columns => ({ columns, state: resident.state.slice(),
    h: resident.h.map(String), dep: resident.dep.map(String), b: resident.b.map(String),
    c: resident.c.map(String), perm: resident.perm.map(String) });
  const next = await compile("row14_next_pass.py", "pari_row14_prepare_next_pass");
  const append = await compile("hnfadd.py", "pari_hnfadd");
  const checkpoints = [snapshot(FIRST_COLUMNS)], expected = [1136, 1137], passTrace = [];
  let checkpointIndex = 0, collectionPasses = 1, squash = 0, appendPeakBytes = 0;
  while (checkpointIndex < expected.length) {
    collectionPasses += 1;
    assert(collectionPasses <= 14, "row-6 continuation exceeded fourteen authentic passes");
    const need = ROWS - resident.state[0] - resident.state[2];
    const search = next.fn.createIntegerBuffer(ROWS, 1, cv.search_ideals.toArray());
    const outerPerm = next.fn.createIntegerBuffer(ROWS, 1, cv.outer_perm.toArray());
    const outer = next.fn.createInt64Buffer(Array.from(cv.outer_state));
    const cache = next.fn.createIntegerBuffer(6, 1, cv.relation_state.toArray());
    const schedule = next.fn.createInt64Buffer(Array.from(cv.schedule));
    const completed = next.fn.createIntegerBuffer(1, 1, cv.log_completed.toArray());
    const control = next.fn.createInt64Buffer(3), perm = next.fn.createInt64Buffer(resident.perm);
    assert.equal(next.fn.gmp(perm, BigInt(ROWS), BigInt(resident.state[0]), BigInt(need),
      BigInt(squash), search, outerPerm, 1n, outer, cache, schedule, completed, control), 0n);
    const nextControl = Array.from(control).map(Number); squash = nextControl[1];
    cv.search_ideals = first.collector.fn.createIntegerBuffer(ROWS, 1, search.toArray());
    cv.outer_perm = first.collector.fn.createIntegerBuffer(ROWS, 1, outerPerm.toArray());
    cv.outer_state = first.collector.fn.createInt64Buffer(Array.from(outer));
    cv.relation_state = first.collector.fn.createIntegerBuffer(6, 1, cache.toArray());
    cv.schedule = first.collector.fn.createInt64Buffer(Array.from(schedule));
    cv.log_completed = first.collector.fn.createIntegerBuffer(1, 1, completed.toArray());
    cv.search_count = BigInt(nextControl[0]); cv.outer_mode = 1n;
    cv.outer_ru = BigInt(PLACES); cv.scalar_prefix_count = 203n;
    assert.equal(first.collector.fn.gmp(...first.collector.names.map(([name]) => cv[name])), 0n);
    const relationState = cv.relation_state.toArray().map(Number);
    const columns = relationState[0], oldColumns = resident.state[7];
    passTrace.push({ pass: collectionPasses - 1, need, searchCount: nextControl[0], squash,
      before: oldColumns, after: columns, schedule: Array.from(cv.schedule).map(Number),
      outer: Array.from(cv.outer_state).map(Number) });
    if (columns === oldColumns) continue;
    assert.equal(columns, expected[checkpointIndex]);
    const newColumns = columns - oldColumns;
    const newRelations = cv.relation_records.toArray().slice(oldColumns * ROWS, columns * ROWS);
    const newLogs = cv.log_embeddings.toArray().slice(oldColumns * 7 * PLACES,
      columns * 7 * PLACES);
    const hRows = resident.state[0], bColumns = resident.state[2];
    const lig = ROWS - bColumns, width = hRows + newColumns, cWidth = width + bColumns;
    const sizes = { top: lig*newColumns, exact_product: lig*newColumns,
      log_product: 7*PLACES*newColumns, adjusted_logs: 7*PLACES*newColumns,
      joined: lig*width, joined_logs: 7*PLACES*cWidth, rank_matrix: lig*width,
      occupied: width, pivots: lig, best: lig, profile: lig, rank_state: 10,
      perm_work: ROWS, matb: lig*width, new_dep: lig*width,
      permuted_b: lig*bColumns, full_h: lig*width, transform: width*width,
      lam: width*width, d: width+1, hnf_state: 11, full_dep: lig*width,
      work_b: lig*bColumns, work_c: 7*PLACES*cWidth, diagonal: lig,
      final_c: 7*PLACES*cWidth, result_h: lig*lig, result_dep: lig*lig,
      result_b: lig*(bColumns+lig), result_c: 7*PLACES*columns,
      final_state: 7, state: 9 };
    const explicit = { h: resident.h, h_rows: hRows, dep: resident.dep, b: resident.b,
      b_columns: bColumns, logs: resident.c, total_columns: oldColumns,
      log_rows: PLACES, perm: resident.perm, rows: ROWS,
      new_relations: newRelations, new_columns: newColumns, new_logs: newLogs };
    const av = {}; let bytes = 0;
    for (const [name, kind] of append.names) {
      const supplied = explicit[name];
      if (!kind.endsWith("Buffer")) { av[name] = BigInt(supplied); continue; }
      const values = supplied === undefined ? Array(sizes[name]).fill(0n) : supplied.map(BigInt);
      if (kind === "Int64Buffer") { bytes += 8 * values.length;
        av[name] = append.fn.createInt64Buffer(values); }
      else { bytes += values.length * (4 + 8 * 16);
        av[name] = append.fn.createIntegerBuffer(values.length, 16, values); }
    }
    appendPeakBytes = Math.max(appendPeakBytes, bytes);
    assert.equal(append.fn.gmp(...append.names.map(([name]) => av[name])), 0n);
    resident.state = Array.from(av.state).map(Number); resident.perm = Array.from(av.perm);
    const newH = resident.state[0], newB = resident.state[2], depRows = ROWS-newB-newH;
    resident.h = av.result_h.toArray().slice(0, newH*newH);
    resident.dep = av.result_dep.toArray().slice(0, depRows*newH);
    resident.b = av.result_b.toArray().slice(0, (ROWS-newB)*newB);
    resident.c = av.result_c.toArray().slice(0, 7*PLACES*columns);
    relationState[4] = columns;
    cv.relation_state = first.collector.fn.createIntegerBuffer(6, 1, relationState.map(BigInt));
    checkpoints.push(snapshot(columns)); checkpointIndex += 1;
  }
  const ownerBytesUpperBound = first.ownerBytes + appendPeakBytes;
  assert(ownerBytesUpperBound < 4 * 1024 ** 3);
  return { collectorValues: cv, resident, checkpoints, passTrace, collectionPasses,
    ownerBytesUpperBound, preparedRng: factor.rng.slice() };
}

module.exports = { runPreparedGateC, validateBoundary };

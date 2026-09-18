"use strict";

// Gate C: hydrate the live collector from the committed prepared-root owner.
// This module never reads the historical capsule or W0 trace.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const { zeroLengths } = require("./row14_first_hnf_host.cjs");

const ROWS = 799, DEGREE = 4, PLACES = 3, FIRST_COLUMNS = 802;
const PREPARED_KEYS = ["admission_factorlimit", "admission_matrix_e",
  "admission_matrix_m", "admission_matrix_p", "admission_prime_limit",
  "admission_primes", "admission_products", "admission_real_count",
  "analytic_discriminant", "analytic_primes", "analytic_roots_of_unity",
  "basis_table", "n", "precision", "prep_index", "prep_invzk",
  "prep_polynomial", "prep_zk", "prep_zk_degrees", "prep_zkden",
  "preparation_embedding", "preparation_rounded_embedding"];

function signature(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const text = fs.readFileSync(source, "utf8");
  const match = text.match(new RegExp(`def ${escaped}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing signature ${name}`);
  return match[1].trim().split("\n").map(line =>
    line.trim().replace(/,$/, "").split(": "));
}

function array(owner) {
  return owner.toArray ? owner.toArray() : Array.from(owner);
}

function words(values, minimum = 1) {
  let result = minimum;
  for (const raw of values || []) {
    const value = BigInt(raw), absolute = value < 0n ? -value : value;
    result = Math.max(result, Math.ceil(Math.max(1, absolute.toString(2).length) / 64));
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

function validateBoundary(prepared, root) {
  assert.deepEqual(Object.keys(prepared).sort(), ["authoritySha256", "data"]);
  assert.deepEqual(Object.keys(prepared.data).sort(), PREPARED_KEYS,
    "Gate C received an unreviewed prepared-nf field");
  assert.equal(root.schema, "sagejs.pari-class-group/row14-prepared-initial-owner-v1");
  assert.equal(root.authority.preparedAuthoritySha256, prepared.authoritySha256);
  assert.deepEqual(root.rootState, ["1", "5978", "5978", "799", "487", "487",
    "799", "4", "799", "42", "806", "764", "4", "757", "799", "0",
    "1048576", "65537"]);
  assert.deepEqual(root.relations.state, ["42", "8110", "757", "7", "0", "806"]);
  assert.equal(root.relations.denseRecords.length, 42 * ROWS);
  assert.equal(root.relations.basis.length, ROWS * ROWS);
  assert.equal(root.factor.permutation.length, ROWS);
  assert.deepEqual(root.handoff.searchIdeals, root.factor.permutation);
  assert.deepEqual(root.factor.subfactor, ["2", "4", "5", "8"]);
  assert.deepEqual(root.field.polynomial, prepared.data.prep_polynomial);
  assert.equal(root.field.discriminant, prepared.data.analytic_discriminant);
  assert.equal(root.field.precision, Number(prepared.data.precision));
  assert.equal(root.capacity.logicalRows, ROWS);
  assert.equal(root.capacity.logicalRecordCapacity, 8110);
}

function collectorInput(preparedEnvelope, root) {
  const prepared = preparedEnvelope.data, factor = root.factor;
  const offsets = Array(Number(root.rootState[2]) + 1).fill("-1");
  const counts = Array(offsets.length).fill("0");
  for (let i = 0; i < factor.rationalPrimes.length; i += 1) {
    const prime = Number(factor.rationalPrimes[i]);
    offsets[prime] = factor.groupOffsets[i];
    counts[prime] = factor.groupCounts[i];
  }
  const descriptorGenerators = root.selectedDescriptors.flatMap(row => row.generator);
  return {
    n: DEGREE, precision: 192, scale: 4000 / (Math.PI * Math.PI), track_small: 1,
    admission_real_count: 2, admission_mode: 2,
    admission_factor_product: root.baseState[6], admission_factorlimit: 1048576,
    admission_prime_limit: 65537, nrelid: Number(root.handoff.Nrelid),
    track_fact: 1, jid0: 0, e0: 0, extra_count: -1,
    search_count: Number(root.handoff.searchCount), construct_primes: 0,
    outer_mode: 1, outer_ru: PLACES, log_precision: 192, scalar_prefix_count: 42,
    admission_matrix_m: prepared.admission_matrix_m,
    admission_matrix_p: prepared.admission_matrix_p,
    admission_matrix_e: prepared.admission_matrix_e,
    admission_primes: prepared.admission_primes,
    admission_products: prepared.admission_products,
    preparation_rounded_embedding: prepared.preparation_rounded_embedding,
    preparation_embedding: prepared.preparation_embedding,
    admission_prime_offsets: offsets, admission_prime_counts: counts,
    admission_group_tau: factor.tau, admission_group_e: factor.ramification,
    admission_group_f: factor.residueDegrees,
    admission_group_inert: factor.inertFlags,
    relation_primes: factor.relationPrimes, ramification: factor.ramification,
    search_ideals: root.handoff.searchIdeals,
    packet_ids: Array.from({ length: ROWS }, (_, i) => String(i + 1)),
    packet_ideals: factor.packetIdeals, packet_norms: factor.packetNorms,
    basis_table: prepared.basis_table, packet_primes: factor.relationPrimes,
    packet_generators: descriptorGenerators, packet_inert: factor.inertFlags,
    subfactor: factor.subfactor, extra: Array(factor.subfactor.length).fill("0"),
    relation_state: ["42", "8110", "757", "7", "0", String(FIRST_COLUMNS)],
    relation_basis: root.relations.basis,
    relation_records: [...root.relations.denseRecords,
      ...Array((8110 - 42) * ROWS).fill("0")],
    relation_hashes: [...root.relations.hashes, ...Array(8110 - 42).fill("0")],
    relation_metadata: [...root.relations.metadata, ...Array((8110 - 42) * 3).fill("0")],
    generators: [...root.relations.generators, ...Array((8110 - 42) * DEGREE).fill("0")],
    relation: Array(ROWS).fill("0"), relation_scratch: Array(ROWS).fill("0"),
    schedule: ["0", "0", "0", "0"], log_completed: ["0"],
    outer_state: [String(root.handoff.need), String(root.handoff.Nrelid), "0", "0",
      String(ROWS + 1), ...Array(14).fill("0")],
    outer_minidx: factor.minidx, outer_present: Array(ROWS).fill("0"),
    outer_live: Array(ROWS).fill("0"), outer_perm: factor.permutation,
    outer_multiplier: Array(ROWS).fill("0"),
  };
}

function allocate(compiled, input, lengths, { minimumWords = 8, compact = new Set() } = {}) {
  let bytes = 0;
  const values = {};
  for (const [name, kind] of compiled.names) {
    const supplied = input[name];
    if (!kind.endsWith("Buffer")) {
      assert.notEqual(supplied, undefined, `missing scalar ${name}`);
      values[name] = kind === "float" ? Number(supplied) : BigInt(supplied);
      continue;
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
      const capacity = words(supplied, compact.has(name) ? 1 : minimumWords);
      bytes += length * (4 + 8 * capacity);
      values[name] = compiled.fn.createIntegerBuffer(length, capacity,
        supplied === undefined ? undefined : supplied.map(BigInt));
    }
  }
  return { values, bytes };
}

async function firstPreparedHnf(prepared, root) {
  validateBoundary(prepared, root);
  const lengths = zeroLengths();
  const collector = await compile("collected_log_embeddings.py", "pari_collect_and_log_relations");
  const compact = new Set(["relation_basis", "relation_records", "relation_hashes",
    "relation_metadata", "relation", "relation_scratch", "generators"]);
  const allocated = allocate(collector, collectorInput(prepared, root), lengths,
    { minimumWords: 8, compact });
  const cv = allocated.values;
  const status = collector.fn.gmp(...collector.names.map(([name]) => cv[name]));
  assert(status === 0n || status === 1n);
  assert.deepEqual(cv.relation_state.toArray().map(String),
    ["802", "8110", "4", "0", "0", "802"]);
  assert.equal(Number(cv.log_completed.toArray()[0]), FIRST_COLUMNS);

  const hnf = await compile("hnfspec_complete.py", "pari_hnfspec_complete");
  const hnfInput = { rows: ROWS, columns: FIRST_COLUMNS, k0: 4, log_rows: PLACES,
    original: cv.relation_records.toArray().slice(0, ROWS * FIRST_COLUMNS),
    perm: root.factor.permutation, logs: cv.log_embeddings.toArray() };
  const hnfLengths = Object.fromEntries(hnf.names.map(([name]) =>
    [name, lengths[name === "pivots" ? "hnf_rank_pivots" : `hnf_${name}`]]));
  const hnfCompact = new Set(["cup_arena", "cup_frames"]);
  const ha = allocate(hnf, hnfInput, hnfLengths, { minimumWords: 16, compact: hnfCompact });
  assert.equal(hnf.fn.gmp(...hnf.names.map(([name]) => ha.values[name])), 0n);
  assert.deepEqual(Array.from(ha.values.state).map(Number),
    [3, 10, 792, 4, 7, 105, 0, 802, 0]);
  return { collector, cv, hnf: ha.values, ownerBytes: allocated.bytes + ha.bytes };
}

async function runPreparedGateC(prepared, root) {
  const first = await firstPreparedHnf(prepared, root);
  const cv = first.cv;
  const resident = {
    h: first.hnf.result_h.toArray().slice(0, 9),
    dep: first.hnf.result_dep.toArray().slice(0, 12),
    b: first.hnf.result_b.toArray().slice(0, 7 * 792),
    c: first.hnf.result_c.toArray().slice(0, 7 * PLACES * 802),
    perm: Array.from(first.hnf.perm), state: Array.from(first.hnf.state).map(Number),
  };
  const snapshot = columns => ({ columns, state: resident.state.slice(),
    h: resident.h.map(String), dep: resident.dep.map(String), b: resident.b.map(String),
    c: resident.c.map(String), perm: resident.perm.map(String) });
  const next = await compile("row14_next_pass.py", "pari_row14_prepare_next_pass");
  const append = await compile("hnfadd.py", "pari_hnfadd");
  const checkpoints = [snapshot(802)], expected = [804, 805, 806], passTrace = [];
  let checkpointIndex = 0, collectionPasses = 1, squash = 0, appendPeakBytes = 0;
  while (checkpointIndex < expected.length) {
    collectionPasses += 1;
    assert(collectionPasses <= 8, "row-14 continuation exceeded eight authentic passes");
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
    cv.outer_ru = BigInt(PLACES); cv.scalar_prefix_count = 42n;
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
      if (kind === "Int64Buffer") { bytes += 8*values.length;
        av[name] = append.fn.createInt64Buffer(values); }
      else { bytes += values.length*(4+8*16);
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
    ownerBytesUpperBound, preparedRng: root.rng.slice() };
}

module.exports = { PREPARED_KEYS, runPreparedGateC, validateBoundary };

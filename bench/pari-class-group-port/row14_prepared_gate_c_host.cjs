"use strict";

// Gate C: hydrate the live collector from the committed prepared-root owner.
// This module never reads the historical capsule or W0 trace.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const { zeroLengths } = require("./row14_first_hnf_host.cjs");

const ROWS = 799, DEGREE = 4, PLACES = 3, FIRST_COLUMNS = 802;
const PROFILE_CLOCKS = Object.freeze({
  pari_collect_and_log_relations: Object.freeze({
    function: "pari_collect_and_log_relations",
    stages: Object.freeze(["entry", "preflight", "relation-collector",
      "log-embeddings", "return"]),
    maximumVisits: 8,
  }),
  pari_hnfspec_complete: Object.freeze({
    function: "pari_hnfspec_complete",
    stages: Object.freeze(["entry", "preflight", "sparse-cleanup",
      "cup-rank", "assembly-and-log-transform", "hnffinal", "publication"]),
    maximumVisits: 10,
  }),
  pari_hnfadd: Object.freeze({
    function: "pari_hnfadd",
    stages: Object.freeze(["entry", "preflight", "assembly-and-log-products",
      "rectangular-rank", "hnffinal", "publication"]),
    maximumVisits: 10,
  }),
});
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

async function compile(sourceName, exportName, profile = false) {
  const source = path.join(__dirname, sourceName);
  const options = { sourcePath: source };
  if (profile) options.diagnosticStageClock = PROFILE_CLOCKS[exportName];
  const built = await compileKernel(options);
  const fn = require(built.modulePath)[exportName];
  assert(fn?.nativeAvailable);
  return { fn, names: signature(source, exportName), built };
}

function record(profile, label, started) {
  if (profile === null) return;
  profile.outer.push({ label, nanoseconds: String(process.hrtime.bigint() - started) });
}

function timed(profile, label, action) {
  if (profile === null) return action();
  const started = process.hrtime.bigint();
  try { return action(); } finally { record(profile, label, started); }
}

async function timedAsync(profile, label, action) {
  if (profile === null) return action();
  const started = process.hrtime.bigint();
  try { return await action(); } finally { record(profile, label, started); }
}

function nativeTrace(fn) {
  if (typeof fn.diagnosticStageTrace !== "function") return null;
  const trace = fn.diagnosticStageTrace();
  return {
    ...trace,
    rootNanoseconds: String(trace.rootNanoseconds),
    totalsNanoseconds: Object.fromEntries(Object.entries(trace.totalsNanoseconds)
      .map(([name, value]) => [name, String(value)])),
    visits: trace.visits.map(visit => ({ ...visit,
      nanoseconds: String(visit.nanoseconds) })),
  };
}

function generatedFacts(compiled, root) {
  const source = fs.readFileSync(compiled.built.coreSourcePath, "utf8");
  const count = pattern => (source.match(pattern) || []).length;
  const graph = compiled.built.ir.callGraph;
  const reachable = new Set(), pending = [root];
  while (pending.length !== 0) {
    const name = pending.pop();
    if (reachable.has(name)) continue;
    reachable.add(name);
    for (const callee of graph[name] || []) pending.push(callee);
  }
  const nativeStart = source.indexOf(`static int native_${root}(`);
  const nativeHeader = nativeStart < 0 ? "" : source.slice(nativeStart,
    source.indexOf("\n", nativeStart));
  return {
    root, cacheKey: compiled.built.cacheKey, cachedAddon: compiled.built.cached,
    generatedBytes: Buffer.byteLength(source), generatedLines: source.split("\n").length,
    reachableFunctions: reachable.size,
    publicPrivateCloneCount: compiled.built.privateFunctions.length,
    automaticSelectionCount: Object.keys(compiled.built.automaticSelections).length,
    nativeRootScalarMpzParameters: countHeader(nativeHeader, /const mpz_t /g),
    nativeFunctionDefinitions: count(/static int native_[a-zA-Z0-9_]+\([^;]*\)\n\{/g),
    taggedFunctionDefinitions: count(/static int tagged_[a-zA-Z0-9_]+\([^;]*\)\n\{/g),
    mpzSetSites: count(/\bmpz_set(?:_si|_ui)?\s*\(/g),
    mpzArithmeticSites: count(/\bmpz_(?:add|sub|mul|fdiv_q|fdiv_r|neg|abs)\s*\(/g),
    mpzInitSites: count(/\bmpz_init\s*\(/g),
    mpzClearSites: count(/\bmpz_clear\s*\(/g),
    integerBufferIndexSites: count(/\bsagejs_(?:mpz_)?integer_buffer_index\s*\(/g),
    integerBufferGetMpzSites: count(/\bsagejs_integer_buffer_get_mpz\s*\(/g),
    integerBufferGetInt64Sites: count(/\bsagejs_integer_buffer_get_int64\s*\(/g),
    taggedToInt64Sites: count(/\bsagejs_tagged_to_int64\s*\(/g),
  };
}

function countHeader(header, pattern) { return (header.match(pattern) || []).length; }

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
  let bytes = 0, elements = 0, integerBuffers = 0, int64Buffers = 0, float64Buffers = 0;
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
    elements += length;
    if (kind === "Float64Buffer") {
      float64Buffers += 1;
      bytes += 8 * length;
      values[name] = compiled.fn.createFloat64Buffer(
        supplied === undefined ? length : supplied.map(Number));
    } else if (kind === "Int64Buffer") {
      int64Buffers += 1;
      bytes += 8 * length;
      values[name] = compiled.fn.createInt64Buffer(
        supplied === undefined ? length : supplied.map(BigInt));
    } else {
      integerBuffers += 1;
      const capacity = words(supplied, compact.has(name) ? 1 : minimumWords);
      bytes += length * (4 + 8 * capacity);
      values[name] = compiled.fn.createIntegerBuffer(length, capacity,
        supplied === undefined ? undefined : supplied.map(BigInt));
    }
  }
  return { values, bytes, elements, integerBuffers, int64Buffers, float64Buffers };
}

async function firstPreparedHnf(prepared, root, options = {}) {
  const profile = options.profile || null;
  const kernels = options.kernels || null;
  timed(profile, "initial.validate-boundary", () => validateBoundary(prepared, root));
  const lengths = zeroLengths();
  const collector = kernels?.collector || await timedAsync(
    profile, "initial.compile-collector", () => compile(
      "collected_log_embeddings.py", "pari_collect_and_log_relations", profile !== null));
  if (profile !== null) profile._compiled.push([collector, "pari_collect_and_log_relations"]);
  const compact = new Set(["relation_basis", "relation_records", "relation_hashes",
    "relation_metadata", "relation", "relation_scratch", "generators"]);
  const allocated = timed(profile, "initial.allocate-collector", () =>
    allocate(collector, collectorInput(prepared, root), lengths,
      { minimumWords: 8, compact }));
  if (profile !== null) profile.allocations.push({ label: "initial.collector",
    bytes: allocated.bytes, elements: allocated.elements,
    integerBuffers: allocated.integerBuffers, int64Buffers: allocated.int64Buffers,
    float64Buffers: allocated.float64Buffers });
  const cv = allocated.values;
  const status = timed(profile, "initial.collector", () =>
    collector.fn.gmp(...collector.names.map(([name]) => cv[name])));
  if (profile !== null) profile.native.push({ label: "initial.collector",
    trace: nativeTrace(collector.fn) });
  assert(status === 0n || status === 1n);
  assert.deepEqual(cv.relation_state.toArray().map(String),
    ["802", "8110", "4", "0", "0", "802"]);
  assert.equal(Number(cv.log_completed.toArray()[0]), FIRST_COLUMNS);

  const hnf = kernels?.hnfspec || await timedAsync(
    profile, "initial.compile-hnfspec", () => compile(
      "hnfspec_complete.py", "pari_hnfspec_complete", profile !== null));
  if (profile !== null) profile._compiled.push([hnf, "pari_hnfspec_complete"]);
  const hnfInput = { rows: ROWS, columns: FIRST_COLUMNS, k0: 4, log_rows: PLACES,
    original: cv.relation_records.toArray().slice(0, ROWS * FIRST_COLUMNS),
    perm: root.factor.permutation, logs: cv.log_embeddings.toArray() };
  const hnfLengths = Object.fromEntries(hnf.names.map(([name]) =>
    [name, lengths[name === "pivots" ? "hnf_rank_pivots" : `hnf_${name}`]]));
  const hnfCompact = new Set(["cup_arena", "cup_frames"]);
  const ha = timed(profile, "initial.allocate-hnfspec", () =>
    allocate(hnf, hnfInput, hnfLengths, { minimumWords: 16, compact: hnfCompact }));
  if (profile !== null) profile.allocations.push({ label: "initial.hnfspec",
    bytes: ha.bytes, elements: ha.elements, integerBuffers: ha.integerBuffers,
    int64Buffers: ha.int64Buffers, float64Buffers: ha.float64Buffers });
  assert.equal(timed(profile, "initial.hnfspec", () =>
    hnf.fn.gmp(...hnf.names.map(([name]) => ha.values[name]))), 0n);
  if (profile !== null) profile.native.push({ label: "initial.hnfspec",
    trace: nativeTrace(hnf.fn) });
  assert.deepEqual(Array.from(ha.values.state).map(Number),
    [3, 10, 792, 4, 7, 105, 0, 802, 0]);
  return { collector, cv, hnf: ha.values, ownerBytes: allocated.bytes + ha.bytes };
}

async function warmPreparedGateC({ profile = false } = {}) {
  // Compilation/loading belongs outside every mathematical timing boundary.
  // Return the authenticated resident handles so a matched run does not parse,
  // lower, or inspect the large graphs again after its clock has started.
  const collector = await compile(
    "collected_log_embeddings.py", "pari_collect_and_log_relations", profile);
  const hnfspec = await compile(
    "hnfspec_complete.py", "pari_hnfspec_complete", profile);
  const next = await compile("row14_next_pass.py", "pari_row14_prepare_next_pass");
  const hnfadd = await compile("hnfadd.py", "pari_hnfadd", profile);
  return Object.freeze({ collector, hnfspec, next, hnfadd, profile: Boolean(profile) });
}

async function runPreparedGateC(prepared, root, options = {}) {
  const profile = options.profile
    ? { outer: [], native: [], builds: [], allocations: [], _compiled: [] }
    : null;
  const kernels = options.kernels || null;
  if (kernels !== null) {
    assert.equal(kernels.profile, profile !== null,
      "prepared Gate-C handle instrumentation mismatch");
  }
  const gateStarted = profile === null ? 0n : process.hrtime.bigint();
  const first = await firstPreparedHnf(prepared, root, { profile, kernels });
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
  const next = kernels?.next || await timedAsync(
    profile, "continuation.compile-control", () =>
      compile("row14_next_pass.py", "pari_row14_prepare_next_pass"));
  const append = kernels?.hnfadd || await timedAsync(
    profile, "continuation.compile-hnfadd", () =>
      compile("hnfadd.py", "pari_hnfadd", profile !== null));
  if (profile !== null) profile._compiled.push([append, "pari_hnfadd"]);
  const checkpoints = [snapshot(802)], expected = [804, 805, 806], passTrace = [];
  let checkpointIndex = 0, collectionPasses = 1, squash = 0, appendPeakBytes = 0;
  while (checkpointIndex < expected.length) {
    collectionPasses += 1;
    assert(collectionPasses <= 8, "row-14 continuation exceeded eight authentic passes");
    const need = ROWS - resident.state[0] - resident.state[2];
    const passNumber = collectionPasses - 1;
    const setupStarted = profile === null ? 0n : process.hrtime.bigint();
    const search = next.fn.createIntegerBuffer(ROWS, 1, cv.search_ideals.toArray());
    const outerPerm = next.fn.createIntegerBuffer(ROWS, 1, cv.outer_perm.toArray());
    const outer = next.fn.createInt64Buffer(Array.from(cv.outer_state));
    const cache = next.fn.createIntegerBuffer(6, 1, cv.relation_state.toArray());
    const schedule = next.fn.createInt64Buffer(Array.from(cv.schedule));
    const completed = next.fn.createIntegerBuffer(1, 1, cv.log_completed.toArray());
    const control = next.fn.createInt64Buffer(3), perm = next.fn.createInt64Buffer(resident.perm);
    assert.equal(next.fn.gmp(perm, BigInt(ROWS), BigInt(resident.state[0]), BigInt(need),
      BigInt(squash), search, outerPerm, 1n, outer, cache, schedule, completed, control), 0n);
    record(profile, `pass-${passNumber}.control-and-setup`, setupStarted);
    if (profile !== null) profile.allocations.push({
      label: `pass-${passNumber}.control-and-setup`, bytes: 45304,
      elements: 4058, integerBuffers: 8, int64Buffers: 6, float64Buffers: 0,
    });
    const nextControl = Array.from(control).map(Number); squash = nextControl[1];
    cv.search_ideals = first.collector.fn.createIntegerBuffer(ROWS, 1, search.toArray());
    cv.outer_perm = first.collector.fn.createIntegerBuffer(ROWS, 1, outerPerm.toArray());
    cv.outer_state = first.collector.fn.createInt64Buffer(Array.from(outer));
    cv.relation_state = first.collector.fn.createIntegerBuffer(6, 1, cache.toArray());
    cv.schedule = first.collector.fn.createInt64Buffer(Array.from(schedule));
    cv.log_completed = first.collector.fn.createIntegerBuffer(1, 1, completed.toArray());
    cv.search_count = BigInt(nextControl[0]); cv.outer_mode = 1n;
    cv.outer_ru = BigInt(PLACES); cv.scalar_prefix_count = 42n;
    assert.equal(timed(profile, `pass-${passNumber}.collector`, () =>
      first.collector.fn.gmp(...first.collector.names.map(([name]) => cv[name]))), 0n);
    if (profile !== null) profile.native.push({ label: `pass-${passNumber}.collector`,
      trace: nativeTrace(first.collector.fn) });
    const relationState = cv.relation_state.toArray().map(Number);
    const columns = relationState[0], oldColumns = resident.state[7];
    passTrace.push({ pass: collectionPasses - 1, need, searchCount: nextControl[0], squash,
      before: oldColumns, after: columns, schedule: Array.from(cv.schedule).map(Number),
      outer: Array.from(cv.outer_state).map(Number) });
    if (columns === oldColumns) continue;
    const materializeStarted = profile === null ? 0n : process.hrtime.bigint();
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
    const av = {}; let bytes = 0, elements = 0, integerBuffers = 0, int64Buffers = 0;
    for (const [name, kind] of append.names) {
      const supplied = explicit[name];
      if (!kind.endsWith("Buffer")) { av[name] = BigInt(supplied); continue; }
      const values = supplied === undefined ? Array(sizes[name]).fill(0n) : supplied.map(BigInt);
      elements += values.length;
      if (kind === "Int64Buffer") { bytes += 8*values.length; int64Buffers += 1;
        av[name] = append.fn.createInt64Buffer(values); }
      else { bytes += values.length*(4+8*16); integerBuffers += 1;
        av[name] = append.fn.createIntegerBuffer(values.length, 16, values); }
    }
    if (profile !== null) profile.allocations.push({ label: `pass-${passNumber}.hnfadd`,
      bytes, elements, integerBuffers, int64Buffers, float64Buffers: 0 });
    record(profile, `pass-${passNumber}.materialize-and-allocate-hnfadd`, materializeStarted);
    appendPeakBytes = Math.max(appendPeakBytes, bytes);
    assert.equal(timed(profile, `pass-${passNumber}.hnfadd`, () =>
      append.fn.gmp(...append.names.map(([name]) => av[name]))), 0n);
    if (profile !== null) profile.native.push({ label: `pass-${passNumber}.hnfadd`,
      trace: nativeTrace(append.fn) });
    const publishStarted = profile === null ? 0n : process.hrtime.bigint();
    resident.state = Array.from(av.state).map(Number); resident.perm = Array.from(av.perm);
    const newH = resident.state[0], newB = resident.state[2], depRows = ROWS-newB-newH;
    resident.h = av.result_h.toArray().slice(0, newH*newH);
    resident.dep = av.result_dep.toArray().slice(0, depRows*newH);
    resident.b = av.result_b.toArray().slice(0, (ROWS-newB)*newB);
    resident.c = av.result_c.toArray().slice(0, 7*PLACES*columns);
    relationState[4] = columns;
    cv.relation_state = first.collector.fn.createIntegerBuffer(6, 1, relationState.map(BigInt));
    checkpoints.push(snapshot(columns)); checkpointIndex += 1;
    record(profile, `pass-${passNumber}.publish-resident`, publishStarted);
  }
  const ownerBytesUpperBound = first.ownerBytes + appendPeakBytes;
  assert(ownerBytesUpperBound < 4 * 1024 ** 3);
  if (profile !== null) {
    profile.gateNanoseconds = String(process.hrtime.bigint() - gateStarted);
    profile.builds = profile._compiled.map(([compiled, root]) => generatedFacts(compiled, root));
    delete profile._compiled;
  }
  return { collectorValues: cv, resident, checkpoints, passTrace, collectionPasses,
    ownerBytesUpperBound, preparedRng: root.rng.slice(), executionBoundary: {
      compilationInsideRun: kernels === null,
      residentHandleCount: kernels === null ? 0 : 4,
      residentHandleCacheKeys: kernels === null ? [] : [
        kernels.collector.built.cacheKey, kernels.hnfspec.built.cacheKey,
        kernels.next.built.cacheKey, kernels.hnfadd.built.cacheKey,
      ],
    }, ...(profile === null ? {} : { profile }) };
}

module.exports = { PREPARED_KEYS, runPreparedGateC, validateBoundary, warmPreparedGateC };

"use strict";

// Gate C: hydrate the live collector from the committed prepared-root owner.
// This module accepts only the authenticated prepared-root owner.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const { zeroLengths } = require("./row14_first_hnf_host.cjs");

const ROWS = 288, DEGREE = 4, PLACES = 3, FIRST_COLUMNS = 293;
// These are the three authenticated nonempty continuation shapes.  Empty
// collector passes do not enter hnfadd.  Keeping the shapes here makes the
// reusable owner envelope independent of any answer produced during the run.
const APPEND_SHAPES = Object.freeze([
  Object.freeze({ oldState: Object.freeze([4, -999, 282, 2, -999, -999, 0, 293, 0]),
    newColumns: 2 }),
  Object.freeze({ oldState: Object.freeze([5, -999, 283, 0, -999, -999, 0, 295, 0]),
    newColumns: 4 }),
  Object.freeze({ oldState: Object.freeze([3, -999, 285, 0, -999, -999, 0, 299, 0]),
    newColumns: 1 }),
  Object.freeze({ oldState: Object.freeze([3, -999, 285, 0, -999, -999, 0, 300, 0]),
    newColumns: 3 }),
]);
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
  assert.equal(root.schema, "sagejs.pari-class-group/row10-prepared-initial-owner-v1");
  assert.equal(root.authority.preparedAuthoritySha256, prepared.authoritySha256);
  assert.deepEqual(root.rootState, ["1", "1698", "1698", "288", "167", "167",
    "288", "4", "288", "26", "295", "269", "4", "262", "288", "0",
    "1048576", "65537"]);
  assert.deepEqual(root.relations.state, ["26", "3000", "262", "7", "0", "295"]);
  assert.equal(root.relations.denseRecords.length, 26 * ROWS);
  assert.equal(root.relations.basis.length, ROWS * ROWS);
  assert.equal(root.factor.permutation.length, ROWS);
  assert.deepEqual(root.handoff.searchIdeals, root.factor.permutation);
  assert.deepEqual(root.factor.subfactor, ["4", "6", "2", "8"]);
  assert.deepEqual(root.field.polynomial, prepared.data.prep_polynomial);
  assert.equal(root.field.discriminant, prepared.data.analytic_discriminant);
  assert.equal(root.field.precision, Number(prepared.data.precision));
  assert.equal(root.capacity.logicalRows, ROWS);
  assert.equal(root.capacity.logicalRecordCapacity, 3000);
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
    outer_mode: 1, outer_ru: PLACES, log_precision: 192, scalar_prefix_count: 26,
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
    relation_state: ["26", "3000", "262", "7", "0", String(FIRST_COLUMNS)],
    relation_basis: root.relations.basis,
    relation_records: [...root.relations.denseRecords,
      ...Array((3000 - 26) * ROWS).fill("0")],
    relation_hashes: [...root.relations.hashes, ...Array(3000 - 26).fill("0")],
    relation_metadata: [...root.relations.metadata, ...Array((3000 - 26) * 3).fill("0")],
    generators: [...root.relations.generators, ...Array((3000 - 26) * DEGREE).fill("0")],
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

function allocationFacts(label, allocated) {
  return { label, bytes: allocated.bytes, elements: allocated.elements,
    integerBuffers: allocated.integerBuffers, int64Buffers: allocated.int64Buffers,
    float64Buffers: allocated.float64Buffers };
}

function appendSizes(state, newColumns) {
  const hRows = state[0], bColumns = state[2], totalColumns = state[7];
  const lig = ROWS - bColumns, width = hRows + newColumns;
  const cWidth = width + bColumns, depRows = lig - hRows;
  return {
    h: hRows*hRows, dep: depRows*hRows, b: lig*bColumns,
    logs: 7*PLACES*totalColumns, perm: ROWS,
    new_relations: ROWS*newColumns, new_logs: 7*PLACES*newColumns,
    top: lig*newColumns, exact_product: lig*newColumns,
    log_product: 7*PLACES*newColumns, adjusted_logs: 7*PLACES*newColumns,
    joined: lig*width, joined_logs: 7*PLACES*cWidth,
    rank_matrix: lig*width, occupied: width, pivots: lig, best: lig,
    profile: lig, rank_state: 10, perm_work: ROWS, matb: lig*width,
    new_dep: lig*width, permuted_b: lig*bColumns, full_h: lig*width,
    transform: width*width, lam: width*width, d: width+1, hnf_state: 11,
    full_dep: lig*width, work_b: lig*bColumns,
    work_c: 7*PLACES*cWidth, diagonal: lig, final_c: 7*PLACES*cWidth,
    result_h: lig*lig, result_dep: lig*lig,
    result_b: lig*(bColumns+lig),
    result_c: 7*PLACES*(totalColumns+newColumns), final_state: 7, state: 9,
  };
}

function appendCapacityEnvelope() {
  const answer = {};
  for (const shape of APPEND_SHAPES) {
    for (const [name, length] of Object.entries(
      appendSizes(shape.oldState, shape.newColumns))) {
      answer[name] = Math.max(answer[name] || 0, length);
    }
  }
  return Object.freeze(answer);
}

const APPEND_CAPACITIES = appendCapacityEnvelope();

function packedIntegerOwner(value) {
  return value !== null && typeof value === "object" &&
    value.sizes instanceof Int32Array && value.limbs instanceof BigUint64Array &&
    Number.isSafeInteger(value.length) && Number.isSafeInteger(value.wordCapacity) &&
    value.sizes.length >= value.length &&
    value.limbs.length >= value.length * value.wordCapacity;
}

function exactBufferValue(source, index) {
  if (source?.integerRegion === true)
    return exactBufferValue(source.owner, source.offset + index);
  if (!packedIntegerOwner(source)) return BigInt(source[index]);
  const signedWords = source.sizes[index], count = Math.abs(signedWords);
  assert(count <= source.wordCapacity, "source IntegerBuffer slot exceeds capacity");
  let result = 0n, offset = index * source.wordCapacity;
  for (let word = count - 1; word >= 0; word -= 1)
    result = (result << 64n) + source.limbs[offset + word];
  return signedWords < 0 ? -result : result;
}

function integerRegion(owner, offset, length) {
  assert(packedIntegerOwner(owner), "IntegerBuffer region requires packed owner");
  assert(Number.isSafeInteger(offset) && Number.isSafeInteger(length) &&
    offset >= 0 && length >= 0 && offset + length <= owner.length,
  "IntegerBuffer region is outside its owner");
  return Object.freeze({ integerRegion: true, owner, offset, length });
}

function writeIntegerSlot(target, index, raw) {
  let value = BigInt(raw), negative = value < 0n;
  if (negative) value = -value;
  const offset = index * target.wordCapacity;
  let count = 0;
  while (value !== 0n) {
    assert(count < target.wordCapacity, "reusable IntegerBuffer capacity exceeded");
    target.limbs[offset + count] = BigInt.asUintN(64, value);
    value >>= 64n; count += 1;
  }
  target.sizes[index] = negative ? -count : count;
}

function copyBufferPrefix(target, source, count) {
  assert(Number.isSafeInteger(count) && count >= 0 && count <= target.length,
    "invalid reusable owner logical prefix");
  const sourceLength = packedIntegerOwner(source) ? source.length : source.length;
  assert(Number.isSafeInteger(sourceLength) && sourceLength >= count,
    "short reusable owner source");
  if (target instanceof BigInt64Array) {
    for (let index = 0; index < count; index += 1) {
      const value = exactBufferValue(source, index);
      assert(value >= -(1n << 63n) && value < (1n << 63n),
        "reusable Int64Buffer value is outside signed int64");
      target[index] = value;
    }
    return;
  }
  assert(packedIntegerOwner(target), "unknown reusable owner kind");
  for (let index = 0; index < count; index += 1)
    writeIntegerSlot(target, index, exactBufferValue(source, index));
}

function resetReusableOwner(owner) {
  if (owner instanceof BigInt64Array) owner.fill(0n);
  else {
    assert(packedIntegerOwner(owner), "unknown reusable owner kind");
    // A zero signed size is the canonical semantic zero.  Limbs are ignored
    // and overwritten before becoming live, so no O(capacity*words) wipe is
    // needed between transactions.
    owner.sizes.fill(0);
  }
}

function resetTypedOwners(compiled, values) {
  for (const [name, kind] of compiled.names) {
    if (!kind.endsWith("Buffer")) continue;
    const owner = values[name];
    if (owner instanceof Float64Array) owner.fill(0);
    else resetReusableOwner(owner);
  }
}

function createInitialGateStorage(collector, hnfspec, prepared, root) {
  validateBoundary(prepared, root);
  const lengths = zeroLengths();
  const compact = new Set(["relation_basis", "relation_records", "relation_hashes",
    "relation_metadata", "relation", "relation_scratch", "generators"]);
  const collectorStorage = allocate(collector, collectorInput(prepared, root), lengths,
    { minimumWords: 8, compact });
  const hnfLengths = Object.fromEntries(hnfspec.names.map(([name]) =>
    [name, lengths[name === "pivots" ? "hnf_rank_pivots" : `hnf_${name}`]]));
  hnfLengths.original = ROWS * FIRST_COLUMNS;
  hnfLengths.perm = ROWS;
  hnfLengths.logs = 7 * PLACES * FIRST_COLUMNS;
  const hnfStorage = allocate(hnfspec,
    { rows: ROWS, columns: FIRST_COLUMNS, k0: 4, log_rows: PLACES }, hnfLengths,
    { minimumWords: 16, compact: new Set(["cup_arena", "cup_frames"]) });
  return {
    prepared, root, collector, hnfspec, collectorStorage, hnfStorage,
    consumed: false,
    ownerConstructions: collector.names.filter(([, kind]) => kind.endsWith("Buffer")).length +
      hnfspec.names.filter(([, kind]) => kind.endsWith("Buffer")).length,
    bytes: collectorStorage.bytes + hnfStorage.bytes,
    elements: collectorStorage.elements + hnfStorage.elements,
  };
}

function claimInitialGateStorage(storage, collector, hnfspec, prepared, root) {
  assert.equal(storage.prepared, prepared,
    "prepared initial storage belongs to a different prepared envelope");
  assert.equal(storage.root, root,
    "prepared initial storage belongs to a different initial owner");
  assert.equal(storage.collector, collector,
    "prepared initial storage belongs to a different collector handle");
  assert.equal(storage.hnfspec, hnfspec,
    "prepared initial storage belongs to a different hnfspec handle");
  assert.equal(storage.consumed, false, "prepared initial storage was already consumed");
  storage.consumed = true;
  return storage;
}

function loadInitialHnfspecStorage(storage, cv, root) {
  const values = storage.hnfStorage.values;
  resetTypedOwners(storage.hnfspec, values);
  copyBufferPrefix(values.original, cv.relation_records, ROWS * FIRST_COLUMNS);
  copyBufferPrefix(values.perm, root.factor.permutation, ROWS);
  copyBufferPrefix(values.logs, cv.log_embeddings, 7 * PLACES * FIRST_COLUMNS);
  values.rows = BigInt(ROWS); values.columns = BigInt(FIRST_COLUMNS);
  values.k0 = 4n; values.log_rows = BigInt(PLACES);
  return values;
}

function createHnfaddTransactionStorage(append) {
  const values = {}, capacities = { ...APPEND_CAPACITIES };
  let bytes = 0, elements = 0, integerBuffers = 0, int64Buffers = 0;
  for (const [name, kind] of append.names) {
    if (!kind.endsWith("Buffer")) continue;
    const length = capacities[name];
    assert.notEqual(length, undefined, `missing reusable capacity ${name}`);
    assert(kind === "IntegerBuffer" || kind === "Int64Buffer",
      `unreviewed reusable owner type ${kind}`);
    elements += length;
    if (kind === "Int64Buffer") {
      values[name] = append.fn.createInt64Buffer(length);
      bytes += 8*length; int64Buffers += 1;
    } else {
      values[name] = append.fn.createIntegerBuffer(length, 16);
      bytes += length*(4+8*16); integerBuffers += 1;
    }
  }
  assert.equal(integerBuffers + int64Buffers,
    append.names.filter(([, kind]) => kind.endsWith("Buffer")).length);
  return { values, capacities: Object.freeze(capacities), bytes, elements,
    integerBuffers, int64Buffers, ownerConstructions: integerBuffers + int64Buffers,
    resets: 0 };
}

function prepareHnfaddTransaction(storage, append, state, newColumns, explicit) {
  const shape = APPEND_SHAPES.find(candidate =>
    candidate.newColumns === newColumns &&
    candidate.oldState.every((value, index) => value === -999 || value === state[index]));
  assert(shape, `unreviewed row-10 hnfadd transaction shape: ${JSON.stringify({
    state, newColumns })}`);
  const logical = appendSizes(state, newColumns);
  const requiredInputs = ["h", "dep", "b", "logs", "perm", "new_relations", "new_logs"];
  for (const name of requiredInputs) {
    const supplied = explicit[name];
    assert.notEqual(supplied, undefined, `missing reusable hnfadd input ${name}`);
    const length = supplied.length;
    assert.equal(length, logical[name], `noncanonical logical prefix ${name}`);
  }
  for (const [name, kind] of append.names) {
    if (!kind.endsWith("Buffer")) continue;
    assert(storage.capacities[name] >= logical[name], `short reusable capacity ${name}`);
    resetReusableOwner(storage.values[name]);
  }
  for (const name of requiredInputs)
    copyBufferPrefix(storage.values[name], explicit[name], logical[name]);
  const scalars = {
    h_rows: state[0], b_columns: state[2], total_columns: state[7],
    log_rows: PLACES, rows: ROWS, new_columns: newColumns,
  };
  for (const [name, kind] of append.names) {
    if (!kind.endsWith("Buffer")) {
      assert.notEqual(scalars[name], undefined, `missing reusable scalar ${name}`);
      storage.values[name] = BigInt(scalars[name]);
    }
  }
  storage.resets += 1;
  return { values: storage.values, logical };
}

function createContinuationControlStorage(next, cv) {
  const integer = ["search_ideals", "outer_perm", "relation_state", "log_completed"];
  const int64 = ["outer_state", "schedule"];
  for (const name of integer) assert(packedIntegerOwner(cv[name]),
    `continuation owner ${name} is not a packed IntegerBuffer`);
  for (const name of int64) assert(cv[name] instanceof BigInt64Array,
    `continuation owner ${name} is not an Int64Buffer`);
  assert.equal(cv.search_ideals.length, ROWS);
  assert.equal(cv.outer_perm.length, ROWS);
  assert.equal(cv.relation_state.length, 6);
  assert.equal(cv.log_completed.length, 1);
  assert.equal(cv.outer_state.length, 19);
  assert.equal(cv.schedule.length, 4);
  return { search: cv.search_ideals, outerPerm: cv.outer_perm,
    outer: cv.outer_state, cache: cv.relation_state, schedule: cv.schedule,
    completed: cv.log_completed, control: next.fn.createInt64Buffer(3),
    perm: next.fn.createInt64Buffer(ROWS), ownerConstructions: 2,
    bytes: 8*(3+ROWS), elements: 3+ROWS };
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
  const preparedStorage = kernels?.initialStorage === undefined ? null :
    claimInitialGateStorage(kernels.initialStorage, collector, kernels.hnfspec,
      prepared, root);
  const compact = new Set(["relation_basis", "relation_records", "relation_hashes",
    "relation_metadata", "relation", "relation_scratch", "generators"]);
  const allocated = preparedStorage?.collectorStorage || timed(
    profile, "initial.allocate-collector", () =>
      allocate(collector, collectorInput(prepared, root), lengths,
        { minimumWords: 8, compact }));
  if (profile !== null) profile.allocations.push(allocationFacts(
    preparedStorage === null ? "initial.collector" : "prepared.initial.collector",
    allocated));
  const cv = allocated.values;
  const status = timed(profile, "initial.collector", () =>
    collector.fn.gmp(...collector.names.map(([name]) => cv[name])));
  if (profile !== null) profile.native.push({ label: "initial.collector",
    trace: nativeTrace(collector.fn) });
  assert(status === 0n || status === 1n);
  const firstRelationState = cv.relation_state.toArray().map(String);
  assert.equal(firstRelationState[0], "293");
  assert.equal(firstRelationState[1], "3000");
  assert.equal(firstRelationState[5], "293");
  assert.equal(Number(cv.log_completed.toArray()[0]), FIRST_COLUMNS);

  const hnf = kernels?.hnfspec || await timedAsync(
    profile, "initial.compile-hnfspec", () => compile(
      "hnfspec_complete.py", "pari_hnfspec_complete", profile !== null));
  if (profile !== null) profile._compiled.push([hnf, "pari_hnfspec_complete"]);
  const hnfInput = preparedStorage === null
    ? { rows: ROWS, columns: FIRST_COLUMNS, k0: 4, log_rows: PLACES,
      original: cv.relation_records.toArray().slice(0, ROWS * FIRST_COLUMNS),
      perm: root.factor.permutation, logs: cv.log_embeddings.toArray() }
    : null;
  const hnfLengths = Object.fromEntries(hnf.names.map(([name]) =>
    [name, lengths[name === "pivots" ? "hnf_rank_pivots" : `hnf_${name}`]]));
  const hnfCompact = new Set(["cup_arena", "cup_frames"]);
  const ha = preparedStorage?.hnfStorage || timed(profile, "initial.allocate-hnfspec", () =>
    allocate(hnf, hnfInput, hnfLengths, { minimumWords: 16, compact: hnfCompact }));
  if (preparedStorage !== null) timed(profile, "initial.reset-and-load-hnfspec", () =>
    loadInitialHnfspecStorage(preparedStorage, cv, root));
  if (profile !== null) profile.allocations.push(allocationFacts(
    preparedStorage === null ? "initial.hnfspec" : "prepared.initial.hnfspec", ha));
  assert.equal(timed(profile, "initial.hnfspec", () =>
    hnf.fn.gmp(...hnf.names.map(([name]) => ha.values[name]))), 0n);
  if (profile !== null) profile.native.push({ label: "initial.hnfspec",
    trace: nativeTrace(hnf.fn) });
  const firstState = Array.from(ha.values.state).map(Number);
  assert.deepEqual([firstState[0], firstState[2], firstState[3], firstState[4]],
    [4, 282, 2, 7]);
  assert.deepEqual(firstState.slice(6), [0, 293, 0]);
  return { collector, cv, hnf: ha.values, ownerBytes: allocated.bytes + ha.bytes };
}

async function warmPreparedGateC({ profile = false, prepared, root } = {}) {
  // Compilation/loading belongs outside every mathematical timing boundary.
  // Return the authenticated resident handles so a matched run does not parse,
  // lower, or inspect the large graphs again after its clock has started.
  const collector = await compile(
    "collected_log_embeddings.py", "pari_collect_and_log_relations", profile);
  const hnfspec = await compile(
    "hnfspec_complete.py", "pari_hnfspec_complete", profile);
  const next = await compile("row14_next_pass.py", "pari_row14_prepare_next_pass");
  const hnfadd = await compile("hnfadd.py", "pari_hnfadd", profile);
  assert.equal(prepared === undefined, root === undefined,
    "prepared Gate-C storage requires both prepared and root owners");
  const initialStorage = prepared === undefined ? undefined :
    createInitialGateStorage(collector, hnfspec, prepared, root);
  return Object.freeze({ collector, hnfspec, next, hnfadd,
    ...(initialStorage === undefined ? {} : { initialStorage }),
    profile: Boolean(profile) });
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
    h: first.hnf.result_h.toArray().slice(0, 4 * 4),
    dep: first.hnf.result_dep.toArray().slice(0, 2 * 4),
    b: first.hnf.result_b.toArray().slice(0, 6 * 282),
    c: first.hnf.result_c.toArray().slice(0, 7 * PLACES * FIRST_COLUMNS),
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
  const controlStorage = timed(profile, "continuation.allocate-control-storage", () =>
    createContinuationControlStorage(next, cv));
  const appendStorage = timed(profile, "continuation.allocate-hnfadd-storage", () =>
    createHnfaddTransactionStorage(append));
  if (profile !== null) {
    profile.allocations.push({ label: "continuation.control-storage",
      bytes: controlStorage.bytes, elements: controlStorage.elements,
      integerBuffers: 0, int64Buffers: controlStorage.ownerConstructions,
      float64Buffers: 0 });
    profile.allocations.push({ label: "continuation.hnfadd-storage",
      bytes: appendStorage.bytes, elements: appendStorage.elements,
      integerBuffers: appendStorage.integerBuffers,
      int64Buffers: appendStorage.int64Buffers, float64Buffers: 0 });
  }
  const checkpoints = [snapshot(FIRST_COLUMNS)], expected = [295, 299, 300, 303],
    passTrace = [];
  let checkpointIndex = 0, collectionPasses = 1, squash = 0;
  while (checkpointIndex < expected.length) {
    collectionPasses += 1;
    assert(collectionPasses <= 8, "row-10 continuation exceeded eight authentic passes");
    const rankNeed = ROWS - resident.state[0] - resident.state[2];
    // Once the ideal rank is complete, a failed analytic acceptance asks for
    // one more relation.  Keep this request explicit; the live collector is
    // still responsible for deciding how many candidates the pass yields.
    const need = Math.max(1, rankNeed);
    const passNumber = collectionPasses - 1;
    const setupStarted = profile === null ? 0n : process.hrtime.bigint();
    const { search, outerPerm, outer, cache, schedule, completed, control, perm } =
      controlStorage;
    control.fill(0n);
    if (rankNeed === 0) {
      // The regulator path has both an analytic candidate and a reconstruction
      // attempt before it requests RELAT.  These are source driver latches,
      // not retained answer data.
      outer[14] = 1n;
      outer[15] = 1n;
    }
    assert.equal(resident.perm.length, ROWS);
    for (let index = 0; index < ROWS; index += 1) perm[index] = BigInt(resident.perm[index]);
    assert.equal(next.fn.gmp(perm, BigInt(ROWS), BigInt(resident.state[0]), BigInt(need),
      BigInt(squash), search, outerPerm, 1n, outer, cache, schedule, completed, control), 0n);
    record(profile, `pass-${passNumber}.control-and-setup`, setupStarted);
    const nextControl = Array.from(control).map(Number); squash = nextControl[1];
    if (rankNeed === 0) {
      // Relation-search preparation precedes the regulator rejection in the
      // source driver.  Thus the retry uses the complete dimension-ready
      // permutation even though the later RELAT request is one.
      for (let index = 0; index < ROWS; index += 1) {
        writeIntegerSlot(search, index, resident.perm[index]);
        writeIntegerSlot(outerPerm, index, resident.perm[index]);
      }
      nextControl[0] = ROWS;
      squash += 1;
    }
    cv.search_count = BigInt(nextControl[0]); cv.outer_mode = 1n;
    cv.outer_ru = BigInt(PLACES); cv.scalar_prefix_count = 26n;
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
    const hRows = resident.state[0], bColumns = resident.state[2];
    const explicit = { h: resident.h, h_rows: hRows, dep: resident.dep, b: resident.b,
      b_columns: bColumns, logs: resident.c, total_columns: oldColumns,
      log_rows: PLACES, perm: resident.perm, rows: ROWS,
      new_relations: integerRegion(cv.relation_records, oldColumns*ROWS,
        newColumns*ROWS),
      new_columns: newColumns,
      new_logs: integerRegion(cv.log_embeddings, oldColumns*7*PLACES,
        newColumns*7*PLACES) };
    const av = prepareHnfaddTransaction(
      appendStorage, append, resident.state, newColumns, explicit).values;
    record(profile, `pass-${passNumber}.reset-and-load-hnfadd`, materializeStarted);
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
    copyBufferPrefix(cv.relation_state, relationState, relationState.length);
    checkpoints.push(snapshot(columns)); checkpointIndex += 1;
    record(profile, `pass-${passNumber}.publish-resident`, publishStarted);
  }
  const ownerBytesUpperBound = first.ownerBytes + appendStorage.bytes + controlStorage.bytes;
  assert(ownerBytesUpperBound < 4 * 1024 ** 3);
  if (profile !== null) {
    profile.gateNanoseconds = String(process.hrtime.bigint() - gateStarted);
    profile.builds = profile._compiled.map(([compiled, root]) => generatedFacts(compiled, root));
    delete profile._compiled;
  }
  return { collectorValues: cv, resident, checkpoints, passTrace, collectionPasses,
    ownerBytesUpperBound, preparedRng: root.rng.slice(), initialStorageReuse:
      kernels?.initialStorage === undefined ? null : {
        strategy: "authenticated-resident-fixed-owner-envelope",
        ownerConstructionsOutsideRun: kernels.initialStorage.ownerConstructions,
        bytes: kernels.initialStorage.bytes, elements: kernels.initialStorage.elements,
        consumedExactlyOnce: kernels.initialStorage.consumed,
      }, storageReuse: {
      strategy: "validated-fixed-envelope-reset-logical-state",
      hnfaddTransactions: appendStorage.resets,
      continuationPasses: collectionPasses - 1,
      legacyOwnerConstructions: (collectionPasses - 1)*14 + appendStorage.resets*39,
      reusedOwnerConstructions: controlStorage.ownerConstructions +
        appendStorage.ownerConstructions,
      legacyZeroArrays: appendStorage.resets*32,
      reusedZeroArrays: 0,
      controlOwnersConstructedOnce: controlStorage.ownerConstructions,
      hnfaddOwnersConstructedOnce: appendStorage.ownerConstructions,
      capacityElements: appendStorage.elements,
      capacityBytes: appendStorage.bytes,
    }, executionBoundary: {
      compilationInsideRun: kernels === null,
      residentHandleCount: kernels === null ? 0 : 4,
      residentHandleCacheKeys: kernels === null ? [] : [
        kernels.collector.built.cacheKey, kernels.hnfspec.built.cacheKey,
        kernels.next.built.cacheKey, kernels.hnfadd.built.cacheKey,
      ],
    }, ...(profile === null ? {} : { profile }) };
}

module.exports = { APPEND_CAPACITIES, APPEND_SHAPES, PREPARED_KEYS,
  createContinuationControlStorage, createHnfaddTransactionStorage,
  createInitialGateStorage,
  prepareHnfaddTransaction, runPreparedGateC, validateBoundary, warmPreparedGateC };

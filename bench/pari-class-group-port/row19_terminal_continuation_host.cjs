"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const firstHnf = require("./row19_first_hnf_host.cjs");

const ROWS = 424, DEGREE = 3, PLACES = 2, FIRST = 423, TERMINAL = 430;
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const hash = value => sha(Buffer.from(JSON.stringify(value)));

function signature(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = fs.readFileSync(source, "utf8").match(
    new RegExp(`def ${escaped}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing signature ${name}`);
  return match[1].trim().split("\n").map(line =>
    line.trim().replace(/,$/, "").split(": "));
}

async function compiled(sourceName, exportName, cacheRoot = null) {
  const source = path.join(__dirname, sourceName);
  const built = await compileKernel({ sourcePath: source,
    ...(cacheRoot ? { cacheRoot } : {}) });
  const fn = require(built.modulePath)[exportName];
  assert(fn?.nativeAvailable);
  return { fn, names: signature(source, exportName), built };
}

function readOwner(descriptor) {
  const compressed = fs.readFileSync(descriptor.path);
  assert.equal(sha(compressed), descriptor.compressedSha256);
  assert.equal(fs.statSync(descriptor.path).mode & 0o222, 0);
  const plain = zlib.gunzipSync(compressed);
  assert.equal(sha(plain), descriptor.ownerSha256);
  return JSON.parse(plain);
}

function view(owner, length) {
  return (owner.toArray ? owner.toArray() : Array.from(owner))
    .slice(0, length).map(String);
}

function words(values, minimum = 1) {
  let result = minimum;
  for (const raw of values || []) {
    let value = BigInt(raw); if (value < 0n) value = -value;
    result = Math.max(result, Math.ceil(Math.max(1, value.toString(2).length) / 64));
  }
  return result;
}

function appendSizes(state, newColumns) {
  const hRows = state[0], bColumns = state[2], totalColumns = state[7];
  const lig = ROWS - bColumns, width = hRows + newColumns;
  const cWidth = width + bColumns;
  return { top: lig*newColumns, exact_product: lig*newColumns,
    log_product: 7*PLACES*newColumns, adjusted_logs: 7*PLACES*newColumns,
    joined: lig*width, joined_logs: 7*PLACES*cWidth,
    rank_matrix: lig*width, occupied: width, pivots: lig, best: lig,
    profile: lig, rank_state: 10, perm_work: ROWS, matb: lig*width,
    new_dep: lig*width, permuted_b: lig*bColumns, full_h: lig*width,
    transform: width*width, lam: width*width, d: width+1, hnf_state: 11,
    full_dep: lig*width, work_b: lig*bColumns, work_c: 7*PLACES*cWidth,
    diagonal: lig, final_c: 7*PLACES*cWidth, result_h: lig*lig,
    result_dep: lig*lig, result_b: lig*(bColumns+lig),
    result_c: 7*PLACES*(totalColumns+newColumns), final_state: 7, state: 9 };
}

function acceptanceSizes() {
  const size = PLACES * 8, square = PLACES ** 2, reconstruction = (PLACES-1)*7;
  return { accept_prepared: 3*size, accept_selected: 8, accept_prep_state: 3,
    accept_rank_work: 3*size, accept_rank_occupied: 3, accept_rank_pivots: 8,
    accept_rank_state: 3, accept_integer_input: size, accept_integer_work: size,
    accept_integer_occupied: 3, accept_integer_pivots: 8, accept_integer_best: 8,
    accept_integer_state: 10, accept_basis: 3*square, accept_minor: 3*square,
    accept_det_work: 3*square, accept_det_result: 3, accept_det_pivots: 3,
    accept_det_state: 5, accept_inverse_work: 3*square,
    accept_inverse_rhs: 3*square, accept_inverse: 3*square,
    accept_inverse_pivots: 3, accept_inverse_state: 3,
    accept_product: 3*square, accept_inverse_slice: 3*square,
    accept_multiple: 3, accept_coordinates: 3*reconstruction,
    accept_multiple_state: 4, accept_rational_work: 3*reconstruction,
    accept_lattice: reconstruction, accept_hnf_work: reconstruction,
    accept_hnf_column: PLACES, accept_hnf_output: reconstruction,
    accept_hnf_state: 12, accept_regulator: 3,
    accept_relations: reconstruction, accept_denominator: 1,
    accept_reconstruction_state: 4, accept_hnf_row_pivots: PLACES,
    accept_hnf_heights: 7, accept_acceptance_state: 3, attempt_state: 4,
    accept_logs: 3*PLACES*(TERMINAL-415-9), accept_class_number: 1,
    accept_zeta_factor: 3, accept_post_hnf_state: 3 };
}

async function analyticInverseHr(prepared, catalog, cacheRoot = null) {
  assert.equal(catalog.schema, "sagejs.pari-class-group/row19-analytic-catalog-v1");
  assert.equal(catalog.oracleDataConsumed, false);
  const kernel = await compiled("row14_post806_terminal.py",
    "pari_row14_analytic_inverse_hr", cacheRoot);
  const count = catalog.primes.length, groups = catalog.degrees.length;
  const input = { discriminant: prepared.analytic_discriminant, real_places: 1,
    complex_places: 1, roots_of_unity: prepared.analytic_roots_of_unity,
    primes: catalog.primes, offsets: catalog.offsets, counts: catalog.counts,
    degrees: catalog.degrees, multiplicities: catalog.multiplicities };
  const lengths = { log_discriminant: 1, coefficients: 7, table: 31, tail: 1,
    logarithms: count, log_inverse_residue: 1, inverse_residue: 3,
    exp_cache: 3, pi_cache: 3, a: 64, b: 64, p: 64, q: 64, stack: 128,
    inverse_hr: 3, state: 2 };
  const values = {}; let bytes = 0;
  for (const [name, kind] of kernel.names) {
    const supplied = input[name], length = supplied === undefined ? lengths[name] : supplied.length;
    if (!kind.endsWith("Buffer")) { values[name] = BigInt(supplied); continue; }
    assert.notEqual(length, undefined, `missing analytic owner ${name}`);
    if (kind === "Float64Buffer") { bytes += 8*length;
      values[name] = kernel.fn.createFloat64Buffer(length); }
    else if (kind === "Int64Buffer") { bytes += 8*length;
      values[name] = kernel.fn.createInt64Buffer(length); }
    else { const capacity = words(supplied, 16); bytes += length*(4+8*capacity);
      values[name] = kernel.fn.createIntegerBuffer(length, capacity,
        supplied === undefined ? undefined : supplied.map(BigInt)); }
  }
  assert.equal(kernel.fn.gmp(...kernel.names.map(([name]) => values[name])), 0n);
  return { inverseHr: values.inverse_hr.toArray().map(String),
    state: Array.from(values.state).map(Number), bytes, groups };
}

async function runTerminalContinuationLive(
  prepared,
  prefix,
  catalog,
  first,
  expectedAuthority = null,
  firstOwnerSha256 = null,
  options = {},
) {
  const liveExact = first.exact;
  if (expectedAuthority !== null) {
    assert.equal(expectedAuthority.schema,
      "sagejs.pari-class-group/row19-first-hnf-owner-v1");
    for (const key of ["state", "sparseState", "cleanupState", "rankState",
      "assemblyState", "hnfState", "finalState", "cupState", "cupSolveState",
      "dimensions", "ancestry", "result"])
      assert.deepEqual(liveExact[key], expectedAuthority[key],
        `first-HNF authority ${key}`);
  }

  const cv = first.collected.values;
  const collectorSource = path.join(__dirname, "collected_log_embeddings.py");
  const collectorNames = signature(collectorSource, "pari_collect_and_log_relations");
  const collectorFn = require(first.collected.built.modulePath).pari_collect_and_log_relations;
  const next = await compiled("row14_next_pass.py", "pari_row14_prepare_next_pass",
    options.cacheRoot);
  const search = next.fn.createIntegerBuffer(ROWS, 1, cv.search_ideals.toArray());
  const outerPerm = next.fn.createIntegerBuffer(ROWS, 1, cv.outer_perm.toArray());
  const outer = next.fn.createInt64Buffer(Array.from(cv.outer_state));
  const cache = next.fn.createIntegerBuffer(6, 1, cv.relation_state.toArray());
  const schedule = next.fn.createInt64Buffer(Array.from(cv.schedule));
  const completed = next.fn.createIntegerBuffer(1, 1, cv.log_completed.toArray());
  const control = next.fn.createInt64Buffer(3);
  const perm = next.fn.createInt64Buffer(liveExact.result.perm.map(BigInt));
  assert.equal(next.fn.gmp(perm, BigInt(ROWS), 9n, 7n, 0n, search, outerPerm,
    1n, outer, cache, schedule, completed, control), 0n);
  const nextControl = Array.from(control).map(Number);
  cv.search_ideals = collectorFn.createIntegerBuffer(ROWS, 1, search.toArray());
  cv.outer_perm = collectorFn.createIntegerBuffer(ROWS, 1, outerPerm.toArray());
  cv.outer_state = collectorFn.createInt64Buffer(Array.from(outer));
  cv.relation_state = collectorFn.createIntegerBuffer(6, 1, cache.toArray());
  cv.schedule = collectorFn.createInt64Buffer(Array.from(schedule));
  cv.log_completed = collectorFn.createIntegerBuffer(1, 1, completed.toArray());
  cv.search_count = BigInt(nextControl[0]); cv.outer_mode = 1n;
  assert.equal(collectorFn.gmp(...collectorNames.map(([name]) => cv[name])), 0n);
  assert.deepEqual(cv.relation_state.toArray().map(String),
    ["430", "4350", "0", "0", "0", "430"]);

  const analytic = await analyticInverseHr(prepared, catalog, options.cacheRoot);
  const terminal = await compiled("connected_hnfadd_acceptance.py",
    "pari_connected_hnfadd_acceptance", options.cacheRoot);
  const sizes = { ...appendSizes(liveExact.state, TERMINAL-FIRST), ...acceptanceSizes() };
  const explicit = { h: liveExact.result.W, h_rows: 9, dep: liveExact.result.dep,
    b: liveExact.result.B, b_columns: 408, logs: liveExact.result.C,
    total_columns: FIRST, log_rows: PLACES, perm: liveExact.result.perm,
    rows: ROWS, new_relations: cv.relation_records.toArray().slice(FIRST*ROWS, TERMINAL*ROWS),
    new_columns: TERMINAL-FIRST,
    new_logs: cv.log_embeddings.toArray().slice(FIRST*7*PLACES, TERMINAL*7*PLACES),
    accept_degree: DEGREE, accept_inverse_hr: analytic.inverseHr,
    accept_cache_changed: true };
  const values = {}; let bytes = analytic.bytes;
  for (const [name, kind] of terminal.names) {
    const supplied = explicit[name];
    if (!kind.endsWith("Buffer")) {
      values[name] = kind === "bool" ? Boolean(supplied) : BigInt(supplied); continue;
    }
    const length = supplied === undefined ? sizes[name] : supplied.length;
    assert.notEqual(length, undefined, `missing terminal owner ${name}`);
    if (kind === "Int64Buffer") { bytes += 8*length;
      values[name] = terminal.fn.createInt64Buffer(
        supplied === undefined ? length : supplied.map(BigInt)); }
    else { const capacity = words(supplied, 16); bytes += length*(4+8*capacity);
      values[name] = terminal.fn.createIntegerBuffer(length, capacity,
        supplied === undefined ? undefined : supplied.map(BigInt)); }
  }
  const terminalStatus = terminal.fn.gmp(
    ...terminal.names.map(([name]) => values[name]));
  assert.equal(terminalStatus, -2n, "legacy append did not stop at CUP frontier");
  assert.deepEqual(Array.from(values.attempt_state).map(Number), [1, -2, -1, 430]);
  assert.equal(Number(values.state[8]), 1);

  const suffix = await compiled("row19_hnfadd_cup_suffix.py",
    "pari_row19_hnfadd_cup_suffix", options.cacheRoot);
  const width = 16, lig = 16;
  const suffixInput = { ...values, width, lig, log_rows: PLACES,
    b_columns: 408, total_columns: FIRST, new_columns: TERMINAL-FIRST,
    cup_arena: suffix.fn.createIntegerBuffer(8*width*lig*(Math.floor(width/4)+1), 1),
    cup_frames: suffix.fn.createIntegerBuffer(3*(lig.toString(2).length+1), 1),
    cup_solve_state: suffix.fn.createInt64Buffer(8),
    cup_state: suffix.fn.createInt64Buffer(8) };
  bytes += (8*width*lig*(Math.floor(width/4)+1)) * 12;
  assert.equal(suffix.fn.gmp(...suffix.names.map(([name]) => suffixInput[name])), 0n);

  const acceptance = await compiled("post_hnf_acceptance.py",
    "pari_post_hnf_acceptance", options.cacheRoot);
  const acceptanceInput = { factor_count: ROWS, h_rows: 9, b_columns: 415,
    c_columns: TERMINAL, places: PLACES, degree: DEGREE,
    h: values.result_h, c: values.result_c, inverse_hr: values.accept_inverse_hr,
    cache_changed: true };
  for (const [name, kind] of acceptance.names) {
    if (Object.hasOwn(acceptanceInput, name)) continue;
    assert(kind.endsWith("Buffer"), `missing acceptance scalar ${name}`);
    acceptanceInput[name] = values[`accept_${name}`];
    assert.notEqual(acceptanceInput[name], undefined, `missing acceptance owner ${name}`);
  }
  const acceptanceStatus = acceptance.fn.gmp(
    ...acceptance.names.map(([name]) => acceptanceInput[name]));
  assert.equal(acceptanceStatus, 0n);
  values.attempt_state[0] = 3n;
  values.attempt_state[1] = acceptanceStatus;
  values.attempt_state[2] = values.accept_multiple_state[1];
  const terminalRelationState = cv.relation_state.toArray().map(String);
  terminalRelationState[4] = String(TERMINAL);
  cv.relation_state = collectorFn.createIntegerBuffer(6, 1,
    terminalRelationState.map(BigInt));
  const state = Array.from(values.state).map(Number), hRows = state[0], bColumns = state[2];
  const depRows = ROWS-bColumns-hRows;
  const exact = { state, attemptState: Array.from(values.attempt_state).map(Number),
    acceptanceState: Array.from(values.accept_acceptance_state).map(Number),
    multipleState: Array.from(values.accept_multiple_state).map(Number),
    reconstructionState: Array.from(values.accept_reconstruction_state).map(Number),
    classNumber: String(values.accept_class_number.toArray()[0]),
    regulator: view(values.accept_regulator, 3),
    relationState: terminalRelationState,
    analyticState: analytic.state, inverseHr: analytic.inverseHr,
    result: { W: view(values.result_h, hRows*hRows),
      dep: view(values.result_dep, depRows*hRows),
      B: view(values.result_b, (ROWS-bColumns)*bColumns),
      C: view(values.result_c, 7*PLACES*TERMINAL), perm: view(values.perm, ROWS) },
    ancestry: { relation: view(values.matb, (ROWS-408)*(9+7)),
      H: view(values.full_h, (ROWS-408)*(9+7)),
      transform: view(values.transform, (9+7)**2) },
    relationIdentity: { records: view(cv.relation_records, ROWS*TERMINAL),
      logs: view(cv.log_embeddings, 7*PLACES*TERMINAL),
      hashes: view(cv.relation_hashes, TERMINAL),
      metadata: view(cv.relation_metadata, 3*TERMINAL),
      generators: view(cv.generators, DEGREE*TERMINAL) } };
  return { exact, firstOwnerSha256,
    ownerBytesUpperBound: first.ownerBytesUpperBound + bytes,
    nativeCoreBytes: fs.statSync(terminal.built.coreSourcePath).size,
    nextControl,
    // Private continuation capability.  Public projections must not serialize
    // this object; the Phase-6 resident root retains it in a WeakMap so a
    // later class/unit root can consume the same native buffers.
    resident: { collector: cv, terminal: values } };
}

async function runTerminalContinuation(prepared, prefix, catalog, ownerDescriptor) {
  const authority = readOwner(ownerDescriptor);
  const first = await firstHnf.runFirstHnf(prepared, prefix);
  return runTerminalContinuationLive(prepared, prefix, catalog, first,
    authority, ownerDescriptor.ownerSha256);
}

module.exports = { acceptanceSizes, appendSizes, runTerminalContinuation,
  runTerminalContinuationLive, readOwner };

"use strict";

// Prepared-only row-3 continuation from the live factor/initial-relation
// frontier through the authentic small-norm collection and first HNF.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const initialApi = require("./row3_prepared_initial_base_frontier.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");

const ROWS = 668, DEGREE = 3, PLACES = 3, TARGET = 675, RESERVE = 6800;
const SCHEMA = "sagejs.pari-class-group/row3-prepared-relation-hnf-frontier-v1";
const RESULT_SCHEMA =
  "sagejs.pari-class-group/row3-fresh-correspondence-composition-v1";

function signature(source, name) {
  const match = fs.readFileSync(source, "utf8").match(
    new RegExp(`def ${name}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing signature ${name}`);
  return match[1].trim().split("\n").map(line =>
    line.trim().replace(/,$/, "").split(": "));
}
function array(owner) { return owner.toArray ? owner.toArray() : Array.from(owner); }
function integer(fn, length, capacity = 16, values = undefined) {
  return fn.createIntegerBuffer(length, capacity,
    values === undefined ? undefined : values.map(BigInt));
}
function int64(fn, length, values = undefined) {
  return fn.createInt64Buffer(values === undefined ? length : values.map(BigInt));
}
function float64(fn, length, values = undefined) {
  return fn.createFloat64Buffer(values === undefined ? length : values.map(Number));
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

function storageOwner(name, role, entries) {
  const values = entries.map(String);
  return { capacity: String(values.length),
    encoding: "canonical-decimal-integer", entries: values,
    logicalLength: String(values.length), name, role };
}

function composeFreshResult(unitSuffix) {
  const witness = unitSuffix.classWitness;
  const storage = [
    storageOwner("class-generator-ideal", "class-generator-ideal",
      witness.generator.idealHnf),
    storageOwner("class-generator-presentation-ideals",
      "class-generator-presentation-ideals",
      witness.generator.presentationIdealHnfs.flat()),
    storageOwner("class-order-factor-base-exponents",
      "exact-order-factor-base-exponents", witness.orderRelation.factorBaseExponents),
    storageOwner("class-order-principal-generators",
      "exact-order-principal-generators",
      witness.compactPrincipalWitness.principalGenerators),
    storageOwner("class-order-relation-exponents",
      "exact-order-relation-exponents",
      witness.compactPrincipalWitness.relationExponents),
    storageOwner("class-order-relation-indices", "exact-order-relation-indices",
      witness.compactPrincipalWitness.relationIndices),
    storageOwner("class-presentation", "class-presentation", [3, 0, 0, 2]),
    storageOwner("factored-unit-provenance", "exact-unit-raw-provenance",
      unitSuffix.units.rawUnitProvenance),
    storageOwner("honesty-evidence", "honesty-evidence", [0]),
    storageOwner("regulator-enclosure", "regulator-enclosure",
      unitSuffix.regulator.packed),
    storageOwner("source-boundary-status", "source-boundary-status", [0, 1, 1]),
    storageOwner("torsion-generator", "torsion-generator", [-1, 0, 0]),
    storageOwner("unit-kernel-transform", "exact-unit-kernel-transform",
      unitSuffix.units.unitKernelTransform),
    storageOwner("unit-norms", "compact-unit-norms", unitSuffix.units.unitNorms),
    storageOwner("unit-real-signs", "exact-unit-real-signs",
      unitSuffix.units.unitRealSigns),
  ].sort((left, right) => left.name.localeCompare(right.name));
  const payload = {
    classGroup: { classNumber: "6", generatorCount: "1",
      invariantFactors: ["6"], presentationOwner: "class-presentation" },
    field: { definingPolynomialAscending:
      ["20000000042", "-20000000022", "0", "1"], degree: "3",
    id: "generated-sha256-11997528676ebeb1c0636be2cb828b5ed5a527ea18eb3a4ace953984da507de9" },
    honesty: { evidenceOwner: "honesty-evidence", outcome: "not-required",
      sourcePolicy: "fresh-prepared-equal-bound-source-skip" },
    schema: neutral.PAYLOAD_SCHEMA,
    source: { assumptions: [
      { disposition: "assumed", id: "factor-base-bounds",
        statement: "PARI's factor-base generation and relation bounds are assumed correct" },
      { disposition: "assumed", id: "grh-bounds",
        statement: "GRH and PARI's conditional class-group bounds are assumed" },
      { disposition: "assumed", id: "pari-correspondence",
        statement: "PARI 2.17.4's class-and-unit correspondence is assumed faithful" },
      { disposition: "assumed", id: "prepared-nf-root",
        statement: "The computation starts from the authenticated prepared number field" },
    ], correspondence: "upstream-assumed-pari-correspondence",
    pariSourceSha256:
      "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
    pariVersion: "2.17.4",
    replaySchema: "sagejs.pari-class-group/row3-fresh-prepared-replay-v1" },
    storage,
    terminal: { correspondence_complete: true, public_complete: false,
      status: "pari-correspondence-complete-internal" },
    unitGroup: { materialization: { precisionBits: "192", reason: "LARGE",
      tag: "not_given" }, rank: "2", regulatorOwner: "regulator-enclosure",
    torsionGeneratorOwner: "torsion-generator", torsionOrder: "2" },
  };
  const sealed = neutral.sealClassUnitCorrespondenceResult(payload);
  return Object.freeze({ schema: RESULT_SCHEMA, correspondenceComplete: true,
    publicComplete: false, preparedNfLiveRoot: true,
    frozenW0UsedAsInput: false, qualifiedTiming: false,
    sealedEnvelopeHex: sealed.toString("hex"),
    sealedEnvelopeSha256: neutral.sha256Bytes(sealed) });
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
    hnf_matbnew: size, hnf_dep: size, hnf_b: size,
    hnf_assembly_state: 6, hnf_transformed_logs: logs,
    hnf_full_h: size, hnf_hnf_transform: square, hnf_lam: square,
    hnf_d: columns+1, hnf_hnf_state: 11, hnf_full_dep: size,
    hnf_work_b: size, hnf_work_c: logs, hnf_diagonal: rows,
    hnf_result_h: size, hnf_result_dep: size,
    hnf_result_b: rows*(columns+rows), hnf_result_c: logs,
    hnf_final_state: 7, hnf_state: 9,
    hnf_cup_arena: 5_000_000, hnf_cup_frames: 64,
    hnf_cup_solve_state: 8, hnf_cup_state: 8,
  };
}

function allocate(compiled, input, lengths, compact = new Set()) {
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
    if (kind === "Float64Buffer") values[name] = compiled.fn.createFloat64Buffer(
      supplied === undefined ? length : supplied.map(Number));
    else if (kind === "Int64Buffer") values[name] = compiled.fn.createInt64Buffer(
      supplied === undefined ? length : supplied.map(BigInt));
    else values[name] = compiled.fn.createIntegerBuffer(length,
      words(supplied, compact.has(name) ? 1 : 16),
      supplied === undefined ? undefined : supplied.map(BigInt));
  }
  return values;
}

function denseInitial(frontier) {
  const initial = frontier.factorSelection.initialRelations;
  const basis = Array(ROWS * ROWS).fill("0");
  for (const [column, row, value] of initial.basisEntries)
    basis[Number(column) * ROWS + Number(row)] = value;
  const records = Array(RESERVE * ROWS).fill("0");
  const hashes = Array(RESERVE).fill("0");
  const metadata = Array(3 * RESERVE).fill("0");
  const generators = Array(3 * RESERVE).fill("0");
  initial.records.forEach((record, index) => {
    for (const [row, value] of record.entries)
      records[index * ROWS + Number(row)] = value;
    hashes[index] = record.sourceNz;
    metadata.splice(3 * index, 3, ...record.metadata);
    generators.splice(3 * index, 3, ...record.generator);
  });
  return { basis, records, hashes, metadata, generators };
}

async function run(prepared, frontier) {
  initialApi.verifyOwner(frontier);
  const auth = require("./prepared_nf_authentication.cjs")
    .authenticatePreparedNf(prepared);
  assert.equal(auth.sha256, initialApi.PREPARED_SHA256);
  const factor = frontier.factorSelection, dense = denseInitial(frontier);
  const offsets = Array(Number(frontier.bounds.C2) + 1).fill("-1");
  const counts = Array(offsets.length).fill("0");
  factor.rationalPrimes.forEach((prime, index) => {
    offsets[Number(prime)] = factor.groupOffsets[index];
    counts[Number(prime)] = factor.groupCounts[index];
  });
  const collector = await compile("collected_log_embeddings.py",
    "pari_collect_and_log_relations");
  const input = {
    n: 3, precision: 192, scale: 2000 / (2 * ((2 * Math.PI) / 3)),
    track_small: 1, admission_real_count: 3, admission_mode: 2,
    admission_factor_product: frontier.bounds.prodZ,
    admission_factorlimit: 1048576, admission_prime_limit: 65537,
    nrelid: 4, track_fact: 1, jid0: 0, e0: 0, extra_count: -1,
    search_count: ROWS, construct_primes: 0, outer_mode: 1,
    outer_ru: PLACES, log_precision: 192, scalar_prefix_count: 116,
    admission_matrix_m: prepared.admission_matrix_m,
    admission_matrix_p: prepared.admission_matrix_p,
    admission_matrix_e: prepared.admission_matrix_e,
    admission_primes: prepared.admission_primes,
    admission_products: prepared.admission_products,
    preparation_rounded_embedding: prepared.preparation_rounded_embedding,
    preparation_embedding: prepared.preparation_embedding,
    admission_prime_offsets: offsets, admission_prime_counts: counts,
    admission_group_tau: factor.selectedTau,
    admission_group_e: factor.ramification,
    admission_group_f: factor.residueDegrees,
    admission_group_inert: factor.inertFlags,
    relation_primes: factor.relationPrimes,
    ramification: factor.ramification,
    search_ideals: factor.permutation,
    packet_ids: Array.from({ length: ROWS }, (_, index) => String(index + 1)),
    packet_ideals: factor.ideals.flat(), packet_norms: factor.norms,
    basis_table: prepared.basis_table, packet_primes: factor.relationPrimes,
    packet_generators: factor.descriptors.flatMap(value => value.generator),
    packet_inert: factor.inertFlags, subfactor: factor.subfactor,
    extra: Array(factor.subfactor.length).fill("0"),
    relation_state: factor.initialRelations.state,
    relation_basis: dense.basis, relation_records: dense.records,
    relation_hashes: dense.hashes, relation_metadata: dense.metadata,
    generators: dense.generators, relation: Array(ROWS).fill("0"),
    relation_scratch: Array(ROWS).fill("0"), schedule: ["0", "0", "0", "0"],
    log_completed: ["0"],
    outer_state: ["559", "4", "0", "0", "669", ...Array(14).fill("0")],
    outer_minidx: Array.from({ length: ROWS }, (_, index) => String(index + 1)),
    outer_present: Array(ROWS).fill("0"), outer_live: Array(ROWS).fill("0"),
    outer_perm: factor.permutation, outer_multiplier: Array(ROWS).fill("0"),
  };
  const lengths = zeroLengths();
  const compact = new Set(["relation_records", "relation_hashes",
    "relation_metadata", "relation", "relation_scratch"]);
  const cv = allocate(collector, input, lengths, compact);
  const status = collector.fn.gmp(...collector.names.map(([name]) => cv[name]));
  assert(status === 0n || status === 1n);
  const relationState = array(cv.relation_state).map(String);
  assert.deepEqual(relationState, ["675", "6800", "0", "0", "0", "675"]);
  assert.equal(String(array(cv.log_completed)[0]), "675");

  const records = array(cv.relation_records).slice(0, ROWS * TARGET).map(String);
  const generators = array(cv.generators).slice(0, DEGREE * TARGET).map(String);
  const logs = array(cv.log_embeddings).slice(0, 7 * PLACES * TARGET).map(String);
  const hnf = await compile("hnfspec_complete.py", "pari_hnfspec_complete");
  const hnfInput = { rows: ROWS, columns: TARGET, k0: 4, log_rows: PLACES,
    original: records, perm: factor.permutation, logs };
  const hnfLengths = Object.fromEntries(hnf.names.map(([name]) =>
    [name, lengths[name === "pivots" ? "hnf_rank_pivots" : `hnf_${name}`]]));
  const hv = allocate(hnf, hnfInput, hnfLengths,
    new Set(["cup_arena", "cup_frames"]));
  assert.equal(hnf.fn.gmp(...hnf.names.map(([name]) => hv[name])), 0n);
  const hnfState = array(hv.state).map(Number);
  assert.deepEqual(hnfState.slice(0, 9), [2, 9, 666, 0, 7, 69, 0, 675, 0]);

  // The same generic acceptance/Smith tail used by row 14 is field-neutral at
  // this boundary.  Recompute inverse-hR from prepared data, never from W0.
  const catalog = await compile("prime_degree_catalog.py", "pari_prime_degree_catalog");
  const allPrimes = prepared.admission_primes.map(Number);
  const primeCount = allPrimes.length;
  const degreeCapacity = 3 * primeCount;
  const catalogValues = {
    coefficients: integer(catalog.fn, 4, 8, prepared.prep_polynomial),
    degree: 3n, equation_index: 1n,
    primes: integer(catalog.fn, primeCount, 2, allPrimes),
    prime_count: BigInt(primeCount), workspace: integer(catalog.fn, 393),
    factor_degrees: integer(catalog.fn, 3), factor_exponents: integer(catalog.fn, 3),
    group_degrees: integer(catalog.fn, 3), group_counts: integer(catalog.fn, 3),
    local_state: integer(catalog.fn, 3),
    pattern_offsets: integer(catalog.fn, primeCount),
    pattern_counts: integer(catalog.fn, primeCount),
    pattern_degrees: integer(catalog.fn, degreeCapacity),
    pattern_multiplicities: integer(catalog.fn, degreeCapacity),
    full_offsets: integer(catalog.fn, primeCount),
    full_counts: integer(catalog.fn, primeCount),
    full_degrees: integer(catalog.fn, degreeCapacity),
    state: integer(catalog.fn, 4),
  };
  assert.equal(catalog.fn.gmp(...catalog.names.map(([name]) => catalogValues[name])), 0n);
  const terminal = await compile("row14_post806_terminal.py",
    "pari_row14_post806_terminal");
  const analytic = require(terminal.built.modulePath).pari_row14_analytic_inverse_hr;
  const analyticNames = signature(path.join(__dirname, "row14_post806_terminal.py"),
    "pari_row14_analytic_inverse_hr");
  const av = {
    discriminant: BigInt(prepared.analytic_discriminant), real_places: 3n,
    complex_places: 0n,
    roots_of_unity: BigInt(prepared.analytic_roots_of_unity),
    log_discriminant: float64(analytic, 1),
    primes: integer(analytic, primeCount, 2, allPrimes),
    offsets: integer(analytic, primeCount, 2, array(catalogValues.pattern_offsets)),
    counts: integer(analytic, primeCount, 2, array(catalogValues.pattern_counts)),
    degrees: integer(analytic, degreeCapacity, 2, array(catalogValues.pattern_degrees)),
    multiplicities: integer(analytic, degreeCapacity, 2,
      array(catalogValues.pattern_multiplicities)),
    coefficients: float64(analytic, 7), table: float64(analytic, 31),
    tail: float64(analytic, 1), logarithms: float64(analytic, primeCount),
    log_inverse_residue: float64(analytic, 1),
    inverse_residue: integer(analytic, 3), exp_cache: integer(analytic, 3),
    pi_cache: integer(analytic, 3), a: integer(analytic, 64),
    b: integer(analytic, 64), p: integer(analytic, 64), q: integer(analytic, 64),
    stack: integer(analytic, 128), inverse_hr: integer(analytic, 3),
    state: int64(analytic, 2),
  };
  assert.equal(analytic.gmp(...analyticNames.map(([name]) => av[name])), 0n);
  const size = PLACES * 8, square = PLACES ** 2;
  const reconstructionSize = (PLACES - 1) * 7;
  const factorProduct = frontier.bounds.prodZ;
  const terminalValues = {
    factor_count: 668n, h_rows: 2n, b_columns: 666n, c_columns: 675n,
    places: 3n, degree: 3n,
    h: integer(terminal.fn, 4, 16, array(hv.result_h).slice(0, 4)),
    c: integer(terminal.fn, 7 * PLACES * TARGET, 16,
      array(hv.result_c).slice(0, 7 * PLACES * TARGET)),
    inverse_hr: integer(terminal.fn, 3, 16, array(av.inverse_hr)),
    logs: integer(terminal.fn, 63), tentative_class_number: integer(terminal.fn, 1),
    zeta_factor: integer(terminal.fn, 3), post_hnf_state: int64(terminal.fn, 3),
    prepared: integer(terminal.fn, 3 * size), selected: int64(terminal.fn, 8),
    prep_state: int64(terminal.fn, 3), rank_work: integer(terminal.fn, 3 * size),
    rank_occupied: int64(terminal.fn, 3), rank_pivots: int64(terminal.fn, 8),
    rank_state: int64(terminal.fn, 3), integer_input: integer(terminal.fn, size),
    integer_work: integer(terminal.fn, size), integer_occupied: integer(terminal.fn, 3),
    integer_pivots: integer(terminal.fn, 8), integer_best: integer(terminal.fn, 8),
    integer_state: integer(terminal.fn, 10), basis: integer(terminal.fn, 3 * square),
    minor: integer(terminal.fn, 3 * square), det_work: integer(terminal.fn, 3 * square),
    det_result: integer(terminal.fn, 3), det_pivots: int64(terminal.fn, 3),
    det_state: int64(terminal.fn, 5), inverse_work: integer(terminal.fn, 3 * square),
    inverse_rhs: integer(terminal.fn, 3 * square), inverse: integer(terminal.fn, 3 * square),
    inverse_pivots: int64(terminal.fn, 3), inverse_state: int64(terminal.fn, 3),
    product: integer(terminal.fn, 3 * square), inverse_slice: integer(terminal.fn, 3 * square),
    multiple: integer(terminal.fn, 3), coordinates: integer(terminal.fn, 3 * reconstructionSize),
    multiple_state: int64(terminal.fn, 4), rational_work: integer(terminal.fn, 3 * reconstructionSize),
    lattice: integer(terminal.fn, reconstructionSize),
    regulator_hnf_work: integer(terminal.fn, reconstructionSize),
    regulator_hnf_column: integer(terminal.fn, 2),
    regulator_hnf_output: integer(terminal.fn, reconstructionSize),
    regulator_hnf_state: int64(terminal.fn, 12), regulator: integer(terminal.fn, 3),
    unit_relations: integer(terminal.fn, reconstructionSize), denominator: integer(terminal.fn, 1),
    reconstruction_state: int64(terminal.fn, 4), hnf_row_pivots: int64(terminal.fn, 2),
    hnf_heights: int64(terminal.fn, 7), cache_changed: true,
    acceptance_state: int64(terminal.fn, 3),
    factor_base_state: integer(terminal.fn, 7, words([factorProduct]),
      [frontier.bounds.C1, frontier.bounds.C2, frontier.bounds.KC,
        frontier.bounds.KCZ, frontier.bounds.KCZ2, frontier.bounds.KC2,
        factorProduct]),
    preparation_state: int64(terminal.fn, 8,
      [3, 0, 668, 446, 0, 0, 0, 0]),
    smith_work: integer(terminal.fn, 4), smith_column: integer(terminal.fn, 2),
    invariants: integer(terminal.fn, 2), class_number: integer(terminal.fn, 1),
    smith_state: int64(terminal.fn, 6), terminal_state: int64(terminal.fn, 10),
  };
  const terminalStatus = terminal.fn.gmp(...terminal.names.map(([name]) =>
    terminalValues[name]));
  assert.equal(terminalStatus, 0n, "row3 acceptance/Smith tail did not complete");
  // Keep the historical W0-backed unit authority untouched.  This private
  // fresh entry point consumes only values already owned by this invocation
  // plus the authenticated prepared embeddings.
  const unitPayload = {
    records, generators, logs,
    initialPermutation: frontier.factorSelection.permutation,
    terminalPermutation: array(hv.perm).map(String),
    w: array(hv.result_h).slice(0, 4).map(String),
    b: array(hv.result_b).slice(0, 2 * 666).map(String),
    c: array(hv.result_c).slice(0, 7 * PLACES * TARGET).map(String),
    relationLattice: array(terminalValues.unit_relations)
      .slice(0, reconstructionSize).map(String),
    regulator: array(terminalValues.regulator).map(String),
    factorNorms: frontier.factorSelection.norms,
    factorDescriptors: frontier.factorSelection.descriptors.flatMap(value =>
      [value.p, value.e, value.f, value.inert, ...value.generator, ...value.tau]),
    factorIdeals: frontier.factorSelection.ideals.flat(),
    preparedSha256: auth.sha256,
    prepared: { basisTable: prepared.basis_table,
      embeddingM: prepared.preparation_embedding,
      embeddingG: prepared.preparation_embedding,
      basis: prepared.prep_zk,
      basisDenominator: prepared.prep_zkden },
  };
  const unitProgram = String.raw`import importlib,json,sys
sys.path.extend(['src/lib','src/baselib'])
m=importlib.import_module('bench.pari-class-group-port.row3_fresh_unit_suffix')
json.dump(m.compose_row3_fresh_unit_suffix(json.load(sys.stdin)),sys.stdout,separators=(',',':'))`;
  const unitRun = spawnSync("python3", ["-c", unitProgram], {
    cwd: path.resolve(__dirname, "../.."), input: JSON.stringify(unitPayload),
    encoding: "utf8", timeout: 600_000, maxBuffer: 256 * 1024 * 1024,
  });
  assert.equal(unitRun.status, 0,
    `row3 fresh unit suffix failed: ${unitRun.stderr || unitRun.signal}`);
  const unitSuffix = JSON.parse(unitRun.stdout);
  assert.equal(unitSuffix.source.preparedNfLiveRoot, true);
  assert.equal(unitSuffix.source.frozenW0UsedAsInput, false);
  const correspondence = composeFreshResult(unitSuffix);
  const owner = {
    schema: SCHEMA,
    authority: { preparedSha256: auth.sha256,
      initialFrontierSchema: frontier.schema,
      collectorCoreSha256: require("node:crypto").createHash("sha256")
        .update(fs.readFileSync(collector.built.coreSourcePath)).digest("hex"),
      hnfCoreSha256: require("node:crypto").createHash("sha256")
        .update(fs.readFileSync(hnf.built.coreSourcePath)).digest("hex") },
    field: frontier.field,
    dimensions: { rows: ROWS, relations: TARGET, places: PLACES,
      scalarPrefix: 116 },
    relationState, relations: { matrix: records, generators, logs },
    hnf: { state: hnfState, permutation: array(hv.perm).map(String),
      w: array(hv.result_h).slice(0, 4).map(String), dep: [],
      b: array(hv.result_b).slice(0, 2 * 666).map(String),
      c: array(hv.result_c).slice(0, 7 * PLACES * TARGET).map(String) },
    acceptance: { analyticState: array(av.state).map(Number),
      inverseHr: array(av.inverse_hr).map(String),
      postHnfState: array(terminalValues.post_hnf_state).map(Number),
      acceptanceState: array(terminalValues.acceptance_state).map(Number),
      reconstructionState: array(terminalValues.reconstruction_state).map(Number),
      regulator: array(terminalValues.regulator).map(String),
      relationLattice: array(terminalValues.unit_relations)
        .slice(0, reconstructionSize).map(String),
      invariants: array(terminalValues.invariants)
        .slice(0, Number(array(terminalValues.smith_state)[1])).map(String),
      classNumber: String(array(terminalValues.class_number)[0]),
      terminalState: array(terminalValues.terminal_state).map(Number) },
    units: unitSuffix,
    correspondence,
    provenance: { inputPolicy: "authenticated-prepared-nf-plus-live-frontier",
      frozenAnswerInputs: false,
      unsupportedNextDependency: null },
    publication: { relationCollectionComplete: true, hnfComplete: true,
      acceptanceComplete: true, compactUnitsComplete: true,
      correspondenceComplete: true,
      publicComplete: false },
  };
  return Object.freeze(owner);
}

module.exports = { SCHEMA, run };

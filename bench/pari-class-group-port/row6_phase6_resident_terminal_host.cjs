"use strict";

// Resident host for the largest currently connected row-6 native source cut.
// Compilation, authentication, allocation and output inspection are explicit
// lifecycle phases.  runInvocation contains one native call and nothing else.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const authentication = require("./prepared_nf_authentication.cjs");
const post = require("./row6_post1137_terminal_host.cjs");

const SOURCE = path.join(__dirname, "row6_phase6_resident_terminal_root.py");
const EXPORT = "pari_row6_phase6_resident_terminal_root";
const PREPARED_AUTHORITY_SHA256 =
  "1620c2d7e9ab145eb7400c3dd0e5dc8c2c689ef88f250f2800dde05768b493a0";
const ANCESTRY_SHA256 =
  "aafbe40446e563b9b93a2d186d24a9c0f4b9908c922c24dd64ce1c78e3500ae9";
const EXPECTED = Object.freeze({
  regulator: Object.freeze([
    "3626834249414306903656792336633990244294399400949119764057", "192", "56",
  ]),
  unitRelations: Object.freeze([
    "6", "0", "0", "6", "-2529485940798537", "-7",
    "60039863294012304", "70", "-14275683735510315", "-15",
    "-18707463945450123", "-35", "16197072521873160", "-30",
  ]),
  unitTransform: Object.freeze([
    "1", "0", "0", "0", "0", "0", "0",
    "289737766830681", "1", "1", "0", "0", "0", "0",
  ]),
  cleanLogs: Object.freeze([
    "3951536667455084576310059355761516743146573169259855950309", "192", "5",
    "-72892979845420388513784529064940556081802604267567431033412516651845850128585", "256", "6",
    "3951536043279602863959593487564016421410850116468489853779", "192", "5",
    "5761305202390732732449655971211743229356956092437773427840", "192", "49",
    "93881506903345174844199261197275811108630505293690768200171672225714123309056", "256", "25",
    "-5761305505738242059443242108136882020460453489277912430336", "192", "49",
  ]),
});

const canonicalSha256 = value => crypto.createHash("sha256")
  .update(JSON.stringify(value)).digest("hex");

function signature() {
  const source = fs.readFileSync(SOURCE, "utf8");
  const match = source.match(new RegExp(
    `def ${EXPORT}\\(([\\s\\S]*?)\\n\\) -> int:`,
  ));
  assert(match, "resident terminal signature disappeared");
  return match[1].trim().split("\n").map(line =>
    line.trim().replace(/,$/, "").split(": "));
}

function values(owner) {
  return owner.toArray ? owner.toArray() : Array.from(owner);
}

function words(entries, minimum = 1) {
  return entries.reduce((maximum, raw) => {
    const value = BigInt(raw), absolute = value < 0n ? -value : value;
    return Math.max(maximum,
      Math.ceil(Math.max(1, absolute.toString(2).length) / 64));
  }, minimum);
}

function allocateInteger(fn, length, capacity = 16, initial) {
  return fn.createIntegerBuffer(length, capacity,
    initial === undefined ? undefined : initial.map(BigInt));
}

function allocateInt64(fn, length, initial) {
  return fn.createInt64Buffer(initial === undefined ? length : initial.map(BigInt));
}

function allocateFloat64(fn, length, initial) {
  return fn.createFloat64Buffer(initial === undefined ? length : initial.map(Number));
}

async function prepareResident(preparedEnvelope, gate, factor, ancestry) {
  assert.equal(authentication.authenticatePreparedNf(preparedEnvelope.data).sha256,
    PREPARED_AUTHORITY_SHA256);
  assert.equal(String(preparedEnvelope.data.precision), "192",
    "row-6 resident precision corridor changed");
  post.validateInputs(gate, factor, preparedEnvelope);
  assert.equal(canonicalSha256(ancestry), ANCESTRY_SHA256,
    "row-6 resident ancestry changed");
  assert.equal(ancestry.schema,
    "sagejs.pari-class-group/row6-column-ancestry-v1");
  const built = await compileKernel({ sourcePath: SOURCE });
  const fn = require(built.modulePath)[EXPORT];
  assert.equal(fn?.nativeAvailable, true);
  return Object.freeze({
    preparedEnvelope: structuredClone(preparedEnvelope),
    gate: structuredClone(gate), factor: structuredClone(factor),
    ancestry: structuredClone(ancestry),
    built, fn, names: Object.freeze(signature().map(Object.freeze)),
  });
}

function prepareInvocation(resident) {
  const { data: prepared } = resident.preparedEnvelope;
  const { gate, factor, ancestry, fn } = resident;
  const primes = prepared.admission_primes.map(BigInt);
  const primeCount = primes.length, degree = 3, places = 3;
  const degreeCapacity = primeCount * degree;
  const indexDescriptor = factor.selectedDescriptors.find(row => row.p === "3");
  assert(indexDescriptor, "row-6 index-prime descriptor disappeared");
  const size = places * 8, square = places ** 2, reconstructionSize = 14;
  const input = {
    coefficients_exact: allocateInteger(fn, 4, 1, prepared.prep_polynomial),
    discriminant: BigInt(prepared.analytic_discriminant), real_places: 3n,
    complex_places: 0n, roots_of_unity: BigInt(prepared.analytic_roots_of_unity),
    equation_index: BigInt(prepared.prep_index),
    analytic_primes: allocateInteger(fn, primeCount, 1, primes),
    prime_count: BigInt(primeCount), index_prime: 3n,
    index_ideals: allocateInteger(fn, 9, words(indexDescriptor.tau), indexDescriptor.tau),
    index_ranks: allocateInteger(fn, 1, 1, [2]), index_count: 1n,
    catalog_workspace: allocateInteger(fn, 393),
    factor_degrees: allocateInteger(fn, 3), factor_exponents: allocateInteger(fn, 3),
    group_degrees: allocateInteger(fn, 3), group_counts: allocateInteger(fn, 3),
    local_state: allocateInteger(fn, 3),
    pattern_offsets: allocateInteger(fn, primeCount),
    pattern_counts: allocateInteger(fn, primeCount),
    pattern_degrees: allocateInteger(fn, degreeCapacity),
    pattern_multiplicities: allocateInteger(fn, degreeCapacity),
    full_offsets: allocateInteger(fn, primeCount),
    full_counts: allocateInteger(fn, primeCount),
    full_degrees: allocateInteger(fn, degreeCapacity),
    catalog_state: allocateInteger(fn, 4),
    log_discriminant: allocateFloat64(fn, 1),
    analytic_coefficients: allocateFloat64(fn, 7),
    analytic_table: allocateFloat64(fn, 31), analytic_tail: allocateFloat64(fn, 1),
    analytic_logarithms: allocateFloat64(fn, primeCount),
    log_inverse_residue: allocateFloat64(fn, 1),
    inverse_residue: allocateInteger(fn, 3), exp_cache: allocateInteger(fn, 3),
    pi_cache: allocateInteger(fn, 3), analytic_a: allocateInteger(fn, 64),
    analytic_b: allocateInteger(fn, 64), analytic_p: allocateInteger(fn, 64),
    analytic_q: allocateInteger(fn, 64), analytic_stack: allocateInteger(fn, 128),
    inverse_hr: allocateInteger(fn, 3), analytic_state: allocateInt64(fn, 2),
    factor_count: 1130n, h_rows: 2n, b_columns: 1128n, c_columns: 1137n,
    places: 3n, degree: 3n,
    h: allocateInteger(fn, 4, words(gate.final.h), gate.final.h),
    c: allocateInteger(fn, gate.final.c.length, 16, gate.final.c),
    logs: allocateInteger(fn, 63), tentative_class_number: allocateInteger(fn, 1),
    zeta_factor: allocateInteger(fn, 3), post_hnf_state: allocateInt64(fn, 3),
    prepared: allocateInteger(fn, 3 * size), selected: allocateInt64(fn, 8),
    prep_state: allocateInt64(fn, 3), rank_work: allocateInteger(fn, 3 * size),
    rank_occupied: allocateInt64(fn, 3), rank_pivots: allocateInt64(fn, 8),
    rank_state: allocateInt64(fn, 3), integer_input: allocateInteger(fn, size),
    integer_work: allocateInteger(fn, size), integer_occupied: allocateInteger(fn, 3),
    integer_pivots: allocateInteger(fn, 8), integer_best: allocateInteger(fn, 8),
    integer_state: allocateInteger(fn, 10), basis: allocateInteger(fn, 3 * square),
    minor: allocateInteger(fn, 3 * square), det_work: allocateInteger(fn, 3 * square),
    det_result: allocateInteger(fn, 3), det_pivots: allocateInt64(fn, 3),
    det_state: allocateInt64(fn, 5), inverse_work: allocateInteger(fn, 3 * square),
    inverse_rhs: allocateInteger(fn, 3 * square), inverse: allocateInteger(fn, 3 * square),
    inverse_pivots: allocateInt64(fn, 3), inverse_state: allocateInt64(fn, 3),
    product: allocateInteger(fn, 3 * square), inverse_slice: allocateInteger(fn, 3 * square),
    multiple: allocateInteger(fn, 3), coordinates: allocateInteger(fn, 3 * reconstructionSize),
    multiple_state: allocateInt64(fn, 4),
    rational_work: allocateInteger(fn, 3 * reconstructionSize),
    lattice: allocateInteger(fn, reconstructionSize),
    regulator_hnf_work: allocateInteger(fn, reconstructionSize),
    regulator_hnf_column: allocateInteger(fn, 2),
    regulator_hnf_output: allocateInteger(fn, reconstructionSize),
    regulator_hnf_state: allocateInt64(fn, 12), regulator: allocateInteger(fn, 3),
    unit_relations: allocateInteger(fn, reconstructionSize), denominator: allocateInteger(fn, 1),
    reconstruction_state: allocateInt64(fn, 4), hnf_row_pivots: allocateInt64(fn, 2),
    hnf_heights: allocateInt64(fn, 7), cache_changed: true,
    acceptance_state: allocateInt64(fn, 3),
    factor_base_state: allocateInteger(fn, 7, words(factor.baseState), factor.baseState),
    preparation_state: allocateInt64(fn, 8, [3, 0, 1130, 740, 0, 0, 0, 0]),
    smith_work: allocateInteger(fn, 4), smith_column: allocateInteger(fn, 2),
    invariants: allocateInteger(fn, 2), class_number: allocateInteger(fn, 1),
    smith_state: allocateInt64(fn, 6), terminal_state: allocateInt64(fn, 10),
    unit_manifest: { columns: 7n, precision: 192n, unit_rank: 2n,
      expect_large: true },
    unit_accepted_arch: allocateInteger(fn, 147, 16, ancestry.acceptedArch),
    unit_accepted_signs: allocateInt64(fn, 21, ancestry.acceptedSigns),
    unit_phase_pi: allocateInteger(fn, 3, 16, ancestry.phasePi),
    unit_preparation_embedding: allocateInteger(fn, 27, 16,
      prepared.preparation_embedding),
    unit_multiplication_basis: allocateInteger(fn, 27, 16, prepared.basis_table),
    unit_final_transform: allocateInteger(fn, 14),
    unit_bridge_transform: allocateInteger(fn, 14),
    unit_getfu_factor: allocateInteger(fn, 4),
    unit_clean_logs: allocateInteger(fn, 18),
    unit_sign_phases: allocateInt64(fn, 6), unit_c5_state: allocateInt64(fn, 5),
    unit_c5_trace: allocateFloat64(fn, 5), unit_factor_state: allocateInt64(fn, 2),
    unit_c6_state: allocateInt64(fn, 8), unit_state: allocateInt64(fn, 8),
    class_manifest: { rows: 1130n, columns: 1137n, degree: 3n,
      kernel_columns: 7n, class_columns: 2n },
    class_raw_relations: allocateInteger(fn, 1130 * 1137, 16,
      gate.final.relations),
    class_principal_generators: allocateInteger(fn, 3 * 1137, 256,
      gate.relationIdentity.generators),
    class_factor_ideals: allocateInteger(fn, 9 * 1130, 256,
      factor.factor.packetIdeals),
    class_factor_norms: allocateInteger(fn, 1130, 16,
      factor.factor.packetNorms),
    class_descriptor_generators: allocateInteger(fn, 3 * 1130, 16,
      factor.selectedDescriptors.flatMap(row => row.generator)),
    class_descriptor_primes: allocateInteger(fn, 1130, 16,
      factor.selectedDescriptors.map(row => row.p)),
    class_descriptor_e: allocateInteger(fn, 1130, 16,
      factor.selectedDescriptors.map(row => row.e)),
    class_descriptor_f: allocateInteger(fn, 1130, 16,
      factor.selectedDescriptors.map(row => row.f)),
    class_descriptor_inert: allocateInteger(fn, 1130, 16,
      factor.selectedDescriptors.map(row => Number(row.inert))),
    class_multiplication_basis: allocateInteger(fn, 27, 256,
      prepared.basis_table),
    class_raw_to_unit_kernel: allocateInteger(fn, 7 * 1137, 256,
      ancestry.rawToUnitKernel),
    class_raw_to_presentation: allocateInteger(fn, 2 * 1137, 256,
      ancestry.rawToPresentation),
    class_active_rows: allocateInt64(fn, 2),
    class_factor_map: allocateInteger(fn, 2 * 1130),
    class_state: allocateInt64(fn, 12),
    resident_state: allocateInt64(fn, 14),
  };
  assert.deepEqual(resident.names.map(([name]) => name), Object.keys(input));
  return { input };
}

function projection(invocation) {
  const input = invocation.input;
  const result = Object.freeze({
    schema: "sagejs.pari-class-group/row6-phase6-resident-terminal-projection-v1",
    residentState: Object.freeze(Array.from(input.resident_state, Number)),
    catalogState: Object.freeze(values(input.catalog_state).map(String)),
    analyticState: Object.freeze(Array.from(input.analytic_state, Number)),
    inverseHr: Object.freeze(values(input.inverse_hr).map(String)),
    postHnfState: Object.freeze(Array.from(input.post_hnf_state, Number)),
    multipleState: Object.freeze(Array.from(input.multiple_state, Number)),
    acceptanceState: Object.freeze(Array.from(input.acceptance_state, Number)),
    reconstructionState: Object.freeze(Array.from(input.reconstruction_state, Number)),
    regulator: Object.freeze(values(input.regulator).map(String)),
    unitRelations: Object.freeze(values(input.unit_relations).slice(0, 14).map(String)),
    smithState: Object.freeze(Array.from(input.smith_state, Number)),
    invariants: Object.freeze(values(input.invariants).slice(0, 2).map(String)),
    classNumber: String(values(input.class_number)[0]),
    terminalState: Object.freeze(Array.from(input.terminal_state, Number)),
    unitTransform: Object.freeze(values(input.unit_final_transform).map(String)),
    unitBridgeTransform: Object.freeze(values(input.unit_bridge_transform).map(String)),
    unitGetfuFactor: Object.freeze(values(input.unit_getfu_factor).map(String)),
    unitCleanLogs: Object.freeze(values(input.unit_clean_logs).map(String)),
    unitSignPhases: Object.freeze(Array.from(input.unit_sign_phases, Number)),
    unitC5State: Object.freeze(Array.from(input.unit_c5_state, Number)),
    unitFactorState: Object.freeze(Array.from(input.unit_factor_state, Number)),
    unitC6State: Object.freeze(Array.from(input.unit_c6_state, Number)),
    unitState: Object.freeze(Array.from(input.unit_state, Number)),
    classActiveRows: Object.freeze(Array.from(input.class_active_rows, Number)),
    classFactorMap: Object.freeze(values(input.class_factor_map).map(String)),
    classState: Object.freeze(Array.from(input.class_state, Number)),
  });
  assert.deepEqual(result.residentState,
    [0, 0, 0, 0, 0, 2, 1137, 7, 2, 192, 0, 1130, 1137, 7819]);
  assert.deepEqual(result.catalogState, ["0", "6543", "9719", "11905"]);
  assert.deepEqual(result.analyticState, [12288, 1469]);
  assert.deepEqual(result.postHnfState, [0, 7, 1]);
  assert.deepEqual(result.multipleState, [0, 0, 135, 2]);
  assert.deepEqual(result.acceptanceState, [2, 0, 0]);
  assert.deepEqual(result.reconstructionState, [0, 5, 113, 2]);
  assert.deepEqual(result.regulator, EXPECTED.regulator);
  assert.deepEqual(result.unitRelations, EXPECTED.unitRelations);
  assert.deepEqual(result.smithState, [0, 2, 0, 0, 0, 0]);
  assert.deepEqual(result.invariants, ["2", "2"]);
  assert.equal(result.classNumber, "4");
  assert.deepEqual(result.terminalState, [0, 0, 7, 0, 2, 1137, 0, 0, 2, 0]);
  assert.deepEqual(result.unitTransform, EXPECTED.unitTransform);
  assert.deepEqual(result.unitBridgeTransform, EXPECTED.unitTransform);
  assert.deepEqual(result.unitGetfuFactor, ["1", "0", "0", "1"]);
  assert.deepEqual(result.unitCleanLogs, EXPECTED.cleanLogs);
  assert.deepEqual(result.unitSignPhases, [1, 0, 0, 1, 0, 0]);
  assert.deepEqual(result.unitC5State, [0, 0, 0, 2, 7]);
  assert.deepEqual(result.unitFactorState, [0, 0]);
  assert.deepEqual(result.unitC6State, [2, 49, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(result.unitState, [0, 0, 0, 2, 0, 7, 2, 192]);
  assert.deepEqual(result.classActiveRows, [1092, 1094]);
  assert.equal(result.classFactorMap.length, 2260);
  assert.equal(result.classFactorMap.filter(value => value !== "0").length, 2);
  assert.equal(result.classFactorMap[1092], "1");
  assert.equal(result.classFactorMap[1130 + 1094], "1");
  assert.deepEqual(result.classState,
    [0, 1130, 0, 1137, 7116, 7819, 5, 1092, 1094, 3, 4, 2]);
  return result;
}

function runInvocation(resident, invocation) {
  const status = resident.fn.gmp(...resident.names.map(([name]) => invocation.input[name]));
  assert.equal(status, 0n);
  return Object.freeze({ timingEligible: false, kernelNanoseconds: null,
    projection: projection(invocation), executionBoundary: Object.freeze({
      residentProcess: true, compilationInsideClock: false,
      preparedAuthenticationInsideClock: false, bufferAllocationInsideClock: false,
      subprocessesInsideClock: false, filesystemInsideClock: false,
      serializationInsideClock: false, inspectionInsideClock: false,
      nativeCallsPerCorrectnessRun: 1,
    }) });
}

function createProcessCoordinatorAdapter(resident) {
  return Object.freeze({
    timingEligible: false,
    prepareSample: () => prepareInvocation(resident),
    runCorrectness: invocation => runInvocation(resident, invocation),
    runSample: () => {
      const error = new Error("row 6 resident source cut is not a complete prepared kernel");
      error.code = "SAGEJS_PHASE6_INCOMPLETE_RESIDENT_CUT";
      throw error;
    },
    commonProjection: sample => sample.projection,
  });
}

module.exports = { ANCESTRY_SHA256, EXPECTED, EXPORT, PREPARED_AUTHORITY_SHA256, SOURCE,
  createProcessCoordinatorAdapter, prepareInvocation, prepareResident,
  projection, runInvocation };

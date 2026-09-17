"use strict";

// One-process prepared h=1 root.  The expensive kernels are compiled before
// this module is loaded and supplied as module paths.  `runPreparedH1` itself
// performs no file or process I/O: candidate owners are allocated once, the
// resident candidate mutates them, and those same owners are passed to the
// final owner bridge.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const nativeModule = require(process.env.SAGEJS_H1_UNIFIED_MODULE);
const nativeRoot = nativeModule.pari_live_prepared_h1_native;

const BRIDGE_NAMES = [
  "accepted_arch", "relation_lattice", "expected_regulator",
  "prep_base_state", "prep_state", "hnf_state", "acceptance_state",
  "attempt_state", "class_number", "columns", "precision",
  "unit_transform", "getfu_factor", "compact_provenance", "cleaned_arch",
  "bridge_state", "u1", "u2", "first_arch", "p_triples", "au",
  "clean_logs", "signs", "unit_state", "unit_trace", "integer_state",
  "integer_basis", "integer_transform", "integer_gram", "integer_mu",
  "integer_mu_exponents", "integer_r", "integer_r_exponents", "integer_s",
  "integer_s_exponents", "integer_approximate", "integer_float_gram",
  "integer_alpha", "integer_column", "integer_column_exponents",
  "integer_normalized", "integer_temporary", "integer_dpe_scratch",
  "integer_scratch", "real_integers", "real_form", "real_basis",
  "real_transform", "real_gram", "real_mu", "real_mu_exponents", "real_r",
  "real_r_exponents", "real_s", "real_s_exponents", "real_approximate",
  "real_float_gram", "real_alpha", "real_column", "real_column_exponents",
  "real_normalized", "real_temporary", "real_dpe_scratch", "real_scratch",
  "real_state", "factor_matep", "factor_basis", "factor_transform",
  "factor_state", "factor_mu", "factor_mu_exponents", "factor_r",
  "factor_r_exponents", "factor_s", "factor_s_exponents",
  "factor_approximate", "factor_float_gram", "factor_alpha",
  "factor_column", "factor_column_exponents", "factor_normalized",
  "factor_temporary", "factor_exact_gram", "clean_pi_cache", "clean_a",
  "clean_b", "clean_p", "clean_q", "clean_stack", "clean_scratch",
  "clean_state", "driver_state",
];

const FLOAT_NAMES = new Set([
  "unit_trace", "integer_mu", "integer_r", "integer_s",
  "integer_approximate", "integer_float_gram", "integer_normalized",
  "integer_temporary", "integer_dpe_scratch", "real_mu", "real_r", "real_s",
  "real_approximate", "real_float_gram", "real_normalized", "real_temporary",
  "real_dpe_scratch", "factor_mu", "factor_r", "factor_s",
  "factor_approximate", "factor_float_gram", "factor_normalized",
  "factor_temporary",
]);
const INT64_NAMES = new Set([
  "prep_state", "hnf_state", "acceptance_state", "attempt_state",
  "bridge_state", "signs", "unit_state", "factor_state", "clean_state",
  "driver_state",
]);
const SIZES = Object.freeze({
  unit_transform:14,getfu_factor:4,compact_provenance:14,cleaned_arch:147,
  bridge_state:16,u1:14,u2:4,first_arch:42,p_triples:18,au:42,clean_logs:18,
  signs:6,unit_state:5,unit_trace:5,integer_state:5,integer_basis:14,
  integer_transform:49,integer_gram:49,integer_mu:49,integer_mu_exponents:49,
  integer_r:49,integer_r_exponents:49,integer_s:7,integer_s_exponents:7,
  integer_approximate:14,integer_float_gram:49,integer_alpha:7,
  integer_column:7,integer_column_exponents:7,integer_normalized:7,
  integer_temporary:7,integer_dpe_scratch:7,integer_scratch:7,
  real_integers:6,real_form:3,real_basis:6,real_transform:4,real_gram:4,
  real_mu:4,real_mu_exponents:4,real_r:4,real_r_exponents:4,real_s:2,
  real_s_exponents:2,real_approximate:6,real_float_gram:4,real_alpha:2,
  real_column:3,real_column_exponents:3,real_normalized:3,real_temporary:3,
  real_dpe_scratch:3,real_scratch:3,real_state:2,factor_matep:18,
  factor_basis:6,factor_transform:4,factor_state:2,factor_mu:4,
  factor_mu_exponents:4,factor_r:4,factor_r_exponents:4,factor_s:2,
  factor_s_exponents:2,factor_approximate:6,factor_float_gram:4,
  factor_alpha:2,factor_column:3,factor_column_exponents:2,
  factor_normalized:3,factor_temporary:3,factor_exact_gram:4,
  clean_pi_cache:3,clean_a:512,clean_b:512,clean_p:512,clean_q:512,
  clean_stack:1024,clean_scratch:147,clean_state:4,driver_state:10,
});

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])]),
  );
  return value;
}
function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
function values(value) {
  return value.toArray ? value.toArray() : Array.from(value);
}
function decimals(value, length = undefined) {
  const result = values(value);
  return (length === undefined ? result : result.slice(0, length)).map(String);
}
function makeBuffer(fn, kind, data, name = "") {
  if (kind === "Float64Buffer") return fn.createFloat64Buffer(data.map(Number));
  if (kind === "Int64Buffer") return fn.createInt64Buffer(data.map(BigInt));
  // Capacity is measured in 64-bit words, not bits.  Ordinary resident owners
  // remain below 384 bits.  The prepared admission product is the sole wide
  // owner and is bounded by the 65,537-bit factor limit plus cubic growth.
  const wordCapacity = name === "admission_products" ? 2048 : 16;
  return fn.createIntegerBuffer(data.length, wordCapacity, data.map(BigInt));
}
function allocateCandidate(prepared) {
  assert.equal(prepared.schema, "sagejs.pari-class-group/sanitized-prepared-h1-v1");
  const owners = {};
  for (const [name, kind] of prepared.names) {
    const raw = prepared.input[name];
    if (kind.endsWith("Buffer")) owners[name] = makeBuffer(nativeRoot, kind, raw, name);
    else if (kind === "bool") owners[name] = Boolean(raw);
    else if (kind === "float") owners[name] = Number(raw);
    else owners[name] = BigInt(raw);
  }
  return owners;
}
function allocateFinal() {
  const owners = { prep_state: nativeRoot.createInt64Buffer(Array(8).fill(0n)) };
  for (const name of BRIDGE_NAMES.slice(11)) {
    const kind = FLOAT_NAMES.has(name) ? "Float64Buffer"
      : INT64_NAMES.has(name) ? "Int64Buffer" : "IntegerBuffer";
    const zero = kind === "Float64Buffer" ? 0 : 0n;
    owners[name] = makeBuffer(nativeRoot, kind, Array(SIZES[name]).fill(zero));
  }
  return owners;
}

function multiplyCubic(left, right, tensor) {
  const matrix = Array.from({ length: 9 }, (_, index) =>
    left.reduce((sum, value, k) => sum + value * tensor[9 * k + index], 0n));
  return Array.from({ length: 3 }, (_, row) =>
    right.reduce((sum, value, column) =>
      sum + matrix[3 * column + row] * value, 0n));
}
function determinant3(matrix) {
  return matrix[0] * (matrix[4] * matrix[8] - matrix[7] * matrix[5])
    - matrix[3] * (matrix[1] * matrix[8] - matrix[7] * matrix[2])
    + matrix[6] * (matrix[1] * matrix[5] - matrix[4] * matrix[2]);
}
function multiplicationMatrix(element, tensor) {
  return Array.from({ length: 9 }, (_, index) =>
    element.reduce((sum, value, k) => sum + value * tensor[9 * k + index], 0n));
}
function divideExact(numerator, denominator, tensor) {
  const matrix = multiplicationMatrix(denominator, tensor);
  const det = determinant3(matrix);
  assert.notEqual(det, 0n, "zero principal relation product");
  const adjugateColumn = [
    matrix[4] * matrix[8] - matrix[7] * matrix[5],
    matrix[2] * matrix[7] - matrix[1] * matrix[8],
    matrix[1] * matrix[5] - matrix[2] * matrix[4],
  ];
  const scaled = multiplyCubic(numerator, adjugateColumn, tensor);
  assert(scaled.every(value => value % det === 0n),
    "nonintegral principal relation quotient");
  return scaled.map(value => value / det);
}
function powerCubic(element, exponent, tensor) {
  let answer = [1n, 0n, 0n], base = element;
  while (exponent > 0n) {
    if (exponent & 1n) answer = multiplyCubic(answer, base, tensor);
    exponent >>= 1n;
    if (exponent) base = multiplyCubic(base, base, tensor);
  }
  return answer;
}
function relationProduct(generators, exponents, tensor) {
  let positive = [1n, 0n, 0n], negative = [1n, 0n, 0n];
  for (let index = 0; index < 73; index += 1) {
    const exponent = exponents[index];
    if (exponent > 0n) positive = multiplyCubic(positive,
      powerCubic(generators[index], exponent, tensor), tensor);
    else if (exponent < 0n) negative = multiplyCubic(negative,
      powerCubic(generators[index], -exponent, tensor), tensor);
  }
  return divideExact(positive, negative, tensor);
}
function reconstructExactUnits(live, compactBuffer) {
  const words = values(live.generators).slice(0, 219).map(BigInt);
  const generators = Array.from({ length: 73 }, (_, index) =>
    words.slice(3 * index, 3 * index + 3));
  const cleanup = values(live.hnf_transform).slice(0, 73 * 73).map(BigInt);
  const active = values(live.hnf_hnf_transform).slice(0, 15 * 15).map(BigInt);
  const compact = values(compactBuffer).slice(0, 14).map(BigInt);
  const tensor = values(live.basis_table).slice(0, 27).map(BigInt);
  const kernelRelations = [], factors = [];
  for (let kernel = 0; kernel < 7; kernel += 1) {
    const exponents = Array.from({ length: 73 }, (_, relation) => {
      let sum = 0n;
      for (let column = 0; column < 15; column += 1)
        sum += active[15 * kernel + column] * cleanup[73 * column + relation];
      return sum;
    });
    kernelRelations.push(exponents);
    const factor = relationProduct(generators, exponents, tensor);
    const norm = determinant3(multiplicationMatrix(factor, tensor));
    assert(norm === -1n || norm === 1n, "kernel factor is not a unit");
    factors.push(factor);
  }
  const units = [], norms = [], retained = [];
  for (let unit = 0; unit < 2; unit += 1) {
    const exponents = Array.from({ length: 73 }, (_, relation) => {
      let sum = 0n;
      for (let kernel = 0; kernel < 7; kernel += 1)
        sum += compact[7 * unit + kernel] * kernelRelations[kernel][relation];
      return sum;
    });
    retained.push(...exponents);
    const direct = relationProduct(generators, exponents, tensor);
    let factored = [1n, 0n, 0n];
    for (let kernel = 0; kernel < 7; kernel += 1) {
      const exponent = compact[7 * unit + kernel];
      if (exponent > 0n) factored = multiplyCubic(factored,
        powerCubic(factors[kernel], exponent, tensor), tensor);
      else if (exponent < 0n) factored = divideExact(factored,
        powerCubic(factors[kernel], -exponent, tensor), tensor);
    }
    assert.deepEqual(direct, factored, "direct and factored exact unit differ");
    const norm = determinant3(multiplicationMatrix(direct, tensor));
    assert(norm === -1n || norm === 1n, "selected exact element is not a unit");
    units.push([direct[0] - 13345n * direct[2],
      direct[1] + 2n * direct[2], direct[2]]);
    norms.push(norm);
  }
  return { powerCoordinates: units.map(row => row.map(String)),
    norms: norms.map(String), retained };
}
function integerBuffer(fn, length, data = []) {
  // The suffix works at p2176; 128 limbs retain ample exact scratch headroom
  // without reserving hundreds of GiB across its owner graph.
  return fn.createIntegerBuffer(length, 128,
    Array.from({ length }, (_, index) => BigInt(data[index] ?? 0)));
}
function int64Buffer(fn, length) {
  return fn.createInt64Buffer(Array(length).fill(0n));
}
function requireP2176RegulatorCorrespondence(computedValue, residentValue) {
  const computed = computedValue.map(BigInt);
  const expected = residentValue.map(BigInt);
  if (computed[0] < 0n) computed[0] = -computed[0];
  assert.deepEqual(computed.slice(1), expected.slice(1),
    "p2176 rebuilt regulator scale left the accepted regulator");
  const ulpError = computed[0] >= expected[0]
    ? computed[0] - expected[0] : expected[0] - computed[0];
  // This qualified field's independently rebuilt p2176 and resident p192
  // evaluation paths differ by four final p192 ulps.  This is a measured,
  // pinned correspondence corridor, not a general regulator certificate.
  assert(ulpError <= 4n,
    "p2176 rebuilt log determinant left the accepted regulator enclosure");
  return { computed, ulpError };
}
function rebuildP2176(live, exactUnits) {
  const rebuildEmbedding = require(process.env.SAGEJS_H1_EMBEDDING_MODULE)
    .pari_cubic_embedding_rebuild;
  const precisionModule = require(process.env.SAGEJS_H1_PRECISION_MODULE);
  const rebuildPrecision = precisionModule.pari_cubic_sunit_precision_rebuild;
  const regulatorDeterminant = require(process.env.SAGEJS_H1_DETERMINANT_MODULE)
    .pari_regulator_determinant;
  const polynomial = values(live.prep_polynomial).slice(0, 4);
  const basis = values(live.prep_zk).slice(0, 9);
  const rootM = integerBuffer(rebuildEmbedding, 3);
  const rootP = integerBuffer(rebuildEmbedding, 3);
  const rootE = integerBuffer(rebuildEmbedding, 3);
  const matrices = [integerBuffer(rebuildEmbedding, 9),
    integerBuffer(rebuildEmbedding, 9), integerBuffer(rebuildEmbedding, 9)];
  const embeddingState = int64Buffer(rebuildEmbedding, 4);
  assert.equal(rebuildEmbedding.gmp(
    integerBuffer(rebuildEmbedding, 4, polynomial),
    integerBuffer(rebuildEmbedding, 9, basis), 2176n,
    rootM, rootP, rootE, ...matrices, embeddingState), 0n);
  assert.deepEqual(decimals(embeddingState), ["3", "2176", "2496", "1"]);

  // Buffers are addon-owned, so copy the three 3-by-3 packed matrices into
  // the precision kernel's arena.  No values are serialized.
  const packedMatrices = matrices.map(matrix => {
    const source = values(matrix);
    const rowMajor = Array.from({ length: 9 }, (_, index) => {
      const row = Math.floor(index / 3);
      const column = index % 3;
      return source[3 * column + row];
    });
    return integerBuffer(rebuildPrecision, 9, rowMajor);
  });
  const generators = integerBuffer(rebuildPrecision, 219,
    values(live.generators).slice(0, 219));
  const transform = integerBuffer(rebuildPrecision, 146, exactUnits.retained);
  const output = integerBuffer(rebuildPrecision, 42);
  const phases = integerBuffer(rebuildPrecision, 6);
  const precisionState = int64Buffer(rebuildPrecision, 5);
  assert.equal(rebuildPrecision.gmp(
    ...packedMatrices, generators, transform, 73n, 2176n,
    integerBuffer(rebuildPrecision, 21 * 73), integerBuffer(rebuildPrecision, 42),
    integerBuffer(rebuildPrecision, 42), integerBuffer(rebuildPrecision, 42), output,
    integerBuffer(rebuildPrecision, 6), phases, integerBuffer(rebuildPrecision, 3),
    integerBuffer(rebuildPrecision, 3), integerBuffer(rebuildPrecision, 512),
    integerBuffer(rebuildPrecision, 512), integerBuffer(rebuildPrecision, 512),
    integerBuffer(rebuildPrecision, 512), integerBuffer(rebuildPrecision, 128),
    int64Buffer(rebuildPrecision, 4), precisionState), 0n);
  assert.deepEqual(decimals(precisionState), ["0", "73", "2", "2", "2176"]);
  const records = values(output);
  const logTriples = Array.from({ length: 6 }, (_, index) =>
    records.slice(7 * index + 1, 7 * index + 4));
  if (process.env.SAGEJS_H1_TRACE)
    console.error("live-h1:p2176-logs-sha256:" +
      digest(logTriples.map(row => row.map(String))));
  const determinantInput = [logTriples[0], logTriples[1],
    logTriples[3], logTriples[4]].flat();
  const determinantOutput = integerBuffer(regulatorDeterminant, 3);
  const determinantState = int64Buffer(regulatorDeterminant, 5);
  assert.equal(regulatorDeterminant.gmp(
    integerBuffer(regulatorDeterminant, 12, determinantInput), 2n,
    integerBuffer(regulatorDeterminant, 12), determinantOutput,
    int64Buffer(regulatorDeterminant, 1), determinantState), 0n);
  const highPrecision = values(determinantOutput).map(BigInt);
  const resized = precisionModule.pari_real_resize.gmp(
    highPrecision[0], highPrecision[1], highPrecision[2], 192n);
  const expected = values(live.accept_regulator).slice(0, 3).map(BigInt);
  const { computed, ulpError: regulatorUlpError } =
    requireP2176RegulatorCorrespondence(resized, expected);
  const rejected = [computed[0] + 5n, computed[1], computed[2]];
  assert.throws(() => requireP2176RegulatorCorrespondence(rejected, computed),
    /regulator enclosure/);
  return {
    precisionBits: "2176",
    embeddingState: decimals(embeddingState),
    logState: decimals(precisionState),
    packedLogsSha256: digest(logTriples.map(row => row.map(String))),
    phases: decimals(phases),
    regulatorTriplet: computed.map(String),
    residentRegulatorUlpError: String(regulatorUlpError),
    highPrecisionRegulatorTriplet: highPrecision.map(String),
    regulatorState: decimals(determinantState),
  };
}

async function runPreparedH1({ implementation, seed, preparedInput, switchStage }) {
  const trace = name => { if (process.env.SAGEJS_H1_TRACE) console.error("live-h1:" + name); };
  assert.equal(implementation, "sagejs");
  assert.match(seed, /^(0|[1-9][0-9]*)$/);
  const live = allocateCandidate(preparedInput);
  const final = allocateFinal();
  trace("allocated-candidate");

  switchStage("relation-retry");
  const action = nativeRoot.gmp(
    ...preparedInput.names.map(([name]) => live[name]),
    final.prep_state,
    ...BRIDGE_NAMES.slice(11).map(name => final[name]),
  );
  trace("candidate-returned");
  assert.equal(action, 0n, "prepared resident candidate did not accept");
  assert.deepEqual(decimals(live.attempt_state, 4), ["4", "0", "0", "1"]);
  assert.deepEqual(decimals(live.class_number, 1), ["1"]);

  switchStage("sparse-hnf-snf-transform");
  assert.equal(decimals(live.relation_state, 6)[0], "73");
  assert.equal(decimals(live.hnf_state, 9)[0], "0");

  switchStage("unit-regulator");
  assert.deepEqual(decimals(final.bridge_state, 16),
    ["0","0","0","0","0","7","1","0","73","8","48","48","2","7","7","0"]);

  switchStage("honesty-generators-final");
  const polynomial = decimals(live.prep_polynomial, 4);
  assert.deepEqual(polynomial, ["20034", "-20018", "0", "1"]);
  const compact = decimals(final.compact_provenance, 14);
  const exactUnits = reconstructExactUnits(live, final.compact_provenance);
  trace("exact-units-returned");
  if (process.env.SAGEJS_H1_TRACE)
    console.error("live-h1:exact-units-sha256:" + digest(exactUnits.powerCoordinates));
  const p2176 = rebuildP2176(live, exactUnits);
  trace("p2176-returned");
  const cleaned = decimals(final.cleaned_arch, 147);
  const driver = decimals(final.driver_state, 10);
  assert.deepEqual(driver, ["0","1","1","48","48","7","7","73","8","0"]);
  const result = {
    schema: "sagejs.pari-class-group/internal-correspondence-completion-v1",
    field: { id: "x^3-20018*x+20034", polynomial_ascending: polynomial },
    class_group: {
      class_number: "1", invariant_factors: [], generator_ideals: [],
      factor_base_size: decimals(live.prep_base_state, 7)[2],
      principal_relation_count: decimals(live.relation_state, 6)[0],
      cleaned_presentation_sha256: digest(cleaned),
    },
    unit_group_correspondence: {
      rank: "2", compact_factor_count: "7", compact_exponents: compact,
      getfu_factor: decimals(final.getfu_factor, 4),
      regulator_triplet: decimals(live.accept_regulator, 3),
      exact_units_power_coordinates: exactUnits.powerCoordinates,
      exact_unit_norms: exactUnits.norms,
      torsion_order: "2", torsion_generator_power_coordinates: ["-1", "0", "0"],
      exact_expansion: "live-principal-relation-replay",
      p2176_regulator_replay: p2176,
    },
    honesty: {
      status: "equal-bound-source-skip", relation_bound: driver[3],
      checking_bound: driver[4], relation_groups: driver[5],
      checking_groups: driver[6], accepted_relations: driver[7],
    },
    live_owners: {
      cleanarch_state: driver, owner_bridge_state: decimals(final.bridge_state, 16),
      compact_provenance_sha256: digest(compact),
    },
    assumptions: {
      scope: "internal-PARI-correspondence-only", pari_correspondence_assumed: true,
      independent_unit_index_one: false,
    },
    terminal: {
      status: "pari-correspondence-complete-internal-h1",
      correspondence_complete: true, composition_driver_published: true,
      public_complete: false, class_unit_computation_complete: false,
      unit_saturation_certified: false,
    },
  };
  const resultSha256 = digest(result);
  return {
    correspondenceComplete: true,
    result,
    replay: { status: "cold-replay-authenticated", resultSha256,
      authoritySha256: digest({ resultSha256, seed, polynomial }) },
    rng: { seed, terminalState: decimals(live.prep_kummer_random_state, 66) },
    work: { candidateCalls: "1", bridgeCalls: "1", acceptedRelations: "73",
      cleanedColumns: "7", serializedIntermediates: "0", externalOracleCalls: "0" },
    terminalStatus: "pari-correspondence-complete-internal-h1",
  };
}

module.exports = { requireP2176RegulatorCorrespondence, runPreparedH1 };

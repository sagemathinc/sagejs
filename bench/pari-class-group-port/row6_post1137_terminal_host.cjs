"use strict";

// Authenticated row-6 Gate-C owner -> analytic acceptance, regulator lattice,
// and Smith invariants.  The mathematical entry is the field-neutral ordinary
// Python source already used by row 14; only owner shapes are row-specific.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const GATE_SCHEMA = "sagejs.pari-class-group/row6-prepared-gate-c-owner-v1";
const FACTOR_SCHEMA = "sagejs.pari-class-group/row6-prepared-factor-base-owner-v1";
const GATE_SHA256 = "6b6a4ee102f8682254470dc8e7d05f63d5e449282df248a15bc54b938adaac98";
const FACTOR_SHA256 = "1afc78df4b2ff4fe85dd3385589835095c8123da86082de0f66dce4e0897fbef";
const PREPARED_AUTHORITY_SHA256 =
  "1620c2d7e9ab145eb7400c3dd0e5dc8c2c689ef88f250f2800dde05768b493a0";
const ROWS = 1130, COLUMNS = 1137, PLACES = 3, DEGREE = 3;

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const absBigInt = raw => { const value = BigInt(raw); return value < 0n ? -value : value; };
const words = values => values.reduce((answer, raw) => {
  let value = BigInt(raw); if (value < 0n) value = -value;
  return Math.max(answer, Math.ceil(Math.max(1, value.toString(2).length) / 64));
}, 1);

function signature(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = fs.readFileSync(source, "utf8")
    .match(new RegExp(`def ${escaped}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing signature ${name}`);
  return match[1].trim().split("\n")
    .map(line => line.trim().replace(/,$/, "").split(": "));
}

async function compiled(name) {
  const source = path.join(__dirname, "row14_post806_terminal.py");
  const built = await compileKernel({ sourcePath: source });
  const fn = require(built.modulePath)[name];
  assert(fn?.nativeAvailable, `${name} native module unavailable`);
  return { source, built, fn, names: signature(source, name) };
}

function integer(fn, length, capacity = 16, values) {
  return fn.createIntegerBuffer(length, capacity,
    values === undefined ? undefined : values.map(BigInt));
}
function int64(fn, length, values) {
  return fn.createInt64Buffer(values === undefined ? length : values.map(BigInt));
}
function float64(fn, length, values) {
  return fn.createFloat64Buffer(values === undefined ? length : values.map(Number));
}
function readGzipOwner(file, digest, schema) {
  const compressed = fs.readFileSync(file);
  assert.equal(fs.statSync(file).mode & 0o222, 0, "owner is mutable");
  const plain = zlib.gunzipSync(compressed);
  assert.equal(sha256(plain), digest, "owner identity changed");
  const owner = JSON.parse(plain);
  assert.equal(owner.schema, schema);
  return owner;
}

function validateInputs(gate, factor, preparedEnvelope) {
  assert.equal(preparedEnvelope.authoritySha256, PREPARED_AUTHORITY_SHA256);
  const prepared = preparedEnvelope.data;
  assert.equal(gate.authority.preparedAuthoritySha256, PREPARED_AUTHORITY_SHA256);
  assert.equal(gate.authority.factorOwnerSha256, FACTOR_SHA256);
  assert.equal(factor.authority.preparedAuthoritySha256, PREPARED_AUTHORITY_SHA256);
  assert.deepEqual(gate.field.polynomial, prepared.prep_polynomial.map(String));
  assert.deepEqual(gate.field.signature, [3, 0]);
  assert.deepEqual(gate.final.state, [2, 9, 1128, 0, 7, 1, 0, 1137, 0]);
  assert.equal(gate.final.h.length, 4);
  assert.equal(gate.final.dep.length, 0);
  assert.equal(gate.final.b.length, 2 * 1128);
  assert.equal(gate.final.c.length, 21 * COLUMNS);
  assert.deepEqual(factor.rootState.slice(1, 8),
    ["9196", "9196", "1130", "740", "740", "1130", "4"]);
  assert.equal(factor.baseState.length, 7);
  assert.equal(factor.factor.packetIdeals.length, 9 * ROWS);
  assert.equal(factor.factor.packetNorms.length, ROWS);
  return prepared;
}

async function runRow6Post1137TerminalFromOwners(gate, factor, preparedEnvelope) {
  const prepared = validateInputs(gate, factor, preparedEnvelope);
  // Compile the actual ordinary source explicitly; no function-name based
  // replacement or hidden handwritten implementation is admitted.
  const catalogSource = path.join(__dirname, "row6_prepared_factor_base_root.py");
  const catalogBuilt = await compileKernel({ sourcePath: catalogSource });
  const catalogFn = require(catalogBuilt.modulePath).pari_row6_prime_degree_catalog;
  assert(catalogFn?.nativeAvailable);
  const catalogNames = signature(catalogSource, "pari_row6_prime_degree_catalog");
  // The stored analytic prefix ends at 10,007 for factor-base sizing, while
  // inverse-hR for this much larger discriminant legitimately needs farther
  // primes.  The authenticated prepared owner carries the complete canonical
  // admission prefix through 65,537.
  const primes = prepared.admission_primes.map(Number);
  const primeCount = primes.length;
  const degreeCapacity = primeCount * DEGREE;
  const indexDescriptor = factor.selectedDescriptors.find(row => row.p === "3");
  assert(indexDescriptor);
  const cv = {
    coefficients: integer(catalogFn, 4, 1, prepared.prep_polynomial), degree: 3n,
    equation_index: BigInt(prepared.prep_index),
    primes: integer(catalogFn, primeCount, 1, primes), prime_count: BigInt(primeCount),
    index_prime: 3n,
    index_ideals: integer(catalogFn, 9, words(indexDescriptor.tau), indexDescriptor.tau),
    index_ranks: integer(catalogFn, 1, 1, [2]), index_count: 1n,
    workspace: integer(catalogFn, 393), factor_degrees: integer(catalogFn, 3),
    factor_exponents: integer(catalogFn, 3), group_degrees: integer(catalogFn, 3),
    group_counts: integer(catalogFn, 3), local_state: integer(catalogFn, 3),
    pattern_offsets: integer(catalogFn, primeCount), pattern_counts: integer(catalogFn, primeCount),
    pattern_degrees: integer(catalogFn, degreeCapacity),
    pattern_multiplicities: integer(catalogFn, degreeCapacity),
    full_offsets: integer(catalogFn, primeCount), full_counts: integer(catalogFn, primeCount),
    full_degrees: integer(catalogFn, degreeCapacity), state: integer(catalogFn, 4),
  };
  assert.equal(catalogFn.gmp(...catalogNames.map(([name]) => cv[name])), 0n);

  const terminal = await compiled("pari_row14_post806_terminal");
  const analytic = require(terminal.built.modulePath).pari_row14_analytic_inverse_hr;
  assert(analytic?.nativeAvailable);
  const av = {
    discriminant: BigInt(prepared.analytic_discriminant), real_places: 3n,
    complex_places: 0n, roots_of_unity: BigInt(prepared.analytic_roots_of_unity),
    log_discriminant: float64(analytic, 1), primes: integer(analytic, primeCount, 1, primes),
    offsets: integer(analytic, primeCount, 1, cv.pattern_offsets.toArray()),
    counts: integer(analytic, primeCount, 1, cv.pattern_counts.toArray()),
    degrees: integer(analytic, degreeCapacity, 1, cv.pattern_degrees.toArray()),
    multiplicities: integer(analytic, degreeCapacity, 1, cv.pattern_multiplicities.toArray()),
    coefficients: float64(analytic, 7), table: float64(analytic, 31),
    tail: float64(analytic, 1), logarithms: float64(analytic, primeCount),
    log_inverse_residue: float64(analytic, 1), inverse_residue: integer(analytic, 3),
    exp_cache: integer(analytic, 3), pi_cache: integer(analytic, 3),
    a: integer(analytic, 64), b: integer(analytic, 64), p: integer(analytic, 64),
    q: integer(analytic, 64), stack: integer(analytic, 128), inverse_hr: integer(analytic, 3),
    state: int64(analytic, 2),
  };
  const analyticNames = signature(terminal.source, "pari_row14_analytic_inverse_hr");
  assert.equal(analytic.gmp(...analyticNames.map(([name]) => av[name])), 0n);

  const size = PLACES * 8, square = PLACES ** 2, reconstructionSize = 14;
  const tv = {
    factor_count: 1130n, h_rows: 2n, b_columns: 1128n, c_columns: 1137n,
    places: 3n, degree: 3n,
    h: integer(terminal.fn, 4, words(gate.final.h), gate.final.h),
    c: integer(terminal.fn, gate.final.c.length, 16, gate.final.c),
    inverse_hr: integer(terminal.fn, 3, 16, av.inverse_hr.toArray()),
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
    factor_base_state: integer(terminal.fn, 7, words(factor.baseState), factor.baseState),
    preparation_state: int64(terminal.fn, 8,
      [3, 0, 1130, 740, 0, 0, 0, 0]),
    smith_work: integer(terminal.fn, 4), smith_column: integer(terminal.fn, 2),
    invariants: integer(terminal.fn, 2), class_number: integer(terminal.fn, 1),
    smith_state: int64(terminal.fn, 6), terminal_state: int64(terminal.fn, 10),
  };
  const status = terminal.fn.gmp(...terminal.names.map(([name]) => tv[name]));
  const unitRelations = tv.unit_relations.toArray().slice(0, reconstructionSize).map(String);
  return {
    schema: "sagejs.pari-class-group/row6-post1137-terminal-v1",
    status: Number(status), gateOwnerSha256: GATE_SHA256, factorOwnerSha256: FACTOR_SHA256,
    preparedAuthoritySha256: PREPARED_AUTHORITY_SHA256,
    analyticPrimeCount: primeCount, analyticState: Array.from(av.state, Number),
    fieldDiscriminant: String(prepared.analytic_discriminant),
    normalizationDiscriminant: String(absBigInt(prepared.analytic_discriminant)),
    inverseHr: av.inverse_hr.toArray().map(String),
    postHnfState: Array.from(tv.post_hnf_state, Number),
    multipleState: Array.from(tv.multiple_state, Number),
    acceptanceState: Array.from(tv.acceptance_state, Number),
    reconstructionState: Array.from(tv.reconstruction_state, Number),
    regulator: tv.regulator.toArray().map(String), unitRelations,
    unitRelationsSha256: sha256(Buffer.from(JSON.stringify(unitRelations))),
    smithState: Array.from(tv.smith_state, Number),
    invariants: tv.invariants.toArray().slice(0, Number(tv.smith_state[1])).map(String),
    classNumber: String(tv.class_number.toArray()[0]),
    terminalState: Array.from(tv.terminal_state, Number),
    completeness: { fullSmithTransform: false, idealGeneratorWitnesses: false,
      principalRelationWitnesses: false },
    inputOwners: ["preparedNfAuthority", "liveGateCOwner", "factorBaseOwner"],
    artifacts: { catalog: catalogBuilt.cacheKey, terminal: terminal.built.cacheKey },
  };
}

async function runRow6Post1137Terminal(gatePath, factorPath, preparedPath) {
  return runRow6Post1137TerminalFromOwners(
    readGzipOwner(gatePath, GATE_SHA256, GATE_SCHEMA),
    readGzipOwner(factorPath, FACTOR_SHA256, FACTOR_SCHEMA),
    JSON.parse(fs.readFileSync(preparedPath)));
}

module.exports = { FACTOR_SHA256, GATE_SHA256, PREPARED_AUTHORITY_SHA256,
  runRow6Post1137Terminal, runRow6Post1137TerminalFromOwners, validateInputs };

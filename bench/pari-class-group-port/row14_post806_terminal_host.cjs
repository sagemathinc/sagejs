"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const OWNER_SCHEMA = "sagejs.pari-class-group/row14-accepted-relation-owner-v1";
const OWNER_SHA256 = "9a24358fc2846778c7940df1be206a18048780375a60f6e9edf039b36c770b65";
const METADATA_SHA256 = "cca3c14630fc91a407a052bbc7fb2799b5e95bce79f1948fc422ca39cda07684";
const ANALYTIC_LAST_PRIME = 10627;

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const absBigInt = raw => {
  const value = BigInt(raw);
  return value < 0n ? -value : value;
};
const words = values => values.reduce((result, raw) => {
  let value = BigInt(raw); if (value < 0n) value = -value;
  return Math.max(result, Math.ceil(Math.max(1, value.toString(2).length) / 64));
}, 1);

function signature(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = fs.readFileSync(source, "utf8")
    .match(new RegExp(`def ${escaped}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing signature ${name}`);
  return match[1].trim().split("\n")
    .map(line => line.trim().replace(/,$/, "").split(": "));
}

async function compiled(sourceName, exportName) {
  const source = path.join(__dirname, sourceName);
  const built = await compileKernel({ sourcePath: source });
  const fn = require(built.modulePath)[exportName];
  assert(fn?.nativeAvailable, `${exportName} native module unavailable`);
  return { fn, names: signature(source, exportName), built };
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

function validateOwners(owner, metadataReceipt, { verifyDigests = true } = {}) {
  assert.equal(owner.schema, OWNER_SCHEMA);
  assert.equal(metadataReceipt.metadataSha256, METADATA_SHA256);
  if (verifyDigests) assert.equal(
    sha256(JSON.stringify(metadataReceipt.metadata)), METADATA_SHA256);
  const metadata = metadataReceipt.metadata;
  assert.equal(owner.ancestry.factorMetadataSha256, METADATA_SHA256);
  assert.equal(owner.ancestry.capsuleSha256, metadata.authority.capsuleSha256);
  assert.deepEqual(owner.field.polynomial.map(String),
    metadata.prepared.prep_polynomial.map(String));

  const boundary = owner.acceptanceBoundary;
  assert.deepEqual(boundary, { rows: 799, hRows: 3, bColumns: 796,
    totalColumns: 806, places: 3, degree: 4,
    previousAcceptanceColumns: 0, cacheChanged: true });
  assert.deepEqual(owner.final.hnfState.map(Number), [3, 10, 796, 0, 7, 0, 0, 806, 0]);
  assert.equal(owner.final.h.length, 9);
  assert.equal(owner.final.dep.length, 0);
  assert.equal(owner.final.b.length, 3 * 796);
  assert.equal(owner.final.c.length, 7 * 3 * 806);
  return { metadata, boundary };
}

async function runRow14Post806TerminalFromOwners(owner, metadataReceipt,
  options = {}) {
  const { metadata, boundary } = validateOwners(owner, metadataReceipt, options);

  const catalog = options.catalog || await compiled(
    "prime_degree_catalog.py", "pari_prime_degree_catalog");
  const allPrimes = metadata.prepared.admission_primes.map(Number);
  const primeCount = allPrimes.findIndex(prime => prime === ANALYTIC_LAST_PRIME) + 1;
  assert(primeCount > 0);
  const primes = allPrimes.slice(0, primeCount);
  assert.equal(primes.length, 1296);
  const degreeCapacity = primeCount * boundary.degree;
  const cv = {
    coefficients: integer(catalog.fn, 5, 1,
      metadata.prepared.prep_polynomial),
    degree: BigInt(boundary.degree),
    equation_index: BigInt(metadata.prepared.prep_index),
    primes: integer(catalog.fn, primeCount, 1, primes),
    prime_count: BigInt(primeCount),
    workspace: integer(catalog.fn, 393),
    factor_degrees: integer(catalog.fn, 4), factor_exponents: integer(catalog.fn, 4),
    group_degrees: integer(catalog.fn, 4), group_counts: integer(catalog.fn, 4),
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
  assert.equal(catalog.fn.gmp(...catalog.names.map(([name]) => cv[name])), 0n);

  const terminal = options.terminal || await compiled("row14_post806_terminal.py",
    "pari_row14_post806_terminal");
  const analytic = require(terminal.built.modulePath).pari_row14_analytic_inverse_hr;
  assert(analytic?.nativeAvailable);
  const av = {
    discriminant: BigInt(metadata.prepared.analytic_discriminant),
    real_places: 2n, complex_places: 1n,
    roots_of_unity: BigInt(metadata.prepared.analytic_roots_of_unity),
    log_discriminant: float64(analytic, 1),
    primes: integer(analytic, primeCount, 1, primes),
    offsets: integer(analytic, primeCount, 1, cv.pattern_offsets.toArray()),
    counts: integer(analytic, primeCount, 1, cv.pattern_counts.toArray()),
    degrees: integer(analytic, degreeCapacity, 1, cv.pattern_degrees.toArray()),
    multiplicities: integer(analytic, degreeCapacity, 1,
      cv.pattern_multiplicities.toArray()),
    coefficients: float64(analytic, 7), table: float64(analytic, 31),
    tail: float64(analytic, 1), logarithms: float64(analytic, primeCount),
    log_inverse_residue: float64(analytic, 1),
    inverse_residue: integer(analytic, 3), exp_cache: integer(analytic, 3),
    pi_cache: integer(analytic, 3), a: integer(analytic, 64),
    b: integer(analytic, 64), p: integer(analytic, 64), q: integer(analytic, 64),
    stack: integer(analytic, 128), inverse_hr: integer(analytic, 3),
    state: int64(analytic, 2),
  };
  const analyticNames = signature(path.join(__dirname, "row14_post806_terminal.py"),
    "pari_row14_analytic_inverse_hr");
  assert.equal(analytic.gmp(...analyticNames.map(([name]) => av[name])), 0n);
  assert.deepEqual(Array.from(av.state, Number), [10626, 1295]);

  const size = boundary.places * (7 + 1), square = boundary.places ** 2;
  const reconstructionSize = (boundary.places - 1) * 7;
  const factorProduct = metadata.factor.factorProduct;
  const tv = {
    factor_count: 799n, h_rows: 3n, b_columns: 796n, c_columns: 806n,
    places: 3n, degree: 4n,
    h: integer(terminal.fn, 9, words(owner.final.h), owner.final.h),
    c: integer(terminal.fn, owner.final.c.length, 16, owner.final.c),
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
    factor_base_state: integer(terminal.fn, 7, words([factorProduct]),
      [metadata.policy.C1, metadata.policy.C2, metadata.policy.rows,
        metadata.factor.rationalPrimes.length, metadata.factor.rationalPrimes.length,
        metadata.policy.rows, factorProduct]),
    preparation_state: int64(terminal.fn, 8,
      [3, 0, metadata.policy.rows, metadata.factor.rationalPrimes.length, 0, 0, 0, 0]),
    smith_work: integer(terminal.fn, 9), smith_column: integer(terminal.fn, 3),
    invariants: integer(terminal.fn, 3), class_number: integer(terminal.fn, 1),
    smith_state: int64(terminal.fn, 6), terminal_state: int64(terminal.fn, 10),
  };
  const status = terminal.fn.gmp(...terminal.names.map(([name]) => tv[name]));
  const unitRelations = tv.unit_relations.toArray().slice(0, reconstructionSize).map(String);
  return {
    status: Number(status), ownerSha256: OWNER_SHA256,
    metadataSha256: METADATA_SHA256, analyticPrimeCount: primeCount,
    analyticState: Array.from(av.state, Number),
    fieldDiscriminant: String(metadata.prepared.analytic_discriminant),
    normalizationDiscriminant: String(absBigInt(metadata.prepared.analytic_discriminant)),
    logDiscriminant: Array.from(av.log_discriminant)[0],
    inverseHr: av.inverse_hr.toArray().map(String),
    postHnfState: Array.from(tv.post_hnf_state, Number),
    multipleState: Array.from(tv.multiple_state, Number),
    acceptanceState: Array.from(tv.acceptance_state, Number),
    reconstructionState: Array.from(tv.reconstruction_state, Number),
    regulator: tv.regulator.toArray().map(String),
    unitRelations,
    unitRelationsSha256: sha256(JSON.stringify(unitRelations)),
    smithState: Array.from(tv.smith_state, Number),
    invariants: tv.invariants.toArray().slice(0, Number(tv.smith_state[1])).map(String),
    classNumber: String(tv.class_number.toArray()[0]),
    terminalState: Array.from(tv.terminal_state, Number),
    completeness: { fullSmithTransform: false, idealGeneratorWitnesses: false,
      principalRelationWitnesses: false },
    inputOwners: ["liveAcceptedRelationOwner", "factorMetadata"],
    artifacts: { catalog: catalog.built.cacheKey, terminal: terminal.built.cacheKey },
  };
}

async function runRow14Post806Terminal(ownerPath, metadataPath) {
  const compressed = fs.readFileSync(ownerPath);
  const plain = zlib.gunzipSync(compressed);
  assert.equal(sha256(plain), OWNER_SHA256, "row-14 live owner identity drift");
  const owner = JSON.parse(plain);
  const metadataReceipt = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  return runRow14Post806TerminalFromOwners(owner, metadataReceipt);
}

module.exports = { runRow14Post806Terminal,
  runRow14Post806TerminalFromOwners, validateOwners };

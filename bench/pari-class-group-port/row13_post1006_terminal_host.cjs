"use strict";

// Row 13 reaches the same field-neutral acceptance/Smith corridor as row 14.
// This adapter deliberately compiles that ordinary Python source rather than
// copying it: only owner authentication, dimensions, and prepared field data
// are row-specific.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const ROWS = 999;
const COLUMNS = 1006;
const PLACES = 3;
const DEGREE = 4;
const ACCEPTED_SCHEMA =
  "sagejs.pari-class-group/row13-accepted-relation-owner-v1";
const METADATA_SCHEMA =
  "sagejs.pari-class-group/row13-connected-factor-metadata-v1";
const ANALYTIC_CATALOG_LIMIT = 16384;

const sha256 = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const hash = (value) => sha256(Buffer.from(JSON.stringify(value)));
const absBigInt = (raw) => {
  const value = BigInt(raw);
  return value < 0n ? -value : value;
};
const words = (values) =>
  values.reduce((result, raw) => {
    let value = BigInt(raw);
    if (value < 0n) value = -value;
    return Math.max(
      result,
      Math.ceil(Math.max(1, value.toString(2).length) / 64),
    );
  }, 1);

function primesThrough(limit) {
  const composite = new Uint8Array(limit + 1);
  const primes = [];
  for (let value = 2; value <= limit; value += 1) {
    if (composite[value] !== 0) continue;
    primes.push(value);
    if (value * value <= limit) {
      for (let multiple = value * value; multiple <= limit; multiple += value) {
        composite[multiple] = 1;
      }
    }
  }
  return primes;
}

function analyticCatalog(authenticatedPrefix) {
  const prefix = authenticatedPrefix.map(Number);
  const derived = primesThrough(ANALYTIC_CATALOG_LIMIT);
  assert(prefix.length > 0);
  assert.deepEqual(
    derived.slice(0, prefix.length),
    prefix,
    "authenticated analytic-prime prefix is not the canonical prime sequence",
  );
  assert(derived.length > prefix.length);
  return derived;
}

function signature(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = fs
    .readFileSync(source, "utf8")
    .match(new RegExp(`def ${escaped}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing signature ${name}`);
  return match[1]
    .trim()
    .split("\n")
    .map((line) => line.trim().replace(/,$/, "").split(": "));
}

async function compiled(sourceName, exportName) {
  const source = path.join(__dirname, sourceName);
  const built = await compileKernel({ sourcePath: source });
  const fn = require(built.modulePath)[exportName];
  assert(fn?.nativeAvailable, `${exportName} native module unavailable`);
  return { fn, names: signature(source, exportName), built };
}

function integer(fn, length, capacity = 16, values) {
  return fn.createIntegerBuffer(
    length,
    capacity,
    values === undefined ? undefined : values.map(BigInt),
  );
}
function int64(fn, length, values) {
  return fn.createInt64Buffer(
    values === undefined ? length : values.map(BigInt),
  );
}
function float64(fn, length, values) {
  return fn.createFloat64Buffer(
    values === undefined ? length : values.map(Number),
  );
}

function validateOwners(owner, metadataReceipt) {
  assert.equal(owner.schema, ACCEPTED_SCHEMA);
  assert.equal(metadataReceipt.schema, METADATA_SCHEMA);
  assert.equal(
    hash(metadataReceipt.metadata),
    metadataReceipt.metadataSha256,
    "row-13 factor metadata digest changed",
  );
  assert.equal(
    owner.ancestry.factorMetadataSha256,
    metadataReceipt.metadataSha256,
  );
  assert.equal(
    owner.ancestry.preparedAuthoritySha256,
    metadataReceipt.metadata.authority.preparedAuthoritySha256,
  );
  assert.deepEqual(
    owner.field.polynomial.map(String),
    metadataReceipt.metadata.prepared.prep_polynomial.map(String),
  );
  assert.deepEqual(owner.acceptanceBoundary, {
    rows: ROWS,
    hRows: 1,
    bColumns: 998,
    totalColumns: COLUMNS,
    places: PLACES,
    degree: DEGREE,
    previousAcceptanceColumns: 0,
    cacheChanged: true,
  });
  assert.deepEqual(owner.final.hnfState.map(Number), [
    1, 8, 998, 0, 7, 1, 0, 1006, 0,
  ]);
  assert.equal(owner.final.h.length, 1);
  assert.equal(owner.final.dep.length, 0);
  assert.equal(owner.final.b.length, 998);
  assert.equal(owner.final.c.length, 21 * COLUMNS);
  return metadataReceipt.metadata;
}

async function runRow13Post1006Terminal(owner, metadataReceipt, options = {}) {
  const metadata = validateOwners(owner, metadataReceipt);
  const catalog = options.catalog || await compiled(
    "prime_degree_catalog.py",
    "pari_prime_degree_catalog",
  );
  // The prepared input authenticates the canonical prime sequence through
  // 10007.  Row 13's field-derived analytic bound lies beyond that prefix, so
  // extend the same sequence to the next fixed power-of-two ceiling.  This is
  // derived public arithmetic, not an oracle class-number/regulator input.
  const authenticatedPrimeCount = metadata.prepared.analytic_primes.length;
  const primes = analyticCatalog(metadata.prepared.analytic_primes);
  const primeCount = primes.length;
  assert.equal(authenticatedPrimeCount, 1230);
  const degreeCapacity = primeCount * DEGREE;
  const cv = {
    coefficients: integer(
      catalog.fn,
      5,
      1,
      metadata.prepared.prep_polynomial,
    ),
    degree: 4n,
    equation_index: BigInt(metadata.prepared.prep_index),
    primes: integer(catalog.fn, primeCount, 1, primes),
    prime_count: BigInt(primeCount),
    workspace: integer(catalog.fn, 393),
    factor_degrees: integer(catalog.fn, 4),
    factor_exponents: integer(catalog.fn, 4),
    group_degrees: integer(catalog.fn, 4),
    group_counts: integer(catalog.fn, 4),
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
  assert.equal(
    catalog.fn.gmp(...catalog.names.map(([name]) => cv[name])),
    0n,
  );

  const terminal = options.terminal || await compiled(
    "row14_post806_terminal.py",
    "pari_row14_post806_terminal",
  );
  const analytic = require(terminal.built.modulePath)
    .pari_row14_analytic_inverse_hr;
  assert(analytic?.nativeAvailable);
  const av = {
    discriminant: BigInt(metadata.prepared.analytic_discriminant),
    real_places: 2n,
    complex_places: 1n,
    roots_of_unity: BigInt(metadata.prepared.analytic_roots_of_unity),
    log_discriminant: float64(analytic, 1),
    primes: integer(analytic, primeCount, 1, primes),
    offsets: integer(
      analytic,
      primeCount,
      1,
      cv.pattern_offsets.toArray(),
    ),
    counts: integer(analytic, primeCount, 1, cv.pattern_counts.toArray()),
    degrees: integer(
      analytic,
      degreeCapacity,
      1,
      cv.pattern_degrees.toArray(),
    ),
    multiplicities: integer(
      analytic,
      degreeCapacity,
      1,
      cv.pattern_multiplicities.toArray(),
    ),
    coefficients: float64(analytic, 7),
    table: float64(analytic, 31),
    tail: float64(analytic, 1),
    logarithms: float64(analytic, primeCount),
    log_inverse_residue: float64(analytic, 1),
    inverse_residue: integer(analytic, 3),
    exp_cache: integer(analytic, 3),
    pi_cache: integer(analytic, 3),
    a: integer(analytic, 64),
    b: integer(analytic, 64),
    p: integer(analytic, 64),
    q: integer(analytic, 64),
    stack: integer(analytic, 128),
    inverse_hr: integer(analytic, 3),
    state: int64(analytic, 2),
  };
  const source = path.join(__dirname, "row14_post806_terminal.py");
  const analyticNames = signature(source, "pari_row14_analytic_inverse_hr");
  assert.equal(
    analytic.gmp(...analyticNames.map(([name]) => av[name])),
    0n,
  );

  const size = PLACES * 8;
  const square = PLACES ** 2;
  const reconstructionSize = (PLACES - 1) * 7;
  const factorProduct = metadata.factor.factorProduct;
  const tv = {
    factor_count: 999n,
    h_rows: 1n,
    b_columns: 998n,
    c_columns: 1006n,
    places: 3n,
    degree: 4n,
    h: integer(terminal.fn, 1, words(owner.final.h), owner.final.h),
    c: integer(terminal.fn, owner.final.c.length, 16, owner.final.c),
    inverse_hr: integer(terminal.fn, 3, 16, av.inverse_hr.toArray()),
    logs: integer(terminal.fn, 63),
    tentative_class_number: integer(terminal.fn, 1),
    zeta_factor: integer(terminal.fn, 3),
    post_hnf_state: int64(terminal.fn, 3),
    prepared: integer(terminal.fn, 3 * size),
    selected: int64(terminal.fn, 8),
    prep_state: int64(terminal.fn, 3),
    rank_work: integer(terminal.fn, 3 * size),
    rank_occupied: int64(terminal.fn, 3),
    rank_pivots: int64(terminal.fn, 8),
    rank_state: int64(terminal.fn, 3),
    integer_input: integer(terminal.fn, size),
    integer_work: integer(terminal.fn, size),
    integer_occupied: integer(terminal.fn, 3),
    integer_pivots: integer(terminal.fn, 8),
    integer_best: integer(terminal.fn, 8),
    integer_state: integer(terminal.fn, 10),
    basis: integer(terminal.fn, 3 * square),
    minor: integer(terminal.fn, 3 * square),
    det_work: integer(terminal.fn, 3 * square),
    det_result: integer(terminal.fn, 3),
    det_pivots: int64(terminal.fn, 3),
    det_state: int64(terminal.fn, 5),
    inverse_work: integer(terminal.fn, 3 * square),
    inverse_rhs: integer(terminal.fn, 3 * square),
    inverse: integer(terminal.fn, 3 * square),
    inverse_pivots: int64(terminal.fn, 3),
    inverse_state: int64(terminal.fn, 3),
    product: integer(terminal.fn, 3 * square),
    inverse_slice: integer(terminal.fn, 3 * square),
    multiple: integer(terminal.fn, 3),
    coordinates: integer(terminal.fn, 3 * reconstructionSize),
    multiple_state: int64(terminal.fn, 4),
    rational_work: integer(terminal.fn, 3 * reconstructionSize),
    lattice: integer(terminal.fn, reconstructionSize),
    regulator_hnf_work: integer(terminal.fn, reconstructionSize),
    regulator_hnf_column: integer(terminal.fn, 2),
    regulator_hnf_output: integer(terminal.fn, reconstructionSize),
    regulator_hnf_state: int64(terminal.fn, 12),
    regulator: integer(terminal.fn, 3),
    unit_relations: integer(terminal.fn, reconstructionSize),
    denominator: integer(terminal.fn, 1),
    reconstruction_state: int64(terminal.fn, 4),
    hnf_row_pivots: int64(terminal.fn, 2),
    hnf_heights: int64(terminal.fn, 7),
    cache_changed: true,
    acceptance_state: int64(terminal.fn, 3),
    factor_base_state: integer(
      terminal.fn,
      7,
      words([factorProduct]),
      [
        metadata.policy.C1,
        metadata.policy.C2,
        ROWS,
        metadata.factor.rationalPrimes.length,
        metadata.factor.rationalPrimes.length,
        ROWS,
        factorProduct,
      ],
    ),
    preparation_state: int64(terminal.fn, 8, [
      3,
      0,
      ROWS,
      metadata.factor.rationalPrimes.length,
      0,
      0,
      0,
      0,
    ]),
    smith_work: integer(terminal.fn, 1),
    smith_column: integer(terminal.fn, 1),
    invariants: integer(terminal.fn, 1),
    class_number: integer(terminal.fn, 1),
    smith_state: int64(terminal.fn, 6),
    terminal_state: int64(terminal.fn, 10),
  };
  const status = terminal.fn.gmp(
    ...terminal.names.map(([name]) => tv[name]),
  );
  const unitRelations = tv.unit_relations
    .toArray()
    .slice(0, reconstructionSize)
    .map(String);
  return {
    schema: "sagejs.pari-class-group/row13-post1006-terminal-v1",
    status: Number(status),
    acceptedOwnerSha256: hash(owner),
    metadataSha256: metadataReceipt.metadataSha256,
    analyticPrimeCount: primeCount,
    authenticatedAnalyticPrimeCount: authenticatedPrimeCount,
    analyticCatalogLimit: ANALYTIC_CATALOG_LIMIT,
    analyticState: Array.from(av.state, Number),
    fieldDiscriminant: String(metadata.prepared.analytic_discriminant),
    normalizationDiscriminant: String(
      absBigInt(metadata.prepared.analytic_discriminant),
    ),
    // Result owners use canonical JSON: floating diagnostics are retained as
    // their exact JavaScript decimal spelling rather than a non-integral
    // Number, which the neutral correspondence envelope deliberately rejects.
    logDiscriminant: String(Array.from(av.log_discriminant)[0]),
    inverseHr: av.inverse_hr.toArray().map(String),
    postHnfState: Array.from(tv.post_hnf_state, Number),
    multipleState: Array.from(tv.multiple_state, Number),
    acceptanceState: Array.from(tv.acceptance_state, Number),
    reconstructionState: Array.from(tv.reconstruction_state, Number),
    regulator: tv.regulator.toArray().map(String),
    unitRelations,
    unitRelationsSha256: hash(unitRelations),
    smithState: Array.from(tv.smith_state, Number),
    invariants: tv.invariants
      .toArray()
      .slice(0, Number(tv.smith_state[1]))
      .map(String),
    classNumber: String(tv.class_number.toArray()[0]),
    terminalState: Array.from(tv.terminal_state, Number),
    completeness: {
      fullSmithTransform: false,
      idealGeneratorWitnesses: false,
      principalRelationWitnesses: false,
    },
    inputOwners: ["liveAcceptedRelationOwner", "connectedFactorMetadata"],
    artifacts: {
      catalog: catalog.built.cacheKey,
      terminal: terminal.built.cacheKey,
    },
  };
}

module.exports = {
  ACCEPTED_SCHEMA,
  METADATA_SCHEMA,
  compiled,
  runRow13Post1006Terminal,
  validateOwners,
};

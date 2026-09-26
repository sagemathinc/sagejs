"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const ROWS = 4, ZERO_COLUMNS = 8, DEGREE = 5;
const CACHE_ROOT = process.env.SAGEJS_NATIVE_CACHE_DIR ||
  "/scratch/sagejs-row21-acceptance-native-cache";

function signature(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = fs.readFileSync(source, "utf8").match(
    new RegExp(`def ${escaped}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing signature ${name}`);
  return match[1].trim().split("\n").map(line =>
    line.trim().replace(/,$/, "").split(": "));
}
async function compiled(sourceName, exportName) {
  const source = path.join(__dirname, sourceName);
  const built = await compileKernel({ sourcePath: source, cacheRoot: CACHE_ROOT });
  const fn = require(built.modulePath)[exportName];
  assert(fn?.nativeAvailable, `${exportName} native module unavailable`);
  return { source, built, fn, names: signature(source, exportName) };
}
function words(values, minimum = 1) {
  let result = minimum;
  for (const raw of values || []) {
    let value = BigInt(raw); if (value < 0n) value = -value;
    result = Math.max(result,
      Math.ceil(Math.max(1, value.toString(2).length) / 64));
  }
  return result;
}
function integer(fn, length, capacity = 16, values) {
  return fn.createIntegerBuffer(length, Math.max(capacity, words(values)),
    values === undefined ? undefined : values.map(BigInt));
}
function int64(fn, length, values) {
  return fn.createInt64Buffer(values === undefined ? length : values.map(BigInt));
}
function float64(fn, length, values) {
  return fn.createFloat64Buffer(values === undefined ? length : values.map(Number));
}
function view(owner, length = owner.length) {
  return (owner.toArray ? owner.toArray() : Array.from(owner))
    .slice(0, length).map(String);
}

async function analyticInverseHr(prepared) {
  const catalog = await compiled("row21_analytic_catalog.py",
    "pari_row21_analytic_degree_catalog");
  const primes = prepared.analytic_primes.map(Number);
  const capacity = 5 * primes.length;
  const cv = {
    polynomial: integer(catalog.fn, 6, 8, prepared.prep_polynomial),
    table: integer(catalog.fn, 125, 16, prepared.basis_table),
    primes: integer(catalog.fn, primes.length, 1, primes),
    prime_count: BigInt(primes.length), workspace: integer(catalog.fn, 12000, 32),
    pattern_offsets: integer(catalog.fn, primes.length, 1),
    pattern_counts: integer(catalog.fn, primes.length, 1),
    pattern_degrees: integer(catalog.fn, capacity, 1),
    pattern_multiplicities: integer(catalog.fn, capacity, 1),
    state: integer(catalog.fn, 4, 1),
  };
  try {
    assert.equal(catalog.fn.gmp(...catalog.names.map(([name]) => cv[name])), 0n);
  } catch (error) {
    error.catalogState = view(cv.state);
    throw error;
  }
  const groups = Number(cv.state.toArray()[2]);

  const analytic = await compiled("row14_post806_terminal.py",
    "pari_row14_analytic_inverse_hr");
  const av = {
    discriminant: BigInt(prepared.analytic_discriminant), real_places: 3n,
    complex_places: 1n, roots_of_unity: BigInt(prepared.analytic_roots_of_unity),
    log_discriminant: float64(analytic.fn, 1),
    primes: integer(analytic.fn, primes.length, 1, primes),
    offsets: integer(analytic.fn, primes.length, 1, cv.pattern_offsets.toArray()),
    counts: integer(analytic.fn, primes.length, 1, cv.pattern_counts.toArray()),
    degrees: integer(analytic.fn, groups, 1,
      cv.pattern_degrees.toArray().slice(0, groups)),
    multiplicities: integer(analytic.fn, groups, 1,
      cv.pattern_multiplicities.toArray().slice(0, groups)),
    coefficients: float64(analytic.fn, 7), table: float64(analytic.fn, 31),
    tail: float64(analytic.fn, 1), logarithms: float64(analytic.fn, primes.length),
    log_inverse_residue: float64(analytic.fn, 1),
    inverse_residue: integer(analytic.fn, 3), exp_cache: integer(analytic.fn, 3),
    pi_cache: integer(analytic.fn, 3), a: integer(analytic.fn, 64),
    b: integer(analytic.fn, 64), p: integer(analytic.fn, 64),
    q: integer(analytic.fn, 64), stack: integer(analytic.fn, 128),
    inverse_hr: integer(analytic.fn, 3), state: int64(analytic.fn, 2),
  };
  assert.equal(analytic.fn.gmp(...analytic.names.map(([name]) => av[name])), 0n);
  return { inverseHr: view(av.inverse_hr), state: Array.from(av.state, Number),
    catalogState: view(cv.state), catalogBuilt: catalog.built,
    analyticBuilt: analytic.built };
}

async function runAcceptance(prepared, firstHnfOwner) {
  assert.equal(firstHnfOwner.schema,
    "sagejs.pari-class-group/row21-first-hnf-owner-v1");
  assert.deepEqual(firstHnfOwner.hnf.H, [0, 0]);
  assert.deepEqual(firstHnfOwner.hnf.B, [0, 24]);
  assert.deepEqual(firstHnfOwner.hnf.C, [4, 32]);
  const analytic = await analyticInverseHr(prepared);
  const kernel = await compiled("post_hnf_acceptance.py", "pari_post_hnf_acceptance");
  const fn = kernel.fn, size = ROWS * (ZERO_COLUMNS + 1), square = ROWS * ROWS;
  const reconstruction = (ROWS - 1) * ZERO_COLUMNS;
  const explicit = { factor_count: 24n, h_rows: 0n, b_columns: 24n,
    c_columns: 32n, places: 4n, degree: BigInt(DEGREE),
    h: integer(fn, 0), c: integer(fn, firstHnfOwner.hnf.exactC.length, 16,
      firstHnfOwner.hnf.exactC),
    inverse_hr: integer(fn, 3, 16, analytic.inverseHr), cache_changed: true };
  const lengths = {
    logs: 3 * ROWS * ZERO_COLUMNS, class_number: 1, zeta_factor: 3,
    post_hnf_state: 3, prepared: 3 * size, selected: ZERO_COLUMNS + 1,
    prep_state: 3, rank_work: 3 * size, rank_occupied: ROWS,
    rank_pivots: ZERO_COLUMNS + 1, rank_state: 3, integer_input: size,
    integer_work: size, integer_occupied: ROWS,
    integer_pivots: ZERO_COLUMNS + 1, integer_best: ZERO_COLUMNS + 1,
    integer_state: 10, basis: 3 * square, minor: 3 * square,
    det_work: 3 * square, det_result: 3, det_pivots: ROWS, det_state: 5,
    inverse_work: 3 * square, inverse_rhs: 3 * square,
    inverse: 3 * square, inverse_pivots: ROWS, inverse_state: 3,
    product: 3 * square, inverse_slice: 3 * square, multiple: 3,
    coordinates: 3 * reconstruction, multiple_state: 4,
    rational_work: 3 * reconstruction, lattice: reconstruction,
    hnf_work: reconstruction, hnf_column: ROWS - 1, hnf_output: reconstruction,
    hnf_state: 15, regulator: 3, relations: reconstruction, denominator: 1,
    reconstruction_state: 4, hnf_row_pivots: ROWS - 1,
    hnf_heights: ZERO_COLUMNS, acceptance_state: 3,
  };
  const values = { ...explicit };
  for (const [name, kind] of kernel.names) {
    if (Object.hasOwn(values, name)) continue;
    const length = lengths[name];
    assert.notEqual(length, undefined, `missing acceptance owner ${name}`);
    values[name] = kind === "Int64Buffer" ? int64(fn, length) :
      integer(fn, length, 32);
  }
  const status = Number(fn.gmp(...kernel.names.map(([name]) => values[name])));
  return { status, values, analytic, kernel,
    postHnfState: Array.from(values.post_hnf_state, Number),
    multipleState: Array.from(values.multiple_state, Number),
    acceptanceState: Array.from(values.acceptance_state, Number),
    reconstructionState: Array.from(values.reconstruction_state, Number),
    classNumber: view(values.class_number, 1)[0], regulator: view(values.regulator, 3),
    lattice: view(values.relations, reconstruction), logs: view(values.logs),
    multiple: view(values.multiple, 3), coordinates: view(values.coordinates),
  };
}

module.exports = { analyticInverseHr, runAcceptance };

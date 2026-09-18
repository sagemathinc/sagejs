"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const ROWS = 3;
const ZERO_COLUMNS = 7;
const DEGREE = 5;

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
  const built = await compileKernel({ sourcePath: source,
    cacheRoot: "/scratch/sagejs-native-cache-row20-acceptance" });
  const fn = require(built.modulePath)[exportName];
  assert(fn?.nativeAvailable, `${exportName} native module unavailable`);
  return { source, built, fn, names: signature(source, exportName) };
}

function words(values, minimum = 1) {
  let result = minimum;
  for (const raw of values || []) {
    let value = BigInt(raw);
    if (value < 0n) value = -value;
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

async function analyticInverseHr(prepared, resident = undefined, { defer = false } = {}) {
  const catalog = resident?.catalog || await compiled("row21_analytic_catalog.py",
    "pari_row21_analytic_degree_catalog");
  const primes = prepared.analytic_primes.map(Number);
  const capacity = DEGREE * primes.length;
  const cv = {
    polynomial: integer(catalog.fn, 6, 16, prepared.prep_polynomial),
    table: integer(catalog.fn, 125, 16, prepared.basis_table),
    primes: integer(catalog.fn, primes.length, 1, primes),
    prime_count: BigInt(primes.length),
    workspace: integer(catalog.fn, 12000, 32),
    pattern_offsets: integer(catalog.fn, primes.length, 1),
    pattern_counts: integer(catalog.fn, primes.length, 1),
    pattern_degrees: integer(catalog.fn, capacity, 1),
    pattern_multiplicities: integer(catalog.fn, capacity, 1),
    state: integer(catalog.fn, 4, 1),
  };
  const analytic = resident?.analytic || await compiled("row14_post806_terminal.py",
    "pari_row14_analytic_inverse_hr");
  const av = {
    discriminant: BigInt(prepared.analytic_discriminant),
    real_places: 1n,
    complex_places: 2n,
    roots_of_unity: BigInt(prepared.analytic_roots_of_unity),
    log_discriminant: float64(analytic.fn, 1),
    primes: cv.primes,
    offsets: cv.pattern_offsets,
    counts: cv.pattern_counts,
    degrees: cv.pattern_degrees,
    multiplicities: cv.pattern_multiplicities,
    coefficients: float64(analytic.fn, 7),
    table: float64(analytic.fn, 31),
    tail: float64(analytic.fn, 1),
    logarithms: float64(analytic.fn, primes.length),
    log_inverse_residue: float64(analytic.fn, 1),
    inverse_residue: integer(analytic.fn, 3),
    exp_cache: integer(analytic.fn, 3),
    pi_cache: integer(analytic.fn, 3),
    a: integer(analytic.fn, 64),
    b: integer(analytic.fn, 64),
    p: integer(analytic.fn, 64),
    q: integer(analytic.fn, 64),
    stack: integer(analytic.fn, 128),
    inverse_hr: integer(analytic.fn, 3),
    state: int64(analytic.fn, 2),
  };
  const invocation = { analytic, av, catalog, cv,
    analyticArgs: analytic.names.map(([name]) => av[name]),
    catalogArgs: catalog.names.map(([name]) => cv[name]) };
  if (defer) return invocation;
  return invokeAnalyticInverseHr(invocation);
}

function invokeAnalyticInverseHr(invocation) {
  const { analytic, av, catalog, cv } = invocation;
  assert.equal(catalog.fn.gmp(...invocation.catalogArgs), 0n);
  assert.equal(analytic.fn.gmp(...invocation.analyticArgs), 0n);
  return {
    inverseHr: view(av.inverse_hr),
    state: Array.from(av.state, Number),
    catalogState: view(cv.state),
    catalogBuilt: catalog.built, invocation,
    analyticBuilt: analytic.built,
  };
}

async function runAcceptance(prepared, liveResult, resident = undefined, {
  defer = false, analyticInvocation = undefined,
} = {}) {
  assert.equal(liveResult.status, 0);
  assert.deepEqual(liveResult.relationState, ["14", "190", "0", "7", "0", "14"]);
  assert.deepEqual(liveResult.chainState, [3, 0, 3, 14]);
  assert.deepEqual(liveResult.hnfState, [0, 7, 7, 0, 7, 4, 0, 14, 0]);
  assert(liveResult.values?.hnf_result_h, "missing live H owner");
  assert(liveResult.values?.hnf_result_c, "missing live C owner");

  const analytic = analyticInvocation ?
    invokeAnalyticInverseHr(analyticInvocation) :
    await analyticInverseHr(prepared, resident);
  const kernel = resident?.acceptance || await compiled("post_hnf_acceptance.py",
    "pari_post_hnf_acceptance");
  const fn = kernel.fn;
  const size = ROWS * (ZERO_COLUMNS + 1);
  const square = ROWS * ROWS;
  const reconstruction = (ROWS - 1) * ZERO_COLUMNS;
  const explicit = {
    factor_count: 7n,
    h_rows: 0n,
    b_columns: 7n,
    c_columns: 14n,
    places: 3n,
    degree: BigInt(DEGREE),
    h: integer(fn, 0),
    c: liveResult.values.hnf_result_c,
    inverse_hr: analytic.invocation?.av.inverse_hr ||
      integer(fn, 3, 16, analytic.inverseHr),
    cache_changed: true,
  };
  const lengths = {
    logs: 3 * ROWS * ZERO_COLUMNS,
    class_number: 1,
    zeta_factor: 3,
    post_hnf_state: 3,
    prepared: 3 * size,
    selected: ZERO_COLUMNS + 1,
    prep_state: 3,
    rank_work: 3 * size,
    rank_occupied: ROWS,
    rank_pivots: ZERO_COLUMNS + 1,
    rank_state: 3,
    integer_input: size,
    integer_work: size,
    integer_occupied: ROWS,
    integer_pivots: ZERO_COLUMNS + 1,
    integer_best: ZERO_COLUMNS + 1,
    integer_state: 10,
    basis: 3 * square,
    minor: 3 * square,
    det_work: 3 * square,
    det_result: 3,
    det_pivots: ROWS,
    det_state: 5,
    inverse_work: 3 * square,
    inverse_rhs: 3 * square,
    inverse: 3 * square,
    inverse_pivots: ROWS,
    inverse_state: 3,
    product: 3 * square,
    inverse_slice: 3 * square,
    multiple: 3,
    coordinates: 3 * reconstruction,
    multiple_state: 4,
    rational_work: 3 * reconstruction,
    lattice: reconstruction,
    hnf_work: reconstruction,
    hnf_column: ROWS - 1,
    hnf_output: reconstruction,
    hnf_state: 15,
    regulator: 3,
    relations: reconstruction,
    denominator: 1,
    reconstruction_state: 4,
    hnf_row_pivots: ROWS - 1,
    hnf_heights: ZERO_COLUMNS,
    acceptance_state: 3,
  };
  const values = { ...explicit };
  for (const [name, kind] of kernel.names) {
    if (Object.hasOwn(values, name)) continue;
    const length = lengths[name];
    assert.notEqual(length, undefined, `missing acceptance owner ${name}`);
    values[name] = kind === "Int64Buffer" ? int64(fn, length) :
      integer(fn, length, 32);
  }
  const invocation = { analytic, kernel, values,
    args: kernel.names.map(([name]) => values[name]) };
  if (defer) return invocation;
  return invokeAcceptance(invocation);
}

function invokeAcceptance(invocation) {
  const { analytic, kernel, values } = invocation;
  const status = Number(kernel.fn.gmp(...invocation.args));
  return {
    status,
    values,
    analytic,
    kernel,
    postHnfState: Array.from(values.post_hnf_state, Number),
    multipleState: Array.from(values.multiple_state, Number),
    acceptanceState: Array.from(values.acceptance_state, Number),
    reconstructionState: Array.from(values.reconstruction_state, Number),
    classNumber: view(values.class_number, 1)[0],
    regulator: view(values.regulator, 3),
    lattice: view(values.relations, reconstruction),
    logs: view(values.logs),
    multiple: view(values.multiple, 3),
    coordinates: view(values.coordinates),
  };
}

async function prepareResident() {
  const [catalog, analytic, acceptance] = await Promise.all([
    compiled("row21_analytic_catalog.py", "pari_row21_analytic_degree_catalog"),
    compiled("row14_post806_terminal.py", "pari_row14_analytic_inverse_hr"),
    compiled("post_hnf_acceptance.py", "pari_post_hnf_acceptance"),
  ]);
  return Object.freeze({ catalog, analytic, acceptance });
}

module.exports = { analyticInverseHr, invokeAcceptance,
  invokeAnalyticInverseHr, prepareResident, runAcceptance };

"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const CACHE_ROOT = "/scratch/sagejs-native-cache-row23-live-unit-owner";
const SOURCE = path.join(__dirname, "row23_totally_real_getfu.py");
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const array = owner => owner.toArray ? owner.toArray() : Array.from(owner);
const strings = owner => array(owner).map(String);

function words(values, minimum = 1) {
  let result = minimum;
  for (const raw of values || []) {
    let value = BigInt(raw); if (value < 0n) value = -value;
    result = Math.max(result, Math.ceil(Math.max(1, value.toString(2).length) / 64));
  }
  return result;
}

function integer(fn, length, values, capacity = 4096) {
  return fn.createIntegerBuffer(length, Math.max(capacity, words(values)),
    values === undefined ? undefined : values.map(BigInt));
}

function embedding(prepared) {
  const answer = [];
  for (let column = 0; column < 5; column += 1)
    for (let row = 0; row < 5; row += 1) {
      const index = 5 * row + column;
      answer.push(prepared.admission_matrix_m[index], prepared.admission_matrix_p[index],
        prepared.admission_matrix_e[index]);
    }
  return answer;
}

function signs(prepared, units) {
  return Array.from({ length: 4 }, (_, column) =>
    Array.from({ length: 5 }, (_, row) => {
      const terms = [];
      for (let basis = 0; basis < 5; basis += 1) {
        const coefficient = BigInt(units[5 * column + basis]);
        const index = 5 * row + basis;
        const mantissa = BigInt(prepared.admission_matrix_m[index]);
        const precision = BigInt(prepared.admission_matrix_p[index]);
        const packedExponent = BigInt(prepared.admission_matrix_e[index]);
        if (coefficient === 0n || mantissa === 0n) continue;
        const exponent = precision === -1n ? 0n : packedExponent + 1n - precision;
        terms.push([coefficient * mantissa, exponent]);
      }
      assert(terms.length > 0, "zero row-23 unit embedding");
      const minimum = terms.reduce((value, term) => term[1] < value ? term[1] : value,
        terms[0][1]);
      const numerator = terms.reduce((value, term) =>
        value + (term[0] << (term[1] - minimum)), 0n);
      assert.notEqual(numerator, 0n, "indeterminate row-23 unit sign");
      return numerator > 0n ? 1 : -1;
    }));
}

async function runLiveUnitOwner(prepared, bridge) {
  assert.equal(bridge?.status, 0);
  assert.equal(bridge?.candidateAKind, "packed-logarithm-matrix");
  assert(bridge.owners?.archReal, "missing live row-23 logarithm owner");
  const built = await compileKernel({ sourcePath: SOURCE, cacheRoot: CACHE_ROOT });
  const fn = require(built.modulePath).pari_row23_totally_real_getfu;
  assert(fn?.nativeAvailable, "row-23 totally-real getfu native module unavailable");
  const owners = {
    logarithms: integer(fn, 140, strings(bridge.owners.candidateA)),
    embedding_matrix: integer(fn, 75, embedding(prepared)),
    multiplication_basis: integer(fn, 125, prepared.basis_table),
    exponential_rhs: integer(fn, 60),
    exponential_imaginary: integer(fn, 60),
    solve_work: integer(fn, 75),
    solve_rhs: integer(fn, 60),
    solved: integer(fn, 60),
    rounded: integer(fn, 20),
    candidate_units: integer(fn, 20),
    candidate_inverses: integer(fn, 20),
    output_units: integer(fn, 20, Array(20).fill(991n)),
    output_norms: integer(fn, 4),
    multiplication: integer(fn, 25),
    inverse: integer(fn, 5),
    pivots: fn.createInt64Buffer(5),
    solve_state: fn.createInt64Buffer(5),
    state: fn.createInt64Buffer(6),
    exp_cache: integer(fn, 3),
    pi_cache: integer(fn, 3),
    agm_a: integer(fn, 512), agm_b: integer(fn, 512),
    agm_p: integer(fn, 512), agm_q: integer(fn, 512),
    agm_stack: integer(fn, 91),
  };
  const ordered = ["logarithms", "embedding_matrix", "multiplication_basis",
    "exponential_rhs", "exponential_imaginary", "solve_work", "solve_rhs", "solved", "rounded",
    "candidate_units", "candidate_inverses", "output_units", "output_norms", "multiplication",
    "inverse", "pivots", "solve_state", "state", "exp_cache", "pi_cache", "agm_a",
    "agm_b", "agm_p", "agm_q", "agm_stack"];
  const status = Number(fn.gmp(...ordered.map(name => owners[name])));
  const units = strings(owners.output_units);
  const inverseMask = Number(array(owners.state)[4]);
  const candidates = strings(owners.candidate_units);
  const candidateInverses = strings(owners.candidate_inverses);
  const inverses = [];
  for (let column = 0; column < 4; column += 1)
    for (let index = 0; index < 5; index += 1)
      inverses.push((inverseMask & (1 << column)) === 0
        ? candidateInverses[5 * column + index] : candidates[5 * column + index]);
  return {
    schema: "sagejs.pari-class-group/row23-live-exact-units-v1",
    status,
    state: array(owners.state).map(Number),
    solveState: array(owners.solve_state).map(Number),
    exactUnitsIntegralBasis: units,
    exactInversesIntegralBasis: inverses,
    exactNorms: strings(owners.output_norms),
    exactRealSigns: signs(prepared, units),
    exactUnitsSha256: sha(JSON.stringify(units)),
    exponentialRhsSha256: sha(JSON.stringify(strings(owners.exponential_rhs))),
    candidateUnitsSha256: sha(JSON.stringify(strings(owners.candidate_units))),
    owners,
    native: { sourcePath: SOURCE, cacheKey: built.cacheKey },
  };
}

module.exports = { CACHE_ROOT, runLiveUnitOwner };

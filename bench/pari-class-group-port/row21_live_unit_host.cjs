"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const CACHE_ROOT = process.env.SAGEJS_NATIVE_CACHE_DIR ||
  "/scratch/sagejs-row21-unit-native-cache";
const values = owner => (owner.toArray ? owner.toArray() : Array.from(owner));

function determinant5(matrix) {
  const a = Array.from({ length: 5 }, (_, row) =>
    Array.from({ length: 5 }, (_, column) => matrix[5 * column + row]));
  let sign = 1n, previous = 1n;
  for (let k = 0; k < 4; k += 1) {
    let pivot = k;
    while (pivot < 5 && a[pivot][k] === 0n) pivot += 1;
    if (pivot === 5) return 0n;
    if (pivot !== k) { [a[k], a[pivot]] = [a[pivot], a[k]]; sign = -sign; }
    const value = a[k][k];
    for (let row = k + 1; row < 5; row += 1)
      for (let column = k + 1; column < 5; column += 1) {
        const numerator = a[row][column] * value - a[row][k] * a[k][column];
        assert.equal(numerator % previous, 0n);
        a[row][column] = numerator / previous;
      }
    previous = value;
  }
  return sign * a[4][4];
}

function exactSigns(prepared, units) {
  const m = prepared.admission_matrix_m.map(BigInt);
  const p = prepared.admission_matrix_p.map(BigInt);
  const e = prepared.admission_matrix_e.map(BigInt);
  return Array.from({ length: 3 }, (_, unitColumn) =>
    Array.from({ length: 3 }, (_, row) => {
      const terms = Array.from({ length: 5 }, (_, basis) => {
        const index = 5 * row + basis;
        return { n: units[5 * unitColumn + basis] * m[index],
          e: p[index] === -1n ? 0n : e[index] + 1n - p[index] };
      });
      const exponent = terms.reduce((least, term) => term.e < least ? term.e : least,
        terms[0].e);
      const numerator = terms.reduce((sum, term) =>
        sum + (term.n << (term.e - exponent)), 0n);
      assert.notEqual(numerator, 0n);
      return numerator < 0n ? -1 : 1;
    }));
}

async function runLiveUnits(prepared, acceptanceOwner) {
  const latticeHost = require("./row21_live_rank3_lattice_host.cjs");
  const lattice = await latticeHost.runLiveRankThreeLattice(acceptanceOwner);
  const latticeSource = path.join(__dirname, "row21_rank3_unit_lattice.py");
  const latticeBuilt = await compileKernel({ sourcePath: latticeSource,
    cacheRoot: CACHE_ROOT });
  const latticeModule = require(latticeBuilt.modulePath);
  const real = latticeModule.pari_unit_real_lattice_rank_three;
  const prepare = latticeModule.pari_prepare_getfu_31_quintic;
  const I = (fn, length, capacity = 2048, input) => fn.createIntegerBuffer(
    length, capacity, input === undefined ? undefined : input.map(BigInt));
  const F = (fn, length) => fn.createFloat64Buffer(length);

  const identity = [1n, 0n, 0n, 0n, 1n, 0n, 0n, 0n, 1n];
  const first = [84, 84, 84, 36, 36, 36, 36].map(n => I(prepare, n));
  assert.equal(prepare.gmp(I(prepare, 84, 2048, lattice.cleanLogs),
    I(prepare, 9, 8, identity), ...first), 0n);
  const matep = values(first[0]), triples = [];
  for (let row = 0; row < 4; row += 1)
    for (let column = 0; column < 3; column += 1) {
      const source = 7 * (column * 4 + row) + 1;
      triples.push(matep[source], matep[source + 1], matep[source + 2]);
    }
  const getfuU2 = I(real, 9), getfuRealState = I(real, 2);
  assert.equal(real.gmp(I(real, 36, 2048, triples), 4n, I(real, 12), getfuU2,
    I(real, 12), I(real, 9), I(real, 9), F(real, 9), I(real, 9), F(real, 9),
    I(real, 9), F(real, 3), I(real, 3), F(real, 12), F(real, 9), I(real, 3),
    I(real, 4), I(real, 4), F(real, 4), F(real, 4), F(real, 4), I(real, 4),
    getfuRealState), 0n);
  const rawFactor = values(getfuU2);
  const factor = Array.from({ length: 9 }, (_, index) =>
    rawFactor[3 * (index % 3) + Math.floor(index / 3)]);
  const finalPackets = [84, 84, 84, 36, 36, 36, 36].map(n => I(prepare, n));
  assert.equal(prepare.gmp(I(prepare, 84, 2048, lattice.cleanLogs),
    I(prepare, 9, 8, factor), ...finalPackets), 0n);

  const embeddingReal = [], embeddingImag = [];
  for (let column = 0; column < 5; column += 1)
    for (let row = 0; row < 4; row += 1) {
      const index = 5 * row + column;
      embeddingReal.push(prepared.admission_matrix_m[index],
        prepared.admission_matrix_p[index], prepared.admission_matrix_e[index]);
      if (row < 3) embeddingImag.push("0", "-1", "0");
      else embeddingImag.push(prepared.admission_matrix_m[20 + column],
        prepared.admission_matrix_p[20 + column],
        prepared.admission_matrix_e[20 + column]);
    }
  const sourcePath = path.join(__dirname, "row21_rank3_getfu.py");
  const built = await compileKernel({ sourcePath, cacheRoot: CACHE_ROOT });
  const module = require(built.modulePath);
  const getfu = module.pari_getfu_rank3_mixed_quintic;
  const inverseFunction = module.pari_getfu_quintic_unit_inverse;
  const lengths = [36, 36, 75, 45, 75, 45, 45, 15, 25, 5, 15, 15, 36, 36];
  const output = lengths.map(n => I(getfu, n));
  const state = getfu.createInt64Buffer(8), pivots = getfu.createInt64Buffer(5);
  const status = getfu.gmp(I(getfu, 36, 2048, values(finalPackets[3])),
    I(getfu, 36, 2048, values(finalPackets[4])),
    I(getfu, 36, 2048, values(finalPackets[5])),
    I(getfu, 36, 2048, values(finalPackets[6])), I(getfu, 9, 8, factor),
    I(getfu, 60, 2048, embeddingReal), I(getfu, 60, 2048, embeddingImag),
    I(getfu, 125, 64, prepared.basis_table), 192n, ...output, state, pivots,
    I(getfu, 3), I(getfu, 3), I(getfu, 512), I(getfu, 512), I(getfu, 512),
    I(getfu, 512), I(getfu, 91));
  assert.equal(status, 0n, `getfu state ${values(state)}`);
  const units = values(output[11]);
  const tensor = prepared.basis_table.map(BigInt), inverses = [], norms = [];
  for (let column = 0; column < 3; column += 1) {
    const inverse = I(inverseFunction, 5), multiplication = I(inverseFunction, 25);
    assert.equal(inverseFunction.gmp(I(inverseFunction, 15, 2048, units),
      BigInt(5 * column), I(inverseFunction, 125, 64, tensor), multiplication,
      inverse), 1n);
    inverses.push(...values(inverse));
    const matrix = Array.from({ length: 25 }, (_, index) =>
      Array.from({ length: 5 }, (_, basis) =>
        units[5 * column + basis] * tensor[25 * basis + index])
        .reduce((sum, value) => sum + value, 0n));
    norms.push(determinant5(matrix));
  }
  return { built, latticeBuilt, lattice,
    getfuRealState: values(getfuRealState).map(Number),
    getfuState: values(state).map(Number), factor: factor.map(String),
    units: units.map(String), inverses: inverses.map(String),
    norms: norms.map(String), realSigns: exactSigns(prepared, units),
    logsReal: values(output[12]).map(String), logsImag: values(output[13]).map(String) };
}

module.exports = { CACHE_ROOT, determinant5, exactSigns, runLiveUnits };

"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const CACHE_ROOT = process.env.SAGEJS_NATIVE_CACHE_DIR ||
  "/scratch/sagejs-row21-acceptance-native-cache";
const values = owner => (owner.toArray ? owner.toArray() : Array.from(owner));

async function runLiveRankThreeLattice(owner) {
  assert.equal(owner.schema,
    "sagejs.pari-class-group/row21-live-hnf-log-regulator-owner-v1");
  assert.equal(owner.publication.liveRankThreeSuffixReady, true);
  const sourcePath = path.join(__dirname, "row21_rank3_unit_lattice.py");
  const built = await compileKernel({ sourcePath, cacheRoot: CACHE_ROOT });
  const module = require(built.modulePath);
  const integer = module.pari_unit_integer_lattice_rank_three;
  const transformLogs = module.pari_log_matrix_transform;
  const real = module.pari_unit_real_lattice_rank_three;
  const compose = module.pari_unit_compose_rank_three;
  const cleanarch = module.pari_cleanarchunit_31_quintic;
  const prepare = module.pari_prepare_getfu_31_quintic;
  for (const fn of [integer, transformLogs, real, compose, cleanarch, prepare])
    assert(fn?.nativeAvailable);
  const I = (fn, length, capacity = 64, input) => fn.createIntegerBuffer(
    length, capacity, input === undefined ? undefined : input.map(BigInt));
  const F = (fn, length) => fn.createFloat64Buffer(length);
  const columns = 8, square = columns * columns;
  const u1 = I(integer, 24), integerState = I(integer, 5);
  assert.equal(integer.gmp(
    I(integer, 24, 8, owner.acceptance.relationLattice), 8n, u1, integerState,
    I(integer, 24), I(integer, square), I(integer, square), F(integer, square),
    I(integer, square), F(integer, square), I(integer, square), F(integer, columns),
    I(integer, columns), F(integer, 24), F(integer, square), I(integer, columns),
    I(integer, columns), I(integer, columns), F(integer, columns), F(integer, columns),
    F(integer, columns), I(integer, columns)), 0n);

  const packed = I(transformLogs, 8 * 4 * 7, 16, owner.hnf.exactC.slice(0, 8 * 4 * 7));
  const firstLogs = I(transformLogs, 4 * 3 * 7, 32);
  assert.equal(transformLogs.gmp(packed, u1, 4n, 8n, 3n, false, firstLogs), 0n);
  const first = values(firstLogs), triples = [];
  for (let row = 0; row < 4; row += 1)
    for (let column = 0; column < 3; column += 1) {
      const source = 7 * (column * 4 + row) + 1;
      triples.push(first[source], first[source + 1], first[source + 2]);
    }
  const u2 = I(real, 9), realState = I(real, 2);
  assert.equal(real.gmp(I(real, 36, 32, triples), 4n, I(real, 12), u2,
    I(real, 12), I(real, 9), I(real, 9), F(real, 9), I(real, 9), F(real, 9),
    I(real, 9), F(real, 3), I(real, 3), F(real, 12), F(real, 9), I(real, 3),
    I(real, 4), I(real, 4), F(real, 4), F(real, 4), F(real, 4), I(real, 4),
    realState), 0n);
  const unitTransform = I(compose, 24);
  assert.equal(compose.gmp(u1, 8n, u2, unitTransform), 0n);
  const unitLogs = I(transformLogs, 4 * 3 * 7, 32);
  assert.equal(transformLogs.gmp(packed, unitTransform, 4n, 8n, 3n, false,
    unitLogs), 0n);
  const cleaned = I(cleanarch, 84, 64), cleanState = I(cleanarch, 7);
  assert.equal(cleanarch.gmp(unitLogs,
    I(cleanarch, 3, 16, owner.acceptance.regulator), 192n, I(cleanarch, 3),
    I(cleanarch, 1024), I(cleanarch, 1024), I(cleanarch, 1024), I(cleanarch, 1024),
    I(cleanarch, 2048), I(cleanarch, 84), cleaned, cleanState), 0n);
  const identity = [1n, 0n, 0n, 0n, 1n, 0n, 0n, 0n, 1n];
  const outputs = [84, 84, 84, 36, 36, 36, 36].map(length => I(prepare, length, 64));
  assert.equal(prepare.gmp(cleaned, I(prepare, 9, 2, identity), ...outputs), 0n);
  return { built, integerState: values(integerState).map(Number),
    realState: values(realState).map(Number), cleanarchState: values(cleanState).map(Number),
    u1: values(u1).map(String), u2: values(u2).map(String),
    unitTransform: values(unitTransform).map(String), cleanLogs: values(cleaned).map(String),
    candidateA: values(outputs[2]).map(String) };
}

module.exports = { runLiveRankThreeLattice };

"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const flint = require("..");

test("native Dirichlet groups preserve Sage component ordering", () => {
  const group = flint.dirichletGroup(12n);
  assert.deepEqual(flint.dirichletGroupData(group), {
    modulus: 12n,
    size: 4n,
    exponent: 2n,
    numberPrimitive: 1n,
    orders: [2n, 2n],
    generators: [7n, 5n],
  });
  assert.deepEqual(flint.dirichletCharacterData(group, 1n), {
    conreyNumber: 7n,
    conductor: 4n,
    order: 2n,
    even: false,
    principal: false,
    real: true,
    primitive: false,
  });
  assert.equal(flint.dirichletCharacterExponent(group, 1n, 7n), 1n);
  assert.equal(flint.dirichletCharacterExponent(group, 1n, 5n), 0n);
  assert.equal(flint.dirichletCharacterExponent(group, 1n, 6n), null);
  assert.deepEqual(
    flint.dirichletCharacterExponents(group, 1n),
    [null, 0n, null, null, null, 0n, null, 1n, null, null, null, 1n],
  );
});

test("native cyclotomic roots are exact algebraic numbers", () => {
  assert.deepEqual(
    [...Array(6).keys()].map((exponent) =>
      flint.cyclotomicRootCoefficients(BigInt(exponent), 6n),
    ),
    [
      [1n],
      [0n, 1n],
      [-1n, 1n],
      [-1n],
      [0n, -1n],
      [1n, -1n],
    ],
  );
  const root = flint.qqbarRootOfUnity(1n, 6n);
  assert.deepEqual(
    flint.qqbarMinpolyCoefficients(root),
    [1n, -1n, 1n],
  );
});

test("native Dirichlet boundary rejects invalid handles and indices", () => {
  assert.throws(() => flint.dirichletGroup(0n), /positive/);
  assert.throws(() => flint.dirichletGroup(12), /BigInt/);
  const group = flint.dirichletGroup(12n);
  assert.throws(
    () => flint.dirichletCharacterData(group, 4n),
    /out of range/,
  );
  assert.throws(
    () => flint.dirichletCharacterExponent(group, 0n, 12n),
    /reduced/,
  );
  assert.throws(
    () => flint.dirichletGroupData({}),
    /Dirichlet group/,
  );
});

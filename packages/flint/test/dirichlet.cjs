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

test("native Dirichlet analytic functions use exact qqbar and Arb", () => {
  const group = flint.dirichletGroup(5n);
  const gaussExact = flint.dirichletGaussSumExact(group, 1n, 1n);
  assert.deepEqual(
    flint.qqbarMinpolyCoefficients(gaussExact),
    [625n, 0n, 0n, 0n, 30n, 0n, 0n, 0n, 1n],
  );

  const jacobiExact = flint.dirichletJacobiSumExact(group, 1n, 1n);
  assert.equal(flint.qqbarToString(jacobiExact, 16), "-2*I - 1");

  const gauss = flint.dirichletGaussSum(group, 1n, 1n, 100);
  assert.equal(flint.complexPrecision(gauss), 100);
  assert.ok(
    Math.abs(flint.complexRealDouble(gauss) + 1.175570504584946) <
      1e-14,
  );
  assert.ok(
    Math.abs(flint.complexImagDouble(gauss) - 1.902113032590307) <
      1e-14,
  );

  const jacobi = flint.dirichletJacobiSum(group, 1n, 1n, 100);
  assert.ok(Math.abs(flint.complexRealDouble(jacobi) + 1) < 1e-14);
  assert.ok(Math.abs(flint.complexImagDouble(jacobi) + 2) < 1e-14);

  const rootNumber = flint.dirichletRootNumber(group, 1n, 100);
  assert.ok(
    Math.abs(
      Math.hypot(
        flint.complexRealDouble(rootNumber),
        flint.complexImagDouble(rootNumber),
      ) - 1,
    ) < 1e-14,
  );
  assert.throws(
    () =>
      flint.dirichletRootNumber(
        flint.dirichletGroup(12n),
        0n,
        53,
      ),
    /primitive/,
  );
});

test("native Dirichlet L-functions include actual derivatives", () => {
  const group = flint.dirichletGroup(5n);
  const argument = flint.complexFromReals(
    flint.realFromBigInt(2n, 100),
    flint.realFromBigInt(0n, 100),
  );
  const expected = [
    [0.9587161227168832, 0.1455658767850896],
    [0.05050979313230396, -0.06288371253648252],
    [-0.05914132180479546, 0.006118657582823762],
  ];
  for (let derivative = 0; derivative < expected.length; derivative++) {
    const value = flint.dirichletLValue(
      group,
      1n,
      argument,
      derivative,
      100,
    );
    assert.equal(flint.complexPrecision(value), 100);
    assert.ok(
      Math.abs(
        flint.complexRealDouble(value) - expected[derivative][0],
      ) < 1e-14,
    );
    assert.ok(
      Math.abs(
        flint.complexImagDouble(value) - expected[derivative][1],
      ) < 1e-14,
    );
  }
});

test("native generalized Bernoulli numbers are exact", () => {
  const group = flint.dirichletGroup(5n);
  assert.deepEqual(
    [...Array(6).keys()].map((index) =>
      flint.qqbarToString(
        flint.dirichletBernoulli(group, 1n, index),
        16,
      ),
    ),
    [
      "0",
      "-1/5*I - 3/5",
      "0",
      "6/5*I + 12/5",
      "0",
      "-86/5*I - 148/5",
    ],
  );
  assert.equal(
    flint.qqbarToString(flint.dirichletBernoulli(group, 0n, 4), 16),
    "62/15",
  );
});

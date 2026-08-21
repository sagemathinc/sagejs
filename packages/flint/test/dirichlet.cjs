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

test("declared Dirichlet resource adapter closes its native handle", () => {
  const group = flint.ffiDirichletGroupCreate(5n);
  assert.equal(flint.ffiDirichletGroupSize(group), 4n);
  assert.equal(flint.ffiDirichletGroupNumPrimitive(group), 3n);
  assert.equal(flint.ffiDirichletGroupClose(group), undefined);
  assert.throws(() => flint.ffiDirichletGroupSize(group));
  // Generated owned-resource close is idempotent. The raw host adapter keeps
  // that invariant as well, so cleanup remains safe after partial failures.
  assert.equal(flint.ffiDirichletGroupClose(group), undefined);
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

test("native Riemann zeta jets, xi, and batches preserve precision", () => {
  const complex = (realValue, imaginaryValue = 0, precision = 160) =>
    flint.complexFromReals(
      flint.realFromString(String(realValue), precision),
      flint.realFromString(String(imaginaryValue), precision),
    );
  const real = (value, precision = 160) => complex(value, 0, precision);
  const argument = real(2);
  const jet = flint.riemannZetaJet(argument, 0, 2, false, 160);
  assert.equal(jet.length, 2);
  assert.equal(flint.complexPrecision(jet[0]), 160);
  assert.ok(
    Math.abs(flint.complexRealDouble(jet[0]) - Math.PI ** 2 / 6) <
      1e-15,
  );
  assert.ok(
    Math.abs(flint.complexRealDouble(jet[1]) + 0.9375482543158438) <
      1e-15,
  );

  const deflated = flint.riemannZetaJet(real(1), 0, 1, true, 160)[0];
  assert.ok(
    Math.abs(flint.complexRealDouble(deflated) - 0.5772156649015329) <
      1e-15,
  );
  const xi = flint.riemannXiStandardValue(real(0.5), 160);
  assert.ok(
    Math.abs(flint.complexRealDouble(xi) - 0.4971207781883141) <
      1e-15,
  );
  const gammaValues = flint.complexGammaValues(
    [real(0.5), real(1), real(3)],
    160,
  );
  assert.equal(gammaValues.length, 3);
  assert.ok(
    Math.abs(flint.complexRealDouble(gammaValues[0]) - Math.sqrt(Math.PI)) <
      1e-15,
  );
  assert.equal(flint.complexRealDouble(gammaValues[1]), 1);
  assert.equal(flint.complexRealDouble(gammaValues[2]), 2);
  const nonrealGamma = flint.complexGammaValues(
    [complex(1, 1), complex(2, 1)],
    160,
  );
  const gammaOneReal = flint.complexRealDouble(nonrealGamma[0]);
  const gammaOneImag = flint.complexImagDouble(nonrealGamma[0]);
  assert.ok(
    Math.abs(
      flint.complexRealDouble(nonrealGamma[1]) -
        (gammaOneReal - gammaOneImag),
    ) < 1e-14,
  );
  assert.ok(
    Math.abs(
      flint.complexImagDouble(nonrealGamma[1]) -
        (gammaOneReal + gammaOneImag),
    ) < 1e-14,
  );
  const xiValues = flint.riemannXiValues(
    [real(0), real(1), real(0.5)],
    160,
  );
  assert.equal(xiValues.length, 3);
  assert.equal(flint.complexRealDouble(xiValues[0]), 0.5);
  assert.equal(flint.complexRealDouble(xiValues[1]), 0.5);
  assert.ok(
    Math.abs(flint.complexRealDouble(xiValues[2]) - 0.4971207781883141) <
      1e-15,
  );
  const symmetricXi = flint.riemannXiValues(
    [complex(0.25, 1.5), complex(0.75, -1.5)],
    160,
  );
  assert.ok(
    Math.abs(
      flint.complexRealDouble(symmetricXi[0]) -
        flint.complexRealDouble(symmetricXi[1]),
    ) < 1e-15,
  );
  assert.ok(
    Math.abs(
      flint.complexImagDouble(symmetricXi[0]) -
        flint.complexImagDouble(symmetricXi[1]),
    ) < 1e-15,
  );
  for (const invalidPrecision of [15, 53.5, 1048577]) {
    assert.throws(
      () => flint.complexGammaValues([real(1)], invalidPrecision),
      /precision must be an integer between 16 and 1048576 bits/,
    );
    assert.throws(
      () => flint.riemannXiValues([real(1)], invalidPrecision),
      /precision must be an integer between 16 and 1048576 bits/,
    );
  }
  assert.throws(
    () => flint.complexGammaValues([complex("nan")], 160),
    /points must contain only finite complex values/,
  );
  assert.throws(
    () => flint.riemannXiValues([complex("inf")], 160),
    /points must contain only finite complex values/,
  );

  const points = [real(2), real(3), real(-2)];
  const values = flint.riemannZetaValues(points, 160);
  assert.equal(values.length, points.length);
  assert.ok(
    Math.abs(flint.complexRealDouble(values[0]) - Math.PI ** 2 / 6) <
      1e-15,
  );
  assert.ok(
    Math.abs(flint.complexRealDouble(values[1]) - 1.2020569031595942) <
      1e-15,
  );
  assert.equal(flint.complexRealDouble(values[2]), 0);
  assert.throws(
    () => flint.riemannZetaValues([], 53),
    /between 1 and 100000/,
  );
});

test("native batched Dirichlet L-values reuse one character", () => {
  const group = flint.dirichletGroup(5n);
  const points = [2n, 3n, 4n].map((value) =>
    flint.complexFromReals(
      flint.realFromBigInt(value, 100),
      flint.realFromBigInt(0n, 100),
    ),
  );
  const values = flint.dirichletLValues(group, 1n, points, 0, 100);
  assert.equal(values.length, points.length);
  for (let index = 0; index < points.length; index++) {
    const scalar = flint.dirichletLValue(
      group,
      1n,
      points[index],
      0,
      100,
    );
    assert.equal(
      flint.complexRealDouble(values[index]),
      flint.complexRealDouble(scalar),
    );
    assert.equal(
      flint.complexImagDouble(values[index]),
      flint.complexImagDouble(scalar),
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

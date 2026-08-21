"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const flint = require("..");

test("native FLINT arithmetic and exact algebra", () => {
assert.equal(flint.version(), "3.6.0");
assert.equal(flint.nativeAbiVersion(), 2);
assert.equal(flint.blasEnabled(), true);
assert.equal(flint.mpfrVersion(), "4.2.2");
assert.equal(
  flint.mpcVersion(),
  process.platform === "win32" ? "1.3.1" : "1.4.1",
);
assert.match(flint.gmpVersion(), /^6\./);
assert.equal(flint.smalljacVersion(), "smalljac version 4.1.3");
assert.equal(flint.ecApIntegral(0n, 0n, 1n, -1n, 0n, 5n), -2);
assert.deepEqual(
  Array.from(flint.ecAnlistIntegral(0n, 0n, 1n, -1n, 0n, 37n, 12n)),
  [0, 1, -2, -3, 2, -2, 6, -1, 0, 6, 4, -5, -6],
);
const secp256k1Prime = 2n ** 256n - 2n ** 32n - 977n;
const secp256k1X =
  55066263022277343669578718895168534326250603453777594175500187360389116729240n;
const secp256k1Y =
  32670510020758816978083085130507043184471273380659243275938904335757337482424n;
assert.deepEqual(
  flint.ecScalarMulPrime(
    0n, 0n, 0n, 0n, 7n,
    secp256k1X, secp256k1Y, 2n, secp256k1Prime,
  ),
  [
    89565891926547004231252920425935692360644145829622209833684329913297188986597n,
    12158399299693830322967808612713398636155367887041628176798871954788371653930n,
  ],
);
assert.deepEqual(
  flint.ecScalarMulPrime(
    0n, 0n, 0n, 0n, 7n,
    secp256k1X, secp256k1Y,
    115792089237316195423570985008687907852837564279074904382605163141518161494337n,
    secp256k1Prime,
  ),
  [],
);
assert.deepEqual(
  flint.ecScalarMulRational(
    0n, 1n, 0n, 1n, 1n, 1n, -1n, 1n, 0n, 1n,
    0n, 1n, 0n, 1n, 10n,
  ),
  [161n, 16n, -2065n, 64n],
);

const projectiveLine = flint.p1List(12);
assert.equal(flint.p1ListLevel(projectiveLine), 12);
assert.equal(flint.p1ListCount(projectiveLine), 24);
assert.deepEqual(flint.p1ListEntry(projectiveLine, 0), [0, 1]);
assert.deepEqual(flint.p1ListEntry(projectiveLine, 23), [6, 1]);
assert.deepEqual(
  flint.p1ListNormalize(projectiveLine, 7, 15, 1),
  [1, 9, 7],
);
assert.equal(flint.p1ListIndex(projectiveLine, 2, 3), 14);
for (let index = 0; index < flint.p1ListCount(projectiveLine); index += 1) {
  assert.equal(
    flint.p1ListApplyS(
      projectiveLine,
      flint.p1ListApplyS(projectiveLine, index),
    ),
    index,
  );
  assert.equal(
    flint.p1ListApplyR(
      projectiveLine,
      flint.p1ListApplyR(
        projectiveLine,
        flint.p1ListApplyR(projectiveLine, index),
      ),
    ),
    index,
  );
}
const maninRelations = flint.p1ListManinRelations(
  flint.p1List(11),
  65521n,
);
assert.deepEqual(flint.maninRelationsInfo(maninRelations), {
  level: 11,
  modulus: 65521,
  generators: 12,
  rows: 10,
  nonzero: 24,
  sRelations: 6,
  rRelations: 4,
  checksum: "00be8e2ac6d23394",
});
assert.deepEqual(flint.maninRelationsRow(maninRelations, 0), [0, 1n, 1, 1n]);
assert.equal(flint.maninRelationsRank(maninRelations), 9);
assert.deepEqual(
  flint.p1ListManinPresentationInfo(flint.p1List(389)),
  {
    level: 389,
    projectiveCosets: 390,
    cusps: 131,
    interiorPaths: 258,
    e1: 65,
    e2: 65,
    torsion2: 2,
    torsion3: 0,
    generators: 67,
    relations: 3,
    dimension: 65,
  },
);
assert.deepEqual(
  flint.p1ListManinPresentationInfo(flint.p1List(1000)),
  {
    level: 1000,
    projectiveCosets: 1800,
    cusps: 601,
    interiorPaths: 1198,
    e1: 301,
    e2: 301,
    torsion2: 0,
    torsion3: 0,
    generators: 301,
    relations: 1,
    dimension: 301,
  },
);
const hecke11 = flint.p1ListHeckeMatrix(flint.p1List(11), 2n);
assert.deepEqual(
  Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 3 }, (_, col) =>
      flint.matrixEntry(hecke11, row, col))),
  [
    [3n, 0n, 0n],
    [1n, -2n, 0n],
    [1n, 0n, -2n],
  ],
);
const boundary11 = flint.p1ListBoundaryData(flint.p1List(11));
assert.deepEqual(boundary11.cusps, [[1n, 0n], [0n, 1n]]);
assert.deepEqual(
  Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 2 }, (_, col) =>
      flint.matrixEntry(boundary11.matrix, row, col))),
  [[1n, -1n], [0n, 0n], [0n, 0n]],
);
const boundary100 = flint.p1ListBoundaryData(flint.p1List(100));
assert.equal(boundary100.cusps.length, 18);
assert.equal(flint.matrixRank(boundary100.matrix), 17);
const cuspidal100 = flint.p1ListCuspidalBasis(flint.p1List(100));
assert.equal(flint.matrixRank(cuspidal100), 14);
assert.equal(
  flint.matrixRank(flint.matrixMul(cuspidal100, boundary100.matrix)),
  0,
);
assert.equal(
  flint.matrixEqual(
    flint.matrixRref(cuspidal100),
    flint.zzMatrixToQQ(cuspidal100),
  ),
  true,
);
const star11 = flint.p1ListStarMatrix(flint.p1List(11));
assert.deepEqual(
  Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 3 }, (_, col) =>
      flint.matrixEntry(star11, row, col))),
  [[1n, 0n, 0n], [0n, 0n, 1n], [0n, 1n, 0n]],
);
const plus100 = flint.p1ListStarEigenspaceBasis(
  flint.p1List(100),
  1,
);
assert.equal(plus100.dimension, 18);
assert.equal(flint.matrixRank(plus100.matrix), 18);
assert.equal(
  flint.matrixEqual(
    flint.matrixMul(
      plus100.matrix,
      flint.matrixTranspose(
        flint.zzMatrixToQQ(
          flint.p1ListStarMatrix(flint.p1List(100)),
        ),
      ),
    ),
    plus100.matrix,
  ),
  true,
);
assert.deepEqual(
  Array.from({ length: 3 }, (_, row) =>
    flint.matrixEntry(
      flint.p1ListReducePath(flint.p1List(11), -1, 2, 3, 5),
      row,
      0,
    )),
  [0n, 0n, 1n],
);
for (const [level, prime, dimension, traces] of [
  [389, 3n, 65, [4n, 264n, 88n]],
  [1000, 2n, 301, [4n, 10n, 10n]],
  [1000, 3n, 301, [20n, 1280n, 416n]],
]) {
  const matrix = flint.p1ListHeckeMatrix(flint.p1List(level), prime);
  let power = matrix;
  for (const expected of traces) {
    let trace = 0n;
    for (let index = 0; index < dimension; index += 1) {
      trace += flint.matrixEntry(power, index, index);
    }
    assert.equal(trace, expected);
    power = flint.matrixMul(power, matrix);
  }
}
assert.throws(
  () => flint.p1ListHeckeMatrix(flint.p1List(11), 4n),
  /must be a prime/,
);
for (let level = 1; level <= 80; level += 1) {
  const p1 = flint.p1List(level);
  const presentation = flint.p1ListManinPresentationInfo(p1);
  const relations = flint.p1ListManinRelations(p1, 65521n);
  const relationInfo = flint.maninRelationsInfo(relations);
  assert.equal(
    presentation.dimension,
    relationInfo.generators - flint.maninRelationsRank(relations),
    `minimal and dense Manin presentations differ at level ${level}`,
  );
}

for (const value of [
  0n,
  1n,
  -1n,
  2n ** 63n - 1n,
  2n ** 63n,
  -(2n ** 200n + 123456789n),
  2n ** 4096n - 1n,
]) {
  assert.equal(flint.identity(value), value);
}

assert.equal(flint.gcd(0n, 0n), 0n);
assert.equal(flint.gcd(-48n, 180n), 12n);
assert.equal(flint.factorial(100), 93326215443944152681699238856266700490715968264381621468592963895217599993229915608941463976156518286253697920827223758251185210916864000000000000000000000000n);
assert.equal(flint.fibonacci(100), 354224848179261915075n);
assert.equal(flint.binomial(100, 50), 100891344545564193334812497256n);
assert.equal(flint.primorial(20), 9699690n);
assert.deepEqual(flint.factor(-360n), {
  sign: -1,
  factors: [
    [2n, 3],
    [3n, 2],
    [5n, 1],
  ],
});
assert.deepEqual(flint.factor(2n ** 64n - 1n), {
  sign: 1,
  factors: [
    [3n, 1],
    [5n, 1],
    [17n, 1],
    [257n, 1],
    [641n, 1],
    [65537n, 1],
    [6700417n, 1],
  ],
});

assert.deepEqual(flint.qfbReducedForms(-23n), [
  [1n, 1n, 6n],
  [2n, -1n, 3n],
  [2n, 1n, 3n],
]);
assert.deepEqual(flint.qfbReducedForms(-84n), [
  [1n, 0n, 21n],
  [2n, 2n, 11n],
  [3n, 0n, 7n],
  [5n, 4n, 5n],
]);
assert.equal(flint.qfbClassNumber(-420n), 8n);
assert.deepEqual(flint.qfbClassGroupData(-23n), {
  classNumber: 3n,
  generator: [2n, -1n, 3n],
  forms: null,
});
assert.deepEqual(flint.qfbClassGroupData(-84n), {
  classNumber: 4n,
  generator: null,
  forms: [
    [1n, 0n, 21n],
    [2n, 2n, 11n],
    [3n, 0n, 7n],
    [5n, 4n, 5n],
  ],
});
assert.deepEqual(flint.qfbClassGroupData(-4n), {
  classNumber: 1n,
  generator: [1n, 0n, 1n],
  forms: null,
});
assert.deepEqual(
  flint.qfbNucomp(-23n, [2n, -1n, 3n], [2n, -1n, 3n]),
  [2n, 1n, 3n],
);
assert.deepEqual(flint.qfbPow(-23n, [2n, -1n, 3n], 3n), [1n, 1n, 6n]);
assert.throws(() => flint.qfbReducedForms(-22n), /congruent to 0 or 1/);
assert.throws(
  () => flint.qfbNucomp(-23n, [1n, 0n, 1n], [2n, -1n, 3n]),
  /primitive, reduced/,
);
assert.throws(
  () => flint.qfbPow(-23n, [2n, -1n, 3n], -1n),
  /nonnegative/,
);

assert.throws(() => flint.identity(1), /BigInt/);
assert.throws(() => flint.factor(0n), /factor zero/);
assert.throws(() => flint.factorial(1n), /Number/);
assert.throws(() => flint.factorial(-1), /nonnegative/);

const zx = flint.zzPolyGen();
const zone = flint.zzPolyConstant(1n);
const zf = flint.polyPow(flint.polyAdd(zx, zone), 3n);
assert.equal(flint.polyToString(zf, "x"), "x^3+3*x^2+3*x+1");
assert.deepEqual(flint.polyCoefficients(zf), [1n, 3n, 3n, 1n]);
assert.equal(flint.polyEqual(zf, zf), true);

const algebraicTwo = flint.qqbarFromRational(2n, 1n);
const logarithmBall40 = flint.qqbarLogAbsBall(algebraicTwo, 40);
const logarithmBall100 = flint.qqbarLogAbsBall(algebraicTwo, 100);
for (const enclosure of [logarithmBall40, logarithmBall100]) {
  const midpoint = Number(enclosure.midpoint);
  const radius = Number(enclosure.radius);
  const lower =
    Number(BigInt(enclosure.lowerMantissa)) *
    2 ** Number(BigInt(enclosure.lowerExponent));
  const upper =
    Number(BigInt(enclosure.upperMantissa)) *
    2 ** Number(BigInt(enclosure.upperExponent));
  assert.equal(enclosure.precisionBits >= 40, true);
  assert.equal(enclosure.endpointEncoding, "mantissa-times-two-power");
  assert.equal(Number.isFinite(midpoint), true);
  assert.equal(radius > 0, true);
  assert.equal(Math.abs(midpoint - Math.LN2) <= radius + Number.EPSILON, true);
  assert.equal(lower <= Math.LN2, true);
  assert.equal(Math.LN2 <= upper, true);
}
assert.equal(
  Number(logarithmBall100.radius) < Number(logarithmBall40.radius),
  true,
);
const quadraticSplitting = flint.numberFieldSplittingTypes(
  [-5n, 0n, 1n],
  [3, 5, 11],
);
for (const factors of quadraticSplitting) {
  factors.sort((left, right) => left[1] - right[1] || left[0] - right[0]);
}
assert.deepEqual(quadraticSplitting, [
  [[1, 2]],
  [[2, 1]],
  [
    [1, 1],
    [1, 1],
  ],
]);
const algebraicSqrtTwo = flint.qqbarSqrt(algebraicTwo);
assert.equal(flint.qqbarDegree(algebraicSqrtTwo), 2);
assert.equal(flint.qqbarIsReal(algebraicSqrtTwo), true);
assert.deepEqual(
  flint.qqbarMinpolyCoefficients(algebraicSqrtTwo),
  [-2n, 0n, 1n],
);
assert.equal(
  flint.qqbarEqual(
    flint.qqbarMul(algebraicSqrtTwo, algebraicSqrtTwo),
    algebraicTwo,
  ),
  true,
);
assert.equal(flint.qqbarToString(flint.qqbarI(), 16), "I");
const cyclotomicFactorization = flint.cyclotomicPolyFactor(
  flint.qqbarI(),
  [
    flint.qqbarFromRational(1n, 1n),
    flint.qqbarFromRational(0n, 1n),
    flint.qqbarFromRational(1n, 1n),
  ],
);
assert.equal(
  flint.qqbarEqual(
    cyclotomicFactorization.unit,
    flint.qqbarFromRational(1n, 1n),
  ),
  true,
);
assert.deepEqual(
  cyclotomicFactorization.factors.map(([coefficients, exponent]) => [
    coefficients.length,
    exponent,
    flint.qqbarEqual(
      flint.qqbarMul(coefficients[0], coefficients[0]),
      flint.qqbarFromRational(-1n, 1n),
    ),
  ]),
  [[2, 1, true], [2, 1, true]],
);
assert.throws(
  () => flint.qqbarDiv(algebraicTwo, flint.qqbarFromRational(0n, 1n)),
  /division by zero/,
);
const algebraicRoots = flint.polyExactRoots(
  flint.polySub(flint.polyPow(zx, 2n), flint.zzPolyConstant(2n)),
);
assert.equal(algebraicRoots.length, 2);
assert.deepEqual(
  algebraicRoots.map(([, multiplicity]) => multiplicity),
  [1, 1],
);
assert.equal(
  flint.qqbarCompareReal(algebraicRoots[0][0], algebraicRoots[1][0]),
  -1,
);

const qx = flint.zzPolyToQQ(zx);
const third = flint.qqPolyConstant(1n, 3n);
const qf = flint.polyAdd(flint.polyAdd(qx, flint.qqPolyConstant(1n, 1n)), third);
assert.equal(flint.polyToString(qf, "x"), "x+4/3");
assert.deepEqual(flint.polyCoefficients(qf), [
  { numerator: 4n, denominator: 3n },
  { numerator: 1n, denominator: 1n },
]);
assert.equal(
  flint.polyEqual(qf, flint.polyAdd(qx, flint.qqPolyConstant(4n, 3n))),
  true,
);
assert.throws(() => flint.polyAdd(zx, qx), /different base rings/);
assert.throws(
  () => flint.polyAdd(zx, {}),
  /expected a Sage\.js FLINT polynomial/,
);
assert.throws(() => flint.qqPolyConstant(1n, 0n), /denominator is zero/);

const shifted = flint.polyShiftLeft(flint.polyAdd(zx, zone), 2n);
assert.equal(flint.polyToString(shifted, "x"), "x^3+x^2");
assert.equal(flint.polyValuation(shifted), 2);
assert.equal(
  flint.polyEqual(
    flint.polyShiftRight(shifted, 2n),
    flint.polyAdd(zx, zone),
  ),
  true,
);
assert.equal(
  flint.polyToString(flint.polyTruncate(zf, 2n), "x"),
  "3*x+1",
);
assert.equal(
  flint.polyToString(
    flint.polyMullow(
      flint.polyAdd(zx, zone),
      flint.polyAdd(zx, zone),
      2n,
    ),
    "x",
  ),
  "2*x+1",
);
assert.equal(
  flint.polyToString(
    flint.polyPowTrunc(flint.polyAdd(zx, zone), 5n, 3n),
    "x",
  ),
  "10*x^2+5*x+1",
);
assert.equal(
  flint.polyToString(
    flint.polyInvSeries(
      flint.polySub(
        flint.qqPolyConstant(1n, 1n),
        flint.zzPolyToQQ(zx),
      ),
      6n,
    ),
    "x",
  ),
  "x^5 + 1*x^4 + 1*x^3 + 1*x^2 + 1*x + 1",
);
assert.throws(
  () => flint.polyInvSeries(flint.zzPolyConstant(2n), 3n),
  /constant coefficient is not invertible/,
);
assert.throws(
  () => flint.polyInvSeries(flint.zzPolyConstant(0n), 3n),
  /constant coefficient is not invertible/,
);

for (const [kind, modulus, expected] of [
  ["zz", 0n, "x^2+2*y"],
  ["qq", 0n, "x^2 + 2*y"],
  ["nmod", 5n, "x^2+2*y"],
]) {
  const context = flint.mpolyContext(kind, 3, "degrevlex", modulus);
  const x = flint.mpolyGen(context, 0);
  const y = flint.mpolyGen(context, 1);
  const two = flint.mpolyConstant(context, 2n, 1n);
  const polynomial = flint.mpolyAdd(
    flint.mpolyPow(x, 2),
    flint.mpolyMul(two, y),
  );
  assert.equal(
    flint.mpolyToString(polynomial, ["x", "y", "z"]),
    expected,
  );
  assert.equal(flint.mpolyLength(polynomial), 2);
  assert.equal(flint.mpolyDegree(polynomial, 0), 2);
  assert.equal(flint.mpolyTotalDegree(polynomial), 2);
  const comparison = flint.mpolyCompare(
    polynomial,
    flint.mpolyNeg(polynomial),
  );
  assert.notEqual(comparison, 0);
  assert.equal(
    comparison,
    -flint.mpolyCompare(flint.mpolyNeg(polynomial), polynomial),
  );
  const multiple = flint.mpolyMul(polynomial, x);
  assert.equal(
    flint.mpolyEqual(flint.mpolyDivExact(multiple, polynomial), x),
    true,
  );
  assert.equal(
    flint.mpolyEqual(
      flint.mpolyGcd(
        multiple,
        flint.mpolyMul(polynomial, y),
      ),
      polynomial,
    ),
    true,
  );
  if (kind === "zz" || kind === "qq") {
    assert.throws(
      () => flint.mpolyUnivariateCoefficients(polynomial, 0),
      /another generator/,
    );
    const univariate = flint.mpolyAdd(
      flint.mpolyPow(x, 2),
      flint.mpolyConstant(context, 2n, 1n),
    );
    const coefficients = flint.mpolyUnivariateCoefficients(univariate, 0);
    assert.deepEqual(
      coefficients,
      kind === "zz"
        ? [2n, 0n, 1n]
        : [
            { numerator: 2n, denominator: 1n },
            { numerator: 0n, denominator: 1n },
            { numerator: 1n, denominator: 1n },
          ],
    );
  }
  const reorderedContext = flint.mpolyContext(
    kind,
    3,
    "degrevlex",
    modulus,
  );
  assert.equal(
    flint.mpolyToString(
      flint.mpolyComposeGen(
        polynomial,
        reorderedContext,
        [1, 0, 2],
      ),
      ["y", "x", "z"],
    ),
    expected,
  );
}
assert.throws(
  () => flint.mpolyContext("zz", 2, "unknown", 0n),
  /term order/,
);

{
  const context = flint.mpolyContext("qq", 2, "degrevlex", 0n);
  const x = flint.mpolyGen(context, 0);
  const y = flint.mpolyGen(context, 1);
  const one = flint.mpolyConstant(context, 1n, 1n);
  const quadratic = flint.mpolySub(
    flint.mpolyAdd(flint.mpolyPow(x, 2), flint.mpolyPow(y, 2)),
    one,
  );
  const cubic = flint.mpolySub(
    flint.mpolyAdd(flint.mpolyPow(x, 3), flint.mpolyPow(y, 3)),
    one,
  );
  const product = flint.mpolyMul(quadratic, cubic);
  assert.deepEqual(
    flint.mpolyIrreducibleFactors(product).map(([factor, exponent]) => [
      flint.mpolyToString(factor, ["x", "y"]),
      exponent,
    ]),
    [
      ["x^3 + y^3 - 1", 1],
      ["x^2 + y^2 - 1", 1],
    ],
  );
  const resultant = flint.mpolyResultant(quadratic, cubic, 0);
  assert.equal(
    flint.mpolyToString(resultant, ["x", "y"]),
    "2*y^6 - 3*y^4 - 2*y^3 + 3*y^2",
  );
  assert.deepEqual(
    flint.mpolyIrreducibleFactors(resultant).map(
      ([factor, exponent]) => [
        flint.mpolyToString(factor, ["x", "y"]),
        exponent,
      ],
    ),
    [
      ["y", 2],
      ["2*y^2 + 4*y + 3", 1],
      ["y - 1", 2],
    ],
  );
}

const groebnerContext = flint.mpolyContext("qq", 2, "degrevlex", 0n);
const groebnerX = flint.mpolyGen(groebnerContext, 0);
const groebnerY = flint.mpolyGen(groebnerContext, 1);
const groebnerTwo = flint.mpolyConstant(groebnerContext, 2n, 1n);
const groebnerF = flint.mpolyPow(
  flint.mpolyAdd(
    flint.mpolyPow(groebnerX, 3),
    flint.mpolyMul(
      groebnerTwo,
      flint.mpolyMul(flint.mpolyPow(groebnerY, 2), groebnerX),
    ),
  ),
  2,
);
const groebnerG = flint.mpolyMul(
  flint.mpolyPow(groebnerX, 2),
  flint.mpolyPow(groebnerY, 2),
);
const groebnerBasis = flint.mpolyGroebner([groebnerF, groebnerG]);
assert.deepEqual(
  groebnerBasis.map((value) =>
    flint.mpolyToString(value, ["x", "y"]),
  ),
  ["x^6", "x^2*y^2"],
);
assert.equal(
  flint.mpolyToString(
    flint.mpolyReduce(
      flint.mpolyPow(groebnerX, 2),
      groebnerBasis,
    ),
    ["x", "y"],
  ),
  "x^2",
);
assert.equal(
  flint.mpolyToString(
    flint.mpolyReduce(groebnerF, groebnerBasis),
    ["x", "y"],
  ),
  "0",
);

const fq4 = flint.fqContext(2n, 2, "a");
const fq4a = flint.fqGen(fq4);
const fq4one = flint.fqFromBigInt(fq4, 1n);
const fq4xy = flint.mpolyContext("fq_nmod", 2, "degrevlex", fq4);
const fq4x = flint.mpolyGen(fq4xy, 0);
const fq4y = flint.mpolyGen(fq4xy, 1);
const fq4aPlusOne = flint.fqAdd(fq4a, fq4one);
const fq4polynomial = flint.mpolyAdd(
  flint.mpolyAdd(flint.mpolyPow(fq4x, 2), fq4y),
  flint.mpolyConstant(fq4xy, fq4aPlusOne, 1n),
);
assert.equal(
  flint.mpolyToString(fq4polynomial, ["x", "y"]),
  "x^2 + y + (a+1)",
);
assert.equal(
  flint.mpolyEqual(
    flint.mpolyGcd(
      flint.mpolyMul(fq4polynomial, fq4x),
      flint.mpolyMul(fq4polynomial, fq4y),
    ),
    fq4polynomial,
  ),
  true,
);
assert.throws(
  () =>
    flint.mpolyConstant(
      fq4xy,
      flint.fqGen(flint.fqContext(2n, 2, "b")),
      1n,
    ),
  /different parent/,
);

assert.equal(flint.wordIsPrime(2n), true);
assert.equal(flint.wordIsPrime(18446744073709551557n), true);
assert.equal(flint.wordIsPrime(15n), false);
assert.equal(flint.isPrime(2n), true);
assert.equal(flint.isPrime(15n), false);
assert.equal(
  flint.isPrime(
    115792089237316195423570985008687907853269984665640564039457584007913129640233n,
  ),
  true,
);
assert.equal(flint.nextPrime(1000n), 1009n);
assert.equal(
  flint.nextPrime(2n ** 256n),
  115792089237316195423570985008687907853269984665640564039457584007913129640233n,
);
assert.equal(flint.primePi(0n), 0n);
assert.equal(flint.primePi(100n), 25n);
assert.equal(flint.primePi(1000000000000n), 37607912018n);
assert.throws(() => flint.primePi(2n ** 63n), /below 2\^63/);
assert.equal(flint.wordPrimitiveRootPrime(2n), 1n);
assert.equal(flint.wordPrimitiveRootPrime(1009n), 11n);

const fq9 = flint.fqContext(3n, 2, "a");
const fq9gen = flint.fqGen(fq9);
const fq9one = flint.fqFromBigInt(fq9, 1n);
assert.deepEqual(flint.fqContextModulus(fq9), [2n, 2n, 1n]);
assert.equal(flint.fqToString(fq9gen), "a");
assert.equal(flint.fqToString(flint.fqMul(fq9gen, fq9gen)), "a+1");
assert.equal(flint.fqToString(flint.fqAdd(fq9gen, fq9one)), "a+1");
assert.equal(
  flint.fqToString(flint.fqSub(flint.fqAdd(fq9gen, fq9one), fq9gen)),
  "1",
);
assert.equal(flint.fqToString(flint.fqNeg(fq9gen)), "2*a");
assert.equal(flint.fqToString(flint.fqDiv(fq9one, fq9gen)), "a+2");
assert.equal(flint.fqToString(flint.fqPow(fq9gen, -1n)), "a+2");
assert.equal(flint.fqToString(flint.fqPow(fq9gen, 8n)), "1");
assert.equal(flint.fqIsZero(flint.fqFromBigInt(fq9, 9n)), true);
assert.equal(flint.fqIsOne(flint.fqFromBigInt(fq9, 4n)), true);
assert.equal(flint.fqEqual(fq9gen, fq9gen), true);
assert.throws(
  () => flint.fqDiv(fq9one, flint.fqFromBigInt(fq9, 0n)),
  /division by zero/,
);
assert.throws(
  () => flint.fqAdd(fq9gen, flint.fqGen(flint.fqContext(3n, 2, "b"))),
  /different parents/,
);
assert.throws(() => flint.fqContext(3n, 1, "a"), /degree/);
assert.throws(() => flint.fqContext(65537n, 2, "a"), /Conway polynomial/);

const fq9Explicit = flint.fqContextWithModulus(
  3n,
  [1n, 0n, 1n],
  "u",
);
const fq9ExplicitGen = flint.fqGen(fq9Explicit);
assert.deepEqual(flint.fqContextModulus(fq9Explicit), [1n, 0n, 1n]);
assert.equal(
  flint.fqToString(flint.fqMul(fq9ExplicitGen, fq9ExplicitGen)),
  "2",
);
assert.throws(
  () => flint.fqContextWithModulus(3n, [2n, 0n, 1n], "u"),
  /irreducible/,
);
assert.throws(
  () => flint.fqContextWithModulus(3n, [1n, 0n, 2n], "u"),
  /monic/,
);
assert.throws(
  () => flint.fqContextWithModulus(3n, [3n, 0n, 1n], "u"),
  /normalized/,
);
assert.throws(
  () => flint.fqContextWithModulus(4n, [1n, 1n, 1n], "u"),
  /prime/,
);

const fq9x = flint.fqPolyGen(fq9);
const fq9a = flint.fqPolyConstant(fq9, fq9gen);
const fq9onePolynomial = flint.fqPolyConstant(fq9, fq9one);
const fq9xPlusA = flint.fqPolyAdd(fq9x, fq9a);
const fq9polynomial = flint.fqPolyMul(
  fq9xPlusA,
  flint.fqPolyAdd(fq9xPlusA, fq9onePolynomial),
);
assert.equal(
  flint.fqPolyToString(fq9polynomial, "x"),
  "x^2+(2*a+1)*x+(2*a+1)",
);
assert.deepEqual(
  flint.fqPolyCoefficients(fq9polynomial).map((value) =>
    flint.fqToString(value),
  ),
  ["2*a+1", "2*a+1", "1"],
);
assert.equal(
  flint.fqPolyToString(
    flint.fqPolyGcd(
      fq9polynomial,
      flint.fqPolySub(flint.fqPolyPow(fq9x, 9n), fq9x),
    ),
    "x",
  ),
  "x^2+(2*a+1)*x+(2*a+1)",
);
assert.equal(
  flint.fqPolyToString(
    flint.fqPolyDivExact(fq9polynomial, fq9xPlusA),
    "x",
  ),
  "x+(a+1)",
);
assert.equal(flint.fqPolyEqual(fq9polynomial, fq9polynomial), true);
assert.equal(flint.fqPolyIsIrreducible(fq9polynomial), false);
const fq9factorization = flint.fqPolyFactor(fq9polynomial);
assert.equal(flint.fqToString(fq9factorization.unit), "1");
assert.deepEqual(
  fq9factorization.factors.map(([factorValue, exponent]) => [
    flint.fqPolyToString(factorValue, "x"),
    exponent,
  ]),
  [
    ["x+(a+1)", 1],
    ["x+(a)", 1],
  ],
);
assert.deepEqual(
  flint.fqPolyRoots(fq9polynomial).map(([root, exponent]) => [
    flint.fqToString(root),
    exponent,
  ]),
  [
    ["2*a", 1],
    ["2*a+2", 1],
  ],
);
assert.throws(
  () => flint.fqPolyDivExact(fq9x, fq9polynomial),
  /not exact/,
);
assert.throws(
  () =>
    flint.fqPolyAdd(
      fq9x,
      flint.fqPolyGen(flint.fqContext(3n, 2, "b")),
    ),
  /different base fields/,
);

const fq9zero = flint.fqFromBigInt(fq9, 0n);
const fq9matrix = flint.fqMatrix(fq9, 2, 2, [
  fq9gen,
  fq9one,
  fq9one,
  fq9zero,
]);
const fqMatrixRows = (matrix, rows, cols) =>
  Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) =>
      flint.fqToString(flint.fqMatrixEntry(matrix, row, col)),
    ),
  );
assert.deepEqual(fqMatrixRows(fq9matrix, 2, 2), [
  ["a", "1"],
  ["1", "0"],
]);
assert.equal(flint.fqToString(flint.fqMatrixDet(fq9matrix)), "2");
assert.equal(flint.fqMatrixRank(fq9matrix), 2);
assert.deepEqual(
  fqMatrixRows(flint.fqMatrixRref(fq9matrix), 2, 2),
  [
    ["1", "0"],
    ["0", "1"],
  ],
);
const fq9inverse = flint.fqMatrixInverse(fq9matrix);
assert.deepEqual(fqMatrixRows(fq9inverse, 2, 2), [
  ["0", "1"],
  ["1", "2*a"],
]);
assert.deepEqual(
  fqMatrixRows(flint.fqMatrixMul(fq9matrix, fq9inverse), 2, 2),
  [
    ["1", "0"],
    ["0", "1"],
  ],
);
assert.equal(
  flint.fqPolyToString(flint.fqMatrixCharpoly(fq9matrix), "x"),
  "x^2+(2*a)*x+(2)",
);
const fq9row = flint.fqMatrix(fq9, 1, 3, [
  fq9one,
  fq9gen,
  flint.fqAdd(fq9gen, fq9one),
]);
const fq9kernel = flint.fqMatrixRightKernel(fq9row);
assert.deepEqual(fqMatrixRows(fq9kernel, 2, 3), [
  ["1", "0", "a+1"],
  ["0", "1", "2*a+1"],
]);
assert.deepEqual(
  fqMatrixRows(
    flint.fqMatrixMul(
      fq9row,
      flint.fqMatrixTranspose(fq9kernel),
    ),
    1,
    2,
  ),
  [["0", "0"]],
);
assert.deepEqual(
  fqMatrixRows(
    flint.fqMatrixSolve(
      fq9matrix,
      flint.fqMatrix(fq9, 2, 1, [fq9gen, fq9one]),
    ),
    2,
    1,
  ),
  [["1"], ["0"]],
);
assert.throws(
  () => flint.fqMatrixInverse(fq9row),
  /square matrix/,
);

const nmod5x = flint.nmodPolyGen(5n);
const nmod5one = flint.nmodPolyConstant(1n, 5n);
const nmod5f = flint.polySub(flint.polyPow(nmod5x, 4n), nmod5one);
assert.equal(flint.polyToString(nmod5f, "x"), "x^4+4");
assert.equal(
  flint.polyToString(
    flint.nmodPolyGcd(
      nmod5f,
      flint.polyPow(flint.polySub(nmod5x, nmod5one), 2n),
    ),
    "x",
  ),
  "x+4",
);
assert.equal(
  flint.nmodPolyIsIrreducible(
    flint.polyAdd(
      flint.polyPow(nmod5x, 2n),
      flint.nmodPolyConstant(2n, 5n),
    ),
  ),
  true,
);
const nmod5factorization = flint.nmodPolyFactor(nmod5f);
assert.equal(nmod5factorization.unit, 1n);
assert.deepEqual(
  nmod5factorization.factors
    .map(([factor, exponent]) => [
      flint.polyToString(factor, "x"),
      exponent,
    ])
    .sort(),
  [
    ["x+1", 1],
    ["x+2", 1],
    ["x+3", 1],
    ["x+4", 1],
  ],
);
const numberFieldFactorDegrees = flint.nfFactorDegreesBatch(
  [-1n, -1n, 0n, 1n],
  BigUint64Array.from([2n, 3n, 5n, 7n, 11n]),
);
assert.equal(numberFieldFactorDegrees.degree, 3);
assert.equal(numberFieldFactorDegrees.primeCount, 5);
assert.deepEqual(
  Array.from(numberFieldFactorDegrees.factorCounts, Number),
  [1, 1, 2, 2, 2],
);
assert.deepEqual(
  Array.from(numberFieldFactorDegrees.exponents, Number),
  [1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0],
);
assert.deepEqual(
  Array.from(numberFieldFactorDegrees.degrees, Number),
  [3, 0, 0, 3, 0, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0],
);
const largePrimeFactorDegrees = flint.nfFactorDegreesBatch(
  [-1n, -1n, 0n, 1n],
  BigUint64Array.from([4294967311n]),
);
assert.equal(
  Array.from(
    { length: Number(largePrimeFactorDegrees.factorCounts[0]) },
    (_, index) => Number(largePrimeFactorDegrees.exponents[index]) *
      Number(largePrimeFactorDegrees.degrees[index]),
  ).reduce((sum, value) => sum + value, 0),
  3,
);
assert.throws(
  () => flint.nfFactorDegreesBatch(
    [-1n, -1n, 0n, 1n],
    BigUint64Array.from([4n]),
  ),
  /unable to factor the polynomial at a supplied prime/,
);
assert.throws(
  () => flint.nfFactorDegreesBatch(
    [-1n, -1n, 0n, 2n],
    BigUint64Array.from([5n]),
  ),
  /polynomial must be monic/,
);
const nmod5g = flint.polyMul(
  flint.polyPow(flint.polySub(nmod5x, nmod5one), 2n),
  flint.polyAdd(nmod5x, flint.nmodPolyConstant(2n, 5n)),
);
assert.deepEqual(flint.nmodPolyRoots(nmod5g), [
  [3n, 1],
  [1n, 2],
]);
assert.equal(
  flint.polyToString(
    flint.zzPolyToNmod(flint.zzPolyConstant(-7n), 5n),
    "x",
  ),
  "3",
);
assert.throws(
  () => flint.polyAdd(nmod5x, flint.nmodPolyGen(7n)),
  /different finite fields/,
);
assert.throws(() => flint.nmodPolyGen(4n), /modulus must be prime/);

const zzx = flint.zzPolyGen();
const zzone = flint.zzPolyConstant(1n);
const zzfive = flint.zzPolyConstant(5n);
const zzpolynomial = flint.polyMul(
  flint.polySub(flint.polyPow(zzx, 2n), zzone),
  flint.polyMul(
    flint.polyAdd(flint.polyPow(zzx, 3n), flint.zzPolyConstant(2n)),
    flint.polySub(zzx, zzfive),
  ),
);
const zzfactorization = flint.polyFactor(zzpolynomial);
assert.equal(zzfactorization.unitNumerator, 1n);
assert.equal(zzfactorization.unitDenominator, 1n);
assert.deepEqual(
  zzfactorization.factors.map(([factor, exponent]) => [
    flint.polyToString(factor, "x"),
    exponent,
  ]),
  [
    ["x-1", 1],
    ["x+1", 1],
    ["x-5", 1],
    ["x^3+2", 1],
  ],
);
assert.ok(
  flint.polyEqual(
    flint.polyDivExact(zzpolynomial, flint.polySub(zzx, zzfive)),
    flint.polyMul(
      flint.polySub(flint.polyPow(zzx, 2n), zzone),
      flint.polyAdd(flint.polyPow(zzx, 3n), flint.zzPolyConstant(2n)),
    ),
  ),
);
assert.throws(
  () => flint.polyDivExact(zzpolynomial, flint.polyAdd(zzx, zzfive)),
  /not exact/,
);

const qqx = flint.qqPolyGen();
const qqpolynomial = flint.polyMul(
  flint.qqPolyConstant(3n, 10n),
  flint.polyMul(
    flint.polyPow(
      flint.polySub(qqx, flint.qqPolyConstant(1n, 1n)),
      2n,
    ),
    flint.polyAdd(qqx, flint.qqPolyConstant(2n, 1n)),
  ),
);
const qqfactorization = flint.polyFactor(qqpolynomial);
assert.equal(qqfactorization.unitNumerator, 3n);
assert.equal(qqfactorization.unitDenominator, 10n);
assert.deepEqual(
  qqfactorization.factors.map(([factor, exponent]) => [
    flint.polyToString(factor, "x"),
    exponent,
  ]),
  [
    ["x+2", 1],
    ["x-1", 2],
  ],
);

const r53 = flint.realFromString("1.2", 53);
const r100 = flint.realFromRational(1n, 3n, 100);
assert.equal(flint.realPrecision(r53), 53);
assert.equal(flint.realToString(r53), "1.20000000000000");
assert.equal(flint.realToDouble(r53), 1.2);
assert.equal(
  flint.realToString(r100),
  "0.33333333333333333333333333333",
);
assert.equal(
  flint.realToString(
    flint.realDiv(
      flint.realFromBigInt(1n, 53),
      flint.realFromBigInt(0n, 53),
    ),
  ),
  "+infinity",
);
assert.equal(
  flint.realToString(flint.realPowInt(flint.realFromBigInt(2n, 53), -3n)),
  "0.125000000000000",
);

const c53 = flint.complexFromReals(
  flint.realFromBigInt(1n, 53),
  flint.realFromBigInt(2n, 53),
);
assert.equal(flint.complexPrecision(c53), 53);
assert.equal(flint.complexRealDouble(c53), 1);
assert.equal(flint.complexImagDouble(c53), 2);
assert.equal(
  flint.realToString(flint.complexReal(c53)),
  "1.00000000000000",
);
assert.equal(
  flint.realToString(flint.complexImag(c53)),
  "2.00000000000000",
);
assert.equal(
  flint.complexToString(c53),
  "1.00000000000000 + 2.00000000000000*I",
);
assert.equal(
  flint.complexToString(flint.complexPowInt(c53, -2n)),
  "-0.120000000000000 - 0.160000000000000*I",
);
assert.equal(
  flint.complexToString(flint.complexEi(c53)),
  "1.04216770816494 + 3.70150142593787*I",
);
{
  const one = flint.realFromBigInt(1n, 250);
  const exactOne = flint.complexFromReals(
    one,
    flint.realFromBigInt(0n, 250),
  );
  assert.equal(
    flint.complexToString(flint.complexBesselI(exactOne, exactOne)),
    "0.56515910399248502720769602760986330732889962162109200948029448947925564096",
  );
}
assert.deepEqual(
  flint.zetaZeros(3, 53).map((value) => value.toFixed(12)),
  ["14.134725141735", "21.022039638772", "25.010857580146"],
);

const algebraicMatrix = flint.qqbarMatrix(
  2,
  2,
  [algebraicSqrtTwo, flint.qqbarFromRational(1n, 1n),
    flint.qqbarFromRational(0n, 1n), flint.qqbarNeg(algebraicSqrtTwo)],
  true,
);
assert.equal(
  flint.qqbarToString(flint.matrixDet(algebraicMatrix), 16),
  "-2",
);
assert.equal(flint.matrixRank(algebraicMatrix), 2);
assert.equal(
  flint.matrixEqual(
    flint.matrixMul(
      flint.matrixInverse(algebraicMatrix),
      algebraicMatrix,
    ),
    flint.qqbarMatrix(
      2,
      2,
      [flint.qqbarFromRational(1n, 1n),
        flint.qqbarFromRational(0n, 1n),
        flint.qqbarFromRational(0n, 1n),
        flint.qqbarFromRational(1n, 1n)],
      true,
    ),
  ),
  true,
);

const integerMatrix = flint.zzMatrix(2, 2, [1n, 2n, 3n, 4n]);
assert.equal(flint.matrixEntry(integerMatrix, 0, 1), 2n);
assert.equal(flint.matrixDet(integerMatrix), -2n);
assert.equal(flint.matrixRank(integerMatrix), 2);
const integerRref = flint.matrixRref(integerMatrix);
assert.deepEqual(
  flint.matrixEntry(integerRref, 0, 0),
  { numerator: 1n, denominator: 1n },
);
assert.deepEqual(
  flint.matrixEntry(integerRref, 1, 1),
  { numerator: 1n, denominator: 1n },
);
const integerHermite = flint.matrixHermite(integerMatrix);
assert.deepEqual(
  [0, 1, 2, 3].map((index) =>
    flint.matrixEntry(
      integerHermite,
      Math.floor(index / 2),
      index % 2,
    ),
  ),
  [1n, 0n, 0n, 2n],
);
const [integerHermiteWithTransform, integerHermiteTransform] =
  flint.matrixHermiteTransform(integerMatrix);
assert.equal(
  flint.matrixEqual(
    flint.matrixMul(integerHermiteTransform, integerMatrix),
    integerHermiteWithTransform,
  ),
  true,
);
const [integerSmith, integerSmithLeft, integerSmithRight] =
  flint.matrixSmith(integerMatrix);
assert.deepEqual(
  [0, 1, 2, 3].map((index) =>
    flint.matrixEntry(
      integerSmith,
      Math.floor(index / 2),
      index % 2,
    ),
  ),
  [1n, 0n, 0n, 2n],
);
assert.equal(
  flint.matrixEqual(
    flint.matrixMul(
      flint.matrixMul(integerSmithLeft, integerMatrix),
      integerSmithRight,
    ),
    integerSmith,
  ),
  true,
);
assert.deepEqual(
  flint.matrixCharpoly(integerMatrix),
  [-2n, -5n, 1n],
);
const dependentMatrix = flint.zzMatrix(
  2,
  3,
  [1n, 2n, 3n, 2n, 4n, 6n],
);
const integerKernel = flint.matrixRightKernel(dependentMatrix);
assert.deepEqual(
  Array.from({ length: 6 }, (_, index) =>
    flint.matrixEntry(
      integerKernel,
      Math.floor(index / 3),
      index % 3,
    ),
  ),
  [1n, 1n, -1n, 0n, 3n, -2n],
);
const integerSquare = flint.matrixMul(integerMatrix, integerMatrix);
assert.deepEqual(
  [0, 1, 2, 3].map((index) =>
    flint.matrixEntry(
      integerSquare,
      Math.floor(index / 2),
      index % 2,
    ),
  ),
  [7n, 10n, 15n, 22n],
);
const rationalInverse = flint.matrixInverse(integerMatrix);
assert.deepEqual(
  [0, 1, 2, 3].map((index) =>
    flint.matrixEntry(
      rationalInverse,
      Math.floor(index / 2),
      index % 2,
    ),
  ),
  [
    { numerator: -2n, denominator: 1n },
    { numerator: 1n, denominator: 1n },
    { numerator: 3n, denominator: 2n },
    { numerator: -1n, denominator: 2n },
  ],
);
assert.throws(
  () => flint.matrixInverse(flint.zzMatrix(2, 2, [1n, 2n, 2n, 4n])),
  /singular/,
);

assert.deepEqual(
  flint.matrixExactEigenvalues(
    flint.zzMatrix(2, 2, [0n, 4n, -1n, 0n]),
  ).map((value) => flint.qqbarToString(value, 16)),
  ["-2*I", "2*I"],
);
assert.deepEqual(
  flint.matrixExactEigenvalues(
    flint.qqMatrix(2, 2, [
      [1n, 1n],
      [3n, 1n],
      [3n, 1n],
      [1n, 1n],
    ]),
  ).map((value) => flint.qqbarToString(value, 16)),
  ["4", "-2"],
);

const approximateComplex = (real, imaginary = 0) =>
  flint.complexFromReals(
    flint.realFromString(String(real), 80),
    flint.realFromString(String(imaginary), 80),
  );
const approximateMatrix = flint.acbMatrix(
  2,
  2,
  [
    approximateComplex(1.2),
    approximateComplex(0, 1),
    approximateComplex(2),
    approximateComplex(3),
  ],
  80,
);
const approximateEigensystem =
  flint.matrixApproxEigensystem(approximateMatrix);
const complexDoublePair = (value) => [
  flint.complexRealDouble(value),
  flint.complexImagDouble(value),
];
const approximatelyEqual = (actual, expected, tolerance = 1e-14) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`,
  );
};
const expectedApproximateEigenvalues = [
  [0.8818456983293743, -0.8209140653434133],
  [3.3181543016706256, 0.8209140653434133],
];
approximateEigensystem.values.forEach((value, index) => {
  const actual = complexDoublePair(value);
  approximatelyEqual(actual[0], expectedApproximateEigenvalues[index][0]);
  approximatelyEqual(actual[1], expectedApproximateEigenvalues[index][1]);
});
for (const vectors of [
  approximateEigensystem.leftVectors,
  approximateEigensystem.rightVectors,
]) {
  assert.equal(vectors.length, 2);
  for (const vector of vectors) {
    approximatelyEqual(
      vector.reduce((norm, value) => {
        const [real, imaginary] = complexDoublePair(value);
        return norm + real * real + imaginary * imaginary;
      }, 0),
      1,
    );
  }
}

const finiteMatrix = flint.nmodMatrix(
  2, 2, [1n, 2n, 3n, 4n], 5n);
const finiteRandom = flint.nmodMatrixRandom(3, 4, 7n, 2026n, 31415n);
assert.equal(
  flint.matrixEqual(
    finiteRandom,
    flint.nmodMatrixRandom(3, 4, 7n, 2026n, 31415n),
  ),
  true,
);
assert.equal(
  [0, 1, 2].every((row) =>
    [0, 1, 2, 3].every((col) => {
      const entry = flint.matrixEntry(finiteRandom, row, col);
      return 0n <= entry && entry < 7n;
    }),
  ),
  true,
);
assert.equal(flint.matrixEntry(finiteMatrix, 1, 0), 3n);

// Exercise the CBLAS implementation directly as well as FLINT's ordinary
// dispatcher. This makes a build that silently drops BLAS support fail on
// every supported native platform instead of merely becoming much slower.
const finiteBlasLeft = flint.nmodMatrixRandom(
  128, 128, 7n, 20260802n, 1n,
);
const finiteBlasRight = flint.nmodMatrixRandom(
  128, 128, 7n, 20260802n, 2n,
);
const finiteBlasProduct = flint.matrixMulBlas(
  finiteBlasLeft, finiteBlasRight,
);
assert.notEqual(finiteBlasProduct, null);
assert.equal(
  flint.matrixEqual(
    finiteBlasProduct,
    flint.matrixMul(finiteBlasLeft, finiteBlasRight),
  ),
  true,
);
assert.equal(flint.matrixDet(finiteMatrix), 3n);
assert.equal(flint.matrixRank(finiteMatrix), 2);
assert.deepEqual(flint.matrixCharpoly(finiteMatrix), [3n, 0n, 1n]);
assert.deepEqual(flint.matrixMinpoly(finiteMatrix), [3n, 0n, 1n]);
const finiteInverse = flint.matrixInverse(finiteMatrix);
assert.deepEqual(
  [0, 1, 2, 3].map((index) =>
    flint.matrixEntry(
      finiteInverse,
      Math.floor(index / 2),
      index % 2,
    ),
  ),
  [3n, 1n, 4n, 2n],
);
assert.equal(
  flint.matrixEqual(
    flint.matrixMul(finiteMatrix, finiteInverse),
    flint.nmodMatrix(2, 2, [1n, 0n, 0n, 1n], 5n),
  ),
  true,
);
const finiteDependent = flint.nmodMatrix(
  2, 3, [1n, 2n, 3n, 2n, 4n, 1n], 5n);
const finiteKernel = flint.matrixRightKernel(finiteDependent);
assert.equal(flint.matrixRank(finiteKernel), 2);
assert.equal(
  flint.matrixRank(
    flint.matrixMul(
      finiteDependent,
      flint.matrixTranspose(finiteKernel),
    ),
  ),
  0,
);

const residueMatrix = flint.zmodMatrix(
  2, 2, [2n, 3n, 3n, 2n], 36n);
const packedFinite = flint.matrixExportPacked(
  flint.nmodMatrix(2, 3, [1n, 2n, 250n, 3n, 4n, 5n], 251n),
  1,
);
assert.deepEqual(Array.from(packedFinite), [1, 2, 250, 3, 4, 5]);
assert.equal(
  flint.matrixEqual(
    flint.nmodMatrixPacked(2, 3, packedFinite, 1, 251n),
    flint.nmodMatrix(2, 3, [1n, 2n, 250n, 3n, 4n, 5n], 251n),
  ),
  true,
);
const packedResidues = new Uint8Array([1, 0, 255, 1, 0, 2, 255, 2]);
const packedResidueMatrix = flint.zmodMatrixPacked(
  2, 2, packedResidues, 2, 1000n);
assert.deepEqual(
  Array.from(flint.matrixExportPacked(packedResidueMatrix, 2)),
  Array.from(packedResidues),
);
const packedIntegerSource = flint.zzMatrix(2, 3, [
  0n,
  1n,
  -1n,
  2n ** 80n + 7n,
  -(2n ** 130n + 9n),
  255n,
]);
const packedIntegerBytes = flint.zzMatrixExportPacked(packedIntegerSource);
assert.equal(
  flint.matrixEqual(
    flint.zzMatrixPacked(2, 3, packedIntegerBytes),
    packedIntegerSource,
  ),
  true,
);
const packedRationalSource = flint.qqMatrix(2, 3, [
  [0n, 1n],
  [1n, 3n],
  [-1n, 5n],
  [2n ** 80n + 7n, 11n],
  [-(2n ** 130n + 9n), 37n],
  [255n, 257n],
]);
const packedRationalBytes = flint.qqMatrixExportPacked(packedRationalSource);
assert.equal(
  flint.matrixEqual(
    flint.qqMatrixPacked(2, 3, packedRationalBytes),
    packedRationalSource,
  ),
  true,
);
assert.throws(
  () => flint.qqMatrixPacked(
    2, 3, packedRationalBytes.subarray(0, packedRationalBytes.length - 1)),
  /invalid packed rational matrix representation/,
);
assert.equal(
  flint.matrixEqual(
    flint.zmodMatrixRandom(2, 3, 36n, 9n, 10n),
    flint.zmodMatrixRandom(2, 3, 36n, 9n, 10n),
  ),
  true,
);
assert.equal(flint.matrixDet(residueMatrix), 31n);
assert.deepEqual(
  flint.matrixCharpoly(residueMatrix), [31n, 32n, 1n]);
const residueInverse = flint.matrixInverse(residueMatrix);
assert.equal(
  flint.matrixEqual(
    flint.matrixMul(residueMatrix, residueInverse),
    flint.zmodMatrix(2, 2, [1n, 0n, 0n, 1n], 36n),
  ),
  true,
);
const residueHowellSource = flint.zmodMatrix(
  3,
  4,
  [1n, 2n, 3n, 4n, 0n, 5n, 5n, 6n, 0n, 0n, 0n, 25n],
  625n,
);
const residueHowell = flint.matrixHowell(residueHowellSource);
assert.equal(flint.matrixRank(residueHowellSource), 1);
assert.deepEqual(
  [0, 1, 2, 3].map((row) =>
    [0, 1, 2, 3].map((col) =>
      flint.matrixEntry(residueHowell, row, col))),
  [
    [1n, 2n, 3n, 4n],
    [0n, 5n, 5n, 6n],
    [0n, 0n, 0n, 25n],
    [0n, 0n, 0n, 0n],
  ],
);
const residueKernel = flint.matrixRightKernel(residueHowellSource);
assert.equal(
  flint.matrixEqual(
    flint.matrixMul(
      residueHowellSource,
      flint.matrixTranspose(residueKernel),
    ),
    flint.zmodMatrix(3, 3, Array(9).fill(0n), 625n),
  ),
  true,
);

const packedProduct = new BigUint64Array(5).fill(99n);
const packedFiniteSource = BigUint64Array.from([1n, 2n, 3n, 4n]);
assert.equal(flint.ffiNmodMatDet(
  packedFiniteSource, 2n, 5n,
), 3n);
const packedCharpoly = new BigUint64Array(3).fill(99n);
assert.equal(flint.ffiNmodMatCharpoly(
  packedCharpoly, packedFiniteSource, 3n, 4n, 2n, 5n,
), true);
assert.deepEqual(Array.from(packedCharpoly), [3n, 0n, 1n]);
const packedMinpoly = new BigUint64Array(3).fill(99n);
assert.equal(flint.ffiNmodMatMinpoly(
  packedMinpoly, packedFiniteSource, 3n, 4n, 2n, 5n,
), true);
assert.deepEqual(Array.from(packedMinpoly), [3n, 0n, 1n]);
assert.equal(flint.ffiNmodPolyMul(
  packedProduct,
  BigUint64Array.from([1n, 2n, 3n]),
  BigUint64Array.from([4n, 5n, 6n]),
  5n, 3n, 3n, 101n,
), true);
assert.deepEqual(Array.from(packedProduct), [4n, 13n, 28n, 27n, 18n]);
const rejectedProduct = BigUint64Array.from([91n, 92n, 93n, 94n]);
assert.throws(() => flint.ffiNmodPolyMul(
  rejectedProduct,
  BigUint64Array.from([1n, 2n, 3n]),
  BigUint64Array.from([4n, 5n, 6n]),
  4n, 3n, 3n, 101n,
), /invalid packed polynomial multiplication/);
assert.deepEqual(Array.from(rejectedProduct), [91n, 92n, 93n, 94n]);

});

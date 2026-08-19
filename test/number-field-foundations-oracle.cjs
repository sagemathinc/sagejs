"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const fixturePath = join(
  root,
  "test",
  "fixtures",
  "number-field-foundations",
  "corpus.json",
);

function gcd(left, right) {
  left = left < 0n ? -left : left;
  right = right < 0n ? -right : right;
  while (right !== 0n) [left, right] = [right, left % right];
  return left;
}

function fraction(numerator, denominator = 1n) {
  assert.notEqual(denominator, 0n);
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const common = gcd(numerator, denominator);
  return [numerator / common, denominator / common];
}

function add([an, ad], [bn, bd]) {
  return fraction(an * bd + bn * ad, ad * bd);
}

function multiply([an, ad], [bn, bd]) {
  return fraction(an * bn, ad * bd);
}

function determinant(rows) {
  const size = rows.length;
  if (size === 0) return [1n, 1n];
  if (size === 1) return rows[0][0];
  let answer = [0n, 1n];
  for (let column = 0; column < size; column += 1) {
    const minor = rows
      .slice(1)
      .map((row) => row.filter((_, index) => index !== column));
    let term = multiply(rows[0][column], determinant(minor));
    if (column % 2 === 1) term = [-term[0], term[1]];
    answer = add(answer, term);
  }
  return answer;
}

function parseRational(value) {
  const [numerator, denominator = "1"] = value.split("/");
  return fraction(BigInt(numerator), BigInt(denominator));
}

function latticeDeterminant(lattice) {
  const denominator = BigInt(lattice.denominator);
  const rows = lattice.numerator.map((row) =>
    row.map((value) => fraction(BigInt(value), denominator)),
  );
  return determinant(rows);
}

function integerMatrixDeterminant(rows) {
  return determinant(
    rows.map((row) => row.map((value) => [BigInt(value), 1n])),
  )[0];
}

function power(base, exponent) {
  let result = 1n;
  for (let index = 0; index < exponent; index += 1) result *= base;
  return result;
}

function isPrime(value) {
  if (value < 2n) return false;
  for (let divisor = 2n; divisor * divisor <= value; divisor += 1n) {
    if (value % divisor === 0n) return false;
  }
  return true;
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function corpusDigest(corpus) {
  const copy = { ...corpus };
  delete copy.contentSha256;
  return createHash("sha256")
    .update("sagejs-number-field-foundations-oracle-v1\n")
    .update(canonicalJson(copy), "ascii")
    .digest("hex");
}

function localCoefficients(decomposition, bound) {
  const coefficients = Array(bound + 1).fill(0n);
  coefficients[0] = 1n;
  for (const factor of decomposition.factors) {
    for (let exponent = factor.f; exponent <= bound; exponent += 1) {
      coefficients[exponent] += coefficients[exponent - factor.f];
    }
  }
  return coefficients;
}

function valuation(value, prime) {
  let exponent = 0;
  while (value % prime === 0) {
    value /= prime;
    exponent += 1;
  }
  return [exponent, value];
}

function nearlyEqual(left, right, relative = 2e-12, absolute = 2e-14) {
  return Math.abs(left - right) <=
    Math.max(absolute, relative * Math.max(Math.abs(left), Math.abs(right)));
}

function validateField(field) {
  assert.match(field.id, /^[a-z][a-z0-9-]*$/);
  assert.equal(field.polynomial.coefficientOrder, "ascending");
  assert.equal(field.polynomial.coefficients.length, field.degree + 1);
  assert.equal(field.polynomial.coefficients.at(-1), "1");
  assert.equal(field.signature[0] + 2 * field.signature[1], field.degree);

  const equationDiscriminant = BigInt(field.equationDiscriminant);
  const fieldDiscriminant = BigInt(field.fieldDiscriminant);
  const index = BigInt(field.equationOrderIndex);
  assert.equal(equationDiscriminant, fieldDiscriminant * index * index);

  const basis = field.maximalOrderBasisRelativeToPowerBasis;
  assert.equal(basis.numerator.length, field.degree);
  assert.ok(basis.numerator.every((row) => row.length === field.degree));
  const [basisNumerator, basisDenominator] = latticeDeterminant(basis);
  assert.equal(
    (basisNumerator < 0n ? -basisNumerator : basisNumerator) * index,
    basisDenominator,
    `${field.id}: maximal-order basis determinant is 1/index`,
  );

  const decompositionByPrime = new Map();
  for (const decomposition of field.primeDecompositions) {
    const prime = BigInt(decomposition.p);
    assert.ok(isPrime(prime), `${field.id}: ${prime} is prime`);
    assert.equal(decomposition.degreeSum, field.degree);
    let productNorm = 1n;
    let degreeSum = 0;
    for (const factor of decomposition.factors) {
      assert.ok(Number.isInteger(factor.e) && factor.e > 0);
      assert.ok(Number.isInteger(factor.f) && factor.f > 0);
      assert.equal(BigInt(factor.norm), power(prime, factor.f));
      degreeSum += factor.e * factor.f;
      productNorm *= power(BigInt(factor.norm), factor.e);

      const hnf = factor.hnfRelativeToMaximalOrder;
      assert.equal(hnf.length, field.degree);
      assert.ok(hnf.every((row) => row.length === field.degree));
      const hnfDeterminant = integerMatrixDeterminant(hnf);
      assert.equal(
        hnfDeterminant < 0n ? -hnfDeterminant : hnfDeterminant,
        BigInt(factor.norm),
      );

      const powerBasis = factor.basisRelativeToPowerBasis;
      const [idealNumerator, idealDenominator] = latticeDeterminant(powerBasis);
      const absoluteNumerator = idealNumerator < 0n ? -idealNumerator : idealNumerator;
      assert.equal(
        absoluteNumerator * index,
        BigInt(factor.norm) * idealDenominator,
        `${field.id}: prime-ideal lattice determinant gives its norm`,
      );
    }
    assert.equal(degreeSum, field.degree);
    assert.equal(productNorm, power(prime, field.degree));
    decompositionByPrime.set(Number(prime), decomposition);
  }
  if (field.tags.includes("nonmonogenic-field")) {
    const factorsAtTwo = decompositionByPrime.get(2).factors;
    assert.equal(factorsAtTwo.length, 3);
    assert.ok(factorsAtTwo.every((factor) => factor.e === 1 && factor.f === 1));
    // F_2 has only two monic linear polynomials, so a monogenic integral
    // presentation cannot yield three distinct unramified degree-one primes.
  }

  const coefficients = field.zetaCoefficients.map(BigInt);
  assert.equal(coefficients.length, 64);
  assert.equal(coefficients[0], 1n);
  assert.ok(coefficients.every((value) => value >= 0n));

  const localByPrime = new Map();
  for (const [prime, decomposition] of decompositionByPrime) {
    localByPrime.set(
      prime,
      localCoefficients(decomposition, Math.floor(Math.log(64) / Math.log(prime))),
    );
  }
  for (let integer = 1; integer <= coefficients.length; integer += 1) {
    let remaining = integer;
    let expected = 1n;
    for (const [prime, local] of localByPrime) {
      if (prime > remaining) continue;
      const [exponent, quotient] = valuation(remaining, prime);
      if (exponent > 0) {
        expected *= local[exponent];
        remaining = quotient;
      }
    }
    assert.equal(remaining, 1, `${field.id}: splitting data cover ${integer}`);
    assert.equal(coefficients[integer - 1], expected, `${field.id}: a_${integer}`);
  }

  const invariants = field.globalInvariants;
  assert.equal(invariants.unitRank, field.signature[0] + field.signature[1] - 1);
  assert.equal(invariants.unitGenerators.length, invariants.unitRank + 1);
  assert.ok(invariants.unitGenerators.every((row) => row.length === field.degree));
  assert.ok(BigInt(invariants.rootsOfUnity) >= 2n);
  let classNumber = 1n;
  for (const invariant of invariants.classGroupInvariants) classNumber *= BigInt(invariant);
  assert.equal(classNumber, BigInt(invariants.classNumber));
  assert.equal(
    invariants.classGroupGeneratorIdeals.length,
    invariants.classGroupInvariants.length,
  );
  if (invariants.unitRank === 0) {
    assert.ok(nearlyEqual(Number(invariants.regulator53), 1));
  }

  const expectedBits = field.id === "qq" || field.id === "imaginary-d23" || field.id === "cubic-mixed"
    ? [53, 100, 200, 512]
    : [53, 100, 200];
  assert.deepEqual(field.analytic.map((record) => record.bits), expectedBits);
  for (const analytic of field.analytic) {
    assert.ok(Number(analytic.residueAtOne) > 0);
    assert.ok(Number.isFinite(Number(analytic.finitePartAtOne)));
    assert.deepEqual(
      analytic.points.map((row) => row.label),
      ["right-half-plane", "critical-region", "left-half-plane"],
    );
    for (const point of analytic.points) {
      for (const key of ["s", "value", "derivative1", "derivative2", "completedValue", "xiValue"]) {
        assert.ok(Number.isFinite(Number(point[key].real)));
        assert.ok(Number.isFinite(Number(point[key].imag)));
      }
      const sr = Number(point.s.real);
      const si = Number(point.s.imag);
      const cr = Number(point.completedValue.real);
      const ci = Number(point.completedValue.imag);
      const multiplierReal = sr * (sr - 1) - si * si;
      const multiplierImag = si * (2 * sr - 1);
      const expectedXiReal = multiplierReal * cr - multiplierImag * ci;
      const expectedXiImag = multiplierReal * ci + multiplierImag * cr;
      assert.ok(nearlyEqual(Number(point.xiValue.real), expectedXiReal));
      assert.ok(nearlyEqual(Number(point.xiValue.imag), expectedXiImag));
    }

    const critical = analytic.points[1].completedValue;
    const criticalScale = Math.max(1, Math.abs(Number(critical.real)));
    const criticalTolerance = criticalScale * 2 ** (-Math.min(analytic.bits * 0.8, 500));
    assert.ok(
      Math.abs(Number(critical.imag)) <= criticalTolerance,
      `${field.id}: completed zeta is real on the critical line`,
    );
  }

  const lowPrecisionResidue = Number(field.analytic[0].residueAtOne);
  const r1 = field.signature[0];
  const r2 = field.signature[1];
  const formulaResidue =
    2 ** r1 *
    (2 * Math.PI) ** r2 *
    Number(invariants.classNumber) *
    Number(invariants.regulator53) /
    (Number(invariants.rootsOfUnity) * Math.sqrt(Math.abs(Number(field.fieldDiscriminant))));
  assert.ok(
    nearlyEqual(lowPrecisionResidue, formulaResidue, 2e-13, 2e-15),
    `${field.id}: analytic class-number formula`,
  );
}

test("number-field foundations corpus has a stable schema and digest", () => {
  const corpus = JSON.parse(readFileSync(fixturePath, "utf8"));
  assert.equal(corpus.schema, "sagejs.number-fields/foundations-oracle-v1");
  assert.equal(corpus.schemaVersion, 1);
  assert.equal(corpus.contentSha256, corpusDigest(corpus));
  assert.deepEqual(corpus.normalization, {
    gammaR: "pi^(-s/2)*Gamma(s/2)",
    gammaC: "2*(2*pi)^(-s)*Gamma(s)",
    completed: "abs(D_K)^(s/2)*GammaR(s)^r1*GammaC(s)^r2*zeta_K(s)",
    functionalEquation: "Lambda_K(s)=Lambda_K(1-s)",
    xi: "s*(s-1)*Lambda_K(s)",
    regulatorRankZero: "1",
  });
  assert.equal(corpus.fields.length, 23);
  assert.deepEqual(
    [...new Set(corpus.fields.map((field) => field.degree))].sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6],
  );
  assert.ok(corpus.fields.some((field) => field.tags.includes("noncyclic-class-group")));
  assert.ok(corpus.fields.some((field) => field.tags.includes("nonmaximal-equation-order")));
  assert.ok(corpus.fields.some((field) => field.tags.includes("nonmonogenic-field")));
  assert.ok(corpus.fields.some((field) => field.tags.includes("large-class-number")));
  assert.ok(corpus.fields.some((field) => field.globalInvariants.unitRank === 3));
  for (const character of corpus.kroneckerCharacters) {
    const discriminant = BigInt(character.discriminant);
    assert.equal(BigInt(character.modulus), discriminant < 0n ? -discriminant : discriminant);
    assert.equal(character.valuesFromZeroThrough64.length, 65);
    assert.ok(character.valuesFromZeroThrough64.every((value) => [-1, 0, 1].includes(value)));
    for (let denominator = 1; denominator <= 64; denominator += 1) {
      if (gcd(discriminant, BigInt(denominator)) > 1n) {
        assert.equal(
          character.valuesFromZeroThrough64[denominator],
          0,
          `kronecker(${discriminant}, ${denominator}) vanishes when non-coprime`,
        );
      }
    }
  }
  const byDiscriminant = new Map(
    corpus.kroneckerCharacters.map((character) => [character.discriminant, character]),
  );
  assert.equal(byDiscriminant.get("-8").valuesFromZeroThrough64[4], 0);
  assert.equal(byDiscriminant.get("-20").valuesFromZeroThrough64[4], 0);
});

test("number-field foundations exact and analytic records are structurally valid", () => {
  const corpus = JSON.parse(readFileSync(fixturePath, "utf8"));
  for (const field of corpus.fields) validateField(field);
});

test("isomorphic presentations have invariant oracle data", () => {
  const corpus = JSON.parse(readFileSync(fixturePath, "utf8"));
  const byId = new Map(corpus.fields.map((field) => [field.id, field]));
  for (const isomorphism of corpus.isomorphisms) {
    const source = byId.get(isomorphism.from);
    const target = byId.get(isomorphism.to);
    assert.ok(source && target);
    assert.equal(source.fieldDiscriminant, target.fieldDiscriminant);
    assert.deepEqual(source.signature, target.signature);
    assert.deepEqual(source.zetaCoefficients, target.zetaCoefficients);
    assert.deepEqual(source.globalInvariants.classGroupInvariants, target.globalInvariants.classGroupInvariants);
    assert.equal(source.globalInvariants.regulator53, target.globalInvariants.regulator53);
    const targetAnalytic = new Map(target.analytic.map((row) => [row.bits, row]));
    for (const sourcePrecision of source.analytic) {
      const targetPrecision = targetAnalytic.get(sourcePrecision.bits);
      if (!targetPrecision) continue;
      for (let point = 0; point < sourcePrecision.points.length; point += 1) {
        const left = sourcePrecision.points[point].value;
        const right = targetPrecision.points[point].value;
        assert.ok(nearlyEqual(Number(left.real), Number(right.real), 2e-13));
        assert.ok(nearlyEqual(Number(left.imag), Number(right.imag), 2e-13));
      }
    }
  }
});

test("independent Magma snapshot agrees with exact Sage/PARI records", () => {
  const corpus = JSON.parse(readFileSync(fixturePath, "utf8"));
  const independent = JSON.parse(
    readFileSync(
      join(
        root,
        "test",
        "fixtures",
        "number-field-foundations",
        "independent-oracles.json",
      ),
      "utf8",
    ),
  );
  assert.equal(independent.schema, "sagejs.number-fields/independent-oracles-v1");
  assert.equal(independent.source.system, "Magma");
  assert.equal(independent.fields.length, 22);
  const byId = new Map(corpus.fields.map((field) => [field.id, field]));
  for (const record of independent.fields) {
    const expected = byId.get(record.id);
    assert.ok(expected);
    assert.equal(record.degree, expected.degree);
    assert.deepEqual(record.signature, expected.signature);
    assert.equal(record.fieldDiscriminant, expected.fieldDiscriminant);
    assert.equal(record.classNumber, expected.globalInvariants.classNumber);
    assert.equal(record.rootsOfUnity, expected.globalInvariants.rootsOfUnity);
    const expectedByPrime = new Map(expected.primeDecompositions.map((row) => [row.p, row]));
    for (const decomposition of record.primeDecompositions) {
      const factors = expectedByPrime
        .get(decomposition.p)
        .factors.map(({ e, f, norm }) => ({ e, f, norm }))
        .sort(
          (left, right) =>
            left.f - right.f || left.e - right.e || left.norm.localeCompare(right.norm),
        );
      assert.deepEqual(decomposition.factors, factors);
    }
  }
});

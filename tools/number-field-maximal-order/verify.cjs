"use strict";

const {
  abs,
  add,
  canonicalBasis,
  determinant,
  inverse,
  isInteger,
  isZero,
  multiply,
  parseRational,
  rational,
  rowTimesMatrix,
  subtract,
} = require("./exact.cjs");

function multiplyModulo(left, right, coefficients) {
  const degree = coefficients.length - 1;
  if (String(coefficients[degree]) !== "1") {
    throw new TypeError("verification requires a monic integral polynomial");
  }
  const product = Array.from({ length: degree * 2 - 1 }, () => rational(0n));
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      product[i + j] = add(product[i + j], multiply(left[i], right[j]));
    }
  }
  for (let power = product.length - 1; power >= degree; power -= 1) {
    const leading = product[power];
    if (isZero(leading)) continue;
    for (let index = 0; index < degree; index += 1) {
      product[power - degree + index] = subtract(
        product[power - degree + index],
        multiply(leading, coefficients[index]),
      );
    }
  }
  return product.slice(0, degree);
}

function verifyOracleResult(caseSpec, result) {
  const errors = [];
  const coefficients = caseSpec.polynomial.coefficients.map(String);
  const degree = coefficients.length - 1;
  if (result.irreducible_verified !== true) {
    errors.push("irreducibility was not verified outside the timed maximal-order region");
  }
  if (!Array.isArray(result.basis) || result.basis.length !== degree) {
    errors.push(`basis must have ${degree} rows`);
    return { verified: false, errors };
  }
  let basis;
  try {
    basis = result.basis.map((row) => {
      if (!Array.isArray(row) || row.length !== degree) {
        throw new TypeError(`basis rows must have ${degree} entries`);
      }
      return row.map(parseRational);
    });
  } catch (error) {
    errors.push(error.message);
    return { verified: false, errors };
  }

  let basisInverse;
  let basisDeterminant;
  try {
    basisDeterminant = determinant(basis);
    if (basisDeterminant.n === 0n) throw new RangeError("basis is singular");
    basisInverse = inverse(basis);
  } catch (error) {
    errors.push(error.message);
    return { verified: false, errors };
  }

  // The equation order has the identity power basis. It is contained in the
  // reported order exactly when every row of B^-1 is integral.
  for (const row of basisInverse) {
    if (row.some((entry) => !isInteger(entry))) {
      errors.push("basis does not contain the equation order");
      break;
    }
  }
  if (basisInverse[0].some((entry) => !isInteger(entry))) {
    errors.push("basis does not contain 1 integrally");
  }

  outer: for (let left = 0; left < degree; left += 1) {
    for (let right = left; right < degree; right += 1) {
      const product = multiplyModulo(basis[left], basis[right], coefficients);
      const coordinates = rowTimesMatrix(product, basisInverse);
      if (coordinates.some((entry) => !isInteger(entry))) {
        errors.push(`basis is not closed under multiplication (${left}, ${right})`);
        break outer;
      }
    }
  }

  const determinantAbs = rational(abs(basisDeterminant.n), basisDeterminant.d);
  let index = null;
  if (determinantAbs.n === 0n || determinantAbs.d % determinantAbs.n !== 0n) {
    errors.push("basis determinant does not define an integral equation-order index");
  } else {
    index = determinantAbs.d / determinantAbs.n;
  }

  let fieldDiscriminant;
  try {
    fieldDiscriminant = BigInt(result.field_discriminant);
  } catch {
    errors.push("field discriminant is missing or invalid");
  }
  const polynomialDiscriminant = BigInt(caseSpec.expected.polynomial_discriminant);
  if (index !== null && fieldDiscriminant !== undefined) {
    if (fieldDiscriminant * index * index !== polynomialDiscriminant) {
      errors.push("polynomial discriminant, index, and field discriminant are inconsistent");
    }
  }
  if (
    fieldDiscriminant !== undefined &&
    String(fieldDiscriminant) !== String(caseSpec.expected.field_discriminant)
  ) {
    errors.push("field discriminant disagrees with the frozen certificate");
  }
  if (index !== null && String(index) !== String(caseSpec.expected.equation_order_index)) {
    errors.push("equation-order index disagrees with the frozen certificate");
  }

  let canonical;
  try {
    canonical = canonicalBasis(basis);
    if (caseSpec.expected.canonical_basis_digest) {
      if (canonical.digest !== caseSpec.expected.canonical_basis_digest) {
        errors.push("canonical basis lattice disagrees with the frozen certificate");
      }
    }
  } catch (error) {
    errors.push(`basis normalization failed: ${error.message}`);
  }

  return {
    verified: errors.length === 0,
    errors,
    degree,
    equation_order_index: index === null ? null : String(index),
    field_discriminant: fieldDiscriminant === undefined ? null : String(fieldDiscriminant),
    canonical_basis: canonical,
    basis_size_bytes: Buffer.byteLength(JSON.stringify(result.basis)),
    checks: {
      nonsingular: basisDeterminant.n !== 0n,
      contains_one: !errors.some((error) => error.includes("contain 1")),
      contains_equation_order: !errors.some((error) => error.includes("equation order")),
      multiplication_closed: !errors.some((error) => error.includes("closed under multiplication")),
      discriminant_index_identity: !errors.some((error) => error.includes("inconsistent")),
      frozen_certificate: !errors.some((error) => error.includes("frozen certificate")),
    },
  };
}

module.exports = { multiplyModulo, verifyOracleResult };

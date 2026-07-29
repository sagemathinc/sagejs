/*
 * Exact portable polynomial operations for the browser evaluator.
 *
 * These cover the small construction/arithmetic surface used by Sage.js
 * polynomial parents. Advanced algorithms remain the responsibility of the
 * FLINT WASM ABI.
 */

const POLYNOMIAL = Symbol("sagejs portable polynomial");

function gcd(left, right) {
  left = left < 0n ? -left : left;
  right = right < 0n ? -right : right;
  while (right !== 0n) {
    [left, right] = [right, left % right];
  }
  return left;
}

function rational(numerator, denominator = 1n) {
  numerator = BigInt(numerator);
  denominator = BigInt(denominator);
  if (denominator === 0n) {
    throw new RangeError("rational denominator must not be zero");
  }
  if (numerator === 0n) {
    return Object.freeze({ numerator: 0n, denominator: 1n });
  }
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const divisor = gcd(numerator, denominator);
  return Object.freeze({
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  });
}

function mod(value, modulus) {
  value = BigInt(value) % modulus;
  return value < 0n ? value + modulus : value;
}

function zeroCoefficient(kind) {
  return kind === "QQ" ? rational(0n) : 0n;
}

function isZero(kind, value) {
  return kind === "QQ" ? value.numerator === 0n : value === 0n;
}

function normalizeCoefficients(kind, coefficients) {
  const result = coefficients.slice();
  while (
    result.length > 0 &&
    isZero(kind, result[result.length - 1])
  ) {
    result.pop();
  }
  return result;
}

function polynomial(kind, coefficients, modulus = undefined) {
  const normalized = normalizeCoefficients(kind, coefficients);
  return Object.freeze({
    [POLYNOMIAL]: true,
    kind,
    modulus,
    coefficients: Object.freeze(normalized),
  });
}

function assertPolynomial(value) {
  if (!value || value[POLYNOMIAL] !== true) {
    throw new TypeError("expected a portable polynomial");
  }
  return value;
}

function assertSameParent(left, right) {
  left = assertPolynomial(left);
  right = assertPolynomial(right);
  if (
    left.kind !== right.kind ||
    left.modulus !== right.modulus
  ) {
    throw new TypeError("polynomials have incompatible coefficient rings");
  }
  return [left, right];
}

function coefficientAt(value, index) {
  return index < value.coefficients.length
    ? value.coefficients[index]
    : zeroCoefficient(value.kind);
}

function addCoefficient(kind, left, right, modulus) {
  if (kind === "QQ") {
    return rational(
      left.numerator * right.denominator +
        right.numerator * left.denominator,
      left.denominator * right.denominator,
    );
  }
  const result = left + right;
  return kind === "nmod" ? mod(result, modulus) : result;
}

function negateCoefficient(kind, value, modulus) {
  if (kind === "QQ") {
    return rational(-value.numerator, value.denominator);
  }
  return kind === "nmod" ? mod(-value, modulus) : -value;
}

function subtractCoefficient(kind, left, right, modulus) {
  return addCoefficient(
    kind,
    left,
    negateCoefficient(kind, right, modulus),
    modulus,
  );
}

function multiplyCoefficient(kind, left, right, modulus) {
  if (kind === "QQ") {
    return rational(
      left.numerator * right.numerator,
      left.denominator * right.denominator,
    );
  }
  const result = left * right;
  return kind === "nmod" ? mod(result, modulus) : result;
}

function equalCoefficient(kind, left, right) {
  return kind === "QQ"
    ? left.numerator === right.numerator &&
        left.denominator === right.denominator
    : left === right;
}

function polyAdd(left, right) {
  [left, right] = assertSameParent(left, right);
  const length = Math.max(
    left.coefficients.length,
    right.coefficients.length,
  );
  const coefficients = [];
  for (let index = 0; index < length; index += 1) {
    coefficients.push(
      addCoefficient(
        left.kind,
        coefficientAt(left, index),
        coefficientAt(right, index),
        left.modulus,
      ),
    );
  }
  return polynomial(left.kind, coefficients, left.modulus);
}

function polyNeg(value) {
  value = assertPolynomial(value);
  return polynomial(
    value.kind,
    value.coefficients.map((coefficient) =>
      negateCoefficient(value.kind, coefficient, value.modulus),
    ),
    value.modulus,
  );
}

function polySub(left, right) {
  [left, right] = assertSameParent(left, right);
  const length = Math.max(
    left.coefficients.length,
    right.coefficients.length,
  );
  const coefficients = [];
  for (let index = 0; index < length; index += 1) {
    coefficients.push(
      subtractCoefficient(
        left.kind,
        coefficientAt(left, index),
        coefficientAt(right, index),
        left.modulus,
      ),
    );
  }
  return polynomial(left.kind, coefficients, left.modulus);
}

function polyMul(left, right) {
  [left, right] = assertSameParent(left, right);
  if (
    left.coefficients.length === 0 ||
    right.coefficients.length === 0
  ) {
    return polynomial(left.kind, [], left.modulus);
  }
  const coefficients = Array.from(
    {
      length:
        left.coefficients.length + right.coefficients.length - 1,
    },
    () => zeroCoefficient(left.kind),
  );
  for (
    let leftIndex = 0;
    leftIndex < left.coefficients.length;
    leftIndex += 1
  ) {
    for (
      let rightIndex = 0;
      rightIndex < right.coefficients.length;
      rightIndex += 1
    ) {
      const index = leftIndex + rightIndex;
      coefficients[index] = addCoefficient(
        left.kind,
        coefficients[index],
        multiplyCoefficient(
          left.kind,
          left.coefficients[leftIndex],
          right.coefficients[rightIndex],
          left.modulus,
        ),
        left.modulus,
      );
    }
  }
  return polynomial(left.kind, coefficients, left.modulus);
}

function polyPow(value, exponent) {
  value = assertPolynomial(value);
  exponent = BigInt(exponent);
  if (exponent < 0n) {
    throw new RangeError("negative polynomial exponent");
  }
  let result = polynomial(
    value.kind,
    [
      value.kind === "QQ"
        ? rational(1n)
        : value.kind === "nmod"
          ? mod(1n, value.modulus)
          : 1n,
    ],
    value.modulus,
  );
  let power = value;
  while (exponent > 0n) {
    if (exponent & 1n) {
      result = polyMul(result, power);
    }
    exponent >>= 1n;
    if (exponent > 0n) {
      power = polyMul(power, power);
    }
  }
  return result;
}

function polyEqual(left, right) {
  try {
    [left, right] = assertSameParent(left, right);
  } catch {
    return false;
  }
  if (left.coefficients.length !== right.coefficients.length) {
    return false;
  }
  return left.coefficients.every((coefficient, index) =>
    equalCoefficient(left.kind, coefficient, right.coefficients[index]),
  );
}

function coefficientSign(kind, coefficient) {
  if (kind === "nmod") {
    return coefficient === 0n ? 0 : 1;
  }
  const value = kind === "QQ" ? coefficient.numerator : coefficient;
  return value < 0n ? -1 : value > 0n ? 1 : 0;
}

function absoluteCoefficient(kind, coefficient) {
  if (kind === "QQ") {
    return rational(
      coefficient.numerator < 0n
        ? -coefficient.numerator
        : coefficient.numerator,
      coefficient.denominator,
    );
  }
  return coefficient < 0n ? -coefficient : coefficient;
}

function coefficientIsOne(kind, coefficient) {
  return kind === "QQ"
    ? coefficient.numerator === 1n && coefficient.denominator === 1n
    : coefficient === 1n;
}

function coefficientText(kind, coefficient) {
  if (kind !== "QQ" || coefficient.denominator === 1n) {
    return String(
      kind === "QQ" ? coefficient.numerator : coefficient,
    );
  }
  return `${coefficient.numerator}/${coefficient.denominator}`;
}

function termText(kind, coefficient, degree, variable) {
  if (degree === 0) {
    return coefficientText(kind, coefficient);
  }
  const variableTerm = degree === 1 ? variable : `${variable}^${degree}`;
  return coefficientIsOne(kind, coefficient)
    ? variableTerm
    : `${coefficientText(kind, coefficient)}*${variableTerm}`;
}

function polyToString(value, variable) {
  value = assertPolynomial(value);
  const terms = [];
  for (
    let degree = value.coefficients.length - 1;
    degree >= 0;
    degree -= 1
  ) {
    const coefficient = value.coefficients[degree];
    const sign = coefficientSign(value.kind, coefficient);
    if (sign === 0) {
      continue;
    }
    const text = termText(
      value.kind,
      absoluteCoefficient(value.kind, coefficient),
      degree,
      variable,
    );
    if (terms.length === 0) {
      terms.push(sign < 0 ? `-${text}` : text);
    } else {
      terms.push(sign < 0 ? ` - ${text}` : ` + ${text}`);
    }
  }
  return terms.length === 0 ? "0" : terms.join("");
}

function zzPolyGen() {
  return polynomial("ZZ", [0n, 1n]);
}

function qqPolyGen() {
  return polynomial("QQ", [rational(0n), rational(1n)]);
}

function nmodPolyGen(modulus) {
  modulus = BigInt(modulus);
  return polynomial("nmod", [0n, mod(1n, modulus)], modulus);
}

function zzPolyConstant(value) {
  return polynomial("ZZ", [BigInt(value)]);
}

function qqPolyConstant(numerator, denominator) {
  return polynomial("QQ", [rational(numerator, denominator)]);
}

function nmodPolyConstant(value, modulus) {
  modulus = BigInt(modulus);
  return polynomial("nmod", [mod(value, modulus)], modulus);
}

function zzPolyToQQ(value) {
  value = assertPolynomial(value);
  if (value.kind !== "ZZ") {
    throw new TypeError("expected a polynomial over ZZ");
  }
  return polynomial(
    "QQ",
    value.coefficients.map((coefficient) => rational(coefficient)),
  );
}

function zzPolyToNmod(value, modulus) {
  value = assertPolynomial(value);
  if (value.kind !== "ZZ") {
    throw new TypeError("expected a polynomial over ZZ");
  }
  modulus = BigInt(modulus);
  return polynomial(
    "nmod",
    value.coefficients.map((coefficient) => mod(coefficient, modulus)),
    modulus,
  );
}

export function createPortablePolynomialBackend() {
  return Object.freeze({
    nmodPolyConstant,
    nmodPolyGen,
    polyAdd,
    polyEqual,
    polyMul,
    polyNeg,
    polyPow,
    polySub,
    polyToString,
    qqPolyConstant,
    qqPolyGen,
    zzPolyConstant,
    zzPolyGen,
    zzPolyToNmod,
    zzPolyToQQ,
  });
}

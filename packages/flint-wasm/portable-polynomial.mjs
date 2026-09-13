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

function extendedGcd(left, right) {
  let oldRemainder = left;
  let remainder = right;
  let oldCoefficient = 1n;
  let coefficient = 0n;
  while (remainder !== 0n) {
    const quotient = oldRemainder / remainder;
    [oldRemainder, remainder] = [
      remainder,
      oldRemainder - quotient * remainder,
    ];
    [oldCoefficient, coefficient] = [
      coefficient,
      oldCoefficient - quotient * coefficient,
    ];
  }
  return [oldRemainder, oldCoefficient];
}

function invertCoefficient(kind, value, modulus) {
  if (kind === "QQ") {
    if (value.numerator === 0n) {
      throw new RangeError("constant coefficient is not invertible");
    }
    return rational(value.denominator, value.numerator);
  }
  if (kind === "ZZ") {
    if (value !== 1n && value !== -1n) {
      throw new RangeError("constant coefficient is not invertible");
    }
    return value;
  }
  const [divisor, inverse] = extendedGcd(value, modulus);
  if (divisor !== 1n && divisor !== -1n) {
    throw new RangeError("constant coefficient is not invertible");
  }
  return mod(divisor === 1n ? inverse : -inverse, modulus);
}

function divideCoefficientExact(kind, numerator, denominator, modulus) {
  if (kind === "QQ" || kind === "nmod") {
    return multiplyCoefficient(
      kind,
      numerator,
      invertCoefficient(kind, denominator, modulus),
      modulus,
    );
  }
  if (denominator === 0n || numerator % denominator !== 0n) {
    throw new RangeError("polynomial division is not exact");
  }
  return numerator / denominator;
}

function polynomialLength(value, name = "polynomial length") {
  const length = BigInt(value);
  if (length < 0n || length > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${name} is out of range`);
  }
  return Number(length);
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

function polyTruncate(value, precision) {
  value = assertPolynomial(value);
  const length = polynomialLength(precision, "polynomial precision");
  return polynomial(
    value.kind,
    value.coefficients.slice(0, length),
    value.modulus,
  );
}

function polyShiftLeft(value, amount) {
  value = assertPolynomial(value);
  const shift = polynomialLength(amount, "polynomial shift");
  if (value.coefficients.length === 0) {
    return value;
  }
  return polynomial(
    value.kind,
    [
      ...Array.from({ length: shift }, () => zeroCoefficient(value.kind)),
      ...value.coefficients,
    ],
    value.modulus,
  );
}

function polyShiftRight(value, amount) {
  value = assertPolynomial(value);
  const shift = polynomialLength(amount, "polynomial shift");
  return polynomial(
    value.kind,
    value.coefficients.slice(shift),
    value.modulus,
  );
}

function polyInflate(value, factor) {
  value = assertPolynomial(value);
  const inflation = polynomialLength(factor, "polynomial inflation factor");
  if (inflation === 0) {
    throw new RangeError("polynomial inflation factor must be positive");
  }
  if (value.coefficients.length === 0 || inflation === 1) {
    return value;
  }
  const coefficients = Array.from(
    { length: (value.coefficients.length - 1) * inflation + 1 },
    () => zeroCoefficient(value.kind),
  );
  value.coefficients.forEach((coefficient, index) => {
    coefficients[index * inflation] = coefficient;
  });
  return polynomial(value.kind, coefficients, value.modulus);
}

function polyMullow(left, right, precision) {
  return polyTruncate(polyMul(left, right), precision);
}

function polyPowTrunc(value, exponent, precision) {
  value = assertPolynomial(value);
  exponent = BigInt(exponent);
  const length = polynomialLength(precision, "polynomial precision");
  if (exponent < 0n) {
    throw new RangeError("negative polynomial exponent");
  }
  let result = polynomial(
    value.kind,
    [value.kind === "QQ" ? rational(1n) : 1n],
    value.modulus,
  );
  let power = polyTruncate(value, BigInt(length));
  while (exponent > 0n) {
    if (exponent & 1n) {
      result = polyTruncate(polyMul(result, power), BigInt(length));
    }
    exponent >>= 1n;
    if (exponent > 0n) {
      power = polyTruncate(polyMul(power, power), BigInt(length));
    }
  }
  return polyTruncate(result, BigInt(length));
}

function polyValuation(value) {
  value = assertPolynomial(value);
  const index = value.coefficients.findIndex(
    (coefficient) => !isZero(value.kind, coefficient),
  );
  return index;
}

function polyInvSeries(value, precision) {
  value = assertPolynomial(value);
  const length = polynomialLength(precision, "series precision");
  if (value.coefficients.length === 0) {
    throw new RangeError("constant coefficient is not invertible");
  }
  const inverseConstant = invertCoefficient(
    value.kind,
    value.coefficients[0],
    value.modulus,
  );
  const coefficients = [];
  if (length > 0) {
    coefficients.push(inverseConstant);
  }
  for (let degree = 1; degree < length; degree += 1) {
    let sum = zeroCoefficient(value.kind);
    const stop = Math.min(degree, value.coefficients.length - 1);
    for (let index = 1; index <= stop; index += 1) {
      sum = addCoefficient(
        value.kind,
        sum,
        multiplyCoefficient(
          value.kind,
          value.coefficients[index],
          coefficients[degree - index],
          value.modulus,
        ),
        value.modulus,
      );
    }
    coefficients.push(
      multiplyCoefficient(
        value.kind,
        negateCoefficient(value.kind, sum, value.modulus),
        inverseConstant,
        value.modulus,
      ),
    );
  }
  return polynomial(value.kind, coefficients, value.modulus);
}

function polyDivExact(left, right) {
  [left, right] = assertSameParent(left, right);
  if (right.coefficients.length === 0) {
    throw new RangeError("polynomial division by zero");
  }
  let remainder = left.coefficients.slice();
  const quotient = Array.from(
    {
      length: Math.max(
        0,
        left.coefficients.length - right.coefficients.length + 1,
      ),
    },
    () => zeroCoefficient(left.kind),
  );
  const divisorDegree = right.coefficients.length - 1;
  const divisorLeading = right.coefficients[divisorDegree];
  while (remainder.length >= right.coefficients.length) {
    const degree = remainder.length - right.coefficients.length;
    const coefficient = divideCoefficientExact(
      left.kind,
      remainder[remainder.length - 1],
      divisorLeading,
      left.modulus,
    );
    quotient[degree] = coefficient;
    for (let index = 0; index <= divisorDegree; index += 1) {
      const target = degree + index;
      remainder[target] = subtractCoefficient(
        left.kind,
        remainder[target],
        multiplyCoefficient(
          left.kind,
          coefficient,
          right.coefficients[index],
          left.modulus,
        ),
        left.modulus,
      );
    }
    remainder = normalizeCoefficients(left.kind, remainder);
  }
  if (remainder.length !== 0) {
    throw new RangeError("polynomial division is not exact");
  }
  return polynomial(left.kind, quotient, left.modulus);
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

function polyCoefficients(value) {
  return assertPolynomial(value).coefficients.slice();
}

function polyCoefficient(value, index) {
  value = assertPolynomial(value);
  index = BigInt(index);
  if (index < 0n || index > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("polynomial coefficient index is out of range");
  }
  return coefficientAt(value, Number(index));
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

const zmodPolyGen = nmodPolyGen;

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

const zmodPolyConstant = nmodPolyConstant;

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

function qqPolyToZZExact(value) {
  value = assertPolynomial(value);
  if (value.kind !== "QQ") {
    throw new TypeError("expected a polynomial over QQ");
  }
  if (
    value.coefficients.some((coefficient) => coefficient.denominator !== 1n)
  ) {
    throw new RangeError("rational polynomial has nonintegral coefficients");
  }
  return polynomial(
    "ZZ",
    value.coefficients.map((coefficient) => coefficient.numerator),
  );
}

function zzPolyUnitriangularBasis(values) {
  if (!Array.isArray(values)) {
    throw new TypeError("expected an array of ZZ polynomials");
  }
  const rows = values.map((value) => {
    value = assertPolynomial(value);
    if (value.kind !== "ZZ") {
      throw new TypeError("expected a polynomial over ZZ");
    }
    return value.coefficients.slice();
  });
  for (let row = 0; row < rows.length; row += 1) {
    for (let column = 0; column < row; column += 1) {
      if ((rows[row][column] ?? 0n) !== 0n) {
        throw new RangeError("polynomial basis is not unitriangular");
      }
    }
    if ((rows[row][row] ?? 0n) !== 1n) {
      throw new RangeError("polynomial basis is not unitriangular");
    }
  }
  for (let pivot = 1; pivot < rows.length; pivot += 1) {
    for (let previous = 0; previous < pivot; previous += 1) {
      const coefficient = rows[previous][pivot] ?? 0n;
      if (coefficient === 0n) {
        continue;
      }
      const length = Math.max(rows[previous].length, rows[pivot].length);
      for (let column = 0; column < length; column += 1) {
        rows[previous][column] =
          (rows[previous][column] ?? 0n) -
          coefficient * (rows[pivot][column] ?? 0n);
      }
    }
  }
  return rows.map((coefficients) => polynomial("ZZ", coefficients));
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

const zzPolyToZmod = zzPolyToNmod;

export function createPortablePolynomialBackend({ recordCapability = () => {} } = {}) {
  const traced = (name, operation) => (...arguments_) => {
    const result = operation(...arguments_);
    recordCapability(
      `napi:@sagemath/sagejs-flint:${name}`,
      "shared-runtime-js",
      { executionTarget: "host-runtime-js", ingressBytes: 0, egressBytes: 0 },
    );
    return result;
  };
  return Object.freeze({
    nmodPolyConstant,
    nmodPolyGen,
    zmodPolyConstant,
    zmodPolyGen,
    polyAdd,
    polyCoefficient,
    polyCoefficients,
    polyDivExact: traced("polyDivExact", polyDivExact),
    polyEqual,
    polyInflate: traced("polyInflate", polyInflate),
    polyInvSeries: traced("polyInvSeries", polyInvSeries),
    polyMul,
    polyMullow: traced("polyMullow", polyMullow),
    polyNeg,
    polyPow,
    polyPowTrunc: traced("polyPowTrunc", polyPowTrunc),
    polyShiftLeft: traced("polyShiftLeft", polyShiftLeft),
    polyShiftRight: traced("polyShiftRight", polyShiftRight),
    polySub,
    polyToString,
    polyTruncate: traced("polyTruncate", polyTruncate),
    polyValuation: traced("polyValuation", polyValuation),
    qqPolyConstant,
    qqPolyGen,
    qqPolyToZZExact,
    zzPolyConstant,
    zzPolyGen,
    zzPolyUnitriangularBasis,
    zzPolyToNmod,
    zzPolyToZmod,
    zzPolyToQQ,
  });
}

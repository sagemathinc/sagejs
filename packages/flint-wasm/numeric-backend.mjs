const LOG10_2 = 0.3010299956639812;

function gcd(left, right) {
  left = left < 0n ? -left : left;
  right = right < 0n ? -right : right;
  while (right !== 0n) [left, right] = [right, left % right];
  return left;
}

function rational(numerator, denominator = 1n) {
  if (denominator === 0n) throw new RangeError("division by zero");
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const divisor = gcd(numerator, denominator);
  return Object.freeze({ numerator: numerator / divisor, denominator: denominator / divisor });
}

function decimalRational(value) {
  if (
    value !== null && typeof value === "object" &&
    typeof value.numerator === "bigint" && typeof value.denominator === "bigint"
  ) return rational(value.numerator, value.denominator);
  if (value?.__sagejsWasmReal === true) return value.value;
  if (value?.__sagejsAlgebraicRealApprox === true) return dyadicRational(value.value);
  if (typeof value === "bigint") return rational(value);
  const text = String(value).trim();
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match || (!match[2] && !match[3])) {
    throw new TypeError(`invalid finite decimal ${JSON.stringify(text)}`);
  }
  const digits = `${match[2] || "0"}${match[3] || ""}`;
  const exponent = Number(match[4] || 0) - (match[3]?.length || 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1_000_000) {
    throw new RangeError("decimal exponent is outside the browser numeric limit");
  }
  let numerator = BigInt(digits || "0");
  if (match[1] === "-") numerator = -numerator;
  return exponent >= 0
    ? rational(numerator * 10n ** BigInt(exponent))
    : rational(numerator, 10n ** BigInt(-exponent));
}

function dyadicRational(value) {
  const exponent = BigInt(value.exponent);
  const numerator = BigInt(value.numerator);
  return exponent >= 0n
    ? rational(numerator << exponent)
    : rational(numerator, 1n << -exponent);
}

function add(left, right) {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function sub(left, right) {
  return rational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function mul(left, right) {
  return rational(left.numerator * right.numerator, left.denominator * right.denominator);
}

function div(left, right) {
  return rational(left.numerator * right.denominator, left.denominator * right.numerator);
}

function neg(value) {
  return rational(-value.numerator, value.denominator);
}

function pow(value, exponent) {
  exponent = BigInt(exponent);
  if (exponent === 0n) return rational(1n);
  if (exponent < 0n) return pow(rational(value.denominator, value.numerator), -exponent);
  let result = rational(1n);
  let base = value;
  while (exponent !== 0n) {
    if (exponent & 1n) result = mul(result, base);
    exponent >>= 1n;
    if (exponent !== 0n) base = mul(base, base);
  }
  return result;
}

function decimalDigits(bits) {
  return Math.max(2, Math.ceil(Number(bits) * LOG10_2) + 3);
}

function decimalText(value, bits) {
  if (value.numerator === 0n) return "0";
  const negative = value.numerator < 0n;
  let numerator = negative ? -value.numerator : value.numerator;
  const integer = numerator / value.denominator;
  let remainder = numerator % value.denominator;
  const digits = decimalDigits(bits);
  let fractional = "";
  for (let index = 0; index < digits && remainder !== 0n; index += 1) {
    remainder *= 10n;
    fractional += String(remainder / value.denominator);
    remainder %= value.denominator;
  }
  fractional = fractional.replace(/0+$/, "");
  return `${negative ? "-" : ""}${integer}${fractional ? `.${fractional}` : ""}`;
}

function real(value, precision) {
  return Object.freeze({
    __sagejsWasmReal: true,
    precision: Number(precision),
    value: decimalRational(value),
  });
}

function complex(realPart, imaginaryPart, precision) {
  return Object.freeze({
    __sagejsWasmComplex: true,
    precision: Number(precision),
    real: decimalRational(realPart),
    imaginary: decimalRational(imaginaryPart),
  });
}

function realValue(value) {
  if (value?.__sagejsWasmReal === true) return value.value;
  if (value?.__sagejsAlgebraicRealApprox === true) return dyadicRational(value.value);
  throw new TypeError("expected a browser real value");
}

function complexValue(value) {
  if (value?.__sagejsWasmComplex === true) return value;
  if (value?.__sagejsAlgebraicApprox === true) {
    return complex(dyadicRational(value.real), dyadicRational(value.imag), value.precision);
  }
  throw new TypeError("expected a browser complex value");
}

function withPrecision(value, precision) {
  return complex(value.real, value.imaginary, precision);
}

/**
 * Host-neutral numeric objects used by `RealField` and `ComplexField`.
 *
 * Decimal ingress and all field operations use exact BigInt rationals. The
 * precision is presentation metadata matching the FLINT midpoint that entered
 * the browser; conversion to binary64 is explicit.
 */
export function createNumericBackend() {
  const backend = {
    realFromString(value, precision) { return real(value, precision); },
    realFromBigInt(value, precision) { return real(BigInt(value), precision); },
    realFromRational(numerator, denominator, precision) {
      return real(rational(BigInt(numerator), BigInt(denominator)), precision);
    },
    realRound(value, precision) { return real(realValue(value), precision); },
    realPrecision(value) { return Number(value.precision); },
    realAdd(left, right) { return real(add(realValue(left), realValue(right)), left.precision); },
    realSub(left, right) { return real(sub(realValue(left), realValue(right)), left.precision); },
    realMul(left, right) { return real(mul(realValue(left), realValue(right)), left.precision); },
    realDiv(left, right) { return real(div(realValue(left), realValue(right)), left.precision); },
    realNeg(value) { return real(neg(realValue(value)), value.precision); },
    realPowInt(value, exponent) { return real(pow(realValue(value), exponent), value.precision); },
    realEqual(left, right) {
      const difference = sub(realValue(left), realValue(right));
      return difference.numerator === 0n;
    },
    realToDouble(value) { return Number(decimalText(realValue(value), value.precision)); },
    realToString(value) { return decimalText(realValue(value), value.precision); },
    complexFromReals(realPart, imaginaryPart) {
      if (realPart.precision !== imaginaryPart.precision) {
        throw new RangeError("complex components must have the same precision");
      }
      return complex(realValue(realPart), realValue(imaginaryPart), realPart.precision);
    },
    complexFromStrings(realPart, imaginaryPart, precision) {
      return complex(realPart, imaginaryPart, precision);
    },
    complexRound(value, precision) { return withPrecision(complexValue(value), precision); },
    complexPrecision(value) { return Number(value.precision); },
    complexReal(value) {
      value = complexValue(value);
      return real(value.real, value.precision);
    },
    complexImag(value) {
      value = complexValue(value);
      return real(value.imaginary, value.precision);
    },
    complexRealDouble(value) {
      value = complexValue(value);
      return Number(decimalText(value.real, value.precision));
    },
    complexImagDouble(value) {
      value = complexValue(value);
      return Number(decimalText(value.imaginary, value.precision));
    },
    complexAdd(left, right) {
      left = complexValue(left); right = complexValue(right);
      return complex(add(left.real, right.real), add(left.imaginary, right.imaginary), left.precision);
    },
    complexSub(left, right) {
      left = complexValue(left); right = complexValue(right);
      return complex(sub(left.real, right.real), sub(left.imaginary, right.imaginary), left.precision);
    },
    complexMul(left, right) {
      left = complexValue(left); right = complexValue(right);
      return complex(
        sub(mul(left.real, right.real), mul(left.imaginary, right.imaginary)),
        add(mul(left.real, right.imaginary), mul(left.imaginary, right.real)),
        left.precision,
      );
    },
    complexDiv(left, right) {
      left = complexValue(left); right = complexValue(right);
      const denominator = add(mul(right.real, right.real), mul(right.imaginary, right.imaginary));
      return complex(
        div(add(mul(left.real, right.real), mul(left.imaginary, right.imaginary)), denominator),
        div(sub(mul(left.imaginary, right.real), mul(left.real, right.imaginary)), denominator),
        left.precision,
      );
    },
    complexNeg(value) {
      value = complexValue(value);
      return complex(neg(value.real), neg(value.imaginary), value.precision);
    },
    complexPowInt(value, exponent) {
      value = complexValue(value);
      exponent = BigInt(exponent);
      if (exponent < 0n) {
        const one = complex(1, 0, value.precision);
        return backend.complexPowInt(backend.complexDiv(one, value), -exponent);
      }
      let result = complex(1, 0, value.precision);
      let base = value;
      while (exponent !== 0n) {
        if (exponent & 1n) result = backend.complexMul(result, base);
        exponent >>= 1n;
        if (exponent !== 0n) base = backend.complexMul(base, base);
      }
      return result;
    },
    complexEqual(left, right) {
      left = complexValue(left); right = complexValue(right);
      return sub(left.real, right.real).numerator === 0n &&
        sub(left.imaginary, right.imaginary).numerator === 0n;
    },
    complexToString(value) {
      value = complexValue(value);
      const realText = decimalText(value.real, value.precision);
      const imaginaryNegative = value.imaginary.numerator < 0n;
      const magnitude = imaginaryNegative ? neg(value.imaginary) : value.imaginary;
      const imaginaryText = decimalText(magnitude, value.precision);
      if (value.imaginary.numerator === 0n) return realText;
      if (value.real.numerator === 0n) return `${imaginaryNegative ? "-" : ""}${imaginaryText}*I`;
      return `${realText}${imaginaryNegative ? " - " : " + "}${imaginaryText}*I`;
    },
    serializeAnalyticPoint(value) {
      value = complexValue(value);
      return [decimalText(value.real, value.precision), decimalText(value.imaginary, value.precision)];
    },
  };
  return Object.freeze(backend);
}

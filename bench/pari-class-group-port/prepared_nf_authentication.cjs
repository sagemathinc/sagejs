"use strict";

// This module authenticates only the number-field preparation consumed by the
// H1 experiment.  In particular, it never receives a class number, relation,
// unit, regulator, or expected digest.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const SCHEMA = "sagejs.pari-class-group/prepared-nf-authority-v1";
const ANALYTIC_PRIME_LIMIT = 10007;

function integers(value, length, name) {
  assert(Array.isArray(value), `${name} must be an array`);
  assert.equal(value.length, length, `${name} has the wrong length`);
  return value.map((entry, i) => {
    assert.match(String(entry), /^-?(0|[1-9][0-9]*)$/, `${name}[${i}] is not integral`);
    return BigInt(entry);
  });
}

function integer(value, name) {
  const [answer] = integers([value], 1, name);
  return answer;
}

function abs(value) { return value < 0n ? -value : value; }

function determinant3(a) {
  // Matrices in the prepared ABI are column-major.
  return a[0] * (a[4] * a[8] - a[7] * a[5])
    - a[3] * (a[1] * a[8] - a[7] * a[2])
    + a[6] * (a[1] * a[5] - a[4] * a[2]);
}

function multiply3(a, b) {
  const answer = Array(9).fill(0n);
  for (let column = 0; column < 3; column += 1) {
    for (let row = 0; row < 3; row += 1) {
      for (let k = 0; k < 3; k += 1) {
        answer[3 * column + row] += a[3 * k + row] * b[3 * column + k];
      }
    }
  }
  return answer;
}

function adjugateTimesVector(a, v) {
  // Cramer's rule avoids any floating-point or library dependency.
  const result = [];
  for (let column = 0; column < 3; column += 1) {
    const replaced = [...a];
    for (let row = 0; row < 3; row += 1) replaced[3 * column + row] = v[row];
    result.push(determinant3(replaced));
  }
  return result;
}

function reduceProduct(left, right, polynomial) {
  const product = Array(5).fill(0n);
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) product[i + j] += left[i] * right[j];
  }
  // polynomial is d + c*x + b*x^2 + x^3.
  for (let degree = 4; degree >= 3; degree -= 1) {
    const leading = product[degree];
    for (let j = 0; j < 3; j += 1) product[degree - 3 + j] -= leading * polynomial[j];
  }
  return product.slice(0, 3);
}

function cubicDiscriminant([d, c, b, leading]) {
  assert.equal(leading, 1n, "prepared polynomial must be monic cubic");
  return b * b * c * c - 4n * c * c * c - 4n * b * b * b * d
    - 27n * d * d + 18n * b * c * d;
}

function evaluateCubic(polynomial, x) {
  return ((polynomial[3] * x + polynomial[2]) * x + polynomial[1]) * x + polynomial[0];
}

function assertIrreducibleCubic(polynomial) {
  const constant = abs(polynomial[0]);
  assert.notEqual(constant, 0n, "prepared cubic has the rational root zero");
  for (let divisor = 1n; divisor * divisor <= constant; divisor += 1n) {
    if (constant % divisor !== 0n) continue;
    const complement = constant / divisor;
    for (const root of new Set([divisor, -divisor, complement, -complement])) {
      assert.notEqual(evaluateCubic(polynomial, root), 0n,
        "prepared cubic is reducible over the rationals");
    }
  }
}

function primesThrough(limit) {
  assert(Number.isSafeInteger(limit) && limit >= 2);
  const composite = new Uint8Array(limit + 1);
  for (let p = 2; p * p <= limit; p += 1) {
    if (composite[p]) continue;
    for (let n = p * p; n <= limit; n += p) composite[n] = 1;
  }
  const answer = [];
  for (let p = 2; p <= limit; p += 1) if (!composite[p]) answer.push(BigInt(p));
  return answer;
}

function pariPrimeProducts(primes, factorLimit) {
  // PARI 2.17.4 set_prodprimes(): odd primes are split immediately before
  // each power-of-two threshold, with the final run truncated at factorlimit.
  const odd = primes.filter(p => p >= 3n && p <= factorLimit);
  const answer = [];
  let start = 0;
  let boundary = 256n;
  for (let j = 0; j < odd.length; j += 1) {
    if (j === odd.length - 1 || odd[j] >= boundary) {
      const end = j === odd.length - 1 ? odd.length : j;
      let product = 1n;
      for (let k = start; k < end; k += 1) product *= odd[k];
      answer.push(product);
      start = j;
      boundary *= 2n;
      if (boundary > factorLimit) boundary = factorLimit;
    }
  }
  for (let j = 1; j < answer.length; j += 1) answer[j] *= answer[j - 1];
  return answer;
}

function bitLength(value) {
  const magnitude = abs(value);
  return magnitude === 0n ? 0 : magnitude.toString(2).length;
}

function dyadic(mantissa, precision, exponent) {
  if (precision === -1n) {
    assert.equal(exponent, 0n, "exact embedding integer has a noncanonical exponent");
    return { numerator: mantissa, exponent: 0n };
  }
  assert(precision >= 64n && precision <= 4096n && precision % 64n === 0n,
    "embedding precision is not a supported limb precision");
  assert(mantissa !== 0n && BigInt(bitLength(mantissa)) === precision,
    "embedding mantissa is not normalized");
  return { numerator: mantissa, exponent: exponent - precision + 1n };
}

function dyadicAdd(left, right) {
  const exponent = left.exponent < right.exponent ? left.exponent : right.exponent;
  return {
    numerator: (left.numerator << (left.exponent - exponent))
      + (right.numerator << (right.exponent - exponent)),
    exponent,
  };
}

function dyadicScale(value, scalar) {
  return { numerator: value.numerator * scalar, exponent: value.exponent };
}

function dyadicMultiply(left, right) {
  return { numerator: left.numerator * right.numerator, exponent: left.exponent + right.exponent };
}

function dyadicAbsLePowerOfTwo(value, exponent) {
  if (value.numerator === 0n) return true;
  const top = BigInt(bitLength(value.numerator)) + value.exponent - 1n;
  return top <= exponent;
}

function nearestInteger(value) {
  if (value.exponent >= 0n) return value.numerator << value.exponent;
  const shift = -value.exponent;
  const denominator = 1n << shift;
  const sign = value.numerator < 0n ? -1n : 1n;
  const magnitude = abs(value.numerator);
  const quotient = magnitude / denominator;
  const remainder = magnitude % denominator;
  return sign * (quotient + (2n * remainder >= denominator ? 1n : 0n));
}

function canonical(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function authenticatePreparedNf(input) {
  assert(input && typeof input === "object" && !Array.isArray(input));
  assert.equal(integer(input.n, "n"), 3n, "only the audited cubic boundary is supported");
  const precision = integer(input.precision, "precision");
  assert.equal(precision, 192n, "prepared precision is not the audited runtime policy");

  const polynomial = integers(input.prep_polynomial, 4, "prep_polynomial");
  assertIrreducibleCubic(polynomial);
  const polynomialDiscriminant = cubicDiscriminant(polynomial);
  assert.notEqual(polynomialDiscriminant, 0n, "prepared polynomial is inseparable");
  const realCount = polynomialDiscriminant > 0n ? 3n : 1n;
  assert.equal(integer(input.admission_real_count, "admission_real_count"), realCount,
    "prepared signature disagrees with polynomial discriminant");
  assert.equal(integer(input.analytic_roots_of_unity, "analytic_roots_of_unity"), 2n,
    "odd-degree real field must have two roots of unity");

  const denominator = integer(input.prep_zkden, "prep_zkden");
  assert(denominator > 0n, "basis denominator must be positive");
  const basis = integers(input.prep_zk, 9, "prep_zk");
  const inverse = integers(input.prep_invzk, 9, "prep_invzk");
  const determinant = determinant3(basis);
  assert.notEqual(determinant, 0n, "prepared basis is singular");
  const identity = [denominator, 0n, 0n, 0n, denominator, 0n, 0n, 0n, denominator];
  assert.deepEqual(multiply3(basis, inverse), identity, "prep_invzk is not the basis inverse");
  assert.deepEqual(multiply3(inverse, basis), identity, "prep_invzk is not a two-sided inverse");
  const degrees = integers(input.prep_zk_degrees, 3, "prep_zk_degrees");
  for (let column = 0; column < 3; column += 1) {
    let degree = 0n;
    for (let row = 0; row < 3; row += 1) if (basis[3 * column + row] !== 0n) degree = BigInt(row);
    assert.equal(degrees[column], degree, `prep_zk_degrees[${column}] is false`);
  }

  const denominatorSixth = denominator ** 6n;
  const numeratorDiscriminant = polynomialDiscriminant * determinant * determinant;
  assert.equal(numeratorDiscriminant % denominatorSixth, 0n,
    "basis discriminant is not integral");
  const fieldDiscriminant = numeratorDiscriminant / denominatorSixth;
  assert.equal(abs(fieldDiscriminant), abs(integer(input.analytic_discriminant, "analytic_discriminant")),
    "prepared discriminant disagrees with polynomial and basis");
  const index = integer(input.prep_index, "prep_index");
  assert(index > 0n, "prepared index must be positive");
  assert.equal(abs(polynomialDiscriminant), abs(fieldDiscriminant) * index * index,
    "prepared index does not explain the discriminant quotient");

  const tensor = integers(input.basis_table, 27, "basis_table");
  for (let i = 0; i < 3; i += 1) {
    const left = basis.slice(3 * i, 3 * i + 3);
    for (let j = 0; j < 3; j += 1) {
      const right = basis.slice(3 * j, 3 * j + 3);
      const reduced = reduceProduct(left, right, polynomial);
      const numerators = adjugateTimesVector(basis, reduced);
      const divisor = determinant * denominator;
      const coordinates = numerators.map((entry, k) => {
        assert.equal(entry % divisor, 0n, `basis product (${i},${j}) coordinate ${k} is not integral`);
        return entry / divisor;
      });
      assert.deepEqual(coordinates, tensor.slice(9 * i + 3 * j, 9 * i + 3 * j + 3),
        `basis multiplication tensor is false at (${i},${j})`);
    }
  }

  const matrixM = integers(input.admission_matrix_m, 9, "admission_matrix_m");
  const matrixP = integers(input.admission_matrix_p, 9, "admission_matrix_p");
  const matrixE = integers(input.admission_matrix_e, 9, "admission_matrix_e");
  const packed = integers(input.preparation_embedding, 27, "preparation_embedding");
  const embeddings = [];
  for (let i = 0; i < 9; i += 1) {
    assert.deepEqual(packed.slice(3 * i, 3 * i + 3), [matrixM[i], matrixP[i], matrixE[i]],
      `preparation_embedding does not alias admission embedding ${i}`);
    embeddings.push(dyadic(matrixM[i], matrixP[i], matrixE[i]));
  }
  const storedPrecision = matrixP.filter(value => value > 0n)
    .reduce((least, value) => value < least ? value : least);
  for (let row = 0; row < 3; row += 1) {
    assert.deepEqual(embeddings[3 * row], { numerator: 1n, exponent: 0n },
      `embedding ${row} does not preserve one`);
  }
  // Rounded homomorphism residuals are bounded from the declared precision,
  // tensor height and operand exponents.  The deliberately loose +8 guard is
  // independent of this field's observed residuals and still detects loss of
  // a substantial mantissa prefix.
  const maxTensorBits = Math.max(...tensor.map(entry => bitLength(entry)));
  for (let row = 0; row < 3; row += 1) {
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        let residual = dyadicMultiply(embeddings[3 * row + i], embeddings[3 * row + j]);
        for (let k = 0; k < 3; k += 1) {
          residual = dyadicAdd(residual,
            dyadicScale(embeddings[3 * row + k], -tensor[9 * i + 3 * j + k]));
        }
        const operandTop = Math.max(...embeddings.slice(3 * row, 3 * row + 3)
          .map(value => bitLength(value.numerator) + Number(value.exponent) - 1));
        const residualTop = BigInt(2 * operandTop - Number(storedPrecision) + maxTensorBits + 8);
        assert(dyadicAbsLePowerOfTwo(residual, residualTop),
          `embedding row ${row} violates product (${i},${j}) beyond its precision budget`);
      }
    }
  }
  const theta = [embeddings[1], embeddings[4], embeddings[7]];
  for (let i = 0; i < 3; i += 1) for (let j = i + 1; j < 3; j += 1) {
    assert.notEqual(dyadicAdd(theta[i], dyadicScale(theta[j], -1n)).numerator, 0n,
      "prepared real embeddings are duplicated");
  }

  const rounded = integers(input.preparation_rounded_embedding, 9, "preparation_rounded_embedding");
  const scale = rounded[0];
  assert(scale > 0n && (scale & (scale - 1n)) === 0n, "rounded embedding scale is not a power of two");
  for (let row = 0; row < 3; row += 1) {
    assert.equal(rounded[3 * row], scale, "rounded embedding does not preserve one");
    for (let column = 0; column < 3; column += 1) {
      assert.equal(rounded[3 * row + column],
        nearestInteger(dyadicScale(embeddings[3 * row + column], scale)),
        `rounded embedding entry (${row},${column}) is false`);
    }
  }

  const primeLimit = integer(input.admission_prime_limit, "admission_prime_limit");
  const factorLimit = integer(input.admission_factorlimit, "admission_factorlimit");
  assert.equal(primeLimit, 65537n, "admission prime limit is not the audited runtime policy");
  assert.equal(factorLimit, 1048576n, "admission factor limit is not the audited runtime policy");
  assert(primeLimit <= BigInt(Number.MAX_SAFE_INTEGER));
  assert(factorLimit >= primeLimit, "factor limit is below the prime table limit");
  const expectedPrimes = primesThrough(Number(primeLimit));
  assert.deepEqual(integers(input.admission_primes, expectedPrimes.length, "admission_primes"),
    expectedPrimes, "admission prime table is not exhaustive");
  const expectedProducts = pariPrimeProducts(expectedPrimes, factorLimit);
  assert.deepEqual(integers(input.admission_products, expectedProducts.length, "admission_products"),
    expectedProducts, "admission product table is not PARI's declared table");
  const expectedAnalyticPrimes = primesThrough(ANALYTIC_PRIME_LIMIT);
  assert.deepEqual(integers(input.analytic_primes, expectedAnalyticPrimes.length, "analytic_primes"),
    expectedAnalyticPrimes, "analytic prime table is not the policy-defined exhaustive table");

  const authority = {
    schema: SCHEMA,
    degree: 3,
    signature: [Number(realCount), Number((3n - realCount) / 2n)],
    polynomial,
    polynomialDiscriminant,
    fieldDiscriminant,
    index,
    basisDenominator: denominator,
    basisDeterminant: determinant,
    basisSha256: digest({ basis, inverse, degrees, tensor }),
    embeddingSha256: digest({ matrixM, matrixP, matrixE, rounded }),
    runtimeTablesSha256: digest({ expectedPrimes, expectedProducts, expectedAnalyticPrimes }),
  };
  return Object.freeze({ ...canonical(authority), sha256: digest(authority) });
}

module.exports = {
  ANALYTIC_PRIME_LIMIT,
  SCHEMA,
  authenticatePreparedNf,
  cubicDiscriminant,
  pariPrimeProducts,
  primesThrough,
};

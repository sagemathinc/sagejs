"use strict";

// Exact authentication of prepared number-field data admitted to the PARI
// class-group experiment. Inputs never include class/unit answers. W0 is
// deliberately bounded to degrees 3--5 with at least one real embedding.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const SCHEMA = "sagejs.pari-class-group/prepared-nf-authority-v2";
const ANALYTIC_PRIME_LIMIT = 10007;

function integers(value, length, name) {
  assert(Array.isArray(value), `${name} must be an array`);
  assert.equal(value.length, length, `${name} has the wrong length`);
  return value.map((entry, i) => {
    assert.match(String(entry), /^-?(0|[1-9][0-9]*)$/, `${name}[${i}] is not integral`);
    return BigInt(entry);
  });
}
function integer(value, name) { return integers([value], 1, name)[0]; }
function abs(value) { return value < 0n ? -value : value; }
function gcd(a, b) {
  a = abs(a); b = abs(b);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function determinant(matrix, n) {
  const a = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => matrix[n * c + r]));
  let sign = 1n, previous = 1n;
  for (let k = 0; k < n - 1; k += 1) {
    let pivot = k;
    while (pivot < n && a[pivot][k] === 0n) pivot += 1;
    if (pivot === n) return 0n;
    if (pivot !== k) { [a[pivot], a[k]] = [a[k], a[pivot]]; sign = -sign; }
    const value = a[k][k];
    for (let r = k + 1; r < n; r += 1) for (let c = k + 1; c < n; c += 1) {
      const numerator = a[r][c] * value - a[r][k] * a[k][c];
      assert.equal(numerator % previous, 0n, "Bareiss division was not exact");
      a[r][c] = numerator / previous;
    }
    previous = value;
  }
  return sign * a[n - 1][n - 1];
}
function multiplyMatrices(a, b, n) {
  const out = Array(n * n).fill(0n);
  for (let c = 0; c < n; c += 1) for (let r = 0; r < n; r += 1)
    for (let k = 0; k < n; k += 1) out[n * c + r] += a[n * k + r] * b[n * c + k];
  return out;
}
function multiplyMatrixVector(a, v, n) {
  const out = Array(n).fill(0n);
  for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1)
    out[r] += a[n * c + r] * v[c];
  return out;
}
function reduceProduct(a, b, polynomial, n) {
  const out = Array(2 * n - 1).fill(0n);
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) out[i + j] += a[i] * b[j];
  for (let degree = 2 * n - 2; degree >= n; degree -= 1)
    for (let j = 0; j < n; j += 1) out[degree - n + j] -= out[degree] * polynomial[j];
  return out.slice(0, n);
}
function resultant(a, b) {
  const m = a.length - 1, n = b.length - 1, size = m + n;
  const s = Array(size * size).fill(0n);
  for (let r = 0; r < n; r += 1) for (let j = 0; j <= m; j += 1)
    s[size * (r + j) + r] = a[m - j];
  for (let r = 0; r < m; r += 1) for (let j = 0; j <= n; j += 1)
    s[size * (r + j) + n + r] = b[n - j];
  return determinant(s, size);
}
function polynomialDiscriminant(polynomial) {
  const n = polynomial.length - 1;
  assert.equal(polynomial[n], 1n, "prepared polynomial must be monic");
  const derivative = polynomial.slice(1).map((x, i) => x * BigInt(i + 1));
  return (((n * (n - 1)) / 2) % 2 ? -1n : 1n) * resultant(polynomial, derivative);
}
function cubicDiscriminant(polynomial) {
  assert.equal(polynomial.length, 4, "cubic polynomial has the wrong length");
  return polynomialDiscriminant(polynomial);
}

function mod(value, p) { const x = Number(value % BigInt(p)); return x < 0 ? x + p : x; }
function trimMod(f) { while (f.length > 1 && f.at(-1) === 0) f.pop(); return f; }
function inverseMod(value, p) {
  let a = value, b = p, x = 1, y = 0;
  while (b) { const q = Math.floor(a / b); [a, b] = [b, a - q * b]; [x, y] = [y, x - q * y]; }
  assert.equal(a, 1, "finite-field inverse does not exist");
  return (x % p + p) % p;
}
function remainderMod(dividend, divisor, p) {
  const out = trimMod([...dividend]), inverse = inverseMod(divisor.at(-1), p);
  while (out.length >= divisor.length && !(out.length === 1 && out[0] === 0)) {
    const shift = out.length - divisor.length, scale = out.at(-1) * inverse % p;
    for (let j = 0; j < divisor.length; j += 1)
      out[shift + j] = (out[shift + j] - scale * divisor[j] % p + p) % p;
    trimMod(out);
  }
  return out;
}
function multiplyMod(a, b, modulus, p) {
  const out = Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i += 1) for (let j = 0; j < b.length; j += 1)
    out[i + j] = (out[i + j] + a[i] * b[j]) % p;
  return remainderMod(out, modulus, p);
}
function powerMod(base, exponent, modulus, p) {
  let out = [1], power = base, e = BigInt(exponent);
  while (e) { if (e & 1n) out = multiplyMod(out, power, modulus, p); e >>= 1n;
    if (e) power = multiplyMod(power, power, modulus, p); }
  return out;
}
function gcdMod(a, b, p) {
  a = trimMod([...a]); b = trimMod([...b]);
  while (!(b.length === 1 && b[0] === 0)) [a, b] = [b, remainderMod(a, b, p)];
  const inverse = inverseMod(a.at(-1), p);
  return a.map(x => x * inverse % p);
}
function sameMod(a, b) { return trimMod([...a]).join(",") === trimMod([...b]).join(","); }
function irreducibleModPrime(polynomial, p) {
  const f = polynomial.map(x => mod(x, p)), n = f.length - 1, x = [0, 1];
  if (f.at(-1) !== 1) return false;
  const powers = [x];
  for (let k = 1; k <= n; k += 1) powers.push(powerMod(powers.at(-1), p, f, p));
  for (let q = 2; q <= n; q += 1) if (n % q === 0 && !Array.from({ length: q - 2 }, (_, i) => i + 2)
    .some(d => d * d <= q && q % d === 0)) {
    const difference = [...powers[n / q]]; difference[1] = ((difference[1] || 0) - 1 + p) % p;
    if (gcdMod(f, difference, p).length !== 1) return false;
  }
  const difference = [...powers[n]]; difference[1] = ((difference[1] || 0) - 1 + p) % p;
  return sameMod(remainderMod(difference, f, p), [0]);
}
function primesThrough(limit) {
  const composite = new Uint8Array(limit + 1), out = [];
  for (let p = 2; p * p <= limit; p += 1) if (!composite[p])
    for (let x = p * p; x <= limit; x += p) composite[x] = 1;
  for (let p = 2; p <= limit; p += 1) if (!composite[p]) out.push(BigInt(p));
  return out;
}
function assertIrreducible(polynomial) {
  for (const p of primesThrough(257).map(Number)) if (irreducibleModPrime(polynomial, p)) return BigInt(p);
  assert.fail("prepared polynomial has no irreducible-mod-prime certificate through 257");
}

function rational(n, d = 1n) {
  assert.notEqual(d, 0n); if (n === 0n) return { n: 0n, d: 1n };
  if (d < 0n) [n, d] = [-n, -d]; const g = gcd(n, d); return { n: n / g, d: d / g };
}
function subtract(a, b) { return rational(a.n * b.d - b.n * a.d, a.d * b.d); }
function multiply(a, b) { return rational(a.n * b.n, a.d * b.d); }
function trimRational(f) { while (f.length > 1 && f.at(-1).n === 0n) f.pop(); return f; }
function rationalRemainder(dividend, divisor) {
  const out = dividend.map(x => ({ ...x }));
  while (out.length >= divisor.length && !(out.length === 1 && out[0].n === 0n)) {
    const shift = out.length - divisor.length;
    const scale = rational(out.at(-1).n * divisor.at(-1).d, out.at(-1).d * divisor.at(-1).n);
    for (let j = 0; j < divisor.length; j += 1) out[shift + j] = subtract(out[shift + j], multiply(scale, divisor[j]));
    trimRational(out);
  }
  return out;
}
function signAtInfinity(f, negative) {
  const sign = f.at(-1).n < 0n ? -1 : 1;
  return negative && (f.length - 1) % 2 ? -sign : sign;
}
function variations(signs) { return signs.slice(1).filter((x, i) => x !== signs[i]).length; }
function countRealRoots(polynomial) {
  const sequence = [polynomial.map(x => rational(x)),
    polynomial.slice(1).map((x, i) => rational(x * BigInt(i + 1)))];
  while (sequence.at(-1).length > 1) {
    const remainder = rationalRemainder(sequence.at(-2), sequence.at(-1))
      .map(x => rational(-x.n, x.d));
    assert(!(remainder.length === 1 && remainder[0].n === 0n), "prepared polynomial is not squarefree");
    sequence.push(remainder);
  }
  return BigInt(variations(sequence.map(x => signAtInfinity(x, true)))
    - variations(sequence.map(x => signAtInfinity(x, false))));
}

function pariPrimeProducts(primes, factorLimit) {
  const odd = primes.filter(p => p >= 3n && p <= factorLimit), out = [];
  let start = 0, boundary = 256n;
  for (let j = 0; j < odd.length; j += 1) if (j === odd.length - 1 || odd[j] >= boundary) {
    const end = j === odd.length - 1 ? odd.length : j; let product = 1n;
    for (let k = start; k < end; k += 1) product *= odd[k];
    out.push(product); start = j; boundary *= 2n; if (boundary > factorLimit) boundary = factorLimit;
  }
  for (let j = 1; j < out.length; j += 1) out[j] *= out[j - 1];
  return out;
}
function bitLength(x) { x = abs(x); return x === 0n ? 0 : x.toString(2).length; }
function dyadic(mantissa, precision, exponent) {
  if (precision === -1n) { assert.equal(exponent, 0n, "noncanonical exact embedding integer");
    return { numerator: mantissa, exponent: 0n }; }
  assert(precision >= 64n && precision <= 4096n && precision % 64n === 0n,
    "embedding precision is not a supported limb precision");
  assert(mantissa !== 0n && BigInt(bitLength(mantissa)) === precision,
    "embedding mantissa is not normalized");
  return { numerator: mantissa, exponent: exponent - precision + 1n };
}
function dyadicAdd(a, b) { const e = a.exponent < b.exponent ? a.exponent : b.exponent;
  return { numerator: (a.numerator << (a.exponent - e)) + (b.numerator << (b.exponent - e)), exponent: e }; }
function dyadicScale(a, scalar) { return { numerator: a.numerator * scalar, exponent: a.exponent }; }
function dyadicMultiply(a, b) { return { numerator: a.numerator * b.numerator, exponent: a.exponent + b.exponent }; }
function smallEnough(a, exponent) { return a.numerator === 0n || BigInt(bitLength(a.numerator)) + a.exponent - 1n <= exponent; }
function nearestInteger(a) {
  if (a.exponent >= 0n) return a.numerator << a.exponent;
  const denominator = 1n << -a.exponent, sign = a.numerator < 0n ? -1n : 1n;
  const magnitude = abs(a.numerator), quotient = magnitude / denominator, remainder = magnitude % denominator;
  return sign * (quotient + (2n * remainder >= denominator ? 1n : 0n));
}
function canonical(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
function digest(value) { return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }

function exportedInteger(value, name) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    assert.equal(value.kind, "integer", `${name} is not an exported exact integer`);
    return String(integer(value.value, name));
  }
  return String(integer(value, name));
}

function exportedEmbeddingTriple(value, name) {
  assert(value && typeof value === "object" && !Array.isArray(value),
    `${name} is not an exported exact scalar`);
  if (value.kind === "integer") return [exportedInteger(value, name), "-1", "0"];
  assert.equal(value.kind, "real", `${name} is neither an integer nor a real component`);
  return [exportedInteger(value.mantissa, `${name}.mantissa`),
    exportedInteger(value.precision, `${name}.precision`),
    exportedInteger(value.exponent, `${name}.exponent`)];
}

function normalizePreparedBundle(bundle) {
  assert(bundle && typeof bundle === "object" && !Array.isArray(bundle),
    "prepared export bundle must be an object");
  const prepared = bundle.prepared || bundle;
  if (bundle.prepared && bundle.schema) {
    const preparedKeys = ["degree", "discriminant", "embeddingG", "embeddingM", "event",
      "factorLimit", "index", "invzk", "multiplicationTensor", "polynomial", "precision",
      "primeLimit", "rootsOfUnity", "roundedEmbedding", "runtimePrimes", "runtimeProducts",
      "signature", "zk", "zkDegrees", "zkden"];
    assert.deepEqual(Object.keys(prepared).sort(), preparedKeys,
      "prepared export contains an unreviewed field");
    assert.deepEqual(Object.keys(bundle.field || {}).sort(), ["coefficientOrder", "coefficients",
      "degree", "id", "panelIndex", "polynomialSha256", "signature", "stratum", "unitRank"],
    "field export contains an unreviewed field");
  }
  const n = Number(BigInt(exportedInteger(prepared.degree, "prepared.degree")));
  assert(n >= 3 && n <= 5, "prepared degree is outside the audited 3--5 corridor");
  const exactArray = (value, length, name) => {
    if (value && value.kind === "vector") value = value.values;
    assert(Array.isArray(value) && value.length === length, `${name} has the wrong length`);
    return value.map((entry, i) => exportedInteger(entry, `${name}[${i}]`));
  };
  const embedding = (value, name) => {
    assert(Array.isArray(value) && value.length === n * n, `${name} has the wrong length`);
    return value.flatMap((entry, i) => exportedEmbeddingTriple(entry, `${name}[${i}]`));
  };
  const matrixTriples = embedding(prepared.embeddingM, "prepared.embeddingM");
  const graphTriples = embedding(prepared.embeddingG, "prepared.embeddingG");
  const matrixM = [], matrixP = [], matrixE = [];
  for (let i = 0; i < n * n; i += 1) {
    matrixM.push(matrixTriples[3 * i]);
    matrixP.push(matrixTriples[3 * i + 1]);
    matrixE.push(matrixTriples[3 * i + 2]);
  }
  assert(Array.isArray(prepared.signature) && prepared.signature.length === 2,
    "prepared.signature has the wrong length");
  const realCount = exportedInteger(prepared.signature[0], "prepared.signature[0]");
  const complexCount = exportedInteger(prepared.signature[1], "prepared.signature[1]");
  assert.equal(BigInt(realCount) + 2n * BigInt(complexCount), BigInt(n),
    "prepared signature does not sum to degree");
  let rootsOfUnity = prepared.rootsOfUnity;
  if (rootsOfUnity && rootsOfUnity.kind === "vector") {
    assert(Array.isArray(rootsOfUnity.values) && rootsOfUnity.values.length === 2,
      "prepared.rootsOfUnity vector has the wrong length");
    assert.equal(exportedInteger(rootsOfUnity.values[1], "prepared.rootsOfUnity.generator"), "-1",
      "real-field roots-of-unity generator is not -1");
    rootsOfUnity = rootsOfUnity.values[0];
  }
  const normalized = {
    n: String(n),
    precision: exportedInteger(prepared.precision, "prepared.precision"),
    admission_real_count: realCount,
    analytic_roots_of_unity: exportedInteger(rootsOfUnity, "prepared.rootsOfUnity"),
    analytic_discriminant: exportedInteger(prepared.discriminant, "prepared.discriminant"),
    prep_index: exportedInteger(prepared.index, "prepared.index"),
    prep_zkden: exportedInteger(prepared.zkden, "prepared.zkden"),
    prep_polynomial: exactArray(prepared.polynomial, n + 1, "prepared.polynomial"),
    prep_zk: exactArray(prepared.zk, n * n, "prepared.zk"),
    prep_invzk: exactArray(prepared.invzk, n * n, "prepared.invzk"),
    prep_zk_degrees: exactArray(prepared.zkDegrees, n, "prepared.zkDegrees"),
    basis_table: exactArray(prepared.multiplicationTensor, n ** 3,
      "prepared.multiplicationTensor"),
    admission_matrix_m: matrixM,
    admission_matrix_p: matrixP,
    admission_matrix_e: matrixE,
    preparation_embedding: graphTriples,
    preparation_rounded_embedding: exactArray(prepared.roundedEmbedding, n * n,
      "prepared.roundedEmbedding"),
    admission_prime_limit: exportedInteger(prepared.primeLimit, "prepared.primeLimit"),
    admission_factorlimit: exportedInteger(prepared.factorLimit, "prepared.factorLimit"),
    admission_primes: exactArray(prepared.runtimePrimes, prepared.runtimePrimes.length,
      "prepared.runtimePrimes"),
    admission_products: exactArray(prepared.runtimeProducts,
      prepared.runtimeProducts.kind === "vector"
        ? prepared.runtimeProducts.values.length
        : prepared.runtimeProducts.length,
      "prepared.runtimeProducts"),
    analytic_primes: primesThrough(ANALYTIC_PRIME_LIMIT).map(String),
  };
  if (bundle.field) {
    assert.equal(Number(BigInt(exportedInteger(bundle.field.degree, "field.degree"))), n,
      "field metadata degree disagrees with prepared event");
    assert.deepEqual(exactArray(bundle.field.coefficients, n + 1, "field.coefficients"),
      normalized.prep_polynomial, "field metadata polynomial disagrees with prepared event");
    assert.equal(bundle.field.coefficientOrder, "ascending",
      "field metadata coefficient order is not ascending");
    assert.deepEqual(bundle.field.signature.map(String), [realCount, complexCount],
      "field metadata signature disagrees with prepared event");
  }
  return normalized;
}

function authenticatePreparedNf(input) {
  assert(input && typeof input === "object" && !Array.isArray(input));
  const nBig = integer(input.n, "n");
  assert(nBig >= 3n && nBig <= 5n, "prepared degree is outside the audited 3--5 corridor");
  const n = Number(nBig), precision = integer(input.precision, "precision");
  assert(precision >= 64n && precision <= 4096n && precision % 64n === 0n,
    "prepared precision is not a supported limb precision");
  const polynomial = integers(input.prep_polynomial, n + 1, "prep_polynomial");
  const polynomialDisc = polynomialDiscriminant(polynomial);
  assert.notEqual(polynomialDisc, 0n, "prepared polynomial is inseparable");
  const irreducibilityPrime = assertIrreducible(polynomial);
  const realCount = countRealRoots(polynomial);
  assert.equal(integer(input.admission_real_count, "admission_real_count"), realCount,
    "prepared signature disagrees with the exact Sturm count");
  assert.equal((nBig - realCount) % 2n, 0n, "prepared signature has wrong parity");
  const complexCount = (nBig - realCount) / 2n;
  assert.equal(polynomialDisc < 0n, complexCount % 2n === 1n,
    "polynomial discriminant sign disagrees with signature");
  assert(realCount > 0n, "W0 supports only fields with a real embedding");
  assert.equal(integer(input.analytic_roots_of_unity, "analytic_roots_of_unity"), 2n,
    "a field with a real embedding must have two roots of unity");

  const denominator = integer(input.prep_zkden, "prep_zkden");
  assert(denominator > 0n, "basis denominator must be positive");
  const basis = integers(input.prep_zk, n * n, "prep_zk");
  const inverse = integers(input.prep_invzk, n * n, "prep_invzk");
  const basisDeterminant = determinant(basis, n);
  assert.notEqual(basisDeterminant, 0n, "prepared basis is singular");
  const identity = Array(n * n).fill(0n); for (let i = 0; i < n; i += 1) identity[n * i + i] = denominator;
  assert.deepEqual(multiplyMatrices(basis, inverse, n), identity, "prep_invzk is not the basis inverse");
  assert.deepEqual(multiplyMatrices(inverse, basis, n), identity, "prep_invzk is not a two-sided inverse");
  const degrees = integers(input.prep_zk_degrees, n, "prep_zk_degrees");
  for (let c = 0; c < n; c += 1) { let degree = 0n;
    for (let r = 0; r < n; r += 1) if (basis[n * c + r] !== 0n) degree = BigInt(r);
    assert.equal(degrees[c], degree, `prep_zk_degrees[${c}] is false`); }
  const discDenominator = denominator ** BigInt(2 * n);
  const discNumerator = polynomialDisc * basisDeterminant * basisDeterminant;
  assert.equal(discNumerator % discDenominator, 0n, "basis discriminant is not integral");
  const fieldDiscriminant = discNumerator / discDenominator;
  assert.equal(abs(fieldDiscriminant), abs(integer(input.analytic_discriminant, "analytic_discriminant")),
    "prepared discriminant disagrees with polynomial and basis");
  const index = integer(input.prep_index, "prep_index");
  assert(index > 0n, "prepared index must be positive");
  assert.equal(abs(polynomialDisc), abs(fieldDiscriminant) * index * index,
    "prepared index does not explain the discriminant quotient");

  const tensor = integers(input.basis_table, n ** 3, "basis_table");
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
    const reduced = reduceProduct(basis.slice(n * i, n * (i + 1)), basis.slice(n * j, n * (j + 1)), polynomial, n);
    const coordinates = multiplyMatrixVector(inverse, reduced, n).map((entry, k) => {
      assert.equal(entry % (denominator * denominator), 0n,
        `basis product (${i},${j}) coordinate ${k} is not integral`);
      return entry / (denominator * denominator);
    });
    assert.deepEqual(coordinates, tensor.slice(n * n * i + n * j, n * n * i + n * j + n),
      `basis multiplication tensor is false at (${i},${j})`);
  }

  const matrixM = integers(input.admission_matrix_m, n * n, "admission_matrix_m");
  const matrixP = integers(input.admission_matrix_p, n * n, "admission_matrix_p");
  const matrixE = integers(input.admission_matrix_e, n * n, "admission_matrix_e");
  const packed = integers(input.preparation_embedding, 3 * n * n, "preparation_embedding"), embeddings = [];
  const graphEmbeddings = [];
  for (let i = 0; i < n * n; i += 1) {
    embeddings.push(dyadic(matrixM[i], matrixP[i], matrixE[i]));
    graphEmbeddings.push(dyadic(packed[3 * i], packed[3 * i + 1], packed[3 * i + 2]));
  }
  const storedPrecision = matrixP.filter(x => x > 0n).reduce((a, b) => a < b ? a : b);
  for (let row = 0; row < n; row += 1) {
    const expected = row < Number(realCount) || (row - Number(realCount)) % 2 === 0 ? 1n : 0n;
    assert.deepEqual(embeddings[n * row], { numerator: expected, exponent: 0n },
      `embedding component ${row} does not preserve one`);
    assert.deepEqual(graphEmbeddings[n * row], { numerator: 1n, exponent: 0n },
      `realified embedding row ${row} does not preserve one`);
  }
  const maxTensorBits = Math.max(...tensor.map(bitLength));
  const check = (row, i, j, product, label) => {
    let residual = product;
    for (let k = 0; k < n; k += 1) residual = dyadicAdd(residual,
      dyadicScale(embeddings[n * row + k], -tensor[n * n * i + n * j + k]));
    const operandTop = Math.max(...embeddings.slice(n * row, n * (row + 1))
      .map(x => bitLength(x.numerator) + Number(x.exponent) - 1));
    const bound = BigInt(2 * operandTop - Number(storedPrecision) + maxTensorBits + 10);
    assert(smallEnough(residual, bound), `${label} violates product (${i},${j}) beyond its precision budget`);
  };
  for (let row = 0; row < Number(realCount); row += 1)
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1)
      check(row, i, j, dyadicMultiply(embeddings[n * row + i], embeddings[n * row + j]), `embedding row ${row}`);
  for (let pair = 0; pair < Number(complexCount); pair += 1) {
    const rr = Number(realCount) + 2 * pair, ii = rr + 1;
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
      check(rr, i, j, dyadicAdd(dyadicMultiply(embeddings[n * rr + i], embeddings[n * rr + j]),
        dyadicScale(dyadicMultiply(embeddings[n * ii + i], embeddings[n * ii + j]), -1n)), `complex-real row ${rr}`);
      check(ii, i, j, dyadicAdd(dyadicMultiply(embeddings[n * rr + i], embeddings[n * ii + j]),
        dyadicMultiply(embeddings[n * ii + i], embeddings[n * rr + j])), `complex-imaginary row ${ii}`);
    }
    assert(embeddings.slice(n * ii, n * (ii + 1)).some(x => x.numerator !== 0n),
      `complex embedding ${pair} has zero imaginary part`);
  }
  // nf_get_G stores each complex pair as Re+Im, Re-Im, whereas nf_get_M
  // stores Re, Im. They are independently rounded dyadics, so authenticate
  // the transformation at the declared precision rather than aliasing bytes.
  for (let row = 0; row < Number(realCount); row += 1) for (let column = 0; column < n; column += 1) {
    const residual = dyadicAdd(graphEmbeddings[n * row + column],
      dyadicScale(embeddings[n * row + column], -1n));
    const top = Math.max(bitLength(graphEmbeddings[n * row + column].numerator)
      + Number(graphEmbeddings[n * row + column].exponent) - 1,
    bitLength(embeddings[n * row + column].numerator)
      + Number(embeddings[n * row + column].exponent) - 1);
    assert(smallEnough(residual, BigInt(top - Number(storedPrecision) + 4)),
      `real embedding M/G transformation is false at (${row},${column})`);
  }
  for (let pair = 0; pair < Number(complexCount); pair += 1) {
    const realRow = Number(realCount) + 2 * pair, imaginaryRow = realRow + 1;
    for (let column = 0; column < n; column += 1) for (const [graphRow, sign] of [[realRow, 1n], [imaginaryRow, -1n]]) {
      const expected = dyadicAdd(embeddings[n * realRow + column],
        dyadicScale(embeddings[n * imaginaryRow + column], sign));
      const residual = dyadicAdd(graphEmbeddings[n * graphRow + column], dyadicScale(expected, -1n));
      const top = Math.max(bitLength(graphEmbeddings[n * graphRow + column].numerator)
        + Number(graphEmbeddings[n * graphRow + column].exponent) - 1,
      bitLength(expected.numerator) + Number(expected.exponent) - 1);
      assert(smallEnough(residual, BigInt(top - Number(storedPrecision) + 5)),
        `complex embedding M/G transformation is false at (${graphRow},${column})`);
    }
  }
  const keys = [];
  for (let row = 0; row < Number(realCount); row += 1) keys.push(digest(embeddings.slice(n * row, n * (row + 1))));
  for (let pair = 0; pair < Number(complexCount); pair += 1) { const row = Number(realCount) + 2 * pair;
    keys.push(digest(embeddings.slice(n * row, n * (row + 2)))); }
  assert.equal(new Set(keys).size, keys.length, "prepared archimedean embeddings are duplicated");

  const rounded = integers(input.preparation_rounded_embedding, n * n, "preparation_rounded_embedding");
  const scale = rounded[0];
  assert(scale > 0n && (scale & (scale - 1n)) === 0n, "rounded embedding scale is not a power of two");
  for (let row = 0; row < n; row += 1) for (let column = 0; column < n; column += 1)
    assert.equal(rounded[n * row + column], nearestInteger(dyadicScale(graphEmbeddings[n * row + column], scale)),
      `rounded embedding entry (${row},${column}) is false`);

  const primeLimit = integer(input.admission_prime_limit, "admission_prime_limit");
  const factorLimit = integer(input.admission_factorlimit, "admission_factorlimit");
  assert.equal(primeLimit, 65537n, "admission prime limit is not the audited runtime policy");
  assert.equal(factorLimit, 1048576n, "admission factor limit is not the audited runtime policy");
  const expectedPrimes = primesThrough(Number(primeLimit));
  assert.deepEqual(integers(input.admission_primes, expectedPrimes.length, "admission_primes"), expectedPrimes,
    "admission prime table is not exhaustive");
  const expectedProducts = pariPrimeProducts(expectedPrimes, factorLimit);
  assert.deepEqual(integers(input.admission_products, expectedProducts.length, "admission_products"), expectedProducts,
    "admission product table is not PARI's declared table");
  const expectedAnalyticPrimes = primesThrough(ANALYTIC_PRIME_LIMIT);
  assert.deepEqual(integers(input.analytic_primes, expectedAnalyticPrimes.length, "analytic_primes"), expectedAnalyticPrimes,
    "analytic prime table is not the policy-defined exhaustive table");
  const authority = { schema: SCHEMA, degree: n, signature: [Number(realCount), Number(complexCount)],
    polynomial, polynomialDiscriminant: polynomialDisc, irreducibilityPrime, fieldDiscriminant, index,
    basisDenominator: denominator, basisDeterminant,
    basisSha256: digest({ basis, inverse, degrees, tensor }),
    embeddingSha256: digest({ matrixM, matrixP, matrixE, rounded }),
    runtimeTablesSha256: digest({ expectedPrimes, expectedProducts, expectedAnalyticPrimes }) };
  return Object.freeze({ ...canonical(authority), sha256: digest(authority) });
}

function authenticatePreparedBundle(bundle) {
  return authenticatePreparedNf(normalizePreparedBundle(bundle));
}

module.exports = { ANALYTIC_PRIME_LIMIT, SCHEMA, authenticatePreparedBundle, authenticatePreparedNf,
  countRealRoots, cubicDiscriminant, irreducibleModPrime, normalizePreparedBundle,
  pariPrimeProducts, polynomialDiscriminant, primesThrough };

"use strict";

function exactInteger(value, label) {
  if (typeof value !== "string" || !/^-?(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be an exact decimal integer`);
  }
  return BigInt(value);
}

function integerSquareRoot(value) {
  if (value < 2n) return value;
  let upper = 1n << BigInt(Math.ceil(value.toString(2).length / 2));
  for (;;) {
    const next = (upper + value / upper) / 2n;
    if (next >= upper) return upper;
    upper = next;
  }
}

// Frozen survey v1 calls LMFDB's field index an equation-order index.
// The former is the gcd over all primitive integral generators; it need not
// equal the index of this particular polynomial. Keep the frozen record and
// its digest intact, and derive this diagnostic from disc(f) = index^2 disc(K).
function cubicEquationIndex(record) {
  if (!Array.isArray(record.coefficients) || record.coefficients.length !== 4) {
    throw new Error(`${record.label}: expected four cubic coefficients`);
  }
  const [d, c, b, a] = record.coefficients.map((value) =>
    exactInteger(value, `${record.label}: coefficient`));
  if (a !== 1n) throw new Error(`${record.label}: expected a monic cubic`);
  const fieldDiscriminant = exactInteger(record.discriminant,
    `${record.label}: field discriminant`);
  const polynomialDiscriminant = b * b * c * c - 4n * c * c * c -
    4n * b * b * b * d - 27n * d * d + 18n * b * c * d;
  if (fieldDiscriminant >= 0n || polynomialDiscriminant >= 0n ||
      polynomialDiscriminant % fieldDiscriminant !== 0n) {
    throw new Error(`${record.label}: invalid complex cubic discriminant ratio`);
  }
  const ratio = polynomialDiscriminant / fieldDiscriminant;
  const index = integerSquareRoot(ratio);
  if (index < 1n || index * index !== ratio) {
    throw new Error(`${record.label}: equation-order discriminant ratio is not a square`);
  }
  return index.toString();
}

function cubicIndexDiagnostics(record) {
  return {
    equation_order_index: cubicEquationIndex(record),
    lmfdb_field_index: record.equation_order_index,
  };
}

module.exports = { cubicEquationIndex, cubicIndexDiagnostics };

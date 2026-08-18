"use strict";

const { createHash } = require("node:crypto");

function abs(value) {
  return value < 0n ? -value : value;
}

function gcd(left, right) {
  let a = abs(BigInt(left));
  let b = abs(BigInt(right));
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function lcm(left, right) {
  const a = BigInt(left);
  const b = BigInt(right);
  return a === 0n || b === 0n ? 0n : abs((a / gcd(a, b)) * b);
}

function floorDiv(left, right) {
  if (right <= 0n) throw new RangeError("floorDiv requires a positive divisor");
  let quotient = left / right;
  const remainder = left % right;
  if (remainder < 0n) quotient -= 1n;
  return quotient;
}

function extendedGcd(left, right) {
  let oldR = BigInt(left);
  let r = BigInt(right);
  let oldS = 1n;
  let s = 0n;
  let oldT = 0n;
  let t = 1n;
  while (r !== 0n) {
    const quotient = oldR / r;
    [oldR, r] = [r, oldR - quotient * r];
    [oldS, s] = [s, oldS - quotient * s];
    [oldT, t] = [t, oldT - quotient * t];
  }
  if (oldR < 0n) return [-oldR, -oldS, -oldT];
  return [oldR, oldS, oldT];
}

function rational(numerator, denominator = 1n) {
  let n = BigInt(numerator);
  let d = BigInt(denominator);
  if (d === 0n) throw new RangeError("zero rational denominator");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const divisor = gcd(n, d);
  return { n: n / divisor, d: d / divisor };
}

function parseRational(value) {
  if (typeof value === "object" && value !== null && "n" in value && "d" in value) {
    return rational(value.n, value.d);
  }
  const text = String(value).trim();
  if (!/^[+-]?\d+(?:\/[+-]?\d+)?$/.test(text)) {
    throw new TypeError(`invalid rational ${JSON.stringify(text)}`);
  }
  const [numerator, denominator = "1"] = text.split("/");
  return rational(numerator, denominator);
}

function formatRational(value) {
  const q = parseRational(value);
  return q.d === 1n ? String(q.n) : `${q.n}/${q.d}`;
}

function add(left, right) {
  const a = parseRational(left);
  const b = parseRational(right);
  return rational(a.n * b.d + b.n * a.d, a.d * b.d);
}

function subtract(left, right) {
  const b = parseRational(right);
  return add(left, { n: -b.n, d: b.d });
}

function multiply(left, right) {
  const a = parseRational(left);
  const b = parseRational(right);
  return rational(a.n * b.n, a.d * b.d);
}

function divide(left, right) {
  const b = parseRational(right);
  if (b.n === 0n) throw new RangeError("division by zero");
  return multiply(left, { n: b.d, d: b.n });
}

function isZero(value) {
  return parseRational(value).n === 0n;
}

function isInteger(value) {
  return parseRational(value).d === 1n;
}

function assertSquareMatrix(matrix, label = "matrix") {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new TypeError(`${label} must be a nonempty matrix`);
  }
  const size = matrix.length;
  if (matrix.some((row) => !Array.isArray(row) || row.length !== size)) {
    throw new TypeError(`${label} must be square`);
  }
  return size;
}

function determinant(matrix) {
  const size = assertSquareMatrix(matrix);
  const work = matrix.map((row) => row.map(parseRational));
  let result = rational(1n);
  for (let column = 0; column < size; column += 1) {
    const pivot = work.findIndex((row, index) => index >= column && !isZero(row[column]));
    if (pivot < 0) return rational(0n);
    if (pivot !== column) {
      [work[pivot], work[column]] = [work[column], work[pivot]];
      result = multiply(result, -1n);
    }
    const diagonal = work[column][column];
    result = multiply(result, diagonal);
    for (let row = column + 1; row < size; row += 1) {
      if (isZero(work[row][column])) continue;
      const scale = divide(work[row][column], diagonal);
      for (let index = column; index < size; index += 1) {
        work[row][index] = subtract(work[row][index], multiply(scale, work[column][index]));
      }
    }
  }
  return result;
}

function inverse(matrix) {
  const size = assertSquareMatrix(matrix);
  const work = matrix.map((row, rowIndex) => [
    ...row.map(parseRational),
    ...Array.from({ length: size }, (_, column) => rational(rowIndex === column ? 1n : 0n)),
  ]);
  for (let column = 0; column < size; column += 1) {
    const pivot = work.findIndex((row, index) => index >= column && !isZero(row[column]));
    if (pivot < 0) throw new RangeError("singular matrix");
    [work[pivot], work[column]] = [work[column], work[pivot]];
    const scale = work[column][column];
    work[column] = work[column].map((entry) => divide(entry, scale));
    for (let row = 0; row < size; row += 1) {
      if (row === column || isZero(work[row][column])) continue;
      const factor = work[row][column];
      work[row] = work[row].map((entry, index) => subtract(entry, multiply(factor, work[column][index])));
    }
  }
  return work.map((row) => row.slice(size));
}

function rowTimesMatrix(row, matrix) {
  return matrix[0].map((_, column) => row.reduce(
    (sum, entry, index) => add(sum, multiply(entry, matrix[index][column])),
    rational(0n),
  ));
}

function rowHermite(integerMatrix) {
  const size = assertSquareMatrix(integerMatrix, "integer matrix");
  const rows = integerMatrix.map((row) => row.map((entry) => BigInt(entry)));
  for (let column = 0; column < size; column += 1) {
    let pivot = rows.findIndex((row, index) => index >= column && row[column] !== 0n);
    if (pivot < 0) throw new RangeError("singular integer matrix");
    [rows[pivot], rows[column]] = [rows[column], rows[pivot]];
    for (let row = column + 1; row < size; row += 1) {
      if (rows[row][column] === 0n) continue;
      const a = rows[column][column];
      const b = rows[row][column];
      const [divisor, s, t] = extendedGcd(a, b);
      const oldPivot = rows[column];
      const oldRow = rows[row];
      rows[column] = oldPivot.map((entry, index) => s * entry + t * oldRow[index]);
      rows[row] = oldPivot.map(
        (entry, index) => (-b / divisor) * entry + (a / divisor) * oldRow[index],
      );
    }
    if (rows[column][column] < 0n) {
      rows[column] = rows[column].map((entry) => -entry);
    }
    const diagonal = rows[column][column];
    for (let row = 0; row < column; row += 1) {
      const quotient = floorDiv(rows[row][column], diagonal);
      rows[row] = rows[row].map((entry, index) => entry - quotient * rows[column][index]);
    }
  }
  return rows;
}

function canonicalBasis(matrix) {
  assertSquareMatrix(matrix, "basis");
  const parsed = matrix.map((row) => row.map(parseRational));
  let denominator = 1n;
  for (const row of parsed) {
    for (const entry of row) denominator = lcm(denominator, entry.d);
  }
  let numerator = parsed.map((row) => row.map((entry) => entry.n * (denominator / entry.d)));
  // The shared maximal-order corpus uses lower-left row HNF. Reverse both
  // ambient coordinates and generators, compute the upper-right form, then
  // undo both reversals. Column reversal is only an implementation device;
  // the returned coordinates remain in ascending defining-power order.
  numerator = rowHermite(
    numerator.slice().reverse().map((row) => row.slice().reverse()),
  ).reverse().map((row) => row.reverse());
  let common = denominator;
  for (const row of numerator) {
    for (const entry of row) common = gcd(common, entry);
  }
  numerator = numerator.map((row) => row.map((entry) => entry / common));
  denominator /= common;
  const serialized = {
    denominator: String(denominator),
    numerator: numerator.map((row) => row.map(String)),
  };
  return {
    ...serialized,
    digest: createHash("sha256")
      .update(`sagejs-maximal-order-hnf-v1\n${JSON.stringify(serialized)}`)
      .digest("hex"),
  };
}

function polynomialDigest(coefficients) {
  const normalized = coefficients.map((coefficient) => String(BigInt(coefficient)));
  return createHash("sha256")
    .update(`sagejs-number-field-polynomial-v1\n${JSON.stringify(normalized)}`)
    .digest("hex");
}

module.exports = {
  abs,
  add,
  assertSquareMatrix,
  canonicalBasis,
  determinant,
  divide,
  formatRational,
  gcd,
  inverse,
  isInteger,
  isZero,
  lcm,
  multiply,
  parseRational,
  polynomialDigest,
  rational,
  rowHermite,
  rowTimesMatrix,
  subtract,
};

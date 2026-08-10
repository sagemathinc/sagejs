"use strict";

const binding = require("./build/Release/sagejs_flint.node");

function ffiDimension(value, name) {
  const exact = typeof value === "bigint" ? value : BigInt(value);
  if (exact < 0n || exact > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${name} is outside the supported matrix dimension range`);
  }
  return Number(exact);
}

function ffiEntries(source, expected, name) {
  if (source === null || (typeof source !== "object" &&
      typeof source !== "function")) {
    throw new TypeError(`${name} must be a packed uint64 buffer`);
  }
  const length = Number(Reflect.get(source, "length"));
  if (!Number.isSafeInteger(length) || length !== expected) {
    throw new RangeError(`${name} length does not match matrix dimensions`);
  }
  return Array.from(source, (value) => BigInt(value));
}

function ffiNmodMatrix(source, rows, columns, modulus, name) {
  const count = rows * columns;
  if (source instanceof BigUint64Array) {
    if (source.length !== count) {
      throw new RangeError(`${name} length does not match matrix dimensions`);
    }
    const words = new Uint32Array(source.length);
    const modulusBigInt = BigInt(modulus);
    for (let index = 0; index < source.length; index += 1) {
      // Match the isolated adapter: UInt64Buffer inputs are exact values,
      // not an implicit promise that every caller supplied a canonical
      // 32-bit residue already.
      words[index] = Number(source[index] % modulusBigInt);
    }
    const bytes = new Uint8Array(words.buffer);
    return binding.nmodMatrixPacked(
      rows, columns, bytes, 4, BigInt(modulus),
    );
  }
  return binding.nmodMatrix(
    rows, columns, ffiEntries(source, count, name), BigInt(modulus),
  );
}

/* Dynamic oracle adapters for declaration-driven packed nmod_mat calls.
 * Mathematical execution remains in FLINT.  The generated native path builds
 * the same lexical nmod_mat_t values directly inside its isolated core.
 */
binding.ffiNmodMatRank = function ffiNmodMatRank(
  entries, rowsValue, columnsValue, modulus,
) {
  const rows = ffiDimension(rowsValue, "rows");
  const columns = ffiDimension(columnsValue, "columns");
  const count = rows * columns;
  if (!Number.isSafeInteger(count)) throw new RangeError("matrix is too large");
  const matrix = ffiNmodMatrix(
    entries, rows, columns, modulus, "entries",
  );
  return BigInt(binding.matrixRank(matrix));
};

binding.ffiNmodMatInv = function ffiNmodMatInv(
  output, source, sizeValue, modulus,
) {
  const size = ffiDimension(sizeValue, "size");
  const count = size * size;
  if (!Number.isSafeInteger(count)) throw new RangeError("matrix is too large");
  ffiEntries(output, count, "output");
  const matrix = ffiNmodMatrix(source, size, size, modulus, "source");
  let inverse;
  try {
    inverse = binding.matrixInverse(matrix);
  } catch (error) {
    if (String(error?.message || error).includes("singular")) return false;
    throw error;
  }
  ffiWriteMatrix(output, inverse, size, size);
  return true;
};

function ffiWriteMatrix(output, matrix, rows, columns) {
  if (output instanceof BigUint64Array) {
    if (output.length !== rows * columns) {
      throw new RangeError("output length does not match matrix dimensions");
    }
    const bytes = binding.matrixExportPacked(matrix, 4);
    const words = new Uint32Array(
      bytes.buffer, bytes.byteOffset, bytes.byteLength / 4,
    );
    for (let index = 0; index < output.length; index += 1) {
      output[index] = BigInt(words[index]);
    }
    return;
  }
  ffiEntries(output, rows * columns, "output");
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const value = binding.matrixEntry(matrix, row, column);
      if (!Reflect.set(
        output,
        String(row * columns + column),
        BigInt(value),
      )) {
        throw new TypeError("output buffer is not writable");
      }
    }
  }
}

binding.ffiNmodMatRref = function ffiNmodMatRref(
  output, source, rowsValue, columnsValue, modulus,
) {
  const rows = ffiDimension(rowsValue, "rows");
  const columns = ffiDimension(columnsValue, "columns");
  const count = rows * columns;
  if (!Number.isSafeInteger(count)) throw new RangeError("matrix is too large");
  const matrix = ffiNmodMatrix(source, rows, columns, modulus, "source");
  const rank = binding.matrixRank(matrix);
  ffiWriteMatrix(output, binding.matrixRref(matrix), rows, columns);
  return BigInt(rank);
};

binding.ffiNmodMatMul = function ffiNmodMatMul(
  output, left, right, leftRowsValue, innerValue, rightColumnsValue, modulus,
) {
  const leftRows = ffiDimension(leftRowsValue, "left_rows");
  const inner = ffiDimension(innerValue, "inner");
  const rightColumns = ffiDimension(rightColumnsValue, "right_columns");
  const leftCount = leftRows * inner;
  const rightCount = inner * rightColumns;
  const outputCount = leftRows * rightColumns;
  if (!Number.isSafeInteger(leftCount) ||
      !Number.isSafeInteger(rightCount) ||
      !Number.isSafeInteger(outputCount)) {
    throw new RangeError("matrix is too large");
  }
  ffiEntries(output, outputCount, "output");
  const leftMatrix = ffiNmodMatrix(
    left, leftRows, inner, modulus, "left",
  );
  const rightMatrix = ffiNmodMatrix(
    right, inner, rightColumns, modulus, "right",
  );
  ffiWriteMatrix(
    output,
    binding.matrixMul(leftMatrix, rightMatrix),
    leftRows,
    rightColumns,
  );
  return true;
};

binding.ffiNmodMatRightKernel = function ffiNmodMatRightKernel(
  output, source, rowsValue, columnsValue, modulus,
) {
  const rows = ffiDimension(rowsValue, "rows");
  const columns = ffiDimension(columnsValue, "columns");
  const count = rows * columns;
  if (!Number.isSafeInteger(count) ||
      !Number.isSafeInteger(columns * columns)) {
    throw new RangeError("matrix is too large");
  }
  const matrix = ffiNmodMatrix(source, rows, columns, modulus, "source");
  const basis = binding.matrixRightKernel(matrix);
  const nullity = columns - binding.matrixRank(matrix);
  if (output.length !== columns * columns) {
    throw new RangeError("output length does not match matrix dimensions");
  }
  if (output instanceof BigUint64Array) output.fill(0n);
  else {
    for (let index = 0; index < columns * columns; index += 1) {
      if (!Reflect.set(output, String(index), 0n)) {
        throw new TypeError("output buffer is not writable");
      }
    }
  }
  if (output instanceof BigUint64Array) {
    const bytes = binding.matrixExportPacked(basis, 4);
    const words = new Uint32Array(
      bytes.buffer, bytes.byteOffset, bytes.byteLength / 4,
    );
    for (let index = 0; index < words.length; index += 1) {
      output[index] = BigInt(words[index]);
    }
    return BigInt(nullity);
  }
  for (let row = 0; row < nullity; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (!Reflect.set(
        output,
        String(row * columns + column),
        BigInt(binding.matrixEntry(basis, row, column)),
      )) {
        throw new TypeError("output buffer is not writable");
      }
    }
  }
  return BigInt(nullity);
};

binding.ffiNmodMatSolve = function ffiNmodMatSolve(
  output, left, right, sizeValue, rightColumnsValue, modulus,
) {
  const size = ffiDimension(sizeValue, "size");
  const rightColumns = ffiDimension(rightColumnsValue, "right_columns");
  const leftCount = size * size;
  const rightCount = size * rightColumns;
  if (!Number.isSafeInteger(leftCount) || !Number.isSafeInteger(rightCount)) {
    throw new RangeError("matrix is too large");
  }
  const leftMatrix = ffiNmodMatrix(
    left, size, size, modulus, "left",
  );
  const rightMatrix = ffiNmodMatrix(
    right, size, rightColumns, modulus, "right",
  );
  let solution;
  try {
    solution = binding.matrixSolve(leftMatrix, rightMatrix);
  } catch (error) {
    if (String(error?.message || error).includes("singular")) return false;
    throw error;
  }
  ffiWriteMatrix(output, solution, size, rightColumns);
  return true;
};

function ffiNmodPolynomial(coefficients, modulus) {
  const x = binding.nmodPolyGen(modulus);
  let result = binding.nmodPolyConstant(0n, modulus);
  for (let index = coefficients.length - 1; index >= 0; index -= 1) {
    result = binding.polyAdd(
      binding.polyMul(result, x),
      binding.nmodPolyConstant(coefficients[index], modulus),
    );
  }
  return result;
}

/* A second substantial FLINT migration through the generic packed-slice ABI.
 * The dynamic path deliberately uses existing safe polynomial objects as its
 * differential oracle; native kernels call the packed host-neutral adapter. */
binding.ffiNmodPolyMul = function ffiNmodPolyMul(
  output, left, right, outputLengthValue, leftLengthValue, rightLengthValue,
  modulusValue,
) {
  const outputLength = ffiDimension(outputLengthValue, "output_length");
  const leftLength = ffiDimension(leftLengthValue, "left_length");
  const rightLength = ffiDimension(rightLengthValue, "right_length");
  const expected = leftLength === 0 || rightLength === 0
    ? 0 : leftLength + rightLength - 1;
  if (!Number.isSafeInteger(expected) || outputLength !== expected) return false;
  ffiEntries(output, outputLength, "output");
  const leftEntries = ffiEntries(left, leftLength, "left");
  const rightEntries = ffiEntries(right, rightLength, "right");
  const modulus = BigInt(modulusValue);
  if (!binding.wordIsPrime(modulus)) return false;
  const product = binding.polyMul(
    ffiNmodPolynomial(leftEntries, modulus),
    ffiNmodPolynomial(rightEntries, modulus),
  );
  const coefficients = binding.polyCoefficients(product);
  const staged = Array.from({ length: outputLength }, (_, index) =>
    BigInt(coefficients[index] ?? 0n));
  for (let index = 0; index < outputLength; index += 1) {
    if (!Reflect.set(output, String(index), staged[index])) {
      throw new TypeError("output buffer is not writable");
    }
  }
  return true;
};

/* Generated-resource adapters keep the public declaration surface independent
 * of the older high-level package naming.  Only the close adapter owns a
 * lifetime transition; borrowed queries never retain the handle.
 */
binding.ffiDirichletGroupCreate = binding.dirichletGroup;
binding.ffiDirichletGroupClose = binding.dirichletGroupClose;
binding.ffiDirichletGroupSize = function ffiDirichletGroupSize(group) {
  return BigInt(binding.dirichletGroupData(group).size);
};
binding.ffiDirichletGroupNumPrimitive =
function ffiDirichletGroupNumPrimitive(group) {
  return BigInt(binding.dirichletGroupData(group).numberPrimitive);
};

module.exports = binding;

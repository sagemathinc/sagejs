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
  const matrix = binding.nmodMatrix(
    rows, columns, ffiEntries(entries, count, "entries"), BigInt(modulus),
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
  const matrix = binding.nmodMatrix(
    size, size, ffiEntries(source, count, "source"), BigInt(modulus),
  );
  let inverse;
  try {
    inverse = binding.matrixInverse(matrix);
  } catch (error) {
    if (String(error?.message || error).includes("singular")) return false;
    throw error;
  }
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const value = binding.matrixEntry(inverse, row, column);
      if (!Reflect.set(output, String(row * size + column), BigInt(value))) {
        throw new TypeError("output buffer is not writable");
      }
    }
  }
  return true;
};

module.exports = binding;

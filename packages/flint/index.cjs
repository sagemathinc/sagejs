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

function ffiIntegerBuffer(source, expected, name) {
  if (source === null || (typeof source !== "object" &&
      typeof source !== "function")) {
    throw new TypeError(`${name} must be a packed exact-integer buffer`);
  }
  const length = Number(Reflect.get(source, "length"));
  if (!Number.isSafeInteger(length) || length !== expected) {
    throw new RangeError(`${name} length does not match matrix dimensions`);
  }
  const sizes = Reflect.get(source, "sizes");
  const limbs = Reflect.get(source, "limbs");
  const wordCapacity = Number(Reflect.get(source, "wordCapacity"));
  if (sizes instanceof Int32Array && limbs instanceof BigUint64Array &&
      Number.isSafeInteger(wordCapacity) && wordCapacity > 0 &&
      sizes.length === length && limbs.length === length * wordCapacity) {
    return { source, sizes, limbs, length, wordCapacity, packed: true };
  }
  return { source, length, packed: false };
}

function ffiIntegerEntries(source, expected, name) {
  const buffer = ffiIntegerBuffer(source, expected, name);
  if (!buffer.packed) return Array.from(source, (value) => BigInt(value));
  const answer = new Array(expected);
  for (let index = 0; index < expected; index += 1) {
    const signedSize = buffer.sizes[index];
    const count = Math.abs(signedSize);
    let value = 0n;
    for (let word = count - 1; word >= 0; word -= 1) {
      value = (value << 64n) |
        buffer.limbs[index * buffer.wordCapacity + word];
    }
    answer[index] = signedSize < 0 ? -value : value;
  }
  return answer;
}

function ffiPrepareIntegerWrite(output, values, name = "output") {
  const buffer = ffiIntegerBuffer(output, values.length, name);
  const staged = values.map((value) => BigInt(value));
  if (buffer.packed) {
    for (const value of staged) {
      const magnitude = value < 0n ? -value : value;
      const words = magnitude === 0n
        ? 0 : Math.ceil(magnitude.toString(2).length / 64);
      if (words > buffer.wordCapacity) {
        throw new RangeError("IntegerBuffer word capacity exceeded");
      }
    }
  }
  return { buffer, staged, output, name };
}

function ffiCommitIntegerWrite(prepared) {
  const { buffer, staged, output, name } = prepared;
  if (!buffer.packed) {
    for (let index = 0; index < staged.length; index += 1) {
      if (!Reflect.set(output, String(index), staged[index])) {
        throw new TypeError(`${name} buffer is not writable`);
      }
    }
    return;
  }
  buffer.limbs.fill(0n);
  for (let index = 0; index < staged.length; index += 1) {
    const value = staged[index];
    let magnitude = value < 0n ? -value : value;
    let words = 0;
    while (magnitude !== 0n) {
      buffer.limbs[index * buffer.wordCapacity + words] =
        magnitude & 0xffffffffffffffffn;
      magnitude >>= 64n;
      words += 1;
    }
    buffer.sizes[index] = value < 0n ? -words : words;
  }
}

function ffiWriteIntegers(output, values, name = "output") {
  ffiCommitIntegerWrite(ffiPrepareIntegerWrite(output, values, name));
}

function ffiFmpzMatrix(source, rows, columns, name) {
  const count = rows * columns;
  if (!Number.isSafeInteger(count)) throw new RangeError("matrix is too large");
  return binding.zzMatrix(
    rows, columns, ffiIntegerEntries(source, count, name),
  );
}

function ffiWriteFmpzMatrix(output, matrix, rows, columns, name = "output") {
  const values = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      values.push(BigInt(binding.matrixEntry(matrix, row, column)));
    }
  }
  ffiWriteIntegers(output, values, name);
}

binding.ffiFmpzMatRank = function ffiFmpzMatRank(
  entries, rowsValue, columnsValue,
) {
  const rows = ffiDimension(rowsValue, "rows");
  const columns = ffiDimension(columnsValue, "columns");
  return BigInt(binding.matrixRank(
    ffiFmpzMatrix(entries, rows, columns, "entries"),
  ));
};

binding.ffiFmpzMatMul = function ffiFmpzMatMul(
  output, left, right, leftRowsValue, innerValue, rightColumnsValue,
) {
  const leftRows = ffiDimension(leftRowsValue, "left_rows");
  const inner = ffiDimension(innerValue, "inner");
  const rightColumns = ffiDimension(rightColumnsValue, "right_columns");
  const product = binding.matrixMul(
    ffiFmpzMatrix(left, leftRows, inner, "left"),
    ffiFmpzMatrix(right, inner, rightColumns, "right"),
  );
  ffiWriteFmpzMatrix(output, product, leftRows, rightColumns);
  return true;
};

binding.ffiFmpzMatDet = function ffiFmpzMatDet(
  output, source, sizeValue, oneValue,
) {
  const size = ffiDimension(sizeValue, "size");
  const one = ffiDimension(oneValue, "one");
  if (one !== 1) return false;
  ffiWriteIntegers(output, [
    BigInt(binding.matrixDet(ffiFmpzMatrix(source, size, size, "source"))),
  ]);
  return true;
};

binding.ffiFmpzMatCharpoly = function ffiFmpzMatCharpoly(
  output, source, outputLengthValue, sizeValue, oneValue,
) {
  const outputLength = ffiDimension(outputLengthValue, "output_length");
  const size = ffiDimension(sizeValue, "size");
  const one = ffiDimension(oneValue, "one");
  if (one !== 1 || outputLength !== size + 1) return false;
  const coefficients = binding.matrixCharpoly(
    ffiFmpzMatrix(source, size, size, "source"),
  );
  ffiWriteIntegers(output, coefficients.map((value) => BigInt(value)));
  return true;
};

binding.ffiFmpzMatHnf = function ffiFmpzMatHnf(
  output, source, rowsValue, columnsValue,
) {
  const rows = ffiDimension(rowsValue, "rows");
  const columns = ffiDimension(columnsValue, "columns");
  const answer = binding.matrixHermite(
    ffiFmpzMatrix(source, rows, columns, "source"),
  );
  ffiWriteFmpzMatrix(output, answer, rows, columns);
  return true;
};

binding.ffiFmpzMatHnfTransform = function ffiFmpzMatHnfTransform(
  output, transform, source, rowsValue, columnsValue,
) {
  const rows = ffiDimension(rowsValue, "rows");
  const columns = ffiDimension(columnsValue, "columns");
  const answer = binding.matrixHermiteTransform(
    ffiFmpzMatrix(source, rows, columns, "source"),
  );
  ffiWriteFmpzMatrix(output, answer[0], rows, columns, "output");
  ffiWriteFmpzMatrix(transform, answer[1], rows, rows, "transform");
  return true;
};

binding.ffiFmpzMatSnfTransform = function ffiFmpzMatSnfTransform(
  output, leftTransform, rightTransform, source, rowsValue, columnsValue,
) {
  const rows = ffiDimension(rowsValue, "rows");
  const columns = ffiDimension(columnsValue, "columns");
  const answer = binding.matrixSmith(
    ffiFmpzMatrix(source, rows, columns, "source"),
  );
  ffiWriteFmpzMatrix(output, answer[0], rows, columns, "output");
  ffiWriteFmpzMatrix(leftTransform, answer[1], rows, rows, "left_transform");
  ffiWriteFmpzMatrix(
    rightTransform, answer[2], columns, columns, "right_transform",
  );
  return true;
};

binding.ffiFmpzMatRightKernel = function ffiFmpzMatRightKernel(
  output, source, rowsValue, columnsValue,
) {
  const rows = ffiDimension(rowsValue, "rows");
  const columns = ffiDimension(columnsValue, "columns");
  const sourceMatrix = ffiFmpzMatrix(source, rows, columns, "source");
  const rank = binding.matrixRank(sourceMatrix);
  const nullity = columns - rank;
  const basis = binding.matrixRightKernel(sourceMatrix);
  const values = Array.from(
    { length: columns * columns }, () => 0n,
  );
  for (let row = 0; row < nullity; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      values[row * columns + column] = BigInt(
        binding.matrixEntry(basis, row, column),
      );
    }
  }
  ffiWriteIntegers(output, values);
  return BigInt(nullity);
};

function ffiFmpqMatrix(
  numerators, denominators, rows, columns, name,
) {
  const count = rows * columns;
  if (!Number.isSafeInteger(count)) throw new RangeError("matrix is too large");
  const numeratorValues = ffiIntegerEntries(
    numerators, count, `${name}_numerators`);
  const denominatorValues = ffiIntegerEntries(
    denominators, count, `${name}_denominators`);
  return binding.qqMatrix(
    rows,
    columns,
    numeratorValues.map((numerator, index) => [
      numerator,
      denominatorValues[index],
    ]),
  );
}

function ffiPrepareFmpqMatrixWrite(
  outputNumerators, outputDenominators, matrix, rows, columns,
) {
  const numerators = [];
  const denominators = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const value = binding.matrixEntry(matrix, row, column);
      numerators.push(BigInt(value.numerator));
      denominators.push(BigInt(value.denominator));
    }
  }
  // Stage and preflight both components before either caller-owned buffer is
  // modified.  This matches the isolated adapter's transactional contract.
  return [ffiPrepareIntegerWrite(
    outputNumerators, numerators, "output_numerators"),
    ffiPrepareIntegerWrite(
      outputDenominators, denominators, "output_denominators")];
}

function ffiCommitFmpqMatrixWrite(prepared) {
  ffiCommitIntegerWrite(prepared[0]);
  ffiCommitIntegerWrite(prepared[1]);
}

function ffiWriteFmpqMatrix(
  outputNumerators, outputDenominators, matrix, rows, columns,
) {
  ffiCommitFmpqMatrixWrite(ffiPrepareFmpqMatrixWrite(
    outputNumerators, outputDenominators, matrix, rows, columns));
}

binding.ffiFmpqMatRank = function ffiFmpqMatRank(
  outputRank, numerators, denominators, rowsValue, columnsValue, oneValue,
) {
  const rows = ffiDimension(rowsValue, "rows");
  const columns = ffiDimension(columnsValue, "columns");
  const one = ffiDimension(oneValue, "one");
  if (one !== 1) return false;
  const rankWrite = ffiPrepareIntegerWrite(outputRank, [BigInt(
    binding.matrixRank(ffiFmpqMatrix(
      numerators, denominators, rows, columns, "source")),
  )], "rank");
  ffiCommitIntegerWrite(rankWrite);
  return true;
};

binding.ffiFmpqMatMul = function ffiFmpqMatMul(
  outputNumerators,
  outputDenominators,
  leftNumerators,
  leftDenominators,
  rightNumerators,
  rightDenominators,
  leftRowsValue,
  innerValue,
  rightColumnsValue,
) {
  const leftRows = ffiDimension(leftRowsValue, "left_rows");
  const inner = ffiDimension(innerValue, "inner");
  const rightColumns = ffiDimension(rightColumnsValue, "right_columns");
  const product = binding.matrixMul(
    ffiFmpqMatrix(
      leftNumerators, leftDenominators, leftRows, inner, "left"),
    ffiFmpqMatrix(
      rightNumerators, rightDenominators, inner, rightColumns, "right"),
  );
  ffiWriteFmpqMatrix(
    outputNumerators, outputDenominators,
    product, leftRows, rightColumns,
  );
  return true;
};

binding.ffiFmpqMatRref = function ffiFmpqMatRref(
  outputRank,
  outputNumerators,
  outputDenominators,
  sourceNumerators,
  sourceDenominators,
  rowsValue,
  columnsValue,
  oneValue,
) {
  const rows = ffiDimension(rowsValue, "rows");
  const columns = ffiDimension(columnsValue, "columns");
  const one = ffiDimension(oneValue, "one");
  if (one !== 1) return false;
  const source = ffiFmpqMatrix(
    sourceNumerators, sourceDenominators, rows, columns, "source");
  const rank = binding.matrixRank(source);
  const matrixWrite = ffiPrepareFmpqMatrixWrite(
    outputNumerators, outputDenominators,
    binding.matrixRref(source), rows, columns,
  );
  const rankWrite = ffiPrepareIntegerWrite(
    outputRank, [BigInt(rank)], "rank");
  ffiCommitFmpqMatrixWrite(matrixWrite);
  ffiCommitIntegerWrite(rankWrite);
  return true;
};

binding.ffiFmpqMatInv = function ffiFmpqMatInv(
  outputNumerators,
  outputDenominators,
  sourceNumerators,
  sourceDenominators,
  sizeValue,
) {
  const size = ffiDimension(sizeValue, "size");
  let inverse;
  try {
    inverse = binding.matrixInverse(ffiFmpqMatrix(
      sourceNumerators, sourceDenominators, size, size, "source"));
  } catch (error) {
    if (String(error?.message || error).includes("singular")) return false;
    throw error;
  }
  ffiWriteFmpqMatrix(
    outputNumerators, outputDenominators, inverse, size, size);
  return true;
};

binding.ffiFmpqMatSolve = function ffiFmpqMatSolve(
  outputNumerators,
  outputDenominators,
  leftNumerators,
  leftDenominators,
  rightNumerators,
  rightDenominators,
  sizeValue,
  rightColumnsValue,
) {
  const size = ffiDimension(sizeValue, "size");
  const rightColumns = ffiDimension(rightColumnsValue, "right_columns");
  let solution;
  try {
    solution = binding.matrixSolve(
      ffiFmpqMatrix(
        leftNumerators, leftDenominators, size, size, "left"),
      ffiFmpqMatrix(
        rightNumerators, rightDenominators,
        size, rightColumns, "right"),
    );
  } catch (error) {
    if (String(error?.message || error).includes("singular")) return false;
    throw error;
  }
  ffiWriteFmpqMatrix(
    outputNumerators, outputDenominators,
    solution, size, rightColumns,
  );
  return true;
};

binding.ffiFmpqMatDet = function ffiFmpqMatDet(
  outputNumerators,
  outputDenominators,
  sourceNumerators,
  sourceDenominators,
  sizeValue,
  oneValue,
) {
  const size = ffiDimension(sizeValue, "size");
  const one = ffiDimension(oneValue, "one");
  if (one !== 1) return false;
  const value = binding.matrixDet(ffiFmpqMatrix(
    sourceNumerators, sourceDenominators, size, size, "source"));
  const numeratorWrite = ffiPrepareIntegerWrite(
    outputNumerators, [BigInt(value.numerator)], "output_numerators");
  const denominatorWrite = ffiPrepareIntegerWrite(
    outputDenominators, [BigInt(value.denominator)], "output_denominators");
  ffiCommitIntegerWrite(numeratorWrite);
  ffiCommitIntegerWrite(denominatorWrite);
  return true;
};

binding.ffiFmpqMatCharpoly = function ffiFmpqMatCharpoly(
  outputNumerators,
  outputDenominators,
  sourceNumerators,
  sourceDenominators,
  coefficientCountValue,
  sizeValue,
  oneValue,
) {
  const coefficientCount = ffiDimension(
    coefficientCountValue, "coefficient_count");
  const size = ffiDimension(sizeValue, "size");
  const one = ffiDimension(oneValue, "one");
  if (one !== 1 || coefficientCount !== size + 1) return false;
  const coefficients = binding.matrixCharpoly(ffiFmpqMatrix(
    sourceNumerators, sourceDenominators, size, size, "source"));
  const numerators = coefficients.map((value) => BigInt(value.numerator));
  const denominators = coefficients.map((value) => BigInt(value.denominator));
  const numeratorWrite = ffiPrepareIntegerWrite(
    outputNumerators, numerators, "output_numerators");
  const denominatorWrite = ffiPrepareIntegerWrite(
    outputDenominators, denominators, "output_denominators");
  ffiCommitIntegerWrite(numeratorWrite);
  ffiCommitIntegerWrite(denominatorWrite);
  return true;
};

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

binding.ffiNmodMatDet = function ffiNmodMatDet(
  source, sizeValue, modulus,
) {
  const size = ffiDimension(sizeValue, "size");
  const count = size * size;
  if (!Number.isSafeInteger(count)) throw new RangeError("matrix is too large");
  return BigInt(binding.matrixDet(
    ffiNmodMatrix(source, size, size, modulus, "source"),
  ));
};

binding.ffiNmodMatCharpoly = function ffiNmodMatCharpoly(
  output, source, outputLengthValue, sourceLengthValue, sizeValue, modulus,
) {
  const outputLength = ffiDimension(outputLengthValue, "output_length");
  const sourceLength = ffiDimension(sourceLengthValue, "source_length");
  const size = ffiDimension(sizeValue, "size");
  if (!Number.isSafeInteger(size * size) || sourceLength !== size * size ||
      outputLength !== size + 1) return false;
  ffiEntries(output, outputLength, "output");
  const coefficients = binding.matrixCharpoly(
    ffiNmodMatrix(source, size, size, modulus, "source"),
  );
  for (let index = 0; index < outputLength; index += 1) {
    if (!Reflect.set(output, String(index), BigInt(coefficients[index]))) {
      throw new TypeError("output buffer is not writable");
    }
  }
  return true;
};

binding.ffiNmodMatMinpoly = function ffiNmodMatMinpoly(
  output, source, outputLengthValue, sourceLengthValue, sizeValue, modulus,
) {
  const outputLength = ffiDimension(outputLengthValue, "output_length");
  const sourceLength = ffiDimension(sourceLengthValue, "source_length");
  const size = ffiDimension(sizeValue, "size");
  if (!Number.isSafeInteger(size * size) || sourceLength !== size * size ||
      outputLength !== size + 1) return false;
  ffiEntries(output, outputLength, "output");
  const coefficients = binding.matrixMinpoly(
    ffiNmodMatrix(source, size, size, modulus, "source"),
  );
  for (let index = 0; index < outputLength; index += 1) {
    if (!Reflect.set(
      output,
      String(index),
      BigInt(coefficients[index] ?? 0n),
    )) {
      throw new TypeError("output buffer is not writable");
    }
  }
  return true;
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

function ffiFmpzPolynomial(coefficients) {
  const x = binding.zzPolyGen();
  let result = binding.zzPolyConstant(0n);
  for (let index = coefficients.length - 1; index >= 0; index -= 1) {
    result = binding.polyAdd(
      binding.polyMul(result, x),
      binding.zzPolyConstant(coefficients[index]),
    );
  }
  return result;
}

function ffiFmpqPolynomial(numerators, denominators) {
  const x = binding.qqPolyGen();
  let result = binding.qqPolyConstant(0n, 1n);
  for (let index = numerators.length - 1; index >= 0; index -= 1) {
    result = binding.polyAdd(
      binding.polyMul(result, x),
      binding.qqPolyConstant(numerators[index], denominators[index]),
    );
  }
  return result;
}

binding.ffiFmpzPolyMul = function ffiFmpzPolyMul(
  output, left, right, outputLengthValue, leftLengthValue, rightLengthValue,
  oneValue,
) {
  const outputLength = ffiDimension(outputLengthValue, "output_length");
  const leftLength = ffiDimension(leftLengthValue, "left_length");
  const rightLength = ffiDimension(rightLengthValue, "right_length");
  const one = ffiDimension(oneValue, "one");
  const expected = leftLength === 0 || rightLength === 0
    ? 0 : leftLength + rightLength - 1;
  if (!Number.isSafeInteger(expected) || one !== 1 ||
      outputLength !== expected) return false;
  const product = binding.polyMul(
    ffiFmpzPolynomial(ffiIntegerEntries(left, leftLength, "left")),
    ffiFmpzPolynomial(ffiIntegerEntries(right, rightLength, "right")),
  );
  const coefficients = binding.polyCoefficients(product);
  ffiWriteIntegers(output, Array.from(
    { length: outputLength }, (_, index) => BigInt(coefficients[index] ?? 0n),
  ));
  return true;
};

binding.ffiFmpqPolyMul = function ffiFmpqPolyMul(
  outputNumerators, outputDenominators,
  leftNumerators, leftDenominators,
  rightNumerators, rightDenominators,
  outputLengthValue, leftLengthValue, rightLengthValue, oneValue,
) {
  const outputLength = ffiDimension(outputLengthValue, "output_length");
  const leftLength = ffiDimension(leftLengthValue, "left_length");
  const rightLength = ffiDimension(rightLengthValue, "right_length");
  const one = ffiDimension(oneValue, "one");
  const expected = leftLength === 0 || rightLength === 0
    ? 0 : leftLength + rightLength - 1;
  if (!Number.isSafeInteger(expected) || one !== 1 ||
      outputLength !== expected) return false;
  const product = binding.polyMul(
    ffiFmpqPolynomial(
      ffiIntegerEntries(leftNumerators, leftLength, "left_numerators"),
      ffiIntegerEntries(leftDenominators, leftLength, "left_denominators"),
    ),
    ffiFmpqPolynomial(
      ffiIntegerEntries(rightNumerators, rightLength, "right_numerators"),
      ffiIntegerEntries(rightDenominators, rightLength, "right_denominators"),
    ),
  );
  const coefficients = binding.polyCoefficients(product);
  const numerators = [];
  const denominators = [];
  for (let index = 0; index < outputLength; index += 1) {
    const coefficient = coefficients[index];
    numerators.push(BigInt(coefficient?.numerator ?? 0n));
    denominators.push(BigInt(coefficient?.denominator ?? 1n));
  }
  ffiWriteIntegers(outputNumerators, numerators, "output_numerators");
  ffiWriteIntegers(outputDenominators, denominators, "output_denominators");
  return true;
};

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

function ffiWriteResidues(output, values, name = "output") {
  ffiEntries(output, values.length, name);
  for (let index = 0; index < values.length; index += 1) {
    if (!Reflect.set(output, String(index), BigInt(values[index]))) {
      throw new TypeError(`${name} buffer is not writable`);
    }
  }
}

binding.ffiNmodPolyDivExact = function ffiNmodPolyDivExact(
  output, left, right, outputLengthValue, leftLengthValue, rightLengthValue,
  modulusValue,
) {
  const outputLength = ffiDimension(outputLengthValue, "output_length");
  const leftLength = ffiDimension(leftLengthValue, "left_length");
  const rightLength = ffiDimension(rightLengthValue, "right_length");
  const modulus = BigInt(modulusValue);
  if (outputLength !== leftLength || rightLength === 0) return false;
  let quotient;
  try {
    quotient = binding.polyDivExact(
      ffiNmodPolynomial(ffiEntries(left, leftLength, "left"), modulus),
      ffiNmodPolynomial(ffiEntries(right, rightLength, "right"), modulus),
    );
  } catch (error) {
    if (String(error?.message || error).includes("not exact")) return false;
    throw error;
  }
  const coefficients = binding.polyCoefficients(quotient);
  ffiWriteResidues(output, Array.from(
    { length: outputLength }, (_, index) => coefficients[index] ?? 0n,
  ));
  return true;
};

binding.ffiFmpzPolyDivExact = function ffiFmpzPolyDivExact(
  output, left, right, outputLengthValue, leftLengthValue, rightLengthValue,
  oneValue,
) {
  const outputLength = ffiDimension(outputLengthValue, "output_length");
  const leftLength = ffiDimension(leftLengthValue, "left_length");
  const rightLength = ffiDimension(rightLengthValue, "right_length");
  if (ffiDimension(oneValue, "one") !== 1 ||
      outputLength !== leftLength || rightLength === 0) return false;
  let quotient;
  try {
    quotient = binding.polyDivExact(
      ffiFmpzPolynomial(ffiIntegerEntries(left, leftLength, "left")),
      ffiFmpzPolynomial(ffiIntegerEntries(right, rightLength, "right")),
    );
  } catch (error) {
    if (String(error?.message || error).includes("not exact")) return false;
    throw error;
  }
  const coefficients = binding.polyCoefficients(quotient);
  ffiWriteIntegers(output, Array.from(
    { length: outputLength }, (_, index) => coefficients[index] ?? 0n,
  ));
  return true;
};

binding.ffiFmpqPolyDivExact = function ffiFmpqPolyDivExact(
  outputNumerators, outputDenominators,
  leftNumerators, leftDenominators, rightNumerators, rightDenominators,
  outputLengthValue, leftLengthValue, rightLengthValue, oneValue,
) {
  const outputLength = ffiDimension(outputLengthValue, "output_length");
  const leftLength = ffiDimension(leftLengthValue, "left_length");
  const rightLength = ffiDimension(rightLengthValue, "right_length");
  if (ffiDimension(oneValue, "one") !== 1 ||
      outputLength !== leftLength || rightLength === 0) return false;
  let quotient;
  try {
    quotient = binding.polyDivExact(
      ffiFmpqPolynomial(
        ffiIntegerEntries(leftNumerators, leftLength, "left_numerators"),
        ffiIntegerEntries(leftDenominators, leftLength, "left_denominators"),
      ),
      ffiFmpqPolynomial(
        ffiIntegerEntries(rightNumerators, rightLength, "right_numerators"),
        ffiIntegerEntries(rightDenominators, rightLength, "right_denominators"),
      ),
    );
  } catch (error) {
    if (String(error?.message || error).includes("not exact")) return false;
    throw error;
  }
  const coefficients = binding.polyCoefficients(quotient);
  const numerators = [];
  const denominators = [];
  for (let index = 0; index < outputLength; index += 1) {
    const coefficient = coefficients[index];
    numerators.push(BigInt(coefficient?.numerator ?? 0n));
    denominators.push(BigInt(coefficient?.denominator ?? 1n));
  }
  ffiWriteIntegers(outputNumerators, numerators, "output_numerators");
  ffiWriteIntegers(outputDenominators, denominators, "output_denominators");
  return true;
};

binding.ffiNmodPolyGcd = function ffiNmodPolyGcd(
  output, left, right, outputLengthValue, leftLengthValue, rightLengthValue,
  modulusValue,
) {
  const outputLength = ffiDimension(outputLengthValue, "output_length");
  const leftLength = ffiDimension(leftLengthValue, "left_length");
  const rightLength = ffiDimension(rightLengthValue, "right_length");
  const modulus = BigInt(modulusValue);
  if (outputLength < leftLength || outputLength < rightLength) return false;
  const gcd = binding.nmodPolyGcd(
    ffiNmodPolynomial(ffiEntries(left, leftLength, "left"), modulus),
    ffiNmodPolynomial(ffiEntries(right, rightLength, "right"), modulus),
  );
  const coefficients = binding.polyCoefficients(gcd);
  ffiWriteResidues(output, Array.from(
    { length: outputLength }, (_, index) => coefficients[index] ?? 0n,
  ));
  return true;
};

binding.ffiNmodPolyIsIrreducible = function ffiNmodPolyIsIrreducible(
  source, sourceLengthValue, modulusValue,
) {
  const sourceLength = ffiDimension(sourceLengthValue, "source_length");
  return binding.nmodPolyIsIrreducible(ffiNmodPolynomial(
    ffiEntries(source, sourceLength, "source"), BigInt(modulusValue),
  ));
};

binding.ffiNmodPolyFactor = function ffiNmodPolyFactor(
  factorCoefficients, offsets, exponents, factorCount, unitOutput, source,
  factorCoefficientsLengthValue, offsetsLengthValue, exponentsLengthValue,
  factorCountLengthValue, unitLengthValue, sourceLengthValue, modulusValue,
) {
  const factorCoefficientsLength = ffiDimension(
    factorCoefficientsLengthValue, "factor_coefficients_length",
  );
  const offsetsLength = ffiDimension(offsetsLengthValue, "offsets_length");
  const exponentsLength = ffiDimension(
    exponentsLengthValue, "exponents_length",
  );
  const sourceLength = ffiDimension(sourceLengthValue, "source_length");
  if (ffiDimension(factorCountLengthValue, "factor_count_length") !== 1 ||
      ffiDimension(unitLengthValue, "unit_length") !== 1 ||
      offsetsLength !== sourceLength || exponentsLength + 1 !== sourceLength) {
    return false;
  }
  const result = binding.nmodPolyFactor(ffiNmodPolynomial(
    ffiEntries(source, sourceLength, "source"), BigInt(modulusValue),
  ));
  const flattened = [];
  const factorOffsets = [0n];
  const factorExponents = Array(exponentsLength).fill(0n);
  for (let index = 0; index < result.factors.length; index += 1) {
    flattened.push(...binding.polyCoefficients(result.factors[index][0]));
    factorOffsets.push(BigInt(flattened.length));
    factorExponents[index] = BigInt(result.factors[index][1]);
  }
  if (flattened.length > factorCoefficientsLength) return false;
  ffiWriteResidues(factorCoefficients, [
    ...flattened,
    ...Array(factorCoefficientsLength - flattened.length).fill(0n),
  ], "factor_coefficients");
  ffiWriteResidues(offsets, [
    ...factorOffsets,
    ...Array(offsetsLength - factorOffsets.length).fill(0n),
  ], "offsets");
  ffiWriteResidues(exponents, factorExponents, "exponents");
  ffiWriteResidues(factorCount, [BigInt(result.factors.length)], "factor_count");
  ffiWriteResidues(unitOutput, [BigInt(result.unit)], "unit_output");
  return true;
};

binding.ffiNmodPolyRoots = function ffiNmodPolyRoots(
  rootValues, multiplicities, rootCount, source,
  rootValuesLengthValue, multiplicitiesLengthValue, rootCountLengthValue,
  sourceLengthValue, modulusValue,
) {
  const rootValuesLength = ffiDimension(
    rootValuesLengthValue, "root_values_length",
  );
  const multiplicitiesLength = ffiDimension(
    multiplicitiesLengthValue, "multiplicities_length",
  );
  const sourceLength = ffiDimension(sourceLengthValue, "source_length");
  if (ffiDimension(rootCountLengthValue, "root_count_length") !== 1 ||
      rootValuesLength + 1 !== sourceLength ||
      multiplicitiesLength !== rootValuesLength) return false;
  const roots = binding.nmodPolyRoots(ffiNmodPolynomial(
    ffiEntries(source, sourceLength, "source"), BigInt(modulusValue),
  ));
  ffiWriteResidues(rootValues, [
    ...roots.map((pair) => BigInt(pair[0])),
    ...Array(rootValuesLength - roots.length).fill(0n),
  ], "root_values");
  ffiWriteResidues(multiplicities, [
    ...roots.map((pair) => BigInt(pair[1])),
    ...Array(multiplicitiesLength - roots.length).fill(0n),
  ], "multiplicities");
  ffiWriteResidues(rootCount, [BigInt(roots.length)], "root_count");
  return true;
};

function ffiWriteFmpzFactorization(
  result, factorCoefficients, offsets, exponents, factorCount,
  unitNumerator, unitDenominator, factorCoefficientsLength, sourceLength,
) {
  const flattened = [];
  const factorOffsets = [0n];
  const factorExponents = Array(sourceLength).fill(0n);
  for (let index = 0; index < result.factors.length; index += 1) {
    const coefficients = binding.polyCoefficients(result.factors[index][0]);
    flattened.push(...coefficients.map((coefficient) =>
      BigInt(coefficient?.numerator ?? coefficient)));
    factorOffsets.push(BigInt(flattened.length));
    factorExponents[index] = BigInt(result.factors[index][1]);
  }
  if (flattened.length > factorCoefficientsLength) return false;
  ffiWriteIntegers(factorCoefficients, [
    ...flattened,
    ...Array(factorCoefficientsLength - flattened.length).fill(0n),
  ], "factor_coefficients");
  ffiWriteResidues(offsets, [
    ...factorOffsets,
    ...Array(sourceLength - factorOffsets.length).fill(0n),
  ], "offsets");
  ffiWriteResidues(exponents, factorExponents, "exponents");
  ffiWriteResidues(factorCount, [BigInt(result.factors.length)], "factor_count");
  ffiWriteIntegers(unitNumerator, [BigInt(result.unitNumerator)], "unit_numerator");
  ffiWriteIntegers(
    unitDenominator, [BigInt(result.unitDenominator)], "unit_denominator",
  );
  return true;
}

binding.ffiFmpzPolyFactor = function ffiFmpzPolyFactor(
  factorCoefficients, offsets, exponents, factorCount,
  unitNumerator, unitDenominator, source,
  factorCoefficientsLengthValue, sourceLengthValue, oneValue,
) {
  const factorCoefficientsLength = ffiDimension(
    factorCoefficientsLengthValue, "factor_coefficients_length",
  );
  const sourceLength = ffiDimension(sourceLengthValue, "source_length");
  if (ffiDimension(oneValue, "one") !== 1) return false;
  const result = binding.polyFactor(ffiFmpzPolynomial(
    ffiIntegerEntries(source, sourceLength, "source"),
  ));
  return ffiWriteFmpzFactorization(
    result, factorCoefficients, offsets, exponents, factorCount,
    unitNumerator, unitDenominator, factorCoefficientsLength, sourceLength,
  );
};

binding.ffiFmpqPolyFactor = function ffiFmpqPolyFactor(
  factorCoefficients, offsets, exponents, factorCount,
  unitNumerator, unitDenominator, sourceNumerators, sourceDenominators,
  factorCoefficientsLengthValue, sourceLengthValue, oneValue,
) {
  const factorCoefficientsLength = ffiDimension(
    factorCoefficientsLengthValue, "factor_coefficients_length",
  );
  const sourceLength = ffiDimension(sourceLengthValue, "source_length");
  if (ffiDimension(oneValue, "one") !== 1) return false;
  const result = binding.polyFactor(ffiFmpqPolynomial(
    ffiIntegerEntries(sourceNumerators, sourceLength, "source_numerators"),
    ffiIntegerEntries(sourceDenominators, sourceLength, "source_denominators"),
  ));
  return ffiWriteFmpzFactorization(
    result, factorCoefficients, offsets, exponents, factorCount,
    unitNumerator, unitDenominator, factorCoefficientsLength, sourceLength,
  );
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

/* Every non-resource declaration is compiled into this addon from the
 * generated typed-Python bodies in generated/ffi_host.py.  Save the old
 * handwritten implementations as differential oracles, then make the
 * compiler-generated boundary canonical. */
const generatedFfiManifest = require("./build/generated-ffi/manifest.json");
const generatedFfi = require(
  `./build/generated-ffi/${generatedFfiManifest.addon}`,
);
const publicBinding = Object.create(null);
for (const name of Reflect.ownKeys(binding)) {
  publicBinding[name] = binding[name];
}
const declaredFfiOracles = Object.create(null);
for (const item of generatedFfiManifest.functions) {
  const name = item.export;
  if (typeof publicBinding[name] === "function") {
    declaredFfiOracles[name] = publicBinding[name];
  }
  if (typeof generatedFfi[name] !== "function") {
    throw new Error(`generated FLINT FFI adapter is missing ${name}`);
  }
  publicBinding[name] = generatedFfi[name];
}
for (const resource of generatedFfiManifest.resources || []) {
  const name = resource.close_export;
  if (typeof generatedFfi[name] !== "function") {
    throw new Error(`generated FLINT FFI adapter is missing ${name}`);
  }
  publicBinding[name] = generatedFfi[name];
  const transfer = resource.host_transfer;
  if (transfer !== undefined) {
    if (transfer.kind !== "copied_bytes" ||
        typeof generatedFfi[transfer.export] !== "function") {
      throw new Error(
        `generated FLINT FFI adapter is missing host transfer ` +
        `${transfer.export}`,
      );
    }
    publicBinding[transfer.export] = generatedFfi[transfer.export];
  }
}
Object.defineProperty(publicBinding, "__sagejs_ffi_oracles__", {
  value: Object.freeze(declaredFfiOracles),
  enumerable: false,
});
Object.defineProperty(publicBinding, "__sagejs_ffi_manifest__", {
  value: Object.freeze(generatedFfiManifest),
  enumerable: false,
});

/* A diagnostic hard boundary for the packed-matrix architecture tests.  The
 * proxy leaves declared FFI exports available but makes any accidental use of
 * the historical high-level N-API matrix surface fail at its first call. */
const forbidMatrixNapi = process.env.SAGEJS_FORBID_MATRIX_NAPI === "1";
const forbidZzMatrixNapi =
  process.env.SAGEJS_FORBID_ZZ_MATRIX_NAPI === "1";
const forbidQqMatrixNapi =
  process.env.SAGEJS_FORBID_QQ_MATRIX_NAPI === "1";
const forbidPolynomialNapi =
  process.env.SAGEJS_FORBID_POLYNOMIAL_NAPI === "1";

module.exports = forbidMatrixNapi || forbidZzMatrixNapi || forbidQqMatrixNapi ||
    forbidPolynomialNapi
  ? new Proxy(Object.create(null), {
    has(_target, property) {
      return Reflect.has(publicBinding, property);
    },
    get(_target, property) {
      if (typeof property === "string" &&
          ((forbidMatrixNapi &&
            (property === "nmodMatrix" || property === "nmodMatrixPacked" ||
             /^matrix[A-Z]/.test(property))) ||
           (forbidZzMatrixNapi &&
            (property === "zzMatrix" || property === "zzMatrixPacked" ||
             property === "zzMatrixExportPacked" ||
             property === "zzMatrixToQQ")) ||
           (forbidQqMatrixNapi &&
            (property === "qqMatrix" || property === "qqMatrixPacked" ||
             property === "qqMatrixExportPacked" ||
             property === "zzMatrixToQQ")) ||
           (forbidPolynomialNapi &&
            (/^(?:zz|qq|nmod)Poly[A-Z]/.test(property) ||
             /^poly[A-Z]/.test(property))))) {
        return function forbiddenLegacyNapi() {
          throw new Error(`forbidden legacy mathematical N-API call: ${property}`);
        };
      }
      return Reflect.get(publicBinding, property);
    },
  })
  : publicBinding;

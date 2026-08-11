/**
 * Create the portable side of the declared retained rational-RREF resource.
 *
 * The resource owns one reduced matrix between `compute` and `export`.  Its
 * public boundary is limited to scalar metadata and packed IntegerBuffers,
 * matching the native FLINT resource without exposing a matrix handle.
 */
export function createPortableRrefResourceBackend(matrixBackend) {
  const results = new WeakSet();

  function dimension(value, name) {
    const exact = BigInt(value);
    if (exact < 0n || exact > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RangeError(`${name} is outside the supported dimension range`);
    }
    return Number(exact);
  }

  function integerBuffer(source, expected, name) {
    if (source === null || (typeof source !== "object" &&
        typeof source !== "function")) {
      throw new TypeError(`${name} must be a packed exact-integer buffer`);
    }
    const length = Number(Reflect.get(source, "length"));
    const capacity = Number(Reflect.get(source, "wordCapacity"));
    const sizes = Reflect.get(source, "sizes");
    const limbs = Reflect.get(source, "limbs");
    if (!Number.isSafeInteger(length) || length !== expected ||
        !Number.isSafeInteger(capacity) || capacity <= 0 ||
        !(sizes instanceof Int32Array) ||
        !(limbs instanceof BigUint64Array) ||
        sizes.length !== length || limbs.length !== length * capacity) {
      throw new TypeError(`${name} is not a valid packed IntegerBuffer`);
    }
    for (const signedSize of sizes) {
      if (Math.abs(signedSize) > capacity) {
        throw new RangeError(`${name} entry exceeds its word capacity`);
      }
    }
    return { sizes, limbs, length, capacity };
  }

  function integerEntries(source, expected, name) {
    const buffer = integerBuffer(source, expected, name);
    return Array.from({ length: expected }, (_, index) => {
      const signedSize = buffer.sizes[index];
      let value = 0n;
      for (let word = Math.abs(signedSize) - 1; word >= 0; word -= 1) {
        value = (value << 64n) |
          buffer.limbs[index * buffer.capacity + word];
      }
      return signedSize < 0 ? -value : value;
    });
  }

  function integerWords(value) {
    let magnitude = value < 0n ? -value : value;
    let words = 0;
    while (magnitude !== 0n) {
      magnitude >>= 64n;
      words += 1;
    }
    return words;
  }

  function prepareIntegerWrite(output, values, name) {
    const buffer = integerBuffer(output, values.length, name);
    for (const value of values) {
      if (integerWords(value) > buffer.capacity) {
        throw new RangeError("IntegerBuffer word capacity exceeded");
      }
    }
    return { buffer, values };
  }

  function commitIntegerWrite({ buffer, values }) {
    buffer.sizes.fill(0);
    buffer.limbs.fill(0n);
    for (let index = 0; index < values.length; index += 1) {
      const negative = values[index] < 0n;
      let magnitude = negative ? -values[index] : values[index];
      let words = 0;
      while (magnitude !== 0n) {
        buffer.limbs[index * buffer.capacity + words] =
          magnitude & 0xffffffffffffffffn;
        magnitude >>= 64n;
        words += 1;
      }
      buffer.sizes[index] = negative ? -words : words;
    }
  }

  function openResult(value) {
    if (!results.has(value) || value.closed) {
      throw new TypeError("expected an open Sage.js FLINT RREF result");
    }
    return value;
  }

  function computedResult(value) {
    value = openResult(value);
    if (value.reduced === null) {
      throw new Error("RREF result has not been computed");
    }
    return value;
  }

  function ffiFmpqRrefResultCreate(rowsValue, columnsValue) {
    const result = {
      rows: dimension(rowsValue, "rows"),
      columns: dimension(columnsValue, "columns"),
      reduced: null,
      rank: 0,
      closed: false,
    };
    results.add(result);
    return result;
  }

  function ffiFmpqRrefResultClose(value) {
    value = openResult(value);
    value.reduced = null;
    value.closed = true;
  }

  function ffiFmpqRrefResultCompute(
    value, sourceNumerators, sourceDenominators, rowsValue, columnsValue,
  ) {
    value = openResult(value);
    const rows = dimension(rowsValue, "rows");
    const columns = dimension(columnsValue, "columns");
    if (rows !== value.rows || columns !== value.columns) {
      throw new RangeError("RREF result dimensions do not match");
    }
    const count = rows * columns;
    if (!Number.isSafeInteger(count)) {
      throw new RangeError("RREF matrix is too large");
    }
    const numerators = integerEntries(
      sourceNumerators, count, "source_numerators");
    const denominators = integerEntries(
      sourceDenominators, count, "source_denominators");
    value.reduced = matrixBackend.matrixRref(matrixBackend.qqMatrix(
      rows,
      columns,
      numerators.map((numerator, index) => [
        numerator, denominators[index],
      ]),
    ));
    value.rank = 0;
    for (let row = 0; row < rows; row += 1) {
      if (value.reduced.entries.slice(
        row * columns, (row + 1) * columns,
      ).some((entry) => entry.numerator !== 0n)) {
        value.rank += 1;
      }
    }
    return true;
  }

  function ffiFmpqRrefResultRank(value) {
    return BigInt(computedResult(value).rank);
  }

  function ffiFmpqRrefResultNumeratorWordCapacity(value) {
    value = computedResult(value);
    return BigInt(value.reduced.entries.reduce(
      (maximum, entry) => Math.max(
        maximum, integerWords(entry.numerator)),
      1,
    ));
  }

  function ffiFmpqRrefResultDenominatorWordCapacity(value) {
    value = computedResult(value);
    return BigInt(value.reduced.entries.reduce(
      (maximum, entry) => Math.max(
        maximum, integerWords(entry.denominator)),
      1,
    ));
  }

  function ffiFmpqRrefResultExport(
    outputNumerators, outputDenominators, value, rowsValue, columnsValue,
  ) {
    value = computedResult(value);
    const rows = dimension(rowsValue, "rows");
    const columns = dimension(columnsValue, "columns");
    if (rows !== value.rows || columns !== value.columns) {
      throw new RangeError("RREF result dimensions do not match");
    }
    const numeratorWrite = prepareIntegerWrite(
      outputNumerators,
      value.reduced.entries.map((entry) => entry.numerator),
      "output_numerators",
    );
    const denominatorWrite = prepareIntegerWrite(
      outputDenominators,
      value.reduced.entries.map((entry) => entry.denominator),
      "output_denominators",
    );
    commitIntegerWrite(numeratorWrite);
    commitIntegerWrite(denominatorWrite);
    return true;
  }

  return Object.freeze({
    ffiFmpqRrefResultCreate,
    ffiFmpqRrefResultClose,
    ffiFmpqRrefResultCompute,
    ffiFmpqRrefResultRank,
    ffiFmpqRrefResultNumeratorWordCapacity,
    ffiFmpqRrefResultDenominatorWordCapacity,
    ffiFmpqRrefResultExport,
  });
}

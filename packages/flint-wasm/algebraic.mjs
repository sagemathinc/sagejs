const encoder = new TextEncoder();
const decoder = new TextDecoder();

const STATUS = Object.freeze({
  OK: 0,
  INVALID_ARGUMENT: 1,
  INVALID_HANDLE: 2,
  RESOURCE_LIMIT: 3,
  DIVISION_BY_ZERO: 4,
  NOT_REAL: 5,
  BUFFER_TOO_SMALL: 6,
  ALLOCATION_FAILED: 7,
  MALFORMED_ENCODING: 8,
});

const UNARY = Object.freeze({
  neg: 1,
  sqrt: 2,
  real: 3,
  imag: 4,
  conjugate: 5,
  abs: 6,
});

const BINARY = Object.freeze({ add: 1, sub: 2, mul: 3, div: 4 });
const PROPERTY = Object.freeze({ real: 1, rational: 2, degree: 3 });
const MATRIX_BINARY = Object.freeze({ add: 1, sub: 2, mul: 3 });
const MATRIX_UNARY = Object.freeze({
  neg: 1,
  transpose: 2,
  rref: 3,
  inverse: 4,
});

function writeU32(bytes, offset, value) {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .setUint32(offset, value, true);
}

function readU32(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.byteLength) {
    throw new RangeError("truncated algebraic integer encoding");
  }
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .getUint32(offset, true);
}

function encodedInteger(value) {
  value = BigInt(value);
  const sign = value < 0n ? 1 : 0;
  if (value < 0n) value = -value;
  const magnitude = [];
  while (value !== 0n) {
    magnitude.push(Number(value & 255n));
    value >>= 8n;
  }
  const result = new Uint8Array(8 + magnitude.length);
  writeU32(result, 0, sign);
  writeU32(result, 4, magnitude.length);
  result.set(magnitude, 8);
  return result;
}

export function packExactIntegers(values) {
  if (!Array.isArray(values)) throw new TypeError("expected an integer array");
  const encoded = values.map(encodedInteger);
  const size = 4 + encoded.reduce((sum, value) => sum + value.byteLength, 0);
  if (size > 1_048_576) {
    throw new RangeError("algebraic packed input exceeds the 1 MiB limit");
  }
  const result = new Uint8Array(size);
  writeU32(result, 0, encoded.length);
  let offset = 4;
  for (const value of encoded) {
    result.set(value, offset);
    offset += value.byteLength;
  }
  return result;
}

export function unpackExactIntegers(input) {
  const bytes = input instanceof Uint8Array
    ? input
    : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  const count = readU32(bytes, 0);
  const result = [];
  let offset = 4;
  for (let index = 0; index < count; index += 1) {
    const sign = readU32(bytes, offset);
    const length = readU32(bytes, offset + 4);
    offset += 8;
    if (sign > 1 || offset + length > bytes.byteLength) {
      throw new RangeError("malformed algebraic integer encoding");
    }
    if (length > 0 && bytes[offset + length - 1] === 0) {
      throw new RangeError("noncanonical algebraic integer encoding");
    }
    let value = 0n;
    for (let byte = length; byte > 0; byte -= 1) {
      value = (value << 8n) + BigInt(bytes[offset + byte - 1]);
    }
    if (sign === 1) {
      if (value === 0n) throw new RangeError("negative zero is not canonical");
      value = -value;
    }
    result.push(value);
    offset += length;
  }
  if (offset !== bytes.byteLength) {
    throw new RangeError("trailing bytes in algebraic integer encoding");
  }
  return result;
}

function gcd(left, right) {
  left = left < 0n ? -left : left;
  right = right < 0n ? -right : right;
  while (right !== 0n) [left, right] = [right, left % right];
  return left;
}

function lcm(left, right) {
  if (left === 0n || right === 0n) return 0n;
  return (left / gcd(left, right)) * right;
}

function integralPolynomialCoefficients(polynomial) {
  const coefficients = Array.isArray(polynomial)
    ? polynomial
    : polynomial?.coefficients;
  if (!Array.isArray(coefficients)) {
    throw new TypeError("exact roots require a portable ZZ or QQ polynomial");
  }
  const rational = coefficients.map((coefficient) => {
    if (typeof coefficient === "bigint" || typeof coefficient === "number") {
      return { numerator: BigInt(coefficient), denominator: 1n };
    }
    if (coefficient && coefficient.numerator !== undefined) {
      let numerator = BigInt(coefficient.numerator);
      let denominator = BigInt(coefficient.denominator);
      if (denominator === 0n) throw new RangeError("zero polynomial denominator");
      if (denominator < 0n) {
        numerator = -numerator;
        denominator = -denominator;
      }
      return { numerator, denominator };
    }
    throw new TypeError("invalid exact polynomial coefficient");
  });
  while (rational.length > 0 && rational.at(-1).numerator === 0n) rational.pop();
  if (rational.length === 0) throw new RangeError("roots of zero are undefined");
  let denominator = 1n;
  for (const coefficient of rational) {
    denominator = lcm(denominator, coefficient.denominator);
  }
  return rational.map((coefficient) =>
    coefficient.numerator * (denominator / coefficient.denominator)
  );
}

function statusError(status, operation) {
  switch (status) {
    case STATUS.INVALID_ARGUMENT:
      return new TypeError(`${operation} received an invalid argument`);
    case STATUS.INVALID_HANDLE:
      return new ReferenceError(`${operation} received a closed or stale handle`);
    case STATUS.RESOURCE_LIMIT:
      return new RangeError(`${operation} exceeds browser algebraic resource limits`);
    case STATUS.DIVISION_BY_ZERO:
      return new RangeError(`${operation} divides by zero`);
    case STATUS.NOT_REAL:
      return new TypeError(`${operation} requires real algebraic values`);
    case STATUS.BUFFER_TOO_SMALL:
      return new RangeError(`${operation} exceeds the 1 MiB transfer limit`);
    case STATUS.ALLOCATION_FAILED:
      return new Error(`${operation} could not allocate FLINT storage`);
    case STATUS.MALFORMED_ENCODING:
      return new RangeError(`${operation} rejected malformed canonical bytes`);
    default:
      return new Error(`${operation} failed with algebraic status ${status}`);
  }
}

function dyadicMidpoint(lower, upper, exponent) {
  return Object.freeze({
    numerator: lower + upper,
    exponent: exponent - 1n,
  });
}

function dyadicToDouble(value) {
  return Number(value.numerator) * (2 ** Number(value.exponent));
}

function formatDyadic(value, precision) {
  let numerator = value.numerator;
  const negative = numerator < 0n;
  if (negative) numerator = -numerator;
  if (numerator === 0n) return "0";
  const exponent = Number(value.exponent);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1_000_000) {
    throw new RangeError("dyadic display exponent exceeds browser limits");
  }
  if (exponent >= 0) {
    const text = (numerator << BigInt(exponent)).toString();
    return negative ? `-${text}` : text;
  }
  const places = Math.max(1, Math.ceil(Number(precision) * Math.LOG10E * Math.LN2));
  const decimalScale = 10n ** BigInt(places);
  const binaryScale = 1n << BigInt(-exponent);
  const scaled = (numerator * decimalScale + binaryScale / 2n) / binaryScale;
  const integer = scaled / decimalScale;
  let fraction = (scaled % decimalScale).toString().padStart(places, "0");
  fraction = fraction.replace(/0+$/, "");
  const text = fraction.length === 0 ? `${integer}` : `${integer}.${fraction}`;
  return negative ? `-${text}` : text;
}

/** Create the QQbar/AA backend over an instantiated FLINT Wasm module. */
export function createAlgebraicBackend(instance, {
  recordCapability = () => {},
  matrixFallback = undefined,
} = {}) {
  const wasm = instance?.exports ?? instance;
  const memory = wasm?.memory;
  if (!(memory instanceof WebAssembly.Memory)) {
    throw new TypeError("algebraic backend requires a WebAssembly memory export");
  }
  const required = [
    "input", "input_capacity", "output", "output_length", "root_handles",
    "root_multiplicities", "result_count", "result_handle", "result_value",
    "initialize", "clear", "close", "from_rational", "i", "root_of_unity", "unary",
    "binary", "pow", "pow_rational", "equal", "compare_real", "property",
    "polynomial_roots", "minpoly", "enclosure", "format", "serialize",
    "deserialize", "live_count",
    "matrix_entry_handles", "matrix_live_count", "matrix_close", "matrix_create",
    "matrix_binary", "matrix_unary", "matrix_scalar_mul", "matrix_entry",
    "matrix_det", "matrix_rank", "matrix_equal", "matrix_charpoly",
  ];
  for (const name of required) {
    if (typeof wasm[`sagejs_wasm_algebraic_${name}`] !== "function") {
      throw new TypeError(`FLINT Wasm is missing algebraic export ${name}`);
    }
  }
  const inputPointer = wasm.sagejs_wasm_algebraic_input() >>> 0;
  const inputCapacity = wasm.sagejs_wasm_algebraic_input_capacity() >>> 0;
  const outputPointer = wasm.sagejs_wasm_algebraic_output() >>> 0;
  const rootHandlesPointer = wasm.sagejs_wasm_algebraic_root_handles() >>> 0;
  const rootMultiplicitiesPointer =
    wasm.sagejs_wasm_algebraic_root_multiplicities() >>> 0;
  const matrixEntryHandlesPointer =
    wasm.sagejs_wasm_algebraic_matrix_entry_handles() >>> 0;
  const liveObjects = new WeakSet();
  const liveMatrices = new WeakSet();
  const finalizer = typeof FinalizationRegistry === "undefined"
    ? undefined
    : new FinalizationRegistry((handle) => {
        wasm.sagejs_wasm_algebraic_close(handle);
      });
  const matrixFinalizer = typeof FinalizationRegistry === "undefined"
    ? undefined
    : new FinalizationRegistry((handle) => {
        wasm.sagejs_wasm_algebraic_matrix_close(handle);
      });

  function check(status, operation) {
    if (status !== STATUS.OK) throw statusError(status, operation);
  }

  function writeInput(bytes, operation) {
    if (bytes.byteLength > inputCapacity) {
      throw new RangeError(`${operation} exceeds the ${inputCapacity}-byte limit`);
    }
    // Recreate the view after every possible Wasm call: memory growth detaches
    // old ArrayBuffer views.
    new Uint8Array(memory.buffer, inputPointer, inputCapacity).set(bytes);
    return bytes.byteLength;
  }

  function outputBytes() {
    const length = wasm.sagejs_wasm_algebraic_output_length() >>> 0;
    return new Uint8Array(
      new Uint8Array(memory.buffer, outputPointer, length),
    );
  }

  function native(handle) {
    const object = Object.create(null);
    Object.defineProperty(object, "handle", { value: handle >>> 0 });
    liveObjects.add(object);
    finalizer?.register(object, handle >>> 0, object);
    return Object.freeze(object);
  }

  function handleOf(value) {
    if (!value || !liveObjects.has(value)) {
      throw new TypeError("expected a live Wasm algebraic number");
    }
    return value.handle;
  }

  function nativeMatrix(handle, rows, columns, realOnly) {
    const object = Object.create(null);
    Object.defineProperties(object, {
      handle: { value: handle >>> 0 },
      rows: { value: rows },
      columns: { value: columns },
      realOnly: { value: realOnly },
    });
    liveMatrices.add(object);
    matrixFinalizer?.register(object, handle >>> 0, object);
    return Object.freeze(object);
  }

  function matrixHandleOf(value) {
    if (!value || !liveMatrices.has(value)) {
      throw new TypeError("expected a live Wasm algebraic matrix");
    }
    return value.handle;
  }

  function fallbackMatrix(name, arguments_) {
    const method = matrixFallback?.[name];
    if (typeof method !== "function") {
      throw new TypeError(`matrix backend does not implement ${name}`);
    }
    return Reflect.apply(method, matrixFallback, arguments_);
  }

  function recordMatrix(operation, ingressBytes, egressBytes = 4) {
    recordCapability(
      "algebraic:qqbar-resource-core",
      "receipt-backed-wasm-artifact",
      {
        executionTarget: "wasm-artifact",
        ingressBytes,
        egressBytes,
        operation: `qqbar-matrix-${operation}`,
      },
    );
  }

  function matrixResult(
    status,
    operation,
    rows,
    columns,
    realOnly,
    ingressBytes = 4,
  ) {
    check(status, `qqbar matrix ${operation}`);
    recordMatrix(operation, ingressBytes);
    return nativeMatrix(
      wasm.sagejs_wasm_algebraic_result_handle() >>> 0,
      rows,
      columns,
      realOnly,
    );
  }

  function matrixUnary(name, value) {
    if (!liveMatrices.has(value)) {
      return fallbackMatrix(`matrix${name[0].toUpperCase()}${name.slice(1)}`, [value]);
    }
    const transpose = name === "transpose";
    return matrixResult(
      wasm.sagejs_wasm_algebraic_matrix_unary(
        MATRIX_UNARY[name], matrixHandleOf(value),
      ),
      name,
      transpose ? value.columns : value.rows,
      transpose ? value.rows : value.columns,
      value.realOnly,
    );
  }

  function matrixBinary(name, left, right) {
    const leftIsAlgebraic = liveMatrices.has(left);
    const rightIsAlgebraic = liveMatrices.has(right);
    if (!leftIsAlgebraic && !rightIsAlgebraic) {
      return fallbackMatrix(`matrix${name[0].toUpperCase()}${name.slice(1)}`, [left, right]);
    }
    if (!leftIsAlgebraic || !rightIsAlgebraic) {
      throw new TypeError("cannot mix algebraic and portable matrix resources");
    }
    const columns = name === "mul" ? right.columns : left.columns;
    return matrixResult(
      wasm.sagejs_wasm_algebraic_matrix_binary(
        MATRIX_BINARY[name], matrixHandleOf(left), matrixHandleOf(right),
      ),
      name,
      left.rows,
      columns,
      left.realOnly,
      8,
    );
  }

  function resultNative(status, operation) {
    check(status, operation);
    return native(wasm.sagejs_wasm_algebraic_result_handle() >>> 0);
  }

  function packedCall(name, values, ...arguments_) {
    const bytes = packExactIntegers(values);
    const length = writeInput(bytes, name);
    return resultNative(
      wasm[`sagejs_wasm_algebraic_${name}`](...arguments_, length),
      name,
    );
  }

  function unary(name, value) {
    return resultNative(
      wasm.sagejs_wasm_algebraic_unary(UNARY[name], handleOf(value)),
      `qqbar ${name}`,
    );
  }

  function binary(name, left, right) {
    return resultNative(
      wasm.sagejs_wasm_algebraic_binary(
        BINARY[name], handleOf(left), handleOf(right),
      ),
      `qqbar ${name}`,
    );
  }

  function property(name, value) {
    check(
      wasm.sagejs_wasm_algebraic_property(handleOf(value), PROPERTY[name]),
      `qqbar ${name}`,
    );
    return wasm.sagejs_wasm_algebraic_result_value();
  }

  function encodedOutput(name, value, ...arguments_) {
    check(
      wasm[`sagejs_wasm_algebraic_${name}`](handleOf(value), ...arguments_),
      `qqbar ${name}`,
    );
    return outputBytes();
  }

  function enclosure(value, precision = 53) {
    const values = unpackExactIntegers(
      encodedOutput("enclosure", value, precision),
    );
    return Object.freeze({
      real: Object.freeze({
        lower: values[0], upper: values[1], exponent: values[2],
      }),
      imag: Object.freeze({
        lower: values[3], upper: values[4], exponent: values[5],
      }),
      precision,
      rigorous: true,
    });
  }

  check(wasm.sagejs_wasm_algebraic_initialize(), "algebraic initialize");

  const backend = {
    qqbarFromRational(numerator, denominator) {
      return packedCall("from_rational", [numerator, denominator]);
    },
    qqbarI() {
      return resultNative(wasm.sagejs_wasm_algebraic_i(), "qqbar I");
    },
    qqbarRootOfUnity(exponent, order) {
      exponent = BigInt(exponent);
      order = BigInt(order);
      if (order <= 0n || order > 0xffff_ffffn) {
        throw new RangeError(
          "browser root-of-unity order must be between 1 and 2^32-1",
        );
      }
      exponent %= order;
      if (exponent < 0n) exponent += order;
      return resultNative(
        wasm.sagejs_wasm_algebraic_root_of_unity(
          Number(exponent), Number(order),
        ),
        "qqbar root of unity",
      );
    },
    qqbarAdd(left, right) { return binary("add", left, right); },
    qqbarSub(left, right) { return binary("sub", left, right); },
    qqbarMul(left, right) { return binary("mul", left, right); },
    qqbarDiv(left, right) { return binary("div", left, right); },
    qqbarNeg(value) { return unary("neg", value); },
    qqbarSqrt(value) { return unary("sqrt", value); },
    qqbarReal(value) { return unary("real", value); },
    qqbarImag(value) { return unary("imag", value); },
    qqbarConjugate(value) { return unary("conjugate", value); },
    qqbarAbs(value) { return unary("abs", value); },
    qqbarPow(value, exponent) {
      return packedCall("pow", [exponent], handleOf(value));
    },
    qqbarPowRational(value, numerator, denominator) {
      return packedCall(
        "pow_rational", [numerator, denominator], handleOf(value),
      );
    },
    qqbarEqual(left, right) {
      check(
        wasm.sagejs_wasm_algebraic_equal(handleOf(left), handleOf(right)),
        "qqbar equality",
      );
      return wasm.sagejs_wasm_algebraic_result_value() === 1;
    },
    qqbarCompareReal(left, right) {
      check(
        wasm.sagejs_wasm_algebraic_compare_real(
          handleOf(left), handleOf(right),
        ),
        "qqbar real comparison",
      );
      return wasm.sagejs_wasm_algebraic_result_value();
    },
    qqbarIsReal(value) { return property("real", value) === 1; },
    qqbarIsRational(value) { return property("rational", value) === 1; },
    qqbarDegree(value) { return property("degree", value); },
    qqbarMinpolyCoefficients(value) {
      return unpackExactIntegers(encodedOutput("minpoly", value));
    },
    qqbarToString(value, digits = 16) {
      return decoder.decode(encodedOutput("format", value, digits));
    },
    qqbarEnclosure(value, precision = 53) {
      return enclosure(value, precision);
    },
    qqbarApprox(value, precision = 53) {
      const interval = enclosure(value, precision);
      return Object.freeze({
        __sagejsAlgebraicApprox: true,
        precision,
        real: dyadicMidpoint(
          interval.real.lower, interval.real.upper, interval.real.exponent,
        ),
        imag: dyadicMidpoint(
          interval.imag.lower, interval.imag.upper, interval.imag.exponent,
        ),
      });
    },
    polyExactRoots(polynomial) {
      const coefficients = integralPolynomialCoefficients(polynomial);
      const bytes = packExactIntegers(coefficients);
      const length = writeInput(bytes, "exact polynomial roots");
      check(
        wasm.sagejs_wasm_algebraic_polynomial_roots(length),
        "exact polynomial roots",
      );
      const count = wasm.sagejs_wasm_algebraic_result_count() >>> 0;
      const handles = new Uint32Array(memory.buffer, rootHandlesPointer, count);
      const multiplicities = new Uint32Array(
        memory.buffer, rootMultiplicitiesPointer, count,
      );
      const result = [];
      for (let index = 0; index < count; index += 1) {
        result.push([native(handles[index]), multiplicities[index]]);
      }
      recordCapability(
        "algebraic:qqbar-resource-core",
        "receipt-backed-wasm-artifact",
        {
          executionTarget: "wasm-artifact",
          ingressBytes: bytes.byteLength,
          egressBytes: count * 8,
        },
      );
      return result;
    },
    qqbarSerialize(value) {
      return encodedOutput("serialize", value);
    },
    qqbarDeserialize(bytes) {
      bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const length = writeInput(bytes, "qqbar deserialize");
      return resultNative(
        wasm.sagejs_wasm_algebraic_deserialize(length),
        "qqbar deserialize",
      );
    },
    qqbarMatrix(rows, columns, entries, realOnly = false) {
      rows = Number(rows);
      columns = Number(columns);
      if (!Number.isInteger(rows) || !Number.isInteger(columns) ||
          rows < 0 || columns < 0 || rows > 128 || columns > 128 ||
          rows * columns > 4096) {
        throw new RangeError("algebraic matrix dimensions exceed browser limits");
      }
      if (!Array.isArray(entries) || entries.length !== rows * columns) {
        throw new RangeError("algebraic matrix entry count does not match dimensions");
      }
      const handles = entries.map(handleOf);
      new Uint32Array(
        memory.buffer,
        matrixEntryHandlesPointer,
        handles.length,
      ).set(handles);
      const status = wasm.sagejs_wasm_algebraic_matrix_create(
        rows, columns, handles.length, realOnly ? 1 : 0,
      );
      check(status, "qqbar matrix construction");
      recordMatrix("construct", handles.length * 4);
      return nativeMatrix(
        wasm.sagejs_wasm_algebraic_result_handle() >>> 0,
        rows,
        columns,
        Boolean(realOnly),
      );
    },
    matrixAdd(left, right) { return matrixBinary("add", left, right); },
    matrixSub(left, right) { return matrixBinary("sub", left, right); },
    matrixMul(left, right) { return matrixBinary("mul", left, right); },
    matrixNeg(value) { return matrixUnary("neg", value); },
    matrixTranspose(value) { return matrixUnary("transpose", value); },
    matrixRref(value) { return matrixUnary("rref", value); },
    matrixInverse(value) { return matrixUnary("inverse", value); },
    qqbarMatrixScalarMul(value, scalar) {
      if (!liveMatrices.has(value)) {
        return fallbackMatrix("qqbarMatrixScalarMul", [value, scalar]);
      }
      return matrixResult(
        wasm.sagejs_wasm_algebraic_matrix_scalar_mul(
          matrixHandleOf(value), handleOf(scalar),
        ),
        "scalar-mul",
        value.rows,
        value.columns,
        value.realOnly,
        8,
      );
    },
    matrixEntry(value, row, column) {
      if (!liveMatrices.has(value)) {
        return fallbackMatrix("matrixEntry", [value, row, column]);
      }
      const result = resultNative(
        wasm.sagejs_wasm_algebraic_matrix_entry(
          matrixHandleOf(value), Number(row), Number(column),
        ),
        "qqbar matrix entry",
      );
      recordMatrix("entry", 12);
      return result;
    },
    matrixDet(value) {
      if (!liveMatrices.has(value)) return fallbackMatrix("matrixDet", [value]);
      const result = resultNative(
        wasm.sagejs_wasm_algebraic_matrix_det(matrixHandleOf(value)),
        "qqbar matrix determinant",
      );
      recordMatrix("determinant", 4);
      return result;
    },
    matrixRank(value) {
      if (!liveMatrices.has(value)) return fallbackMatrix("matrixRank", [value]);
      check(
        wasm.sagejs_wasm_algebraic_matrix_rank(matrixHandleOf(value)),
        "qqbar matrix rank",
      );
      recordMatrix("rank", 4, 4);
      return wasm.sagejs_wasm_algebraic_result_value();
    },
    matrixEqual(left, right) {
      const leftIsAlgebraic = liveMatrices.has(left);
      const rightIsAlgebraic = liveMatrices.has(right);
      if (!leftIsAlgebraic && !rightIsAlgebraic) {
        return fallbackMatrix("matrixEqual", [left, right]);
      }
      if (!leftIsAlgebraic || !rightIsAlgebraic) return false;
      check(
        wasm.sagejs_wasm_algebraic_matrix_equal(
          matrixHandleOf(left), matrixHandleOf(right),
        ),
        "qqbar matrix equality",
      );
      recordMatrix("equal", 8, 4);
      return wasm.sagejs_wasm_algebraic_result_value() === 1;
    },
    matrixCharpoly(value) {
      if (!liveMatrices.has(value)) {
        return fallbackMatrix("matrixCharpoly", [value]);
      }
      check(
        wasm.sagejs_wasm_algebraic_matrix_charpoly(matrixHandleOf(value)),
        "qqbar matrix characteristic polynomial",
      );
      const count = wasm.sagejs_wasm_algebraic_result_count() >>> 0;
      const handles = new Uint32Array(memory.buffer, rootHandlesPointer, count);
      const coefficients = Array.from(handles, native);
      recordMatrix("charpoly", 4, count * 4);
      return coefficients;
    },
    matrixSolve(left, right) {
      if (!liveMatrices.has(left) && !liveMatrices.has(right)) {
        return fallbackMatrix("matrixSolve", [left, right]);
      }
      if (!liveMatrices.has(left) || !liveMatrices.has(right)) {
        throw new TypeError("cannot mix algebraic and portable matrix resources");
      }
      const inverse = matrixUnary("inverse", left);
      try {
        return matrixBinary("mul", inverse, right);
      } finally {
        matrixFinalizer?.unregister(inverse);
        liveMatrices.delete(inverse);
        check(
          wasm.sagejs_wasm_algebraic_matrix_close(inverse.handle),
          "qqbar matrix temporary close",
        );
      }
    },
    qqbarClose(value) {
      const handle = handleOf(value);
      finalizer?.unregister(value);
      liveObjects.delete(value);
      check(wasm.sagejs_wasm_algebraic_close(handle), "qqbar close");
    },
    complexPrecision(value) {
      if (!value?.__sagejsAlgebraicApprox) throw new TypeError("expected approximation");
      return value.precision;
    },
    complexReal(value) {
      if (!value?.__sagejsAlgebraicApprox) throw new TypeError("expected approximation");
      return Object.freeze({
        __sagejsAlgebraicRealApprox: true,
        precision: value.precision,
        value: value.real,
      });
    },
    complexImag(value) {
      if (!value?.__sagejsAlgebraicApprox) throw new TypeError("expected approximation");
      return Object.freeze({
        __sagejsAlgebraicRealApprox: true,
        precision: value.precision,
        value: value.imag,
      });
    },
    complexRealDouble(value) { return dyadicToDouble(value.real); },
    complexImagDouble(value) { return dyadicToDouble(value.imag); },
    complexToString(value) {
      const real = formatDyadic(value.real, value.precision);
      const imagNegative = value.imag.numerator < 0n;
      const imagMagnitude = Object.freeze({
        numerator: imagNegative ? -value.imag.numerator : value.imag.numerator,
        exponent: value.imag.exponent,
      });
      const imag = formatDyadic(imagMagnitude, value.precision);
      if (value.imag.numerator === 0n) return real;
      if (value.real.numerator === 0n) return `${imagNegative ? "-" : ""}${imag}*I`;
      return imagNegative ? `${real} - ${imag}*I` : `${real} + ${imag}*I`;
    },
    realPrecision(value) {
      if (!value?.__sagejsAlgebraicRealApprox) throw new TypeError("expected real approximation");
      return value.precision;
    },
    realToDouble(value) { return dyadicToDouble(value.value); },
    realToString(value) { return formatDyadic(value.value, value.precision); },
    __sagejs_algebraic_live_count__() {
      return wasm.sagejs_wasm_algebraic_live_count() >>> 0;
    },
    __sagejs_algebraic_matrix_live_count__() {
      return wasm.sagejs_wasm_algebraic_matrix_live_count() >>> 0;
    },
    __sagejs_algebraic_matrix_close__(value) {
      const handle = matrixHandleOf(value);
      matrixFinalizer?.unregister(value);
      liveMatrices.delete(value);
      check(wasm.sagejs_wasm_algebraic_matrix_close(handle), "qqbar matrix close");
    },
    closeAlgebraicContext() {
      wasm.sagejs_wasm_algebraic_clear();
    },
  };
  return Object.freeze(backend);
}

export const algebraicResourceLimits = Object.freeze({
  maximumLiveValues: 4095,
  maximumPolynomialDegree: 256,
  maximumPackedBytes: 1_048_576,
  maximumMatrices: 255,
  maximumMatrixDimension: 128,
  maximumMatrixEntries: 4096,
});

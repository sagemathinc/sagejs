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
const MATRIX_BINARY = Object.freeze({ add: 1, sub: 2, mul: 3, stack: 4 });
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
  // Cyclotomic orders cross the generated Python/JavaScript boundary, whose
  // exact-integer representation is deliberately allowed to be either a
  // safe Number or a BigInt.  Normalize at this arithmetic boundary before
  // using BigInt operators.
  left = BigInt(left);
  right = BigInt(right);
  left = left < 0n ? -left : left;
  right = right < 0n ? -right : right;
  while (right !== 0n) [left, right] = [right, left % right];
  return left;
}

function lcm(left, right) {
  if (left === 0n || right === 0n) return 0n;
  return (left / gcd(left, right)) * right;
}

function rational(numerator, denominator = 1n) {
  numerator = BigInt(numerator);
  denominator = BigInt(denominator);
  if (denominator === 0n) throw new RangeError("division by zero");
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const divisor = gcd(numerator, denominator);
  return Object.freeze({
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  });
}

const rationalZero = rational(0n);
const rationalOne = rational(1n);

function rationalAdd(left, right) {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function rationalSub(left, right) {
  return rational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function rationalMul(left, right) {
  return rational(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  );
}

function rationalDiv(left, right) {
  return rational(
    left.numerator * right.denominator,
    left.denominator * right.numerator,
  );
}

function trimPolynomial(coefficients) {
  while (coefficients.length > 0 && coefficients.at(-1).numerator === 0n) {
    coefficients.pop();
  }
  return coefficients;
}

function polynomialAdd(left, right) {
  const result = Array.from(
    { length: Math.max(left.length, right.length) },
    (_, index) => rationalAdd(
      left[index] ?? rationalZero,
      right[index] ?? rationalZero,
    ),
  );
  return trimPolynomial(result);
}

function polynomialSub(left, right) {
  const result = Array.from(
    { length: Math.max(left.length, right.length) },
    (_, index) => rationalSub(
      left[index] ?? rationalZero,
      right[index] ?? rationalZero,
    ),
  );
  return trimPolynomial(result);
}

function polynomialMul(left, right) {
  if (left.length === 0 || right.length === 0) return [];
  const result = Array.from(
    { length: left.length + right.length - 1 },
    () => rationalZero,
  );
  for (let i = 0; i < left.length; i += 1) {
    for (let j = 0; j < right.length; j += 1) {
      result[i + j] = rationalAdd(
        result[i + j], rationalMul(left[i], right[j]),
      );
    }
  }
  return trimPolynomial(result);
}

function polynomialDivmod(dividend, divisor) {
  divisor = trimPolynomial([...divisor]);
  if (divisor.length === 0) throw new RangeError("polynomial division by zero");
  const remainder = trimPolynomial([...dividend]);
  const quotient = Array.from(
    { length: Math.max(0, remainder.length - divisor.length + 1) },
    () => rationalZero,
  );
  while (remainder.length >= divisor.length) {
    const shift = remainder.length - divisor.length;
    const coefficient = rationalDiv(remainder.at(-1), divisor.at(-1));
    quotient[shift] = coefficient;
    for (let index = 0; index < divisor.length; index += 1) {
      remainder[index + shift] = rationalSub(
        remainder[index + shift], rationalMul(coefficient, divisor[index]),
      );
    }
    trimPolynomial(remainder);
  }
  return [trimPolynomial(quotient), remainder];
}

const cyclotomicPolynomialCache = new Map();

function cyclotomicPolynomial(order) {
  order = Number(order);
  if (!Number.isSafeInteger(order) || order < 1 || order > 4096) {
    throw new RangeError(
      "exact browser cyclotomic coordinates require order at most 4096",
    );
  }
  const cached = cyclotomicPolynomialCache.get(order);
  if (cached !== undefined) return cached;
  let result = Array.from({ length: order + 1 }, () => rationalZero);
  result[0] = rational(-1n);
  result[order] = rationalOne;
  for (let divisor = 1; divisor < order; divisor += 1) {
    if (order % divisor !== 0) continue;
    const [quotient, remainder] = polynomialDivmod(
      result, cyclotomicPolynomial(divisor),
    );
    if (remainder.length !== 0) {
      throw new Error("internal non-exact cyclotomic polynomial division");
    }
    result = quotient;
  }
  const frozen = Object.freeze(result);
  cyclotomicPolynomialCache.set(order, frozen);
  return frozen;
}

function reduceCyclotomic(coefficients, order) {
  return polynomialDivmod(coefficients, cyclotomicPolynomial(order))[1];
}

function rootOfUnityCoordinates(exponent, order) {
  order = BigInt(order);
  if (order < 1n || order > 4096n) {
    throw new RangeError("exact browser cyclotomic coordinates require order at most 4096");
  }
  exponent = ((BigInt(exponent) % order) + order) % order;
  return reduceCyclotomic(Array.from(
    { length: Number(exponent) + 1 },
    (_, index) => index === Number(exponent) ? rationalOne : rationalZero,
  ), order);
}

function convertCyclotomic(expression, order) {
  order = BigInt(order);
  if (order % expression.order !== 0n) {
    throw new TypeError("cyclotomic value does not lie in the requested field");
  }
  const stride = order / expression.order;
  if (stride > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("cyclotomic embedding exponent exceeds browser limits");
  }
  const expanded = [];
  for (let index = 0; index < expression.coefficients.length; index += 1) {
    expanded[index * Number(stride)] = expression.coefficients[index];
  }
  for (let index = 0; index < expanded.length; index += 1) {
    expanded[index] ??= rationalZero;
  }
  return Object.freeze({
    order,
    coefficients: Object.freeze(reduceCyclotomic(expanded, order)),
  });
}

function cyclotomicBinary(name, left, right) {
  if (left === undefined || right === undefined) return undefined;
  if (left?.order === undefined || right?.order === undefined) {
    throw new TypeError(`malformed tracked cyclotomic expression for ${name}: ${typeof left}:${String(left)} / ${typeof right}:${String(right)}`);
  }
  const order = lcm(left.order, right.order);
  const leftCoefficients = convertCyclotomic(left, order).coefficients;
  const rightCoefficients = convertCyclotomic(right, order).coefficients;
  let coefficients;
  if (name === "add") coefficients = polynomialAdd(leftCoefficients, rightCoefficients);
  else if (name === "sub") coefficients = polynomialSub(leftCoefficients, rightCoefficients);
  else if (name === "mul") coefficients = polynomialMul(leftCoefficients, rightCoefficients);
  else if (name === "div") {
    let oldRemainder = cyclotomicPolynomial(order);
    let remainder = [...rightCoefficients];
    let oldCoefficient = [];
    let coefficient = [rationalOne];
    while (remainder.length !== 0) {
      const [quotient, nextRemainder] = polynomialDivmod(oldRemainder, remainder);
      [oldRemainder, remainder] = [remainder, nextRemainder];
      [oldCoefficient, coefficient] = [
        coefficient,
        polynomialSub(oldCoefficient, polynomialMul(quotient, coefficient)),
      ];
    }
    if (oldRemainder.length !== 1 || oldRemainder[0].numerator === 0n) {
      throw new RangeError("cyclotomic division by zero");
    }
    const scale = rationalDiv(rationalOne, oldRemainder[0]);
    const inverse = oldCoefficient.map((value) => rationalMul(value, scale));
    coefficients = polynomialMul(leftCoefficients, inverse);
  } else {
    throw new Error(`unknown cyclotomic operation ${name}`);
  }
  return Object.freeze({
    order,
    coefficients: Object.freeze(reduceCyclotomic(coefficients, order)),
  });
}

function cyclotomicPower(expression, exponent) {
  if (expression === undefined) return undefined;
  exponent = BigInt(exponent);
  let base = expression;
  if (exponent < 0n) {
    base = cyclotomicBinary(
      "div",
      { order: 1n, coefficients: [rationalOne] },
      base,
    );
    exponent = -exponent;
  }
  let result = Object.freeze({ order: 1n, coefficients: [rationalOne] });
  while (exponent !== 0n) {
    if ((exponent & 1n) !== 0n) result = cyclotomicBinary("mul", result, base);
    exponent >>= 1n;
    if (exponent !== 0n) base = cyclotomicBinary("mul", base, base);
  }
  return result;
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
    "matrix_select", "matrix_right_kernel", "matrix_pivots", "cyclotomic_coefficients",
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
  // A synchronous Python evaluation can abandon arbitrarily many immutable
  // QQbar values and matrices before JavaScript is allowed to run finalizers.
  // Preserve exact serialized values in the host and bound reactor handles by
  // deterministic LRU eviction.  Finalizers remain only a last-resort cleanup
  // path for handles still present in the cache.
  const maximumCachedValues = 256;
  const maximumCachedMatrices = 32;
  const liveObjects = new WeakMap();
  const cyclotomicExpressions = new WeakMap();
  const liveMatrices = new WeakMap();
  const activeValues = new Set();
  const activeMatrices = new Set();
  const finalizer = typeof FinalizationRegistry === "undefined"
    ? undefined
    : new FinalizationRegistry((state) => {
        if (state.handle !== 0) {
          wasm.sagejs_wasm_algebraic_close(state.handle);
          activeValues.delete(state);
          state.handle = 0;
        }
      });
  const matrixFinalizer = typeof FinalizationRegistry === "undefined"
    ? undefined
    : new FinalizationRegistry((state) => {
        if (state.handle !== 0) {
          wasm.sagejs_wasm_algebraic_matrix_close(state.handle);
          activeMatrices.delete(state);
          state.handle = 0;
        }
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

  function touch(active, state) {
    active.delete(state);
    active.add(state);
  }

  function closeValueHandle(state, operation = "qqbar cache eviction") {
    if (state.handle === 0) return;
    check(wasm.sagejs_wasm_algebraic_close(state.handle), operation);
    activeValues.delete(state);
    state.handle = 0;
  }

  function snapshotValue(state) {
    if (state.handle === 0) return;
    check(
      wasm.sagejs_wasm_algebraic_serialize(state.handle),
      "qqbar cache snapshot",
    );
    state.snapshot = outputBytes();
    closeValueHandle(state);
  }

  function pruneValues(protectedStates = new Set()) {
    while (activeValues.size > maximumCachedValues) {
      let victim;
      for (const candidate of activeValues) {
        if (!protectedStates.has(candidate)) {
          victim = candidate;
          break;
        }
      }
      if (victim === undefined) {
        return;
      }
      snapshotValue(victim);
    }
  }

  function hydrateValue(state, protectedStates) {
    if (state.handle !== 0) {
      touch(activeValues, state);
      return;
    }
    if (!(state.snapshot instanceof Uint8Array)) {
      throw new TypeError("expected a live Wasm algebraic number");
    }
    const length = writeInput(state.snapshot, "qqbar cache restore");
    check(
      wasm.sagejs_wasm_algebraic_deserialize(length),
      "qqbar cache restore",
    );
    state.handle = wasm.sagejs_wasm_algebraic_result_handle() >>> 0;
    activeValues.add(state);
    pruneValues(protectedStates);
  }

  function native(handle, cyclotomicExpression = undefined) {
    const object = Object.create(null);
    const state = { handle: handle >>> 0, snapshot: undefined };
    liveObjects.set(object, state);
    if (cyclotomicExpression !== undefined) {
      if (cyclotomicExpression === null || typeof cyclotomicExpression !== "object") {
        throw new TypeError(`invalid tracked cyclotomic expression: ${typeof cyclotomicExpression}:${String(cyclotomicExpression)}`);
      }
      cyclotomicExpressions.set(object, cyclotomicExpression);
    }
    activeValues.add(state);
    finalizer?.register(object, state, object);
    pruneValues(new Set([state]));
    return Object.freeze(object);
  }

  function statesOf(values) {
    const states = values.map((value) => liveObjects.get(value));
    if (states.some((state) => state === undefined)) {
      throw new TypeError("expected a live Wasm algebraic number");
    }
    const protectedStates = new Set(states);
    for (const state of states) hydrateValue(state, protectedStates);
    return states;
  }

  function handleOf(value) {
    return statesOf([value])[0].handle;
  }

  function nativeMatrix(handle, rows, columns, realOnly) {
    const object = Object.create(null);
    Object.defineProperties(object, {
      rows: { value: rows },
      columns: { value: columns },
      realOnly: { value: realOnly },
    });
    const state = {
      handle: handle >>> 0,
      rows,
      columns,
      realOnly,
      snapshot: undefined,
    };
    liveMatrices.set(object, state);
    activeMatrices.add(state);
    matrixFinalizer?.register(object, state, object);
    pruneMatrices(new Set([state]));
    return Object.freeze(object);
  }

  function matrixHandleOf(value) {
    const state = liveMatrices.get(value);
    if (state === undefined) {
      throw new TypeError("expected a live Wasm algebraic matrix");
    }
    hydrateMatrix(state, new Set([state]));
    return state.handle;
  }

  function closeMatrixHandle(state, operation = "qqbar matrix cache eviction") {
    if (state.handle === 0) return;
    check(wasm.sagejs_wasm_algebraic_matrix_close(state.handle), operation);
    activeMatrices.delete(state);
    state.handle = 0;
  }

  function snapshotMatrix(state) {
    if (state.handle === 0) return;
    const entries = [];
    for (let row = 0; row < state.rows; row += 1) {
      for (let column = 0; column < state.columns; column += 1) {
        check(
          wasm.sagejs_wasm_algebraic_matrix_entry(
            state.handle, row, column,
          ),
          "qqbar matrix cache entry",
        );
        const entryHandle = wasm.sagejs_wasm_algebraic_result_handle() >>> 0;
        try {
          check(
            wasm.sagejs_wasm_algebraic_serialize(entryHandle),
            "qqbar matrix cache snapshot",
          );
          entries.push(outputBytes());
        } finally {
          check(
            wasm.sagejs_wasm_algebraic_close(entryHandle),
            "qqbar matrix cache entry close",
          );
        }
      }
    }
    state.snapshot = Object.freeze(entries);
    closeMatrixHandle(state);
  }

  function pruneMatrices(protectedStates = new Set()) {
    while (activeMatrices.size > maximumCachedMatrices) {
      let victim;
      for (const candidate of activeMatrices) {
        if (!protectedStates.has(candidate)) {
          victim = candidate;
          break;
        }
      }
      if (victim === undefined) {
        return;
      }
      snapshotMatrix(victim);
    }
  }

  function hydrateMatrix(state, protectedStates) {
    if (state.handle !== 0) {
      touch(activeMatrices, state);
      return;
    }
    if (!Array.isArray(state.snapshot)) {
      throw new TypeError("expected a live Wasm algebraic matrix");
    }
    const handles = [];
    try {
      for (const entry of state.snapshot) {
        const length = writeInput(entry, "qqbar matrix cache restore");
        check(
          wasm.sagejs_wasm_algebraic_deserialize(length),
          "qqbar matrix cache restore",
        );
        handles.push(wasm.sagejs_wasm_algebraic_result_handle() >>> 0);
      }
      new Uint32Array(
        memory.buffer,
        matrixEntryHandlesPointer,
        handles.length,
      ).set(handles);
      check(
        wasm.sagejs_wasm_algebraic_matrix_create(
          state.rows,
          state.columns,
          handles.length,
          state.realOnly ? 1 : 0,
        ),
        "qqbar matrix cache restore",
      );
      state.handle = wasm.sagejs_wasm_algebraic_result_handle() >>> 0;
    } finally {
      for (const handle of handles.reverse()) {
        check(
          wasm.sagejs_wasm_algebraic_close(handle),
          "qqbar matrix cache restore entry close",
        );
      }
    }
    activeMatrices.add(state);
    pruneMatrices(protectedStates);
  }

  function fallbackMatrix(name, arguments_) {
    const method = matrixFallback?.[name];
    if (typeof method !== "function") {
      throw new TypeError(`matrix backend does not implement ${name}`);
    }
    return Reflect.apply(method, matrixFallback, arguments_);
  }

  function checkedSelection(indices, size) {
    const answer = Array.from(indices, Number);
    if (answer.length > 128 || answer.some((index) =>
      !Number.isSafeInteger(index) || index < 0 || index >= size)) {
      throw new RangeError("algebraic matrix selection is out of range");
    }
    return answer;
  }

  function matrixSelect(value, indices, columns) {
    const selected = checkedSelection(indices, columns ? value.columns : value.rows);
    // Hydrate before publishing the index buffer: hydration also uses the
    // shared ingress arena. Selection itself is one packed Wasm crossing.
    const handle = matrixHandleOf(value);
    new Uint32Array(memory.buffer, matrixEntryHandlesPointer, selected.length).set(selected);
    return matrixResult(
      wasm.sagejs_wasm_algebraic_matrix_select(handle, selected.length, columns ? 1 : 0),
      columns ? "select-columns" : "select-rows",
      columns ? value.rows : selected.length,
      columns ? selected.length : value.columns,
      value.realOnly, 12 + selected.length * 4,
    );
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
      name === "stack" ? left.rows + right.rows : left.rows,
      columns,
      left.realOnly,
      8,
    );
  }

  function resultNative(status, operation, cyclotomicExpression = undefined) {
    check(status, operation);
    return native(
      wasm.sagejs_wasm_algebraic_result_handle() >>> 0,
      cyclotomicExpression,
    );
  }

  function packedCall(name, values, ...arguments_) {
    const bytes = packExactIntegers(values);
    const length = writeInput(bytes, name);
    return resultNative(
      wasm[`sagejs_wasm_algebraic_${name}`](...arguments_, length),
      name,
    );
  }

  function unary(name, value, cyclotomicExpression = undefined) {
    return resultNative(
      wasm.sagejs_wasm_algebraic_unary(UNARY[name], handleOf(value)),
      `qqbar ${name}`,
      cyclotomicExpression,
    );
  }

  function binary(name, left, right) {
    return resultNative(
      wasm.sagejs_wasm_algebraic_binary(
        BINARY[name], handleOf(left), handleOf(right),
      ),
      `qqbar ${name}`,
      cyclotomicBinary(
        name,
        cyclotomicExpressions.get(left),
        cyclotomicExpressions.get(right),
      ),
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
      const value = packedCall("from_rational", [numerator, denominator]);
      cyclotomicExpressions.set(value, Object.freeze({
        order: 1n,
        coefficients: Object.freeze([rational(numerator, denominator)]),
      }));
      return value;
    },
    qqbarI() {
      return resultNative(
        wasm.sagejs_wasm_algebraic_i(),
        "qqbar I",
        Object.freeze({
          order: 4n,
          coefficients: Object.freeze([rationalZero, rationalOne]),
        }),
      );
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
      const expression = order <= 4096n
        ? Object.freeze({
            order,
            coefficients: Object.freeze(rootOfUnityCoordinates(exponent, order)),
          })
        : undefined;
      return resultNative(
        wasm.sagejs_wasm_algebraic_root_of_unity(
          Number(exponent), Number(order),
        ),
        "qqbar root of unity",
        expression,
      );
    },
    qqbarAdd(left, right) { return binary("add", left, right); },
    qqbarSub(left, right) { return binary("sub", left, right); },
    qqbarMul(left, right) { return binary("mul", left, right); },
    qqbarDiv(left, right) { return binary("div", left, right); },
    qqbarNeg(value) {
      const expression = cyclotomicExpressions.get(value);
      return unary(
        "neg",
        value,
        expression === undefined ? undefined : Object.freeze({
          order: expression.order,
          coefficients: Object.freeze(
            expression.coefficients.map((coefficient) =>
              rational(-coefficient.numerator, coefficient.denominator)),
          ),
        }),
      );
    },
    qqbarSqrt(value) { return unary("sqrt", value); },
    qqbarReal(value) { return unary("real", value); },
    qqbarImag(value) { return unary("imag", value); },
    qqbarConjugate(value) {
      const expression = cyclotomicExpressions.get(value);
      let conjugate;
      if (expression !== undefined) {
        conjugate = Object.freeze({ order: 1n, coefficients: Object.freeze([]) });
        for (let index = 0; index < expression.coefficients.length; index += 1) {
          const coefficient = expression.coefficients[index];
          if (coefficient.numerator === 0n) continue;
          const exponent = index === 0 ? 0 : Number(expression.order) - index;
          const monomial = Array.from(
            { length: exponent + 1 },
            (_, position) => position === exponent ? coefficient : rationalZero,
          );
          conjugate = cyclotomicBinary(
            "add",
            conjugate,
            { order: expression.order, coefficients: monomial },
          );
        }
      }
      return unary("conjugate", value, conjugate);
    },
    qqbarAbs(value) { return unary("abs", value); },
    qqbarPow(value, exponent) {
      const result = packedCall("pow", [exponent], handleOf(value));
      const expression = cyclotomicPower(
        cyclotomicExpressions.get(value), exponent,
      );
      if (expression !== undefined) cyclotomicExpressions.set(result, expression);
      return result;
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
    cyclotomicRootCoefficients(exponent, order) {
      const result = rootOfUnityCoordinates(exponent, order).map((value) => {
        if (value.denominator !== 1n) {
          throw new Error("root-of-unity power coordinates must be integral");
        }
        return value.numerator;
      });
      recordCapability(
        "napi:@sagemath/sagejs-flint:cyclotomicRootCoefficients",
        "shared-runtime-js",
        { executionTarget: "host-runtime-js", ingressBytes: 16 },
      );
      return result;
    },
    cyclotomicElementCoefficients(value, order) {
      order = BigInt(order);
      if (order < 1n || order > 0xffff_ffffn) {
        throw new RangeError("cyclotomic order must be between 1 and 2^32-1");
      }
      const expression = cyclotomicExpressions.get(value);
      if (expression === undefined) {
        const [denominator, ...numerators] = unpackExactIntegers(
          encodedOutput("cyclotomic_coefficients", value, Number(order)),
        );
        recordCapability(
          "napi:@sagemath/sagejs-flint:cyclotomicElementCoefficients",
          "receipt-backed-wasm-artifact",
          { executionTarget: "wasm-artifact", ingressBytes: 8 },
        );
        return numerators.map((numerator) => [numerator, denominator]);
      }
      const result = convertCyclotomic(expression, order).coefficients.map(
        (coefficient) => [coefficient.numerator, coefficient.denominator],
      );
      recordCapability(
        "napi:@sagemath/sagejs-flint:cyclotomicElementCoefficients",
        "shared-runtime-js",
        { executionTarget: "host-runtime-js", ingressBytes: 8 },
      );
      return result;
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
          rows * columns > 4095) {
        throw new RangeError("algebraic matrix dimensions exceed browser limits");
      }
      if (!Array.isArray(entries) || entries.length !== rows * columns) {
        throw new RangeError("algebraic matrix entry count does not match dimensions");
      }
      const states = statesOf(entries);
      const handles = states.map((state) => state.handle);
      try {
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
      } finally {
        pruneValues();
      }
    },
    matrixSelectRows(value, indices) {
      if (!liveMatrices.has(value)) return fallbackMatrix("matrixSelectRows", [value, indices]);
      return matrixSelect(value, indices, false);
    },
    matrixSelectColumns(value, indices) {
      if (!liveMatrices.has(value)) return fallbackMatrix("matrixSelectColumns", [value, indices]);
      return matrixSelect(value, indices, true);
    },
    matrixStack(top, bottom) { return matrixBinary("stack", top, bottom); },
    matrixAdd(left, right) { return matrixBinary("add", left, right); },
    matrixSub(left, right) { return matrixBinary("sub", left, right); },
    matrixMul(left, right) { return matrixBinary("mul", left, right); },
    matrixSparseLeftMul(left, right) {
      if (!liveMatrices.has(left)) {
        return fallbackMatrix("matrixSparseLeftMul", [left, right]);
      }
      // Sparse-left is an optimization hint, not a different operation.
      // Algebraic resources must stay in their owning exact Wasm backend.
      return matrixBinary("mul", left, right);
    },
    matrixNeg(value) { return matrixUnary("neg", value); },
    matrixTranspose(value) { return matrixUnary("transpose", value); },
    matrixRref(value) { return matrixUnary("rref", value); },
    matrixRightKernel(value) {
      if (!liveMatrices.has(value)) return fallbackMatrix("matrixRightKernel", [value]);
      const status = wasm.sagejs_wasm_algebraic_matrix_right_kernel(matrixHandleOf(value));
      return matrixResult(status, "right-kernel",
        wasm.sagejs_wasm_algebraic_result_count(), value.columns, value.realOnly);
    },
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
    matrixPivots(value) {
      if (!liveMatrices.has(value)) return fallbackMatrix("matrixPivots", [value]);
      check(wasm.sagejs_wasm_algebraic_matrix_pivots(matrixHandleOf(value)),
        "qqbar matrix pivots");
      const count = wasm.sagejs_wasm_algebraic_result_count() >>> 0;
      const columns = Array.from(new Uint32Array(memory.buffer, matrixEntryHandlesPointer, count));
      recordMatrix("pivots", 4, count * 4);
      return columns;
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
      // Array.from passes the element index as the callback's second
      // argument.  Do not forward that index as optional cyclotomic
      // provenance to native().
      const coefficients = Array.from(handles, (handle) => native(handle));
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
        const state = liveMatrices.get(inverse);
        liveMatrices.delete(inverse);
        closeMatrixHandle(state, "qqbar matrix temporary close");
      }
    },
    qqbarClose(value) {
      const state = liveObjects.get(value);
      if (state === undefined) {
        throw new TypeError("expected a live Wasm algebraic number");
      }
      finalizer?.unregister(value);
      liveObjects.delete(value);
      closeValueHandle(state, "qqbar close");
      state.snapshot = undefined;
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
      const state = liveMatrices.get(value);
      if (state === undefined) {
        throw new TypeError("expected a live Wasm algebraic matrix");
      }
      matrixFinalizer?.unregister(value);
      liveMatrices.delete(value);
      closeMatrixHandle(state, "qqbar matrix close");
      state.snapshot = undefined;
    },
    closeAlgebraicContext() {
      wasm.sagejs_wasm_algebraic_clear();
    },
    algebraicHandleCacheLimits: Object.freeze({
      values: maximumCachedValues,
      matrices: maximumCachedMatrices,
    }),
  };
  return Object.freeze(backend);
}

export const algebraicResourceLimits = Object.freeze({
  maximumLiveValues: 4095,
  maximumPolynomialDegree: 256,
  maximumPackedBytes: 1_048_576,
  maximumMatrices: 255,
  maximumMatrixDimension: 128,
  maximumMatrixEntries: 4095,
});

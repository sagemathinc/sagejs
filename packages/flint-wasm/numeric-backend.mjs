const LOG10_2 = 0.3010299956639812;

const REPRESENTATION_METHODS = Object.freeze([
  "complexPrecision",
  "complexReal",
  "complexImag",
  "complexRealDouble",
  "complexImagDouble",
  "complexToString",
  "realPrecision",
  "realToDouble",
  "realToString",
]);

/**
 * Compose ordinary browser numeric values with optional exact algebraic
 * approximations. The specialist backend must not shadow ordinary
 * `RealField` and `ComplexField` accessors merely because it is loaded.
 */
export function composeNumericRepresentationBackends(
  numericBackend,
  algebraicBackend = {},
) {
  const composed = {};
  for (const name of REPRESENTATION_METHODS) {
    composed[name] = (value, ...args) => {
      const algebraic =
        value?.__sagejsAlgebraicApprox === true ||
        value?.__sagejsAlgebraicRealApprox === true;
      const implementation = algebraic
        ? algebraicBackend[name]
        : numericBackend[name];
      if (typeof implementation !== "function") {
        throw new TypeError(
          `${algebraic ? "algebraic" : "ordinary"} numeric backend does not implement ${name}`,
        );
      }
      return implementation(value, ...args);
    };
  }
  return Object.freeze(composed);
}

function gcd(left, right) {
  left = left < 0n ? -left : left;
  right = right < 0n ? -right : right;
  while (right !== 0n) [left, right] = [right, left % right];
  return left;
}

function rational(numerator, denominator = 1n) {
  if (denominator === 0n) throw new RangeError("division by zero");
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const divisor = gcd(numerator, denominator);
  return Object.freeze({ numerator: numerator / divisor, denominator: denominator / divisor });
}

function decimalRational(value) {
  if (
    value !== null && typeof value === "object" &&
    typeof value.numerator === "bigint" && typeof value.denominator === "bigint"
  ) return rational(value.numerator, value.denominator);
  if (value?.__sagejsWasmReal === true) return value.value;
  if (value?.__sagejsAlgebraicRealApprox === true) return dyadicRational(value.value);
  if (typeof value === "bigint") return rational(value);
  const text = String(value).trim();
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match || (!match[2] && !match[3])) {
    throw new TypeError(`invalid finite decimal ${JSON.stringify(text)}`);
  }
  const digits = `${match[2] || "0"}${match[3] || ""}`;
  const exponent = Number(match[4] || 0) - (match[3]?.length || 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1_000_000) {
    throw new RangeError("decimal exponent is outside the browser numeric limit");
  }
  let numerator = BigInt(digits || "0");
  if (match[1] === "-") numerator = -numerator;
  return exponent >= 0
    ? rational(numerator * 10n ** BigInt(exponent))
    : rational(numerator, 10n ** BigInt(-exponent));
}

function dyadicRational(value) {
  const exponent = BigInt(value.exponent);
  const numerator = BigInt(value.numerator);
  return exponent >= 0n
    ? rational(numerator << exponent)
    : rational(numerator, 1n << -exponent);
}

function add(left, right) {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function sub(left, right) {
  return rational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function mul(left, right) {
  return rational(left.numerator * right.numerator, left.denominator * right.denominator);
}

function div(left, right) {
  return rational(left.numerator * right.denominator, left.denominator * right.numerator);
}

function neg(value) {
  return rational(-value.numerator, value.denominator);
}

function pow(value, exponent) {
  exponent = BigInt(exponent);
  if (exponent === 0n) return rational(1n);
  if (exponent < 0n) return pow(rational(value.denominator, value.numerator), -exponent);
  let result = rational(1n);
  let base = value;
  while (exponent !== 0n) {
    if (exponent & 1n) result = mul(result, base);
    exponent >>= 1n;
    if (exponent !== 0n) base = mul(base, base);
  }
  return result;
}

function decimalDigits(bits) {
  return Math.max(2, Math.ceil(Number(bits) * LOG10_2) + 3);
}

function decimalText(value, bits) {
  if (value.numerator === 0n) return "0";
  const negative = value.numerator < 0n;
  let numerator = negative ? -value.numerator : value.numerator;
  const integer = numerator / value.denominator;
  let remainder = numerator % value.denominator;
  const digits = decimalDigits(bits);
  let fractional = "";
  for (let index = 0; index < digits && remainder !== 0n; index += 1) {
    remainder *= 10n;
    fractional += String(remainder / value.denominator);
    remainder %= value.denominator;
  }
  fractional = fractional.replace(/0+$/, "");
  return `${negative ? "-" : ""}${integer}${fractional ? `.${fractional}` : ""}`;
}

function real(value, precision) {
  return Object.freeze({
    __sagejsWasmReal: true,
    precision: Number(precision),
    value: decimalRational(value),
  });
}

function complex(realPart, imaginaryPart, precision) {
  return Object.freeze({
    __sagejsWasmComplex: true,
    precision: Number(precision),
    real: decimalRational(realPart),
    imaginary: decimalRational(imaginaryPart),
  });
}

function realValue(value) {
  if (value?.__sagejsWasmReal === true) return value.value;
  if (value?.__sagejsAlgebraicRealApprox === true) return dyadicRational(value.value);
  throw new TypeError("expected a browser real value");
}

function complexValue(value) {
  if (value?.__sagejsWasmComplex === true) return value;
  if (value?.__sagejsAlgebraicApprox === true) {
    return complex(dyadicRational(value.real), dyadicRational(value.imag), value.precision);
  }
  throw new TypeError("expected a browser complex value");
}

function withPrecision(value, precision) {
  return complex(value.real, value.imaginary, precision);
}

/**
 * Host-neutral numeric objects used by `RealField` and `ComplexField`.
 *
 * Decimal ingress and all field operations use exact BigInt rationals. The
 * precision is presentation metadata matching the FLINT midpoint that entered
 * the browser; conversion to binary64 is explicit.
 */
export function createPortableNumericBackend() {
  const backend = {
    realFromString(value, precision) { return real(value, precision); },
    realFromBigInt(value, precision) { return real(BigInt(value), precision); },
    realFromRational(numerator, denominator, precision) {
      return real(rational(BigInt(numerator), BigInt(denominator)), precision);
    },
    realRound(value, precision) { return real(realValue(value), precision); },
    realPrecision(value) { return Number(value.precision); },
    realAdd(left, right) { return real(add(realValue(left), realValue(right)), left.precision); },
    realSub(left, right) { return real(sub(realValue(left), realValue(right)), left.precision); },
    realMul(left, right) { return real(mul(realValue(left), realValue(right)), left.precision); },
    realDiv(left, right) { return real(div(realValue(left), realValue(right)), left.precision); },
    realNeg(value) { return real(neg(realValue(value)), value.precision); },
    realPowInt(value, exponent) { return real(pow(realValue(value), exponent), value.precision); },
    realEqual(left, right) {
      const difference = sub(realValue(left), realValue(right));
      return difference.numerator === 0n;
    },
    realToDouble(value) { return Number(decimalText(realValue(value), value.precision)); },
    realToString(value) { return decimalText(realValue(value), value.precision); },
    complexFromReals(realPart, imaginaryPart) {
      if (realPart.precision !== imaginaryPart.precision) {
        throw new RangeError("complex components must have the same precision");
      }
      return complex(realValue(realPart), realValue(imaginaryPart), realPart.precision);
    },
    complexFromStrings(realPart, imaginaryPart, precision) {
      return complex(realPart, imaginaryPart, precision);
    },
    complexRound(value, precision) { return withPrecision(complexValue(value), precision); },
    complexPrecision(value) { return Number(value.precision); },
    complexReal(value) {
      value = complexValue(value);
      return real(value.real, value.precision);
    },
    complexImag(value) {
      value = complexValue(value);
      return real(value.imaginary, value.precision);
    },
    complexRealDouble(value) {
      value = complexValue(value);
      return Number(decimalText(value.real, value.precision));
    },
    complexImagDouble(value) {
      value = complexValue(value);
      return Number(decimalText(value.imaginary, value.precision));
    },
    complexAdd(left, right) {
      left = complexValue(left); right = complexValue(right);
      return complex(add(left.real, right.real), add(left.imaginary, right.imaginary), left.precision);
    },
    complexSub(left, right) {
      left = complexValue(left); right = complexValue(right);
      return complex(sub(left.real, right.real), sub(left.imaginary, right.imaginary), left.precision);
    },
    complexMul(left, right) {
      left = complexValue(left); right = complexValue(right);
      return complex(
        sub(mul(left.real, right.real), mul(left.imaginary, right.imaginary)),
        add(mul(left.real, right.imaginary), mul(left.imaginary, right.real)),
        left.precision,
      );
    },
    complexDiv(left, right) {
      left = complexValue(left); right = complexValue(right);
      const denominator = add(mul(right.real, right.real), mul(right.imaginary, right.imaginary));
      return complex(
        div(add(mul(left.real, right.real), mul(left.imaginary, right.imaginary)), denominator),
        div(sub(mul(left.imaginary, right.real), mul(left.real, right.imaginary)), denominator),
        left.precision,
      );
    },
    complexNeg(value) {
      value = complexValue(value);
      return complex(neg(value.real), neg(value.imaginary), value.precision);
    },
    complexPowInt(value, exponent) {
      value = complexValue(value);
      exponent = BigInt(exponent);
      if (exponent < 0n) {
        const one = complex(1, 0, value.precision);
        return backend.complexPowInt(backend.complexDiv(one, value), -exponent);
      }
      let result = complex(1, 0, value.precision);
      let base = value;
      while (exponent !== 0n) {
        if (exponent & 1n) result = backend.complexMul(result, base);
        exponent >>= 1n;
        if (exponent !== 0n) base = backend.complexMul(base, base);
      }
      return result;
    },
    complexEqual(left, right) {
      left = complexValue(left); right = complexValue(right);
      return sub(left.real, right.real).numerator === 0n &&
        sub(left.imaginary, right.imaginary).numerator === 0n;
    },
    complexToString(value) {
      value = complexValue(value);
      const realText = decimalText(value.real, value.precision);
      const imaginaryNegative = value.imaginary.numerator < 0n;
      const magnitude = imaginaryNegative ? neg(value.imaginary) : value.imaginary;
      const imaginaryText = decimalText(magnitude, value.precision);
      if (value.imaginary.numerator === 0n) return realText;
      if (value.real.numerator === 0n) return `${imaginaryNegative ? "-" : ""}${imaginaryText}*I`;
      return `${realText}${imaginaryNegative ? " - " : " + "}${imaginaryText}*I`;
    },
    serializeAnalyticPoint(value) {
      value = complexValue(value);
      return [decimalText(value.real, value.precision), decimalText(value.imaginary, value.precision)];
    },
  };
  return Object.freeze(backend);
}

const wasmNumericStatus = Object.freeze({
  1: "invalid or closed WebAssembly numeric resource",
  2: "invalid WebAssembly numeric input",
  3: "WebAssembly numeric allocation failed",
  4: "WebAssembly numeric resource limit reached",
  5: "unsupported or malformed WebAssembly numeric expression",
  6: "expression has no bracketed root on the interval",
  7: "expression produced a non-finite value",
});

const wasmNumericExports = Object.freeze([
  "sagejs_numeric_input",
  "sagejs_numeric_input_capacity",
  "sagejs_numeric_output",
  "sagejs_numeric_output_capacity",
  "sagejs_numeric_last_status",
  "sagejs_numeric_live_count",
  "sagejs_numeric_real_from_string",
  "sagejs_numeric_real_round",
  "sagejs_numeric_real_binary",
  "sagejs_numeric_real_neg",
  "sagejs_numeric_real_pow_int",
  "sagejs_numeric_real_equal",
  "sagejs_numeric_real_precision",
  "sagejs_numeric_real_to_double",
  "sagejs_numeric_real_format",
  "sagejs_numeric_real_close",
  "sagejs_numeric_complex_from_reals",
  "sagejs_numeric_complex_round",
  "sagejs_numeric_complex_binary",
  "sagejs_numeric_complex_neg",
  "sagejs_numeric_complex_pow_int",
  "sagejs_numeric_complex_equal",
  "sagejs_numeric_complex_precision",
  "sagejs_numeric_complex_part",
  "sagejs_numeric_complex_part_double",
  "sagejs_numeric_complex_format",
  "sagejs_numeric_complex_close",
  "sagejs_numeric_complex_ei",
  "sagejs_numeric_complex_bessel_i",
  "sagejs_numeric_zeta_zero_output",
  "sagejs_numeric_zeta_zeros",
  "sagejs_numeric_symbolic_integral",
  "sagejs_numeric_symbolic_find_root",
  "sagejs_numeric_symbolic_result",
]);

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

const expressionUnaryOpcodes = Object.freeze({
  Sin: 8,
  Cos: 9,
  Exp: 10,
  Ln: 11,
  Log: 11,
  Sqrt: 12,
  Tan: 13,
  Abs: 14,
});

function numericRecord(value) {
  if (value !== null && typeof value === "object" && !Array.isArray(value) &&
      Object.hasOwn(value, "num")) {
    return Number(value.num);
  }
  return undefined;
}

/** Compile the supported real MathJSON subset to a bounded RPN packet. */
export function compileNumericExpression(tree, variable) {
  const instructions = [];
  const emit = (opcode, value = 0) => {
    instructions.push([opcode, value]);
    if (instructions.length > 4096) {
      throw new RangeError("numeric expression exceeds 4096 operations");
    }
  };
  const visit = (value) => {
    if (typeof value === "number" || typeof value === "bigint") {
      const number = Number(value);
      if (!Number.isFinite(number)) throw new TypeError("non-finite numeric constant");
      emit(1, number);
      return;
    }
    if (typeof value === "string") {
      if (value === variable) emit(0);
      else if (value === "Pi") emit(1, Math.PI);
      else if (value === "ExponentialE") emit(1, Math.E);
      else throw new TypeError(`unknown numeric symbol ${value}`);
      return;
    }
    const recorded = numericRecord(value);
    if (recorded !== undefined) {
      if (!Number.isFinite(recorded)) throw new TypeError("non-finite numeric record");
      emit(1, recorded);
      return;
    }
    if (!Array.isArray(value) || value.length < 2) {
      throw new TypeError("invalid numeric expression tree");
    }
    const [head, ...operands] = value;
    if (head === "Rational" && operands.length === 2) {
      const numerator = Number(operands[0]);
      const denominator = Number(operands[1]);
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
        throw new TypeError("invalid rational constant");
      }
      emit(1, numerator / denominator);
      return;
    }
    if (head === "Negate" && operands.length === 1) {
      visit(operands[0]);
      emit(7);
      return;
    }
    const unary = expressionUnaryOpcodes[head];
    if (unary !== undefined && operands.length === 1) {
      visit(operands[0]);
      emit(unary);
      return;
    }
    if ((head === "Power" || head === "Divide" || head === "Subtract") &&
        operands.length === 2) {
      visit(operands[0]);
      visit(operands[1]);
      emit(head === "Subtract" ? 3 : head === "Divide" ? 5 : 6);
      return;
    }
    if ((head === "Add" || head === "Multiply") && operands.length >= 1) {
      visit(operands[0]);
      for (let index = 1; index < operands.length; index += 1) {
        visit(operands[index]);
        emit(head === "Add" ? 2 : 4);
      }
      return;
    }
    throw new TypeError(`unsupported numeric expression head ${head}`);
  };
  visit(tree);
  const bytes = new Uint8Array(instructions.length * 12);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < instructions.length; index += 1) {
    view.setUint32(index * 12, instructions[index][0], true);
    view.setFloat64(index * 12 + 4, instructions[index][1], true);
  }
  return bytes;
}

function createWasmNumericBackend(instance, { recordCapability = () => {} } = {}) {
  const exports = instance?.exports;
  const memory = exports?.memory;
  if (!(memory instanceof WebAssembly.Memory)) {
    throw new TypeError("numeric WebAssembly memory is unavailable");
  }
  for (const name of wasmNumericExports) {
    if (typeof exports[name] !== "function") {
      throw new TypeError(`missing numeric WebAssembly export ${name}`);
    }
  }

  const realObjects = new WeakSet();
  const complexObjects = new WeakSet();
  const closedObjects = new WeakSet();
  const realFinalizer = typeof FinalizationRegistry === "undefined"
    ? undefined
    : new FinalizationRegistry((handle) => {
        exports.sagejs_numeric_real_close(handle);
      });
  const complexFinalizer = typeof FinalizationRegistry === "undefined"
    ? undefined
    : new FinalizationRegistry((handle) => {
        exports.sagejs_numeric_complex_close(handle);
      });

  const uint32 = (value) => Number(value) >>> 0;
  const status = () => uint32(exports.sagejs_numeric_last_status());
  const failure = (operation) => {
    const code = status();
    const message = wasmNumericStatus[code] ?? `WebAssembly numeric failure ${code}`;
    const ErrorType = code === 1 || code === 2 ? TypeError
      : code === 4 ? RangeError : Error;
    throw new ErrorType(`${operation}: ${message}`);
  };
  const trace = (name, ingressBytes = 0, egressBytes = 0) => {
    recordCapability(
      `napi:@sagemath/sagejs-flint:${name}`,
      "receipt-backed-wasm-artifact",
      {
        executionTarget: "wasm-artifact",
        ingressBytes,
        egressBytes,
      },
    );
  };

  function writeInput(value, operation) {
    const bytes = utf8Encoder.encode(String(value).replaceAll("_", ""));
    const pointer = uint32(exports.sagejs_numeric_input());
    const capacity = uint32(exports.sagejs_numeric_input_capacity());
    if (bytes.length + 1 > capacity || pointer + bytes.length + 1 > memory.buffer.byteLength) {
      throw new RangeError(`${operation} input exceeds ${capacity - 1} bytes`);
    }
    const output = new Uint8Array(memory.buffer, pointer, bytes.length + 1);
    output.set(bytes);
    output[bytes.length] = 0;
    return bytes.length;
  }

  function writeExpression(tree, variable) {
    let bytes;
    try {
      bytes = compileNumericExpression(tree, variable);
    } catch (error) {
      if (error instanceof TypeError) return undefined;
      throw error;
    }
    const pointer = uint32(exports.sagejs_numeric_input());
    const capacity = uint32(exports.sagejs_numeric_input_capacity());
    if (bytes.length > capacity || pointer + bytes.length > memory.buffer.byteLength) {
      throw new RangeError(`numeric expression exceeds ${capacity} bytes`);
    }
    new Uint8Array(memory.buffer, pointer, bytes.length).set(bytes);
    return bytes.length;
  }

  function readOutput(operation) {
    const pointer = uint32(exports.sagejs_numeric_output());
    const capacity = uint32(exports.sagejs_numeric_output_capacity());
    if (pointer + capacity > memory.buffer.byteLength) {
      throw new Error(`${operation} returned an invalid output range`);
    }
    const bytes = new Uint8Array(memory.buffer, pointer, capacity);
    const end = bytes.indexOf(0);
    if (end < 0) throw new Error(`${operation} returned unterminated text`);
    return utf8Decoder.decode(bytes.subarray(0, end));
  }

  function resource(kind, handle, precision, operation) {
    handle = uint32(handle);
    if (handle === 0) failure(operation);
    const value = Object.freeze({
      __sagejsWasmNumericResource: kind,
      handle,
      precision: Number(precision),
    });
    if (kind === "real") {
      realObjects.add(value);
      realFinalizer?.register(value, handle, value);
    } else {
      complexObjects.add(value);
      complexFinalizer?.register(value, handle, value);
    }
    return value;
  }

  function requireResource(value, kind) {
    const objects = kind === "real" ? realObjects : complexObjects;
    if (!objects.has(value) || closedObjects.has(value)) {
      throw new TypeError(`expected a live WebAssembly ${kind} resource`);
    }
    return value;
  }

  function close(value) {
    const kind = realObjects.has(value) ? "real"
      : complexObjects.has(value) ? "complex" : undefined;
    if (kind === undefined) throw new TypeError("expected a WebAssembly numeric resource");
    if (closedObjects.has(value)) return false;
    const finalizer = kind === "real" ? realFinalizer : complexFinalizer;
    finalizer?.unregister(value);
    const answer = kind === "real"
      ? exports.sagejs_numeric_real_close(value.handle)
      : exports.sagejs_numeric_complex_close(value.handle);
    if (answer !== 1) failure(`${kind} close`);
    closedObjects.add(value);
    return true;
  }

  const real = (handle, precision, operation) =>
    resource("real", handle, precision, operation);
  const complex = (handle, precision, operation) =>
    resource("complex", handle, precision, operation);
  const realPrecision = (value) => {
    value = requireResource(value, "real");
    const answer = uint32(exports.sagejs_numeric_real_precision(value.handle));
    if (answer === 0) failure("real precision");
    return answer;
  };
  const complexPrecision = (value) => {
    value = requireResource(value, "complex");
    const answer = uint32(exports.sagejs_numeric_complex_precision(value.handle));
    if (answer === 0) failure("complex precision");
    return answer;
  };

  function realFromText(value, precision, name) {
    const ingressBytes = writeInput(value, name);
    const answer = real(
      exports.sagejs_numeric_real_from_string(Number(precision)),
      precision,
      name,
    );
    trace(name, ingressBytes, 4);
    return answer;
  }

  function realBinary(name, operation, left, right) {
    left = requireResource(left, "real");
    right = requireResource(right, "real");
    const answer = real(
      exports.sagejs_numeric_real_binary(operation, left.handle, right.handle),
      left.precision,
      name,
    );
    trace(name, 8, 4);
    return answer;
  }

  function complexBinary(name, operation, left, right) {
    left = requireResource(left, "complex");
    right = requireResource(right, "complex");
    const answer = complex(
      exports.sagejs_numeric_complex_binary(operation, left.handle, right.handle),
      left.precision,
      name,
    );
    trace(name, 8, 4);
    return answer;
  }

  const backend = {
    realFromString(value, precision) {
      return realFromText(value, precision, "realFromString");
    },
    realFromBigInt(value, precision) {
      return realFromText(BigInt(value), precision, "realFromBigInt");
    },
    realFromRational(numerator, denominator, precision) {
      return realFromText(
        `${BigInt(numerator)}/${BigInt(denominator)}`,
        precision,
        "realFromRational",
      );
    },
    realRound(value, precision) {
      value = requireResource(value, "real");
      const answer = real(
        exports.sagejs_numeric_real_round(value.handle, Number(precision)),
        precision,
        "realRound",
      );
      trace("realRound", 8, 4);
      return answer;
    },
    realPrecision,
    realAdd(left, right) { return realBinary("realAdd", 0, left, right); },
    realSub(left, right) { return realBinary("realSub", 1, left, right); },
    realMul(left, right) { return realBinary("realMul", 2, left, right); },
    realDiv(left, right) { return realBinary("realDiv", 3, left, right); },
    realNeg(value) {
      value = requireResource(value, "real");
      const answer = real(
        exports.sagejs_numeric_real_neg(value.handle),
        value.precision,
        "realNeg",
      );
      trace("realNeg", 4, 4);
      return answer;
    },
    realPowInt(value, exponent) {
      value = requireResource(value, "real");
      const ingressBytes = writeInput(BigInt(exponent), "realPowInt");
      const answer = real(
        exports.sagejs_numeric_real_pow_int(value.handle),
        value.precision,
        "realPowInt",
      );
      trace("realPowInt", ingressBytes + 4, 4);
      return answer;
    },
    realEqual(left, right) {
      left = requireResource(left, "real");
      right = requireResource(right, "real");
      const answer = exports.sagejs_numeric_real_equal(left.handle, right.handle);
      if (answer < 0) failure("realEqual");
      trace("realEqual", 8, 1);
      return answer === 1;
    },
    realToDouble(value) {
      value = requireResource(value, "real");
      const answer = exports.sagejs_numeric_real_to_double(value.handle);
      if (status() !== 0) failure("realToDouble");
      trace("realToDouble", 4, 8);
      return answer;
    },
    realToString(value) {
      value = requireResource(value, "real");
      if (exports.sagejs_numeric_real_format(value.handle) !== 1) failure("realToString");
      const answer = readOutput("realToString");
      trace("realToString", 4, utf8Encoder.encode(answer).length);
      return answer;
    },
    complexFromReals(realPart, imaginaryPart) {
      realPart = requireResource(realPart, "real");
      imaginaryPart = requireResource(imaginaryPart, "real");
      const answer = complex(
        exports.sagejs_numeric_complex_from_reals(realPart.handle, imaginaryPart.handle),
        realPart.precision,
        "complexFromReals",
      );
      trace("complexFromReals", 8, 4);
      return answer;
    },
    complexFromStrings(realPart, imaginaryPart, precision) {
      const realValue = realFromText(realPart, precision, "realFromString");
      const imaginaryValue = realFromText(imaginaryPart, precision, "realFromString");
      try {
        return backend.complexFromReals(realValue, imaginaryValue);
      } finally {
        close(imaginaryValue);
        close(realValue);
      }
    },
    complexRound(value, precision) {
      value = requireResource(value, "complex");
      const answer = complex(
        exports.sagejs_numeric_complex_round(value.handle, Number(precision)),
        precision,
        "complexRound",
      );
      trace("complexRound", 8, 4);
      return answer;
    },
    complexPrecision,
    complexReal(value) {
      value = requireResource(value, "complex");
      const answer = real(
        exports.sagejs_numeric_complex_part(value.handle, 0),
        value.precision,
        "complexReal",
      );
      trace("complexReal", 4, 4);
      return answer;
    },
    complexImag(value) {
      value = requireResource(value, "complex");
      const answer = real(
        exports.sagejs_numeric_complex_part(value.handle, 1),
        value.precision,
        "complexImag",
      );
      trace("complexImag", 4, 4);
      return answer;
    },
    complexRealDouble(value) {
      value = requireResource(value, "complex");
      const answer = exports.sagejs_numeric_complex_part_double(value.handle, 0);
      if (status() !== 0) failure("complexRealDouble");
      trace("complexRealDouble", 4, 8);
      return answer;
    },
    complexImagDouble(value) {
      value = requireResource(value, "complex");
      const answer = exports.sagejs_numeric_complex_part_double(value.handle, 1);
      if (status() !== 0) failure("complexImagDouble");
      trace("complexImagDouble", 4, 8);
      return answer;
    },
    complexAdd(left, right) { return complexBinary("complexAdd", 0, left, right); },
    complexSub(left, right) { return complexBinary("complexSub", 1, left, right); },
    complexMul(left, right) { return complexBinary("complexMul", 2, left, right); },
    complexDiv(left, right) { return complexBinary("complexDiv", 3, left, right); },
    complexNeg(value) {
      value = requireResource(value, "complex");
      const answer = complex(
        exports.sagejs_numeric_complex_neg(value.handle),
        value.precision,
        "complexNeg",
      );
      trace("complexNeg", 4, 4);
      return answer;
    },
    complexPowInt(value, exponent) {
      value = requireResource(value, "complex");
      const ingressBytes = writeInput(BigInt(exponent), "complexPowInt");
      const answer = complex(
        exports.sagejs_numeric_complex_pow_int(value.handle),
        value.precision,
        "complexPowInt",
      );
      trace("complexPowInt", ingressBytes + 4, 4);
      return answer;
    },
    complexEqual(left, right) {
      left = requireResource(left, "complex");
      right = requireResource(right, "complex");
      const answer = exports.sagejs_numeric_complex_equal(left.handle, right.handle);
      if (answer < 0) failure("complexEqual");
      trace("complexEqual", 8, 1);
      return answer === 1;
    },
    complexToString(value) {
      value = requireResource(value, "complex");
      if (exports.sagejs_numeric_complex_format(value.handle) !== 1) {
        failure("complexToString");
      }
      const answer = readOutput("complexToString");
      trace("complexToString", 4, utf8Encoder.encode(answer).length);
      return answer;
    },
    complexEi(value) {
      value = requireResource(value, "complex");
      const answer = complex(
        exports.sagejs_numeric_complex_ei(value.handle),
        value.precision,
        "complexEi",
      );
      trace("complexEi", 4, 4);
      return answer;
    },
    complexBesselI(order, argument) {
      order = requireResource(order, "complex");
      argument = requireResource(argument, "complex");
      const precision = Math.max(order.precision, argument.precision);
      const answer = complex(
        exports.sagejs_numeric_complex_bessel_i(order.handle, argument.handle),
        precision,
        "complexBesselI",
      );
      trace("complexBesselI", 8, 4);
      return answer;
    },
    zetaZeros(count, precision) {
      count = Number(count);
      if (!Number.isSafeInteger(count) || count < 0 || count > 65536) {
        throw new RangeError("zeta-zero count must be between 0 and 65536");
      }
      if (exports.sagejs_numeric_zeta_zeros(count, Number(precision)) !== 1) {
        failure("zetaZeros");
      }
      const pointer = uint32(exports.sagejs_numeric_zeta_zero_output());
      const byteLength = count * 8;
      if (pointer + byteLength > memory.buffer.byteLength) {
        throw new Error("zetaZeros returned an invalid output range");
      }
      const view = new DataView(memory.buffer, pointer, byteLength);
      const answer = Array.from(
        { length: count },
        (_, index) => view.getFloat64(index * 8, true),
      );
      trace("zetaZeros", 8, byteLength);
      return answer;
    },
    symbolicNumericalIntegral(
      tree,
      variable,
      lower,
      upper,
      maxIntervals,
      epsAbs,
      epsRel,
      adaptive,
    ) {
      const length = writeExpression(tree, String(variable));
      if (length === undefined) return undefined;
      const answer = exports.sagejs_numeric_symbolic_integral(
        length,
        Number(lower),
        Number(upper),
        Number(maxIntervals),
        Number(epsAbs),
        Number(epsRel),
        adaptive ? 1 : 0,
      );
      if (answer !== 1) failure("symbolic numerical integral");
      const result = Object.freeze({
        value: exports.sagejs_numeric_symbolic_result(0),
        error: exports.sagejs_numeric_symbolic_result(1),
        operationCount: length / 12,
      });
      recordCapability(
        "specialist:symbolic-numerical-integral-wasm",
        "receipt-backed-wasm-artifact",
        {
          executionTarget: "wasm-artifact",
          ingressBytes: length + 40,
          egressBytes: 16,
        },
      );
      return result;
    },
    symbolicFindRoot(tree, variable, lower, upper, maxIterations, tolerance) {
      const length = writeExpression(tree, String(variable));
      if (length === undefined) return undefined;
      const answer = exports.sagejs_numeric_symbolic_find_root(
        length,
        Number(lower),
        Number(upper),
        Number(maxIterations),
        Number(tolerance),
      );
      if (answer !== 1) failure("symbolic find root");
      const result = exports.sagejs_numeric_symbolic_result(0);
      recordCapability(
        "specialist:symbolic-find-root-wasm",
        "receipt-backed-wasm-artifact",
        {
          executionTarget: "wasm-artifact",
          ingressBytes: length + 32,
          egressBytes: 8,
        },
      );
      return result;
    },
    serializeAnalyticPoint(value) {
      value = requireResource(value, "complex");
      const realPart = backend.complexReal(value);
      const imaginaryPart = backend.complexImag(value);
      try {
        return [backend.realToString(realPart), backend.realToString(imaginaryPart)];
      } finally {
        close(imaginaryPart);
        close(realPart);
      }
    },
    closeNumericResource: close,
    numericLiveCount() {
      return uint32(exports.sagejs_numeric_live_count());
    },
  };
  return Object.freeze(backend);
}

/**
 * Select the bounded MPFR/Acb resource backend for a real WebAssembly
 * instance, or the exact portable representation used by capability-disabled
 * tests and inexpensive orchestration.
 */
export function createNumericBackend(instance, options = {}) {
  if (instance?.exports?.memory instanceof WebAssembly.Memory) {
    return createWasmNumericBackend(instance, options);
  }
  return createPortableNumericBackend();
}

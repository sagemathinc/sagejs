const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const ANALYTIC_PROTOCOL_VERSION = 1;

export const analyticOperations = Object.freeze({
  RIEMANN_ZETA_VALUES: 1,
  RIEMANN_ZETA_JET: 2,
  DIRICHLET_L_VALUES: 3,
  RIEMANN_XI_VALUES: 4,
  COMPLEX_GAMMA_VALUES: 5,
  QUADRATIC_ZETA_VALUES: 6,
  QUADRATIC_COMPLETION_VALUES: 7,
});

export const analyticFlags = Object.freeze({
  DEFLATE: 1,
  COMPLETED: 2,
});

export const analyticValueFlags = Object.freeze({
  FINITE: 1,
  REAL_EXACT: 2,
  IMAG_EXACT: 4,
  CONTAINS_ZERO: 8,
});

const statusMessages = Object.freeze({
  1: "invalid analytic request",
  2: "invalid packed decimal input",
  3: "analytic output buffer is too small",
  4: "integer exceeds this target's FLINT word",
  5: "analytic allocation failed",
  6: "FLINT analytic initialization failed",
});

function checkedInteger(value, name, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function checkedBigInt(value, name, { nonzero = false, signed = false } = {}) {
  let result;
  try {
    result = BigInt(value);
  } catch {
    throw new TypeError(`${name} must be an integer`);
  }
  if (nonzero && result === 0n) {
    throw new RangeError(`${name} must be nonzero`);
  }
  const minimum = signed ? -(1n << 63n) : 0n;
  const maximum = signed ? 1n << 63n : 1n << 64n;
  if (result < minimum || result >= maximum) {
    throw new RangeError(`${name} does not fit the analytic ABI`);
  }
  return result;
}

function scalarText(value, name) {
  if (typeof value === "string") {
    if (value.length === 0) throw new TypeError(`${name} must not be empty`);
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
    return String(value);
  }
  if (value !== null && value !== undefined) {
    const text = String(value);
    if (text !== "[object Object]" && text.length !== 0) return text;
  }
  throw new TypeError(`${name} must be an exact integer or finite decimal scalar`);
}

function member(value, name, fallback) {
  if (value === null || value === undefined) return fallback;
  const candidate = value[name];
  return typeof candidate === "function" ? candidate.call(value) : candidate ?? fallback;
}

export function defaultSerializeAnalyticPoint(value) {
  if (Array.isArray(value)) {
    if (value.length !== 2) {
      throw new TypeError("analytic point arrays must contain real and imaginary parts");
    }
    return [scalarText(value[0], "real part"), scalarText(value[1], "imaginary part")];
  }
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "string") {
    return [scalarText(value, "real part"), "0"];
  }
  const real = member(value, "real", undefined);
  const imaginary = member(value, "imag", member(value, "imaginary", 0));
  if (real === undefined) throw new TypeError("analytic point must provide real and imaginary parts");
  return [scalarText(real, "real part"), scalarText(imaginary, "imaginary part")];
}

function encodeComponents(components) {
  const encoded = components.map((component) => textEncoder.encode(component));
  const length = encoded.reduce((total, bytes) => total + 4 + bytes.length, 0);
  const result = new Uint8Array(length);
  const view = new DataView(result.buffer);
  let offset = 0;
  for (const bytes of encoded) {
    view.setUint32(offset, bytes.length, true);
    offset += 4;
    result.set(bytes, offset);
    offset += bytes.length;
  }
  return result;
}

function packetReader(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  const requireBytes = (count) => {
    if (count > bytes.length - offset) throw new Error("truncated analytic result packet");
  };
  const u16 = () => {
    requireBytes(2);
    const value = view.getUint16(offset, true);
    offset += 2;
    return value;
  };
  const u32 = () => {
    requireBytes(4);
    const value = view.getUint32(offset, true);
    offset += 4;
    return value;
  };
  const i32 = () => {
    requireBytes(4);
    const value = view.getInt32(offset, true);
    offset += 4;
    return value;
  };
  const text = () => {
    const length = u32();
    requireBytes(length);
    const value = textDecoder.decode(bytes.subarray(offset, offset + length));
    offset += length;
    return value;
  };
  return { bytes, get offset() { return offset; }, requireBytes, u16, u32, i32, text };
}

export function decodeAnalyticPacket(bytes) {
  const reader = packetReader(bytes);
  reader.requireBytes(4);
  const magic = textDecoder.decode(bytes.subarray(0, 4));
  reader.u32();
  if (magic !== "SJA1") throw new Error("invalid analytic result packet magic");
  const version = reader.u16();
  const components = reader.u16();
  const count = reader.u32();
  const precisionBits = reader.u32();
  const decimalDigits = reader.u32();
  if (version !== ANALYTIC_PROTOCOL_VERSION || components !== 2) {
    throw new Error(`unsupported analytic packet version ${version}`);
  }
  const values = [];
  for (let index = 0; index < count; index += 1) {
    const realAccuracyBits = reader.i32();
    const imaginaryAccuracyBits = reader.i32();
    const flags = reader.u32();
    values.push(Object.freeze({
      real: reader.text(),
      imaginary: reader.text(),
      realAccuracyBits,
      imaginaryAccuracyBits,
      finite: (flags & analyticValueFlags.FINITE) !== 0,
      realExact: (flags & analyticValueFlags.REAL_EXACT) !== 0,
      imaginaryExact: (flags & analyticValueFlags.IMAG_EXACT) !== 0,
      containsZero: (flags & analyticValueFlags.CONTAINS_ZERO) !== 0,
      flags,
      precisionBits,
      decimalDigits,
    }));
  }
  if (reader.offset !== bytes.length) throw new Error("trailing bytes in analytic result packet");
  return Object.freeze({ version, precisionBits, decimalDigits, values: Object.freeze(values) });
}

function normalizePoints(points, serializePoint) {
  if (!Array.isArray(points) || points.length === 0 || points.length > 100000) {
    throw new RangeError("points must be a nonempty array with at most 100000 entries");
  }
  return points.map((point) => serializePoint(point));
}

/**
 * Add the packed analytic surface to an instantiated FLINT WebAssembly module.
 *
 * `materialize(record, precisionBits)` may construct the host's ComplexField
 * value. Without it, methods return immutable arbitrary-precision decimal
 * records; binary64 conversion occurs only in `plotBatch`.
 */
export function createAnalyticWasmBackend(instance, options = {}) {
  const exports = instance?.exports;
  const memory = exports?.memory;
  if (!(memory instanceof WebAssembly.Memory)) throw new TypeError("analytic WebAssembly memory is unavailable");
  for (const name of [
    "sagejs_analytic_input",
    "sagejs_analytic_input_capacity",
    "sagejs_analytic_output",
    "sagejs_analytic_output_capacity",
    "sagejs_analytic_output_length",
    "sagejs_analytic_max_input_capacity",
    "sagejs_analytic_max_output_capacity",
    "sagejs_analytic_reserve",
    "sagejs_analytic_release",
    "sagejs_analytic_execute_request",
  ]) {
    if (typeof exports[name] !== "function") throw new TypeError(`missing analytic export ${name}`);
  }
  const serializePoint = options.serializePoint ?? defaultSerializeAnalyticPoint;
  const materialize = options.materialize ?? ((record) => record);
  const resolveDirichletModulus = options.resolveDirichletModulus ?? ((value) => value);
  const recordCapability = options.recordCapability ?? (() => {});

  const roundedCapacity = (needed, maximum) => {
    let capacity = 4096;
    while (capacity < needed && capacity < maximum) capacity *= 2;
    return Math.min(capacity, maximum);
  };

  function execute({
    operation,
    points,
    precisionBits = 53,
    derivative = 0,
    firstOrder = 0,
    resultCount = 0,
    flags = 0,
    modulus = 0n,
    characterIndex = 0n,
    discriminant = 0n,
    rawValues,
  }) {
    checkedInteger(precisionBits, "precisionBits", 16, 1048576);
    checkedInteger(derivative, "derivative", 0, 4096);
    checkedInteger(firstOrder, "firstOrder", 0, 4096);
    checkedInteger(resultCount, "resultCount", 0, 4096);
    const normalized = normalizePoints(points, serializePoint);
    const components = [];
    if (rawValues !== undefined && (!Array.isArray(rawValues) || rawValues.length !== normalized.length)) {
      throw new TypeError("rawValues must match the point array");
    }
    for (let index = 0; index < normalized.length; index += 1) {
      components.push(...normalized[index]);
      if (rawValues !== undefined) components.push(...serializePoint(rawValues[index]));
    }
    const input = encodeComponents(components);
    const maximumInput = Number(exports.sagejs_analytic_max_input_capacity()) >>> 0;
    const maximumOutput = Number(exports.sagejs_analytic_max_output_capacity()) >>> 0;
    if (input.length === 0 || input.length > maximumInput) {
      throw new RangeError(`analytic input exceeds ${maximumInput} bytes`);
    }
    const outputCount = operation === analyticOperations.RIEMANN_ZETA_JET
      ? resultCount
      : normalized.length;
    const digits = Math.ceil(precisionBits * 0.30103) + 8;
    const estimatedOutput = 20 + outputCount * (28 + 2 * (digits + 24));
    if (estimatedOutput > maximumOutput) {
      throw new RangeError(
        `analytic result requires about ${estimatedOutput} bytes; ` +
          `the module limit is ${maximumOutput}`,
      );
    }
    let outputCapacity = roundedCapacity(estimatedOutput, maximumOutput);
    const inputCapacity = roundedCapacity(input.length, maximumInput);
    let status;
    for (;;) {
      const reserveStatus = exports.sagejs_analytic_reserve(inputCapacity, outputCapacity);
      if (reserveStatus !== 0) {
        const message = statusMessages[reserveStatus] ?? `analytic reserve failure ${reserveStatus}`;
        throw new RangeError(message);
      }
      const inputPointer = Number(exports.sagejs_analytic_input()) >>> 0;
      const actualInputCapacity = Number(exports.sagejs_analytic_input_capacity()) >>> 0;
      if (input.length > actualInputCapacity || inputPointer + input.length > memory.buffer.byteLength) {
        throw new Error("analytic WebAssembly returned an invalid input range");
      }
      new Uint8Array(memory.buffer, inputPointer, input.length).set(input);
      status = exports.sagejs_analytic_execute_request(
        input.length,
        operation,
        normalized.length,
        precisionBits,
        derivative,
        firstOrder,
        resultCount,
        flags,
        checkedBigInt(modulus, "modulus"),
        checkedBigInt(characterIndex, "characterIndex"),
        checkedBigInt(discriminant, "discriminant", { signed: true }),
      );
      if (status !== 3 || outputCapacity === maximumOutput) break;
      outputCapacity = Math.min(maximumOutput, outputCapacity * 2);
    }
    if (status !== 0) {
      const message = statusMessages[status] ?? `analytic WebAssembly failure ${status}`;
      const ErrorType = status === 2 ? TypeError : status === 4 ? RangeError : Error;
      throw new ErrorType(message);
    }
    const outputPointer = Number(exports.sagejs_analytic_output()) >>> 0;
    const outputLength = Number(exports.sagejs_analytic_output_length()) >>> 0;
    const actualOutputCapacity = Number(exports.sagejs_analytic_output_capacity()) >>> 0;
    if (outputLength > actualOutputCapacity || outputPointer + outputLength > memory.buffer.byteLength) {
      throw new Error("analytic WebAssembly returned an invalid output range");
    }
    // Copy before any later Wasm call can mutate memory or grow the buffer.
    const packet = new Uint8Array(memory.buffer, outputPointer, outputLength).slice();
    const capabilityIds = operation === analyticOperations.RIEMANN_ZETA_VALUES
      ? ["analytic:riemann-zeta-batch"]
      : operation === analyticOperations.DIRICHLET_L_VALUES
        ? ["analytic:dirichlet-l-batch"]
        : operation === analyticOperations.QUADRATIC_ZETA_VALUES
          ? [
            "analytic:riemann-zeta-batch",
            "analytic:dirichlet-l-batch",
            "analytic:quadratic-dedekind-zeta",
          ]
          : [];
    for (const capabilityId of capabilityIds) {
      recordCapability(
        capabilityId,
        "receipt-backed-wasm-artifact",
        {
          executionTarget: "wasm-artifact",
          ingressBytes: input.length,
          egressBytes: outputLength,
        },
      );
    }
    return decodeAnalyticPacket(packet);
  }

  const publicValues = (packet) => packet.values.map((value) => materialize(value, packet.precisionBits));
  const detailed = (request) => execute(request);

  function riemannZetaValuesDetailed(points, derivative = 0, precisionBits = 53) {
    return detailed({ operation: analyticOperations.RIEMANN_ZETA_VALUES, points, derivative, precisionBits });
  }
  function dirichletLValuesDetailed(modulus, characterIndex, points, derivative = 0, precisionBits = 53) {
    return detailed({
      operation: analyticOperations.DIRICHLET_L_VALUES,
      points,
      derivative,
      precisionBits,
      modulus: resolveDirichletModulus(modulus),
      characterIndex,
    });
  }
  function quadraticDedekindValuesDetailed(
    discriminant,
    modulus,
    characterIndex,
    points,
    precisionBits = 53,
    { completed = false } = {},
  ) {
    return detailed({
      operation: analyticOperations.QUADRATIC_ZETA_VALUES,
      points,
      precisionBits,
      modulus,
      characterIndex,
      discriminant,
      flags: completed ? analyticFlags.COMPLETED : 0,
    });
  }

  function plotBatch(evaluateDetailed, points, {
    precisionBits = 32,
    guardBits = 24,
    tileSize = 10000,
  } = {}) {
    checkedInteger(precisionBits, "precisionBits", 16, 53);
    checkedInteger(guardBits, "guardBits", 1, 128);
    checkedInteger(tileSize, "tileSize", 1, 10000);
    if (!Array.isArray(points)) throw new TypeError("plot points must be an array");
    const coarse = [];
    const fine = [];
    const errors = [];
    let minimumAccuracyBits = Infinity;
    for (let start = 0; start < points.length; start += tileSize) {
      const tile = points.slice(start, start + tileSize);
      const coarsePacket = evaluateDetailed(tile, precisionBits);
      const finePacket = evaluateDetailed(tile, precisionBits + guardBits);
      for (let index = 0; index < tile.length; index += 1) {
        const left = coarsePacket.values[index];
        const right = finePacket.values[index];
        const leftPair = [Number(left.real), Number(left.imaginary)];
        const rightPair = [Number(right.real), Number(right.imaginary)];
        coarse.push(leftPair);
        fine.push(rightPair);
        errors.push(Math.hypot(rightPair[0] - leftPair[0], rightPair[1] - leftPair[1]));
        minimumAccuracyBits = Math.min(
          minimumAccuracyBits,
          left.realAccuracyBits,
          left.imaginaryAccuracyBits,
          right.realAccuracyBits,
          right.imaginaryAccuracyBits,
        );
      }
    }
    return Object.freeze({
      coarse,
      fine,
      errors,
      diagnostics: Object.freeze({
        pointCount: points.length,
        tileCount: Math.ceil(points.length / tileSize),
        precisionBits,
        finePrecisionBits: precisionBits + guardBits,
        minimumAccuracyBits: points.length === 0 ? null : minimumAccuracyBits,
        rigorous: false,
        transport: "arbitrary-precision-decimal",
        output: "explicit-binary64-plot",
      }),
    });
  }

  const riemannZetaJetDetailed = (
    point, firstOrder, count, deflate = false, precisionBits = 53,
  ) => detailed({
    operation: analyticOperations.RIEMANN_ZETA_JET,
    points: [point],
    firstOrder,
    resultCount: count,
    flags: deflate ? analyticFlags.DEFLATE : 0,
    precisionBits,
  });
  const riemannXiValuesDetailed = (points, precisionBits = 53) => detailed({
    operation: analyticOperations.RIEMANN_XI_VALUES, points, precisionBits,
  });
  const complexGammaValuesDetailed = (points, precisionBits = 53) => detailed({
    operation: analyticOperations.COMPLEX_GAMMA_VALUES, points, precisionBits,
  });
  const quadraticCompletionValuesDetailed = (
    discriminant, points, rawValues, precisionBits = 53,
  ) => detailed({
    operation: analyticOperations.QUADRATIC_COMPLETION_VALUES,
    points,
    rawValues,
    discriminant,
    precisionBits,
  });

  return Object.freeze({
    executeDetailed: detailed,
    riemannZetaJetDetailed,
    riemannZetaJet(point, firstOrder, count, deflate = false, precisionBits = 53) {
      return publicValues(riemannZetaJetDetailed(point, firstOrder, count, deflate, precisionBits));
    },
    riemannZetaValuesDetailed,
    riemannZetaValues(points, precisionBits = 53) {
      return publicValues(riemannZetaValuesDetailed(points, 0, precisionBits));
    },
    riemannZetaDerivativeValues(points, derivative = 0, precisionBits = 53) {
      return publicValues(riemannZetaValuesDetailed(points, derivative, precisionBits));
    },
    dirichletLValuesDetailed,
    dirichletLValues(modulus, characterIndex, points, derivative = 0, precisionBits = 53) {
      return publicValues(dirichletLValuesDetailed(modulus, characterIndex, points, derivative, precisionBits));
    },
    dirichletLValue(modulus, characterIndex, point, derivative = 0, precisionBits = 53) {
      return publicValues(
        dirichletLValuesDetailed(
          modulus, characterIndex, [point], derivative, precisionBits,
        ),
      )[0];
    },
    riemannXiValuesDetailed,
    riemannXiValues(points, precisionBits = 53) {
      return publicValues(riemannXiValuesDetailed(points, precisionBits));
    },
    riemannXiStandardValue(point, precisionBits = 53) {
      return publicValues(riemannXiValuesDetailed([point], precisionBits))[0];
    },
    complexGammaValuesDetailed,
    complexGammaValues(points, precisionBits = 53) {
      return publicValues(complexGammaValuesDetailed(points, precisionBits));
    },
    quadraticDedekindValuesDetailed,
    quadraticDedekindValues(discriminant, modulus, characterIndex, points, precisionBits = 53, options = {}) {
      return publicValues(quadraticDedekindValuesDetailed(
        discriminant, modulus, characterIndex, points, precisionBits, options,
      ));
    },
    quadraticCompletionValuesDetailed,
    quadraticCompletionValues(discriminant, points, rawValues, precisionBits = 53) {
      return publicValues(quadraticCompletionValuesDetailed(
        discriminant, points, rawValues, precisionBits,
      ));
    },
    plotBatch,
    riemannZetaPlotBatch(points, options = {}) {
      return plotBatch(
        (tile, precision) => riemannZetaValuesDetailed(tile, 0, precision),
        points,
        options,
      );
    },
    quadraticDedekindPlotBatch(
      discriminant,
      modulus,
      characterIndex,
      points,
      options = {},
    ) {
      return plotBatch(
        (tile, precision) => quadraticDedekindValuesDetailed(
          discriminant, modulus, characterIndex, tile, precision,
        ),
        points,
        options,
      );
    },
    release() {
      exports.sagejs_analytic_release();
    },
  });
}

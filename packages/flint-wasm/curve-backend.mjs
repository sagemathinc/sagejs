const encoder = new TextEncoder();
const decoder = new TextDecoder();

const STATUS = Object.freeze({
  OK: 0,
  INSUFFICIENT_COEFFICIENTS: 1,
  INVALID_INPUT: 2,
  RESOURCE_LIMIT: 3,
  ADAPTER_INVALID_INPUT: -1,
  ADAPTER_RESOURCE_LIMIT: -2,
  ADAPTER_ALLOCATION_FAILED: -3,
  ADAPTER_PARSE_FAILED: -4,
});

const OUTPUT = Object.freeze({ DECIMAL_BALLS: 0, PLAN: 1, PLOT: 2 });
const MAX_POINTS_PER_TILE = 10_000;

export const curveCapabilities = Object.freeze({
  "elliptic-coefficients-portable": Object.freeze({
    family: "elliptic-curves",
    disposition: "portable-fallback",
    status: "implemented",
    fallback: "exact-direct-point-count-and-euler-recurrence",
    limits: Object.freeze({ specialistAcceleration: "smalljac-desktop-only" }),
  }),
  "elliptic-root-number-semistable": Object.freeze({
    family: "elliptic-curves",
    disposition: "portable-fallback",
    status: "implemented",
    fallback: "certified-tate-local-data-and-explicit-additive-override",
  }),
  "elliptic-lseries-values": Object.freeze({
    family: "elliptic-curves",
    disposition: "shared-core",
    status: "implemented",
    wasmModule: "flint",
    fallback: "ordinary-mellin-and-direct-lseries",
    limits: Object.freeze({
      maximumPointsPerTile: MAX_POINTS_PER_TILE,
      maximumHeight: 100,
      maximumRealOffsetFromCenter: 8,
      rigorous: false,
    }),
  }),
  "elliptic-lseries-plot": Object.freeze({
    family: "elliptic-curves",
    disposition: "shared-core",
    status: "implemented",
    wasmModule: "flint",
    fallback: "ordinary-lseries-values",
    limits: Object.freeze({
      maximumPointsPerTile: MAX_POINTS_PER_TILE,
      transport: "explicit-binary64-plot-only",
      tiled: true,
    }),
  }),
  "elliptic-lseries-direct-values": Object.freeze({
    family: "elliptic-curves",
    disposition: "portable-fallback",
    status: "planned-shared-core",
    fallback: "ordinary-bounded-direct-dirichlet-prefix",
    reason: "the first Wasm release prioritizes the moderate Mellin domain",
  }),
  "hyperelliptic-genus3-candidate-scan": Object.freeze({
    family: "hyperelliptic-curves",
    disposition: "compiled-source",
    status: "production-kernel-pack",
    fallback: "same-source-exact-python",
    source: "sagejs.hyperelliptic_curves.genus3_candidate_kernel",
  }),
  "eclib-descent-and-rank": Object.freeze({
    family: "elliptic-curves",
    disposition: "desktop-only",
    status: "specialist-external-library",
    reason: "eclib is not linked into the browser FLINT reactor",
    fallback: "probable-analytic-rank-or-explicit-capability-error",
  }),
  "smalljac-local-factors": Object.freeze({
    family: "hyperelliptic-curves",
    disposition: "desktop-only",
    status: "specialist-external-library",
    reason: "smalljac is not presently portable to wasm32-wasip1",
    fallback: "exact-bounded-exhaustive-frobenius",
  }),
  "rforest-genus3": Object.freeze({
    family: "hyperelliptic-curves",
    disposition: "desktop-only",
    status: "specialist-external-library",
    reason: "rforest has a large specialist native dependency stack",
    fallback: "exact-bounded-exhaustive-local-factor",
  }),
});

function checkedInteger(value, name, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer in [${minimum}, ${maximum}]`);
  }
  return value;
}

function statusName(status) {
  if (status === STATUS.OK) return "ok";
  if (status === STATUS.INSUFFICIENT_COEFFICIENTS) {
    return "insufficient_coefficients";
  }
  const names = {
    [STATUS.INVALID_INPUT]: "invalid core input",
    [STATUS.RESOURCE_LIMIT]: "elliptic L-series request exceeds resource limits",
    [STATUS.ADAPTER_INVALID_INPUT]: "invalid Wasm elliptic L-series input",
    [STATUS.ADAPTER_RESOURCE_LIMIT]: "Wasm elliptic L-series adapter resource limit",
    [STATUS.ADAPTER_ALLOCATION_FAILED]: "Wasm elliptic L-series allocation failed",
    [STATUS.ADAPTER_PARSE_FAILED]: "invalid exact decimal elliptic L-series input",
  };
  throw new RangeError(names[status] ?? `elliptic L-series failed with status ${status}`);
}

function exactCoefficient(value) {
  if (typeof value === "bigint") {
    if (value < -2147483648n || value > 2147483647n) {
      throw new RangeError("elliptic L-series coefficient exceeds Int32 storage");
    }
    return Number(value);
  }
  if (!Number.isSafeInteger(value) || value < -2147483648 || value > 2147483647) {
    throw new RangeError("elliptic L-series coefficient exceeds Int32 storage");
  }
  return value;
}

function conductorText(value) {
  const text = typeof value === "bigint" ? value.toString() : String(value);
  if (!/^[1-9][0-9]*$/.test(text)) {
    throw new RangeError("the elliptic-curve conductor must be a positive integer");
  }
  return encoder.encode(text);
}

function packedPoints(points) {
  if (!Array.isArray(points) || points.length < 1 || points.length > MAX_POINTS_PER_TILE) {
    throw new RangeError(
      `points must be a nonempty array with at most ${MAX_POINTS_PER_TILE} entries per tile`,
    );
  }
  const pieces = [];
  const offsets = new Uint32Array(points.length * 2 + 1);
  let length = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!Array.isArray(point) || point.length !== 2) {
      throw new TypeError("each complex point must be [realDecimal, imaginaryDecimal]");
    }
    for (const component of point) {
      const bytes = encoder.encode(String(component));
      if (bytes.length > 8192) {
        throw new RangeError("a complex component exceeds the Wasm decimal limit");
      }
      pieces.push(bytes);
      length += bytes.length;
      if (length > 64 * 1024 * 1024) {
        throw new RangeError("packed complex points exceed the Wasm tile limit");
      }
      offsets[pieces.length] = length;
    }
  }
  const bytes = new Uint8Array(length);
  let position = 0;
  for (const piece of pieces) {
    bytes.set(piece, position);
    position += piece.length;
  }
  return { bytes, offsets };
}

function numericI64(value) {
  return typeof value === "bigint" ? Number(value) : value;
}

function ball(fields, offset) {
  return {
    realMidpoint: fields[offset],
    imagMidpoint: fields[offset + 1],
    realRadius: fields[offset + 2],
    imagRadius: fields[offset + 3],
    accuracyBits: Number(fields[offset + 4]),
  };
}

function maximumDecimal(values) {
  let selected = "0";
  let maximum = 0;
  for (const value of values) {
    const converted = Number(value);
    if (Number.isFinite(converted) && converted >= maximum) {
      maximum = converted;
      selected = value;
    }
  }
  return selected;
}

/** Create the public `runtime.flint_backend()` curve fragment for one reactor. */
export function createCurveBackend(instance) {
  const exports = instance?.exports ?? instance;
  const memory = exports?.memory;
  if (!(memory instanceof WebAssembly.Memory)) {
    throw new TypeError("a curve backend requires exported WebAssembly memory");
  }
  const required = [
    "sagejs_wasm_ec_lseries_begin",
    "sagejs_wasm_ec_lseries_clear",
    "sagejs_wasm_ec_lseries_coefficients",
    "sagejs_wasm_ec_lseries_point_text",
    "sagejs_wasm_ec_lseries_point_offsets",
    "sagejs_wasm_ec_lseries_conductor_text",
    "sagejs_wasm_ec_lseries_compute",
    "sagejs_wasm_ec_lseries_diagnostic",
    "sagejs_wasm_ec_lseries_diagnostic_double",
  ];
  for (const name of required) {
    if (typeof exports[name] !== "function") {
      throw new TypeError(`curve Wasm export ${name} is unavailable`);
    }
  }

  function diagnostic(index) {
    return numericI64(exports.sagejs_wasm_ec_lseries_diagnostic(index));
  }

  function metadata(status, pointCount, precisionBits, refinementBits) {
    return {
      status: statusName(status),
      rigorous: false,
      knownErrorTargetMet: Boolean(diagnostic(11)),
      analyticErrorStatus: "coefficient_local_grid_and_outer_tail_only",
      trapezoidDiscretizationStatus: "unbounded_nonrigorous",
      precisionBits,
      finePrecisionBits: precisionBits + refinementBits,
      refinementBits,
      workPrecisionBits: diagnostic(6),
      cutoff: diagnostic(1),
      requiredCutoff: diagnostic(2),
      gridPoints: diagnostic(3),
      coefficientTerms: diagnostic(4),
      pointCount,
      gridStep: exports.sagejs_wasm_ec_lseries_diagnostic_double(8),
      maxAbsImag: exports.sagejs_wasm_ec_lseries_diagnostic_double(9),
      maxAbsRealOffset: exports.sagejs_wasm_ec_lseries_diagnostic_double(10),
    };
  }

  function ecLseriesValues(
    conductor,
    rootNumber,
    coefficients,
    points,
    precisionBits,
    refinementBits = 0,
    outputMode = 0,
  ) {
    checkedInteger(rootNumber, "root number", -1, 1);
    if (rootNumber === 0) throw new RangeError("root number must be -1 or 1");
    checkedInteger(precisionBits, "precision bits", 16, 4096);
    checkedInteger(refinementBits, "refinement bits", 0, 256);
    checkedInteger(outputMode, "output mode", 0, 2);
    if ((!Array.isArray(coefficients) && !(coefficients instanceof Int32Array)) ||
        coefficients.length < 2) {
      throw new TypeError("coefficients must contain a_0 through a_K");
    }
    const coefficientData = Int32Array.from(coefficients, exactCoefficient);
    const pointData = packedPoints(points);
    const conductorData = conductorText(conductor);
    const workPrecisionBits = Math.min(
      8192,
      precisionBits + refinementBits + 512,
    );
    const beginStatus = exports.sagejs_wasm_ec_lseries_begin(
      coefficientData.length,
      points.length,
      pointData.bytes.length,
      conductorData.length,
      precisionBits,
      refinementBits,
      workPrecisionBits,
      outputMode,
    );
    statusName(beginStatus);
    try {
      new Int32Array(
        memory.buffer,
        exports.sagejs_wasm_ec_lseries_coefficients(),
        coefficientData.length,
      ).set(coefficientData);
      new Uint8Array(
        memory.buffer,
        exports.sagejs_wasm_ec_lseries_point_text(),
        pointData.bytes.length,
      ).set(pointData.bytes);
      new Uint32Array(
        memory.buffer,
        exports.sagejs_wasm_ec_lseries_point_offsets(),
        pointData.offsets.length,
      ).set(pointData.offsets);
      new Uint8Array(
        memory.buffer,
        exports.sagejs_wasm_ec_lseries_conductor_text(),
        conductorData.length,
      ).set(conductorData);
      const computeStatus = exports.sagejs_wasm_ec_lseries_compute(rootNumber);
      const result = metadata(
        computeStatus,
        points.length,
        precisionBits,
        refinementBits,
      );
      if (outputMode === OUTPUT.PLAN) return result;
      if (outputMode === OUTPUT.PLOT) {
        const stride = exports.sagejs_wasm_ec_lseries_plot_stride();
        const count = exports.sagejs_wasm_ec_lseries_plot_value_count();
        result.packedStride = stride;
        result.packedValues = new Float64Array(
          new Float64Array(
            memory.buffer,
            exports.sagejs_wasm_ec_lseries_plot_values(),
            count,
          ),
        );
        return result;
      }
      const byteCount = exports.sagejs_wasm_ec_lseries_decimal_byte_count();
      const offsetCount = exports.sagejs_wasm_ec_lseries_decimal_offset_count();
      const fieldCount = exports.sagejs_wasm_ec_lseries_decimal_field_count();
      const bytes = new Uint8Array(
        new Uint8Array(
          memory.buffer,
          exports.sagejs_wasm_ec_lseries_decimal_bytes(),
          byteCount,
        ),
      );
      const offsets = new Uint32Array(
        new Uint32Array(
          memory.buffer,
          exports.sagejs_wasm_ec_lseries_decimal_offsets(),
          offsetCount,
        ),
      );
      if (offsets.length !== fieldCount * points.length + 1) {
        throw new Error("elliptic L-series Wasm result has inconsistent offsets");
      }
      const fields = Array.from({ length: offsets.length - 1 }, (_, index) =>
        decoder.decode(bytes.subarray(offsets[index], offsets[index + 1])),
      );
      result.values = [];
      if (refinementBits > 0) result.coarseValues = [];
      const coefficientTails = [];
      const gridOmissions = [];
      const outerTails = [];
      const rawConversions = [];
      const analyticErrors = [];
      for (let index = 0; index < points.length; index += 1) {
        const offset = index * fieldCount;
        const item = {
          point: [String(points[index][0]), String(points[index][1])],
          completed: ball(fields, offset),
          raw: ball(fields, offset + 5),
          coefficientTailBound: fields[offset + 10],
          gridOmissionBound: fields[offset + 11],
          outerTailBound: fields[offset + 12],
          rawConversionMagnitude: fields[offset + 13],
          analyticErrorBound: fields[offset + 14],
        };
        result.values.push(item);
        coefficientTails.push(item.coefficientTailBound);
        gridOmissions.push(item.gridOmissionBound);
        outerTails.push(item.outerTailBound);
        rawConversions.push(item.rawConversionMagnitude);
        analyticErrors.push(item.analyticErrorBound);
        if (refinementBits > 0) {
          result.coarseValues.push({
            completed: ball(fields, offset + 15),
            raw: ball(fields, offset + 20),
          });
        }
      }
      result.coefficientTailBound = maximumDecimal(coefficientTails);
      result.gridOmissionBound = maximumDecimal(gridOmissions);
      result.outerTailBound = maximumDecimal(outerTails);
      result.rawConversionMagnitude = maximumDecimal(rawConversions);
      result.analyticErrorBound = maximumDecimal(analyticErrors);
      return result;
    } finally {
      exports.sagejs_wasm_ec_lseries_clear();
    }
  }

  return Object.freeze({
    ecLseriesValues,
    curveCapabilities,
  });
}

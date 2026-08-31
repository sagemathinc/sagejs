const HOST_CALLBACK_EXCEPTION = -1001;
const HOST_CANCELLED = -1002;
const HOST_MAXIMUM_CALLBACKS = -1003;
const HOST_MAXIMUM_ELAPSED_TIME = -1004;
const HOST_INVALID_OUTPUT = -1005;
const MAXIMUM_VARIABLES = 128;
const MAXIMUM_CONSTRAINTS = 512;

const backendStatus = Object.freeze({
  [-5]: "forced_stop",
  [-4]: "roundoff_limited",
  [-3]: "out_of_memory",
  [-2]: "invalid_arguments",
  [-1]: "failure",
  1: "success",
  2: "stop_value_reached",
  3: "function_tolerance_reached",
  4: "parameter_tolerance_reached",
  5: "maximum_evaluations",
  6: "maximum_time",
  [-1001]: "callback_exception",
  [-1002]: "cancelled",
  [-1003]: "maximum_callbacks",
  [-1004]: "maximum_elapsed_time",
  [-1005]: "invalid_callback_output",
  [-2001]: "invalid_argument",
  [-2002]: "allocation_failed",
  [-2003]: "corrupt_memory_region",
  [-2004]: "dimension_limit",
});

export class NloptCapabilityError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "NloptCapabilityError";
    this.details = Object.freeze({ ...details });
  }
}

function nowMilliseconds() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function finiteVector(value, expectedLength, description) {
  if (value == null || typeof value[Symbol.iterator] !== "function") {
    throw new TypeError(`${description} must be an iterable`);
  }
  const result = Float64Array.from(value);
  if (expectedLength != null && result.length !== expectedLength) {
    throw new RangeError(
      `${description} has length ${result.length}; expected ${expectedLength}`,
    );
  }
  for (let index = 0; index < result.length; index += 1) {
    if (!Number.isFinite(result[index])) {
      throw new RangeError(`${description}[${index}] is not finite`);
    }
  }
  return result;
}

function boundVector(value, length, fallback, description) {
  const result = value == null
    ? new Float64Array(length).fill(fallback)
    : Float64Array.from(value);
  if (result.length !== length) {
    throw new RangeError(
      `${description} has length ${result.length}; expected ${length}`,
    );
  }
  for (let index = 0; index < result.length; index += 1) {
    if (Number.isNaN(result[index])) {
      throw new RangeError(`${description}[${index}] is NaN`);
    }
  }
  return result;
}

function nonnegativeVector(value, length, fallback, description) {
  const result = value == null
    ? new Float64Array(length).fill(fallback)
    : finiteVector(value, length, description);
  for (let index = 0; index < result.length; index += 1) {
    if (result[index] < 0) {
      throw new RangeError(`${description}[${index}] must be nonnegative`);
    }
  }
  return result;
}

function checkedView(memory, offset, length, Type, description) {
  if (!Number.isSafeInteger(offset) || offset <= 0 ||
      offset % Type.BYTES_PER_ELEMENT !== 0) {
    throw new RangeError(`invalid ${description} offset`);
  }
  const bytes = length * Type.BYTES_PER_ELEMENT;
  if (!Number.isSafeInteger(bytes) || offset + bytes > memory.buffer.byteLength) {
    throw new RangeError(`${description} lies outside WebAssembly memory`);
  }
  return new Type(memory.buffer, offset, length);
}

function scalarTolerance(value, fallback, description) {
  const result = value ?? fallback;
  if (!Number.isFinite(result) || result < 0) {
    throw new RangeError(`${description} must be finite and nonnegative`);
  }
  return result;
}

function positiveInteger(
  value,
  fallback,
  description,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result <= 0 || result > maximum) {
    throw new RangeError(
      `${description} must be a positive integer no greater than ${maximum}`,
    );
  }
  return result;
}

function methodCode(method) {
  if (method === "nlopt-nelder-mead") return 1;
  if (method === "nlopt-cobyla") return 2;
  throw new NloptCapabilityError(
    `unsupported exact NLopt method ${JSON.stringify(method)}`,
    {
      requestedMethod: method,
      supportedMethods: ["nlopt-nelder-mead", "nlopt-cobyla"],
      automaticSelection: false,
    },
  );
}

function normalizeStep(value, initial, lower, upper) {
  if (value != null) {
    const step = finiteVector(value, initial.length, "initialStep");
    for (let index = 0; index < step.length; index += 1) {
      if (!(step[index] > 0)) {
        throw new RangeError(`initialStep[${index}] must be positive`);
      }
    }
    return step;
  }
  return Float64Array.from(initial, (entry, index) => {
    const width = upper[index] - lower[index];
    if (Number.isFinite(width) && width > 0) return Math.max(width / 4, 1e-12);
    return Math.max(Math.abs(entry) / 4, 1);
  });
}

function finiteJacobian(value, rows, columns, description) {
  if (value == null || typeof value[Symbol.iterator] !== "function") {
    throw new TypeError(`${description} must be an iterable`);
  }
  const outer = Array.from(value);
  if (outer.length === rows && outer.every((row) => row?.[Symbol.iterator])) {
    const result = new Float64Array(rows * columns);
    for (let row = 0; row < rows; row += 1) {
      result.set(
        finiteVector(outer[row], columns, `${description} row ${row}`),
        row * columns,
      );
    }
    return result;
  }
  return finiteVector(outer, rows * columns, description);
}

export async function createNloptBackend(moduleOrBytes) {
  const module = moduleOrBytes instanceof WebAssembly.Module
    ? moduleOrBytes
    : await WebAssembly.compile(moduleOrBytes);
  const imports = WebAssembly.Module.imports(module);
  if (imports.length !== 1 || imports[0].module !== "sagejs_numerical_nlopt" ||
      imports[0].name !== "evaluate" || imports[0].kind !== "function") {
    throw new Error(`unexpected numerical NLopt imports: ${JSON.stringify(imports)}`);
  }

  let instance;
  let activeHandle = 0;
  let nextHandle = 1;
  const contexts = new Map();

  function fail(context, status, error) {
    if (context.failure == null) context.failure = { status, error };
    return status;
  }

  function evaluate(
    handle,
    kind,
    valueCount,
    variableCount,
    xOffset,
    valueOffset,
    derivativeOffset,
    derivativeRows,
  ) {
    const context = contexts.get(handle);
    if (context == null || activeHandle !== handle ||
        context.n !== variableCount) return HOST_CALLBACK_EXCEPTION;
    try {
      if (context.signal?.aborted || context.cancelled?.() === true ||
          (context.cancellationBuffer != null &&
            Atomics.load(
              context.cancellationBuffer,
              context.cancellationIndex,
            ) !== 0)) {
        return fail(context, HOST_CANCELLED);
      }
      if (nowMilliseconds() - context.started >= context.maximumElapsedMs) {
        return fail(context, HOST_MAXIMUM_ELAPSED_TIME);
      }
      if (context.callbacks >= context.maximumCallbacks) {
        return fail(context, HOST_MAXIMUM_CALLBACKS);
      }
      context.callbacks += 1;
      const memory = instance.exports.memory;
      const x = Array.from(
        checkedView(memory, xOffset, variableCount, Float64Array, "x"),
      );
      let values;
      let derivative;
      if (kind === 1) {
        values = finiteVector(
          [context.objective(x)],
          1,
          "objective output",
        );
        if (derivativeOffset !== 0) {
          if (typeof context.objectiveGradient !== "function") {
            throw new TypeError("NLopt requested an objective gradient but none exists");
          }
          derivative = finiteVector(
            context.objectiveGradient(x),
            variableCount,
            "objective gradient",
          );
        }
      } else if (kind === 2 || kind === 3) {
        const expected = kind === 2
          ? context.inequalityCount
          : context.equalityCount;
        if (valueCount !== expected) {
          throw new RangeError("NLopt constraint callback count changed");
        }
        const callback = kind === 2 ? context.inequality : context.equality;
        values = finiteVector(
          callback(x),
          expected,
          kind === 2 ? "inequality output" : "equality output",
        );
        if (derivativeOffset !== 0) {
          const jacobian = kind === 2
            ? context.inequalityJacobian
            : context.equalityJacobian;
          if (typeof jacobian !== "function") {
            throw new TypeError("NLopt requested a constraint Jacobian but none exists");
          }
          if (derivativeRows !== expected) {
            throw new RangeError("NLopt constraint Jacobian layout changed");
          }
          derivative = finiteJacobian(
            jacobian(x),
            expected,
            variableCount,
            kind === 2 ? "inequality Jacobian" : "equality Jacobian",
          );
        }
      } else {
        throw new RangeError(`unknown NLopt callback kind ${kind}`);
      }
      checkedView(
        memory,
        valueOffset,
        valueCount,
        Float64Array,
        "callback value output",
      ).set(values);
      if (derivative != null) {
        checkedView(
          memory,
          derivativeOffset,
          derivative.length,
          Float64Array,
          "callback derivative output",
        ).set(derivative);
      }
      return 0;
    } catch (error) {
      const invalid = error instanceof RangeError &&
        /not finite|output|Jacobian/.test(error.message);
      return fail(
        context,
        invalid ? HOST_INVALID_OUTPUT : HOST_CALLBACK_EXCEPTION,
        error,
      );
    }
  }

  instance = await WebAssembly.instantiate(module, {
    sagejs_numerical_nlopt: { evaluate },
  });
  instance.exports._initialize?.();
  for (const name of [
    "memory",
    "sagejs_nlopt_alloc",
    "sagejs_nlopt_free",
    "sagejs_nlopt_live_allocations",
    "sagejs_nlopt_live_bytes",
    "sagejs_nlopt_set_allocation_failure_after",
    "sagejs_nlopt_probe_callback",
    "sagejs_nlopt_solve",
  ]) {
    if (instance.exports[name] == null) {
      throw new Error(`missing numerical NLopt export ${name}`);
    }
  }

  function solve(options) {
    if (activeHandle !== 0) throw new Error("NLopt Wasm solves are not reentrant");
    if (typeof options?.objective !== "function") {
      throw new TypeError("objective must be a function");
    }
    const method = options.method;
    const methodNumber = methodCode(method);
    const initial = finiteVector(
      options.initial,
      options.initial?.length ?? null,
      "initial",
    );
    const n = initial.length;
    if (n === 0 || n > MAXIMUM_VARIABLES) {
      throw new NloptCapabilityError(
        `NLopt variable count ${n} is outside 1..${MAXIMUM_VARIABLES}`,
        { method, variableCount: n },
      );
    }
    const inequalityCount = options.inequalityCount ?? 0;
    const equalityCount = options.equalityCount ?? 0;
    if (!Number.isSafeInteger(inequalityCount) || inequalityCount < 0 ||
        !Number.isSafeInteger(equalityCount) || equalityCount < 0 ||
        inequalityCount + equalityCount > MAXIMUM_CONSTRAINTS) {
      throw new NloptCapabilityError(
        `constraint count is outside 0..${MAXIMUM_CONSTRAINTS}`,
        { method, inequalityCount, equalityCount },
      );
    }
    if (methodNumber === 1 && (inequalityCount !== 0 || equalityCount !== 0 ||
        options.inequality != null || options.equality != null)) {
      throw new NloptCapabilityError(
        "nlopt-nelder-mead is qualified only for bounds, not nonlinear constraints",
        { method, inequalityCount, equalityCount },
      );
    }
    if (inequalityCount > 0 && typeof options.inequality !== "function") {
      throw new TypeError("inequality must be a vector callback");
    }
    if (inequalityCount === 0 && options.inequality != null) {
      throw new TypeError("inequalityCount must be positive when inequality is set");
    }
    if (equalityCount > 0 && typeof options.equality !== "function") {
      throw new TypeError("equality must be a vector callback");
    }
    if (equalityCount === 0 && options.equality != null) {
      throw new TypeError("equalityCount must be positive when equality is set");
    }
    const lower = boundVector(options.lower, n, -Infinity, "lower");
    const upper = boundVector(options.upper, n, Infinity, "upper");
    for (let index = 0; index < n; index += 1) {
      if (lower[index] > upper[index]) {
        throw new RangeError(`lower[${index}] exceeds upper[${index}]`);
      }
      if (initial[index] < lower[index] || initial[index] > upper[index]) {
        throw new RangeError(`initial[${index}] lies outside its bounds`);
      }
    }
    const step = normalizeStep(options.initialStep, initial, lower, upper);
    const inequalityTolerance = nonnegativeVector(
      options.inequalityTolerance,
      inequalityCount,
      0,
      "inequalityTolerance",
    );
    const equalityTolerance = nonnegativeVector(
      options.equalityTolerance,
      equalityCount,
      0,
      "equalityTolerance",
    );
    const absoluteParameterTolerance = nonnegativeVector(
      options.absoluteParameterTolerance,
      n,
      0,
      "absoluteParameterTolerance",
    );
    const relativeFunctionTolerance = scalarTolerance(
      options.relativeFunctionTolerance,
      0,
      "relativeFunctionTolerance",
    );
    const absoluteFunctionTolerance = scalarTolerance(
      options.absoluteFunctionTolerance,
      0,
      "absoluteFunctionTolerance",
    );
    const relativeParameterTolerance = scalarTolerance(
      options.relativeParameterTolerance,
      1e-8,
      "relativeParameterTolerance",
    );
    const maximumEvaluations = positiveInteger(
      options.maximumEvaluations,
      Math.max(200, 200 * n),
      "maximumEvaluations",
      0x7fffffff,
    );
    const maximumCallbacks = positiveInteger(
      options.maximumCallbacks,
      maximumEvaluations * (1 + (inequalityCount > 0 ? 1 : 0) +
        (equalityCount > 0 ? 1 : 0)) + 4,
      "maximumCallbacks",
    );
    const maximumElapsedMs = options.maximumElapsedMs ?? Infinity;
    if (maximumElapsedMs !== Infinity &&
        (!Number.isFinite(maximumElapsedMs) || maximumElapsedMs <= 0)) {
      throw new RangeError("maximumElapsedMs must be positive or Infinity");
    }
    if (options.cancelled != null && typeof options.cancelled !== "function") {
      throw new TypeError("cancelled must be a function");
    }
    if (options.cancellationBuffer != null &&
        (!(options.cancellationBuffer instanceof Int32Array) ||
          typeof SharedArrayBuffer === "undefined" ||
          !(options.cancellationBuffer.buffer instanceof SharedArrayBuffer))) {
      throw new TypeError(
        "cancellationBuffer must be an Int32Array backed by SharedArrayBuffer",
      );
    }
    const cancellationIndex = options.cancellationIndex ?? 0;
    if (options.cancellationBuffer != null &&
        (!Number.isSafeInteger(cancellationIndex) || cancellationIndex < 0 ||
          cancellationIndex >= options.cancellationBuffer.length)) {
      throw new RangeError("cancellationIndex lies outside cancellationBuffer");
    }

    const offsets = [];
    function allocateVector(vector) {
      if (vector.length === 0) return 0;
      const offset = instance.exports.sagejs_nlopt_alloc(
        vector.byteLength,
      );
      if (offset === 0) {
        throw new RangeError(`NLopt Wasm allocation failed for ${vector.byteLength} bytes`);
      }
      offsets.push(offset);
      checkedView(
        instance.exports.memory,
        offset,
        vector.length,
        vector.constructor,
        "allocated vector",
      ).set(vector);
      return offset;
    }
    function allocateBytes(bytes) {
      const offset = instance.exports.sagejs_nlopt_alloc(bytes);
      if (offset === 0) {
        throw new RangeError(`NLopt Wasm allocation failed for ${bytes} bytes`);
      }
      offsets.push(offset);
      return offset;
    }

    const handle = nextHandle++;
    const context = {
      n,
      objective: options.objective,
      objectiveGradient: options.objectiveGradient,
      inequalityCount,
      inequality: options.inequality,
      inequalityJacobian: options.inequalityJacobian,
      equalityCount,
      equality: options.equality,
      equalityJacobian: options.equalityJacobian,
      signal: options.signal,
      cancelled: options.cancelled,
      cancellationBuffer: options.cancellationBuffer,
      cancellationIndex,
      maximumCallbacks,
      maximumElapsedMs,
      callbacks: 0,
      started: nowMilliseconds(),
      failure: undefined,
    };
    let xOffset;
    let minimumOffset;
    let statsOffset;
    try {
      xOffset = allocateVector(initial);
      const lowerOffset = allocateVector(lower);
      const upperOffset = allocateVector(upper);
      const stepOffset = allocateVector(step);
      const inequalityToleranceOffset = allocateVector(inequalityTolerance);
      const equalityToleranceOffset = allocateVector(equalityTolerance);
      const absoluteParameterToleranceOffset = allocateVector(
        absoluteParameterTolerance,
      );
      minimumOffset = allocateBytes(Float64Array.BYTES_PER_ELEMENT);
      statsOffset = allocateBytes(8 * Int32Array.BYTES_PER_ELEMENT);
      contexts.set(handle, context);
      activeHandle = handle;
      const code = instance.exports.sagejs_nlopt_solve(
        handle,
        methodNumber,
        n,
        inequalityCount,
        equalityCount,
        xOffset,
        lowerOffset,
        upperOffset,
        stepOffset,
        inequalityToleranceOffset,
        equalityToleranceOffset,
        relativeFunctionTolerance,
        absoluteFunctionTolerance,
        relativeParameterTolerance,
        absoluteParameterToleranceOffset,
        maximumEvaluations,
        minimumOffset,
        statsOffset,
      );
      const stats = Array.from(checkedView(
        instance.exports.memory,
        statsOffset,
        8,
        Int32Array,
        "NLopt stats",
      ));
      if (context.failure?.status === HOST_CALLBACK_EXCEPTION ||
          context.failure?.status === HOST_INVALID_OUTPUT) {
        throw context.failure.error;
      }
      const statusCode = context.failure?.status ?? code;
      const value = statusCode >= -5 && statusCode !== HOST_CANCELLED
        ? Array.from(checkedView(
          instance.exports.memory,
          xOffset,
          n,
          Float64Array,
          "final x",
        ))
        : undefined;
      const objectiveValue = statusCode >= -5
        ? checkedView(
          instance.exports.memory,
          minimumOffset,
          1,
          Float64Array,
          "final objective",
        )[0]
        : undefined;
      if (value?.some((entry) => !Number.isFinite(entry)) ||
          (objectiveValue != null && !Number.isFinite(objectiveValue))) {
        throw new RangeError("NLopt returned non-finite final evidence");
      }
      if (stats[5] !== 0 || stats[6] !== 0) {
        throw new Error(
          `${method} unexpectedly requested derivative callbacks; qualification invalid`,
        );
      }
      return Object.freeze({
        method,
        backend: "nlopt-mit-wasm",
        backendConverged: code > 0 && code < 5,
        status: backendStatus[statusCode] ?? `nlopt_status_${statusCode}`,
        backendStatus: stats[0],
        value,
        objectiveValue,
        evaluations: stats[1],
        objectiveCallbacks: stats[2],
        inequalityCallbacks: stats[3],
        equalityCallbacks: stats[4],
        gradientCallbacks: stats[5],
        jacobianCallbacks: stats[6],
        callbackCount: context.callbacks,
        elapsedMs: nowMilliseconds() - context.started,
        independentValidationRequired: true,
      });
    } finally {
      activeHandle = 0;
      contexts.delete(handle);
      for (let index = offsets.length - 1; index >= 0; index -= 1) {
        instance.exports.sagejs_nlopt_free(offsets[index]);
      }
    }
  }

  function probeCallbackBatch(options) {
    if (activeHandle !== 0) throw new Error("NLopt Wasm solves are not reentrant");
    const x = finiteVector(options?.x, options?.x?.length ?? null, "probe x");
    if (x.length === 0 || x.length > MAXIMUM_VARIABLES) {
      throw new RangeError(`probe variable count is outside 1..${MAXIMUM_VARIABLES}`);
    }
    const kind = options.kind === "objective"
      ? 1
      : options.kind === "inequality"
        ? 2
        : options.kind === "equality" ? 3 : 0;
    const valueCount = kind === 1 ? 1 : options.valueCount;
    if (kind === 0 || !Number.isSafeInteger(valueCount) || valueCount <= 0 ||
        valueCount > MAXIMUM_CONSTRAINTS) {
      throw new RangeError("probe callback kind or valueCount is invalid");
    }
    const handle = nextHandle++;
    const context = {
      n: x.length,
      objective: options.objective,
      objectiveGradient: options.objectiveGradient,
      inequalityCount: kind === 2 ? valueCount : 0,
      inequality: options.callback,
      inequalityJacobian: options.jacobian,
      equalityCount: kind === 3 ? valueCount : 0,
      equality: options.callback,
      equalityJacobian: options.jacobian,
      maximumCallbacks: 1,
      maximumElapsedMs: Infinity,
      callbacks: 0,
      started: nowMilliseconds(),
      failure: undefined,
    };
    const offsets = [];
    const allocate = (bytes) => {
      const offset = instance.exports.sagejs_nlopt_alloc(bytes);
      if (offset === 0) throw new RangeError("NLopt probe allocation failed");
      offsets.push(offset);
      return offset;
    };
    try {
      const xOffset = allocate(x.byteLength);
      const valueOffset = allocate(valueCount * Float64Array.BYTES_PER_ELEMENT);
      const derivativeOffset = allocate(
        valueCount * x.length * Float64Array.BYTES_PER_ELEMENT,
      );
      checkedView(instance.exports.memory, xOffset, x.length, Float64Array, "probe x")
        .set(x);
      contexts.set(handle, context);
      activeHandle = handle;
      const status = instance.exports.sagejs_nlopt_probe_callback(
        handle,
        kind,
        valueCount,
        x.length,
        xOffset,
        valueOffset,
        derivativeOffset,
      );
      if (context.failure != null) throw context.failure.error;
      if (status !== 0) throw new Error(`NLopt packed callback probe failed: ${status}`);
      return Object.freeze({
        values: Object.freeze(Array.from(checkedView(
          instance.exports.memory,
          valueOffset,
          valueCount,
          Float64Array,
          "probe values",
        ))),
        derivatives: Object.freeze(Array.from(checkedView(
          instance.exports.memory,
          derivativeOffset,
          valueCount * x.length,
          Float64Array,
          "probe derivatives",
        ))),
      });
    } finally {
      activeHandle = 0;
      contexts.delete(handle);
      for (let index = offsets.length - 1; index >= 0; index -= 1) {
        instance.exports.sagejs_nlopt_free(offsets[index]);
      }
    }
  }

  return Object.freeze({
    solve,
    inspect: () => Object.freeze({
      activeContexts: contexts.size,
      activeHandle,
      liveAllocations: instance.exports.sagejs_nlopt_live_allocations(),
      liveBytes: Number(instance.exports.sagejs_nlopt_live_bytes()),
      memoryBytes: instance.exports.memory.buffer.byteLength,
    }),
    capability: Object.freeze({
      backend: "nlopt-mit-wasm",
      methods: Object.freeze(["nlopt-nelder-mead", "nlopt-cobyla"]),
      maximumVariables: MAXIMUM_VARIABLES,
      maximumConstraints: MAXIMUM_CONSTRAINTS,
      reentrant: false,
      automaticSelection: false,
      callbackMode: "synchronous-packed-linear-memory",
      derivativePolicy: "ABI-capable-but-methods-qualified-as-derivative-free",
    }),
    qualification: Object.freeze({ probeCallbackBatch }),
  });
}

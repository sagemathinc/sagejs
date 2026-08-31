const HOST_CALLBACK_EXCEPTION = -1001;
const HOST_CANCELLED = -1002;
const HOST_MAXIMUM_EVALUATIONS = -1003;
const HOST_MAXIMUM_ELAPSED_TIME = -1004;
const HOST_INVALID_OUTPUT = -1005;

const backendStatus = Object.freeze({
  0: "improper_input",
  1: "relative_reduction_converged",
  2: "relative_step_converged",
  3: "reduction_and_step_converged",
  4: "orthogonality_converged",
  5: "maximum_evaluations",
  6: "function_tolerance_too_small",
  7: "step_tolerance_too_small",
  8: "gradient_tolerance_too_small",
  [-1001]: "callback_exception",
  [-1002]: "cancelled",
  [-1003]: "maximum_evaluations",
  [-1004]: "maximum_elapsed_time",
  [-1005]: "invalid_callback_output",
  [-2001]: "invalid_argument",
  [-2002]: "allocation_failed",
  [-2003]: "corrupt_memory_region",
  [-2004]: "dimension_limit",
});

function finiteVector(value, length, description) {
  if (value == null || typeof value[Symbol.iterator] !== "function") {
    throw new TypeError(`${description} must be an iterable of ${length} numbers`);
  }
  const result = Float64Array.from(value);
  if (result.length !== length) {
    throw new RangeError(`${description} has length ${result.length}; expected ${length}`);
  }
  for (let index = 0; index < result.length; index += 1) {
    if (!Number.isFinite(result[index])) {
      throw new RangeError(`${description}[${index}] is not finite`);
    }
  }
  return result;
}

function finiteJacobian(value, rows, columns) {
  if (value == null || typeof value[Symbol.iterator] !== "function") {
    throw new TypeError("jacobian must be an iterable");
  }
  const outer = Array.from(value);
  if (outer.length === rows && outer.every((row) => row?.[Symbol.iterator])) {
    const result = new Float64Array(rows * columns);
    for (let row = 0; row < rows; row += 1) {
      const values = finiteVector(outer[row], columns, `jacobian row ${row}`);
      for (let column = 0; column < columns; column += 1) {
        result[column * rows + row] = values[column];
      }
    }
    return result;
  }
  return finiteVector(outer, rows * columns, "column-major jacobian");
}

function nowMilliseconds() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function statusRecord(code) {
  return backendStatus[code] ?? `cminpack_status_${code}`;
}

function checkedView(memory, offset, length, Type, description) {
  if (!Number.isSafeInteger(offset) || offset <= 0 || offset % Type.BYTES_PER_ELEMENT !== 0) {
    throw new RangeError(`invalid ${description} offset`);
  }
  const bytes = length * Type.BYTES_PER_ELEMENT;
  if (!Number.isSafeInteger(bytes) || offset + bytes > memory.buffer.byteLength) {
    throw new RangeError(`${description} lies outside WebAssembly memory`);
  }
  return new Type(memory.buffer, offset, length);
}

export async function createCminpackPrototype(moduleOrBytes) {
  const module =
    moduleOrBytes instanceof WebAssembly.Module
      ? moduleOrBytes
      : await WebAssembly.compile(moduleOrBytes);
  const imports = WebAssembly.Module.imports(module);
  const unexpectedImports = imports.filter(
    ({ module: namespace, name, kind }) =>
      namespace !== "sagejs_p3" || name !== "evaluate" || kind !== "function",
  );
  if (unexpectedImports.length > 0 || imports.length !== 1) {
    throw new Error(`unexpected P3 Wasm imports: ${JSON.stringify(imports)}`);
  }

  let instance;
  let activeHandle = 0;
  let nextHandle = 1;
  const contexts = new Map();

  function fail(context, status, error) {
    if (context.failure == null) context.failure = { status, error };
    return status;
  }

  function evaluate(handle, m, n, xOffset, residualOffset, jacobianOffset, ldfjac, flags) {
    const context = contexts.get(handle);
    if (context == null || activeHandle !== handle || context.m !== m || context.n !== n) {
      return HOST_CALLBACK_EXCEPTION;
    }
    try {
      if (context.signal?.aborted || context.cancelled?.() === true ||
          (context.cancellationBuffer != null &&
            Atomics.load(context.cancellationBuffer, context.cancellationIndex) !== 0)) {
        return fail(context, HOST_CANCELLED);
      }
      if (context.maximumElapsedMs != null &&
          nowMilliseconds() - context.started >= context.maximumElapsedMs) {
        return fail(context, HOST_MAXIMUM_ELAPSED_TIME);
      }
      if (context.evaluations >= context.maximumEvaluations) {
        return fail(context, HOST_MAXIMUM_EVALUATIONS);
      }
      const memory = instance.exports.memory;
      const x = Array.from(checkedView(memory, xOffset, n, Float64Array, "x"));
      if ((flags & 1) !== 0) {
        context.evaluations += 1;
        const residual = finiteVector(context.residual(x), m, "residual");
        checkedView(memory, residualOffset, m, Float64Array, "residual output").set(residual);
      } else if ((flags & 2) !== 0) {
        if (context.jacobian == null) {
          throw new TypeError("cminpack requested a Jacobian but none is configured");
        }
        context.jacobianEvaluations += 1;
        if (ldfjac !== m) throw new RangeError("unexpected cminpack Jacobian layout");
        const jacobian = finiteJacobian(context.jacobian(x), m, n);
        checkedView(
          memory,
          jacobianOffset,
          m * n,
          Float64Array,
          "jacobian output",
        ).set(jacobian);
      } else {
        throw new RangeError(`unknown P3 callback flags ${flags}`);
      }
      return 0;
    } catch (error) {
      const invalid = error instanceof RangeError && /not finite/.test(error.message);
      return fail(context, invalid ? HOST_INVALID_OUTPUT : HOST_CALLBACK_EXCEPTION, error);
    }
  }

  instance = await WebAssembly.instantiate(module, { sagejs_p3: { evaluate } });
  instance.exports._initialize?.();
  const required = [
    "memory",
    "p3_alloc",
    "p3_free",
    "p3_live_allocations",
    "p3_lm_solve",
  ];
  for (const name of required) {
    if (instance.exports[name] == null) throw new Error(`missing P3 Wasm export ${name}`);
  }

  function allocate(bytes) {
    const offset = instance.exports.p3_alloc(bytes);
    if (offset === 0) throw new RangeError(`P3 Wasm allocation failed for ${bytes} bytes`);
    return offset;
  }

  function leastSquares(options) {
    if (activeHandle !== 0) throw new Error("P3 Wasm solves are not reentrant");
    if (typeof options?.residual !== "function") {
      throw new TypeError("residual must be a function");
    }
    const initial = finiteVector(options.initial, options.initial?.length ?? 0, "initial");
    const n = initial.length;
    const m = Number(options.residualCount);
    if (!Number.isSafeInteger(m) || m < n || n === 0) {
      throw new RangeError("residualCount must be an integer at least initial.length");
    }
    const method = options.jacobian == null ? 1 : 2;
    if (options.jacobian != null && typeof options.jacobian !== "function") {
      throw new TypeError("jacobian must be a function");
    }
    const maxfev = options.maximumEvaluations ?? 100 * (n + 1);
    if (!Number.isSafeInteger(maxfev) || maxfev <= 0) {
      throw new RangeError("maximumEvaluations must be a positive integer");
    }
    const maximumElapsedMs = options.maximumElapsedMs;
    if (maximumElapsedMs != null &&
        (!Number.isFinite(maximumElapsedMs) || maximumElapsedMs < 0)) {
      throw new RangeError("maximumElapsedMs must be finite and nonnegative");
    }
    if (options.cancellationBuffer != null &&
        !(options.cancellationBuffer instanceof Int32Array)) {
      throw new TypeError("cancellationBuffer must be an Int32Array");
    }
    const cancellationIndex = options.cancellationIndex ?? 0;
    if (options.cancellationBuffer != null &&
        (!Number.isSafeInteger(cancellationIndex) || cancellationIndex < 0 ||
          cancellationIndex >= options.cancellationBuffer.length)) {
      throw new RangeError("cancellationIndex lies outside cancellationBuffer");
    }

    const xOffset = allocate(n * Float64Array.BYTES_PER_ELEMENT);
    const statsOffset = allocate(4 * Int32Array.BYTES_PER_ELEMENT);
    let diagOffset = 0;
    const handle = nextHandle++;
    const context = {
      m,
      n,
      residual: options.residual,
      jacobian: options.jacobian,
      signal: options.signal,
      cancelled: options.cancelled,
      cancellationBuffer: options.cancellationBuffer,
      cancellationIndex,
      maximumElapsedMs,
      maximumEvaluations: maxfev,
      evaluations: 0,
      jacobianEvaluations: 0,
      failure: undefined,
      started: nowMilliseconds(),
    };
    try {
      checkedView(instance.exports.memory, xOffset, n, Float64Array, "x").set(initial);
      if (options.scale != null) {
        const scale = finiteVector(options.scale, n, "scale");
        for (const value of scale) {
          if (!(value > 0)) throw new RangeError("scale entries must be positive");
        }
        diagOffset = allocate(n * Float64Array.BYTES_PER_ELEMENT);
        checkedView(instance.exports.memory, diagOffset, n, Float64Array, "scale").set(scale);
      }
      contexts.set(handle, context);
      activeHandle = handle;
      const code = instance.exports.p3_lm_solve(
        handle,
        method,
        m,
        n,
        xOffset,
        options.functionTolerance ?? 1e-12,
        options.stepTolerance ?? 1e-12,
        options.gradientTolerance ?? 1e-12,
        maxfev,
        options.finiteDifferenceStep ?? 0,
        diagOffset,
        statsOffset,
      );
      const stats = Array.from(
        checkedView(instance.exports.memory, statsOffset, 4, Int32Array, "stats"),
      );
      if (context.failure?.status === HOST_CALLBACK_EXCEPTION ||
          context.failure?.status === HOST_INVALID_OUTPUT) {
        throw context.failure.error;
      }
      const status = context.failure?.status ?? code;
      const normalBackendStop = status >= 0;
      const value = normalBackendStop
        ? Array.from(checkedView(instance.exports.memory, xOffset, n, Float64Array, "x"))
        : undefined;
      if (value?.some((entry) => !Number.isFinite(entry))) {
        throw new RangeError("cminpack returned a non-finite parameter vector");
      }
      return Object.freeze({
        success: status >= 1 && status <= 4,
        status: statusRecord(status),
        value,
        method: method === 1 ? "cminpack-lmdif" : "cminpack-lmder",
        backend: "experimental-cminpack-wasm",
        backendStatus: code,
        residualEvaluations: context.evaluations,
        jacobianEvaluations: context.jacobianEvaluations,
        backendResidualEvaluations: stats[1],
        backendJacobianEvaluations: stats[2],
        elapsedMs: nowMilliseconds() - context.started,
      });
    } finally {
      activeHandle = 0;
      contexts.delete(handle);
      if (diagOffset !== 0) instance.exports.p3_free(diagOffset);
      instance.exports.p3_free(statsOffset);
      instance.exports.p3_free(xOffset);
    }
  }

  return Object.freeze({
    leastSquares,
    inspect: () =>
      Object.freeze({
        activeContexts: contexts.size,
        activeHandle,
        liveAllocations: instance.exports.p3_live_allocations(),
        memoryBytes: instance.exports.memory.buffer.byteLength,
      }),
    capability: Object.freeze({
      backend: "experimental-cminpack-wasm",
      methods: Object.freeze(["cminpack-lmdif", "cminpack-lmder"]),
      maximumVariables: 256,
      maximumResiduals: 16384,
      reentrant: false,
      callbackMode: "synchronous-packed-linear-memory",
    }),
  });
}

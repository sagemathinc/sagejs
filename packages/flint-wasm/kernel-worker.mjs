import { instantiateSageEvaluator } from "./evaluator.mjs";
const COMM_MAX_JSON_BYTES = 8 * 1024 * 1024;
const COMM_MAX_DEPTH = 64;
const COMM_MAX_BUFFERS = 64;
const COMM_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const COMM_MAX_TOTAL_BUFFER_BYTES = 128 * 1024 * 1024;

function transportValue(value, seen = new WeakMap()) {
  if (value === null || typeof value !== "object") return value;
  if (Reflect.get(value, "__sagejs_float__") === true) return Number(value);
  const previous = seen.get(value);
  if (previous !== undefined) return previous;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  if (Array.isArray(value)) {
    const answer = [];
    seen.set(value, answer);
    for (const item of value) answer.push(transportValue(item, seen));
    return answer;
  }
  const jsmap = Reflect.get(value, "jsmap");
  const keymap = Reflect.get(value, "keymap");
  if (jsmap instanceof Map && keymap instanceof Map) {
    const answer = {};
    seen.set(value, answer);
    for (const normalizedKey of jsmap.keys()) {
      const key = keymap.get(normalizedKey);
      if (typeof key !== "string") {
        throw new TypeError("display dictionaries require string keys");
      }
      answer[key] = transportValue(jsmap.get(normalizedKey), seen);
    }
    return answer;
  }
  const answer = {};
  seen.set(value, answer);
  for (const key of Object.keys(value)) {
    answer[key] = transportValue(Reflect.get(value, key), seen);
  }
  return answer;
}

function identifier(value, description) {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024) {
    throw new TypeError(
      description + " must be a nonempty string of at most 1024 characters",
    );
  }
  return value;
}

function jsonDictionary(value) {
  const converted = transportValue(value);
  if (converted === null || typeof converted !== "object" || Array.isArray(converted)) {
    throw new TypeError("comm data and metadata must be dictionaries");
  }
  const seen = new Set();
  const visit = (item, depth) => {
    if (depth > COMM_MAX_DEPTH) {
      throw new RangeError("comm JSON exceeds maximum nesting depth");
    }
    if (item === null || typeof item === "string" || typeof item === "boolean") return;
    if (typeof item === "number") {
      if (!Number.isFinite(item)) throw new TypeError("comm JSON numbers must be finite");
      return;
    }
    if (typeof item !== "object") throw new TypeError("comm data is not JSON-compatible");
    if (seen.has(item)) throw new TypeError("comm JSON cannot contain cycles");
    seen.add(item);
    for (const child of Array.isArray(item) ? item : Object.values(item)) {
      visit(child, depth + 1);
    }
    seen.delete(item);
  };
  visit(converted, 0);
  if (new TextEncoder().encode(JSON.stringify(converted)).byteLength > COMM_MAX_JSON_BYTES) {
    throw new RangeError("comm JSON exceeds the 8 MiB message limit");
  }
  return converted;
}

function commBuffer(value) {
  let candidate = value;
  if (candidate && typeof candidate === "object") {
    const bytesValues = Reflect.get(candidate, "_bytes_values");
    if (typeof bytesValues === "function") {
      candidate = Reflect.apply(bytesValues, candidate, []);
    } else {
      const values = Reflect.get(candidate, "_values");
      candidate = typeof values === "function"
        ? Reflect.apply(values, candidate, [])
        : values === undefined ? candidate : values;
    }
  }
  let result;
  if (candidate instanceof Uint8Array) result = candidate.slice();
  else if (candidate instanceof ArrayBuffer) result = new Uint8Array(candidate.slice(0));
  else if (ArrayBuffer.isView(candidate)) {
    result = new Uint8Array(candidate.buffer, candidate.byteOffset, candidate.byteLength).slice();
  } else if (Array.isArray(candidate)) {
    if (candidate.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) {
      throw new TypeError("comm buffers must contain bytes");
    }
    result = Uint8Array.from(candidate);
  } else {
    throw new TypeError("comm buffers must be bytes-like values");
  }
  if (result.byteLength > COMM_MAX_BUFFER_BYTES) {
    throw new RangeError("one comm buffer exceeds the 64 MiB limit");
  }
  return result;
}

function commBuffers(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new TypeError("comm buffers must be a list");
  if (value.length > COMM_MAX_BUFFERS) throw new RangeError("comm message exceeds 64 buffers");
  const result = value.map(commBuffer);
  if (result.reduce((sum, buffer) => sum + buffer.byteLength, 0) >
      COMM_MAX_TOTAL_BUFFER_BYTES) {
    throw new RangeError("comm buffers exceed the 128 MiB aggregate limit");
  }
  return result;
}

function richDisplay(value) {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return undefined;
  }
  const method = Reflect.get(value, "_rich_repr_");
  if (typeof method === "function") {
    const display = Reflect.apply(method, value, []);
    if (
      display === null ||
      typeof display !== "object" ||
      typeof Reflect.get(display, "mime") !== "string" ||
      !Reflect.has(display, "data")
    ) {
      throw new TypeError("_rich_repr_() must return { mime, data }");
    }
    return {
      mime: Reflect.get(display, "mime"),
      data: transportValue(Reflect.get(display, "data")),
    };
  }
  const latex = Reflect.get(value, "_latex_");
  if (typeof latex !== "function") return undefined;
  return {
    mime: "text/latex",
    data: "$\\displaystyle " + String(Reflect.apply(latex, value, [])) + "$",
  };
}

function richMimeBundle(value) {
  const data = {};
  const metadata = {};
  if (value !== null && (typeof value === "object" || typeof value === "function")) {
    const method = Reflect.get(value, "_repr_mimebundle_");
    if (typeof method === "function") {
      const converted = transportValue(Reflect.apply(method, value, []));
      if (Array.isArray(converted) && converted.length === 2) {
        Object.assign(data, converted[0]);
        Object.assign(metadata, converted[1]);
      } else if (converted && typeof converted === "object") {
        Object.assign(data, converted);
      }
    }
  }
  return Object.keys(data).length ? { data, metadata } : undefined;
}

function displayBundle(value) {
  const rich = richMimeBundle(value);
  const data = { ...(rich?.data ?? {}) };
  const metadata = { ...(rich?.metadata ?? {}) };
  if (!("text/plain" in data)) data["text/plain"] = String(globalThis.ρσ_repr(value));
  const legacy = richDisplay(value);
  if (legacy) data[legacy.mime] = legacy.data;
  return { data, metadata };
}

function globalOverride(name, value, restorers) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    enumerable: descriptor?.enumerable ?? false,
    writable: true,
    value,
  });
  restorers.push(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  });
}

/** Add display and comm transport to an initialized, certified evaluator. */
function extendSageEvaluator(
  evaluator,
  { onEvent = () => undefined, onComm = () => undefined } = {},
) {
  const restorers = [];
  let activeParentId;
  let nextDisplayId = 0;
  const outputWrite = globalThis.__sagejs_output_write__;
  globalOverride("__sagejs_output_write__", (text) => {
    const value = String(text);
    Reflect.apply(outputWrite, undefined, [value]);
    onEvent({
      schema: "sagejs.output-event/v1",
      type: "stream",
      parentId: activeParentId,
      name: "stdout",
      text: value,
    });
  }, restorers);
  globalOverride("__sagejs_format_display__", displayBundle, restorers);
  globalOverride("__sagejs_display_publish__", (value, requestedDisplayId, update = false) => {
    let displayId;
    if (requestedDisplayId === true) {
      displayId = "display-" + String(++nextDisplayId).padStart(6, "0");
    } else if (typeof requestedDisplayId === "string" && requestedDisplayId) {
      displayId = requestedDisplayId;
    }
    const formatted = displayBundle(value);
    onEvent({
      schema: "sagejs.output-event/v1",
      type: update ? "update_display_data" : "display_data",
      parentId: activeParentId,
      data: formatted.data,
      metadata: formatted.metadata,
      displayId,
    });
    return displayId;
  }, restorers);
  globalOverride("__sagejs_clear_output__", (wait = false) => {
    onEvent({
      schema: "sagejs.output-event/v1",
      type: "clear_output",
      parentId: activeParentId,
      wait: Boolean(wait),
    });
  }, restorers);
  globalOverride("__sagejs_get_parent__", () =>
    activeParentId ? { header: { msg_id: activeParentId } } : {}, restorers);
  globalOverride("__sagejs_set_parent__", (parent) => {
    const header = parent && typeof parent === "object"
      ? Reflect.get(parent, "header")
      : undefined;
    const msgId = header && typeof header === "object"
      ? Reflect.get(header, "msg_id")
      : undefined;
    if (typeof msgId === "string") activeParentId = msgId;
  }, restorers);
  globalOverride("__sagejs_showtraceback__", (error) => {
    const name = String(Reflect.get(Object(error), "name") ?? "Error");
    const message = String(Reflect.get(Object(error), "message") ?? error);
    const stack = Reflect.get(Object(error), "stack");
    onEvent({
      schema: "sagejs.output-event/v1",
      type: "error",
      parentId: activeParentId,
      name,
      message,
      traceback: typeof stack === "string" ? stack.split("\n") : [name + ": " + message],
    });
  }, restorers);
  globalOverride("__sagejs_comm_publish__", (
    type,
    commId,
    targetName,
    targetModule,
    data,
    metadata,
    buffers,
  ) => {
    if (type !== "open" && type !== "message" && type !== "close") {
      throw new TypeError("unknown Sage.js comm event type " + JSON.stringify(type));
    }
    const event = {
      schema: "sagejs.comm-event/v1",
      type,
      parentId: activeParentId,
      commId: identifier(commId, "comm id"),
      data: jsonDictionary(data ?? {}),
      metadata: jsonDictionary(metadata ?? {}),
      buffers: commBuffers(buffers),
    };
    if (type === "open") {
      event.targetName = identifier(targetName, "comm target name");
      if (typeof targetModule === "string" && targetModule) {
        event.targetModule = identifier(targetModule, "comm target module");
      }
    }
    onComm(event);
  }, restorers);

  async function evaluate(source, options = {}) {
    const previousParentId = activeParentId;
    activeParentId = options.parentId;
    try {
      return await evaluator.evaluate(source, options);
    } finally {
      activeParentId = previousParentId;
    }
  }

  function comm(event) {
    if (event?.schema !== "sagejs.comm-event/v1") {
      throw new TypeError("unsupported Sage.js comm schema");
    }
    const dispatch = Reflect.get(globalThis, "__sagejs_comm_dispatch_python__");
    if (typeof dispatch !== "function") {
      throw new Error("no Sage.js comm backend is active; import IPython or ipywidgets first");
    }
    const normalized = {
      schema: "sagejs.comm-event/v1",
      type: event.type,
      parentId: event.parentId,
      commId: identifier(event.commId, "comm id"),
      data: jsonDictionary(event.data ?? {}),
      metadata: jsonDictionary(event.metadata ?? {}),
      buffers: commBuffers(event.buffers),
    };
    if (event.type === "open") {
      normalized.targetName = identifier(event.targetName, "comm target name");
      if (event.targetModule) {
        normalized.targetModule = identifier(event.targetModule, "comm target module");
      }
    }
    const previousParentId = activeParentId;
    activeParentId = event.parentId;
    try {
      Reflect.apply(dispatch, undefined, [normalized]);
    } finally {
      activeParentId = previousParentId;
    }
  }

  function commInfo(targetName) {
    const info = Reflect.get(globalThis, "__sagejs_comm_info_python__");
    if (typeof info !== "function") return {};
    return jsonDictionary(Reflect.apply(info, undefined, [targetName]));
  }

  function terminate() {
    for (const restore of restorers.reverse()) restore();
    evaluator.terminate();
  }

  return Object.freeze({ evaluate, comm, commInfo, terminate });
}

function serializeError(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
}

let evaluatorPromise;
let evaluationTail = Promise.resolve();
let channel;
let compilerOptimizationReport;
let activeRequestId;

function validOptimizationReport(value) {
  return (
    value?.schema === "sagejs.optimizer-evaluation/v1" &&
    value?.authority === "compiler-verified-static" &&
    value?.program?.schema === "sagejs.optimizing-mathematics/v1" &&
    Array.isArray(value?.program?.passes) &&
    Array.isArray(value?.program?.contracts) &&
    Array.isArray(value?.program?.regions)
  );
}

// The nested compiler worker is already isolated from evaluated code. Observe
// only its verified static report here rather than publishing a trace hook into
// the evaluator global. Returning an explicit object from a constructor is
// supported by JavaScript and preserves the Worker interface expected by the
// evaluator without modifying that separately certified source boundary.
function ReportingCompilerWorker(url, options) {
  const worker = new Worker(url, options);
  worker.addEventListener("message", ({ data }) => {
    const report = data?.ok ? data?.result?.optimization : undefined;
    if (validOptimizationReport(report)) compilerOptimizationReport = report;
  });
  return worker;
}

function send(message) {
  if (!channel) throw new Error("Sage.js browser kernel is not connected");
  channel.postMessage(message);
}

async function initialize(message) {
  if (evaluatorPromise) {
    throw new Error("Sage.js browser kernel is already initialized");
  }
  evaluatorPromise = instantiateSageEvaluator({
    compiler: message.compiler,
    baselib: message.baselib,
    standardLibrary: message.standardLibrary,
    lazyModules: message.lazyModules,
    conwayData: message.conwayData,
    dynamicPrograms: message.dynamicPrograms,
    flint: message.flint,
    algebraic: message.algebraic,
    nativeKernels: message.nativeKernels,
    m4ri: message.m4ri,
    symbolic: message.symbolic,
    compilerWorker: message.compilerWorker,
    compilerFrontend: message.compilerFrontend,
    foreignFrontend: message.foreignFrontend,
    treeSitterRuntime: message.treeSitterRuntime,
    pythonGrammar: message.pythonGrammar,
    sageGrammar: message.sageGrammar,
    foreignGrammars: message.foreignGrammars,
    capabilityReport: message.capabilityReport,
    WorkerConstructor: ReportingCompilerWorker,
  }).then((evaluator) => extendSageEvaluator(evaluator, {
    onEvent(event) {
      send({ type: "output-event", id: activeRequestId, event });
    },
    onComm(event) {
      send({ type: "comm-event", id: activeRequestId, event });
    },
  }));
  await evaluatorPromise;
  send({
    type: "ready",
    protocol: 3,
  });
}

async function evaluate(message) {
  const evaluator = await evaluatorPromise;
  const started = performance.now();
  compilerOptimizationReport = undefined;
  const result = await evaluator.evaluate(message.source, {
    filename: message.filename,
    onOutput(text) {
      send({
        type: "stdout",
        id: message.id,
        text,
      });
    },
    onError(text) {
      send({
        type: "stderr",
        id: message.id,
        text,
      });
    },
    parentId: message.parentId,
  });
  if (!validOptimizationReport(compilerOptimizationReport)) {
    throw new TypeError("browser compiler did not return verified optimizer IR");
  }
  send({
    type: "result",
    id: message.id,
    ok: true,
    result: {
      repr: result.repr,
      display: result.display,
      mimeBundle: richMimeBundle(result.value),
      saveRequests: result.saveRequests,
      instrumentation: result.instrumentation,
      optimization: compilerOptimizationReport,
      durationMs: performance.now() - started,
    },
  });
}

async function dispatch(message) {
  const evaluator = await evaluatorPromise;
  activeRequestId = message.id;
  try {
    if (message.type === "evaluate") return await evaluate(message);
    if (message.type === "comm") {
      evaluator.comm(message.event);
      return undefined;
    }
    if (message.type === "commInfo") return evaluator.commInfo(message.targetName);
    throw new TypeError(`unknown browser kernel request ${JSON.stringify(message.type)}`);
  } finally {
    activeRequestId = undefined;
  }
}

self.onmessage = ({ data, ports }) => {
  if (
    channel ||
    !data ||
    data.type !== "initialize" ||
    data.protocol !== 3 ||
    ports.length !== 1
  ) {
    return;
  }
  channel = ports[0];
  self.onmessage = null;
  channel.onmessage = ({ data: privateData }) => {
    if (
      !privateData ||
      !["evaluate", "comm", "commInfo"].includes(privateData.type) ||
      !Number.isSafeInteger(privateData.id) ||
      privateData.id <= 0 ||
      (privateData.type === "evaluate" &&
        (typeof privateData.source !== "string" ||
          typeof privateData.filename !== "string"))
    ) {
      return;
    }
    const run = evaluationTail.then(() => dispatch(privateData));
    run.then((result) => {
      if (privateData.type !== "evaluate") {
        send({ type: "result", id: privateData.id, ok: true, result });
      }
    });
    evaluationTail = run.catch((error) => {
      send({
        type: "result",
        id: privateData.id,
        ok: false,
        error: serializeError(error),
      });
    });
  };
  channel.start?.();
  void initialize(data).catch((error) => {
    send({
      type: "initialization-error",
      error: serializeError(error),
    });
  });
};

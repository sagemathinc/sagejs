import { instantiateFlintFactor } from "./index.mjs";

function deserializeError(serialized) {
  const error = new Error(serialized.message);
  error.name = serialized.name;
  if (serialized.stack) {
    error.stack = serialized.stack;
  }
  return error;
}

function richDisplay(value) {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return undefined;
  }
  const method = Reflect.get(value, "_rich_repr_");
  if (typeof method !== "function") {
    return undefined;
  }
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
    data: Reflect.get(display, "data"),
  };
}

class CompilerWorker {
  constructor(url) {
    this.worker = new Worker(url, { type: "module" });
    this.nextId = 0;
    this.pending = new Map();
    this.worker.onmessage = ({ data }) => {
      const handlers = this.pending.get(data.id);
      if (!handlers) {
        return;
      }
      this.pending.delete(data.id);
      if (data.ok) {
        handlers.resolve(data.result);
      } else {
        handlers.reject(deserializeError(data.error));
      }
    };
    this.worker.onerror = (event) => {
      const error = new Error(
        event.message || "Sage.js compiler worker failed",
      );
      for (const handlers of this.pending.values()) {
        handlers.reject(error);
      }
      this.pending.clear();
    };
  }

  request(type, parameters) {
    this.nextId += 1;
    const id = this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, ...parameters });
    });
  }

  terminate() {
    this.worker.terminate();
  }
}

/**
 * Create a persistent Sage.js evaluator in the current isolated worker.
 *
 * A nested worker hosts the self-compiled language compiler. This mirrors the
 * separate VM realm used by the Node REPL and prevents the compiler's Python
 * compatibility runtime from colliding with the evaluated program's runtime.
 */
export async function instantiateSageEvaluator({
  compiler,
  baselib,
  flint,
  compilerWorker = new URL("./compiler-worker.mjs", import.meta.url),
}) {
  const language = new CompilerWorker(compilerWorker);
  let initialization;
  let flintBackend;
  try {
    [initialization, flintBackend] = await Promise.all([
      language.request("initialize", {
        compiler: String(compiler),
        baselib: String(baselib),
      }),
      instantiateFlintFactor(flint),
    ]);
  } catch (error) {
    language.terminate();
    throw error;
  }
  const globalEvaluate = globalThis.eval;
  let outputHandler = (text) => console.log(text);

  globalThis.require = (name) => {
    if (name === "@sagemath/sagejs-flint") {
      return flintBackend;
    }
    throw new Error(`module ${JSON.stringify(name)} is unavailable in browser`);
  };
  globalThis.__sagejs_output_write__ = (text) => {
    outputHandler(String(text));
  };
  globalEvaluate(initialization);
  globalEvaluate('var __name__ = "__repl__";');

  async function evaluateNow(
    source,
    {
      filename = "<browser>",
      onOutput = (text) => console.log(text),
    } = {},
  ) {
    const javascript = await language.request("compile", {
      source,
      filename,
    });
    const previousOutputHandler = outputHandler;
    outputHandler = onOutput;
    try {
      const value = globalEvaluate(javascript);
      return {
        value,
        repr: value === undefined ? "" : globalThis.ρσ_repr(value),
        display: richDisplay(value),
      };
    } finally {
      outputHandler = previousOutputHandler;
    }
  }

  let evaluationTail = Promise.resolve();
  function evaluate(source, options) {
    const result = evaluationTail.then(() => evaluateNow(source, options));
    evaluationTail = result.catch(() => {});
    return result;
  }

  function terminate() {
    language.terminate();
  }

  return Object.freeze({ evaluate, terminate });
}

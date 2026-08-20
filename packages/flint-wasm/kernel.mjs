export class SageSessionInterruptedError extends Error {
  constructor(message = "Sage.js evaluation interrupted") {
    super(message);
    this.name = "SageSessionInterruptedError";
  }
}

export class SageSessionTimeoutError extends Error {
  constructor(message = "Sage.js evaluation timed out") {
    super(message);
    this.name = "SageSessionTimeoutError";
  }
}

export class SageSessionClosedError extends Error {
  constructor(message = "Sage.js session is closed") {
    super(message);
    this.name = "SageSessionClosedError";
  }
}

function deserializeError(serialized) {
  const error = new Error(serialized.message);
  error.name = serialized.name;
  if (serialized.stack) error.stack = serialized.stack;
  return error;
}

/**
 * A persistent, interruptible Sage.js session hosted in a Web Worker.
 *
 * Runtime-owned mathematical objects remain inside the worker. Evaluations
 * return structured, clone-safe metadata and stream textual output.
 */
export class SageSession {
  constructor({
    worker = new URL("./kernel-worker.mjs", import.meta.url),
    compiler = new URL("./dist/compiler.js", import.meta.url),
    baselib = new URL("./dist/baselib.js", import.meta.url),
    standardLibrary = new URL("./dist/stdlib.json", import.meta.url),
    lazyModules = new URL("./dist/lazy-modules.json", import.meta.url),
    dynamicPrograms = new URL("./dist/dynamic-programs.json", import.meta.url),
    flint = new URL("./dist/flint-factor.wasm", import.meta.url),
    algebraic = new URL("./dist/flint-algebraic.wasm", import.meta.url),
    nativeKernels = new URL("./dist/native-kernels/index.json", import.meta.url),
    m4ri = new URL("./dist/m4ri-resource.wasm", import.meta.url),
    symbolic = new URL("./dist/symbolic-backend.mjs", import.meta.url),
    compilerWorker = new URL("./compiler-worker.mjs", import.meta.url),
    compilerFrontend = new URL("./dist/compiler-frontend.mjs", import.meta.url),
    treeSitterRuntime = new URL("./dist/web-tree-sitter.wasm", import.meta.url),
    pythonGrammar = new URL("./dist/tree-sitter-python.wasm", import.meta.url),
    sageGrammar = new URL("./dist/tree-sitter-sage.wasm", import.meta.url),
    capabilityReport = new URL("./dist/wasm-capabilities-report.json", import.meta.url),
    onGraphicsSave,
  } = {}) {
    this.resources = {
      worker: String(worker),
      compiler: String(compiler),
      baselib: String(baselib),
      standardLibrary: String(standardLibrary),
      lazyModules: String(lazyModules),
      dynamicPrograms: String(dynamicPrograms),
      flint: String(flint),
      algebraic: String(algebraic),
      nativeKernels: String(nativeKernels),
      m4ri: String(m4ri),
      symbolic: String(symbolic),
      compilerWorker: String(compilerWorker),
      compilerFrontend: String(compilerFrontend),
      treeSitterRuntime: String(treeSitterRuntime),
      pythonGrammar: String(pythonGrammar),
      sageGrammar: String(sageGrammar),
      capabilityReport: String(capabilityReport),
    };
    this.onGraphicsSave = onGraphicsSave;
    this.listeners = new Map();
    this.pending = new Map();
    this.nextId = 0;
    this.closed = false;
    this.spawnWorker();
  }

  on(type, listener) {
    let listeners = this.listeners.get(type);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(type, listeners);
    }
    listeners.add(listener);
    return this;
  }

  off(type, listener) {
    this.listeners.get(type)?.delete(listener);
    return this;
  }

  emit(type, ...parameters) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(...parameters);
    }
  }

  prepareReadyPromise() {
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
  }

  spawnWorker(readyPromisePrepared = false) {
    if (!readyPromisePrepared) this.prepareReadyPromise();
    const worker = new Worker(this.resources.worker, { type: "module" });
    const channel = new MessageChannel();
    this.worker = worker;
    this.channel = channel.port1;

    channel.port1.onmessage = ({ data }) => {
      if (worker !== this.worker || channel.port1 !== this.channel) return;
      if (!data || typeof data !== "object" || typeof data.type !== "string") {
        return;
      }
      if (data.type === "ready") {
        if (data.protocol !== 2) {
          this.readyReject(
            new Error(`unsupported Sage.js worker protocol ${data.protocol}`),
          );
          return;
        }
        this.readyResolve();
        this.emit("ready");
        return;
      }
      if (data.type === "initialization-error") {
        const error = deserializeError(data.error);
        this.readyReject(error);
        this.rejectPending(error);
        this.emit("error", error);
        return;
      }

      const pending = this.pending.get(data.id);
      if (!pending) return;
      if (data.type === "stdout") {
        pending.output += data.text;
        pending.onOutput?.(data.text);
        this.emit("stdout", data.text, { evaluationId: data.id });
        return;
      }
      if (data.type === "stderr") {
        pending.errorOutput += data.text;
        pending.onError?.(data.text);
        this.emit("stderr", data.text, { evaluationId: data.id });
        return;
      }
      if (data.type !== "result") return;

      this.pending.delete(data.id);
      if (pending.timer) clearTimeout(pending.timer);
      if (data.ok) {
        const { saveRequests = [], ...result } = data.result;
        void (async () => {
          if (saveRequests.length && !this.onGraphicsSave) {
            throw new Error(
              "graphics file export is not available in this browser host",
            );
          }
          for (const request of saveRequests) {
            await this.onGraphicsSave(request);
          }
          return {
            ...result,
            stdout: pending.output,
            stderr: pending.errorOutput,
          };
        })().then(pending.resolve, pending.reject);
      } else {
        const error = deserializeError(data.error);
        pending.reject(error);
        this.emit("stderr", `${error.stack ?? error.message}\n`, {
          evaluationId: data.id,
        });
      }
    };

    worker.onerror = (event) => {
      if (worker !== this.worker) return;
      const error = new Error(event.message || "Sage.js kernel worker failed");
      this.readyReject(error);
      this.rejectPending(error);
      this.emit("error", error);
    };

    channel.port1.start?.();
    worker.postMessage(
      {
        type: "initialize",
        protocol: 2,
        compiler: this.resources.compiler,
        baselib: this.resources.baselib,
        standardLibrary: this.resources.standardLibrary,
        lazyModules: this.resources.lazyModules,
        dynamicPrograms: this.resources.dynamicPrograms,
        flint: this.resources.flint,
        algebraic: this.resources.algebraic,
        nativeKernels: this.resources.nativeKernels,
        m4ri: this.resources.m4ri,
        symbolic: this.resources.symbolic,
        compilerWorker: this.resources.compilerWorker,
        compilerFrontend: this.resources.compilerFrontend,
        treeSitterRuntime: this.resources.treeSitterRuntime,
        pythonGrammar: this.resources.pythonGrammar,
        sageGrammar: this.resources.sageGrammar,
        capabilityReport: this.resources.capabilityReport,
      },
      [channel.port2],
    );
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async ready() {
    if (this.closed) throw new SageSessionClosedError();
    await this.readyPromise;
    return this;
  }

  async evaluate(
    source,
    {
      filename = "<browser>",
      timeout,
      onOutput,
      onError,
    } = {},
  ) {
    if (this.closed) throw new SageSessionClosedError();
    if (typeof source !== "string") {
      throw new TypeError("Sage.js source must be a string");
    }
    if (
      timeout !== undefined &&
      (!Number.isFinite(timeout) || timeout <= 0)
    ) {
      throw new TypeError("Sage.js timeout must be a positive number");
    }
    await this.ready();
    const channel = this.channel;
    if (!channel) throw new SageSessionClosedError();
    const id = ++this.nextId;

    return new Promise((resolve, reject) => {
      const pending = {
        output: "",
        errorOutput: "",
        onOutput,
        onError,
        resolve,
        reject,
      };
      if (timeout !== undefined) {
        pending.timer = setTimeout(() => {
          if (!this.pending.has(id)) return;
          void this.replaceWorker(
            new SageSessionTimeoutError(
              `Sage.js evaluation timed out after ${timeout} ms`,
            ),
          );
        }, timeout);
      }
      this.pending.set(id, pending);
      channel.postMessage({
        type: "evaluate",
        id,
        source,
        filename,
      });
    });
  }

  eval(source, options) {
    return this.evaluate(source, options);
  }

  async replaceWorker(error) {
    if (this.closed) throw new SageSessionClosedError();
    const worker = this.worker;
    this.worker = undefined;
    const channel = this.channel;
    this.channel = undefined;
    channel?.close();
    this.prepareReadyPromise();
    this.rejectPending(error);
    worker?.terminate();
    if (this.closed) return;
    this.spawnWorker(true);
    await this.readyPromise;
  }

  interrupt() {
    return this.replaceWorker(new SageSessionInterruptedError());
  }

  reset() {
    return this.replaceWorker(
      new SageSessionInterruptedError("Sage.js session reset"),
    );
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    const error = new SageSessionClosedError();
    this.readyReject(error);
    const worker = this.worker;
    this.worker = undefined;
    const channel = this.channel;
    this.channel = undefined;
    channel?.close();
    this.rejectPending(error);
    worker?.terminate();
    this.listeners.clear();
  }
}

export async function createSage(options = {}) {
  const session = new SageSession(options);
  await session.ready();
  return session;
}

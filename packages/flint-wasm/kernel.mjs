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
    flint = new URL("./dist/flint-factor.wasm", import.meta.url),
    symbolic = new URL("./dist/symbolic-backend.mjs", import.meta.url),
    compilerWorker = new URL("./compiler-worker.mjs", import.meta.url),
  } = {}) {
    this.resources = {
      worker: String(worker),
      compiler: String(compiler),
      baselib: String(baselib),
      standardLibrary: String(standardLibrary),
      flint: String(flint),
      symbolic: String(symbolic),
      compilerWorker: String(compilerWorker),
    };
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
    this.worker = worker;

    worker.onmessage = ({ data }) => {
      if (worker !== this.worker) return;
      if (data.type === "ready") {
        if (data.protocol !== 1) {
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
      if (data.type !== "result") return;

      this.pending.delete(data.id);
      if (pending.timer) clearTimeout(pending.timer);
      if (data.ok) {
        pending.resolve({
          ...data.result,
          stdout: pending.output,
        });
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

    worker.postMessage({
      type: "initialize",
      compiler: this.resources.compiler,
      baselib: this.resources.baselib,
      standardLibrary: this.resources.standardLibrary,
      flint: this.resources.flint,
      symbolic: this.resources.symbolic,
      compilerWorker: this.resources.compilerWorker,
    });
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
    const worker = this.worker;
    if (!worker) throw new SageSessionClosedError();
    const id = ++this.nextId;

    return new Promise((resolve, reject) => {
      const pending = {
        output: "",
        onOutput,
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
      worker.postMessage({
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

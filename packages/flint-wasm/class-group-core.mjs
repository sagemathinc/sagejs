import { validateSpecialistReceipt } from "./specialist-bytes.mjs";

export const defaultClassGroupCoreArtifact = new URL(
  "./dist/class-group-core.wasm",
  import.meta.url,
);
export const defaultClassGroupCoreReceipt = new URL(
  "./dist/class-group-core-receipt.json",
  import.meta.url,
);

export class ClassGroupCoreInterruptedError extends Error {
  constructor(message = "class-group computation was interrupted") {
    super(message);
    this.name = "ClassGroupCoreInterruptedError";
  }
}

export class ClassGroupCoreClosedError extends Error {
  constructor(message = "class-group core is closed") {
    super(message);
    this.name = "ClassGroupCoreClosedError";
  }
}

function deserializeError(value) {
  const error = new Error(String(value?.message ?? "class-group worker failed"));
  error.name = String(value?.name ?? "Error");
  if (typeof value?.stack === "string") error.stack = value.stack;
  return error;
}

function abortError() {
  if (typeof DOMException === "function") {
    return new DOMException("class-group computation was aborted", "AbortError");
  }
  const error = new Error("class-group computation was aborted");
  error.name = "AbortError";
  return error;
}

function normalizedReceipt(receipt) {
  if (typeof receipt === "string" || receipt instanceof URL) {
    return String(receipt);
  }
  return validateSpecialistReceipt(receipt);
}

/**
 * Receipt-gated Rust class-group service.
 *
 * The artifact is fetched, authenticated, compiled and retained only inside a
 * dedicated worker. Until the mathematical core exposes bounded resumable
 * steps, interruption deliberately terminates that worker and all its handles.
 */
export class ClassGroupCoreService {
  constructor({
    artifact = defaultClassGroupCoreArtifact,
    receipt = defaultClassGroupCoreReceipt,
    worker = new URL("./class-group-core-worker.mjs", import.meta.url),
    WorkerConstructor = globalThis.Worker,
  }) {
    if (typeof artifact !== "string" && !(artifact instanceof URL)) {
      throw new TypeError("class-group artifact must be a URL");
    }
    if (typeof WorkerConstructor !== "function") {
      throw new TypeError("class-group core requires a Worker implementation");
    }
    this.configuration = Object.freeze({
      artifact: String(artifact),
      receipt: normalizedReceipt(receipt),
      worker: String(worker),
      WorkerConstructor,
    });
    this.pending = new Map();
    this.nextId = 0;
    this.generation = 0;
    this.closed = false;
    this.spawn();
  }

  spawn() {
    const generation = ++this.generation;
    const worker = new this.configuration.WorkerConstructor(this.configuration.worker, {
      type: "module",
    });
    this.worker = worker;
    this.workerState = "starting";
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    // A service can be closed or replaced before a caller awaits readiness.
    // Retain the rejection for callers without creating an unhandled promise.
    void this.readyPromise.catch(() => {});
    worker.onmessage = ({ data }) => {
      if (worker !== this.worker || generation !== this.generation) return;
      if (data?.type === "ready") {
        if (data.protocol !== 1) {
          this.readyReject(new Error(`unsupported class-group worker protocol ${data.protocol}`));
          return;
        }
        this.workerDiagnostics = data.diagnostics;
        this.workerState = "ready";
        this.readyResolve(this);
        return;
      }
      if (data?.type === "initialization-error") {
        const error = deserializeError(data.error);
        this.readyReject(error);
        this.rejectPending(error);
        this.workerState = "failed";
        this.worker = undefined;
        worker.terminate();
        return;
      }
      if (data?.type !== "result") return;
      const pending = this.pending.get(data.id);
      if (pending === undefined) return;
      this.pending.delete(data.id);
      pending.signal?.removeEventListener("abort", pending.onAbort);
      if (data.ok) pending.resolve(data.result);
      else pending.reject(deserializeError(data.error));
    };
    worker.onerror = (event) => {
      if (worker !== this.worker || generation !== this.generation) return;
      const error = event?.error ?? new Error(event?.message || "class-group worker failed");
      const replace = this.workerState === "ready" && !this.closed;
      this.readyReject(error);
      this.rejectPending(error);
      this.workerState = "failed";
      this.worker = undefined;
      worker.terminate();
      if (replace) this.spawn();
    };
    worker.postMessage({
      type: "initialize",
      protocol: 1,
      artifact: this.configuration.artifact,
      receipt: this.configuration.receipt,
    });
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) {
      pending.signal?.removeEventListener("abort", pending.onAbort);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async ready({ signal } = {}) {
    if (this.closed) throw new ClassGroupCoreClosedError();
    if (signal?.aborted) throw abortError();
    const generation = this.generation;
    if (signal === undefined) {
      await this.readyPromise;
    } else {
      await new Promise((resolve, reject) => {
        const onAbort = () => {
          signal.removeEventListener("abort", onAbort);
          if (!this.closed && generation === this.generation) {
            void this.replaceWorker(abortError(), false);
          }
          reject(abortError());
        };
        signal.addEventListener("abort", onAbort, { once: true });
        this.readyPromise.then(
          (value) => {
            signal.removeEventListener("abort", onAbort);
            resolve(value);
          },
          (error) => {
            signal.removeEventListener("abort", onAbort);
            reject(error);
          },
        );
      });
    }
    if (this.closed) throw new ClassGroupCoreClosedError();
    return this;
  }

  async request(type, fields, { signal } = {}) {
    if (this.closed) throw new ClassGroupCoreClosedError();
    if (signal?.aborted) throw abortError();
    await this.ready({ signal });
    if (signal?.aborted) throw abortError();
    const id = ++this.nextId;
    const generation = this.generation;
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        if (!this.pending.has(id) || generation !== this.generation) return;
        void this.replaceWorker(abortError(), false);
      };
      this.pending.set(id, { resolve, reject, signal, onAbort });
      signal?.addEventListener("abort", onAbort, { once: true });
      this.worker.postMessage({ type, id, ...fields });
    });
  }

  invoke(request, options) {
    return this.request("invoke", { request }, options);
  }

  async open(completionRequest, options) {
    const receipt = await this.invoke({
      schema: "sagejs.rust-class-group/cubic-session-open-v1",
      completionRequest,
    }, options);
    if (receipt?.outcome !== "open") return receipt;
    return new ClassGroupCoreSession(this, receipt, this.generation);
  }

  async diagnostics() {
    const current = await this.request("diagnostics", {});
    return Object.freeze({
      route: "rust-class-group-worker",
      generation: this.generation,
      artifact: {
        url: this.configuration.artifact,
        ...(this.workerDiagnostics?.artifactReceipt ??
          (typeof this.configuration.receipt === "object"
            ? this.configuration.receipt
            : { receiptUrl: this.configuration.receipt })),
      },
      ...current,
    });
  }

  async replaceWorker(error = new ClassGroupCoreInterruptedError(), waitForReady = true) {
    if (this.closed) throw new ClassGroupCoreClosedError();
    const worker = this.worker;
    this.worker = undefined;
    this.workerState = "retired";
    this.readyReject(error);
    this.rejectPending(error);
    worker?.terminate();
    this.spawn();
    if (waitForReady) await this.readyPromise;
  }

  interrupt() {
    return this.replaceWorker(new ClassGroupCoreInterruptedError(), false);
  }

  reset() {
    return this.replaceWorker(new ClassGroupCoreInterruptedError("class-group core was reset"));
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.workerState = "closed";
    const error = new ClassGroupCoreClosedError();
    this.readyReject(error);
    this.rejectPending(error);
    const worker = this.worker;
    this.worker = undefined;
    worker?.postMessage({ type: "close" });
    worker?.terminate();
  }
}

export class ClassGroupCoreSession {
  constructor(service, openReceipt, generation) {
    this.service = service;
    this.openReceipt = openReceipt;
    this.handle = openReceipt.handle;
    this.generation = generation;
    this.closed = false;
  }

  ensureLive() {
    if (this.closed) throw new ClassGroupCoreClosedError("class-group session is closed");
    if (this.generation !== this.service.generation) {
      throw new ClassGroupCoreInterruptedError("class-group session belongs to a retired worker");
    }
  }

  query(idealIntegralBasisRows, resources, options) {
    this.ensureLive();
    return this.service.invoke({
      schema: "sagejs.rust-class-group/cubic-session-query-v1",
      handle: this.handle,
      idealIntegralBasisRows,
      resources,
    }, options);
  }

  publication(options) {
    this.ensureLive();
    return this.service.invoke(
      {
        schema: "sagejs.rust-class-group/cubic-session-publication-v1",
        handle: this.handle,
      },
      options,
    );
  }

  async close(options) {
    if (this.closed) return;
    this.closed = true;
    if (this.generation !== this.service.generation || this.service.closed) return;
    const result = await this.service.invoke({
      schema: "sagejs.rust-class-group/cubic-session-close-v1",
      handle: this.handle,
    }, options);
    if (result?.outcome !== "closed") {
      throw new Error(result?.error ?? "class-group session close was rejected");
    }
  }
}

export async function createClassGroupCore(options = {}) {
  const service = new ClassGroupCoreService(options);
  try {
    await service.ready({ signal: options.signal });
    return service;
  } catch (error) {
    await service.close();
    throw error;
  }
}

import {
  MessageChannel,
  MessagePort,
  Worker as ThreadWorker,
} from "node:worker_threads";

const bootstrap = new URL("./node-worker-bootstrap.mjs", import.meta.url);

/** Browser-compatible `Worker` backed by an isolated Node worker thread. */
export class NodeWebWorker {
  constructor(url, options = {}) {
    if (options.type !== undefined && options.type !== "module") {
      throw new TypeError("the Sage.js Node Wasm host requires module workers");
    }
    this.onmessage = null;
    this.onerror = null;
    this.listeners = {
      message: new Set(),
      error: new Set(),
    };
    this.thread = new ThreadWorker(bootstrap, {
      type: "module",
      workerData: { target: String(url) },
      // The Wasm workers need no process flags. Avoid inheriting stdin-only
      // `--input-type` and test-runner flags that Node rejects for workers.
      execArgv: [],
    });
    this.thread.on("message", (data) => {
      const event = { data };
      this.onmessage?.(event);
      for (const listener of this.listeners.message) listener(event);
    });
    this.thread.on("error", (error) => {
      const event = { error, message: error.message };
      this.onerror?.(event);
      for (const listener of this.listeners.error) listener(event);
    });
  }

  addEventListener(type, listener) {
    const listeners = this.listeners[type];
    if (listeners && typeof listener === "function") listeners.add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners[type]?.delete(listener);
  }

  postMessage(data, transfer = []) {
    const ports = transfer.filter((value) => value instanceof MessagePort);
    this.thread.postMessage({ data, ports }, transfer);
  }

  terminate() {
    return this.thread.terminate();
  }
}

/** Install only the browser host primitives required by the Wasm kernel. */
export function installNodeWorkerHost() {
  globalThis.Worker = NodeWebWorker;
  globalThis.MessageChannel ??= MessageChannel;
  globalThis.MessagePort ??= MessagePort;
}

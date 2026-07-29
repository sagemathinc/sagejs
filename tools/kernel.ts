import { EventEmitter } from "events";
import { join } from "path";
import { Worker } from "worker_threads";

import { SageLanguageMode } from "./kernel-evaluator";
import {
  KernelCompletion,
  KernelCompleteness,
  KernelInspection,
} from "./kernel-evaluator";

export interface SageDisplayData {
  /** MIME type understood by an embedding renderer. */
  mime: string;
  /** Structured-clone-safe renderer payload. */
  data: unknown;
}

export interface SageEvaluationResult {
  repr: string;
  stdout: string;
  durationMs: number;
  display?: SageDisplayData;
}

export interface SageEvaluationOptions {
  filename?: string;
  timeout?: number;
  onOutput?: (text: string) => void;
}

export interface SageSessionOptions {
  mode?: SageLanguageMode;
}

interface PendingRequest {
  kind: "evaluate" | "request";
  output: string;
  onOutput?: (text: string) => void;
  resolve(result: unknown): void;
  reject(error: Error): void;
  timer?: NodeJS.Timeout;
}

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

function deserializeError(serialized): Error {
  const error = new Error(serialized.message);
  error.name = serialized.name;
  if (serialized.stack) error.stack = serialized.stack;
  return error;
}

/**
 * An interruptible, persistent Sage.js execution session.
 *
 * Every session owns a worker. Interrupt and reset replace that worker, which
 * is the only reliable way to stop arbitrary synchronous JavaScript or native
 * mathematics without compromising the embedding process.
 */
export class SageSession extends EventEmitter {
  readonly mode: SageLanguageMode;

  private worker?: Worker;
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
  private pending = new Map<number, PendingRequest>();
  private nextId = 0;
  private closed = false;

  constructor({ mode = "sage" }: SageSessionOptions = {}) {
    super();
    if (mode !== "sage" && mode !== "python") {
      throw new TypeError(`unknown Sage.js language mode ${JSON.stringify(mode)}`);
    }
    this.mode = mode;
    this.readyPromise = Promise.resolve();
    this.spawnWorker();
  }

  private prepareReadyPromise(): void {
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
  }

  private spawnWorker(readyPromisePrepared = false): void {
    if (!readyPromisePrepared) this.prepareReadyPromise();
    const worker = new Worker(join(__dirname, "kernel-worker.js"), {
      workerData: { mode: this.mode },
    });
    this.worker = worker;

    worker.on("message", (message) => {
      if (worker !== this.worker) return;
      if (message.type === "ready") {
        if (message.protocol !== 1) {
          this.readyReject(
            new Error(`unsupported Sage.js worker protocol ${message.protocol}`),
          );
          return;
        }
        this.readyResolve();
        this.emit("ready");
        return;
      }

      const pending = this.pending.get(message.id);
      if (!pending) return;
      if (message.type === "stdout") {
        pending.output += message.text;
        pending.onOutput?.(message.text);
        this.emit("stdout", message.text, { evaluationId: message.id });
        return;
      }
      if (message.type !== "result") return;

      this.pending.delete(message.id);
      if (pending.timer) clearTimeout(pending.timer);
      if (message.ok) {
        pending.resolve(
          pending.kind === "evaluate"
            ? {
                ...message.result,
                stdout: pending.output,
              }
            : message.result,
        );
      } else {
        const error = deserializeError(message.error);
        pending.reject(error);
        this.emit("stderr", `${error.stack ?? error.message}\n`, {
          evaluationId: message.id,
        });
      }
    });

    worker.on("error", (error) => {
      if (worker !== this.worker) return;
      const workerError =
        error instanceof Error ? error : new Error(String(error));
      this.readyReject(workerError);
      this.rejectPending(workerError);
      if (this.listenerCount("error")) this.emit("error", workerError);
    });

    worker.on("exit", (code) => {
      if (worker !== this.worker || this.closed) return;
      const error = new Error(
        `Sage.js kernel worker exited unexpectedly with code ${code}`,
      );
      this.readyReject(error);
      this.rejectPending(error);
      if (this.listenerCount("error")) this.emit("error", error);
    });
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async ready(): Promise<this> {
    if (this.closed) throw new SageSessionClosedError();
    await this.readyPromise;
    return this;
  }

  async evaluate(
    source: string,
    {
      filename = "<embedded>",
      timeout,
      onOutput,
    }: SageEvaluationOptions = {},
  ): Promise<SageEvaluationResult> {
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
      const pending: PendingRequest = {
        kind: "evaluate",
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

  eval(
    source: string,
    options?: SageEvaluationOptions,
  ): Promise<SageEvaluationResult> {
    return this.evaluate(source, options);
  }

  private async request<T>(
    type: "complete" | "inspect" | "isComplete",
    source: string,
    extra: Record<string, unknown> = {},
  ): Promise<T> {
    if (this.closed) throw new SageSessionClosedError();
    if (typeof source !== "string") {
      throw new TypeError("Sage.js source must be a string");
    }
    await this.ready();
    const worker = this.worker;
    if (!worker) throw new SageSessionClosedError();
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        kind: "request",
        output: "",
        resolve,
        reject,
      });
      worker.postMessage({ type, id, source, ...extra });
    });
  }

  complete(source: string, cursorPosition: number): Promise<KernelCompletion> {
    return this.request("complete", source, { cursorPosition });
  }

  inspect(source: string, cursorPosition: number): Promise<KernelInspection> {
    return this.request("inspect", source, { cursorPosition });
  }

  isComplete(source: string): Promise<KernelCompleteness> {
    return this.request("isComplete", source);
  }

  private async replaceWorker(error: Error): Promise<void> {
    if (this.closed) throw new SageSessionClosedError();
    const worker = this.worker;
    this.worker = undefined;
    // Publish the replacement's readiness before rejecting the interrupted
    // evaluation. Its caller may immediately submit another evaluation.
    this.prepareReadyPromise();
    this.rejectPending(error);
    if (worker) await worker.terminate();
    if (this.closed) return;
    this.spawnWorker(true);
    await this.readyPromise;
  }

  interrupt(): Promise<void> {
    return this.replaceWorker(new SageSessionInterruptedError());
  }

  reset(): Promise<void> {
    return this.replaceWorker(
      new SageSessionInterruptedError("Sage.js session reset"),
    );
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const error = new SageSessionClosedError();
    this.readyReject(error);
    const worker = this.worker;
    this.worker = undefined;
    this.rejectPending(error);
    if (worker) await worker.terminate();
    this.removeAllListeners();
  }
}

export async function createSage(
  options: SageSessionOptions = {},
): Promise<SageSession> {
  const session = new SageSession(options);
  await session.ready();
  return session;
}

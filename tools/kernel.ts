import { EventEmitter } from "events";
import { join } from "path";
import { Worker } from "worker_threads";

import {
  createForeignFrontend,
  ForeignFrontend,
  ForeignLanguage,
  isForeignSyntaxError,
} from "./foreign";
import { SageLanguageMode } from "./kernel-evaluator";
import {
  KernelCompletion,
  KernelCompleteness,
  KernelInspection,
  SageOptimizationReport,
} from "./kernel-evaluator";
import {
  isSageSourceLanguage,
  SageSourceLanguage,
} from "./polyglot";
import { DocumentationCatalog } from "./documentation";
import { kernelWorkerPath } from "./resources";

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
  /** Compiler-verified static optimizer decisions for this evaluation. */
  optimization: SageOptimizationReport;
}

export interface SageEvaluationOptions {
  filename?: string;
  timeout?: number;
  onOutput?: (text: string) => void;
  /** Parse this evaluation using a supported Sage.js language frontend. */
  language?: SageSourceLanguage;
}

export interface SageSessionOptions {
  mode?: SageLanguageMode;
}

export interface SageLanguageOptions {
  language?: SageSourceLanguage;
}

interface PendingRequest {
  kind: "evaluate" | "request";
  output: string;
  onOutput?: (text: string) => void;
  resolve(result: unknown): void;
  reject(error: Error): void;
  settled: Promise<void>;
  settle(): void;
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
  if (serialized.name === "KeyboardInterrupt") {
    const interrupted = new SageSessionInterruptedError(
      serialized.message || undefined,
    );
    if (serialized.stack) interrupted.stack = serialized.stack;
    return interrupted;
  }
  const error = new Error(serialized.message);
  error.name = serialized.name;
  if (serialized.stack) error.stack = serialized.stack;
  return error;
}

/**
 * An interruptible, persistent Sage.js execution session.
 *
 * Every session owns a worker. Node's VM interrupt bridge and blocking waits
 * preserve session state on normal interruption. Uncooperative native code
 * falls back to replacing the worker.
 */
export class SageSession extends EventEmitter {
  readonly mode: SageLanguageMode;

  private worker?: Worker;
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
  private pending = new Map<number, PendingRequest>();
  private interruptState?: Int32Array;
  private interruptPromise?: Promise<void>;
  private readonly foreignFrontends = new Map<
    ForeignLanguage,
    Promise<ForeignFrontend>
  >();
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
    const interruptState = new Int32Array(
      new SharedArrayBuffer(2 * Int32Array.BYTES_PER_ELEMENT),
    );
    this.interruptState = interruptState;
    const worker = new Worker(
      kernelWorkerPath(join(__dirname, "kernel-worker.js")),
      {
        workerData: {
          mode: this.mode,
          interruptBuffer: interruptState.buffer,
        },
      },
    );
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
      if (message.type === "startup-error") {
        this.readyReject(deserializeError(message.error));
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
      pending.settle();
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
      pending.settle();
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
      language = this.mode,
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
    const prepared = await this.prepareEvaluation(
      source,
      filename,
      language,
    );
    await this.ready();
    const worker = this.worker;
    if (!worker) throw new SageSessionClosedError();
    const id = ++this.nextId;

    return new Promise((resolve, reject) => {
      let settle!: () => void;
      const settled = new Promise<void>((done) => {
        settle = done;
      });
      const pending: PendingRequest = {
        kind: "evaluate",
        output: "",
        onOutput,
        resolve,
        reject,
        settled,
        settle,
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
        source: prepared.source,
        filename,
        language: prepared.compilerLanguage,
        suppressResult: prepared.suppressResult,
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
    type: "complete" | "inspect" | "isComplete" | "documentation",
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
      let settle!: () => void;
      const settled = new Promise<void>((done) => {
        settle = done;
      });
      this.pending.set(id, {
        kind: "request",
        output: "",
        resolve,
        reject,
        settled,
        settle,
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

  /**
   * Return the installed API as structured Sage.js DocSpec v1 records.
   *
   * Mathematical objects remain isolated in the worker; only serializable
   * documentation records cross this boundary.
   */
  documentation(): Promise<DocumentationCatalog> {
    return this.request("documentation", "");
  }

  async isComplete(
    source: string,
    { language = this.mode }: SageLanguageOptions = {},
  ): Promise<KernelCompleteness> {
    if (!isSageSourceLanguage(language)) {
      throw new TypeError(
        `unknown Sage.js source language ${JSON.stringify(language)}`,
      );
    }
    if (language === "sage" || language === "python") {
      return this.request("isComplete", source, { language });
    }
    try {
      const frontend = await this.foreignFrontend(language);
      frontend.parse(source);
      return { status: "complete" };
    } catch (error) {
      if (!isForeignSyntaxError(error)) throw error;
      return {
        status: error.incomplete ? "incomplete" : "invalid",
      };
    }
  }

  private foreignFrontend(
    language: ForeignLanguage,
  ): Promise<ForeignFrontend> {
    let frontend = this.foreignFrontends.get(language);
    if (!frontend) {
      frontend = createForeignFrontend(language);
      this.foreignFrontends.set(language, frontend);
    }
    return frontend;
  }

  private async prepareEvaluation(
    source: string,
    filename: string,
    language: SageSourceLanguage,
  ): Promise<{
    source: string;
    compilerLanguage: SageLanguageMode;
    suppressResult: boolean;
  }> {
    if (!isSageSourceLanguage(language)) {
      throw new TypeError(
        `unknown Sage.js source language ${JSON.stringify(language)}`,
      );
    }
    if (language === "sage" || language === "python") {
      return {
        source,
        compilerLanguage: language,
        suppressResult: false,
      };
    }
    const frontend = await this.foreignFrontend(language);
    const lowering = frontend.lower(source, {
      filename,
      captureResult: true,
    });
    return {
      source: lowering.source,
      compilerLanguage: "sage",
      suppressResult: !lowering.hasResult,
    };
  }

  private async replaceWorker(error: Error): Promise<void> {
    if (this.closed) throw new SageSessionClosedError();
    const worker = this.worker;
    this.worker = undefined;
    this.interruptState = undefined;
    // Publish the replacement's readiness before rejecting the interrupted
    // evaluation. Its caller may immediately submit another evaluation.
    this.prepareReadyPromise();
    this.rejectPending(error);
    if (worker) await worker.terminate();
    if (this.closed) return;
    this.spawnWorker(true);
    await this.readyPromise;
  }

  private async performInterrupt(): Promise<void> {
    if (this.closed) throw new SageSessionClosedError();
    await this.ready();
    const active = [...this.pending.entries()].filter(
      ([, pending]) => pending.kind === "evaluate",
    );
    const state = this.interruptState;
    if (!state || active.length === 0) {
      if (state) Atomics.store(state, 0, 0);
      return;
    }

    Atomics.store(state, 0, 1);
    Atomics.notify(state, 0);

    const cooperative = Promise.all(
      active.map(([, pending]) => pending.settled),
    ).then(() => true);
    const waitForSettlement = async (milliseconds: number): Promise<boolean> => {
      let timer: NodeJS.Timeout | undefined;
      const graceExpired = new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), milliseconds);
      });
      const settled = await Promise.race([cooperative, graceExpired]);
      if (timer) clearTimeout(timer);
      return settled;
    };

    // Give interrupt-aware waits and loops inside a Python try/except a brief
    // opportunity to raise a catchable KeyboardInterrupt.
    if (await waitForSettlement(25)) return;
    if (Atomics.load(state, 0) === 0) return;

    // runInThisContext({ breakOnSigint: true }) turns SIGINT into an
    // exception in the worker currently evaluating Python. If the worker is
    // still compiling, it observes the shared request before entering the VM.
    // Windows cannot deliver a POSIX SIGINT to one worker thread. Calling
    // process.kill(process.pid, "SIGINT") there terminates the process group,
    // including an embedding application or the Node test runner. Cooperative
    // loops and waits have already observed the shared request above; send the
    // VM signal only on POSIX, then use worker replacement as the portable
    // fallback for an uncooperative evaluation.
    if (process.platform !== "win32" && Atomics.load(state, 1) !== 0) {
      process.kill(process.pid, "SIGINT");
    }
    if (await waitForSettlement(225)) return;

    const stillActive = active.some(
      ([id, pending]) => this.pending.get(id) === pending,
    );
    if (stillActive) {
      await this.replaceWorker(new SageSessionInterruptedError());
    }
  }

  interrupt(): Promise<void> {
    if (this.interruptPromise) return this.interruptPromise;
    this.interruptPromise = this.performInterrupt().finally(() => {
      this.interruptPromise = undefined;
    });
    return this.interruptPromise;
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
    this.interruptState = undefined;
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

import { join } from "node:path";
import { Worker, type WorkerOptions } from "node:worker_threads";
import {
  GRAPHICS_EXPORT_LIMITS,
  GraphicsExportError,
} from "./graphics-export-contract";

export const PLOTLY_RENDERER_HEADER_INTS = 4;
export const PLOTLY_RENDERER_HEADER_BYTES =
  PLOTLY_RENDERER_HEADER_INTS * Int32Array.BYTES_PER_ELEMENT;
export const PLOTLY_RENDERER_STATE_WAITING = 0;
export const PLOTLY_RENDERER_STATE_SUCCESS = 1;
export const PLOTLY_RENDERER_STATE_ERROR = 2;
export const PLOTLY_RENDERER_ERROR_NONE = 0;
export const PLOTLY_RENDERER_ERROR_LIMIT = 1;
export const PLOTLY_RENDERER_ERROR_TIMEOUT = 2;
export const PLOTLY_RENDERER_ERROR_CRASH = 3;
export const PLOTLY_RENDERER_ERROR_RENDER = 4;

/** Write a response without ever exceeding the fixed shared-memory channel. */
export function writePlotlyRendererResponse(
  shared: SharedArrayBuffer,
  maxOutputBytes: number,
  requestId: number,
  state: typeof PLOTLY_RENDERER_STATE_SUCCESS | typeof PLOTLY_RENDERER_STATE_ERROR,
  payload: Uint8Array,
  errorKind = PLOTLY_RENDERER_ERROR_NONE,
): void {
  const control = new Int32Array(
    shared,
    0,
    PLOTLY_RENDERER_HEADER_INTS,
  );
  const output = new Uint8Array(
    shared,
    PLOTLY_RENDERER_HEADER_BYTES,
    maxOutputBytes,
  );
  let response = payload;
  let responseState = state;
  let responseErrorKind = errorKind;
  if (payload.byteLength > maxOutputBytes) {
    response = new Uint8Array(0);
    if (state === PLOTLY_RENDERER_STATE_SUCCESS) {
      responseState = PLOTLY_RENDERER_STATE_ERROR;
      responseErrorKind = PLOTLY_RENDERER_ERROR_LIMIT;
    }
  }
  output.set(response);
  Atomics.store(control, 1, response.byteLength);
  Atomics.store(control, 2, requestId);
  Atomics.store(control, 3, responseErrorKind);
  Atomics.store(control, 0, responseState);
  Atomics.notify(control, 0, 1);
}

export interface PlotlyRendererWorkerLike {
  postMessage(value: unknown): void;
  terminate(): Promise<number> | number;
  unref?(): void;
}

export type PlotlyRendererWorkerFactory = (
  filename: string,
  options: WorkerOptions,
) => PlotlyRendererWorkerLike;

export interface SynchronousPlotlyRendererOptions {
  executablePath: string;
  workerPath?: string;
  plotlyPath?: string;
  timeoutMs?: number;
  shutdownTimeoutMs?: number;
  idleTimeoutMs?: number;
  maxJobsPerBrowser?: number;
  maxRequestBytes?: number;
  maxOutputBytes?: number;
  createWorker?: PlotlyRendererWorkerFactory;
}

export interface PlotlyRendererStats {
  workers_created: number;
  render_requests: number;
  renderer_restarts: number;
}

interface RendererErrorPayload {
  code?: string;
  message?: string;
  retryable?: boolean;
}

class RendererCrashError extends Error {}

function graphicsError(
  code:
    | "SAGEJS_GRAPHICS_EXPORT_LIMIT"
    | "SAGEJS_GRAPHICS_EXPORT_TIMEOUT"
    | "SAGEJS_GRAPHICS_RENDER_FAILED",
  message: string,
  cause?: unknown,
): GraphicsExportError {
  return new GraphicsExportError(code, message, {
    alternatives: ["html", "json"],
    cause,
  });
}

/**
 * Synchronous facade over a single persistent renderer worker.
 *
 * The worker is lazy and owns Chromium. A fixed SharedArrayBuffer carries one
 * bounded response at a time, preserving the synchronous `Graphics.save()`
 * boundary without spawning a browser per image. A hard worker/native exit
 * cannot run a main-thread `exit` callback while this thread is in
 * `Atomics.wait`; that case intentionally becomes the bounded timeout path.
 */
export class SynchronousPlotlyRenderer {
  readonly #options: Required<
    Pick<
      SynchronousPlotlyRendererOptions,
      | "timeoutMs"
      | "shutdownTimeoutMs"
      | "idleTimeoutMs"
      | "maxJobsPerBrowser"
      | "maxRequestBytes"
      | "maxOutputBytes"
    >
  > &
    SynchronousPlotlyRendererOptions;
  #worker: PlotlyRendererWorkerLike | undefined;
  #shared: SharedArrayBuffer | undefined;
  #control: Int32Array | undefined;
  #bytes: Uint8Array | undefined;
  #busy = false;
  #disposed = false;
  #nextRequestId = 1;
  #workersCreated = 0;
  #renderRequests = 0;
  #rendererRestarts = 0;

  constructor(options: SynchronousPlotlyRendererOptions) {
    this.#options = {
      ...options,
      timeoutMs: options.timeoutMs ?? GRAPHICS_EXPORT_LIMITS.timeout_ms,
      shutdownTimeoutMs: options.shutdownTimeoutMs ?? 2_000,
      idleTimeoutMs: options.idleTimeoutMs ?? 60_000,
      maxJobsPerBrowser: options.maxJobsPerBrowser ?? 100,
      maxRequestBytes:
        options.maxRequestBytes ?? GRAPHICS_EXPORT_LIMITS.max_request_bytes,
      maxOutputBytes:
        options.maxOutputBytes ?? GRAPHICS_EXPORT_LIMITS.max_output_bytes,
    };
  }

  stats(): PlotlyRendererStats {
    return {
      workers_created: this.#workersCreated,
      render_requests: this.#renderRequests,
      renderer_restarts: this.#rendererRestarts,
    };
  }

  render(request: string): Buffer {
    if (this.#disposed) {
      throw graphicsError(
        "SAGEJS_GRAPHICS_RENDER_FAILED",
        "The static graphics renderer has been disposed. Install a new Node graphics save hook before exporting another image.",
      );
    }
    if (this.#busy) {
      throw graphicsError(
        "SAGEJS_GRAPHICS_RENDER_FAILED",
        "The static graphics renderer is busy with another synchronous export; wait for that export to finish or use a separate process.",
      );
    }
    const requestBytes = Buffer.byteLength(request);
    if (requestBytes > this.#options.maxRequestBytes) {
      throw graphicsError(
        "SAGEJS_GRAPHICS_EXPORT_LIMIT",
        `The serialized plot requires ${requestBytes} bytes, exceeding the static-export limit of ${this.#options.maxRequestBytes}; reduce the plotted data or save as HTML or JSON.`,
      );
    }

    this.#busy = true;
    this.#renderRequests += 1;
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return this.#renderAttempt(request);
        } catch (error) {
          if (!(error instanceof RendererCrashError)) throw error;
          this.#destroyWorker();
          if (attempt === 0) {
            this.#rendererRestarts += 1;
            continue;
          }
          throw graphicsError(
            "SAGEJS_GRAPHICS_RENDER_FAILED",
            "The Chromium graphics renderer crashed twice while producing this image. Save as HTML or JSON, or restart the process after verifying the configured browser.",
            error,
          );
        }
      }
      throw new Error("unreachable renderer retry state");
    } finally {
      this.#busy = false;
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (!this.#worker || !this.#control) {
      this.#destroyWorker();
      return;
    }
    const requestId = this.#prepareRequest();
    try {
      this.#worker.postMessage({ type: "dispose", requestId });
      Atomics.wait(
        this.#control,
        0,
        PLOTLY_RENDERER_STATE_WAITING,
        this.#options.shutdownTimeoutMs,
      );
    } catch {
      // Termination below is the bounded fallback when graceful close fails.
    }
    this.#destroyWorker();
  }

  terminateNow(): void {
    this.#disposed = true;
    this.#destroyWorker();
  }

  #renderAttempt(request: string): Buffer {
    this.#ensureWorker();
    const requestId = this.#prepareRequest();
    try {
      this.#worker!.postMessage({ type: "render", requestId, request });
    } catch (error) {
      throw new RendererCrashError(`renderer worker rejected the job: ${error}`);
    }
    const wait = Atomics.wait(
      this.#control!,
      0,
      PLOTLY_RENDERER_STATE_WAITING,
      this.#options.timeoutMs,
    );
    if (wait === "timed-out") {
      // This also covers a hard worker/native exit. Retrying an event that is
      // indistinguishable from a render timeout would double the 30 s bound.
      this.#destroyWorker();
      throw graphicsError(
        "SAGEJS_GRAPHICS_EXPORT_TIMEOUT",
        `Static image export exceeded the ${this.#options.timeoutMs} ms renderer limit; reduce the plot size or save as HTML or JSON.`,
      );
    }
    if (Atomics.load(this.#control!, 2) !== requestId) {
      throw new RendererCrashError("renderer returned a mismatched request id");
    }
    const state = Atomics.load(this.#control!, 0);
    const length = Atomics.load(this.#control!, 1);
    const errorKind = Atomics.load(this.#control!, 3);
    if (length < 0 || length > this.#options.maxOutputBytes) {
      throw graphicsError(
        "SAGEJS_GRAPHICS_EXPORT_LIMIT",
        `Static image output exceeded the ${this.#options.maxOutputBytes}-byte renderer limit; reduce dimensions or scale, or save as HTML or JSON.`,
      );
    }
    const output = Buffer.from(this.#bytes!.subarray(0, length));
    if (state === PLOTLY_RENDERER_STATE_SUCCESS) return output;
    if (state !== PLOTLY_RENDERER_STATE_ERROR) {
      throw new RendererCrashError(`renderer returned invalid state ${state}`);
    }
    let payload: RendererErrorPayload = {};
    if (output.length) {
      try {
        payload = JSON.parse(output.toString("utf8"));
      } catch {
        throw new RendererCrashError("renderer returned an invalid error response");
      }
    }
    if (errorKind === PLOTLY_RENDERER_ERROR_CRASH || payload.retryable) {
      throw new RendererCrashError(payload.message ?? "renderer crashed");
    }
    const code = payload.code;
    if (
      errorKind === PLOTLY_RENDERER_ERROR_TIMEOUT ||
      code === "SAGEJS_GRAPHICS_EXPORT_TIMEOUT"
    ) {
      throw graphicsError(
        "SAGEJS_GRAPHICS_EXPORT_TIMEOUT",
        payload.message ?? "Static image export timed out.",
      );
    }
    if (
      errorKind === PLOTLY_RENDERER_ERROR_LIMIT ||
      code === "SAGEJS_GRAPHICS_EXPORT_LIMIT"
    ) {
      throw graphicsError(
        "SAGEJS_GRAPHICS_EXPORT_LIMIT",
        payload.message ?? "Static image output exceeded its resource limit.",
      );
    }
    throw graphicsError(
      "SAGEJS_GRAPHICS_RENDER_FAILED",
      payload.message ?? "Static image rendering failed.",
    );
  }

  #ensureWorker(): void {
    if (this.#worker) return;
    this.#shared = new SharedArrayBuffer(
      PLOTLY_RENDERER_HEADER_BYTES + this.#options.maxOutputBytes,
    );
    this.#control = new Int32Array(
      this.#shared,
      0,
      PLOTLY_RENDERER_HEADER_INTS,
    );
    this.#bytes = new Uint8Array(
      this.#shared,
      PLOTLY_RENDERER_HEADER_BYTES,
      this.#options.maxOutputBytes,
    );
    const createWorker =
      this.#options.createWorker ??
      ((filename: string, options: WorkerOptions) =>
        new Worker(filename, options));
    this.#worker = createWorker(
      this.#options.workerPath ??
        join(__dirname, "plotly-renderer-worker.js"),
      {
        workerData: {
          shared: this.#shared,
          executablePath: this.#options.executablePath,
          plotlyPath:
            this.#options.plotlyPath ??
            require.resolve("plotly.js-dist-min/plotly.min.js"),
          timeoutMs: this.#options.timeoutMs,
          idleTimeoutMs: this.#options.idleTimeoutMs,
          maxJobsPerBrowser: this.#options.maxJobsPerBrowser,
          maxRequestBytes: this.#options.maxRequestBytes,
          maxOutputBytes: this.#options.maxOutputBytes,
        },
      },
    );
    this.#worker.unref?.();
    this.#workersCreated += 1;
  }

  #prepareRequest(): number {
    const requestId = this.#nextRequestId;
    this.#nextRequestId =
      this.#nextRequestId >= 0x7fff_ffff ? 1 : this.#nextRequestId + 1;
    this.#control!.fill(0);
    Atomics.store(this.#control!, 2, requestId);
    return requestId;
  }

  #destroyWorker(): void {
    const worker = this.#worker;
    this.#worker = undefined;
    this.#shared = undefined;
    this.#control = undefined;
    this.#bytes = undefined;
    if (!worker) return;
    try {
      void worker.terminate();
    } catch {
      // Worker termination is best effort during timeout/crash/process exit.
    }
  }
}

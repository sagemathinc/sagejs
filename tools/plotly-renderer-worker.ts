import { parentPort, workerData } from "node:worker_threads";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import {
  PLOTLY_RENDERER_ERROR_CRASH,
  PLOTLY_RENDERER_ERROR_LIMIT,
  PLOTLY_RENDERER_ERROR_RENDER,
  PLOTLY_RENDERER_ERROR_TIMEOUT,
  PLOTLY_RENDERER_STATE_ERROR,
  PLOTLY_RENDERER_STATE_SUCCESS,
  writePlotlyRendererResponse,
} from "./plotly-renderer-client";

interface WorkerConfiguration {
  shared: SharedArrayBuffer;
  executablePath: string;
  plotlyPath: string;
  timeoutMs: number;
  idleTimeoutMs: number;
  maxJobsPerBrowser: number;
  maxRequestBytes: number;
  maxOutputBytes: number;
}

interface RenderRequest {
  figure: {
    data?: unknown[];
    layout?: Record<string, unknown>;
    config?: Record<string, unknown>;
    frames?: unknown[];
  };
  options: {
    format: "png" | "jpeg" | "webp" | "svg";
    width: number;
    height: number;
    scale: number;
  };
}

interface WorkerMessage {
  type: "render" | "dispose";
  requestId: number;
  request?: string;
}

const configuration = workerData as WorkerConfiguration;
let browser: Browser | undefined;
let context: BrowserContext | undefined;
let page: Page | undefined;
let jobsSinceLaunch = 0;
let idleTimer: NodeJS.Timeout | undefined;
let currentRequestId = 0;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rendererCrashed(error: unknown): boolean {
  return /browser.*(closed|disconnect)|target.*closed|page.*closed|context.*closed|crash/i.test(
    errorMessage(error),
  );
}

function respondError(
  requestId: number,
  code: string,
  message: string,
  retryable = false,
): void {
  const errorKind = retryable
    ? PLOTLY_RENDERER_ERROR_CRASH
    : code === "SAGEJS_GRAPHICS_EXPORT_LIMIT"
      ? PLOTLY_RENDERER_ERROR_LIMIT
      : code === "SAGEJS_GRAPHICS_EXPORT_TIMEOUT"
        ? PLOTLY_RENDERER_ERROR_TIMEOUT
        : PLOTLY_RENDERER_ERROR_RENDER;
  writePlotlyRendererResponse(
    configuration.shared,
    configuration.maxOutputBytes,
    requestId,
    PLOTLY_RENDERER_STATE_ERROR,
    Buffer.from(JSON.stringify({ code, message, retryable })),
    errorKind,
  );
}

function decodeDataUrl(value: string): Buffer {
  const comma = value.indexOf(",");
  if (comma < 0 || !value.startsWith("data:")) {
    throw new Error("Plotly returned an invalid image data URL");
  }
  const metadata = value.slice(0, comma);
  const data = value.slice(comma + 1);
  const isHex = (code: number): boolean =>
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 70) ||
    (code >= 97 && code <= 102);
  let urlDecodedBytes = 0;
  if (!metadata.endsWith(";base64")) {
    for (let index = 0; index < data.length; index += 1) {
      if (
        data[index] === "%" &&
        isHex(data.charCodeAt(index + 1)) &&
        isHex(data.charCodeAt(index + 2))
      ) {
        urlDecodedBytes += 1;
        index += 2;
      } else {
        const codePoint = data.codePointAt(index)!;
        urlDecodedBytes += Buffer.byteLength(String.fromCodePoint(codePoint));
        if (codePoint > 0xffff) index += 1;
      }
      if (urlDecodedBytes > configuration.maxOutputBytes) break;
    }
  }
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  const estimatedBytes = metadata.endsWith(";base64")
    ? Math.floor(data.length / 4) * 3 - padding
    : urlDecodedBytes;
  if (estimatedBytes > configuration.maxOutputBytes) {
    const error = new Error(
      `Static image output exceeded the ${configuration.maxOutputBytes}-byte renderer limit; reduce dimensions or scale, or save as HTML or JSON.`,
    );
    Reflect.set(error, "code", "SAGEJS_GRAPHICS_EXPORT_LIMIT");
    throw error;
  }
  const decoded = metadata.endsWith(";base64")
    ? Buffer.from(data, "base64")
    : Buffer.from(decodeURIComponent(data), "utf8");
  if (decoded.byteLength > configuration.maxOutputBytes) {
    const error = new Error(
      `Static image output exceeded the ${configuration.maxOutputBytes}-byte renderer limit; reduce dimensions or scale, or save as HTML or JSON.`,
    );
    Reflect.set(error, "code", "SAGEJS_GRAPHICS_EXPORT_LIMIT");
    throw error;
  }
  return decoded;
}

async function closeRenderer(): Promise<void> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = undefined;
  }
  const activeBrowser = browser;
  browser = undefined;
  context = undefined;
  page = undefined;
  jobsSinceLaunch = 0;
  if (activeBrowser) {
    try {
      await activeBrowser.close();
    } catch {
      // A crashed browser is already closed from Playwright's perspective.
    }
  }
}

function armIdleShutdown(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = undefined;
    void closeRenderer();
  }, configuration.idleTimeoutMs);
  idleTimer.unref();
}

async function ensureRenderer(): Promise<Page> {
  if (browser?.isConnected() && page && !page.isClosed()) return page;
  await closeRenderer();
  browser = await chromium.launch({
    executablePath: configuration.executablePath,
    headless: true,
  });
  context = await browser.newContext();
  // Static export is deliberately offline. Plotly is injected from the local
  // package, and every attempted page request is rejected.
  await context.route("**/*", (route) => route.abort("blockedbyclient"));
  page = await context.newPage();
  await page.setContent(
    '<!doctype html><html><body style="margin:0"><div id="plot"></div></body></html>',
  );
  await page.addScriptTag({ path: configuration.plotlyPath });
  jobsSinceLaunch = 0;
  return page;
}

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(
        `Static image export exceeded the ${configuration.timeoutMs} ms renderer limit; reduce the plot size or save as HTML or JSON.`,
      );
      Reflect.set(error, "code", "SAGEJS_GRAPHICS_EXPORT_TIMEOUT");
      reject(error);
    }, configuration.timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function render(requestText: string): Promise<Buffer> {
  if (Buffer.byteLength(requestText) > configuration.maxRequestBytes) {
    const error = new Error(
      `The serialized plot exceeds the ${configuration.maxRequestBytes}-byte renderer limit; reduce the plotted data or save as HTML or JSON.`,
    );
    Reflect.set(error, "code", "SAGEJS_GRAPHICS_EXPORT_LIMIT");
    throw error;
  }
  const request = JSON.parse(requestText) as RenderRequest;
  const activePage = await ensureRenderer();
  await activePage.setViewportSize({
    width: Math.max(1, Math.ceil(request.options.width)),
    height: Math.max(1, Math.ceil(request.options.height)),
  });
  const dataUrl = await withTimeout(
    activePage.evaluate(
      async ({ figure, options }) => {
        const plotly = Reflect.get(globalThis, "Plotly");
        const element = document.getElementById("plot");
        plotly.purge(element);
        element.replaceChildren();
        await plotly.newPlot(
          element,
          figure.data ?? [],
          figure.layout ?? {},
          figure.config ?? {},
        );
        if (
          Array.isArray(figure.frames) &&
          figure.frames.length > 0 &&
          typeof plotly.addFrames === "function"
        ) {
          await plotly.addFrames(element, figure.frames);
        }
        return plotly.toImage(element, options);
      },
      request,
    ),
  );
  jobsSinceLaunch += 1;
  return decodeDataUrl(dataUrl);
}

async function handleMessage(message: WorkerMessage): Promise<void> {
  currentRequestId = message.requestId;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = undefined;
  }
  if (message.type === "dispose") {
    await closeRenderer();
    writePlotlyRendererResponse(
      configuration.shared,
      configuration.maxOutputBytes,
      message.requestId,
      PLOTLY_RENDERER_STATE_SUCCESS,
      Buffer.alloc(0),
    );
    parentPort?.close();
    return;
  }
  try {
    const bytes = await render(message.request ?? "");
    writePlotlyRendererResponse(
      configuration.shared,
      configuration.maxOutputBytes,
      message.requestId,
      PLOTLY_RENDERER_STATE_SUCCESS,
      bytes,
    );
    if (jobsSinceLaunch >= configuration.maxJobsPerBrowser) {
      await closeRenderer();
    } else {
      armIdleShutdown();
    }
  } catch (error) {
    const code = Reflect.get(Object(error), "code");
    const retryable = rendererCrashed(error);
    if (retryable || code === "SAGEJS_GRAPHICS_EXPORT_TIMEOUT") {
      await closeRenderer();
    }
    respondError(
      message.requestId,
      typeof code === "string" ? code : "SAGEJS_GRAPHICS_RENDER_FAILED",
      errorMessage(error),
      retryable,
    );
  } finally {
    currentRequestId = 0;
  }
}

if (!parentPort) throw new Error("Plotly renderer must run in a worker thread");
let messageQueue = Promise.resolve();
parentPort.on("message", (message: WorkerMessage) => {
  messageQueue = messageQueue.then(() => handleMessage(message));
});

process.on("uncaughtException", (error) => {
  if (currentRequestId) {
    respondError(
      currentRequestId,
      "SAGEJS_GRAPHICS_RENDER_FAILED",
      `Chromium renderer worker crashed: ${errorMessage(error)}`,
      true,
    );
  }
  process.exitCode = 1;
});

process.on("unhandledRejection", (error) => {
  if (currentRequestId) {
    respondError(
      currentRequestId,
      "SAGEJS_GRAPHICS_RENDER_FAILED",
      `Chromium renderer worker crashed: ${errorMessage(error)}`,
      true,
    );
  }
  process.exitCode = 1;
});

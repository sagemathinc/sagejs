import { loadSageRuntime, loadWidgetRuntime } from "./runtime-api.mjs";
import { createWidgetHost } from "./widget-manager.mjs";

function controllerEvent(type, detail) {
  const event = new Event(type);
  Object.defineProperty(event, "detail", { value: detail });
  return event;
}

function positiveTimeout(value) {
  if (value === undefined) return undefined;
  const timeout = Number(value);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new TypeError("Sage.js cell timeout must be a positive number");
  }
  return timeout;
}

/**
 * Transport- and DOM-neutral owner for one local Sage.js kernel session.
 *
 * The standalone app, custom element, and ESM embedding API share this
 * controller. Presentation code supplies only the rich-output renderer used
 * inside standard ipywidgets `Output` views.
 */
export class SageCellController extends EventTarget {
  constructor({
    loadRuntime = loadSageRuntime,
    loadWidgets = loadWidgetRuntime,
    renderWidgetOutput = async () => undefined,
    onGraphicsSave,
    sessionOptions = {},
  } = {}) {
    super();
    if (typeof loadRuntime !== "function" || typeof loadWidgets !== "function") {
      throw new TypeError("Sage.js cell runtime loaders must be functions");
    }
    if (typeof renderWidgetOutput !== "function") {
      throw new TypeError("Sage.js cell widget output renderer must be a function");
    }
    if (
      sessionOptions === null ||
      typeof sessionOptions !== "object" ||
      Array.isArray(sessionOptions)
    ) {
      throw new TypeError("Sage.js cell session options must be an object");
    }
    this.loadRuntime = loadRuntime;
    this.loadWidgets = loadWidgets;
    this.renderWidgetOutput = renderWidgetOutput;
    this.onGraphicsSave = onGraphicsSave;
    this.sessionOptions = { ...sessionOptions };
    this.status = "new";
    this.runtime = undefined;
    this.session = undefined;
    this.widgetHost = undefined;
    this.readyPromise = undefined;
    this.activeRun = undefined;
  }

  emit(type, detail = {}) {
    this.dispatchEvent(controllerEvent(type, Object.freeze({
      controller: this,
      ...detail,
    })));
  }

  assertLive() {
    if (this.status === "disposed") {
      throw new Error("Sage.js cell controller is disposed");
    }
  }

  ready() {
    this.assertLive();
    this.readyPromise ??= (async () => {
      this.status = "loading";
      this.runtime = await this.loadRuntime();
      this.session = await this.runtime.createSage({
        ...this.sessionOptions,
        onGraphicsSave: this.onGraphicsSave,
      });
      this.widgetHost = createWidgetHost({
        session: this.session,
        loadManager: this.loadWidgets,
        renderOutput: this.renderWidgetOutput,
      });
      this.session.on("error", (error) => {
        this.widgetHost?.reset();
        this.emit("error", { error, phase: "worker" });
      });
      this.status = "ready";
      this.emit("capability", {
        capabilities: Object.freeze({
          crossOriginIsolated: Boolean(globalThis.crossOriginIsolated),
          interruption: "worker-replacement",
          localExecution: true,
        }),
      });
      this.emit("ready", { runtime: this.runtime });
      this.emit("idle");
      return this;
    })().catch((error) => {
      this.status = "error";
      this.emit("error", { error, phase: "initialization" });
      throw error;
    });
    return this.readyPromise;
  }

  async run(source, {
    filename = "<sagejs-cell>",
    timeout,
    onOutput,
    onEvent,
    onComm,
  } = {}) {
    this.assertLive();
    if (typeof source !== "string") {
      throw new TypeError("Sage.js cell source must be a string");
    }
    if (this.activeRun) {
      throw new Error("Sage.js cell is already running");
    }
    await this.ready();
    this.status = "busy";
    const run = { source, filename, startedAt: performance.now() };
    this.activeRun = run;
    this.emit("busy", { source, filename });
    try {
      const result = await this.session.evaluate(source, {
        filename,
        timeout: positiveTimeout(timeout),
        onOutput: (text) => {
          onOutput?.(text);
          this.emit("output", { kind: "stream", text });
        },
        onEvent: (event) => {
          onEvent?.(event);
          this.emit("output", { kind: "event", event });
        },
        onComm,
      });
      this.emit("result", {
        result,
        durationMs: performance.now() - run.startedAt,
      });
      return result;
    } catch (error) {
      this.emit("error", { error, phase: "evaluation" });
      throw error;
    } finally {
      this.activeRun = undefined;
      if (this.status !== "disposed") {
        this.status = "ready";
        this.emit("idle");
      }
    }
  }

  captureWidgetOutput(event) {
    return this.widgetHost?.captureOutput(event) ?? false;
  }

  isWidgetDisplay(data) {
    return this.widgetHost?.isWidgetDisplay(data) ?? false;
  }

  async renderWidget(data, destination) {
    await this.ready();
    return this.widgetHost.render(data, destination);
  }

  async interrupt() {
    this.assertLive();
    await this.ready();
    this.widgetHost.reset();
    await this.session.interrupt();
    this.status = "ready";
    this.emit("reset", { reason: "interrupt" });
    this.emit("idle");
  }

  async reset() {
    this.assertLive();
    await this.ready();
    this.widgetHost.reset();
    await this.session.reset();
    this.status = "ready";
    this.emit("reset", { reason: "reset" });
    this.emit("idle");
  }

  snapshot({ source = "", configuration = {} } = {}) {
    this.assertLive();
    return Object.freeze({
      schema: "org.sagejs.cell-snapshot/v1",
      source: String(source),
      configuration: structuredClone(configuration),
    });
  }

  async dispose() {
    if (this.status === "disposed") return;
    this.status = "disposed";
    this.widgetHost?.close();
    await this.session?.close();
    this.session = undefined;
    this.widgetHost = undefined;
    this.emit("dispose");
  }
}

export function createSageCellController(options) {
  return new SageCellController(options);
}

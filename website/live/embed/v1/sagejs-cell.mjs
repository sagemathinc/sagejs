import { createSageCellController } from "../../cell-controller.mjs";
import { createSourceEditor } from "../../codemirror-editor.mjs";
import { createOutputRenderer } from "../../output-renderer.mjs";
import {
  boundedTimeout,
  DEFAULT_LIMITS,
  OutputCollector,
} from "../../resource-policy.mjs";

const FORWARDED_EVENTS = [
  "capability",
  "ready",
  "busy",
  "idle",
  "output",
  "result",
  "error",
  "reset",
  "dispose",
];

const DEFAULT_CONFIGURATION = Object.freeze({
  autoEvaluate: false,
  editor: true,
  language: "sage",
  runButtonText: "Run",
  theme: "system",
  timeout: DEFAULT_LIMITS.timeoutMs,
  typesetMath: true,
});

const STYLE = `
  :host {
    --sagejs-accent: #157a6e;
    --sagejs-accent-ink: #ffffff;
    --sagejs-background: #ffffff;
    --sagejs-panel: #f6f8fa;
    --sagejs-ink: #17212b;
    --sagejs-muted: #59636e;
    --sagejs-line: #c8d1da;
    --sagejs-focus: #1686d9;
    --code: #f7f9fb;
    --code-ink: #17212b;
    --code-comment: #64748b;
    --code-keyword: #7c3aed;
    --code-string: #087f5b;
    --code-number: #b45309;
    --code-name: #0369a1;
    --code-invalid: #dc2626;
    --code-caret: #17212b;
    --code-selection: #b9dcf5;
    --code-gutter: #edf1f5;
    --code-gutter-ink: #66717d;
    --code-active: #e8f2f8;
    --code-active-gutter: #dae8f0;
    --focus: var(--sagejs-focus);
    --panel: var(--sagejs-panel);
    --line: var(--sagejs-line);
    --ink: var(--sagejs-ink);
    display: block;
    color: var(--sagejs-ink);
    color-scheme: light;
    font: 400 16px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  :host([data-theme="dark"]) {
    --sagejs-accent: #4cc9b8;
    --sagejs-accent-ink: #071f1c;
    --sagejs-background: #10161d;
    --sagejs-panel: #18212b;
    --sagejs-ink: #edf2f7;
    --sagejs-muted: #a8b4c0;
    --sagejs-line: #3d4a57;
    --sagejs-focus: #67b7f7;
    --code: #111923;
    --code-ink: #edf2f7;
    --code-comment: #9aa9b8;
    --code-keyword: #c4a7ff;
    --code-string: #73daca;
    --code-number: #f5bd77;
    --code-name: #7dcfff;
    --code-invalid: #ff757f;
    --code-caret: #ffffff;
    --code-selection: #294b68;
    --code-gutter: #18222d;
    --code-gutter-ink: #91a0af;
    --code-active: #1d2d3c;
    --code-active-gutter: #26394a;
    color-scheme: dark;
  }
  *, *::before, *::after { box-sizing: border-box; }
  .cell {
    overflow: hidden;
    border: 1px solid var(--sagejs-line);
    border-radius: .7rem;
    background: var(--sagejs-background);
    box-shadow: 0 1px 3px rgb(0 0 0 / 10%);
  }
  .editor { min-height: 8rem; max-height: 32rem; overflow: auto; }
  .editor[hidden] { display: none; }
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .45rem;
    padding: .55rem .7rem;
    border-top: 1px solid var(--sagejs-line);
    background: var(--sagejs-panel);
  }
  button {
    min-height: 2.25rem;
    padding: .35rem .8rem;
    border: 1px solid var(--sagejs-line);
    border-radius: .42rem;
    background: var(--sagejs-background);
    color: var(--sagejs-ink);
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }
  button.primary {
    border-color: var(--sagejs-accent);
    background: var(--sagejs-accent);
    color: var(--sagejs-accent-ink);
  }
  button:disabled { cursor: not-allowed; opacity: .55; }
  button:focus-visible { outline: 3px solid var(--sagejs-focus); outline-offset: 2px; }
  .status { margin-left: auto; color: var(--sagejs-muted); font-size: .88rem; }
  .output:empty { display: none; }
  .output { padding: .8rem; border-top: 1px solid var(--sagejs-line); }
  .result-output {
    overflow: auto;
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font: .92rem/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .event-output + .event-output, .plot { margin-top: .7rem; }
  .event-output:empty, .plot:empty { display: none; }
  .widget-error, .error { color: #b42318; }
  img { max-width: 100%; height: auto; }
  .js-plotly-plot { width: 100%; min-height: 18rem; }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; } }
`;

function normalizedLanguage(value) {
  if (value !== "sage" && value !== "python") {
    throw new TypeError("Sage.js cell language must be 'sage' or 'python'");
  }
  return value;
}

function normalizedTheme(value) {
  if (!new Set(["system", "light", "dark"]).has(value)) {
    throw new TypeError("Sage.js cell theme must be 'system', 'light', or 'dark'");
  }
  return value;
}

function userErrorText(error) {
  const name = error?.name === "ReferenceError" ? "NameError" : error?.name || "Error";
  return `${name}: ${error?.message || String(error)}`;
}

/** One independently executable, local, worker-backed Sage.js cell. */
export class SageJsCell extends HTMLElement {
  static observedAttributes = [
    "auto-evaluate",
    "hide-editor",
    "language",
    "no-typeset-math",
    "run-button-text",
    "theme",
    "timeout",
  ];

  constructor() {
    super();
    this.configuration = { ...DEFAULT_CONFIGURATION };
    this._source = "";
    this.initialized = false;
    this.disposed = false;
    this.running = false;
    this.autoEvaluated = false;
    this.media = matchMedia("(prefers-color-scheme: dark)");
    this.onMediaChange = () => this.applyTheme();
  }

  connectedCallback() {
    this.configureFromAttributes();
    this.initialize();
    void this.ready().then(() => {
      if (this.configuration.autoEvaluate && !this.autoEvaluated) {
        this.autoEvaluated = true;
        return this.run();
      }
      return undefined;
    }).catch(() => undefined);
  }

  attributeChangedCallback(name, _previous, value) {
    if (!this.isConnected) return;
    if (name === "auto-evaluate") this.configure({ autoEvaluate: value !== null });
    else if (name === "hide-editor") this.configure({ editor: value === null });
    else if (name === "no-typeset-math") this.configure({ typesetMath: value === null });
    else if (name === "language") this.configure({ language: value ?? DEFAULT_CONFIGURATION.language });
    else if (name === "run-button-text") this.configure({ runButtonText: value ?? DEFAULT_CONFIGURATION.runButtonText });
    else if (name === "theme") this.configure({ theme: value ?? DEFAULT_CONFIGURATION.theme });
    else if (name === "timeout") this.configure({ timeout: value ?? DEFAULT_CONFIGURATION.timeout });
  }

  configureFromAttributes() {
    const options = {};
    if (this.hasAttribute("auto-evaluate")) options.autoEvaluate = true;
    if (this.hasAttribute("hide-editor")) options.editor = false;
    if (this.hasAttribute("no-typeset-math")) options.typesetMath = false;
    for (const [attribute, option] of [
      ["language", "language"],
      ["run-button-text", "runButtonText"],
      ["theme", "theme"],
      ["timeout", "timeout"],
    ]) {
      if (this.hasAttribute(attribute)) options[option] = this.getAttribute(attribute);
    }
    this.configure(options);
  }

  disconnectedCallback() {
    queueMicrotask(() => {
      if (!this.isConnected) void this.dispose();
    });
  }

  initialize() {
    if (this.initialized) return;
    if (this.disposed) throw new Error("Sage.js cell is disposed");
    this.initialized = true;
    const embedded = this.querySelector('script[type="text/x-sage"], script[type="text/x-python"]');
    if (!this._source && embedded) {
      this._source = embedded.textContent.replace(/^\n|\n\s*$/g, "");
      if (embedded.type === "text/x-python") this.configuration.language = "python";
    }

    const root = this.attachShadow({ mode: "open" });
    const katex = document.createElement("link");
    katex.rel = "stylesheet";
    katex.href = new URL("../../vendor/katex/katex.min.css", import.meta.url);
    const widgets = document.createElement("link");
    widgets.rel = "stylesheet";
    widgets.href = new URL("../../vendor/widgets/widgets.built.css", import.meta.url);
    const style = document.createElement("style");
    style.textContent = STYLE;
    const cell = document.createElement("section");
    cell.className = "cell";
    cell.innerHTML = `
      <span class="sr-only" id="source-label">Sage.js source</span>
      <span class="sr-only" id="editor-help">Press Shift Enter or Control Enter to run this cell.</span>
      <div class="editor" part="editor"></div>
      <div class="controls" part="controls">
        <button class="primary run" type="button"></button>
        <button class="interrupt" type="button" disabled>Interrupt</button>
        <button class="reset" type="button" disabled>Reset</button>
        <button class="clear" type="button">Clear output</button>
        <span class="status" role="status" aria-live="polite">Loading Sage.js…</span>
      </div>
      <div class="output" part="output" aria-live="polite" aria-relevant="additions text"></div>
    `;
    root.append(katex, widgets, style, cell);
    this.editorElement = root.querySelector(".editor");
    this.outputElement = root.querySelector(".output");
    this.statusElement = root.querySelector(".status");
    this.runButton = root.querySelector(".run");
    this.interruptButton = root.querySelector(".interrupt");
    this.resetButton = root.querySelector(".reset");
    this.editor = createSourceEditor(this.editorElement, {
      onRun: () => void this.run(),
    });
    this.editor.setValue(this._source);
    this.runButton.addEventListener("click", () => void this.run());
    this.interruptButton.addEventListener("click", () => void this.interrupt());
    this.resetButton.addEventListener("click", () => void this.reset());
    root.querySelector(".clear").addEventListener("click", () => this.clear());
    this.media.addEventListener("change", this.onMediaChange);
    this.applyConfiguration();

    this.outputRenderer = createOutputRenderer({
      getWidgetHost: () => this.controller?.widgetHost,
      getRenderSageDisplay: () => this.controller?.runtime?.renderSageDisplay,
      typesetMath: () => this.configuration.typesetMath,
    });
    this.controller = createSageCellController({
      sessionOptions: this.configuration.language === "python"
        ? { mode: "python" }
        : {},
      renderWidgetOutput: this.outputRenderer.renderWidgetOutput,
      onGraphicsSave: async (request) => {
        await this.controller.runtime.downloadSageDisplay(
          request.display,
          request.filename,
          request.options,
        );
      },
    });
    for (const name of FORWARDED_EVENTS) {
      this.controller.addEventListener(name, ({ detail }) => {
        const { controller: _controller, ...publicDetail } = detail;
        this.dispatchEvent(new CustomEvent(name, {
          bubbles: true,
          composed: true,
          detail: Object.freeze({ cell: this, ...publicDetail }),
        }));
      });
    }
  }

  configure(options = {}) {
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
      throw new TypeError("Sage.js cell configuration must be an object");
    }
    const next = { ...this.configuration };
    if ("language" in options) next.language = normalizedLanguage(options.language);
    if (this.controller && next.language !== this.configuration.language) {
      throw new Error("resetting a Sage.js cell cannot change its language; create a new cell");
    }
    if ("editor" in options) next.editor = Boolean(options.editor);
    if ("autoEvaluate" in options) next.autoEvaluate = Boolean(options.autoEvaluate);
    if ("runButtonText" in options) next.runButtonText = String(options.runButtonText);
    if ("theme" in options) next.theme = normalizedTheme(options.theme);
    if ("typesetMath" in options) next.typesetMath = Boolean(options.typesetMath);
    if ("timeout" in options) next.timeout = boundedTimeout(options.timeout);
    this.configuration = next;
    if ("source" in options) this.source = options.source;
    if (this.initialized) this.applyConfiguration();
    return this;
  }

  applyConfiguration() {
    this.editorElement.hidden = !this.configuration.editor;
    this.runButton.textContent = this.configuration.runButtonText || "Run";
    this.applyTheme();
  }

  applyTheme() {
    const preference = this.configuration.theme;
    this.dataset.theme = preference === "system"
      ? (this.media.matches ? "dark" : "light")
      : preference;
  }

  get source() {
    return this.editor?.getValue() ?? this._source;
  }

  set source(value) {
    this._source = String(value ?? "");
    this.editor?.setValue(this._source);
  }

  async ready() {
    this.initialize();
    this.setStatus("loading", "Loading Sage.js…");
    try {
      await this.controller.ready();
      this.setStatus("ready", "Ready — local WebAssembly");
      this.resetButton.disabled = false;
      this.runButton.disabled = false;
      return this;
    } catch (error) {
      this.setStatus("error", `Could not load Sage.js: ${error.message}`);
      throw error;
    }
  }

  async run() {
    if (this.running) throw new Error("Sage.js cell is already running");
    await this.ready();
    const source = this.source;
    if (!source.trim()) return undefined;
    this.clear();
    this.running = true;
    this.runButton.disabled = true;
    this.interruptButton.disabled = false;
    this.resetButton.disabled = true;
    this.setStatus("busy", "Running…");
    const article = document.createElement("article");
    const pre = document.createElement("pre");
    pre.className = "result-output";
    const rich = document.createElement("div");
    rich.className = "plot";
    article.append(pre, rich);
    this.outputElement.append(article);
    const collector = new OutputCollector();
    const events = this.outputRenderer.createEventRenderer(article, pre);
    let outputLimitRestarted = false;
    try {
      const result = await this.controller.run(source, {
        filename: `<sagejs-cell:${this.configuration.language}>`,
        timeout: this.configuration.timeout,
        onOutput: (text) => {
          collector.append(text);
          pre.textContent = collector.text;
          if (collector.exceeded && !outputLimitRestarted) {
            outputLimitRestarted = true;
            void this.controller.interrupt();
          }
        },
        onEvent: (event) => events.event(event),
      });
      await events.settled();
      const typesetLatex =
        result.display?.mime === "text/latex" && this.configuration.typesetMath;
      const richResult = Boolean(
        result.display &&
        (result.display.mime !== "text/latex" || typesetLatex),
      );
      if (result.repr && !richResult) {
        collector.append(
          `${collector.text && !collector.text.endsWith("\n") ? "\n" : ""}${result.repr}`,
        );
      }
      pre.textContent = collector.text;
      if (!pre.textContent) pre.remove();
      if (result.display && (result.display.mime !== "text/latex" || typesetLatex)) {
        await this.outputRenderer.renderMimeBundle(
          rich,
          { [result.display.mime]: result.display.data },
          result.display.metadata,
        );
      } else {
        rich.remove();
      }
      if (!article.childNodes.length && !events.count) article.remove();
      this.setStatus("ready", "Ready");
      return result;
    } catch (error) {
      rich.remove();
      pre.classList.add("error");
      pre.textContent = outputLimitRestarted
        ? collector.text
        : `${collector.text}${collector.text ? "\n" : ""}${userErrorText(error)}`;
      this.setStatus("error", outputLimitRestarted ? "Output limit reached; kernel reset" : "Evaluation failed");
      throw error;
    } finally {
      this.running = false;
      this.runButton.disabled = false;
      this.interruptButton.disabled = true;
      this.resetButton.disabled = false;
    }
  }

  clear() {
    this.controller?.widgetHost?.clearViews();
    this.outputElement?.replaceChildren();
  }

  async interrupt() {
    if (!this.controller) return;
    this.setStatus("loading", "Interrupting and restarting…");
    await this.controller.interrupt();
    this.setStatus("ready", "Ready — clean session");
  }

  async reset() {
    await this.ready();
    this.clear();
    this.setStatus("loading", "Resetting…");
    await this.controller.reset();
    this.setStatus("ready", "Ready — clean session");
  }

  snapshot() {
    this.initialize();
    return this.controller.snapshot({
      source: this.source,
      configuration: this.configuration,
    });
  }

  setStatus(state, text) {
    if (!this.statusElement) return;
    this.statusElement.dataset.state = state;
    this.statusElement.textContent = text;
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.media.removeEventListener("change", this.onMediaChange);
    this.editor?.destroy();
    this.editor = undefined;
    await this.controller?.dispose();
    this.runButton && (this.runButton.disabled = true);
    this.interruptButton && (this.interruptButton.disabled = true);
    this.resetButton && (this.resetButton.disabled = true);
    this.setStatus("disposed", "Disposed");
  }
}

if (!customElements.get("sagejs-cell")) {
  customElements.define("sagejs-cell", SageJsCell);
}

/** Replace or initialize a host element with one Sage.js cell. */
export async function createSageCell(target, options = {}) {
  if (!(target instanceof Element)) {
    throw new TypeError("createSageCell target must be an Element");
  }
  const cell = target instanceof SageJsCell
    ? target
    : document.createElement("sagejs-cell");
  cell.configure(options);
  if (cell !== target) target.replaceChildren(cell);
  await cell.ready();
  if (cell.configuration.autoEvaluate && !cell.autoEvaluated) {
    cell.autoEvaluated = true;
    await cell.run();
  }
  return cell;
}

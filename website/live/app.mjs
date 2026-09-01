import { requestCredentials } from "./runtime-api.mjs";
import { createSageCellController } from "./cell-controller.mjs";
import {
  createReadOnlySource,
  createSourceEditor,
} from "./codemirror-editor.mjs";
import { executionSource } from "./execution-source.mjs";
import { EXAMPLES } from "./examples.mjs";
import {
  createOutputRenderer,
  evaluationResultBundle,
} from "./output-renderer.mjs";
import { capabilityFamilies, filterCapabilities, validateCapabilityReport } from "./capability-report.mjs";
import {
  boundedTimeout,
  DEFAULT_LIMITS,
  OutputCollector,
  utf8Size,
} from "./resource-policy.mjs";
import {
  decodeSharedSource,
  encodeSharedSource,
  newWorkspace,
  WorkspaceStore,
} from "./session-store.mjs";
import {
  DEFAULT_WIDGET_LIMITS,
} from "./widget-manager.mjs";

const $ = (selector) => document.querySelector(selector);
const fetchCredentials = requestCredentials(location.search);
const elements = {
  source: $("#source"),
  title: $("#worksheet-title"),
  sessions: $("#sessions"),
  examples: $("#examples"),
  output: $("#output"),
  status: $("#kernel-status"),
  diagnostics: $("#diagnostics"),
  live: $("#live-status"),
  timeout: $("#timeout"),
  importFile: $("#import-file"),
  about: $("#about-dialog"),
  runtimeFacts: $("#runtime-facts"),
  capabilityFamily: $("#capability-family"),
  capabilitySearch: $("#capability-search"),
  capabilitySummary: $("#capability-summary"),
  capabilityRecords: $("#capability-records"),
  typesetMath: $("#typeset-math"),
  theme: $("#theme"),
};

const THEME_KEY = "sagejs-theme";
const themeMedia = matchMedia("(prefers-color-scheme: dark)");

function storedTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function applyTheme(preference, { persist = false } = {}) {
  if (!new Set(["system", "light", "dark"]).has(preference)) {
    preference = "system";
  }
  const resolved = preference === "system"
    ? (themeMedia.matches ? "dark" : "light")
    : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  elements.theme.value = preference;
  if (persist) {
    try { localStorage.setItem(THEME_KEY, preference); } catch { /* storage is optional */ }
  }
}

applyTheme(storedTheme());
elements.theme.addEventListener("change", () => {
  applyTheme(elements.theme.value, { persist: true });
  setLive(`Theme set to ${elements.theme.selectedOptions[0].textContent}.`);
});
themeMedia.addEventListener("change", () => {
  if (elements.theme.value === "system") applyTheme("system");
});

const store = new WorkspaceStore();
let workspace;
let cellController;
let session;
let sessionPromise;
let downloadSageDisplay;
let renderSageDisplay;
let widgetHost;
let SageSessionInterruptedError;
let SageSessionTimeoutError;
let running = false;
let runCounter = 0;
let autosaveTimer;

const outputRenderer = createOutputRenderer({
  getWidgetHost: () => widgetHost,
  getRenderSageDisplay: () => renderSageDisplay,
  typesetMath: () => elements.typesetMath.checked,
});
const {
  createEventRenderer,
  renderMimeBundle,
  renderWidgetOutput,
} = outputRenderer;

function userErrorText(error) {
  const name = error?.name === "ReferenceError"
    ? "NameError"
    : error?.name || "Error";
  return `${name}: ${error?.message || String(error)}`;
}

function setLive(message) {
  elements.live.textContent = message;
}

function setStatus(state, message) {
  elements.status.dataset.state = state;
  elements.status.querySelector("span:last-child").textContent = message;
}

function updateControls() {
  for (const button of document.querySelectorAll("[data-run]")) button.disabled = running || !session;
  $("#interrupt").disabled = !running;
  $("#reset").disabled = running || !session;
}

function createSession() {
  setStatus("loading", "Loading kernel");
  cellController = createSageCellController({
    renderWidgetOutput,
    async onGraphicsSave(request) {
      await downloadSageDisplay(
        request.display,
        request.filename,
        request.options,
      );
    },
  });
  cellController.addEventListener("error", ({ detail }) => {
    if (detail.phase !== "worker") return;
    setStatus("loading", "Recovering kernel");
    setLive(`The kernel worker failed and is being replaced: ${detail.error.message}`);
    void cellController.reset().then(
      () => {
        setStatus("ready", "Ready — recovered session");
        setLive("The kernel restarted with a clean session.");
        updateControls();
      },
      (replacementError) => {
        setStatus("error", "Kernel recovery failed");
        setLive(`Kernel recovery failed: ${replacementError.message}`);
      },
    );
  });
  const promise = cellController.ready().then((controller) => {
    const runtime = controller.runtime;
    ({
      downloadSageDisplay,
      renderSageDisplay,
      SageSessionInterruptedError,
      SageSessionTimeoutError,
    } = runtime);
    return controller.session;
  });
  promise.then(
    (value) => {
      session = value;
      widgetHost = cellController.widgetHost;
      setStatus("ready", "Ready — local WebAssembly");
      setLive("Sage.js is ready.");
      updateControls();
    },
    (error) => {
      setStatus("error", "Kernel failed to load");
      setLive(`Kernel failed to load: ${error.message}`);
      renderMessage("error", "Kernel initialization failed", error.stack ?? error.message);
    },
  );
  return promise;
}

function renderSessionOptions() {
  elements.sessions.replaceChildren();
  for (const item of store.list()) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.title;
    option.selected = item.id === workspace?.id;
    elements.sessions.append(option);
  }
}

function loadWorkspace(value, { persist = true } = {}) {
  workspace = value;
  elements.source.value = value.source;
  elements.title.value = value.title;
  if (persist) workspace = store.save(workspace);
  renderSessionOptions();
}

function saveWorkspace() {
  workspace.source = elements.source.value;
  workspace.title = elements.title.value.trim() || "Untitled worksheet";
  try {
    workspace = store.save(workspace);
    renderSessionOptions();
  } catch (error) {
    setLive(`Worksheet was not saved: ${error.message}`);
  }
}

function scheduleSave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(saveWorkspace, 450);
}

createSourceEditor(elements.source, { onRun: (mode) => void run(mode) });

function download(bytes, filename, type) {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilename(value, extension) {
  const base = value.trim().replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "") || "sagejs-worksheet";
  return `${base.slice(0, 80)}.${extension}`;
}

function renderMessage(kind, title, text = "", input = "") {
  const article = document.createElement("article");
  article.className = `result result-${kind}`;
  const heading = document.createElement("h3");
  heading.textContent = title;
  const outputLabel = document.createElement("strong");
  outputLabel.className = "result-output-label";
  outputLabel.textContent = "Output";
  const pre = document.createElement("pre");
  pre.className = "result-output";
  pre.textContent = text;
  pre.tabIndex = 0;
  article.append(heading);
  if (input) {
    const inputHeading = document.createElement("div");
    inputHeading.className = "result-input-heading";
    const inputLabel = document.createElement("strong");
    inputLabel.textContent = "Input";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "quiet-button result-copy-input";
    copy.textContent = "Copy input";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(input);
        copy.textContent = "Copied";
        setTimeout(() => { copy.textContent = "Copy input"; }, 1200);
        setLive("The input for this result was copied.");
      } catch (error) {
        setLive(`Could not copy input: ${error.message}`);
      }
    });
    inputHeading.append(inputLabel, copy);
    const inputSource = document.createElement("div");
    inputSource.className = "result-input";
    article.append(inputHeading, inputSource);
    createReadOnlySource(inputSource, input, `Input for ${title}`);
  }
  article.append(outputLabel, pre);
  elements.output.prepend(article);
  return { article, pre };
}

function memoryDiagnostic() {
  const memory = performance.memory;
  if (!memory?.usedJSHeapSize) return "JS heap: not exposed by this browser";
  return `JS heap: ${(memory.usedJSHeapSize / 2 ** 20).toFixed(1)} MiB`;
}

async function run(mode) {
  if (running) return;
  const source = executionSource(elements.source.value, {
    mode,
    selectionStart: elements.source.selectionStart,
    selectionEnd: elements.source.selectionEnd,
  });
  if (!source.trim()) {
    setLive(`There is no ${mode === "all" ? "source" : mode} to run.`);
    return;
  }
  saveWorkspace();
  const currentRun = ++runCounter;
  const collector = new OutputCollector();
  const { article, pre } = renderMessage(
    "running",
    `Run ${currentRun} · ${mode}`,
    "Starting…",
    source,
  );
  const plot = document.createElement("div");
  plot.className = "plot";
  article.append(plot);
  const eventRenderer = createEventRenderer(article, pre);
  const start = performance.now();
  let outputLimitRestarted = false;
  running = true;
  setStatus("busy", "Running");
  setLive(`Running ${mode}. Interrupt is available.`);
  updateControls();
  try {
    if (!session) await sessionPromise;
    const result = await cellController.run(source, {
      filename: `<sagejs.org:${workspace.id}>`,
      timeout: boundedTimeout(elements.timeout.value),
      onOutput(text) {
        const appended = collector.append(text);
        pre.textContent = collector.text || "Running…";
        if (collector.exceeded && !outputLimitRestarted) {
          outputLimitRestarted = true;
          void cellController.interrupt();
        }
        return appended;
      },
      onEvent(event) {
        eventRenderer.event(event);
      },
    });
    await eventRenderer.settled();
    const finalBundle = evaluationResultBundle(result, {
      typesetMath: elements.typesetMath.checked,
    });
    if (result.repr && !finalBundle.rich) {
      collector.append((collector.text && !collector.text.endsWith("\n") ? "\n" : "") + result.repr);
    }
    pre.textContent = collector.text || (eventRenderer.count
      ? ""
      : "Completed without textual output.");
    if (!pre.textContent) pre.remove();
    if (finalBundle.rich) {
      await renderMimeBundle(plot, finalBundle.data, finalBundle.metadata);
      if (!collector.text) pre.remove();
    } else {
      plot.remove();
    }
    article.className = "result result-complete";
    const wall = performance.now() - start;
    elements.diagnostics.textContent = `Last run: ${wall.toFixed(0)} ms wall · ${result.durationMs.toFixed(0)} ms kernel · ${collector.bytes.toLocaleString()} output bytes · ${memoryDiagnostic()}`;
    setLive(`Run ${currentRun} completed in ${wall.toFixed(0)} milliseconds.`);
  } catch (error) {
    plot.remove();
    article.className = "result result-error";
    if (outputLimitRestarted) {
      pre.textContent = collector.text;
      setLive("The output limit was reached. The kernel was restarted and variables were cleared.");
    } else if (
      typeof SageSessionTimeoutError === "function" &&
      error instanceof SageSessionTimeoutError
    ) {
      pre.textContent = `Time limit reached.\n\n${collector.text}`;
      setLive("The time limit was reached. The kernel was restarted and variables were cleared.");
    } else if (
      typeof SageSessionInterruptedError === "function" &&
      error instanceof SageSessionInterruptedError
    ) {
      pre.textContent = `${collector.text}\n[Interrupted; variables were cleared.]`.trim();
      setLive("Interrupted. The kernel restarted with a clean session.");
    } else {
      pre.textContent = `${collector.text}${collector.text ? "\n" : ""}${userErrorText(error)}`;
      setLive(`Run ${currentRun} failed: ${error.message}`);
    }
  } finally {
    running = false;
    setStatus("ready", "Ready — local WebAssembly");
    updateControls();
  }
}

async function importFile(file) {
  if (!file) return;
  if (file.size > DEFAULT_LIMITS.importBytes) throw new RangeError("file exceeds the 4 MB import limit");
  if (/\.sagepack$/i.test(file.name)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    const encoded = btoa(binary);
    elements.source.value = `# Imported SagePack data from ${JSON.stringify(file.name)}\nimport base64\nimported_value = loads(base64.b64decode('${encoded}'))\nimported_value`;
  } else {
    elements.source.value = await file.text();
  }
  elements.title.value = file.name.replace(/\.(sage|py|sagepack)$/i, "");
  saveWorkspace();
}

async function exportSagePack() {
  const selection = executionSource(elements.source.value, {
    mode: "selection",
    selectionStart: elements.source.selectionStart,
    selectionEnd: elements.source.selectionEnd,
  }).trim();
  const expression = window.prompt("Expression to serialize as SagePack", selection || "_");
  if (!expression) return;
  setLive("Serializing the selected expression…");
  const result = await cellController.run(`import base64\nbase64.b64encode(dumps((${expression}))).decode('ascii')`, { timeout: boundedTimeout(elements.timeout.value) });
  if (!/^'[A-Za-z0-9+/]*={0,2}'$/.test(result.repr)) {
    throw new TypeError("SagePack export returned an invalid base64 value");
  }
  const binary = atob(result.repr.slice(1, -1));
  if (binary.length > DEFAULT_LIMITS.importBytes) throw new RangeError("SagePack export exceeds the 4 MB limit");
  const values = Uint8Array.from(binary, (value) => value.charCodeAt(0));
  download(values, safeFilename(elements.title.value, "sagepack"), "application/vnd.sagejs.sagepack");
  setLive(`Exported ${values.length.toLocaleString()} SagePack bytes.`);
}

function loadInitialWorkspace() {
  const shared = new URLSearchParams(location.hash.slice(1)).get("code");
  if (shared !== null) {
    try {
      loadWorkspace(newWorkspace({ title: "Shared worksheet", source: decodeSharedSource(shared) }));
      history.replaceState(null, "", location.pathname + location.search);
      return;
    } catch (error) {
      setLive(`The shared source could not be opened: ${error.message}`);
    }
  }
  const stored = store.list();
  loadWorkspace(stored[0] ?? newWorkspace({
    title: "Welcome to Sage.js",
    source: EXAMPLES[2].source,
  }));
}

async function loadCapabilities() {
  const facts = [
    ["Execution", "Entirely in this browser; no compute server"],
    ["Cross-origin isolated", globalThis.crossOriginIsolated ? "yes" : "no"],
    ["Offline cache", "serviceWorker" in navigator ? "supported" : "unavailable"],
    ["Time limit", `up to ${DEFAULT_LIMITS.maximumTimeoutMs / 1000} seconds per run`],
    ["Output limit", `${DEFAULT_LIMITS.outputBytes.toLocaleString()} bytes per run`],
    ["Plot limit", `${DEFAULT_LIMITS.plotBytes.toLocaleString()} bytes per display`],
    ["Widget model limit", `${DEFAULT_WIDGET_LIMITS.liveModels.toLocaleString()} per session`],
    ["Widget view limit", `${DEFAULT_WIDGET_LIMITS.liveViews.toLocaleString()} per session`],
    ["Widget retained output", `${DEFAULT_WIDGET_LIMITS.outputBytes.toLocaleString()} bytes per Output control`],
    ["Widget event queue", `${DEFAULT_WIDGET_LIMITS.queuedEvents.toLocaleString()} pending callbacks`],
    ["Widget callback limit", `${DEFAULT_WIDGET_LIMITS.callbackTimeoutMs / 1000} seconds`],
  ];
  try {
    const response = await fetch("./runtime-version.json", { cache: "no-store", credentials: fetchCredentials });
    if (response.ok) {
      const version = await response.json();
      facts.push(["Artifact revision", version.revision ?? "unknown"]);
      facts.push(["Built", version.builtAt ?? "unknown"]);
      for (const module of version.modules ?? []) {
        if (!module.memory) continue;
        const initial = module.memory.pageBytes * module.memory.initialPages / 2 ** 20;
        const maximum = module.memory.pageBytes * module.memory.maximumPages / 2 ** 20;
        facts.push([`${module.id} linear memory`, `${initial} MiB initial; ${maximum} MiB hard maximum (${module.loading})`]);
      }
    }
  } catch { /* offline first load is reported by the static facts */ }
  const dl = document.createElement("dl");
  for (const [name, value] of facts) {
    const dt = document.createElement("dt"); dt.textContent = name;
    const dd = document.createElement("dd"); dd.textContent = value;
    dl.append(dt, dd);
  }
  elements.runtimeFacts.replaceChildren(dl);

  const reportResponse = await fetch("./wasm-capabilities-report.json", { cache: "no-cache", credentials: fetchCredentials });
  if (!reportResponse.ok) throw new Error(`capability report returned HTTP ${reportResponse.status}`);
  const report = validateCapabilityReport(await reportResponse.json());
  for (const family of capabilityFamilies(report)) {
    const option = document.createElement("option"); option.value = family; option.textContent = family;
    elements.capabilityFamily.append(option);
  }
  const renderRecords = () => {
    const records = filterCapabilities(report, {
      family: elements.capabilityFamily.value,
      query: elements.capabilitySearch.value,
    });
    const displayed = Math.min(records.length, 150);
    elements.capabilitySummary.textContent = `${records.length.toLocaleString()} of ${report.capabilities.length.toLocaleString()} capabilities match; ${displayed.toLocaleString()} displayed. Source ${report.source_sha256}.`;
    const rows = [];
    for (const record of records.slice(0, 150)) {
      const row = document.createElement("tr");
      const identity = document.createElement("td");
      const code = document.createElement("code"); code.textContent = record.id;
      const family = document.createElement("small"); family.textContent = ` · ${record.family}`;
      identity.append(code, family);
      const statusCell = document.createElement("td");
      const status = document.createElement("span"); status.className = "capability-status"; status.dataset.status = record.status; status.textContent = record.status;
      statusCell.append(status);
      const behavior = document.createElement("td");
      const explanation = document.createElement("div"); explanation.textContent = record.explanation;
      behavior.append(explanation);
      if (record.fallback !== "none") {
        const fallback = document.createElement("small"); fallback.textContent = `Fallback: ${record.fallback}`; behavior.append(document.createElement("br"), fallback);
      }
      if (record.resource_limits) {
        const limits = document.createElement("small"); limits.textContent = `Limits: ${JSON.stringify(record.resource_limits)}`; behavior.append(document.createElement("br"), limits);
      }
      row.append(identity, statusCell, behavior); rows.push(row);
    }
    elements.capabilityRecords.replaceChildren(...rows);
  };
  elements.capabilityFamily.addEventListener("change", renderRecords);
  elements.capabilitySearch.addEventListener("input", renderRecords);
  renderRecords();
}

for (const example of EXAMPLES) {
  const option = document.createElement("option");
  option.value = example.id;
  option.textContent = example.title;
  elements.examples.append(option);
}
elements.examples.addEventListener("change", () => {
  const example = EXAMPLES.find((item) => item.id === elements.examples.value);
  if (!example) return;
  loadWorkspace(newWorkspace({ title: example.title, source: example.source }));
  $("#example-description").textContent = example.description;
});
for (const button of document.querySelectorAll("[data-run]")) {
  button.addEventListener("click", () => void run(button.dataset.run));
}
$("#interrupt").addEventListener("click", async () => {
  if (!running) return;
  runCounter += 1;
  setStatus("loading", "Restarting after interrupt");
  await cellController.interrupt();
});
$("#reset").addEventListener("click", async () => {
  setStatus("loading", "Resetting kernel");
  await cellController.reset();
  setStatus("ready", "Ready — clean session");
  setLive("Kernel reset. All variables were cleared.");
});
$("#new-session").addEventListener("click", () => loadWorkspace(newWorkspace()));
$("#delete-session").addEventListener("click", () => {
  if (!confirm(`Delete “${workspace.title}” from this browser?`)) return;
  store.remove(workspace.id);
  loadWorkspace(store.list()[0] ?? newWorkspace());
});
elements.sessions.addEventListener("change", () => {
  const selected = store.list().find((item) => item.id === elements.sessions.value);
  if (selected) loadWorkspace(selected, { persist: false });
});
elements.source.addEventListener("input", scheduleSave);
elements.title.addEventListener("input", scheduleSave);
elements.source.addEventListener("keydown", (event) => {
  if (event.defaultPrevented) return;
  if (event.key !== "Enter" || event.altKey) return;
  if (event.shiftKey) { event.preventDefault(); void run("cell"); }
  else if (event.ctrlKey || event.metaKey) { event.preventDefault(); void run("all"); }
});
$("#import").addEventListener("click", () => elements.importFile.click());
elements.importFile.addEventListener("change", () => void importFile(elements.importFile.files[0]).catch((error) => setLive(`Import failed: ${error.message}`)));
$("#export-source").addEventListener("click", () => download(elements.source.value, safeFilename(elements.title.value, "sage"), "text/x-sage;charset=utf-8"));
$("#export-sagepack").addEventListener("click", () => void exportSagePack().catch((error) => setLive(`SagePack export failed: ${error.message}`)));
$("#share").addEventListener("click", async () => {
  try {
    const url = new URL(location.href);
    url.hash = new URLSearchParams({ code: encodeSharedSource(elements.source.value) });
    await navigator.clipboard.writeText(url.href);
    setLive("A local source-only share URL was copied. It contains no saved results or credentials.");
  } catch (error) { setLive(`Could not create the share URL: ${error.message}`); }
});
$("#clear-output").addEventListener("click", () => {
  widgetHost?.clearViews();
  elements.output.replaceChildren();
});
$("#about").addEventListener("click", () => elements.about.showModal());
$("#close-about").addEventListener("click", () => elements.about.close());

loadInitialWorkspace();
void loadCapabilities().catch((error) => {
  elements.capabilitySummary.textContent = `Capability report unavailable: ${error.message}`;
});
sessionPromise = createSession();
updateControls();
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  addEventListener("load", () => void (async () => {
    const response = await fetch("./asset-manifest.json", { cache: "no-store", credentials: fetchCredentials });
    if (!response.ok) throw new Error(`asset manifest returned ${response.status}`);
    const manifest = await response.json();
    if (!/^[a-f0-9]{64}$/.test(manifest.release)) throw new Error("asset manifest release is invalid");
    const worker = new URL("./sw.js", location.href);
    worker.searchParams.set("release", manifest.release);
    if (fetchCredentials === "same-origin") worker.searchParams.set("cocalc-preview", "1");
    let reloadingForUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      location.reload();
    });
    const registration = await navigator.serviceWorker.register(worker, { scope: "./" });
    await registration.update();
  })().catch((error) => setLive(`Offline cache unavailable: ${error.message}`)));
}

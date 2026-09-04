import "./sagejs-cell.mjs";

const SCHEMA = "org.sagejs.cell-frame/v1";
const MAX_MESSAGE_BYTES = 256 * 1024;
const MAX_RESULT_TEXT = 64 * 1024;
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const container = document.querySelector("#sagejs-frame-cell");
const errorElement = document.querySelector("#configuration-error");
let cell;

function configuredParentOrigin() {
  const value = new URL(location.href).searchParams.get("parentOrigin");
  if (!value || value === "*") return undefined;
  try {
    const url = new URL(value);
    return url.origin === value ? value : undefined;
  } catch {
    return undefined;
  }
}

const parentOrigin = configuredParentOrigin();

function encodedSize(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function boundedSource(value) {
  const source = String(value ?? "");
  if (new TextEncoder().encode(source).byteLength > MAX_MESSAGE_BYTES) {
    throw new RangeError("Sage.js frame source exceeds 256 KiB");
  }
  return source;
}

function configuration(value) {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Sage.js frame configuration must be an object");
  }
  const allowed = new Set([
    "editor",
    "language",
    "runButtonText",
    "theme",
    "timeout",
    "typesetMath",
  ]);
  for (const name of Object.keys(value)) {
    if (!allowed.has(name)) {
      throw new TypeError(`unsupported Sage.js frame configuration ${JSON.stringify(name)}`);
    }
  }
  return { ...value };
}

function boundedText(value) {
  const text = String(value ?? "");
  return text.length <= MAX_RESULT_TEXT
    ? text
    : `${text.slice(0, MAX_RESULT_TEXT)}\n[frame result truncated]`;
}

function resultSummary(result) {
  return Object.freeze({
    displayMime: result?.display?.mime,
    durationMs: result?.durationMs,
    repr: boundedText(result?.repr),
    stderr: boundedText(result?.stderr),
    stdout: boundedText(result?.stdout),
  });
}

function errorSummary(error) {
  return Object.freeze({
    message: boundedText(error?.message || String(error)),
    name: String(error?.name || "Error"),
  });
}

function post(message) {
  window.parent.postMessage(Object.freeze({ schema: SCHEMA, ...message }), parentOrigin);
}

function activeCell() {
  if (!cell) throw new Error("initialize the Sage.js frame before using it");
  return cell;
}

function bindCellEvents(value) {
  for (const type of ["busy", "idle", "reset", "dispose"]) {
    value.addEventListener(type, ({ detail }) => {
      post({ type: "event", event: type, reason: detail.reason });
    });
  }
  value.addEventListener("error", ({ detail }) => {
    post({
      type: "event",
      event: "error",
      error: errorSummary(detail.error),
      phase: detail.phase,
    });
  });
}

async function command(message) {
  switch (message.action) {
    case "initialize": {
      if (cell) throw new Error("Sage.js frame is already initialized");
      cell = document.createElement("sagejs-cell");
      cell.configure(configuration(message.configuration));
      if ("source" in message) cell.source = boundedSource(message.source);
      bindCellEvents(cell);
      container.replaceChildren(cell);
      await cell.ready();
      return cell.snapshot();
    }
    case "configure":
      activeCell().configure(configuration(message.configuration));
      return activeCell().snapshot();
    case "set-source":
      activeCell().source = boundedSource(message.source);
      return activeCell().snapshot();
    case "run":
      return resultSummary(await activeCell().run());
    case "interrupt":
      await activeCell().interrupt();
      return { status: "ready" };
    case "reset":
      await activeCell().reset();
      return { status: "ready" };
    case "snapshot":
      return activeCell().snapshot();
    case "dispose":
      await activeCell().dispose();
      return { status: "disposed" };
    default:
      throw new TypeError(`unsupported Sage.js frame action ${JSON.stringify(message.action)}`);
  }
}

if (!parentOrigin || window.parent === window) {
  container.hidden = true;
  errorElement.hidden = false;
  errorElement.textContent =
    "This Sage.js frame needs an exact parentOrigin query parameter and an embedding parent window.";
} else {
  addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== parentOrigin) return;
    const message = event.data;
    let messageBytes;
    try {
      messageBytes = encodedSize(message);
    } catch {
      return;
    }
    if (
      !message ||
      typeof message !== "object" ||
      message.schema !== SCHEMA ||
      message.type !== "request" ||
      !REQUEST_ID.test(message.id ?? "") ||
      messageBytes > MAX_MESSAGE_BYTES
    ) {
      return;
    }
    void command(message).then(
      (result) => post({ type: "response", id: message.id, ok: true, result }),
      (error) => post({
        type: "response",
        id: message.id,
        ok: false,
        error: errorSummary(error),
      }),
    );
  });
  post({
    type: "ready",
    capabilities: {
      crossOriginIsolated: Boolean(globalThis.crossOriginIsolated),
      localExecution: true,
    },
  });
}

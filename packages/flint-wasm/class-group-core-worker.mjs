import {
  fetchSpecialistBytes,
  validateSpecialistReceipt,
} from "./specialist-bytes.mjs";
import { instantiateClassGroupCore } from "./class-group-core-loader.mjs";

let core = null;
let initialized = false;
let closing = false;
let initializationController = null;

async function resolveReceipt(value, signal) {
  if (typeof value !== "string") return validateSpecialistReceipt(value);
  const response = await fetch(value, { signal });
  if (!response.ok) {
    throw new Error(`class-group receipt download failed (${response.status})`);
  }
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > 4096) {
    throw new RangeError("class-group receipt exceeds its transfer limit");
  }
  const source = await response.text();
  if (source.length > 4096) {
    throw new RangeError("class-group receipt exceeds its transfer limit");
  }
  return validateSpecialistReceipt(JSON.parse(source));
}

function serializedError(error) {
  return {
    name: String(error?.name ?? "Error"),
    message: String(error?.message ?? error),
    stack: typeof error?.stack === "string" ? error.stack : undefined,
  };
}

self.onmessage = ({ data }) => {
  if (!data || typeof data !== "object") return;
  if (data.type === "initialize" && !initialized) {
    initialized = true;
    initializationController = new AbortController();
    void (async () => {
      const receipt = await resolveReceipt(
        data.receipt,
        initializationController.signal,
      );
      const bytes = await fetchSpecialistBytes(data.artifact, receipt, {
        signal: initializationController.signal,
      });
      const instance = await instantiateClassGroupCore(bytes);
      if (closing) {
        instance.close();
        return;
      }
      core = instance;
      self.postMessage({
        type: "ready",
        protocol: 1,
        diagnostics: { ...core.diagnostics(), artifactReceipt: receipt },
      });
    })().catch((error) => {
      if (!closing) {
        self.postMessage({ type: "initialization-error", error: serializedError(error) });
      }
    }).finally(() => {
      initializationController = null;
    });
    return;
  }
  if (data.type === "invoke" && core !== null) {
    try {
      const result = core.invoke(data.request);
      self.postMessage({ type: "result", id: data.id, ok: true, result });
    } catch (error) {
      self.postMessage({
        type: "result",
        id: data.id,
        ok: false,
        error: serializedError(error),
      });
    }
    return;
  }
  if (data.type === "diagnostics" && core !== null) {
    self.postMessage({
      type: "result",
      id: data.id,
      ok: true,
      result: core.diagnostics(),
    });
    return;
  }
  if (data.type === "close") {
    closing = true;
    initializationController?.abort();
    core?.close();
    core = null;
    self.postMessage({ type: "closed" });
    self.close?.();
  }
};

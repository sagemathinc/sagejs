import { fetchSpecialistBytes } from "./specialist-bytes.mjs";
import { instantiateClassGroupCore } from "./class-group-core-loader.mjs";

let core = null;
let initialized = false;

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
    void (async () => {
      const bytes = await fetchSpecialistBytes(data.artifact, data.receipt);
      core = await instantiateClassGroupCore(bytes);
      self.postMessage({
        type: "ready",
        protocol: 1,
        diagnostics: core.diagnostics(),
      });
    })().catch((error) => {
      self.postMessage({ type: "initialization-error", error: serializedError(error) });
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
    core?.close();
    core = null;
    self.postMessage({ type: "closed" });
    self.close?.();
  }
};

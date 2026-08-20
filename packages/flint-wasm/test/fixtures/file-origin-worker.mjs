let nested;
try {
  nested = new Worker(new URL("./file-origin-worker-child.mjs", import.meta.url), {
    type: "module",
  });
  nested.onmessage = ({ data }) => self.postMessage({
    outerWorker: true,
    nestedWorker: data === "nested-ready",
    crossOriginIsolated: globalThis.crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer === "function",
  });
  nested.onerror = (event) => self.postMessage({
    outerWorker: true,
    nestedWorker: false,
    nestedError: event.message,
    crossOriginIsolated: globalThis.crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer === "function",
  });
} catch (error) {
  self.postMessage({
    outerWorker: true,
    nestedWorker: false,
    nestedError: error instanceof Error ? error.message : String(error),
    crossOriginIsolated: globalThis.crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer === "function",
  });
}

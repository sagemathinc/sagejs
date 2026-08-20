import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { parentPort, workerData } from "node:worker_threads";

import { installNodeWorkerHost } from "./node-worker.mjs";

if (!parentPort || typeof workerData?.target !== "string") {
  throw new Error("the Sage.js Node worker bootstrap requires a target module");
}

installNodeWorkerHost();
globalThis.self = globalThis;
// Browser workers do not expose Window local storage.  Node 22 defines an
// experimental getter that warns when read unless a storage file is supplied;
// shadow it with the browser-worker value before loading generated code.
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: undefined,
});

const nativeFetch = globalThis.fetch;
const contentTypes = new Map([
  [".json", "application/json"],
  [".js", "text/javascript"],
  [".mjs", "text/javascript"],
  [".wasm", "application/wasm"],
]);

globalThis.fetch = async (input, init = {}) => {
  const requestUrl = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (requestUrl.protocol !== "file:") return nativeFetch(input, init);
  const method = String(init.method ?? input?.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return new Response(null, { status: 405 });
  }
  try {
    const bytes = await readFile(fileURLToPath(requestUrl));
    return new Response(method === "HEAD" ? null : bytes, {
      status: 200,
      headers: {
        "content-type":
          contentTypes.get(extname(requestUrl.pathname)) ??
          "application/octet-stream",
      },
    });
  } catch (error) {
    if (error?.code === "ENOENT") return new Response(null, { status: 404 });
    throw error;
  }
};

globalThis.postMessage = (data, transfer = []) => {
  parentPort.postMessage(data, transfer);
};

let imported = false;
const pending = [];
function deliver(message) {
  const event = { data: message.data, ports: message.ports ?? [] };
  if (typeof globalThis.onmessage === "function") globalThis.onmessage(event);
}
parentPort.on("message", (message) => {
  if (imported) deliver(message);
  else pending.push(message);
});

await import(workerData.target);
imported = true;
for (const message of pending.splice(0)) deliver(message);

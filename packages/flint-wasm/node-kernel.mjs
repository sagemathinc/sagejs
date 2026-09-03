import { installNodeWorkerHost } from "./node-worker.mjs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

installNodeWorkerHost();
globalThis.__sagejs_read_json_resource__ ??= async (resource) => {
  const url = new URL(resource);
  if (url.protocol !== "file:") {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`unable to load Sage.js resource (${response.status})`);
    }
    return response.json();
  }
  return JSON.parse(await readFile(fileURLToPath(url), "utf8"));
};

export * from "./kernel.mjs";

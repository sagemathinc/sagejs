import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { publicGapCases } from "./public-gap-closure-support.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chromium = [
  process.env.SAGEJS_CHROMIUM,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean).find((candidate) => fs.existsSync(candidate));

assert.ok(
  chromium,
  "Chromium not found; set SAGEJS_CHROMIUM to run the public-gap browser test",
);

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
]);
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://x").pathname);
  const relative = pathname === "/" ? "demo/index.html" : pathname.slice(1);
  const filename = path.resolve(packageRoot, relative);
  if (!filename.startsWith(`${packageRoot}${path.sep}`) || !fs.existsSync(filename)) {
    response.writeHead(404).end("not found");
    return;
  }
  const actual = fs.statSync(filename).isDirectory()
    ? path.join(filename, "index.html")
    : filename;
  response.writeHead(200, {
    "Content-Type": contentTypes.get(path.extname(actual)) ??
      "application/octet-stream",
  });
  fs.createReadStream(actual).pipe(response);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const chrome = spawn(chromium, [
  "--headless=new",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--remote-debugging-port=0",
  "about:blank",
]);
let chromeErrors = "";

try {
  const debuggerUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Chromium did not start:\n${chromeErrors}`)),
      10_000,
    );
    chrome.on("error", reject);
    chrome.stderr.on("data", (chunk) => {
      chromeErrors += chunk;
      const match = chromeErrors.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
  });
  const targetsUrl = new URL("/json/list", debuggerUrl);
  targetsUrl.protocol = "http:";
  const targets = await (await fetch(targetsUrl)).json();
  const page = targets.find((target) => target.type === "page");
  assert.ok(page, "Chromium did not expose a page target");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let commandId = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id === undefined) return;
    const handlers = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) handlers?.reject(new Error(message.error.message));
    else handlers?.resolve(message.result);
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    commandId += 1;
    pending.set(commandId, { resolve, reject });
    socket.send(JSON.stringify({ id: commandId, method, params }));
  });
  await command("Runtime.enable");
  await command("Page.enable");
  await command("Page.navigate", { url: `http://127.0.0.1:${port}/` });
  const evaluation = await command("Runtime.evaluate", {
    expression: `(async () => {
      const { createSage } = await import("/kernel.mjs");
      const sage = await createSage({ timeout: 120000 });
      try {
        const cases = ${JSON.stringify(publicGapCases)};
        const results = [];
        for (const item of cases) {
          if (item.expectedError) {
            try {
              await sage.evaluate(item.source, { timeout: 120000 });
            } catch (error) {
              if (!error.message.includes(item.expectedError)) throw error;
              results.push({ name: item.name, error: item.expectedError });
              continue;
            }
            throw new Error(item.name + ": expected a capability error");
          }
          const result = await sage.evaluate(item.source, { timeout: 120000 });
          results.push({ name: item.name, repr: result.repr });
        }
        return results;
      } finally {
        await sage.close();
      }
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (evaluation.exceptionDetails) {
    throw new Error(
      evaluation.exceptionDetails.exception?.description ??
        evaluation.exceptionDetails.text,
    );
  }
  assert.deepEqual(
    evaluation.result.value,
    publicGapCases.map(({ name, expected, expectedError }) => expectedError
      ? { name, error: expectedError }
      : { name, repr: expected }),
  );
  socket.close();
  process.stdout.write("Public WASM gap corpus passed in Chromium.\n");
} finally {
  chrome.kill("SIGTERM");
  await new Promise((resolve) => server.close(resolve));
}

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stageRelease } from "../scripts/stage.mjs";
import { startStaticServer } from "../scripts/static-server.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chromium = [process.env.SAGEJS_CHROMIUM, "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].filter(Boolean).find(existsSync);
assert.ok(chromium, "Chromium not found; set SAGEJS_CHROMIUM");

const staged = await stageRelease({ appRoot: root });
const server = await startStaticServer({ directory: staged.target });
const { port } = server.address();
const chrome = spawn(chromium, ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--remote-debugging-port=0", "about:blank"]);
let chromeErrors = "";

try {
  const debuggerUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Chromium did not start:\n${chromeErrors}`)), 10_000);
    chrome.once("error", reject);
    chrome.stderr.on("data", (chunk) => {
      chromeErrors += chunk;
      const match = chromeErrors.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  const targetUrl = new URL("/json/list", debuggerUrl); targetUrl.protocol = "http:";
  const page = (await (await fetch(targetUrl)).json()).find((entry) => entry.type === "page");
  assert.ok(page);
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id !== undefined) {
      const handlers = pending.get(message.id); pending.delete(message.id);
      if (message.error) handlers?.reject(new Error(message.error.message));
      else handlers?.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    id += 1; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  await command("Runtime.enable"); await command("Network.enable"); await command("Page.enable");

  async function evaluate(expression) {
    const answer = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.text);
    return answer.result.value;
  }
  async function waitFor(expression, timeout = 90_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = await evaluate(expression);
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const snapshot = await evaluate(`JSON.stringify({
      kernel: document.querySelector('#kernel-status')?.textContent.trim(),
      kernelState: document.querySelector('#kernel-status')?.dataset.state,
      live: document.querySelector('#live-status')?.textContent,
      output: document.querySelector('#output')?.textContent,
      source: document.querySelector('#source')?.value,
      runDisabled: document.querySelector('[data-run="all"]')?.disabled,
      diagnostics: document.querySelector('#diagnostics')?.textContent,
    })`);
    throw new Error(`timed out waiting for ${expression}\npage snapshot: ${snapshot}\n${errors.join("\n")}\n${chromeErrors}`);
  }
  async function runFactor({ setSource = true } = {}) {
    await evaluate(`${setSource ? "document.querySelector('#source').value='factor(2026)';" : ""} document.querySelector('[data-run="all"]').click()`);
    await waitFor(`document.querySelector('#output')?.textContent.includes('2 * 1013')`);
  }

  await command("Page.navigate", { url: `http://127.0.0.1:${port}/` });
  await waitFor(`document.querySelector('#kernel-status')?.dataset.state === 'ready'`);
  assert.equal(await evaluate("crossOriginIsolated"), true);
  await runFactor();
  await evaluate("navigator.serviceWorker.ready.then(() => true)");
  await command("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await command("Page.reload", { ignoreCache: true });
  await waitFor(`document.querySelector('#kernel-status')?.dataset.state === 'ready'`);
  assert.equal(await evaluate("document.querySelector('#source').value"), "factor(2026)");
  await runFactor({ setSource: false });
  assert.deepEqual(errors, []);
  socket.close();
} finally {
  chrome.kill("SIGTERM");
  server.close();
}

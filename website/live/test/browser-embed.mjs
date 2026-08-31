import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stageRelease } from "../scripts/stage.mjs";
import { startStaticServer } from "../scripts/static-server.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chromium = [
  process.env.SAGEJS_CHROMIUM,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean).find(existsSync);
assert.ok(chromium, "Chromium not found; set SAGEJS_CHROMIUM");

const staged = await stageRelease({ appRoot: root });
const server = await startStaticServer({ directory: staged.target });
const { port } = server.address();
const remoteCellModule = `http://127.0.0.1:${port}/embed/v1/sagejs-cell.mjs`;
const runtimeOrigin = `http://127.0.0.1:${port}`;
const hostServer = http.createServer((_request, response) => {
  response.writeHead(200, {
    "Content-Security-Policy": [
      "default-src 'none'",
      `script-src 'nonce-sagejs-test' 'unsafe-eval' 'wasm-unsafe-eval' ${runtimeOrigin}`,
      `worker-src blob: ${runtimeOrigin}`,
      `connect-src ${runtimeOrigin}`,
      `style-src 'unsafe-inline' ${runtimeOrigin}`,
      `font-src ${runtimeOrigin}`,
      `img-src data: blob: ${runtimeOrigin}`,
      "object-src 'none'",
      "base-uri 'none'",
    ].join("; "),
    "Content-Type": "text/html; charset=utf-8",
  });
  response.end(`<!doctype html>
    <html><head><meta charset="utf-8"><title>Unrelated Sage.js host</title></head>
    <body><main id="cell"></main><script type="module" nonce="sagejs-test">
      import { createSageCell } from ${JSON.stringify(remoteCellModule)};
      window.crossOriginCell = await createSageCell(document.querySelector('#cell'), {
        autoEvaluate: true,
        source: '2 + 2',
      });
    </script></body></html>`);
});
await new Promise((resolve, reject) => {
  hostServer.once("error", reject);
  hostServer.listen(0, "127.0.0.1", resolve);
});
const hostPort = hostServer.address().port;
const chrome = spawn(chromium, [
  "--headless=new",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--remote-debugging-port=0",
  "about:blank",
]);
let chromeErrors = "";

try {
  const debuggerUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Chromium did not start:\n${chromeErrors}`)),
      10_000,
    );
    chrome.once("error", reject);
    chrome.stderr.on("data", (chunk) => {
      chromeErrors += chunk;
      const match = chromeErrors.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  const targetUrl = new URL("/json/list", debuggerUrl);
  targetUrl.protocol = "http:";
  const page = (await (await fetch(targetUrl)).json()).find(
    (entry) => entry.type === "page",
  );
  assert.ok(page);
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  const browserConsole = [];
  const networkFailures = [];
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id !== undefined) {
      const handlers = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) handlers?.reject(new Error(message.error.message));
      else handlers?.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") {
      exceptions.push(
        message.params.exceptionDetails.exception?.description ??
          message.params.exceptionDetails.text,
      );
    }
    if (message.method === "Runtime.consoleAPICalled") {
      browserConsole.push(
        message.params.args.map((argument) => argument.value ?? argument.description).join(" "),
      );
    }
    if (message.method === "Network.loadingFailed") {
      networkFailures.push(`${message.params.errorText}: ${message.params.blockedReason ?? ""}`);
    }
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    id += 1;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await command("Runtime.enable");
  await command("Network.enable");
  await command("Page.enable");

  async function evaluate(expression) {
    const answer = await command("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (answer.exceptionDetails) {
      throw new Error(answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text);
    }
    return answer.result.value;
  }

  async function waitFor(expression, timeout = 45_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    const snapshot = await evaluate(`JSON.stringify({
      url: location.href,
      cell: document.querySelector('sagejs-cell')?.shadowRoot?.textContent,
      outputHtml: document.querySelector('sagejs-cell')?.shadowRoot?.querySelector('.output')?.innerHTML,
      status: document.querySelector('sagejs-cell')?.shadowRoot?.querySelector('.status')?.textContent
    })`);
    throw new Error(
      `timed out waiting for ${expression}\n${snapshot}\n${exceptions.join("\n")}\n${browserConsole.join("\n")}\n${networkFailures.join("\n")}\n${chromeErrors}`,
    );
  }

  await command("Page.navigate", {
    url: `http://127.0.0.1:${port}/embed/v1/`,
  });
  await waitFor(
    `document.querySelector('sagejs-cell')?.shadowRoot?.querySelector('.status')?.dataset.state === 'ready'`,
  );
  assert.equal(
    await evaluate(`document.querySelector('sagejs-cell').source.trim()`),
    "show(factor(2026))",
  );
  await evaluate(
    `document.querySelector('sagejs-cell').shadowRoot.querySelector('.run').click()`,
  );
  await waitFor(
    `document.querySelector('sagejs-cell')?.shadowRoot?.querySelector('.output')?.textContent.includes('2 * 1013')`,
  );
  assert.equal(
    await evaluate(`document.querySelector('sagejs-cell').snapshot().schema`),
    "org.sagejs.cell-snapshot/v1",
  );
  await evaluate(`(() => {
    const cell = document.querySelector('sagejs-cell');
    cell.configure({ typesetMath: false, theme: 'dark' });
    cell.source = '2 + 2';
    return cell.run();
  })()`);
  await waitFor(
    `document.querySelector('sagejs-cell')?.shadowRoot?.querySelector('.result-output')?.textContent === '4'`,
  );
  assert.equal(
    await evaluate(`document.querySelector('sagejs-cell').dataset.theme`),
    "dark",
  );
  await evaluate(`document.querySelector('sagejs-cell').reset()`);
  assert.equal(
    await evaluate(`document.querySelector('sagejs-cell').shadowRoot.querySelector('.output').textContent`),
    "",
  );

  await command("Page.navigate", {
    url: `http://127.0.0.1:${port}/embed/v1/factory.html`,
  });
  await waitFor(
    `Boolean(document.querySelector('sagejs-cell')?.shadowRoot?.querySelector('.jupyter-widgets')) && ` +
      `Boolean(document.querySelector('sagejs-cell')?.shadowRoot?.querySelector('.katex'))`,
  );
  const cellRoot = `document.querySelector('sagejs-cell').shadowRoot`;
  const slider = `${cellRoot}.querySelector('[role=slider], input[type=range]')`;
  await waitFor(`Boolean(${slider})`);
  const initialMath = await evaluate(`${cellRoot}.querySelector('.katex').textContent`);
  await evaluate(`${slider}.focus()`);
  await command("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await command("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await waitFor(
    `Number(${slider}.getAttribute('aria-valuenow') ?? ${slider}.value) === 3 && ` +
      `${cellRoot}.querySelector('.katex')?.textContent !== ${JSON.stringify(initialMath)}`,
  );
  assert.equal(await evaluate("crossOriginIsolated"), true);
  await evaluate(`document.querySelector('sagejs-cell').dispose()`);
  await waitFor(
    `document.querySelector('sagejs-cell')?.shadowRoot?.querySelector('.status')?.dataset.state === 'disposed'`,
  );

  await command("Page.navigate", {
    url: `http://127.0.0.1:${hostPort}/course-page`,
  });
  await waitFor(
    `window.crossOriginCell?.shadowRoot?.querySelector('.result-output')?.textContent === '4'`,
  );
  assert.equal(await evaluate("crossOriginIsolated"), false);
  assert.ok(
    await evaluate(
      `performance.getEntriesByType('resource').some((entry) => entry.name.startsWith(${JSON.stringify(`http://127.0.0.1:${port}/`)}))`,
    ),
    "the unrelated host should load the Sage.js runtime from the execution origin",
  );
  await evaluate(`(() => {
    window.crossOriginCell.source = ${JSON.stringify(`from IPython.display import display

@interact
def powers(n=slider(1, 5, 1, default=2, label='power')):
    display((x^n).derivative(x))`)};
    return window.crossOriginCell.run();
  })()`);
  await waitFor(
    `Boolean(window.crossOriginCell?.shadowRoot?.querySelector('[role=slider]')) && ` +
      `Boolean(window.crossOriginCell?.shadowRoot?.querySelector('.katex'))`,
  );
  await evaluate("window.crossOriginCell.dispose()");
  await waitFor(
    `window.crossOriginCell?.shadowRoot?.querySelector('.status')?.dataset.state === 'disposed'`,
  );
  assert.deepEqual(exceptions, []);
  socket.close();
} finally {
  chrome.kill("SIGTERM");
  await new Promise((resolve) => hostServer.close(resolve));
  await new Promise((resolve) => server.close(resolve));
}

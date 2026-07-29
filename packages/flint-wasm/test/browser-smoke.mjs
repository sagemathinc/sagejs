import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const chromiumCandidates = [
  process.env.SAGEJS_CHROMIUM,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean);
const chromium = chromiumCandidates.find((candidate) =>
  fs.existsSync(candidate),
);

assert.ok(
  chromium,
  "Chromium not found; set SAGEJS_CHROMIUM to run the browser smoke test",
);

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
]);

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://x").pathname);
  const relative = pathname === "/" ? "demo/index.html" : pathname.slice(1);
  const filename = path.resolve(packageRoot, relative);
  if (
    !filename.startsWith(`${packageRoot}${path.sep}`) ||
    !fs.existsSync(filename)
  ) {
    response.writeHead(404).end("not found");
    return;
  }
  const actual = fs.statSync(filename).isDirectory()
    ? path.join(filename, "index.html")
    : filename;
  response.writeHead(200, {
    "Content-Type":
      contentTypes.get(path.extname(actual)) ?? "application/octet-stream",
  });
  fs.createReadStream(actual).pipe(response);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

try {
  const chrome = spawn(chromium, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--remote-debugging-port=0",
    "about:blank",
  ]);
  let chromeErrors = "";
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

  try {
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
    const browserErrors = [];
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.id !== undefined) {
        const handlers = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) {
          handlers?.reject(new Error(message.error.message));
        } else {
          handlers?.resolve(message.result);
        }
      }
      if (message.method === "Runtime.exceptionThrown") {
        browserErrors.push(
          message.params.exceptionDetails.exception?.description ??
            message.params.exceptionDetails.text,
        );
      }
    });

    function command(method, params = {}) {
      commandId += 1;
      return new Promise((resolve, reject) => {
        pending.set(commandId, { resolve, reject });
        socket.send(JSON.stringify({ id: commandId, method, params }));
      });
    }

    await command("Runtime.enable");
    await command("Page.enable");
    await command("Page.navigate", {
      url: `http://127.0.0.1:${port}/demo/?run=2026`,
    });

    const deadline = Date.now() + 15_000;
    let text = "";
    while (Date.now() < deadline) {
      const evaluation = await command("Runtime.evaluate", {
        expression: "document.querySelector('#output')?.textContent ?? ''",
        returnByValue: true,
      });
      text = evaluation.result.value;
      if (text === "2 * 1013" || text.startsWith("Error:")) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    socket.close();
    assert.equal(
      text,
      "2 * 1013",
      `browser worker failed (${text || "no output"}):\n` +
        `${browserErrors.join("\n")}\n${chromeErrors}`,
    );
  } finally {
    chrome.kill();
  }
  console.log("Chromium Web Worker factorization smoke test passed");
} finally {
  server.close();
}

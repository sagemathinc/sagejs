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
const factorLoopOutput = [
  "3^4 * 5^2",
  "2 * 1013",
  "2027",
  "2^2 * 3 * 13^2",
  "2029",
  "2 * 5 * 7 * 29",
  "3 * 677",
  "2^4 * 127",
  "19 * 107",
  "2 * 3^2 * 113",
  "5 * 11 * 37",
  "2^2 * 509",
  "3 * 7 * 97",
  "2 * 1019",
  "2039",
  "2^3 * 3 * 5 * 17",
  "13 * 157",
  "2 * 1021",
  "3^2 * 227",
  "2^2 * 7 * 73",
  "5 * 409",
  "2 * 3 * 11 * 31",
  "23 * 89",
  "2^11",
  "3 * 683",
  "2 * 5^2 * 41",
  "",
].join("\n");

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
      url:
        `http://127.0.0.1:${port}/demo/?` +
        new URLSearchParams({ run: "factor(2026)" }),
    });

    async function waitForOutput(expected) {
      const deadline = Date.now() + 15_000;
      let text = "";
      while (Date.now() < deadline) {
        const evaluation = await command("Runtime.evaluate", {
          expression: "document.querySelector('#output')?.textContent ?? ''",
          returnByValue: true,
        });
        text = evaluation.result.value;
        if (text === expected || text.startsWith("Error:")) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(
        text,
        expected,
        `browser evaluator failed (${text || "no output"}):\n` +
          `${browserErrors.join("\n")}\n${chromeErrors}`,
      );
    }

    async function startSource(source) {
      await command("Runtime.evaluate", {
        expression:
          `document.querySelector('#source').value = ` +
          `${JSON.stringify(source)}; document.querySelector('#run').click()`,
      });
    }

    async function runSource(source, expected) {
      await startSource(source);
      await waitForOutput(expected);
    }

    await waitForOutput("2 * 1013");
    await runSource("a = 12\nfactor(a)", "2^2 * 3");
    await runSource("factor(a^2)", "2^4 * 3^2");
    await runSource(
      "for n in [2025..2050]:\n    print(factor(n))",
      factorLoopOutput,
    );
    await startSource("while True:\n    pass");
    await waitForOutput("Running…");
    await new Promise((resolve) => setTimeout(resolve, 250));
    await command("Runtime.evaluate", {
      expression: "document.querySelector('#interrupt').click()",
    });
    await waitForOutput("Interrupted.");
    await runSource("factor(30)", "2 * 3 * 5");
    socket.close();
  } finally {
    chrome.kill();
  }
  console.log("Chromium Web Worker factorization smoke test passed");
} finally {
  server.close();
}

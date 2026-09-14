import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("../", import.meta.url));
const executablePath = [process.env.SAGEJS_CHROMIUM, "/usr/bin/chromium",
  "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find(p => p && fs.existsSync(p));
assert.ok(executablePath, "Set SAGEJS_CHROMIUM to an installed Chromium");
const mime = {".mjs": "text/javascript", ".js": "text/javascript",
  ".json": "application/json", ".wasm": "application/wasm"};
const server = http.createServer((request, response) => {
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  if (pathname === "/") {
    response.setHeader("Content-Type", "text/html");
    response.end("<!doctype html><title>Traceback qualification</title>");
    return;
  }
  const filename = path.resolve(root, "." + pathname);
  if (!filename.startsWith(root) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader("Content-Type", mime[path.extname(filename)] ?? "application/octet-stream");
  fs.createReadStream(filename).pipe(response);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({executablePath, headless: true,
    args: ["--no-sandbox"]});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  for (const mode of ["python", "sage"]) {
    for (const tracebackCapture of ["native", "guarded"]) {
      const result = await page.evaluate(async ({mode, tracebackCapture}) => {
        const { SageSession } = await import("/kernel.mjs");
        const session = new SageSession({mode, tracebackCapture});
        try {
          await session.ready();
          let failure;
          try {
            await session.evaluate("def leaf():\n    raise ValueError('browser capture')\nleaf()", {filename: "capture.py"});
          } catch (error) {
            failure = {message: error.message, stack: error.stack,
              traceback: error.traceback, diagnostic: error.pythonDiagnostic};
          }
          const recovered = await session.evaluate("6 * 7");
          return {failure, recovered};
        } finally {
          await session.close();
        }
      }, {mode, tracebackCapture});
      assert.match(result.failure?.message ?? "", /browser capture/);
      assert.match(result.failure?.stack ?? "", /leaf/);
      if (tracebackCapture === "guarded") {
        assert.match(result.failure.traceback.join("\n"), /leaf/);
        assert.ok(result.failure.diagnostic.frames.length >= 2);
      }
      assert.equal(result.recovered.repr, "42");
      console.log(`${mode}/${tracebackCapture}: browser diagnostics and recovery passed`);
    }
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}

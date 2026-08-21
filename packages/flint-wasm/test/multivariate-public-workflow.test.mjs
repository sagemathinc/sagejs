import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createSage } from "../node-kernel.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(packageRoot, "..", "..");
const capability = "wasm-library:flint:fmpz-mpoly-resultant-packed-v1";
const source = [
  "R = PolynomialRing(ZZ, names=('x', 'y', 'z'))",
  "x, y, z = R.gens()",
  "left = (x+y+z+1)**7 + (x-y+2*z+3)**6 + y**5*z",
  "right = (2*x-y+z+2)**6 + (x+2*y-z+1)**5 + z**6",
  "value = left.resultant(right, x)",
  "print(value)",
  "print(value.number_of_terms())",
].join("\n");

function nativeResult(environment = {}) {
  const result = spawnSync(process.execPath, [
    path.join(repositoryRoot, "bin/sagejs"), "--python",
  ], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    input: source,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  // The line-oriented native CLI adds one final blank input-line echo that is
  // not part of the evaluated program's stdout contract.
  return `${result.stdout.trimEnd()}\n`;
}

function assertRoute(result) {
  assert.equal(result.stderr, "");
  assert.deepEqual(result.instrumentation.routes, [{
    capability_id: capability,
    selected_route: "receipt-backed-wasm-artifact",
    execution_target: "wasm-artifact",
    call_count: 1,
    ingress_bytes: 4_928,
    egress_bytes: 32_192,
  }]);
  assert.equal(result.instrumentation.boundary_crossings, 1);
  assert.equal(result.instrumentation.copied_bytes, 37_120);
  assert.equal(
    result.instrumentation.routes.some(
      ({ selected_route }) => selected_route === "portable-computation",
    ),
    false,
  );
}

test("public Node-Wasm resultant exactly matches both native Node routes", async () => {
  const expected = nativeResult();
  assert.equal(nativeResult({ SAGEJS_NATIVE_DISABLE: "1" }), expected);
  const session = await createSage({ timeout: 120_000 });
  try {
    const result = await session.evaluate(source, { timeout: 120_000 });
    assert.equal(result.stdout, expected);
    assert.match(result.stdout, /\n946\n$/);
    assertRoute(result);
  } finally {
    await session.close();
  }
});

const chromium = [
  process.env.SAGEJS_CHROMIUM,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean).find((candidate) => fs.existsSync(candidate));

test("a real browser executes and authenticates the public packed resultant", {
  skip: chromium ? false : "Chromium is not installed",
}, async () => {
  const expected = nativeResult();
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
      "Content-Type": contentTypes.get(path.extname(actual)) ?? "application/octet-stream",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    });
    fs.createReadStream(actual).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const chrome = spawn(chromium, [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    "--disable-gpu", "--remote-debugging-port=0", "about:blank",
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
        const session = await createSage();
        try {
          return await session.evaluate(${JSON.stringify(source)}, { timeout: 120000 });
        } finally {
          await session.close();
        }
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (evaluation.exceptionDetails) {
      throw new Error(evaluation.exceptionDetails.exception?.description ??
        evaluation.exceptionDetails.text);
    }
    const result = evaluation.result.value;
    assert.equal(result.stdout, expected);
    assertRoute(result);
    socket.close();
  } finally {
    chrome.kill("SIGTERM");
    await new Promise((resolve) => server.close(resolve));
  }
});

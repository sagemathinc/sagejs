import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import {
  createBrowserWasmServer,
  executablePathFor,
  securityHeaders,
} from "./browser-wasm-support.mjs";

const executablePath = executablePathFor("chromium", chromium);
assert.ok(executablePath, "Chromium is required for the browser Wasm security gate");
const server = await createBrowserWasmServer();
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const traversal = await fetch(`${server.origin}/%2e%2e/%2e%2e/etc/passwd`);
  assert.equal(traversal.status, 404);
  const response = await fetch(`${server.origin}/browser-wasm-harness.html`);
  for (const [name, value] of Object.entries(securityHeaders)) {
    assert.equal(response.headers.get(name), value, `${name} security policy drifted`);
  }
  assert.equal(response.headers.get("set-cookie"), null);

  const context = await browser.newContext({ serviceWorkers: "allow" });
  const page = await context.newPage();
  const consoleMessages = [];
  page.on("console", (message) => consoleMessages.push(message.text()));
  await page.goto(`${server.origin}/browser-wasm-harness.html`);
  await page.evaluate(() => window.__sagejsReady);
  assert.equal(await page.evaluate(() => globalThis.crossOriginIsolated), true);

  const forged = await page.evaluate(() => window.__sagejsTest.evaluate(`
from sagejs import runtime
target = runtime.global_object
if runtime.reflect.has(target, "postMessage"):
    result = runtime.object()
    runtime.reflect.set(result, "repr", "FORGED-BROWSER-PROTOCOL")
    message = runtime.object()
    runtime.reflect.set(message, "type", "result")
    runtime.reflect.set(message, "id", 1)
    runtime.reflect.set(message, "ok", True)
    runtime.reflect.set(message, "result", result)
    runtime.reflect.apply(runtime.reflect.get(target, "postMessage"), target, [message])
print("protocol-authenticated")
`, 10_000));
  assert.notEqual(forged.repr, "FORGED-BROWSER-PROTOCOL");
  assert.equal(
    forged.stdout,
    "protocol-authenticated\n",
    "evaluated source forged the kernel worker result protocol",
  );
  await page.evaluate(() => window.__sagejsTest.reset());

  const networkDenied = await page.evaluate(async () => {
    try {
      await fetch("https://example.invalid/should-not-be-requested");
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(networkDenied, true, "CSP unexpectedly allowed evaluator-origin network access");

  const interrupted = await page.evaluate(() =>
    window.__sagejsTest.interrupt("while True:\n    pass"),
  );
  assert.equal(interrupted.rejected, true);
  assert.ok(interrupted.latency_ms < 1500, `interrupt took ${interrupted.latency_ms} ms`);
  const afterInterrupt = await page.evaluate(() =>
    window.__sagejsTest.evaluate("print(6*7)", 10_000),
  );
  assert.equal(afterInterrupt.stdout, "42\n");

  const filesystemHeavy = await page.evaluate(() =>
    window.__sagejsTest.interrupt("factor(2^521 - 1)"),
  );
  assert.equal(filesystemHeavy.rejected, true);
  assert.ok(
    filesystemHeavy.latency_ms < 1500,
    `filesystem-heavy FLINT interruption took ${filesystemHeavy.latency_ms} ms`,
  );
  const afterFilesystemInterrupt = await page.evaluate(() =>
    window.__sagejsTest.evaluate("print(factor(42))", 10_000),
  );
  assert.equal(afterFilesystemInterrupt.stdout, "2 * 3 * 7\n");

  const boundedMemory = await page.evaluate(() => {
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 1 });
    try {
      memory.grow(1);
      return false;
    } catch (error) {
      return error instanceof RangeError;
    }
  });
  assert.equal(boundedMemory, true, "bounded WebAssembly memory did not refuse growth");
  assert.ok(
    consoleMessages.some((message) => message.includes("Content Security Policy")),
    "the denied connection did not produce a CSP diagnostic",
  );
  await context.close();
  console.log("Browser Wasm origin, CSP, interruption, restart, and memory checks passed");
} finally {
  await browser.close();
  await server.close();
}

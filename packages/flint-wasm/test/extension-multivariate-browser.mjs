import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright-core";
import {createBrowserWasmServer, executablePathFor} from "./browser-wasm-support.mjs";

test("extension multivariate specialist is fetched once on first public use", {timeout: 360000}, async () => {
  const executablePath = executablePathFor("chromium", chromium);
  assert.ok(executablePath, "Chromium is required for extension-field qualification");
  const server = await createBrowserWasmServer();
  let browser;
  try {
    browser = await chromium.launch({executablePath, headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"]});
    const context = await browser.newContext();
    const requests = [];
    context.on("request", request => {
      if (new URL(request.url()).pathname.endsWith("/flint-extension-multivariate.wasm")) {
        requests.push(request.url());
      }
    });
    const page = await context.newPage();
    await page.goto(`${server.origin}/browser-wasm-harness.html`);
    await page.evaluate(() => window.__sagejsReady);
    assert.equal(requests.length, 0, "extension arithmetic must not enlarge the startup binary closure");
    const source = await readFile(new URL("../../../test/extension-multivariate.py", import.meta.url), "utf8");
    const result = await page.evaluate(source => window.__sagejsTest.evaluate(source, 240000), source);
    assert.match(result.stdout, /finite-extension public multivariate arithmetic and bounded spill passed/);
    assert.equal(requests.length, 1, "all fields, orders, and spills share one authenticated reactor");
    const next = await page.evaluate(() => window.__sagejsTest.evaluate("2 + 2", 10000));
    assert.equal(next.repr, "4");
    assert.equal(requests.length, 1);
    await page.evaluate(() => window.__sagejsTest.close());
  } finally {
    await browser?.close();
    await server.close();
  }
});

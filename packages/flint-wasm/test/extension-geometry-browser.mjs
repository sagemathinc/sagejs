import assert from "node:assert/strict";
import test from "node:test";
import {extensionGeometryBatches} from "./extension-geometry-fixtures.mjs";
import {chromium} from "playwright-core";
import {createBrowserWasmServer, executablePathFor} from "./browser-wasm-support.mjs";

test("production Chromium exact extension ideals and geometry", {timeout: 1800000}, async () => {
  const executablePath = executablePathFor("chromium", chromium);
  assert.ok(executablePath, "Chromium is required for extension-field qualification");
  const server = await createBrowserWasmServer();
  let browser;
  try {
    browser = await chromium.launch({executablePath, headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"]});
    const page = await browser.newPage();
    await page.goto(`${server.origin}/browser-wasm-harness.html`);
    await page.evaluate(() => window.__sagejsReady);
    for await (const batch of extensionGeometryBatches()) {
      const started = Date.now();
      console.log("Chromium" + " starting " + batch.label);
      const result = await page.evaluate(source => window.__sagejsTest.evaluate(source, 240000), batch.source);
      assert.match(result.stdout, /finite-extension .* passed/, batch.label);
      console.log(`Chromium ${batch.label}: passed in ${Date.now() - started} ms`);
    }
    assert.equal((await page.evaluate(() => window.__sagejsTest.evaluate("2 + 2", 10000))).repr, "4");
    await page.evaluate(() => window.__sagejsTest.close());
  } finally {
    await browser?.close();
    await server.close();
  }
});

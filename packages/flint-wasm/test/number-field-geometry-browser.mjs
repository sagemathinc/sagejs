import assert from "node:assert/strict";
import test from "node:test";
import {numberFieldGeometryBatches} from "./number-field-geometry-fixtures.mjs";
import {chromium} from "playwright-core";
import {createBrowserWasmServer, executablePathFor} from "./browser-wasm-support.mjs";

test("production Chromium exact number-field geometry", {timeout: 3600000}, async () => {
  const executablePath = executablePathFor("chromium", chromium);
  assert.ok(executablePath, "Chromium is required for qualification");
  const server = await createBrowserWasmServer();
  let browser;
  try {
    browser = await chromium.launch({executablePath, headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"]});
    const page = await browser.newPage();
    await page.goto(`${server.origin}/browser-wasm-harness.html`);
    await page.evaluate(() => window.__sagejsReady);
    for await (const batch of numberFieldGeometryBatches()) {
      const started = Date.now();
      console.log(`Chromium starting ${batch.label}`);
      const result = await page.evaluate(source => window.__sagejsTest.evaluate(source, 350000), batch.source);
      assert.match(result.stdout, /passed/, batch.label);
      console.log(`Chromium ${batch.label}: passed in ${Date.now() - started} ms`);
    }
    await page.evaluate(() => window.__sagejsTest.close());
  } finally {
    await browser?.close();
    await server.close();
  }
});

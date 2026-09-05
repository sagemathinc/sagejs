import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createBrowserWasmServer, executablePathFor } from "./browser-wasm-support.mjs";

test("extension coefficient groundwork passes in production Chromium", { timeout: 180000 }, async () => {
  const executablePath = executablePathFor("chromium", chromium);
  assert.ok(executablePath, "Chromium is required for extension-field qualification");
  const server = await createBrowserWasmServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath, headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const page = await browser.newPage();
    await page.goto(`${server.origin}/browser-wasm-harness.html`);
    await page.evaluate(() => window.__sagejsReady);
    for (const name of ["extension-field-enumeration", "extension-field-coordinates", "exact-field-contract"]) {
      const source = await readFile(new URL(`../../../test/${name}.py`, import.meta.url), "utf8");
      const result = await page.evaluate((source) => window.__sagejsTest.evaluate(source, 60000), source);
      if (name === "extension-field-coordinates") {
        assert.ok((result.instrumentation?.routes ?? []).some((route) =>
          route.capability_id === "ffi:flint:fq_element_coordinate_bytes" &&
          route.selected_route === "receipt-backed-wasm-artifact" &&
          route.execution_target === "wasm-artifact" && route.call_count > 0),
        "coordinate conversion must execute the authenticated Wasm resource");
      }
    }
    await page.evaluate(() => window.__sagejsTest.close());
  } finally {
    await browser?.close();
    await server.close();
  }
});

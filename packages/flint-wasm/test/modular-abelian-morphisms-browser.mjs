import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { createBrowserWasmServer, executablePathFor } from "./browser-wasm-support.mjs";

const executablePath = executablePathFor("chromium", chromium);
assert.ok(executablePath, "Chromium is required for morphism parity");
const server = await createBrowserWasmServer();
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true, args:["--no-sandbox","--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  await page.goto(`${server.origin}/browser-wasm-harness.html`);
  await page.waitForFunction(() => window.__sagejsReady !== undefined);
  await page.evaluate(() => window.__sagejsReady);
  const source = readFileSync(new URL("../../../test/fixtures/modular-abelian-morphisms.py", import.meta.url),"utf8");
  const result = await page.evaluate(source => window.__sagejsTest.evaluate(source,290000),source);
  assert.equal(result.stdout.trim(),"integral morphism geometry passed");
  console.log(`Integral morphism Chromium parity passed (${result.duration_ms.toFixed(1)} ms)`);
} finally {
  await browser?.close();
  await server.close();
}

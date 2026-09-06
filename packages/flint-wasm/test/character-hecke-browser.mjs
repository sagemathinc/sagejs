import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createBrowserWasmServer, executablePathFor } from "./browser-wasm-support.mjs";
import { publicGapCases } from "./public-gap-closure-support.mjs";
import { characterHeckeCases } from "./character-hecke-support.mjs";

const executablePath = executablePathFor("chromium", chromium);
assert.ok(executablePath, "Chromium is required for character-Hecke qualification");
const server = await createBrowserWasmServer();
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  await page.goto(`${server.origin}/browser-wasm-harness.html`);
  await page.waitForFunction(() => window.__sagejsReady !== undefined);
  await page.evaluate(() => window.__sagejsReady);
  for (const item of [publicGapCases[1], ...characterHeckeCases]) {
    const result = await page.evaluate(
      (source) => window.__sagejsTest.evaluate(source, 120000), item.source);
    assert.equal(result.repr, item.expected, item.name);
    console.log(`${item.name}: exact browser result passed (${result.duration_ms.toFixed(1)} ms)`);
  }
} finally {
  await browser?.close();
  await server.close();
}

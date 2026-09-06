// Run after the Wasm build: node test/python-protocol-browser.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import {
  createBrowserWasmServer, executablePathFor,
} from "../packages/flint-wasm/test/browser-wasm-support.mjs";

const executablePath = executablePathFor("chromium", chromium);
assert.ok(executablePath, "Chromium is required for Python browser qualification");
const server = await createBrowserWasmServer();
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  await page.addInitScript(() => { window.__sagejsTestOptions = { mode: "python" }; });
  for (const fixture of [
    "python-callable-instance-descriptors.py", "python-generator-type.py",
    "isinstance-call-identity.py", "python-module-delete-fallback.py",
    "python-nested-class-bases.py", "python-public-super.py",
  ]) {
    await page.goto(`${server.origin}/browser-wasm-harness.html`);
    await page.waitForFunction(() => window.__sagejsReady !== undefined);
    await page.evaluate(() => window.__sagejsReady);
    const source = await readFile(new URL(`./fixtures/${fixture}`, import.meta.url), "utf8");
    const result = await page.evaluate(
      (code) => window.__sagejsTest.evaluate(code + '\nprint("browser-protocol-ok")\n', 120000), source);
    assert.match(result.stdout, /browser-protocol-ok\s*$/, fixture);
    await page.evaluate(() => window.__sagejsTest.close());
    console.log(`${fixture}: passed in the Python browser worker`);
  }
} finally {
  await browser?.close();
  await server.close();
}

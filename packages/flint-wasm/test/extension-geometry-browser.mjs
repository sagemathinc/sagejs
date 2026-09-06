import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright-core";
import {createBrowserWasmServer, executablePathFor} from "./browser-wasm-support.mjs";

test("production Chromium exact extension ideals and geometry", {timeout: 900000}, async () => {
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
    for (const name of ["extension-ideals", "extension-geometry", "extension-zero-dimensional"]) {
      const started = Date.now();
      const source = await readFile(new URL(`../../../test/${name}.py`, import.meta.url), "utf8");
      const result = await page.evaluate(source => window.__sagejsTest.evaluate(source, 240000), source);
      assert.match(result.stdout, /finite-extension .* passed/);
      console.log(`Chromium ${name}: passed in ${Date.now() - started} ms`);
    }
    const fixture = JSON.parse(await readFile(new URL(
      "../../../test/fixtures/extension-geometry-sage-oracles-v1.json", import.meta.url), "utf8"));
    const source = "import json\n_extension_geometry_cases = json.loads(" +
      JSON.stringify(JSON.stringify(fixture.cases)) + ")\n" + await readFile(new URL(
        "../../../test/extension-geometry-oracles.py", import.meta.url), "utf8");
    const result = await page.evaluate(source => window.__sagejsTest.evaluate(source, 240000), source);
    assert.match(result.stdout, /geometry matches independent Sage fixtures passed/);
    assert.equal((await page.evaluate(() => window.__sagejsTest.evaluate("2 + 2", 10000))).repr, "4");
    await page.evaluate(() => window.__sagejsTest.close());
  } finally {
    await browser?.close();
    await server.close();
  }
});

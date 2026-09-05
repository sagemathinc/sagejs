import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createBrowserWasmServer, executablePathFor } from "./browser-wasm-support.mjs";

const exhaustive = process.env.SAGEJS_EXTENSION_FIELDS_FULL === "1";
test("extension coefficient groundwork passes in production Chromium", { timeout: exhaustive ? 900000 : 180000 }, async () => {
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
    const corpus = JSON.parse(await readFile(new URL(
      "../../../test/fixtures/extension-fields-sage-oracles-v1.json", import.meta.url,
    ), "utf8"));
    const fixture = await readFile(
      new URL("../../../test/generic-groebner.py", import.meta.url), "utf8",
    );
    const batches = exhaustive
      ? Array.from({ length: 6 }, (_, i) => corpus.cases.slice(i * 18, (i + 1) * 18))
      : [[3, 29, 52, 57, 82, 107].map(i => corpus.cases[i])];
    for (const [index, cases] of batches.entries()) {
      const started = Date.now();
      const source = "import json\n_extension_field_cases = json.loads(" +
        JSON.stringify(JSON.stringify(cases)) + ")\n" + fixture;
      const result = await page.evaluate((source) =>
        window.__sagejsTest.evaluate(source, 120000), source);
      assert.match(result.stdout, /generic exact-field Sage fixtures passed/);
      console.log(`Chromium Gröbner batch ${index + 1}/${batches.length}: ${cases.length} cases passed in ${Date.now() - started} ms`);
    }
    await page.evaluate(() => window.__sagejsTest.close());
  } finally {
    await browser?.close();
    await server.close();
  }
});

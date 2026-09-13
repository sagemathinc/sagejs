import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";

import {
  createBrowserWasmServer,
  executablePathFor,
  packageRoot,
} from "./browser-wasm-support.mjs";

const require = createRequire(import.meta.url);
const { CORE_STANDALONE_MODULES } = require("../../../tools/standalone-library.cjs");
const document = JSON.parse(fs.readFileSync(
  path.join(packageRoot, "dist", "stdlib.json"), "utf8",
));
assert.deepEqual(document.coreStandalone, CORE_STANDALONE_MODULES);
for (const name of document.coreStandalone) {
  assert.ok(document.modules[name], `missing production core module: ${name}`);
}
assert.ok(document.coreStandalone.includes("sagejs._introspection"));

const executablePath = executablePathFor("chromium", chromium);
assert.ok(executablePath, "Chromium is required for implicit core acceptance");
const server = await createBrowserWasmServer();
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  const errors = [];
  const fetchedLibraries = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("response", response => {
    if (new URL(response.url()).pathname === "/dist/stdlib.json") {
      fetchedLibraries.push(response.status());
    }
  });
  await page.goto(`${server.origin}/browser-wasm-harness.html`);
  await page.waitForFunction(() => window.__sagejsReady !== undefined);
  await page.evaluate(() => window.__sagejsReady);
  const result = await page.evaluate(() => window.__sagejsTest.evaluate(
    "%%python\nassert 'append' in dir([])\nhelp(len)\nprint('implicit-core-ok')\n",
    30_000,
  ));
  assert.match(result.stdout, /implicit-core-ok/);
  assert.match(result.stdout, /len/);
  assert.equal(errors.length, 0, errors.join("\n"));
  assert.ok(fetchedLibraries.length > 0, "worker must load the production document");
  assert.ok(fetchedLibraries.every(status => status === 200));
  console.log("Production browser manifest and implicit core operations passed");
} finally {
  await browser.close();
  await server.close();
}

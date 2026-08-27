// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { existsSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const releaseArtifactAvailable = [
  "wasi-runtime.mjs",
  "production-manifest.json",
  "build-receipt.json",
].every((name) =>
  existsSync(join(__dirname, "../packages/flint-wasm/dist", name))
);
const releaseArtifactSkip = releaseArtifactAvailable
  ? false
  : "build the FLINT Wasm release artifact first";

test("repeated 64 by 64 elliptic complex plots do not retain numeric resources", {
  skip: releaseArtifactSkip,
}, async () => {
  const { chromium } = await import("playwright-core");
  const {
    createBrowserWasmServer,
    executablePathFor,
  } = await import("../packages/flint-wasm/test/browser-wasm-support.mjs");

  const executablePath = executablePathFor("chromium", chromium);
  assert.ok(executablePath, "a compatible Chromium executable is required");
  const server = await createBrowserWasmServer();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const context = await browser.newContext({ serviceWorkers: "allow" });
    const page = await context.newPage();
    await page.goto(`${server.origin}/browser-wasm-harness.html`, {
      waitUntil: "load",
    });
    await page.waitForFunction(() => window.__sagejsReady !== undefined);
    await page.evaluate(() => window.__sagejsReady);
    const result = await page.evaluate(() => window.__sagejsTest.evaluate([
      "import sagejs.runtime as rt",
      "backend = rt.flint_backend()",
      "before = backend.numericLiveCount()",
      "E = EllipticCurve([0,0,1,-1,0])",
      "L = E.lseries()",
      "first = complex_plot(L,(0,2),(-4,4),plot_points=64,interpolation='nearest')",
      "after_first = backend.numericLiveCount()",
      "second = complex_plot(L,(0,2),(-4,4),plot_points=64,interpolation='nearest')",
      "after_second = backend.numericLiveCount()",
      "[before, after_first, after_second,",
      " first._plot_spec_diagnostics[0]['pixel_count'],",
      " second._plot_spec_diagnostics[0]['pixel_count']]",
    ].join("\n"), 240_000));
    assert.equal(result.repr, "[0, 0, 0, 4096, 4096]");
    await context.close();
  } finally {
    await browser.close();
    await server.close();
  }
});

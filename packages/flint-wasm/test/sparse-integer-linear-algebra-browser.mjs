import assert from "node:assert/strict";
import { chromium, firefox, webkit } from "playwright-core";

import {
  createBrowserWasmServer,
  executablePathFor,
  parseEngineList,
} from "./browser-wasm-support.mjs";
import {
  assertPublicSparseIntegerReceipt,
  expectedStdout,
  publicSource,
} from "./sparse-integer-linear-algebra-support.mjs";

const engines = parseEngineList(
  process.env.SAGEJS_BROWSER_ENGINES ?? "chromium",
);
const required = new Set(parseEngineList(
  process.env.SAGEJS_REQUIRED_BROWSER_ENGINES ?? engines.join(","),
));
const browserTypes = { chromium, firefox, webkit };
const server = await createBrowserWasmServer();

try {
  for (const engine of engines) {
    const browserType = browserTypes[engine];
    const executablePath = executablePathFor(engine, browserType);
    if (!executablePath) {
      if (required.has(engine)) {
        throw new Error(`${engine} is required but unavailable`);
      }
      continue;
    }
    const browser = await browserType.launch({
      executablePath,
      headless: true,
      args: engine === "chromium"
        ? ["--no-sandbox", "--disable-dev-shm-usage"]
        : [],
    });
    try {
      const page = await browser.newPage();
      await page.goto(`${server.origin}/browser-wasm-harness.html`, {
        waitUntil: "load",
      });
      await page.waitForFunction(() => window.__sagejsReady !== undefined);
      await page.evaluate(() => window.__sagejsReady);
      const result = await page.evaluate(
        ([source, timeout]) => window.__sagejsTest.evaluate(source, timeout),
        [publicSource, 120_000],
      );
      assert.equal(result.stdout, expectedStdout, `${engine} public result`);
      assertPublicSparseIntegerReceipt(result.instrumentation);
      console.log(
        `${engine}: public sparse ZZ right kernel used FLINT Wasm in ` +
        `${result.duration_ms.toFixed(1)}ms`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}

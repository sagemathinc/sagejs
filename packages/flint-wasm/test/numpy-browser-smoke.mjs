import assert from "node:assert/strict";
import { chromium, firefox, webkit } from "playwright-core";

import {
  createBrowserWasmServer,
  executablePathFor,
  parseEngineList,
} from "./browser-wasm-support.mjs";

const engines = parseEngineList(
  process.env.SAGEJS_BROWSER_ENGINES ?? "chromium",
);
const required = new Set(parseEngineList(
  process.env.SAGEJS_REQUIRED_BROWSER_ENGINES ?? engines.join(","),
));
const browserTypes = { chromium, firefox, webkit };
const source = [
  "import numpy as np",
  "a = np.arange(1, 13, dtype=np.float64).reshape(3, 4)",
  "print(np.mean(a, axis=1).tolist())",
  "print(np.linalg.solve(np.array([[4., 7.], [2., 6.]]), np.array([1., 0.])).tolist())",
  "spectrum = np.fft.fft(np.array([0., 1., 0., -1.]))",
  "print([[round(z.real, 12), round(z.imag, 12)] for z in spectrum])",
  "np.random.seed(2026)",
  "print(np.random.randint(0, 100, size=(2, 4)).tolist())",
].join("\n");
const expected = [
  "[2.5, 6.5, 10.5]",
  "[0.6000000000000001, -0.2]",
  "[[0.0, 0.0], [0.0, -2.0], [0.0, 0.0], [0.0, 2.0]]",
  "[[1, 6, 26, 56], [77, 77, 29, 28]]",
  "",
].join("\n");

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
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(String(error)));
      await page.goto(`${server.origin}/browser-wasm-harness.html`, {
        waitUntil: "load",
      });
      await page.waitForFunction(() => window.__sagejsReady !== undefined);
      await page.evaluate(() => window.__sagejsReady);
      const result = await page.evaluate(
        ([program, timeout]) => window.__sagejsTest.evaluate(program, timeout),
        [source, 120_000],
      );
      assert.equal(result.stdout, expected, `${engine} NumPy output`);
      assert.deepEqual(pageErrors, [], `${engine} page errors`);
      console.log(`${engine}: broad NumPy browser workflow passed`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}

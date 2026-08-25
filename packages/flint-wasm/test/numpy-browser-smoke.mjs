import assert from "node:assert/strict";
import { chromium, firefox, webkit } from "playwright-core";

import {
  createBrowserWasmServer,
  executablePathFor,
  parseEngineList,
} from "./browser-wasm-support.mjs";
import { EXAMPLES } from "../../../website/live/examples.mjs";

const engines = parseEngineList(
  process.env.SAGEJS_BROWSER_ENGINES ?? "chromium",
);
const required = new Set(parseEngineList(
  process.env.SAGEJS_REQUIRED_BROWSER_ENGINES ?? engines.join(","),
));
const browserTypes = { chromium, firefox, webkit };
const example = EXAMPLES.find(({ id }) => id === "numpy-signal-recovery");
assert.ok(example, "missing live NumPy signal-recovery example");
const source = example.source;
const expected = [
  "dominant frequency bins: [19, 7]",
  "recovered coefficients: [1.721, -0.011, -0.007, 0.892]",
  "fit RMSE: 0.018268",
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
      assert.ok(
        result.instrumentation.routes.some(
          (route) =>
            route.capability_id === "specialist:numpy-ts" &&
            route.selected_route === "receipt-backed-wasm-artifact" &&
            route.execution_target === "wasm-artifact",
        ),
        `${engine} did not select the authenticated numpy-ts specialist`,
      );
      assert.deepEqual(pageErrors, [], `${engine} page errors`);
      console.log(`${engine}: broad NumPy browser workflow passed`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}

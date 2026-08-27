import assert from "node:assert/strict";
import { chromium, firefox, webkit } from "playwright-core";

import {
  createBrowserWasmServer,
  executablePathFor,
  parseEngineList,
} from "./browser-wasm-support.mjs";

const engines = parseEngineList(
  process.env.SAGEJS_BROWSER_ENGINES ?? "chromium,firefox,webkit",
);
const required = new Set(parseEngineList(
  process.env.SAGEJS_REQUIRED_BROWSER_ENGINES ?? engines.join(","),
));
const browserTypes = { chromium, firefox, webkit };
const setup = `%%python
from array import array
import time

def recurrence(n: int, value: float, multiplier: float, increment: float) -> float:
    for index in range(n):
        value = value*multiplier + increment
    return value

def bits(value):
    return array('d', [value]).tobytes().hex()

recurrence(100000, 0.125, 1.0000001192092896, 1e-9)
`;
const workload = `${setup}
started = time.perf_counter()
answer = recurrence(1000000, 0.125, 1.0000001192092896, 1e-9)
elapsed = time.perf_counter() - started
print(bits(answer), type(answer) is float, elapsed)
`;

const server = await createBrowserWasmServer();
try {
  for (const engine of engines) {
    const browserType = browserTypes[engine];
    const executablePath = executablePathFor(engine, browserType);
    if (!executablePath) {
      if (required.has(engine)) throw new Error(`${engine} is required but unavailable`);
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
      const [optimized, generic] = await Promise.all([
        page.evaluate(
          ([source, optimizationLevel]) =>
            window.__sagejsTest.evaluate(source, 30_000, optimizationLevel),
          [workload, "O2"],
        ),
        page.evaluate(
          ([source, optimizationLevel]) =>
            window.__sagejsTest.evaluate(source, 30_000, optimizationLevel),
          [workload, "O0"],
        ),
      ]);
      const optimizedFields = optimized.stdout.trim().split(/\s+/);
      const genericFields = generic.stdout.trim().split(/\s+/);
      assert.deepEqual(
        optimizedFields.slice(0, 2),
        genericFields.slice(0, 2),
        `${engine} O0 differential`,
      );
      assert.deepEqual(
        optimizedFields.slice(0, 2),
        ["4bac70c06029c23f", "True"],
        `${engine} bits`,
      );
      const optimizedKernelMs = Number(optimizedFields[2]) * 1000;
      const genericKernelMs = Number(genericFields[2]) * 1000;
      assert.ok(Number.isFinite(optimizedKernelMs) && optimizedKernelMs > 0);
      assert.ok(Number.isFinite(genericKernelMs) && genericKernelMs > 0);
      assert.ok(
        optimizedKernelMs * 3 < genericKernelMs,
        `${engine} strict float path ${optimizedKernelMs.toFixed(2)}ms ` +
          `was not materially faster than O0 ${genericKernelMs.toFixed(2)}ms`,
      );
      assert.deepEqual(pageErrors, [], `${engine} page errors`);
      console.log(
        `${engine}: strict binary64 ${optimizedKernelMs.toFixed(2)}ms; ` +
          `O0 ${genericKernelMs.toFixed(2)}ms; ` +
          `cell ${optimized.duration_ms.toFixed(2)}/${generic.duration_ms.toFixed(2)}ms`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}

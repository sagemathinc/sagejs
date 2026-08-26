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
const source = String.raw`
import time


def recurrence(count, parent):
    value = parent(1)
    multiplier = parent(12345)
    increment = parent(6789)
    index = 777
    for index in range(count):
        value = value * multiplier + increment
    return int(value), index


field = GF(65521)
recurrence(1000000, field)
started = time.time()
answer = recurrence(10000000, field)
elapsed = time.time() - started
print(answer, elapsed < 0.75)
print(recurrence(0, field))
print(recurrence(29, GF(94906297)))
`;
const expected = [
  "(19598, 9999999) True",
  "(1, 777)",
  "(9497506, 28)",
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
      assert.equal(result.stdout, expected, `${engine} recurrence output`);
      assert.deepEqual(pageErrors, [], `${engine} page errors`);
      console.log(
        `${engine}: guarded finite-field compiler recurrence and exact fallback passed`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}

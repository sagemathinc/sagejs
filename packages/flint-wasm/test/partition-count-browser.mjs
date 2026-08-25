import assert from "node:assert/strict";
import { chromium, firefox, webkit } from "playwright-core";

import {
  createBrowserWasmServer,
  executablePathFor,
  parseEngineList,
} from "./browser-wasm-support.mjs";

const routeId = "ffi:flint:arith_number_of_partitions";
const engines = parseEngineList(
  process.env.SAGEJS_BROWSER_ENGINES ?? "chromium,firefox,webkit",
);
const required = new Set(parseEngineList(
  process.env.SAGEJS_REQUIRED_BROWSER_ENGINES ?? engines.join(","),
));
const browserTypes = { chromium, firefox, webkit };
const publicSource = [
  "value = number_of_partitions(10^6)",
  "cls = Partitions(100, max_part=20)",
  "part = cls.unrank(12345)",
  "print(len(str(value)), value % 10^12)",
  "print(cls.cardinality(), cls.rank(part), part)",
  "large = Partitions(10000)",
  "try:",
  "    large.unrank(1)",
  "except RuntimeError as error:",
  "    print(str(error), large._table is None)",
].join("\n");
const expectedStdout = [
  "1108 467104673818",
  "97132873 12345 [20, 20, 20, 12, 11, 5, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]",
  "partition ranking table requires 50015001 cells, exceeding the reviewed maximum 1000000 True",
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
        ([source, timeout]) => window.__sagejsTest.evaluate(source, timeout),
        [publicSource, 120_000],
      );
      assert.equal(result.stdout, expectedStdout, `${engine} partition output`);
      assert.deepEqual(
        result.instrumentation.routes.find(
          (route) => route.capability_id === routeId,
        ),
        {
          capability_id: routeId,
          selected_route: "receipt-backed-wasm-artifact",
          execution_target: "wasm-artifact",
          call_count: 1,
          ingress_bytes: 0,
          egress_bytes: 0,
        },
        `${engine} partition route`,
      );

      const interrupted = await page.evaluate(() =>
        window.__sagejsTest.interrupt(
          "cls=Partitions(1400)\ncls.unrank(cls.cardinality() // 2)",
        ),
      );
      assert.equal(interrupted.rejected, true, `${engine} interruption`);
      assert.ok(
        interrupted.latency_ms < 1500,
        `${engine} partition interruption took ${interrupted.latency_ms} ms`,
      );

      const recovered = await page.evaluate(() =>
        window.__sagejsTest.evaluate("number_of_partitions(100)", 10_000),
      );
      assert.equal(recovered.repr, "190569292", `${engine} recovery result`);
      assert.equal(
        recovered.instrumentation.routes.find(
          (route) => route.capability_id === routeId,
        )?.selected_route,
        "receipt-backed-wasm-artifact",
        `${engine} recovery route`,
      );
      assert.deepEqual(pageErrors, [], `${engine} page errors`);
      console.log(
        `${engine}: partition Wasm route, memory ceiling, interruption, and recovery passed`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}

// sagejs-test-tier: specialized

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const backendPath = resolve(
  root,
  "packages/flint-wasm/experimental/numerical-p3-backends/backend.mjs",
);
const wasmPath = resolve(
  root,
  "packages/flint-wasm/experimental/numerical-p3-backends/build/p3-cminpack.wasm",
);
const html = `<!doctype html><script type="module">
import { createCminpackPrototype } from "/backend.mjs";
const bytes = await (await fetch("/backend.wasm")).arrayBuffer();
const solver = await createCminpackPrototype(bytes);
const result = solver.leastSquares({
  initial: [-1.2, 1], residualCount: 2,
  residual: ([x, y]) => [10 * (y - x * x), 1 - x],
  jacobian: ([x]) => [[-20 * x, 10], [-1, 0]],
  maximumEvaluations: 300,
});
globalThis.__p3Result = { result, inspect: solver.inspect() };
</script>`;

const server = createServer(async (request, response) => {
  try {
    if (request.url === "/backend.mjs") {
      response.setHeader("content-type", "text/javascript");
      response.end(await readFile(backendPath));
    } else if (request.url === "/backend.wasm") {
      response.setHeader("content-type", "application/wasm");
      response.end(await readFile(wasmPath));
    } else {
      response.setHeader("content-type", "text/html");
      response.end(html);
    }
  } catch (error) {
    response.statusCode = 500;
    response.end(String(error));
  }
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const address = server.address();
const chromiumPath =
  process.env.SAGEJS_CHROMIUM_PATH ??
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
  execFileSync("which", ["chromium"], { encoding: "utf8" }).trim();
const browser = await chromium.launch({
  executablePath: chromiumPath,
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await page.waitForFunction(() => globalThis.__p3Result != null);
  const receipt = await page.evaluate(() => globalThis.__p3Result);
  assert.equal(receipt.result.success, true);
  assert.equal(receipt.result.method, "cminpack-lmder");
  assert.ok(Math.abs(receipt.result.value[0] - 1) < 1e-10);
  assert.ok(Math.abs(receipt.result.value[1] - 1) < 1e-10);
  assert.equal(receipt.inspect.liveAllocations, 0);
  assert.equal(receipt.inspect.activeContexts, 0);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
} finally {
  await browser.close();
  await new Promise((resolveClose, rejectClose) =>
    server.close((error) => (error ? rejectClose(error) : resolveClose())),
  );
}

// sagejs-test-tier: specialized
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright-core";
import {
  createBrowserWasmServer, executablePathFor, repositoryRoot,
} from "../../../packages/flint-wasm/test/browser-wasm-support.mjs";

// This is the real public worker and ordinary fallback, not an isolated Wasm
// kernel witness. A native request must not pretend to select an unshipped
// prepared-Wasm workspace. Use the same ownership/failure corpus as Node.
const names = process.argv.slice(2);
if (names.length === 0) names.push("chromium", "firefox", "webkit");
const engines = {chromium, firefox, webkit};
assert.equal(new Set(names).size, names.length, "duplicate browser");
for (const name of names) assert.ok(Object.hasOwn(engines, name), `unknown browser ${name}`);
const source = 'EXPECTED_BACKEND = "ordinary-python"\n' + fs.readFileSync(
  path.join(repositoryRoot, "test/numerics/performance/prepared-statistics.py"), "utf8",
);
const server = await createBrowserWasmServer();
try {
  for (const name of names) {
    const engine = engines[name], executablePath = executablePathFor(name, engine);
    assert.ok(executablePath, `${name} is required; missing is not a passing skip`);
    const browser = await engine.launch({executablePath, headless:true,
      ...(name === "chromium" ? {args:["--no-sandbox", "--disable-dev-shm-usage"]} : {})});
    try {
      const page = await browser.newPage(), errors = [], unrelatedLoads = [];
      page.on("pageerror", error => errors.push(String(error)));
      page.on("request", request => {
        const pathname = new URL(request.url()).pathname;
        if (/\/(?:flint-factor|flint-algebraic|m4ri-resource)\.wasm$|\/plotly\.min\.js$/.test(pathname)) {
          unrelatedLoads.push(pathname);
        }
      });
      await page.addInitScript(() => { window.__sagejsTestOptions = {mode:"python"}; });
      await page.goto(`${server.origin}/browser-wasm-harness.html`, {waitUntil:"load"});
      await page.waitForFunction(() => window.__sagejsReady !== undefined);
      await page.evaluate(() => window.__sagejsReady);
      // The existing evaluator eagerly initializes exact backends at startup.
      // Record that outstanding startup gap; this test only requires that the
      // subsequent numerical operation adds no unrelated backend downloads.
      const startupLoads = [...unrelatedLoads];
      const result = await page.evaluate(program => window.__sagejsTest.evaluate(program, 300000), source);
      assert.equal(result.stdout.trim(), "prepared statistics passed");
      assert.equal(result.stderr, "");
      assert.deepEqual(errors, []);
      const addedLoads = unrelatedLoads.slice(startupLoads.length);
      assert.deepEqual(addedLoads, [], "statistics must not add exact arithmetic or Plotly loads");
      await page.evaluate(() => window.__sagejsTest.close());
      console.log(JSON.stringify({engine:name,scope:"public-worker-ordinary-fallback",
        startup_exact_or_plotly_requests:startupLoads,added_exact_or_plotly_requests:addedLoads,
        lightweight_startup:startupLoads.length===0,correctness:"passed"}));
    } finally { await browser.close(); }
  }
} finally { await server.close(); }

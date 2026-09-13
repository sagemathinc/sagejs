// sagejs-test-tier: specialized
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright-core";
import {
  createBrowserWasmServer,
  executablePathFor,
  repositoryRoot,
} from "../../../packages/flint-wasm/test/browser-wasm-support.mjs";

const names = process.argv.slice(2);
if (names.length === 0) names.push("chromium", "firefox", "webkit");
const engines = { chromium, firefox, webkit };
assert.equal(new Set(names).size, names.length, "duplicate browser");
for (const name of names) assert.ok(Object.hasOwn(engines, name), `unknown browser ${name}`);
const source = fs.readFileSync(
  path.join(repositoryRoot, "test/numerics/performance/trace-accounting.py"), "utf8",
);
const server = await createBrowserWasmServer();
try {
  for (const name of names) {
    const engine = engines[name];
    const executablePath = executablePathFor(name, engine);
    assert.ok(executablePath, `${name} is required; missing is not a qualification pass`);
    const browser = await engine.launch({
      executablePath,
      headless: true,
      ...(name === "chromium" ? { args: ["--no-sandbox", "--disable-dev-shm-usage"] } : {}),
    });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(String(error)));
      await page.addInitScript(() => { window.__sagejsTestOptions = { mode: "python" }; });
      await page.goto(`${server.origin}/browser-wasm-harness.html`, { waitUntil: "load" });
      await page.waitForFunction(() => window.__sagejsReady !== undefined);
      await page.evaluate(() => window.__sagejsReady);
      const result = await page.evaluate(
        program => window.__sagejsTest.evaluate(program, 300_000), source,
      );
      assert.equal(result.stdout.trim(), "trace accounting passed");
      assert.equal(result.stderr, "");
      assert.deepEqual(errors, []);
      await page.evaluate(() => window.__sagejsTest.close());
      console.log(`${name}: complete public-worker trace accounting oracle passed`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}

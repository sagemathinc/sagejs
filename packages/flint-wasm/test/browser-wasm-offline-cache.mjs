import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import {
  createBrowserWasmServer,
  executablePathFor,
} from "./browser-wasm-support.mjs";

const executablePath = executablePathFor("chromium", chromium);
assert.ok(executablePath, "Chromium is required for the offline/cache gate");
const server = await createBrowserWasmServer({ release: "v1" });
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({ serviceWorkers: "allow" });
const page = await context.newPage();

async function activate(release) {
  await page.goto(`${server.origin}/browser-wasm-harness.html?release=${release}`);
  await page.evaluate(() => window.__sagejsReady);
  await page.evaluate(async (name) => {
    const registration = await navigator.serviceWorker.register(
      `/browser-wasm-test-sw.js?release=${encodeURIComponent(name)}`,
      { scope: "/", updateViaCache: "none" },
    );
    await registration.update();
    const worker = registration.installing ?? registration.waiting ?? registration.active;
    if (worker && worker.state !== "activated") {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("service worker activation timed out")), 30_000);
        worker.addEventListener("statechange", () => {
          if (worker.state === "activated") {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
    }
    await navigator.serviceWorker.ready;
  }, release);
  if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) {
    await page.reload();
    await page.evaluate(() => window.__sagejsReady);
  }
  assert.equal(await page.evaluate(() => navigator.serviceWorker.controller !== null), true);
}

async function proveOffline(expected) {
  await context.setOffline(true);
  await server.setReachable(false);
  const before = server.requests.length;
  try {
    await page.reload({ waitUntil: "load" });
    await page.evaluate(() => window.__sagejsReady);
    const result = await page.evaluate(() =>
      window.__sagejsTest.evaluate("print(factor(2026))", 15_000),
    );
    assert.equal(result.stdout, expected);
    assert.equal(server.requests.length, before, "offline reload unexpectedly reached the origin");
  } finally {
    await server.setReachable(true);
    await context.setOffline(false);
  }
}

try {
  await activate("v1");
  await proveOffline("2 * 1013\n");
  await activate("v2");
  await proveOffline("2 * 1013\n");
  await activate("v1");
  await proveOffline("2 * 1013\n");
  const cacheNames = await page.evaluate(() => caches.keys());
  assert.ok(cacheNames.includes("sagejs-v1"));
  assert.ok(cacheNames.includes("sagejs-v2"));
  console.log("Browser Wasm offline, cache upgrade, and rollback checks passed");
} finally {
  await context.setOffline(false);
  await context.close();
  await browser.close();
  await server.close();
}

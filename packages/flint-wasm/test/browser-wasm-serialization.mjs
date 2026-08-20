import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import {
  createBrowserWasmServer,
  executablePathFor,
} from "./browser-wasm-support.mjs";
import {
  pack,
  unpack,
} from "../dist/serialization.mjs";

const executablePath = executablePathFor("chromium", chromium);
assert.ok(executablePath, "Chromium is required for Node/browser serialization parity");
const server = await createBrowserWasmServer();
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  await page.goto(`${server.origin}/browser-wasm-harness.html`);
  const fromNode = pack([
    0,
    2n ** 120n + 17n,
    "node-to-browser",
    new Uint8Array([0, 1, 127, 255]),
  ]);
  const browserRoundtrip = await page.evaluate(async (bytes) => {
    const serialization = await import("/dist/serialization.mjs");
    const value = serialization.unpack(Uint8Array.from(bytes));
    return Array.from(serialization.pack(value));
  }, Array.from(fromNode));
  assert.deepEqual(Uint8Array.from(browserRoundtrip), fromNode);

  const fromBrowser = Uint8Array.from(await page.evaluate(async () => {
    const serialization = await import("/dist/serialization.mjs");
    return Array.from(serialization.pack([
      0,
      2n ** 160n + 29n,
      "browser-to-node",
      new Uint8Array([255, 127, 1, 0]),
    ]));
  }));
  assert.deepEqual(unpack(fromBrowser), [
    0,
    2n ** 160n + 29n,
    "browser-to-node",
    new Uint8Array([255, 127, 1, 0]),
  ]);
  await page.close();
  console.log("SagePack Node-to-browser and browser-to-Node bytes are identical");
} finally {
  await browser.close();
  await server.close();
}

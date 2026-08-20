import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import {
  createBrowserWasmServer,
  executablePathFor,
} from "./browser-wasm-support.mjs";
import {
  pack,
  packPython,
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

  assert.deepEqual(
    packPython([1, -2, 3]),
    packPython([1n, -2n, 3n]),
  );
  assert.equal(await page.evaluate(async () => {
    const serialization = await import("/dist/serialization.mjs");
    const numbers = serialization.packPython([1, -2, 3]);
    const bigints = serialization.packPython([1n, -2n, 3n]);
    return numbers.length === bigints.length &&
      numbers.every((value, index) => value === bigints[index]);
  }), true);

  await page.waitForFunction(() => window.__sagejsReady !== undefined);
  await page.evaluate(() => window.__sagejsReady);
  const hashlib = await page.evaluate(() => window.__sagejsTest.evaluate(
    "import hashlib\n" +
      "print(hashlib.sha256(b'').hexdigest())\n" +
      "base = hashlib.sha256()\n" +
      "base.update(b'a')\n" +
      "copied = base.copy()\n" +
      "base.update(b'bc')\n" +
      "copied.update(b'b')\n" +
      "copied.update(b'c')\n" +
      "print(base.hexdigest())\n" +
      "print(copied.hexdigest())\n" +
      "print(base.digest() == bytes([186, 120, 22, 191, 143, 1, 207, 234, 65, 65, 64, 222, 93, 174, 34, 35, 176, 3, 97, 163, 150, 23, 122, 156, 180, 16, 255, 97, 242, 0, 21, 173]))\n" +
      "print(hashlib.sha256(b'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq').hexdigest())",
    120_000,
  ));
  assert.equal(hashlib.repr, "");
  assert.equal(
    hashlib.stdout,
    [
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      "True",
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
      "",
    ].join("\n"),
  );
  await page.close();
  console.log(
    "SagePack bytes and synchronous browser SHA-256 vectors are identical",
  );
} finally {
  await browser.close();
  await server.close();
}

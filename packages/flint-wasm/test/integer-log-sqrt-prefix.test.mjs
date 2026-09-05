import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { chromium } from "playwright-core";
import { instantiateFlintFactor } from "../index.mjs";
import { createBrowserWasmServer, executablePathFor } from "./browser-wasm-support.mjs";

test("production Wasm Arb prefix ignores poisoned tails and rejects active poison before mutation", async () => {
  const flint = await instantiateFlintFactor(await fs.readFile(
    new URL("../dist/flint-factor.wasm", import.meta.url),
  ));
  const source = flint.ffiFmpzMatrixCreate(3n, 1n);
  const output = flint.ffiFmpzMatrixCreate(13n, 1n);
  try {
    for (const [index, value] of [1n, 4n, -1n].entries()) {
      flint.ffiFmpzMatrixSetEntry(source, BigInt(index), 0n, value);
    }
    for (let index = 0n; index < 13n; index += 1n) {
      flint.ffiFmpzMatrixSetEntry(output, index, 0n, -991n);
    }
    assert.equal(flint.ffiIntegerLogSqrtBallsPrefixResource(output, source, 2n, 96n), true);
    const entries = () => Array.from({ length: 13 }, (_, index) =>
      flint.ffiFmpzMatrixEntry(output, BigInt(index), 0n));
    const before = entries();
    assert.deepEqual(before.slice(0, 4), [0n, 0n, 1n << 96n, 1n << 96n]);
    assert.deepEqual(before.slice(6, 8), [2n << 96n, 2n << 96n]);
    assert.deepEqual(before.slice(8), Array(5).fill(-991n));
    assert.throws(() => flint.ffiIntegerLogSqrtBallsPrefixResource(
      output, source, 3n, 96n,
    ), /active entries are invalid/);
    assert.deepEqual(entries(), before);
  } finally {
    flint.ffiFmpzMatrixClose(output);
    flint.ffiFmpzMatrixClose(source);
  }
  assert.equal(flint.__sagejs_wasm_resource_live_count__(), 0n);
});

test("public browser FFI executes the reviewed logical prefix", async (context) => {
  const executablePath = executablePathFor("chromium", chromium);
  if (!executablePath) {
    assert.notEqual(process.env.SAGEJS_REQUIRE_PREFIX_BROWSER, "1", "Chromium is required");
    context.skip("Chromium is not installed");
    return;
  }
  const server = await createBrowserWasmServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath, headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const page = await browser.newPage();
    await page.goto(`${server.origin}/browser-wasm-harness.html`);
    await page.waitForFunction(() => window.__sagejsReady !== undefined);
    await page.evaluate(() => window.__sagejsReady);
    const result = await page.evaluate(() => window.__sagejsTest.evaluate(`
from sagejs.ffi.flint import fmpz_matrix, fmpz_matrix_set_entry, fmpz_matrix_entry, integer_log_sqrt_balls_prefix_resource
source = fmpz_matrix(3, 1)
output = fmpz_matrix(13, 1)
try:
    for i, value in enumerate((1, 4, -1)):
        fmpz_matrix_set_entry(source, i, 0, value)
    for i in range(13):
        fmpz_matrix_set_entry(output, i, 0, -991)
    assert integer_log_sqrt_balls_prefix_resource(output, source, 2, 96)
    assert fmpz_matrix_entry(output, 2, 0) == 2**96
    assert fmpz_matrix_entry(output, 6, 0) == 2**97
    assert fmpz_matrix_entry(output, 12, 0) == -991
    print("prefix-browser-ok")
finally:
    output.close()
    source.close()
`, 15000));
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, "prefix-browser-ok\n");
  } finally {
    await browser?.close();
    await server.close();
  }
});

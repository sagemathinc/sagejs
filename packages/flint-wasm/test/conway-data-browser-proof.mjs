import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright-core";

import { createSage } from "../node-kernel.mjs";
import {
  createBrowserWasmServer,
  executablePathFor,
  packageRoot,
  repositoryRoot,
} from "./browser-wasm-support.mjs";

const publicSource = [
  "F = GF(3^4, 'a')",
  "a = F.gen()",
  "print(F)",
  "print(F.modulus())",
  "print((a + 1)^20)",
  "try:",
  "    GF(97^128, 'b')",
  "except NotImplementedError as error:",
  "    print(error)",
].join("\n");
const expectedOutput = [
  "Finite Field in a of size 3^4",
  "x^4 + 2*x^3 + 2",
  "1",
  "Sage-compatible pseudo-Conway polynomials are not implemented for this finite field",
  "",
].join("\n");
const sourceData = `${repositoryRoot}/src/lib/conway_polynomials/conway_polynomials.json`;
const distData = `${packageRoot}/dist/conway-polynomials.json`;

function assertFqWasm(result) {
  assert.equal(result.stdout, expectedOutput);
  const routes = result.instrumentation?.routes ?? [];
  for (const capabilityId of [
    "ffi:flint:fq_context",
    "ffi:flint:fq_element",
    "ffi:flint:fq_element_pow",
  ]) {
    assert.ok(routes.some((route) =>
      route.capability_id === capabilityId &&
      route.selected_route === "receipt-backed-wasm-artifact" &&
      route.execution_target === "wasm-artifact" &&
      route.call_count > 0
    ), `missing authenticated fq Wasm route ${capabilityId}`);
  }
}

test("default GF(3^4, 'a') reaches generated fq Wasm in Node and Chromium", async () => {
  const executablePath = executablePathFor("chromium", chromium);
  assert.ok(executablePath, "Chromium is required for the Conway public proof");

  const sage = await createSage({ conwayData: pathToFileURL(sourceData) });
  try {
    assertFqWasm(await sage.evaluate(publicSource));
  } finally {
    await sage.close();
  }

  const installedFixture = !fs.existsSync(distData);
  if (installedFixture) fs.copyFileSync(sourceData, distData);
  const server = await createBrowserWasmServer();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      window.__sagejsTestOptions = {
        conwayData: "/dist/conway-polynomials.json",
      };
    });
    await page.goto(`${server.origin}/browser-wasm-harness.html`);
    await page.evaluate(() => window.__sagejsReady);
    assert.equal(
      server.requests.filter(({ pathname }) =>
        pathname === "/dist/conway-polynomials.json"
      ).length,
      0,
      "Conway data loaded before a finite-field constructor requested it",
    );
    const result = await page.evaluate((source) =>
      window.__sagejsTest.evaluate(source, 60_000), publicSource
    );
    assertFqWasm(result);
    assert.equal(
      server.requests.filter(({ pathname }) =>
        pathname === "/dist/conway-polynomials.json"
      ).length,
      1,
      "Conway data was not fetched exactly once on first use",
    );
  } finally {
    await context.close();
    await browser.close();
    await server.close();
    if (installedFixture) fs.rmSync(distData);
  }
});

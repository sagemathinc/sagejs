import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { webkit } from "playwright-core";
import {
  executablePathFor,
  packageRoot,
} from "./browser-wasm-support.mjs";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

const receiptPath = option(
  "--receipt",
  process.env.SAGEJS_WASM_WEBKIT_FILE_ORIGIN_RECEIPT,
);
const executablePath = executablePathFor("webkit", webkit);
assert.ok(executablePath, "Playwright WebKit is required for the file-origin gate");

const browser = await webkit.launch({ executablePath, headless: true });
const receipt = {
  schema: "sagejs.webkit-file-origin-feasibility/v1",
  created_at: new Date().toISOString(),
  engine: "playwright-webkit-linux",
  physical_wkwebview_validation: false,
  required_mobile_asset_origin: "application-owned-http-or-https",
  status: "running",
};

try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.join(
    packageRoot,
    "test",
    "fixtures",
    "file-origin.html",
  )).href);
  await page.waitForFunction(() => globalThis.__sagejsFileOriginProbe, null, {
    timeout: 15_000,
  });
  const observation = await page.evaluate(() => globalThis.__sagejsFileOriginProbe);
  receipt.observation = observation;

  assert.equal(observation.protocol, "file:");
  assert.equal(
    observation.crossOriginIsolated,
    false,
    "a file origin unexpectedly claimed cross-origin isolation without headers",
  );
  assert.equal(
    observation.sharedArrayBuffer,
    false,
    "the mobile architecture must not assume SharedArrayBuffer on file origins",
  );
  assert.equal(
    observation.crossOriginIsolated &&
      observation.sharedArrayBuffer &&
      observation.directOuterWorker &&
      observation.nestedWorker,
    false,
    "a file origin unexpectedly satisfied the complete production isolation and worker contract",
  );
  receipt.status = "passed";
  await page.close();
  console.log(
    "Playwright WebKit confirms file origins cannot satisfy the production isolation and worker contract; an application-owned HTTP(S) asset origin is required",
  );
} catch (error) {
  receipt.status = "failed";
  receipt.error = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  await browser.close();
  if (receiptPath) {
    fs.mkdirSync(path.dirname(path.resolve(receiptPath)), { recursive: true });
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  }
}

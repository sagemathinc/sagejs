import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { startStaticServer } from "../scripts/static-server.mjs";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(testRoot, "..");
const temporary = await mkdtemp(path.join(os.tmpdir(), "sagejs-cache-integrity-"));
const executablePath = [
  process.env.SAGEJS_CHROMIUM,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean).find(existsSync) ?? chromium.executablePath();
assert.ok(existsSync(executablePath), "Chromium not found; set SAGEJS_CHROMIUM");

const digest = (value) => createHash("sha256").update(value).digest("hex");
const trustedModule = "export const witness = 'trusted-runtime-bytes';\n";
const forgedModule = "export const witness = 'FORGED-CACHE-BYTES';\n";
const index = "<!doctype html><meta charset=utf-8><title>cache-integrity</title>\n";
const records = [
  { path: "./", bytes: Buffer.byteLength(index), sha256: digest(index) },
  { path: "./index.html", bytes: Buffer.byteLength(index), sha256: digest(index) },
  {
    path: "./protected.mjs",
    bytes: Buffer.byteLength(trustedModule),
    sha256: digest(trustedModule),
  },
];
const manifest = {
  schema: "org.sagejs.web/assets-v2",
  release: digest(JSON.stringify(records)),
  artifactIdentity: `sha256:${"1".repeat(64)}`,
  assets: records,
};
const manifestContents = `${JSON.stringify(manifest, null, 2)}\n`;
const manifestDigest = digest(manifestContents);
const workerSource = await readFile(path.join(appRoot, "sw.js"), "utf8");
assert.equal(
  workerSource.split("__SAGEJS_ASSET_MANIFEST_SHA256__").length - 1,
  1,
);

await Promise.all([
  writeFile(path.join(temporary, "index.html"), index),
  writeFile(path.join(temporary, "protected.mjs"), trustedModule),
  writeFile(path.join(temporary, "asset-manifest.json"), manifestContents),
  writeFile(
    path.join(temporary, "sw.js"),
    workerSource.replace("__SAGEJS_ASSET_MANIFEST_SHA256__", manifestDigest),
  ),
]);

const server = await startStaticServer({ directory: temporary });
const address = server.address();
const origin = `http://${address.address}:${address.port}`;
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({ serviceWorkers: "allow" });
let page;

async function poisonCache(relative = "protected.mjs", source = forgedModule) {
  await page.evaluate(async ({ url, source }) => {
    const names = await caches.keys();
    const name = names.find((candidate) => candidate.startsWith("sagejs-live-"));
    if (name === undefined) throw new Error("release cache is unavailable");
    const cache = await caches.open(name);
    await cache.put(url, new Response(source, {
      headers: { "Content-Type": "text/javascript; charset=utf-8" },
    }));
  }, { url: `${origin}/${relative}`, source });
}

async function fetchedModule() {
  return page.evaluate(async (url) => {
    try {
      const response = await fetch(url);
      return { ok: response.ok, text: await response.text() };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }, `${origin}/protected.mjs`);
}

try {
  page = await context.newPage();
  await page.goto(origin, { waitUntil: "load" });
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    await navigator.serviceWorker.ready;
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  assert.deepEqual(await fetchedModule(), { ok: true, text: trustedModule });
  await context.setOffline(false);

  await poisonCache();
  assert.deepEqual(await fetchedModule(), { ok: true, text: trustedModule });

  await poisonCache(
    "asset-manifest.json",
    `${JSON.stringify({ ...manifest, release: "0".repeat(64), assets: [] })}\n`,
  );
  await poisonCache();
  await context.setOffline(true);
  const rejected = await fetchedModule();
  assert.equal(rejected.ok, false);
  assert.doesNotMatch(rejected.text ?? "", /FORGED-CACHE-BYTES/);

  await context.setOffline(false);
  assert.deepEqual(await fetchedModule(), { ok: true, text: trustedModule });
  process.stdout.write("Authenticated service-worker cache rejected forged runtime bytes.\n");
} finally {
  await context.setOffline(false).catch(() => {});
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}

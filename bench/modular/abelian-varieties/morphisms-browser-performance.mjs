import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { chromium } from "playwright-core";
import { createBrowserWasmServer, executablePathFor } from "../../../packages/flint-wasm/test/browser-wasm-support.mjs";

const output = process.argv[2];
const samples = Number(process.argv[3] || 1);
const levels = (process.argv[4] || "726,1089").split(",").map(Number);
if (!output || !Number.isSafeInteger(samples) || samples < 1 ||
    levels.some(n => !Number.isSafeInteger(n) || n <= 0)) {
  throw Error("usage: node morphisms-browser-performance.mjs OUTPUT.json [SAMPLES] [LEVELS]");
}
const root = new URL("../../../", import.meta.url);
const reference = JSON.parse(readFileSync(new URL("decomposition-performance-linux-x64.json", import.meta.url)));
const artifact = JSON.parse(readFileSync(new URL("packages/flint-wasm/dist/production-manifest.json", root)));
const report = {
  date: new Date().toISOString(),
  revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  artifact: artifact.identity,
  host: { cpu: os.cpus()[0].model, platform: os.platform(), architecture: os.arch(), node: process.version },
  sourceSha256: Object.fromEntries(Object.keys(reference.sourceSha256).map(f =>
    [f, createHash("sha256").update(readFileSync(new URL(f, root))).digest("hex")])),
  policy: "Sequential fresh Chromium contexts. Startup excluded; no mathematical warmup. Evaluation limit 120s. Force integral decomposition isogeny, rank and Smith invariants; compare exact pinned Sage data. No concurrent owned builds/tests.",
  samples, results: [],
};
const save = () => writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
const server = await createBrowserWasmServer();
let browser;
try {
  browser = await chromium.launch({ executablePath: executablePathFor("chromium", chromium), headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  report.browser = browser.version();
  save();
  for (const level of levels) for (let sample = 0; sample < samples; sample++) {
    console.log(`Chromium N=${level} sample=${sample}`);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(`${server.origin}/browser-wasm-harness.html`);
      await page.waitForFunction(() => window.__sagejsReady !== undefined);
      await page.evaluate(() => window.__sagejsReady);
      const result = await page.evaluate(source => window.__sagejsTest.evaluate(source, 120000), `
import time, json
start=time.perf_counter()
J=J0(${level})
T=J.oldform_decomposition().isogeny()
constructed=time.perf_counter()
invariants=T.component_group().invariants()
rank=T.rank()
done=time.perf_counter()
print(json.dumps({'system':'Sage.js/Chromium','level':${level},'dimension':J.dimension(),'rank':rank,'invariants':list(invariants),'construction_seconds':constructed-start,'smith_seconds':done-constructed}))
`);
      const record = JSON.parse(result.stdout);
      const oracle = reference.results.find(r => r.system === "sage" && r.level === level).records[0];
      for (const field of ["dimension", "rank", "invariants"]) assert.deepEqual(record[field], oracle[field]);
      report.results.push({ level, sample, status: "passed", record });
    } catch (error) {
      report.results.push({ level, sample, status: "failed", error: String(error) });
      throw error;
    } finally {
      save();
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
console.log(`Saved exact-checked Chromium benchmark: ${output}`);

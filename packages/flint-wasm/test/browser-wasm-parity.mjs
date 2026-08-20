import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium, firefox, webkit } from "playwright-core";
import {
  assertParityExpectation,
  createBrowserWasmServer,
  executablePathFor,
  loadParityCorpus,
  loadProductionCapabilityRoutes,
  parseEngineList,
  repositoryRoot,
  resolveCapabilityRequirements,
  sha256,
} from "./browser-wasm-support.mjs";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

const tier = option("--tier", process.env.SAGEJS_WASM_PARITY_TIER ?? "routine");
assert.match(tier, /^(routine|release)$/);
const requestedEngines = parseEngineList(
  option("--engines", process.env.SAGEJS_BROWSER_ENGINES ?? "chromium"),
);
const requireEngines = new Set(parseEngineList(
  option("--require-engines", process.env.SAGEJS_REQUIRED_BROWSER_ENGINES ?? requestedEngines.join(",")),
));
const receiptPath = option("--receipt", process.env.SAGEJS_WASM_PARITY_RECEIPT);
const browserTypes = { chromium, firefox, webkit };
const corpus = await loadParityCorpus();
const productionCapabilityRoutes = await loadProductionCapabilityRoutes();
const cases = corpus.cases.filter((item) => tier === "release" || item.tier === "routine");
const server = await createBrowserWasmServer();
const receipt = {
  schema_version: 1,
  kind: "sagejs-browser-wasm-parity",
  source_revision: process.env.GITHUB_SHA ?? null,
  corpus_sha256: sha256(JSON.stringify(corpus)),
  tier,
  created_at: new Date().toISOString(),
  engines: [],
};

try {
  for (const engine of requestedEngines) {
    const browserType = browserTypes[engine];
    const executablePath = executablePathFor(engine, browserType);
    if (!executablePath) {
      const missing = {
        engine,
        status: "unavailable",
        reason: "no compatible browser executable is installed",
        cases: [],
      };
      receipt.engines.push(missing);
      if (requireEngines.has(engine)) {
        throw new Error(`${engine} is required but unavailable`);
      }
      continue;
    }
    let browser;
    const engineReceipt = { engine, executable_path: executablePath, status: "failed", cases: [] };
    receipt.engines.push(engineReceipt);
    try {
      browser = await browserType.launch({
        executablePath,
        headless: true,
        args: engine === "chromium" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
      });
      const context = await browser.newContext({ serviceWorkers: "allow" });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(String(error.stack ?? error)));
      await page.goto(`${server.origin}/browser-wasm-harness.html`, { waitUntil: "load" });
      await page.waitForFunction(() => window.__sagejsReady !== undefined);
      await page.evaluate(() => window.__sagejsReady);
      engineReceipt.diagnostics = await page.evaluate(() => window.__sagejsTest.diagnostics());
      assert.equal(engineReceipt.diagnostics.cross_origin_isolated, true);
      for (const item of cases) {
        const caseReceipt = {
          id: item.id,
          family: item.family,
          workflow: item.workflow,
          required_capability_routes: item.requires,
          status: "failed",
        };
        engineReceipt.cases.push(caseReceipt);
        const resolution = resolveCapabilityRequirements(
          item.requires,
          productionCapabilityRoutes,
        );
        caseReceipt.selected_capability_routes = resolution.selected;
        if (resolution.missing.length) {
          caseReceipt.status = "missing-capability-route";
          caseReceipt.missing_capability_routes = resolution.missing;
          continue;
        }
        try {
          const result = await page.evaluate(
            ([source, timeout]) => window.__sagejsTest.evaluate(source, timeout),
            [item.source, item.timeout_ms],
          );
          caseReceipt.duration_ms = result.duration_ms;
          caseReceipt.failures = assertParityExpectation(item, result);
          caseReceipt.status = caseReceipt.failures.length === 0 ? "passed" : "mismatch";
        } catch (error) {
          caseReceipt.status = "missing-or-failed-capability";
          caseReceipt.error = String(error.stack ?? error);
        }
      }
      engineReceipt.page_errors = pageErrors;
      const failed = engineReceipt.cases.filter((item) => item.status !== "passed");
      engineReceipt.status = failed.length === 0 && pageErrors.length === 0 ? "passed" : "failed";
      await context.close();
    } catch (error) {
      engineReceipt.error = String(error.stack ?? error);
    } finally {
      await browser?.close();
    }
  }
} finally {
  await server.close();
  receipt.completed_at = new Date().toISOString();
  receipt.request_count = server.requests.length;
  if (receiptPath) {
    const target = path.resolve(repositoryRoot, receiptPath);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, `${JSON.stringify(receipt, null, 2)}\n`);
  }
}

const failures = receipt.engines.filter((item) =>
  requireEngines.has(item.engine) && item.status !== "passed",
);
if (failures.length) {
  console.error(JSON.stringify(receipt, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(receipt, null, 2));
}

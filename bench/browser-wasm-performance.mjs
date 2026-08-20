import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium, firefox, webkit } from "playwright-core";
import {
  createBrowserWasmServer,
  executablePathFor,
  loadParityCorpus,
  packageRoot,
} from "../packages/flint-wasm/test/browser-wasm-support.mjs";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}
function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    minimum: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    maximum: sorted.at(-1),
    samples: values,
  };
}

const engine = option("--engine", "chromium");
const samples = Number(option("--samples", "5"));
const output = option("--output");
const budgetPath = option("--budget");
const requireBaseline = process.argv.includes("--require-baseline");
if (!Number.isSafeInteger(samples) || samples < 1 || samples > 50) {
  throw new Error("--samples must be an integer from 1 through 50");
}
const types = { chromium, firefox, webkit };
const type = types[engine];
if (!type) throw new Error(`unsupported engine ${engine}`);
const executablePath = executablePathFor(engine, type);
if (!executablePath) throw new Error(`${engine} is unavailable`);
const corpus = await loadParityCorpus();
const operations = corpus.cases.filter((item) => item.tier === "routine");
const server = await createBrowserWasmServer();
const browser = await type.launch({
  executablePath,
  headless: true,
  args: engine === "chromium" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
});
const startup = [];
const interrupts = [];
const timings = Object.fromEntries(operations.map((item) => [item.id, []]));
let diagnostics;
try {
  for (let sample = 0; sample < samples; sample += 1) {
    const page = await browser.newPage();
    const started = performance.now();
    await page.goto(`${server.origin}/browser-wasm-harness.html`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__sagejsReady !== undefined);
    await page.evaluate(() => window.__sagejsReady);
    startup.push(performance.now() - started);
    diagnostics ??= await page.evaluate(() => window.__sagejsTest.diagnostics());
    for (const item of operations) {
      const result = await page.evaluate(
        ([source, timeout]) => window.__sagejsTest.evaluate(source, timeout),
        [item.source, item.timeout_ms],
      );
      timings[item.id].push(result.duration_ms);
    }
    const interrupted = await page.evaluate(() => window.__sagejsTest.interrupt("while True:\n    pass"));
    if (!interrupted.rejected) throw new Error("interrupted evaluation unexpectedly completed");
    interrupts.push(interrupted.latency_ms);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
const report = {
  schema: "sagejs.browser-wasm-performance/v1",
  engine,
  source_revision: process.env.GITHUB_SHA ?? null,
  samples,
  startup_ms: distribution(startup),
  interrupt_latency_ms: distribution(interrupts),
  operations: Object.fromEntries(Object.entries(timings).map(([id, values]) => [id, distribution(values)])),
  diagnostics,
  artifact_root: path.relative(process.cwd(), packageRoot),
};
if (budgetPath) {
  const budget = JSON.parse(await fs.promises.readFile(budgetPath, "utf8"));
  if (budget.schema !== "sagejs.browser-wasm-budget/v1") {
    throw new Error(`unsupported budget schema ${budget.schema}`);
  }
  const failures = [];
  const baseline = budget.performance_baseline?.[engine];
  if (!baseline && requireBaseline) failures.push(`reviewed performance_baseline.${engine} is absent`);
  if (baseline) {
    const threshold = budget.thresholds;
    if (report.startup_ms.median > baseline.startup_ms.median * (1 + threshold.startup_regression_fraction)) {
      failures.push("startup median regressed beyond its reviewed allowance");
    }
    if (report.interrupt_latency_ms.median > baseline.interrupt_latency_ms.median * (1 + threshold.interrupt_latency_regression_fraction)) {
      failures.push("interrupt median regressed beyond its reviewed allowance");
    }
    for (const [id, timing] of Object.entries(report.operations)) {
      if (
        baseline.operations?.[id] &&
        timing.median > baseline.operations[id].median * (1 + threshold.warm_operation_regression_fraction)
      ) {
        failures.push(`${id} warm median regressed beyond its reviewed allowance`);
      }
    }
  }
  if (report.interrupt_latency_ms.maximum > budget.thresholds.maximum_interrupt_latency_ms) {
    failures.push("interrupt latency exceeded its absolute safety ceiling");
  }
  if (failures.length) throw new Error(`browser Wasm performance budget failed:\n${failures.join("\n")}`);
}
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (output) await fs.promises.writeFile(output, serialized);
else process.stdout.write(serialized);

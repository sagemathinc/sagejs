#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright-core";
import {
  createBrowserWasmServer,
  executablePathFor,
  packageRoot,
  repositoryRoot,
} from "../packages/flint-wasm/test/browser-wasm-support.mjs";

const REVIEWED_ROUTES = new Set([
  "receipt-backed-wasm-artifact",
  "shared-runtime-js",
  "portable-fallback",
]);
const EXECUTION_TARGETS = new Set([
  "wasm-artifact",
  "host-runtime-js",
  "portable-python",
]);

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function distribution(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("a distribution needs at least one sample");
  }
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("distribution samples must be finite nonnegative numbers");
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    minimum: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    maximum: sorted.at(-1),
    samples: values,
  };
}

function checkedCounter(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a bounded nonnegative safe integer`);
  }
  return value;
}

function normalizeInstrumentation(value) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || !Array.isArray(value.routes)) {
    throw new Error("invalid evaluator instrumentation payload");
  }
  const routes = value.routes.map((route) => {
    if (
      !route ||
      typeof route.capability_id !== "string" ||
      !REVIEWED_ROUTES.has(route.selected_route) ||
      !EXECUTION_TARGETS.has(route.execution_target)
    ) {
      throw new Error("invalid evaluator instrumentation route record");
    }
    return {
      capability_id: route.capability_id,
      selected_route: route.selected_route,
      execution_target: route.execution_target,
      call_count: checkedCounter(route.call_count, "route call_count"),
      ingress_bytes: checkedCounter(route.ingress_bytes, "route ingress_bytes"),
      egress_bytes: checkedCounter(route.egress_bytes, "route egress_bytes"),
    };
  });
  return {
    routes,
    boundary_crossings: checkedCounter(
      value.boundary_crossings,
      "instrumentation boundary_crossings",
    ),
    copied_bytes: checkedCounter(value.copied_bytes, "instrumentation copied_bytes"),
  };
}

export function summarizeInstrumentation(samples, requirements = []) {
  const normalized = samples.map(normalizeInstrumentation);
  const available = normalized.filter((item) => item !== null);
  const status = available.length === 0
    ? "unavailable"
    : available.length === normalized.length
      ? "available"
      : "partial";
  const aggregates = new Map();
  for (const item of available) {
    for (const route of item.routes) {
      const key = `${route.capability_id}\u0000${route.selected_route}\u0000${route.execution_target}`;
      const current = aggregates.get(key) ?? {
        capability_id: route.capability_id,
        selected_route: route.selected_route,
        execution_target: route.execution_target,
        call_count: 0,
        ingress_bytes: 0,
        egress_bytes: 0,
      };
      current.call_count += route.call_count;
      current.ingress_bytes += route.ingress_bytes;
      current.egress_bytes += route.egress_bytes;
      aggregates.set(key, current);
    }
  }
  const observedRoutes = [...aggregates.values()].sort((left, right) =>
    left.capability_id.localeCompare(right.capability_id) ||
    left.selected_route.localeCompare(right.selected_route) ||
    left.execution_target.localeCompare(right.execution_target));
  const requiredRoutes = requirements.map((requirement) => {
    const observed = observedRoutes.filter(
      (route) => route.capability_id === requirement.id,
    );
    return {
      capability_id: requirement.id,
      expected_route: requirement.route,
      observed_routes: [...new Set(observed.map((route) => route.selected_route))],
      status: status === "unavailable"
        ? "unavailable"
        : observed.length === 0
          ? "missing"
          : observed.some((route) => route.selected_route === requirement.route)
            ? "matched"
            : "mismatch",
    };
  });
  return {
    status,
    samples: normalized,
    boundary_crossings: available.length
      ? distribution(available.map((item) => item.boundary_crossings))
      : null,
    copied_bytes: available.length
      ? distribution(available.map((item) => item.copied_bytes))
      : null,
    observed_routes: observedRoutes,
    required_routes: requiredRoutes,
  };
}

export function validatePerformanceWorkloads(manifest) {
  if (
    manifest?.schema !== "sagejs.browser-wasm-performance-cases/v1" ||
    !Array.isArray(manifest.cases) ||
    manifest.cases.length === 0
  ) {
    throw new Error("invalid browser Wasm performance workload manifest");
  }
  const ids = new Set();
  for (const item of manifest.cases) {
    if (
      typeof item?.id !== "string" ||
      ids.has(item.id) ||
      typeof item.family !== "string" ||
      typeof item.source !== "string" ||
      !Array.isArray(item.requires) ||
      !Number.isSafeInteger(item.timeout_ms) ||
      item.timeout_ms < 1
    ) {
      throw new Error(`invalid performance workload ${item?.id ?? "<unknown>"}`);
    }
    ids.add(item.id);
    for (const requirement of item.requires) {
      if (
        typeof requirement?.id !== "string" ||
        !REVIEWED_ROUTES.has(requirement.route)
      ) {
        throw new Error(`invalid route requirement in ${item.id}`);
      }
    }
  }
  return manifest;
}

export function selectPerformanceWorkloads(workloads, shard) {
  if (shard == null) {
    return {
      workloads,
      selection: {
        kind: "complete",
        case_ids: workloads.cases.map((item) => item.id),
      },
    };
  }
  const match = /^(\d+)\/(\d+)$/.exec(shard);
  if (!match) {
    throw new Error("--shard must use the one-based INDEX/COUNT form");
  }
  const index = Number(match[1]);
  const count = Number(match[2]);
  if (
    !Number.isSafeInteger(index) || !Number.isSafeInteger(count) ||
    count < 1 || count > workloads.cases.length || index < 1 || index > count
  ) {
    throw new Error("--shard must select a valid nonempty workload shard");
  }
  const cases = workloads.cases.filter((_, position) => position % count === index - 1);
  return {
    workloads: { ...workloads, cases },
    selection: {
      kind: "shard",
      index,
      count,
      case_ids: cases.map((item) => item.id),
    },
  };
}

function ratio(browserValue, nativeValue) {
  return Number.isFinite(nativeValue) && nativeValue > 0
    ? browserValue / nativeValue
    : null;
}

export function compareNativeReceipts(browserReport, nativeReport, referenceIdentity = null) {
  if (
    nativeReport?.schema !== "sagejs.browser-wasm-performance/v2" ||
    nativeReport.runtime?.kind !== "node-native"
  ) {
    throw new Error("native reference is not a Sage.js node-native performance receipt");
  }
  if (browserReport.workload_identity !== nativeReport.workload_identity) {
    throw new Error("browser and native receipts used different workloads");
  }
  if (
    browserReport.source_revision &&
    nativeReport.source_revision &&
    browserReport.source_revision !== nativeReport.source_revision
  ) {
    throw new Error("browser and native receipts came from different source revisions");
  }
  const operations = {};
  for (const [id, browserTiming] of Object.entries(browserReport.operations)) {
    const nativeTiming = nativeReport.operations?.[id];
    if (!nativeTiming) throw new Error(`native reference is missing workload ${id}`);
    operations[id] = {
      cold_median_ratio: ratio(browserTiming.cold_ms.median, nativeTiming.cold_ms.median),
      warm_median_ratio: ratio(browserTiming.warm_ms.median, nativeTiming.warm_ms.median),
    };
  }
  return {
    status: "available",
    reference_identity: referenceIdentity,
    reference_source_revision: nativeReport.source_revision ?? null,
    startup_median_ratio: ratio(
      browserReport.startup_ms.median,
      nativeReport.startup_ms.median,
    ),
    interrupt_median_ratio: ratio(
      browserReport.interrupt_latency_ms.median,
      nativeReport.interrupt_latency_ms.median,
    ),
    operations,
  };
}

async function browserMemory(page) {
  return page.evaluate(async () => {
    const result = {
      js_heap_bytes: Number.isFinite(performance.memory?.usedJSHeapSize)
        ? performance.memory.usedJSHeapSize
        : null,
      user_agent_bytes: null,
      resident_set_bytes: null,
    };
    if (typeof performance.measureUserAgentSpecificMemory === "function") {
      try {
        const measured = await performance.measureUserAgentSpecificMemory();
        if (Number.isFinite(measured?.bytes)) result.user_agent_bytes = measured.bytes;
      } catch (_error) {
        // This Chromium-only API can be unavailable even in a secure context.
      }
    }
    return result;
  });
}

async function createBrowserDriver(engine) {
  const types = { chromium, firefox, webkit };
  const type = types[engine];
  if (!type) throw new Error(`unsupported engine ${engine}`);
  const executablePath = executablePathFor(engine, type);
  if (!executablePath) throw new Error(`${engine} is unavailable`);
  const server = await createBrowserWasmServer();
  const browser = await type.launch({
    executablePath,
    headless: true,
    args: engine === "chromium" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
  });
  let diagnostics = null;
  return {
    runtime: { kind: "browser-wasm", engine },
    async open() {
      const page = await browser.newPage();
      const started = performance.now();
      await page.goto(`${server.origin}/browser-wasm-harness.html`, { waitUntil: "load" });
      await page.waitForFunction(() => window.__sagejsReady !== undefined);
      await page.evaluate(() => window.__sagejsReady);
      const startup_ms = performance.now() - started;
      diagnostics ??= await page.evaluate(() => window.__sagejsTest.diagnostics());
      return {
        startup_ms,
        evaluate: (source, timeout) => page.evaluate(
          ([currentSource, currentTimeout]) =>
            window.__sagejsTest.evaluate(currentSource, currentTimeout),
          [source, timeout],
        ),
        interrupt: () => page.evaluate(() =>
          window.__sagejsTest.interrupt("while True:\n    pass")),
        memory: () => browserMemory(page),
        close: () => page.close(),
      };
    },
    diagnostics: () => diagnostics,
    async close() {
      await browser.close();
      await server.close();
    },
  };
}

async function createNativeDriver() {
  const require = createRequire(import.meta.url);
  const { createSage } = require(path.join(repositoryRoot, "dist", "tools", "kernel.js"));
  return {
    runtime: { kind: "node-native", engine: null },
    async open() {
      const started = performance.now();
      const session = await createSage();
      const startup_ms = performance.now() - started;
      return {
        startup_ms,
        async evaluate(source, timeout) {
          const evaluationStarted = performance.now();
          const result = await session.evaluate(source, { timeout });
          return {
            ...result,
            duration_ms: performance.now() - evaluationStarted,
            instrumentation: result.instrumentation ?? null,
          };
        },
        async interrupt() {
          const evaluation = session.evaluate("while True:\n    pass");
          await new Promise((resolve) => setTimeout(resolve, 100));
          const interruptStarted = performance.now();
          await session.interrupt();
          let rejected = false;
          try { await evaluation; } catch { rejected = true; }
          return { rejected, latency_ms: performance.now() - interruptStarted };
        },
        async memory() {
          const current = process.memoryUsage();
          return {
            js_heap_bytes: current.heapUsed,
            user_agent_bytes: null,
            resident_set_bytes: current.rss,
          };
        },
        close: () => session.close(),
      };
    },
    diagnostics: () => ({
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
    }),
    async close() {},
  };
}

function memoryMaximum(samples, key) {
  const values = samples.flatMap((sample) => [
    sample.before?.[key],
    sample.after_cold?.[key],
    sample.after_warm?.[key],
  ]).filter((value) => Number.isFinite(value));
  return values.length ? Math.max(...values) : null;
}

async function runPerformance(driver, workloads, samples, workloadIdentity) {
  const startup = [];
  const interrupts = [];
  const operations = Object.fromEntries(workloads.cases.map((item) => [item.id, {
    family: item.family,
    required_capability_routes: item.requires,
    cold: [],
    warm: [],
    coldInstrumentation: [],
    warmInstrumentation: [],
    memory: [],
  }]));
  try {
    for (let sample = 0; sample < samples; sample += 1) {
      const startupSession = await driver.open();
      startup.push(startupSession.startup_ms);
      await startupSession.close();
      for (const item of workloads.cases) {
        const session = await driver.open();
        const current = operations[item.id];
        try {
          const before = await session.memory();
          const cold = await session.evaluate(item.source, item.timeout_ms);
          const afterCold = await session.memory();
          const warm = await session.evaluate(item.source, item.timeout_ms);
          const afterWarm = await session.memory();
          current.cold.push(cold.duration_ms);
          current.warm.push(warm.duration_ms);
          current.coldInstrumentation.push(cold.instrumentation ?? null);
          current.warmInstrumentation.push(warm.instrumentation ?? null);
          current.memory.push({ before, after_cold: afterCold, after_warm: afterWarm });
        } finally {
          await session.close();
        }
      }
      const interruptSession = await driver.open();
      try {
        const interrupted = await interruptSession.interrupt();
        if (!interrupted.rejected) {
          throw new Error("interrupted evaluation unexpectedly completed");
        }
        interrupts.push(interrupted.latency_ms);
      } finally {
        await interruptSession.close();
      }
    }
  } finally {
    await driver.close();
  }
  return {
    schema: "sagejs.browser-wasm-performance/v2",
    runtime: driver.runtime,
    source_revision: process.env.GITHUB_SHA ?? null,
    workload_identity: workloadIdentity,
    samples,
    startup_ms: distribution(startup),
    interrupt_latency_ms: distribution(interrupts),
    operations: Object.fromEntries(Object.entries(operations).map(([id, item]) => [id, {
      family: item.family,
      required_capability_routes: item.required_capability_routes,
      cold_ms: distribution(item.cold),
      warm_ms: distribution(item.warm),
      instrumentation: {
        cold: summarizeInstrumentation(item.coldInstrumentation, item.required_capability_routes),
        warm: summarizeInstrumentation(item.warmInstrumentation, item.required_capability_routes),
      },
      memory: {
        samples: item.memory,
        maximum_js_heap_bytes: memoryMaximum(item.memory, "js_heap_bytes"),
        maximum_user_agent_bytes: memoryMaximum(item.memory, "user_agent_bytes"),
        maximum_resident_set_bytes: memoryMaximum(item.memory, "resident_set_bytes"),
      },
    }])),
    diagnostics: driver.diagnostics(),
    artifact_root: driver.runtime.kind === "browser-wasm"
      ? path.relative(process.cwd(), packageRoot)
      : null,
  };
}

export function checkBudget(
  report,
  budget,
  requireBaseline,
  options = {},
) {
  if (budget.schema !== "sagejs.browser-wasm-budget/v1") {
    throw new Error(`unsupported budget schema ${budget.schema}`);
  }
  const failures = [];
  const key = report.runtime.kind === "browser-wasm" ? report.runtime.engine : "node-native";
  const baseline = budget.performance_baseline?.[key];
  const enforceRegressionBaseline = options.enforceRegressionBaseline !== false;
  const enforceNativeRatio = options.enforceNativeRatio !== false;
  if (!baseline && requireBaseline && enforceRegressionBaseline) {
    failures.push(`reviewed performance_baseline.${key} is absent`);
  }
  if (baseline && enforceRegressionBaseline) {
    const threshold = budget.thresholds;
    if (report.startup_ms.median > baseline.startup_ms.median * (1 + threshold.startup_regression_fraction)) {
      failures.push("startup median regressed beyond its reviewed allowance");
    }
    if (report.interrupt_latency_ms.median > baseline.interrupt_latency_ms.median * (1 + threshold.interrupt_latency_regression_fraction)) {
      failures.push("interrupt median regressed beyond its reviewed allowance");
    }
    for (const [id, timing] of Object.entries(report.operations)) {
      const baselineTiming = baseline.operations?.[id];
      const baselineWarm = baselineTiming?.warm_ms ?? baselineTiming;
      if (!Number.isFinite(baselineWarm?.median)) {
        if (requireBaseline) {
          failures.push(
            `reviewed performance_baseline.${key}.operations.${id} is absent`,
          );
        }
        continue;
      }
      if (
        timing.warm_ms.median > baselineWarm.median * (1 + threshold.warm_operation_regression_fraction)
      ) {
        failures.push(`${id} warm median regressed beyond its reviewed allowance`);
      }
    }
  }
  if (report.interrupt_latency_ms.maximum > budget.thresholds.maximum_interrupt_latency_ms) {
    failures.push("interrupt latency exceeded its absolute safety ceiling");
  }
  const ratioBaseline = enforceNativeRatio && report.runtime.kind === "browser-wasm"
    ? budget.native_ratio_baseline?.[key]
    : null;
  if (
    requireBaseline &&
    report.runtime.kind === "browser-wasm" &&
    !ratioBaseline
  ) {
    failures.push(`reviewed native_ratio_baseline.${key} is absent`);
  }
  if (ratioBaseline) {
    const allowance = budget.thresholds.native_ratio_regression_fraction;
    if (requireBaseline) {
      for (const id of Object.keys(report.operations)) {
        const reviewedRatio =
          ratioBaseline.operations?.[id]?.warm_median_ratio;
        if (!Number.isFinite(reviewedRatio) || reviewedRatio <= 0) {
          failures.push(
            `reviewed native_ratio_baseline.${key}.operations.${id} is absent`,
          );
        }
      }
    }
    if (!Number.isFinite(allowance) || allowance < 0) {
      failures.push("native ratio baseline exists without a reviewed regression allowance");
    } else if (report.native_comparison?.status !== "available") {
      failures.push("native ratio baseline cannot be checked without a native reference");
    } else {
      for (const [id, current] of Object.entries(report.native_comparison.operations)) {
        const reviewed = ratioBaseline.operations?.[id];
        if (
          reviewed?.warm_median_ratio != null &&
          current.warm_median_ratio != null &&
          current.warm_median_ratio > reviewed.warm_median_ratio * (1 + allowance)
        ) {
          failures.push(`${id} browser/native warm ratio regressed beyond its reviewed allowance`);
        }
      }
    }
  }
  return {
    status: failures.length ? "failed" : baseline ? "reviewed" : "unbaselined",
    baseline_present: Boolean(baseline),
    failures,
  };
}

async function main() {
  const runtimeKind = option("--runtime", "browser-wasm");
  const engine = option("--engine", "chromium");
  const samples = Number(option("--samples", "5"));
  const output = option("--output");
  const budgetPath = option("--budget");
  const workloadPath = path.resolve(option(
    "--workloads",
    path.join(repositoryRoot, "bench", "browser-wasm-performance-cases.json"),
  ));
  const nativeReferencePath = option("--native-reference");
  const shard = option("--shard");
  const requireBaseline = process.argv.includes("--require-baseline");
  const safetyCeilingsOnly = process.argv.includes("--safety-ceilings-only");
  const reportRegressions = process.argv.includes("--report-regressions");
  if (!Number.isSafeInteger(samples) || samples < 1 || samples > 50) {
    throw new Error("--samples must be an integer from 1 through 50");
  }
  if (!["browser-wasm", "node-native"].includes(runtimeKind)) {
    throw new Error(`unsupported runtime ${runtimeKind}`);
  }
  if (runtimeKind === "node-native" && nativeReferencePath) {
    throw new Error("a node-native run cannot consume a native reference");
  }
  if (safetyCeilingsOnly && requireBaseline) {
    throw new Error("--safety-ceilings-only cannot be combined with --require-baseline");
  }
  if (safetyCeilingsOnly && reportRegressions) {
    throw new Error("--safety-ceilings-only cannot be combined with --report-regressions");
  }
  if (reportRegressions && !budgetPath) {
    throw new Error("--report-regressions requires --budget");
  }
  const workloadBytes = await fs.promises.readFile(workloadPath);
  const workloads = validatePerformanceWorkloads(JSON.parse(workloadBytes));
  const workloadIdentity = `sha256:${sha256(workloadBytes)}`;
  const selected = selectPerformanceWorkloads(workloads, shard);
  const driver = runtimeKind === "browser-wasm"
    ? await createBrowserDriver(engine)
    : await createNativeDriver();
  const report = await runPerformance(
    driver,
    selected.workloads,
    samples,
    workloadIdentity,
  );
  report.workload_selection = selected.selection;
  if (runtimeKind === "browser-wasm") {
    if (nativeReferencePath) {
      const referenceBytes = await fs.promises.readFile(nativeReferencePath);
      report.native_comparison = compareNativeReceipts(
        report,
        JSON.parse(referenceBytes),
        `sha256:${sha256(referenceBytes)}`,
      );
    } else {
      report.native_comparison = {
        status: "unavailable",
        reason: "a native reference receipt was not supplied",
      };
    }
  } else {
    report.native_comparison = null;
  }
  if (budgetPath) {
    const budget = JSON.parse(await fs.promises.readFile(budgetPath, "utf8"));
    report.budget = checkBudget(report, budget, requireBaseline, {
      enforceNativeRatio: !safetyCeilingsOnly,
      enforceRegressionBaseline: !safetyCeilingsOnly,
    });
    report.budget.enforcement = reportRegressions ? "report-only" : "required";
  } else {
    report.budget = null;
  }
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (output) {
    await fs.promises.mkdir(path.dirname(path.resolve(output)), { recursive: true });
    await fs.promises.writeFile(output, serialized);
  } else {
    process.stdout.write(serialized);
  }
  if (report.budget?.failures.length) {
    const message = `browser Wasm performance budget failed:\n${report.budget.failures.join("\n")}`;
    if (reportRegressions) {
      console.warn(`Warning: ${message}`);
    } else {
      throw new Error(message);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error);
    process.exitCode = 1;
  });
}

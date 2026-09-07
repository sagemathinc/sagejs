// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const workloads = JSON.parse(fs.readFileSync(path.join(root, "bench/browser-wasm-performance-cases.json")));
const budget = JSON.parse(fs.readFileSync(path.join(root, "bench/browser-wasm-budget.json")));

function driver(options = {}) {
  const calls = { sources: [], opened: 0, closed: 0, memory: 0, interrupts: 0, driverClosed: 0 };
  return {
    calls, runtime: { kind: "node-native", engine: null }, diagnostics: () => ({ fixture: true }),
    close: async () => { calls.driverClosed++; },
    async open() {
      calls.opened++;
      return { startup_ms: 1e6,
        async evaluate(source, timeout) {
          calls.sources.push(source);
          assert.equal(timeout, workloads.cases.find((item) => item.source === source).timeout_ms);
          if (calls.sources.length === options.failEvaluation) throw new Error("injected wrong-answer assertion");
          return { duration_ms: 1e6, instrumentation: null };
        },
        async memory() { calls.memory++; return {}; },
        async interrupt() {
          calls.interrupts++;
          return { rejected: !options.interruptCompleted, latency_ms: options.latency ?? 1 };
        },
        async close() { calls.closed++; },
      };
    },
  };
}

test("native acceptance executes every unchanged source cold/warm once and preserves the repeated report path", async () => {
  const { runNativeAcceptance, runPerformance } = await import("../bench/browser-wasm-performance.mjs");
  const accepted = driver();
  const report = await runNativeAcceptance(accepted, workloads, "fixture-workloads", budget);
  assert.deepEqual(accepted.calls.sources, workloads.cases.flatMap((item) => [item.source, item.source]));
  assert.equal(accepted.calls.memory, 0);
  assert.equal(accepted.calls.opened, accepted.calls.closed);
  assert.equal(accepted.calls.interrupts, 1);
  assert.equal(accepted.calls.driverClosed, 1);
  assert.equal(report.samples, 1);
  assert.equal(report.acceptance.status, "passed");
  assert.equal(report.measurement_purpose, "native-workload-acceptance");
  assert.equal(report.budget.enforcement, "required");
  assert.deepEqual(report.budget.failures, [], "large ordinary timing regressions are not acceptance failures");
  assert.deepEqual(Object.keys(report.operations), workloads.cases.map((item) => item.id));
  for (const operation of Object.values(report.operations)) {
    assert.equal(operation.cold_ms.samples.length, 1);
    assert.equal(operation.warm_ms.samples.length, 1);
    assert.equal(operation.memory.collection, "not-collected");
  }
  const timed = driver();
  const repeated = await runPerformance(timed, workloads, 7, "fixture-workloads");
  assert.equal(repeated.samples, 7);
  assert.deepEqual(timed.calls.sources, Array.from({ length: 7 }, () => accepted.calls.sources).flat());
  assert.equal(timed.calls.memory, workloads.cases.length * 7 * 3);
  assert.equal(timed.calls.interrupts, 7);
});

test("wrong answers, failed interruption and invalid or excessive latency cannot produce acceptance", async () => {
  const { runNativeAcceptance } = await import("../bench/browser-wasm-performance.mjs");
  for (const options of [{ failEvaluation: 1 }, { failEvaluation: 2 }, { interruptCompleted: true },
    { latency: 5001 }, { latency: NaN }, { latency: -1 }, { latency: Infinity }]) {
    const current = driver(options);
    await assert.rejects(runNativeAcceptance(current, workloads, "fixture-workloads", budget));
    assert.equal(current.calls.opened, current.calls.closed);
    assert.equal(current.calls.driverClosed, 1);
  }
});

test("native acceptance requires a real finite safety policy before executing", async () => {
  const { runNativeAcceptance } = await import("../bench/browser-wasm-performance.mjs");
  for (const ceiling of [null, 0, -1, Infinity, NaN, "5000"]) {
    const current = driver();
    await assert.rejects(runNativeAcceptance(current, workloads, "fixture-workloads", {
      ...budget, thresholds: { ...budget.thresholds, maximum_interrupt_latency_ms: ceiling },
    }), /safety ceiling/);
    assert.equal(current.calls.opened, 0);
  }
  const browser = driver(); browser.runtime.kind = "browser-wasm";
  await assert.rejects(runNativeAcceptance(browser, workloads, "fixture-workloads", budget), /Node-native driver/);
});

test("native acceptance CLI cannot shrink the corpus, repeat timing or make failures report-only", () => {
  for (const extra of [["--samples", "7"], ["--shard", "1/4"], ["--workloads", "alternative.json"],
    ["--report-regressions"], ["--require-baseline"], ["--safety-ceilings-only"],
    ["--runtime", "browser-wasm"], ["--native-reference", "old.json"]]) {
    const result = spawnSync(process.execPath, ["bench/browser-wasm-performance.mjs", "--native-acceptance",
      "--budget", "bench/browser-wasm-budget.json", ...extra], { cwd: root, encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /--native-acceptance requires the full checked-in corpus/);
  }
});

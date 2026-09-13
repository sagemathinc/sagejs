// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildDashboard, sha256, validateAcceptanceReceipt } = require("../scripts/wasm-workload-dashboard.cjs");
const root = path.resolve(__dirname, "..");
const fixtureRoot = path.join(__dirname, "fixtures/wasm-workload-dashboard");
const revision = "a".repeat(40);
const identity = `sha256:${"b".repeat(64)}`;
const load = (filename) => {
  const bytes = fs.readFileSync(filename);
  return { filename, bytes, document: JSON.parse(bytes), sha256: sha256(bytes) };
};
const fixture = (filename) => load(path.join(fixtureRoot, filename));
const workloadInput = fixture("performance-cases.json");
const budget = load(path.join(root, "bench/browser-wasm-budget.json"));
const config = {
  workloads: workloadInput.document, workloadIdentity: `sha256:${workloadInput.sha256}`,
  selection: { kind: "complete", case_ids: workloadInput.document.cases.map((item) => item.id) },
  sourceRevision: revision, budgetIdentity: `sha256:${budget.sha256}`,
  maximumInterruptLatencyMs: budget.document.thresholds.maximum_interrupt_latency_ms,
  artifactIdentity: identity, buildReceiptIdentity: identity,
};

function driver(workloads = config.workloads, options = {}) {
  const counts = { opened: 0, closed: 0, evaluated: 0, memory: 0, interrupted: 0, driverClosed: 0 };
  return {
    counts, runtime: { kind: "browser-wasm", engine: options.engine ?? "chromium" },
    diagnostics: () => ({ fixture: true }),
    close: async () => { counts.driverClosed++; },
    async open() {
      counts.opened++;
      return {
        startup_ms: 1,
        close: async () => { counts.closed++; },
        memory: async () => { counts.memory++; return {}; },
        interrupt: async () => { counts.interrupted++; return { rejected: !options.interruptCompleted, latency_ms: options.interruptLatency ?? 1 }; },
        async evaluate(source, timeout) {
          counts.evaluated++;
          if (options.failEvaluation === counts.evaluated) throw new Error("fixture evaluation failed");
          const workload = workloads.cases.find((item) => item.source === source);
          assert.ok(workload, "only a declared source can execute");
          assert.equal(timeout, workload.timeout_ms);
          const routes = workload.requires.map((item) => ({
            capability_id: item.id, selected_route: item.route,
            execution_target: { "receipt-backed-wasm-artifact": "wasm-artifact", "shared-runtime-js": "host-runtime-js", "portable-fallback": "portable-python" }[item.route],
            call_count: 1, ingress_bytes: 0, egress_bytes: 0,
          }));
          const instrumentation = { routes, boundary_crossings: routes.length, copied_bytes: 0 };
          options.mutateInstrumentation?.(instrumentation, counts.evaluated);
          return { duration_ms: 1, instrumentation: options.noInstrumentation ? null : instrumentation };
        },
      };
    },
  };
}

test("acceptance preserves every cold/warm source and route without memory sampling or repeated timing", async () => {
  const { collectAcceptance } = await import("../bench/browser-wasm-workload-acceptance.mjs");
  const { runPerformance } = await import("../bench/browser-wasm-performance.mjs");
  const acceptedDriver = driver();
  const receipt = await collectAcceptance(acceptedDriver, config);
  const timedDriver = driver();
  const timed = await runPerformance(timedDriver, config.workloads, 1, config.workloadIdentity);
  assert.equal(receipt.schema, "sagejs.browser-wasm-workload-acceptance/v1");
  assert.deepEqual(receipt.operations["heavy-math"].instrumentation, timed.operations["heavy-math"].instrumentation);
  assert.equal(acceptedDriver.counts.evaluated, 2);
  assert.equal(acceptedDriver.counts.memory, 0);
  assert.equal(timedDriver.counts.memory, 3);
  assert.equal(acceptedDriver.counts.opened, acceptedDriver.counts.closed);
  assert.equal(acceptedDriver.counts.driverClosed, 1);
  assert.equal(receipt.operations["heavy-math"].warm_ms, undefined);
  assert.equal(receipt.operations["heavy-math"].memory, undefined);
});

test("the full 21-case corpus and every shard retain their exact sources and requirements", async () => {
  const { collectAcceptance } = await import("../bench/browser-wasm-workload-acceptance.mjs");
  const { selectPerformanceWorkloads } = await import("../bench/browser-wasm-performance.mjs");
  const workloads = load(path.join(root, "bench/browser-wasm-performance-cases.json")).document;
  const seen = [];
  for (let index = 1; index <= 4; index++) {
    const selected = selectPerformanceWorkloads(workloads, `${index}/4`);
    const currentDriver = driver(workloads);
    const receipt = await collectAcceptance(currentDriver, { ...config, workloads, selection: selected.selection });
    assert.equal(currentDriver.counts.evaluated, selected.workloads.cases.length * 2);
    assert.equal(currentDriver.counts.memory, 0);
    seen.push(...Object.keys(receipt.operations));
  }
  assert.deepEqual(seen.sort(), workloads.cases.map((item) => item.id).sort());
});

test("execution, private telemetry and interrupt failures cannot produce acceptance", async () => {
  const { collectAcceptance } = await import("../bench/browser-wasm-workload-acceptance.mjs");
  for (const options of [
    { failEvaluation: 2 }, { noInstrumentation: true }, { interruptCompleted: true },
    { interruptLatency: 5001 }, { interruptLatency: NaN },
    { mutateInstrumentation: (raw) => { raw.boundary_crossings++; } },
  ]) {
    const currentDriver = driver(config.workloads, options);
    await assert.rejects(collectAcceptance(currentDriver, config));
    assert.equal(currentDriver.counts.opened, currentDriver.counts.closed);
    assert.equal(currentDriver.counts.driverClosed, 1);
  }
});

test("acceptance validation rejects stale identities, incomplete selections and fabricated warm passes", async () => {
  const { collectAcceptance } = await import("../bench/browser-wasm-workload-acceptance.mjs");
  const receipt = await collectAcceptance(driver(), config);
  const expected = { ...config, workloads: config.workloads.cases };
  for (const mutate of [
    (r) => { r.workload_identity = "wrong"; },
    (r) => { r.safety_budget_identity = "wrong"; },
    (r) => { r.source_revision = null; },
    (r) => { r.artifact_identity = null; },
    (r) => { r.runtime.engine = "unknown"; },
    (r) => { r.status = "failed"; },
    (r) => { r.interrupt.latency_ms = 5001; },
    (r) => { r.operations = {}; },
    (r) => { r.workload_selection.case_ids = []; },
    (r) => { r.workload_selection.kind = "unknown"; },
    (r) => { r.operations["heavy-math"].instrumentation.warm.samples = []; },
    (r) => { r.operations["heavy-math"].instrumentation.cold.required_routes = []; },
  ]) {
    const changed = structuredClone(receipt); mutate(changed);
    assert.throws(() => validateAcceptanceReceipt(changed, expected));
  }
});

function inputs() {
  return { policy: fixture("policy.json"), parity: fixture("parity-corpus.json"),
    capabilities: fixture("capability-report.json"), kernels: fixture("kernel-coverage.json"), performance: workloadInput };
}

test("acceptance-only enforcement succeeds without timing reports but still requires all engines and exact source", async (t) => {
  const { collectAcceptance } = await import("../bench/browser-wasm-workload-acceptance.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-acceptance-fixture-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const data = inputs();
  data.policy.document.heavy_workloads.required_browser_engines = ["chromium", "firefox", "webkit"];
  const receiptPaths = [];
  for (const engine of data.policy.document.heavy_workloads.required_browser_engines) {
    const receipt = await collectAcceptance(driver(config.workloads, { engine }), config);
    const filename = path.join(dir, `${engine}.json`);
    fs.writeFileSync(filename, JSON.stringify(receipt)); receiptPaths.push(filename);
  }
  const options = { root, inputs: data, acceptanceOnly: true, expectedSourceRevision: revision, receiptPaths, receiptDirectories: [] };
  const complete = buildDashboard(options);
  assert.equal(complete.policy_result.failed_heavy_workloads, 0);
  assert.equal(complete.policy_result.accepted_receipts, 3);
  assert.equal(complete.acceptance_contract.performance_reports_authorize_routes, false);
  assert.equal(buildDashboard({ ...options, receiptPaths: receiptPaths.slice(1) }).policy_result.failed_heavy_workloads, 1);
  assert.equal(buildDashboard({ ...options, expectedSourceRevision: "c".repeat(40) }).policy_result.failed_heavy_workloads, 1);
  assert.equal(buildDashboard({ ...options, receiptPaths: [path.join(fixtureRoot, "trusted-performance-receipt.json")] }).policy_result.failed_heavy_workloads, 1);
  assert.throws(() => buildDashboard({ ...options, expectedSourceRevision: undefined }), /exact expected source/);
});

test("cold-only unexpected portable execution is still rejected by workload policy", async (t) => {
  const { collectAcceptance } = await import("../bench/browser-wasm-workload-acceptance.mjs");
  const receipt = await collectAcceptance(driver(config.workloads, {
    mutateInstrumentation(raw, count) {
      if (count !== 1) return;
      raw.routes.push({ capability_id: "portable:surprise", selected_route: "portable-fallback", execution_target: "portable-python", call_count: 1, ingress_bytes: 0, egress_bytes: 0 });
      raw.boundary_crossings++;
    },
  }), config);
  const data = inputs();
  data.capabilities.document.capabilities.push({ id: "portable:surprise", family: "fixture", disposition: "portable-fallback", status: "fallback", wasm_module: "sage-runtime" });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-acceptance-cold-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filename = path.join(dir, "receipt.json"); fs.writeFileSync(filename, JSON.stringify(receipt));
  const dashboard = buildDashboard({ root, inputs: data, acceptanceOnly: true, expectedSourceRevision: revision, receiptPaths: [filename], receiptDirectories: [] });
  assert.equal(dashboard.policy_result.failed_heavy_workloads, 1);
  assert.ok(dashboard.workloads.find((item) => item.id === "performance:heavy-math").issues.some((issue) => issue.code === "portable-computation-on-heavy-workload"));
});

test("acceptance CLI cannot silently select a different workload corpus or reporting mode", async () => {
  const { parseArguments } = await import("../bench/browser-wasm-workload-acceptance.mjs");
  assert.equal(parseArguments(["--engine", "firefox", "--output", "out.json", "--shard", "1/4"])["--shard"], "1/4");
  for (const args of [[], ["--engine", "unknown", "--output", "x"], ["--engine", "chromium", "--output", "x", "--samples", "0"], ["--workloads", "fake"], ["--engine", "chromium", "--engine", "webkit"]]) assert.throws(() => parseArguments(args));
});

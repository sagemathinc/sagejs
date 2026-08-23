// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  ROUTE_CLASSES,
  buildDashboard,
  markdownDashboard,
  sha256,
  validatePolicy,
} = require("../scripts/wasm-workload-dashboard.cjs");

const ROOT = path.resolve(__dirname, "..");
const FIXTURES = path.join(__dirname, "fixtures", "wasm-workload-dashboard");

function input(name) {
  const filename = path.join(FIXTURES, name);
  const bytes = fs.readFileSync(filename);
  return {
    filename,
    bytes,
    document: JSON.parse(bytes.toString("utf8")),
    sha256: sha256(bytes),
  };
}

function inputs() {
  return {
    policy: input("policy.json"),
    parity: input("parity-corpus.json"),
    capabilities: input("capability-report.json"),
    kernels: input("kernel-coverage.json"),
    performance: input("performance-cases.json"),
  };
}

function temporaryReceipt(transform) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-wasm-dashboard-"));
  const receipt = input("trusted-performance-receipt.json").document;
  transform(receipt);
  const filename = path.join(directory, "receipt.json");
  fs.writeFileSync(filename, `${JSON.stringify(receipt, null, 2)}\n`);
  return { directory, filename };
}

test("trusted private telemetry distinguishes all workload route classes", () => {
  const dashboard = buildDashboard({
    root: ROOT,
    inputs: inputs(),
    receiptPaths: [path.join(FIXTURES, "trusted-performance-receipt.json")],
  });
  assert.deepEqual(ROUTE_CLASSES, [
    "wasm-library",
    "wasm-compiled-source",
    "portable-orchestration",
    "portable-computation",
  ]);
  const heavy = dashboard.workloads.find((item) => item.id === "performance:heavy-math");
  assert.equal(heavy.status, "accelerated");
  assert.deepEqual(
    heavy.expected_routes.map((route) => route.route_class),
    ["wasm-library", "wasm-compiled-source", "portable-orchestration"],
  );
  assert.deepEqual(
    heavy.engines.chromium.observed_routes.map((route) => route.route_class),
    ["wasm-compiled-source", "wasm-library", "portable-orchestration"],
  );
  assert.equal(heavy.engines.chromium.boundary_crossings.median, 4);
  assert.equal(heavy.engines.chromium.copied_bytes.median, 40);
  const routine = dashboard.workloads.find((item) => item.id === "parity:routine-portable");
  assert.equal(routine.status, "reviewed-fallback");
  assert.equal(routine.expected_routes[0].route_class, "portable-computation");
  assert.equal(routine.expected_routes[0].reviewed, true);
  assert.equal(dashboard.policy_result.failed_heavy_workloads, 0);
  assert.equal(dashboard.policy_result.accepted_receipts, 1);
  assert.match(markdownDashboard(dashboard), /1\/1 accelerated; 0 failed closed/);
});

test("user-controlled diagnostic JSON cannot counterfeit evaluator telemetry", () => {
  const dashboard = buildDashboard({
    root: ROOT,
    inputs: inputs(),
    receiptPaths: [path.join(FIXTURES, "user-output-counterfeit-receipt.json")],
  });
  const heavy = dashboard.workloads.find((item) => item.id === "performance:heavy-math");
  assert.equal(dashboard.policy_result.accepted_receipts, 0);
  assert.equal(dashboard.policy_result.rejected_receipts, 1);
  assert.match(
    dashboard.input_receipts.rejected_route_receipts[0].reason,
    /private evaluator telemetry/,
  );
  assert.equal(heavy.status, "failed");
  assert.deepEqual(
    heavy.issues.map((issue) => issue.code),
    ["missing-trusted-route-telemetry"],
  );
});

test("an unexpected portable hot path fails a heavy workload closed", () => {
  const fixtureInputs = inputs();
  fixtureInputs.capabilities.document.capabilities.push({
    id: "portable:surprise",
    family: "fixture",
    disposition: "portable-fallback",
    status: "fallback",
    wasm_module: "sage-runtime",
  });
  const temporary = temporaryReceipt((receipt) => {
    const warm = receipt.operations["heavy-math"].instrumentation.warm;
    const route = {
      capability_id: "portable:surprise",
      selected_route: "portable-fallback",
      execution_target: "portable-python",
      call_count: 1,
      ingress_bytes: 0,
      egress_bytes: 0,
    };
    warm.samples[0].routes.push(route);
    warm.samples[0].boundary_crossings = 5;
    warm.boundary_crossings = { minimum: 5, median: 5, maximum: 5, samples: [5] };
    warm.observed_routes.push(route);
  });
  try {
    const dashboard = buildDashboard({
      root: ROOT,
      inputs: fixtureInputs,
      receiptPaths: [temporary.filename],
    });
    const heavy = dashboard.workloads.find((item) => item.id === "performance:heavy-math");
    assert.equal(heavy.status, "failed");
    assert.ok(heavy.issues.some((issue) =>
      issue.code === "unreviewed-portable-computation" &&
      issue.capability_id === "portable:surprise"));
    assert.ok(heavy.issues.some((issue) =>
      issue.code === "portable-computation-on-heavy-workload" &&
      issue.capability_id === "portable:surprise"));
  } finally {
    fs.rmSync(temporary.directory, { recursive: true });
  }
});

test("inconsistent route aggregates are rejected instead of normalized away", () => {
  const temporary = temporaryReceipt((receipt) => {
    receipt.operations["heavy-math"].instrumentation.warm.observed_routes[0].call_count = 99;
  });
  try {
    const dashboard = buildDashboard({
      root: ROOT,
      inputs: inputs(),
      receiptPaths: [temporary.filename],
    });
    assert.equal(dashboard.policy_result.accepted_receipts, 0);
    assert.match(
      dashboard.input_receipts.rejected_route_receipts[0].reason,
      /aggregate routes are inconsistent/,
    );
    assert.equal(dashboard.policy_result.failed_heavy_workloads, 1);
  } finally {
    fs.rmSync(temporary.directory, { recursive: true });
  }
});

test("a receipt is accepted atomically rather than case by case", () => {
  const temporary = temporaryReceipt((receipt) => {
    receipt.operations["unknown-late-case"] = {
      family: "fixture",
      required_capability_routes: [{
        id: "library:math",
        route: "receipt-backed-wasm-artifact",
      }],
      instrumentation: receipt.operations["heavy-math"].instrumentation,
    };
  });
  try {
    const dashboard = buildDashboard({
      root: ROOT,
      inputs: inputs(),
      receiptPaths: [temporary.filename],
    });
    assert.equal(dashboard.policy_result.accepted_receipts, 0);
    assert.equal(dashboard.policy_result.rejected_receipts, 1);
    assert.match(
      dashboard.input_receipts.rejected_route_receipts[0].reason,
      /unknown workload/,
    );
    assert.equal(dashboard.policy_result.failed_heavy_workloads, 1);
  } finally {
    fs.rmSync(temporary.directory, { recursive: true });
  }
});

test("capability declarations cannot hide an unavailable production kernel", () => {
  const fixtureInputs = inputs();
  fixtureInputs.kernels.document.kernels[0].status = "fallback";
  const dashboard = buildDashboard({
    root: ROOT,
    inputs: fixtureInputs,
    receiptPaths: [path.join(FIXTURES, "trusted-performance-receipt.json")],
  });
  const heavy = dashboard.workloads.find((item) => item.id === "performance:heavy-math");
  assert.equal(heavy.status, "failed");
  assert.ok(heavy.issues.some((issue) => issue.code === "production-kernel-unavailable"));
});

test("portable reviews are exact and cannot authorize heavyweight computation", () => {
  const policy = input("policy.json").document;
  policy.portable_route_reviews.push({ ...policy.portable_route_reviews[0] });
  assert.throws(() => validatePolicy(policy), /duplicate portable route review/);

  const fixtureInputs = inputs();
  fixtureInputs.performance.document.cases[0].requires.push({
    id: "portable:math",
    route: "portable-fallback",
  });
  fixtureInputs.performance.bytes = Buffer.from(
    `${JSON.stringify(fixtureInputs.performance.document, null, 2)}\n`,
  );
  fixtureInputs.performance.sha256 = sha256(fixtureInputs.performance.bytes);
  const dashboard = buildDashboard({ root: ROOT, inputs: fixtureInputs, receiptPaths: [] });
  const heavy = dashboard.workloads.find((item) => item.id === "performance:heavy-math");
  assert.ok(heavy.issues.some((issue) => issue.code === "unreviewed-portable-computation"));
  assert.ok(heavy.issues.some((issue) => issue.code === "portable-computation-on-heavy-workload"));
});

test("the checked-in dashboard is a deterministic projection of current inputs", () => {
  const dashboard = buildDashboard({ root: ROOT, receiptPaths: [] });
  const currentCorpus = JSON.parse(fs.readFileSync(
    path.join(ROOT, "test", "browser-wasm-parity-corpus.json"),
    "utf8",
  ));
  const currentPerformance = JSON.parse(fs.readFileSync(
    path.join(ROOT, "bench", "browser-wasm-performance-cases.json"),
    "utf8",
  ));
  const currentCapabilities = JSON.parse(fs.readFileSync(
    path.join(ROOT, "architecture", "wasm-capabilities-report.json"),
    "utf8",
  ));
  const currentKernels = JSON.parse(fs.readFileSync(
    path.join(
      ROOT,
      "packages",
      "flint-wasm",
      "release",
      "production-kernel-coverage.json",
    ),
    "utf8",
  ));
  assert.equal(dashboard.schema, "sagejs.wasm-workload-dashboard/v1");
  assert.equal(
    dashboard.source_inventory.parity_workloads,
    currentCorpus.cases.length,
  );
  assert.equal(
    dashboard.source_inventory.performance_workloads,
    currentPerformance.cases.length,
  );
  assert.deepEqual(dashboard.source_inventory.capability_counts, currentCapabilities.counts);
  assert.deepEqual(dashboard.source_inventory.kernel_coverage_totals, currentKernels.totals);
  assert.equal(
    dashboard.policy_result.heavy_workloads,
    dashboard.workloads.filter((workload) => workload.heavy).length,
  );
  assert.equal(
    fs.readFileSync(path.join(ROOT, "architecture", "wasm-workload-dashboard.json"), "utf8"),
    `${JSON.stringify(dashboard, null, 2)}\n`,
  );
  assert.equal(
    fs.readFileSync(path.join(ROOT, "architecture", "wasm-workload-dashboard.md"), "utf8"),
    markdownDashboard(dashboard),
  );
});

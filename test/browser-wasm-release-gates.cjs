"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  compareArtifacts,
  enforceBudget,
  inspectProductionArtifact,
  sha256,
} = require("../packages/flint-wasm/scripts/browser-wasm-release-artifact.cjs");
const {
  parseHeadersFile,
  validateHeadersRules,
} = require("../packages/flint-wasm/scripts/browser-wasm-deployment.cjs");

function fixtureDirectory(answer = 42) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-wasm-release-"));
  const wasm = Buffer.from([
    0, 97, 115, 109, 1, 0, 0, 0,
    5, 4, 1, 1, 1, 2,
  ]);
  const javascript = Buffer.from(`export const answer = ${answer};\n`);
  fs.writeFileSync(path.join(directory, "kernel.wasm"), wasm);
  fs.writeFileSync(path.join(directory, "kernel.mjs"), javascript);
  const assets = [
    { path: "kernel.mjs", servePath: "kernel.mjs", bytes: javascript.length, sha256: sha256(javascript) },
    { path: "kernel.wasm", servePath: "kernel.wasm", bytes: wasm.length, sha256: sha256(wasm) },
  ];
  const manifest = {
    schema: "sagejs.wasm-production-artifact/v1",
    identity: `sha256:${String(answer).padStart(64, "0")}`,
    assets,
    layout: {
      modules: [{
        artifact: "kernel.wasm",
        memory: { pageBytes: 65536, initialPages: 1, maximumPages: 2 },
      }],
    },
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  fs.writeFileSync(path.join(directory, "production-manifest.json"), manifestBytes);
  fs.writeFileSync(path.join(directory, "build-receipt.json"), JSON.stringify({
    schema: "sagejs.wasm-build-receipt/v1",
    source_revision: "fixture",
    artifact: manifest,
    productionManifestSha256: sha256(manifestBytes),
  }));
  return directory;
}

test("release artifact receipts validate hashes, Wasm magic, compression, and reproducibility", () => {
  const left = fixtureDirectory();
  const right = fixtureDirectory();
  try {
    const report = inspectProductionArtifact(left);
    assert.equal(report.files.length, 2);
    assert.equal(report.source_revision, "fixture");
    assert.deepEqual(compareArtifacts(report, inspectProductionArtifact(right)), []);
    fs.appendFileSync(path.join(right, "kernel.mjs"), "// drift\n");
    assert.throws(() => inspectProductionArtifact(right), /digest/);
  } finally {
    fs.rmSync(left, { recursive: true });
    fs.rmSync(right, { recursive: true });
  }
});

test("grammar modules inherit the authenticated bounded Tree-sitter memory", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-wasm-imported-memory-"));
  const provider = Buffer.from([
    0, 97, 115, 109, 1, 0, 0, 0,
    2, 16, 1, 3, 101, 110, 118, 6, 109, 101, 109, 111, 114, 121, 2, 1, 2, 8,
  ]);
  const grammar = Buffer.from([
    0, 97, 115, 109, 1, 0, 0, 0,
    2, 15, 1, 3, 101, 110, 118, 6, 109, 101, 109, 111, 114, 121, 2, 0, 1,
  ]);
  try {
    fs.writeFileSync(path.join(directory, "runtime.wasm"), provider);
    fs.writeFileSync(path.join(directory, "grammar.wasm"), grammar);
    const assets = [
      { path: "grammar.wasm", servePath: "grammar.wasm", bytes: grammar.length, sha256: sha256(grammar) },
      { path: "runtime.wasm", servePath: "runtime.wasm", bytes: provider.length, sha256: sha256(provider) },
    ];
    const manifest = {
      schema: "sagejs.wasm-production-artifact/v1",
      identity: `sha256:${"1".repeat(64)}`,
      assets,
      layout: {
        modules: [],
        importedMemoryDomains: [{
          id: "tree-sitter",
          provider: "runtime.wasm",
          consumers: ["grammar.wasm"],
          memory: { pageBytes: 65536, initialPages: 2, maximumPages: 4 },
        }],
      },
    };
    const manifestBytes = Buffer.from(JSON.stringify(manifest));
    fs.writeFileSync(path.join(directory, "production-manifest.json"), manifestBytes);
    fs.writeFileSync(path.join(directory, "build-receipt.json"), JSON.stringify({
      schema: "sagejs.wasm-build-receipt/v1",
      source_revision: "fixture",
      artifact: manifest,
      productionManifestSha256: sha256(manifestBytes),
    }));
    assert.equal(inspectProductionArtifact(directory).files.length, 2);
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});

test("Tree-sitter stays within the mobile WebView memory ceiling", () => {
  const layout = JSON.parse(
    fs.readFileSync(
      path.join(
        path.join(__dirname, ".."),
        "packages",
        "flint-wasm",
        "release",
        "production-layout.json",
      ),
      "utf8",
    ),
  );
  const treeSitter = layout.importedMemoryDomains.find(
    (domain) => domain.id === "tree-sitter",
  );
  assert.ok(treeSitter, "missing Tree-sitter memory domain");
  assert.equal(treeSitter.memory.pageBytes, 65_536);
  assert.ok(
    treeSitter.memory.maximumPages * treeSitter.memory.pageBytes <=
      384 * 1024 * 1024,
    "Tree-sitter exceeds the 384 MiB mobile WebView ceiling",
  );
});

test("release artifact inspection rejects a receipt from another artifact", () => {
  const left = fixtureDirectory(41);
  const right = fixtureDirectory(43);
  try {
    fs.copyFileSync(
      path.join(right, "build-receipt.json"),
      path.join(left, "build-receipt.json"),
    );
    assert.throws(
      () => inspectProductionArtifact(left),
      /does not authenticate|does not exactly match/,
    );
  } finally {
    fs.rmSync(left, { recursive: true });
    fs.rmSync(right, { recursive: true });
  }
});

test("relative payload gates reject unexplained compressed growth", () => {
  const report = { totals: { gzip_bytes: 106, brotli_bytes: 100 } };
  const baseline = {
    schema: "sagejs.browser-wasm-budget/v1",
    thresholds: { compressed_growth_fraction: 0.05 },
    artifact_baseline: { totals: { gzip_bytes: 100, brotli_bytes: 100 } },
  };
  assert.deepEqual(enforceBudget(report, baseline), ["gzip_bytes 106 exceeds 105"]);
  assert.deepEqual(enforceBudget({ totals: { gzip_bytes: 105, brotli_bytes: 104 } }, baseline), []);
  assert.deepEqual(
    enforceBudget(report, { ...baseline, artifact_baseline: null }, { requireBaseline: true }),
    ["reviewed artifact_baseline is absent"],
  );
});

test("Cloudflare-compatible header policy is parsed and security checked", () => {
  const rules = parseHeadersFile(`/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Resource-Policy: same-origin
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Content-Security-Policy: default-src 'none'; script-src 'self' 'unsafe-eval'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'
`);
  assert.deepEqual(validateHeadersRules(rules), []);
  rules[0].headers.delete("cross-origin-opener-policy");
  assert.match(validateHeadersRules(rules).join("\n"), /cross-origin-opener-policy/);
});

test("release performance profile has reviewed heavyweight baselines", async () => {
  const root = path.join(__dirname, "..");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "bench", "browser-wasm-performance-cases.json"), "utf8"),
  );
  const budget = JSON.parse(
    fs.readFileSync(path.join(root, "bench", "browser-wasm-budget.json"), "utf8"),
  );
  const { validatePerformanceWorkloads } = await import(
    "../bench/browser-wasm-performance.mjs"
  );
  validatePerformanceWorkloads(manifest);
  const ids = new Set(manifest.cases.map((item) => item.id));
  assert.ok(ids.has("cubic-number-field-zeta-1000"));
  assert.ok(ids.has("analytic-special-value-batches"));
  assert.ok(ids.has("elliptic-lseries-value-batch"));
  assert.ok(ids.has("elliptic-lseries-complex-plot-64"));
  assert.match(
    manifest.cases.find((item) => item.id === "cubic-number-field-zeta-1000").source,
    /coefficients\(1000\)/,
  );
  assert.match(
    manifest.cases.find((item) => item.id === "elliptic-lseries-complex-plot-64").source,
    /plot_points=64/,
  );
  for (const runtime of ["node-native", "chromium", "firefox", "webkit"]) {
    const baseline = budget.performance_baseline[runtime];
    assert.ok(Number.isFinite(baseline.startup_ms.median));
    assert.ok(Number.isFinite(baseline.interrupt_latency_ms.median));
    for (const id of ids) {
      assert.ok(Number.isFinite(baseline.operations[id].warm_ms.median));
    }
  }
  for (const engine of ["chromium", "firefox", "webkit"]) {
    const ratios = budget.native_ratio_baseline[engine].operations;
    for (const id of ids) {
      assert.ok(Number.isFinite(ratios[id].warm_median_ratio));
      assert.ok(ratios[id].warm_median_ratio > 0);
    }
  }
  assert.equal(budget.thresholds.native_ratio_regression_fraction, 0.25);
  assert.equal(budget.thresholds.warm_operation_regression_fraction, 0.3);
  assert.equal(budget.thresholds.maximum_interrupt_latency_ms, 5000);
});

test("performance instrumentation distinguishes unavailable data from measured zero", async () => {
  const { summarizeInstrumentation } = await import(
    "../bench/browser-wasm-performance.mjs"
  );
  const requirement = [{
    id: "analytic:riemann-zeta-batch",
    route: "receipt-backed-wasm-artifact",
  }];
  const unavailable = summarizeInstrumentation([null, null], requirement);
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.boundary_crossings, null);
  assert.equal(unavailable.copied_bytes, null);
  assert.equal(unavailable.required_routes[0].status, "unavailable");

  const measured = summarizeInstrumentation([{
    routes: [{
      capability_id: "analytic:riemann-zeta-batch",
      selected_route: "receipt-backed-wasm-artifact",
      execution_target: "wasm-artifact",
      call_count: 2,
      ingress_bytes: 64,
      egress_bytes: 128,
    }],
    boundary_crossings: 2,
    copied_bytes: 192,
  }], requirement);
  assert.equal(measured.status, "available");
  assert.equal(measured.boundary_crossings.median, 2);
  assert.equal(measured.copied_bytes.median, 192);
  assert.equal(measured.required_routes[0].status, "matched");
});

test("required performance budgets reject newly added unbaselined workloads", async () => {
  const { checkBudget } = await import(
    "../bench/browser-wasm-performance.mjs"
  );
  const report = {
    runtime: { kind: "browser-wasm", engine: "chromium" },
    startup_ms: { median: 10 },
    interrupt_latency_ms: { median: 5, maximum: 5 },
    operations: {
      "new-heavy-workload": {
        warm_ms: { median: 20 },
      },
    },
    native_comparison: {
      status: "available",
      operations: {
        "new-heavy-workload": { warm_median_ratio: 2 },
      },
    },
  };
  const budget = {
    schema: "sagejs.browser-wasm-budget/v1",
    thresholds: {
      startup_regression_fraction: 0.2,
      interrupt_latency_regression_fraction: 0.2,
      warm_operation_regression_fraction: 0.3,
      native_ratio_regression_fraction: 0.25,
      maximum_interrupt_latency_ms: 5000,
    },
    performance_baseline: {
      chromium: {
        startup_ms: { median: 10 },
        interrupt_latency_ms: { median: 5 },
        operations: {},
      },
    },
    native_ratio_baseline: {
      chromium: { operations: {} },
    },
  };

  assert.deepEqual(checkBudget(report, budget, true).failures, [
    "reviewed performance_baseline.chromium.operations.new-heavy-workload is absent",
    "reviewed native_ratio_baseline.chromium.operations.new-heavy-workload is absent",
  ]);
  assert.deepEqual(checkBudget(report, budget, false).failures, []);
});

test("browser/native comparison requires identical workload identities", async () => {
  const { compareNativeReceipts } = await import(
    "../bench/browser-wasm-performance.mjs"
  );
  const operation = {
    cold_ms: { median: 30 },
    warm_ms: { median: 10 },
  };
  const browser = {
    workload_identity: `sha256:${"1".repeat(64)}`,
    startup_ms: { median: 40 },
    interrupt_latency_ms: { median: 20 },
    operations: { example: operation },
  };
  const native = {
    schema: "sagejs.browser-wasm-performance/v2",
    runtime: { kind: "node-native", engine: null },
    source_revision: "fixture",
    workload_identity: browser.workload_identity,
    startup_ms: { median: 20 },
    interrupt_latency_ms: { median: 5 },
    operations: {
      example: {
        cold_ms: { median: 10 },
        warm_ms: { median: 5 },
      },
    },
  };
  const comparison = compareNativeReceipts(browser, native, "sha256:fixture");
  assert.equal(comparison.startup_median_ratio, 2);
  assert.equal(comparison.operations.example.cold_median_ratio, 3);
  assert.equal(comparison.operations.example.warm_median_ratio, 2);
  assert.throws(
    () => compareNativeReceipts(browser, { ...native, workload_identity: "other" }),
    /different workloads/,
  );
});

// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { once } = require("node:events");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { brotliCompressSync } = require("node:zlib");
const {
  compareArtifacts,
  enforceBudget,
  enforceTopologyBudgets,
  inspectProductionArtifact,
  sha256,
} = require("../packages/flint-wasm/scripts/browser-wasm-release-artifact.cjs");
const {
  parseHeadersFile,
  validateDeployedOrigin,
  validateHeadersRules,
} = require("../packages/flint-wasm/scripts/browser-wasm-deployment.cjs");
const {
  nativeOracleCacheIdentity,
  nativeOracleCacheKey,
} = require("../scripts/native-oracle-cache-key.cjs");

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
    const crossPlatform = {
      ...inspectProductionArtifact(right),
      build_receipt_sha256: "platform-specific-receipt",
    };
    assert.deepEqual(
      compareArtifacts(report, crossPlatform, { includeBuildReceipt: false }),
      [],
    );
    assert.deepEqual(
      compareArtifacts(report, crossPlatform),
      ["build receipt bytes differ"],
    );
    fs.appendFileSync(path.join(right, "kernel.mjs"), "// drift\n");
    assert.throws(() => inspectProductionArtifact(right), /digest/);
  } finally {
    fs.rmSync(left, { recursive: true });
    fs.rmSync(right, { recursive: true });
  }
});

test("native oracle cache identity is content-addressed by every native stage", () => {
  const identity = nativeOracleCacheIdentity(path.join(__dirname, ".."));
  assert.equal(identity.schema, "sagejs.native-oracle-actions-cache/v1");
  assert.deepEqual(
    identity.artifacts.map((item) => item.id),
    [
      "fflas-addon",
      "fflas-dependencies",
      "flint-addon",
      "flint-dependencies",
      "graph-addon",
      "graph-dependencies",
      "m4ri-addon",
      "m4ri-dependencies",
    ],
  );
  for (const artifact of identity.artifacts) {
    assert.match(artifact.key, /^[0-9a-f]{64}$/);
  }
  assert.match(nativeOracleCacheKey(path.join(__dirname, "..")), /^[0-9a-f]{64}$/);
});

test("release CI shards performance and reuses only authenticated native cache entries", () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, "..", ".github", "workflows", "wasm-release.yml"),
    "utf8",
  );
  assert.match(workflow, /node scripts\/native-oracle-cache-key\.cjs/);
  assert.match(workflow, /SAGEJS_PARALLEL_NATIVE_CACHE/);
  assert.doesNotMatch(workflow, /\$\{\{ runner\.temp \}\}/);
  assert.match(workflow, /pnpm parallel:cache -- prepare/);
  assert.doesNotMatch(workflow, /pnpm bootstrap/);
  assert.match(workflow, /browser-parity:/);
  assert.match(workflow, /browser-performance:/);
  assert.match(workflow, /browser-security-chromium:/);
  assert.match(workflow, /browser-webkit-recovery:/);
  assert.match(workflow, /shard: \[1, 2, 3, 4\]/);
  assert.match(workflow, /--shard \$\{\{ matrix\.shard \}\}\/4/);
  assert.match(workflow, /name: Browser release gates/);
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

test("reviewed packaging budgets can adjust topology limits without changing artifact identity", () => {
  const report = {
    payload_groups: [
      {
        id: "eager-core",
        compressed_delta: { gzip_bytes: 101, brotli_bytes: 91 },
        maximum_compressed_delta: { gzip_bytes: 100, brotli_bytes: 90 },
      },
      {
        id: "specialist",
        compressed_delta: { gzip_bytes: 20, brotli_bytes: 19 },
        maximum_compressed_delta: { gzip_bytes: 20, brotli_bytes: 20 },
      },
    ],
  };
  const budget = {
    schema: "sagejs.browser-wasm-budget/v1",
    artifact_topology_limits: {
      "eager-core": { gzip_bytes: 102, brotli_bytes: 92 },
    },
  };
  assert.deepEqual(enforceTopologyBudgets(report, budget), []);
  assert.throws(
    () => enforceTopologyBudgets(report, {
      ...budget,
      artifact_topology_limits: {
        typo: { gzip_bytes: 102, brotli_bytes: 92 },
      },
    }),
    /unknown group typo/,
  );
  assert.throws(
    () => enforceTopologyBudgets(report, {
      ...budget,
      artifact_topology_limits: {
        "eager-core": { gzip_bytes: 102 },
      },
    }),
    /must contain exactly gzip_bytes and brotli_bytes/,
  );
});

test("release reproducibility uses the reviewed packaging budget", () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, "..", ".github", "workflows", "wasm-release.yml"),
    "utf8",
  );
  assert.match(
    workflow,
    /browser-wasm-release-artifact\.cjs \\\n\s+--dist build\/a\/packages\/flint-wasm\/dist \\\n\s+--budget bench\/browser-wasm-budget\.json \\\n\s+--require-baseline \\\n\s+--compare build\/b\/packages\/flint-wasm\/dist/,
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

async function withDeploymentOrigin({ doubleBrotli = false, doubleImmutableBrotli = false } = {}, callback) {
  const release = "a".repeat(64);
  const runtime = Buffer.from(`${JSON.stringify({
    schema: "org.sagejs.web/runtime-v1",
    revision: "fixture-revision",
    artifactIdentity: `sha256:${"b".repeat(64)}`,
  })}\n`);
  const immutable = Buffer.from("export const answer = 42;\n");
  const immutablePath = `/assets/sha256-${"b".repeat(64)}/runtime.mjs`;
  const manifest = Buffer.from(`${JSON.stringify({
    schema: "org.sagejs.web/assets-v2",
    release,
    artifactIdentity: `sha256:${"b".repeat(64)}`,
    assets: [{
      path: `.${immutablePath}`,
      bytes: immutable.length,
      sha256: createHash("sha256").update(immutable).digest("hex"),
    }],
  })}\n`);
  const server = http.createServer((request, response) => {
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-SageJS-Release", release);
    if (request.url === "/") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end("<!doctype html><title>Sage.js</title>");
      return;
    }
    if (request.url === "/asset-manifest.json") {
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(manifest);
      return;
    }
    if (request.url === "/runtime-version.json") {
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      if ((request.headers["accept-encoding"] ?? "").includes("br")) {
        response.setHeader("Content-Encoding", "br");
        const compressed = brotliCompressSync(runtime);
        response.end(doubleBrotli ? brotliCompressSync(compressed) : compressed);
      } else {
        response.end(runtime);
      }
      return;
    }
    if (request.url === immutablePath) {
      response.setHeader("Content-Type", "text/javascript; charset=utf-8");
      if ((request.headers["accept-encoding"] ?? "").includes("br")) {
        response.setHeader("Content-Encoding", "br");
        const compressed = brotliCompressSync(immutable);
        response.end(doubleImmutableBrotli ? brotliCompressSync(compressed) : compressed);
      } else {
        response.end(immutable);
      }
      return;
    }
    response.statusCode = 404;
    response.end("missing");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    return await callback(`http://127.0.0.1:${address.port}/`, {
      revision: "fixture-revision",
      artifactIdentity: `sha256:${"b".repeat(64)}`,
    });
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("deployed origin validation rejects double-compressed Brotli", async () => {
  await withDeploymentOrigin({}, async (origin, expectedRuntime) => {
    assert.deepEqual(await validateDeployedOrigin(origin, { expectedRuntime }), []);
  });
  await withDeploymentOrigin({ doubleBrotli: true }, async (origin, expectedRuntime) => {
    assert.match(
      (await validateDeployedOrigin(origin, { expectedRuntime })).join("\n"),
      /decode to different bytes/,
    );
  });
  await withDeploymentOrigin({ doubleImmutableBrotli: true }, async (origin, expectedRuntime) => {
    assert.match(
      (await validateDeployedOrigin(origin, { expectedRuntime })).join("\n"),
      /immutable responses decode to different bytes/,
    );
  });
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
  const safetyOnly = checkBudget(report, {
    ...budget,
    thresholds: { ...budget.thresholds, maximum_interrupt_latency_ms: 4 },
  }, false, {
    enforceRegressionBaseline: false,
    enforceNativeRatio: false,
  });
  assert.deepEqual(safetyOnly.failures, [
    "interrupt latency exceeded its absolute safety ceiling",
  ]);
});

test("performance workload shards are deterministic, disjoint, and complete", async () => {
  const { selectPerformanceWorkloads } = await import(
    "../bench/browser-wasm-performance.mjs"
  );
  const workloads = {
    schema: "sagejs.browser-wasm-performance-cases/v1",
    cases: Array.from({ length: 20 }, (_, index) => ({ id: `case-${index}` })),
  };
  const selected = Array.from({ length: 4 }, (_, index) =>
    selectPerformanceWorkloads(workloads, `${index + 1}/4`));
  assert.deepEqual(selected.map((item) => item.workloads.cases.length), [5, 5, 5, 5]);
  assert.deepEqual(
    selected.flatMap((item) => item.selection.case_ids).sort(),
    workloads.cases.map((item) => item.id).sort(),
  );
  assert.equal(
    new Set(selected.flatMap((item) => item.selection.case_ids)).size,
    workloads.cases.length,
  );
  assert.throws(
    () => selectPerformanceWorkloads(workloads, "0/4"),
    /valid nonempty workload shard/,
  );
  assert.throws(
    () => selectPerformanceWorkloads(workloads, "one-of-four"),
    /INDEX\/COUNT/,
  );
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

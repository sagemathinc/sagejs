#!/usr/bin/env node
// sagejs-test-tier: specialized
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { readJson } = require("../../../scripts/numerical-computing/common.cjs");
const { validateCorpus } = require("../../../scripts/numerical-computing/contracts.cjs");
const {
  capabilityDraft,
} = require("../../../scripts/numerical-computing/qualification/prepare-node.cjs");
const {
  renderMatrix,
} = require("../../../scripts/numerical-computing/qualification/render-matrix.cjs");
const { ADAPTER_PROTOCOL } = require("../../../scripts/numerical-computing/contracts.cjs");

const root = path.resolve(__dirname, "..", "..", "..");
const campaign = path.join(root, "bench", "numerical-computing", "qualification");
const corpus = validateCorpus(readJson(path.join(campaign, "product.corpus.json")));
const spec = readJson(path.join(campaign, "capabilities", "node-capability-spec.json"));

test("product corpus covers every P0-P8 phase, evidence layer, and integrated domain", () => {
  assert.deepEqual(
    [...new Set(corpus.cases.map((item) => item.program_phase))].sort(),
    ["P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"],
  );
  assert.deepEqual(
    [...new Set(corpus.cases.map((item) => item.layer))].sort(),
    [
      "conditioned-stress", "definition-identity", "differential-oracle",
      "failure-semantics", "fuzz", "independent-residual", "metamorphic",
    ],
  );
  const required = [
    "numerics.root.scalar", "numerics.approximation.interpolation",
    "numerics.approximation.splines", "numerics.approximation.finite_difference",
    "numerics.approximation.chebyshev",
    "numerics.approximation.polynomial_roots",
    "numerics.integration.quadrature", "numerics.linear.solve",
    "numerics.linear.factorizations",
    "numerics.optimization.scalar", "numerics.optimization.cminpack",
    "numerics.optimization.cminpack_optional_resource",
    "numerics.optimization.nlopt_nelder_mead",
    "numerics.optimization.nlopt_cobyla",
    "numerics.optimization.nlopt_optional_resource",
    "numerics.ode.explicit_ivp", "numerics.ode.stiff_ivp", "numerics.ode.sweeps",
    "numerics.spectral.dense", "numerics.spectral.fft",
    "numerics.spectral.convolution", "numerics.spectral.sparse",
    "numerics.statistics.descriptive", "numerics.statistics.inference",
    "numerics.statistics.rng", "numerics.statistics.regression",
    "numerics.sweeps.bounded",
    "numerics.frontend.catalog", "numerics.frontend.parser_guards",
    "numerics.frontend.matlab_shapes",
    "numerics.frontend.scipy_execution", "numerics.frontend.guardrails",
    "numerics.teaching.scalar_optimization",
  ];
  const used = new Set(corpus.cases.flatMap((item) => item.required_capabilities));
  for (const id of required) assert(used.has(id), `missing ${id}`);
});

test("capability specification exactly covers cases and future slices fail closed", () => {
  const draft = capabilityDraft(spec, corpus);
  const available = draft.capabilities.filter((item) => item.status === "available");
  const covered = new Set(available.flatMap((item) => item.case_ids));
  assert.deepEqual([...covered].sort(), corpus.cases.map((item) => item.id).sort());
  for (const id of [
    "numerics.optimization.polynomial_least_squares",
    "numerics.ode.stiff_sparse",
  ]) {
    const item = draft.capabilities.find((entry) => entry.id === id);
    assert.equal(item.status, "unavailable");
    assert.deepEqual(item.case_ids, []);
    assert.match(item.reason, /reserved/);
  }
});

test("matrix templates enumerate native and runtime rows without fake evidence", () => {
  const nodeTemplate = readJson(path.join(campaign, "matrix", "node-four-platform.template.json"));
  const fullTemplate = readJson(path.join(campaign, "matrix", "full-runtime.template.json"));
  assert.deepEqual(nodeTemplate.rows.map((item) => item.platform).sort(), [
    "linux-arm64", "linux-x64", "macos-arm64", "windows-x64",
  ]);
  assert.equal(fullTemplate.rows.length, 16);
  assert.deepEqual(
    [...new Set(fullTemplate.rows.map((item) => item.subject.kind))].sort(),
    ["browser", "node", "npm", "sea", "worker"],
  );
  const available = spec.capabilities
    .filter((item) => (item.status ?? "available") === "available")
    .map((item) => item.id)
    .sort();
  assert.deepEqual(nodeTemplate.required_capabilities.slice().sort(), available);
  assert.deepEqual(fullTemplate.required_capabilities.slice().sort(), available);
  assert.throws(
    () => renderMatrix(nodeTemplate, corpus, new Map()),
    /missing bound capability manifest for linux-x64-node/,
  );
});

test("runtime adapters are executable and cminpack evidence uses portable Sage.js source", () => {
  const nodeAdapter = require(path.join(campaign, "node-adapter.cjs"));
  const browserAdapter = require(path.join(campaign, "browser-adapter.cjs"));
  const packageAdapter = require(path.join(campaign, "package-adapter.cjs"));
  for (const adapter of [nodeAdapter, browserAdapter, packageAdapter]) {
    assert.equal(adapter.protocol, ADAPTER_PROTOCOL);
    assert.equal(typeof adapter.initialize, "function");
    assert.equal(typeof adapter.runCase, "function");
    assert.equal(typeof adapter.close, "function");
  }
  for (const id of [
    "p3-cminpack-rosenbrock-lmdif",
    "p3-cminpack-rosenbrock-lmder",
    "p8-cminpack-cancelled",
  ]) {
    const item = corpus.cases.find((entry) => entry.id === id);
    const source = nodeAdapter.qualificationInternals.sourceFor(id, item.input);
    assert.match(source, /runtime\.numerical_backend\(\)/);
    assert.match(source, /liveAllocations/);
    assert.match(source, /__SAGEJS_NUMERICAL_QUALIFICATION__/);
  }
  assert.equal(typeof browserAdapter._testing.launchBrowser, "function");
});

const browserArtifact = path.join(root, "packages", "flint-wasm");
const browserCminpack = path.join(browserArtifact, "dist", "cminpack.wasm");
const browserNlopt = path.join(browserArtifact, "dist", "nlopt-methods.wasm");
const browserAdapterPath = path.join(campaign, "browser-adapter.cjs");
const browserAdapterForProbe = require(browserAdapterPath);
const chromium = browserAdapterForProbe._testing.browserExecutable(
  require("playwright-core").chromium,
  "chromium",
);
const browserBuilt = chromium !== null &&
  fs.existsSync(path.join(browserArtifact, "kernel.mjs")) &&
  fs.existsSync(browserCminpack) && fs.existsSync(browserNlopt);

test("browser-worker adapter interrupts, replaces, and reuses the real worker", {
  skip: browserBuilt ? false : "build packages/flint-wasm and install Chromium for worker qualification",
  timeout: 60_000,
}, async () => {
  delete require.cache[require.resolve(browserAdapterPath)];
  const adapter = require(browserAdapterPath);
  const draft = capabilityDraft(spec, corpus, {
    kind: "worker", name: "sagejs-browser-worker", version: "probe", engine: null,
  });
  const initialized = await adapter.initialize({
    root,
    backend: draft.backend,
    subject: draft.subject,
    artifacts: [
      { name: "sagejs-browser", path: browserArtifact, sha256: "test-only", bytes: 0 },
      { name: "cminpack-wasm", path: browserCminpack, sha256: "test-only", bytes: 0 },
      { name: "nlopt-wasm", path: browserNlopt, sha256: "test-only", bytes: 0 },
    ],
    capabilities: draft.capabilities,
  });
  try {
    assert.equal(initialized.subject.kind, "worker");
    assert(initialized.capability_ids.includes("numerics.lifecycle.recovery"));
    const item = corpus.cases.find((entry) => entry.id === "p8-runtime-recovery");
    const observed = await adapter.runCase(item);
    assert.equal(observed.outcome.kind, "success");
    assert.equal(observed.values.contained_status, "callback_error");
    assert.equal(observed.values.recovered, true);
    assert.equal(observed.values.runtime_interrupt_observed, true);
    assert(observed.values.independent_residual <= 1e-12);
  } finally {
    await adapter.close();
  }
});

const npmRootArchive = process.env.SAGEJS_QUALIFICATION_NPM_ROOT_TGZ;
const npmPlatformArchive = process.env.SAGEJS_QUALIFICATION_NPM_PLATFORM_TGZ;
const npmArtifactsPresent = Boolean(npmRootArchive && npmPlatformArchive &&
  fs.existsSync(npmRootArchive) && fs.existsSync(npmPlatformArchive));

test("fresh npm adapter executes installed source and lazy cminpack bytes", {
  skip: npmArtifactsPresent ? false :
    "set SAGEJS_QUALIFICATION_NPM_ROOT_TGZ and SAGEJS_QUALIFICATION_NPM_PLATFORM_TGZ",
  timeout: 240_000,
}, async () => {
  const adapterPath = path.join(campaign, "package-adapter.cjs");
  delete require.cache[require.resolve(adapterPath)];
  const adapter = require(adapterPath);
  const draft = capabilityDraft(spec, corpus, {
    kind: "npm", name: "@sagemath/sagejs", version: "probe", engine: null,
  });
  const initialized = await adapter.initialize({
    root,
    backend: draft.backend,
    subject: draft.subject,
    artifacts: [
      { name: "npm-root-tarball", path: npmRootArchive, sha256: "test-only", bytes: 0 },
      { name: "npm-platform-tarball", path: npmPlatformArchive, sha256: "test-only", bytes: 0 },
    ],
    capabilities: draft.capabilities,
  });
  try {
    assert.equal(initialized.subject.kind, "npm");
    for (const id of ["p1-root-cosine", "p3-cminpack-rosenbrock-lmdif"] ) {
      const item = corpus.cases.find((entry) => entry.id === id);
      const observed = await adapter.runCase(item);
      assert.equal(observed.outcome.kind, "success", id);
      assert(Object.values(observed.values).every((value) => value !== undefined), id);
    }
  } finally {
    await adapter.close();
  }
});

const dist = path.join(root, "dist");
const cminpackWasm = path.join(
  root, "packages", "flint-wasm", "numerical", "build", "cminpack.wasm",
);
const nloptWasm = path.join(dist, "numerical", "nlopt-methods.wasm");
const built = fs.existsSync(path.join(dist, "tools", "kernel.js")) &&
  fs.existsSync(cminpackWasm) && fs.existsSync(nloptWasm);

test("first-party adapter executes Sage.js and independently checks representative domains", {
  skip: built ? false : "run pnpm build to exercise the artifact adapter",
  timeout: 180_000,
}, async () => {
  const adapterPath = path.join(campaign, "node-adapter.cjs");
  delete require.cache[require.resolve(adapterPath)];
  const adapter = require(adapterPath);
  const draft = capabilityDraft(spec, corpus);
  const initialized = await adapter.initialize({
    root,
    backend: draft.backend,
    subject: draft.subject,
    artifacts: [
      { name: "sagejs-dist", path: dist, sha256: "test-only", bytes: 0 },
      { name: "cminpack-wasm", path: cminpackWasm, sha256: "test-only", bytes: 0 },
      { name: "nlopt-wasm", path: nloptWasm, sha256: "test-only", bytes: 0 },
    ],
    capabilities: draft.capabilities,
  });
  try {
    assert.equal(initialized.subject.version, process.version);
    for (const id of [
      "p1-root-cosine", "p2-linear-solve", "p2-polynomial-roots-known",
      "p2-cubic-spline-polynomial", "p2-finite-difference-sine",
      "p2-chebyshev-exponential", "p2-linear-qr-factorization",
      "p2-linear-cholesky-factorization",
      "p3-scalar-minimum", "p3-cminpack-rosenbrock-lmdif",
      "p3-cminpack-rosenbrock-lmder", "p4-ode-exponential",
      "p3-cminpack-optional-resource-fail-closed",
      "p3-nlopt-nelder-mead-rosenbrock",
      "p3-nlopt-nelder-mead-one-dimensional",
      "p3-nlopt-nelder-mead-zero-scale",
      "p3-nlopt-nelder-mead-saddle-rejected",
      "p3-nlopt-cobyla-circle",
      "p3-nlopt-cobyla-infeasible-rejected",
      "p3-nlopt-cobyla-nonminimum-rejected",
      "p3-nlopt-failure-provenance",
      "p3-nlopt-optional-resource-fail-closed",
      "p4-ode-stiff-decay", "p4-ode-decay-sweep",
      "p5-general-eigen", "p5-singular-value-decomposition",
      "p5-fft-direct-oracle", "p5-convolution-direct-oracle",
      "p5-sparse-linear-solve", "p5-sparse-dominant-eigen",
      "p5-statistics-summary", "p5-statistics-inference",
      "p5-statistics-rng-replay", "p5-statistics-linear-regression",
      "p6-multilingual-catalog-roundtrip",
      "p6-multilingual-parser-fail-closed",
      "p6-matlab-vector-shapes",
      "p6-scipy-emitted-execution",
      "p6-frontend-failure-and-expression-guards",
      "p6-frontend-resource-guards",
      "p7-cross-domain-teaching-artifacts",
      "p7-scalar-optimization-retained-view",
    ]) {
      const item = corpus.cases.find((entry) => entry.id === id);
      const observed = await adapter.runCase({
        id: item.id,
        program_phase: item.program_phase,
        layer: item.layer,
        workload_tier: item.workload_tier,
        campaign: item.campaign,
        input: item.input,
        sample_kind: "test",
        sample_index: 0,
      });
      assert.equal(observed.outcome.kind, "success", id);
      assert.equal(Object.hasOwn(observed, "passed"), false, id);
      assert(Object.values(observed.values).every((value) => value !== undefined), id);
      if (id === "p3-cminpack-optional-resource-fail-closed") {
        assert.equal(observed.values.automatic_successes, 2);
        assert.equal(observed.values.explicit_failures, 2);
        assert.deepEqual(observed.values.explicit_statuses, [
          "backend_failure", "backend_failure",
        ]);
      }
      if (id === "p6-matlab-vector-shapes") {
        assert.equal(observed.values.witnesses, 11);
        assert.deepEqual(observed.values.mismatches, []);
      }
      if (id === "p3-nlopt-nelder-mead-rosenbrock") {
        assert.equal(observed.values.method, "nlopt-nelder-mead");
        assert.equal(observed.values.backend, "nlopt-mit-wasm");
        assert.equal(observed.values.cache_reused, true);
        assert.equal(observed.values.automatic_backend, "ordinary-python");
      }
      if (id === "p3-nlopt-cobyla-infeasible-rejected") {
        assert.equal(observed.values.public_success, false);
        assert.equal(observed.values.validation_passed, false);
        assert.equal(observed.values.backend_status_positive, true);
      }
      if (id === "p3-nlopt-nelder-mead-zero-scale") {
        assert.equal(observed.values.public_success, true);
        assert(Math.abs(observed.values.result) <= 1e-8);
        assert(observed.values.evaluations < 1000);
      }
      if (id === "p3-nlopt-nelder-mead-saddle-rejected" ||
          id === "p3-nlopt-cobyla-nonminimum-rejected") {
        assert.equal(observed.values.public_success, false);
        assert.equal(observed.values.validation_passed, false);
        assert.equal(observed.values.validation_kind, "indeterminate");
      }
      if (id === "p3-nlopt-failure-provenance") {
        assert.deepEqual(observed.values.statuses, ["callback_error", "cancelled"]);
        assert.deepEqual(observed.values.implementation_kinds, [
          "external_library_wasm", "external_library_wasm",
        ]);
        assert.deepEqual(observed.values.source_transparent, [false, false]);
      }
      if (id === "p3-nlopt-optional-resource-fail-closed") {
        assert.equal(observed.values.automatic_successes, 2);
        assert.equal(observed.values.explicit_failures, 4);
        assert.equal(observed.values.private_details_leaked, 0);
      }
    }
  } finally {
    await adapter.close();
  }
  assert.equal(adapter.qualificationState().initialized, false);
});

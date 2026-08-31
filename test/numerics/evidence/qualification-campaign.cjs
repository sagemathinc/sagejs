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
    "numerics.integration.quadrature", "numerics.linear.solve",
    "numerics.optimization.scalar", "numerics.ode.explicit_ivp",
    "numerics.spectral.dense", "numerics.spectral.fft",
    "numerics.statistics.descriptive", "numerics.sweeps.bounded",
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
    "numerics.approximation.polynomial_roots",
    "numerics.ode.stiff_ivp",
    "numerics.optimization.cminpack",
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
  assert.equal(fullTemplate.rows.length, 12);
  assert.deepEqual(
    [...new Set(fullTemplate.rows.map((item) => item.subject.kind))].sort(),
    ["browser", "node", "sea", "worker"],
  );
  assert.throws(
    () => renderMatrix(nodeTemplate, corpus, new Map()),
    /missing bound capability manifest for linux-x64-node/,
  );
});

const dist = path.join(root, "dist");
const built = fs.existsSync(path.join(dist, "tools", "kernel.js"));

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
    artifacts: [{ name: "sagejs-dist", path: dist, sha256: "test-only", bytes: 0 }],
    capabilities: draft.capabilities,
  });
  try {
    assert.equal(initialized.subject.version, process.version);
    for (const id of [
      "p1-root-cosine", "p2-linear-solve", "p3-scalar-minimum",
      "p4-ode-exponential", "p5-fft-direct-oracle", "p5-statistics-summary",
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
    }
  } finally {
    await adapter.close();
  }
  assert.equal(adapter.qualificationState().initialized, false);
});

// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { workflowInventory, parseWorkflow, dependencyPath } = require("../scripts/release/workflow-inventory.cjs");
const root = path.resolve(__dirname, "..");
const sha = (s) => createHash("sha256").update(s).digest("hex");

function fixture(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-workflow-inventory-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, ".github/workflows"), { recursive: true });
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, ".github/workflows", name), content);
  return dir;
}

test("real publisher and deployment retain indirect reporting ancestors in the shadow graph", () => {
  const graph = workflowInventory(root);
  assert.deepEqual(graph.reviewErrors, []);
  assert.deepEqual(graph.nodes.find((node) => node.key === "ci.yml#publish-release").concurrency, {
    group: "sagejs-production-publication", "cancel-in-progress": false, queue: "max",
  });
  assert.deepEqual(graph.nodes.find((node) => node.key === "protect-latest-release.yml#@success").concurrency, {
    group: "sagejs-production-publication", "cancel-in-progress": false, queue: "max",
  });
  const route = (from, to) => dependencyPath(graph.nodes, graph.edges, from, to);
  assert.deepEqual(route("ci.yml#publish-release", "wasm-release.yml#browser-performance"), [
    "ci.yml#publish-release", "wasm-release.yml#@success", "wasm-release.yml#browser-performance",
  ]);
  assert.equal(route("wasm-release.yml#workload-enforcement", "wasm-release.yml#browser-performance"), null);
  assert.equal(route("wasm-release.yml#browser-product-acceptance", "wasm-release.yml#browser-performance"), null);
  assert.ok(route("wasm-release.yml#browser-product-acceptance", "wasm-release.yml#node-oracle"),
    "the mixed native oracle still contains timing work; the split is not complete");
  assert.ok(route("wasm-deploy-cloudflare.yml#deploy", "ci.yml#numerical-release-gate"));
  assert.ok(route("wasm-deploy-cloudflare.yml#deploy", "wasm-release.yml#browser-security-chromium"));
  assert.equal(route("wasm-release.yml#browser-performance", "ci.yml#publish-release"), null);
  const perf = graph.nodes.find((n) => n.key === "wasm-release.yml#browser-performance");
  assert.deepEqual(perf.strategy.matrix.engine, ["chromium", "firefox", "webkit"]);
  assert.deepEqual(perf.strategy.matrix.shard, [1, 2, 3, 4]);
  assert.ok(perf.steps.some((s) => typeof s.run === "string"));
  assert.deepEqual(graph.unreviewedControlSteps, []);
  assert.ok(route("release-artifact-handoff.yml#capture", "ci.yml#native-product-acceptance"));
  assert.ok(route("release-artifact-handoff.yml#capture", "wasm-release.yml#browser-product-acceptance"));
  assert.equal(route("release-artifact-handoff.yml#capture", "wasm-release.yml#browser-performance"), null);
  assert.equal(route("publish-validated-release.yml#request", "ci.yml#publish-release"), null,
    "dispatch is not proof of publication completion");
  assert.ok(graph.controlEffects.some((effect) => effect.from === "publish-validated-release.yml#request" && effect.target === "ci.yml#recover-publish" && effect.kind === "dispatch"));
  assert.ok(graph.controlEffects.some((effect) => effect.from === "ci.yml#recover-publish" && effect.target === "ci.yml#publish-release" && effect.kind === "rerun-job"));
  assert.ok(graph.controlEffects.some((effect) => effect.kind === "release-pointer" && effect.target === "github:releases/latest"));
  assert.ok(graph.controlEffects.some((effect) => effect.from === "ci.yml#publish-release" && effect.kind === "release-assets" && effect.target === "github:release-assets"));
  assert.ok(graph.controlEffects.some((effect) => effect.from === "ci.yml#publish-release" && effect.kind === "npm-publication" && effect.target === "npm:registry"));
  assert.ok(graph.edges.some((edge) => edge.kind === "reviewed-artifact-input" && edge.names.includes("sagejs-macos-arm64") && edge.to === "ci.yml#macos-sign"));
});

test("YAML 1.2 triggers, block scalars, conditions, tolerance and matrix expressions survive inspection", (t) => {
  const dir = fixture(t, { "test.yml": `name: Fixture
on: [push]
jobs:
  report:
    if: false
    continue-on-error: true
    strategy:
      matrix: { platform: [linux, windows] }
    runs-on: \${{ matrix.platform }}
    steps:
      - name: Never execute
        run: |
          echo "needs: [fake]"
          exit 99
  publish:
    needs:
      - report
    steps: []
` });
  const graph = workflowInventory(dir, { schema: "sagejs.workflow-api-edges/v2", entries: [] });
  assert.deepEqual(graph.nodes[0].triggers, ["push"]);
  const report = graph.nodes.find((n) => n.id === "report");
  assert.equal(report.condition, false);
  assert.equal(report.continueOnError, true);
  assert.match(report.steps[0].run, /exit 99/);
  assert.deepEqual(dependencyPath(graph.nodes, graph.edges, "test.yml#publish", "test.yml#report"), ["test.yml#publish", "test.yml#report"]);
});

test("missing needs, cycles, duplicate YAML keys and unsupported YAML tags fail closed", (t) => {
  for (const [label, source, message] of [
    ["missing", "jobs: {build: {needs: nonexistent}}", /invalid needs/],
    ["cycle", "jobs: {a: {needs: b}, b: {needs: a}}", /cyclic/],
    ["duplicate", "jobs: {a: {}, a: {}}", /invalid workflow/],
    ["tag", "jobs: !custom {}", /invalid workflow/],
  ]) {
    const dir = fixture(t, { [`${label}.yml`]: source });
    assert.throws(() => workflowInventory(dir, { schema: "sagejs.workflow-api-edges/v2", entries: [] }), message);
  }
  assert.throws(() => parseWorkflow("jobs: []", "fixture"), /lacks jobs/);
});

test("reviewed API edges require exact shell and helper identities; drift is visible and cannot supply an edge", (t) => {
  const dir = fixture(t, {
    "publish.yml": "jobs: {publish: {steps: [{name: Check, run: 'gh api trusted'}]}}",
    "build.yml": "jobs: {build: {steps: []}}",
  });
  fs.writeFileSync(path.join(dir, "helper.cjs"), "original helper");
  const review = { schema: "sagejs.workflow-api-edges/v2", entries: [{
    workflow: "publish.yml", job: "publish", step: "Check", runSha256: sha("gh api trusted"),
    helpers: [{ filename: "helper.cjs", sha256: sha("original helper") }],
    requiresWorkflowSuccess: ["build.yml"], semantics: "fixture complete workflow check",
  }] };
  let graph = workflowInventory(dir, review);
  assert.deepEqual(graph.reviewErrors, []);
  assert.equal(graph.unreviewedControlSteps.length, 0);
  assert.ok(dependencyPath(graph.nodes, graph.edges, "publish.yml#publish", "build.yml#build"));
  fs.writeFileSync(path.join(dir, "helper.cjs"), "changed helper");
  graph = workflowInventory(dir, review);
  assert.equal(graph.reviewErrors.length, 1);
  assert.equal(graph.unreviewedControlSteps.length, 1);
  assert.equal(dependencyPath(graph.nodes, graph.edges, "publish.yml#publish", "build.yml#build"), null);
  fs.writeFileSync(path.join(dir, "helper.cjs"), "original helper");
  review.entries[0].runSha256 = sha("other command");
  assert.match(workflowInventory(dir, review).reviewErrors[0].failures[0], /changed/);
  review.entries[0].helpers[0].filename = "../escape.cjs";
  assert.ok(workflowInventory(dir, review).reviewErrors[0].failures.some((s) => /unsafe/.test(s)));
});

test("ambiguous step names and unknown target workflows cannot be reviewed by accident", (t) => {
  const dir = fixture(t, { "test.yml": "jobs: {p: {steps: [{name: Check, run: test}, {name: Check, run: test}]}}" });
  const graph = workflowInventory(dir, { schema: "sagejs.workflow-api-edges/v2", entries: [{
    workflow: "test.yml", job: "p", step: "Check", runSha256: sha("test"), helpers: [],
    requiresWorkflowSuccess: ["missing.yml"], semantics: "fixture",
  }] });
  assert.equal(graph.reviewErrors.length, 1);
  assert.equal(graph.edges.filter((edge) => edge.kind === "reviewed-api-workflow-success").length, 0);
});

test("cross-workflow review cannot introduce a hidden circular completion dependency", (t) => {
  const dir = fixture(t, { "test.yml": "jobs: {p: {steps: [{name: Check, run: test}]}}" });
  assert.throws(() => workflowInventory(dir, { schema: "sagejs.workflow-api-edges/v2", entries: [{
    workflow: "test.yml", job: "p", step: "Check", runSha256: sha("test"), helpers: [],
    requiresWorkflowSuccess: ["test.yml"], semantics: "impossible self completion",
  }] }), /cyclic workflow dependencies/);
});

test("job checks, artifact inputs and control effects have separate meanings and all anchors are checked", (t) => {
  const dir = fixture(t, {
    "build.yml": "jobs: {product: {steps: [{uses: actions/upload-artifact@v7, with: {name: product-bytes}}]}, report: {steps: []}}",
    "publish.yml": "jobs: {p: {steps: [{name: Check, run: 'gh api checked'}]}}",
  });
  const entry = { workflow: "publish.yml", job: "p", step: "Check", runSha256: sha("gh api checked"), helpers: [], requiresWorkflowSuccess: [],
    requiresJobSuccess: ["build.yml#product"], artifactInputs: [{ producer: "build.yml#product", names: ["product-bytes"] }],
    effects: [{ kind: "rerun-job", target: "publish.yml#p" }], semantics: "fixture qualified-product consumption and asynchronous retry" };
  const inspect = (value = entry) => workflowInventory(dir, { schema: "sagejs.workflow-api-edges/v2", entries: [value] });
  const graph = inspect(); assert.deepEqual(graph.reviewErrors, []); assert.equal(graph.controlEffects.length, 1);
  assert.deepEqual(dependencyPath(graph.nodes, graph.edges, "publish.yml#p", "build.yml#product"), ["publish.yml#p", "build.yml#product"]);
  assert.equal(dependencyPath(graph.nodes, graph.edges, "publish.yml#p", "build.yml#report"), null);
  for (const changed of [
    { requiresJobSuccess: ["build.yml#@success"] }, { requiresJobSuccess: ["build.yml#missing"] },
    { requiresJobSuccess: ["build.yml#product", "build.yml#product"] },
    { artifactInputs: [{ producer: "build.yml#product", names: ["other-bytes"] }] },
    { artifactInputs: [{ producer: "build.yml#report", names: ["product-bytes"] }] },
    { effects: [{ kind: "dispatch", target: "build.yml#missing" }] },
    { effects: [{ kind: "release-pointer", target: "arbitrary-pointer" }] },
    { effects: [{ kind: "unknown-effect", target: "publish.yml#p" }] },
    { requiresJobSuccess: [], artifactInputs: [], effects: [] },
  ]) {
    const bad = inspect({ ...entry, ...changed });
    assert.equal(bad.reviewErrors.length, 1); assert.equal(bad.unreviewedControlSteps.length, 1);
    assert.equal(bad.controlEffects.length, 0);
    assert.equal(bad.edges.filter((edge) => edge.kind.startsWith("reviewed-")).length, 0);
  }
});

test("unreviewed new control calls remain visible after the existing review is complete", (t) => {
  const dir = fixture(t, { "test.yml": "jobs: {p: {steps: [{name: New API, run: 'gh run download 123'}]}}" });
  const graph = workflowInventory(dir, { schema: "sagejs.workflow-api-edges/v2", entries: [] });
  assert.equal(graph.unreviewedControlSteps.length, 1);
  assert.deepEqual(graph.edges.map((edge) => edge.kind), ["workflow-conclusion"]);
});

test("artifact name checks accept only an explicit literal cell of a static matrix", (t) => {
  const dir = fixture(t, {
    "build.yml": 'jobs: {product: {strategy: {matrix: {replica: [a, b]}}, steps: [{uses: actions/upload-artifact@v7, with: {name: "product-${{ matrix.replica }}"}}]}}',
    "publish.yml": "jobs: {p: {steps: [{name: Download, run: 'gh run download 123'}]}}",
  });
  const entry = { workflow: "publish.yml", job: "p", step: "Download", runSha256: sha("gh run download 123"), helpers: [], requiresWorkflowSuccess: [],
    artifactInputs: [{ producer: "build.yml#product", names: ["product-a"], matrix: { replica: "a" } }], semantics: "select exact replica a bytes" };
  const inspect = (e) => workflowInventory(dir, { schema: "sagejs.workflow-api-edges/v2", entries: [e] });
  assert.deepEqual(inspect(entry).reviewErrors, []);
  for (const matrix of [{}, { replica: "b" }, { replica: "c" }, { other: "a" }, "a"]) {
    assert.equal(inspect({ ...entry, artifactInputs: [{ ...entry.artifactInputs[0], matrix }] }).reviewErrors.length, 1);
  }
  const filename = path.join(dir, ".github/workflows/build.yml"), source = fs.readFileSync(filename, "utf8");
  fs.writeFileSync(filename, source.replace("replica: [a, b]", "replica: [a, b], exclude: [{replica: a}]"));
  assert.equal(inspect(entry).reviewErrors.length, 1, "a review cannot pretend to interpret an excluded cell");
});

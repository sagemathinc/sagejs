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
  assert.ok(graph.unreviewedControlSteps.length > 0, "unreviewed API calls must not disappear");
  assert.ok(graph.unreviewedControlSteps.some((step) => step.key === "release-artifact-handoff.yml#capture"),
    "new helper-based cross-workflow capture must remain visible until its edges are explicitly reviewed");
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
  const graph = workflowInventory(dir, { schema: "sagejs.workflow-api-edges/v1", entries: [] });
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
    assert.throws(() => workflowInventory(dir, { schema: "sagejs.workflow-api-edges/v1", entries: [] }), message);
  }
  assert.throws(() => parseWorkflow("jobs: []", "fixture"), /lacks jobs/);
});

test("reviewed API edges require exact shell and helper identities; drift is visible and cannot supply an edge", (t) => {
  const dir = fixture(t, {
    "publish.yml": "jobs: {publish: {steps: [{name: Check, run: 'gh api trusted'}]}}",
    "build.yml": "jobs: {build: {steps: []}}",
  });
  fs.writeFileSync(path.join(dir, "helper.cjs"), "original helper");
  const review = { schema: "sagejs.workflow-api-edges/v1", entries: [{
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
  const graph = workflowInventory(dir, { schema: "sagejs.workflow-api-edges/v1", entries: [{
    workflow: "test.yml", job: "p", step: "Check", runSha256: sha("test"), helpers: [],
    requiresWorkflowSuccess: ["missing.yml"], semantics: "fixture",
  }] });
  assert.equal(graph.reviewErrors.length, 1);
  assert.equal(graph.edges.filter((edge) => edge.kind === "reviewed-api-workflow-success").length, 0);
});

test("cross-workflow review cannot introduce a hidden circular completion dependency", (t) => {
  const dir = fixture(t, { "test.yml": "jobs: {p: {steps: [{name: Check, run: test}]}}" });
  assert.throws(() => workflowInventory(dir, { schema: "sagejs.workflow-api-edges/v1", entries: [{
    workflow: "test.yml", job: "p", step: "Check", runSha256: sha("test"), helpers: [],
    requiresWorkflowSuccess: ["test.yml"], semantics: "impossible self completion",
  }] }), /cyclic workflow dependencies/);
});

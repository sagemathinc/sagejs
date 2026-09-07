// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const assert = require("node:assert/strict"), test = require("node:test");
const { requireWasmProduct, runsFromPages } = require("../scripts/release/require-wasm-release.cjs");
const { inspectDeploymentInputs, requireSameDeploymentInputs } = require("../scripts/release/deployment-inputs.cjs");
const { boundaries, requiredStep } = require("../scripts/release/product-acceptance.cjs");
const sha = "2".repeat(40), tag = "v0.8.0+release.2";
function run(id = 101, kind = "browser", overrides = {}) {
  return { id, head_sha: sha, head_branch: tag, event: "push", run_attempt: 2,
    status: "completed", conclusion: "success", path: boundaries[kind].workflow,
    repository: { full_name: "sagemathinc/sagejs" }, head_repository: { full_name: "sagemathinc/sagejs" }, ...overrides };
}
function fixture(overrides = {}) {
  const runs = { 101: run(101, "browser", overrides), 201: run(201, "native", overrides) };
  const jobs = Object.fromEntries(Object.values(runs).map(r => [r.id, [{ id: r.id + 1000, run_id: r.id,
    run_attempt: 2, head_sha: sha, name: boundaries[r.id === 101 ? "browser" : "native"].job,
    status: "completed", conclusion: "success", steps: [{ name: requiredStep, status: "completed", conclusion: "success" }] }]]));
  const calls = [];
  const api = (endpoint, paginate) => {
    calls.push(endpoint);
    const match = /^repos\/sagemathinc\/sagejs\/actions\/runs\/(\d+)(?:\/attempts\/(\d+)\/jobs\?per_page=100)?$/.exec(endpoint);
    assert.ok(match, "unexpected endpoint " + endpoint);
    const r = runs[match[1]]; assert.ok(r, "selected run exists");
    if (match[2]) { assert.equal(Number(match[2]), r.run_attempt); assert.equal(paginate, true);
      return structuredClone([{ total_count: jobs[r.id].length, jobs: jobs[r.id] }]); }
    return structuredClone(r);
  };
  return { runs, jobs, api, calls };
}
const options = { sourceRunId: 101, qualificationRunId: 201, target: "production" };
test("publisher authenticates newest exact-tag product without requiring reporting completion", () => {
  for (const conclusion of ["failure", "timed_out", "cancelled", null]) {
    const f = fixture({ conclusion, status: conclusion === null ? "in_progress" : "completed" });
    const result = requireWasmProduct([{ workflow_runs: [run(100), f.runs[101]] }], sha, tag, f.api);
    assert.equal(result.runId, 101); assert.equal(result.productStatus, "passed");
    assert.equal(result.workflowConclusion, conclusion);
  }
});
test("an older success cannot hide missing, skipped or failed current product acceptance", () => {
  for (const conclusion of ["failure", "timed_out", "skipped", null]) {
    const f = fixture(); f.jobs[101][0].conclusion = conclusion;
    assert.throws(() => requireWasmProduct({ workflow_runs: [run(100), f.runs[101]] }, sha, tag, f.api), /did not succeed/);
    assert.ok(!f.calls.some(x => x.includes("/100")));
  }
  const f = fixture(); f.jobs[101][0].name = "Browser release gates";
  assert.throws(() => requireWasmProduct({ workflow_runs: [f.runs[101]] }, sha, tag, f.api), /exactly one/);
});
test("publication rejects missing, foreign or malformed evidence even if list says success", () => {
  assert.throws(() => runsFromPages({}), /not a GitHub response/);
  const f = fixture();
  for (const override of [{ head_branch: "other" }, { head_sha: "3".repeat(40) }, { event: "workflow_dispatch" }]) {
    assert.throws(() => requireWasmProduct({ workflow_runs: [run(101, "browser", override)] }, sha, tag, f.api), /no WebAssembly release run matches/);
  }
  for (const list of [[run("101")], [run(), run()]]) {
    assert.throws(() => requireWasmProduct({ workflow_runs: list }, sha, tag, f.api), /unique authenticated run ids/);
  }
  f.runs[101].head_repository.full_name = "fork/sagejs";
  assert.throws(() => requireWasmProduct({ workflow_runs: [run()] }, sha, tag, f.api), /identity/);
  assert.throws(() => requireWasmProduct({ workflow_runs: [] }, "short", tag, f.api), /full lowercase/);
});
test("app consumes same-source native and browser products independently of reports", () => {
  const f = fixture({ status: "in_progress", conclusion: null });
  const value = inspectDeploymentInputs(options, f.api);
  assert.equal(value.sourceRevision, sha); assert.equal(value.branch, "main");
  assert.equal(value.native.productStatus, "passed"); assert.equal(value.browser.productStatus, "passed");
  assert.equal(inspectDeploymentInputs({ ...options, target: "preview", previewName: "candidate" }, f.api).branch, "preview-candidate-" + sha.slice(0,12));
  f.runs[101].conclusion = f.runs[201].conclusion = "failure";
  f.runs[101].status = f.runs[201].status = "completed";
  requireSameDeploymentInputs(value, inspectDeploymentInputs(options, f.api));
});
test("both app product gates remain mandatory; wrong source or foreign workflows fail", () => {
  for (const id of [101, 201]) for (const conclusion of ["failure", "timed_out", "skipped", null]) {
    const f = fixture(); f.jobs[id][0].conclusion = conclusion;
    assert.throws(() => inspectDeploymentInputs(options, f.api), /did not succeed/);
  }
  for (const mutate of [
    f => f.runs[201].head_sha = "3".repeat(40),
    f => f.runs[201].event = "workflow_dispatch",
    f => f.runs[101].path = ".github/workflows/wasm-candidate.yml",
    f => f.runs[201].repository.full_name = "fork/sagejs",
    f => f.jobs[201][0].steps = [],
  ]) { const f = fixture(); mutate(f); assert.throws(() => inspectDeploymentInputs(options, f.api)); }
});
test("app admission rejects malformed IDs and preview output injection before API reads", () => {
  for (const changes of [{ sourceRunId: "101" }, { qualificationRunId: 0 }, { target: "bad" }, { target: "preview", previewName: "x\nsha=evil" }]) {
    const f = fixture(); assert.throws(() => inspectDeploymentInputs({ ...options, ...changes }, f.api)); assert.equal(f.calls.length, 0);
  }
});
test("app detects reruns during second product inspection and before activation", () => {
  const f = fixture(); const previous = inspectDeploymentInputs(options, f.api);
  let browserReads = 0;
  assert.throws(() => inspectDeploymentInputs(options, (endpoint, pages) => {
    const value = f.api(endpoint, pages);
    if (endpoint.endsWith("/101") && ++browserReads === 4) value.run_attempt++;
    return value;
  }), /attempt changed/);
  for (const field of ["runAttempt", "jobId", "sourceRevision", "ref"]) {
    const changed = structuredClone(previous); changed.browser[field] = "changed";
    assert.throws(() => requireSameDeploymentInputs(previous, changed), /identity changed/);
  }
  assert.throws(() => inspectDeploymentInputs(options, () => { throw new Error("API unavailable"); }), /API unavailable/);
});

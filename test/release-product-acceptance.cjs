// sagejs-test-tier: unit
// sagejs-test-portable: true
// sagejs-test-resume-inputs: []
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { boundaries, requiredStep, argumentsFor, inspectProductAcceptance, verifyProductAcceptance, readJobPages } = require("../scripts/release/product-acceptance.cjs");
const options = { kind: "browser", runId: 101, sha: "a".repeat(40), ref: "v0.8.0", event: "push", purpose: "release" };

function snapshot() {
  const before = { id: 101, head_sha: options.sha, head_branch: options.ref, event: "push", path: boundaries.browser.workflow,
    repository: { full_name: "sagemathinc/sagejs" }, head_repository: { full_name: "sagemathinc/sagejs" },
    run_attempt: 2, status: "completed", conclusion: "success" };
  const job = { id: 201, run_id: 101, run_attempt: 2, head_sha: options.sha, name: boundaries.browser.job,
    status: "completed", conclusion: "success", steps: [{ name: requiredStep, status: "completed", conclusion: "success" }] };
  return { before, after: structuredClone(before), pages: [{ total_count: 2, jobs: [job, { ...job, id: 202, name: "Reporting campaign", steps: [] }] }] };
}

test("report failure, timeout or ongoing execution cannot mask a passed product gate", () => {
  for (const conclusion of ["failure", "timed_out", "cancelled", null]) {
    const value = snapshot();
    value.pages[0].jobs[1].conclusion = conclusion;
    value.pages[0].jobs[1].status = conclusion === null ? "in_progress" : "completed";
    value.before.status = value.after.status = conclusion === null ? "in_progress" : "completed";
    value.before.conclusion = value.after.conclusion = conclusion;
    const accepted = verifyProductAcceptance(value, options);
    assert.equal(accepted.productStatus, "passed");
    assert.equal(accepted.runAttempt, 2);
    assert.equal(accepted.workflowConclusion, conclusion);
  }
});

test("unsuccessful product prerequisites and skipped assertion steps always block", () => {
  for (const conclusion of ["failure", "timed_out", "cancelled", "skipped", "neutral", null]) {
    const value = snapshot(); value.pages[0].jobs[0].conclusion = conclusion;
    assert.throws(() => verifyProductAcceptance(value, options), /gate did not succeed/);
    const step = snapshot(); step.pages[0].jobs[0].steps[0].conclusion = conclusion;
    assert.throws(() => verifyProductAcceptance(step, options), /assertion/);
  }
  const running = snapshot(); running.pages[0].jobs[0].status = "in_progress";
  assert.throws(() => verifyProductAcceptance(running, options), /gate did not succeed/);
});

test("missing, ambiguous or legacy aggregate names cannot authorize the new product contract", () => {
  for (const name of ["Browser release gates", "Numerical release qualification gate", "Reporting campaign"]) {
    const value = snapshot(); value.pages[0].jobs[0].name = name;
    assert.throws(() => verifyProductAcceptance(value, options), /exactly one/);
  }
  const duplicate = snapshot(); duplicate.pages[0].jobs[1].name = boundaries.browser.job;
  assert.throws(() => verifyProductAcceptance(duplicate, options), /exactly one/);
  const step = snapshot(); step.pages[0].jobs[0].steps = [];
  assert.throws(() => verifyProductAcceptance(step, options), /assertion/);
  const duplicateStep = snapshot();
  duplicateStep.pages[0].jobs[0].steps.push({ ...duplicateStep.pages[0].jobs[0].steps[0] });
  assert.throws(() => verifyProductAcceptance(duplicateStep, options), /assertion/);
});

test("native and browser product observations cannot substitute for one another", () => {
  const value = snapshot();
  const native = { ...options, kind: "native" };
  value.before.path = value.after.path = boundaries.native.workflow;
  assert.throws(() => verifyProductAcceptance(value, native), /exactly one/);
  value.pages[0].jobs[0].name = boundaries.native.job;
  const accepted = verifyProductAcceptance(value, native);
  assert.equal(accepted.kind, "native");
  assert.equal(accepted.workflow, boundaries.native.workflow);
  assert.throws(() => verifyProductAcceptance(value, options), /identity/);
});

test("repository, fork, source, ref, workflow, run and attempt identities are enforced", () => {
  for (const mutate of [
    (r) => { r.id = 102; }, (r) => { r.head_sha = "b".repeat(40); }, (r) => { r.head_branch = "main"; },
    (r) => { r.event = "pull_request"; }, (r) => { r.path = boundaries.native.workflow; },
    (r) => { r.repository.full_name = "fork/sagejs"; }, (r) => { r.head_repository.full_name = "fork/sagejs"; },
    (r) => { r.run_attempt = "2"; }, (r) => { r.run_attempt = 0; }, (r) => { r.status = "queued"; },
  ]) {
    for (const phase of ["before", "after"]) {
      const value = snapshot(); mutate(value[phase]);
      assert.throws(() => verifyProductAcceptance(value, options));
    }
  }
  const changed = snapshot(); changed.after.run_attempt = 3;
  assert.throws(() => verifyProductAcceptance(changed, options), /attempt changed/);
  const progressed = snapshot(); progressed.before.status = "in_progress"; progressed.before.conclusion = null;
  assert.equal(verifyProductAcceptance(progressed, options).productStatus, "passed");
});

test("attempt pagination must be complete, unique and source-bound", () => {
  for (const mutate of [
    (v) => { v.pages = []; }, (v) => { v.pages[0].total_count = 3; },
    (v) => { v.pages[0].jobs[1].id = 201; }, (v) => { v.pages[0].jobs[1].run_attempt = 1; },
    (v) => { v.pages[0].jobs[1].run_id = 99; }, (v) => { v.pages[0].jobs[1].head_sha = "b".repeat(40); },
  ]) { const value = snapshot(); mutate(value); assert.throws(() => verifyProductAcceptance(value, options)); }
  const paginated = snapshot();
  paginated.pages = paginated.pages[0].jobs.map((job) => ({ total_count: 2, jobs: [job] }));
  assert.equal(verifyProductAcceptance(paginated, options).jobId, 201);
});

test("a publisher-only retry cannot silently inherit an earlier product observation", () => {
  // Model selective publication recovery, not a claim about which jobs an
  // arbitrary GitHub rerun includes. Publication attempt and qualification
  // attempt need separate artifact-bound identities before consumer migration.
  const value = snapshot();
  value.before.path = value.after.path = boundaries.native.workflow;
  const native = { ...options, kind: "native" };
  value.pages = [{ total_count: 1, jobs: [{ ...value.pages[0].jobs[0],
    name: "Publish tagged GitHub and npm release", status: "in_progress", conclusion: null }] }];
  assert.throws(() => verifyProductAcceptance(value, native), /exactly one/);
  value.pages[0].jobs.push({ ...value.pages[0].jobs[0], id: 203,
    name: boundaries.native.job, run_attempt: 1, status: "completed", conclusion: "success" });
  value.pages[0].total_count = 2;
  assert.throws(() => verifyProductAcceptance(value, native), /foreign-attempt/);
});

test("authenticated inspection pins the attempt endpoint and rereads the run before accepting", () => {
  const value = snapshot(), calls = [];
  const api = (endpoint, paginate) => {
    calls.push([endpoint, paginate]);
    return calls.length === 1 ? value.before : calls.length === 2 ? value.pages : value.after;
  };
  assert.equal(inspectProductAcceptance(options, api).jobId, 201);
  assert.deepEqual(calls, [
    ["repos/sagemathinc/sagejs/actions/runs/101", undefined],
    ["repos/sagemathinc/sagejs/actions/runs/101/attempts/2/jobs?per_page=100", true],
    ["repos/sagemathinc/sagejs/actions/runs/101", undefined],
  ]);
  let requested = 0;
  assert.throws(() => inspectProductAcceptance(options, () => { requested++; return { ...value.before, run_attempt: "../other" }; }));
  assert.equal(requested, 1);
});

test("qualification cannot silently impersonate immutable tag publication", () => {
  const value = snapshot(); value.before.event = value.after.event = "workflow_dispatch";
  value.before.head_branch = value.after.head_branch = "main";
  const qualification = { ...options, purpose: "qualification", event: "workflow_dispatch", ref: "main" };
  assert.equal(verifyProductAcceptance(value, qualification).purpose, "qualification");
  assert.throws(() => verifyProductAcceptance(value, { ...qualification, purpose: "release" }), /immutable product tag push/);
  assert.throws(() => argumentsFor(["--run-id", "1", "--kind", "browser"]));
  assert.throws(() => argumentsFor(["--run-id", "1e3"]));
  assert.throws(() => argumentsFor(["--run-id", "1", "--run-id", "2"]));
});

test("explicit pagination supports older gh and rejects changing or nonadvancing pages", () => {
  const calls = [];
  const pages = readJobPages("attempt/jobs?per_page=100", (url) => {
    calls.push(url); return { total_count: 2, jobs: [{ id: calls.length }] };
  });
  assert.equal(pages.length, 2);
  assert.deepEqual(calls, ["attempt/jobs?per_page=100&page=1", "attempt/jobs?per_page=100&page=2"]);
  assert.throws(() => readJobPages("attempt/jobs", () => ({ total_count: 2, jobs: [] })), /invalid/);
  assert.throws(() => readJobPages("attempt/jobs", () => ({ total_count: 10001, jobs: [{}] })), /invalid/);
  let count = 0;
  assert.throws(() => readJobPages("attempt/jobs", () => ({ total_count: ++count + 1, jobs: [{ id: count }] })), /changed/);
  assert.throws(() => readJobPages("attempt/jobs", () => ({ total_count: 2, jobs: [{ id: 1 }] })), /repeated/);
  assert.throws(() => readJobPages("attempt/jobs", () => ({ total_count: 1, jobs: [{ id: 1 }, { id: 2 }] })), /exceeds/);
});

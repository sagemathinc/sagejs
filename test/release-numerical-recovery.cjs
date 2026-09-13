// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { inspectProducers } = require("../scripts/release/numerical-recovery.cjs");
const { producerFixture } = require("./helpers/release-recovery.cjs");
const options = { nativeRunId: 10, sha: "a".repeat(40), ref: "release-candidate", event: "workflow_dispatch" };
test("recovery distinguishes nine successful producers from the failed gate", () => {
  const f = producerFixture(options), proof = inspectProducers(options, f.api);
  assert.equal(proof.producerJobs.length, 9);
  assert.equal(proof.jobId, f.jobs.at(-1).id);
  assert.equal(f.jobs.at(-1).conclusion, "failure");
});
test("no unsuccessful, skipped, duplicate, foreign or missing producer can be recovered", () => {
  for (const mutate of [
    (f) => { f.jobs[0].conclusion = "failure"; }, (f) => { f.jobs[0].conclusion = "skipped"; },
    (f) => f.jobs.shift(), (f) => f.jobs.push({ ...f.jobs[0], id: 999 }),
    (f) => { f.jobs[0].head_sha = "b".repeat(40); }, (f) => { f.run.head_sha = "b".repeat(40); },
    (f) => { f.run.head_repository.full_name = "fork/sagejs"; }, (f) => { f.run.status = "in_progress"; },
    (f) => { f.jobs.at(-1).conclusion = "success"; },
  ]) { const f = producerFixture(options); mutate(f); assert.throws(() => inspectProducers(options, f.api)); }
});
test("producer retry during inspection cannot reuse the earlier attempt", () => {
  const f = producerFixture(options); let reads = 0;
  assert.throws(() => inspectProducers(options, (endpoint) => {
    const value = f.api(endpoint);
    if (endpoint.endsWith("/runs/10") && ++reads === 2) value.run_attempt++;
    return value;
  }), /changed/);
});

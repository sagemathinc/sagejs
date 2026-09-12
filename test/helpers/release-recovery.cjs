"use strict";
const { producerNames } = require("../../scripts/release/numerical-recovery.cjs");
function producerFixture(options) {
  const run = { id: options.nativeRunId, head_sha: options.sha, head_branch: options.ref, event: options.event,
    path: ".github/workflows/ci.yml", status: "completed", conclusion: "failure", run_attempt: 2,
    repository: { full_name: "sagemathinc/sagejs" }, head_repository: { full_name: "sagemathinc/sagejs" } };
  const jobs = [...producerNames, "Numerical release qualification gate", "Sage.js native product acceptance v1"].map((name, i) => ({
    id: 1000 + i, name, run_id: run.id, run_attempt: 2, head_sha: run.head_sha, status: "completed",
    conclusion: i < producerNames.length ? "success" : "failure",
  }));
  const api = (endpoint) => {
    if (endpoint.endsWith(`/runs/${run.id}`)) return structuredClone(run);
    if (endpoint.endsWith(`/runs/${run.id}/attempts/2/jobs?per_page=100&page=1`)) return structuredClone({ total_count: jobs.length, jobs });
    throw new Error("unexpected producer endpoint");
  };
  return { run, jobs, api };
}
module.exports = { producerFixture };

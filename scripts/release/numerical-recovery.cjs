"use strict";

// Recovery observes successful producers, not the failed aggregate. The caller
// must reconstruct the omitted evidence in the authenticated handoff job.
const { githubApi, jobsFromPages, readJobPages } = require("./product-acceptance.cjs");
const repository = "sagemathinc/sagejs";
const producerNames = Object.freeze([
  "Routine gate (Linux x64)", "Canonical authenticated numerical runtime",
  "Canonical public npm root and browser distribution",
  "Linux x64 native, tests, and SEA", "Linux arm64 native, tests, and SEA",
  "Windows x64 native, tests, and SEA", "macOS arm64 native, tests, and SEA",
  "Sign and notarize macOS arm64 release", "Numerical browser and supplemental qualification",
]);
function inspectProducers(options, api = githubApi) {
  const endpoint = `repos/${repository}/actions/runs/${options.nativeRunId}`;
  const run = api(endpoint);
  if (run.id !== options.nativeRunId || run.head_sha !== options.sha || run.head_branch !== options.ref ||
      run.event !== options.event || run.path !== ".github/workflows/ci.yml" || run.status !== "completed" ||
      run.repository?.full_name !== repository || run.head_repository?.full_name !== repository ||
      !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) throw new Error("recovery producer identity mismatch");
  const jobs = jobsFromPages(readJobPages(`${endpoint}/attempts/${run.run_attempt}/jobs?per_page=100`, api), run);
  const selected = producerNames.map((name) => {
    const matches = jobs.filter((job) => job.name === name);
    if (matches.length !== 1 || matches[0].status !== "completed" || matches[0].conclusion !== "success") {
      throw new Error(`recovery requires successful producer: ${name}`);
    }
    return { name, id: matches[0].id };
  });
  const aggregate = jobs.filter((job) => job.name === "Sage.js native product acceptance v1");
  const gate = jobs.filter((job) => job.name === "Numerical release qualification gate");
  if (aggregate.length !== 1 || gate.length !== 1 || aggregate[0].conclusion !== "failure" || gate[0].conclusion !== "failure") {
    throw new Error("recovery is only for a failed final numerical gate and aggregate");
  }
  const after = api(endpoint);
  if (after.run_attempt !== run.run_attempt || after.head_sha !== run.head_sha || after.status !== "completed") {
    throw new Error("producer changed during recovery inspection");
  }
  return { runId: run.id, runAttempt: run.run_attempt, jobId: aggregate[0].id, producerJobs: selected };
}
module.exports = { inspectProducers, producerNames };

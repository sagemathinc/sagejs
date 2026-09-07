#!/usr/bin/env node
"use strict";

// Attempt-scoped job acceptance for the new product boundary. This is NOT
// artifact authentication or permission to publish, and cannot substitute for
// reconstruction of raw numerical evidence. Both v1 aggregates are defined
// in their workflows; external consumer adoption and end-to-end qualification
// remain pending for exact artifact transport.
// Legacy job names are not aliases. Publication and app deployment consume
// these product boundaries without requiring unrelated reporting success.
const { execFileSync } = require("node:child_process");
const repository = "sagemathinc/sagejs";
const boundaries = Object.freeze({
  browser: Object.freeze({ workflow: ".github/workflows/wasm-release.yml", job: "Sage.js browser product acceptance v1" }),
  native: Object.freeze({ workflow: ".github/workflows/ci.yml", job: "Sage.js native product acceptance v1" }),
});
const requiredStep = "Require every product prerequisite";
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;

function expectations(options) {
  if (!Object.hasOwn(boundaries, options.kind)) throw new Error("unknown product boundary");
  if (!/^[a-f0-9]{40}$/.test(options.sha ?? "")) throw new Error("product source must be a full Git commit ID");
  if (!positiveInteger(options.runId)) throw new Error("run ID must be a positive safe integer");
  if (!["push", "workflow_dispatch", "schedule"].includes(options.event) ||
      typeof options.ref !== "string" || !options.ref || /[\s\x00-\x1f]/.test(options.ref)) throw new Error("product acceptance needs an explicit ref and supported event");
  if (!["qualification", "release"].includes(options.purpose)) throw new Error("acceptance purpose must be explicit");
  if (options.purpose === "release" && (options.event !== "push" || !/^v\d+\.\d+\.\d+(?:\+release\.\d+)?$/.test(options.ref))) {
    throw new Error("release acceptance requires an immutable product tag push");
  }
  return boundaries[options.kind];
}

function validateRun(run, options) {
  const boundary = expectations(options);
  if (run?.id !== options.runId || run.head_sha !== options.sha || run.head_branch !== options.ref ||
      run.event !== options.event || run.path !== boundary.workflow ||
      run.repository?.full_name !== repository || run.head_repository?.full_name !== repository ||
      !positiveInteger(run.run_attempt)) throw new Error("product workflow identity does not match the expected repository/source/ref/attempt");
  if (!["in_progress", "completed"].includes(run.status)) throw new Error("product workflow has not started");
  return boundary;
}

function jobsFromPages(pages, run) {
  if (!Array.isArray(pages) || !pages.length) throw new Error("attempt job pages are missing");
  const jobs = [], ids = new Set();
  const total = pages[0]?.total_count;
  if (!Number.isSafeInteger(total) || total < 1) throw new Error("invalid attempt job count");
  for (const page of pages) {
    if (!page || page.total_count !== total || !Array.isArray(page.jobs)) throw new Error("inconsistent attempt pagination");
    for (const job of page.jobs) {
      if (!job || !positiveInteger(job.id) || ids.has(job.id) || job.run_id !== run.id ||
          job.run_attempt !== run.run_attempt || job.head_sha !== run.head_sha || typeof job.name !== "string") {
        throw new Error("duplicate, malformed or foreign-attempt job");
      }
      ids.add(job.id); jobs.push(job);
    }
  }
  if (jobs.length !== total) throw new Error("incomplete attempt job pagination");
  return jobs;
}

function verifyProductAcceptance({ before, pages, after }, options) {
  const boundary = validateRun(before, options);
  validateRun(after, options);
  if (before.run_attempt !== after.run_attempt) throw new Error("workflow attempt changed during acceptance inspection");
  // Reporting may complete while we inspect; that is not a new product attempt.
  // Conversely, do not combine an older passing aggregate with a newer attempt.
  const jobs = jobsFromPages(pages, before);
  const matching = jobs.filter((job) => job.name === boundary.job);
  if (matching.length !== 1) throw new Error(`expected exactly one '${boundary.job}' job; found ${matching.length}`);
  const selected = matching[0];
  if (selected.status !== "completed" || selected.conclusion !== "success") throw new Error(`product prerequisite gate did not succeed: ${selected.status}/${selected.conclusion}`);
  const steps = selected.steps?.filter((step) => step?.name === requiredStep);
  if (!Array.isArray(steps) || steps.length !== 1 || steps[0].status !== "completed" || steps[0].conclusion !== "success") {
    throw new Error("the product prerequisite assertion is missing, skipped or unsuccessful");
  }
  return {
    schema: "sagejs.product-job-acceptance/v1", purpose: options.purpose, kind: options.kind,
    repository, workflow: boundary.workflow, sourceRevision: options.sha, ref: options.ref, event: options.event,
    runId: before.id, runAttempt: before.run_attempt, jobId: selected.id, jobName: selected.name,
    productStatus: "passed", workflowStatus: after.status, workflowConclusion: after.conclusion ?? null,
    authority: "authenticated job-status observation only; artifact/signature/raw-evidence validation still required",
  };
}

function readJobPages(endpoint, request) {
  const pages = [];
  const ids = new Set();
  let expected = null, count = 0;
  do {
    if (pages.length >= 100) throw new Error("attempt job pagination exceeds inspection limit");
    const page = request(`${endpoint}${endpoint.includes("?") ? "&" : "?"}page=${pages.length + 1}`);
    if (!page || !Number.isSafeInteger(page.total_count) || page.total_count < 1 || page.total_count > 10000 ||
        !Array.isArray(page.jobs) || page.jobs.length < 1 || page.jobs.length > 100) throw new Error("invalid attempt job page");
    expected ??= page.total_count;
    if (page.total_count !== expected) throw new Error("attempt job count changed during pagination");
    for (const job of page.jobs) {
      if (!positiveInteger(job?.id) || ids.has(job.id)) throw new Error("attempt pagination repeated or malformed a job");
      ids.add(job.id);
    }
    pages.push(page); count += page.jobs.length;
    if (count > expected) throw new Error("attempt pagination exceeds the declared job count");
  } while (count < expected);
  return pages;
}

function githubApi(endpoint, paginate = false) {
  // Explicit pagination works with the persistent hosts' older gh versions;
  // do not require --slurp or parse concatenated arbitrary JSON as a stream.
  const request = (url) => {
    try {
      return JSON.parse(execFileSync("gh", ["api", "--hostname", "github.com", url], {
        encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 60000,
        stdio: ["ignore", "pipe", "pipe"],
      }));
    } catch {
      // Neither transport diagnostics nor a JSON parse excerpt should echo an
      // arbitrary upstream response into a public release log.
      throw new Error("GitHub acceptance inspection failed; no acceptance granted");
    }
  };
  return paginate ? readJobPages(endpoint, request) : request(endpoint);
}

function inspectProductAcceptance(options, api = githubApi) {
  expectations(options);
  const runEndpoint = `repos/${repository}/actions/runs/${options.runId}`;
  const before = api(runEndpoint);
  validateRun(before, options); // Never use an unchecked attempt as an API path.
  const pages = api(`${runEndpoint}/attempts/${before.run_attempt}/jobs?per_page=100`, true);
  const after = api(runEndpoint);
  return verifyProductAcceptance({ before, pages, after }, options);
}

function argumentsFor(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    if (!["--kind", "--run-id", "--sha", "--ref", "--event", "--purpose"].includes(name) ||
        !args[index + 1] || args[index + 1].startsWith("--") || Object.hasOwn(values, name)) throw new Error("invalid product acceptance arguments");
    values[name] = args[index + 1];
  }
  if (!/^[1-9][0-9]*$/.test(values["--run-id"] ?? "")) throw new Error("invalid run ID");
  const options = { kind: values["--kind"], runId: Number(values["--run-id"]), sha: values["--sha"], ref: values["--ref"], event: values["--event"], purpose: values["--purpose"] };
  expectations(options); return options;
}

if (require.main === module) {
  try { console.log(JSON.stringify(inspectProductAcceptance(argumentsFor(process.argv.slice(2))), null, 2)); }
  catch (error) {
    console.error(error.status !== undefined || error.code ? "GitHub acceptance inspection failed; no acceptance granted" : error.message);
    process.exitCode = 1;
  }
}
module.exports = { boundaries, requiredStep, argumentsFor, inspectProductAcceptance, verifyProductAcceptance, jobsFromPages, readJobPages, githubApi };

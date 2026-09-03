#!/usr/bin/env node
"use strict";

const fs = require("node:fs");

const REQUIRED_PRODUCERS = Object.freeze([
  "Linux x64 native, tests, and SEA",
  "Linux arm64 native, tests, and SEA",
  "macOS arm64 native, tests, and SEA",
  "Windows x64 native, tests, and SEA",
  "Sign and notarize macOS arm64 release",
  "Numerical browser and supplemental qualification",
  "Numerical release qualification gate",
]);
const PUBLISHER = "Publish tagged GitHub and npm release";

function fail(message) {
  throw new Error(message);
}

function jobsFromPages(value) {
  const pages = Array.isArray(value) ? value : [value];
  const jobs = [];
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (page === null || typeof page !== "object" || Array.isArray(page) ||
        !Array.isArray(page.jobs)) {
      fail(`jobs page ${index + 1} is not a GitHub jobs response`);
    }
    jobs.push(...page.jobs);
  }
  return jobs;
}

function occurrence(job, name) {
  if (job === null || typeof job !== "object" || Array.isArray(job)) {
    fail(`job record for ${name} is malformed`);
  }
  if (!Number.isSafeInteger(job.id) || job.id <= 0 ||
      !Number.isSafeInteger(job.run_attempt) || job.run_attempt <= 0 ||
      typeof job.conclusion !== "string") {
    fail(`job record for ${name} lacks an authenticated id, run_attempt, or conclusion`);
  }
  return { id: job.id, run_attempt: job.run_attempt, conclusion: job.conclusion };
}

function latestExactOccurrence(jobs, name) {
  const matching = jobs.filter((job) => job?.name === name).map((job) => occurrence(job, name));
  if (matching.length === 0) fail(`source run has no job named '${name}'`);
  const attempt = Math.max(...matching.map((job) => job.run_attempt));
  const latest = matching.filter((job) => job.run_attempt === attempt);
  if (latest.length !== 1) {
    fail(`source run has ${latest.length} jobs named '${name}' in latest attempt ${attempt}`);
  }
  return latest[0];
}

function selectRecoveryPublisher(value) {
  const jobs = jobsFromPages(value);
  for (const name of REQUIRED_PRODUCERS) {
    const selected = latestExactOccurrence(jobs, name);
    if (selected.conclusion !== "success") {
      fail(
        `latest source job '${name}' attempt ${selected.run_attempt} concluded ` +
          `${selected.conclusion}, not success`,
      );
    }
  }
  const publisher = latestExactOccurrence(jobs, PUBLISHER);
  if (publisher.conclusion === "success") {
    fail("the latest publisher already succeeded; refusing a redundant rerun");
  }
  return publisher;
}

function main() {
  const text = fs.readFileSync(0, "utf8");
  const publisher = selectRecoveryPublisher(JSON.parse(text));
  process.stdout.write(`${publisher.id}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  PUBLISHER,
  REQUIRED_PRODUCERS,
  jobsFromPages,
  latestExactOccurrence,
  selectRecoveryPublisher,
};

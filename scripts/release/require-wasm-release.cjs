#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const { inspectProductAcceptance } = require("./product-acceptance.cjs");

function fail(message) {
  throw new Error(message);
}

function runsFromPages(value) {
  const pages = Array.isArray(value) ? value : [value];
  const runs = [];
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (
      page === null ||
      typeof page !== "object" ||
      Array.isArray(page) ||
      !Array.isArray(page.workflow_runs)
    ) {
      fail(`workflow-runs page ${index + 1} is not a GitHub response`);
    }
    runs.push(...page.workflow_runs);
  }
  return runs;
}

function requireWasmProduct(value, expectedSha, expectedTag, api) {
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) {
    fail("expected source SHA must be a full lowercase Git commit id");
  }
  if (!/^v\d+\.\d+\.\d+(?:\+release\.\d+)?$/.test(expectedTag)) {
    fail("expected tag is not an immutable Sage.js release tag");
  }
  const matching = runsFromPages(value).filter(
    (run) =>
      run?.head_sha === expectedSha &&
      run?.head_branch === expectedTag &&
      run?.event === "push",
  );
  if (matching.length === 0) {
    fail(`no WebAssembly release run matches ${expectedTag} at ${expectedSha}`);
  }
  if (matching.some((run) => !Number.isSafeInteger(run.id) || run.id <= 0) ||
      new Set(matching.map((run) => run.id)).size !== matching.length) {
    fail("WebAssembly release lacks unique authenticated run ids");
  }
  // Never fall back to an older successful campaign when the newest campaign
  // failed product acceptance. Whole-workflow success is not product evidence:
  // an unrelated timing report can fail or still be running.
  matching.sort((left, right) => right.id - left.id);
  return inspectProductAcceptance({ kind: "browser", runId: matching[0].id,
    sha: expectedSha, ref: expectedTag, event: "push", purpose: "release" }, api);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) fail(`missing ${name}`);
  return process.argv[index + 1];
}

function main() {
  const value = JSON.parse(fs.readFileSync(0, "utf8"));
  const selected = requireWasmProduct(
    value,
    argument("--sha"),
    argument("--tag"),
  );
  process.stdout.write(`${JSON.stringify(selected)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}

module.exports = { requireWasmProduct, runsFromPages };

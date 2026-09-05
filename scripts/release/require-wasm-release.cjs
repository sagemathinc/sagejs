#!/usr/bin/env node
"use strict";

const fs = require("node:fs");

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

function requireSuccessfulWasmRelease(value, expectedSha, expectedTag) {
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
  const successful = matching.filter(
    (run) => run?.status === "completed" && run?.conclusion === "success",
  );
  if (successful.length === 0) {
    const states = matching
      .map((run) => `${run?.id ?? "unknown"}:${run?.status ?? "unknown"}/${run?.conclusion ?? ""}`)
      .join(", ");
    fail(`WebAssembly release has not succeeded for ${expectedTag} at ${expectedSha} (${states})`);
  }
  successful.sort((left, right) => Number(right.id) - Number(left.id));
  const selected = successful[0];
  if (!Number.isSafeInteger(selected.id) || selected.id <= 0) {
    fail("successful WebAssembly release lacks an authenticated run id");
  }
  return selected;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) fail(`missing ${name}`);
  return process.argv[index + 1];
}

function main() {
  const value = JSON.parse(fs.readFileSync(0, "utf8"));
  const selected = requireSuccessfulWasmRelease(
    value,
    argument("--sha"),
    argument("--tag"),
  );
  process.stdout.write(`${selected.id}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}

module.exports = { requireSuccessfulWasmRelease, runsFromPages };

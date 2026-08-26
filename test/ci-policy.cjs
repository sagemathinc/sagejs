// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");

const workflow = readFileSync(
  resolve(__dirname, "../.github/workflows/ci.yml"),
  "utf8",
);

test("routine CI cancels superseded runs and fails the platform matrix fast", () => {
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /^  routine:/m);
  assert.match(workflow, /^  platform-smoke:/m);
  assert.match(workflow, /fail-fast: true/);
  assert.match(workflow, /pnpm test:ci/);
  assert.doesNotMatch(workflow, /parallel:check -- --all/);
});

test("expensive native and SEA jobs wait for the routine gate", () => {
  for (const job of ["linux-x64", "linux-arm64", "windows-x64", "macos-arm64"]) {
    const start = workflow.indexOf(`  ${job}:`);
    assert.notEqual(start, -1, `missing ${job}`);
    const nextJob = workflow.slice(start + 3).search(/^  [a-z][a-z0-9-]*:/m);
    const end = nextJob === -1 ? workflow.length : start + 3 + nextJob;
    const section = workflow.slice(start, end);
    assert.match(
      section,
      /needs: routine/,
      `${job} must wait for routine validation`,
    );
    assert.match(
      section,
      /workflow_dispatch/,
      `${job} must support explicit full validation`,
    );
    assert.match(
      section,
      /schedule/,
      `${job} must support scheduled full validation`,
    );
    assert.match(section, /refs\/tags\/v/, `${job} must run before releases`);
  }
});

test("routine gate does not build native dependencies or SEA executables", () => {
  const routineStart = workflow.indexOf("  routine:");
  const smokeStart = workflow.indexOf("  platform-smoke:");
  const routine = workflow.slice(routineStart, smokeStart);
  assert.doesNotMatch(
    routine,
    /test:integration|test:native|test:sea|pnpm bootstrap/,
  );
});

test("macOS native validation provisions the supported CPython oracle", () => {
  const start = workflow.indexOf("  macos-arm64:");
  const nextJob = workflow.slice(start + 3).search(/^  [a-z][a-z0-9-]*:/m);
  const end = nextJob === -1 ? workflow.length : start + 3 + nextJob;
  const section = workflow.slice(start, end);
  assert.match(section, /uses: actions\/setup-python@v6/);
  assert.match(section, /python-version: "3\.13"/);
});

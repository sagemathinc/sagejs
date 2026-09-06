// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
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

test("repository workflows use GitHub-hosted runners", () => {
  const workflowDirectory = resolve(__dirname, "../.github/workflows");
  for (const filename of readdirSync(workflowDirectory)) {
    if (!filename.endsWith(".yml") && !filename.endsWith(".yaml")) continue;
    assert.doesNotMatch(
      readFileSync(resolve(workflowDirectory, filename), "utf8"),
      /blacksmith/i,
      `${filename} must not spend Blacksmith runner credits`,
    );
  }
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /runner: ubuntu-24\.04-arm/);
  assert.match(workflow, /runner: macos-15/);
  assert.match(workflow, /runner: windows-2025/);
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
      /needs: \[[^\]\n]*\broutine\b[^\]\n]*\]/,
      `${job} must wait for routine validation`,
    );
    assert.match(
      section,
      /needs: \[[^\]\n]*\bnumerical-product\b[^\]\n]*\]/,
      `${job} must wait for the authenticated numerical product`,
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

test("release jobs reuse one required native bootstrap", () => {
  const stages = require("../scripts/release/stages.cjs").plan("native", "bootstrap,native,native-performance,sea");
  assert.deepEqual(stages.map((stage) => stage.commands), [
    [["pnpm", "bootstrap", "--without-sea"]],
    [["pnpm", "test:native:correctness:run"]],
    [["pnpm", "test:native:performance:run"]],
    [["pnpm", "test:sea:reuse"]],
  ]);
  for (const job of ["linux-x64", "linux-arm64", "windows-x64", "macos-arm64"]) {
    const start = workflow.indexOf(`  ${job}:`);
    const nextJob = workflow.slice(start + 3).search(/^  [a-z][a-z0-9-]*:/m);
    const end = nextJob === -1 ? workflow.length : start + 3 + nextJob;
    const section = workflow.slice(start, end);
    assert.match(section, /SAGEJS_NATIVE_PREBUILT_REQUIRED: "1"/);
    for (const stage of ["bootstrap", "native,native-performance", "sea"]) {
      const command = 'pnpm release:run --candidate "${{ github.sha }}" --stage ' + stage;
      assert.equal(section.split(command).length - 1, 1, `${job} runs ${stage} once through the shared runner`);
    }
    assert.doesNotMatch(section, /run: pnpm test:native\s*$/m);
    assert.doesNotMatch(section, /run: pnpm test:sea\s*$/m);
  }
});

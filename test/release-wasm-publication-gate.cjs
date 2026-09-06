// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  requireSuccessfulWasmRelease,
  runsFromPages,
} = require("../scripts/release/require-wasm-release.cjs");

const sha = "2".repeat(40);
const tag = "v0.8.0+release.2";

function run(overrides = {}) {
  return {
    id: 101,
    head_sha: sha,
    head_branch: tag,
    event: "push",
    status: "completed",
    conclusion: "success",
    ...overrides,
  };
}

test("publication selects a successful exact-tag WebAssembly run", () => {
  const selected = requireSuccessfulWasmRelease(
    [{ workflow_runs: [run({ id: 100 }), run({ id: 102 })] }],
    sha,
    tag,
  );
  assert.equal(selected.id, 102);
});

test("publication rejects another tag, SHA, event, or unsuccessful run", () => {
  const pages = [{
    workflow_runs: [
      run({ id: 1, head_branch: "v0.8.0+release.1" }),
      run({ id: 2, head_sha: "3".repeat(40) }),
      run({ id: 3, event: "workflow_dispatch" }),
      run({ id: 4, conclusion: "failure" }),
      run({ id: 5, status: "in_progress", conclusion: null }),
    ],
  }];
  assert.throws(
    () => requireSuccessfulWasmRelease(pages, sha, tag),
    /has not succeeded/,
  );
});

test("publication rejects missing or malformed authenticated evidence", () => {
  assert.throws(() => runsFromPages({}), /not a GitHub response/);
  assert.throws(
    () => requireSuccessfulWasmRelease({ workflow_runs: [] }, sha, tag),
    /no WebAssembly release run matches/,
  );
  assert.throws(
    () => requireSuccessfulWasmRelease({ workflow_runs: [run({ id: "101" })] }, sha, tag),
    /authenticated run id/,
  );
  assert.throws(
    () => requireSuccessfulWasmRelease({ workflow_runs: [run()] }, "short", tag),
    /full lowercase Git commit id/,
  );
});

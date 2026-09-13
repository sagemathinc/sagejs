// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { dispatchArguments } = require("../scripts/release/request-prepared-publication.cjs");
const request = () => ({
  schema: "sagejs.prepared-promotion-request/v1",
  sourceRevision: "a".repeat(40), sourceRef: "release-candidate",
  sourceEvent: "workflow_dispatch", purpose: "qualification", tag: "v0.8.0+release.13",
  handoff: { runId: 1, runAttempt: 1, artifactId: 2, controlSha: "b".repeat(40) },
  macos: { runId: 3, runAttempt: 1, artifactId: 4, controlSha: "c".repeat(40) },
});

test("publication recovery dispatches exactly the frozen pins through the trusted workflow", () => {
  const value = request();
  assert.deepEqual(dispatchArguments(JSON.stringify(value)), [
    "workflow", "run", ".github/workflows/ci.yml",
    "--repo", "sagemathinc/sagejs", "--ref", value.tag,
    "--raw-field", "prepared_request=" + JSON.stringify(value),
    "--field", "publish_prepared=true",
  ]);
});

test("invalid or incomplete requests cannot be dispatched", () => {
  for (const raw of [undefined, "", "{}", "null", "not JSON"]) {
    assert.throws(() => dispatchArguments(raw));
  }
  for (const mutate of [
    v => { delete v.macos; },
    v => { v.handoff.artifactId = 0; },
    v => { v.tag = "main"; },
    v => { v.tag = "v0.8.0; echo unsafe"; },
    v => { v.sourceRevision = "main"; },
    v => { v.recovery_run_id = 42; },
  ]) {
    const value = request(); mutate(value);
    assert.throws(() => dispatchArguments(JSON.stringify(value)));
  }
});

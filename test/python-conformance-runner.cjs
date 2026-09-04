"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  requireCurrentBuild,
} = require("../scripts/run-python-conformance.cjs");

test("Python conformance accepts a current exact build receipt", () => {
  const current = {
    current: true,
    reason: "exact build inputs and required outputs match",
  };
  assert.equal(requireCurrentBuild(() => current), current);
});

test("Python conformance fails before execution when the build is stale", () => {
  assert.throws(
    () =>
      requireCurrentBuild(() => ({
        current: false,
        reason: "build inputs changed",
      })),
    /build is stale \(build inputs changed\); run pnpm build:check/,
  );
});

// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { surfaceBudget, surfaceCases } = require("../scripts/check-finite-matrix-budget.cjs");

test("large rank budget remains target-specific", () => {
  const rank = surfaceCases.find((entry) => entry.name === "rank_500");
  assert.ok(rank);
  assert.equal(surfaceBudget(rank, "linux", "x64"), 40);
  assert.equal(surfaceBudget(rank, "linux", "arm64"), 45);
  assert.equal(surfaceBudget(rank, "darwin", "arm64"), 45);
  assert.equal(surfaceBudget(rank, "win32", "x64"), 40);
  const determinant = surfaceCases.find((entry) => entry.name === "determinant_500");
  assert.equal(surfaceBudget(determinant, "linux", "arm64"), 40);
});

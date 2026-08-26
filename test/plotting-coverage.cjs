// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const plottingDocs = path.join(root, "docs/sage-compatibility/plotting");
const generator = require("../scripts/plotting/generate-coverage.cjs");

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(plottingDocs, name), "utf8"));
}

test("plotting coverage is exhaustive, classified, and reproducible", () => {
  const sageSurface = readJson("sage-surface.json");
  const frontendSurface = readJson("frontend-surface.json");
  const checkedIn = readJson("coverage.json");
  const regenerated = generator.buildCoverage(sageSurface, frontendSurface);

  assert.deepEqual(checkedIn, regenerated);
  assert.deepEqual(checkedIn.policy.classifications, [
    "faithful",
    "translated",
    "unsupported",
    "extension",
  ]);
  assert.equal(
    checkedIn.entries.some((entry) => entry.classification === "partial"),
    false,
  );
  assert.equal(
    checkedIn.entries.every((entry) => Array.isArray(entry.evidence_debt)),
    true,
  );
  assert.equal(
    checkedIn.entries.some(
      (entry) =>
        entry.classification === "faithful" &&
        entry.semantic_tests.length === 0,
    ),
    false,
  );
  assert.equal(
    checkedIn.entries.some(
      (entry) =>
        entry.classification === "translated" &&
        entry.semantic_tests.length === 0 &&
        entry.plotly_tests.length === 0 &&
        !(
          entry.implementation_evidence?.plotting_lowerer_recognized === true &&
          (entry.implementation_evidence.runtime_export !== null ||
            entry.implementation_evidence.lowering_target !== null)
        ),
    ),
    false,
  );

  execFileSync(
    process.execPath,
    ["scripts/plotting/generate-coverage.cjs", "--check"],
    { cwd: root, stdio: "pipe" },
  );
});

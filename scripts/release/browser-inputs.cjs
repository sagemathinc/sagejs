"use strict";

// Consumes files already authenticated by prepareHandoff and a reconstructed
// numerical gate. This comparison is not standalone provenance or publication
// authority; never use an arbitrary saved report to supply size measurements.
const fs = require("node:fs"), path = require("node:path");
const { isDeepStrictEqual } = require("node:util");
const { readJson, repositoryPath } = require("../numerical-computing/common.cjs");
const { authenticateBrowserDistribution } = require("../numerical-computing/qualification/authenticate-release-gate.cjs");
const { verifyRecordedArtifact, enforceBudget, enforceTopologyBudgets } = require("../../packages/flint-wasm/scripts/browser-wasm-release-artifact.cjs");
const { fileDigest } = require("./runner.cjs");

const clean = "build/release-publication/browser-clean";
const reproduced = "build/release-publication/browser-reproducible";
const distribution = `${clean}/packages/flint-wasm/dist`;

function authenticateBrowserInputs(root, candidate, gate) {
  function json(relative) {
    const filename = repositoryPath(root, relative, "browser input").absolute;
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 16 * 1024 * 1024) {
      throw new Error("browser input must be a bounded ordinary JSON file");
    }
    return readJson(filename);
  }
  const reportPath = `${reproduced}/reproducible-artifact.json`;
  const report = json(reportPath);
  if (!/^[a-f0-9]{40}$/.test(candidate) || report.source_revision !== candidate) {
    throw new Error("browser report does not identify the selected source");
  }
  // The existing producer writes the canonical A report before comparing A/B,
  // A/ARM and A/macOS. These four reports therefore describe identical A bytes;
  // their authenticated successful producer jobs supply comparison provenance.
  for (const relative of [`${clean}/build/wasm-artifact-a.json`,
    `${reproduced}/reproducible-linux-arm64.json`, `${reproduced}/reproducible-darwin-arm64.json`]) {
    if (!isDeepStrictEqual(json(relative), report)) throw new Error("canonical browser reports disagree across producer comparisons");
  }
  const absolute = repositoryPath(root, distribution, "selected browser distribution").absolute;
  const actual = verifyRecordedArtifact(absolute, report);
  const budget = json("bench/browser-wasm-budget.json");
  const failures = [...enforceBudget(actual, budget, { requireBaseline: true }), ...enforceTopologyBudgets(actual, budget)];
  if (failures.length) throw new Error(`selected browser payload violates candidate budget: ${failures.join("; ")}`);
  const contentSha256 = authenticateBrowserDistribution(gate, distribution, root);
  return { directory: distribution, sourceRevision: candidate, artifactIdentity: actual.artifact_identity,
    contentSha256, reportSha256: fileDigest(path.join(root, reportPath)), totals: actual.totals,
    authority: "qualified clean distribution comparison only; not inner tarball or deployment authorization" };
}

module.exports = { authenticateBrowserInputs, distribution };

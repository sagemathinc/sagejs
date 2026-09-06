"use strict";

const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { canonical, sha256, snapshotSource } = require("./evidence.cjs");
const {
  validateIntentionalIncompatibilities, applyIntentionalIncompatibilities,
  compareBaselineRecord,
} = require("./output-baseline.cjs");

const comparison = "cpython-output-baseline-v2";

// This contract retains original filenames/corpus cwd,
// existing environment, and uncapped legacy output collection. It must not be
// routed through the empty-output/temporary-directory assertion runner.
function loadLegacyOutputSuite({ directory, declaration, source, sourceBytes,
  snapshot, oracle, safePath, requireCondition }) {
  const check = requireCondition;
  check(declaration.comparison === comparison &&
    declaration.executionProfile === "micropython-corpus-v1", "invalid legacy output contract");
  check(source.schema === undefined &&
    source.repository === "https://github.com/micropython/micropython" &&
    source.path === "tests/basics" && source.license === "MIT" &&
    /^[a-f0-9]{40}$/.test(source.revision), "invalid MicroPython source metadata");
  function pinnedDocument(binding, expectedPath) {
    check(binding && binding.path === expectedPath &&
      /^[a-f0-9]{64}$/.test(binding.sha256), "invalid legacy document binding");
    safePath(binding.path);
    const bytes = readFileSync(join(directory, binding.path));
    check(sha256(bytes) === binding.sha256, `legacy document digest differs: ${binding.path}`);
    return JSON.parse(bytes);
  }
  const baseline = pinnedDocument(declaration.baseline,
    `baselines/${oracle.version.split(".").slice(0, 2).join(".")}.json`);
  const reviews = pinnedDocument(declaration.reviews, "INTENTIONAL-INCOMPATIBILITIES.json");
  check(baseline.format === 2 && canonical(baseline.source) === canonical(source),
    "legacy baseline format/source differs");
  check(baseline.reference?.implementation === oracle.implementation &&
    baseline.reference?.version === oracle.version &&
    baseline.reference?.majorMinor === oracle.version.split(".").slice(0, 2).join("."),
  "legacy baseline oracle differs");
  const provenance = {
    sourceMetadataSha256: sha256(sourceBytes),
    corpus: snapshotSource(join(directory, "basics")),
    licenseSha256: sha256(readFileSync(join(directory, "LICENSE"))),
    upstreamReadmeSha256: sha256(readFileSync(join(directory, "UPSTREAM-TESTS-README.md"))),
    intentionalReviewsSha256: declaration.reviews.sha256,
  };
  check(canonical(baseline.provenance) === canonical(provenance),
    "legacy source/fixture/license/review provenance differs");
  const inventory = new Map(provenance.corpus.files.map(file => [
    `basics/${file.path}`, { ...file, path: `basics/${file.path}`,
      upstreamPath: `${source.path}/${file.path}` },
  ]));
  const candidates = [], excluded = { expected: [], unittest: [] };
  for (const file of provenance.corpus.files) {
    safePath(file.path);
    if (file.path.includes("/") || !file.path.endsWith(".py")) continue;
    if (inventory.has(`basics/${file.path}.exp`)) excluded.expected.push(file.path);
    else if (/(^|\W)unittest(\W|$)/m.test(readFileSync(join(directory, "basics", file.path), "utf8"))) {
      excluded.unittest.push(file.path);
    } else candidates.push(file.path);
  }
  check(canonical(Object.keys(baseline.outcomes).sort()) === canonical(candidates) &&
    baseline.selection?.candidates === candidates.length &&
    canonical(baseline.selection?.excludedExpected) === canonical(excluded.expected) &&
    canonical(baseline.selection?.excludedUnittest) === canonical(excluded.unittest),
  "legacy candidate/exclusion inventory differs");
  const raw = candidates.map(name => {
    const evidence = baseline.evidence?.[name];
    check(["pass", "intentional-incompatibility"].includes(baseline.outcomes[name]) &&
      evidence?.schema === "sagejs.python-case-evidence/v1" &&
      evidence.normalization === "crlf-to-lf-bytes" &&
      evidence.sourceSha256 === inventory.get(`basics/${name}`).sha256,
    `invalid legacy baseline case: ${name}`);
    for (const execution of [evidence.oracle, evidence.subject]) {
      check(execution && execution.exitCode === 0 && execution.signal === null &&
        execution.timedOut === false && execution.errorCode === null && execution.errorMessage === null &&
        ["outputSha256", "stdoutSha256", "stderrSha256"].every(key => /^[a-f0-9]{64}$/.test(execution[key])),
      `invalid legacy successful-execution evidence: ${name}`);
    }
    const rawStatus = baseline.rawStatuses?.[name];
    check(["pass", "output-mismatch"].includes(rawStatus) &&
      (rawStatus === "pass") === (evidence.oracle.outputSha256 === evidence.subject.outputSha256),
    `legacy raw status/output differs: ${name}`);
    return { name, status: baseline.rawStatuses?.[name], evidence };
  });
  validateIntentionalIncompatibilities(reviews, raw);
  const results = applyIntentionalIncompatibilities(raw, reviews.tests, baseline.reference);
  check(compareBaselineRecord(results, baseline.reference, excluded, baseline, provenance, source).length === 0,
    "legacy baseline/review records disagree");
  return {
    directory, source, inventory,
    legacyOutput: { comparison, executionProfile: declaration.executionProfile,
      baseline, reviews, excluded, candidates },
    provenance: { revision: source.revision, sourceSha256: sha256(sourceBytes),
      inventorySha256: snapshot.sha256, baselineSha256: declaration.baseline.sha256,
      reviewsSha256: declaration.reviews.sha256, corpusSha256: provenance.corpus.sha256 },
  };
}

module.exports = { loadLegacyOutputSuite, comparison };

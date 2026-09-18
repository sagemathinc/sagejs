"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = relative => fs.readFileSync(path.join(root, relative));
const json = relative => JSON.parse(read(relative));
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const hashFile = relative => sha256(read(relative));

const ladderPath = "bench/pari-class-group-port/phase1-development-ladder.json";
const ladder = json(ladderPath);
const panel = json(ladder.sources.panel.path);
const qualification = json(ladder.sources.qualificationManifest.path);

const frozen = {
  baseCommit: "1196fd4fdc5fdaa2a3fd1273d32c594bfb299ffa",
  planPath: "agents/pari-class-group-end-to-end-native-plan.md",
  planCommit: "1196fd4fdc5fdaa2a3fd1273d32c594bfb299ffa",
  planGitBlob: "19a0e56c38b4af8e3230235495a02fa1796f7a8f",
  planSha256: "88a47911bcba3007f82e4ff2d426a2760afab136118ed5cb0922104f19303fad",
  panelSha256: "7c6515240940db971cff3bc28819f9e6547adae9305643b0f6274eeafe6ec3a5",
  qualificationSha256: "fb3b5d16a03ab348b7d8f495dddb6d2716dda45c0486213246298222a9a3cb90",
  pariVersion: "2.17.4",
  archiveSha256: "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
  buch2Sha256: "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac",
  sentinels: [0, 8, 1, 14],
  additional: [3, 4, 6, 10, 11, 13, 16, 18, 19, 20, 21, 23],
  traced: [0, 1, 3, 4, 6, 8, 10, 11, 13, 14, 16, 18, 19, 20, 21, 23],
};

assert.equal(ladder.schema, 1);
assert.equal(ladder.baseCommit, frozen.baseCommit);
assert.equal(hashFile(ladder.sources.panel.path), frozen.panelSha256);
assert.equal(ladder.sources.panel.sha256, frozen.panelSha256);
assert.equal(hashFile(ladder.sources.qualificationManifest.path), frozen.qualificationSha256);
assert.equal(ladder.sources.qualificationManifest.sha256, frozen.qualificationSha256);
assert.deepEqual(ladder.sources.plan, {
  path: frozen.planPath,
  commit: frozen.planCommit,
  gitBlob: frozen.planGitBlob,
  sha256: frozen.planSha256,
});
assert.equal(ladder.sources.plan.commit, ladder.baseCommit);
const planRevision = `${frozen.planCommit}:${frozen.planPath}`;
let planBlob;
let planBytes;
try {
  planBlob = execFileSync(
    "git",
    ["-C", root, "rev-parse", "--verify", planRevision],
    { encoding: "utf8" },
  ).trim();
  planBytes = execFileSync(
    "git",
    ["-C", root, "show", planRevision],
    { encoding: null, maxBuffer: 2 * 1024 * 1024 },
  );
} catch (error) {
  throw new Error(
    `missing frozen Phase-1 plan object ${planRevision}; fetch the pinned history`,
    { cause: error },
  );
}
assert.equal(planBlob, frozen.planGitBlob);
assert.equal(sha256(planBytes), frozen.planSha256);
assert.deepEqual(ladder.pristinePari, {
  version: frozen.pariVersion,
  archiveSha256: frozen.archiveSha256,
  buch2Path: "pari-2.17.4/src/basemath/buch2.c",
  buch2Sha256: frozen.buch2Sha256,
});

assert.equal(panel.target_pari_version, frozen.pariVersion);
assert.equal(qualification.targetPariVersion, frozen.pariVersion);
assert.equal(panel.rows.length, 24);
assert.equal(panel.rows.filter(row => row.phase === "tuning").length, 16);
assert.equal(panel.rows.filter(row => row.phase === "final-reserve").length, 8);
assert.equal(qualification.reserveOpeningEnabled, false);
assert.equal(qualification.developmentExecutionEnabled, true);
assert.equal(qualification.executionEnabled, false);

const rule = [
  "already-exercised real cubic",
  "already-exercised mixed quartic",
  "first remaining tuning row with a known nontrivial class group",
  "remaining tuning row with maximum known class number, tied by field id",
];
assert.deepEqual(ladder.selectionRule.steps, rule);
assert.deepEqual(qualification.sentinelRule, rule);

// Recompute the two metadata-selected sentinels after the two previously
// exercised anchors. This is selection only: it does not infer branch coverage.
const tuning = panel.rows.map((row, panelIndex) => ({ row, panelIndex })).filter(x => x.row.phase === "tuning");
const anchors = [0, 8];
const remaining = tuning.filter(x => !anchors.includes(x.panelIndex));
const firstNontrivial = remaining.find(x => x.row.reference_class_number !== null && BigInt(x.row.reference_class_number) > 1n);
assert(firstNontrivial);
const afterThird = remaining.filter(x => x.panelIndex !== firstNontrivial.panelIndex && x.row.reference_class_number !== null);
afterThird.sort((a, b) => {
  const ah = BigInt(a.row.reference_class_number);
  const bh = BigInt(b.row.reference_class_number);
  if (ah !== bh) return ah > bh ? -1 : 1;
  return a.row.id.localeCompare(b.row.id);
});
const derivedSentinels = [...anchors, firstNontrivial.panelIndex, afterThird[0].panelIndex];
assert.deepEqual(derivedSentinels, frozen.sentinels);
const derivedAdditional = tuning.map(x => x.panelIndex).filter(index => !derivedSentinels.includes(index));
assert.deepEqual(derivedAdditional, frozen.additional);

assert.equal(ladder.fields.length, 16);
assert.deepEqual(ladder.fields.map(x => x.panelIndex), [...frozen.sentinels, ...frozen.additional]);
assert.deepEqual(ladder.fields.map(x => x.role), [
  ...Array(4).fill("sentinel"),
  ...Array(12).fill("additional-development"),
]);
for (const field of ladder.fields) {
  const row = panel.rows[field.panelIndex];
  assert.equal(row.phase, "tuning");
  assert.equal(field.id, row.id);
  assert.equal(field.polynomialSha256, row.polynomial_sha256);
}
const qualificationDevelopment = qualification.fields.filter(field => field.role !== "final-reserve");
assert.deepEqual(
  qualificationDevelopment.map(({ panelIndex, role, id }) => ({ panelIndex, role, id })),
  ladder.fields.map(({ panelIndex, role, id }) => ({ panelIndex, role, id })),
);

assert.deepEqual(ladder.existingDefaultDriverEvidence.coveredPanelIndices, frozen.traced);
assert.deepEqual(ladder.existingDefaultDriverEvidence.uncoveredPanelIndices, []);
assert.equal(ladder.existingDefaultDriverEvidence.allSixteenTraced, true);
assert.equal(hashFile(ladder.existingDefaultDriverEvidence.checker.path), ladder.existingDefaultDriverEvidence.checker.sha256);
assert.equal(hashFile(ladder.existingDefaultDriverEvidence.exporter.path), ladder.existingDefaultDriverEvidence.exporter.sha256);
assert.equal(hashFile(ladder.existingDefaultDriverEvidence.manifest.path), ladder.existingDefaultDriverEvidence.manifest.sha256);
const traceChecker = read(ladder.existingDefaultDriverEvidence.checker.path).toString("utf8");
for (const literal of [frozen.archiveSha256, frozen.buch2Sha256, "--panel-index=", "Final-reserve rows are closed"])
  assert(traceChecker.includes(literal), `Missing pinned trace policy: ${literal}`);
const traceManifest = json(ladder.existingDefaultDriverEvidence.manifest.path);
assert.equal(traceManifest.qualificationExecutionEnabled, false);
assert.equal(traceManifest.reserveOpened, false);
assert.deepEqual(traceManifest.records.map(record => record.panelIndex), frozen.traced);
assert.equal(traceManifest.records.reduce((sum, record) => sum + record.bytes, 0),
  ladder.existingDefaultDriverEvidence.totalPayloadBytes);

for (const [name, expected] of Object.entries(ladder.evidenceHashes)) {
  assert.equal(hashFile(`bench/pari-class-group-port/${name}`), expected);
}
const coverage = ladder.coverage;
assert.deepEqual(coverage.nonemptyW.panelIndices, [10]);
assert.equal(coverage.nonemptyW.performancePopulation, "observed");
assert.deepEqual(coverage.rankDeficiency.panelIndices, [8, 10]);
assert.equal(coverage.rankDeficiency.performancePopulation, "observed");
for (const name of ["randomRelations", "precisionEscalation"]) {
  assert.equal(coverage[name].performancePopulation, "absent");
  assert.deepEqual(coverage[name].panelIndices, []);
}
const randomRelations = coverage.randomRelations.correctnessOnly;
assert.equal(randomRelations.status, "closed-frozen-corridor");
assert.equal(randomRelations.panelIdentityIndex, 10);
assert.equal(randomRelations.defaultPolicy, false);
for (const [name, expected] of [
  [randomRelations.fixture, randomRelations.fixtureSha256],
  [randomRelations.audit, randomRelations.auditSha256],
  [randomRelations.checker, randomRelations.checkerSha256],
]) assert.equal(hashFile(`bench/pari-class-group-port/${name}`), expected);
const randomFixture = json(`bench/pari-class-group-port/${randomRelations.fixture}`);
assert.equal(randomFixture.identity.pariVersion, frozen.pariVersion);
assert.equal(randomFixture.pariArchiveSha256, frozen.archiveSha256);
assert.equal(randomFixture.buch2Sha256, frozen.buch2Sha256);
assert.equal(randomFixture.identity.polynomial, "x^4-2000022*x-2000042");
assert.match(randomFixture.identity.forcedBranch, /literal rnd_rel/);
assert.deepEqual(randomFixture.counts, {
  old: 293,
  last: 295,
  newColumns: 2,
  hRowsBefore: 4,
  hRowsAfter: 5,
  bColumnsBefore: 282,
  bColumnsAfter: 283,
});
assert.match(randomRelations.note, /not a natural default-driver observation/);
const precisionEscalation = coverage.precisionEscalation.correctnessOnly;
assert.equal(precisionEscalation.status, "closed-bounded-authentic-h1-corridor");
assert.equal(precisionEscalation.panelIdentityIndex, 0);
assert.equal(precisionEscalation.defaultPolicy, false);
assert.equal(precisionEscalation.naturalDefaultDriverObservation, false);
for (const [name, expected] of [
  [precisionEscalation.fixture, precisionEscalation.fixtureSha256],
  [precisionEscalation.audit, precisionEscalation.auditSha256],
  [precisionEscalation.checker, precisionEscalation.checkerSha256],
]) assert.equal(hashFile(`bench/pari-class-group-port/${name}`), expected);
const precisionFixture = json(
  `bench/pari-class-group-port/${precisionEscalation.fixture}`,
);
assert.equal(precisionFixture.scope.performanceInput, false);
assert.equal(precisionFixture.scope.defaultPerformancePopulationCoverage, "absent");
assert.equal(precisionFixture.scope.opensReserveField, false);
assert.equal(precisionFixture.identity.panelIndex, 0);
assert.equal(precisionFixture.identity.panelId, panel.rows[0].id);
assert.deepEqual(
  precisionFixture.observedRetry.attempts.map(attempt => [
    attempt.precision, attempt.statusCode,
  ]),
  [["192", "3"], ["384", "3"], ["768", "3"], ["1536", "3"], ["2304", "0"]],
);
assert.equal(precisionFixture.observedRetry.terminalPrecisionIsObservation, true);
assert.equal(precisionFixture.observedRetry.terminalPrecisionIsDriverConstant, false);
assert.match(precisionEscalation.note, /does not establish precision escalation/);
assert.equal(coverage.honesty.performancePopulation, "absent");
assert.deepEqual(coverage.honesty.panelIndices, []);
assert.equal(coverage.honesty.correctnessOnly.status, "closed-frozen-all-failure-corridor");
assert.equal(coverage.honesty.correctnessOnly.genericBranchStatus, "partial");
assert.equal(coverage.honesty.correctnessOnly.panelIdentityIndex, 0);
assert.equal(coverage.honesty.correctnessOnly.defaultPolicy, false);
assert.equal(hashFile(`bench/pari-class-group-port/${coverage.honesty.correctnessOnly.fixture}`), coverage.honesty.correctnessOnly.fixtureSha256);
assert.equal(hashFile(`bench/pari-class-group-port/${coverage.honesty.correctnessOnly.audit}`), coverage.honesty.correctnessOnly.auditSha256);
assert.equal(hashFile(`bench/pari-class-group-port/${coverage.honesty.correctnessOnly.schedulerFixture}`), coverage.honesty.correctnessOnly.schedulerFixtureSha256);
assert.equal(hashFile(`bench/pari-class-group-port/${coverage.honesty.correctnessOnly.checker}`), coverage.honesty.correctnessOnly.checkerSha256);
const honesty = json(`bench/pari-class-group-port/${coverage.honesty.correctnessOnly.fixture}`);
assert.equal(honesty.identity.pariVersion, frozen.pariVersion);
assert.equal(honesty.identity.archiveSha256, frozen.archiveSha256);
assert.equal(honesty.identity.buch2Sha256, frozen.buch2Sha256);
assert.notEqual(honesty.input.C1, honesty.input.C2);
assert.equal(honesty.result.success, 0);
assert.equal(honesty.semantics.randomBits, 4);
assert.match(coverage.honesty.correctnessOnly.note, /not rnd_rel/);
const honestyScheduler = json(`bench/pari-class-group-port/${coverage.honesty.correctnessOnly.schedulerFixture}`);
assert.equal(honestyScheduler.identity.pariVersion, frozen.pariVersion);
assert.equal(honestyScheduler.identity.archiveSha256, frozen.archiveSha256);
assert.equal(honestyScheduler.identity.leafFixtureSha256, coverage.honesty.correctnessOnly.fixtureSha256);
assert.deepEqual(honestyScheduler.result, { success: 0, finalKCZ: 2, probes: 51, draws: 50 });
assert(honestyScheduler.genericGaps.includes("successful KCZ increment and all-success restoration"));
const selectedHonesty = coverage.honesty.selectedSuccess;
assert.equal(selectedHonesty.status, "closed-selected-immediate-success-corridor");
assert.equal(selectedHonesty.genericBranchStatus, "partial");
assert.equal(selectedHonesty.panelIdentityIndex, 21);
assert.equal(selectedHonesty.defaultPolicy, false);
assert.deepEqual(selectedHonesty.customBounds, { C1: 5, C2: 31 });
for (const [name, expected] of [
  [selectedHonesty.fixture, selectedHonesty.fixtureSha256],
  [selectedHonesty.selectionChecker, selectedHonesty.selectionCheckerSha256],
  [selectedHonesty.liveChecker, selectedHonesty.liveCheckerSha256],
  [selectedHonesty.audit, selectedHonesty.auditSha256],
  [selectedHonesty.liveAudit, selectedHonesty.liveAuditSha256],
]) assert.equal(hashFile(`bench/pari-class-group-port/${name}`), expected);
const selectedHonestyFixture = json(
  `bench/pari-class-group-port/${selectedHonesty.fixture}`,
);
assert.equal(selectedHonestyFixture.identity.pariVersion, frozen.pariVersion);
assert.equal(selectedHonestyFixture.identity.archiveSha256, frozen.archiveSha256);
assert.equal(selectedHonestyFixture.identity.buch2Sha256, frozen.buch2Sha256);
assert.equal(selectedHonestyFixture.input.panelIndex, 21);
assert.equal(selectedHonestyFixture.input.id, panel.rows[21].id);
assert.notEqual(selectedHonestyFixture.input.C1, selectedHonestyFixture.input.C2);
assert.deepEqual(selectedHonestyFixture.probeNorms, ["11", "11", "11", "13", "29", "29"]);
assert.deepEqual(selectedHonestyFixture.transientKCZ, [4, 5, 6]);
assert.deepEqual(selectedHonestyFixture.restoration, [6, 3]);
assert.deepEqual(selectedHonestyFixture.branches, {
  probes: 6,
  failures: 0,
  increments: 3,
  primitiveParts: 0,
  idealReductions: 0,
  automorphismEntries: 0,
  automorphismSkips: 0,
});
assert.deepEqual(selectedHonestyFixture.result, { success: 1, finalKCZ: 3 });
assert.match(selectedHonesty.note, /does not cover automorphism orbits/);
assert.deepEqual(ladder.correctnessOnlyRequirements.map(x => [x.branch, x.status, x.performanceInput]), [
  ["random-relations", "closed-frozen-corridor", false],
  ["precision-escalation", "closed-bounded-authentic-h1-corridor", false],
  ["unequal-bound-honesty-all-failure", "closed-frozen-corridor", false],
  ["successful-honesty-selected-path", "closed-selected-immediate-success-corridor", false],
]);
for (const requirement of ladder.correctnessOnlyRequirements) assert(requirement.requiredObservation.length > 40);

assert.equal(ladder.promotionPolicy.fixtureCanBecomePerformanceField, false);
assert.equal(ladder.promotionPolicy.samePolynomialIsInsufficient, true);
assert.equal(ladder.promotionPolicy.correctnessFixtureAcceptance.length, 4);
assert.equal(ladder.promotionPolicy.performanceCoveragePromotion.length, 4);
const promotionText = ladder.promotionPolicy.performanceCoveragePromotion.join(" ");
for (const required of ["frozen sixteen", "unmodified", "without forced control flow", "Sage.js default public path", "paired schedule"]) {
  assert(promotionText.includes(required), `Missing performance-promotion rule: ${required}`);
}

assert.deepEqual(ladder.reservePolicy, {
  panelRows: 24,
  developmentRows: 16,
  finalReserveRows: 8,
  reserveOpened: false,
  panelModified: false,
});
assert.equal(ladder.verdict.sentinelRetryPrecisionOrHonestyRequirementProven, true);
assert.equal(ladder.verdict.boundedCorrectnessOnlyPrecisionEscalationProven, true);
assert.equal(ladder.verdict.selectedSuccessfulHonestyProven, true);
assert.equal(ladder.verdict.generalHonestyProven, false);
assert.deepEqual(ladder.verdict.closedCorrectnessOnlyCorridors, [
  "random-relations",
  "precision-escalation",
  "unequal-bound-honesty-all-failure",
  "successful-honesty-selected-path",
]);
assert.deepEqual(ladder.verdict.missingCorrectnessOnlyFixtures, []);
assert.deepEqual(ladder.verdict.openGeneralizationFrontiers, [
  "honesty-automorphism-orbits",
  "honesty-failure-retry-arithmetic",
  "honesty-ideal-reduction-path",
]);
assert.equal(ladder.verdict.fieldSubstitutionAllowed, false);

console.log(JSON.stringify({
  ok: true,
  panelSha256: frozen.panelSha256,
  pariVersion: frozen.pariVersion,
  sentinels: frozen.sentinels,
  additionalDevelopment: frozen.additional,
  existingDefaultDriverEvidence: `${frozen.traced.length}/16`,
  observedPerformanceCoverage: ["nonempty-W", "rank-deficiency"],
  closedCorrectnessOnlyCorridors: [
    "random-relations", "precision-escalation",
    "unequal-bound-honesty-all-failure", "successful-honesty-selected-path",
  ],
  missingCorrectnessOnlyCoverage: [],
  openGeneralizationFrontiers: ladder.verdict.openGeneralizationFrontiers,
}));

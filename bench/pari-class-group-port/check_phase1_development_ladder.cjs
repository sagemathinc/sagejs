"use strict";

const assert = require("node:assert/strict");
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
  panelSha256: "7c6515240940db971cff3bc28819f9e6547adae9305643b0f6274eeafe6ec3a5",
  qualificationSha256: "3821a5a51390ca25b3110e7a8058d73cd9945d0ab6ad254c07186e0ac19c1c50",
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
assert.equal(hashFile(ladder.sources.plan.path), ladder.sources.plan.sha256);
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
assert.deepEqual(ladder.correctnessOnlyRequirements.map(x => [x.branch, x.status, x.performanceInput]), [
  ["random-relations", "closed-frozen-corridor", false],
  ["precision-escalation", "missing", false],
  ["unequal-bound-honesty-all-failure", "closed-frozen-corridor", false],
  ["successful-full-honesty", "missing", false],
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
assert.equal(ladder.verdict.sentinelRetryPrecisionOrHonestyRequirementProven, false);
assert.deepEqual(ladder.verdict.closedCorrectnessOnlyCorridors, [
  "random-relations",
  "unequal-bound-honesty-all-failure",
]);
assert.deepEqual(ladder.verdict.missingCorrectnessOnlyFixtures, [
  "precision-escalation",
  "successful-full-honesty",
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
  closedCorrectnessOnlyCorridors: ["random-relations", "unequal-bound-honesty-all-failure"],
  missingCorrectnessOnlyCoverage: ["precision-escalation", "successful-full-honesty"],
}));

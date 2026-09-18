#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// This is an untimed evidence/fixture gate. Pass --live, optionally followed
// by an authentic resident-output path, to rerun the existing H1 producer.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const fixturePath = path.join(__dirname, "phase1-precision-escalation-fixture.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const read = relative => fs.readFileSync(path.join(root, relative));

assert.equal(fixture.schema,
  "sagejs.pari-class-group/phase1-precision-escalation-correctness-v1");
assert.deepEqual(fixture.scope, {
  kind: "correctness-only-bounded-authentic-h1-corridor",
  status: "closed",
  performanceInput: false,
  defaultPerformancePopulationCoverage: "absent",
  opensReserveField: false,
});

for (const item of fixture.evidence) {
  assert.match(item.path, /^bench\/pari-class-group-port\//);
  assert.equal(sha256(read(item.path)), item.sha256, `${item.role}: ${item.path}`);
}

const panel = JSON.parse(read("bench/pari-class-group-port/panel.json"));
const row = panel.rows[fixture.identity.panelIndex];
assert.equal(row.phase, "tuning");
assert.equal(row.id, fixture.identity.panelId);
assert.deepEqual(row.coefficients, fixture.identity.coefficientsAscending);
assert.equal(row.polynomial_sha256, fixture.identity.polynomialSha256);
assert.equal(row.reference_class_number, fixture.identity.classNumber);
assert.equal(row.unit_rank, fixture.identity.unitRank);

const bridgeFixture = JSON.parse(
  read("bench/pari-class-group-port/unit-bridge-cubic-fixtures.json"),
);
assert.deepEqual(bridgeFixture.pari, {
  version: fixture.pristinePari.version,
  archive_sha256: fixture.pristinePari.archiveSha256,
  buch2_sha256: fixture.pristinePari.buch2Sha256,
  lll_sha256: fixture.pristinePari.lllSha256,
});
assert.equal(bridgeFixture.cases.length, 1);
const bridgeCase = bridgeFixture.cases[0];
assert.equal(bridgeCase.polynomial.replaceAll(" ", ""), fixture.identity.polynomial);
assert.equal(bridgeCase.precision, Number(fixture.sourceMatchedRebuild.residentPrecision));
assert.equal(Number(bridgeCase.resident_state.relation_count),
  fixture.identity.residentRelationCount);

const attempts = fixture.observedRetry.attempts;
assert.deepEqual(attempts.map(item => item.precision),
  ["192", "384", "768", "1536", "2304"]);
assert.deepEqual(attempts.map(item => item.statusCode), ["3", "3", "3", "3", "0"]);
assert.deepEqual(attempts.map(item => item.precisionDeficit),
  ["1923", "1731", "1347", "579", "-178"]);

// The first four next attempts are derived from the pinned unflagged PRECI
// policy.  The final success is an observation and never predicts itself.
function unflaggedPreciTarget(current) {
  const raw = current < 1280n ? 2n * current : (3n * current) / 2n;
  return ((raw + 63n) / 64n) * 64n;
}
for (let i = 0; i + 1 < attempts.length; i += 1) {
  assert.equal(attempts[i].status, "PRECI");
  assert.equal(unflaggedPreciTarget(BigInt(attempts[i].precision)),
    BigInt(attempts[i + 1].precision));
}
assert.equal(attempts.at(-1).status, "success");
assert.equal(fixture.observedRetry.terminalPrecisionIsObservation, true);
assert.equal(fixture.observedRetry.terminalPrecisionIsDriverConstant, false);
assert.deepEqual(fixture.observedRetry.exactUnitNorms, ["-1", "-1"]);
assert.deepEqual(fixture.observedRetry.phaseBits, ["0", "0", "1", "1", "1", "1"]);

const driver = read("bench/pari-class-group-port/h1_precision_retry_driver.cjs")
  .toString("utf8");
assert.doesNotMatch(driver, /\b2304n?\b/,
  "the answer-independent retry driver gained a terminal-precision literal");
assert.match(driver, /status !== PRECI/);
assert.match(driver, /failed unit attempt modified transactional output/);
assert.equal(fixture.failureContracts.publicFailureTransactional, true);
assert.equal(fixture.failureContracts.retainedExactOwnerMutationRejected, true);
assert.equal(fixture.failureContracts.fixtureAnswersLoadedByDriver, false);

const forbiddenKeys = /(?:^|_)(?:timing|seconds|duration|elapsed)(?:$|_)/i;
function rejectTiming(value) {
  if (Array.isArray(value)) return value.forEach(rejectTiming);
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      assert.doesNotMatch(key, forbiddenKeys, `timing field is out of scope: ${key}`);
      rejectTiming(child);
    }
  }
}
rejectTiming(fixture);

let liveReceipt = null;
const liveIndex = process.argv.indexOf("--live");
if (liveIndex !== -1) {
  const args = [path.join(__dirname, "check_h1_precision_retry_driver.cjs")];
  const residentPath = process.argv[liveIndex + 1];
  if (residentPath && !residentPath.startsWith("--")) args.push(residentPath);
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 15 * 60 * 1000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  liveReceipt = JSON.parse(result.stdout.trim().split("\n").at(-1));
  assert.equal(liveReceipt.schema,
    "sagejs.pari-class-group/h1-precision-retry-driver-v1");
  assert.equal(liveReceipt.field, fixture.identity.polynomial);
  assert.deepEqual(liveReceipt.transitionPrecisions,
    attempts.map(item => item.precision));
  assert.deepEqual(liveReceipt.transitionStatuses,
    attempts.map(item => item.statusCode));
  assert.equal(liveReceipt.finalPrecisionDeficit,
    attempts.at(-1).precisionDeficit);
  assert.equal(liveReceipt.resourceCapStop,
    fixture.failureContracts.resourceCapPrecision);
  assert.equal(liveReceipt.retainedExactOwnerDigest,
    fixture.observedRetry.retainedExactOwnerDigest);
  assert.equal(liveReceipt.forcedMutationRejected, true);
  assert.equal(liveReceipt.publicFailureTransactional, true);
  assert.equal(liveReceipt.fixtureAnswersLoadedByDriver, false);
}

console.log(JSON.stringify({
  schema: fixture.schema,
  ok: true,
  field: fixture.identity.polynomial,
  scope: fixture.scope.kind,
  defaultPerformancePopulationCoverage:
    fixture.scope.defaultPerformancePopulationCoverage,
  attemptPrecisions: attempts.map(item => item.precision),
  attemptStatuses: attempts.map(item => item.status),
  evidenceFiles: fixture.evidence.length,
  liveReplay: liveReceipt !== null,
  timingClaim: false,
}));

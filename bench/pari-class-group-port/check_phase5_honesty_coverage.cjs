#!/usr/bin/env node
"use strict";

// Aggregate the three honesty outcomes that have executable evidence without
// weakening their individual authority boundaries:
//
//   * the source-derived equal-bound zero-work skip;
//   * the frozen unequal-bound all-failure/restart transaction; and
//   * the predeclared row-21 unequal-bound successful extension.
//
// `extended-complete` below is deliberately a branch-local outcome.  It does
// not claim a general implementation of automorphism or failed-probe paths.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const PARI = path.resolve(process.argv[2] || "/home/user/upstream/pari-2.17.4");
const ARCHIVE = path.resolve(
  process.argv[3] || "/home/user/upstream/pari-2.17.4.tar.gz",
);
const ARCHIVE_SHA =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const BUCH2_SHA =
  "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 1_800_000,
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function jsonCheck(file, args = []) {
  const output = run(process.execPath, [path.join(__dirname, file), ...args]);
  return JSON.parse(output.trim().split("\n").at(-1));
}

assert.equal(sha256(fs.readFileSync(ARCHIVE)), ARCHIVE_SHA);
const pristine = run("tar", [
  "-xOf",
  ARCHIVE,
  "pari-2.17.4/src/basemath/buch2.c",
]);
assert.equal(sha256(pristine), BUCH2_SHA);
assert.match(pristine, /if \(F\.KCZ2 > F\.KCZ\)/);
assert.match(pristine, /if \(!be_honest\(&F, nf, auts, fact\)\)/);

// Bind the selected successful path to the relevant portion of the already
// frozen development ladder before executing the expensive arithmetic check.
// Read it directly: its old global checker also pins an unrelated qualification
// manifest that legitimately changed after the ladder was frozen.
const ladder = JSON.parse(
  fs.readFileSync(path.join(__dirname, "phase1-development-ladder.json")),
);
const panel = fs.readFileSync(path.join(__dirname, "panel.json"));
assert.equal(sha256(panel), ladder.sources.panel.sha256);
const selected = ladder.coverage.honesty.selectedSuccess;
assert.equal(selected.status, "closed-selected-immediate-success-corridor");
assert.equal(selected.panelIdentityIndex, 21);
assert.deepEqual(selected.customBounds, { C1: 5, C2: 31 });
for (const [name, expected] of [
  [selected.fixture, selected.fixtureSha256],
  [selected.liveChecker, selected.liveCheckerSha256],
]) {
  assert.equal(sha256(fs.readFileSync(path.join(__dirname, name))), expected);
}
assert(ladder.verdict.closedCorrectnessOnlyCorridors.includes(
  "unequal-bound-honesty-all-failure",
));
assert(ladder.verdict.closedCorrectnessOnlyCorridors.includes(
  "successful-honesty-selected-path",
));
assert.deepEqual(ladder.verdict.openGeneralizationFrontiers, [
  "honesty-automorphism-orbits",
  "honesty-failure-retry-arithmetic",
  "honesty-ideal-reduction-path",
]);

// Exercise the equal-bound dispatch and the resident failure transaction.  The
// latter includes exact RNG preservation/mutation assertions and rejects the
// old unsupported success/orbit frontiers without publishing partial state.
run("python3", [
  "-m",
  "unittest",
  "bench.pari-class-group-port.test_honesty_equal_bound",
  "bench.pari-class-group-port.test_resident_honesty_root",
]);

// Re-run the connected translated failure graph, including 51 fresh collector
// probes, 50 random products, exact terminal state, and all native backends.
const failure = jsonCheck("check_honesty_scheduler.cjs", [PARI, ARCHIVE]);
assert.equal(failure.frozenCaseComplete, true);
assert.equal(failure.unequalBounds, true);
assert.equal(failure.noCacheCollectorProbes, 51);
assert.deepEqual(failure.schedulerBackends, [
  "cpython",
  "javascript",
  "gmp",
  "tagged",
]);
assert.deepEqual(failure.collectorBackends, [
  "cpython",
  "javascript",
  "gmp",
  "tagged",
]);

// This is the decisive selected-success authority.  Its Python payload omits
// PARI statuses and branch answers; all six status bits are computed by the
// translated Sage graph before the outer differential comparison.
const success = jsonCheck("check_honesty_success_live_first_probe.cjs", [
  PARI,
  ARCHIVE,
]);
assert.equal(success.liveSuccessfulHonesty, true);
assert.equal(success.degree, 5);
assert.deepEqual(success.bounds, [5, 31]);
assert.notEqual(success.bounds[0], success.bounds[1]);
assert.equal(success.initialKCZ, 3);
assert.equal(success.checkingKCZ, 10);
assert.deepEqual(success.pariReferenceStatuses, [1, 1, 1, 1, 1, 1]);
assert.deepEqual(success.sageComputedStatuses, [1, 1, 1, 1, 1, 1]);
assert.equal(success.sageRuntimeAcceptedPariStatus, false);
assert.equal(success.preparedOwnersOnly, true);
assert.equal(success.scheduler.consumedLiveObservations, 6);
assert.equal(success.scheduler.probesPublished, 6);
assert.equal(success.scheduler.probesConsumed, 6);
assert.equal(success.scheduler.kczIncrements, 3);
assert.equal(success.scheduler.terminal, 1);
assert.equal(success.scheduler.restorations, 1);
assert.equal(success.scheduler.finalKCZ, 3);
assert.equal(success.scheduler.rngUnchanged, true);
assert.equal(success.mutationsRejected, 3);
assert.equal(success.buch2Sha256, BUCH2_SHA);
assert.equal(success.archiveSha256, ARCHIVE_SHA);

const result = {
  schema: "pari-class-group-phase5-honesty-coverage-v1",
  pristinePari: {
    version: "2.17.4",
    archiveSha256: ARCHIVE_SHA,
    buch2Sha256: BUCH2_SHA,
  },
  outcomes: {
    equalBound: {
      outcome: "equal-bound-source-skip",
      complete: true,
      probes: 0,
      randomDraws: 0,
    },
    unequalBoundAllFailure: {
      outcome: "restart-required-honesty-failure",
      complete: true,
      probes: failure.noCacheCollectorProbes,
      randomProducts: 50,
      backends: failure.schedulerBackends,
    },
    selectedUnequalBoundSuccess: {
      outcome: "extended-complete",
      complete: true,
      scope: "predeclared-row-21-immediate-success-corridor-only",
      field: success.field,
      bounds: success.bounds,
      factorBaseCounts: [success.initialKCZ, success.checkingKCZ],
      probes: success.scheduler.probesConsumed,
      transientIncrements: success.scheduler.kczIncrements,
      finalKCZ: success.scheduler.finalKCZ,
      acceptedPariStatusAsRuntimeInput: false,
      transcriptSha256: success.transcriptSha256,
    },
  },
  phase5Honesty: {
    selectedRequiredBranchComplete: true,
    generalImplementationComplete: false,
    performancePopulationCoverage: false,
    remainingFrontiers: ladder.verdict.openGeneralizationFrontiers,
  },
};

process.stdout.write(`${JSON.stringify(result)}\n`);

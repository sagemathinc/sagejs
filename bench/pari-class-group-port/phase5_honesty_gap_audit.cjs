#!/usr/bin/env node
"use strict";

// Fail-closed audit of the distinction between the selected unequal-bound
// correctness fixture and the frozen 16-row fresh-prepared aggregate.  This
// file changes neither population: it authenticates and executes both.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "../..");
const PARI = path.resolve(process.argv[2] || "/home/user/upstream/pari-2.17.4");
const ARCHIVE = path.resolve(
  process.argv[3] || "/home/user/upstream/pari-2.17.4.tar.gz",
);
const CORPUS = path.resolve(
  process.argv[4] || "/scratch/sagejs-pari-fresh-prepared-corpus-v1",
);
const AGGREGATE = path.resolve(
  process.argv[5] || "/scratch/fresh-prepared-development-aggregate-v1-20260918.json",
);
const ARCHIVE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const BUCH2_SHA256 =
  "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function read(name) {
  return fs.readFileSync(path.join(HERE, name), "utf8");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 900_000,
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function finalJson(output) {
  const trimmed = output.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return JSON.parse(trimmed.split("\n").at(-1));
  }
}

assert.equal(sha256(fs.readFileSync(ARCHIVE)), ARCHIVE_SHA256);
const buch2 = run("tar", [
  "-xOf",
  ARCHIVE,
  "pari-2.17.4/src/basemath/buch2.c",
]);
assert.equal(sha256(buch2), BUCH2_SHA256);

// Authenticate the exact upstream cuts.  Line numbers refer to pristine
// PARI 2.17.4 buch2.c and are reported below for human source navigation.
const lines = buch2.split("\n");
function sourceCut(first, last) {
  const source = `${lines.slice(first - 1, last).join("\n")}\n`;
  return { first, last, sha256: sha256(source) };
}
const sourceCuts = {
  automorphismAndOrbit: sourceCut(2680, 2798),
  beHonest: sourceCut(2801, 2864),
  retryProduct: sourceCut(2837, 2860),
  primitivePart: sourceCut(2857, 2857),
  idealReduction: sourceCut(2858, 2858),
  driverCallsite: sourceCut(4134, 4140),
};
assert.match(lines.slice(2800, 2864).join("\n"), /F->KCZ\+\+/);
assert.match(lines.slice(4133, 4140).join("\n"), /if \(!be_honest\(&F, nf, auts, fact\)\) goto START/);

const ladder = JSON.parse(read("phase1-development-ladder.json"));
const selected = ladder.coverage.honesty.selectedSuccess;
assert.equal(selected.panelIdentityIndex, 21);
assert.equal(selected.defaultPolicy, false);
assert.deepEqual(selected.customBounds, { C1: 5, C2: 31 });
assert.equal(ladder.coverage.honesty.performancePopulation, "absent");

// Execute the genuine no-answer selected arithmetic.  PARI's statuses remain
// outside the Python payload and are compared only after Sage returns.
const selectedResult = finalJson(run(process.execPath, [
  path.join(HERE, "check_honesty_success_live_first_probe.cjs"),
  PARI,
  ARCHIVE,
]));
assert.equal(selectedResult.liveSuccessfulHonesty, true);
assert.equal(selectedResult.sageRuntimeAcceptedPariStatus, false);
assert.equal(selectedResult.preparedOwnersOnly, true);
assert.deepEqual(selectedResult.bounds, [5, 31]);
assert.deepEqual(selectedResult.sageComputedStatuses, [1, 1, 1, 1, 1, 1]);
assert.equal(selectedResult.scheduler.kczIncrements, 3);
assert.equal(selectedResult.scheduler.restorations, 1);

// Independently authenticate the already-published 16-row aggregate without
// rerunning its expensive row computations.
const aggregateCheck = finalJson(run(process.execPath, [
  path.join(HERE, "check_fresh_prepared_aggregate.cjs"),
  CORPUS,
  AGGREGATE,
]));
assert.equal(aggregateCheck.aggregateReceiptVerified, true);
assert.equal(aggregateCheck.corpusRows, 16);
const aggregate = JSON.parse(fs.readFileSync(AGGREGATE, "utf8"));
const aggregateRow21 = aggregate.rows.find(row => row.panelIndex === 21);
assert(aggregateRow21);

// Prove which branch the row-21 aggregate transaction actually takes.  Its
// factor-base coordinator rejects unequal bounds, its transaction proceeds
// directly from acceptance to units, and its terminal adapter publishes an
// explicit `not-required` honesty result.  Thus the same frozen polynomial is
// present in the aggregate, but the selected C1=5,C2=31 branch is not.
const factorCoordinator = read("row21_factor_base_coordinator.cjs");
const transaction = read("row21_fresh_prepared_transaction.cjs");
const adapter = read("row21_terminal_neutral_adapter.cjs");
assert.match(factorCoordinator, /kcz !== kcz2 \|\| kc !== kc2/);
assert.match(factorCoordinator, /bounds: \{ C1: String\(c1\), C2: String\(c2\)/);
assert.doesNotMatch(transaction, /honesty_success|resident_honesty_root|be_honest/);
assert.match(transaction, /const accepted = await acceptance\.run\([\s\S]*?const units = await liveUnits\.run\(/);
assert.match(adapter, /outcome: "not-required"/);

// The named resident root is conditional, but its unequal-bound success edge
// still terminates at an explicit unsupported frontier.  The selected success
// scheduler is a separate source-identical @native graph and is not called by
// that root or by the row-21 transaction.
const residentRoot = read("resident_honesty_root.py");
const successScheduler = read("honesty_success.py");
assert.match(residentRoot, /"unsupported-success-continuation"/);
assert.doesNotMatch(residentRoot, /honesty_success/);
assert.match(successScheduler, /@native\ndef pari_honesty_success_begin/);
assert.match(successScheduler, /@native\ndef pari_honesty_success_resume/);

const result = {
  schema: "sagejs.pari-class-group/phase5-honesty-gap-audit-v1",
  pristinePari: {
    version: "2.17.4",
    archiveSha256: ARCHIVE_SHA256,
    buch2Sha256: BUCH2_SHA256,
    sourceCuts,
  },
  selectedUnequalBoundFixture: {
    panelIndex: 21,
    bounds: selectedResult.bounds,
    genuinePreparedArithmetic: true,
    acceptedPariStatusAsRuntimeInput: false,
    transcriptSha256: selectedResult.transcriptSha256,
    scheduler: selectedResult.scheduler,
  },
  frozenAggregate: {
    receiptSha256: sha256(fs.readFileSync(AGGREGATE)),
    verified: true,
    rows: aggregateCheck.corpusRows,
    row21Present: true,
    row21Branch: "equal-bound-not-required",
    selectedUnequalBoundBranchIncluded: false,
    reason: "row21 default prepared factor base enforces KCZ==KCZ2; selected correctness fixture uses custom C1=5,C2=31",
  },
  residentStatus: {
    conditionalEqualAndFailureRootExists: true,
    selectedSuccessNativeGraphExists: true,
    selectedSuccessConnectedToResidentRoot: false,
    selectedSuccessConnectedToRow21FreshTransaction: false,
    phase5ConditionalResidentBranchComplete: false,
  },
  boundedNextTask: {
    populationChangeRequired: false,
    reserveOpeningRequired: false,
    description: "Add a correctness-only fresh transaction for frozen row 21 with authenticated custom C1=5,C2=31 factor-base owners; join the existing live collector and honesty_success scheduler behind one conditional resident root at the PARI 4134-4140 boundary; publish and mutation-check the honesty owner before units; add it as a separate aggregate correctness outcome without replacing the default 16-row performance transaction.",
    requiredSourceCuts: [
      "buch2.c:2801-2864 selected no-automorphism immediate-success path",
      "buch2.c:4134-4140 conditional call, restart result, one-shot KCZ2 reset",
    ],
    excludedGeneralizationCuts: [
      "buch2.c:2680-2798 automorphism matrices/permutations/orbits",
      "buch2.c:2837-2860 failed-probe random-product retry loop",
      "buch2.c:2857 Q_primpart",
      "buch2.c:2858 idealred",
    ],
  },
};

process.stdout.write(`${JSON.stringify(result)}\n`);

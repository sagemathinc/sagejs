#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const transaction = require("./row21_honesty_fresh_prepared_transaction.cjs");
const customFactor = require("./row21_honesty_factor_owner.cjs");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "../..");
const CORPUS = path.resolve(process.argv[2] ||
  "/scratch/sagejs-pari-fresh-prepared-corpus-v1");
const ARCHIVE = path.resolve(process.argv[3] ||
  "/home/user/upstream/pari-2.17.4.tar.gz");
const OUTPUT = process.argv[4]
  ? path.resolve(process.argv[4])
  : fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row21-honesty-check-"));
const ARCHIVE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const BUCH2_SHA256 =
  "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sourceCut(lines, first, last) {
  const bytes = Buffer.from(`${lines.slice(first - 1, last).join("\n")}\n`);
  return { first, last, sha256: sha256(bytes) };
}

async function main() {
  assert.equal(sha256(fs.readFileSync(ARCHIVE)), ARCHIVE_SHA256);
  const tar = spawnSync("tar", ["-xOf", ARCHIVE,
    "pari-2.17.4/src/basemath/buch2.c"], {
    encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 60_000,
  });
  assert.equal(tar.status, 0, tar.stderr || String(tar.error));
  assert.equal(sha256(tar.stdout), BUCH2_SHA256);
  const lines = tar.stdout.split("\n");
  const sourceCuts = {
    immediateSuccess: sourceCut(lines, 2801, 2864),
    driverCallsite: sourceCut(lines, 4134, 4140),
  };
  assert.match(lines.slice(4133, 4140).join("\n"),
    /if \(F\.KCZ2 > F\.KCZ\)/);
  assert.match(lines.slice(4133, 4140).join("\n"),
    /if \(!be_honest\(&F, nf, auts, fact\)\) goto START/);
  assert.match(lines.slice(4133, 4140).join("\n"), /F\.KCZ2 = 0/);

  const index = JSON.parse(fs.readFileSync(
    path.join(CORPUS, "prepared-corpus-index.json")));
  const row21 = index.files.find(row => row.panelIndex === 21);
  assert(row21, "fresh prepared corpus has no row 21");
  const preparedBytes = fs.readFileSync(path.join(CORPUS, row21.filename));
  assert.equal(sha256(preparedBytes), row21.sha256);
  const prepared = JSON.parse(preparedBytes);

  const first = await transaction.runFreshPrepared(prepared, OUTPUT);
  assert(transaction.isAuthenticFreshReceipt(first));
  assert.equal(first.schema, transaction.RECEIPT_SCHEMA);
  assert.deepEqual(first.sageComputedLiveStatuses, [1, 1, 1, 1, 1, 1]);
  assert.equal(first.acceptedPariStatusAsRuntimeInput, false);
  assert.deepEqual([first.probes, first.kczIncrements, first.kczRestorations],
    [6, 3, 1]);
  assert.deepEqual([first.finalKCZ, first.finalKCZ2], [3, 0]);
  assert.equal(first.publicationBeforeUnitReconstruction, true);
  assert.equal(first.coldReplayVerified, true);
  assert.deepEqual(first.mutationsRejected.map(row => row.name),
    ["custom-C1", "live-probe-status", "KCZ-restoration", "one-shot-KCZ2"]);
  assert.equal(first.correctnessOnly, true);
  assert.equal(first.timingClaim, false);
  assert.equal(first.generalAutomorphismClaim, false);
  assert.equal(first.failedProbeRetryClaim, false);

  // The existing selected-success fixture supplies only structural Vbase
  // ordering authority. It is not passed to the transaction and its branch
  // result/status fields are not runtime inputs.
  const fixtureBytes = fs.readFileSync(path.join(HERE,
    "honesty_success_fixture.json"));
  assert.equal(sha256(fixtureBytes), customFactor.STRUCTURAL_FIXTURE_SHA256);
  const fixture = JSON.parse(fixtureBytes);
  assert.deepEqual(first.envelope.payload.transcript.rows.map(row =>
    row.schedule.map(Number)), fixture.probeSchedule);
  assert.deepEqual(first.envelope.payload.transcript.rows.map(row =>
    row.idealSha256), fixture.probeIdeals.map(ideal =>
    customFactor.sha256(customFactor.canonicalBytes(ideal))));

  // A fresh second transaction has different ephemeral owners but must arrive
  // at exactly the same content-addressed publication without overwriting it.
  const second = await transaction.runFreshPrepared(prepared, OUTPUT);
  assert(transaction.isAuthenticFreshReceipt(second));
  assert.equal(second.honestyOwner.sha256, first.honestyOwner.sha256);
  assert.equal(second.payloadSha256, first.payloadSha256);
  assert.equal(second.transcriptSha256, first.transcriptSha256);
  assert.deepEqual(fs.readdirSync(OUTPUT).filter(name =>
    name.startsWith("row21-honesty-owner-")),
  [path.basename(first.honestyOwner.path)]);
  assert.equal(sha256(fs.readFileSync(first.honestyOwner.path)),
    first.honestyOwner.sha256);

  // The established performance-population path remains an equal-bound path.
  const defaultTransaction = fs.readFileSync(path.join(HERE,
    "row21_fresh_prepared_transaction.cjs"), "utf8");
  const defaultFactor = fs.readFileSync(path.join(HERE,
    "row21_factor_base_coordinator.cjs"), "utf8");
  assert.doesNotMatch(defaultTransaction,
    /row21_honesty|honesty_success|resident_honesty/);
  assert.match(defaultFactor, /kcz !== kcz2 \|\| kc !== kc2/);

  // A different frozen field is rejected by the prepared authentication gate
  // before it can publish any honesty owner.
  const other = index.files.find(row => row.panelIndex === 20);
  const wrongPrepared = JSON.parse(fs.readFileSync(path.join(CORPUS, other.filename)));
  await assert.rejects(
    transaction.runFreshPrepared(wrongPrepared, OUTPUT),
    /different prepared field|row21/,
  );

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row21-honesty-fresh-check-v1",
    pristinePari: { version: "2.17.4", archiveSha256: ARCHIVE_SHA256,
      buch2Sha256: BUCH2_SHA256, sourceCuts },
    panelIndex: 21,
    preparedAuthoritySha256: first.preparedAuthoritySha256,
    customFactorOwnerSha256: first.customFactorOwnerSha256,
    honestyOwnerSha256: first.honestyOwner.sha256,
    payloadSha256: first.payloadSha256,
    transcriptSha256: first.transcriptSha256,
    structuralFixtureSha256: customFactor.STRUCTURAL_FIXTURE_SHA256,
    sageComputedLiveStatuses: first.sageComputedLiveStatuses,
    acceptedPariStatusAsRuntimeInput: false,
    scheduler: { probes: first.probes, kczIncrements: first.kczIncrements,
      restorations: first.kczRestorations, finalKCZ: first.finalKCZ,
      finalKCZ2: first.finalKCZ2 },
    mutationsRejected: first.mutationsRejected,
    coldReplayVerified: true,
    atomicPublication: true,
    idempotentPublication: true,
    defaultEqualBoundTransactionPreserved: true,
    correctnessOnly: true,
    timingClaim: false,
    remainingFrontiers: ["automorphism-orbits", "failed-probe-retry"],
    outputDirectory: OUTPUT,
  })}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });

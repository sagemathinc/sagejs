#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const manifest = require("./fresh-prepared-corpus-manifest.json");
const pariBase = require("./row0_phase6_pari_prepared_adapter.cjs");

const CORPUS = process.env.SAGEJS_FRESH_PREPARED_CORPUS ||
  "/scratch/sagejs-pari-fresh-prepared-corpus-v1";
const MODULES = Object.freeze({
  0: Object.freeze({ host: "./row0_phase6_matched_kernel_host.cjs",
    pari: "./row0_phase6_pari_prepared_adapter.cjs",
    transaction: "./row0_fresh_prepared_execution.cjs" }),
  1: Object.freeze({ host: "./row1_phase6_matched_kernel_host.cjs",
    pari: "./row1_phase6_pari_prepared_adapter.cjs",
    transaction: "./row1_fresh_prepared_transaction.cjs" }),
  4: Object.freeze({ host: "./row4_phase6_matched_kernel_host.cjs",
    pari: "./row4_phase6_pari_prepared_adapter.cjs",
    transaction: "./row4_fresh_prepared_transaction.cjs" }),
});

function loadPrepared(row) {
  const record = manifest.rows.find(value => value.panelIndex === row);
  assert(record, `missing prepared manifest row ${row}`);
  const filename = path.join(CORPUS,
    `prepared-row-${String(row).padStart(2, "0")}-${record.preparedJsonSha256}.json`);
  const bytes = fs.readFileSync(filename);
  assert.equal(pariBase.ROWS[row].polynomialAscending.join(","),
    JSON.parse(bytes).prep_polynomial.join(","));
  return { filename, prepared: JSON.parse(bytes), record };
}

async function run(row, { freshCorrectness = true } = {}) {
  const modules = MODULES[row]; assert(modules, `unsupported matched row ${row}`);
  const host = require(modules.host), pari = require(modules.pari);
  const loaded = loadPrepared(row);

  // Keep reference acquisition out of the Sage clock and acquire it before
  // loading the large native graph.
  const client = row === 0
    ? new pariBase.HelperClient(0, pariBase.buildHelper(0))
    : new pari.HelperClient(pari.buildHelper());
  await client.ready();
  let pariSample;
  try { pariSample = await client.run("1"); } finally { await client.close(); }

  const resident = row === 1
    ? await host.prepareResident(1, loaded.prepared)
    : await host.prepareResident(loaded.prepared);
  const invocation = host.prepareInvocation(resident);
  const sageSample = host.runInvocation(resident, invocation);
  assert.match(sageSample.kernelNanoseconds, /^[1-9][0-9]*$/);
  assert.deepEqual(sageSample.projection, pariSample.projection,
    `row ${row} Sage/PARI common projection differs`);
  assert.equal(sageSample.executionBoundary.nativeCallsInsideClock, 1);
  for (const forbidden of ["subprocessesInsideClock", "filesystemInsideClock",
    "replayInsideClock", "publicationInsideClock"])
    assert.equal(sageSample.executionBoundary[forbidden], false);

  const mutation = structuredClone(sageSample.projection);
  mutation.classGroup.classNumber = String(BigInt(mutation.classGroup.classNumber) + 1n);
  assert.throws(() => pariBase.validateProjection(row, mutation));

  let fresh = null;
  if (freshCorrectness) {
    const transaction = require(modules.transaction);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(),
      `sagejs-row${row}-phase6-fresh-`));
    try {
      const receipt = await transaction.runFreshPrepared(loaded.prepared, directory);
      assert.equal(transaction.isAuthenticFreshReceipt(receipt), true);
      assert.equal(receipt.correspondenceComplete, true);
      assert.equal(receipt.publicComplete, false);
      assert.equal(receipt.qualifiedTiming, false);
      fresh = { resultSha256: receipt.sha256 || receipt.result.sha256,
        correspondenceComplete: true, publicComplete: false };
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }

  return {
    schema: `sagejs.pari-class-group/row${row}-phase6-matched-kernel-check-v1`,
    row, preparedAuthoritySha256: loaded.record.preparedAuthoritySha256,
    boundary: { input: "authenticated prepared nfinit state",
      output: "class invariants and flag-zero unit/regulator/torsion semantics",
      residentSageProcess: true, residentPariProcess: true,
      nonmathematicalWorkInsideClock: false },
    sageKernelNanoseconds: sageSample.kernelNanoseconds,
    pariKernelNanoseconds: pariSample.kernelNanoseconds,
    commonProjection: sageSample.projection,
    commonProjectionMatched: true, rejectedSemanticMutations: 1,
    freshCorrectness: fresh,
    qualifiedTiming: false, ratioPublished: false,
    reason: "single exact-boundary development check; no alternating quiet-host campaign",
  };
}

async function main(row = 0) {
  const receipt = await run(row, {
    freshCorrectness: !process.argv.includes("--skip-fresh-correctness"),
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

module.exports = { CORPUS, MODULES, loadPrepared, run };
if (require.main === module) main().catch(error => {
  console.error(error.stack || error); process.exitCode = 1;
});

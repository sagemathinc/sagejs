#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const auth = require("./prepared_nf_authentication.cjs");
const manifest = require("./fresh-prepared-corpus-manifest.json");
const pari = require("./row3_phase6_pari_prepared_adapter.cjs");

const record = manifest.rows.find(value => value.panelIndex === 3);
const corpus = process.env.SAGEJS_FRESH_PREPARED_CORPUS ||
  "/scratch/sagejs-pari-fresh-prepared-corpus-v1";
const filename = path.join(corpus,
  `prepared-row-03-${record.preparedJsonSha256}.json`);

async function main() {
  const prepared = JSON.parse(fs.readFileSync(filename));
  assert.equal(auth.authenticatePreparedNf(prepared).sha256,
    record.preparedAuthoritySha256);
  const hostSource = fs.readFileSync(path.join(__dirname,
    "row3_phase6_resident_kernel_host.cjs"), "utf8");
  const suffixSource = fs.readFileSync(path.join(__dirname,
    "row3_phase6_resident_unit_suffix.py"), "utf8");
  assert.match(hostSource, /resident\.unitFn\.gmp\(/,
    "row-3 resident compact-unit call disappeared");
  assert.match(hostSource, /rawUnitProvenance/,
    "row-3 resident raw provenance owner disappeared");
  assert.doesNotMatch(hostSource, /spawnSync|execFile|execSync/,
    "row-3 resident host gained a subprocess");
  assert.match(suffixSource, /_pari_reverse_hnffinal_selection\(/,
    "row-3 resident suffix no longer reverses HNF provenance");

  const client = new pari.HelperClient(pari.buildHelper());
  await client.ready();
  let sample;
  try { sample = await client.run("1"); } finally { await client.close(); }
  assert.deepEqual(sample.projection.classGroup,
    { classNumber: "6", invariantFactors: ["6"] });

  let fresh = null;
  if (process.argv.includes("--fresh-correctness")) {
    const transaction = require("./row3_fresh_prepared_transaction.cjs");
    const directory = fs.mkdtempSync(path.join(os.tmpdir(),
      "sagejs-row3-phase6-fresh-"));
    try {
      const receipt = await transaction.runFreshPrepared(prepared, directory);
      assert.equal(transaction.isAuthenticFreshReceipt(receipt), true);
      assert.equal(receipt.correspondenceComplete, true);
      assert.equal(receipt.publicComplete, false);
      fresh = { resultSha256: receipt.sha256,
        correspondenceComplete: true, publicComplete: false };
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row3-phase6-resident-boundary-gap-check-v1",
    preparedAuthoritySha256: record.preparedAuthoritySha256,
    pariKernelNanoseconds: sample.kernelNanoseconds,
    pariProjection: sample.projection,
    freshCorrectness: fresh,
    sageResidentClassCandidateKernelAvailable: true,
    sageResidentWholeClassUnitKernelAvailable: true,
    timingEligible: true, qualifiedTiming: false, ratioPublished: false,
    blockers: [],
  }, null, 2)}\n`);
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });

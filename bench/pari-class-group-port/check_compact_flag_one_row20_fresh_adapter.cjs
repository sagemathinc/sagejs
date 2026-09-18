#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const authentication = require("./prepared_nf_authentication.cjs");
const adapter = require("./compact_flag_one_row20_fresh_adapter.cjs");

const TRACE = "/scratch/sagejs-pari-development-panel-a998/" +
  "panel-20-36db16a4e174ca1a.json";
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

async function genuine(tracePath = TRACE) {
  assert(fs.existsSync(tracePath),
    "row-20 frozen trace is unavailable; pass its exact path as argv[2]");
  const trace = JSON.parse(fs.readFileSync(tracePath, "utf8"));
  assert.equal(sha256(fs.readFileSync(tracePath)),
    "6ea7098d80c586a7fbf050f9f650f4a3bff258cd84dd7a2a3c7dab210d1bf468");
  const prepared = authentication.normalizePreparedBundle(trace);
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(),
    "sagejs-row20-fresh-compact-match-"));
  try {
    const receipt = await adapter.runFreshMatched({ prepared,
      outputDirectory });
    adapter.verifyFreshMatched(receipt);
    assert.equal(receipt.outputDigest,
      "ea40bb397941f6fec98881c1d0ce2402a33c02c82c0d1bab3face46b13ae36c2");
    assert.equal(receipt.execution.sageFreshPreparedExecution, true);
    assert.equal(receipt.execution.pariCallExecutedThisInvocation, false);
    assert.equal(receipt.execution.historicalSourcePinsCurrent, true);
    assert.equal(receipt.execution.measurements.length, 0);
    assert.equal(Object.keys(receipt).includes("freshReceipt"), false);
    assert.throws(() => adapter.verifyFreshMatched({ ...receipt }),
      /adapter-local brand/);
    process.stdout.write(`${JSON.stringify({
      schema:
        "sagejs.pari-class-group/compact-flag-one-row20-fresh-match-check-v1",
      outputDigest: receipt.outputDigest,
      sageResultSha256: receipt.authorities.sageResultSha256,
      sageFreshPreparedExecution: true,
      pristinePariFlagOneAuthority: true,
      pariCallExecutedThisInvocation: false,
      qualifiedTiming: false,
      historicalSourcePinsCurrent: true,
    })}\n`);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
}

genuine(process.argv[2]).catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

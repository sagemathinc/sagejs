#!/usr/bin/env node
"use strict";
// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

// Repeated-fresh worker-protocol smoke only. Qualification execution and
// reserve opening remain disabled.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const core = require("./qualification_execution_core.cjs");
const pair = require("./row19_phase6_fresh_adapter.cjs");
const sage = require("./row19_phase6_sage_prepared_adapter.cjs");

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

async function main() {
  const output = process.argv[2] ||
    "/scratch/row19-phase6-unqualified-fresh-protocol-v1.json";
  const request = { boundary: "prepared-kernel", fieldId: sage.FIELD_ID,
    repetitions: 2, seed: "1", tier: "diagnostic" };
  const sageAdapter = await pair.createRow19FreshPreparedAdapter(
    { panelIndex: 19, implementation: "sagejs" });
  const pariAdapter = await pair.createRow19FreshPreparedAdapter(
    { panelIndex: 19, implementation: "pari" });
  const sageBatch = await core.executeFreshBatch(sageAdapter, request);
  const pariBatch = await core.executeFreshBatch(pariAdapter, request);
  for (const key of ["outputDigest", "replayDigest", "rngDigest", "workDigest"])
    assert.equal(sageBatch[key], pariBatch[key], `row-19 ${key} differs`);
  const report = {
    schema:
      "sagejs.pari-class-group/row19-phase6-unqualified-fresh-protocol-v1",
    qualifiedTiming: false, campaignExecuted: false, reservesOpened: false,
    request, sage: sageBatch, pari: pariBatch,
  };
  const bytes = Buffer.from(`${JSON.stringify(report)}\n`);
  fs.writeFileSync(output, bytes, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ output, sha256: sha256(bytes), report })}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

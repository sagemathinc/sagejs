"use strict";

// Row 18 is mathematically connected but not yet one compiled resident graph.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const authentication = require("./prepared_nf_authentication.cjs");

const DEFAULT_INPUT =
  "/scratch/sagejs-pari-fresh-prepared-corpus-v1/prepared-row-18-6d8bf8dae39c664783ebf105c6186cdfa7554b98693d512b16c3b294147c6cbc.json";
const EXPECTED = Object.freeze({
  authoritySha256: "2306e01429981dc6e956f10dd4c9528b157fbff76c1c137419e678a958de1dd0",
  transactionSha256: "d9c27606df25c856d6a8617089e652d9cba1a7520103fff8614be4ebdfeeeab9",
  pipelineSha256: "8c32ee255522dacae057230cade6366faaaf74a1f90e22b008f6031ee014a222",
});
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const source = name => fs.readFileSync(path.join(__dirname, name));

function inspect(inputPath = DEFAULT_INPUT) {
  const prepared = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const authority = authentication.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, EXPECTED.authoritySha256);
  assert.equal(sha(source("row18_fresh_prepared_transaction.cjs")), EXPECTED.transactionSha256);
  assert.equal(sha(source("row18_fresh_prepared_pipeline.py")), EXPECTED.pipelineSha256);
  const changed = structuredClone(prepared);
  changed.prep_polynomial[0] = String(BigInt(changed.prep_polynomial[0]) + 1n);
  assert.throws(() => authentication.authenticatePreparedNf(changed));
  const pipeline = source("row18_fresh_prepared_pipeline.py").toString("utf8");
  assert.match(pipeline, /initial_action = int\(pari_resident_generated_class_attempt\(\*\*initial\)\)/);
  assert.match(pipeline, /status = int\(pari_prepared_class_group_resumable\(\*\*arguments\)\)/);
  assert.match(pipeline, /state = copy\.deepcopy\(generated\)/);
  assert.match(pipeline, /inspect\.signature\(/);
  assert.doesNotMatch(pipeline, /@native\s+def run_fresh_row18/);
  return {
    schema: "sagejs.pari-class-group/row18-phase6-timing-blocker-v1",
    panelIndex: 18, fieldId: "3.1.1005907102200.3",
    preparedAuthoritySha256: authority.sha256,
    freshInputAuthenticated: true, changedPreparedAuthorityRejected: true,
    residentPreparedKernelTimingReady: false,
    currentMathematicalCalls: ["pari_resident_generated_class_attempt",
      "pari_prepared_class_group_resumable"],
    forbiddenCurrentClockWork: ["Python deepcopy", "runtime signature inspection",
      "dynamic owner graph construction", "dynamic class/unit composition"],
    sourceCut: [
      "replace _resumable_graph deepcopy/inspect construction with a typed resident transition",
      "compile a private aggregate root that directly calls the initial and resumable graphs",
      "retain all retry owners between calls and expose one inclusive resident root clock",
      "derive class/unit semantic projection from live output owners after the clock",
    ], sourceSha256: EXPECTED,
  };
}
if (require.main === module) process.stdout.write(`${JSON.stringify(inspect(process.argv[2]), null, 2)}\n`);
module.exports = { DEFAULT_INPUT, EXPECTED, inspect };

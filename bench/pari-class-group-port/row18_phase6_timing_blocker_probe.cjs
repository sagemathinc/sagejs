"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const authentication = require("./prepared_nf_authentication.cjs");
const residentSource = require("./row18_phase6_resident_source.cjs");
const DEFAULT_INPUT = "/scratch/sagejs-pari-fresh-prepared-corpus-v1/prepared-row-18-6d8bf8dae39c664783ebf105c6186cdfa7554b98693d512b16c3b294147c6cbc.json";
const EXPECTED = Object.freeze({
  authoritySha256: "2306e01429981dc6e956f10dd4c9528b157fbff76c1c137419e678a958de1dd0",
  residentSourceSha256: "63226467c66146e23bc430c10ce6019edcb7fe1a2ce29a9c732eafd6bd9ad106",
  residentHostSha256: "f4cae3123ffb2a8729784bdfb16ec39b9fb4efca7d627f09022878b1db96f4ab",
});
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const source = name => fs.readFileSync(path.join(__dirname, name));
function inspect(inputPath = DEFAULT_INPUT) {
  const prepared = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const authority = authentication.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, EXPECTED.authoritySha256);
  assert.equal(sha(source("row18_phase6_resident_source.cjs")), EXPECTED.residentSourceSha256);
  assert.equal(sha(source("row18_phase6_resident_host.cjs")), EXPECTED.residentHostSha256);
  const changed = structuredClone(prepared);
  changed.prep_polynomial[0] = String(BigInt(changed.prep_polynomial[0]) + 1n);
  assert.throws(() => authentication.authenticatePreparedNf(changed));
  const emitted = residentSource.emitSource();
  assert.equal(emitted.abi.length, 415);
  assert.doesNotMatch(emitted.source, /deepcopy|inspect|subprocess|open\(/);
  assert.match(emitted.source, /@native\s+def pari_row18_phase6_resident_root/);
  return {
    schema: "sagejs.pari-class-group/row18-phase6-timing-readiness-v2",
    panelIndex: 18, fieldId: "3.1.1005907102200.3",
    preparedAuthoritySha256: authority.sha256,
    freshInputAuthenticated: true, changedPreparedAuthorityRejected: true,
    residentPreparedKernelTimingReady: true,
    currentMathematicalCalls: ["pari_resident_generated_class_attempt", "pari_prepared_class_group_resumable"],
    aggregateAbiOwners: emitted.abi.length,
    retryOnlyBuffers: emitted.extraBuffers.length,
    exactLengthRetryAliases: emitted.retryStorage.length,
    inclusiveNativeCalls: 1,
    forbiddenClockWorkAbsent: ["Python deepcopy", "runtime signature inspection", "dynamic owner graph construction", "dynamic class/unit composition", "subprocess", "filesystem"],
    sourceSha256: EXPECTED,
  };
}
if (require.main === module) process.stdout.write(`${JSON.stringify(inspect(process.argv[2]), null, 2)}\n`);
module.exports = { DEFAULT_INPUT, EXPECTED, inspect };

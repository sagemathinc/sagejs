"use strict";

// Row 19's current correctness path deliberately crosses serialized owners.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const authentication = require("./prepared_nf_authentication.cjs");

const DEFAULT_INPUT =
  "/scratch/sagejs-pari-fresh-prepared-corpus-v1/prepared-row-19-ca58db0bc082112bf2922e3f5f4cf99fbaad71825a5650f6c32a29b3b8db6cdf.json";
const EXPECTED = Object.freeze({
  authoritySha256: "1b3e3f6f97701556492edfe8576bf1337537096bb4d5eda357d7f92fc2fa5c35",
  transactionSha256: "2d96234bd3a694fc152ecef3ff2309f05f0f79e6b3a20642b753b58414bafdca",
  classCoordinatorSha256: "1cbda0cb0ea21d2ba65f311752bae762ffb372652a904e50d75e883da062cff5",
  compactUnitCoordinatorSha256: "46740daa713a09fa827d8187c87c07a5732d65595efa4fb839a0217dea034974",
  unitCoordinatorSha256: "dc135ffdd504f2012945ebf5434c0cab4d48f268f6b0d26d5c499b7033cadc23",
  finalCoordinatorSha256: "58ce9efebe448739e2f9406d5754907870628b5def9b8eba28ac9f04289f75d7",
  terminalHostSha256: "802d86e73bae4f8dbc9a173dda4ee28a7981de55047cd6ae0c68d006da1ce833",
  residentRelationRootSha256: "c4a53031501b7c33706dedee98c56eb9ab2650401b236f578fac9b6647859ee0",
});
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const source = name => fs.readFileSync(path.join(__dirname, name));

function inspect(inputPath = DEFAULT_INPUT) {
  const prepared = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const authority = authentication.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, EXPECTED.authoritySha256);
  const files = {
    transactionSha256: "row19_fresh_prepared_transaction.cjs",
    classCoordinatorSha256: "row19_class_group_principal_coordinator.cjs",
    compactUnitCoordinatorSha256: "row19_live_rank1_unit_coordinator.cjs",
    unitCoordinatorSha256: "row19_live_unit_result_coordinator.cjs",
    finalCoordinatorSha256: "row19_final_result_coordinator.cjs",
    terminalHostSha256: "row19_terminal_continuation_host.cjs",
    residentRelationRootSha256: "row19_phase6_resident_relation_root.cjs",
  };
  for (const [key, filename] of Object.entries(files))
    assert.equal(sha(source(filename)), EXPECTED[key], `${filename} changed`);
  const changed = structuredClone(prepared);
  changed.prep_polynomial[0] = String(BigInt(changed.prep_polynomial[0]) + 1n);
  assert.throws(() => authentication.authenticatePreparedNf(changed));
  const transaction = source(files.transactionSha256).toString("utf8");
  assert.match(transaction, /spawnSync\("python3"/);
  assert.match(transaction, /fs\.mkdtempSync\(/);
  assert.match(transaction, /writePrivateOwner\(/);
  for (const filename of Object.values(files).slice(1, 5)) {
    const text = source(filename).toString("utf8");
    assert.match(text, /spawnSync\("python3"/);
    assert.match(text, /fs\.readFileSync\(/);
  }
  const resident = source(files.residentRelationRootSha256).toString("utf8");
  assert.match(resident, /runTerminalContinuationLive\(/);
  assert.match(resident, /serializedOwnersInsideRoot: 0/);
  return {
    schema: "sagejs.pari-class-group/row19-phase6-timing-blocker-v1",
    panelIndex: 19, fieldId: "3.1.1086061775432017340256300.107",
    preparedAuthoritySha256: authority.sha256,
    freshInputAuthenticated: true, changedPreparedAuthorityRejected: true,
    residentPreparedKernelTimingReady: false,
    residentRelationKernelReady: true,
    residentRelationKernelStages: 6,
    forbiddenCurrentClockWork: ["multiple Python subprocesses",
      "temporary compressed owner publication", "owner rereads and authentication",
      "detached class/unit/final composition"],
    sourceCut: [
      "lower the prepared factor-base and analytic prefixes into the resident native graph",
      "port the class-principal, compact-unit and exact-unit coordinators to callable native roots",
      "connect those roots to the live terminal relation owner without gzip descriptors",
      "eliminate residual native-artifact cache lookup from the resident relation clock",
    ], sourceSha256: EXPECTED,
  };
}
if (require.main === module) process.stdout.write(`${JSON.stringify(inspect(process.argv[2]), null, 2)}\n`);
module.exports = { DEFAULT_INPUT, EXPECTED, inspect };

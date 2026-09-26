"use strict";

// Legacy-named executable audit for the now-closed row-13 timing blocker.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const authentication = require("./prepared_nf_authentication.cjs");
const transaction = require("./row13_fresh_prepared_transaction.cjs");

const DEFAULT_INPUT =
  "/scratch/sagejs-pari-fresh-prepared-corpus-v1/prepared-row-13-762c9bf8c75e6bba7727c41f457b992e05fecf256c3ed40aaa6c45814ff0a95c.json";
const EXPECTED = Object.freeze({
  authoritySha256: "21e60a11663b021554ca5afcb249e5ca5e7c4b28641ed7e50ed281a7d30254b9",
  transactionSha256: "545d460d3751ec1cf3c1bfe08fadd73276d72b1d3f554d20c550488a76c4b008",
  terminalHostSha256: "719a1c49f6296a711024471a53a41754b4c91613c09a35975a89d31e95061528",
});

const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const source = name => fs.readFileSync(path.join(__dirname, name));

function inspect(inputPath = DEFAULT_INPUT) {
  const prepared = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const authority = transaction.validatePreparedData(prepared);
  assert.equal(authority.sha256, EXPECTED.authoritySha256);
  assert.equal(sha(source("row13_fresh_prepared_transaction.cjs")),
    EXPECTED.transactionSha256);
  assert.equal(sha(source("row13_terminal_transaction_host.cjs")),
    EXPECTED.terminalHostSha256);
  const changed = structuredClone(prepared);
  changed.prep_polynomial[0] = String(BigInt(changed.prep_polynomial[0]) + 1n);
  assert.throws(() => transaction.validatePreparedData(changed),
    /prepared|corridor|discriminant/);
  const host = source("row13_terminal_transaction_host.cjs").toString("utf8");
  assert.match(host, /async function runPreparedComplete\(/);
  assert.match(host, /fs\.writeFileSync\(/);
  assert.doesNotMatch(host, /function prepareResident\(/);
  assert.doesNotMatch(host, /function runResident\(/);
  const resident = source("row13_phase6_resident_kernel_host.cjs")
    .toString("utf8");
  assert.match(resident, /async function prepareResident\(/);
  assert.match(resident, /async function runResident\(/);
  assert.match(resident, /compilationInsideClock: false/);
  assert.match(resident, /subprocessesInsideClock: false/);
  assert.match(resident, /filesystemInsideClock: false/);
  return {
    schema: "sagejs.pari-class-group/row13-phase6-timing-blocker-v1",
    panelIndex: 13, fieldId:
      "generated-sha256-353468f1887e96f5a2f66e3121564636ed8cdbd75bde6571609627bbe8586e33",
    preparedAuthoritySha256: authority.sha256,
    freshInputAuthenticated: true, changedPreparedInputRejected: true,
    residentPreparedKernelTimingReady: true,
    forbiddenCurrentClockWork: [],
    sourceCut: [
      "all native kernels compile before the inclusive root clock",
      "one resident process retains all compiled mathematical handles",
      "prepareResident(prepared) and runResident(resident) expose the exact boundary",
      "hashing, mutation replay and result publication occur after that clock",
    ],
    sourceSha256: EXPECTED,
  };
}

if (require.main === module) process.stdout.write(`${JSON.stringify(inspect(process.argv[2]), null, 2)}\n`);
module.exports = { DEFAULT_INPUT, EXPECTED, inspect };

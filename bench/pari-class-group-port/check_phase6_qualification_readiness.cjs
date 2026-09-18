#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const readiness = require("./phase6_qualification_readiness.cjs");

assert.deepEqual(readiness.parseCpuList("0,2-4,4"), [0, 2, 3, 4]);
assert.throws(() => readiness.parseCpuList("4-2"));
assert.deepEqual(readiness.DEVELOPMENT_INDICES,
  [0, 1, 3, 4, 6, 8, 10, 11, 13, 14, 16, 18, 19, 20, 21, 23]);
const inventory = readiness.timingInventory();
assert.deepEqual(inventory.matchedReady, []);
assert.deepEqual(inventory.missingMatchedTiming, readiness.DEVELOPMENT_INDICES);
const adapterInventory = require("./phase6_prepared_adapter_registry.cjs")
  .inventory();
assert.deepEqual(adapterInventory.rows, []);
assert.deepEqual(adapterInventory.diagnosticRows.map(row => row.panelIndex),
  [0, 1, 3, 4, 8, 10, 11, 14, 16, 18, 19, 20, 23]);
assert(adapterInventory.diagnosticRows.every(row =>
  row.matchedReady === false && row.missingCapabilities.length === 12));
const pari = readiness.authenticatePari();
assert.equal(pari.authenticated, true);
assert.deepEqual(pari.hashes, {
  archiveSha256: readiness.EXPECTED_PARI.archiveSha256,
  buch2Sha256: readiness.EXPECTED_PARI.buch2Sha256,
  librarySha256: readiness.EXPECTED_PARI.librarySha256,
});

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "phase6-readiness-"));
try {
  const fakeRoot = path.join(temporary, "pari");
  fs.mkdirSync(fakeRoot);
  const missing = readiness.authenticatePari(fakeRoot,
    path.join(temporary, "missing.tar.gz"));
  assert.equal(missing.authenticated, false);
  assert.deepEqual(missing.missing.sort(), ["archive", "buch2", "executable", "library"]);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

let aggregateAuthenticated = null;
if (process.argv.length === 4) {
  const report = readiness.auditReadiness({
    corpusDirectory: process.argv[2], aggregateReceipt: process.argv[3],
  });
  assert.equal(report.correctness.completedDevelopmentFields, 16);
  assert.equal(report.correctness.developmentAggregateAuthenticated, true);
  assert.deepEqual(report.timing.matchedDevelopmentRows, []);
  assert.deepEqual(report.timing.missingDevelopmentRows,
    readiness.DEVELOPMENT_INDICES);
  assert.equal(report.timing.row14CampaignPhase6Qualified, false);
  assert.equal(report.reserves.opened, 0);
  assert.equal(report.fullQualificationReady, false);
  assert(report.blockers.length >= 4);
  aggregateAuthenticated = true;
}

process.stdout.write(`${JSON.stringify({
  schema: "sagejs.pari-class-group/phase6-qualification-readiness-check-v2",
  pariAuthenticated: pari.authenticated,
  developmentRows: readiness.DEVELOPMENT_INDICES.length,
  matchedTimingRows: inventory.matchedReady,
  missingTimingRows: inventory.missingMatchedTiming,
  diagnosticAdapterRows: adapterInventory.diagnosticRows.map(row => ({
    panelIndex: row.panelIndex,
    missingCapabilities: row.missingCapabilities,
  })),
  aggregateAuthenticated,
  longCampaignExecuted: false,
  reservesOpened: 0,
}, null, 2)}\n`);

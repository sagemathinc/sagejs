#!/usr/bin/env node
"use strict";

// Export the frozen 16-field development population through the pristine
// PARI 2.17.4 default driver. This is an untimed diagnostic capture: it never
// opens reserve rows and it cannot enable qualification execution.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const checkerRelative = "bench/pari-class-group-port/check_default_driver_trace.cjs";
const panelRelative = "bench/pari-class-group-port/panel.json";
const qualificationRelative = "bench/pari-class-group-port/class-unit-qualification-manifest.json";
const checker = path.join(root, checkerRelative);
const panelPath = path.join(root, panelRelative);
const qualificationPath = path.join(root, qualificationRelative);
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

function failUsage() {
  throw new Error("usage: export_pari_development_panel.cjs PARI_ROOT PARI_ARCHIVE --output=/scratch/DIRECTORY [--manifest=PATH]");
}

const pari = process.argv[2] && path.resolve(process.argv[2]);
const archive = process.argv[3] && path.resolve(process.argv[3]);
const outputOption = process.argv.find(value => value.startsWith("--output="));
const manifestOption = process.argv.find(value => value.startsWith("--manifest="));
if (!pari || !archive || !outputOption) failUsage();
const outputDirectory = path.resolve(outputOption.slice("--output=".length));
assert(outputDirectory === "/scratch" || outputDirectory.startsWith("/scratch/"),
  "Bulky diagnostic payloads must be written under /scratch");
const manifestPath = manifestOption
  ? path.resolve(manifestOption.slice("--manifest=".length))
  : path.join(outputDirectory, "manifest.json");
assert(!process.argv.includes("--qualify"), "Qualification execution is disabled for this exporter");

const panelBytes = fs.readFileSync(panelPath);
const qualificationBytes = fs.readFileSync(qualificationPath);
const checkerBytes = fs.readFileSync(checker);
const panel = JSON.parse(panelBytes);
const qualification = JSON.parse(qualificationBytes);
assert.equal(panel.target_pari_version, "2.17.4");
assert.equal(qualification.targetPariVersion, "2.17.4");
assert.equal(qualification.executionEnabled, false);
assert.equal(qualification.reserveOpeningEnabled, false);
assert.equal(sha256(fs.readFileSync(archive)), "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53");

const development = panel.rows
  .map((row, panelIndex) => ({ row, panelIndex }))
  .filter(({ row }) => row.phase === "tuning");
assert.equal(development.length, 16);
assert.equal(panel.rows.filter(row => row.phase === "final-reserve").length, 8);
assert.deepEqual(development.map(entry => entry.panelIndex),
  [0, 1, 3, 4, 6, 8, 10, 11, 13, 14, 16, 18, 19, 20, 21, 23]);

fs.mkdirSync(outputDirectory, { recursive: true });
const records = [];
for (const { row, panelIndex } of development) {
  process.stderr.write(`exporting development panel row ${panelIndex}: ${row.id}\n`);
  const execution = spawnSync(process.execPath,
    [checker, pari, archive, `--panel-index=${panelIndex}`], {
      encoding: "utf8",
      timeout: 20 * 60 * 1000,
      maxBuffer: 1024 * 1024 * 1024,
    });
  assert.equal(execution.status, 0,
    `panel row ${panelIndex} failed: ${execution.stderr || String(execution.error)}`);
  const receipt = JSON.parse(execution.stdout);
  assert.equal(receipt.diagnosticOnly, true);
  assert.equal(receipt.qualificationExecutionEnabled, false);
  assert.equal(receipt.panelIndex, panelIndex);
  assert.equal(receipt.fieldId, row.id);
  assert.equal(typeof receipt.payloadPath, "string");
  assert.equal(typeof receipt.payloadSha256, "string");
  assert.equal(receipt.eventCounts.prepared, 1);
  assert.equal(receipt.eventCounts.result, 1);
  const filename = `panel-${String(panelIndex).padStart(2, "0")}-${row.polynomial_sha256.slice(0, 16)}.json`;
  const destination = path.join(outputDirectory, filename);
  fs.copyFileSync(receipt.payloadPath, destination);
  const payloadBytes = fs.readFileSync(destination);
  assert.equal(payloadBytes.length, receipt.payloadBytes);
  assert.equal(sha256(payloadBytes), receipt.payloadSha256);
  records.push({
    panelIndex,
    id: row.id,
    filename,
    bytes: payloadBytes.length,
    sha256: receipt.payloadSha256,
    preparedSha256: receipt.preparedSha256,
    eventsSha256: receipt.eventsSha256,
    terminalResultSha256: receipt.terminalResultSha256,
    eventCount: receipt.eventCount,
    eventCounts: receipt.eventCounts,
    decisionSummary: receipt.decisionSummary,
  });
}

assert.deepEqual(records.map(record => record.panelIndex), development.map(entry => entry.panelIndex));
const manifest = {
  schema: "sagejs.pari-class-group/development-default-driver-manifest-v1",
  diagnosticOnly: true,
  qualificationExecutionEnabled: false,
  reserveOpened: false,
  panelOrder: true,
  sources: {
    panel: { path: panelRelative, sha256: sha256(panelBytes) },
    qualification: { path: qualificationRelative, sha256: sha256(qualificationBytes) },
    checker: { path: checkerRelative, sha256: sha256(checkerBytes) },
    pari: {
      version: "2.17.4",
      archiveSha256: "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
      buch2Path: "pari-2.17.4/src/basemath/buch2.c",
      buch2Sha256: "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac",
    },
  },
  policy: {
    selectedPhase: "tuning",
    expectedRows: 16,
    forbiddenPhase: "final-reserve",
    answerDerivedRuntimeFields: false,
    payloadStorage: "external /scratch artifacts authenticated by this compact manifest",
  },
  records,
};
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  ok: true,
  manifestPath,
  manifestSha256: sha256(fs.readFileSync(manifestPath)),
  developmentRows: records.length,
  reserveRowsOpened: 0,
  totalPayloadBytes: records.reduce((sum, record) => sum + record.bytes, 0),
  qualificationExecutionEnabled: false,
}));

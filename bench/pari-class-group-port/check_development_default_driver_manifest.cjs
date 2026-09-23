#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const manifestPath = path.join(__dirname, "development-default-driver-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath));
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const fileHash = relative => sha256(fs.readFileSync(path.join(root, relative)));

assert.equal(manifest.schema, "sagejs.pari-class-group/development-default-driver-manifest-v1");
assert.equal(manifest.diagnosticOnly, true);
assert.equal(manifest.qualificationExecutionEnabled, false);
assert.equal(manifest.reserveOpened, false);
assert.equal(manifest.panelOrder, true);
assert.deepEqual(manifest.sources.pari, {
  version: "2.17.4",
  archiveSha256: "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
  buch2Path: "pari-2.17.4/src/basemath/buch2.c",
  buch2Sha256: "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac",
});
for (const source of [manifest.sources.panel, manifest.sources.qualification, manifest.sources.checker])
  assert.equal(fileHash(source.path), source.sha256, `source drift: ${source.path}`);

const panel = JSON.parse(fs.readFileSync(path.join(root, manifest.sources.panel.path)));
const qualification = JSON.parse(fs.readFileSync(path.join(root, manifest.sources.qualification.path)));
assert.equal(qualification.executionEnabled, false);
assert.equal(qualification.reserveOpeningEnabled, false);
assert.deepEqual(manifest.policy, {
  selectedPhase: "tuning",
  expectedRows: 16,
  forbiddenPhase: "final-reserve",
  answerDerivedRuntimeFields: false,
  payloadStorage: "external /scratch artifacts authenticated by this compact manifest",
});
const development = panel.rows.map((row, panelIndex) => ({ row, panelIndex }))
  .filter(({ row }) => row.phase === "tuning");
const reserves = new Set(panel.rows.filter(row => row.phase === "final-reserve").map(row => row.id));
assert.equal(development.length, 16);
assert.equal(manifest.records.length, 16);
assert.deepEqual(manifest.records.map(record => record.panelIndex),
  development.map(entry => entry.panelIndex));
assert.deepEqual(manifest.records.map(record => record.id), development.map(entry => entry.row.id));
assert.equal(new Set(manifest.records.map(record => record.id)).size, 16);
assert(!manifest.records.some(record => reserves.has(record.id)), "reserve identity was opened");

const requiredEvents = ["prepared", "factor_base", "initialized", "ideal_probe",
  "relation_candidate", "hnf", "regulator_multiple", "acceptance",
  "fundamental_units", "class_group_input", "class_group_output", "final_state", "result"];
for (const record of manifest.records) {
  assert.match(record.filename, new RegExp(`^panel-${String(record.panelIndex).padStart(2, "0")}-[0-9a-f]{16}\\.json$`));
  assert(Number.isSafeInteger(record.bytes) && record.bytes > 0);
  for (const key of ["sha256", "preparedSha256", "eventsSha256", "terminalResultSha256"])
    assert.match(record[key], /^[0-9a-f]{64}$/);
  assert.equal(Object.values(record.eventCounts).reduce((sum, count) => sum + count, 0), record.eventCount);
  for (const event of requiredEvents) assert(record.eventCounts[event] > 0,
    `panel row ${record.panelIndex} lacks ${event}`);
  assert.equal(record.eventCounts.prepared, 1);
  assert.equal(record.eventCounts.result, 1);
  assert(record.decisionSummary.factorBaseAttempts.length >= 1);
  assert(record.decisionSummary.driverPrecisions.length >= 1);
  assert(record.decisionSummary.acceptanceCodes.length >= 1);
  assert.equal(record.decisionSummary.naturalRandomRelationPasses,
    record.eventCounts.random_relations || 0);
  assert.deepEqual(record.decisionSummary.honestyExtraRequired, [false]);
}

function assertTypedCell(cell) {
  assert(cell && typeof cell === "object" && !Array.isArray(cell));
  if (cell.kind === "integer") assert.match(cell.value, /^-?\d+$/);
  else if (cell.kind === "real") {
    assert.match(cell.mantissa, /^-?\d+$/);
    assert(Number.isSafeInteger(cell.precision));
    assert(Number.isSafeInteger(cell.exponent));
  } else if (cell.kind === "complex") {
    assertTypedCell(cell.real); assertTypedCell(cell.imag);
  } else assert.fail(`unexpected prepared scalar kind: ${cell.kind}`);
}

const payloadOption = process.argv.find(value => value.startsWith("--payload-root="));
let payloadsVerified = 0;
if (payloadOption) {
  const payloadRoot = path.resolve(payloadOption.slice("--payload-root=".length));
  for (const [position, record] of manifest.records.entries()) {
    const filename = path.join(payloadRoot, record.filename);
    const bytes = fs.readFileSync(filename);
    assert.equal(bytes.length, record.bytes);
    assert.equal(sha256(bytes), record.sha256);
    const payload = JSON.parse(bytes);
    const { row, panelIndex } = development[position];
    assert.equal(payload.schema, "sagejs.pari-class-group/development-default-driver-trace-v1");
    assert.equal(payload.diagnosticOnly, true);
    assert.equal(payload.qualificationExecutionEnabled, false);
    assert.equal(payload.reserveOpened, false);
    assert.equal(payload.field.panelIndex, panelIndex);
    assert.equal(payload.field.id, row.id);
    assert.deepEqual(payload.field.coefficients, row.coefficients);
    assert(!Object.keys(payload.field).some(key => /reference|historical|classNumber|regulator/i.test(key)));
    const prepared = payload.prepared;
    const n = row.degree;
    assert.equal(prepared.event, "prepared");
    assert.equal(prepared.degree, n);
    assert.deepEqual(prepared.signature, row.signature);
    assert.deepEqual(prepared.polynomial, row.coefficients);
    assert.equal(prepared.factorLimit, 1048576);
    assert.equal(prepared.primeLimit, 65537);
    assert.equal(prepared.zk.length, n * n);
    assert.equal(prepared.invzk.length, n * n);
    assert.equal(prepared.zkDegrees.length, n);
    assert.equal(prepared.multiplicationTensor.length, n * n * n);
    assert.equal(prepared.embeddingM.length, n * n);
    assert.equal(prepared.embeddingG.length, n * n);
    assert.equal(prepared.roundedEmbedding.length, n * n);
    prepared.invzk.forEach(assertTypedCell);
    prepared.embeddingM.forEach(assertTypedCell);
    prepared.embeddingG.forEach(assertTypedCell);
    prepared.roundedEmbedding.forEach(assertTypedCell);
    assert.equal(sha256(JSON.stringify(prepared)), record.preparedSha256);
    assert.equal(sha256(JSON.stringify(payload.events)), record.eventsSha256);
    assert.equal(sha256(JSON.stringify(payload.events.at(-1))), record.terminalResultSha256);
    assert.equal(payload.events.length, record.eventCount);
    assert.deepEqual(payload.events[0], prepared);
    assert.equal(payload.events.at(-1).event, "result");
    payloadsVerified += 1;
  }
}

console.log(JSON.stringify({
  ok: true,
  manifestSha256: sha256(fs.readFileSync(manifestPath)),
  developmentRows: manifest.records.length,
  reserveRowsOpened: 0,
  payloadsVerified,
  totalPayloadBytes: manifest.records.reduce((sum, record) => sum + record.bytes, 0),
  qualificationExecutionEnabled: false,
}));

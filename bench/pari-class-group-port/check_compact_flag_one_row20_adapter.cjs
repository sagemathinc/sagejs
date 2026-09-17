#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const adapter = require("./compact_flag_one_row20_adapter.cjs");

const ROOT = path.resolve(__dirname, "../..");
const PROGRAM = path.join(__dirname, "compact_flag_one_row20_adapter.cjs");
const AUTHORITY = "/scratch/sagejs-runtime/pari-class-group-e2e-20260917/row20-authority";
const C6 = path.join(AUTHORITY,
  "row20-successful-c6-5449d3812514fa9aad06364e6b5ba0c18d10ee66225d0baa4fc5ea7d39f7ea1d.json");
const C7 = path.join(AUTHORITY,
  "row20-c7-class-unit-3d0b7e2fdb43e70a9f6e6be4c50c50ca6d5e4414e05812b58f6ce049b3496052.json");
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-20-36db16a4e174ca1a.json";

function args(c6 = C6, c7 = C7, w0 = W0) {
  return [PROGRAM, "--c6-owner", c6, "--c7-envelope", c7, "--pristine-w0", w0];
}

const manifest = adapter.validateManifest();
assert.equal(manifest.fields.length, 12);
assert.deepEqual(manifest.fields.map(field => field.panelIndex),
  [3, 4, 6, 10, 11, 13, 16, 18, 19, 20, 21, 23]);
assert.equal(manifest.execution.enabled, false);
assert.equal(manifest.execution.timingEnabled, false);
assert.equal(manifest.execution.finalRunEnabled, false);
assert.equal(manifest.execution.reserveOpeningEnabled, false);

const direct = adapter.prepareRow20({ c6Owner: C6, c7Envelope: C7, pristineW0: W0 });
assert.equal(direct.outputDigest, manifest.commonOutput.row20Sha256);
assert.deepEqual(direct.output, {
  schema: adapter.COMMON_SCHEMA,
  field: { id: "5.1.1000000.1",
    definingPolynomialAscending: ["-12", "-5", "0", "0", "0", "1"] },
  classGroup: { classNumber: "1", invariantFactors: [] },
  unitGroup: { rank: "2", torsionOrder: "2", materialization: "exact_units" },
});
assert.deepEqual(direct.timing, { eagerExpansionExecuted: false, measurements: [] });
assert.equal(direct.qualifiedTiming, false);
assert.equal(direct.executionEnabled, false);

const run = spawnSync(process.execPath, args(), { cwd: ROOT, encoding: "utf8", timeout: 30_000,
  maxBuffer: 4 * 1024 * 1024 });
assert.equal(run.status, 0, run.stderr);
assert.deepEqual(JSON.parse(run.stdout), direct);

const prohibited = spawnSync(process.execPath, [...args(), "--run", "true"], {
  cwd: ROOT, encoding: "utf8", timeout: 30_000,
});
assert.notEqual(prohibited.status, 0);
assert.match(prohibited.stderr, /required arguments/);

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-compact-flag-one-row20-"));
try {
  const changedW0 = path.join(temporary, "changed-w0.json");
  fs.writeFileSync(changedW0, Buffer.concat([fs.readFileSync(W0), Buffer.from("\n")]));
  assert.throws(() => adapter.prepareRow20({ c6Owner: C6, c7Envelope: C7,
    pristineW0: changedW0 }), /pristine W0 digest changed/);

  const changedC6 = path.join(temporary, "changed-c6.json");
  const c6Value = JSON.parse(fs.readFileSync(C6));
  c6Value.exactUnitBasis[0] = "8";
  fs.writeFileSync(changedC6, `${JSON.stringify(c6Value)}\n`, { mode: 0o444 });
  assert.throws(() => adapter.prepareRow20({ c6Owner: changedC6, c7Envelope: C7,
    pristineW0: W0 }), /C6 owner digest changed/);

  const mutableC7 = path.join(temporary, "mutable-c7.json");
  fs.copyFileSync(C7, mutableC7);
  fs.chmodSync(mutableC7, 0o644);
  assert.throws(() => adapter.prepareRow20({ c6Owner: C6, c7Envelope: mutableC7,
    pristineW0: W0 }), /C7 envelope is not immutable mode-0444/);

  const changedC7 = path.join(temporary, "changed-c7.json");
  const c7Value = JSON.parse(fs.readFileSync(C7));
  c7Value.payload.classGroup.classNumber = "2";
  fs.writeFileSync(changedC7, adapter.canonicalBytes(c7Value), { mode: 0o444 });
  assert.throws(() => adapter.prepareRow20({ c6Owner: C6, c7Envelope: changedC7,
    pristineW0: W0 }), /C7 envelope digest changed/);

  const changedManifest = path.join(temporary, "manifest.json");
  const manifestValue = structuredClone(manifest);
  manifestValue.execution.enabled = true;
  fs.writeFileSync(changedManifest, JSON.stringify(manifestValue));
  assert.throws(() => adapter.prepareRow20({ manifestPath: changedManifest, c6Owner: C6,
    c7Envelope: C7, pristineW0: W0 }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({ schema: "sagejs.pari-class-group/compact-flag-one-row20-check-v1",
  compactRows: manifest.fields.length, fieldId: direct.fieldId, outputDigest: direct.outputDigest,
  authenticC6C7: true, eagerExpansionExecuted: false, qualifiedTiming: false,
  finalRunEnabled: false, reserveOpeningEnabled: false, mutationsRejected: 5 })}\n`);

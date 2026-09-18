#!/usr/bin/env node
"use strict";

// Development-only protocol smoke for the five generic PARI adapter pairs.
// This cannot enable qualification, open reserves, or publish timing claims.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");

const worker = require("./qualification_arm_worker.cjs");
const registry = require("./phase6_prepared_adapter_registry.cjs");

const ROWS = Object.freeze([8, 10, 11, 18, 20]);

async function arm(registration, implementation) {
  return worker.executeRequest({
    schema: worker.REQUEST_SCHEMA,
    action: "measure-arm",
    requestNonce: crypto.randomBytes(16).toString("hex"),
    descriptor: registration.adapters[implementation],
    measurement: { boundary: "prepared-kernel",
      fieldId: registration.fieldId, repetitions: 1, seed: "1",
      tier: "diagnostic" },
  });
}

async function main(argv = process.argv.slice(2)) {
  assert(argv.length === 1 || argv.length === 2,
    "usage: check_phase6_generic_pari_wave_smoke.cjs OUTPUT.json [ROWS]");
  const selected = argv.length === 1 ? ROWS : argv[1].split(",").map(Number);
  assert(selected.length > 0 && selected.every(row => ROWS.includes(row)));
  assert.equal(new Set(selected).size, selected.length);
  const rows = [];
  for (const panelIndex of selected) {
    const registration = registry.preparedAdapterRegistration(panelIndex);
    const sagejs = await arm(registration, "sagejs");
    const pari = await arm(registration, "pari");
    for (const digest of ["outputDigest", "replayDigest", "rngDigest",
      "workDigest"])
      assert.equal(sagejs.batch[digest], pari.batch[digest],
        `row ${panelIndex} differs in ${digest}`);
    rows.push({ panelIndex, fieldId: registration.fieldId,
      projectionSchema: registration.projectionSchema,
      sagejs: sagejs.batch, pari: pari.batch });
  }
  const receipt = {
    schema: "sagejs.pari-class-group/generic-phase6-unqualified-protocol-smoke-v1",
    qualifiedTiming: false,
    executionEnabled: false,
    reserveOpeningEnabled: false,
    rows,
    note: "Diagnostic clocks are recorded only to prove protocol shape; they are not qualification or performance evidence.",
  };
  fs.writeFileSync(argv[0], `${JSON.stringify(receipt, null, 2)}\n`,
    { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ output: argv[0], rows: selected,
    exactSymmetricProjection: true, qualifiedTiming: false })}\n`);
}

module.exports = { ROWS, arm, main };

if (require.main === module)
  main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });

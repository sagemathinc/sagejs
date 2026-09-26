#!/usr/bin/env node
"use strict";

// Retired v1 protocol smoke. The former implementation launched both arms and
// compared shallow projections, cloned replay, and static work metadata. Those
// are not matched-state evidence. Keep this entry point only as an explicit
// fail-closed diagnostic so historical commands cannot launch mathematical work.

const assert = require("node:assert/strict");

const registry = require("./phase6_prepared_adapter_registry.cjs");

const ROWS = Object.freeze([8, 10, 11, 18, 20]);

function retiredDiagnostic(selected) {
  const byRow = new Map(registry.inventory().diagnosticRows.map(row =>
    [row.panelIndex, row]));
  return Object.freeze(selected.map(panelIndex => Object.freeze({
    panelIndex,
    status: byRow.get(panelIndex)?.status || "not-in-central-inventory",
    missingCapabilities: byRow.get(panelIndex)?.missingCapabilities ||
      [...registry.REQUIRED_CAPABILITIES],
  })));
}

async function main(argv = process.argv.slice(2)) {
  assert(argv.length === 1 || argv.length === 2,
    "usage: check_phase6_generic_pari_wave_smoke.cjs OUTPUT.json [ROWS]");
  const selected = argv.length === 1 ? ROWS : argv[1].split(",").map(Number);
  assert(selected.length > 0 && selected.every(row => ROWS.includes(row)));
  assert.equal(new Set(selected).size, selected.length);
  const rows = retiredDiagnostic(selected);
  throw new Error("retired shallow Phase 6 generic-PARI smoke cannot launch " +
    `mathematical arms; v2 admission is required: ${JSON.stringify(rows)}`);
}

module.exports = { ROWS, main, retiredDiagnostic };

if (require.main === module)
  main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });

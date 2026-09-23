#!/usr/bin/env node
"use strict";

// Static admission check by default. `--live OUTPUT` performs exactly one
// bounded diagnostic arm per implementation; it is not a timing campaign.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const registry = require("./phase6_prepared_adapter_registry.cjs");
const wrapper = require("./phase6_registered_prepared_adapter.cjs");
const verifier = require("./row14_phase6_matched_state_verifier.cjs");
const receiptV2 = require("./row14_phase6_diagnostic_receipt_v2.cjs");

const EVIDENCE = path.join(__dirname,
  "row14_phase6_matched_state_evidence_v2.json");
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function staticCheck() {
  const raw = fs.readFileSync(EVIDENCE);
  const evidence = JSON.parse(raw);
  const verdict = verifier.verifySageCorrectnessEvidence(evidence);
  const admitted = registry.preparedAdapterRegistration(14);
  const inventory = registry.inventory();
  assert.deepEqual(inventory.rows.map(value => value.panelIndex), [14]);
  assert.equal(inventory.executionEnabled, false);
  assert.equal(inventory.reserveOpeningEnabled, false);
  assert.equal(admitted.admission.matchedReady, true);
  assert.equal(admitted.admissionCapability.sageCorrectness.leanSemanticDigest,
    verdict.leanSemanticDigest);
  assert.equal(admitted.admissionCapability.sageCorrectness.evidence.sha256,
    sha256(raw));
  return { verdict, admitted, evidenceSha256: sha256(raw) };
}

async function liveCheck(outputPath) {
  assert.equal(typeof outputPath, "string");
  assert.equal(fs.existsSync(outputPath), false,
    "row-14 strict diagnostic output already exists");
  const request = { boundary: "prepared-kernel", fieldId: verifier.FIELD_ID,
    repetition: 0, seed: "1", tier: "diagnostic" };
  // Run the small child-PARI arm before loading the large Sage native graph.
  const pari = await wrapper.createRegisteredPreparedAdapter(
    { panelIndex: 14, implementation: "pari" });
  const pariVerified = await pari.runFreshVerified(request);
  const sage = await wrapper.createRegisteredPreparedAdapter(
    { panelIndex: 14, implementation: "sagejs" });
  const sageVerified = await sage.runFreshVerified(request);
  const report = receiptV2.finalizeDiagnosticReceipt({ request,
    sagejs: { implementation: "sagejs", ...sageVerified },
    pari: { implementation: "pari", ...pariVerified } });
  const written = receiptV2.writeDiagnosticReceipt(outputPath, report);
  return { outputPath, sha256: written.fileSha256, report };
}

async function main(argv = process.argv.slice(2)) {
  const checked = staticCheck();
  if (argv.length === 0) {
    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.pari-class-group/row14-phase6-strict-v2-static-check-v1",
      panelIndex: 14, matchedReady: checked.verdict.matchedReady,
      leanSemanticDigest: checked.verdict.leanSemanticDigest,
      evidenceSha256: checked.evidenceSha256,
      mutationCoverage: checked.verdict.mutationCoverage,
      executionEnabled: false, reserveOpeningEnabled: false,
      livePairExecuted: false,
    })}\n`);
    return;
  }
  assert.deepEqual(argv.slice(0, 1), ["--live"]);
  assert.equal(argv.length, 2, "usage: check ... [--live OUTPUT.json]");
  const live = await liveCheck(path.resolve(argv[1]));
  process.stdout.write(`${JSON.stringify({ output: live.outputPath,
    sha256: live.sha256, qualifiedTiming: false })}\n`);
}

module.exports = { EVIDENCE, liveCheck, main, staticCheck };

if (require.main === module)
  main().catch(error => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });

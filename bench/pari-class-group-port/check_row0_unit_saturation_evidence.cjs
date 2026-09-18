#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const PRODUCER = path.join(__dirname, "row0_unit_saturation_evidence.py");

function sagejsInvocation(arguments_) {
  if (process.env.SAGEJS_TEST_EXECUTABLE)
    return [process.env.SAGEJS_TEST_EXECUTABLE, arguments_];
  return [path.join(ROOT, "bin", "sagejs"), arguments_];
}

function runSage(arguments_) {
  const [executable, args] = sagejsInvocation(["--python", PRODUCER]);
  const [resultFile, evidenceFile] = arguments_;
  const child = spawnSync(executable, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, OPENBLAS_NUM_THREADS: "1", OMP_NUM_THREADS: "1",
      SAGEJS_ROW0_SATURATION_RESULT: resultFile,
      ...(evidenceFile ? { SAGEJS_ROW0_SATURATION_EVIDENCE: evidenceFile } : {}),
    },
    maxBuffer: 32 * 1024 * 1024,
    timeout: 900_000,
  });
  assert.equal(child.status, 0, child.stderr || child.error?.message || child.stdout);
  return JSON.parse(child.stdout.trim().split("\n").at(-1));
}

function buildAndColdReplay(filename) {
  const selected = path.resolve(filename);
  const evidence = runSage([selected]);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row0-saturation-"));
  try {
    const evidenceFile = path.join(temporary, "evidence.json");
    fs.writeFileSync(evidenceFile, JSON.stringify(evidence), "ascii");
    const replay = runSage([selected, evidenceFile]);
    assert.deepEqual(replay, evidence);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  const certificate = JSON.parse(evidence.certificate.canonical_json);
  assert.equal(evidence.conclusion.unit_index_one, true);
  assert.equal(evidence.conclusion.factor_base_generation_proved, false);
  assert.equal(evidence.conclusion.public_class_unit_complete, false);
  assert.equal(certificate.schema,
    "sagejs.pari-class-group/row0-conditional-analytic-unit-index-certificate-v1");
  assert.equal(certificate.analytic_proof.hr_index.lower_index, 1);
  assert.equal(certificate.analytic_proof.hr_index.upper_index, 1);
  assert.equal(certificate.analytic_proof.hr_index.unique_index, 1);
  assert.equal(certificate.analytic_proof.regulator.rigorous, true);
  assert.equal(certificate.analytic_proof.zeta_log_residue.rigorous, true);
  return evidence;
}

function main(filename) {
  assert(filename,
    "usage: check_row0_unit_saturation_evidence.cjs ROW0_RESULT.json");
  const evidence = buildAndColdReplay(filename);
  const certificate = JSON.parse(evidence.certificate.canonical_json);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row0-unit-saturation-check-v1",
    correspondenceResultSha256: evidence.source.correspondence_sha256,
    evidenceSha256: evidence.content_sha256,
    certificateSha256: evidence.certificate.content_sha256,
    zetaThreshold:
      certificate.analytic_proof.zeta_log_residue.threshold,
    lowerIndex: evidence.conclusion.lower_index,
    upperIndex: evidence.conclusion.upper_index,
    uniqueIndex: evidence.conclusion.unique_index,
    unitIndexOne: true,
    detachedColdReplay: true,
    phase3ClassNumberPremise: true,
    factorBaseGenerationProved: false,
    publicClassUnitComplete: false,
    qualifiedTiming: false,
  })}\n`);
}

if (require.main === module) {
  try { main(process.argv[2]); }
  catch (error) { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; }
}

module.exports = Object.freeze({ buildAndColdReplay });

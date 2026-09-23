#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-portable: true

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const transaction = require("./row19_fresh_prepared_transaction.cjs");
const adapter = require("./row19_class_unit_result_adapter.cjs");

const source = fs.readFileSync(path.join(__dirname,
  "row19_fresh_prepared_transaction.cjs"), "utf8");
const ROOT = path.resolve(__dirname, "../..");

assert.match(source, /authenticatePreparedNf\(preparedInput\)/);
assert.match(source, /runFirstHnf\(prepared, prefix\)/);
assert.match(source, /runTerminalContinuation\(/);
assert.match(source, /buildFreshOwner\(/);
assert.match(source, /compactApi\.compose\(/);
assert.match(source, /unitApi\.compose\(/);
assert.match(source, /finalApi\.composeFresh\(/);
assert.match(source, /prepareFreshRow19ClassUnitResult\(/);
assert.match(source, /new WeakSet\(\)/);
assert.match(source, /fs\.rmSync\(temporary, \{ recursive: true, force: true \}\)/);
assert.doesNotMatch(source, /panel-19|W0_SHA256|\/scratch\/sagejs-pari-development-panel/);
for (const name of ["elapsedNs", "stageElapsedNs", "maxRssKiB",
  "kernelNanoseconds", "wallNanoseconds", "threadCpuNanoseconds"])
  assert.doesNotMatch(source, new RegExp(`\\b${name}\\b`));

assert.equal(transaction.isAuthenticFreshReceipt({
  schema: transaction.RECEIPT_SCHEMA, freshPreparedExecution: true,
}), false, "structural receipt forgery acquired the transaction-local brand");

const copiedComposition = {
  schema: adapter.COMPOSITION_SCHEMA,
  status: "ready-for-out-of-band-publication-authority",
  finalOwnerSha256: "0".repeat(64), correspondenceComplete: true,
  publicComplete: false, usedW0RuntimeData: false, freshPreparedInput: true,
  qualifiedTiming: false, sealedEnvelopeHex: "00",
  sealedEnvelopeSha256: "0".repeat(64),
};
assert.equal(adapter.isAuthenticFreshPrepared(copiedComposition), false);
assert.throws(() => adapter.publishPreparedRow19ClassUnitResult(
  copiedComposition, {}), adapter.Row19ClassUnitAdapterFailure);

const focused = {
  schema: "sagejs.pari-class-group/row19-fresh-prepared-transaction-check-v1",
  preparedOnlyEntry: true,
  privateSameRunStages: 7,
  copiedFreshCompositionRejected: true,
  copiedReceiptRejected: true,
  timingFieldsPublished: 0,
  reserveClaimsPublished: 0,
  w0RuntimeInputs: 0,
};

async function realWorker(request) {
  const receipt = await transaction.runFreshPrepared(
    request.prepared, request.outputDirectory);
  assert.equal(transaction.isAuthenticFreshReceipt(receipt), true);
  assert.equal(transaction.isAuthenticFreshReceipt({ ...receipt }), false);
  const roots = require("./phase5_development_roots.cjs");
  const registry = require("./fresh_prepared_development_registry.cjs");
  const core = require("./qualification_execution_core.cjs");
  const root = roots.developmentRoot(19);
  const admitted = registry.admitRegisteredFreshReceipt({ root, receipt });
  const correctness = await core.runDevelopmentCorrectnessPath({
    root, invoke: async () => admitted,
  });
  assert.equal(correctness.freshPreparedExecution, true);
  process.stdout.write(`${JSON.stringify({ receipt, correctness })}\n`);
}

async function main() {
  if (process.argv[2] === "--real-worker") {
    return realWorker(JSON.parse(fs.readFileSync(0, "utf8")));
  }
  if (process.argv[2] !== "--real") {
    process.stdout.write(`${JSON.stringify(focused)}\n`);
    return;
  }
  const prepared = JSON.parse(fs.readFileSync(process.argv[3]));
  const outputDirectory = path.resolve(process.argv[4]);
  const child = spawnSync("prlimit", ["--as=4294967296", "--rss=4294967296",
    "--cpu=600", "--", process.execPath, "--expose-gc", __filename,
    "--real-worker"], { cwd: ROOT, encoding: "utf8",
    input: JSON.stringify({ prepared, outputDirectory }), timeout: 600_000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072" } });
  assert.equal(child.status, 0, child.stderr || child.stdout || String(child.error));
  const report = JSON.parse(child.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(report.receipt.sha256,
    "a9642e255d536cde1c13740b0452bbdedf917cc851b753c2ec6152df2622eb66");
  assert.equal(report.correctness.freshPreparedExecution, true);
  process.stdout.write(`${JSON.stringify({ ...focused, receipt: report.receipt,
    registryAdmission: report.correctness })}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

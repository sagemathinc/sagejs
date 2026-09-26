#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const transaction = require("./row18_fresh_prepared_transaction.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");
const registry = require("./fresh_prepared_development_registry.cjs");
const roots = require("./phase5_development_roots.cjs");

const ROOT = path.resolve(__dirname, "../..");
const source = fs.readFileSync(path.join(__dirname,
  "row18_fresh_prepared_transaction.cjs"), "utf8");

assert.match(source, /authenticatePreparedNf\(preparedInput\)/);
assert.match(source, /makeFreshInput\(prepared\)/);
assert.match(source, /run_fresh_row18/);
assert.match(source, /new WeakSet\(\)/);
assert.match(source, /retainedRuntimeInputs: false/);
assert.match(source, /retainedOwnersRuntimeInputs: false/);
assert.doesNotMatch(source, /panel-18-d48b43b95d82e5e1|\/scratch\/sagejs-pari-development-panel/);
for (const name of ["elapsedNs", "stageElapsedNs", "maxRssKiB",
  "kernelNanoseconds", "wallNanoseconds", "threadCpuNanoseconds"])
  assert.doesNotMatch(source, new RegExp(`\\b${name}\\b`));

assert.equal(transaction.isAuthenticFreshReceipt({ schema: transaction.SCHEMA,
  freshPreparedExecution: true, privateSameRunOwners: true }), false);

const dimensionProbe = String.raw`
import importlib,sys
sys.path.extend(["src/lib"])
m=importlib.import_module("bench.pari-class-group-port.row18_mixed_cubic_class_witness")
base={"schema":m.PRESENTATION_SCHEMA,"field":{"id":m.FIELD_ID},
      "dimensions":{"factorBaseSize":41,"relationCount":49,"kernelRank":8}}
for dimensions in ({"factorBaseSize":42,"relationCount":49,"kernelRank":7},
                   {"factorBaseSize":41,"relationCount":49,"kernelRank":9}):
    owner={**base,"dimensions":dimensions}
    try:m.compose_row18_cyclic_class_witness(owner,{})
    except m.Row18ClassWitnessFailure:pass
    else:raise AssertionError("dimension mismatch was accepted")
print("ok")
`;
const dimensions = spawnSync("python3", ["-c", dimensionProbe], { cwd: ROOT,
  encoding: "utf8", timeout: 60_000 });
assert.equal(dimensions.status, 0, dimensions.stderr || String(dimensions.error));

const focused = {
  schema: "sagejs.pari-class-group/row18-fresh-prepared-transaction-check-v1",
  preparedOnlyEntry: true,
  privateSameRunStages: 6,
  copiedReceiptRejected: true,
  dimensionMismatchNegatives: 2,
  timingFieldsPublished: 0,
  reserveClaimsPublished: 0,
  w0RuntimeInputs: 0,
};

function realWorker(request) {
  const injected = structuredClone(request.prepared);
  injected.retainedTerminalOwner = { classNumber: "18" };
  assert.throws(() => transaction.runFreshPrepared(injected, request.outputDirectory));
  const receipt = transaction.runFreshPrepared(
    request.prepared, request.outputDirectory);
  assert.equal(transaction.isAuthenticFreshReceipt(receipt), true);
  assert.equal(transaction.isAuthenticFreshReceipt({ ...receipt }), false);
  assert.equal(fs.statSync(receipt.path).mode & 0o777, 0o444);
  const raw = fs.readFileSync(receipt.path);
  assert.equal(neutral.sha256Bytes(raw), receipt.sha256);
  const envelope = JSON.parse(raw);
  neutral.validatePayload(envelope.payload);
  assert.equal(envelope.payload.classGroup.classNumber, "18");
  assert.deepEqual(envelope.payload.classGroup.invariantFactors, ["18"]);
  assert.equal(envelope.payload.unitGroup.rank, "1");
  assert.equal(envelope.payload.unitGroup.materialization.tag, "exact_units");
  const root = roots.developmentRoot(18);
  const admitted = registry.admitRegisteredFreshReceipt({ root, receipt });
  assert.equal(registry.verifyFreshExecution(admitted.freshExecution,
    { root, result: admitted.result }), admitted.freshExecution);
  process.stdout.write(`${JSON.stringify({ receipt, registryAdmission: true })}\n`);
}

if (process.argv[2] === "--real-worker") {
  realWorker(JSON.parse(fs.readFileSync(0, "utf8")));
} else if (process.argv[2] !== "--real") {
  process.stdout.write(`${JSON.stringify(focused)}\n`);
} else {
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
    "5a409415b05fb76c07ee299dcdfd350336a8802da6540bac310cefc565c72e8e");
  assert.equal(report.registryAdmission, true);
  process.stdout.write(`${JSON.stringify({ ...focused, receipt: report.receipt,
    injectedRetainedOwnerRejected: true, genuineRelationCount: 49,
    genuineKernelRank: 8 })}\n`);
}

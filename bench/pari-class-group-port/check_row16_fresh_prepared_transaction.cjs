#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-portable: true

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const authentication = require("./prepared_nf_authentication.cjs");
const registry = require("./fresh_prepared_development_registry.cjs");
const roots = require("./phase5_development_roots.cjs");
const transaction = require("./row16_fresh_prepared_transaction.cjs");

const ROOT = path.resolve(__dirname, "../..");
const source = fs.readFileSync(path.join(__dirname,
  "row16_fresh_prepared_transaction.cjs"), "utf8");

assert.match(source, /authenticatePreparedNf\(prepared/);
assert.match(source, /pari_resident_generated_class_attempt/);
assert.match(source, /compose_row16_fresh_state/);
assert.match(source, /new WeakSet\(\)/);
assert.match(source, /relation-matrix/);
assert.match(source, /class-generator-order-witnesses/);
assert.match(source, /exact-unit-coordinates/);
assert.doesNotMatch(source, /panel-16-aabb93f0d6139f93|pristine-w0|W0_SHA256|\/scratch\//);
for (const name of ["elapsedNs", "stageElapsedNs", "maxRssKiB",
  "kernelNanoseconds", "wallNanoseconds", "threadCpuNanoseconds"])
  assert.doesNotMatch(source, new RegExp(`\\b${name}\\b`));

assert.equal(transaction.isAuthenticFreshReceipt({
  schema: transaction.RECEIPT_SCHEMA, freshPreparedExecution: true,
}), false, "structural receipt forgery acquired the transaction-local brand");
const focused = {
  schema: "sagejs.pari-class-group/row16-fresh-prepared-transaction-check-v1",
  preparedOnlyEntry: true,
  sameRunResidentGraph: true,
  retainedOwnersAsInputs: 0,
  copiedReceiptRejected: true,
  injectedW0Rejected: true,
  preparedMutationsRejected: 4,
  timingFieldsPublished: 0,
  reserveClaimsPublished: 0,
  w0RuntimeInputs: 0,
};

async function realWorker(request) {
  const receipt = await transaction.runFreshPrepared(
    request.prepared, request.outputDirectory);
  assert.equal(transaction.isAuthenticFreshReceipt(receipt), true);
  assert.equal(transaction.isAuthenticFreshReceipt({ ...receipt }), false);
  const payload = receipt.verifiedResult.detachedPayload();
  assert.equal(payload.classGroup.classNumber, "27");
  assert.deepEqual(payload.classGroup.invariantFactors,
    ["3", "3", "3"]);
  const owners = Object.fromEntries(payload.storage.map(owner =>
    [owner.name, owner.entries]));
  assert.equal(owners["relation-matrix"].length, 48 * 54);
  assert.equal(owners["class-presentation"].length, 48 * 48);
  assert.equal(owners["class-generator-order-witnesses"].length, 3 * (9 + 54 + 3 + 9));
  assert.equal(owners["exact-unit-coordinates"].length, 3);
  assert.equal(owners["exact-unit-inverse"].length, 3);
  const root = roots.developmentRoot(16);
  const admitted = registry.admitRegisteredFreshReceipt({ root, receipt });
  assert.equal(admitted.result.sha256, receipt.result.sha256);
  assert.equal(registry.verifyFreshExecution(
    admitted.freshExecution, { root, result: admitted.result }),
  admitted.freshExecution);
  assert.throws(() => registry.admitRegisteredFreshReceipt({
    root, receipt: { ...receipt },
  }));
  process.stdout.write(`${JSON.stringify({ receipt, registryAdmission: true })}\n`);
}

async function main() {
  await assert.rejects(transaction.runFreshPreparedRequest({
    prepared: {}, outputDirectory: "/tmp", W0: {},
  }), /deepStrictEqual|Expected values/);
  if (process.argv[2] === "--real-worker")
    return realWorker(JSON.parse(fs.readFileSync(0, "utf8")));
  if (process.argv[2] !== "--genuine") {
    process.stdout.write(`${JSON.stringify(focused)}\n`); return;
  }
  assert.equal(process.argv.length, 4,
    "usage: check_row16_fresh_prepared_transaction.cjs --genuine ROW16_W0");
  const bundle = JSON.parse(fs.readFileSync(path.resolve(process.argv[3])));
  const prepared = authentication.normalizePreparedBundle(bundle);
  const mutations = [
    value => { value.prep_polynomial[0] += 1; },
    value => { value.admission_real_count = 3; },
    value => { value.basis_table[0] += 1; },
    value => { value.injectedOwner = []; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(prepared); mutate(changed);
    assert.throws(() => transaction.validatePrepared(changed));
  }
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row16-fresh-"));
  try {
    const child = spawnSync("prlimit", ["--as=4294967296", "--rss=4294967296",
      "--cpu=600", "--", process.execPath, "--expose-gc", __filename,
      "--real-worker"], { cwd: ROOT, encoding: "utf8",
      input: JSON.stringify({ prepared, outputDirectory }), timeout: 600_000,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072" } });
    assert.equal(child.status, 0, child.stderr || child.stdout || String(child.error));
    const report = JSON.parse(child.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(report.registryAdmission, true);
    assert.equal(report.receipt.freshPreparedExecution, true);
    assert.equal(report.receipt.frozenW0RuntimeInput, false);
    assert.equal(report.receipt.retainedOwnersRuntimeInputs, false);
    assert.equal(report.receipt.classGroup.classNumber, "27");
    assert.deepEqual(report.receipt.classGroup.invariantFactors, ["3", "3", "3"]);
    assert.equal(report.receipt.exactUnitCount, 1);
    assert.equal(report.receipt.relationCount, 54);
    assert.equal((fs.statSync(report.receipt.result.path).mode & 0o777), 0o444);
    process.stdout.write(`${JSON.stringify({ ...focused, receipt: report.receipt })}\n`);
  } finally { fs.rmSync(outputDirectory, { recursive: true, force: true }); }
}

main().catch(error => { process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1; });

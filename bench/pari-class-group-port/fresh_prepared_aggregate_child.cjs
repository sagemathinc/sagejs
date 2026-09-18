#!/usr/bin/env node
"use strict";

// One-process boundary for an aggregate fresh-prepared development execution.
// The transaction-local and registry-local WeakSet brands cannot cross this
// process boundary, so admission and verification deliberately happen here.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const roots = require("./phase5_development_roots.cjs");

const CHILD_SCHEMA =
  "sagejs.pari-class-group/fresh-prepared-aggregate-child-v1";
const PROBE_SCHEMA =
  "sagejs.pari-class-group/fresh-prepared-registry-probe-v1";
const SHA256 = /^[0-9a-f]{64}$/;

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function manifest() {
  return require("./fresh-prepared-corpus-manifest.json");
}

function expectedIndices() {
  return roots.DEVELOPMENT_ROOTS.map(root => root.panelIndex);
}

async function probeRegistry() {
  const registry = require("./fresh_prepared_development_registry.cjs");
  const registered = [];
  const missing = [];
  for (const root of roots.DEVELOPMENT_ROOTS) {
    try {
      await registry.runRegisteredFreshPrepared({
        root,
        prepared: null,
        outputDirectory: null,
      });
      assert.fail(`row ${root.panelIndex} accepted an invalid output directory`);
    } catch (error) {
      const message = String(error && error.message);
      if (message.includes("has no registered fresh-prepared runner")) {
        missing.push(root.panelIndex);
      } else if (message.includes("'string'") ||
        message.includes("outputDirectory")) {
        registered.push(root.panelIndex);
      } else {
        throw error;
      }
    }
  }
  return Object.freeze({
    schema: PROBE_SCHEMA,
    expected: expectedIndices(),
    registered,
    missing,
    ready: missing.length === 0 && registered.length === expectedIndices().length,
  });
}

function validatePreparedFile(panelIndex, filename) {
  const expected = manifest().rows.find(row => row.panelIndex === panelIndex);
  assert(expected, `prepared corpus does not contain row ${panelIndex}`);
  assert.equal(path.basename(filename),
    `prepared-row-${String(panelIndex).padStart(2, "0")}-${expected.preparedJsonSha256}.json`);
  const stat = fs.statSync(filename);
  assert(stat.isFile(), "prepared input is not a regular file");
  assert.equal(stat.mode & 0o222, 0, "prepared input is writable");
  const bytes = fs.readFileSync(filename);
  assert.equal(bytes.length, expected.preparedJsonBytes);
  assert.equal(sha256(bytes), expected.preparedJsonSha256);
  return { expected, prepared: JSON.parse(bytes) };
}

function writeReceipt(filename, receipt) {
  const bytes = Buffer.from(`${JSON.stringify(receipt)}\n`);
  fs.writeFileSync(filename, bytes, { flag: "wx", mode: 0o400 });
  fs.chmodSync(filename, 0o444);
}

async function runRow(panelIndex, preparedPath, outputDirectory, receiptPath) {
  assert(Number.isInteger(panelIndex));
  assert.equal(fs.statSync(outputDirectory).mode & 0o077, 0,
    "aggregate row output directory is not private");
  const { expected, prepared } = validatePreparedFile(panelIndex, preparedPath);
  const registry = require("./fresh_prepared_development_registry.cjs");
  const root = roots.developmentRoot(panelIndex);
  const admitted = await registry.runRegisteredFreshPrepared({
    root,
    prepared,
    outputDirectory,
  });
  registry.verifyFreshExecution(admitted.freshExecution, {
    root,
    result: admitted.result,
  });
  assert.equal(admitted.freshExecution.preparedAuthoritySha256,
    expected.preparedAuthoritySha256,
  "fresh execution used a different prepared authority");
  assert(SHA256.test(admitted.result.sha256));
  assert(SHA256.test(admitted.freshExecution.payloadSha256));
  const receipt = Object.freeze({
    schema: CHILD_SCHEMA,
    panelIndex,
    fieldId: root.manifestFieldId,
    internalFieldId: root.internalFieldId,
    preparedJsonSha256: expected.preparedJsonSha256,
    preparedAuthoritySha256: expected.preparedAuthoritySha256,
    resultSha256: admitted.result.sha256,
    payloadSha256: admitted.freshExecution.payloadSha256,
    correspondenceComplete: true,
    publicComplete: false,
    freshPreparedExecution: true,
    registryAdmission: true,
    qualifiedTiming: false,
    retainedRuntimeInputs: false,
    frozenW0RuntimeInput: false,
  });
  writeReceipt(receiptPath, receipt);
  return receipt;
}

async function main(argv) {
  if (argv[2] === "--probe") {
    process.stdout.write(`${JSON.stringify(await probeRegistry())}\n`);
    return;
  }
  assert.equal(argv[2], "--run",
    "usage: fresh_prepared_aggregate_child.cjs --probe | --run ROW PREPARED OUTPUT RECEIPT");
  assert.equal(argv.length, 7);
  const panelIndex = Number(argv[3]);
  assert(Number.isSafeInteger(panelIndex));
  await runRow(panelIndex, path.resolve(argv[4]), path.resolve(argv[5]),
    path.resolve(argv[6]));
}

if (require.main === module) {
  main(process.argv).catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}

module.exports = {
  CHILD_SCHEMA,
  PROBE_SCHEMA,
  expectedIndices,
  probeRegistry,
  runRow,
};

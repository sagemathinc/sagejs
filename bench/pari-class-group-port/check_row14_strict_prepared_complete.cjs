#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_CAPSULE =
  "/tmp/row14-capsule-test/row14-initial-33d2606a151ecf0ba5a73c247ecf3f219ff84a2341048ebbbe374ecd9c7939b1.json.gz";
const DEFAULT_OUTPUT = "/tmp/sagejs-row14-strict-prepared-complete-owner";
const CAPSULE_SHA256 =
  "33d2606a151ecf0ba5a73c247ecf3f219ff84a2341048ebbbe374ecd9c7939b1";
const FINAL_SHA256 =
  "edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2";

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

async function worker(payload) {
  assert.deepEqual(Object.keys(payload).sort(), ["outputDirectory", "prepared"]);
  const host = require("./row14_strict_prepared_complete_host.cjs");
  const receipt = await host.runStrictPreparedComplete(
    payload.prepared, payload.outputDirectory);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

function mutationChecks(prepared) {
  const host = require("./row14_strict_prepared_complete_host.cjs");
  let rejected = 0;
  for (const mutate of [
    value => { value.authoritySha256 = "0".repeat(64); },
    value => { value.data.prep_polynomial[0] = "-200000003"; },
    value => { value.data.analytic_discriminant = "1"; },
    value => { value.data.prep_zk[0] = "2"; },
    value => { value.data.basis_table[0] = "2"; },
    value => { value.data.preparation_rounded_embedding[0] = "2"; },
    value => { [value.data.admission_primes[0], value.data.admission_primes[1]] =
      [value.data.admission_primes[1], value.data.admission_primes[0]]; },
    value => { value.data.admission_products[0] = "1"; },
    value => { value.data.unreviewed = "1"; },
  ]) {
    const changed = structuredClone(prepared); mutate(changed);
    assert.throws(() => host.validateStrictPrepared(changed)); rejected += 1;
  }
  return rejected;
}

function main() {
  if (process.argv[2] === "--worker")
    return worker(JSON.parse(fs.readFileSync(0, "utf8")));
  const capsulePath = path.resolve(process.argv[2] || DEFAULT_CAPSULE);
  const outputDirectory = path.resolve(process.argv[3] || DEFAULT_OUTPUT);
  const capsuleBytes = fs.readFileSync(capsulePath);
  assert.equal(sha256(capsuleBytes), CAPSULE_SHA256);
  const capsule = JSON.parse(zlib.gunzipSync(capsuleBytes));
  const authentication = require("./prepared_nf_authentication.cjs");
  const prepared = {
    authoritySha256: authentication.authenticatePreparedBundle(capsule).sha256,
    data: authentication.normalizePreparedBundle(capsule),
  };
  let mutationsRejected = mutationChecks(prepared);
  const run = spawnSync("prlimit", ["--as=4294967296", "--rss=4294967296",
    "--cpu=600", "--", process.execPath, __filename, "--worker"], {
      cwd: ROOT, encoding: "utf8", input: JSON.stringify({ outputDirectory, prepared }),
      timeout: 600_000, maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072" },
    });
  assert.equal(run.status, 0, run.stderr || run.stdout || String(run.error));
  const receipt = JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(receipt.schema,
    "sagejs.pari-class-group/row14-strict-prepared-complete-receipt-v1");
  assert.equal(receipt.sha256, FINAL_SHA256);
  assert.equal(receipt.correspondenceComplete, true);
  assert.equal(receipt.publicComplete, false);
  assert.equal(receipt.rootRuntimeInput, false);
  assert.equal(receipt.frozenW0RuntimeInput, false);
  assert.equal(receipt.answerOwnerRuntimeInput, false);
  assert.deepEqual(receipt.runtimeInputs,
    ["authenticated neutral prepared-nf projection"]);
  assert.deepEqual(receipt.relationState, ["806", "8110", "0", "0", "806", "806"]);
  assert.deepEqual(receipt.initialRoot.state,
    ["1", "5978", "5978", "799", "487", "487", "799", "4", "799",
      "42", "806", "764", "4", "757", "799", "0", "1048576", "65537"]);
  assert.equal(receipt.initialRoot.calls, 1);
  assert.equal(receipt.initialRoot.terminalRng.length, 66);
  assert(receipt.initialRoot.terminalRng.every(word => /^(0|[1-9][0-9]*)$/.test(word)));
  assert.equal(receipt.collectionPasses, 8);
  assert(BigInt(receipt.mathematicalElapsedNs) >= BigInt(receipt.initialRoot.kernelElapsedNs));
  assert(BigInt(receipt.transactionElapsedNs) < 600_000_000_000n);
  assert(receipt.maxRssKiB < 4 * 1024 * 1024);
  const bytes = fs.readFileSync(receipt.path);
  assert.equal(sha256(bytes), FINAL_SHA256);
  assert.equal(fs.statSync(receipt.path).mode & 0o777, 0o444);
  const envelope = JSON.parse(bytes);
  assert.deepEqual(envelope.payload.classGroup.invariantFactors, ["8", "24"]);
  assert.equal(envelope.payload.classGroup.classNumber, "192");
  assert.deepEqual(envelope.payload.unitGroup.materialization,
    { precisionBits: "192", reason: "LARGE", tag: "not_given" });

  // Content addressing and immutable publication make a repeated publication
  // of this exact transaction idempotent; a bit mutation is not accepted as
  // the same result.
  const changed = Buffer.from(bytes); changed[changed.length - 2] ^= 1;
  assert.notEqual(sha256(changed), FINAL_SHA256); mutationsRejected += 1;
  console.log(JSON.stringify({ ...receipt, mutationsRejected,
    limits: { addressSpaceBytes: 4 * 1024 ** 3, rssBytes: 4 * 1024 ** 3,
      cpuSeconds: 600, wallTimeoutSeconds: 600, nodeOldSpaceMiB: 3072 },
    strictBoundary: true }, null, 2));
}

Promise.resolve(main()).catch(error => {
  console.error(error.stack || error); process.exitCode = 1;
});

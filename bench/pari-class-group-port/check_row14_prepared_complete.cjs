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
const DEFAULT_ROOT =
  "/tmp/sagejs-row14-prepared-root-VNkAWv/owner/row14-prepared-initial-b2088268bca4b735816d280d15bccb94f45faab9831bc7523c9dc671b6716ae0.json.gz";
const DEFAULT_OUTPUT = "/tmp/sagejs-row14-prepared-complete-owner";
const CAPSULE_SHA256 =
  "33d2606a151ecf0ba5a73c247ecf3f219ff84a2341048ebbbe374ecd9c7939b1";
const ROOT_SHA256 =
  "b2088268bca4b735816d280d15bccb94f45faab9831bc7523c9dc671b6716ae0";
const ROOT_COMPRESSED_SHA256 =
  "b06f0146d8d21bfaac6f43e0e33b176d30e6b61fe480050bb51ff74d9d35b833";

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

async function worker(payload) {
  const compressed = fs.readFileSync(payload.rootPath);
  assert.equal(sha256(compressed), ROOT_COMPRESSED_SHA256);
  assert.equal(fs.statSync(payload.rootPath).mode & 0o222, 0);
  const plain = zlib.gunzipSync(compressed);
  assert.equal(sha256(plain), ROOT_SHA256);
  const rootOwner = JSON.parse(plain);
  const host = require("./row14_prepared_complete_host.cjs");
  const receipt = await host.runPreparedComplete(payload.prepared, rootOwner,
    payload.outputDirectory);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

function rejectBoundaryMutations(prepared, root) {
  const host = require("./row14_prepared_complete_host.cjs");
  let rejected = 0;
  function reject(changePrepared, changeRoot) {
    const p = structuredClone(prepared), r = structuredClone(root);
    changePrepared?.(p); changeRoot?.(r);
    assert.throws(() => host.synthesizeMetadata(p, r)); rejected += 1;
  }
  reject(p => { p.authoritySha256 = "0".repeat(64); });
  reject(p => { p.data.prep_polynomial[0] = String(BigInt(p.data.prep_polynomial[0]) + 1n); });
  reject(p => { p.data.analytic_discriminant = "1"; });
  reject(p => { p.data.unreviewed = "1"; });
  reject(null, r => { r.authority.preparedAuthoritySha256 = "0".repeat(64); });
  reject(null, r => { r.factor.packetIdeals[0] = "1"; });
  reject(null, r => { r.factor.tau[0] = "1"; });
  reject(null, r => { r.handoff.searchIdeals[0] =
    String(BigInt(r.handoff.searchIdeals[0]) + 1n); });
  reject(null, r => { r.baseState[6] = "1"; });
  reject(null, r => { r.relations.state[0] = "41"; });
  return rejected;
}

function main() {
  if (process.argv[2] === "--worker") {
    return worker(JSON.parse(fs.readFileSync(0, "utf8")));
  }
  const capsulePath = path.resolve(process.argv[2] || DEFAULT_CAPSULE);
  const rootPath = path.resolve(process.argv[3] || DEFAULT_ROOT);
  const outputDirectory = path.resolve(process.argv[4] || DEFAULT_OUTPUT);
  const capsuleBytes = fs.readFileSync(capsulePath);
  assert.equal(sha256(capsuleBytes), CAPSULE_SHA256);
  const capsule = JSON.parse(zlib.gunzipSync(capsuleBytes));
  const authentication = require("./prepared_nf_authentication.cjs");
  const prepared = { authoritySha256:
    authentication.authenticatePreparedBundle(capsule).sha256,
    data: authentication.normalizePreparedBundle(capsule) };
  const compressedRoot = fs.readFileSync(rootPath);
  assert.equal(sha256(compressedRoot), ROOT_COMPRESSED_SHA256);
  const root = JSON.parse(zlib.gunzipSync(compressedRoot));
  let mutationsRejected = rejectBoundaryMutations(prepared, root);

  const run = spawnSync("prlimit", ["--as=4294967296", "--rss=4294967296",
    "--cpu=600", "--", process.execPath, __filename, "--worker"], {
    cwd: ROOT, encoding: "utf8", input: JSON.stringify({ prepared, rootPath,
      outputDirectory }), timeout: 600_000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072" },
  });
  assert.equal(run.status, 0, run.stderr || run.stdout || String(run.error));
  const receipt = JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(receipt.schema,
    "sagejs.pari-class-group/row14-prepared-complete-receipt-v1");
  assert.equal(receipt.correspondenceComplete, true);
  assert.equal(receipt.publicComplete, false);
  assert.equal(receipt.frozenW0RuntimeInput, false);
  assert.deepEqual(receipt.relationState, ["806", "8110", "0", "0", "806", "806"]);
  assert.equal(receipt.collectionPasses, 8);
  assert(receipt.maxRssKiB < 4 * 1024 * 1024);
  assert(BigInt(receipt.elapsedNs) < 600_000_000_000n);
  const bytes = fs.readFileSync(receipt.path);
  assert.equal(sha256(bytes), receipt.sha256);
  assert.equal(bytes.length, receipt.bytes);
  assert.equal(fs.statSync(receipt.path).mode & 0o777, 0o444);
  const envelope = JSON.parse(bytes);
  assert.equal(envelope.payload.terminal.correspondence_complete, true);
  assert.equal(envelope.payload.terminal.public_complete, false);
  assert.deepEqual(envelope.payload.classGroup.invariantFactors, ["8", "24"]);
  assert.equal(envelope.payload.classGroup.classNumber, "192");
  assert.deepEqual(envelope.payload.unitGroup.materialization,
    { precisionBits: "192", reason: "LARGE", tag: "not_given" });

  // The durable transaction is content addressed and rejects modification.
  const changed = Buffer.from(bytes); changed[changed.length - 2] ^= 1;
  assert.notEqual(sha256(changed), receipt.sha256); mutationsRejected += 1;
  console.log(JSON.stringify({ ...receipt, mutationsRejected,
    limits: { addressSpaceBytes: 4 * 1024 ** 3, rssBytes: 4 * 1024 ** 3,
      cpuSeconds: 600, wallTimeoutSeconds: 600, nodeOldSpaceMiB: 3072 },
    runtimeInputs: ["authenticated prepared-nf projection",
      "immutable prepared-root owner"],
    excludedRuntimeInputs: ["W0", "accepted relation owner", "post-806 answer",
      "class witness owner", "unit owner", "C7 envelope"] }, null, 2));
}

Promise.resolve(main()).catch(error => {
  console.error(error.stack || error); process.exitCode = 1;
});

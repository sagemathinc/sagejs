"use strict";

// Strict row-14 transaction.  Its sole mathematical input is an authenticated
// neutral prepared-number-field projection.  The prepared factor base and 42
// initial relations are recomputed before the existing Gate-C-through-C7 path
// is entered; no prepared-root or answer owner is admitted at this boundary.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const authentication = require("./prepared_nf_authentication.cjs");
const { PREPARED_KEYS } = require("./row14_prepared_gate_c_host.cjs");
const complete = require("./row14_prepared_complete_host.cjs");

const ROOT = path.resolve(__dirname, "../..");
const EXPECTED_AUTHORITY_SHA256 =
  "6c8ac1e7e6a47a486de92cd180f9524a1be132d8fe1f7ccbd822166e77d4da92";
const EXPECTED_FINAL_SHA256 =
  "edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2";
const EXPECTED_ROOT_STATE = ["1", "5978", "5978", "799", "487", "487",
  "799", "4", "799", "42", "806", "764", "4", "757", "799", "0",
  "1048576", "65537"];

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function validateStrictPrepared(preparedEnvelope) {
  assert.deepEqual(Object.keys(preparedEnvelope).sort(), ["authoritySha256", "data"]);
  assert.deepEqual(Object.keys(preparedEnvelope.data).sort(), PREPARED_KEYS,
    "strict row-14 transaction received an unreviewed prepared-nf field");
  const authority = authentication.authenticatePreparedNf(preparedEnvelope.data);
  assert.equal(authority.sha256, preparedEnvelope.authoritySha256,
    "prepared-nf projection does not match its mathematical authority");
  assert.equal(authority.sha256, EXPECTED_AUTHORITY_SHA256,
    "prepared-nf projection is outside the reviewed row-14 corridor");
  return authority;
}

function runInitialRoot(preparedEnvelope, temporary) {
  const outputDirectory = path.join(temporary, "initial-root");
  const started = process.hrtime.bigint();
  const child = spawnSync(process.execPath,
    [path.join(__dirname, "check_row14_prepared_initial_root.cjs"), "--root"], {
      cwd: ROOT,
      encoding: "utf8",
      input: JSON.stringify({ outputDirectory, prepared: preparedEnvelope.data,
        preparedAuthoritySha256: preparedEnvelope.authoritySha256 }),
      timeout: 600_000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072" },
    });
  const envelopeElapsedNs = process.hrtime.bigint() - started;
  assert.equal(child.status, 0,
    `strict prepared initial root: ${child.stderr || child.stdout || child.error}`);
  const receipt = JSON.parse(child.stdout.trim().split(/\r?\n/).at(-1));
  const compressed = fs.readFileSync(receipt.path);
  assert.equal(sha256(compressed), receipt.compressedSha256);
  assert.equal(fs.statSync(receipt.path).mode & 0o222, 0,
    "derived prepared root became mutable");
  const plain = zlib.gunzipSync(compressed);
  assert.equal(sha256(plain), receipt.ownerSha256);
  const root = JSON.parse(plain);
  assert.deepEqual(root.rootState, EXPECTED_ROOT_STATE);
  assert.equal(root.execution.calls, 1);
  assert.equal(root.publication.gateA, true);
  assert.equal(root.publication.gateB, true);
  assert.equal(root.publication.collectionExecuted, false);
  assert.equal(root.authority.preparedAuthoritySha256,
    preparedEnvelope.authoritySha256);
  // This reconstructs the committed factor metadata and therefore checks all
  // answer-relevant root arrays before Gate C can observe the root.
  complete.synthesizeMetadata(preparedEnvelope, root);
  return { root, receipt, envelopeElapsedNs };
}

async function runStrictPreparedComplete(preparedEnvelope, outputDirectory) {
  validateStrictPrepared(preparedEnvelope);
  const transactionStarted = process.hrtime.bigint();
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(),
    "sagejs-row14-strict-prepared-complete-"));
  try {
    const initial = runInitialRoot(preparedEnvelope, temporary);
    const completeReceipt = await complete.runPreparedComplete(
      preparedEnvelope, initial.root, outputDirectory);
    assert.equal(completeReceipt.sha256, EXPECTED_FINAL_SHA256);
    const durable = fs.readFileSync(completeReceipt.path);
    assert.equal(sha256(durable), EXPECTED_FINAL_SHA256);
    assert.equal(fs.statSync(completeReceipt.path).mode & 0o222, 0);

    const initialRootKernelNs = BigInt(initial.receipt.elapsedNs);
    const downstreamNs = BigInt(completeReceipt.elapsedNs);
    const transactionElapsedNs = process.hrtime.bigint() - transactionStarted;
    const maxRssKiB = Math.max(Number(completeReceipt.maxRssKiB),
      Number(initial.receipt.maxRssKiB));
    return {
      ...completeReceipt,
      schema: "sagejs.pari-class-group/row14-strict-prepared-complete-receipt-v1",
      preparedAuthoritySha256: preparedEnvelope.authoritySha256,
      initialRoot: {
        calls: 1,
        state: EXPECTED_ROOT_STATE,
        terminalRng: initial.root.rng,
        ownerSha256: initial.receipt.ownerSha256,
        kernelElapsedNs: String(initialRootKernelNs),
        envelopeElapsedNs: String(initial.envelopeElapsedNs),
      },
      // The mathematical clock includes the root kernel and the complete live
      // downstream transaction.  Root compiler warmup and serialization are
      // reported separately rather than silently charged to this boundary.
      mathematicalElapsedNs: String(initialRootKernelNs + downstreamNs),
      transactionElapsedNs: String(transactionElapsedNs),
      maxRssKiB,
      timingExclusions: {
        initialRootCompileWarmupAndSerializationNs:
          String(initial.envelopeElapsedNs - initialRootKernelNs),
      },
      rootRuntimeInput: false,
      frozenW0RuntimeInput: false,
      answerOwnerRuntimeInput: false,
      runtimeInputs: ["authenticated neutral prepared-nf projection"],
    };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

module.exports = { EXPECTED_AUTHORITY_SHA256, EXPECTED_FINAL_SHA256,
  runStrictPreparedComplete, validateStrictPrepared };

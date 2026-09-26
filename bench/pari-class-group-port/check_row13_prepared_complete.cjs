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
const DEFAULT_PREPARED =
  "/tmp/row13-prepared-projection-8e982cf9703ced18cb815b5d18bcdf3596b28c8b455ff8c01cb1cd9f5a8aad51.json";
const DEFAULT_ROOT =
  "/tmp/sagejs-row13-prepared-root-HYdFfP/owner/row13-prepared-initial-9cf71f92330b0477388a4d7d5676d53fc02b352015dcf9cc8d0f422e5863378b.json.gz";
const DEFAULT_W0 =
  "/scratch/sagejs-pari-development-panel-a998/panel-13-a0f7253a51b3045a.json";
const DEFAULT_OUTPUT = "/tmp/sagejs-row13-prepared-complete-owner";
const PREPARED_SHA256 =
  "8e982cf9703ced18cb815b5d18bcdf3596b28c8b455ff8c01cb1cd9f5a8aad51";
const ROOT_SHA256 =
  "9cf71f92330b0477388a4d7d5676d53fc02b352015dcf9cc8d0f422e5863378b";
const ROOT_COMPRESSED_SHA256 =
  "f3c33401b8d98069c0c75299a08088c6cc7d42bcdb3b329524bd135236a92404";
const W0_SHA256 =
  "50df5fa8a7b676b5216fecf2f57f3c9c60564c420a31bd0f5524447999694589";

const sha256 = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");

async function worker(payload) {
  const preparedBytes = fs.readFileSync(payload.preparedPath);
  const rootCompressed = fs.readFileSync(payload.rootPath);
  assert.equal(sha256(preparedBytes), PREPARED_SHA256);
  assert.equal(sha256(rootCompressed), ROOT_COMPRESSED_SHA256);
  assert.equal(fs.statSync(payload.preparedPath).mode & 0o222, 0);
  assert.equal(fs.statSync(payload.rootPath).mode & 0o222, 0);
  const rootBytes = zlib.gunzipSync(rootCompressed);
  assert.equal(sha256(rootBytes), ROOT_SHA256);
  const host = require("./row13_terminal_transaction_host.cjs");
  const receipt = await host.runPreparedComplete(
    JSON.parse(preparedBytes),
    JSON.parse(rootBytes),
    payload.outputDirectory,
  );
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

function rejectBoundaryMutations(prepared, root) {
  const host = require("./row13_terminal_transaction_host.cjs");
  let rejected = 0;
  const reject = (changePrepared, changeRoot) => {
    const p = structuredClone(prepared);
    const r = structuredClone(root);
    changePrepared?.(p);
    changeRoot?.(r);
    assert.throws(() => host.synthesizeMetadata(p, r));
    rejected += 1;
  };
  reject((value) => {
    value.authoritySha256 = "0".repeat(64);
  });
  reject((value) => {
    value.data.prep_polynomial[0] = "11";
  });
  reject(null, (value) => {
    value.authority.preparedAuthoritySha256 = "0".repeat(64);
  });
  reject(null, (value) => {
    value.factor.packetIdeals[0] = "1";
  });
  reject(null, (value) => {
    value.relations.state[0] = "55";
  });
  return rejected;
}

function main() {
  if (process.argv[2] === "--worker") {
    return worker(JSON.parse(fs.readFileSync(0, "utf8")));
  }
  const preparedPath = path.resolve(process.argv[2] || DEFAULT_PREPARED);
  const rootPath = path.resolve(process.argv[3] || DEFAULT_ROOT);
  const w0Path = path.resolve(process.argv[4] || DEFAULT_W0);
  const outputDirectory = path.resolve(process.argv[5] || DEFAULT_OUTPUT);
  const preparedBytes = fs.readFileSync(preparedPath);
  const rootCompressed = fs.readFileSync(rootPath);
  assert.equal(sha256(preparedBytes), PREPARED_SHA256);
  assert.equal(sha256(rootCompressed), ROOT_COMPRESSED_SHA256);
  const rootBytes = zlib.gunzipSync(rootCompressed);
  assert.equal(sha256(rootBytes), ROOT_SHA256);
  const prepared = JSON.parse(preparedBytes);
  const root = JSON.parse(rootBytes);
  let mutationsRejected = rejectBoundaryMutations(prepared, root);

  const run = spawnSync(
    "prlimit",
    [
      "--as=4294967296",
      "--rss=4294967296",
      "--cpu=600",
      "--",
      process.execPath,
      "--expose-gc",
      __filename,
      "--worker",
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      input: JSON.stringify({ preparedPath, rootPath, outputDirectory }),
      timeout: 600_000,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072" },
    },
  );
  assert.equal(run.status, 0, run.stderr || run.stdout || String(run.error));
  const receipt = JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(
    receipt.schema,
    "sagejs.pari-class-group/row13-prepared-complete-receipt-v1",
  );
  assert.equal(receipt.correspondenceComplete, true);
  assert.equal(receipt.publicComplete, false);
  assert.equal(receipt.frozenW0RuntimeInput, false);
  assert.deepEqual(receipt.relationState, [
    "1006",
    "10110",
    "0",
    "0",
    "1006",
    "1006",
  ]);
  assert.equal(receipt.collectionPasses, 10);
  assert.deepEqual(receipt.classGroup, {
    invariantFactors: ["2"],
    classNumber: "2",
  });
  assert.equal(receipt.unitMaterialization, "not_given(LARGE)");
  assert(receipt.maxRssKiB < 4 * 1024 * 1024);
  assert(BigInt(receipt.elapsedNs) < 600_000_000_000n);
  const bytes = fs.readFileSync(receipt.path);
  assert.equal(sha256(bytes), receipt.sha256);
  assert.equal(bytes.length, receipt.bytes);
  assert.equal(fs.statSync(receipt.path).mode & 0o777, 0o444);
  const envelope = JSON.parse(bytes);
  assert.deepEqual(envelope.payload.classGroup.invariantFactors, ["2"]);
  assert.equal(envelope.payload.classGroup.classNumber, "2");
  assert.deepEqual(envelope.payload.unitGroup.materialization, {
    precisionBits: "256",
    reason: "LARGE",
    tag: "not_given",
  });
  const changed = Buffer.from(bytes);
  changed[changed.length - 2] ^= 1;
  assert.notEqual(sha256(changed), receipt.sha256);
  mutationsRejected += 1;
  assert.equal(receipt.mutationChecks, 8);
  mutationsRejected += receipt.mutationChecks;

  // Frozen W0 is admitted only after the capped connected worker exits.
  const w0Bytes = fs.readFileSync(w0Path);
  assert.equal(sha256(w0Bytes), W0_SHA256);
  const w0 = JSON.parse(w0Bytes);
  const result = w0.events.find((entry) => entry.event === "result");
  const units = w0.events.find((entry) => entry.event === "fundamental_units");
  assert.deepEqual(result.invariants.map(String), ["2"]);
  assert.equal(String(result.classNumber), "2");
  assert.equal(units.fu, null);
  console.log(
    JSON.stringify(
      {
        ...receipt,
        mutationChecks: mutationsRejected,
        mutationsRejected,
        w0Sha256: W0_SHA256,
        postcomputeDifferential: {
          invariants: result.invariants.map(String),
          classNumber: String(result.classNumber),
          fundamentalUnits: "not materialized",
        },
        limits: {
          addressSpaceBytes: 4 * 1024 ** 3,
          rssBytes: 4 * 1024 ** 3,
          cpuSeconds: 600,
          wallTimeoutSeconds: 600,
          nodeOldSpaceMiB: 3072,
        },
        runtimeInputs: [
          "authenticated prepared-nf projection",
          "immutable prepared-root owner",
        ],
        excludedRuntimeInputs: [
          "W0",
          "accepted relation owner",
          "post-1006 answer",
          "class witness owner",
          "unit owner",
          "C7 envelope",
        ],
      },
      null,
      2,
    ),
  );
}

Promise.resolve(main()).catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

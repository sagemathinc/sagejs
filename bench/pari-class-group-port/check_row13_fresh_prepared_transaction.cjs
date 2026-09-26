#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_PREPARED =
  "/tmp/row13-prepared-projection-8e982cf9703ced18cb815b5d18bcdf3596b28c8b455ff8c01cb1cd9f5a8aad51.json";
const DEFAULT_OUTPUT = "/tmp/sagejs-row13-fresh-prepared-transaction";
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-13-a0f7253a51b3045a.json";
const W0_SHA256 =
  "50df5fa8a7b676b5216fecf2f57f3c9c60564c420a31bd0f5524447999694589";
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

async function worker(request) {
  const transaction = require("./row13_fresh_prepared_transaction.cjs");
  const receipt = await transaction.runFreshPreparedRequest(request);
  assert.equal(transaction.isAuthenticFreshReceipt(receipt), true);
  assert.equal(transaction.isAuthenticFreshReceipt({ ...receipt }), false);
  assert(receipt.verifiedResult,
    "fresh transaction did not retain its replay-verified neutral result");
  assert.equal(Object.keys(receipt).includes("verifiedResult"), false);
  const roots = require("./phase5_development_roots.cjs");
  const fresh = require("./fresh_prepared_development_registry.cjs");
  const core = require("./qualification_execution_core.cjs");
  const root = roots.developmentRoot(13);
  const admitted = fresh.admitRegisteredFreshReceipt({ root, receipt });
  const correctness = await core.runDevelopmentCorrectnessPath({
    root, invoke: async () => admitted,
  });
  assert.equal(correctness.freshPreparedExecution, true);
  assert.throws(() => fresh.admitRegisteredFreshReceipt({
    root, receipt: { ...receipt },
  }), /transaction-local brand/);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

function rejectPreparedMutations(prepared) {
  const transaction = require("./row13_fresh_prepared_transaction.cjs");
  let rejected = 0;
  for (const mutate of [
    (value) => { value.prep_polynomial[0] = "-20000000009"; },
    (value) => { value.analytic_discriminant = "1"; },
    (value) => { value.prep_zk[0] = "2"; },
    (value) => { value.basis_table[0] = "2"; },
    (value) => { value.preparation_rounded_embedding[0] = "2"; },
    (value) => { [value.admission_primes[0], value.admission_primes[1]] =
      [value.admission_primes[1], value.admission_primes[0]]; },
    (value) => { value.admission_products[0] = "1"; },
    (value) => { value.unreviewed = "1"; },
  ]) {
    const changed = structuredClone(prepared);
    mutate(changed);
    assert.throws(() => transaction.validatePreparedData(changed));
    rejected += 1;
  }
  return rejected;
}

async function rejectInjections(prepared, outputDirectory) {
  const transaction = require("./row13_fresh_prepared_transaction.cjs");
  let rejected = 0;
  for (const injection of [
    { preparedInitialOwner: {} },
    { gateCOwner: {} },
    { acceptedOwnerPath: "/tmp/owner" },
    { post1006Path: "/tmp/post1006" },
    { classOwner: {} },
    { unitOwner: {} },
    { c7EnvelopePath: "/tmp/c7" },
  ]) {
    await assert.rejects(transaction.runFreshPreparedRequest({
      prepared, outputDirectory, ...injection,
    }));
    rejected += 1;
  }
  return rejected;
}

async function main() {
  if (process.argv[2] === "--worker")
    return worker(JSON.parse(fs.readFileSync(0, "utf8")));
  const preparedPath = path.resolve(process.argv[2] || DEFAULT_PREPARED);
  const outputDirectory = path.resolve(process.argv[3] || DEFAULT_OUTPUT);
  const envelope = JSON.parse(fs.readFileSync(preparedPath));
  assert.deepEqual(Object.keys(envelope).sort(), ["authoritySha256", "data"]);
  const prepared = envelope.data;
  const preparedMutationsRejected = rejectPreparedMutations(prepared);
  const injectionsRejected = await rejectInjections(prepared, outputDirectory);
  const run = spawnSync("prlimit", ["--as=4294967296", "--rss=4294967296",
    "--cpu=600", "--", process.execPath, "--expose-gc", __filename, "--worker"], {
    cwd: ROOT,
    encoding: "utf8",
    input: JSON.stringify({ prepared, outputDirectory }),
    timeout: 600_000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072",
      SAGEJS_NATIVE_CACHE_DIR:
        process.env.SAGEJS_NATIVE_CACHE_DIR || "/scratch/sagejs-row13-fresh-native-cache" },
  });
  assert.equal(run.status, 0, run.stderr || run.stdout || String(run.error));
  const receipt = JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(receipt.schema,
    "sagejs.pari-class-group/row13-fresh-prepared-receipt-v1");
  assert.equal(receipt.freshPreparedExecution, true);
  assert.equal(receipt.retainedRuntimeInputs, false);
  assert.equal(receipt.frozenW0RuntimeInput, false);
  assert.equal(receipt.telemetryIdentityNeutral, true);
  assert.equal(receipt.semanticMutationsRejected, 3);
  assert.deepEqual(receipt.runtimeInputs,
    ["normalized authenticated prepared-NF data"]);
  assert.equal(receipt.correspondenceComplete, true);
  assert.equal(receipt.publicComplete, false);
  assert.deepEqual(receipt.relationState,
    ["1006", "10110", "0", "0", "1006", "1006"]);
  assert.deepEqual(receipt.classGroup,
    { invariantFactors: ["2"], classNumber: "2" });
  assert.equal(receipt.unitMaterialization, "not_given(LARGE)");
  for (const publication of [receipt.result, receipt.receipt]) {
    const bytes = fs.readFileSync(publication.path);
    assert.equal(sha256(bytes), publication.sha256);
    assert.equal(bytes.length, publication.bytes);
    assert.equal(fs.statSync(publication.path).mode & 0o222, 0);
  }

  // W0 is an external differential oracle only after both publications exist.
  const w0Bytes = fs.readFileSync(W0);
  assert.equal(sha256(w0Bytes), W0_SHA256);
  const w0 = JSON.parse(w0Bytes);
  const result = w0.events.find((entry) => entry.event === "result");
  const units = w0.events.find((entry) => entry.event === "fundamental_units");
  assert.deepEqual(result.invariants.map(String), receipt.classGroup.invariantFactors);
  assert.equal(String(result.classNumber), receipt.classGroup.classNumber);
  assert.equal(units.fu, null);
  process.stdout.write(`${JSON.stringify({ ...receipt, preparedMutationsRejected,
    injectionsRejected, w0PostPublicationDifferential: true }, null, 2)}\n`);
}

Promise.resolve(main()).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

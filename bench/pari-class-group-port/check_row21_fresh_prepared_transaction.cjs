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
  "/scratch/sagejs-row21-first-hnf-inputs/prepared.json";
const DEFAULT_OUTPUT = "/tmp/sagejs-row21-fresh-prepared-transaction";
const DEFAULT_W0 =
  "/scratch/sagejs-pari-development-panel-a998/panel-21-6966124ec38a3af1.json";
const W0_SHA256 =
  "45087efb874a7c756e0695ea8c79873cdfc22cfe5702c24df18619d368622b5a";
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function loadPrepared(filename) {
  const value = JSON.parse(fs.readFileSync(filename));
  return Object.keys(value).sort().join(",") === "authoritySha256,data"
    ? value.data : value;
}

function focusedChecks(prepared) {
  const transaction = require("./row21_fresh_prepared_transaction.cjs");
  const authenticated = transaction.validatePreparedData(prepared);
  assert.equal(authenticated.authoritySha256,
    transaction.PREPARED_AUTHORITY_SHA256);
  assert.notEqual(authenticated.data, prepared);
  let preparedMutationsRejected = 0;
  for (const mutate of [
    value => { value.prep_polynomial[0] = "37"; },
    value => { value.analytic_discriminant = "1"; },
    value => { value.prep_zk[0] = "2"; },
    value => { value.basis_table[124] =
      String(BigInt(value.basis_table[124]) + 1n); },
    value => { [value.admission_primes[0], value.admission_primes[1]] =
      [value.admission_primes[1], value.admission_primes[0]]; },
    value => { value.admission_products[0] = "1"; },
    value => { value.unreviewedOwner = {}; },
  ]) {
    const changed = structuredClone(prepared);
    mutate(changed);
    assert.throws(() => transaction.validatePreparedData(changed));
    preparedMutationsRejected += 1;
  }
  const synthetic = {
    schema: transaction.RECEIPT_SCHEMA,
    freshPreparedExecution: true,
    correspondenceComplete: true,
  };
  assert.equal(transaction.isAuthenticFreshReceipt(synthetic), false);
  assert.equal(transaction.isAuthenticFreshReceipt(new Proxy(synthetic, {})), false);
  return { preparedMutationsRejected, syntheticReceiptsRejected: 2 };
}

async function worker(request) {
  const transaction = require("./row21_fresh_prepared_transaction.cjs");
  const neutral = require("./class_unit_correspondence_result.cjs");
  const receipt = await transaction.runFreshPreparedRequest(request);
  assert.equal(transaction.isAuthenticFreshReceipt(receipt), true);
  assert.equal(transaction.isAuthenticFreshReceipt({ ...receipt }), false);
  assert(receipt.verifiedResult instanceof
    neutral.ImmutableClassUnitCorrespondenceResult);
  assert.equal(Object.keys(receipt).includes("verifiedResult"), false);
  const roots = require("./phase5_development_roots.cjs");
  const registry = require("./fresh_prepared_development_registry.cjs");
  const core = require("./qualification_execution_core.cjs");
  const root = roots.developmentRoot(21);
  const admitted = registry.admitRegisteredFreshReceipt({ root, receipt });
  const correctness = await core.runDevelopmentCorrectnessPath({
    root, invoke: async () => admitted,
  });
  assert.equal(correctness.freshPreparedExecution, true);
  assert.throws(() => registry.admitRegisteredFreshReceipt({
    root, receipt: { ...receipt },
  }), /transaction-local brand/);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

function postPublicationOracle(w0Path, receipt) {
  const raw = fs.readFileSync(w0Path);
  assert.equal(sha256(raw), W0_SHA256);
  const w0 = JSON.parse(raw);
  const acceptance = w0.events.find(event => event.event === "acceptance");
  const units = w0.events.find(event => event.event === "fundamental_units");
  assert.equal(String(acceptance.h), receipt.classGroup.classNumber);
  assert.equal(units.fu.values.length, receipt.exactUnitCount);
  return { sha256: W0_SHA256, classNumber: "1", exactUnitCount: 3 };
}

async function main() {
  if (process.argv[2] === "--worker")
    return worker(JSON.parse(fs.readFileSync(0, "utf8")));
  const focusedOnly = process.argv.includes("--focused");
  const positional = process.argv.slice(2).filter(value => value !== "--focused");
  const preparedPath = path.resolve(positional[0] || DEFAULT_PREPARED);
  const outputDirectory = path.resolve(positional[1] || DEFAULT_OUTPUT);
  const w0Path = path.resolve(positional[2] || DEFAULT_W0);
  const prepared = loadPrepared(preparedPath);
  const focused = focusedChecks(prepared);

  const transaction = require("./row21_fresh_prepared_transaction.cjs");
  await assert.rejects(transaction.runFreshPreparedRequest({
    prepared, outputDirectory, factorOwner: {},
  }));
  const report = { schema:
    "sagejs.pari-class-group/row21-fresh-prepared-focused-check-v1",
  ...focused, ownerInjectionRejected: true };
  if (focusedOnly) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const run = spawnSync("prlimit", ["--as=4294967296", "--rss=4294967296",
    "--cpu=600", "--", process.execPath, "--expose-gc", __filename, "--worker"], {
    cwd: ROOT,
    encoding: "utf8",
    input: JSON.stringify({ prepared, outputDirectory }),
    timeout: 600_000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072" },
  });
  assert.equal(run.status, 0, run.stderr || run.stdout || String(run.error));
  const receipt = JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(receipt.schema,
    "sagejs.pari-class-group/row21-fresh-prepared-receipt-v1");
  assert.equal(receipt.freshPreparedExecution, true);
  assert.equal(receipt.retainedRuntimeInputs, false);
  assert.equal(receipt.retainedOwnersRuntimeInputs, false);
  assert.equal(receipt.frozenW0RuntimeInput, false);
  assert.deepEqual(receipt.runtimeInputs,
    ["authenticated normalized prepared-NF data"]);
  assert.deepEqual(receipt.classGroup,
    { invariantFactors: [], classNumber: "1" });
  assert.equal(receipt.unitMaterialization, "exact_units");
  assert.equal(receipt.exactUnitCount, 3);
  assert.equal(receipt.torsionOrder, "2");
  assert.equal(receipt.correspondenceComplete, true);
  assert.equal(receipt.publicComplete, false);
  for (const forbidden of ["elapsedNs", "stageElapsedNs", "maxRssKiB",
    "reserve", "capacityReserve"])
    assert.equal(Object.hasOwn(receipt, forbidden), false);
  const resultRaw = fs.readFileSync(receipt.result.path);
  assert.equal(sha256(resultRaw), receipt.result.sha256);
  assert.equal(resultRaw.length, receipt.result.bytes);
  assert.equal(fs.statSync(receipt.result.path).mode & 0o222, 0);

  // W0 is first opened after the immutable neutral result is published.
  const oracle = postPublicationOracle(w0Path, receipt);
  process.stdout.write(`${JSON.stringify({ ...report,
    schema: "sagejs.pari-class-group/row21-fresh-prepared-check-v1",
    receipt, postPublicationOracle: oracle }, null, 2)}\n`);
}

Promise.resolve(main()).catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

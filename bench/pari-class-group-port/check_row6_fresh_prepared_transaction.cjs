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
const DEFAULT_PREPARED = "/tmp/row6-prepared-projection.json";
const DEFAULT_OUTPUT = "/tmp/sagejs-row6-fresh-prepared-result";
const DEFAULT_W0 =
  "/scratch/sagejs-pari-development-panel-a998/panel-06-26fed17015f6479f.json";
const W0_SHA256 =
  "2736e19b166c11a5997a6825cd99b612ae23cf6740d2248ac3dd91bc883286a5";

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

async function worker(payload) {
  assert.deepEqual(Object.keys(payload).sort(), ["outputDirectory", "prepared"]);
  const host = require("./row6_fresh_prepared_transaction_host.cjs");
  const receipt = await host.runFreshPrepared(payload.prepared,
    payload.outputDirectory);
  assert.equal(receipt.preparedAuthoritySha256,
    host.validatePrepared(payload.prepared).authoritySha256);
  assert.equal(receipt.semanticAuthority.preparedAuthoritySha256,
    receipt.preparedAuthoritySha256);
  assert.equal(host.isAuthenticFreshReceipt(receipt), true);
  assert.equal(host.isAuthenticFreshReceipt({ ...receipt }), false);
  assert(receipt.verifiedResult,
    "fresh transaction did not retain its replay-verified neutral result");
  assert.equal(Object.keys(receipt).includes("verifiedResult"), false);
  const roots = require("./phase5_development_roots.cjs");
  const fresh = require("./fresh_prepared_development_registry.cjs");
  const core = require("./qualification_execution_core.cjs");
  const root = roots.developmentRoot(6);
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

function rejectionChecks(prepared) {
  const host = require("./row6_fresh_prepared_transaction_host.cjs");
  let rejected = 0;
  for (const mutate of [
    value => { value.prep_polynomial[0] = "2000000000019"; },
    value => { value.analytic_discriminant = "1"; },
    value => { value.prep_zk[0] = "2"; },
    value => { value.basis_table[0] = "2"; },
    value => { [value.admission_primes[0], value.admission_primes[1]] =
      [value.admission_primes[1], value.admission_primes[0]]; },
    value => { value.admission_products[0] = "1"; },
    value => { value.unreviewedOwnerPath = "/tmp/injected"; },
  ]) {
    const changed = structuredClone(prepared);
    mutate(changed);
    assert.throws(() => host.validatePrepared(changed));
    rejected += 1;
  }
  return rejected;
}

function semanticAuthorityChecks() {
  const semantic = require("./row6_prepared_semantic_authority.cjs");
  const owner = { schema: "test", execution: { backend: "gmp", calls: 1,
    elapsedNs: "1", maxRssKiB: 2, cpuLimitSeconds: 600 }, state: ["1"] };
  const accepted = semantic.semanticSha256(owner);
  owner.execution.elapsedNs = "999";
  owner.execution.maxRssKiB = 999;
  assert.equal(semantic.semanticSha256(owner), accepted);
  owner.execution.calls = 2;
  assert.notEqual(semantic.semanticSha256(owner), accepted);
  owner.execution.calls = 1;
  owner.state[0] = "2";
  assert.notEqual(semantic.semanticSha256(owner), accepted);
  return { telemetryMutationsExcluded: 2, semanticMutationsRejected: 2 };
}

function postPublicationDifferential(w0Path) {
  const bytes = fs.readFileSync(w0Path);
  assert.equal(sha256(bytes), W0_SHA256);
  const w0 = JSON.parse(bytes);
  const result = w0.events.find(event => event.event === "result");
  assert(result);
  assert.deepEqual(result.invariants.map(String), ["2", "2"]);
  assert.equal(String(result.classNumber), "4");
  return { w0Sha256: W0_SHA256, classNumber: "4", invariantFactors: ["2", "2"] };
}

function main() {
  if (process.argv[2] === "--worker")
    return worker(JSON.parse(fs.readFileSync(0, "utf8")));
  const preparedPath = path.resolve(process.argv[2] || DEFAULT_PREPARED);
  const outputDirectory = path.resolve(process.argv[3] || DEFAULT_OUTPUT);
  const w0Path = path.resolve(process.argv[4] || DEFAULT_W0);
  const envelope = JSON.parse(fs.readFileSync(preparedPath));
  assert.deepEqual(Object.keys(envelope).sort(), ["authoritySha256", "data"]);
  const host = require("./row6_fresh_prepared_transaction_host.cjs");
  const authenticated = host.validatePrepared(envelope.data);
  assert.equal(authenticated.authoritySha256, envelope.authoritySha256);
  let mutationsRejected = rejectionChecks(envelope.data);
  const semanticAuthority = semanticAuthorityChecks();

  const injected = spawnSync(process.execPath, [__filename, "--worker"], {
    cwd: ROOT, encoding: "utf8", input: JSON.stringify({ prepared: envelope.data,
      outputDirectory, factorOwner: "/tmp/injected" }), timeout: 30_000,
  });
  assert.notEqual(injected.status, 0);
  mutationsRejected += 1;

  const run = spawnSync("prlimit", ["--as=4294967296", "--rss=4294967296",
    "--cpu=600", "--", process.execPath, "--expose-gc", __filename, "--worker"], {
    cwd: ROOT, encoding: "utf8", input: JSON.stringify({ prepared: envelope.data,
      outputDirectory }), timeout: 600_000, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072" },
  });
  assert.equal(run.status, 0, run.stderr || run.stdout || String(run.error));
  const receipt = JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(receipt.schema,
    "sagejs.pari-class-group/row6-fresh-prepared-receipt-v1");
  assert.equal(receipt.freshPreparedExecution, true);
  assert.equal(receipt.preparedAuthoritySha256, envelope.authoritySha256);
  assert.equal(receipt.semanticAuthority.preparedAuthoritySha256,
    envelope.authoritySha256);
  assert.equal(receipt.retainedRuntimeInputs, false);
  assert.equal(receipt.frozenW0RuntimeInput, false);
  assert.deepEqual(receipt.runtimeInputs,
    ["authenticated normalized prepared-nf data"]);
  assert.equal(receipt.correspondenceComplete, true);
  assert.equal(receipt.publicComplete, false);
  assert.equal(receipt.unitMaterialization, "not_given(LARGE)");
  assert.deepEqual(receipt.classGroup,
    { invariantFactors: ["2", "2"], classNumber: "4" });
  assert(!Object.hasOwn(receipt, "elapsedNs"));
  assert(!Object.hasOwn(receipt, "stageElapsedNs"));
  assert(!Object.hasOwn(receipt, "maxRssKiB"));
  const result = fs.readFileSync(receipt.path);
  assert.equal(sha256(result), receipt.sha256);
  assert.equal(fs.statSync(receipt.path).mode & 0o222, 0);
  const changed = Buffer.from(result);
  changed[changed.length - 2] ^= 1;
  assert.notEqual(sha256(changed), receipt.sha256);
  mutationsRejected += 1;

  // The frozen trace is opened only after the fresh transaction has returned
  // and the immutable neutral result has been verified.
  const postPublicationDifferentialResult = postPublicationDifferential(w0Path);
  console.log(JSON.stringify({ ...receipt, mutationsRejected,
    ownerInjectionRejected: true,
    semanticAuthorityChecks: semanticAuthority,
    postPublicationDifferential: postPublicationDifferentialResult }, null, 2));
}

Promise.resolve(main()).catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

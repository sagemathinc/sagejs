"use strict";

// Separate correctness-only row-21 transaction for PARI's unequal-bound
// honesty call site.  The default equal-bound aggregate transaction is not
// imported or modified here.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const authentication = require("./prepared_nf_authentication.cjs");
const defaultFactor = require("./row21_factor_base_coordinator.cjs");
const customFactor = require("./row21_honesty_factor_owner.cjs");

const ROOT = path.resolve(__dirname, "../..");
const RESIDENT = path.join(__dirname, "row21_honesty_resident_root.py");
const RECEIPT_SCHEMA =
  "sagejs.pari-class-group/row21-honesty-fresh-prepared-receipt-v1";
const FRESH_RECEIPTS = new WeakSet();

function validatePrepared(prepared) {
  const authority = authentication.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, customFactor.PREPARED_SHA256,
    "row21 honesty received a different prepared field");
  return { authoritySha256: authority.sha256, data: structuredClone(prepared) };
}

function runResident(request) {
  const launcher = String.raw`import runpy,sys
sys.path.append(sys.argv[1])
runpy.run_module("bench.pari-class-group-port.row21_honesty_resident_root",run_name="__main__")`;
  const child = spawnSync("python3", ["-c", launcher,
    path.join(ROOT, "src/lib")], {
    cwd: ROOT,
    input: JSON.stringify(request),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    timeout: 900_000,
  });
  assert.equal(child.status, 0, child.stderr || String(child.error));
  return JSON.parse(child.stdout);
}

function mutateEnvelope(envelope, mutate) {
  const candidate = structuredClone(envelope);
  mutate(candidate.payload);
  candidate.payloadSha256 = customFactor.sha256(
    customFactor.canonicalBytes(candidate.payload));
  return candidate;
}

function publishAtomic(directory, envelope) {
  fs.mkdirSync(directory, { recursive: true });
  const bytes = Buffer.concat([customFactor.canonicalBytes(envelope), Buffer.from("\n")]);
  const sha256 = customFactor.sha256(bytes);
  const destination = path.join(directory,
    `row21-honesty-owner-${sha256}.json`);
  const temporary = path.join(directory,
    `.row21-honesty-owner-${process.pid}-${Date.now()}-${Math.random()}.tmp`);
  fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o400 });
  try {
    try {
      fs.linkSync(temporary, destination);
      fs.chmodSync(destination, 0o444);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      assert.deepEqual(fs.readFileSync(destination), bytes,
        "content-addressed honesty publication contains different bytes");
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return { path: destination, sha256, bytes: bytes.length };
}

async function runFreshPrepared(prepared, outputDirectory) {
  assert.equal(typeof outputDirectory, "string");
  const preparedEnvelope = validatePrepared(prepared);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(),
    "sagejs-row21-honesty-fresh-"));
  fs.chmodSync(temporary, 0o700);
  try {
    const defaultResult = await defaultFactor.run({
      outputDirectory: path.join(temporary, "default-factor"),
      prepared: preparedEnvelope.data,
      preparedAuthoritySha256: preparedEnvelope.authoritySha256,
    });
    const factor = customFactor.derive(defaultResult);
    const factorBytes = customFactor.canonicalBytes(factor.owner);
    assert.equal(customFactor.sha256(factorBytes), factor.ownerSha256);
    const factorPath = path.join(temporary,
      `row21-honesty-factor-${factor.ownerSha256}.json`);
    fs.writeFileSync(factorPath, factorBytes, { flag: "wx", mode: 0o400 });
    assert.deepEqual(fs.readFileSync(factorPath), factorBytes,
      "same-run custom factor owner changed before honesty");

    const request = {
      operation: "compute",
      prepared: preparedEnvelope.data,
      preparedSha256: preparedEnvelope.authoritySha256,
      factorOwner: factor.owner,
      factorOwnerSha256: factor.ownerSha256,
    };
    const envelope = runResident(request);
    const mutations = [
      {
        name: "custom-C1",
        candidate: envelope,
        factorOwner: structuredClone(factor.owner),
      },
      {
        name: "live-probe-status",
        candidate: mutateEnvelope(envelope,
          payload => { payload.transcript.rows[0].status = 0; }),
      },
      {
        name: "KCZ-restoration",
        candidate: mutateEnvelope(envelope,
          payload => { payload.transcript.schedulerState[0] = 6; }),
      },
      {
        name: "one-shot-KCZ2",
        candidate: mutateEnvelope(envelope,
          payload => { payload.transcript.driverCallsite.kcz2After = 10; }),
      },
    ];
    mutations[0].factorOwner.bounds.C1 = "6";
    mutations[0].factorOwnerSha256 = customFactor.sha256(
      customFactor.canonicalBytes(mutations[0].factorOwner));
    const replay = runResident({
      ...request,
      operation: "replay-many",
      candidate: envelope,
      mutations,
    });
    assert.equal(replay.acceptedPayloadSha256, envelope.payloadSha256);
    assert.deepEqual(replay.mutationsRejected.map(row => row.name),
      ["custom-C1", "live-probe-status", "KCZ-restoration", "one-shot-KCZ2"]);

    const publication = publishAtomic(outputDirectory, envelope);
    const transcript = envelope.payload.transcript;
    const receipt = {
      schema: RECEIPT_SCHEMA,
      preparedAuthoritySha256: preparedEnvelope.authoritySha256,
      sameRunDefaultFactorOwnerSha256: defaultResult.ownerSha256,
      customFactorOwnerSha256: factor.ownerSha256,
      honestyOwner: publication,
      payloadSha256: envelope.payloadSha256,
      transcriptSha256: transcript.sha256,
      sageComputedLiveStatuses: transcript.rows.map(row => row.status),
      acceptedPariStatusAsRuntimeInput: false,
      probes: transcript.rows.length,
      kczIncrements: envelope.payload.outcome.kczIncrements,
      kczRestorations: envelope.payload.outcome.kczRestorations,
      finalKCZ: envelope.payload.outcome.finalKCZ,
      finalKCZ2: envelope.payload.outcome.finalKCZ2,
      publicationBeforeUnitReconstruction:
        envelope.payload.outcome.publicationBeforeUnitReconstruction,
      coldReplayVerified: true,
      mutationsRejected: replay.mutationsRejected,
      atomicPublication: true,
      idempotentPublication: true,
      correctnessOnly: true,
      timingClaim: false,
      retainedRuntimeInputs: false,
      excludedRuntimeInputs: ["PARI collector statuses", "PARI branch result"],
      generalAutomorphismClaim: false,
      failedProbeRetryClaim: false,
    };
    Object.defineProperty(receipt, "envelope", {
      configurable: false, enumerable: false, value: envelope, writable: false,
    });
    FRESH_RECEIPTS.add(receipt);
    return receipt;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

async function runFreshPreparedRequest(request) {
  assert(request && typeof request === "object" && !Array.isArray(request));
  assert.deepEqual(Object.keys(request).sort(), ["outputDirectory", "prepared"]);
  return runFreshPrepared(request.prepared, request.outputDirectory);
}

function isAuthenticFreshReceipt(receipt) {
  return FRESH_RECEIPTS.has(receipt);
}

module.exports = {
  RECEIPT_SCHEMA,
  isAuthenticFreshReceipt,
  runFreshPrepared,
  runFreshPreparedRequest,
  validatePrepared,
};

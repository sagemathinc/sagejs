"use strict";

// Standard transaction wrapper for the row-3 prepared-only experiment.  The
// mathematical graph remains private; only an immutable neutral result and a
// module-branded receipt cross this boundary.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const auth = require("./prepared_nf_authentication.cjs");
const initial = require("./row3_prepared_initial_base_frontier.cjs");
const continuation = require("./row3_prepared_relation_hnf_frontier.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");

const SCHEMA = "sagejs.pari-class-group/row3-fresh-prepared-receipt-v1";
const REPLAY_SCHEMA = "sagejs.pari-class-group/row3-fresh-prepared-replay-v1";
const PREPARED_SHA256 =
  "8dd27ea0c2f070e34964db79efcc03fa60e869891c996aba9f51b0291a97f41f";
const PREPARED_KEYS = ["admission_factorlimit", "admission_matrix_e",
  "admission_matrix_m", "admission_matrix_p", "admission_prime_limit",
  "admission_primes", "admission_products", "admission_real_count",
  "analytic_discriminant", "analytic_primes", "analytic_roots_of_unity",
  "basis_table", "n", "precision", "prep_index", "prep_invzk",
  "prep_polynomial", "prep_zk", "prep_zk_degrees", "prep_zkden",
  "preparation_embedding", "preparation_rounded_embedding"];
const FRESH_RECEIPTS = new WeakSet();

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function validatePrepared(prepared) {
  assert(prepared && typeof prepared === "object" && !Array.isArray(prepared));
  assert.deepEqual(Object.keys(prepared).sort(), PREPARED_KEYS);
  const authority = auth.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, PREPARED_SHA256,
    "prepared input is outside the reviewed row-3 corridor");
  return { authoritySha256: authority.sha256,
    data: structuredClone(prepared) };
}

function publishImmutable(raw, outputDirectory) {
  const digest = sha256(raw);
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  const destination = path.join(outputDirectory,
    `row3-fresh-class-unit-${digest}.json`);
  if (fs.existsSync(destination)) {
    assert.equal(sha256(fs.readFileSync(destination)), digest);
    assert.equal(fs.statSync(destination).mode & 0o222, 0);
    return { path: destination, sha256: digest };
  }
  const temporary = path.join(outputDirectory,
    `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
  try {
    fs.writeFileSync(temporary, raw, { flag: "wx", mode: 0o400 });
    fs.renameSync(temporary, destination);
    fs.chmodSync(destination, 0o444);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
  return { path: destination, sha256: digest };
}

async function runFreshPrepared(prepared, outputDirectory) {
  const input = validatePrepared(prepared);
  assert.equal(typeof outputDirectory, "string");
  assert(outputDirectory.length > 0);
  const factor = await initial.run(input.data);
  const complete = await continuation.run(input.data, factor);
  assert.equal(complete.publication.correspondenceComplete, true);
  assert.equal(complete.publication.publicComplete, false);
  assert.equal(complete.provenance.frozenAnswerInputs, false);
  assert.equal(complete.correspondence.preparedNfLiveRoot, true);
  assert.equal(complete.correspondence.frozenW0UsedAsInput, false);

  const raw = Buffer.from(complete.correspondence.sealedEnvelopeHex, "hex");
  assert.equal(neutral.sha256Bytes(raw),
    complete.correspondence.sealedEnvelopeSha256);
  const envelope = JSON.parse(raw.toString("ascii"));
  const payloadSha256 = envelope.payloadSha256;
  const mathematicalAuthoritySha256 = neutral.sha256Canonical({
    classNumber: complete.acceptance.classNumber,
    classWitnessSha256: sha256(Buffer.from(JSON.stringify(
      complete.units.classWitness))),
    invariants: complete.acceptance.invariants,
    preparedAuthoritySha256: input.authoritySha256,
    regulator: complete.acceptance.regulator,
    unitProvenanceSha256: sha256(Buffer.from(
      complete.units.units.rawUnitProvenance.join("\n"))),
  });
  const authority = neutral.createDetachedClassUnitAuthority({
    envelopeSha256: complete.correspondence.sealedEnvelopeSha256,
    mathematicalAuthoritySha256,
    replaySchema: REPLAY_SCHEMA,
    replay: payload => {
      assert.equal(neutral.sha256Canonical(payload), payloadSha256);
      assert.equal(payload.field.id, complete.field.id);
      assert.equal(payload.classGroup.classNumber,
        complete.acceptance.classNumber);
      assert.deepEqual(payload.classGroup.invariantFactors,
        complete.acceptance.invariants);
      assert.equal(payload.terminal.correspondence_complete, true);
      assert.equal(payload.terminal.public_complete, false);
      return { schema: REPLAY_SCHEMA, payloadSha256,
        fieldId: complete.field.id, mathematicalAuthoritySha256,
        correspondence_complete: true, public_complete: false };
    },
  });
  const verifiedResult = neutral.verifyClassUnitCorrespondenceResult(raw, authority);
  const durable = publishImmutable(verifiedResult.canonicalJSON(),
    path.resolve(outputDirectory));
  assert.equal(durable.sha256, verifiedResult.sha256);
  const receipt = {
    schema: SCHEMA,
    freshPreparedExecution: true,
    correspondenceComplete: true,
    publicComplete: false,
    retainedRuntimeInputs: false,
    retainedOwnersRuntimeInputs: false,
    frozenW0RuntimeInput: false,
    preparedNfLiveRoot: true,
    runtimeInputs: Object.freeze(["authenticated normalized prepared-nf data"]),
    qualifiedTiming: false,
    preparedAuthoritySha256: input.authoritySha256,
    mathematicalAuthoritySha256,
    path: durable.path,
    sha256: durable.sha256,
    classGroup: Object.freeze({ classNumber: complete.acceptance.classNumber,
      invariantFactors: Object.freeze([...complete.acceptance.invariants]) }),
    unitMaterialization: "not_given(LARGE)",
  };
  Object.defineProperty(receipt, "verifiedResult", {
    configurable: false, enumerable: false, value: verifiedResult,
    writable: false,
  });
  Object.freeze(receipt);
  FRESH_RECEIPTS.add(receipt);
  return receipt;
}

function isAuthenticFreshReceipt(receipt) {
  return FRESH_RECEIPTS.has(receipt);
}

module.exports = { isAuthenticFreshReceipt, runFreshPrepared, SCHEMA,
  validatePrepared };

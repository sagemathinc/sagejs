#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");

const adapter = require("./row19_class_unit_result_adapter.cjs");
const finalApi = require("./row19_final_result_coordinator.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");

const FINAL_COMPRESSED_SHA256 =
  "621ef9de8c162aa1ed0d2e51087efb22c69f09f8675c446ec737869190e6a136";
const CLASS_COMPRESSED_SHA256 =
  "8984679d4f8451192d803fef7787235e74f541c2c86a018e0d8584aff2f016ab";
const UNIT_COMPRESSED_SHA256 =
  "3c6b50dd3372bf8e7a840a2de5d0ae4933dba3cd09e02198e67288337601a326";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function descriptor(filename, ownerSha256, compressedSha256) {
  return { path: path.resolve(filename), ownerSha256, compressedSha256 };
}

function ownerMap(payload) {
  return new Map(payload.storage.map(owner => [owner.name, owner]));
}

function logical(owner) {
  assert(owner);
  return owner.entries.slice(0, Number(owner.logicalLength));
}

function boundary(owner, mathematicalAuthoritySha256) {
  const trusted = structuredClone(owner);
  return { owner, authority: { ownerSha256: adapter.FINAL_OWNER_SHA256,
    replaySchema: adapter.INPUT_REPLAY_SCHEMA,
    replay(candidate) {
      finalApi.verifyOwner(candidate, trusted.ancestry);
      assert.deepEqual(candidate, trusted);
      return { accepted: true, correspondenceComplete: true,
        fieldId: adapter.FIELD_ID, firstStageValuationCells: 424 * 423,
        generatorPowerEqualities: 9, mathematicalAuthoritySha256,
        ownerSha256: adapter.FINAL_OWNER_SHA256, publicComplete: false,
        schema: adapter.INPUT_REPLAY_SCHEMA,
        terminalValuationCells: 424 * 430 };
    } } };
}

function permissiveBoundary(owner, mathematicalAuthoritySha256) {
  return { owner, authority: { ownerSha256: adapter.FINAL_OWNER_SHA256,
    replaySchema: adapter.INPUT_REPLAY_SCHEMA,
    replay() { return { accepted: true, correspondenceComplete: true,
      fieldId: adapter.FIELD_ID, firstStageValuationCells: 424 * 423,
      generatorPowerEqualities: 9, mathematicalAuthoritySha256,
      ownerSha256: adapter.FINAL_OWNER_SHA256, publicComplete: false,
      schema: adapter.INPUT_REPLAY_SCHEMA, terminalValuationCells: 424 * 430 }; } } };
}

function publicationAuthority(prepared, trustedBoundary) {
  const raw = Buffer.from(prepared.sealedEnvelopeHex, "hex");
  const expected = adapter.prepareRow19ClassUnitResult(trustedBoundary);
  const expectedPayload = JSON.parse(Buffer.from(expected.sealedEnvelopeHex, "hex")).payload;
  return neutral.createDetachedClassUnitAuthority({
    envelopeSha256: neutral.sha256Bytes(raw),
    mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
    replaySchema: adapter.PUBLICATION_REPLAY_SCHEMA,
    replay(candidate) {
      assert.deepEqual(candidate, expectedPayload);
      return { correspondence_complete: true, fieldId: adapter.FIELD_ID,
        mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
        payloadSha256: neutral.sha256Canonical(candidate), public_complete: false,
        schema: adapter.PUBLICATION_REPLAY_SCHEMA };
    },
  });
}

function publishImmutable(raw, directory) {
  const digest = neutral.sha256Bytes(raw);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory,
    `row19-neutral-class-unit-result-${digest}.json`);
  if (fs.existsSync(destination)) {
    assert.equal(fs.statSync(destination).mode & 0o777, 0o444);
    assert.equal(sha(fs.readFileSync(destination)), digest);
  } else {
    const temporary = path.join(directory,
      `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    fs.writeFileSync(temporary, raw, { flag: "wx", mode: 0o400 });
    try { fs.renameSync(temporary, destination); fs.chmodSync(destination, 0o444); }
    catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  }
  return { bytes: raw.length, path: destination, sha256: digest };
}

function main(argv) {
  const [finalPath, terminalPath, firstPath, classPath, unitPath,
    outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row19-neutral-"))] = argv;
  assert(finalPath && terminalPath && firstPath && classPath && unitPath,
    "usage: check_row19_class_unit_result_adapter.cjs FINAL TERMINAL FIRST CLASS UNIT [OUTPUT]");
  const finalDescriptor = descriptor(finalPath, adapter.FINAL_OWNER_SHA256,
    FINAL_COMPRESSED_SHA256);
  const descriptors = {
    terminal: descriptor(terminalPath, finalApi.TERMINAL_SHA256,
      finalApi.TERMINAL_COMPRESSED_SHA256),
    first: descriptor(firstPath, finalApi.FIRST_SHA256, finalApi.FIRST_COMPRESSED_SHA256),
    classOwner: descriptor(classPath, finalApi.CLASS_SHA256, CLASS_COMPRESSED_SHA256),
    unit: descriptor(unitPath, finalApi.UNIT_SHA256, UNIT_COMPRESSED_SHA256),
  };
  const replayed = finalApi.replay(descriptors, finalDescriptor);
  const mathematicalAuthoritySha256 = neutral.sha256Canonical({
    classOwnerSha256: finalApi.CLASS_SHA256,
    finalOwnerSha256: adapter.FINAL_OWNER_SHA256,
    firstHnfOwnerSha256: finalApi.FIRST_SHA256,
    generatorPowerEqualities: 9,
    terminalOwnerSha256: finalApi.TERMINAL_SHA256,
    unitOwnerSha256: finalApi.UNIT_SHA256,
    valuationCells: [424 * 423, 424 * 430],
  });
  const trustedBoundary = boundary(replayed, mathematicalAuthoritySha256);
  const prepared = adapter.prepareRow19ClassUnitResult(trustedBoundary);
  assert.equal(prepared.correspondenceComplete, true);
  assert.equal(prepared.publicComplete, false);
  assert.equal(prepared.usedW0RuntimeData, false);
  assert.equal(prepared.freshPreparedInput, false);
  assert.equal(prepared.qualifiedTiming, false);
  const raw = Buffer.from(prepared.sealedEnvelopeHex, "hex");
  const payload = JSON.parse(raw).payload;
  neutral.validatePayload(payload);
  assert.deepEqual(payload.classGroup.invariantFactors,
    ["3", "3", "3", "3", "3", "3", "3", "3", "6"]);
  assert.equal(payload.classGroup.classNumber, "39366");
  assert.deepEqual(payload.unitGroup.materialization,
    { precisionBits: "192", reason: "LARGE", tag: "not_given" });
  assert.equal(payload.unitGroup.rank, "1");
  assert.equal(payload.honesty.outcome, "not-required");
  assert.equal(payload.terminal.correspondence_complete, true);
  assert.equal(payload.terminal.public_complete, false);
  const stores = ownerMap(payload);
  assert.equal(logical(stores.get("class-generator-ideals")).length, 81);
  assert.equal(logical(stores.get("principal-relation-transform")).length, 430 * 430);
  assert.equal(logical(stores.get("relation-records")).length, 424 * 430);
  assert.equal(logical(stores.get("factor-base")).length > 424 * 9, true);
  assert.deepEqual(logical(stores.get("torsion-generator")), ["-1", "0", "0"]);

  const publisher = new neutral.ClassUnitCorrespondencePublisher();
  const authority = publicationAuthority(prepared, trustedBoundary);
  const published = adapter.publishPreparedRow19ClassUnitResult(prepared, authority, publisher);
  assert.equal(adapter.publishPreparedRow19ClassUnitResult(prepared, authority, publisher),
    published);
  assert.equal(published.sha256, prepared.sealedEnvelopeSha256);

  let mutationsRejected = 0;
  function authorityMutation(mutate) {
    const changed = structuredClone(replayed); mutate(changed);
    assert.throws(() => adapter.prepareRow19ClassUnitResult(
      boundary(changed, mathematicalAuthoritySha256)), adapter.Row19ClassUnitAdapterFailure);
    mutationsRejected += 1;
  }
  authorityMutation(value => { value.classGroup.classNumber = "39367"; });
  authorityMutation(value => { value.unitGroup.materialization.reason = "PRECI"; });
  authorityMutation(value => { value.internals.valuationReplay.terminalFullIdentityExact = false; });
  authorityMutation(value => { value.sourceBoundary.usedW0RuntimeData = true; });
  function semanticMutation(mutate) {
    const changed = structuredClone(replayed); mutate(changed);
    assert.throws(() => adapter.prepareRow19ClassUnitResult(
      permissiveBoundary(changed, mathematicalAuthoritySha256)),
    adapter.Row19ClassUnitAdapterFailure);
    mutationsRejected += 1;
  }
  semanticMutation(value => { value.field.definingPolynomial[0] = "-1"; });
  semanticMutation(value => { value.classGroup.invariants[0] = "3"; });
  semanticMutation(value => {
    value.classGroup.exactOrderWitnesses[0].principal.factorBaseExponents[0] = "1";
  });
  semanticMutation(value => { value.retained.factorBase.idealHnfs.pop(); });
  semanticMutation(value => { value.unitGroup.compactFundamentalUnit.exactNorm = "-1"; });
  semanticMutation(value => { value.completion.certifiedClassUnitComputation = true; });
  function rejectReseal(mutate) {
    const changed = structuredClone(payload); mutate(changed);
    const fraudulentRaw = neutral.sealClassUnitCorrespondenceResult(changed);
    const fraudulent = { ...prepared, sealedEnvelopeHex: fraudulentRaw.toString("hex"),
      sealedEnvelopeSha256: neutral.sha256Bytes(fraudulentRaw) };
    const fraudulentAuthority = neutral.createDetachedClassUnitAuthority({
      envelopeSha256: fraudulent.sealedEnvelopeSha256,
      mathematicalAuthoritySha256, replaySchema: adapter.PUBLICATION_REPLAY_SCHEMA,
      replay(candidate) {
        assert.deepEqual(candidate, payload);
        return { correspondence_complete: true, fieldId: adapter.FIELD_ID,
          mathematicalAuthoritySha256, payloadSha256: neutral.sha256Canonical(candidate),
          public_complete: false, schema: adapter.PUBLICATION_REPLAY_SCHEMA };
      },
    });
    assert.throws(() => adapter.publishPreparedRow19ClassUnitResult(
      fraudulent, fraudulentAuthority), neutral.ClassUnitResultFailure);
    mutationsRejected += 1;
  }
  rejectReseal(value => { value.storage.find(owner =>
    owner.name === "relation-records").entries[0] = "1"; });
  rejectReseal(value => { value.unitGroup.materialization.reason = "PRECI"; });
  rejectReseal(value => { value.source.assumptions[0].statement = "proved elsewhere"; });
  rejectReseal(value => { value.honesty.sourcePolicy = "extended and proved"; });
  const promoted = structuredClone(payload); promoted.terminal.public_complete = true;
  assert.throws(() => neutral.sealClassUnitCorrespondenceResult(promoted),
    neutral.ClassUnitResultFailure); mutationsRejected += 1;

  const conflictPayload = structuredClone(payload);
  conflictPayload.honesty.sourcePolicy += "; conflict-probe";
  const conflictRaw = neutral.sealClassUnitCorrespondenceResult(conflictPayload);
  const conflictAuthority = neutral.createDetachedClassUnitAuthority({
    envelopeSha256: neutral.sha256Bytes(conflictRaw), mathematicalAuthoritySha256,
    replaySchema: adapter.PUBLICATION_REPLAY_SCHEMA,
    replay(candidate) { return { correspondence_complete: true,
      fieldId: adapter.FIELD_ID, mathematicalAuthoritySha256,
      payloadSha256: neutral.sha256Canonical(candidate), public_complete: false,
      schema: adapter.PUBLICATION_REPLAY_SCHEMA }; },
  });
  assert.throws(() => publisher.publish(conflictRaw, conflictAuthority),
    neutral.ClassUnitResultConflict);
  assert.equal(publisher.current(), published);

  const immutable = publishImmutable(published.canonicalJSON(), path.resolve(outputDirectory));
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row19-class-unit-result-adapter-check-v1",
    finalOwnerSha256: adapter.FINAL_OWNER_SHA256,
    mathematicalAuthoritySha256, classNumber: 39366,
    invariantFactors: payload.classGroup.invariantFactors, classGenerators: 9,
    unitRank: 1, unitMaterialization: "not_given(LARGE)", torsionOrder: 2,
    honesty: "not-required", usedW0RuntimeData: false, freshPreparedInput: false,
    qualifiedTiming: false, correspondenceComplete: true, publicComplete: false,
    firstStageValuationCellsReplayed: 424 * 423,
    terminalValuationCellsReplayed: 424 * 430,
    generatorPowerEqualitiesReplayed: 9, mutationsRejected,
    idempotentPublication: true, conflictingPublicationRejected: true, owner: immutable,
  })}\n`);
}

try { main(process.argv.slice(2)); } catch (error) {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
}

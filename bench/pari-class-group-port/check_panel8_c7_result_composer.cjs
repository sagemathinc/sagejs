#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const composer = require("./panel8_c7_result_composer.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");
const closureVerifier = require("./panel8_terminal_closure_coordinator.cjs");

const authorityRoot = process.env.SAGEJS_PANEL8_AUTHORITY_ROOT ||
  "/scratch/sagejs-runtime/pari-class-group-e2e-20260917/panel8-authority";

function load(prefix, sha256) {
  const filename = path.join(authorityRoot, `${prefix}-${sha256}.json`);
  const raw = fs.readFileSync(filename);
  assert.equal(neutral.sha256Bytes(raw), sha256, `digest changed for ${filename}`);
  return JSON.parse(raw.toString("utf8"));
}

function publishImmutable(bytes) {
  const sha256 = neutral.sha256Bytes(bytes);
  const filename = path.join(authorityRoot,
    `panel8-c7-class-unit-result-${sha256}.json`);
  if (fs.existsSync(filename)) {
    assert.equal(fs.statSync(filename).mode & 0o777, 0o444,
      "existing C7 owner is mutable");
    assert.equal(neutral.sha256Bytes(fs.readFileSync(filename)), sha256,
      "existing C7 owner changed");
  } else {
    const temporary = path.join(authorityRoot,
      `.${path.basename(filename)}.${process.pid}`);
    fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o400 });
    try {
      fs.renameSync(temporary, filename);
      fs.chmodSync(filename, 0o444);
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }
  return { bytes: bytes.length, path: filename, sha256 };
}

const accepted = load("panel8-accepted-retry", composer.ACCEPTED_SHA256);
const c5 = load("panel8-c5-unit-lattice", composer.C5_SHA256);
const c6 = load("c6-getfu-not-given", composer.C6_SHA256);
const closure = load("panel8-terminal-closure",
  composer.TERMINAL_CLOSURE_OWNER_SHA256);

const trustedClosure = structuredClone(closure);
const closureSha256 = neutral.sha256Canonical(trustedClosure);
const mathematicalAuthoritySha256 = neutral.sha256Canonical({
  accepted: composer.ACCEPTED_SHA256,
  c5: composer.C5_SHA256,
  c6: composer.C6_SHA256,
  closure: closureSha256,
});

function boundary(candidate = closure) {
  return {
    authority: {
      closureSha256,
      mathematicalAuthoritySha256,
      ownerSha256: composer.TERMINAL_CLOSURE_OWNER_SHA256,
      replay(value) {
        assert.deepEqual(value, trustedClosure);
        assert.equal(closureVerifier.verifyOwner(value), true);
        return {
          accepted: true,
          all152RelationsReplayed: true,
          closureSha256,
          correspondenceComplete: true,
          fieldId: composer.FIELD_ID,
          mathematicalAuthoritySha256,
          packedLogsSourceOrderExact: true,
          principalIdealsExact: true,
          principalNormsExact: true,
          publicComplete: false,
          relationTimesRightInverseIdentity: true,
          relationTimesTransformZero: true,
          schema: composer.CLOSURE_REPLAY_SCHEMA,
        };
      },
      replaySchema: composer.CLOSURE_REPLAY_SCHEMA,
    },
    closure: candidate,
  };
}

const publicationReplaySchema =
  "sagejs.pari-class-group/panel8-final-correspondence-replay-v1";
const prepared = composer.preparePanel8C7Result({
  accepted,
  c5,
  c6,
  terminalClosure: boundary(),
}, { publicationReplaySchema });
const coldPrepared = composer.preparePanel8C7Result({
  accepted: structuredClone(accepted),
  c5: structuredClone(c5),
  c6: structuredClone(c6),
  terminalClosure: boundary(structuredClone(closure)),
}, { publicationReplaySchema });
assert.deepEqual(coldPrepared, prepared);
assert(Object.isFrozen(prepared));
assert.equal(prepared.correspondenceComplete, true);
assert.equal(prepared.publicComplete, false);
const raw = Buffer.from(prepared.sealedEnvelopeHex, "hex");
assert.equal(neutral.sha256Bytes(raw), prepared.sealedEnvelopeSha256);
const payload = JSON.parse(raw.toString("ascii")).payload;
assert.deepEqual(payload.classGroup, {
  classNumber: "1",
  generatorCount: "0",
  invariantFactors: [],
  presentationOwner: "class-presentation",
});
assert.equal(payload.unitGroup.rank, "2");
assert.equal(payload.unitGroup.torsionOrder, "2");
assert.deepEqual(payload.unitGroup.materialization,
  { precisionBits: "192", reason: "PRECI", tag: "not_given" });
assert.equal(payload.terminal.correspondence_complete, true);
assert.equal(payload.terminal.public_complete, false);
assert.deepEqual(payload.source.assumptions.map(value => value.id),
  ["factor-base-generation", "grh-bounds", "pari-correspondence"]);
const owners = new Map(payload.storage.map(value => [value.name, value]));
assert.deepEqual(owners.get("compact-unit-transform").entries, c6.unitTransform);
assert.deepEqual(owners.get("compact-archimedean-units").entries,
  c6.archimedeanUnits);
assert.deepEqual(owners.get("regulator-enclosure").entries, c6.regulator);
assert.deepEqual(owners.get("torsion-generator").entries, ["-1", "0", "0", "0"]);

function finalReplay(candidate) {
  assert.equal(candidate.field.id, composer.FIELD_ID);
  assert.deepEqual(candidate.classGroup.invariantFactors, []);
  assert.equal(candidate.classGroup.classNumber, "1");
  assert.equal(candidate.unitGroup.rank, "2");
  assert.equal(candidate.unitGroup.torsionOrder, "2");
  assert.equal(candidate.terminal.correspondence_complete, true);
  assert.equal(candidate.terminal.public_complete, false);
  const candidateOwners = new Map(candidate.storage.map(value => [value.name, value]));
  assert.deepEqual(candidateOwners.get("compact-unit-transform").entries,
    c6.unitTransform);
  assert.deepEqual(candidateOwners.get("compact-archimedean-units").entries,
    c6.archimedeanUnits);
  assert.deepEqual(candidateOwners.get("regulator-enclosure").entries,
    c6.regulator);
  assert.deepEqual(candidateOwners.get("relation-kernel-transform").entries,
    closure.relationClosure.transform);
  assert.deepEqual(candidateOwners.get("relation-right-inverse").entries,
    closure.relationClosure.rightInverse);
  assert.deepEqual(candidateOwners.get("principal-generators").entries,
    closure.exactRelations.principalGenerators);
  return {
    correspondence_complete: true,
    fieldId: composer.FIELD_ID,
    mathematicalAuthoritySha256,
    payloadSha256: neutral.sha256Canonical(candidate),
    public_complete: false,
    schema: publicationReplaySchema,
  };
}

function finalAuthority(bytes) {
  return neutral.createDetachedClassUnitAuthority({
    envelopeSha256: neutral.sha256Bytes(bytes),
    mathematicalAuthoritySha256,
    replay: finalReplay,
    replaySchema: publicationReplaySchema,
  });
}

const publisher = new neutral.ClassUnitCorrespondencePublisher();
const published = composer.publishPreparedPanel8C7Result(
  prepared, finalAuthority(raw), publisher);
assert.equal(published, publisher.current());
assert.equal(composer.publishPreparedPanel8C7Result(
  prepared, finalAuthority(raw), publisher), published);

let mutationsRejected = 0;
function reject(mutator) {
  const candidate = structuredClone(closure);
  mutator(candidate);
  assert.throws(() => composer.preparePanel8C7Result({
    accepted,
    c5,
    c6,
    terminalClosure: boundary(candidate),
  }, { publicationReplaySchema }), composer.Panel8C7CompositionFailure);
  mutationsRejected += 1;
}
reject(value => { value.ancestry.c6OwnerSha256 = "0".repeat(64); });
reject(value => { value.relationClosure.transform[0] = "99"; });
reject(value => { value.relationClosure.relationTimesTransformZero = false; });
reject(value => { value.exactRelations.principalGenerators[0] = "99"; });
reject(value => { value.replay.all152RelationsReplayed = false; });
reject(value => { value.assumptions.publicCompletion = true; });

function rejectOwner(name, mutator) {
  const candidate = {
    accepted: structuredClone(accepted),
    c5: structuredClone(c5),
    c6: structuredClone(c6),
  };
  mutator(candidate[name]);
  assert.throws(() => composer.preparePanel8C7Result({
    ...candidate,
    terminalClosure: boundary(),
  }, { publicationReplaySchema }), composer.Panel8C7CompositionFailure);
  mutationsRejected += 1;
}
rejectOwner("accepted", value => { value.field.id = "changed"; });
rejectOwner("c5", value => { value.regulator[0] = "1"; });
rejectOwner("c6", value => { value.state[4] = 69862; });
rejectOwner("c6", value => { value.unitTransform[5] = "2"; });

const promoted = structuredClone(payload);
promoted.terminal.public_complete = true;
assert.throws(() => neutral.sealClassUnitCorrespondenceResult(promoted),
  neutral.ClassUnitResultFailure);
mutationsRejected += 1;

const resealed = structuredClone(payload);
resealed.storage.find(value => value.name === "compact-unit-transform").entries[0] = "1";
const fraudulentRaw = neutral.sealClassUnitCorrespondenceResult(resealed);
const fraudulentPrepared = {
  ...prepared,
  sealedEnvelopeHex: fraudulentRaw.toString("hex"),
  sealedEnvelopeSha256: neutral.sha256Bytes(fraudulentRaw),
};
assert.throws(() => composer.publishPreparedPanel8C7Result(
  fraudulentPrepared, finalAuthority(fraudulentRaw)), neutral.ClassUnitResultFailure);
mutationsRejected += 1;

const source = fs.readFileSync(path.join(__dirname,
  "panel8_c7_result_composer.cjs"), "utf8");
assert(!source.includes("createDetachedClassUnitAuthority"));
assert(!source.includes("readFileSync"));
assert(!source.includes("child_process"));

const immutableOwner = publishImmutable(published.canonicalJSON());

console.log(JSON.stringify({
  classNumber: 1,
  correspondenceComplete: true,
  field: composer.FIELD_ID,
  invariantFactors: [],
  mutationsRejected,
  owner: immutableOwner,
  publicComplete: false,
  publishedSha256: published.sha256,
  status: "pari-correspondence-complete-internal",
  torsionOrder: 2,
  unitMaterialization: "not_given(PRECI)",
  unitRank: 2,
}));

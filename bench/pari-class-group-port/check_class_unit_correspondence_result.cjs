#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-portable: true

const assert = require("node:assert/strict");
const result = require("./class_unit_correspondence_result.cjs");

const clone = value => structuredClone(value);
const trustedOwners = Object.freeze({
  fieldId: "example:x^3-x-1",
  polynomial: Object.freeze(["-1", "-1", "0", "1"]),
  presentation: Object.freeze(["1"]),
  exactUnits: Object.freeze(["0", "1", "0", "1", "0", "1"]),
  exactNorms: Object.freeze(["-1", "1"]),
  regulator: Object.freeze(["1234567", "192", "-80", "1234569"]),
  torsion: Object.freeze(["-1", "0", "0"]),
});
const REPLAY_SCHEMA = "sagejs.pari-class-group/test-independent-replay-v1";
const mathematicalAuthoritySha256 = result.sha256Canonical(trustedOwners);

function owner(name, role, entries, logicalLength = entries.length, capacity = entries.length) {
  const padded = [...entries];
  while (padded.length < capacity) padded.push("777");
  return {
    capacity: String(capacity),
    encoding: "canonical-decimal-integer",
    entries: padded,
    logicalLength: String(logicalLength),
    name,
    role,
  };
}

function payload(materialization = "exact_units") {
  const storage = [
    owner("class-presentation", "class-presentation", trustedOwners.presentation, 1, 4),
    owner("exact-norms", "exact-unit-norms", trustedOwners.exactNorms),
    owner("exact-units", "exact-unit-coordinates", trustedOwners.exactUnits, 6, 8),
    owner("regulator", "regulator-enclosure", trustedOwners.regulator),
    owner("torsion", "torsion-generator", trustedOwners.torsion),
  ];
  return {
    classGroup: {
      classNumber: "1",
      generatorCount: "0",
      invariantFactors: [],
      presentationOwner: "class-presentation",
    },
    field: {
      definingPolynomialAscending: [...trustedOwners.polynomial],
      degree: "3",
      id: trustedOwners.fieldId,
    },
    honesty: {
      evidenceOwner: null,
      outcome: "equal-bound-source-skip",
      sourcePolicy: "PARI-2.17.4-buchall-equal-bound-branch",
    },
    schema: result.PAYLOAD_SCHEMA,
    source: {
      assumptions: [
        {
          disposition: "assumed",
          id: "factor-base-generation",
          statement: "PARI's factor-base generation policy is assumed correct",
        },
        {
          disposition: "assumed",
          id: "grh-plus-bounds",
          statement: "GRH and PARI's undocumented bounds are assumed correct",
        },
      ],
      correspondence: "upstream-assumed-pari-correspondence",
      pariSourceSha256: "9".repeat(64),
      pariVersion: "2.17.4",
      replaySchema: REPLAY_SCHEMA,
    },
    storage,
    terminal: {
      correspondence_complete: true,
      public_complete: false,
      status: "pari-correspondence-complete-internal",
    },
    unitGroup: {
      materialization: materialization === "exact_units" ? {
        coordinatesOwner: "exact-units",
        normsOwner: "exact-norms",
        tag: "exact_units",
      } : {
        precisionBits: "192",
        reason: materialization,
        tag: "not_given",
      },
      rank: "2",
      regulatorOwner: "regulator",
      torsionGeneratorOwner: "torsion",
      torsionOrder: "2",
    },
  };
}

function logical(ownerValue) {
  return ownerValue.entries.slice(0, Number(ownerValue.logicalLength));
}

function independentReplay(candidate) {
  // This is deliberately rooted in trustedOwners, not in a digest or expected
  // value copied from candidate.  In production the same callback boundary is
  // supplied by the field-specific exact cold replay.
  assert.equal(candidate.field.id, trustedOwners.fieldId);
  assert.deepEqual(candidate.field.definingPolynomialAscending, trustedOwners.polynomial);
  const owners = new Map(candidate.storage.map(entry => [entry.name, entry]));
  assert.deepEqual(logical(owners.get("class-presentation")), trustedOwners.presentation);
  assert.deepEqual(logical(owners.get("regulator")), trustedOwners.regulator);
  assert.deepEqual(logical(owners.get("torsion")), trustedOwners.torsion);
  assert.equal(candidate.classGroup.classNumber, "1");
  assert.deepEqual(candidate.classGroup.invariantFactors, []);
  if (candidate.unitGroup.materialization.tag === "exact_units") {
    assert.deepEqual(logical(owners.get("exact-units")), trustedOwners.exactUnits);
    assert.deepEqual(logical(owners.get("exact-norms")), trustedOwners.exactNorms);
  } else {
    assert(["PRECI", "LARGE"].includes(candidate.unitGroup.materialization.reason));
  }
  return {
    correspondence_complete: true,
    fieldId: candidate.field.id,
    mathematicalAuthoritySha256,
    payloadSha256: result.sha256Canonical(candidate),
    public_complete: false,
    schema: REPLAY_SCHEMA,
  };
}

function authority(raw) {
  return result.createDetachedClassUnitAuthority({
    envelopeSha256: result.sha256Bytes(raw),
    mathematicalAuthoritySha256,
    replay: independentReplay,
    replaySchema: REPLAY_SCHEMA,
  });
}

const exactRaw = result.sealClassUnitCorrespondenceResult(payload());
const exactAuthority = authority(exactRaw);
const verified = result.verifyClassUnitCorrespondenceResult(exactRaw, exactAuthority);
assert(verified instanceof result.ImmutableClassUnitCorrespondenceResult);
assert.equal(verified.sha256, result.sha256Bytes(exactRaw));
const detached = verified.detachedPayload();
detached.field.id = "mutated-after-verification";
assert.equal(verified.detachedPayload().field.id, trustedOwners.fieldId);
const exposedRaw = verified.canonicalJSON();
exposedRaw[0] ^= 1;
assert(verified.canonicalJSON().equals(exactRaw));

for (const reason of ["PRECI", "LARGE"]) {
  const raw = result.sealClassUnitCorrespondenceResult(payload(reason));
  assert.equal(
    result.verifyClassUnitCorrespondenceResult(raw, authority(raw))
      .detachedPayload().unitGroup.materialization.reason,
    reason,
  );
}

const publisher = new result.ClassUnitCorrespondencePublisher();
assert.equal(publisher.publish(exactRaw, exactAuthority), publisher.current());
assert.equal(publisher.publish(exactRaw, exactAuthority), publisher.current());

let mutationsRejected = 0;
function rejectWithOriginalAuthority(mutator) {
  const changed = payload();
  mutator(changed);
  let raw;
  try {
    raw = result.sealClassUnitCorrespondenceResult(changed);
  } catch (error) {
    assert(error instanceof result.ClassUnitResultFailure);
    mutationsRejected += 1;
    return;
  }
  assert.throws(
    () => result.verifyClassUnitCorrespondenceResult(raw, exactAuthority),
    result.ClassUnitResultFailure,
  );
  mutationsRejected += 1;
}

// Every material section is covered by the external envelope authority.
rejectWithOriginalAuthority(p => { p.field.id = "example:x^3-x+1"; });
rejectWithOriginalAuthority(p => { p.source.pariVersion = "2.15.4"; });
rejectWithOriginalAuthority(p => { p.storage[0].entries[0] = "2"; });
rejectWithOriginalAuthority(p => { p.storage[0].logicalLength = "2"; });
rejectWithOriginalAuthority(p => { p.storage[0].capacity = "3"; });
rejectWithOriginalAuthority(p => { p.classGroup.classNumber = "2"; });
rejectWithOriginalAuthority(p => { p.unitGroup.rank = "1"; });
rejectWithOriginalAuthority(p => { p.honesty.outcome = "not-required"; });
rejectWithOriginalAuthority(p => { p.terminal.public_complete = true; });

function rejectResealedMathematicalFraud(mutator) {
  const changed = payload();
  mutator(changed);
  const raw = result.sealClassUnitCorrespondenceResult(changed);
  // The attacker coordinates both JSON hashes and receives a new envelope
  // digest, but cannot change the independent mathematical replay root.
  assert.throws(
    () => result.verifyClassUnitCorrespondenceResult(raw, authority(raw)),
    result.ClassUnitResultFailure,
  );
  mutationsRejected += 1;
}

rejectResealedMathematicalFraud(p => { p.field.definingPolynomialAscending[0] = "1"; });
rejectResealedMathematicalFraud(p => { p.storage[0].entries[0] = "2"; });
rejectResealedMathematicalFraud(p => { p.storage[2].entries[0] = "1"; });
rejectResealedMathematicalFraud(p => { p.storage[3].entries[0] = "1234568"; });
rejectResealedMathematicalFraud(p => { p.storage[4].entries[0] = "1"; });

// A failed candidate never changes a previously published result.
const conflictPayload = payload();
conflictPayload.honesty.sourcePolicy += "-changed";
const conflictRaw = result.sealClassUnitCorrespondenceResult(conflictPayload);
const conflictAuthority = authority(conflictRaw);
assert.throws(
  () => publisher.publish(conflictRaw, conflictAuthority),
  result.ClassUnitResultConflict,
);
assert.equal(publisher.current().sha256, verified.sha256);

// Canonical decoding rejects alternate spellings even if JSON.parse accepts.
const spaced = Buffer.from(exactRaw.toString("ascii").replace(":", ": "), "ascii");
const spacedAuthority = result.createDetachedClassUnitAuthority({
  envelopeSha256: result.sha256Bytes(spaced),
  mathematicalAuthoritySha256,
  replay: independentReplay,
  replaySchema: REPLAY_SCHEMA,
});
assert.throws(
  () => result.verifyClassUnitCorrespondenceResult(spaced, spacedAuthority),
  result.ClassUnitResultFailure,
);
mutationsRejected += 1;

console.log(JSON.stringify({
  exactSchema: verified.detachedPayload().schema,
  exactSha256: verified.sha256,
  materializationTags: ["exact_units", "not_given(PRECI)", "not_given(LARGE)"],
  mathematicalAuthoritySha256,
  mutationsRejected,
  publicComplete: false,
  transactionalPublication: true,
}));

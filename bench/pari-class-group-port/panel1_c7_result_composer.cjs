"use strict";

// Field-neutral C7 composition for development-panel row 1. Filesystem and
// process authority stay outside this module: every mathematical producer is
// admitted through an injected detached replay boundary.

const neutral = require("./class_unit_correspondence_result.cjs");

const COMPOSITION_SCHEMA =
  "sagejs.pari-class-group/panel1-c7-result-composition-v1";
const OWNER_REPLAY_SCHEMA =
  "sagejs.pari-class-group/panel1-c7-input-replay-v1";
const PUBLICATION_REPLAY_SCHEMA =
  "sagejs.pari-class-group/panel1-c7-publication-replay-v1";
const FIELD_ID =
  "generated-sha256-dec56e7e41f5f60071249da2e66871ed837a3c6e65d821c328e7b4c57adaff3f";
const POLYNOMIAL = Object.freeze(["20018", "-20010", "0", "1"]);
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const W0_SHA256 =
  "f043f34a7c732269791a3c8c16cb3b30767b84ecec3c340659433d53f05aeb72";
const PRESENTATION_OWNER_SHA256 =
  "c5442d0848ec8fb2e6d8f24e516458a15f24f3415d7a1da62d8d5848c2ab0bcf";
const CLASS_WITNESS_OWNER_SHA256 =
  "77e3a6dd0011fdc5f85fc4d168e3f481eeceb30660a7d158f20cf87e06016d9d";
const EXACT_UNIT_OWNER_SHA256 =
  "75c7f895711566e954db046b76cf49553b8ec1fdf67ee097cddbb98aa004c9ea";
const EXACT_UNIT_SOURCE_COMMIT =
  "f60734fc92f42f6fe50ab133b54a0eb669d006ca";
const SHA256 = /^[0-9a-f]{64}$/;
const INTEGER = /^(0|-?[1-9][0-9]*)$/;

class Panel1C7CompositionFailure extends Error {}
function fail(message) { throw new Panel1C7CompositionFailure(message); }

function plain(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${name} must be an object`);
  }
  return value;
}

function equal(actual, expected, name) {
  if (neutral.canonical(actual).compare(neutral.canonical(expected)) !== 0) {
    fail(`${name} changed`);
  }
}

function integers(value, length, name) {
  if (!Array.isArray(value) || value.length !== length) fail(`${name} has the wrong shape`);
  return value.map((entry, index) => {
    if (typeof entry !== "string" || !INTEGER.test(entry)) {
      fail(`${name}[${index}] is not a canonical integer`);
    }
    return entry;
  });
}

function frozen(value) {
  if (Array.isArray(value)) value.forEach(frozen);
  else if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    Object.values(value).forEach(frozen);
  }
  return Object.freeze(value);
}

function owner(name, role, entries) {
  const canonical = integers(entries, entries.length, `${name} entries`);
  return {
    capacity: String(canonical.length),
    encoding: "canonical-decimal-integer",
    entries: canonical,
    logicalLength: String(canonical.length),
    name,
    role,
  };
}

function replayBoundary(input, label, expectedSha256) {
  const boundary = plain(input, `${label} boundary`);
  const value = structuredClone(plain(boundary.owner, `${label} owner`));
  const authority = plain(boundary.authority, `${label} authority`);
  if (authority.ownerSha256 !== expectedSha256 ||
      authority.replaySchema !== OWNER_REPLAY_SCHEMA ||
      typeof authority.replay !== "function") {
    fail(`${label} detached authority changed`);
  }
  let receipt;
  try { receipt = authority.replay(structuredClone(value)); }
  catch (error) { throw new Panel1C7CompositionFailure(`${label} replay rejected`, { cause: error }); }
  if (receipt && typeof receipt.then === "function") fail(`${label} replay must be synchronous`);
  receipt = plain(receipt, `${label} replay receipt`);
  if (receipt.schema !== OWNER_REPLAY_SCHEMA || receipt.accepted !== true ||
      receipt.ownerSha256 !== expectedSha256 || receipt.fieldId !== FIELD_ID ||
      receipt.pristineW0Sha256 !== W0_SHA256 ||
      typeof receipt.evidenceSha256 !== "string" || !SHA256.test(receipt.evidenceSha256)) {
    fail(`${label} replay receipt changed`);
  }
  return { receipt, value };
}

function validatePresentation(boundary) {
  const { value, receipt } = replayBoundary(
    boundary, "presentation", PRESENTATION_OWNER_SHA256);
  if (value.schema !== "sagejs.pari-class-group/panel1-presentation-authority-v1" ||
      value.field?.id !== FIELD_ID || value.ancestry?.pristineW0Sha256 !== W0_SHA256) {
    fail("presentation identity changed");
  }
  equal(value.field.polynomial, POLYNOMIAL, "presentation polynomial");
  equal(value.field.signature, [3, 0], "presentation signature");
  equal(value.dimensions, {
    degree: 3, factorBaseSize: 51, kernelRank: 7, places: 3,
    relationCount: 58, unitRank: 2,
  }, "presentation dimensions");
  if (value.presentation?.classNumber !== "3" ||
      value.presentation?.invariants?.join(",") !== "3" ||
      value.replay?.all58PrincipalRelationsReplayed !== true ||
      value.replay?.rawRelationsTimesKernelZero !== true ||
      value.comparison?.matches !== true) fail("presentation proof changed");
  return { owner: value, receipt };
}

function validateClassWitness(boundary) {
  const { value, receipt } = replayBoundary(
    boundary, "class witness", CLASS_WITNESS_OWNER_SHA256);
  if (value.schema !== "sagejs.pari-class-group/panel1-c3-class-witness-v1" ||
      value.ancestry?.presentationOwnerSha256 !== PRESENTATION_OWNER_SHA256 ||
      value.ancestry?.pristineW0Sha256 !== W0_SHA256 ||
      value.smithCoordinate?.modulus !== 3 ||
      value.smithCoordinate?.generatorCoordinate !== "1" ||
      value.smithCoordinate?.presentationAnnihilated !== true ||
      value.exactIdealReplay?.powerEqualsPrincipal !== true ||
      value.comparison?.matches !== true) fail("class witness proof changed");
  integers(value.descriptor?.idealHnf, 9, "class generator ideal");
  integers(value.orderRelation?.rawRelationCoefficients, 58, "order relation");
  integers(value.orderRelation?.principalGenerator, 3, "order principal generator");
  integers(value.exactIdealReplay?.powerHnf, 9, "class generator power HNF");
  equal(value.exactIdealReplay.powerHnf, value.exactIdealReplay.principalHnf,
    "order-principal equality");
  return { owner: value, receipt };
}

function validateExactUnits(boundary) {
  const { value, receipt } = replayBoundary(
    boundary, "exact units", EXACT_UNIT_OWNER_SHA256);
  if (value.schema !== "sagejs.pari-class-group/panel1-exact-unit-authority-v1" ||
      value.field?.id !== FIELD_ID ||
      value.presentationAuthoritySha256 !== PRESENTATION_OWNER_SHA256 ||
      value.ancestry?.presentation?.pristineW0Sha256 !== W0_SHA256 ||
      value.exactStorageBits !== 16384 ||
      value.producer?.rawRelationProductsMaterialized !== true ||
      value.producer?.exactNormsProved !== true ||
      value.producer?.rootIntervalSignsProved !== true ||
      value.producer?.packedRegulatorBound !== true) fail("exact-unit proof changed");
  equal(value.field.polynomial, POLYNOMIAL, "exact-unit polynomial");
  equal(value.dimensions, {
    degree: 3, factorBaseSize: 51, kernelRank: 7, places: 3,
    relationCount: 58, unitRank: 2,
  }, "exact-unit dimensions");
  if (value.exactUnitsShape?.join(",") !== "3,2" ||
      value.unitTransformShape?.join(",") !== "7,2" ||
      value.rawUnitProvenanceShape?.join(",") !== "58,2" ||
      value.signPhasesShape?.join(",") !== "3,2") fail("exact-unit shapes changed");
  const units = value.exactUnits.flatMap((entry, index) =>
    integers(entry, 3, `exact unit ${index}`));
  const norms = integers(value.unitNorms, 2, "exact unit norms");
  equal(norms, ["1", "1"], "exact unit norms");
  equal(value.signPhases, [0, 1, 1, 1, 1, 0], "exact unit signs");
  return {
    owner: value, receipt, units, norms,
    signs: value.signPhases.map(String),
    regulator: integers(value.packedRegulator, 3, "packed regulator"),
    transform: integers(value.unitTransform, 14, "unit transform"),
    provenance: integers(value.rawUnitProvenance, 116, "raw unit provenance"),
  };
}

function validateW0(boundary) {
  const { value, receipt } = replayBoundary(boundary, "pristine W0", W0_SHA256);
  if (value.schema !== "sagejs.pari-class-group/development-default-driver-trace-v1" ||
      value.oracle?.pariVersion !== "2.17.4" ||
      value.oracle?.archiveSha256 !== PARI_SOURCE_SHA256 || value.field?.id !== FIELD_ID ||
      value.field?.panelIndex !== 1 || value.field?.degree !== 3 || value.field?.unitRank !== 2) {
    fail("pristine W0 identity changed");
  }
  equal(value.field.coefficients, POLYNOMIAL, "W0 polynomial");
  const factor = value.events?.find(entry => entry.event === "factor_base");
  const honesty = value.events?.find(entry => entry.event === "honesty_complete");
  if (!factor || factor.C1 !== 259 || factor.C2 !== 259 || factor.KC !== 51 ||
      factor.KCZ !== 36 || factor.KCZ2 !== 36 ||
      honesty?.extraRequired !== false) fail("W0 equal-bound honesty state changed");
  equal(value.prepared?.rootsOfUnity, { kind: "vector", values: [
    { kind: "integer", value: "2" }, { kind: "integer", value: "-1" },
  ] }, "W0 torsion observation");
  return { factor, owner: value, receipt };
}

function validateTorsion(boundary) {
  const candidate = plain(boundary, "torsion boundary");
  const torsionSha256 = candidate.authority?.ownerSha256;
  if (typeof torsionSha256 !== "string" || !SHA256.test(torsionSha256)) {
    fail("torsion owner digest changed");
  }
  const { value, receipt } = replayBoundary(candidate, "torsion", torsionSha256);
  if (value.schema !== "sagejs.pari-class-group/real-cubic-torsion-v1") {
    fail("torsion schema changed");
  }
  const payload = plain(value.payload, "torsion payload");
  equal(payload.field?.polynomial_ascending, POLYNOMIAL, "torsion polynomial");
  if (payload.field?.degree !== "3" || payload.field?.real_places !== "3" ||
      payload.field?.complex_places !== "0" || payload.torsion?.order !== "2" ||
      payload.torsion?.generator_norm !== "-1" ||
      payload.maximality?.method !== "injective-real-embedding" ||
      payload.maximality?.verified_exact_order !== "2") fail("torsion proof changed");
  equal(payload.torsion.generator_power_basis, ["-1", "0", "0"],
    "torsion generator");
  return { owner: value, receipt, sha256: torsionSha256 };
}

function completePayload(evidence) {
  const { presentation, witness, units, w0, torsion } = evidence;
  const storage = [
    owner("class-generator-ideal", "class-generator-ideal",
      witness.owner.descriptor.idealHnf),
    owner("class-generator-order-principal", "exact-order-principal-witness", [
      ...witness.owner.orderRelation.rawRelationCoefficients,
      ...witness.owner.orderRelation.principalGenerator,
      ...witness.owner.exactIdealReplay.powerHnf,
    ]),
    owner("exact-unit-coordinates", "exact-unit-coordinates", units.units),
    owner("exact-unit-norms", "exact-unit-norms", units.norms),
    owner("factor-base-bound-counters", "honesty-evidence", [
      String(w0.factor.C1), String(w0.factor.C2), String(w0.factor.KC),
      String(w0.factor.KCZ), String(w0.factor.KCZ2),
    ]),
    owner("factor-base-presentation", "class-presentation",
      integers(presentation.owner.presentation.matrix, 51 * 51, "presentation matrix")),
    owner("raw-unit-provenance", "exact-unit-raw-provenance", units.provenance),
    owner("regulator-enclosure", "regulator-enclosure", units.regulator),
    owner("torsion-generator", "torsion-generator", ["-1", "0", "0"]),
    owner("unit-sign-phases", "exact-unit-real-place-signs", units.signs),
    owner("unit-transform", "exact-unit-kernel-transform", units.transform),
  ];
  return {
    classGroup: {
      classNumber: "3", generatorCount: "1", invariantFactors: ["3"],
      presentationOwner: "factor-base-presentation",
    },
    field: { definingPolynomialAscending: [...POLYNOMIAL], degree: "3", id: FIELD_ID },
    honesty: {
      evidenceOwner: "factor-base-bound-counters",
      outcome: "equal-bound-source-skip",
      sourcePolicy: "PARI-2.17.4-buchall-KCZ2-equals-KCZ",
    },
    schema: neutral.PAYLOAD_SCHEMA,
    source: {
      assumptions: [
        { disposition: "assumed", id: "factor-base-bounds",
          statement: "PARI's factor-base generation and relation/checking bounds are assumed correct" },
        { disposition: "assumed", id: "grh-bounds",
          statement: "GRH and the conditional class-group bounds used by PARI are assumed" },
        { disposition: "assumed", id: "pari-correspondence",
          statement: "PARI 2.17.4's class-and-unit correspondence is assumed faithful" },
      ],
      correspondence: "upstream-assumed-pari-correspondence",
      pariSourceSha256: PARI_SOURCE_SHA256,
      pariVersion: "2.17.4",
      replaySchema: PUBLICATION_REPLAY_SCHEMA,
    },
    storage,
    terminal: {
      correspondence_complete: true, public_complete: false,
      status: "pari-correspondence-complete-internal",
    },
    unitGroup: {
      materialization: {
        coordinatesOwner: "exact-unit-coordinates",
        normsOwner: "exact-unit-norms",
        tag: "exact_units",
      },
      rank: "2", regulatorOwner: "regulator-enclosure",
      torsionGeneratorOwner: "torsion-generator", torsionOrder: "2",
    },
  };
}

function preparePanel1C7Result(inputs) {
  const source = plain(inputs, "panel1 C7 inputs");
  const evidence = {
    presentation: validatePresentation(source.presentation),
    witness: validateClassWitness(source.classWitness),
    units: validateExactUnits(source.exactUnits),
    w0: validateW0(source.w0),
    torsion: validateTorsion(source.torsion),
  };
  const receipts = Object.fromEntries(Object.entries(evidence).map(
    ([name, entry]) => [name, entry.receipt.evidenceSha256]));
  const mathematicalAuthoritySha256 = neutral.sha256Canonical({
    classWitnessOwnerSha256: CLASS_WITNESS_OWNER_SHA256,
    exactUnitOwnerSha256: EXACT_UNIT_OWNER_SHA256,
    exactUnitSourceCommit: EXACT_UNIT_SOURCE_COMMIT,
    presentationOwnerSha256: PRESENTATION_OWNER_SHA256,
    receipts,
    torsionOwnerSha256: evidence.torsion.sha256,
    w0Sha256: W0_SHA256,
  });
  const raw = neutral.sealClassUnitCorrespondenceResult(completePayload(evidence));
  return frozen({
    correspondenceComplete: true, exactUnitSourceCommit: EXACT_UNIT_SOURCE_COMMIT,
    fieldId: FIELD_ID, mathematicalAuthoritySha256, publicComplete: false,
    schema: COMPOSITION_SCHEMA, sealedEnvelopeHex: raw.toString("hex"),
    sealedEnvelopeSha256: neutral.sha256Bytes(raw),
    status: "ready-for-out-of-band-publication-authority",
  });
}

function publishPreparedPanel1C7Result(prepared, authority, publisher = undefined) {
  const input = plain(prepared, "prepared panel1 C7 result");
  if (input.schema !== COMPOSITION_SCHEMA ||
      input.status !== "ready-for-out-of-band-publication-authority" ||
      input.correspondenceComplete !== true || input.publicComplete !== false ||
      input.exactUnitSourceCommit !== EXACT_UNIT_SOURCE_COMMIT ||
      typeof input.sealedEnvelopeHex !== "string" ||
      !/^(?:[0-9a-f]{2})+$/.test(input.sealedEnvelopeHex)) {
    fail("panel1 C7 result is not ready for publication");
  }
  const raw = Buffer.from(input.sealedEnvelopeHex, "hex");
  if (input.sealedEnvelopeSha256 !== neutral.sha256Bytes(raw)) {
    fail("prepared panel1 C7 envelope digest changed");
  }
  if (publisher === undefined) return neutral.verifyClassUnitCorrespondenceResult(raw, authority);
  if (!(publisher instanceof neutral.ClassUnitCorrespondencePublisher)) {
    fail("publication target is not transactional");
  }
  return publisher.publish(raw, authority);
}

module.exports = {
  CLASS_WITNESS_OWNER_SHA256, COMPOSITION_SCHEMA, EXACT_UNIT_OWNER_SHA256,
  EXACT_UNIT_SOURCE_COMMIT, FIELD_ID, OWNER_REPLAY_SCHEMA, PANEL1_C7: true,
  PARI_SOURCE_SHA256, POLYNOMIAL, PRESENTATION_OWNER_SHA256,
  PUBLICATION_REPLAY_SCHEMA, Panel1C7CompositionFailure, W0_SHA256,
  preparePanel1C7Result, publishPreparedPanel1C7Result,
};

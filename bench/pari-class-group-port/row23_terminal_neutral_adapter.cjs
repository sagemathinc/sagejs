"use strict";

// Data-only adapter from the synchronously cold-replayed row-23 terminal owner
// to the field-neutral class/unit correspondence envelope.  The source bytes
// and both replay authorities are supplied out of band; this module performs
// no artifact discovery, preparation, or mathematical computation.

const neutral = require("./class_unit_correspondence_result.cjs");

const SOURCE_SCHEMA = "sagejs.pari-class-group/row23-final-buchall-end-v1";
const SOURCE_REPLAY_SCHEMA =
  "sagejs.pari-class-group/row23-final-cold-replay-receipt-v1";
const FIELD_ID = "5.5.1002836007889.1";
const POLYNOMIAL = Object.freeze(["341", "-970", "772", "-141", "-2", "1"]);
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const SHA256 = /^[0-9a-f]{64}$/;
const INTEGER = /^(0|-?[1-9][0-9]*)$/;

class Row23NeutralAdapterFailure extends Error {}

function fail(message) {
  throw new Row23NeutralAdapterFailure(message);
}

function plain(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${name} must be an object`);
  }
  return value;
}

function exactKeys(value, expected, name) {
  const input = plain(value, name);
  const actual = Object.keys(input).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((entry, index) => entry !== wanted[index])
  ) {
    fail(`${name} has unexpected fields`);
  }
  return input;
}

function digest(value, name) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${name} is not a SHA-256 digest`);
  }
  return value;
}

function integers(value, name, length = undefined) {
  if (!Array.isArray(value) || (length !== undefined && value.length !== length)) {
    fail(`${name} has the wrong shape`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string" || !INTEGER.test(entry)) {
      fail(`${name}[${index}] is not a canonical integer`);
    }
    return entry;
  });
}

function equal(actual, expected, name) {
  if (!neutral.canonical(actual).equals(neutral.canonical(expected))) {
    fail(`${name} changed`);
  }
}

function frozen(value) {
  if (Array.isArray(value)) value.forEach(frozen);
  else if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    Object.values(value).forEach(frozen);
  }
  return Object.freeze(value);
}

function owner(name, role, entries) {
  const values = integers(entries, `${name} entries`);
  return {
    capacity: String(values.length),
    encoding: "canonical-decimal-integer",
    entries: values,
    logicalLength: String(values.length),
    name,
    role,
  };
}

function canonicalBytes(value) {
  return [...neutral.canonical(value)].map(byte => String(byte));
}

const SOURCE_AUTHORITY = new WeakSet();

function createDetachedRow23SourceAuthority({
  sourceSha256,
  mathematicalAuthoritySha256,
  replaySchema = SOURCE_REPLAY_SCHEMA,
  replay,
}) {
  digest(sourceSha256, "source authority digest");
  digest(mathematicalAuthoritySha256, "mathematical authority digest");
  if (
    typeof replaySchema !== "string" ||
    replaySchema.length === 0 ||
    typeof replay !== "function"
  ) {
    fail("source authority lacks a synchronous replay capability");
  }
  const authority = Object.freeze({
    mathematicalAuthoritySha256,
    replay,
    replaySchema,
    sourceSha256,
  });
  SOURCE_AUTHORITY.add(authority);
  return authority;
}

function openSource(sourceRaw, authority) {
  if (!Buffer.isBuffer(sourceRaw)) fail("row-23 source must be a Buffer");
  if (!SOURCE_AUTHORITY.has(authority)) fail("source authority is not out-of-band");
  const sourceSha256 = neutral.sha256Bytes(sourceRaw);
  if (sourceSha256 !== authority.sourceSha256) {
    fail("row-23 source lacks detached identity authority");
  }
  let envelope;
  try {
    envelope = JSON.parse(sourceRaw.toString("ascii"));
  } catch (error) {
    throw new Row23NeutralAdapterFailure("row-23 source is not JSON", {
      cause: error,
    });
  }
  if (!neutral.canonical(envelope).equals(sourceRaw)) {
    fail("row-23 source is not canonical JSON");
  }
  exactKeys(envelope, ["payload", "payloadSha256", "schema"], "source envelope");
  if (
    envelope.schema !== SOURCE_SCHEMA ||
    envelope.payloadSha256 !== neutral.sha256Canonical(envelope.payload)
  ) {
    fail("row-23 source envelope changed");
  }
  let receipt;
  try {
    receipt = authority.replay(Buffer.from(sourceRaw));
  } catch (error) {
    throw new Row23NeutralAdapterFailure("row-23 cold replay rejected", {
      cause: error,
    });
  }
  if (receipt && typeof receipt.then === "function") {
    fail("row-23 cold replay must be synchronous");
  }
  exactKeys(
    receipt,
    [
      "classNumber",
      "correspondenceComplete",
      "fieldId",
      "invariantFactors",
      "mathematicalAuthoritySha256",
      "publicComplete",
      "schema",
      "sourcePayloadSha256",
      "sourceSha256",
      "unitCount",
    ],
    "source replay receipt",
  );
  if (
    receipt.schema !== authority.replaySchema ||
    receipt.sourceSha256 !== sourceSha256 ||
    receipt.sourcePayloadSha256 !== envelope.payloadSha256 ||
    receipt.mathematicalAuthoritySha256 !==
      authority.mathematicalAuthoritySha256 ||
    receipt.fieldId !== FIELD_ID ||
    receipt.classNumber !== "6" ||
    !neutral.canonical(receipt.invariantFactors).equals(
      neutral.canonical(["6"]),
    ) ||
    receipt.unitCount !== "4" ||
    receipt.correspondenceComplete !== true ||
    receipt.publicComplete !== false
  ) {
    fail("row-23 cold replay receipt changed");
  }
  return { envelope, sourceSha256 };
}

function sourceAssumptions(payload) {
  const statements = [
    ["factor-base-completeness", payload.assumptions?.[0]],
    ["pari-bounds-and-retries", payload.assumptions?.[1]],
    ["regulator-acceptance", payload.assumptions?.[2]],
  ];
  if (
    statements.some(
      ([, statement]) => typeof statement !== "string" || statement.length === 0,
    )
  ) {
    fail("row-23 source assumptions changed");
  }
  return statements.map(([id, statement]) => ({
    disposition: "assumed",
    id,
    statement,
  }));
}

function makePayload(opened, sourceRaw, publicationReplaySchema) {
  if (
    typeof publicationReplaySchema !== "string" ||
    publicationReplaySchema.length === 0
  ) {
    fail("publication replay schema is missing");
  }
  const source = plain(opened.envelope.payload, "row-23 payload");
  const field = plain(source.field, "row-23 field");
  equal(field.polynomial, POLYNOMIAL, "row-23 polynomial");
  if (field.degree !== "5") fail("row-23 degree changed");

  const classGroup = plain(source.classGroup, "row-23 class group");
  if (classGroup.classNumber !== "6") fail("row-23 class number changed");
  equal(classGroup.invariantFactors, ["6"], "row-23 class invariants");
  equal(classGroup.generatorOrders, ["6"], "row-23 generator orders");
  const generatorIdeal = integers(
    classGroup.generatorIdeals?.[0],
    "class generator ideal",
    25,
  );
  if (classGroup.generatorIdeals?.length !== 1) {
    fail("row-23 class generator count changed");
  }
  const presentation = plain(classGroup.presentation, "row-23 presentation");
  const witnesses = classGroup.compactPrincipalOrderWitnesses;
  if (!Array.isArray(witnesses) || witnesses.length !== 1) {
    fail("row-23 principal witness count changed");
  }
  const principalEvidence = {
    compact: witnesses[0],
    expandedPrincipalGenerator: integers(
      classGroup.expandedPrincipalGenerator,
      "expanded principal generator",
      5,
    ),
    genback: plain(classGroup.genback, "row-23 genback"),
  };

  const units = plain(source.units, "row-23 units");
  const fundamental = plain(units.fundamental, "row-23 fundamental units");
  if (fundamental.freeRank !== "4") fail("row-23 unit rank changed");
  const coordinates = integers(fundamental.coordinates, "exact unit coordinates", 20);
  const inverses = integers(fundamental.inverses, "exact unit inverses", 20);
  const norms = integers(fundamental.norms, "exact unit norms", 4);
  if (norms.some(value => value !== "-1" && value !== "1")) {
    fail("row-23 exact unit norm changed");
  }
  const torsion = plain(units.torsion, "row-23 torsion");
  if (torsion.order !== "2" || torsion.norm !== "-1") {
    fail("row-23 torsion order or norm changed");
  }
  const torsionGenerator = integers(torsion.generator, "torsion generator", 5);
  equal(torsion.inverse, torsionGenerator, "torsion inverse");
  equal(torsion.square, ["1", "0", "0", "0", "0"], "torsion square");

  const regulator = integers(source.regulator?.value, "accepted regulator", 3);
  const terminal = plain(source.terminal, "row-23 terminal");
  if (
    terminal.correspondenceComplete !== true ||
    terminal.publicComplete !== false ||
    terminal.buchallEndEquivalentAssemblyComplete !== true
  ) {
    fail("row-23 terminal tier changed");
  }
  const assumptions = sourceAssumptions(source);
  const honestyEvidence = {
    assumptions: source.assumptions,
    remainingBoundary: terminal.remainingBoundary,
    sourcePayloadSha256: opened.envelope.payloadSha256,
    sourceSha256: opened.sourceSha256,
  };
  const storage = [
    owner("accepted-regulator-packed", "regulator-enclosure", regulator),
    owner("class-generator-ideals", "class-generator-ideals", generatorIdeal),
    owner(
      "class-presentation",
      "class-presentation",
      canonicalBytes(presentation),
    ),
    owner(
      "class-principal-witnesses",
      "exact-class-principal-witnesses",
      canonicalBytes(principalEvidence),
    ),
    owner("exact-unit-coordinates", "exact-unit-coordinates", coordinates),
    owner("exact-unit-inverses", "exact-unit-inverses", inverses),
    owner("exact-unit-norms", "exact-unit-norms", norms),
    owner("honesty-evidence", "honesty-evidence", canonicalBytes(honestyEvidence)),
    owner(
      "row23-source-envelope",
      "row23-source-canonical-json",
      [...sourceRaw].map(byte => String(byte)),
    ),
    owner("torsion-generator", "torsion-generator", torsionGenerator),
    owner(
      "torsion-inverse",
      "torsion-inverse",
      integers(torsion.inverse, "torsion inverse", 5),
    ),
  ].sort((left, right) => left.name.localeCompare(right.name));

  return {
    classGroup: {
      classNumber: "6",
      generatorCount: "1",
      invariantFactors: ["6"],
      presentationOwner: "class-presentation",
    },
    field: {
      definingPolynomialAscending: [...POLYNOMIAL],
      degree: "5",
      id: FIELD_ID,
    },
    honesty: {
      evidenceOwner: "honesty-evidence",
      outcome: "not-required",
      sourcePolicy: "authenticated-upstream-assumed-row23-buchall-end",
    },
    schema: neutral.PAYLOAD_SCHEMA,
    source: {
      assumptions,
      correspondence: "upstream-assumed-pari-correspondence",
      pariSourceSha256: PARI_SOURCE_SHA256,
      pariVersion: "2.17.4",
      replaySchema: publicationReplaySchema,
    },
    storage,
    terminal: {
      correspondence_complete: true,
      public_complete: false,
      status: "pari-correspondence-complete-internal",
    },
    unitGroup: {
      materialization: {
        coordinatesOwner: "exact-unit-coordinates",
        normsOwner: "exact-unit-norms",
        tag: "exact_units",
      },
      rank: "4",
      regulatorOwner: "accepted-regulator-packed",
      torsionGeneratorOwner: "torsion-generator",
      torsionOrder: "2",
    },
  };
}

function prepareRow23NeutralResult(sourceRaw, sourceAuthority, options = {}) {
  const opened = openSource(sourceRaw, sourceAuthority);
  const payload = makePayload(opened, sourceRaw, options.publicationReplaySchema);
  const raw = neutral.sealClassUnitCorrespondenceResult(payload);
  return frozen({
    correspondenceComplete: true,
    envelopeSha256: neutral.sha256Bytes(raw),
    fieldId: FIELD_ID,
    mathematicalAuthoritySha256: sourceAuthority.mathematicalAuthoritySha256,
    publicComplete: false,
    sealedEnvelopeHex: raw.toString("hex"),
    sourceSha256: opened.sourceSha256,
    status: "ready-for-out-of-band-publication-authority",
  });
}

function publishPreparedRow23NeutralResult(
  prepared,
  authority,
  publisher = undefined,
) {
  const input = plain(prepared, "prepared row-23 neutral result");
  if (
    input.status !== "ready-for-out-of-band-publication-authority" ||
    input.correspondenceComplete !== true ||
    input.publicComplete !== false ||
    input.fieldId !== FIELD_ID ||
    typeof input.sealedEnvelopeHex !== "string"
  ) {
    fail("row-23 neutral result is not ready for publication");
  }
  const raw = Buffer.from(input.sealedEnvelopeHex, "hex");
  if (
    raw.toString("hex") !== input.sealedEnvelopeHex ||
    neutral.sha256Bytes(raw) !== input.envelopeSha256
  ) {
    fail("prepared row-23 neutral envelope changed");
  }
  return (publisher ?? new neutral.ClassUnitCorrespondencePublisher()).publish(
    raw,
    authority,
  );
}

module.exports = {
  FIELD_ID,
  PARI_SOURCE_SHA256,
  POLYNOMIAL,
  Row23NeutralAdapterFailure,
  SOURCE_REPLAY_SCHEMA,
  SOURCE_SCHEMA,
  createDetachedRow23SourceAuthority,
  prepareRow23NeutralResult,
  publishPreparedRow23NeutralResult,
};

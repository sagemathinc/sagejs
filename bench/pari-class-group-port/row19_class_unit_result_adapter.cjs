"use strict";

// Data-only adapter from the independently cold-replayed row-19
// buchall_end-equivalent owner to the field-neutral correspondence contract.
// Neither input nor publication authority is constructed in this module.

const neutral = require("./class_unit_correspondence_result.cjs");

const COMPOSITION_SCHEMA =
  "sagejs.pari-class-group/row19-class-unit-result-composition-v1";
const INPUT_REPLAY_SCHEMA =
  "sagejs.pari-class-group/row19-final-owner-input-replay-v1";
const PUBLICATION_REPLAY_SCHEMA =
  "sagejs.pari-class-group/row19-class-unit-publication-replay-v1";
const FINAL_SCHEMA = "sagejs.pari-class-group/row19-buchall-end-result-v1";
const FINAL_OWNER_SHA256 =
  "a50e8d85416f1942c8992994112c07fb2ccc303165a25b5c66a3c74f967505c8";
const CLASS_OWNER_SHA256 =
  "1a080b32e3f54e10eb9d525bc0dae139e22d3b1f63defbe332dc0e193f1632e1";
const UNIT_OWNER_SHA256 =
  "ee4828c398ad0b59446e669ac24c1fb482bfc4f7226cf83a92b4f1b67ae44ea9";
const FIELD_ID = "3.1.1086061775432017340256300.107";
const POLYNOMIAL = Object.freeze(["-51050867718180330", "0", "0", "1"]);
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const INTEGER = /^(0|-?[1-9][0-9]*)$/;
const SHA256 = /^[0-9a-f]{64}$/;
const FRESH_PREPARED = new WeakSet();

class Row19ClassUnitAdapterFailure extends Error {}
function fail(message) { throw new Row19ClassUnitAdapterFailure(message); }
function plain(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be an object`);
  return value;
}
function array(value, label, length = undefined) {
  if (!Array.isArray(value) || (length !== undefined && value.length !== length))
    fail(`${label} has the wrong shape`);
  return value;
}
function integer(value, label) {
  if (typeof value !== "string" || !INTEGER.test(value))
    fail(`${label} is not a canonical integer`);
  return value;
}
function integers(value, label, length = undefined) {
  return array(value, label, length).map((entry, index) =>
    integer(entry, `${label}[${index}]`));
}
function digest(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) fail(`${label} is not a digest`);
  return value;
}
function equal(actual, expected, label) {
  if (neutral.canonical(actual).compare(neutral.canonical(expected)) !== 0)
    fail(`${label} changed`);
}
function frozen(value) {
  if (Array.isArray(value)) value.forEach(frozen);
  else if (value && typeof value === "object" && !Buffer.isBuffer(value))
    Object.values(value).forEach(frozen);
  return Object.freeze(value);
}
function storageOwner(name, role, entries) {
  const values = integers(entries, `${name} entries`);
  return { capacity: String(values.length), encoding: "canonical-decimal-integer",
    entries: values, logicalLength: String(values.length), name, role };
}
function canonicalBytes(value) {
  return [...neutral.canonical(value)].map(entry => String(entry));
}

function openBoundary(boundary, expected = { final: FINAL_OWNER_SHA256 }) {
  const input = plain(boundary, "row-19 final-owner boundary");
  const owner = structuredClone(plain(input.owner, "row-19 final owner"));
  const authority = plain(input.authority, "row-19 final-owner authority");
  if (digest(authority.ownerSha256, "row-19 final owner digest") !==
      expected.final || authority.replaySchema !== INPUT_REPLAY_SCHEMA ||
      typeof authority.replay !== "function") fail("row-19 input authority changed");
  let receipt;
  try { receipt = authority.replay(structuredClone(owner)); }
  catch (error) {
    throw new Row19ClassUnitAdapterFailure("row-19 cold replay rejected", { cause: error });
  }
  if (receipt && typeof receipt.then === "function") fail("row-19 replay must be synchronous");
  receipt = plain(receipt, "row-19 cold-replay receipt");
  const mathematicalAuthoritySha256 = digest(
    receipt.mathematicalAuthoritySha256, "row-19 mathematical authority");
  if (receipt.schema !== INPUT_REPLAY_SCHEMA || receipt.accepted !== true ||
      receipt.ownerSha256 !== expected.final || receipt.fieldId !== FIELD_ID ||
      receipt.firstStageValuationCells !== 424 * 423 ||
      receipt.terminalValuationCells !== 424 * 430 ||
      receipt.generatorPowerEqualities !== 9 ||
      receipt.correspondenceComplete !== true || receipt.publicComplete !== false)
    fail("row-19 cold replay receipt changed");
  return { mathematicalAuthoritySha256, owner, receipt };
}

function validateFinal(opened, expected = { classOwner: CLASS_OWNER_SHA256,
  unitOwner: UNIT_OWNER_SHA256 }) {
  const value = opened.owner;
  if (value.schema !== FINAL_SCHEMA || value.field?.id !== FIELD_ID ||
      value.ancestry?.classOwnerSha256 !== expected.classOwner ||
      value.ancestry?.unitOwnerSha256 !== expected.unitOwner)
    fail("row-19 final identity changed");
  equal(value.field.definingPolynomial, POLYNOMIAL, "row-19 polynomial");
  equal(value.field.signature, [1, 1], "row-19 signature");
  if (value.field.degree !== 3 || value.classGroup?.classNumber !== "39366")
    fail("row-19 field or class number changed");
  equal(value.classGroup.invariants,
    ["6", "3", "3", "3", "3", "3", "3", "3", "3"], "class invariants");
  const ideals = array(value.classGroup.generatorIdealHnfs, "class ideals", 9).map(
    (ideal, index) => integers(ideal, `class ideal ${index}`, 9));
  const witnesses = array(value.classGroup.exactOrderWitnesses,
    "class order witnesses", 9);
  witnesses.forEach((entry, index) => {
    const witness = plain(entry, `class witness ${index}`);
    if (witness.presentation?.exact !== true || witness.principal?.exact !== true ||
        witness.principal?.complete !== true ||
        witness.principal?.generatorPowerFactorBaseEqualityExact !== true)
      fail(`class witness ${index} is incomplete`);
    const factor = integers(witness.principal.factorBaseExponents,
      `class factor exponents ${index}`, 424);
    equal(factor, integers(witness.principal.generatorPowerFactorBaseExponents,
      `class power exponents ${index}`, 424), `class power equality ${index}`);
  });
  if (value.internals?.valuationReplay?.firstStageFullIdentityExact !== true ||
      value.internals?.valuationReplay?.terminalFullIdentityExact !== true ||
      value.internals?.valuationReplay?.generatorPowerFactorBaseEqualitiesExact !== true ||
      value.retained?.factorBase?.size !== 424 ||
      value.retained?.factorBase?.idealHnfs?.length !== 424 ||
      value.retained?.relations?.length !== 424 * 430 ||
      value.retained?.relationHashes?.length !== 430)
    fail("row-19 retained replay state changed");
  const unit = plain(value.unitGroup, "row-19 unit group");
  if (unit.rank !== 1 || unit.torsionOrder !== "2" ||
      unit.compactFundamentalUnit?.principalIdealVerified !== true ||
      unit.compactFundamentalUnit?.exactNorm !== "1" ||
      unit.compactFundamentalUnit?.exactInverseNorm !== "1" ||
      unit.regulatorCertificate?.regulatorMatched !== true ||
      unit.regulatorCertificate?.productFormulaVerified !== true ||
      unit.materialization?.tag !== "not_given" || unit.materialization?.reason !== "LARGE" ||
      unit.materialization?.precisionBits !== 192 ||
      unit.materialization?.matchedFlagZero !== true)
    fail("row-19 unit state changed");
  equal(unit.torsionGenerator, ["-1", "0", "0"], "torsion generator");
  if (value.assumptions?.independentSageCertification !== false ||
      value.sourceBoundary?.usedW0RuntimeData !== false ||
      value.sourceBoundary?.qualifiedTiming !== false ||
      value.sourceBoundary?.expandedFundamentalUnit !== false ||
      value.completion?.correspondenceComplete !== true ||
      value.completion?.internalComplete !== true ||
      value.completion?.certifiedClassUnitComputation !== false ||
      value.completion?.publicAdapterComplete !== false)
    fail("row-19 source or completion status changed");
  return { ideals, opened, unit, value, witnesses };
}

function payloadOf(evidence, replaySchema) {
  const value = evidence.value;
  const normalizedInvariants = ["3", "3", "3", "3", "3", "3", "3", "3", "6"];
  const presentation = { matrices: value.internals.transforms,
    terminalW: value.retained.terminalW };
  const honesty = { sourcePolicy:
      "no-independent-honesty-extension-claimed; upstream analytic bounds remain assumed",
    status: "not-required" };
  const sourceBoundary = { assumptions: value.assumptions,
    completion: value.completion, sourceBoundary: value.sourceBoundary };
  const storage = [
    storageOwner("class-archimedean-state", "class-archimedean-state",
      canonicalBytes({ Ga: value.internals.Ga, GD: value.internals.GD,
        Ge: value.internals.Ge, clg2: value.internals.clg2, ga: value.internals.ga })),
    storageOwner("class-generator-ideals", "class-generator-ideals",
      evidence.ideals.flat()),
    storageOwner("class-order-witnesses", "exact-class-order-witnesses",
      canonicalBytes(evidence.witnesses)),
    storageOwner("class-presentation", "class-presentation", canonicalBytes(presentation)),
    storageOwner("compact-fundamental-unit", "compact-fundamental-unit",
      canonicalBytes(evidence.unit.compactFundamentalUnit)),
    storageOwner("factor-base", "prime-ideal-factor-base",
      canonicalBytes(value.retained.factorBase)),
    storageOwner("final-owner-ancestry", "immutable-owner-ancestry",
      canonicalBytes(value.ancestry)),
    storageOwner("honesty-evidence", "honesty-evidence", canonicalBytes(honesty)),
    storageOwner("principal-relation-transform", "raw-to-terminal-relation-transform",
      value.internals.principalRelationTransform.entries),
    storageOwner("regulator-enclosure", "regulator-enclosure",
      canonicalBytes(evidence.unit.regulatorCertificate)),
    storageOwner("relation-generators", "principal-relation-generators",
      value.retained.principalGenerators),
    storageOwner("relation-logs", "raw-relation-logs", value.retained.rawLogs),
    storageOwner("relation-metadata", "relation-identity-metadata",
      canonicalBytes({ hashes: value.retained.relationHashes,
        metadata: value.retained.relationMetadata })),
    storageOwner("relation-records", "factor-base-relation-records",
      value.retained.relations),
    storageOwner("source-boundary-status", "source-boundary-status",
      canonicalBytes(sourceBoundary)),
    storageOwner("terminal-hnf-state", "terminal-hnf-state",
      canonicalBytes({ B: value.retained.terminalB, C: value.retained.terminalC,
        dep: value.retained.terminalDep, perm: value.retained.terminalPermutation,
        W: value.retained.terminalW })),
    storageOwner("torsion-generator", "torsion-generator", evidence.unit.torsionGenerator),
    storageOwner("unit-materialization-evidence", "unit-materialization-evidence",
      canonicalBytes(evidence.unit.materialization)),
  ].sort((left, right) => left.name.localeCompare(right.name));
  return {
    classGroup: { classNumber: "39366", generatorCount: "9",
      invariantFactors: normalizedInvariants, presentationOwner: "class-presentation" },
    field: { definingPolynomialAscending: [...POLYNOMIAL], degree: "3", id: FIELD_ID },
    honesty: { evidenceOwner: "honesty-evidence", outcome: "not-required",
      sourcePolicy: honesty.sourcePolicy },
    schema: neutral.PAYLOAD_SCHEMA,
    source: {
      assumptions: [
        { disposition: "assumed", id: "factor-base-bounds",
          statement: "PARI's factor-base and relation bounds are assumed correct" },
        { disposition: "assumed", id: "grh-bounds",
          statement: "GRH and PARI's conditional class-group bounds are assumed" },
        { disposition: "assumed", id: "pari-correspondence",
          statement: "PARI 2.17.4's class-and-unit correspondence is assumed faithful" },
      ],
      correspondence: "upstream-assumed-pari-correspondence",
      pariSourceSha256: PARI_SOURCE_SHA256, pariVersion: "2.17.4", replaySchema,
    },
    storage,
    terminal: { correspondence_complete: true, public_complete: false,
      status: "pari-correspondence-complete-internal" },
    unitGroup: { materialization: { precisionBits: "192", reason: "LARGE",
      tag: "not_given" }, rank: "1", regulatorOwner: "regulator-enclosure",
      torsionGeneratorOwner: "torsion-generator", torsionOrder: "2" },
  };
}

function prepareRow19ClassUnitResult(boundary, options = {}) {
  const evidence = validateFinal(openBoundary(boundary));
  const replaySchema = options.publicationReplaySchema || PUBLICATION_REPLAY_SCHEMA;
  const payload = payloadOf(evidence, replaySchema);
  const raw = neutral.sealClassUnitCorrespondenceResult(payload);
  return frozen({ correspondenceComplete: true, fieldId: FIELD_ID,
    finalOwnerSha256: FINAL_OWNER_SHA256, freshPreparedInput: false,
    mathematicalAuthoritySha256: evidence.opened.mathematicalAuthoritySha256,
    publicComplete: false, qualifiedTiming: false, schema: COMPOSITION_SCHEMA,
    sealedEnvelopeHex: raw.toString("hex"), sealedEnvelopeSha256: neutral.sha256Bytes(raw),
    status: "ready-for-out-of-band-publication-authority",
    usedW0RuntimeData: false });
}

function prepareFreshRow19ClassUnitResult(boundary, ownerDigests) {
  const expected = plain(ownerDigests, "fresh row-19 owner digests");
  for (const name of ["final", "classOwner", "unitOwner"])
    digest(expected[name], `fresh row-19 ${name} digest`);
  const evidence = validateFinal(openBoundary(boundary, expected), expected);
  const payload = payloadOf(evidence, PUBLICATION_REPLAY_SCHEMA);
  const raw = neutral.sealClassUnitCorrespondenceResult(payload);
  const prepared = frozen({ correspondenceComplete: true, fieldId: FIELD_ID,
    finalOwnerSha256: expected.final, freshPreparedInput: true,
    mathematicalAuthoritySha256: evidence.opened.mathematicalAuthoritySha256,
    publicComplete: false, qualifiedTiming: false, schema: COMPOSITION_SCHEMA,
    sealedEnvelopeHex: raw.toString("hex"), sealedEnvelopeSha256: neutral.sha256Bytes(raw),
    status: "ready-for-out-of-band-publication-authority",
    usedW0RuntimeData: false });
  FRESH_PREPARED.add(prepared);
  return prepared;
}

function publishPreparedRow19ClassUnitResult(prepared, authority, publisher = undefined) {
  const value = plain(prepared, "prepared row-19 result");
  if (value.schema !== COMPOSITION_SCHEMA ||
      value.status !== "ready-for-out-of-band-publication-authority" ||
      (!FRESH_PREPARED.has(value) && value.finalOwnerSha256 !== FINAL_OWNER_SHA256) ||
      value.correspondenceComplete !== true || value.publicComplete !== false ||
      value.usedW0RuntimeData !== false ||
      (value.freshPreparedInput !== false &&
        !(value.freshPreparedInput === true && FRESH_PREPARED.has(value))) ||
      value.qualifiedTiming !== false || typeof value.sealedEnvelopeHex !== "string" ||
      !/^(?:[0-9a-f]{2})+$/.test(value.sealedEnvelopeHex))
    fail("row-19 result is not ready for publication");
  const raw = Buffer.from(value.sealedEnvelopeHex, "hex");
  if (value.sealedEnvelopeSha256 !== neutral.sha256Bytes(raw))
    fail("prepared row-19 envelope changed");
  if (publisher === undefined)
    return neutral.verifyClassUnitCorrespondenceResult(raw, authority);
  if (!(publisher instanceof neutral.ClassUnitCorrespondencePublisher))
    fail("publication target is not transactional");
  return publisher.publish(raw, authority);
}

module.exports = { CLASS_OWNER_SHA256, COMPOSITION_SCHEMA, FIELD_ID,
  FINAL_OWNER_SHA256, INPUT_REPLAY_SCHEMA, PARI_SOURCE_SHA256, POLYNOMIAL,
  PUBLICATION_REPLAY_SCHEMA, Row19ClassUnitAdapterFailure, UNIT_OWNER_SHA256,
  isAuthenticFreshPrepared(value) { return FRESH_PREPARED.has(value); },
  prepareFreshRow19ClassUnitResult, prepareRow19ClassUnitResult,
  publishPreparedRow19ClassUnitResult };

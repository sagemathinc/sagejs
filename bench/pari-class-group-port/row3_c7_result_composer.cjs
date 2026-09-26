"use strict";

// Data-only C7 join for real-cubic development-panel row 3.  Each component
// is admitted through a detached replay capability before the field-neutral
// correspondence envelope is sealed.

const neutral = require("./class_unit_correspondence_result.cjs");

const COMPOSITION_SCHEMA = "sagejs.pari-class-group/row3-c7-result-composition-v1";
const INPUT_REPLAY_SCHEMA = "sagejs.pari-class-group/row3-c7-input-replay-v1";
const PUBLICATION_REPLAY_SCHEMA = "sagejs.pari-class-group/row3-c7-publication-replay-v1";
const PRESENTATION_SCHEMA = "sagejs.pari-class-group/row34-real-cubic-presentation-v1";
const CLASS_SCHEMA = "sagejs.pari-class-group/row3-real-cubic-class-witness-v1";
const UNIT_SCHEMA = "sagejs.pari-class-group/row3-rank2-unit-authority-v1";
const FIELD_ID = "generated-sha256-11997528676ebeb1c0636be2cb828b5ed5a527ea18eb3a4ace953984da507de9";
const POLYNOMIAL = Object.freeze(["20000000042", "-20000000022", "0", "1"]);
const PARI_SOURCE_SHA256 = "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const PRESENTATION_SHA256 = "200190446c7128e2fe8d549924f76c1ddfce205f857a0d55a1d523d287dd868b";
const CLASS_OWNER_SHA256 = "022ee736560ad2ae25f2f2aa2d121b8b2d20224d0625d935e41bf322fa27842e";
const UNIT_OWNER_SHA256 = "cf7a29bda7ca397d475d2851d1fca88d05fe5274e08a4d29d7e8bf5f5218aafb";
const INTEGER = /^(0|-?[1-9][0-9]*)$/;
const SHA256 = /^[0-9a-f]{64}$/;

class Row3C7CompositionFailure extends Error {}
function fail(message) { throw new Row3C7CompositionFailure(message); }
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
  if ((typeof value !== "string" && typeof value !== "number" &&
       typeof value !== "bigint") || !INTEGER.test(String(value)) ||
      (typeof value === "number" && !Number.isSafeInteger(value)))
    fail(`${label} is not a canonical integer`);
  return String(value);
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

function openBoundary(input, label, expectedSha256) {
  const boundary = plain(input, `${label} boundary`);
  const owner = structuredClone(plain(boundary.owner, `${label} owner`));
  const authority = plain(boundary.authority, `${label} authority`);
  const ownerSha256 = digest(authority.ownerSha256, `${label} owner digest`);
  if (ownerSha256 !== expectedSha256 || authority.replaySchema !== INPUT_REPLAY_SCHEMA ||
      typeof authority.replay !== "function") fail(`${label} authority changed`);
  let receipt;
  try { receipt = authority.replay(structuredClone(owner)); }
  catch (error) { throw new Row3C7CompositionFailure(`${label} replay rejected`, { cause: error }); }
  if (receipt && typeof receipt.then === "function") fail(`${label} replay must be synchronous`);
  receipt = plain(receipt, `${label} replay receipt`);
  if (receipt.schema !== INPUT_REPLAY_SCHEMA || receipt.accepted !== true ||
      receipt.ownerSha256 !== ownerSha256 || receipt.fieldId !== FIELD_ID ||
      !SHA256.test(receipt.evidenceSha256 || "")) fail(`${label} replay receipt changed`);
  return { owner, ownerSha256, receipt };
}

function validatePresentation(boundary) {
  const opened = openBoundary(boundary, "presentation", PRESENTATION_SHA256);
  const value = opened.owner;
  if (value.schema !== PRESENTATION_SCHEMA || value.field?.id !== FIELD_ID ||
      value.field?.panelIndex !== 3) fail("row-3 presentation identity changed");
  equal(value.field.polynomial, POLYNOMIAL, "row-3 polynomial");
  equal(value.field.signature, [3, 0], "row-3 signature");
  equal(value.dimensions, { degree: 3, places: 3, factorBaseSize: 668,
    relationCount: 675, kernelRank: 7, unitRank: 2,
    classPresentationDimension: 2, subfactorCount: 4 }, "row-3 dimensions");
  if (value.presentation?.classNumber !== "6") fail("row-3 class number changed");
  equal(integers(value.presentation.invariants, "invariants", 1), ["6"], "invariants");
  equal(integers(value.presentation.terminalW, "presentation", 4),
    ["3", "0", "0", "2"], "presentation");
  if (value.replay?.allPrincipalRelationsReplayed !== true ||
      value.replay?.rawRelationsTimesKernelZero !== true ||
      value.replay?.rawRelationsTimesClassMapEqualsEmbeddedW !== true ||
      value.completion?.presentationComplete !== true ||
      value.completion?.correspondenceComplete !== false ||
      value.completion?.publicComplete !== false) fail("presentation replay boundary changed");
  return opened;
}

function validateClass(boundary, presentation) {
  const opened = openBoundary(boundary, "class witness", CLASS_OWNER_SHA256);
  const value = opened.owner;
  if (value.schema !== CLASS_SCHEMA ||
      value.ancestry?.presentationSha256 !== PRESENTATION_SHA256)
    fail("row-3 class-witness ancestry changed");
  equal(value.quotient, { presentation: ["3", "0", "0", "2"],
    smithInvariants: ["6"], generatorOrder: "6",
    properDivisorsRejected: ["1", "2", "3"], generatorNontrivial: true },
  "class quotient");
  equal(value.generator?.presentationCoordinates, ["1", "1"], "class coordinates");
  equal(value.generator?.terminalIndices, [0, 1], "class terminal indices");
  equal(value.generator?.sourceIndices, [4, 74], "class source indices");
  const generatorIdeal = integers(value.generator?.idealHnf, "class generator ideal", 9);
  equal(generatorIdeal, ["3839", "1364", "2942", "0", "1", "0", "0", "0", "1"],
    "class product generator ideal");
  const factorIdeals = integers(presentation.owner.factorBase?.ideals,
    "presentation factor-base ideals", 668 * 9);
  const presentationIdeals = array(value.generator?.presentationIdealHnfs,
    "presentation class ideals", 2).map((entry, index) =>
    integers(entry, `presentation class ideal ${index}`, 9));
  equal(presentationIdeals[0], factorIdeals.slice(0, 9), "first class ideal join");
  equal(presentationIdeals[1], factorIdeals.slice(9, 18), "second class ideal join");
  if (presentation.owner.replay?.terminalPermutation?.[0] !== "5" ||
      presentation.owner.replay?.terminalPermutation?.[1] !== "75")
    fail("terminal/source class-generator map changed");
  const compact = plain(value.compactPrincipalWitness, "compact class witness");
  const relationIndices = integers(compact.relationIndices, "class relation indices", 443);
  const relationExponents = integers(compact.relationExponents, "class relation exponents", 443);
  const principalGenerators = integers(compact.principalGenerators,
    "class principal generators", 443 * 3);
  if (compact.kind !== "signed-retained-relation-product" || compact.factorCount !== 443 ||
      compact.expandedGeneratorMaterialized !== false ||
      !relationExponents.some(entry => BigInt(entry) < 0n) ||
      !relationExponents.some(entry => BigInt(entry) > 0n))
    fail("compact signed class witness changed");
  const rawGenerators = integers(presentation.owner.relations?.principalGenerators,
    "presentation principal generators", 675 * 3);
  relationIndices.forEach((entry, index) => {
    const relation = Number(entry);
    if (relation < 0 || relation >= 675 || (index && relation <= Number(relationIndices[index - 1])))
      fail("class relation indices are not canonical");
    equal(principalGenerators.slice(3 * index, 3 * index + 3),
      rawGenerators.slice(3 * relation, 3 * relation + 3), `class factor ${index}`);
  });
  const target = integers(value.orderRelation?.factorBaseExponents,
    "class order relation", 668);
  if (target.some((entry, index) => entry !== (index === 4 || index === 74 ? "6" : "0")) ||
      value.orderRelation?.coefficientCombinationExact !== true ||
      value.exactIdealReplay?.powerEqualsCompactPrincipalProduct !== true ||
      value.exactIdealReplay?.principalRelationsReplayed !== 443 ||
      value.completion?.classWitnessesComplete !== true ||
      value.completion?.compactPrincipalWitnessComplete !== true ||
      value.completion?.correspondenceComplete !== false ||
      value.completion?.publicComplete !== false) fail("class exact replay boundary changed");
  return { ...opened, generatorIdeal, presentationIdeals, principalGenerators,
    relationExponents, relationIndices, target };
}

function validateUnit(boundary, presentation) {
  const opened = openBoundary(boundary, "rank-two unit", UNIT_OWNER_SHA256);
  const value = opened.owner;
  if (value.schema !== UNIT_SCHEMA || value.field?.id !== FIELD_ID ||
      value.ancestry?.presentationAuthoritySha256 !== PRESENTATION_SHA256 ||
      value.ancestry?.pristineW0Sha256 !== presentation.owner.ancestry?.pristineW0Sha256)
    fail("row-3 unit ancestry changed");
  equal(value.field, presentation.owner.field, "unit field join");
  equal(value.dimensions, presentation.owner.dimensions, "unit dimension join");
  const source = plain(value.sourceLogs, "unit source logs");
  if (source.frozenW0UsedAsInput !== true || source.preparedNfLiveRoot !== false ||
      source.qualifiedTiming !== false ||
      source.rawPackedLogsSha256 !== presentation.owner.relations?.packedLogsSha256)
    fail("unit input-boundary honesty changed");
  const units = plain(value.units, "factored units");
  const transform = integers(units.unitKernelTransform, "unit kernel transform", 14);
  const provenance = integers(units.rawUnitProvenance, "factored unit provenance", 675 * 2);
  const norms = integers(units.unitNorms, "unit norms", 2);
  const signs = integers(units.unitRealSigns, "unit real signs", 6);
  if (units.materialization !== "not_given(LARGE)" || units.reason !== "LARGE" ||
      units.factoredUnitBasis !== "authenticated principalGenerators" ||
      units.unitKernelTransformShape?.join(",") !== "7,2" ||
      units.rawUnitProvenanceShape?.join(",") !== "675,2" ||
      norms.join(",") !== "1,-1" || signs.join(",") !== "1,1,1,-1,-1,-1" ||
      value.replay?.getfuStatus !== 2 || value.replay?.getfuState?.[0] !== 2 ||
      value.replay?.getfuState?.[3] !== 22 ||
      value.replay?.rawRelationsTimesUnitsZero !== true ||
      value.replay?.allPrincipalRelationNormsReplayed !== true ||
      value.replay?.allPrincipalGeneratorSignsProved !== true ||
      value.replay?.fundamentalUnitEventRead !== false ||
      value.replay?.terminalResultEventRead !== false)
    fail("rank-two factored unit result changed");
  const regulator = integers(value.regulator?.packed, "regulator enclosure", 3);
  if (value.regulator?.computedFloat !== value.regulator?.expectedFloat ||
      value.completion?.compactFactoredUnitsRetained !== true ||
      value.completion?.exactExpandedUnitsPublished !== false ||
      value.completion?.exactSuffixComplete !== true ||
      value.completion?.inputBoundaryComplete !== false ||
      value.completion?.correspondenceComplete !== false ||
      value.completion?.publicComplete !== false) fail("unit completion boundary changed");
  return { ...opened, norms, provenance, regulator, signs, transform };
}

function joinEvidence(inputs) {
  const source = plain(inputs, "row-3 C7 inputs");
  const presentation = validatePresentation(source.presentation);
  const klass = validateClass(source.classOwner, presentation);
  const unit = validateUnit(source.unitOwner, presentation);
  return frozen({ klass, presentation, unit });
}

function completePayload(evidence, replaySchema) {
  const c = evidence.klass; const u = evidence.unit;
  const storage = [
    storageOwner("class-generator-ideal", "class-generator-ideal", c.generatorIdeal),
    storageOwner("class-generator-presentation-ideals", "class-generator-presentation-ideals", c.presentationIdeals.flat()),
    storageOwner("class-order-factor-base-exponents", "exact-order-factor-base-exponents", c.target),
    storageOwner("class-order-principal-generators", "exact-order-principal-generators", c.principalGenerators),
    storageOwner("class-order-relation-exponents", "exact-order-relation-exponents", c.relationExponents),
    storageOwner("class-order-relation-indices", "exact-order-relation-indices", c.relationIndices),
    storageOwner("class-presentation", "class-presentation", ["3", "0", "0", "2"]),
    storageOwner("factored-unit-provenance", "exact-unit-raw-provenance", u.provenance),
    storageOwner("honesty-evidence", "honesty-evidence", ["0"]),
    storageOwner("regulator-enclosure", "regulator-enclosure", u.regulator),
    storageOwner("source-boundary-status", "source-boundary-status", ["1", "0", "0"]),
    storageOwner("torsion-generator", "torsion-generator", ["-1", "0", "0"]),
    storageOwner("unit-kernel-transform", "exact-unit-kernel-transform", u.transform),
    storageOwner("unit-norms", "compact-unit-norms", u.norms),
    storageOwner("unit-real-signs", "exact-unit-real-signs", u.signs),
  ].sort((left, right) => left.name.localeCompare(right.name));
  return {
    classGroup: { classNumber: "6", generatorCount: "1",
      invariantFactors: ["6"], presentationOwner: "class-presentation" },
    field: { definingPolynomialAscending: [...POLYNOMIAL], degree: "3", id: FIELD_ID },
    honesty: { evidenceOwner: "honesty-evidence", outcome: "not-required",
      sourcePolicy: "retained-W0-honesty-complete-extra-not-required" },
    schema: neutral.PAYLOAD_SCHEMA,
    source: {
      assumptions: [
        { disposition: "assumed", id: "factor-base-bounds",
          statement: "PARI's factor-base generation and relation bounds are assumed correct" },
        { disposition: "assumed", id: "frozen-w0-input",
          statement: "The raw relation logarithms enter through the frozen W0 trace" },
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
    unitGroup: { materialization: { precisionBits: "192", reason: "LARGE", tag: "not_given" },
      rank: "2", regulatorOwner: "regulator-enclosure",
      torsionGeneratorOwner: "torsion-generator", torsionOrder: "2" },
  };
}

function prepareRow3C7Result(inputs, options = {}) {
  const evidence = joinEvidence(inputs);
  const replaySchema = options.publicationReplaySchema || PUBLICATION_REPLAY_SCHEMA;
  const payload = completePayload(evidence, replaySchema);
  const raw = neutral.sealClassUnitCorrespondenceResult(payload);
  const componentOwnerSha256 = { classOwner: evidence.klass.ownerSha256,
    presentation: evidence.presentation.ownerSha256, unitOwner: evidence.unit.ownerSha256 };
  const mathematicalAuthoritySha256 = neutral.sha256Canonical({ classOrder: "6",
    componentOwnerSha256,
    factoredUnitProvenanceSha256: neutral.sha256Canonical(evidence.unit.provenance),
    frozenW0UsedAsInput: true, inputBoundaryComplete: false,
    normalizedInvariants: ["6"], unitNorms: evidence.unit.norms });
  return frozen({ componentOwnerSha256, correspondenceComplete: true, fieldId: FIELD_ID,
    frozenW0UsedAsInput: true, inputBoundaryComplete: false,
    mathematicalAuthoritySha256, publicComplete: false, qualifiedTiming: false,
    schema: COMPOSITION_SCHEMA, sealedEnvelopeHex: raw.toString("hex"),
    sealedEnvelopeSha256: neutral.sha256Bytes(raw),
    status: "ready-for-out-of-band-publication-authority" });
}

function publishPreparedRow3C7Result(prepared, authority, publisher = undefined) {
  const value = plain(prepared, "prepared row-3 C7 result");
  if (value.schema !== COMPOSITION_SCHEMA ||
      value.status !== "ready-for-out-of-band-publication-authority" ||
      value.correspondenceComplete !== true || value.publicComplete !== false ||
      value.frozenW0UsedAsInput !== true || value.inputBoundaryComplete !== false ||
      value.qualifiedTiming !== false || typeof value.sealedEnvelopeHex !== "string" ||
      !/^(?:[0-9a-f]{2})+$/.test(value.sealedEnvelopeHex))
    fail("row-3 C7 result is not ready for publication");
  const raw = Buffer.from(value.sealedEnvelopeHex, "hex");
  if (value.sealedEnvelopeSha256 !== neutral.sha256Bytes(raw))
    fail("prepared row-3 C7 envelope changed");
  if (publisher === undefined) return neutral.verifyClassUnitCorrespondenceResult(raw, authority);
  if (!(publisher instanceof neutral.ClassUnitCorrespondencePublisher))
    fail("publication target is not transactional");
  return publisher.publish(raw, authority);
}

module.exports = { CLASS_OWNER_SHA256, COMPOSITION_SCHEMA, FIELD_ID,
  INPUT_REPLAY_SCHEMA, PRESENTATION_SHA256, PUBLICATION_REPLAY_SCHEMA,
  Row3C7CompositionFailure, UNIT_OWNER_SHA256, prepareRow3C7Result,
  publishPreparedRow3C7Result };

"use strict";

// Data-only C7 join for development-panel row 11.  The immutable class and
// C5/C6 owners are admitted only through detached replay capabilities; this
// module performs no filesystem/process work and creates no authority itself.

const neutral = require("./class_unit_correspondence_result.cjs");

const COMPOSITION_SCHEMA = "sagejs.pari-class-group/row11-c7-result-composition-v1";
const INPUT_REPLAY_SCHEMA = "sagejs.pari-class-group/row11-c7-input-replay-v1";
const PUBLICATION_REPLAY_SCHEMA = "sagejs.pari-class-group/row11-c7-publication-replay-v1";
const CLASS_SCHEMA = "sagejs.pari-class-group/row11-terminal-class-closure-v1";
const UNIT_SCHEMA = "sagejs.pari-class-group/row11-rank2-c5-c6-v1";
const FIELD_ID = "generated-sha256-147ddd296edb3764954d6142a499d17edcfecc635aec0181d4beda65d97ad4ab";
const POLYNOMIAL = Object.freeze(["-2000018", "-2000010", "0", "0", "1"]);
const PARI_SOURCE_SHA256 = "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const W0_SHA256 = "6444c0501657bf0109b96fff44c50e7684b80dcb1cfa4587951d1ae4abe04165";
const W0_EVENTS_SHA256 = "6ab27463359cf2bef06615ea6733e8af97aba236ff4dde4ebad0f7bc94d0a7fb";
const CLASS_OWNER_SHA256 = "46d74e9bcecc768bf90e61bdee702a240fde22f75e213a7fec0b9b5212618879";
const UNIT_OWNER_SHA256 = "7419b9fa7245fd1f7d0d25d2160e0b4b815552aa40b397b17543236bc7bc53ac";
const INTEGER = /^(0|-?[1-9][0-9]*)$/;
const SHA256 = /^[0-9a-f]{64}$/;

class Row11C7CompositionFailure extends Error {}
function fail(message) { throw new Row11C7CompositionFailure(message); }
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
  catch (error) {
    throw new Row11C7CompositionFailure(`${label} replay rejected`, { cause: error });
  }
  if (receipt && typeof receipt.then === "function") fail(`${label} replay must be synchronous`);
  receipt = plain(receipt, `${label} replay receipt`);
  if (receipt.schema !== INPUT_REPLAY_SCHEMA || receipt.accepted !== true ||
      receipt.ownerSha256 !== ownerSha256 || receipt.fieldId !== FIELD_ID ||
      !SHA256.test(receipt.evidenceSha256 || "")) fail(`${label} replay receipt changed`);
  return { owner, ownerSha256, receipt };
}

function validateClass(boundary) {
  const opened = openBoundary(boundary, "terminal class", CLASS_OWNER_SHA256);
  const value = opened.owner;
  if (value.schema !== CLASS_SCHEMA || value.field?.id !== FIELD_ID ||
      value.field?.panelIndex !== 11 || value.ancestry?.pristineW0Sha256 !== W0_SHA256 ||
      value.ancestry?.eventsSha256 !== W0_EVENTS_SHA256)
    fail("row-11 class identity changed");
  equal(value.field.polynomial, POLYNOMIAL, "row-11 class polynomial");
  equal(value.field.signature, [2, 1], "row-11 class signature");
  equal(value.dimensions, { degree: 4, factorBaseSize: 421, relationCount: 430,
    kernelRank: 9, classPresentationDimension: 2 }, "row-11 class dimensions");
  equal(value.classGroup, { presentation: ["2", "0", "0", "2"],
    invariantFactors: ["2", "2"], classNumber: "4", generatorCount: 2,
    quotientClassesChecked: 4 }, "row-11 class group");
  const exact = plain(value.exactRelations, "exact relations");
  const principalGenerators = integers(exact.principalGenerators,
    "principal generators", 430 * 4);
  const relationRecords = integers(exact.relationRecords, "relation records", 430 * 421);
  const generatorIdeals = [];
  const classIndices = [];
  const classExponents = [];
  const witnesses = array(value.witnesses, "class witnesses", 2);
  witnesses.forEach((witnessValue, witnessIndex) => {
    const witness = plain(witnessValue, `class witness ${witnessIndex}`);
    if (witness.terminalIndex !== witnessIndex || witness.order !== "2" ||
        witness.properDivisorRejected !== "1" ||
        witness.coefficientCombinationExact !== true ||
        witness.powerEqualsCompactPrincipalProduct !== true)
      fail(`class witness ${witnessIndex} changed`);
    generatorIdeals.push(...integers(witness.idealHnf,
      `class generator ${witnessIndex}`, 16));
    const compact = plain(witness.compactPrincipalProduct,
      `class compact witness ${witnessIndex}`);
    const indices = integers(compact.relationIndices,
      `class indices ${witnessIndex}`, compact.factorCount);
    const exponents = integers(compact.relationExponents,
      `class exponents ${witnessIndex}`, compact.factorCount);
    const factors = integers(compact.principalGenerators,
      `class principal factors ${witnessIndex}`, compact.factorCount * 4);
    if (compact.kind !== "signed-retained-relation-product" ||
        compact.expandedGeneratorMaterialized !== false ||
        compact.factorCount !== [336, 330][witnessIndex] || exponents.includes("0") ||
        !exponents.some(entry => BigInt(entry) < 0n) ||
        !exponents.some(entry => BigInt(entry) > 0n))
      fail(`class compact witness ${witnessIndex} changed`);
    indices.forEach((entry, index) => {
      const relation = Number(entry);
      if (relation < 0 || relation >= 430 ||
          (index && relation <= Number(indices[index - 1])))
        fail(`class support ${witnessIndex} is not canonical`);
      equal(factors.slice(4 * index, 4 * index + 4),
        principalGenerators.slice(4 * relation, 4 * relation + 4),
        `class principal factor ${witnessIndex}:${index}`);
    });
    classIndices.push(...indices); classExponents.push(...exponents);
  });
  if (value.replay?.all430PrincipalRelationsReplayed !== true ||
      value.replay?.classOrderRelationsExact !== true ||
      value.replay?.principalNormsExact !== true ||
      value.comparison?.terminalOracleUsedAsInput !== false ||
      value.completion?.presentationComplete !== true ||
      value.completion?.classWitnessesComplete !== true ||
      value.completion?.compactPrincipalWitnessesComplete !== true ||
      value.completion?.unitsComplete !== false ||
      value.completion?.correspondenceComplete !== false ||
      value.completion?.publicComplete !== false) fail("class completion boundary changed");
  return { ...opened, classExponents, classIndices, generatorIdeals,
    principalGenerators, relationRecords };
}

function validateUnit(boundary, klass) {
  const opened = openBoundary(boundary, "rank-two C5/C6", UNIT_OWNER_SHA256);
  const value = opened.owner;
  if (value.schema !== UNIT_SCHEMA || value.field?.id !== FIELD_ID ||
      value.field?.panelIndex !== 11 ||
      value.ancestry?.laneAOwnerSha256 !== CLASS_OWNER_SHA256 ||
      value.ancestry?.pristineW0Sha256 !== W0_SHA256)
    fail("row-11 unit identity changed");
  equal(value.field.polynomial, POLYNOMIAL, "row-11 unit polynomial");
  equal(value.field.signature, [2, 1], "row-11 unit signature");
  equal(value.dimensions, { factorBaseSize: 421, relationCount: 430,
    kernelRank: 9, unitRank: 2 }, "row-11 unit dimensions");
  const source = plain(value.sourceLogs, "unit source logs");
  if (source.frozenW0UsedAsInput !== true || source.preparedNfLiveRoot !== false ||
      source.sourceOrderReconstructed !== true) fail("unit input-boundary honesty changed");
  const units = plain(value.units, "compact units");
  const transform = integers(units.unitKernelTransform, "unit kernel transform", 18);
  const provenance = integers(units.rawUnitProvenance, "unit provenance", 860);
  const norms = integers(units.unitNorms, "unit norms", 2);
  const signs = integers(units.unitRealSigns, "unit real signs", 4);
  if (units.unitKernelTransformShape?.join(",") !== "9,2" ||
      units.rawUnitProvenanceShape?.join(",") !== "430,2" ||
      units.factoredUnitBasis !== "Lane A authenticated principalGenerators" ||
      units.rawRelationsTimesUnitsZero !== true || norms.join(",") !== "1,1" ||
      signs.join(",") !== "1,1,-1,-1") fail("exact compact units changed");
  const compactFactors = [];
  array(units.compactFactoredUnits, "compact factored units", 2)
    .forEach((unitValue, unitIndex) => {
      const compact = plain(unitValue, `compact unit ${unitIndex}`);
      const indices = integers(compact.relationIndices,
        `unit indices ${unitIndex}`, compact.factorCount);
      const exponents = integers(compact.relationExponents,
        `unit exponents ${unitIndex}`, compact.factorCount);
      const factors = integers(compact.principalGenerators,
        `unit principal factors ${unitIndex}`, compact.factorCount * 4);
      if (compact.kind !== "signed-retained-relation-product" || compact.factorCount !== 330 ||
          compact.expandedGeneratorMaterialized !== false || compact.norm !== norms[unitIndex] ||
          compact.realSigns.map(String).join(",") !== signs.slice(2 * unitIndex, 2 * unitIndex + 2).join(",") ||
          exponents.includes("0")) fail(`compact unit ${unitIndex} changed`);
      const dense = Array(430).fill("0");
      indices.forEach((entry, index) => {
        const relation = Number(entry);
        if (relation < 0 || relation >= 430 ||
            (index && relation <= Number(indices[index - 1])))
          fail(`unit support ${unitIndex} is not canonical`);
        dense[relation] = exponents[index];
        equal(factors.slice(4 * index, 4 * index + 4),
          klass.principalGenerators.slice(4 * relation, 4 * relation + 4),
          `unit principal factor ${unitIndex}:${index}`);
      });
      equal(dense, provenance.slice(430 * unitIndex, 430 * (unitIndex + 1)),
        `unit provenance ${unitIndex}`);
      compactFactors.push(...factors);
    });
  if (value.c6?.status !== 2 || value.c6?.reason !== "LARGE" ||
      value.c6?.materialization !== "not_given(LARGE)" ||
      value.c6?.expandedUnitsPublished !== false ||
      value.c6?.state?.join(",") !== "2,21,0,0,0,0,0,1")
    fail("C6 terminal policy changed");
  const regulator = integers(value.regulator?.acceptedPacked,
    "accepted regulator", 3);
  if (value.regulator?.matchesAccepted !== true ||
      value.replay?.fundamentalUnitEventRead !== false ||
      value.replay?.comparisonPerformedByCheckerOnly !== true ||
      value.completion?.compactFactoredUnitsRetained !== true ||
      value.completion?.exactSuffixComplete !== true ||
      value.completion?.inputBoundaryComplete !== false ||
      value.completion?.correspondenceComplete !== true ||
      value.completion?.publicComplete !== false) fail("unit completion boundary changed");
  return { ...opened, compactFactors, norms, provenance, regulator, signs, transform };
}

function joinEvidence(inputs) {
  const source = plain(inputs, "row-11 C7 inputs");
  const klass = validateClass(source.classOwner);
  const unit = validateUnit(source.unitOwner, klass);
  return frozen({ klass, unit });
}

function completePayload(evidence, replaySchema) {
  if (typeof replaySchema !== "string" || replaySchema.length === 0)
    fail("publication replay schema is absent");
  const { klass, unit } = evidence;
  const storage = [
    storageOwner("class-generator-ideals", "class-generator-ideals", klass.generatorIdeals),
    storageOwner("class-order-factor-counts", "class-order-factor-counts", ["336", "330"]),
    storageOwner("class-order-relation-exponents", "exact-order-relation-exponents", klass.classExponents),
    storageOwner("class-order-relation-indices", "exact-order-relation-indices", klass.classIndices),
    storageOwner("class-presentation", "class-presentation", ["2", "0", "0", "2"]),
    storageOwner("factored-unit-principal-generators", "exact-unit-principal-factors", unit.compactFactors),
    storageOwner("factored-unit-provenance", "exact-unit-raw-provenance", unit.provenance),
    storageOwner("honesty-evidence", "honesty-evidence", ["0"]),
    storageOwner("principal-generators", "principal-relation-generators", klass.principalGenerators),
    storageOwner("raw-relation-records", "raw-relation-records", klass.relationRecords),
    storageOwner("regulator-enclosure", "regulator-enclosure", unit.regulator),
    storageOwner("source-boundary-status", "source-boundary-status", ["1", "0", "0"]),
    storageOwner("torsion-generator", "torsion-generator", ["-1", "0", "0", "0"]),
    storageOwner("unit-kernel-transform", "exact-unit-kernel-transform", unit.transform),
    storageOwner("unit-relation-factor-counts", "unit-relation-factor-counts", ["330", "330"]),
    storageOwner("unit-norms", "compact-unit-norms", unit.norms),
    storageOwner("unit-real-signs", "exact-unit-real-signs", unit.signs),
  ].sort((left, right) => left.name.localeCompare(right.name));
  return {
    classGroup: { classNumber: "4", generatorCount: "2",
      invariantFactors: ["2", "2"], presentationOwner: "class-presentation" },
    field: { definingPolynomialAscending: [...POLYNOMIAL], degree: "4", id: FIELD_ID },
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
    unitGroup: { materialization: { precisionBits: "192", reason: "LARGE",
      tag: "not_given" }, rank: "2", regulatorOwner: "regulator-enclosure",
      torsionGeneratorOwner: "torsion-generator", torsionOrder: "2" },
  };
}

function prepareRow11C7Result(inputs, options = {}) {
  const evidence = joinEvidence(inputs);
  const replaySchema = options.publicationReplaySchema || PUBLICATION_REPLAY_SCHEMA;
  const payload = completePayload(evidence, replaySchema);
  const raw = neutral.sealClassUnitCorrespondenceResult(payload);
  const componentOwnerSha256 = { classOwner: evidence.klass.ownerSha256,
    unitOwner: evidence.unit.ownerSha256 };
  const mathematicalAuthoritySha256 = neutral.sha256Canonical({
    classNumber: "4", componentOwnerSha256,
    factoredUnitProvenanceSha256: neutral.sha256Canonical(evidence.unit.provenance),
    frozenW0UsedAsInput: true, inputBoundaryComplete: false,
    normalizedInvariants: ["2", "2"], unitNorms: evidence.unit.norms,
  });
  return frozen({ componentOwnerSha256, correspondenceComplete: true,
    fieldId: FIELD_ID, frozenW0UsedAsInput: true, inputBoundaryComplete: false,
    mathematicalAuthoritySha256, publicComplete: false, qualifiedTiming: false,
    schema: COMPOSITION_SCHEMA, sealedEnvelopeHex: raw.toString("hex"),
    sealedEnvelopeSha256: neutral.sha256Bytes(raw),
    status: "ready-for-out-of-band-publication-authority" });
}

function publishPreparedRow11C7Result(prepared, authority, publisher = undefined) {
  const value = plain(prepared, "prepared row-11 C7 result");
  if (value.schema !== COMPOSITION_SCHEMA ||
      value.status !== "ready-for-out-of-band-publication-authority" ||
      value.correspondenceComplete !== true || value.publicComplete !== false ||
      value.frozenW0UsedAsInput !== true || value.inputBoundaryComplete !== false ||
      value.qualifiedTiming !== false || typeof value.sealedEnvelopeHex !== "string" ||
      !/^(?:[0-9a-f]{2})+$/.test(value.sealedEnvelopeHex))
    fail("row-11 C7 result is not ready for publication");
  const raw = Buffer.from(value.sealedEnvelopeHex, "hex");
  if (value.sealedEnvelopeSha256 !== neutral.sha256Bytes(raw))
    fail("prepared row-11 C7 envelope changed");
  if (publisher === undefined) return neutral.verifyClassUnitCorrespondenceResult(raw, authority);
  if (!(publisher instanceof neutral.ClassUnitCorrespondencePublisher))
    fail("publication target is not transactional");
  return publisher.publish(raw, authority);
}

module.exports = { CLASS_OWNER_SHA256, COMPOSITION_SCHEMA, FIELD_ID,
  INPUT_REPLAY_SCHEMA, PARI_SOURCE_SHA256, POLYNOMIAL, PUBLICATION_REPLAY_SCHEMA,
  Row11C7CompositionFailure, UNIT_OWNER_SHA256, W0_SHA256, joinEvidence,
  prepareRow11C7Result, publishPreparedRow11C7Result };

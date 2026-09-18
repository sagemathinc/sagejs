"use strict";

// Authenticated row-23 assessment of the additive v2 output contract. The
// retained source contains the genuine 40x31 relation collection but only a
// compressed 1x1 Smith proof. Since v2 dimension-couples those objects, this
// module reports a non-publishable gap rather than repurposing the compressed
// presentation as the raw relation system.

const neutral = require("./class_unit_correspondence_result.cjs");
const v2 = require("./class_unit_output_evidence_v2.cjs");
const transaction = require("./row23_fresh_prepared_transaction.cjs");

const SCHEMA = "sagejs.pari-class-group/row23-output-evidence-v2-gap-v1";
const SOURCE_SCHEMA = "sagejs.pari-class-group/row23-final-buchall-end-v1";
const SOURCE_SHA256 =
  "fbd08bfcdac231240ab6085aa7eff96d4f261cedfd37b647024494fa2384a318";
const SOURCE_PAYLOAD_SHA256 =
  "8deea1abbf8a6b36ab987d30ce0f200f2d561a4a88616786a7843b754c6f475d";
const CORRESPONDENCE_RESULT_SHA256 =
  "5e993b9b3434c9e097531a34254bce07a832e6e4f436a45c4ae77e3ad69d4f8c";
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const ASSESSMENT_SHA256 =
  "8e9d47366fcc95d54093236afde4997b9957b2cb4a20d4327cec49b205f4a510";

class Row23OutputEvidenceFailure extends Error {}
function fail(message) { throw new Row23OutputEvidenceFailure(message); }
function same(actual, expected, name) {
  if (!v2.canonical(actual).equals(v2.canonical(expected))) fail(`${name} changed`);
}
function exactKeys(value, expected, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    fail(`${name} must be an object`);
  same(Object.keys(value).sort(), [...expected].sort(), `${name} fields`);
  return value;
}
function evidence(id, kind, shape, value, encoding = "canonical_json") {
  return { encoding, id, kind, sha256: v2.sha256Canonical(value),
    shape: shape.map(String) };
}
function chunks(values, count, width, name) {
  if (!Array.isArray(values) || values.length !== count * width)
    fail(`${name} changed shape`);
  return Array.from({ length: count }, (_, index) =>
    values.slice(index * width, (index + 1) * width));
}

function openSource(sourceRaw) {
  if (!Buffer.isBuffer(sourceRaw) || neutral.sha256Bytes(sourceRaw) !== SOURCE_SHA256)
    fail("row-23 terminal source authority changed");
  let envelope;
  try { envelope = JSON.parse(sourceRaw.toString("ascii")); }
  catch (error) {
    throw new Row23OutputEvidenceFailure("row-23 terminal source is not JSON",
      { cause: error });
  }
  if (!v2.canonical(envelope).equals(sourceRaw))
    fail("row-23 terminal source is not canonical JSON");
  exactKeys(envelope, ["payload", "payloadSha256", "schema"], "source envelope");
  if (envelope.schema !== SOURCE_SCHEMA ||
      envelope.payloadSha256 !== SOURCE_PAYLOAD_SHA256 ||
      v2.sha256Canonical(envelope.payload) !== SOURCE_PAYLOAD_SHA256)
    fail("row-23 terminal source payload authority changed");
  return envelope.payload;
}

function verifyFreshSource(receipt) {
  transaction.verifyFreshPreparedReceipt(receipt);
  if (receipt.freshPreparedExecution !== true ||
      receipt.correspondenceComplete !== true || receipt.publicComplete !== false ||
      receipt.finalSource?.sha256 !== SOURCE_SHA256 ||
      receipt.neutralResult?.sha256 !== CORRESPONDENCE_RESULT_SHA256)
    fail("fresh row-23 receipt is detached from the retained source");
}

function buildRow23OutputEvidenceGap(sourceRaw, freshReceipt) {
  verifyFreshSource(freshReceipt);
  const source = openSource(sourceRaw);
  const field = source.field;
  same(field.polynomial, ["341", "-970", "772", "-141", "-2", "1"],
    "field polynomial");
  if (field.degree !== "5" || field.precision !== "256") fail("field state changed");

  const factorBase = source.factorBase;
  if (!Array.isArray(factorBase.ideals) || factorBase.ideals.length !== 31 ||
      factorBase.ideals.some(ideal => !Array.isArray(ideal) || ideal.length !== 25))
    fail("actual factor base changed shape");
  const relations = source.relations;
  same(relations.recordsShape, [31, 40], "source relation shape");
  same(relations.principalGeneratorsShape, [40, 5],
    "source principal-generator shape");
  if (!Array.isArray(relations.recordsColumnMajor) ||
      relations.recordsColumnMajor.length !== 1240 ||
      !Array.isArray(relations.principalGenerators) ||
      relations.principalGenerators.length !== 200)
    fail("actual relation collection changed shape");

  const classGroup = source.classGroup;
  if (classGroup.classNumber !== "6") fail("class number changed");
  same(classGroup.invariantFactors, ["6"], "class invariants");
  const presentation = classGroup.presentation;
  same(presentation.W, ["6"], "terminal relation matrix");
  same(presentation.matrices.U, ["1"], "terminal Smith U");
  same(presentation.matrices.V, ["1"], "terminal Smith V");
  same(presentation.matrices.D, ["6"], "terminal Smith D");
  if (presentation.identities?.UWVEqualsD !== true) fail("terminal Smith identity absent");

  const fundamental = source.units.fundamental;
  if (fundamental.freeRank !== "4") fail("unit rank changed");
  const unitCoordinates = chunks(fundamental.coordinates, 4, 5,
    "exact unit coordinates");
  const unitNorms = chunks(fundamental.norms, 4, 1, "exact unit norms");
  const unitTransforms = chunks(fundamental.compact.unitTransform, 4, 9,
    "compact unit transforms");
  const unitLogs = chunks(fundamental.compact.outputPackedLogs, 4, 35,
    "compact unit logs");
  if (source.units.torsion.order !== "2" ||
      source.regulator.rigorousEnclosure !== false ||
      source.terminal.buchallEndEquivalentAssemblyComplete !== true)
    fail("retained terminal output changed");

  const entries = [
    evidence("actual-factor-base", "factor_base_ideals", [31, 25],
      factorBase.ideals, "decimal_integer_matrix"),
    evidence("actual-principal-generators", "principal_generators", [40, 5],
      relations.principalGenerators, "decimal_integer_matrix"),
    evidence("actual-relation-matrix-column-major", "relation_matrix", [40, 31],
      relations.recordsColumnMajor, "decimal_integer_matrix"),
    evidence("class-ideal", "class_generator_ideal", [5, 5],
      classGroup.generatorIdeals[0], "decimal_integer_matrix"),
    evidence("class-principal-witness", "principal_order_witness", [], {
      compact: classGroup.compactPrincipalOrderWitnesses[0],
      expandedPrincipalGenerator: classGroup.expandedPrincipalGenerator,
      genback: classGroup.genback,
    }),
    evidence("regulator-acceptance", "regulator_acceptance", [], {
      acceptanceState: source.regulator.acceptanceState,
      reconstructionState: source.regulator.reconstructionState,
    }),
    evidence("regulator-packed", "pari_packed_regulator", [3],
      source.regulator.value, "decimal_real_interval"),
    evidence("regulator-precision", "regulator_precision", [], {
      bits: field.precision, analyticState: source.regulator.analyticState,
    }),
    evidence("regulator-retry", "regulator_retry", [], {
      multipleState: source.regulator.multipleState,
      postHnfState: source.regulator.postHnfState,
    }),
    evidence("terminal-presentation-d", "presentation_diagonal", [1, 1],
      presentation.matrices.D, "decimal_integer_matrix"),
    evidence("terminal-presentation-provenance", "provenance", [], {
      identities: presentation.identities, states: presentation.states,
    }),
    evidence("terminal-presentation-u", "presentation_transform_left", [1, 1],
      presentation.matrices.U, "decimal_integer_matrix"),
    evidence("terminal-presentation-v", "presentation_transform_right", [1, 1],
      presentation.matrices.V, "decimal_integer_matrix"),
    evidence("terminal-presentation-w", "presentation_transform_middle", [1, 1],
      presentation.W, "decimal_integer_matrix"),
    evidence("torsion-generator", "torsion_generator", [5],
      source.units.torsion.generator, "decimal_integer_matrix"),
  ];
  for (let index = 0; index < 4; index += 1) {
    entries.push(
      evidence(`unit-${index}-coordinates`, "exact_unit_coordinates", [5],
        unitCoordinates[index], "decimal_integer_matrix"),
      evidence(`unit-${index}-log`, "compact_unit_log", [35], unitLogs[index]),
      evidence(`unit-${index}-norm`, "exact_unit_norm", [], unitNorms[index][0]),
      evidence(`unit-${index}-provenance`, "compact_unit_provenance", [], {
        index: String(index), owner: source.owners.units.contentSha256,
        realSigns: fundamental.realSigns.slice(5 * index, 5 * index + 5),
      }),
      evidence(`unit-${index}-transform`, "compact_unit_relation_transform", [9],
        unitTransforms[index], "decimal_integer_matrix"),
    );
  }
  entries.sort((left, right) => left.id.localeCompare(right.id));

  const missing = ["actual-relation-log-matrix", "combine-map-material",
    "factor-map-material", "raw-presentation-d-40x31",
    "raw-presentation-u-40x40", "raw-presentation-v-31x31",
    "raw-presentation-w-40x31", "reduce-map-material"];
  const assessment = {
    actualRelations: {
      factorBaseCount: "31", factorBaseRef: "actual-factor-base",
      layout: "retained-column-major-31-by-40-logical-relations-40-by-31",
      logs: { missing: ["actual-relation-log-matrix"], ready: false },
      principalGeneratorsRef: "actual-principal-generators", relationCount: "40",
      relationMatrixRef: "actual-relation-matrix-column-major",
    },
    completion: { correspondenceComplete: true, freshCorrespondence: true,
      missing, outputBoundaryComplete: false, phase3Complete: false,
      phase4Complete: true, phase5Complete: false },
    evidence: entries,
    field: { definingPolynomialAscending: [...field.polynomial], degree: "5",
      id: field.label },
    maps: {
      combine: { missing: ["combine-map-material"], ready: false },
      factor: { missing: ["factor-map-material"], ready: false },
      reduce: { missing: ["reduce-map-material"], ready: false },
    },
    publishableAsV2: false,
    retainedOutput: {
      classGroup: { classNumber: "6", generatorIdealRef: "class-ideal",
        invariantFactors: ["6"], principalWitnessRef: "class-principal-witness" },
      regulator: { acceptanceRef: "regulator-acceptance",
        kind: "pari_packed_accepted", packedValueRef: "regulator-packed",
        precisionBits: "256", precisionRef: "regulator-precision",
        retryRef: "regulator-retry" },
      terminalPresentation: { dRef: "terminal-presentation-d",
        identity: "U W V = D", shape: ["1", "1"],
        uRef: "terminal-presentation-u", vRef: "terminal-presentation-v",
        wRef: "terminal-presentation-w" },
      torsion: { generatorRef: "torsion-generator", order: "2" },
      units: Array.from({ length: 4 }, (_, index) => ({
        coordinatesRef: `unit-${index}-coordinates`, logRef: `unit-${index}-log`,
        normRef: `unit-${index}-norm`, provenanceRef: `unit-${index}-provenance`,
        transformRef: `unit-${index}-transform`,
      })),
    },
    schema: SCHEMA,
    source: { correspondenceResultSha256: CORRESPONDENCE_RESULT_SHA256,
      pariSourceSha256: PARI_SOURCE_SHA256, pariVersion: "2.17.4",
      retainedSourceSha256: SOURCE_SHA256 },
    v2Gap: { contractSchema: v2.SCHEMA,
      reason: "raw relation shapes lack a dimension-matched retained presentation proof",
      requiredPresentationShapes: { d: ["40", "31"], u: ["40", "40"],
        v: ["31", "31"], w: ["40", "31"] } },
  };
  return Object.freeze({ assessment, bytes: v2.canonical(assessment),
    sha256: v2.sha256Canonical(assessment) });
}

function parseRow23OutputEvidenceGap(raw) {
  if (!Buffer.isBuffer(raw) || neutral.sha256Bytes(raw) !== ASSESSMENT_SHA256)
    fail("row-23 v2 gap assessment authority changed");
  let assessment;
  try { assessment = JSON.parse(raw.toString("ascii")); }
  catch (error) {
    throw new Row23OutputEvidenceFailure("row-23 v2 gap assessment is not JSON",
      { cause: error });
  }
  if (!v2.canonical(assessment).equals(raw) || assessment.schema !== SCHEMA ||
      assessment.publishableAsV2 !== false ||
      assessment.completion?.phase5Complete !== false ||
      assessment.actualRelations?.factorBaseCount !== "31" ||
      assessment.actualRelations?.relationCount !== "40")
    fail("row-23 v2 gap assessment semantics changed");
  return assessment;
}

module.exports = Object.freeze({ ASSESSMENT_SHA256, CORRESPONDENCE_RESULT_SHA256,
  SCHEMA, SOURCE_SHA256, Row23OutputEvidenceFailure,
  buildRow23OutputEvidenceGap, parseRow23OutputEvidenceGap });

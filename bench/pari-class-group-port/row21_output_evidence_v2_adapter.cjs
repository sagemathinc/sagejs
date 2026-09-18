"use strict";

// Additive projection of the authenticated row-21 final source envelope onto
// the field-neutral output-evidence-v2 contract.  This adapter intentionally
// records absent lazy maps and independent certificates instead of promoting
// the upstream-assumed PARI correspondence to a public result.

const crypto = require("node:crypto");
const output = require("./class_unit_output_evidence_v2.cjs");

const SOURCE_SCHEMA = "sagejs.pari-class-group/row21-final-buchall-end-v1";
const SOURCE_SHA256 =
  "92d7ecc79647fed4c330e2d1a97f50420623843bcd4320a7322a7422f168eb03";
const SOURCE_PAYLOAD_SHA256 =
  "b933bc7e6861b0073c0cff355c7be5e3c0cc6ff695a683040b46f9e399ab569f";
const CORRESPONDENCE_RESULT_SHA256 =
  "df3dddcf96d6cb77c6f9f4003eaeff4c68485d9c1cb48b4e39f7f23a0eab1c8a";
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const FIELD_ID = "5.3.1009349859375.3";

class Row21OutputEvidenceFailure extends Error {}

function fail(message) {
  throw new Row21OutputEvidenceFailure(message);
}

function sha256(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function plain(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${name} must be an object`);
  }
  return value;
}

function array(value, length, name) {
  if (!Array.isArray(value) || value.length !== length) {
    fail(`${name} has the wrong length`);
  }
  return value;
}

function equal(actual, expected, name) {
  if (!output.canonical(actual).equals(output.canonical(expected))) {
    fail(`${name} changed`);
  }
}

function evidence(id, kind, shape, material, encoding = "canonical_json") {
  return {
    encoding,
    id,
    kind,
    sha256: output.sha256Canonical(material),
    shape,
  };
}

function transpose(values, rows, columns, name) {
  array(values, rows * columns, name);
  return Array.from({ length: columns }, (_, column) =>
    Array.from({ length: rows }, (_, row) => values[row * columns + column]),
  ).flat();
}

function openSource(sourceRaw) {
  if (!Buffer.isBuffer(sourceRaw) || sha256(sourceRaw) !== SOURCE_SHA256) {
    fail("row-21 source envelope lacks its reviewed identity");
  }
  let envelope;
  try {
    envelope = JSON.parse(sourceRaw.toString("ascii"));
  } catch (error) {
    throw new Row21OutputEvidenceFailure("row-21 source is not JSON", {
      cause: error,
    });
  }
  if (!output.canonical(envelope).equals(sourceRaw)) {
    fail("row-21 source envelope is not canonical JSON");
  }
  if (envelope.schema !== SOURCE_SCHEMA ||
      envelope.payloadSha256 !== SOURCE_PAYLOAD_SHA256 ||
      output.sha256Canonical(envelope.payload) !== SOURCE_PAYLOAD_SHA256) {
    fail("row-21 source payload authority changed");
  }
  return plain(envelope.payload, "row-21 source payload");
}

function buildRow21OutputEvidenceV2(sourceRaw) {
  const source = openSource(sourceRaw);
  const field = plain(source.field, "field");
  equal(field.polynomial, ["36", "930", "-305", "-90", "0", "1"],
    "field polynomial");
  if (field.degree !== "5" || field.precision !== "192") {
    fail("row-21 field degree or precision changed");
  }

  const factorBase = plain(source.factorBase?.value?.factorBase, "factor base");
  const ideals = array(factorBase.ideals, 24, "factor-base ideals");
  ideals.forEach((ideal, index) => array(ideal, 25,
    `factor-base ideal ${index}`));
  const relations = plain(source.relations, "relations");
  const relationEntries = array(relations.recordsColumnMajor, 32 * 24,
    "relation entries");
  const principalGenerators = array(relations.generators, 32 * 5,
    "principal generators");
  const logs = plain(source.logarithms, "logarithms");
  const realLogs = array(logs.realLogs, 32 * 3, "relation logs");

  const classGroup = plain(source.classGroup, "class group");
  if (classGroup.classNumber !== "1" ||
      classGroup.invariantFactors?.length !== 0 ||
      classGroup.generatorIdeals?.length !== 0) {
    fail("row-21 trivial class group changed");
  }
  const presentation = plain(classGroup.presentation, "presentation");
  array(presentation.rightInverse, 32 * 24, "presentation right inverse");
  const leftInverse = transpose(presentation.rightInverse, 32, 24,
    "presentation right inverse");
  const smith = plain(classGroup.smith, "Smith presentation");
  const identity = array(smith.diagonal, 24 * 24, "Smith identity");

  const fundamental = plain(source.units?.fundamental, "fundamental units");
  if (fundamental.freeRank !== "3") fail("row-21 unit rank changed");
  const coordinates = array(fundamental.coordinates, 3 * 5,
    "exact unit coordinates");
  const norms = array(fundamental.norms, 3, "exact unit norms");
  if (norms.some(norm => norm !== "1" && norm !== "-1")) {
    fail("row-21 unit norm changed");
  }
  const compact = plain(fundamental.compact, "compact units");
  const unitTransform = array(compact.unitTransform, 8 * 3,
    "compact unit transform");
  const realUnitLogs = array(compact.outputLogs?.real, 3 * 12,
    "compact real logs");
  const imaginaryUnitLogs = array(compact.outputLogs?.imaginary, 3 * 12,
    "compact imaginary logs");
  const torsion = plain(source.units?.torsion, "torsion");
  if (torsion.order !== "2") fail("row-21 torsion order changed");
  const torsionGenerator = array(torsion.generator, 5, "torsion generator");
  const regulator = plain(source.regulator, "regulator");
  const packedRegulator = array(regulator.value, 3, "packed regulator");
  const terminal = plain(source.terminal, "terminal state");
  if (terminal.correspondenceComplete !== true ||
      terminal.buchallEndComplete !== true ||
      terminal.phase5CompleteForRow21 !== true ||
      terminal.publicComplete !== false) {
    fail("row-21 terminal tier changed");
  }

  const entries = [
    evidence("factor-base-ideals", "factor_base_ideals", ["24", "25"],
      ideals, "decimal_integer_matrix"),
    evidence("presentation-dependency", "dependency", ["32", "24"], {
      rightInverse: presentation.rightInverse,
      rightInverseShape: presentation.rightInverseShape,
      transform: presentation.transform,
      transformDeterminant: presentation.transformDeterminant,
      transformShape: presentation.transformShape,
    }),
    evidence("presentation-identity", "presentation_identity", ["24", "24"],
      identity, "decimal_integer_matrix"),
    evidence("presentation-provenance", "provenance", [], {
      assumptions: source.assumptions,
      presentationShape: presentation.relationShape,
      sourcePayloadSha256: SOURCE_PAYLOAD_SHA256,
      terminal,
    }),
    evidence("presentation-right-inverse", "presentation_right_inverse",
      ["24", "32"], leftInverse, "decimal_integer_matrix"),
    evidence("presentation-matrix", "presentation_matrix", ["32", "24"],
      relationEntries, "decimal_integer_matrix"),
    evidence("principal-generators", "principal_generators", ["32", "5"],
      principalGenerators, "decimal_integer_matrix"),
    evidence("regulator-acceptance", "regulator_acceptance", [], {
      acceptanceState: regulator.acceptanceState,
      analyticState: regulator.analyticState,
      inverseHr: regulator.inverseHr,
      multipleState: regulator.multipleState,
    }),
    evidence("regulator-packed", "pari_packed_regulator", ["3"],
      packedRegulator),
    evidence("regulator-precision", "regulator_precision", [], "192"),
    evidence("regulator-retry", "regulator_retry", [], {
      catalogState: regulator.catalogState,
      reconstructionState: regulator.reconstructionState,
    }),
    evidence("relation-logs", "relation_logs", ["32", "3"], realLogs),
    evidence("relation-matrix", "relation_matrix", ["32", "24"],
      relationEntries, "decimal_integer_matrix"),
    evidence("torsion-generator", "torsion_generator", ["5"],
      torsionGenerator, "decimal_integer_matrix"),
  ];
  const compactUnits = [];
  const exactUnits = [];
  for (let index = 0; index < 3; index += 1) {
    const suffix = String(index + 1);
    const transformId = `unit-${suffix}-relation-transform`;
    const provenanceId = `unit-${suffix}-provenance`;
    const logId = `unit-${suffix}-log`;
    const coordinatesId = `unit-${suffix}-coordinates`;
    const normId = `unit-${suffix}-norm`;
    entries.push(
      evidence(coordinatesId, "exact_unit_coordinates", ["5"],
        coordinates.slice(index * 5, (index + 1) * 5),
        "decimal_integer_matrix"),
      evidence(logId, "compact_unit_log", ["24"], {
        imaginary: imaginaryUnitLogs.slice(index * 12, (index + 1) * 12),
        real: realUnitLogs.slice(index * 12, (index + 1) * 12),
      }),
      evidence(normId, "exact_unit_norm", [], norms[index],
        "decimal_integer_matrix"),
      evidence(provenanceId, "compact_unit_provenance", [], {
        cleanarchState: compact.cleanarchState,
        getfuFactor: compact.getfuFactor,
        getfuState: compact.getfuState,
        index: suffix,
      }),
      evidence(transformId, "compact_unit_relation_transform", ["8"],
        unitTransform.slice(index * 8, (index + 1) * 8),
        "decimal_integer_matrix"),
    );
    compactUnits.push({
      logRef: logId,
      provenanceRef: provenanceId,
      relationTransformRef: transformId,
    });
    exactUnits.push({ coordinatesRef: coordinatesId, normRef: normId });
  }
  entries.sort((left, right) => left.id.localeCompare(right.id));

  const missingMaps = name => ({
    evidenceRefs: [],
    missing: [`${name}-lazy-materialization`],
    ready: false,
  });
  const payload = {
    classGroup: {
      classNumber: "1",
      generators: [],
      invariantFactors: [],
    },
    completion: {
      correspondenceComplete: true,
      freshCorrespondence: true,
      missing: [
        "combine-lazy-materialization",
        "factor-lazy-materialization",
        "independent-regulator-enclosure",
        "independent-saturation-certificate",
        "proved-factor-base-bound",
        "public-api-integration",
        "reduce-lazy-materialization",
      ],
      outputBoundaryComplete: false,
      phase3Complete: true,
      phase4Complete: true,
      phase5Complete: false,
    },
    evidence: entries,
    field: {
      definingPolynomialAscending: [...field.polynomial],
      degree: "5",
      id: FIELD_ID,
    },
    maps: {
      combine: missingMaps("combine"),
      factor: missingMaps("factor"),
      reduce: missingMaps("reduce"),
    },
    presentation: {
      dependencyRefs: ["presentation-dependency"],
      proof: { identityRef: "presentation-identity",
        matrixRef: "presentation-matrix",
        rightInverseRef: "presentation-right-inverse" },
      provenanceRefs: ["presentation-provenance"],
      variant: "right_inverse",
    },
    relations: {
      factorBaseCount: "24",
      factorBaseRef: "factor-base-ideals",
      logColumns: "3",
      logsRef: "relation-logs",
      principalGeneratorsRef: "principal-generators",
      relationCount: "32",
      relationMatrixRef: "relation-matrix",
    },
    schema: output.SCHEMA,
    source: {
      correspondenceResultSha256: CORRESPONDENCE_RESULT_SHA256,
      pariSourceSha256: PARI_SOURCE_SHA256,
      pariVersion: "2.17.4",
    },
    unitGroup: {
      compactUnits,
      exactUnits: { status: "present", units: exactUnits },
      rank: "3",
      regulator: {
        acceptanceRef: "regulator-acceptance",
        kind: "pari_packed_accepted",
        packedValueRef: "regulator-packed",
        precisionBits: "192",
        precisionRef: "regulator-precision",
        retryRef: "regulator-retry",
      },
      torsion: { generatorRef: "torsion-generator", order: "2" },
    },
  };
  output.validate(payload);
  return payload;
}

module.exports = Object.freeze({
  CORRESPONDENCE_RESULT_SHA256,
  FIELD_ID,
  PARI_SOURCE_SHA256,
  Row21OutputEvidenceFailure,
  SOURCE_PAYLOAD_SHA256,
  SOURCE_SHA256,
  buildRow21OutputEvidenceV2,
});

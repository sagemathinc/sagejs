"use strict";

// Row 19's additive output-evidence-v2 projection. The raw Smith proof is
// dimensioned for the actual 430-by-424 relation surface. Phases 3 and 4 are
// complete; the public boundary remains incomplete because general maps are
// not retained.

const crypto = require("node:crypto");
const neutral = require("./class_unit_correspondence_result.cjs");
const v2 = require("./class_unit_output_evidence_v2.cjs");

const ASSESSMENT_SCHEMA =
  "sagejs.pari-class-group/row19-output-evidence-v2-assessment-v2";
const CORRESPONDENCE_SHA256 =
  "a9642e255d536cde1c13740b0452bbdedf917cc851b753c2ec6152df2622eb66";
const FIELD_ID = "3.1.1086061775432017340256300.107";
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";

class Row19OutputEvidenceFailure extends Error {}
function fail(message) { throw new Row19OutputEvidenceFailure(message); }
function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function digest(value) { return v2.sha256Canonical(value); }

function authenticateRow19Correspondence(raw) {
  if (!Buffer.isBuffer(raw) || sha(raw) !== CORRESPONDENCE_SHA256)
    fail("row-19 fresh correspondence bytes changed");
  let envelope;
  try { envelope = JSON.parse(raw.toString("ascii")); }
  catch (error) {
    throw new Row19OutputEvidenceFailure("row-19 correspondence is not JSON", { cause: error });
  }
  if (!neutral.canonical(envelope).equals(raw) ||
      envelope.schema !== neutral.ENVELOPE_SCHEMA ||
      envelope.payloadSha256 !== neutral.sha256Canonical(envelope.payload))
    fail("row-19 correspondence envelope changed");
  neutral.validatePayload(envelope.payload);
  const payload = envelope.payload;
  if (payload.field.id !== FIELD_ID || payload.source.pariVersion !== "2.17.4" ||
      payload.source.pariSourceSha256 !== PARI_SOURCE_SHA256 ||
      payload.classGroup.classNumber !== "39366" ||
      payload.terminal.correspondence_complete !== true ||
      payload.terminal.public_complete !== false)
    fail("row-19 correspondence identity changed");
  return payload;
}

function owners(payload) {
  return new Map(payload.storage.map(owner => [owner.name, owner]));
}
function storage(map, name, expectedLength) {
  const value = map.get(name);
  if (!value || value.logicalLength !== String(value.entries.length) ||
      value.entries.length !== expectedLength) fail(`row-19 storage owner ${name} changed`);
  return value.entries;
}
function decode(map, name) {
  const value = map.get(name);
  if (!value || value.logicalLength !== String(value.entries.length))
    fail(`row-19 storage owner ${name} changed`);
  const bytes = Buffer.from(value.entries.map((entry, index) => {
    const byte = Number(entry);
    if (!Number.isInteger(byte) || byte < 0 || byte > 255)
      fail(`${name}[${index}] is not a byte`);
    return byte;
  }));
  const result = JSON.parse(bytes.toString("ascii"));
  if (!v2.canonical(result).equals(bytes)) fail(`${name} is not canonical JSON`);
  return result;
}
function evidence(id, kind, value, shape, encoding = "canonical_json") {
  return { encoding, id, kind, sha256: digest(value), shape: shape.map(String) };
}
function chunks(values, count, width, name) {
  if (!Array.isArray(values) || values.length !== count * width)
    fail(`${name} changed shape`);
  return Array.from({ length: count }, (_, index) =>
    values.slice(index * width, (index + 1) * width));
}

function collect(raw) {
  const payload = authenticateRow19Correspondence(raw);
  const map = owners(payload);
  const factorBase = decode(map, "factor-base");
  const relationMatrix = storage(map, "relation-records", 430 * 424);
  const principalGenerators = storage(map, "relation-generators", 430 * 3);
  const relationLogs = storage(map, "relation-logs", 430 * 14);
  const retainedClassIdeals = chunks(storage(map, "class-generator-ideals", 9 * 9),
    9, 9, "class-generator-ideals");
  const retainedClassWitnesses = decode(map, "class-order-witnesses");
  // Retained presentation coordinates put the order-six generator first.
  // The public invariant-factor convention is eight 3s followed by 6.
  const classOrder = [1, 2, 3, 4, 5, 6, 7, 8, 0];
  const classIdeals = classOrder.map(index => retainedClassIdeals[index]);
  const classWitnesses = classOrder.map(index => retainedClassWitnesses[index]);
  const compactUnit = decode(map, "compact-fundamental-unit");
  const regulator = decode(map, "regulator-enclosure");
  const unitMaterialization = decode(map, "unit-materialization-evidence");
  const torsion = storage(map, "torsion-generator", 3);
  const sourceBoundary = decode(map, "source-boundary-status");
  if (factorBase.size !== 424 || factorBase.idealHnfs.length !== 424 ||
      factorBase.idealHnfs.some(ideal => !Array.isArray(ideal) || ideal.length !== 9) ||
      retainedClassWitnesses.length !== 9 ||
      classWitnesses.map(witness => witness.presentation.properDivisorsRejected)
        .map(divisors => divisors.length === 3 ? "6" : "3").join(",") !==
        payload.classGroup.invariantFactors.join(",") ||
      compactUnit.relationExponents.length !== 430 ||
      compactUnit.relationDependencyVerified !== true ||
      compactUnit.principalIdealVerified !== true ||
      regulator.regulator.length !== 2 || regulator.regulatorMatched !== true ||
      regulator.productFormulaVerified !== true ||
      unitMaterialization.tag !== "not_given" || unitMaterialization.reason !== "LARGE" ||
      unitMaterialization.precisionBits !== 192 ||
      sourceBoundary.sourceBoundary.freshPreparedInput !== true ||
      sourceBoundary.sourceBoundary.privateSameRunOwners !== true ||
      sourceBoundary.sourceBoundary.usedW0RuntimeData !== false ||
      sourceBoundary.sourceBoundary.qualifiedTiming !== false)
    fail("row-19 retained source state changed");

  // Lazy loading avoids a module-initialization cycle: the raw proof reuses
  // the authentication function exported by this module.
  const proof = require("./row19_raw_relation_smith_proof.cjs")
    .buildRow19RawRelationSmithProof(raw);
  const dependencies = proof.material.u.slice(424 * 430);
  const entries = [
    evidence("factor-base-ideals", "factor_base_ideals", factorBase.idealHnfs,
      [424, 9], "decimal_integer_matrix"),
    evidence("principal-generators", "principal_generators", principalGenerators,
      [430, 3], "decimal_integer_matrix"),
    evidence("raw-relation-dependencies", "dependency", dependencies,
      [6, 430], "decimal_integer_matrix"),
    evidence("raw-smith-d", "presentation_diagonal", proof.material.d,
      [430, 424], "decimal_integer_matrix"),
    evidence("raw-smith-provenance", "provenance", {
      identity: proof.identity, materialSha256: proof.materialSha256,
      source: proof.source,
    }, []),
    evidence("raw-smith-u", "presentation_transform_left", proof.material.u,
      [430, 430], "decimal_integer_matrix"),
    evidence("raw-smith-v", "presentation_transform_right", proof.material.v,
      [424, 424], "decimal_integer_matrix"),
    evidence("raw-smith-w", "presentation_transform_middle", relationMatrix,
      [430, 424], "decimal_integer_matrix"),
    evidence("relation-logs", "relation_logs", relationLogs,
      [430, 14], "opaque_canonical_bytes"),
    evidence("relation-matrix", "relation_matrix", relationMatrix,
      [430, 424], "decimal_integer_matrix"),
    evidence("regulator-acceptance", "regulator_acceptance", {
      productFormulaVerified: regulator.productFormulaVerified,
      regulatorMatched: regulator.regulatorMatched,
      regulatorResidual: regulator.regulatorResidual,
      regulatorResidualBound: regulator.regulatorResidualBound,
    }, []),
    evidence("regulator-enclosure", "regulator_enclosure", regulator.regulator,
      [2], "decimal_real_interval"),
    evidence("regulator-precision", "regulator_precision", {
      precisionBits: "192", productFormulaResidualBound:
        regulator.productFormulaResidualBound,
    }, []),
    evidence("torsion-generator", "torsion_generator", torsion,
      [3], "decimal_integer_matrix"),
    evidence("unit-log", "compact_unit_log", {
      imaginary: regulator.unitImaginary, real: regulator.unitReal,
    }, [2]),
    evidence("unit-provenance", "compact_unit_provenance", {
      allNormValuationsZero: compactUnit.allNormValuationsZero,
      exactNorm: compactUnit.exactNorm,
      generatorNormsSha256: compactUnit.generatorNormsSha256,
      representation: compactUnit.representation,
    }, []),
    evidence("unit-relation-transform", "compact_unit_relation_transform",
      compactUnit.relationExponents, [430], "decimal_integer_matrix"),
  ];
  classIdeals.forEach((ideal, index) => entries.push(
    evidence(`class-ideal-${index}`, "class_generator_ideal", ideal,
      [3, 3], "decimal_integer_matrix"),
    evidence(`class-witness-${index}`, "principal_order_witness",
      classWitnesses[index], []),
  ));
  entries.sort((left, right) => left.id.localeCompare(right.id));

  const missing = ["combine-map-material", "factor-map-material", "reduce-map-material"];
  const output = {
    schema: v2.SCHEMA,
    field: { definingPolynomialAscending:
        [...payload.field.definingPolynomialAscending], degree: "3", id: FIELD_ID },
    source: { correspondenceResultSha256: CORRESPONDENCE_SHA256,
      pariSourceSha256: PARI_SOURCE_SHA256, pariVersion: "2.17.4" },
    evidence: entries,
    relations: { factorBaseCount: "424", factorBaseRef: "factor-base-ideals",
      logColumns: "14", logsRef: "relation-logs",
      principalGeneratorsRef: "principal-generators", relationCount: "430",
      relationMatrixRef: "relation-matrix" },
    presentation: { dependencyRefs: ["raw-relation-dependencies"],
      proof: { dRef: "raw-smith-d", uRef: "raw-smith-u",
        vRef: "raw-smith-v", wRef: "raw-smith-w" },
      provenanceRefs: ["raw-smith-provenance"], variant: "smith_uwvd" },
    classGroup: { classNumber: "39366",
      generators: payload.classGroup.invariantFactors.map((order, index) => ({
        archimedeanRefs: [], idealRef: `class-ideal-${index}`, order,
        principalWitnessRef: `class-witness-${index}`,
      })), invariantFactors: [...payload.classGroup.invariantFactors] },
    unitGroup: { compactUnits: [{ logRef: "unit-log",
      provenanceRef: "unit-provenance",
      relationTransformRef: "unit-relation-transform" }],
    exactUnits: { precisionBits: "192", reason: "LARGE", status: "not_given" },
    rank: "1", regulator: { acceptanceRef: "regulator-acceptance",
      enclosureRef: "regulator-enclosure", kind: "rigorous_enclosure",
      precisionBits: "192", precisionRef: "regulator-precision" },
    torsion: { generatorRef: "torsion-generator", order: "2" } },
    maps: {
      combine: { evidenceRefs: [], missing: ["combine-map-material"], ready: false },
      factor: { evidenceRefs: [], missing: ["factor-map-material"], ready: false },
      reduce: { evidenceRefs: [], missing: ["reduce-map-material"], ready: false },
    },
    completion: { correspondenceComplete: true, freshCorrespondence: true,
      missing, outputBoundaryComplete: false, phase3Complete: true,
      phase4Complete: true, phase5Complete: false },
  };
  v2.validate(output);
  return { output: Object.freeze(output), proof };
}

function buildRow19OutputEvidence(raw) {
  return collect(raw).output;
}

function assessRow19OutputEvidence(raw) {
  const { output, proof } = collect(raw);
  return Object.freeze({
    schema: ASSESSMENT_SCHEMA,
    source: output.source,
    field: output.field,
    status: "valid-v2-incomplete-output-boundary",
    rawRelations: { factorBaseCount: "424", relationCount: "430",
      logColumns: "14", evidence: output.evidence.filter(entry =>
        new Set(["factor-base-ideals", "principal-generators", "relation-logs",
          "relation-matrix"]).has(entry.id)) },
    rawSmithPresentation: { identity: proof.identity,
      diagonalFactors: proof.diagonalFactors,
      materialSha256: proof.materialSha256,
      shapes: proof.shapes },
    missing: { owners: [], capability: [], maps: [...output.completion.missing],
      reason: "general-class-group-maps-not-retained" },
    completion: { ...output.completion, phase4MaterialRetained: true },
    outputEvidenceSha256: digest(output),
    qualifiedTiming: false,
  });
}

module.exports = Object.freeze({ ASSESSMENT_SCHEMA, CORRESPONDENCE_SHA256, FIELD_ID,
  PARI_SOURCE_SHA256, Row19OutputEvidenceFailure,
  authenticateRow19Correspondence, assessRow19OutputEvidence,
  buildRow19OutputEvidence });

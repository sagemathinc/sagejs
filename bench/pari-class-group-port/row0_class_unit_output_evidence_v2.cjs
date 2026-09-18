"use strict";

// Authenticated gap assessment over the immutable fresh row-0 correspondence.
// It deliberately does not manufacture a v2 payload: the retained 8x8
// terminal presentation and 15x8 maps do not prove a 66x73 right inverse for
// the actual 73x66 relation matrix.

const crypto = require("node:crypto");
const neutral = require("./class_unit_correspondence_result.cjs");
const output = require("./class_unit_output_evidence_v2.cjs");

const ASSESSMENT_SCHEMA =
  "sagejs.pari-class-group/row0-output-evidence-v2-gap-assessment-v1";
const CORRESPONDENCE_SHA256 =
  "dbf645dd5bdf4eb2f27dbaa769d1c08d454c551318a32611b47a1a232754da58";
const FIELD_ID = "pari-2.17.4:x^3-20018*x+20034";
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";

class Row0OutputEvidenceFailure extends Error {}
function fail(message) { throw new Row0OutputEvidenceFailure(message); }
function sha256(raw) { return crypto.createHash("sha256").update(raw).digest("hex"); }
function storageMap(payload) {
  return new Map(payload.storage.map(value => [value.name, value]));
}
function owner(storage, name, length = undefined) {
  const value = storage.get(name);
  if (!value || value.logicalLength !== String(value.entries.length) ||
      (length !== undefined && value.entries.length !== length)) {
    fail(`row-0 owner ${name} changed`);
  }
  return value.entries;
}
function decodeCanonicalBytes(entries, name) {
  const raw = Buffer.from(entries.map((entry, index) => {
    const byte = Number(entry);
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      fail(`${name}[${index}] is not a byte`);
    }
    return byte;
  }));
  let value;
  try { value = JSON.parse(raw.toString("ascii")); }
  catch (error) {
    throw new Row0OutputEvidenceFailure(`${name} is not JSON`, { cause: error });
  }
  if (!output.canonical(value).equals(raw)) fail(`${name} is not canonical JSON`);
  return value;
}
function evidence(id, kind, shape, material, encoding = "canonical_json") {
  return { encoding, id, kind, sha256: output.sha256Canonical(material),
    shape: shape.map(String) };
}
function openEnvelope(raw) {
  if (!Buffer.isBuffer(raw) || sha256(raw) !== CORRESPONDENCE_SHA256) {
    fail("row-0 correspondence bytes lack their reviewed identity");
  }
  let envelope;
  try { envelope = JSON.parse(raw.toString("ascii")); }
  catch (error) {
    throw new Row0OutputEvidenceFailure("row-0 correspondence is not JSON", {
      cause: error,
    });
  }
  if (!neutral.canonical(envelope).equals(raw) ||
      envelope.schema !== neutral.ENVELOPE_SCHEMA ||
      envelope.payloadSha256 !== neutral.sha256Canonical(envelope.payload)) {
    fail("row-0 correspondence envelope changed");
  }
  neutral.validatePayload(envelope.payload);
  return envelope.payload;
}

function buildRow0OutputEvidenceGapAssessment(raw) {
  const source = openEnvelope(raw);
  if (source.field.id !== FIELD_ID || source.source.pariVersion !== "2.17.4" ||
      source.source.pariSourceSha256 !== PARI_SOURCE_SHA256 ||
      source.classGroup.classNumber !== "1" ||
      source.classGroup.invariantFactors.length !== 0 ||
      source.unitGroup.rank !== "2" ||
      source.terminal.correspondence_complete !== true ||
      source.terminal.public_complete !== false) {
    fail("row-0 correspondence identity changed");
  }
  const storage = storageMap(source);
  const get = (name, length) => owner(storage, `replay-${name}`, length);
  const factorBase = get("packet_ideals", 66 * 9);
  const relations = get("relation_records", 73 * 66);
  const generators = get("generators", 73 * 3);
  const relationLogs = get("log_embeddings", 73 * 21);
  const terminal = {
    left: get("final_left", 64),
    leftInverse: get("final_left_inverse", 64),
    presentation: get("final_presentation", 64),
    presentationToRelation: get("final_presentation_to_relation", 120),
    relationToPresentation: get("final_relation_to_presentation", 120),
    right: get("final_right", 64),
    rightInverse: get("final_right_inverse", 64),
    smith: get("final_smith", 64),
  };
  const compactProvenance = get("final_compact_provenance", 14);
  const retainedRelations = get("final_retained_relation_map", 146);
  const packedLogs = get("precision_published_logs", 18);
  const exactCoordinates = owner(storage, "exact-unit-coordinates", 6);
  const exactNorms = owner(storage, "exact-unit-norms", 2);
  const torsion = owner(storage, "torsion-generator", 3);
  const regulatorHull = owner(storage, "regulator-enclosure", 4);
  const regulatorAuthority = decodeCanonicalBytes(owner(storage,
    "regulator-rigorous-authority"), "regulator authority");
  const honesty = decodeCanonicalBytes(owner(storage, "honesty-evidence"),
    "honesty evidence");

  const entries = [
    evidence("factor-base-ideals", "factor_base_ideals", [66, 9], factorBase,
      "decimal_integer_matrix"),
    evidence("honesty-provenance", "provenance", [], honesty),
    evidence("principal-generators", "principal_generators", [73, 3], generators,
      "decimal_integer_matrix"),
    evidence("regulator-authority", "regulator_acceptance", [], regulatorAuthority),
    evidence("regulator-enclosure", "regulator_enclosure", [2], [
      regulatorHull.slice(0, 2), regulatorHull.slice(2, 4),
    ], "decimal_real_interval"),
    evidence("relation-logs", "relation_logs", [73, 21], relationLogs),
    evidence("relation-matrix", "relation_matrix", [73, 66], relations,
      "decimal_integer_matrix"),
    evidence("terminal-left", "dependency", [8, 8], terminal.left,
      "decimal_integer_matrix"),
    evidence("terminal-left-inverse", "dependency", [8, 8], terminal.leftInverse,
      "decimal_integer_matrix"),
    evidence("terminal-presentation", "presentation_matrix", [8, 8],
      terminal.presentation, "decimal_integer_matrix"),
    evidence("terminal-presentation-to-relation", "dependency", [15, 8],
      terminal.presentationToRelation, "decimal_integer_matrix"),
    evidence("terminal-relation-to-presentation", "dependency", [15, 8],
      terminal.relationToPresentation, "decimal_integer_matrix"),
    evidence("terminal-right", "dependency", [8, 8], terminal.right,
      "decimal_integer_matrix"),
    evidence("terminal-right-inverse", "dependency", [8, 8], terminal.rightInverse,
      "decimal_integer_matrix"),
    evidence("terminal-smith", "presentation_diagonal", [8, 8], terminal.smith,
      "decimal_integer_matrix"),
    evidence("torsion-generator", "torsion_generator", [3], torsion,
      "decimal_integer_matrix"),
  ];
  for (let index = 0; index < 2; index += 1) {
    const suffix = String(index + 1);
    entries.push(
      evidence(`unit-${suffix}-coordinates`, "exact_unit_coordinates", [3],
        exactCoordinates.slice(3 * index, 3 * index + 3),
        "decimal_integer_matrix"),
      evidence(`unit-${suffix}-log`, "compact_unit_log", [3],
        packedLogs.slice(9 * index, 9 * index + 9)),
      evidence(`unit-${suffix}-norm`, "exact_unit_norm", [], exactNorms[index],
        "decimal_integer_matrix"),
      evidence(`unit-${suffix}-provenance`, "compact_unit_provenance", [],
        compactProvenance.slice(7 * index, 7 * index + 7)),
      evidence(`unit-${suffix}-relation-transform`,
        "compact_unit_relation_transform", [73],
        retainedRelations.slice(73 * index, 73 * index + 73),
        "decimal_integer_matrix"),
    );
  }
  entries.sort((left, right) => left.id.localeCompare(right.id));
  const assessment = {
    authenticatedEvidence: entries,
    candidate: { classNumber: "1", exactUnitCount: "2", invariantFactors: [],
      regulatorKind: "rigorous_enclosure", torsionOrder: "2", unitRank: "2" },
    completion: {
      correspondenceComplete: true,
      freshCorrespondence: true,
      missing: ["combine-lazy-materialization",
        "dimension-compatible-presentation-proof", "factor-lazy-materialization",
        "independent-unit-saturation-certificate", "proved-factor-base-bound",
        "public-api-integration", "reduce-lazy-materialization"],
      outputBoundaryComplete: false,
      phase3Complete: false,
      phase4Complete: false,
      phase5Complete: false,
    },
    field: { definingPolynomialAscending: [...source.field.definingPolynomialAscending],
      degree: "3", id: FIELD_ID },
    maps: {
      combine: { missing: ["combine-lazy-materialization"], ready: false },
      factor: { missing: ["factor-lazy-materialization"], ready: false },
      reduce: { missing: ["reduce-lazy-materialization"], ready: false },
    },
    presentationGap: {
      actualRelationMatrixShape: ["73", "66"],
      requiredIdentityShape: ["66", "66"],
      requiredRightInverseShape: ["66", "73"],
      retainedPresentationShape: ["8", "8"],
      retainedRelationMapShape: ["15", "8"],
      status: "dimension-compatible-proof-not-retained",
    },
    schema: ASSESSMENT_SCHEMA,
    source: { correspondenceResultSha256: CORRESPONDENCE_SHA256,
      pariSourceSha256: PARI_SOURCE_SHA256, pariVersion: "2.17.4" },
    v2Payload: null,
  };
  output.canonical(assessment);
  return Object.freeze({ assessment, sourcePayload: source });
}

module.exports = Object.freeze({ ASSESSMENT_SCHEMA, CORRESPONDENCE_SHA256,
  FIELD_ID, PARI_SOURCE_SHA256, Row0OutputEvidenceFailure,
  buildRow0OutputEvidenceGapAssessment });

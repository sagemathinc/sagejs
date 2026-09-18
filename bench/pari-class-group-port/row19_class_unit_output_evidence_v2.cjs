"use strict";

// Honest migration assessment for row 19. The fresh result retains the full
// raw relation surface, but the shared v2 contract cannot publish it until a
// proof for that same surface (or an explicit absent-presentation variant) is
// retained. The later 9-by-9 Smith presentation is recorded separately.

const crypto = require("node:crypto");
const neutral = require("./class_unit_correspondence_result.cjs");
const v2 = require("./class_unit_output_evidence_v2.cjs");

const ASSESSMENT_SCHEMA =
  "sagejs.pari-class-group/row19-output-evidence-v2-gap-assessment-v1";
const CORRESPONDENCE_SHA256 =
  "a9642e255d536cde1c13740b0452bbdedf917cc851b753c2ec6152df2622eb66";
const FIELD_ID = "3.1.1086061775432017340256300.107";
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";

class Row19OutputEvidenceFailure extends Error {}
function fail(message) { throw new Row19OutputEvidenceFailure(message); }
function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function digest(value) { return v2.sha256Canonical(value); }

function open(raw) {
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
function evidence(id, kind, value, shape, encoding) {
  return { encoding, id, kind, sha256: digest(value), shape: shape.map(String) };
}

function assessRow19OutputEvidence(raw) {
  const payload = open(raw);
  const map = owners(payload);
  const factorBase = decode(map, "factor-base");
  const relationMatrix = storage(map, "relation-records", 430 * 424);
  const principalGenerators = storage(map, "relation-generators", 430 * 3);
  const relationLogs = storage(map, "relation-logs", 430 * 14);
  const presentation = decode(map, "class-presentation");
  const principalTransform = storage(map, "principal-relation-transform", 430 * 430);
  const compactUnit = decode(map, "compact-fundamental-unit");
  const regulator = decode(map, "regulator-enclosure");
  const sourceBoundary = decode(map, "source-boundary-status");

  if (factorBase.size !== 424 || factorBase.idealHnfs.length !== 424 ||
      factorBase.idealHnfs.some(ideal => !Array.isArray(ideal) || ideal.length !== 9) ||
      presentation.terminalW.length !== 81 || presentation.matrices.U.length !== 81 ||
      presentation.matrices.Ui.length !== 81 || presentation.matrices.D.length !== 81 ||
      compactUnit.relationExponents.length !== 430 ||
      sourceBoundary.sourceBoundary.freshPreparedInput !== true ||
      sourceBoundary.sourceBoundary.privateSameRunOwners !== true ||
      sourceBoundary.sourceBoundary.usedW0RuntimeData !== false ||
      sourceBoundary.sourceBoundary.qualifiedTiming !== false)
    fail("row-19 retained source state changed");

  const rawRelations = [
    evidence("factor-base-ideals", "factor_base_ideals", factorBase.idealHnfs,
      [424, 9], "decimal_integer_matrix"),
    evidence("principal-generators", "principal_generators", principalGenerators,
      [430, 3], "decimal_integer_matrix"),
    evidence("relation-logs", "relation_logs", relationLogs,
      [430, 14], "opaque_canonical_bytes"),
    evidence("relation-matrix", "relation_matrix", relationMatrix,
      [430, 424], "decimal_integer_matrix"),
  ];
  const finalPresentation = [
    evidence("final-presentation-d", "presentation_diagonal",
      presentation.matrices.D, [9, 9], "decimal_integer_matrix"),
    evidence("final-presentation-u", "presentation_transform_left",
      presentation.matrices.U, [9, 9], "decimal_integer_matrix"),
    evidence("final-presentation-ui", "presentation_transform_right",
      presentation.matrices.Ui, [9, 9], "decimal_integer_matrix"),
    evidence("final-presentation-w", "presentation_transform_middle",
      presentation.terminalW, [9, 9], "decimal_integer_matrix"),
  ];
  return Object.freeze({
    schema: ASSESSMENT_SCHEMA,
    source: { correspondenceResultSha256: CORRESPONDENCE_SHA256,
      pariSourceSha256: PARI_SOURCE_SHA256, pariVersion: "2.17.4" },
    field: { definingPolynomialAscending: [...payload.field.definingPolynomialAscending],
      degree: "3", id: FIELD_ID },
    status: "not-publishable-under-v2",
    rawRelations: { factorBaseCount: "424", relationCount: "430", logColumns: "14",
      evidence: rawRelations },
    retainedFinalPresentation: { dimension: "9", evidence: finalPresentation,
      identity: "U W Ui = D", classNumber: "39366",
      invariantFactors: [...payload.classGroup.invariantFactors] },
    retainedAncestry: { principalRelationTransform: evidence(
      "raw-to-terminal-principal-transform", "provenance", principalTransform,
      [430, 430], "decimal_integer_matrix"),
      semanticRole: "raw-to-terminal-relation-transform-not-full-smith-left-transform" },
    retainedUnitMaterial: { compactUnitSha256: digest(compactUnit),
      regulatorAcceptanceSha256: digest(regulator), exactUnits: "not_given(LARGE)",
      regulatorKind: "pari_packed_accepted" },
    missing: {
      capability: ["presentation-not-given-variant"],
      owners: ["raw-smith-diagonal-430x424", "raw-smith-left-transform-430x430",
        "raw-smith-right-transform-424x424"],
      reason: "v2-requires-presentation-proof-shaped-like-raw-relation-surface",
    },
    completion: { correspondenceComplete: true, freshCorrespondence: true,
      outputBoundaryComplete: false, phase3Complete: false, phase4Complete: false,
      phase4MaterialRetained: true, phase5Complete: false },
    qualifiedTiming: false,
  });
}

function buildRow19OutputEvidence(raw) {
  const assessment = assessRow19OutputEvidence(raw);
  fail(`row-19 cannot satisfy ${v2.SCHEMA}: ${assessment.missing.reason}`);
}

module.exports = Object.freeze({ ASSESSMENT_SCHEMA, CORRESPONDENCE_SHA256, FIELD_ID,
  PARI_SOURCE_SHA256, Row19OutputEvidenceFailure, assessRow19OutputEvidence,
  buildRow19OutputEvidence });

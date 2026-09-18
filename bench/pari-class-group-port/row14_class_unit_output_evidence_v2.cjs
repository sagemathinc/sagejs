"use strict";

// Truthful v2 migration assessment for the fresh row-14 neutral result.
// Row 14 retains a dimension-compatible composite presentation proof
//
//       T(3x806) R(806x799) = P(3x3) F(3x799),
//
// but not the full 806x806 / 799x799 Smith transforms required by the shared
// output-evidence-v2 `smith_uwvd` variant.  Never replace that missing proof
// with the much smaller 3x3 terminal presentation.

const crypto = require("node:crypto");
const neutral = require("./class_unit_correspondence_result.cjs");
const v2 = require("./class_unit_output_evidence_v2.cjs");

const ASSESSMENT_SCHEMA =
  "sagejs.pari-class-group/row14-output-evidence-v2-gap-assessment-v1";
const CORRESPONDENCE_SHA256 =
  "edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2";
const FIELD_ID =
  "generated-sha256-e1d4643ab62bde9546d63340545e5302c2cef517222d569e634fb5e2093f6413";
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";

class Row14OutputEvidenceFailure extends Error {}
function fail(message) { throw new Row14OutputEvidenceFailure(message); }
function sha(raw) { return crypto.createHash("sha256").update(raw).digest("hex"); }
function evidence(id, kind, entries, shape, encoding = "decimal_integer_matrix") {
  return { encoding, id, kind, sha256: v2.sha256Canonical(entries),
    shape: shape.map(String) };
}

function open(raw) {
  if (!Buffer.isBuffer(raw) || sha(raw) !== CORRESPONDENCE_SHA256)
    fail("row-14 fresh correspondence bytes changed");
  let envelope;
  try { envelope = JSON.parse(raw.toString("ascii")); }
  catch (error) {
    throw new Row14OutputEvidenceFailure("row-14 correspondence is not JSON",
      { cause: error });
  }
  if (!neutral.canonical(envelope).equals(raw) ||
      envelope.schema !== neutral.ENVELOPE_SCHEMA ||
      envelope.payloadSha256 !== neutral.sha256Canonical(envelope.payload))
    fail("row-14 correspondence envelope changed");
  neutral.validatePayload(envelope.payload);
  const payload = envelope.payload;
  if (payload.field.id !== FIELD_ID || payload.field.degree !== "4" ||
      payload.source.pariVersion !== "2.17.4" ||
      payload.source.pariSourceSha256 !== PARI_SOURCE_SHA256 ||
      payload.classGroup.classNumber !== "192" ||
      JSON.stringify(payload.classGroup.invariantFactors) !== '["8","24"]' ||
      payload.terminal.correspondence_complete !== true ||
      payload.terminal.public_complete !== false)
    fail("row-14 correspondence identity changed");
  return payload;
}

function ownerMap(payload) {
  return new Map(payload.storage.map(owner => [owner.name, owner]));
}
function storage(map, name, length) {
  const owner = map.get(name);
  if (!owner || owner.logicalLength !== String(owner.entries.length) ||
      owner.entries.length !== length) fail(`row-14 storage owner ${name} changed`);
  return owner.entries;
}

function assessRow14OutputEvidence(raw) {
  const payload = open(raw);
  const owners = ownerMap(payload);
  const factorBase = storage(owners, "factor-base-ideals", 799 * 16);
  const relations = storage(owners, "raw-relation-records", 806 * 799);
  const generators = storage(owners, "principal-generators", 806 * 4);
  const logs = storage(owners, "raw-relation-logs", 806 * 21);
  const presentation = storage(owners, "class-presentation", 3 * 3);
  const rawToPresentation = storage(owners,
    "raw-to-presentation-transform", 3 * 806);
  const factorProjection = storage(owners, "factor-map", 3 * 799);
  const classIdeals = storage(owners, "class-generator-ideals", 2 * 16);
  const classWitnesses = storage(owners,
    "class-order-principal-coefficients", 2 * 806);
  const factoredUnits = storage(owners, "factored-unit-transform", 2 * 806);
  const compactUnits = storage(owners, "compact-unit-transform", 14);
  const regulator = storage(owners, "regulator-enclosure", 3);
  const torsion = storage(owners, "torsion-generator", 4);

  return Object.freeze({
    schema: ASSESSMENT_SCHEMA,
    source: { correspondenceResultSha256: CORRESPONDENCE_SHA256,
      pariSourceSha256: PARI_SOURCE_SHA256, pariVersion: "2.17.4" },
    field: { definingPolynomialAscending:
        [...payload.field.definingPolynomialAscending], degree: "4", id: FIELD_ID },
    status: "not-publishable-under-v2",
    rawRelations: {
      factorBaseCount: "799", relationCount: "806", logColumns: "21",
      evidence: [
        evidence("factor-base-ideals", "factor_base_ideals", factorBase, [799, 16]),
        evidence("principal-generators", "principal_generators", generators, [806, 4]),
        evidence("relation-logs", "relation_logs", logs, [806, 21],
          "opaque_canonical_bytes"),
        evidence("relation-matrix", "relation_matrix", relations, [806, 799]),
      ],
    },
    retainedCompositePresentation: {
      equation: "T R = P F",
      evidence: [
        evidence("factor-projection", "provenance", factorProjection, [3, 799]),
        evidence("raw-to-presentation", "presentation_transform_left",
          rawToPresentation, [3, 806]),
        evidence("terminal-presentation", "presentation_matrix", presentation,
          [3, 3]),
      ],
      classNumber: "192", invariantFactors: ["8", "24"],
      relationMatrixRef: "relation-matrix",
      note: "dimension-compatible retained composite proof; not a full raw Smith decomposition",
    },
    retainedClassWitnesses: {
      generatorIdeals: evidence("class-generator-ideals", "class_generator_ideal",
        classIdeals, [2, 4, 4]),
      orderCoefficients: evidence("class-order-witnesses",
        "principal_order_witness", classWitnesses, [2, 806]),
    },
    retainedUnitMaterial: {
      compactTransformSha256: v2.sha256Canonical(compactUnits),
      exactUnits: "not_given(LARGE)",
      factoredTransformSha256: v2.sha256Canonical(factoredUnits),
      rank: "2", regulatorSha256: v2.sha256Canonical(regulator),
      torsionGeneratorSha256: v2.sha256Canonical(torsion), torsionOrder: "2",
    },
    maps: {
      combine: { ready: false, missing: ["general-class-combine-map"] },
      factor: { ready: false, missing: ["general-arbitrary-ideal-factor-map"] },
      reduce: { ready: false, missing: ["general-arbitrary-ideal-reduce-map"] },
    },
    missing: {
      capability: ["composite-presentation-proof-variant"],
      owners: ["raw-smith-diagonal-806x799", "raw-smith-left-transform-806x806",
        "raw-smith-right-transform-799x799"],
      reason: "v2-requires-a-presentation-proof-shaped-like-the-raw-relation-surface",
    },
    completion: {
      correspondenceComplete: true, freshCorrespondence: true,
      outputBoundaryComplete: false, phase3Complete: false,
      phase4Complete: false, phase4MaterialRetained: true, phase5Complete: false,
    },
    qualifiedTiming: false,
  });
}

function buildRow14OutputEvidence(raw) {
  const assessment = assessRow14OutputEvidence(raw);
  fail(`row-14 cannot satisfy ${v2.SCHEMA}: ${assessment.missing.reason}`);
}

module.exports = Object.freeze({ ASSESSMENT_SCHEMA, CORRESPONDENCE_SHA256,
  FIELD_ID, PARI_SOURCE_SHA256, Row14OutputEvidenceFailure,
  assessRow14OutputEvidence, buildRow14OutputEvidence });

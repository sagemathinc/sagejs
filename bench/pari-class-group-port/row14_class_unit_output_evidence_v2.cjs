"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const neutral = require("./class_unit_correspondence_result.cjs");
const v2 = require("./class_unit_output_evidence_v2.cjs");

const ASSESSMENT_SCHEMA =
  "sagejs.pari-class-group/row14-output-evidence-v2-assessment-v2";
const CORRESPONDENCE_SHA256 =
  "edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2";
const FIELD_ID =
  "generated-sha256-e1d4643ab62bde9546d63340545e5302c2cef517222d569e634fb5e2093f6413";
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";

class Row14OutputEvidenceFailure extends Error {}
function fail(message) { throw new Row14OutputEvidenceFailure(message); }
function sha(raw) { return crypto.createHash("sha256").update(raw).digest("hex"); }
function digest(value) { return v2.sha256Canonical(value); }
function evidence(id, kind, value, shape, encoding = "canonical_json") {
  return { encoding, id, kind, sha256: digest(value), shape: shape.map(String) };
}

function authenticateRow14Correspondence(raw) {
  if (!Buffer.isBuffer(raw) || sha(raw) !== CORRESPONDENCE_SHA256)
    fail("row-14 fresh correspondence bytes changed");
  let envelope;
  try { envelope = JSON.parse(raw.toString("ascii")); }
  catch (error) { throw new Row14OutputEvidenceFailure(
    "row-14 correspondence is not JSON", { cause: error }); }
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
  const value = map.get(name);
  if (!value || value.logicalLength !== String(value.entries.length) ||
      value.entries.length !== length) fail(`row-14 storage owner ${name} changed`);
  return value.entries;
}
function chunks(values, count, width, name) {
  if (!Array.isArray(values) || values.length !== count * width)
    fail(`${name} changed shape`);
  return Array.from({ length: count }, (_, index) =>
    values.slice(index * width, (index + 1) * width));
}

function row14MapMaterials(proof, metadataOwner) {
  const metadata = metadataOwner?.metadata || metadataOwner;
  if (metadata?.schema !==
      "sagejs.pari-class-group/row14-connected-factor-metadata-v1" ||
      metadata.authority?.capsuleSha256 !==
      "33d2606a151ecf0ba5a73c247ecf3f219ff84a2341048ebbbe374ecd9c7939b1" ||
      metadata.authority?.preparedAuthoritySha256 !==
      "6c8ac1e7e6a47a486de92cd180f9524a1be132d8fe1f7ccbd822166e77d4da92")
    fail("row-14 factor metadata authority changed");
  const common = {
    correspondenceResultSha256: CORRESPONDENCE_SHA256,
    domain:
      "arbitrary-fractional-quartic-ideal-hnf-supported-on-retained-factor-base",
    implementation: "ordinary-cpython-parseable-source",
    implementationSha256: sha(fs.readFileSync(path.join(__dirname,
      "row14_general_ideal_maps.py"))),
    invariantFactors: ["8", "24"],
    preparedFactorMetadataSha256: digest(metadata.factor),
    rawSmithMaterialSha256: proof.materialSha256,
  };
  return Object.freeze({
    factor: Object.freeze({ ...common, operation: "factor",
      algorithm: "authenticated-prepared-valuations-and-complete-norm-support-check",
      rejectsOutsideSupport: true }),
    reduce: Object.freeze({ ...common, operation: "reduce",
      algorithm: "smith-coordinates-and-exact-principal-relation-witness" }),
    combine: Object.freeze({ ...common, operation: "combine",
      algorithm: "factor-tape-addition-followed-by-smith-reduction" }),
  });
}

// Kept for the raw-gap builder: it authenticates the immutable correspondence
// without pretending that sidecars were supplied.
function legacyAssessment(raw) {
  const payload = authenticateRow14Correspondence(raw);
  const map = ownerMap(payload);
  storage(map, "factor-base-ideals", 799 * 16);
  storage(map, "raw-relation-records", 806 * 799);
  storage(map, "principal-generators", 806 * 4);
  storage(map, "raw-relation-logs", 806 * 21);
  return Object.freeze({
    schema: "sagejs.pari-class-group/row14-output-evidence-v2-gap-assessment-v1",
    source: { correspondenceResultSha256: CORRESPONDENCE_SHA256,
      pariSourceSha256: PARI_SOURCE_SHA256, pariVersion: "2.17.4" },
    field: { definingPolynomialAscending:
        [...payload.field.definingPolynomialAscending], degree: "4", id: FIELD_ID },
    status: "full-smith-and-map-sidecars-required",
    completion: { correspondenceComplete: true, freshCorrespondence: true,
      outputBoundaryComplete: false, phase3Complete: false,
      phase4Complete: false, phase4MaterialRetained: true, phase5Complete: false },
    missing: { owners: ["full-raw-smith-ancestry", "general-supported-ideal-maps"],
      capability: [], reason: "sidecar-authorities-not-supplied" },
    qualifiedTiming: false,
  });
}

function collect(raw, ancestryInput, metadataOwner) {
  const payload = authenticateRow14Correspondence(raw);
  const map = ownerMap(payload);
  const proof = require("./row14_full_raw_smith_ancestry.cjs")
    .buildRow14FullRawSmithAncestry(raw, ancestryInput);
  if (proof.completed?.fullSmithIdentity !== true ||
      proof.source?.fullAncestrySha256 !==
      "737a3d8cdcc4780aeb18a067ce8b45b6fd0852283f1762678b60a657a24e1a72" ||
      proof.materialSha256?.d !==
      "0f59ce6bf71550e788c2ae8349ce415360e5c6cd04320fd5ba2cf79e6c684dba" ||
      proof.materialSha256?.u !==
      "819bcfe2bba45872fdcb529f8c1b7f55963012d9fb038c9fee9268ad180d7db8" ||
      proof.materialSha256?.v !==
      "92efd71d2a319bd88bfd4ab089d726ea074d2841df2b516ea5082426a8276613")
    fail("row-14 full raw Smith identity is absent");
  const maps = row14MapMaterials(proof, metadataOwner);
  const factorBase = storage(map, "factor-base-ideals", 799 * 16);
  const relation = storage(map, "raw-relation-records", 806 * 799);
  const generators = storage(map, "principal-generators", 806 * 4);
  const logs = storage(map, "raw-relation-logs", 806 * 21);
  const classIdeals = chunks(storage(map, "class-generator-ideals", 32),
    2, 16, "class ideals");
  const classWitnesses = chunks(storage(map,
    "class-order-principal-coefficients", 1612), 2, 806, "class witnesses");
  const unitTransforms = chunks(storage(map, "factored-unit-transform", 1612),
    2, 806, "unit transforms");
  const unitLogs = chunks(storage(map, "compact-archimedean-units", 42),
    2, 21, "unit logs");
  const unitNorms = storage(map, "unit-norms", 2);
  const compactTransform = storage(map, "compact-unit-transform", 14);
  const compactLattice = storage(map, "compact-unit-lattice", 14);
  const regulator = storage(map, "regulator-enclosure", 3);
  const honesty = storage(map, "honesty-evidence", 6);
  const torsion = storage(map, "torsion-generator", 4);
  const entries = [
    evidence("combine-map", "combine_map", maps.combine, []),
    evidence("factor-base-ideals", "factor_base_ideals", factorBase,
      [799, 16], "decimal_integer_matrix"),
    evidence("factor-map", "factor_map", maps.factor, []),
    evidence("principal-generators", "principal_generators", generators,
      [806, 4], "decimal_integer_matrix"),
    evidence("raw-relation-dependencies", "dependency",
      proof.material.u.slice(799 * 806), [7, 806], "decimal_integer_matrix"),
    evidence("raw-smith-d", "presentation_diagonal", proof.material.d,
      [806, 799], "decimal_integer_matrix"),
    evidence("raw-smith-provenance", "provenance", {
      identity: "U R V = D", materialSha256: proof.materialSha256,
      source: proof.source }, []),
    evidence("raw-smith-u", "presentation_transform_left", proof.material.u,
      [806, 806], "decimal_integer_matrix"),
    evidence("raw-smith-v", "presentation_transform_right", proof.material.v,
      [799, 799], "decimal_integer_matrix"),
    evidence("raw-smith-w", "presentation_transform_middle", relation,
      [806, 799], "decimal_integer_matrix"),
    evidence("reduce-map", "reduce_map", maps.reduce, []),
    evidence("relation-logs", "relation_logs", logs, [806, 21],
      "opaque_canonical_bytes"),
    evidence("relation-matrix", "relation_matrix", relation, [806, 799],
      "decimal_integer_matrix"),
    evidence("regulator-acceptance", "regulator_acceptance", {
      accepted: true, packedRegulatorSha256: digest(regulator) }, []),
    evidence("regulator-packed", "pari_packed_regulator", regulator, [3],
      "decimal_integer_matrix"),
    evidence("regulator-precision", "regulator_precision",
      { precisionBits: "192" }, []),
    evidence("regulator-retry", "regulator_retry", honesty, [6],
      "decimal_integer_matrix"),
    evidence("torsion-generator", "torsion_generator", torsion, [4],
      "decimal_integer_matrix"),
  ];
  classIdeals.forEach((ideal, index) => entries.push(
    evidence(`class-ideal-${index}`, "class_generator_ideal", ideal,
      [4, 4], "decimal_integer_matrix"),
    evidence(`class-witness-${index}`, "principal_order_witness",
      classWitnesses[index], [806], "decimal_integer_matrix")));
  unitTransforms.forEach((transform, index) => entries.push(
    evidence(`unit-log-${index}`, "compact_unit_log", unitLogs[index], [21],
      "decimal_integer_matrix"),
    evidence(`unit-provenance-${index}`, "compact_unit_provenance", {
      compactLatticeSha256: digest(compactLattice),
      compactTransformSha256: digest(compactTransform),
      exactNorm: unitNorms[index], representation: "factored-principal-relations",
    }, []),
    evidence(`unit-relation-transform-${index}`,
      "compact_unit_relation_transform", transform, [806],
      "decimal_integer_matrix")));
  entries.sort((left, right) => left.id.localeCompare(right.id));
  const output = {
    schema: v2.SCHEMA,
    field: { definingPolynomialAscending:
        [...payload.field.definingPolynomialAscending], degree: "4", id: FIELD_ID },
    source: { correspondenceResultSha256: CORRESPONDENCE_SHA256,
      pariSourceSha256: PARI_SOURCE_SHA256, pariVersion: "2.17.4" },
    evidence: entries,
    relations: { factorBaseCount: "799", factorBaseRef: "factor-base-ideals",
      logColumns: "21", logsRef: "relation-logs",
      principalGeneratorsRef: "principal-generators", relationCount: "806",
      relationMatrixRef: "relation-matrix" },
    presentation: { dependencyRefs: ["raw-relation-dependencies"],
      proof: { dRef: "raw-smith-d", uRef: "raw-smith-u",
        vRef: "raw-smith-v", wRef: "raw-smith-w" },
      provenanceRefs: ["raw-smith-provenance"], variant: "smith_uwvd" },
    classGroup: { classNumber: "192", invariantFactors: ["8", "24"],
      // The retained PARI owners are in source order [24, 8].  Normalize the
      // complete generator tuple, not merely the invariant-factor list.
      generators: [1, 0].map((sourceIndex, index) => ({ archimedeanRefs: [],
        idealRef: `class-ideal-${sourceIndex}`, order: ["8", "24"][index],
        principalWitnessRef: `class-witness-${sourceIndex}` })) },
    unitGroup: { compactUnits: [0, 1].map(index => ({
      logRef: `unit-log-${index}`, provenanceRef: `unit-provenance-${index}`,
      relationTransformRef: `unit-relation-transform-${index}` })),
      exactUnits: { precisionBits: "192", reason: "LARGE", status: "not_given" },
      rank: "2", regulator: { acceptanceRef: "regulator-acceptance",
        kind: "pari_packed_accepted", packedValueRef: "regulator-packed",
        precisionBits: "192", precisionRef: "regulator-precision",
        retryRef: "regulator-retry" },
      torsion: { generatorRef: "torsion-generator", order: "2" } },
    maps: {
      combine: { evidenceRefs: ["combine-map"], missing: [], ready: true },
      factor: { evidenceRefs: ["factor-map"], missing: [], ready: true },
      reduce: { evidenceRefs: ["reduce-map"], missing: [], ready: true },
    },
    completion: { correspondenceComplete: true, freshCorrespondence: true,
      missing: [], outputBoundaryComplete: true, phase3Complete: true,
      phase4Complete: true, phase5Complete: true },
  };
  v2.validate(output);
  return { output: Object.freeze(output), proof };
}

function buildRow14OutputEvidence(raw, ancestryInput, metadataOwner) {
  if (ancestryInput === undefined || metadataOwner === undefined)
    fail("row-14 full ancestry and prepared factor metadata are required");
  return collect(raw, ancestryInput, metadataOwner).output;
}
function assessRow14OutputEvidence(raw, ancestryInput, metadataOwner) {
  if (ancestryInput === undefined || metadataOwner === undefined)
    return legacyAssessment(raw);
  const { output, proof } = collect(raw, ancestryInput, metadataOwner);
  return Object.freeze({
    schema: ASSESSMENT_SCHEMA, source: output.source, field: output.field,
    status: "valid-v2-complete-output-boundary",
    rawSmithPresentation: { identity: "U R V = D",
      diagonalFactors: proof.diagonalFactors,
      materialSha256: proof.materialSha256, shapes: proof.shapes },
    missing: { owners: [], capability: [], maps: [], reason: "none" },
    completion: { ...output.completion, phase4MaterialRetained: true },
    outputEvidenceSha256: digest(output), qualifiedTiming: false,
  });
}

module.exports = Object.freeze({ ASSESSMENT_SCHEMA, CORRESPONDENCE_SHA256,
  FIELD_ID, PARI_SOURCE_SHA256, Row14OutputEvidenceFailure,
  authenticateRow14Correspondence, assessRow14OutputEvidence,
  buildRow14OutputEvidence, row14MapMaterials });

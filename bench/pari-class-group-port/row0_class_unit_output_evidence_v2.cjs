"use strict";

// Row 0's additive output-evidence-v2 projection.  The full 73-by-66 Smith
// proof is reconstructed from same-run retained HNF ancestry.  Phase 3 is
// complete.  Phase 4 additionally binds a detached, independently replayed
// analytic unit-index certificate.  Source-transparent native arithmetic and
// the full Smith identity supply factor/reduce/combine maps on arbitrary
// fractional ideals supported by the retained factor base.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const neutral = require("./class_unit_correspondence_result.cjs");
const v2 = require("./class_unit_output_evidence_v2.cjs");
const rawSmith = require("./row0_raw_relation_smith_proof.cjs");

const ASSESSMENT_SCHEMA =
  "sagejs.pari-class-group/row0-output-evidence-v2-assessment-v2";
const CORRESPONDENCE_SHA256 =
  "dbf645dd5bdf4eb2f27dbaa769d1c08d454c551318a32611b47a1a232754da58";
const FIELD_ID = "pari-2.17.4:x^3-20018*x+20034";
const PARI_SOURCE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const SATURATION_SCHEMA =
  "sagejs.pari-class-group/row0-unit-saturation-evidence-v1";

class Row0OutputEvidenceFailure extends Error {}
function fail(message) { throw new Row0OutputEvidenceFailure(message); }
function sha256(raw) { return crypto.createHash("sha256").update(raw).digest("hex"); }
function storageMap(payload) {
  return new Map(payload.storage.map(value => [value.name, value]));
}
function owner(storage, name, length = undefined) {
  const value = storage.get(name);
  if (!value || value.logicalLength !== String(value.entries.length) ||
      (length !== undefined && value.entries.length !== length))
    fail(`row-0 owner ${name} changed`);
  return value.entries;
}
function decodeCanonicalBytes(entries, name) {
  const raw = Buffer.from(entries.map((entry, index) => {
    const byte = Number(entry);
    if (!Number.isInteger(byte) || byte < 0 || byte > 255)
      fail(`${name}[${index}] is not a byte`);
    return byte;
  }));
  let value;
  try { value = JSON.parse(raw.toString("ascii")); }
  catch (error) {
    throw new Row0OutputEvidenceFailure(`${name} is not JSON`, { cause: error });
  }
  if (!v2.canonical(value).equals(raw)) fail(`${name} is not canonical JSON`);
  return value;
}
function evidence(id, kind, shape, material, encoding = "canonical_json") {
  return { encoding, id, kind, sha256: v2.sha256Canonical(material),
    shape: shape.map(String) };
}

function row0MapMaterials(proof) {
  const implementationSha256 = sha256(fs.readFileSync(path.join(__dirname,
    "row0_general_ideal_maps.py")));
  const nativeDependencySha256 = Object.freeze({
    idealProduct: sha256(fs.readFileSync(path.join(__dirname,
      "signed_prime_ideal_reduction.py"))),
    multiplicationTensor: sha256(fs.readFileSync(path.join(__dirname,
      "real_cubic_getfu_honesty.py"))),
  });
  const common = {
    correspondenceResultSha256: CORRESPONDENCE_SHA256,
    domain: "arbitrary-fractional-cubic-ideal-hnf-supported-on-retained-factor-base-with-word-hnf-modulus",
    implementation:
      "ordinary-cpython-parseable-source-with-source-transparent-native-arithmetic",
    implementationSha256,
    nativeDependencySha256,
    rawSmithMaterialSha256: proof.materialSha256,
  };
  return Object.freeze({
    factor: Object.freeze({ ...common, operation: "factor",
      algorithm:
        "exact-successive-prime-power-containment-with-complete-norm-and-hnf-reconstruction",
      retainedOwners: ["replay-final_polynomial", "replay-packet_ideals",
        "replay-packet_norms", "replay-prep_zk"],
      rejectsOutsideSupport: true }),
    reduce: Object.freeze({ ...common, operation: "reduce",
      algorithm:
        "full-smith-inverse-and-exact-signed-principal-relation-witness",
      retainedOwners: ["replay-generators", "replay-relation_records"] }),
    combine: Object.freeze({ ...common, operation: "combine",
      algorithm: "signed-factor-tape-addition-followed-by-smith-reduction",
      retainedOwners: ["replay-generators", "replay-relation_records"] }),
  });
}

function authenticateSaturation(value, proof) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("row-0 saturation evidence is absent");
  const material = structuredClone(value);
  const digest = material.content_sha256;
  delete material.content_sha256;
  if (value.schema !== SATURATION_SCHEMA ||
      digest !== v2.sha256Canonical(material) ||
      value.source?.correspondence_sha256 !== CORRESPONDENCE_SHA256 ||
      value.source?.field_id !== FIELD_ID)
    fail("row-0 saturation evidence identity changed");
  const premise = value.premise;
  if (premise?.correspondence_sha256 !== CORRESPONDENCE_SHA256 ||
      premise?.field_id !== FIELD_ID || premise?.class_number !== "1" ||
      premise?.factor_base_generation_proved !== false ||
      JSON.stringify(premise?.raw_smith_material_sha256) !==
        JSON.stringify(proof.materialSha256))
    fail("row-0 saturation premise changed");
  const retainedCertificate = value.certificate;
  if (!retainedCertificate || typeof retainedCertificate.canonical_json !== "string" ||
      retainedCertificate.canonical_json_sha256 !==
        sha256(Buffer.from(retainedCertificate.canonical_json, "ascii")))
    fail("row-0 retained saturation certificate changed");
  let certificate;
  try { certificate = JSON.parse(retainedCertificate.canonical_json); }
  catch (error) {
    throw new Row0OutputEvidenceFailure("row-0 saturation certificate is not JSON", {
      cause: error,
    });
  }
  const certificateBody = structuredClone(certificate);
  const certificateDigest = certificateBody?.content_sha256;
  if (certificateBody) delete certificateBody.content_sha256;
  const hr = certificate?.analytic_proof?.hr_index;
  if (retainedCertificate.content_sha256 !== certificate?.content_sha256 ||
      certificateDigest !== v2.sha256Canonical(certificateBody) ||
      certificate.schema !==
        "sagejs.pari-class-group/row0-conditional-analytic-unit-index-certificate-v1" ||
      JSON.stringify(certificate.premise) !== JSON.stringify(premise) ||
      certificate.configuration?.class_number !== "1" ||
      hr?.lower_index !== 1 || hr?.upper_index !== 1 || hr?.unique_index !== 1 ||
      hr?.rigorous !== true || certificate.analytic_proof?.regulator?.rigorous !== true ||
      certificate.analytic_proof?.zeta_log_residue?.rigorous !== true)
    fail("row-0 analytic saturation certificate changed");
  const conclusion = value.conclusion;
  if (!conclusion || Object.keys(conclusion).sort().join(",") !== [
    "class_number_premise", "factor_base_generation_proved", "lower_index",
    "public_class_unit_complete", "rigorous", "unique_index", "unit_index_one",
    "upper_index",
  ].sort().join(",") || conclusion.class_number_premise !== "1" ||
      conclusion.lower_index !== "1" || conclusion.upper_index !== "1" ||
      conclusion.unique_index !== "1" || conclusion.unit_index_one !== true ||
      conclusion.rigorous !== true ||
      conclusion.factor_base_generation_proved !== false ||
      conclusion.public_class_unit_complete !== false)
    fail("row-0 saturation conclusion changed");
  return value;
}

function authenticateRow0Correspondence(raw) {
  if (!Buffer.isBuffer(raw) || sha256(raw) !== CORRESPONDENCE_SHA256)
    fail("row-0 correspondence bytes lack their reviewed identity");
  let envelope;
  try { envelope = JSON.parse(raw.toString("ascii")); }
  catch (error) {
    throw new Row0OutputEvidenceFailure("row-0 correspondence is not JSON", {
      cause: error,
    });
  }
  if (!neutral.canonical(envelope).equals(raw) ||
      envelope.schema !== neutral.ENVELOPE_SCHEMA ||
      envelope.payloadSha256 !== neutral.sha256Canonical(envelope.payload))
    fail("row-0 correspondence envelope changed");
  neutral.validatePayload(envelope.payload);
  const payload = envelope.payload;
  if (payload.field.id !== FIELD_ID || payload.source.pariVersion !== "2.17.4" ||
      payload.source.pariSourceSha256 !== PARI_SOURCE_SHA256 ||
      payload.classGroup.classNumber !== "1" ||
      payload.classGroup.invariantFactors.length !== 0 ||
      payload.unitGroup.rank !== "2" ||
      payload.terminal.correspondence_complete !== true ||
      payload.terminal.public_complete !== false)
    fail("row-0 correspondence identity changed");
  return payload;
}

function collect(raw, saturationEvidence) {
  const payload = authenticateRow0Correspondence(raw);
  const storage = storageMap(payload);
  const replay = (name, length) => owner(storage, `replay-${name}`, length);
  const factorBase = replay("packet_ideals", 66 * 9);
  const relations = replay("relation_records", 73 * 66);
  const generators = replay("generators", 73 * 3);
  const relationLogs = replay("log_embeddings", 73 * 21);
  const proof = rawSmith.buildRow0RawRelationSmithProof(Object.freeze({
    relation_records: relations,
    hnf_transform: replay("hnf_transform", 73 * 73),
    hnf_matbnew: replay("hnf_matbnew", 8 * 15),
    hnf_hnf_transform: replay("hnf_hnf_transform", 15 * 15),
    hnf_full_h: replay("hnf_full_h", 8 * 15),
  }));
  const mapMaterials = row0MapMaterials(proof);
  const saturation = authenticateSaturation(saturationEvidence, proof);
  const dependencies = proof.material.u.slice(66 * 73);
  const compactProvenance = replay("final_compact_provenance", 14);
  const retainedRelations = replay("final_retained_relation_map", 146);
  const packedLogs = replay("precision_published_logs", 18);
  const precisionState = replay("precision_authority_state", 16);
  const retryState = replay("precision_retry_state", 6);
  const exactCoordinates = owner(storage, "exact-unit-coordinates", 6);
  const exactNorms = owner(storage, "exact-unit-norms", 2);
  const torsion = owner(storage, "torsion-generator", 3);
  const regulatorHull = owner(storage, "regulator-enclosure", 4);
  const regulatorAuthority = decodeCanonicalBytes(owner(storage,
    "regulator-rigorous-authority"), "regulator authority");
  const honesty = decodeCanonicalBytes(owner(storage, "honesty-evidence"),
    "honesty evidence");

  const entries = [
    evidence("combine-map", "combine_map", [], mapMaterials.combine),
    evidence("factor-base-ideals", "factor_base_ideals", [66, 9], factorBase,
      "decimal_integer_matrix"),
    evidence("factor-map", "factor_map", [], mapMaterials.factor),
    evidence("honesty-provenance", "provenance", [], honesty),
    evidence("principal-generators", "principal_generators", [73, 3], generators,
      "decimal_integer_matrix"),
    evidence("raw-relation-dependencies", "dependency", [7, 73], dependencies,
      "decimal_integer_matrix"),
    evidence("raw-smith-d", "presentation_diagonal", [73, 66], proof.material.d,
      "decimal_integer_matrix"),
    evidence("raw-smith-provenance", "provenance", [], {
      ancestry: proof.ancestry, identity: proof.identity,
      materialSha256: proof.materialSha256, source: proof.source,
    }),
    evidence("raw-smith-u", "presentation_transform_left", [73, 73],
      proof.material.u, "decimal_integer_matrix"),
    evidence("raw-smith-v", "presentation_transform_right", [66, 66],
      proof.material.v, "decimal_integer_matrix"),
    evidence("raw-smith-w", "presentation_transform_middle", [73, 66], relations,
      "decimal_integer_matrix"),
    evidence("reduce-map", "reduce_map", [], mapMaterials.reduce),
    evidence("regulator-acceptance", "regulator_acceptance", [],
      regulatorAuthority),
    evidence("regulator-enclosure", "regulator_enclosure", [2], [
      regulatorHull.slice(0, 2), regulatorHull.slice(2, 4),
    ], "decimal_real_interval"),
    evidence("regulator-precision", "regulator_precision", [], {
      authoritySha256: regulatorAuthority.authority_sha256,
      precisionBits: precisionState[2], state: precisionState,
    }),
    evidence("regulator-retry", "regulator_retry", [], retryState,
      "decimal_integer_matrix"),
    evidence("relation-logs", "relation_logs", [73, 21], relationLogs),
    evidence("relation-matrix", "relation_matrix", [73, 66], relations,
      "decimal_integer_matrix"),
    evidence("torsion-generator", "torsion_generator", [3], torsion,
      "decimal_integer_matrix"),
    evidence("unit-saturation-index-one", "provenance", [], saturation),
  ];
  for (let index = 0; index < 2; index += 1) {
    entries.push(
      evidence(`unit-${index}-coordinates`, "exact_unit_coordinates", [3],
        exactCoordinates.slice(3 * index, 3 * index + 3),
        "decimal_integer_matrix"),
      evidence(`unit-${index}-log`, "compact_unit_log", [9],
        packedLogs.slice(9 * index, 9 * index + 9)),
      evidence(`unit-${index}-norm`, "exact_unit_norm", [], exactNorms[index],
        "decimal_integer_matrix"),
      evidence(`unit-${index}-provenance`, "compact_unit_provenance", [7],
        compactProvenance.slice(7 * index, 7 * index + 7),
        "decimal_integer_matrix"),
      evidence(`unit-${index}-relation-transform`,
        "compact_unit_relation_transform", [73],
        retainedRelations.slice(73 * index, 73 * index + 73),
        "decimal_integer_matrix"),
    );
  }
  entries.sort((left, right) => left.id.localeCompare(right.id));

  const missing = ["proved-factor-base-bound", "public-api-integration"];
  const output = {
    schema: v2.SCHEMA,
    field: { definingPolynomialAscending:
        [...payload.field.definingPolynomialAscending], degree: "3", id: FIELD_ID },
    source: { correspondenceResultSha256: CORRESPONDENCE_SHA256,
      pariSourceSha256: PARI_SOURCE_SHA256, pariVersion: "2.17.4" },
    evidence: entries,
    relations: { factorBaseCount: "66", factorBaseRef: "factor-base-ideals",
      logColumns: "21", logsRef: "relation-logs",
      principalGeneratorsRef: "principal-generators", relationCount: "73",
      relationMatrixRef: "relation-matrix" },
    presentation: { dependencyRefs: ["raw-relation-dependencies"],
      proof: { dRef: "raw-smith-d", uRef: "raw-smith-u",
        vRef: "raw-smith-v", wRef: "raw-smith-w" },
      provenanceRefs: ["honesty-provenance", "raw-smith-provenance"],
      variant: "smith_uwvd" },
    classGroup: { classNumber: "1", generators: [], invariantFactors: [] },
    unitGroup: {
      compactUnits: Array.from({ length: 2 }, (_, index) => ({
        logRef: `unit-${index}-log`, provenanceRef: `unit-${index}-provenance`,
        relationTransformRef: `unit-${index}-relation-transform`,
      })),
      exactUnits: { status: "present",
        units: Array.from({ length: 2 }, (_, index) => ({
          coordinatesRef: `unit-${index}-coordinates`,
          normRef: `unit-${index}-norm`,
        })) },
      rank: "2",
      regulator: { acceptanceRef: "regulator-acceptance",
        enclosureRef: "regulator-enclosure", kind: "rigorous_enclosure",
        precisionBits: precisionState[2], precisionRef: "regulator-precision" },
      torsion: { generatorRef: "torsion-generator", order: "2" },
    },
    maps: {
      combine: { evidenceRefs: ["combine-map"], missing: [], ready: true },
      factor: { evidenceRefs: ["factor-map"], missing: [], ready: true },
      reduce: { evidenceRefs: ["reduce-map"], missing: [], ready: true },
    },
    completion: { correspondenceComplete: true, freshCorrespondence: true,
      missing, outputBoundaryComplete: false, phase3Complete: true,
      phase4Complete: true, phase5Complete: true },
  };
  v2.validate(output);
  return { output: Object.freeze(output), payload, proof };
}

function buildRow0OutputEvidence(raw, saturationEvidence) {
  return collect(raw, saturationEvidence).output;
}
function assessRow0OutputEvidence(raw, saturationEvidence) {
  const { output, proof } = collect(raw, saturationEvidence);
  return Object.freeze({
    schema: ASSESSMENT_SCHEMA,
    source: output.source,
    field: output.field,
    status: "valid-v2-incomplete-output-boundary",
    rawSmithPresentation: { diagonalFactors: proof.diagonalFactors,
      identity: proof.identity, materialSha256: proof.materialSha256,
      dimensions: proof.dimensions },
    completion: { ...output.completion, phase4MaterialRetained: true },
    missing: {
      capability: ["proved-factor-base-bound"],
      maps: [],
      public: ["public-api-integration"],
      reason:
        "phases-3-through-5-complete-on-retained-factor-base; global-factor-bound-and-public-integration-remain",
    },
    outputEvidenceSha256: v2.sha256Canonical(output),
    qualifiedTiming: false,
  });
}

module.exports = Object.freeze({ ASSESSMENT_SCHEMA, CORRESPONDENCE_SHA256,
  FIELD_ID, PARI_SOURCE_SHA256, Row0OutputEvidenceFailure,
  assessRow0OutputEvidence, authenticateRow0Correspondence,
  buildRow0OutputEvidence, row0MapMaterials });

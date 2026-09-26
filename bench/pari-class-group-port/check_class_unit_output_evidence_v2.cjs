"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const output = require("./class_unit_output_evidence_v2.cjs");

function hash(label) {
  return crypto.createHash("sha256").update(label).digest("hex");
}

function evidence(id, kind, shape, encoding = "canonical_json") {
  return { encoding, id, kind, sha256: hash(id), shape };
}

function fixture({
  exactStatus = "present",
  outputBoundaryComplete = true,
  presentationVariant = "smith_uwvd",
  regulatorKind = "rigorous_enclosure",
} = {}) {
  const entries = [
    evidence("acceptance", "regulator_acceptance", []),
    evidence("arch-map", "archimedean_principal_map", ["1"]),
    evidence("class-ideal", "class_generator_ideal", ["3", "3"], "decimal_integer_matrix"),
    evidence("combine-map", "combine_map", ["1"]),
    evidence("compact-log", "compact_unit_log", ["2"]),
    evidence("compact-provenance", "compact_unit_provenance", []),
    evidence("compact-transform", "compact_unit_relation_transform", ["3"]),
    evidence("dependency", "dependency", []),
    evidence("diagonal", "presentation_diagonal", ["3", "2"], "decimal_integer_matrix"),
    evidence("exact-coordinates", "exact_unit_coordinates", ["3"], "decimal_integer_matrix"),
    evidence("exact-norm", "exact_unit_norm", [], "decimal_integer_matrix"),
    evidence("factor-base", "factor_base_ideals", ["2", "9"], "decimal_integer_matrix"),
    evidence("factor-map", "factor_map", ["2"]),
    evidence("identity", "presentation_identity", ["2", "2"], "decimal_integer_matrix"),
    evidence("packed-regulator", "pari_packed_regulator", ["2"]),
    evidence("precision", "regulator_precision", []),
    evidence("presentation-matrix", "presentation_matrix", ["3", "2"], "decimal_integer_matrix"),
    evidence("principal-generators", "principal_generators", ["3", "3"], "decimal_integer_matrix"),
    evidence("principal-witness", "principal_order_witness", ["3"]),
    evidence("provenance", "provenance", []),
    evidence("reduce-map", "reduce_map", ["2"]),
    evidence("regulator-enclosure", "regulator_enclosure", ["2"], "decimal_real_interval"),
    evidence("relations", "relation_matrix", ["3", "2"], "decimal_integer_matrix"),
    evidence("relation-logs", "relation_logs", ["3", "2"]),
    evidence("retry", "regulator_retry", []),
    evidence("right-inverse", "presentation_right_inverse", ["2", "3"], "decimal_integer_matrix"),
    evidence("torsion", "torsion_generator", ["3"], "decimal_integer_matrix"),
    evidence("transform-left", "presentation_transform_left", ["3", "3"], "decimal_integer_matrix"),
    evidence("transform-middle", "presentation_transform_middle", ["3", "2"], "decimal_integer_matrix"),
    evidence("transform-right", "presentation_transform_right", ["2", "2"], "decimal_integer_matrix"),
  ].sort((left, right) => left.id.localeCompare(right.id));
  let proof;
  if (presentationVariant === "smith_uwvd") {
    proof = {
      dRef: "diagonal",
      uRef: "transform-left",
      vRef: "transform-right",
      wRef: "transform-middle",
    };
  } else if (presentationVariant === "right_inverse") {
    proof = {
      identityRef: "identity",
      matrixRef: "presentation-matrix",
      rightInverseRef: "right-inverse",
    };
  } else {
    proof = { identityRef: "identity" };
  }
  const exactUnits = exactStatus === "present"
    ? {
        status: "present",
        units: [{ coordinatesRef: "exact-coordinates", normRef: "exact-norm" }],
      }
    : { precisionBits: "192", reason: "PRECI", status: "not_given" };
  const regulator = regulatorKind === "rigorous_enclosure"
    ? {
        acceptanceRef: "acceptance",
        enclosureRef: "regulator-enclosure",
        kind: "rigorous_enclosure",
        precisionBits: "192",
        precisionRef: "precision",
      }
    : {
        acceptanceRef: "acceptance",
        kind: "pari_packed_accepted",
        packedValueRef: "packed-regulator",
        precisionBits: "192",
        precisionRef: "precision",
        retryRef: "retry",
      };
  const readyMap = (id) => ({ evidenceRefs: [id], missing: [], ready: true });
  return {
    classGroup: {
      classNumber: "3",
      generators: [{
        archimedeanRefs: ["arch-map"],
        idealRef: "class-ideal",
        order: "3",
        principalWitnessRef: "principal-witness",
      }],
      invariantFactors: ["3"],
    },
    completion: outputBoundaryComplete
      ? {
          correspondenceComplete: true,
          freshCorrespondence: true,
          missing: [],
          outputBoundaryComplete: true,
          phase3Complete: true,
          phase4Complete: true,
          phase5Complete: true,
        }
      : {
          correspondenceComplete: true,
          freshCorrespondence: true,
          missing: ["combine-map-material", "phase5-output-assembly"],
          outputBoundaryComplete: false,
          phase3Complete: true,
          phase4Complete: true,
          phase5Complete: false,
        },
    evidence: entries,
    field: {
      definingPolynomialAscending: ["1", "-1", "0", "1"],
      degree: "3",
      id: "synthetic-real-cubic",
    },
    maps: {
      combine: outputBoundaryComplete
        ? readyMap("combine-map")
        : { evidenceRefs: [], missing: ["combine-map-material"], ready: false },
      factor: readyMap("factor-map"),
      reduce: readyMap("reduce-map"),
    },
    presentation: {
      dependencyRefs: ["dependency"],
      proof,
      provenanceRefs: ["provenance"],
      variant: presentationVariant,
    },
    relations: {
      factorBaseCount: "2",
      factorBaseRef: "factor-base",
      logColumns: "2",
      logsRef: "relation-logs",
      principalGeneratorsRef: "principal-generators",
      relationCount: "3",
      relationMatrixRef: "relations",
    },
    schema: output.SCHEMA,
    source: {
      correspondenceResultSha256: hash("correspondence"),
      pariSourceSha256: hash("pari-source"),
      pariVersion: "2.17.4",
    },
    unitGroup: {
      compactUnits: [{
        logRef: "compact-log",
        provenanceRef: "compact-provenance",
        relationTransformRef: "compact-transform",
      }],
      exactUnits,
      rank: "1",
      regulator,
      torsion: { generatorRef: "torsion", order: "2" },
    },
  };
}

function clone(value) {
  return structuredClone(value);
}

function expectRejected(name, base, mutate, pattern) {
  const candidate = clone(base);
  mutate(candidate);
  assert.throws(() => output.validate(candidate), pattern, name);
}

const complete = fixture();
const assumedRegulatorPartial = fixture({
  exactStatus: "not_given",
  outputBoundaryComplete: false,
  presentationVariant: "right_inverse",
  regulatorKind: "pari_packed_accepted",
});
const trivialPresentation = fixture({ presentationVariant: "trivial_identity" });

assert.equal(output.validate(complete), complete);
assert.equal(output.validate(assumedRegulatorPartial), assumedRegulatorPartial);
assert.equal(output.validate(trivialPresentation), trivialPresentation);
assert.equal(assumedRegulatorPartial.completion.correspondenceComplete, true);
assert.equal(assumedRegulatorPartial.completion.outputBoundaryComplete, false);

const canonical = output.canonical(complete);
assert.equal(output.parseCanonical(canonical).schema, output.SCHEMA);
assert.equal(output.sha256Canonical(complete), hash(canonical));
assert.throws(
  () => output.parseCanonical(Buffer.from(`${canonical.toString("ascii")}\n`, "ascii")),
  /not canonical JSON/,
);
const reordered = Buffer.from(JSON.stringify({ schema: complete.schema, ...complete }), "ascii");
assert.throws(() => output.parseCanonical(reordered), /not canonical JSON/);

expectRejected("unknown top-level field", complete, value => { value.surprise = true; }, /fields must be exactly/);
expectRejected("duplicate evidence id", complete, value => {
  value.evidence.splice(1, 0, clone(value.evidence[0]));
}, /uniquely sorted/);
expectRejected("relation shape", complete, value => {
  value.evidence.find(entry => entry.id === "relations").shape = ["2", "3"];
}, /wrong evidence shape/);
expectRejected("relation type", complete, value => {
  value.evidence.find(entry => entry.id === "relation-logs").kind = "relation_matrix";
}, /evidence kind/);
expectRejected("missing evidence", complete, value => {
  value.relations.factorBaseRef = "absent-factor-base";
}, /references absent evidence/);
expectRejected("Smith proof keys", complete, value => { delete value.presentation.proof.wRef; }, /fields must be exactly/);
expectRejected("unsupported presentation", complete, value => { value.presentation.variant = "snf-ish"; }, /unsupported/);
expectRejected("generator order", complete, value => { value.classGroup.generators[0].order = "9"; }, /order changed/);
expectRejected("principal witness type", complete, value => {
  value.evidence.find(entry => entry.id === "principal-witness").kind = "provenance";
}, /evidence kind/);
expectRejected("class number", complete, value => { value.classGroup.classNumber = "9"; }, /invariant product/);
expectRejected("compact units", complete, value => { value.unitGroup.compactUnits = []; }, /count differs/);
expectRejected("exact unit shape", complete, value => {
  value.evidence.find(entry => entry.id === "exact-coordinates").shape = ["4"];
}, /wrong evidence shape/);
expectRejected("regulator evidence type", complete, value => {
  value.evidence.find(entry => entry.id === "acceptance").kind = "provenance";
}, /evidence kind/);
expectRejected("packed regulator retry", assumedRegulatorPartial, value => {
  value.unitGroup.regulator.retryRef = "precision";
}, /evidence kind/);
expectRejected("ready map empty", complete, value => { value.maps.factor.evidenceRefs = []; }, /must not be empty/);
expectRejected("unready map evidence", assumedRegulatorPartial, value => {
  value.maps.combine.evidenceRefs = ["combine-map"];
}, /unready but publishes evidence/);
expectRejected("complete map omission", complete, value => {
  value.maps.factor.missing = ["factor-map-material"];
}, /ready but declares omissions/);
expectRejected("complete boundary missing", complete, value => {
  value.completion.missing = ["something-missing"];
}, /must be empty/);
expectRejected("incomplete boundary no missing", assumedRegulatorPartial, value => {
  value.completion.missing = [];
}, /must not be empty/);
expectRejected("nonfresh correspondence", complete, value => {
  value.completion.freshCorrespondence = false;
}, /not fresh/);
expectRejected("phase dependency", complete, value => {
  value.completion.phase3Complete = false;
  value.completion.outputBoundaryComplete = false;
  value.completion.missing = ["phase3"];
}, /phase 5 completion lacks earlier phases/);
expectRejected("completion requires maps", complete, value => {
  value.maps.combine = { evidenceRefs: [], missing: ["combine-map-material"], ready: false };
}, /lacks map material/);
expectRejected("unsorted missing list", assumedRegulatorPartial, value => {
  value.completion.missing = ["z-last", "a-first"];
}, /uniquely sorted/);

console.log(JSON.stringify({
  adversarialMutationsRejected: 22,
  canonicalSha256: output.sha256Canonical(complete),
  correspondenceWithoutOutputBoundaryAccepted:
    assumedRegulatorPartial.completion.correspondenceComplete &&
    !assumedRegulatorPartial.completion.outputBoundaryComplete,
  presentationVariantsAccepted: ["right_inverse", "smith_uwvd", "trivial_identity"],
  regulatorKindsAccepted: ["pari_packed_accepted", "rigorous_enclosure"],
  schema: output.SCHEMA,
}, null, 2));

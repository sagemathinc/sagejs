"use strict";

// Additive, field-neutral evidence contract for the output boundary of the
// PARI class-group correspondence port.  This intentionally does not replace
// class_unit_correspondence_result.cjs: v1 says that a mathematical
// correspondence was freshly obtained, while this sidecar records which
// output-producing phases and replay materials are actually complete.

const crypto = require("node:crypto");

const SCHEMA = "sagejs.pari-class-group/class-unit-output-evidence-v2";
const SHA256 = /^[0-9a-f]{64}$/;
const IDENTIFIER = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const INTEGER = /^(0|-?[1-9][0-9]*)$/;
const NONNEGATIVE = /^(0|[1-9][0-9]*)$/;
const POSITIVE = /^[1-9][0-9]*$/;
const MAX_BYTES = 64 * 1024 * 1024;

const EVIDENCE_KINDS = new Set([
  "archimedean_principal_map",
  "class_generator_ideal",
  "combine_map",
  "compact_unit_log",
  "compact_unit_provenance",
  "compact_unit_relation_transform",
  "dependency",
  "exact_unit_coordinates",
  "exact_unit_norm",
  "factor_base_ideals",
  "factor_map",
  "pari_packed_regulator",
  "presentation_diagonal",
  "presentation_identity",
  "presentation_matrix",
  "presentation_right_inverse",
  "presentation_transform_left",
  "presentation_transform_middle",
  "presentation_transform_right",
  "principal_generators",
  "principal_order_witness",
  "provenance",
  "reduce_map",
  "regulator_acceptance",
  "regulator_enclosure",
  "regulator_precision",
  "regulator_retry",
  "relation_logs",
  "relation_matrix",
  "torsion_generator",
]);

const ENCODINGS = new Set([
  "canonical_json",
  "decimal_integer_matrix",
  "decimal_real_interval",
  "opaque_canonical_bytes",
]);

class OutputEvidenceFailure extends Error {}

function fail(message) {
  throw new OutputEvidenceFailure(message);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function record(value, name) {
  if (!isPlainObject(value)) fail(`${name} must be a plain object`);
  return value;
}

function exactKeys(value, expected, name) {
  record(value, name);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length ||
      actual.some((entry, index) => entry !== wanted[index])) {
    fail(`${name} fields must be exactly ${wanted.join(", ")}`);
  }
}

function array(value, name) {
  if (!Array.isArray(value)) fail(`${name} must be an array`);
  return value;
}

function string(value, name) {
  if (typeof value !== "string" || value.length === 0 ||
      !/^[\x20-\x7e]+$/.test(value)) fail(`${name} must be a nonempty ASCII string`);
  return value;
}

function identifier(value, name) {
  string(value, name);
  if (!IDENTIFIER.test(value)) fail(`${name} is not a stable identifier`);
  return value;
}

function decimal(value, pattern, name) {
  if (typeof value !== "string" || !pattern.test(value)) {
    fail(`${name} is not a canonical decimal integer`);
  }
  return value;
}

function bool(value, name) {
  if (typeof value !== "boolean") fail(`${name} must be boolean`);
  return value;
}

function digest(value, name) {
  if (typeof value !== "string" || !SHA256.test(value)) fail(`${name} is not SHA-256`);
  return value;
}

function sortedUniqueIdentifiers(value, name, allowEmpty = true) {
  array(value, name);
  if (!allowEmpty && value.length === 0) fail(`${name} must not be empty`);
  let previous = "";
  value.forEach((entry, index) => {
    identifier(entry, `${name}[${index}]`);
    if (entry <= previous) fail(`${name} must be uniquely sorted`);
    previous = entry;
  });
  return value;
}

function canonical(value) {
  const ancestors = new Set();
  function normalize(entry) {
    if (entry === null || typeof entry === "string" || typeof entry === "boolean" ||
        Number.isSafeInteger(entry)) return entry;
    if (typeof entry !== "object") fail("evidence contains a noncanonical JSON value");
    if (ancestors.has(entry)) fail("evidence contains a cycle");
    ancestors.add(entry);
    let answer;
    if (Array.isArray(entry)) {
      const expected = Array.from({ length: entry.length }, (_, index) => String(index));
      if (JSON.stringify(Object.keys(entry)) !== JSON.stringify(expected)) {
        fail("evidence contains a sparse or decorated array");
      }
      answer = entry.map(normalize);
    } else {
      if (!isPlainObject(entry)) fail("evidence contains a non-plain object");
      answer = Object.fromEntries(
        Object.keys(entry).sort().map(key => {
          if (entry[key] === undefined) fail(`evidence contains undefined at ${key}`);
          return [key, normalize(entry[key])];
        }),
      );
    }
    ancestors.delete(entry);
    return answer;
  }
  const raw = Buffer.from(JSON.stringify(normalize(value)), "ascii");
  if (raw.length > MAX_BYTES) fail("evidence exceeds its byte bound");
  return raw;
}

function sha256Canonical(value) {
  return crypto.createHash("sha256").update(canonical(value)).digest("hex");
}

function parseCanonical(raw) {
  if (!Buffer.isBuffer(raw) || raw.length > MAX_BYTES) {
    fail("canonical evidence must be a bounded Buffer");
  }
  let value;
  try {
    value = JSON.parse(raw.toString("ascii"));
  } catch (error) {
    throw new OutputEvidenceFailure("canonical evidence is not JSON", { cause: error });
  }
  if (!canonical(value).equals(raw)) fail("evidence bytes are not canonical JSON");
  validate(value);
  return value;
}

function shapeEquals(shape, expected) {
  return shape.length === expected.length &&
    shape.every((entry, index) => BigInt(entry) === BigInt(expected[index]));
}

function buildEvidenceMap(entries) {
  const evidence = new Map();
  let previous = "";
  array(entries, "evidence").forEach((entry, index) => {
    const name = `evidence[${index}]`;
    exactKeys(entry, ["encoding", "id", "kind", "sha256", "shape"], name);
    identifier(entry.id, `${name}.id`);
    if (entry.id <= previous) fail("evidence ids must be uniquely sorted");
    previous = entry.id;
    if (!EVIDENCE_KINDS.has(entry.kind)) fail(`${name}.kind is unsupported`);
    if (!ENCODINGS.has(entry.encoding)) fail(`${name}.encoding is unsupported`);
    digest(entry.sha256, `${name}.sha256`);
    array(entry.shape, `${name}.shape`).forEach((dimension, dimensionIndex) =>
      decimal(dimension, NONNEGATIVE, `${name}.shape[${dimensionIndex}]`));
    evidence.set(entry.id, entry);
  });
  return evidence;
}

function reference(evidence, id, kinds, name, expectedShape = undefined) {
  identifier(id, name);
  const entry = evidence.get(id);
  if (!entry) fail(`${name} references absent evidence ${id}`);
  const accepted = Array.isArray(kinds) ? kinds : [kinds];
  if (!accepted.includes(entry.kind)) fail(`${name} has evidence kind ${entry.kind}`);
  if (expectedShape !== undefined && !shapeEquals(entry.shape, expectedShape)) {
    fail(`${name} has the wrong evidence shape`);
  }
  return entry;
}

function referenceList(evidence, ids, kinds, name, allowEmpty = true) {
  sortedUniqueIdentifiers(ids, name, allowEmpty);
  ids.forEach((id, index) => reference(evidence, id, kinds, `${name}[${index}]`));
}

function validateField(field) {
  exactKeys(field, ["definingPolynomialAscending", "degree", "id"], "field");
  string(field.id, "field.id");
  decimal(field.degree, POSITIVE, "field.degree");
  array(field.definingPolynomialAscending, "field.definingPolynomialAscending");
  if (BigInt(field.definingPolynomialAscending.length) !== BigInt(field.degree) + 1n) {
    fail("field polynomial length does not match degree");
  }
  field.definingPolynomialAscending.forEach((coefficient, index) =>
    decimal(coefficient, INTEGER, `field.definingPolynomialAscending[${index}]`));
  if (field.definingPolynomialAscending.at(-1) === "0") fail("field leading coefficient is zero");
}

function validateRelations(relations, evidence, degree) {
  exactKeys(relations, [
    "factorBaseCount", "factorBaseRef", "logColumns", "logsRef",
    "principalGeneratorsRef", "relationCount", "relationMatrixRef",
  ], "relations");
  decimal(relations.factorBaseCount, NONNEGATIVE, "relations.factorBaseCount");
  decimal(relations.relationCount, NONNEGATIVE, "relations.relationCount");
  decimal(relations.logColumns, NONNEGATIVE, "relations.logColumns");
  const n = relations.factorBaseCount;
  const m = relations.relationCount;
  reference(evidence, relations.factorBaseRef, "factor_base_ideals", "relations.factorBaseRef", [n, BigInt(degree) ** 2n]);
  reference(evidence, relations.relationMatrixRef, "relation_matrix", "relations.relationMatrixRef", [m, n]);
  reference(evidence, relations.principalGeneratorsRef, "principal_generators", "relations.principalGeneratorsRef", [m, degree]);
  reference(evidence, relations.logsRef, "relation_logs", "relations.logsRef", [m, relations.logColumns]);
}

function validatePresentation(presentation, evidence, relations) {
  exactKeys(presentation, ["dependencyRefs", "proof", "provenanceRefs", "variant"], "presentation");
  referenceList(evidence, presentation.dependencyRefs, "dependency", "presentation.dependencyRefs", false);
  referenceList(evidence, presentation.provenanceRefs, "provenance", "presentation.provenanceRefs", false);
  const rows = relations.relationCount;
  const columns = relations.factorBaseCount;
  const proof = record(presentation.proof, "presentation.proof");
  if (presentation.variant === "smith_uwvd") {
    exactKeys(proof, ["dRef", "uRef", "vRef", "wRef"], "presentation.proof");
    reference(evidence, proof.uRef, "presentation_transform_left", "presentation.proof.uRef", [rows, rows]);
    reference(evidence, proof.wRef, "presentation_transform_middle", "presentation.proof.wRef", [rows, columns]);
    reference(evidence, proof.vRef, "presentation_transform_right", "presentation.proof.vRef", [columns, columns]);
    reference(evidence, proof.dRef, "presentation_diagonal", "presentation.proof.dRef", [rows, columns]);
  } else if (presentation.variant === "right_inverse") {
    exactKeys(proof, ["identityRef", "matrixRef", "rightInverseRef"], "presentation.proof");
    reference(evidence, proof.matrixRef, "presentation_matrix", "presentation.proof.matrixRef", [rows, columns]);
    reference(evidence, proof.rightInverseRef, "presentation_right_inverse", "presentation.proof.rightInverseRef", [columns, rows]);
    reference(evidence, proof.identityRef, "presentation_identity", "presentation.proof.identityRef", [columns, columns]);
  } else if (presentation.variant === "trivial_identity") {
    exactKeys(proof, ["identityRef"], "presentation.proof");
    reference(evidence, proof.identityRef, "presentation_identity", "presentation.proof.identityRef", [columns, columns]);
  } else {
    fail("presentation.variant is unsupported");
  }
}

function validateClassGroup(classGroup, evidence, degree) {
  exactKeys(classGroup, ["classNumber", "generators", "invariantFactors"], "classGroup");
  decimal(classGroup.classNumber, POSITIVE, "classGroup.classNumber");
  array(classGroup.invariantFactors, "classGroup.invariantFactors");
  array(classGroup.generators, "classGroup.generators");
  if (classGroup.invariantFactors.length !== classGroup.generators.length) {
    fail("class generator count does not match invariant factors");
  }
  let product = 1n;
  let previous = 1n;
  classGroup.invariantFactors.forEach((factor, index) => {
    decimal(factor, POSITIVE, `classGroup.invariantFactors[${index}]`);
    const current = BigInt(factor);
    if (current < 2n || current % previous !== 0n) fail("class invariants are not normalized");
    previous = current;
    product *= current;
  });
  if (product !== BigInt(classGroup.classNumber)) fail("class number differs from invariant product");
  classGroup.generators.forEach((generator, index) => {
    const name = `classGroup.generators[${index}]`;
    exactKeys(generator, ["archimedeanRefs", "idealRef", "order", "principalWitnessRef"], name);
    if (generator.order !== classGroup.invariantFactors[index]) fail(`${name}.order changed`);
    reference(evidence, generator.idealRef, "class_generator_ideal", `${name}.idealRef`, [degree, degree]);
    reference(evidence, generator.principalWitnessRef, "principal_order_witness", `${name}.principalWitnessRef`);
    referenceList(evidence, generator.archimedeanRefs, "archimedean_principal_map", `${name}.archimedeanRefs`);
  });
}

function validateUnitGroup(unitGroup, evidence, degree) {
  exactKeys(unitGroup, ["compactUnits", "exactUnits", "rank", "regulator", "torsion"], "unitGroup");
  decimal(unitGroup.rank, NONNEGATIVE, "unitGroup.rank");
  const rank = BigInt(unitGroup.rank);
  array(unitGroup.compactUnits, "unitGroup.compactUnits");
  if (BigInt(unitGroup.compactUnits.length) !== rank) fail("compact-unit count differs from rank");
  unitGroup.compactUnits.forEach((unit, index) => {
    const name = `unitGroup.compactUnits[${index}]`;
    exactKeys(unit, ["logRef", "provenanceRef", "relationTransformRef"], name);
    reference(evidence, unit.relationTransformRef, "compact_unit_relation_transform", `${name}.relationTransformRef`);
    reference(evidence, unit.provenanceRef, "compact_unit_provenance", `${name}.provenanceRef`);
    reference(evidence, unit.logRef, "compact_unit_log", `${name}.logRef`);
  });
  const exact = record(unitGroup.exactUnits, "unitGroup.exactUnits");
  if (exact.status === "present") {
    exactKeys(exact, ["status", "units"], "unitGroup.exactUnits");
    array(exact.units, "unitGroup.exactUnits.units");
    if (BigInt(exact.units.length) !== rank) fail("exact-unit count differs from rank");
    exact.units.forEach((unit, index) => {
      const name = `unitGroup.exactUnits.units[${index}]`;
      exactKeys(unit, ["coordinatesRef", "normRef"], name);
      reference(evidence, unit.coordinatesRef, "exact_unit_coordinates", `${name}.coordinatesRef`, [degree]);
      reference(evidence, unit.normRef, "exact_unit_norm", `${name}.normRef`, []);
    });
  } else if (exact.status === "not_given") {
    exactKeys(exact, ["precisionBits", "reason", "status"], "unitGroup.exactUnits");
    if (!new Set(["LARGE", "PRECI"]).has(exact.reason)) fail("exact-unit omission reason is unsupported");
    decimal(exact.precisionBits, POSITIVE, "unitGroup.exactUnits.precisionBits");
  } else {
    fail("unitGroup.exactUnits.status is unsupported");
  }
  const regulator = record(unitGroup.regulator, "unitGroup.regulator");
  if (regulator.kind === "rigorous_enclosure") {
    exactKeys(regulator, ["acceptanceRef", "enclosureRef", "kind", "precisionBits", "precisionRef"], "unitGroup.regulator");
    reference(evidence, regulator.enclosureRef, "regulator_enclosure", "unitGroup.regulator.enclosureRef", [2]);
  } else if (regulator.kind === "pari_packed_accepted") {
    exactKeys(regulator, ["acceptanceRef", "kind", "packedValueRef", "precisionBits", "precisionRef", "retryRef"], "unitGroup.regulator");
    reference(evidence, regulator.packedValueRef, "pari_packed_regulator", "unitGroup.regulator.packedValueRef");
    reference(evidence, regulator.retryRef, "regulator_retry", "unitGroup.regulator.retryRef");
  } else {
    fail("unitGroup.regulator.kind is unsupported");
  }
  decimal(regulator.precisionBits, POSITIVE, "unitGroup.regulator.precisionBits");
  reference(evidence, regulator.precisionRef, "regulator_precision", "unitGroup.regulator.precisionRef");
  reference(evidence, regulator.acceptanceRef, "regulator_acceptance", "unitGroup.regulator.acceptanceRef");
  exactKeys(unitGroup.torsion, ["generatorRef", "order"], "unitGroup.torsion");
  decimal(unitGroup.torsion.order, POSITIVE, "unitGroup.torsion.order");
  reference(evidence, unitGroup.torsion.generatorRef, "torsion_generator", "unitGroup.torsion.generatorRef", [degree]);
}

function validateMaps(maps, evidence) {
  exactKeys(maps, ["combine", "factor", "reduce"], "maps");
  for (const [name, kind] of [["factor", "factor_map"], ["reduce", "reduce_map"], ["combine", "combine_map"]]) {
    const map = maps[name];
    exactKeys(map, ["evidenceRefs", "missing", "ready"], `maps.${name}`);
    bool(map.ready, `maps.${name}.ready`);
    referenceList(evidence, map.evidenceRefs, kind, `maps.${name}.evidenceRefs`, !map.ready);
    sortedUniqueIdentifiers(map.missing, `maps.${name}.missing`, map.ready);
    if (map.ready && map.missing.length !== 0) fail(`maps.${name} is ready but declares omissions`);
    if (!map.ready && map.evidenceRefs.length !== 0) fail(`maps.${name} is unready but publishes evidence`);
  }
}

function validateCompletion(completion, maps) {
  exactKeys(completion, [
    "correspondenceComplete", "freshCorrespondence", "missing",
    "outputBoundaryComplete", "phase3Complete", "phase4Complete", "phase5Complete",
  ], "completion");
  for (const key of ["correspondenceComplete", "freshCorrespondence", "outputBoundaryComplete", "phase3Complete", "phase4Complete", "phase5Complete"]) {
    bool(completion[key], `completion.${key}`);
  }
  sortedUniqueIdentifiers(completion.missing, "completion.missing", completion.outputBoundaryComplete);
  if (completion.outputBoundaryComplete && completion.missing.length !== 0) {
    fail("complete output boundary missing list must be empty");
  }
  if (completion.correspondenceComplete && !completion.freshCorrespondence) {
    fail("completed correspondence is not fresh");
  }
  if (completion.outputBoundaryComplete) {
    if (!completion.correspondenceComplete || !completion.phase3Complete ||
        !completion.phase4Complete || !completion.phase5Complete) {
      fail("output boundary completion lacks prerequisite phases");
    }
    if (!maps.factor.ready || !maps.reduce.ready || !maps.combine.ready) {
      fail("output boundary completion lacks map material");
    }
  } else if (completion.missing.length === 0) {
    fail("incomplete output boundary lacks an explicit missing list");
  }
  if (completion.phase5Complete && (!completion.phase3Complete || !completion.phase4Complete)) {
    fail("phase 5 completion lacks earlier phases");
  }
  if (completion.phase4Complete && !completion.phase3Complete) {
    fail("phase 4 completion lacks phase 3");
  }
}

function validate(payload) {
  exactKeys(payload, [
    "classGroup", "completion", "evidence", "field", "maps", "presentation",
    "relations", "schema", "source", "unitGroup",
  ], "payload");
  if (payload.schema !== SCHEMA) fail("payload schema changed");
  validateField(payload.field);
  exactKeys(payload.source, ["correspondenceResultSha256", "pariSourceSha256", "pariVersion"], "source");
  digest(payload.source.correspondenceResultSha256, "source.correspondenceResultSha256");
  digest(payload.source.pariSourceSha256, "source.pariSourceSha256");
  if (payload.source.pariVersion !== "2.17.4") fail("source.pariVersion changed");
  const evidence = buildEvidenceMap(payload.evidence);
  validateRelations(payload.relations, evidence, payload.field.degree);
  validatePresentation(payload.presentation, evidence, payload.relations);
  validateClassGroup(payload.classGroup, evidence, payload.field.degree);
  validateUnitGroup(payload.unitGroup, evidence, payload.field.degree);
  validateMaps(payload.maps, evidence);
  validateCompletion(payload.completion, payload.maps);
  return payload;
}

module.exports = Object.freeze({
  EVIDENCE_KINDS,
  OutputEvidenceFailure,
  SCHEMA,
  canonical,
  parseCanonical,
  sha256Canonical,
  validate,
});

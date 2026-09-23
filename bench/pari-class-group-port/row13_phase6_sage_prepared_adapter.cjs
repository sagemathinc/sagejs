"use strict";

// Qualification normalization over row 13's committed resident prepared
// class-and-unit boundary. This adds no mathematics and excludes preparation,
// compilation, projection and replay from the resident kernel clock.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const host = require("./row13_phase6_resident_kernel_host.cjs");
const authentication = require("./prepared_nf_authentication.cjs");

const DEFAULT_INPUT =
  "/scratch/sagejs-pari-fresh-prepared-corpus-v1/prepared-row-13-762c9bf8c75e6bba7727c41f457b992e05fecf256c3ed40aaa6c45814ff0a95c.json";
const FIELD_ID = host.FIELD_ID;
const POLYNOMIAL_ASCENDING = Object.freeze([
  "-20000000010", "-20000000006", "0", "0", "1",
]);
const PREPARED_AUTHORITY_SHA256 = host.EXPECTED_AUTHORITY;
const PROJECTION_SCHEMA =
  "sagejs.pari-class-group/row13-phase6-neutral-lean-projection-v2";
const SEMANTIC_SCOPE = Object.freeze({
  compared: Object.freeze(["class-number", "class-invariant-factors",
    "class-generator-count", "unit-rank", "torsion-order",
    "regulator-presence", "completion-mode"]),
  excluded: Object.freeze(["generator-ideal-values", "fundamental-unit-values",
    "regulator-value"]),
});

const fileSha256 = filename => crypto.createHash("sha256")
  .update(fs.readFileSync(filename)).digest("hex");

function semanticProjection(result) {
  assert.equal(result.schema,
    "sagejs.pari-class-group/row13-phase6-resident-sample-v1");
  assert.equal(result.projection.field.id, FIELD_ID);
  assert.deepEqual(result.projection.field.polynomialAscending,
    POLYNOMIAL_ASCENDING);
  assert.deepEqual(result.projection.classGroup.classNumber, "2");
  assert.deepEqual(result.projection.classGroup.invariantFactors, ["2"]);
  assert.equal(result.projection.classGroup.generatorIdeals.length, 1);
  assert.equal(result.projection.classGroup.generatorIdeals[0].length, 16);
  assert.equal(result.projection.unitGroup.rank, "2");
  assert.equal(result.projection.unitGroup.regulator.length, 3);
  assert.equal(result.projection.unitGroup.torsionOrder, "2");
  assert.equal(result.projection.unitGroup.materialization,
    "not_given(LARGE)");
  assert.equal(result.projection.completionMode,
    "flag-zero-class-and-unit-result");
  return {
    schema: PROJECTION_SCHEMA,
    semanticScope: SEMANTIC_SCOPE,
    field: { id: FIELD_ID,
      polynomialAscending: [...POLYNOMIAL_ASCENDING] },
    classGroup: { classNumber: "2", invariantFactors: ["2"],
      generatorCount: "1" },
    unitGroup: { rank: "2", regulatorPresent: true, torsionOrder: "2" },
    completionMode: "flag-zero-class-and-unit-result",
  };
}

// Reconstruct the lean comparison object from retained mathematical owners,
// deliberately without consulting `result.projection`.  This is a second
// logical read of the live evidence, not a clone of the publication object.
function independentReplay(result) {
  const prepared = result.metadataReceipt.metadata.prepared;
  const realPlaces = Number(prepared.admission_real_count);
  const complexPlaces = (Number(prepared.n) - realPlaces) / 2;
  assert.equal(result.post1006.status, 0);
  assert.equal(result.post1006.terminalState[0], 0);
  const evidence = {
    fieldId: FIELD_ID,
    polynomialAscending: prepared.prep_polynomial.map(String),
    classNumber: result.post1006.classNumber,
    invariantFactors: result.post1006.invariants.map(String),
    generatorCount: String(result.klass.generatorIdeals.length),
    unitRank: String(realPlaces + complexPlaces - 1),
    regulatorPresent: result.units.regulator.some(value => BigInt(value) !== 0n),
    torsionOrder: String(prepared.analytic_roots_of_unity),
    completionMode: "flag-zero-class-and-unit-result",
  };
  const reconstructedProjection = {
    schema: PROJECTION_SCHEMA, semanticScope: SEMANTIC_SCOPE,
    field: { id: evidence.fieldId,
      polynomialAscending: evidence.polynomialAscending },
    classGroup: { classNumber: evidence.classNumber,
      invariantFactors: evidence.invariantFactors,
      generatorCount: evidence.generatorCount },
    unitGroup: { rank: evidence.unitRank,
      regulatorPresent: evidence.regulatorPresent,
      torsionOrder: evidence.torsionOrder },
    completionMode: evidence.completionMode,
  };
  assert.deepEqual(reconstructedProjection, semanticProjection(result));
  return { schema:
    "sagejs.pari-class-group/row13-independent-lean-replay-v1",
    source: "independently-reconstructed-mathematical-owners", evidence,
    reconstructedProjection };
}

function artifactAuthority(filename) {
  const stat = fs.statSync(filename);
  if (stat.isFile()) return { path: filename, type: "file",
    sha256: fileSha256(filename) };
  if (stat.isDirectory()) return { path: filename, type: "directory" };
  throw new Error(`unsupported native artifact kind: ${filename}`);
}

function validateArtifactAuthority(value) {
  assert.deepEqual(value, artifactAuthority(value.path),
    "native artifact authority changed");
  return value;
}

function nativeAuthority(resident) {
  const nodes = [];
  const visit = (label, kernel) => {
    const built = kernel?.built || kernel;
    if (!built?.cacheKey || nodes.some(node => node.cacheKey === built.cacheKey)) return;
    const artifacts = {};
    for (const key of ["addonPath", "manifestPath", "modulePath", "outputPath",
      "coreSourcePath", "coreHeaderPath", "shimSourcePath", "shimHeaderPath"])
      if (built[key] && fs.existsSync(built[key])) {
        artifacts[key] = artifactAuthority(built[key]);
      }
    nodes.push({ label, cacheKey: built.cacheKey, moduleIdentity: built.moduleIdentity,
      artifacts });
  };
  visit("initial", resident.rootBuilt);
  for (const [name, kernel] of Object.entries(resident.gateKernels)) visit(`gate.${name}`, kernel);
  visit("post.catalog", resident.postCatalog); visit("post.terminal", resident.postTerminal);
  visit("transform-auth", resident.transformAuth);
  for (const [name, kernel] of Object.entries(resident.units)) visit(`units.${name}`, kernel);
  return nodes;
}

async function prepareResident(inputPath = DEFAULT_INPUT) {
  const prepared = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  assert.equal(authentication.authenticatePreparedNf(prepared).sha256,
    PREPARED_AUTHORITY_SHA256,
    "prepared input is outside the reviewed row-13 corridor");
  const resident = await host.prepareResident(prepared);
  const dependencies = ["row13_phase6_resident_kernel_host.cjs",
    "row13_prepared_gate_c_host.cjs", "row13_prepared_initial_owner.cjs",
    "row13_terminal_transaction_host.cjs", "row13_post1006_terminal_host.cjs",
    "row14_matched_kernel_clock_host.cjs", "relation_column_ancestry.cjs",
    "prepared_nf_authentication.cjs", "row13_prepared_initial_root.py",
    "collected_log_embeddings.py", "hnfspec_complete.py", "row14_next_pass.py",
    "hnfadd.py", "prime_degree_catalog.py", "row14_post806_terminal.py",
    "row13_phase6_transform_auth.py", "unit_lattice_selection.py",
    "unit_lattice_reduction.py", "log_matrix_transform.py",
    "field3_mixed_unit_suffix.py", "getfu_mixed_quartic.py"].map(name => ({ name,
      sha256: fileSha256(path.join(__dirname, name)) }));
  return Object.freeze({ resident, provenance: Object.freeze({
    preparedAuthoritySha256: PREPARED_AUTHORITY_SHA256,
    residentHostSha256: fileSha256(path.join(__dirname,
      "row13_phase6_resident_kernel_host.cjs")),
    preparedRootSourceSha256: fileSha256(path.join(__dirname,
      "row13_prepared_initial_root.py")),
    rootNativeCacheKey: resident.rootBuilt.cacheKey,
    dependencies,
    nativeAuthority: nativeAuthority(resident),
  }) });
}

async function runResident(preparedResident) {
  const raw = await host.runResident(preparedResident.resident);
  return {
    schema: "sagejs.pari-class-group/row13-sage-prepared-sample-v1",
    kernelNanoseconds: raw.kernelNanoseconds,
    processMaxRssKiB: String(raw.maxRssKiB),
    projection: semanticProjection(raw),
    independentReplay: independentReplay(raw),
    stageNanoseconds: structuredClone(raw.stageNanoseconds),
    provenance: preparedResident.provenance,
    boundary: { residentProcess: true,
      compilationInsideClock: false, allocationInsideClock: true,
      authenticationInsideClock: false, projectionInsideClock: false,
      replayInsideClock: false, filesystemInsideClock: false,
      serializationInsideClock: false,
      nativeHandleCount: raw.executionBoundary.nativeHandleCount },
    counters: { nativeMathematicalCalls:
      String(raw.executionBoundary.nativeMathematicalCalls),
      nativeHandleCount: String(raw.executionBoundary.nativeHandleCount) },
  };
}

module.exports = { DEFAULT_INPUT, FIELD_ID, POLYNOMIAL_ASCENDING,
  PREPARED_AUTHORITY_SHA256, PROJECTION_SCHEMA, prepareResident, runResident,
  SEMANTIC_SCOPE, artifactAuthority, independentReplay, semanticProjection,
  validateArtifactAuthority };

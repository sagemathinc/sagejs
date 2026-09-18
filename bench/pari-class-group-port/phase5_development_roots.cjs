"use strict";

// Field-neutral registry for development-only Phase-5 result publication.
//
// This module does not discover inputs, open scratch artifacts, execute a
// prepared kernel, acquire a timing lock, or admit final-reserve fields.  It
// binds the heterogeneous field-specific composers to the frozen panel and
// accepts only an already verified neutral correspondence result.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const neutral = require("./class_unit_correspondence_result.cjs");

const DEFAULT_MANIFEST = require("./class-unit-qualification-manifest.json");
const DEFAULT_PANEL = require("./panel.json");

const ROOT_SCHEMA = "sagejs.pari-class-group/phase5-development-root-v1";
const SHA256 = /^[0-9a-f]{64}$/;
const COMPLETE = "internally-complete";
const BLOCKED = "blocked";
const NEUTRAL_READY = "neutral-envelope-ready";
const ADAPTER_REQUIRED = "neutral-adapter-required";
const UNAVAILABLE = "unavailable";

class Phase5DevelopmentRootFailure extends Error {}
class Phase5DevelopmentRootUnavailable extends Phase5DevelopmentRootFailure {}
class Phase5ReserveFieldRejected extends Phase5DevelopmentRootFailure {}

function fail(message, ErrorClass = Phase5DevelopmentRootFailure) {
  throw new ErrorClass(message);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalPolynomialSha256(coefficients) {
  return sha256(JSON.stringify(coefficients));
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

// These are identities and interfaces, not input locations.  In particular,
// no entry contains a /scratch path or enough information to open one.
const ROOT_SPECS = Object.freeze([
  [0, "generated-sha256-0e970fdb1b4f043d042bd6093172638086e293ad03749215f71f7510a6622ba0",
    "2d0fa668fad6c929a71eabdee7ebfb7acc1938307a41d4c1b49847cc99c7964d",
    "pari-2.17.4:x^3-20018*x+20034", "h1_class_unit_result_adapter.cjs",
    "prepareH1ClassUnitResult", "publishPreparedH1Result", COMPLETE, NEUTRAL_READY, null],
  [1, "generated-sha256-dec56e7e41f5f60071249da2e66871ed837a3c6e65d821c328e7b4c57adaff3f",
    "394cce5d99f0e9f8ba49a12e1542ff41f36c98b535a4535071414a575ded95ba",
    null, "panel1_c7_result_composer.cjs", "preparePanel1C7Result",
    "publishPreparedPanel1C7Result", COMPLETE, NEUTRAL_READY, null],
  [3, "generated-sha256-11997528676ebeb1c0636be2cb828b5ed5a527ea18eb3a4ace953984da507de9",
    "aae73048ee765ce38148539a3abf01dac43ab04427126dae8295211d684d4d15",
    null, "row3_c7_result_composer.cjs", "prepareRow3C7Result",
    "publishPreparedRow3C7Result", COMPLETE, NEUTRAL_READY, null],
  [4, "generated-sha256-806defcf929c9cfff7467b8e7ea7b9f939cdd042bce8c1f5a310f5688904e3b9",
    "beb19c9584069e8397f9b1d5ddb6d87965aabcc0c788003ea106f3a2f0f566e6",
    null, "row4_c7_result_composer.cjs", "prepareRow4C7Result",
    "publishPreparedRow4C7Result", COMPLETE, NEUTRAL_READY, null],
  [6, "generated-sha256-55ba15494f03f38bf8f687ff4d2813e81184d71c84dbed9e1adc6af7ba62f0eb",
    "26fed17015f6479f2de7a3544d8e2ac9ef41ec899b18193d997489a0aeafa416",
    null, "row6_c7_result_composer.cjs", "prepareRow6C7Result", null,
    COMPLETE, NEUTRAL_READY, "publication wrapper still required"],
  [8, "generated-sha256-0857fab7114ab0045f1b91601101549c7b8d854c5c999b91afcb190cd2863363",
    "4184b3a9e86b3cc2f80a3dcaa593cba175263954c0e914b9cc6feaf68e9b0f52",
    null, "panel8_c7_result_composer.cjs", "preparePanel8C7Result",
    "publishPreparedPanel8C7Result", COMPLETE, NEUTRAL_READY, null],
  [10, "generated-sha256-984793770b4a15a79fbc9984fe352fbc867491917733c78bdba3b1856c18e3a7",
    "205cea0cc9446e959892f4b3cd8dd5e53ff37ae4fd43d335974bffaf3c92ec7a",
    "pari-2.17.4:x^4-2000022*x-2000042", "field3_class_unit_result_composer.cjs",
    "prepareField3ClassUnitResult", "publishPreparedField3Result", COMPLETE,
    NEUTRAL_READY, null],
  [11, "generated-sha256-147ddd296edb3764954d6142a499d17edcfecc635aec0181d4beda65d97ad4ab",
    "ce2bfa61425aa6816f76d5d4f48e7568a7cca85e7ae408e6ec3cb423cf353b07",
    null, "row11_c7_result_composer.cjs", "prepareRow11C7Result",
    "publishPreparedRow11C7Result", COMPLETE, NEUTRAL_READY, null],
  [13, "generated-sha256-353468f1887e96f5a2f66e3121564636ed8cdbd75bde6571609627bbe8586e33",
    "a0f7253a51b3045aa02d82f0846e4caa390b93ef159b8c1713245f5793d1e06c",
    null, "row13_c7_result_composer.cjs", "prepareRow13C7Result", null,
    COMPLETE, NEUTRAL_READY, "publication wrapper still required"],
  [14, "generated-sha256-e1d4643ab62bde9546d63340545e5302c2cef517222d569e634fb5e2093f6413",
    "aa0aa6152d8cf26cfe21b9f0b2e8c25aadb5cd00161a0ca3cf4d81d92df2ea20",
    null, "row14_c7_result_composer.cjs", "prepareRow14C7Result",
    "publishPreparedRow14C7Result", COMPLETE, NEUTRAL_READY, null],
  [16, "3.1.1002718428660.2",
    "aabb93f0d6139f9397586e148a87f5444f7da173ef7d1aabc0c8fae15705cf56",
    null, "mixed_cubic_c7_coordinator.cjs", "composePayload", null,
    COMPLETE, NEUTRAL_READY, "publication wrapper still required"],
  [18, "3.1.1005907102200.3",
    "d48b43b95d82e5e127e939b4625aedac5bbb1f927c9b92e19c583c51c0901c6e",
    null, "mixed_cubic_c7_coordinator.cjs", "composePayload", null,
    COMPLETE, NEUTRAL_READY, "publication wrapper still required"],
  [19, "3.1.1086061775432017340256300.107",
    "0aab4dadcd4bc7c70dcb017b9f584154d6fd1d98500e7951c71ace3efa5e81db",
    null, "row19_final_result_coordinator.cjs", "compose", "publish", COMPLETE,
    ADAPTER_REQUIRED,
    "committed terminal result needs projection to the neutral correspondence envelope",
    "sagejs.pari-class-group/row19-buchall-end-result-v1"],
  [20, "5.1.1000000.1",
    "36db16a4e174ca1a24dc16439e97c3660cb5135b378dcd3c2e86e438fb3bee11",
    null, "row20_c7_closure_coordinator.cjs", "payloadFromEvidence", null,
    COMPLETE, NEUTRAL_READY, "publication wrapper still required"],
  [21, "5.3.1009349859375.3",
    "6966124ec38a3af183ec7fa9d6cc4f376ef36aa0ba716eeff92bcba0bf7a64bb",
    null, "row21_final_result.py", "build_row21_payload", "cold_replay_row21",
    COMPLETE, ADAPTER_REQUIRED,
    "committed terminal result needs projection to the neutral correspondence envelope",
    "sagejs.pari-class-group/row21-final-buchall-end-v1"],
  [23, "5.5.1002836007889.1",
    "c3077e07c31ac7586ee22c1a57ecfab1883699f8061f850ad75a86d46f23ea73",
    null, null, null, null, BLOCKED, UNAVAILABLE,
    "generic degree-five ideal reduction and expanded ideal-product replay remain incomplete"],
].map(values => Object.freeze({
  panelIndex: values[0], manifestFieldId: values[1], polynomialSha256: values[2],
  internalFieldId: values[3] || values[1], module: values[4], composeExport: values[5],
  publishExport: values[6], completionStatus: values[7], publicationStatus: values[8],
  gap: values[9], sourceSchema: values[10] || null,
})));

function validatePanelRow(row, field, spec) {
  assert(row && typeof row === "object", `missing panel row ${spec.panelIndex}`);
  assert.equal(row.id, spec.manifestFieldId, `panel identity changed at row ${spec.panelIndex}`);
  assert.equal(field.id, row.id, `manifest identity changed at row ${spec.panelIndex}`);
  assert.equal(field.panelIndex, spec.panelIndex);
  assert.equal(field.degree, row.degree, `degree changed at row ${spec.panelIndex}`);
  assert.deepEqual(field.signature, row.signature, `signature changed at row ${spec.panelIndex}`);
  assert.equal(field.stratum, row.stratum, `stratum changed at row ${spec.panelIndex}`);
  assert.equal(row.phase, "tuning", `development root ${spec.panelIndex} is not a tuning row`);
  assert.equal(row.coefficient_order, "ascending");
  assert(Array.isArray(row.coefficients) && row.coefficients.length === row.degree + 1,
    `polynomial shape changed at row ${spec.panelIndex}`);
  assert(row.coefficients.every(value => typeof value === "string" && /^(0|-?[1-9][0-9]*)$/.test(value)),
    `polynomial coefficients changed at row ${spec.panelIndex}`);
  assert.equal(canonicalPolynomialSha256(row.coefficients), row.polynomial_sha256,
    `polynomial digest is invalid at row ${spec.panelIndex}`);
  assert.equal(row.polynomial_sha256, spec.polynomialSha256,
    `frozen polynomial changed at row ${spec.panelIndex}`);
}

function buildDevelopmentRootRegistry({
  manifest = DEFAULT_MANIFEST,
  panel = DEFAULT_PANEL,
} = {}) {
  assert.equal(manifest.schema, 1);
  assert.equal(panel.schema, 1);
  const manifestByIndex = new Map(manifest.fields.map(field => [field.panelIndex, field]));
  assert.equal(manifestByIndex.size, manifest.fields.length, "manifest panel indices are not unique");
  const developmentIndices = manifest.fields.filter(field => field.role !== "final-reserve")
    .map(field => field.panelIndex).sort((left, right) => left - right);
  assert.deepEqual(developmentIndices, ROOT_SPECS.map(spec => spec.panelIndex),
    "development registry does not cover the exact manifest development population");
  const entries = ROOT_SPECS.map(spec => {
    const field = manifestByIndex.get(spec.panelIndex);
    assert(field, `manifest lacks development row ${spec.panelIndex}`);
    assert.notEqual(field.role, "final-reserve", `development registry contains reserve row ${spec.panelIndex}`);
    const row = panel.rows[spec.panelIndex];
    validatePanelRow(row, field, spec);
    return Object.freeze({
      ...spec,
      degree: row.degree,
      signature: Object.freeze([...row.signature]),
      coefficients: Object.freeze([...row.coefficients]),
      role: field.role,
      stratum: row.stratum,
      modulePath: spec.module === null ? null : path.join(__dirname, spec.module),
      freshPreparedExecution: false,
      qualifiedTiming: false,
      reserveEligible: false,
    });
  });
  assert.equal(entries.filter(entry => entry.completionStatus === COMPLETE).length, 15);
  assert.equal(entries.filter(entry => entry.completionStatus === BLOCKED).length, 1);
  return Object.freeze(entries);
}

const DEVELOPMENT_ROOTS = buildDevelopmentRootRegistry();

function lookupManifestField(panelIndex, manifest) {
  assert(Number.isInteger(panelIndex), "panel index must be an integer");
  const field = manifest.fields.find(value => value.panelIndex === panelIndex);
  if (!field) fail(`panel row ${panelIndex} is outside the qualification manifest`);
  if (field.role === "final-reserve") {
    fail(`reserve field ${field.id} remains sealed`, Phase5ReserveFieldRejected);
  }
  return field;
}

function developmentRoot(panelIndex, {
  manifest = DEFAULT_MANIFEST,
  registry = DEVELOPMENT_ROOTS,
} = {}) {
  const field = lookupManifestField(panelIndex, manifest);
  const entry = registry.find(value => value.panelIndex === panelIndex);
  if (!entry) fail(`development field ${field.id} has no Phase-5 root entry`);
  if (entry.manifestFieldId !== field.id) fail("registry and manifest field identities differ");
  return entry;
}

function requireNeutralReady(entry) {
  if (entry.completionStatus !== COMPLETE || entry.publicationStatus !== NEUTRAL_READY) {
    fail(`development row ${entry.panelIndex} is unavailable: ${entry.gap}`,
      Phase5DevelopmentRootUnavailable);
  }
}

function normalizeSourceMetadata(metadata, entry) {
  if (metadata === undefined || metadata === null) return Object.freeze({});
  if (typeof metadata !== "object" || Array.isArray(metadata)) fail("source metadata must be an object");
  const fieldId = metadata.fieldId ?? metadata.field?.id;
  if (fieldId !== undefined && ![entry.manifestFieldId, entry.internalFieldId].includes(fieldId)) {
    fail("source metadata field identity changed");
  }
  const complete = metadata.correspondenceComplete ?? metadata.correspondence_complete ??
    metadata.terminal?.correspondenceComplete ?? metadata.terminal?.correspondence_complete;
  if (complete !== undefined && complete !== true) fail("source metadata is not correspondence-complete");
  const publicComplete = metadata.publicComplete ?? metadata.public_complete ??
    metadata.terminal?.publicComplete ?? metadata.terminal?.public_complete;
  if (publicComplete !== undefined && publicComplete !== false) fail("source metadata claims public completion");
  if (metadata.qualifiedTiming === true) fail("development root cannot claim qualified timing");
  const status = metadata.status ?? metadata.terminal?.status;
  const statuses = new Set([
    undefined,
    "ready-for-out-of-band-publication-authority",
    "pari-correspondence-complete-internal",
    "published-upstream-assumed-buchall-end-v1",
  ]);
  if (!statuses.has(status)) fail(`unsupported Phase-5 source status: ${status}`);
  return Object.freeze({ fieldId: fieldId ?? entry.internalFieldId, status: status ?? null });
}

function normalizeVerifiedDevelopmentRoot({
  panelIndex,
  result,
  sourceMetadata,
  manifest = DEFAULT_MANIFEST,
  panel = DEFAULT_PANEL,
  registry = DEVELOPMENT_ROOTS,
}) {
  const entry = developmentRoot(panelIndex, { manifest, registry });
  requireNeutralReady(entry);
  if (!(result instanceof neutral.ImmutableClassUnitCorrespondenceResult)) {
    fail("development root result does not have the verified neutral result brand");
  }
  const payload = result.detachedPayload();
  neutral.validatePayload(payload);
  if (payload.field.id !== entry.internalFieldId) fail("neutral result field identity changed");
  if (payload.field.degree !== String(entry.degree)) fail("neutral result degree changed");
  if (!same(payload.field.definingPolynomialAscending, entry.coefficients)) {
    fail("neutral result polynomial changed");
  }
  // Signature is not duplicated in the neutral payload.  It is bound here by
  // the already validated frozen manifest/panel identity.
  validatePanelRow(panel.rows[panelIndex],
    manifest.fields.find(value => value.panelIndex === panelIndex), entry);
  const metadata = normalizeSourceMetadata(sourceMetadata, entry);
  return Object.freeze({
    schema: ROOT_SCHEMA,
    panelIndex,
    fieldId: entry.manifestFieldId,
    internalFieldId: entry.internalFieldId,
    polynomialSha256: entry.polynomialSha256,
    degree: entry.degree,
    signature: Object.freeze([...entry.signature]),
    role: entry.role,
    stratum: entry.stratum,
    correspondenceComplete: true,
    publicComplete: false,
    qualifiedTiming: false,
    freshPreparedExecution: false,
    resultSha256: result.sha256,
    sourceMetadata: metadata,
    result,
  });
}

function verifyDevelopmentRoot({ panelIndex, raw, authority, sourceMetadata, ...options }) {
  const entry = developmentRoot(panelIndex, options);
  requireNeutralReady(entry);
  const result = neutral.verifyClassUnitCorrespondenceResult(raw, authority);
  return normalizeVerifiedDevelopmentRoot({
    panelIndex, result, sourceMetadata, ...options,
  });
}

module.exports = {
  ADAPTER_REQUIRED,
  BLOCKED,
  COMPLETE,
  DEVELOPMENT_ROOTS,
  NEUTRAL_READY,
  Phase5DevelopmentRootFailure,
  Phase5DevelopmentRootUnavailable,
  Phase5ReserveFieldRejected,
  ROOT_SCHEMA,
  ROOT_SPECS,
  UNAVAILABLE,
  buildDevelopmentRootRegistry,
  canonicalPolynomialSha256,
  developmentRoot,
  normalizeVerifiedDevelopmentRoot,
  verifyDevelopmentRoot,
};

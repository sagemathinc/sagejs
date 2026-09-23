"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");

const runner = require("./run_class_unit_qualification.cjs");

const SCHEMA_PATH = path.join(__dirname,
  "class-unit-qualification-campaign-index.schema.json");
const STAGE_SCHEMA = "sagejs.pari-class-group/qualified-stage-attribution-v1";
const NAMED_STAGES = [
  "relation-retry",
  "sparse-hnf-snf-transform",
  "unit-regulator",
  "honesty-generators-final",
];
const validatedCampaigns = new WeakSet();

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fileSha256(filename) {
  return sha256(fs.readFileSync(filename));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function indexDigest(index) {
  const material = structuredClone(index);
  delete material.indexSha256;
  return sha256(JSON.stringify(canonical(material)));
}

function authorityDigest(index) {
  const material = structuredClone(index);
  // The enabled manifest pins this authority digest, while receipts and the
  // index independently pin the manifest hash.  Omitting the manifest hash
  // here avoids a circular manifest <-> authority digest.
  delete material.authoritySha256;
  delete material.indexSha256;
  delete material.identity.qualificationManifestSha256;
  return sha256(JSON.stringify(canonical(material)));
}

function exactKeys(value, keys, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} has unexpected fields`);
}

function compileSchema() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  const validate = ajv.compile(JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8")));
  return { ajv, validate };
}

function validateIndexShape(index) {
  const { ajv, validate } = compileSchema();
  if (!validate(index)) {
    throw new assert.AssertionError({
      message: `campaign index schema violation: ${ajv.errorsText(validate.errors, { separator: "; " })}`,
    });
  }
  assert.equal(index.authoritySha256, authorityDigest(index),
    "campaign authority digest mismatch");
  assert.equal(index.indexSha256, indexDigest(index), "campaign index digest mismatch");
  return index;
}

function resolveEvidencePath(indexPath, evidencePath) {
  return path.isAbsolute(evidencePath)
    ? evidencePath : path.resolve(path.dirname(indexPath), evidencePath);
}

function assertUnique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} must be unique`);
}

function sameObject(actual, expected, label) {
  assert.deepEqual(canonical(actual), canonical(expected), `${label} differs from campaign identity`);
}

function validateReceiptIdentity(receipt, identity) {
  assert.equal(receipt.qualifiedTiming, true, "campaign receipt is not qualified");
  assert.equal(receipt.provenance.commit, identity.candidateCommit,
    "candidate commit differs from campaign identity");
  assert.equal(receipt.provenance.panelSha256, identity.panelSha256);
  assert.equal(receipt.provenance.qualificationManifestSha256,
    identity.qualificationManifestSha256);
  sameObject(receipt.provenance.sagejsArtifacts, identity.sagejsArtifacts, "Sage.js artifacts");
  sameObject(receipt.provenance.pariArtifacts, identity.pariArtifacts, "PARI artifacts");
  assert.equal(runner.canonicalDigest(receipt.host), identity.hostSha256,
    "host differs from campaign identity");
}

function loadReceiptReference(reference, indexPath, manifestData) {
  const filename = resolveEvidencePath(indexPath, reference.path);
  assert.equal(fileSha256(filename), reference.sha256,
    `journal digest mismatch: ${reference.path}`);
  const receipt = runner.readReceiptJournal(filename, { manifestData, requireQualified: true });
  assert.equal(receipt.case.fieldId, reference.fieldId);
  assert.equal(receipt.runId, reference.runId);
  return { reference: { ...reference, resolvedPath: filename }, receipt };
}

function signedIntegerString(value, label) {
  assert.equal(typeof value, "string", `${label} must be a decimal string`);
  assert.match(value, /^-?(0|[1-9][0-9]*)$/, `${label} must be canonical decimal`);
  assert.notEqual(value, "-0", `${label} must not be negative zero`);
  return BigInt(value);
}

function validateStageDiagnostic(evidence, { campaignId, identity, fieldIds }) {
  exactKeys(evidence, [
    "schema", "qualifiedTiming", "campaignId", "fieldId", "runId",
    "candidateCommit", "campaignIdentitySha256", "pairs",
  ], "stage diagnostic");
  assert.equal(evidence.schema, STAGE_SCHEMA);
  assert.equal(evidence.qualifiedTiming, true);
  assert.equal(evidence.campaignId, campaignId);
  assert(fieldIds.has(evidence.fieldId), "stage diagnostic has no completed prepared-kernel field");
  assert.equal(evidence.candidateCommit, identity.candidateCommit);
  assert.equal(evidence.campaignIdentitySha256, runner.canonicalDigest(identity));
  assert(evidence.pairs.length >= 7, "stage attribution requires at least seven alternating pairs");

  let positiveRoot = 0n;
  let explained = 0n;
  for (const [index, pair] of evidence.pairs.entries()) {
    exactKeys(pair, [
      "pairIndex", "order", "rootGapNanoseconds", "stageGapNanoseconds",
      "unattributedRemainderGapNanoseconds",
    ], `stage pair ${index}`);
    assert.equal(pair.pairIndex, index);
    assert.equal(pair.order, index % 2 === 0 ? "AB" : "BA");
    exactKeys(pair.stageGapNanoseconds, NAMED_STAGES, `stage pair ${index} gaps`);
    const root = signedIntegerString(pair.rootGapNanoseconds, `stage pair ${index} root gap`);
    const named = NAMED_STAGES.map(stage =>
      signedIntegerString(pair.stageGapNanoseconds[stage], `stage pair ${index} ${stage}`));
    const residual = signedIntegerString(pair.unattributedRemainderGapNanoseconds,
      `stage pair ${index} residual`);
    assert.equal(named.reduce((sum, value) => sum + value, residual), root,
      `stage pair ${index} gaps do not sum to the inclusive root`);
    if (root > 0n) {
      const namedPositive = named.reduce((sum, value) => sum + (value > 0n ? value : 0n), 0n);
      positiveRoot += root;
      explained += namedPositive < root ? namedPositive : root;
    }
  }
  return {
    evidence,
    attributedGapFraction: positiveRoot === 0n
      ? null : Number(explained * 1_000_000_000_000n / positiveRoot) / 1_000_000_000_000,
    positiveRootGapNanoseconds: positiveRoot.toString(),
    explainedGapNanoseconds: explained.toString(),
  };
}

function loadStageReference(reference, indexPath, context) {
  const filename = resolveEvidencePath(indexPath, reference.path);
  assert.equal(fileSha256(filename), reference.sha256,
    `stage journal digest mismatch: ${reference.path}`);
  const evidence = JSON.parse(fs.readFileSync(filename, "utf8"));
  assert.equal(evidence.fieldId, reference.fieldId);
  assert.equal(evidence.runId, reference.runId);
  return {
    reference: { ...reference, resolvedPath: filename },
    ...validateStageDiagnostic(evidence, context),
  };
}

function loadCampaignIndex(indexPath, { manifestData = runner.validateManifest() } = {}) {
  const resolvedIndexPath = path.resolve(indexPath);
  const index = validateIndexShape(JSON.parse(fs.readFileSync(resolvedIndexPath, "utf8")));
  assert.equal(manifestData.manifest.executionEnabled, true,
    "qualification execution is not enabled by the frozen manifest");
  assert.equal(manifestData.manifest.reserveOpeningEnabled, true,
    "reserve opening is not enabled by the frozen manifest");
  assert.equal(typeof manifestData.manifest.qualificationCampaignAuthoritySha256, "string",
    "enabled manifest does not pin a qualification campaign authority");
  assert.equal(manifestData.manifest.qualificationCampaignAuthoritySha256,
    index.authoritySha256, "campaign authority is not pinned by the enabled manifest");
  assert.equal(index.identity.panelSha256, manifestData.panelSha256);
  assert.equal(index.identity.qualificationManifestSha256, manifestData.manifestSha256);

  const prepared = index.journals.preparedKernel.map(reference =>
    loadReceiptReference(reference, resolvedIndexPath, manifestData));
  assertUnique(prepared.map(item => item.reference.fieldId), "prepared field IDs");
  assertUnique(prepared.map(item => item.reference.runId), "prepared run IDs");
  assertUnique(prepared.map(item => item.reference.resolvedPath), "prepared journal paths");
  assert.deepEqual(prepared.map(item => item.reference.fieldId).sort(),
    manifestData.manifest.fields.map(field => field.id).sort(),
    "campaign does not contain the exact frozen population");
  for (const item of prepared) {
    assert.equal(item.receipt.case.boundary, "prepared-kernel");
    assert.equal(item.receipt.case.tier, "flag-zero");
    validateReceiptIdentity(item.receipt, index.identity);
    if (item.receipt.summary.completionStatus !== "complete_matched") {
      assert.equal(typeof item.receipt.summary.firstDivergence, "string",
        "failed field must record its first divergence");
      assert(item.receipt.summary.firstDivergence.length > 0,
        "failed field must record a nonempty first divergence");
      assert.equal(typeof item.receipt.summary.failureDetail, "string");
      assert(item.receipt.summary.failureDetail.length > 0);
    }
  }

  const completedIds = new Set(prepared.filter(item =>
    item.receipt.summary.completionStatus === "complete_matched")
    .map(item => item.receipt.case.fieldId));
  const stageDiagnostics = index.journals.stageDiagnostics.map(reference =>
    loadStageReference(reference, resolvedIndexPath, {
      campaignId: index.campaignId,
      identity: index.identity,
      fieldIds: completedIds,
    }));
  assertUnique(stageDiagnostics.map(item => item.reference.runId), "stage diagnostic run IDs");
  assertUnique(stageDiagnostics.map(item => item.reference.resolvedPath),
    "stage diagnostic journal paths");

  const compactFlagOne = index.journals.compactFlagOne.map(reference =>
    loadReceiptReference(reference, resolvedIndexPath, manifestData));
  assertUnique(compactFlagOne.map(item => item.reference.runId), "compact flag-one run IDs");
  assertUnique(compactFlagOne.map(item => item.reference.resolvedPath),
    "compact flag-one journal paths");
  for (const item of compactFlagOne) {
    assert.equal(item.receipt.case.boundary, "prepared-kernel");
    assert.equal(item.receipt.case.tier, "compact-flag-one");
    validateReceiptIdentity(item.receipt, index.identity);
  }
  assertUnique([
    ...prepared.map(item => item.reference.runId),
    ...stageDiagnostics.map(item => item.reference.runId),
    ...compactFlagOne.map(item => item.reference.runId),
  ], "all campaign run IDs");
  assertUnique([
    ...prepared.map(item => item.reference.resolvedPath),
    ...stageDiagnostics.map(item => item.reference.resolvedPath),
    ...compactFlagOne.map(item => item.reference.resolvedPath),
  ], "all campaign journal paths");

  const campaign = {
    validated: true,
    index,
    indexPath: resolvedIndexPath,
    indexFileSha256: fileSha256(resolvedIndexPath),
    prepared,
    receipts: prepared.map(item => item.receipt),
    stageDiagnostics,
    compactFlagOne,
  };
  validatedCampaigns.add(campaign);
  return campaign;
}

function isValidatedCampaign(value) {
  return validatedCampaigns.has(value);
}

module.exports = {
  NAMED_STAGES,
  SCHEMA_PATH,
  STAGE_SCHEMA,
  authorityDigest,
  indexDigest,
  isValidatedCampaign,
  loadCampaignIndex,
  validateIndexShape,
  validateStageDiagnostic,
};

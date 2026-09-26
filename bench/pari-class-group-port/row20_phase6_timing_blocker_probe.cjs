"use strict";

// Shared implementation for the row-20/21/23 Phase-6 admission probes. This
// is not a timing adapter: it proves why the current fresh correctness
// transaction may not be timed as a resident prepared-field kernel.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const authentication = require("./prepared_nf_authentication.cjs");

const SCHEMA =
  "sagejs.pari-class-group/phase6-resident-timing-blocker-probe-v1";
const PROJECTION_SCHEMA =
  "sagejs.pari-class-group/phase6-flag-zero-common-projection-v1";
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])]),
  );
  return value;
}

function digest(value) {
  return sha256(Buffer.from(JSON.stringify(canonical(value))));
}

function validateConfiguration(configuration) {
  assert(configuration && typeof configuration === "object");
  assert([20, 21, 23].includes(configuration.panelIndex));
  assert.match(configuration.fieldId, /^(?:[0-9]+\.){3}[0-9]+$/);
  assert(Array.isArray(configuration.polynomialAscending));
  assert.equal(configuration.polynomialAscending.at(-1), "1");
  assert.match(configuration.preparedAuthoritySha256, /^[0-9a-f]{64}$/);
  assert.match(configuration.preparedFileSha256, /^[0-9a-f]{64}$/);
  assert.equal(typeof configuration.transactionModule, "string");
  assert(configuration.boundaryFiles.length > 0);
  assert(configuration.requiredBlockers.length > 0);
  return configuration;
}

function locatePrepared(configuration, corpusDirectory) {
  const prefix = `prepared-row-${String(configuration.panelIndex).padStart(2, "0")}-`;
  const matches = fs.readdirSync(corpusDirectory)
    .filter(filename => filename.startsWith(prefix) && filename.endsWith(".json"));
  assert.equal(matches.length, 1,
    `expected one prepared input for row ${configuration.panelIndex}`);
  const filename = path.join(corpusDirectory, matches[0]);
  const bytes = fs.readFileSync(filename);
  assert.equal(sha256(bytes), configuration.preparedFileSha256,
    "prepared file bytes changed");
  const prepared = JSON.parse(bytes);
  assert.equal(authentication.authenticatePreparedNf(prepared).sha256,
    configuration.preparedAuthoritySha256, "prepared authority changed");
  assert.deepEqual(prepared.prep_polynomial, configuration.polynomialAscending);
  return { filename, prepared };
}

function rejectPreparedMutations(configuration, transaction, prepared) {
  const mutations = [
    value => { value.prep_polynomial[0] = String(BigInt(value.prep_polynomial[0]) + 1n); },
    value => { value.prep_index = String(BigInt(value.prep_index) + 1n); },
    value => { value.precision = String(BigInt(value.precision) + 1n); },
    value => { value.retainedOwner = {}; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(prepared);
    mutate(changed);
    assert.throws(() => configuration.validatePrepared(transaction, changed),
      undefined, "mutated prepared input was accepted");
  }
  return mutations.length;
}

function inspectBoundary(configuration) {
  const files = configuration.boundaryFiles.map(filename => {
    const bytes = fs.readFileSync(path.join(__dirname, filename));
    return { filename, sha256: sha256(bytes), source: bytes.toString("utf8") };
  });
  const blockers = configuration.requiredBlockers.map(blocker => {
    const file = files.find(candidate => candidate.filename === blocker.filename);
    assert(file, `blocker names unknown file ${blocker.filename}`);
    assert(blocker.pattern.test(file.source),
      `reviewed blocker disappeared: ${blocker.id}`);
    return { id: blocker.id, filename: blocker.filename,
      sourceSha256: file.sha256, effect: blocker.effect,
      forbiddenInsideMatchedClock: true };
  });
  return { files: files.map(({ filename, sha256: value }) =>
    ({ filename, sha256: value })), blockers };
}

function projectionFromPayload(configuration, payload) {
  assert.equal(payload.field.id, configuration.fieldId);
  assert.deepEqual(payload.field.definingPolynomialAscending,
    configuration.polynomialAscending);
  const projection = {
    schema: PROJECTION_SCHEMA,
    field: { id: payload.field.id,
      polynomialAscending: payload.field.definingPolynomialAscending },
    classGroup: { classNumber: payload.classGroup.classNumber,
      invariantFactors: payload.classGroup.invariantFactors,
      generatorCount: payload.classGroup.generatorCount },
    unitGroup: { rank: payload.unitGroup.rank,
      regulatorPresent: typeof payload.unitGroup.regulatorOwner === "string",
      torsionOrder: payload.unitGroup.torsionOrder },
    completionMode: "flag-zero-class-and-unit-result",
  };
  assert.deepEqual(projection.classGroup, configuration.expected.classGroup);
  assert.deepEqual(projection.unitGroup, configuration.expected.unitGroup);
  return projection;
}

function projectionFromPari(configuration, sample) {
  assert(sample && typeof sample === "object");
  const projection = {
    schema: PROJECTION_SCHEMA,
    field: { id: sample.field.id,
      polynomialAscending: sample.field.polynomialAscending },
    classGroup: { classNumber: sample.classGroup.classNumber,
      invariantFactors: [...sample.classGroup.invariantFactorsSourceOrder].reverse(),
      generatorCount: String(sample.classGroup.generatorCount) },
    unitGroup: { rank: sample.unitGroup.rank,
      regulatorPresent: sample.unitGroup.regulatorPresent,
      torsionOrder: sample.unitGroup.torsionOrder },
    completionMode: "flag-zero-class-and-unit-result",
  };
  assert.equal(projection.field.id, configuration.fieldId);
  assert.deepEqual(projection.field.polynomialAscending,
    configuration.polynomialAscending);
  assert.deepEqual(projection.classGroup, configuration.expected.classGroup);
  assert.deepEqual(projection.unitGroup, configuration.expected.unitGroup);
  return projection;
}

function syntheticPariSample(configuration) {
  return {
    field: { id: configuration.fieldId,
      polynomialAscending: configuration.polynomialAscending },
    classGroup: { classNumber: configuration.expected.classGroup.classNumber,
      invariantFactorsSourceOrder:
        [...configuration.expected.classGroup.invariantFactors].reverse(),
      generatorCount: configuration.expected.classGroup.generatorCount },
    unitGroup: { rank: configuration.expected.unitGroup.rank,
      regulatorPresent: true,
      torsionOrder: configuration.expected.unitGroup.torsionOrder },
  };
}

async function runProbe(configuration, {
  corpusDirectory = "/scratch/sagejs-pari-fresh-prepared-corpus-v1",
  executeFresh = true,
} = {}) {
  validateConfiguration(configuration);
  const located = locatePrepared(configuration, path.resolve(corpusDirectory));
  const transaction = require(path.join(__dirname, configuration.transactionModule));
  const preparedMutationsRejected = rejectPreparedMutations(
    configuration, transaction, located.prepared);
  const boundary = inspectBoundary(configuration);
  let freshCorrectness = null;
  let sageProjection = null;
  if (executeFresh) {
    const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(),
      `sagejs-row${configuration.panelIndex}-phase6-blocker-`));
    try {
      const receipt = await transaction.runFreshPrepared(
        structuredClone(located.prepared), outputDirectory);
      assert.equal(receipt.preparedAuthoritySha256,
        configuration.preparedAuthoritySha256);
      assert.equal(receipt.correspondenceComplete, true);
      assert.equal(receipt.publicComplete, false);
      assert.equal(receipt.retainedRuntimeInputs, false);
      assert.equal(receipt.frozenW0RuntimeInput, false);
      sageProjection = projectionFromPayload(
        configuration, receipt.verifiedResult.detachedPayload());
      freshCorrectness = { authenticatedPreparedInput: true,
        correspondenceComplete: true, publicComplete: false,
        resultSha256: receipt.verifiedResult.sha256,
        projectionSha256: digest(sageProjection) };
      assert.equal(transaction.isAuthenticFreshReceipt({ ...receipt }), false,
        "copied receipt retained transaction-local authority");
    } finally {
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
  }
  const pariProjection = projectionFromPari(
    configuration, syntheticPariSample(configuration));
  if (sageProjection) assert.deepEqual(sageProjection, pariProjection);
  const changed = structuredClone(syntheticPariSample(configuration));
  changed.classGroup.classNumber = String(BigInt(changed.classGroup.classNumber) + 1n);
  assert.throws(() => projectionFromPari(configuration, changed),
    undefined, "changed PARI semantics passed the projection gate");
  return {
    schema: SCHEMA, panelIndex: configuration.panelIndex,
    fieldId: configuration.fieldId,
    prepared: { filename: path.basename(located.filename),
      fileSha256: configuration.preparedFileSha256,
      authoritySha256: configuration.preparedAuthoritySha256,
      mutationsRejected: preparedMutationsRejected },
    freshCorrectness,
    commonProjection: { schema: PROJECTION_SCHEMA, ready: true,
      sha256: digest(pariProjection), changedPariResultRejected: true },
    boundary,
    requestedBoundary: {
      input: "authenticated prepared nfinit state outside both clocks",
      sage: "one resident prepared-to-flag-zero mathematical kernel",
      pari: "pristine PARI 2.17.4 bnfinit0(nf,0)",
      output: "common class/unit semantic projection after both clocks",
    },
    admission: { sageResidentPreparedKernelReady: false,
      pariPreparedKernelSpecificationReady: true,
      commonSemanticProjectionReady: true, matchedTimingReady: false,
      qualifiedTiming: false, ratioPublished: false,
      reason: "the current Sage.js correctness transaction performs subprocess or filesystem publication work inside the only connected prepared-to-result path" },
  };
}

function createProbe(configuration) {
  validateConfiguration(configuration);
  return Object.freeze({ configuration,
    inspectBoundary: () => inspectBoundary(configuration),
    projectionFromPari: sample => projectionFromPari(configuration, sample),
    projectionFromPayload: payload => projectionFromPayload(configuration, payload),
    runProbe: options => runProbe(configuration, options),
    syntheticPariSample: () => syntheticPariSample(configuration) });
}

const row20 = createProbe({
  panelIndex: 20, fieldId: "5.1.1000000.1",
  polynomialAscending: ["-12", "-5", "0", "0", "0", "1"],
  preparedAuthoritySha256:
    "15ecf1209df2e48bd8a9e5ad75bc6dac0598d513bc6a06b7712ccfc255febbc6",
  preparedFileSha256:
    "20d659df1c66a5faf17fd84f142308ce559ea23c66cdc24a15ac77d9c99c4628",
  transactionModule: "row20_fresh_prepared_transaction.cjs",
  validatePrepared: (transaction, prepared) => transaction.validatePrepared(prepared),
  boundaryFiles: ["row20_fresh_prepared_pipeline.cjs",
    "row20_fresh_factor_base_coordinator.cjs",
    "row20_fresh_prepared_transaction.cjs"],
  requiredBlockers: [
    { id: "unit-and-closure-cpython-child",
      filename: "row20_fresh_prepared_pipeline.cjs", pattern: /spawnSync\("python3"/,
      effect: "unit reconstruction and C7 closure cross a CPython process boundary" },
    { id: "factor-owner-filesystem-publication",
      filename: "row20_fresh_factor_base_coordinator.cjs", pattern: /fs\.writeFileSync\(/,
      effect: "the factor base is published instead of retained in a resident handle" },
    { id: "source-hashing-inside-connected-path",
      filename: "row20_fresh_prepared_pipeline.cjs", pattern: /fs\.readFileSync\(/,
      effect: "source and generated-core files are read during connected result assembly" },
  ],
  expected: { classGroup: { classNumber: "1", invariantFactors: [], generatorCount: "0" },
    unitGroup: { rank: "2", regulatorPresent: true, torsionOrder: "2" } },
});

module.exports = { PROJECTION_SCHEMA, SCHEMA, createProbe, digest, row20 };

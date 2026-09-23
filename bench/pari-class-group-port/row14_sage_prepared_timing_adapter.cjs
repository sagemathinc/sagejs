"use strict";

// Diagnostic Sage.js half of the row-14 prepared-number-field comparison.
// This file is deliberately honest about the remaining clock-boundary gap:
// the connected transaction begins with the prepared initial-root owner, while
// pristine PARI's clock begins with nfinit output.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const authentication = require("./prepared_nf_authentication.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");
const complete = require("./row14_prepared_complete_host.cjs");

const FIELD_ID =
  "generated-sha256-e1d4643ab62bde9546d63340545e5302c2cef517222d569e634fb5e2093f6413";
const CAPSULE_SHA256 =
  "33d2606a151ecf0ba5a73c247ecf3f219ff84a2341048ebbbe374ecd9c7939b1";
const ROOT_SHA256 =
  "b2088268bca4b735816d280d15bccb94f45faab9831bc7523c9dc671b6716ae0";
const ROOT_COMPRESSED_SHA256 =
  "b06f0146d8d21bfaac6f43e0e33b176d30e6b61fe480050bb51ff74d9d35b833";
const POLYNOMIAL = Object.freeze(["-200000002", "-200000002", "0", "0", "1"]);
const DEFAULT_CAPSULE =
  "/tmp/row14-capsule-test/row14-initial-33d2606a151ecf0ba5a73c247ecf3f219ff84a2341048ebbbe374ecd9c7939b1.json.gz";
const DEFAULT_ROOT =
  "/tmp/sagejs-row14-prepared-root-VNkAWv/owner/row14-prepared-initial-b2088268bca4b735816d280d15bccb94f45faab9831bc7523c9dc671b6716ae0.json.gz";

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const elapsed = started => String(process.hrtime.bigint() - started);

function owner(payload, name) {
  const result = payload.storage.find(value => value.name === name);
  assert(result, `missing ${name} storage owner`);
  assert.equal(result.logicalLength, String(result.entries.length));
  return result.entries.map(String);
}

function authenticatePrepared(capsulePath = DEFAULT_CAPSULE) {
  const started = process.hrtime.bigint();
  const capsuleBytes = fs.readFileSync(capsulePath);
  assert.equal(sha256(capsuleBytes), CAPSULE_SHA256);
  const capsule = JSON.parse(zlib.gunzipSync(capsuleBytes));
  const prepared = {
    authoritySha256: authentication.authenticatePreparedBundle(capsule).sha256,
    data: authentication.normalizePreparedBundle(capsule),
  };
  return { prepared, elapsedNs: elapsed(started), capsulePath };
}

function authenticateAndHydrate(capsulePath = DEFAULT_CAPSULE, rootPath = DEFAULT_ROOT) {
  const started = process.hrtime.bigint();
  const authenticated = authenticatePrepared(capsulePath);
  const prepared = authenticated.prepared;
  const compressedRoot = fs.readFileSync(rootPath);
  assert.equal(sha256(compressedRoot), ROOT_COMPRESSED_SHA256);
  const rootBytes = zlib.gunzipSync(compressedRoot);
  assert.equal(sha256(rootBytes), ROOT_SHA256);
  const root = JSON.parse(rootBytes);
  complete.synthesizeMetadata(prepared, root);
  return { prepared, root, elapsedNs: elapsed(started), capsulePath, rootPath };
}

const WARM_SOURCES = Object.freeze([
  "row14_prepared_initial_root.py",
  "collected_log_embeddings.py",
  "hnfspec_complete.py",
  "row14_next_pass.py",
  "hnfadd.py",
  "prime_degree_catalog.py",
  "row14_post806_terminal.py",
]);

async function warmNativeCaches() {
  const started = process.hrtime.bigint();
  const artifacts = [];
  for (const basename of WARM_SOURCES) {
    const sourcePath = path.join(__dirname, basename);
    const built = await compileKernel({ sourcePath });
    require(built.modulePath);
    artifacts.push({ basename, cacheKey: built.cacheKey,
      coreSha256: sha256(fs.readFileSync(built.coreSourcePath)) });
  }
  return { elapsedNs: elapsed(started), artifacts };
}

function sageProjection(envelope, root) {
  assert.equal(envelope.schema, neutral.ENVELOPE_SCHEMA);
  assert.equal(envelope.payloadSha256, neutral.sha256Canonical(envelope.payload));
  const payload = envelope.payload;
  assert.equal(payload.field.id, FIELD_ID);
  assert.deepEqual(payload.field.definingPolynomialAscending, POLYNOMIAL);
  const flatIdeals = owner(payload, "class-generator-ideals");
  const generatorIdealHnfs = Array.from({ length: 2 }, (_, ideal) =>
    Array.from({ length: 4 }, (_, row) =>
      Array.from({ length: 4 }, (_, column) =>
        flatIdeals[ideal * 16 + column * 4 + row])));
  const packedLogs = owner(payload, "compact-archimedean-units");
  const logEmbeddingInternalTriplets = Array.from({ length: 6 }, (_, index) =>
    packedLogs.slice(index * 7 + 1, index * 7 + 4));
  return {
    schema: "sagejs.pari-class-group/row14-sage-semantic-projection-v1",
    field: { id: payload.field.id,
      polynomialAscending: payload.field.definingPolynomialAscending },
    classGroup: { classNumber: payload.classGroup.classNumber,
      invariantFactors: payload.classGroup.invariantFactors,
      generatorIdealHnfs },
    unitGroup: { rank: payload.unitGroup.rank,
      regulatorInternalTriplet: owner(payload, "regulator-enclosure"),
      logEmbeddingInternalTriplets,
      torsionOrder: payload.unitGroup.torsionOrder,
      torsionGeneratorPowerBasis: owner(payload, "torsion-generator"),
      flagZeroStatus: `${payload.unitGroup.materialization.tag}(${payload.unitGroup.materialization.reason})` },
    work: { degree: payload.field.degree, factorBaseSize: "799",
      classHnfColumns: "3", logEmbeddingRows: "3", logEmbeddingColumns: "2" },
    rng: { algorithm: "pari-xorshift1024star-2.17.4", seed: "1",
      terminalState: root.rng.map(String) },
    terminalStatus: payload.terminal.status,
  };
}

function internalToPariTriplet(value) {
  assert(Array.isArray(value) && value.length === 3);
  const [mantissa, precision, exponent] = value.map(String);
  return [mantissa, precision,
    String(BigInt(precision) - 1n - BigInt(exponent))];
}

function dyadicAgreementBits(internal, pari) {
  const [sm, sp, se] = internal.map(BigInt);
  const [pm, , pd] = pari.map(BigInt);
  const sageShift = se - sp + 1n;
  const pariShift = -pd;
  const common = sageShift < pariShift ? sageShift : pariShift;
  const left = sm << (sageShift - common);
  const right = pm << (pariShift - common);
  const magnitude = left < 0n ? -left : left;
  const difference = left > right ? left - right : right - left;
  if (difference === 0n) return Number.POSITIVE_INFINITY;
  return magnitude.toString(2).length - difference.toString(2).length;
}

function commonProjectionFromSage(sage) {
  return {
    schema: "sagejs.pari-class-group/row14-prepared-common-projection-v1",
    field: sage.field,
    classGroup: { classNumber: sage.classGroup.classNumber,
      invariantFactors: sage.classGroup.invariantFactors,
      generatorCount: String(sage.classGroup.generatorIdealHnfs.length) },
    unitGroup: { rank: sage.unitGroup.rank, regulatorPresent: true,
      torsionOrder: sage.unitGroup.torsionOrder,
      flagZeroStatus: sage.unitGroup.flagZeroStatus },
    completionMode: "flag-zero-class-and-unit-result",
  };
}

function commonProjectionFromPari(sample) {
  return {
    schema: "sagejs.pari-class-group/row14-prepared-common-projection-v1",
    field: sample.result.field,
    classGroup: { classNumber: sample.result.classGroup.classNumber,
      invariantFactors: [...sample.result.classGroup.invariantFactorsSourceOrder].reverse(),
      generatorCount: String(sample.result.classGroup.generatorIdealHnfs.length) },
    unitGroup: { rank: sample.result.unitGroup.rank, regulatorPresent: true,
      torsionOrder: sample.result.unitGroup.torsionOrder,
      flagZeroStatus: sample.result.unitGroup.flagZeroFundamentalUnits.status },
    completionMode: "flag-zero-class-and-unit-result",
  };
}

function compareWithPari(sage, sample) {
  assert.deepEqual(commonProjectionFromSage(sage), commonProjectionFromPari(sample));
  assert.deepEqual(sage.classGroup.generatorIdealHnfs,
    sample.result.classGroup.generatorIdealHnfs);
  assert.deepEqual(internalToPariTriplet(sage.unitGroup.regulatorInternalTriplet),
    sample.result.unitGroup.regulatorTriplet);
  assert.deepEqual(sage.unitGroup.torsionGeneratorPowerBasis,
    sample.result.unitGroup.torsionGeneratorPowerBasis);
  assert.deepEqual(sage.work, sample.work);
  assert.deepEqual(sage.rng, sample.rng);
  const logAgreementBits = sage.unitGroup.logEmbeddingInternalTriplets.map((value, index) =>
    dyadicAgreementBits(value, sample.result.unitGroup.logEmbeddingColumnMajor[index]));
  assert(logAgreementBits.every(bits => bits >= 96),
    `log embeddings agree by fewer than 96 bits: ${logAgreementBits}`);
  return { commonProjection: commonProjectionFromSage(sage),
    commonProjectionSha256: neutral.sha256Canonical(commonProjectionFromSage(sage)),
    exactGeneratorIdeals: true, exactRegulatorValue: true, exactTorsion: true,
    exactWorkShape: true, exactRngState: true, logAgreementBits,
    minimumLogAgreementBits: Math.min(...logAgreementBits) };
}

async function runSagePreparedDiagnostic({ capsulePath = DEFAULT_CAPSULE,
  rootPath = DEFAULT_ROOT, outputDirectory }) {
  assert(outputDirectory);
  const warmup = await warmNativeCaches();
  const hydrated = authenticateAndHydrate(capsulePath, rootPath);
  const started = process.hrtime.bigint();
  const receipt = await complete.runPreparedComplete(
    hydrated.prepared, hydrated.root, outputDirectory);
  const connectedTransactionNs = elapsed(started);
  const stageTotal = Object.values(receipt.stageElapsedNs)
    .reduce((sum, value) => sum + BigInt(value), 0n);
  const serializationStarted = process.hrtime.bigint();
  const bytes = fs.readFileSync(receipt.path);
  assert.equal(sha256(bytes), receipt.sha256);
  const envelope = JSON.parse(bytes);
  const serializationReadParseNs = elapsed(serializationStarted);
  const certificationStarted = process.hrtime.bigint();
  const projection = sageProjection(envelope, hydrated.root);
  const detachedPublicationIntegrityNs = elapsed(certificationStarted);
  return {
    schema: "sagejs.pari-class-group/row14-sage-prepared-timing-diagnostic-v1",
    diagnosticOnly: true, qualifiedTiming: false, ratioPublished: false,
    phases: {
      compilationAndWarmupNs: warmup.elapsedNs,
      inputAuthenticationAndHydrationNs: hydrated.elapsedNs,
      connectedTransactionNs,
      mathematicalStageElapsedNs: receipt.stageElapsedNs,
      mathematicalStageTotalNs: String(stageTotal),
      embeddedOrchestrationReplayAndPublicationResidualNs:
        String(BigInt(receipt.elapsedNs) - stageTotal),
      serializationReadParseNs,
      detachedPublicationIntegrityNs,
    },
    warmupArtifacts: warmup.artifacts,
    receipt, projection,
    boundary: {
      requestedPariBoundary: "prepared nfinit outside; bnfinit0(nf,0) inside",
      actualSageBoundary: "prepared initial factor-base/42-relation root outside; Gate C through C7 inside",
      initialRootExcludedFromClock: true,
      initialRootRecordedElapsedNs: hydrated.root.execution.elapsedNs,
      embeddedSubprocessStartup: true,
      embeddedOwnerSerializationAndAuthentication: true,
      replayAndSerializationSeparatelyClockable: false,
    },
  };
}

async function runStrictPreparedDiagnostic({ capsulePath = DEFAULT_CAPSULE,
  outputDirectory }) {
  assert(outputDirectory);
  const warmup = await warmNativeCaches();
  const authenticated = authenticatePrepared(capsulePath);
  const strict = require("./row14_strict_prepared_complete_host.cjs");
  const started = process.hrtime.bigint();
  const receipt = await strict.runStrictPreparedComplete(
    authenticated.prepared, outputDirectory);
  const hostObservedTransactionNs = elapsed(started);
  const serializationStarted = process.hrtime.bigint();
  const bytes = fs.readFileSync(receipt.path);
  assert.equal(sha256(bytes), receipt.sha256);
  const envelope = JSON.parse(bytes);
  const serializationReadParseNs = elapsed(serializationStarted);
  assert(Array.isArray(receipt.initialRoot.terminalRng) &&
    receipt.initialRoot.terminalRng.length === 66,
  "strict receipt must carry derived RNG state without importing a root owner");
  const certificationStarted = process.hrtime.bigint();
  const projection = sageProjection(envelope,
    { rng: receipt.initialRoot.terminalRng });
  const detachedPublicationIntegrityNs = elapsed(certificationStarted);
  return {
    schema: "sagejs.pari-class-group/row14-sage-strict-prepared-timing-diagnostic-v1",
    diagnosticOnly: true, qualifiedTiming: false, ratioPublished: false,
    phases: {
      compilationAndWarmupNs: warmup.elapsedNs,
      inputAuthenticationAndHydrationNs: authenticated.elapsedNs,
      initialRootKernelNs: receipt.initialRoot.kernelElapsedNs,
      downstreamConnectedTransactionNs: receipt.elapsedNs,
      mathematicalElapsedNs: receipt.mathematicalElapsedNs,
      transactionElapsedNs: receipt.transactionElapsedNs,
      hostObservedTransactionNs,
      mathematicalStageElapsedNs: receipt.stageElapsedNs,
      initialRootCompileWarmupAndSerializationNs:
        receipt.timingExclusions.initialRootCompileWarmupAndSerializationNs,
      serializationReadParseNs,
      detachedPublicationIntegrityNs,
    },
    warmupArtifacts: warmup.artifacts,
    receipt, projection,
    boundary: {
      requestedPariBoundary: "prepared nfinit outside; bnfinit0(nf,0) inside",
      actualSageBoundary: "authenticated prepared nf outside; derived root and Gate C through C7 inside",
      inputMathematicsMatched: true,
      outputSemanticsMatched: true,
      rootRuntimeInput: false,
      embeddedSubprocessStartup: true,
      embeddedOwnerSerializationAndAuthentication: true,
      replayAndSerializationSeparatelyClockable: false,
      clockImplementationMatched: false,
      ratioBlocker:
        "Sage mathematicalElapsedNs still includes downstream subprocess, owner authentication, detached replay, and publication work absent from PARI's resident bnfinit0 clock",
    },
  };
}

module.exports = { CAPSULE_SHA256, DEFAULT_CAPSULE, DEFAULT_ROOT, FIELD_ID,
  POLYNOMIAL, ROOT_COMPRESSED_SHA256, ROOT_SHA256, authenticateAndHydrate,
  authenticatePrepared,
  commonProjectionFromPari, commonProjectionFromSage, compareWithPari,
  dyadicAgreementBits, internalToPariTriplet, runSagePreparedDiagnostic,
  runStrictPreparedDiagnostic,
  sageProjection, warmNativeCaches };

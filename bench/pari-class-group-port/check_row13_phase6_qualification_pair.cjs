#!/usr/bin/env node
"use strict";

// Unqualified repeated-fresh protocol smoke only. This does not enable the
// registry, run a qualification campaign, approve a host, or open reserves.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const core = require("./qualification_execution_core.cjs");
const fresh = require("./row13_phase6_fresh_adapter.cjs");
const sage = require("./row13_phase6_sage_prepared_adapter.cjs");
const mutations = require("./check_row13_phase6_evidence_mutations.cjs");

const canonical = value => Buffer.from(`${JSON.stringify(value)}\n`);
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const REPOSITORY_ROOT = path.resolve(__dirname, "../..");
const NATIVE_PYTHON_SOURCES = Object.freeze([
  "row13_prepared_initial_root.py", "collected_log_embeddings.py",
  "hnfspec_complete.py", "row14_next_pass.py", "hnfadd.py",
  "prime_degree_catalog.py", "row14_post806_terminal.py",
  "row13_phase6_transform_auth.py", "unit_lattice_selection.py",
  "unit_lattice_reduction.py", "log_matrix_transform.py",
  "field3_mixed_unit_suffix.py", "getfu_mixed_quartic.py",
]);
// This is the explicit input list used by compiler.cjs:backendFingerprint().
// Requiring compiler.cjs alone is insufficient because several of these files
// are read as data rather than loaded through CommonJS.
const COMPILER_FINGERPRINT_FILES = Object.freeze([
  "../../tools/native-kernel/compiler.cjs",
  "../../tools/native-kernel/ir.cjs",
  "../../tools/native-kernel/native-imports.cjs",
  "../../tools/native-kernel/integer-ir.cjs",
  "../../tools/native-kernel/integer-constants.cjs",
  "../../tools/native-kernel/workspace-bundles.cjs",
  "../../tools/native-kernel/float64-ir.cjs",
  "../../tools/native-kernel/exact-analysis.cjs",
  "../../tools/native-kernel/prime-field-ir.cjs",
  "../../tools/native-kernel/prime-field-backend.cjs",
  "../../tools/native-kernel/prime-source-ir.cjs",
  "../../tools/native-kernel/prime-source-optimize.cjs",
  "../../tools/native-kernel/prime-source-backend.cjs",
  "../../tools/native-kernel/uint64-operations.cjs",
  "../../tools/native-kernel/int64-operations.cjs",
  "../../tools/native-kernel/checked-bounds-proofs.cjs",
  "../../tools/native-kernel/checked-regions.cjs",
  "../../tools/native-kernel/provenance.cjs",
  "../../tools/native-kernel/word-backend.cjs",
  "../../tools/native-kernel/tagged-backend.cjs",
  "../../tools/native-kernel/fmpz-backend.cjs",
  "../../tools/native-kernel/core-abi.cjs",
  "../../tools/native-kernel/exact-runtime.cjs",
  "../../tools/native-kernel/gmp-checkpoint-allocator.cjs",
  "../../tools/native-kernel/fmpz-runtime.cjs",
  "../../tools/native-kernel/c-backend.cjs",
  "../../tools/native-kernel/js-backend.cjs",
  "../../tools/native-kernel/ffi-codegen.cjs",
  "../../dist/tools/python/compiler-frontend.js",
  "../../packages/flint/include/sagejs/native.h",
  "../../ffi/abi-types.json", "../../ffi/fflas.ffi.json",
  "../../ffi/flint.ffi.json", "../../ffi/igraph.ffi.json",
  "../../ffi/m4ri.ffi.json",
]);
const SAGE_DEPENDENCY_FILES = Object.freeze([
  "row13_phase6_resident_kernel_host.cjs", "row13_prepared_gate_c_host.cjs",
  "row13_prepared_initial_owner.cjs", "row13_terminal_transaction_host.cjs",
  "row13_post1006_terminal_host.cjs", "row14_matched_kernel_clock_host.cjs",
  "relation_column_ancestry.cjs", "prepared_nf_authentication.cjs",
  ...NATIVE_PYTHON_SOURCES,
]);
const NATIVE_ARTIFACT_KEYS = Object.freeze([
  "addonPath", "coreHeaderPath", "coreSourcePath", "manifestPath",
  "modulePath", "outputPath",
]);
const EXPECTED_DIGESTS = Object.freeze({
  outputDigest: "8e19ad2519c8afc9a34b795089a4c2dda918d968865baa521d3e1c3723a2b931",
  replayDigest: "188a3bbef70bba602ce0d1eb7b01a2d875d81e6072f149ec722b3ef1321248e0",
  rngDigest: "a235dfcd2785193fc8fdddac85ce1b5736ad99ec34285aad1dd7239c5b71793c",
  workDigest: "8fc2eb54bd589ab1ca643cb0616a5c8dfb4cbb98f44509563381ce6b829479b3",
});
const REPORT_KEYS = Object.freeze([
  "campaignExecuted", "counterInterpretation", "exactLeanProjectionParity",
  "executionEnabled", "externalResourceSidecarBound", "fieldId",
  "matchedSeedAuthority", "mutationReceipt", "note", "pari",
  "pariCpuInterpretation", "pariFreshTerminalRngDeterministic",
  "projectionSchema", "qualifiedTiming", "reserveOpeningEnabled",
  "reservesOpened", "rssInterpretation", "runIdentity", "sagejs", "schema",
  "semanticReplayParity", "semanticScope", "sourceAuthority",
  "terminalRngCrossArmMaterialized", "timingInterpretation",
  "workCountersExactWithinArm",
]);
const ARM_KEYS = Object.freeze(["batch", "observations", "provenance"]);
const BATCH_KEYS = Object.freeze([
  "counters", "outputDigest", "peakRssKiB", "repetitions",
  "replayDigest", "resourceCounters", "rngDigest", "stageTiming",
  "threadCpuNanoseconds", "wallNanoseconds", "workDigest",
]);
const STAGE_LEAVES = Object.freeze([
  "honestyGeneratorsFinal", "relationRetry", "sparseHnfSnfTransform",
  "unitRegulator",
]);
const SAGE_OBSERVATION_KEYS = Object.freeze([
  "nativeMathematicalCalls", "preparedAuthoritySha256",
  "processLifetimeHighWaterMarkKiB", "projectionSha256",
  "replayEvidenceSource",
]);
const PARI_OBSERVATION_KEYS = Object.freeze([
  "helperProcessCpuNanoseconds", "nativeMathematicalCalls",
  "preparationNanoseconds", "processLifetimeHighWaterMarkKiB",
  "replayEvidenceSource", "terminalRngSha256",
]);
const EXPECTED_PARI_TERMINAL_RNG_SHA256 =
  "0b3152ce232edeaff020211333672601076d7bb4dbfaa7b9567e3452842dc0db";
const SOURCE_FILES = ["check_row13_phase6_qualification_pair.cjs",
  "finalize_row13_phase6_evidence.cjs",
  "prewarm_row13_phase6_pari_helper.cjs",
  "check_row13_phase6_evidence_mutations.cjs",
  "row13_phase6_fresh_adapter.cjs", "row13_phase6_sage_prepared_adapter.cjs",
  "qualification_execution_core.cjs", "generic_phase6_pari_prepared_adapter.cjs",
  "generic_phase6_pari_prepared_adapter.c",
  "row13_phase6_resident_kernel_host.cjs", "row13_prepared_gate_c_host.cjs",
  "row13_prepared_initial_owner.cjs", "row13_post1006_terminal_host.cjs",
  "row13_terminal_transaction_host.cjs", "relation_column_ancestry.cjs",
  "prepared_nf_authentication.cjs", "row14_matched_kernel_clock_host.cjs",
  ...NATIVE_PYTHON_SOURCES, ...COMPILER_FINGERPRINT_FILES];

function dependencyName(filename) {
  return path.relative(__dirname, filename).replaceAll(path.sep, "/");
}

function resolveLocalDependency(filename, request) {
  // Runtime-selected compiled addons are outputs, not compiler source inputs;
  // their concrete files are authenticated separately by nativeAuthority.
  if (request.endsWith(".node")) return null;
  const resolved = require.resolve(path.resolve(path.dirname(filename), request));
  assert(resolved === REPOSITORY_ROOT || resolved.startsWith(`${REPOSITORY_ROOT}${path.sep}`),
    `source dependency escaped repository: ${request}`);
  return dependencyName(resolved);
}

function dependencyClosure(seeds = SOURCE_FILES) {
  const pending = [...seeds], seen = new Set();
  while (pending.length) {
    const name = pending.pop();
    if (seen.has(name)) continue;
    const filename = path.join(__dirname, name);
    assert(fs.existsSync(filename), `missing source-authority dependency ${name}`);
    seen.add(name);
    if (!/\.(?:c?js|mjs)$/.test(name)) continue;
    const source = fs.readFileSync(filename, "utf8");
    for (const match of source.matchAll(/require\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g)) {
      const child = resolveLocalDependency(filename, match[1]);
      if (child !== null) pending.push(child);
    }
  }
  return [...seen].sort();
}

function sourceAuthority() {
  const files = dependencyClosure().map(name => ({ name,
    sha256: sha256(fs.readFileSync(path.join(__dirname, name))) }));
  return { files, sha256: sha256(canonical(files)) };
}

function validateSourceAuthority(authority) {
  assert.deepEqual(authority, sourceAuthority(),
    "row-13 source authority changed");
  return authority;
}

function validateNativeAuthority(provenance, sourceFiles) {
  assert(Array.isArray(provenance?.nativeAuthority));
  assert.equal(provenance.nativeAuthority.length, NATIVE_PYTHON_SOURCES.length);
  const keys = new Set(), manifestSources = new Set();
  for (const node of provenance.nativeAuthority) {
    assert.deepEqual(Object.keys(node).sort(),
      ["artifacts", "cacheKey", "label", "moduleIdentity"]);
    assert.match(node.cacheKey, /^[0-9a-f]{64}$/);
    assert(!keys.has(node.cacheKey), `duplicate native cache key ${node.cacheKey}`);
    keys.add(node.cacheKey);
    assert(node.artifacts && typeof node.artifacts === "object");
    assert.deepEqual(Object.keys(node.artifacts).sort(), NATIVE_ARTIFACT_KEYS,
      `native node ${node.label} has incomplete artifact authority`);
    for (const artifact of Object.values(node.artifacts)) {
      assert.deepEqual(Object.keys(artifact).sort(), artifact.type === "file"
        ? ["path", "sha256", "type"] : ["path", "type"]);
      sage.validateArtifactAuthority(artifact);
    }
    const manifestArtifact = node.artifacts.manifestPath;
    assert.equal(manifestArtifact?.type, "file", "native node lacks manifest authority");
    const manifest = JSON.parse(fs.readFileSync(manifestArtifact.path, "utf8"));
    assert.equal(manifest.cacheKey, node.cacheKey);
    assert.equal(manifest.moduleIdentity, node.moduleIdentity);
    const sourceName = path.basename(manifest.sourcePath);
    assert(NATIVE_PYTHON_SOURCES.includes(sourceName),
      `unexpected native source ${manifest.sourcePath}`);
    assert(!manifestSources.has(sourceName), `duplicate native source ${sourceName}`);
    assert.equal(manifest.sourcePath, path.join(__dirname, sourceName),
      `native manifest source path changed for ${sourceName}`);
    manifestSources.add(sourceName);
    const sourceRecord = sourceFiles.get(sourceName);
    assert(sourceRecord, `native source ${sourceName} absent from source authority`);
    assert.equal(manifest.sourceHash, sourceRecord.sha256,
      `manifest source hash changed for ${sourceName}`);
  }
  assert.deepEqual([...manifestSources].sort(), [...NATIVE_PYTHON_SOURCES].sort());
  return provenance;
}

function validateReportProvenance(report) {
  validateSourceAuthority(report.sourceAuthority);
  const sourceFiles = new Map(report.sourceAuthority.files.map(record =>
    [path.basename(record.name), record]));
  for (const name of NATIVE_PYTHON_SOURCES)
    assert(sourceFiles.has(name), `source authority omitted ${name}`);
  for (const name of COMPILER_FINGERPRINT_FILES)
    assert(report.sourceAuthority.files.some(record => record.name === name),
      `source authority omitted compiler input ${name}`);
  assert.deepEqual(Object.keys(report.sagejs.provenance).sort(), [
    "dependencies", "nativeAuthority", "preparedAuthoritySha256",
    "preparedRootSourceSha256", "residentHostSha256", "rootNativeCacheKey",
  ]);
  assert.equal(report.sagejs.provenance.preparedAuthoritySha256,
    sage.PREPARED_AUTHORITY_SHA256);
  assert.equal(report.sagejs.provenance.residentHostSha256,
    sourceFiles.get("row13_phase6_resident_kernel_host.cjs").sha256);
  assert.equal(report.sagejs.provenance.preparedRootSourceSha256,
    sourceFiles.get("row13_prepared_initial_root.py").sha256);
  validateNativeAuthority(report.sagejs.provenance, sourceFiles);
  assert.equal(report.sagejs.provenance.rootNativeCacheKey,
    report.sagejs.provenance.nativeAuthority.find(node =>
      node.label === "initial").cacheKey);
  assert.deepEqual(report.sagejs.provenance.dependencies.map(record => record.name),
    SAGE_DEPENDENCY_FILES);
  const dependencyHashes = new Map(report.sagejs.provenance.dependencies.map(record =>
    [record.name, record.sha256]));
  assert.equal(dependencyHashes.size, SAGE_DEPENDENCY_FILES.length);
  for (const name of SAGE_DEPENDENCY_FILES)
    assert.equal(dependencyHashes.get(name), sourceFiles.get(name).sha256,
      `resident dependency authority changed for ${name}`);
  assert.deepEqual(Object.keys(report.pari.provenance).sort(), [
    "archiveSha256", "buch2Sha256", "compiler", "compilerArguments",
    "executableAuthority", "executableSha256", "libraryAuthority",
    "librarySha256", "pariVersion", "prebuiltManifestAuthority", "sourceSha256",
  ]);
  assert.deepEqual(report.pari.provenance.pariVersion, ["2", "17", "4"]);
  assert.equal(report.pari.provenance.archiveSha256,
    "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53");
  assert.equal(report.pari.provenance.buch2Sha256,
    "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac");
  assert.equal(report.pari.provenance.librarySha256,
    "fdc8f2d7ff050c8e8c6cb8994b0f9dc971267ac763eaf5cd927454937d37357f");
  assert.deepEqual(Object.keys(report.pari.provenance.libraryAuthority).sort(),
    ["path", "sha256", "type"]);
  assert.equal(report.pari.provenance.libraryAuthority.type, "file");
  sage.validateArtifactAuthority(report.pari.provenance.libraryAuthority);
  assert.equal(report.pari.provenance.librarySha256,
    report.pari.provenance.libraryAuthority.sha256);
  assert.equal(report.pari.provenance.sourceSha256,
    sourceFiles.get("generic_phase6_pari_prepared_adapter.c").sha256);
  assert.deepEqual(Object.keys(report.pari.provenance.executableAuthority).sort(),
    ["path", "sha256", "type"]);
  assert.equal(report.pari.provenance.executableAuthority.type, "file");
  sage.validateArtifactAuthority(report.pari.provenance.executableAuthority);
  assert.equal(report.pari.provenance.executableSha256,
    report.pari.provenance.executableAuthority.sha256);
  assert.equal(report.pari.provenance.prebuiltManifestAuthority.type, "file");
  sage.validateArtifactAuthority(report.pari.provenance.prebuiltManifestAuthority);
  const prebuiltManifest = JSON.parse(fs.readFileSync(
    report.pari.provenance.prebuiltManifestAuthority.path, "utf8"));
  const buildProvenance = { ...report.pari.provenance };
  delete buildProvenance.executableAuthority;
  delete buildProvenance.libraryAuthority;
  delete buildProvenance.prebuiltManifestAuthority;
  fresh.validatePrebuiltManifest(prebuiltManifest,
    report.pari.provenance.executableAuthority.path);
  assert.deepEqual(prebuiltManifest.executableAuthority,
    report.pari.provenance.executableAuthority);
  assert.deepEqual(prebuiltManifest.libraryAuthority,
    report.pari.provenance.libraryAuthority);
  assert.deepEqual(prebuiltManifest.buildProvenance, buildProvenance);
  assert(path.isAbsolute(report.pari.provenance.compiler));
  assert(Array.isArray(report.pari.provenance.compilerArguments));
  return report;
}

function canonicalUnsigned(value, label, { positive = false } = {}) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.match(value, /^(0|[1-9][0-9]*)$/, `${label} is not canonical`);
  const result = BigInt(value);
  if (positive) assert(result > 0n, `${label} must be positive`);
  return result;
}

function validateStageTiming(stage, wall, label) {
  assert.deepEqual(Object.keys(stage).sort(),
    ["inclusiveNanoseconds", "leaves", "unattributedNanoseconds"]);
  assert.deepEqual(Object.keys(stage.leaves).sort(), STAGE_LEAVES);
  const inclusive = canonicalUnsigned(stage.inclusiveNanoseconds,
    `${label} stage inclusive`, { positive: true });
  assert.equal(inclusive, wall, `${label} stage inclusive differs from wall`);
  const leaves = STAGE_LEAVES.map(name => canonicalUnsigned(stage.leaves[name],
    `${label} stage ${name}`));
  const unattributed = canonicalUnsigned(stage.unattributedNanoseconds,
    `${label} stage unattributed`);
  assert.equal(leaves.reduce((sum, value) => sum + value, 0n) + unattributed,
    inclusive, `${label} stage clock does not conserve time`);
  assert(leaves.every(value => value === 0n),
    `${label} unavailable leaf clocks must remain zero`);
  return stage;
}

function validateBatch(batch, implementation) {
  assert.deepEqual(Object.keys(batch).sort(), BATCH_KEYS);
  assert.equal(batch.repetitions, 2);
  const wall = canonicalUnsigned(batch.wallNanoseconds,
    `${implementation} wall`, { positive: true });
  const peak = canonicalUnsigned(batch.peakRssKiB,
    `${implementation} peak RSS`, { positive: true });
  if (implementation === "sagejs")
    canonicalUnsigned(batch.threadCpuNanoseconds, "Sage thread CPU", { positive: true });
  else assert.equal(batch.threadCpuNanoseconds, null,
    "PARI batch thread CPU is unavailable; helper observations carry process CPU");
  assert.deepEqual(batch.counters, {
    classNumber: "2", degree: "4", relationColumns: "1006",
    relationRows: "999", unitRank: "2",
  });
  for (const [name, value] of Object.entries(batch.counters))
    canonicalUnsigned(value, `${implementation} counter ${name}`);
  for (const [name, value] of Object.entries(batch.resourceCounters))
    canonicalUnsigned(value, `${implementation} resource ${name}`);
  validateStageTiming(batch.stageTiming, wall, implementation);
  return { wall, peak };
}

function validateObservations(report, sageBatch, pariBatch) {
  const sageRss = report.sagejs.observations.map((value, index) => {
    assert.deepEqual(Object.keys(value).sort(), SAGE_OBSERVATION_KEYS);
    assert.equal(value.preparedAuthoritySha256, sage.PREPARED_AUTHORITY_SHA256);
    assert.equal(value.projectionSha256, EXPECTED_DIGESTS.outputDigest);
    assert.equal(value.replayEvidenceSource,
      "independently-reconstructed-mathematical-owners");
    assert.equal(value.nativeMathematicalCalls, "43");
    return canonicalUnsigned(value.processLifetimeHighWaterMarkKiB,
      `Sage observation ${index} RSS`, { positive: true });
  });
  const pariRss = report.pari.observations.map((value, index) => {
    assert.deepEqual(Object.keys(value).sort(), PARI_OBSERVATION_KEYS);
    canonicalUnsigned(value.preparationNanoseconds,
      `PARI observation ${index} preparation`, { positive: true });
    canonicalUnsigned(value.helperProcessCpuNanoseconds,
      `PARI observation ${index} helper CPU`, { positive: true });
    assert.equal(value.terminalRngSha256, EXPECTED_PARI_TERMINAL_RNG_SHA256);
    assert.equal(value.replayEvidenceSource, "independent-pari-bnf-getters");
    assert.equal(value.nativeMathematicalCalls, "1");
    return canonicalUnsigned(value.processLifetimeHighWaterMarkKiB,
      `PARI observation ${index} RSS`, { positive: true });
  });
  assert.equal(sageBatch.peak, sageRss.reduce((a, b) => a > b ? a : b));
  assert.equal(pariBatch.peak, pariRss.reduce((a, b) => a > b ? a : b));
}

function validateReportCore(report) {
  assert.deepEqual(Object.keys(report).sort(), REPORT_KEYS);
  assert.equal(report.schema,
    "sagejs.pari-class-group/row13-phase6-unqualified-fresh-protocol-v1");
  assert.match(report.runIdentity, /^[A-Za-z0-9][A-Za-z0-9._-]{15,127}$/);
  for (const key of ["qualifiedTiming", "campaignExecuted", "executionEnabled",
    "reserveOpeningEnabled", "reservesOpened", "externalResourceSidecarBound"])
    assert.equal(report[key], false, `unsafe row-13 report flag ${key}`);
  assert.equal(report.fieldId, sage.FIELD_ID);
  assert.equal(report.projectionSchema, sage.PROJECTION_SCHEMA);
  assert.deepEqual(report.semanticScope, sage.SEMANTIC_SCOPE);
  assert.equal(report.exactLeanProjectionParity, true);
  assert.equal(report.semanticReplayParity, true);
  assert.equal(report.matchedSeedAuthority, true);
  assert.equal(report.terminalRngCrossArmMaterialized, false);
  assert.equal(report.pariFreshTerminalRngDeterministic, true);
  assert.equal(report.workCountersExactWithinArm, true);
  for (const arm of [report.sagejs, report.pari]) {
    assert.deepEqual(Object.keys(arm).sort(), ARM_KEYS);
    assert.equal(arm.batch.repetitions, 2);
    for (const [name, expected] of Object.entries(EXPECTED_DIGESTS))
      assert.equal(arm.batch[name], expected, `row-13 ${name} authority changed`);
  }
  assert.deepEqual(report.mutationReceipt.reportMutations,
    mutations.REPORT_MUTATIONS);
  assert.equal(report.sagejs.observations.length, 2);
  assert.equal(report.pari.observations.length, 2);
  assert(report.sagejs.observations.every(value =>
    value.nativeMathematicalCalls === "43"));
  assert(report.pari.observations.every(value =>
    value.nativeMathematicalCalls === "1"));
  assert.deepEqual(report.sagejs.batch.resourceCounters,
    { mathematicalCalls: "86", nativeHandleCount: "36" });
  assert.deepEqual(report.pari.batch.resourceCounters,
    { mathematicalCalls: "2", nativeHandleCount: "0" });
  const sageBatch = validateBatch(report.sagejs.batch, "sagejs");
  const pariBatch = validateBatch(report.pari.batch, "pari");
  validateObservations(report, sageBatch, pariBatch);
  validateReportProvenance(report);
  return report;
}

async function main() {
  const runIdentity = process.env.ROW13_EVIDENCE_RUN_ID;
  assert.match(runIdentity || "", /^[A-Za-z0-9][A-Za-z0-9._-]{15,127}$/,
    "ROW13_EVIDENCE_RUN_ID must be shared with the external resource sampler");
  const output = process.argv[2] ||
    "/scratch/row13-phase6-unqualified-fresh-protocol-v1.json";
  // Fail before the expensive Sage arm if the independently prewarmed helper
  // is missing or changed. This performs no compilation and has no fallback.
  fresh.loadPrebuiltPariHelper();
  const adapters = {};
  const batches = {};
  for (const implementation of ["sagejs", "pari"]) {
    const adapter = await fresh.createRow13FreshPreparedAdapter(
      { panelIndex: 13, implementation });
    adapters[implementation] = adapter;
    batches[implementation] = await core.executeFreshBatch(adapter, {
      boundary: "prepared-kernel", fieldId: sage.FIELD_ID,
      repetitions: 2, seed: "1", tier: "diagnostic",
    });
  }
  for (const digest of ["outputDigest", "replayDigest", "rngDigest",
    "workDigest"])
    assert.equal(batches.sagejs[digest], batches.pari[digest],
      `row 13 differs in ${digest}`);
  assert.equal(adapters.sagejs.observations.length, 2);
  assert(adapters.sagejs.observations.every(value =>
    value.preparedAuthoritySha256 === sage.PREPARED_AUTHORITY_SHA256));
  assert.equal(adapters.sagejs.observations[0].projectionSha256,
    adapters.sagejs.observations[1].projectionSha256);
  assert(adapters.sagejs.observations.every(value =>
    value.nativeMathematicalCalls === "43"));
  assert.equal(adapters.pari.observations.length, 2);
  assert.equal(adapters.pari.observations[0].terminalRngSha256,
    adapters.pari.observations[1].terminalRngSha256,
    "fresh pristine PARI helpers changed terminal RNG state");
  assert(adapters.pari.observations.every(value =>
    value.nativeMathematicalCalls === "1"));

  const mutationReceipt = { ...mutations.runMutations({ sourceAuthority,
    validateSourceAuthority }), reportMutations: mutations.REPORT_MUTATIONS };
  const report = {
    schema: "sagejs.pari-class-group/row13-phase6-unqualified-fresh-protocol-v1",
    qualifiedTiming: false, campaignExecuted: false, executionEnabled: false,
    reserveOpeningEnabled: false, reservesOpened: false,
    runIdentity, fieldId: sage.FIELD_ID, projectionSchema: sage.PROJECTION_SCHEMA,
    exactLeanProjectionParity: true, semanticReplayParity: true,
    matchedSeedAuthority: true, terminalRngCrossArmMaterialized: false,
    pariFreshTerminalRngDeterministic: true,
    workCountersExactWithinArm: true,
    counterInterpretation: "core work-digest fields are normalized semantic metadata; " +
      "actual native invocation counts are separate resource counters and are not cross-arm equal",
    semanticScope: sage.SEMANTIC_SCOPE,
    timingInterpretation: "inclusive kernel clock; leaf attribution unavailable; unattributed equals inclusive",
    rssInterpretation: "process-lifetime high-water mark, not interval RSS",
    pariCpuInterpretation: "helper-process CPU interval beginning immediately before bnfinit " +
      "and ending after immediate BNF getter/shape reads; not exact bnfinit-only CPU",
    sourceAuthority: sourceAuthority(),
    mutationReceipt,
    externalResourceSidecarBound: false,
    sagejs: { batch: batches.sagejs,
      provenance: adapters.sagejs.provenance,
      observations: adapters.sagejs.observations },
    pari: { batch: batches.pari, provenance: adapters.pari.provenance,
      observations: adapters.pari.observations },
    note: "Development-host diagnostic clocks are protocol evidence only and are not qualification timings.",
  };
  validateReportCore(report);
  assert.deepEqual(mutations.runReportMutations(report, validateReportCore),
    mutations.REPORT_MUTATIONS);
  for (const mutate of [
    value => { value.fieldId = "wrong"; },
    value => { value.sagejs.batch.outputDigest = "0".repeat(64); },
    value => { value.pari.batch.replayDigest = "0".repeat(64); },
    value => { value.sourceAuthority.files[0].sha256 = "0".repeat(64); },
  ]) {
    const changed = structuredClone(report); mutate(changed);
    assert.throws(() => validateReportCore(changed));
  }
  const bytes = canonical(report);
  fs.writeFileSync(output, bytes, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ output, sha256: sha256(bytes),
    exactLeanProjectionParity: true, qualifiedTiming: false })}\n`);
}

module.exports = { COMPILER_FINGERPRINT_FILES, EXPECTED_DIGESTS,
  EXPECTED_PARI_TERMINAL_RNG_SHA256, NATIVE_ARTIFACT_KEYS,
  NATIVE_PYTHON_SOURCES, REPORT_KEYS,
  SAGE_DEPENDENCY_FILES, SOURCE_FILES, dependencyClosure, main, sourceAuthority,
  validateBatch, validateNativeAuthority, validateObservations,
  validateReportCore, validateReportProvenance, validateSourceAuthority,
  validateStageTiming };

if (require.main === module)
  main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });

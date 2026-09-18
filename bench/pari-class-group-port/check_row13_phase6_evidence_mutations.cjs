#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const authentication = require("./prepared_nf_authentication.cjs");
const finalizer = require("./finalize_row13_phase6_evidence.cjs");
const fresh = require("./row13_phase6_fresh_adapter.cjs");
const sage = require("./row13_phase6_sage_prepared_adapter.cjs");
const coordinates = require("./check_row13_live_terminal_coordinates.cjs");

const REPORT_MUTATIONS = Object.freeze([
  "result", "replay", "counter", "source-provenance", "native-artifact-hash",
  "pari-executable-hash", "pari-library-hash",
  "both-arm-digest", "artifact-deletion", "wrong-schema",
  "wall", "stage", "rss", "helper-cpu", "observation-deletion",
  "safety-flags",
]);

const rejects = (fn, label) => assert.throws(fn, undefined, label);
function runMutations({ sourceAuthority, validateSourceAuthority }) {
  assert(!fresh.createRow13FreshPreparedAdapter.toString().includes("pari.buildHelper("),
    "row-13 pair adapter must not retain a compiler fallback");
  const savedExecutable = process.env.ROW13_PHASE6_PARI_HELPER;
  const savedManifest = process.env.ROW13_PHASE6_PARI_HELPER_MANIFEST;
  delete process.env.ROW13_PHASE6_PARI_HELPER;
  delete process.env.ROW13_PHASE6_PARI_HELPER_MANIFEST;
  rejects(() => fresh.loadPrebuiltPariHelper(),
    "row-13 pair must fail closed without a prebuilt helper");
  if (savedExecutable === undefined) delete process.env.ROW13_PHASE6_PARI_HELPER;
  else process.env.ROW13_PHASE6_PARI_HELPER = savedExecutable;
  if (savedManifest === undefined)
    delete process.env.ROW13_PHASE6_PARI_HELPER_MANIFEST;
  else process.env.ROW13_PHASE6_PARI_HELPER_MANIFEST = savedManifest;
  const projection = { schema: sage.PROJECTION_SCHEMA,
    semanticScope: sage.SEMANTIC_SCOPE,
    field: { id: sage.FIELD_ID,
      polynomialAscending: [...sage.POLYNOMIAL_ASCENDING] },
    classGroup: { classNumber: "2", invariantFactors: ["2"], generatorCount: "1" },
    unitGroup: { rank: "2", regulatorPresent: true, torsionOrder: "2" },
    completionMode: "flag-zero-class-and-unit-result" };
  const evidence = { fieldId: sage.FIELD_ID,
    polynomialAscending: [...sage.POLYNOMIAL_ASCENDING], classNumber: "2",
    invariantFactors: ["2"], generatorCount: "1", unitRank: "2",
    regulatorPresent: true, torsionOrder: "2",
    completionMode: "flag-zero-class-and-unit-result" };
  const replay = { schema:
    "sagejs.pari-class-group/row13-independent-lean-replay-v1",
    source: "independently-reconstructed-mathematical-owners", evidence,
    reconstructedProjection: projection };
  fresh.validateIndependentReplay(replay, projection);
  const counters = { mathematicalCalls: "43", nativeHandleCount: "18" };
  fresh.validateResourceCounters(counters, counters);

  const changedResult = structuredClone(projection);
  changedResult.classGroup.classNumber = "3";
  rejects(() => fresh.validateIndependentReplay(replay, changedResult),
    "changed result must be rejected");
  const changedReplay = structuredClone(replay);
  changedReplay.evidence.unitRank = "3";
  rejects(() => fresh.validateIndependentReplay(changedReplay, projection),
    "changed replay must be rejected");
  rejects(() => fresh.validateResourceCounters(
    { mathematicalCalls: "0", nativeHandleCount: "18" }),
  "zero mathematical invocation count must be rejected");
  rejects(() => fresh.validateResourceCounters(
    { mathematicalCalls: "39", nativeHandleCount: "18" }, counters),
  "changed plausible invocation count must be rejected");

  const authority = sourceAuthority();
  validateSourceAuthority(authority);
  const changedAuthority = structuredClone(authority);
  changedAuthority.files[0].sha256 = "0".repeat(64);
  rejects(() => validateSourceAuthority(changedAuthority),
    "changed provenance must be rejected");
  const directoryAuthority = sage.artifactAuthority(__dirname);
  sage.validateArtifactAuthority(directoryAuthority);
  assert.deepEqual(Object.keys(directoryAuthority).sort(), ["path", "type"]);
  const changedDirectory = { ...directoryAuthority, type: "file" };
  rejects(() => sage.validateArtifactAuthority(changedDirectory),
    "directory artifact kind mutation must be rejected");
  const fileAuthority = sage.artifactAuthority(path.join(__dirname,
    "row13_phase6_sage_prepared_adapter.cjs"));
  const changedFile = { ...fileAuthority, sha256: "0".repeat(64) };
  rejects(() => sage.validateArtifactAuthority(changedFile),
    "artifact file mutation must be rejected");

  const prepared = require(sage.DEFAULT_INPUT);
  const changedPrepared = structuredClone(prepared);
  changedPrepared.prep_polynomial[0] = String(BigInt(
    changedPrepared.prep_polynomial[0]) + 1n);
  rejects(() => authentication.authenticatePreparedNf(changedPrepared),
    "changed prepared field must be rejected");

  const sidecar = Buffer.from("run_identity=row13-test-identity-0001\n" +
    "runner_pid=10\nprocess_group=10\nresource_scope=recursive-descendants\n" +
    "start_epoch_ns=100\n" +
    "rss_limit_kib=4194304\n" +
    "sample_epoch_ns aggregate_descendant_rss_kib aggregate_descendant_vsz_kib process_count build_process_count\n" +
    "101 20 30 1 0\n102 25 40 2 0\nexit_status=0\n" +
    "rss_limit_violation=0\nbuild_process_seen=0\npeak_aggregate_rss_kib=25\n" +
    "peak_aggregate_vsz_kib=40\nend_epoch_ns=200\nwall_ns=100\n" +
    "wall_seconds=0.000000100\npostflight_status=0\n");
  const parsedSidecar = finalizer.parseResourceSidecar(sidecar);
  finalizer.validateResourceForCore({
    runIdentity: parsedSidecar.runIdentity, sourceAuthority: authority }, parsedSidecar);
  rejects(() => finalizer.validateResourceForCore({
    runIdentity: "row13-other-identity-0002", sourceAuthority: authority }, parsedSidecar),
  "foreign-run sidecar must be rejected");
  rejects(() => finalizer.parseResourceSidecar(Buffer.from("x\n")),
    "junk sidecar must be rejected");
  rejects(() => finalizer.parseResourceSidecar(sidecar.subarray(0, sidecar.length - 10)),
    "truncated sidecar must be rejected");
  rejects(() => finalizer.parseResourceSidecar(Buffer.from(
    sidecar.toString().replace("wall_seconds=0.000000100",
      "wall_seconds=0.000000101"))),
  "inconsistent wall seconds must be rejected");
  rejects(() => finalizer.parseResourceSidecar(Buffer.from(
    sidecar.toString().replace("101 20 30 1 0", "99 20 30 1 0"))),
  "out-of-interval sample must be rejected");
  rejects(() => finalizer.parseResourceSidecar(Buffer.from(
    sidecar.toString().replace("101 20 30 1 0", "101 20 30 0 0"))),
  "zero-process sample must be rejected");
  rejects(() => finalizer.parseResourceSidecar(Buffer.from(
    sidecar.toString().replace("recursive-descendants", "process-group"))),
  "obsolete process-group-only sidecar must be rejected");
  rejects(() => finalizer.parseResourceSidecar(Buffer.from(
    sidecar.toString().replace("101 20 30 1 0", "101 20 30 1 1"))),
  "sample containing a build process must be rejected");
  rejects(() => finalizer.parseResourceSidecar(Buffer.from(
    sidecar.toString().replace("build_process_seen=0", "build_process_seen=1"))),
  "sidecar reporting a build process must be rejected");
  rejects(() => finalizer.parseResourceSidecar(Buffer.from(
    sidecar.toString().replace("postflight_status=0", "postflight_status=1"))),
  "failed postflight must be rejected");
  const receipt = { pass: true,
    mutations: ["prepared", "result", "replay", "counter", "provenance",
      "artifact-file", "artifact-directory"],
    sidecarMutations: ["junk", "truncated", "foreign-run",
      "wall-seconds", "sample-interval", "zero-process-count",
      "obsolete-process-group", "build-process-sample", "build-process-seen",
      "failed-postflight"],
    coordinateMutation: coordinates.runCoordinateMutations() };
  return receipt;
}

function runReportMutations(report, validateReportCore) {
  const cases = [
    ["result", value => { value.sagejs.batch.outputDigest = "0".repeat(64); }],
    ["replay", value => { value.pari.batch.replayDigest = "0".repeat(64); }],
    ["counter", value => {
      value.sagejs.batch.resourceCounters.mathematicalCalls = "84";
    }],
    ["source-provenance", value => {
      value.sourceAuthority.files[0].sha256 = "0".repeat(64);
    }],
    ["native-artifact-hash", value => {
      const nodes = value.sagejs.provenance.nativeAuthority;
      const artifact = Object.values(nodes[0].artifacts)
        .find(candidate => candidate.type === "file");
      assert(artifact, "real report has no native file artifact");
      artifact.sha256 = "0".repeat(64);
    }],
    ["pari-executable-hash", value => {
      value.pari.provenance.executableAuthority.sha256 = "0".repeat(64);
    }],
    ["pari-library-hash", value => {
      value.pari.provenance.libraryAuthority.sha256 = "0".repeat(64);
    }],
    ["both-arm-digest", value => {
      value.sagejs.batch.outputDigest = "3".repeat(64);
      value.pari.batch.outputDigest = "3".repeat(64);
    }],
    ["artifact-deletion", value => {
      delete value.sagejs.provenance.nativeAuthority[0].artifacts.coreHeaderPath;
    }],
    ["wrong-schema", value => { value.schema = "wrong"; }],
    ["wall", value => { value.sagejs.batch.wallNanoseconds = "01"; }],
    ["stage", value => {
      value.pari.batch.stageTiming.unattributedNanoseconds = "2";
    }],
    ["rss", value => { value.sagejs.batch.peakRssKiB = "0"; }],
    ["helper-cpu", value => {
      value.pari.observations[0].helperProcessCpuNanoseconds = "0";
    }],
    ["observation-deletion", value => { value.pari.observations.pop(); }],
  ];
  for (const [name, mutate] of cases) {
    const changed = structuredClone(report);
    mutate(changed);
    rejects(() => validateReportCore(changed),
      `changed real report ${name} must be rejected`);
  }
  for (const key of ["qualifiedTiming", "campaignExecuted", "executionEnabled",
    "reserveOpeningEnabled", "reservesOpened", "externalResourceSidecarBound"]) {
    const changed = structuredClone(report); changed[key] = true;
    rejects(() => validateReportCore(changed),
      `unsafe real report flag ${key} must be rejected`);
  }
  return [...cases.map(([name]) => name), "safety-flags"];
}

function reportFixture(checker, authority) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "row13-report-authority-"));
  const authorityByName = new Map(authority.files.map(record =>
    [path.basename(record.name), record]));
  const nativeAuthority = checker.NATIVE_PYTHON_SOURCES.map((name, index) => {
    const cacheKey = crypto.createHash("sha256").update(`row13-${name}`).digest("hex");
    const moduleIdentity = cacheKey.slice(0, 16);
    const sourcePath = path.join(__dirname, name);
    const manifestPath = path.join(directory, `${index}.manifest.json`);
    fs.writeFileSync(manifestPath, `${JSON.stringify({ cacheKey, moduleIdentity,
      sourceHash: authorityByName.get(name).sha256, sourcePath })}\n`);
    return { label: index === 0 ? "initial" : `fixture.${index}`,
      cacheKey, moduleIdentity, artifacts: {
      addonPath: sage.artifactAuthority(sourcePath),
      manifestPath: sage.artifactAuthority(manifestPath),
      modulePath: sage.artifactAuthority(sourcePath),
      outputPath: sage.artifactAuthority(directory),
      coreSourcePath: sage.artifactAuthority(sourcePath),
      coreHeaderPath: sage.artifactAuthority(sourcePath),
    } };
  });
  const digests = checker.EXPECTED_DIGESTS;
  const sageObservation = () => ({ nativeMathematicalCalls: "43",
    preparedAuthoritySha256: sage.PREPARED_AUTHORITY_SHA256,
    processLifetimeHighWaterMarkKiB: "100", projectionSha256: digests.outputDigest,
    replayEvidenceSource: "independently-reconstructed-mathematical-owners" });
  const pariObservation = () => ({ helperProcessCpuNanoseconds: "10",
    nativeMathematicalCalls: "1", preparationNanoseconds: "20",
    processLifetimeHighWaterMarkKiB: "80",
    replayEvidenceSource: "independent-pari-bnf-getters",
    terminalRngSha256: checker.EXPECTED_PARI_TERMINAL_RNG_SHA256 });
  const batch = (implementation, peakRssKiB) => ({ repetitions: 2,
    wallNanoseconds: "200", threadCpuNanoseconds:
      implementation === "sagejs" ? "150" : null, peakRssKiB, ...digests,
    counters: { classNumber: "2", degree: "4", relationColumns: "1006",
      relationRows: "999", unitRank: "2" },
    resourceCounters: implementation === "sagejs"
      ? { mathematicalCalls: "86", nativeHandleCount: "36" }
      : { mathematicalCalls: "2", nativeHandleCount: "0" },
    stageTiming: { inclusiveNanoseconds: "200", leaves: {
      relationRetry: "0", sparseHnfSnfTransform: "0", unitRegulator: "0",
      honestyGeneratorsFinal: "0" }, unattributedNanoseconds: "200" } });
  const pari = require("./generic_phase6_pari_prepared_adapter.cjs");
  const built = pari.buildHelper();
  const executableAuthority = sage.artifactAuthority(built.executable);
  const runtimeLibrary = fresh.resolvePariRuntimeLibrary(built.executable);
  const libraryAuthority = sage.artifactAuthority(runtimeLibrary.realPath);
  const pariBuildProvenance = { ...built.provenance };
  const prebuiltManifestPath = path.join(directory, "pari-helper-manifest.json");
  fs.writeFileSync(prebuiltManifestPath, `${JSON.stringify({
    schema: fresh.PREBUILT_SCHEMA, fieldId: sage.FIELD_ID,
    executableAuthority, libraryAuthority,
    buildProvenance: pariBuildProvenance })}\n`);
  return { directory, report: {
    schema: "sagejs.pari-class-group/row13-phase6-unqualified-fresh-protocol-v1",
    qualifiedTiming: false, campaignExecuted: false, executionEnabled: false,
    reserveOpeningEnabled: false, reservesOpened: false,
    runIdentity: "row13-focused-fixture-0001", fieldId: sage.FIELD_ID,
    projectionSchema: sage.PROJECTION_SCHEMA, exactLeanProjectionParity: true,
    semanticReplayParity: true, matchedSeedAuthority: true,
    terminalRngCrossArmMaterialized: false,
    pariFreshTerminalRngDeterministic: true, workCountersExactWithinArm: true,
    counterInterpretation: "fixture", semanticScope: sage.SEMANTIC_SCOPE,
    timingInterpretation: "fixture", rssInterpretation: "fixture",
    pariCpuInterpretation: "fixture", sourceAuthority: authority,
    mutationReceipt: { reportMutations: REPORT_MUTATIONS },
    externalResourceSidecarBound: false, note: "fixture",
    sagejs: { batch: batch("sagejs", "100"),
    provenance: { preparedAuthoritySha256: sage.PREPARED_AUTHORITY_SHA256,
      residentHostSha256: authorityByName.get(
        "row13_phase6_resident_kernel_host.cjs").sha256,
      preparedRootSourceSha256: authorityByName.get(
        "row13_prepared_initial_root.py").sha256,
      rootNativeCacheKey: nativeAuthority[0].cacheKey,
      dependencies: checker.SAGE_DEPENDENCY_FILES.map(name => ({ name,
        sha256: authorityByName.get(name).sha256 })), nativeAuthority },
    observations: [sageObservation(), sageObservation()] },
    pari: { batch: batch("pari", "80"),
    provenance: { ...pariBuildProvenance, executableAuthority, libraryAuthority,
      prebuiltManifestAuthority: sage.artifactAuthority(prebuiltManifestPath) },
    observations: [pariObservation(), pariObservation()] },
  } };
}

function main() {
  const checker = require("./check_row13_phase6_qualification_pair.cjs");
  const digest = value => crypto.createHash("sha256")
    .update(`${JSON.stringify(value)}\n`).digest("hex");
  const projection = { schema: sage.PROJECTION_SCHEMA,
    semanticScope: sage.SEMANTIC_SCOPE,
    field: { id: sage.FIELD_ID,
      polynomialAscending: [...sage.POLYNOMIAL_ASCENDING] },
    classGroup: { classNumber: "2", invariantFactors: ["2"],
      generatorCount: "1" },
    unitGroup: { rank: "2", regulatorPresent: true, torsionOrder: "2" },
    completionMode: "flag-zero-class-and-unit-result" };
  const replay = { schema:
    "sagejs.pari-class-group/row13-independent-lean-replay-v1",
    evidence: { fieldId: sage.FIELD_ID,
      polynomialAscending: [...sage.POLYNOMIAL_ASCENDING], classNumber: "2",
      invariantFactors: ["2"], generatorCount: "1", unitRank: "2",
      regulatorPresent: true, torsionOrder: "2",
      completionMode: "flag-zero-class-and-unit-result" },
    reconstructedProjection: projection };
  const work = Object.fromEntries(Object.keys(fresh.COUNTERS).sort().map(key =>
    [key, fresh.COUNTERS[key]]));
  assert.deepEqual(checker.EXPECTED_DIGESTS, {
    outputDigest: digest(projection), replayDigest: digest(replay),
    rngDigest: digest({ scope: "matched-input-seed-only", seed: "1",
      terminalStateMaterialized: false }), workDigest: digest(work),
  }, "fixed row-13 digest authority changed from reviewed semantics");
  const receipt = runMutations(checker);
  const fixture = reportFixture(checker, checker.sourceAuthority());
  try {
    checker.validateReportCore(fixture.report);
    finalizer.validateCoreForFinalization(fixture.report);
    assert.deepEqual(runReportMutations(fixture.report,
      finalizer.validateCoreForFinalization),
      REPORT_MUTATIONS);
    for (const mutate of [
      value => { value.sagejs.batch.outputDigest = "0".repeat(64); },
      value => { value.pari.batch.replayDigest = "0".repeat(64); },
      value => { value.sagejs.batch.resourceCounters.mathematicalCalls = "84"; },
      value => { value.sourceAuthority.files[0].sha256 = "0".repeat(64); },
      value => {
        value.sagejs.provenance.nativeAuthority[0].artifacts
          .manifestPath.sha256 = "0".repeat(64);
      },
    ]) {
      const changed = structuredClone(fixture.report); mutate(changed);
      rejects(() => finalizer.validateCoreForFinalization(changed),
        "finalizer must reject a mutated report core");
    }
    const actualRuntime = fixture.report.pari.provenance.libraryAuthority;
    const misleadingObject = path.join(fixture.directory,
      "libpari-same-bytes-wrong-realpath.so");
    fs.copyFileSync(actualRuntime.path, misleadingObject);
    const linkerAlias = path.join(fixture.directory, "libpari.so");
    fs.symlinkSync(path.basename(misleadingObject), linkerAlias);
    assert.notEqual(fs.realpathSync(linkerAlias),
      fresh.resolvePariRuntimeLibrary(
        fixture.report.pari.provenance.executableAuthority.path).realPath,
    "negative fixture must make libpari.so and DT_NEEDED resolve differently");
    const aliasChanged = structuredClone(fixture.report);
    aliasChanged.pari.provenance.libraryAuthority =
      sage.artifactAuthority(fs.realpathSync(linkerAlias));
    assert.equal(aliasChanged.pari.provenance.libraryAuthority.sha256,
      actualRuntime.sha256,
    "negative fixture must isolate runtime identity from content hashing");
    const aliasManifestPath = path.join(fixture.directory,
      "pari-helper-alias-manifest.json");
    const aliasManifest = JSON.parse(fs.readFileSync(
      aliasChanged.pari.provenance.prebuiltManifestAuthority.path, "utf8"));
    aliasManifest.libraryAuthority =
      aliasChanged.pari.provenance.libraryAuthority;
    fs.writeFileSync(aliasManifestPath, `${JSON.stringify(aliasManifest)}\n`);
    aliasChanged.pari.provenance.prebuiltManifestAuthority =
      sage.artifactAuthority(aliasManifestPath);
    rejects(() => finalizer.validateCoreForFinalization(aliasChanged),
      "same-byte libpari.so alias must not replace the executable DT_NEEDED target");
  } finally { fs.rmSync(fixture.directory, { recursive: true, force: true }); }
  process.stdout.write(`${JSON.stringify({ ...receipt,
    reportMutations: REPORT_MUTATIONS, finalizerCoreMutations: REPORT_MUTATIONS,
    runtimeLibraryMutations: ["libpari-alias-differs-from-dt-needed"] })}\n`);
}

module.exports = { REPORT_MUTATIONS, main, reportFixture, runMutations,
  runReportMutations };
if (require.main === module) main();

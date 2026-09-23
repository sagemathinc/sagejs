"use strict";

// Symmetric worker-protocol adapters for row 13. Sage.js re-enters the
// committed resident graph from authenticated prepared input; PARI starts a
// fresh pristine 2.17.4 helper whose nfinit preparation precedes READY.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const pari = require("./generic_phase6_pari_prepared_adapter.cjs");
const sage = require("./row13_phase6_sage_prepared_adapter.cjs");

const COUNTERS = Object.freeze({ classNumber: "2", degree: "4",
  relationRows: "999", relationColumns: "1006", unitRank: "2" });
const EXPECTED_RESOURCES = Object.freeze({
  sagejs: Object.freeze({ mathematicalCalls: "43", nativeHandleCount: "18" }),
  pari: Object.freeze({ mathematicalCalls: "1", nativeHandleCount: "0" }),
});
const canonicalDigest = value => crypto.createHash("sha256")
  .update(`${JSON.stringify(value)}\n`).digest("hex");
const PREBUILT_SCHEMA =
  "sagejs.pari-class-group/row13-phase6-prebuilt-pari-helper-v2";
const PARI_RUNTIME_SONAME = "libpari-gmp-tls.so.9";

function resolvePariRuntimeLibrary(executable) {
  const pariRoot = path.resolve(process.env.SAGEJS_PARI_ROOT ||
    "/home/user/upstream/pari-2.17.4");
  const objects = path.join(pariRoot, "Olinux-x86_64");
  const readelf = fs.realpathSync("/usr/bin/readelf");
  const dynamic = spawnSync(readelf, ["-d", path.resolve(executable)], {
    encoding: "utf8", timeout: 10_000, maxBuffer: 4 * 1024 * 1024,
    env: { PATH: process.env.PATH, LANG: "C", LC_ALL: "C" },
  });
  assert.equal(dynamic.status, 0, dynamic.stderr || String(dynamic.error));
  const needed = [...dynamic.stdout.matchAll(
    /\(NEEDED\).*Shared library: \[([^\]]+)\]/g)].map(match => match[1]);
  const pariNeeded = needed.filter(name => name.startsWith("libpari"));
  assert.deepEqual(pariNeeded, [PARI_RUNTIME_SONAME],
    "prebuilt helper PARI DT_NEEDED entry changed");
  const runpaths = [...dynamic.stdout.matchAll(
    /\((?:RUNPATH|RPATH)\).*Library r(?:un)?path: \[([^\]]+)\]/g)]
    .flatMap(match => match[1].split(":"));
  assert.deepEqual(runpaths, [objects],
    "prebuilt helper PARI runtime search path changed");
  const sonamePath = path.join(objects, PARI_RUNTIME_SONAME);
  const realPath = fs.realpathSync(sonamePath);
  assert.equal(path.dirname(realPath), objects,
    "prebuilt helper PARI SONAME escaped the pinned object tree");
  return Object.freeze({ objects, realPath, soname: PARI_RUNTIME_SONAME,
    sonamePath });
}

function validatePrebuiltManifest(manifest, expectedExecutable) {
  assert.deepEqual(Object.keys(manifest).sort(),
    ["buildProvenance", "executableAuthority", "fieldId", "libraryAuthority",
      "schema"]);
  assert.equal(manifest.schema, PREBUILT_SCHEMA);
  assert.equal(manifest.fieldId, sage.FIELD_ID);
  assert.deepEqual(Object.keys(manifest.executableAuthority).sort(),
    ["path", "sha256", "type"]);
  assert.equal(manifest.executableAuthority.type, "file");
  assert.equal(path.resolve(manifest.executableAuthority.path),
    path.resolve(expectedExecutable));
  sage.validateArtifactAuthority(manifest.executableAuthority);
  assert.deepEqual(Object.keys(manifest.libraryAuthority).sort(),
    ["path", "sha256", "type"]);
  assert.equal(manifest.libraryAuthority.type, "file");
  const runtimeLibrary = resolvePariRuntimeLibrary(expectedExecutable);
  assert.equal(path.resolve(manifest.libraryAuthority.path),
    runtimeLibrary.realPath,
    "prebuilt helper authority is not the canonical PARI runtime object");
  assert.equal(fs.realpathSync(manifest.libraryAuthority.path),
    runtimeLibrary.realPath, "prebuilt helper PARI runtime target changed");
  sage.validateArtifactAuthority(manifest.libraryAuthority);
  assert.deepEqual(Object.keys(manifest.buildProvenance).sort(), [
    "archiveSha256", "buch2Sha256", "compiler", "compilerArguments",
    "executableSha256", "librarySha256", "pariVersion", "sourceSha256",
  ]);
  assert.deepEqual(manifest.buildProvenance.pariVersion, ["2", "17", "4"]);
  assert.equal(manifest.buildProvenance.archiveSha256, pari.ARCHIVE_SHA256);
  assert.equal(manifest.buildProvenance.buch2Sha256, pari.BUCH2_SHA256);
  assert.equal(manifest.buildProvenance.librarySha256, pari.LIBRARY_SHA256);
  assert.equal(manifest.buildProvenance.librarySha256,
    manifest.libraryAuthority.sha256);
  assert.equal(manifest.buildProvenance.sourceSha256,
    sage.artifactAuthority(path.join(__dirname,
      "generic_phase6_pari_prepared_adapter.c")).sha256);
  assert.equal(manifest.buildProvenance.executableSha256,
    manifest.executableAuthority.sha256);
  return manifest;
}

function loadPrebuiltPariHelper() {
  const executable = process.env.ROW13_PHASE6_PARI_HELPER;
  const manifestPath = process.env.ROW13_PHASE6_PARI_HELPER_MANIFEST;
  assert(executable && manifestPath,
    "row-13 pair requires prebuilt PARI helper and manifest; compilation is forbidden");
  const manifest = validatePrebuiltManifest(
    JSON.parse(fs.readFileSync(manifestPath, "utf8")), executable);
  return Object.freeze({ executable: path.resolve(executable),
    provenance: Object.freeze({ ...manifest.buildProvenance,
      executableAuthority: manifest.executableAuthority,
      libraryAuthority: manifest.libraryAuthority,
      prebuiltManifestAuthority: sage.artifactAuthority(manifestPath) }) });
}

function cpuNanoseconds(started) {
  const elapsed = process.threadCpuUsage(started);
  return String(BigInt(elapsed.user + elapsed.system) * 1000n);
}

function validateIndependentReplay(replay, projection) {
  assert.equal(replay.schema,
    "sagejs.pari-class-group/row13-independent-lean-replay-v1");
  assert.deepEqual(replay.reconstructedProjection, projection);
  const evidence = replay.evidence;
  assert.deepEqual({ field: { id: evidence.fieldId,
    polynomialAscending: evidence.polynomialAscending },
  classGroup: { classNumber: evidence.classNumber,
    invariantFactors: evidence.invariantFactors,
    generatorCount: evidence.generatorCount },
  unitGroup: { rank: evidence.unitRank,
    regulatorPresent: evidence.regulatorPresent,
    torsionOrder: evidence.torsionOrder },
  completionMode: evidence.completionMode },
  { field: projection.field, classGroup: projection.classGroup,
    unitGroup: projection.unitGroup, completionMode: projection.completionMode });
  return replay;
}

function validateResourceCounters(value, expected = null) {
  assert.match(value.mathematicalCalls, /^[1-9][0-9]*$/);
  assert.match(value.nativeHandleCount, /^(0|[1-9][0-9]*)$/);
  if (expected !== null) assert.deepEqual(value, expected,
    "row-13 resource counters changed");
  return value;
}

function normalize(raw, threadStarted, seed, implementation) {
  const kernel = String(raw.kernelNanoseconds);
  assert.match(kernel, /^[1-9][0-9]*$/);
  pari.validateProjection(pari.frozenFieldSpecification(13), raw.projection);
  const projection = structuredClone(raw.projection);
  const replay = implementation === "sagejs" ? raw.independentReplay : {
    schema: "sagejs.pari-class-group/row13-independent-lean-replay-v1",
    source: raw.replayEvidence.source,
    evidence: { fieldId: projection.field.id,
      polynomialAscending: projection.field.polynomialAscending,
      ...raw.replayEvidence, source: undefined,
      completionMode: projection.completionMode },
    reconstructedProjection: structuredClone(projection),
  };
  delete replay.evidence.source;
  const semanticReplay = structuredClone(replay);
  delete semanticReplay.source;
  validateIndependentReplay(semanticReplay, projection);
  return {
    kernelNanoseconds: kernel,
    threadCpuNanoseconds: implementation === "pari" ? null
      : cpuNanoseconds(threadStarted),
    peakRssKiB: String(raw.processMaxRssKiB),
    output: projection,
    replay: semanticReplay,
    // The translated row-13 graph has no exposed 66-word RNG owner. Preserve
    // the common seed authority without claiming cross-arm terminal RNG parity.
    rng: { scope: "matched-input-seed-only", seed,
      terminalStateMaterialized: false },
    counters: { ...COUNTERS },
    resourceCounters: validateResourceCounters({ mathematicalCalls: implementation === "pari"
      ? "1" : raw.counters.nativeMathematicalCalls,
      nativeHandleCount: implementation === "pari" ? "0"
        : raw.counters.nativeHandleCount }, EXPECTED_RESOURCES[implementation]),
    stageTiming: { inclusiveNanoseconds: kernel,
      leaves: { relationRetry: "0", sparseHnfSnfTransform: "0",
        unitRegulator: "0", honestyGeneratorsFinal: "0" },
      unattributedNanoseconds: kernel },
  };
}

function validateRequest(request) {
  assert.equal(request.boundary, "prepared-kernel");
  assert.equal(request.fieldId, sage.FIELD_ID);
  assert.equal(request.seed, "1", "row-13 protocol fixes seed 1");
}

async function createRow13FreshPreparedAdapter(configuration) {
  assert(configuration && typeof configuration === "object" &&
    !Array.isArray(configuration));
  assert.deepEqual(Object.keys(configuration).sort(),
    ["implementation", "panelIndex"]);
  assert.equal(configuration.panelIndex, 13);
  assert(["sagejs", "pari"].includes(configuration.implementation));
  const implementation = configuration.implementation;
  const observations = [];
  if (implementation === "sagejs") {
    const resident = await sage.prepareResident();
    return {
      implementation,
      projectionSchema: sage.PROJECTION_SCHEMA,
      provenance: resident.provenance,
      observations,
      async runFresh(request) {
        validateRequest(request);
        const threadStarted = process.threadCpuUsage();
        const raw = await sage.runResident(resident);
        observations.push(Object.freeze({
          preparedAuthoritySha256:
            raw.provenance.preparedAuthoritySha256,
          projectionSha256: canonicalDigest(raw.projection),
          nativeMathematicalCalls: raw.counters.nativeMathematicalCalls,
          replayEvidenceSource: raw.independentReplay.source,
          processLifetimeHighWaterMarkKiB: raw.processMaxRssKiB,
        }));
        return normalize(raw, threadStarted, request.seed, implementation);
      },
    };
  }
  const specification = pari.frozenFieldSpecification(13);
  // Deliberately no `buildHelper()` fallback: a compiler process inside the
  // diagnostic pair invalidates its recursive-descendant resource evidence.
  const build = loadPrebuiltPariHelper();
  return {
    implementation,
    projectionSchema: sage.PROJECTION_SCHEMA,
    provenance: build.provenance,
    observations,
    async runFresh(request) {
      validateRequest(request);
      const client = new pari.HelperClient(specification, build);
      const ready = await client.ready();
      try {
        const raw = await client.run(request.seed);
        observations.push(Object.freeze({
          preparationNanoseconds: ready.preparationNanoseconds,
          terminalRngSha256: canonicalDigest(raw.rng),
          helperProcessCpuNanoseconds: raw.processCpuNanoseconds,
          replayEvidenceSource: raw.replayEvidence.source,
          nativeMathematicalCalls: "1",
          processLifetimeHighWaterMarkKiB: raw.processMaxRssKiB,
        }));
        return normalize(raw, null, request.seed, implementation);
      } finally { await client.close(); }
    },
  };
}

module.exports = { COUNTERS, EXPECTED_RESOURCES, PREBUILT_SCHEMA,
  PARI_RUNTIME_SONAME, createRow13FreshPreparedAdapter,
  loadPrebuiltPariHelper, normalize, resolvePariRuntimeLibrary,
  validateIndependentReplay, validatePrebuiltManifest, validateResourceCounters };

// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const receiptV2 = require(
  "../bench/pari-class-group-port/row14_phase6_diagnostic_receipt_v2.cjs");
const provenanceApi = require(
  "../bench/pari-class-group-port/row14_live_native_provenance.cjs");

function write(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, value);
}

function run(repository, ...args) {
  childProcess.execFileSync("git", ["-C", repository, ...args],
    { stdio: "ignore" });
}

function provenanceReport(filename) {
  const file = provenanceApi.fileEvidence(filename);
  const builds = Array.from({ length: 13 }, (_, index) => {
    const body = { schema: provenanceApi.BUILD_SCHEMA, label: `build-${index}`,
      cacheKey: receiptV2.digest(`cache-${index}`), moduleIdentity: `m${index}`,
      nativeAbi: 24, sourcePath: filename,
      sourceHash: receiptV2.digest(`source-${index}`),
      hostIsolation: { isolated: true, hostCallbacks: 0 },
      loader: { route: "direct-addon", packPresent: false,
        loadedBinary: file }, artifacts: { addon: file }, dependencies: [],
      runtimeDependencies: [] };
    return { ...body, sha256: receiptV2.digest(body), labels: [`b${index}`] };
  });
  const body = { schema: provenanceApi.SCHEMA,
    collectionBoundary: "post-warmup-resident-built-objects-no-kernel-execution",
    buildCount: 13, builds, toolchain: null };
  return { ...body, sha256: receiptV2.digest(body) };
}

function arm(implementation, nativeReport) {
  const workEvidence = { owner: `${implementation}-live-work`, columns: "806" };
  const nativeEvidence = { owner: `${implementation}-call-graph`, calls: "35" };
  const provenance = { implementation, artifacts: [{ sha256: "a".repeat(64) }] };
  const sample = {
    counters: { degree: "4", factorBaseSize: "799" },
    output: { matchedState: { classNumber: "192" }, provenance },
    resourceCounters: { nativeCalls: "35" },
  };
  const observedProvenance = implementation === "sagejs"
    ? { declared: provenance, liveNative: { buildCount: 13,
      ...nativeReport } } : provenance;
  return { implementation, sample, observations: {
    nativeCalls: { derivationEvidence: nativeEvidence,
      evidenceDigest: receiptV2.digest(nativeEvidence), value: "35" },
    provenance: observedProvenance,
    workCounters: { derivationEvidence: workEvidence,
      evidenceDigest: receiptV2.digest(workEvidence), values: sample.counters },
  } };
}

function fixture() {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "row14-receipt-v2-"));
  const evidencePath = path.join(repository, "evidence.json");
  const verifierPath = path.join(repository, "verifier.cjs");
  write(evidencePath, "{}\n");
  write(verifierPath, `"use strict";
exports.verify = () => ({
  matchedReady: true,
  panelIndex: 14,
  leanSemanticDigest: "${"b".repeat(64)}",
  replaySha256: "${"d".repeat(64)}",
  mutationCoverage: { arithmetic: true, provenance: true },
});
`);
  run(repository, "init", "-q");
  run(repository, "config", "user.email", "receipt@example.invalid");
  run(repository, "config", "user.name", "Receipt Test");
  run(repository, "add", ".");
  run(repository, "commit", "-qm", "fixture");
  const nativeReport = provenanceReport(evidencePath);
  const request = { boundary: "prepared-kernel", fieldId: "row14",
    repetition: 0, seed: "1", tier: "diagnostic" };
  const receipt = receiptV2.finalizeDiagnosticReceipt({
    evidencePath, pari: arm("pari", nativeReport), repository, request,
    sagejs: arm("sagejs", nativeReport), verifierExport: "verify", verifierPath,
  });
  return { evidencePath, receipt, repository, verifierPath };
}

test("diagnostic receipt v2 retains observations and replay authorities", () => {
  const value = fixture();
  const checked = receiptV2.verifyDiagnosticReceipt(value.receipt,
    { repository: value.repository });
  assert.match(checked.receiptSha256, /^[0-9a-f]{64}$/);
  assert.equal(value.receipt.pair.sagejs.observations.workCounters
    .derivationEvidence.owner, "sagejs-live-work");
  assert.match(value.receipt.authority.evidence.sha256, /^[0-9a-f]{64}$/);
  assert.match(value.receipt.authority.verifier.sha256, /^[0-9a-f]{64}$/);
  assert.match(value.receipt.authority.sourceCommit.headCommit,
    /^[0-9a-f]{40,64}$/);
  assert.equal(value.receipt.publication.status,
    "generated-after-source-commit");
  assert.equal(value.receipt.publication.receiptIncludedInSourceCommit, false);
  assert(value.receipt.authority.files.every(item =>
    /^[0-9a-f]{40,64}$/.test(item.blobOid)));
  assert.equal(value.receipt.staticReplay.matchedReady, true);
  const filename = path.join(value.repository, "receipt.json");
  const written = receiptV2.writeDiagnosticReceipt(filename, value.receipt,
    { repository: value.repository });
  const reread = receiptV2.verifyDiagnosticReceiptFile(filename,
    { repository: value.repository });
  assert.equal(reread.receiptSha256, checked.receiptSha256);
  assert.equal(reread.fileSha256, written.fileSha256);
  assert.throws(() => receiptV2.writeDiagnosticReceipt(filename, value.receipt,
    { repository: value.repository }), /EEXIST/);
});

test("diagnostic receipt v2 rejects observation, source, and commit mutations", () => {
  const value = fixture();
  const observation = structuredClone(value.receipt);
  observation.pair.sagejs.observations.workCounters.derivationEvidence.columns =
    "805";
  assert.throws(() => receiptV2.verifyDiagnosticReceipt(observation,
    { repository: value.repository }), /work observation digest changed/);

  const commit = structuredClone(value.receipt);
  commit.authority.sourceCommit.headTree = "0".repeat(40);
  assert.throws(() => receiptV2.verifyDiagnosticReceipt(commit,
    { repository: value.repository }), /source commit\/tree binding is invalid/);

  const blob = structuredClone(value.receipt);
  blob.authority.files[0].blobOid = "0".repeat(40);
  assert.throws(() => receiptV2.verifyDiagnosticReceipt(blob,
    { repository: value.repository }), /blob identity changed/);

  const omitted = structuredClone(value.receipt);
  omitted.authority.files.pop();
  assert.throws(() => receiptV2.verifyDiagnosticReceipt(omitted,
    { repository: value.repository }),
  /source blob closure is (?:absent|incomplete)/);

  const nativeTop = structuredClone(value.receipt);
  nativeTop.pair.sagejs.observations.provenance.liveNative.sha256 =
    "0".repeat(64);
  assert.throws(() => receiptV2.verifyDiagnosticReceipt(nativeTop,
    { repository: value.repository }), /top-level native provenance digest changed/);
  const nativeBuild = structuredClone(value.receipt);
  nativeBuild.pair.sagejs.observations.provenance.liveNative.builds[0].sha256 =
    "0".repeat(64);
  assert.throws(() => receiptV2.verifyDiagnosticReceipt(nativeBuild,
    { repository: value.repository }), /built-object digest changed/);

  fs.appendFileSync(value.evidencePath, " \n");
  assert.throws(() => receiptV2.verifyDiagnosticReceipt(value.receipt,
    { repository: value.repository }), /authority changed/);
});

test("diagnostic receipt v2 reruns static replay instead of trusting its claim", () => {
  const value = fixture();
  const replay = structuredClone(value.receipt);
  replay.staticReplay.mutationCoverage.arithmetic = false;
  assert.throws(() => receiptV2.verifyDiagnosticReceipt(replay,
    { repository: value.repository }), /static replay authority changed/);
});

test("production receipt authority includes replay, provenance, and stage sources", () => {
  const repository = path.resolve(__dirname, "..");
  const evidence = JSON.parse(fs.readFileSync(receiptV2.DEFAULT_EVIDENCE, "utf8"));
  const basenames = receiptV2.replaySourcePaths(repository,
    receiptV2.DEFAULT_EVIDENCE, receiptV2.DEFAULT_VERIFIER, evidence)
    .map(filename => path.basename(filename));
  const verifier = require(receiptV2.DEFAULT_VERIFIER);
  for (const basename of ["row14_live_native_provenance.cjs",
    "h1_exclusive_stage_timing.cjs", "row14_phase6_static_math_replay.cjs",
    "correspondence.json.gz", "full-ancestry.json.gz",
    "factor-metadata.json.gz",
    ...Object.values(verifier.PROVENANCE_SOURCE_FILES)])
    assert(basenames.includes(basename), `receipt closure omitted ${basename}`);
});

"use strict";

// Durable authority envelope for the row-14 one-pair diagnostic.  This file
// deliberately does not run either implementation.  Its inputs are the full
// `{ sample, observations }` values returned by the matched-state verifier.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const nativeProvenance = require("./row14_live_native_provenance.cjs");

const SCHEMA =
  "sagejs.pari-class-group/row14-phase6-strict-v2-single-pair-diagnostic-v2";
const DEFAULT_EVIDENCE = path.join(__dirname,
  "row14_phase6_matched_state_evidence_v2.json");
const DEFAULT_VERIFIER = path.join(__dirname,
  "row14_phase6_matched_state_verifier.cjs");
const DEFAULT_VERIFIER_EXPORT = "verifySageCorrectnessEvidence";
const SHA256 = /^[0-9a-f]{64}$/;
const GIT_OBJECT = /^[0-9a-f]{40,64}$/;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

const digest = value => crypto.createHash("sha256").update(canonical(value))
  .digest("hex");
const fileDigest = filename => crypto.createHash("sha256")
  .update(fs.readFileSync(filename)).digest("hex");

function exactKeys(value, keys, label) {
  assert(value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(),
    `${label} has unexpected fields`);
}

function git(repository, args) {
  return childProcess.execFileSync("git", ["-C", repository, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function repositoryRelative(repository, filename) {
  const relative = path.relative(path.resolve(repository), path.resolve(filename));
  assert(relative && !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative), `${filename} is outside the repository`);
  return relative.split(path.sep).join("/");
}

function sourceAuthority(repository, filename) {
  return { repositoryPath: repositoryRelative(repository, filename),
    sha256: fileDigest(filename) };
}

function committedSourceAuthority(repository, filename, commit) {
  const authority = sourceAuthority(repository, filename);
  const bytes = childProcess.execFileSync("git", ["-C", repository, "show",
    `${commit}:${authority.repositoryPath}`], { encoding: null,
    stdio: ["ignore", "pipe", "pipe"] });
  const committedSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  assert.equal(committedSha256, authority.sha256,
    `${authority.repositoryPath} differs from recorded source commit`);
  const blobOid = git(repository,
    ["rev-parse", `${commit}:${authority.repositoryPath}`]);
  assert(GIT_OBJECT.test(blobOid));
  return { ...authority, blobOid };
}

function repositoryAuthority(repository) {
  const headCommit = git(repository, ["rev-parse", "HEAD"]);
  const headTree = git(repository, ["rev-parse", "HEAD^{tree}"]);
  assert(GIT_OBJECT.test(headCommit));
  assert(GIT_OBJECT.test(headTree));
  return { headCommit, headTree };
}


function replaySourcePaths(repository, evidencePath, verifierPath, evidence) {
  const directory = path.dirname(evidencePath);
  const paths = new Set([path.resolve(evidencePath), path.resolve(verifierPath)]);
  for (const basename of Object.keys(
    evidence.sourceAuthorities?.replaySources || {}))
    paths.add(path.join(directory, basename));
  const fixtureNames = {
    ancestry: "full-ancestry.json.gz",
    metadata: "factor-metadata.json.gz",
    result: "correspondence.json.gz",
  };
  for (const name of Object.keys(evidence.sourceAuthorities?.fixtures || {}))
    paths.add(path.join(directory, "evidence", "row14-strict-v2",
      fixtureNames[name]));
  for (const basename of ["row14_live_native_provenance.cjs",
    "h1_exclusive_stage_timing.cjs"]) {
    const filename = path.join(directory, basename);
    if (fs.existsSync(filename)) paths.add(filename);
  }
  // The production verifier publishes the exact implementation files whose
  // bytes it authenticates before accepting a timed arm.  Bind those same
  // files to the receipt's source commit; replay-only source closure is not
  // sufficient to identify the code that actually ran.
  const resolvedVerifier = require.resolve(verifierPath);
  delete require.cache[resolvedVerifier];
  const verifier = require(resolvedVerifier);
  if (verifier.PROVENANCE_SOURCE_FILES) {
    for (const basename of Object.values(verifier.PROVENANCE_SOURCE_FILES))
      paths.add(path.join(path.dirname(verifierPath), basename));
  }
  return [...paths].map(filename => path.resolve(filename)).sort();
}

function committedAuthority(repository, evidencePath, verifierPath, evidence,
    verifierExport) {
  const sourceCommit = repositoryAuthority(repository);
  const files = replaySourcePaths(repository, evidencePath, verifierPath,
    evidence).map(filename =>
    committedSourceAuthority(repository, filename, sourceCommit.headCommit));
  const byPath = new Map(files.map(value => [value.repositoryPath, value]));
  const evidenceAuthority = byPath.get(repositoryRelative(repository,
    evidencePath));
  const verifierAuthority = byPath.get(repositoryRelative(repository,
    verifierPath));
  assert(evidenceAuthority && verifierAuthority);
  return { evidence: evidenceAuthority, files, sourceCommit,
    verifier: { ...verifierAuthority, exportName: verifierExport } };
}

function loadReplay(evidencePath, verifierPath, exportName) {
  const resolved = require.resolve(verifierPath);
  delete require.cache[resolved];
  const verify = require(resolved)[exportName];
  assert.equal(typeof verify, "function", `missing verifier export ${exportName}`);
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  return verify(evidence);
}

function replayProjection(verdict) {
  assert(verdict && typeof verdict === "object" && !Array.isArray(verdict));
  assert.equal(verdict.matchedReady, true,
    "static mathematical replay did not admit row 14");
  assert.equal(typeof verdict.panelIndex, "number");
  assert.equal(typeof verdict.leanSemanticDigest, "string");
  assert(SHA256.test(verdict.leanSemanticDigest));
  assert.equal(typeof verdict.replaySha256, "string");
  assert(SHA256.test(verdict.replaySha256));
  assert(verdict.mutationCoverage &&
    Object.values(verdict.mutationCoverage).every(Boolean),
  "static replay lacks complete mutation coverage");
  return { leanSemanticDigest: verdict.leanSemanticDigest,
    matchedReady: verdict.matchedReady,
    mutationCoverage: verdict.mutationCoverage,
    panelIndex: verdict.panelIndex,
    replaySha256: verdict.replaySha256,
    verdict: structuredClone(verdict),
    verdictSha256: digest(verdict) };
}

function validateArm(arm, implementation) {
  exactKeys(arm, ["implementation", "observations", "sample"],
    `${implementation} arm`);
  assert.equal(arm.implementation, implementation);
  const { sample, observations } = arm;
  exactKeys(observations, ["nativeCalls", "provenance", "workCounters"],
    `${implementation} observations`);
  assert.equal(observations.workCounters.evidenceDigest,
    digest(observations.workCounters.derivationEvidence),
  `${implementation} work observation digest changed`);
  assert.deepEqual(observations.workCounters.values, sample.counters,
    `${implementation} work observations do not support the sample`);
  assert.equal(observations.nativeCalls.evidenceDigest,
    digest(observations.nativeCalls.derivationEvidence),
  `${implementation} native-call observation digest changed`);
  assert.equal(observations.nativeCalls.value,
    sample.resourceCounters.nativeCalls,
  `${implementation} native-call observations do not support the sample`);
  if (implementation === "sagejs") {
    exactKeys(observations.provenance, ["declared", "liveNative"],
      "sagejs provenance observation");
    assert.deepEqual(observations.provenance.declared, sample.output.provenance,
      "sagejs declared provenance does not support the sample");
    assert.equal(observations.provenance.liveNative.buildCount, 13);
    assert(SHA256.test(observations.provenance.liveNative.sha256));
    nativeProvenance.verifyRow14LiveNativeProvenance(
      observations.provenance.liveNative);
  } else assert.deepEqual(observations.provenance, sample.output.provenance,
    `${implementation} provenance observation does not support the sample`);
}

function validatePair(sagejs, pari) {
  validateArm(sagejs, "sagejs");
  validateArm(pari, "pari");
  assert.deepEqual(sagejs.sample.output.matchedState,
    pari.sample.output.matchedState, "the pair does not have matched state");
  assert.deepEqual(sagejs.sample.counters, pari.sample.counters,
    "the pair does not have matched observed work");
}

function finalizeDiagnosticReceipt({ sagejs, pari, request,
  repository = path.resolve(__dirname, "../.."), evidencePath = DEFAULT_EVIDENCE,
  verifierPath = DEFAULT_VERIFIER,
  verifierExport = DEFAULT_VERIFIER_EXPORT }) {
  validatePair(sagejs, pari);
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  const replay = replayProjection(loadReplay(evidencePath, verifierPath,
    verifierExport));
  const receipt = {
    schema: SCHEMA,
    authority: committedAuthority(repository, evidencePath, verifierPath,
      evidence, verifierExport),
    campaignExecuted: false,
    exactMatchedState: true,
    exactObservedWork: true,
    fieldId: request.fieldId,
    note: "One fresh pair validates admission plumbing only; no timing ratio is promoted.",
    pair: { pari, sagejs },
    qualifiedTiming: false,
    request,
    reservesOpened: false,
    publication: { receiptIncludedInSourceCommit: false,
      status: "generated-after-source-commit" },
    staticReplay: replay,
  };
  assert.deepEqual(JSON.parse(JSON.stringify(receipt)), receipt,
    "diagnostic receipt is not losslessly JSON serializable");
  // Exercise the same independent replay and file authentication used later.
  verifyDiagnosticReceipt(receipt, { repository });
  return receipt;
}

function verifyDiagnosticReceipt(receipt, {
  repository = path.resolve(__dirname, "../..") } = {}) {
  exactKeys(receipt, ["authority", "campaignExecuted", "exactMatchedState",
    "exactObservedWork", "fieldId", "note", "pair", "qualifiedTiming",
    "publication", "request", "reservesOpened", "schema", "staticReplay"],
  "receipt");
  assert.equal(receipt.schema, SCHEMA);
  assert.equal(receipt.qualifiedTiming, false);
  assert.equal(receipt.campaignExecuted, false);
  assert.equal(receipt.reservesOpened, false);
  assert.equal(receipt.exactMatchedState, true);
  assert.equal(receipt.exactObservedWork, true);
  assert.equal(receipt.fieldId, receipt.request.fieldId);
  assert.deepEqual(receipt.publication, {
    receiptIncludedInSourceCommit: false,
    status: "generated-after-source-commit",
  });
  exactKeys(receipt.authority, ["evidence", "files", "sourceCommit", "verifier"],
    "receipt authority");
  const { evidence, verifier } = receipt.authority;
  exactKeys(evidence, ["blobOid", "repositoryPath", "sha256"],
    "evidence authority");
  exactKeys(verifier, ["blobOid", "exportName", "repositoryPath", "sha256"],
    "verifier authority");
  assert(Array.isArray(receipt.authority.files) &&
    receipt.authority.files.length >= 2, "source blob closure is absent");
  exactKeys(receipt.authority.sourceCommit, ["headCommit", "headTree"],
    "source commit authority");
  const { headCommit, headTree } = receipt.authority.sourceCommit;
  assert(GIT_OBJECT.test(headCommit));
  assert(GIT_OBJECT.test(headTree));
  assert.equal(git(repository, ["show", "-s", "--format=%T", headCommit]),
    headTree, "recorded source commit/tree binding is invalid");
  const seen = new Set();
  for (const item of receipt.authority.files) {
    exactKeys(item, ["blobOid", "repositoryPath", "sha256"],
      "committed source blob authority");
    assert(SHA256.test(item.sha256));
    assert(GIT_OBJECT.test(item.blobOid));
    assert.equal(seen.has(item.repositoryPath), false,
      "duplicate committed source authority");
    seen.add(item.repositoryPath);
    const filename = path.resolve(repository, item.repositoryPath);
    assert.equal(repositoryRelative(repository, filename), item.repositoryPath,
      "non-canonical authority path");
    assert.equal(fileDigest(filename), item.sha256,
      `${item.repositoryPath} authority changed`);
    assert.equal(git(repository,
      ["rev-parse", `${headCommit}:${item.repositoryPath}`]), item.blobOid,
    `${item.repositoryPath} blob identity changed`);
    const bytes = childProcess.execFileSync("git", ["-C", repository, "show",
      `${headCommit}:${item.repositoryPath}`], { encoding: null,
      stdio: ["ignore", "pipe", "pipe"] });
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),
      item.sha256, `${item.repositoryPath} commit content changed`);
  }
  const currentEvidence = JSON.parse(fs.readFileSync(
    path.resolve(repository, evidence.repositoryPath), "utf8"));
  const expectedPaths = replaySourcePaths(repository,
    path.resolve(repository, evidence.repositoryPath),
    path.resolve(repository, verifier.repositoryPath), currentEvidence)
    .map(filename => repositoryRelative(repository, filename)).sort();
  assert.deepEqual([...seen].sort(), expectedPaths,
    "receipt source blob closure is incomplete or contains extra files");
  assert.deepEqual(receipt.authority.evidence,
    receipt.authority.files.find(value =>
      value.repositoryPath === evidence.repositoryPath));
  const verifierBlob = { ...receipt.authority.verifier };
  delete verifierBlob.exportName;
  assert.deepEqual(verifierBlob, receipt.authority.files.find(value =>
    value.repositoryPath === verifier.repositoryPath));
  validatePair(receipt.pair.sagejs, receipt.pair.pari);
  const replay = replayProjection(loadReplay(
    path.resolve(repository, evidence.repositoryPath),
    path.resolve(repository, verifier.repositoryPath), verifier.exportName));
  assert.deepEqual(receipt.staticReplay, replay,
    "receipt static replay authority changed");
  return { authority: receipt.authority, staticReplay: replay,
    receiptSha256: digest(receipt) };
}

function writeDiagnosticReceipt(filename, receipt, options = {}) {
  const checked = verifyDiagnosticReceipt(receipt, options);
  const bytes = Buffer.from(`${JSON.stringify(receipt)}\n`);
  fs.writeFileSync(filename, bytes, { flag: "wx" });
  return { filename, receiptSha256: checked.receiptSha256,
    fileSha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}

function verifyDiagnosticReceiptFile(filename, options = {}) {
  const bytes = fs.readFileSync(filename);
  const receipt = JSON.parse(bytes);
  const checked = verifyDiagnosticReceipt(receipt, options);
  return { ...checked,
    fileSha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}

module.exports = Object.freeze({ DEFAULT_EVIDENCE, DEFAULT_VERIFIER,
  DEFAULT_VERIFIER_EXPORT, SCHEMA, digest, finalizeDiagnosticReceipt,
  replaySourcePaths, verifyDiagnosticReceipt, verifyDiagnosticReceiptFile,
  writeDiagnosticReceipt });

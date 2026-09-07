#!/usr/bin/env node
"use strict";

// Transport binding, NOT release authorization. A publisher must obtain this
// manifest from an authenticated producer, authenticate its expected digest,
// then still verify raw numerical evidence, product contents and signatures.
const fs = require("node:fs");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { inspectProductAcceptance } = require("./product-acceptance.cjs");
const repository = "sagemathinc/sagejs";
const schema = "sagejs.release-artifact-set/v1";
const roles = Object.freeze({
  native: Object.freeze(["sagejs-linux-x64", "sagejs-linux-arm64", "sagejs-windows-x64",
    "sagejs-macos-arm64", "sagejs-public-npm-root", "numerical-release-gate", "numerical-release-evidence"]),
  browser: Object.freeze(["wasm-clean-build-a", "sagejs-wasm-reproducible"]),
});
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const hash = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function identity(payload) { return hash(JSON.stringify(canonical(payload))); }
function api(endpoint) {
  try {
    return JSON.parse(execFileSync("gh", ["api", "--hostname", "github.com", endpoint], {
      encoding: "utf8", timeout: 60000, maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
    }));
  } catch { throw new Error("GitHub artifact inspection failed; no artifact set accepted"); }
}
function requireSource(sha, ref, event, purpose) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? "") || typeof ref !== "string" || !ref || /[\s\x00-\x1f]/.test(ref) ||
      !["push", "workflow_dispatch", "schedule"].includes(event) || !["qualification", "release"].includes(purpose) ||
      (purpose === "release" && (event !== "push" || !/^v\d+\.\d+\.\d+(?:\+release\.\d+)?$/.test(ref)))) {
    throw new Error("artifact set requires exact source/ref/event/purpose; release requires an immutable tag push");
  }
}
function readArtifacts(runId, request) {
  const artifacts = [], ids = new Set();
  let expected;
  for (let page = 1; page <= 100; page++) {
    const result = request(`repos/${repository}/actions/runs/${runId}/artifacts?per_page=100&page=${page}`);
    if (!Number.isSafeInteger(result?.total_count) || result.total_count < 1 || result.total_count > 10000 ||
        !Array.isArray(result.artifacts) || !result.artifacts.length || result.artifacts.length > 100) throw new Error("invalid artifact page");
    expected ??= result.total_count;
    if (expected !== result.total_count) throw new Error("artifact inventory changed during pagination");
    for (const artifact of result.artifacts) {
      if (!positive(artifact?.id) || ids.has(artifact.id)) throw new Error("duplicate or malformed artifact ID");
      ids.add(artifact.id); artifacts.push(artifact);
    }
    if (artifacts.length > expected) throw new Error("artifact pagination exceeded declared count");
    if (artifacts.length === expected) return artifacts;
  }
  throw new Error("artifact pagination exceeded inspection limit");
}
function artifactRecord(artifact, kind, name, context) {
  const run = artifact?.workflow_run;
  if (!positive(artifact?.id) || artifact.name !== name || artifact.expired !== false ||
      !digestPattern.test(artifact.digest ?? "") || !positive(artifact.size_in_bytes) ||
      typeof artifact.created_at !== "string" || !Number.isFinite(Date.parse(artifact.created_at)) ||
      run?.id !== context.runId || run.head_sha !== context.sourceRevision || run.head_branch !== context.ref ||
      run.repository_id !== context.repositoryId || run.head_repository_id !== context.repositoryId) {
    throw new Error(`artifact identity, availability or digest mismatch: ${kind}/${name}`);
  }
  return { key: `${kind}/${name}`, kind, name, id: artifact.id, archiveDigest: artifact.digest,
    sizeInBytes: artifact.size_in_bytes, createdAt: artifact.created_at };
}
function observationRecord(observation) {
  return { runId: observation.runId, runAttempt: observation.runAttempt, jobId: observation.jobId };
}
function captureArtifactSet(options, dependencies = {}) {
  const request = dependencies.api ?? api;
  const inspect = dependencies.inspect ?? inspectProductAcceptance;
  requireSource(options.sha, options.ref, options.event, options.purpose);
  const repo = request(`repos/${repository}`);
  if (repo?.full_name !== repository || !positive(repo.id)) throw new Error("unexpected artifact repository");
  const qualification = {}, artifacts = [];
  for (const kind of Object.keys(roles)) {
    const runId = options[`${kind}RunId`];
    if (!positive(runId)) throw new Error("artifact set requires both producer run IDs");
    const expectation = { kind, runId, sha: options.sha, ref: options.ref, event: options.event, purpose: options.purpose };
    qualification[kind] = observationRecord(inspect(expectation));
    const available = readArtifacts(runId, request);
    for (const name of roles[kind]) {
      const selected = available.filter((item) => item.name === name);
      if (selected.length !== 1) throw new Error(`expected one artifact for ${kind}/${name}`);
      const context = { runId, sourceRevision: options.sha, ref: options.ref, repositoryId: repo.id };
      const record = artifactRecord(selected[0], kind, name, context);
      // Re-read immutable IDs, not names, so an overwrite cannot redirect us.
      const current = artifactRecord(request(`repos/${repository}/actions/artifacts/${record.id}`), kind, name, context);
      if (identity(current) !== identity(record)) throw new Error("artifact changed during capture");
      artifacts.push(record);
    }
  }
  // Re-check BOTH producer boundaries after all artifact reads; an intervening
  // retry must not silently change which qualification attempt we freeze.
  for (const kind of Object.keys(roles)) {
    const current = inspect({ kind, runId: qualification[kind].runId, sha: options.sha,
      ref: options.ref, event: options.event, purpose: options.purpose });
    if (identity(observationRecord(current)) !== identity(qualification[kind])) throw new Error("qualification attempt changed during artifact capture");
  }
  const payload = { schema, repository, repositoryId: repo.id, sourceRevision: options.sha,
    ref: options.ref, event: options.event, purpose: options.purpose, qualification, artifacts };
  return validateArtifactSet({ ...payload, manifestDigest: identity(payload) });
}
function validateArtifactSet(value, expectedDigest) {
  if (!exactKeys(value, ["schema", "repository", "repositoryId", "sourceRevision", "ref", "event", "purpose", "qualification", "artifacts", "manifestDigest"]) ||
      value.schema !== schema || value.repository !== repository || !positive(value.repositoryId)) throw new Error("invalid artifact-set schema or repository");
  requireSource(value.sourceRevision, value.ref, value.event, value.purpose);
  const { manifestDigest, ...payload } = value;
  if (!digestPattern.test(manifestDigest ?? "") || identity(payload) !== manifestDigest ||
      (expectedDigest !== undefined && (!digestPattern.test(expectedDigest) || expectedDigest !== manifestDigest))) throw new Error("artifact-set manifest digest mismatch");
  if (!Array.isArray(value.artifacts) || value.artifacts.length !== Object.values(roles).flat().length ||
      !value.qualification || Object.keys(value.qualification).sort().join(",") !== "browser,native") throw new Error("incomplete artifact set");
  const ids = new Set(), keys = new Set();
  for (const kind of Object.keys(roles)) {
    const q = value.qualification[kind];
    if (!exactKeys(q, ["runId", "runAttempt", "jobId"]) || !positive(q.runId) || !positive(q.runAttempt) || !positive(q.jobId)) throw new Error("invalid qualification identity");
  }
  if (value.qualification.native.runId === value.qualification.browser.runId) throw new Error("native and browser runs must be distinct");
  for (const item of value.artifacts) {
    if (!exactKeys(item, ["key", "kind", "name", "id", "archiveDigest", "sizeInBytes", "createdAt"]) ||
        !Object.hasOwn(roles, item.kind) || !roles[item.kind].includes(item.name) || item.key !== `${item.kind}/${item.name}` ||
        !positive(item.id) || ids.has(item.id) || keys.has(item.key) ||
        !digestPattern.test(item.archiveDigest ?? "") || !positive(item.sizeInBytes) ||
        typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt))) throw new Error("invalid or duplicated artifact binding");
    ids.add(item.id); keys.add(item.key);
  }
  return value;
}
function verifyPinnedArtifacts(value, expectedDigest, request = api) {
  if (!digestPattern.test(expectedDigest ?? "")) throw new Error("supply the independently authenticated manifest digest");
  const manifest = validateArtifactSet(value, expectedDigest);
  for (const record of manifest.artifacts) {
    const current = artifactRecord(request(`repos/${repository}/actions/artifacts/${record.id}`), record.kind, record.name,
      { ...manifest, runId: manifest.qualification[record.kind].runId });
    if (identity(current) !== identity(record)) throw new Error(`pinned artifact changed: ${record.key}`);
  }
  return { manifestDigest: manifest.manifestDigest, status: "transport-verified", artifactCount: manifest.artifacts.length,
    authority: "artifact identity only; authenticate the manifest producer, product contents, raw evidence and signatures separately" };
}
async function verifyDownloadedArchive(value, expectedDigest, key, filename) {
  const manifest = validateArtifactSet(value, expectedDigest);
  if (!digestPattern.test(expectedDigest ?? "")) throw new Error("supply the independently authenticated manifest digest");
  const artifact = manifest.artifacts.find((item) => item.key === key);
  if (!artifact) throw new Error("unknown artifact key");
  let size = 0;
  const checksum = createHash("sha256");
  for await (const bytes of fs.createReadStream(filename)) { size += bytes.length; checksum.update(bytes); }
  if (size !== artifact.sizeInBytes || `sha256:${checksum.digest("hex")}` !== artifact.archiveDigest) throw new Error("downloaded archive differs from the pinned artifact");
  return { key, status: "archive-verified" };
}
function argumentsFor(args) {
  const [action, ...rest] = args, values = {};
  const allowed = action === "capture" ? ["--sha", "--ref", "--event", "--purpose", "--native-run", "--browser-run"] :
    action === "verify" ? ["--manifest", "--expected-digest"] :
    action === "verify-archive" ? ["--manifest", "--expected-digest", "--key", "--file"] : [];
  if (!allowed.length || rest.length !== allowed.length * 2) throw new Error("usage: artifact-set.cjs capture|verify|verify-archive with all required named arguments");
  for (let i = 0; i < rest.length; i += 2) {
    if (!allowed.includes(rest[i]) || Object.hasOwn(values, rest[i]) || !rest[i + 1] || rest[i + 1].startsWith("--")) throw new Error("invalid artifact-set arguments");
    values[rest[i]] = rest[i + 1];
  }
  if (action === "capture" && [values["--native-run"], values["--browser-run"]].some((x) => !/^[1-9][0-9]*$/.test(x))) throw new Error("invalid producer run ID");
  return { action, values };
}
async function main() {
  const { action, values: v } = argumentsFor(process.argv.slice(2));
  let result;
  if (action === "capture") result = captureArtifactSet({ sha: v["--sha"], ref: v["--ref"], event: v["--event"], purpose: v["--purpose"],
    nativeRunId: Number(v["--native-run"]), browserRunId: Number(v["--browser-run"]) });
  else {
    const manifest = JSON.parse(fs.readFileSync(v["--manifest"], "utf8"));
    result = action === "verify" ? verifyPinnedArtifacts(manifest, v["--expected-digest"]) :
      await verifyDownloadedArchive(manifest, v["--expected-digest"], v["--key"], v["--file"]);
  }
  console.log(JSON.stringify(result, null, 2));
}
if (require.main === module) main().catch(() => { console.error("Artifact-set operation failed; no acceptance granted. Check source, producer gates, artifact availability and pinned digests."); process.exitCode = 1; });
module.exports = { captureArtifactSet, validateArtifactSet, verifyPinnedArtifacts, verifyDownloadedArchive, readArtifacts,
  artifactRecord, argumentsFor, identity, roles };

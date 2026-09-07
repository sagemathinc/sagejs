#!/usr/bin/env node
"use strict";

// Authenticate the small retained transport manifest, not mathematical product
// contents. Control-tooling revision and product revision are deliberately
// separate so an uploader fix need not invalidate qualified executable bytes.
const fs = require("node:fs");
const { createHash } = require("node:crypto");
const { githubApi, jobsFromPages } = require("./product-acceptance.cjs");
const { validateArtifactSet, identity } = require("./artifact-set.cjs");
const { stageArtifactSet } = require("./stage-artifacts.cjs");
const { prepareArtifact } = require("./extract-artifact.cjs");
const repository = "sagemathinc/sagejs";
const workflow = ".github/workflows/release-artifact-handoff.yml";
const jobName = "Freeze qualified release artifact set v1";
const requiredSteps = ["Capture exact qualified artifact set", "Retain frozen artifact set"];
const maxArchiveBytes = 131072, maxManifestBytes = 65536;
const positive = (x) => Number.isSafeInteger(x) && x > 0;
const sha = (x) => /^[a-f0-9]{40}$/.test(x ?? "");

function expectations(options) {
  if (![options.runId, options.runAttempt, options.artifactId].every(positive) || !sha(options.controlSha) || !sha(options.sha) ||
      !["push", "workflow_dispatch"].includes(options.event) || !["qualification", "release"].includes(options.purpose) ||
      typeof options.ref !== "string" || !options.ref || /[\s\x00-\x1f]/.test(options.ref)) throw new Error("explicit handoff and product identities required");
}
function validateRun(run, options) {
  if (run?.id !== options.runId || run.run_attempt !== options.runAttempt || run.head_sha !== options.controlSha ||
      run.path !== workflow || run.event !== "workflow_dispatch" || run.status !== "completed" || run.conclusion !== "success" ||
      run.repository?.full_name !== repository || run.head_repository?.full_name !== repository ||
      !positive(run.repository.id) || run.head_repository.id !== run.repository.id || typeof run.head_branch !== "string") {
    throw new Error("handoff control workflow/attempt/source did not succeed");
  }
}
function validateArtifact(artifact, run, options, job) {
  const origin = artifact?.workflow_run;
  const created = Date.parse(artifact?.created_at);
  if (artifact?.id !== options.artifactId || artifact.name !== `sagejs-artifact-set-attempt-${options.runAttempt}` ||
      artifact.expired !== false || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest ?? "") ||
      !positive(artifact.size_in_bytes) || artifact.size_in_bytes > maxArchiveBytes ||
      origin?.id !== options.runId || origin.head_sha !== options.controlSha || origin.head_branch !== run.head_branch ||
      origin.repository_id !== run.repository.id || origin.head_repository_id !== run.repository.id ||
      !Number.isFinite(created) || !(created >= Date.parse(job.started_at) && created <= Date.parse(job.completed_at))) {
    throw new Error("handoff artifact is unavailable or does not belong to the pinned capture attempt");
  }
}
function readManifestZip(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 22 || bytes.length > maxArchiveBytes) throw new Error("handoff ZIP exceeds size limit");
  let count = 0, length;
  // Existing dependency; no extraction to disk or execution. Filter every ZIP
  // member before decompression, rejecting duplicates and directory/path tricks.
  const files = require("fflate").unzipSync(bytes, { filter(file) {
    if (++count !== 1 || file.name !== "artifact-set.json" ||
        !positive(file.originalSize) || file.originalSize > maxManifestBytes ||
        !positive(file.size) || file.size > maxArchiveBytes || ![0, 8].includes(file.compression)) throw new Error("invalid handoff ZIP member");
    length = file.originalSize;
    return true;
  } });
  const manifest = files["artifact-set.json"];
  if (count !== 1 || !manifest || manifest.length !== length) throw new Error("handoff ZIP must contain exactly one bounded manifest");
  return validateArtifactSet(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifest)));
}
function verifyHandoffArchive(options, request = githubApi) {
  expectations(options);
  const endpoint = `repos/${repository}/actions/runs/${options.runId}/attempts/${options.runAttempt}`;
  const before = request(endpoint);
  validateRun(before, options);
  const jobs = jobsFromPages(request(`${endpoint}/jobs?per_page=100`, true), before);
  if (jobs.length !== 1 || jobs[0].name !== jobName || jobs[0].status !== "completed" || jobs[0].conclusion !== "success") throw new Error("handoff requires its single successful capture job");
  for (const name of requiredSteps) {
    const steps = jobs[0].steps?.filter((step) => step.name === name);
    if (steps?.length !== 1 || steps[0].status !== "completed" || steps[0].conclusion !== "success") throw new Error("handoff capture or retention step did not succeed");
  }
  const artifactEndpoint = `repos/${repository}/actions/artifacts/${options.artifactId}`;
  const artifact = request(artifactEndpoint);
  validateArtifact(artifact, before, options, jobs[0]);
  const stat = fs.lstatSync(options.filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== artifact.size_in_bytes) throw new Error("handoff archive must be an ordinary file with the pinned size");
  const bytes = fs.readFileSync(options.filename);
  if (`sha256:${createHash("sha256").update(bytes).digest("hex")}` !== artifact.digest) throw new Error("handoff ZIP digest mismatch");
  const manifest = readManifestZip(bytes);
  if (manifest.sourceRevision !== options.sha || manifest.ref !== options.ref || manifest.event !== options.event ||
      manifest.purpose !== options.purpose || manifest.repositoryId !== before.repository.id) throw new Error("handoff product identity does not match the requested candidate");
  const currentArtifact = request(artifactEndpoint);
  validateArtifact(currentArtifact, before, options, jobs[0]);
  if (identity(currentArtifact) !== identity(artifact)) throw new Error("handoff artifact changed during inspection");
  const after = request(endpoint);
  validateRun(after, options);
  if (after.head_branch !== before.head_branch || after.repository.id !== before.repository.id) throw new Error("handoff workflow identity changed during inspection");
  return { manifest, authentication: { schema: "sagejs.artifact-handoff-authentication/v1", repository, workflow,
    controlRevision: options.controlSha, runId: options.runId, runAttempt: options.runAttempt, jobId: jobs[0].id,
    artifactId: options.artifactId, archiveDigest: artifact.digest, manifestDigest: manifest.manifestDigest,
    authority: "trusted transport handoff only; inner product/signature/raw-evidence validation still required" } };
}
async function stageHandoff(options, dependencies = {}) {
  const accepted = verifyHandoffArchive(options, dependencies.api ?? githubApi);
  const staged = await stageArtifactSet({ ...dependencies.staging, manifest: accepted.manifest,
    expectedDigest: accepted.authentication.manifestDigest, directory: options.directory, signal: options.signal });
  return { ...accepted, staged };
}
async function prepareHandoff(options, dependencies = {}) {
  const accepted = await stageHandoff(options, dependencies);
  const expanded = [];
  for (const artifact of accepted.staged.artifacts) {
    options.signal?.throwIfAborted();
    const result = await prepareArtifact({ manifest: accepted.manifest, expectedDigest: accepted.authentication.manifestDigest,
      key: artifact.key, filename: artifact.filename, directory: options.directory, signal: options.signal });
    expanded.push({ key: artifact.key, directory: result.directory, reused: result.reused, ...result.value });
  }
  return { ...accepted, expanded, authority: "authenticated transport layout only; final product and raw-evidence verification still required" };
}
function argumentsFor(args) {
  const [action, ...rest] = args;
  const names = ["--run-id", "--attempt", "--artifact-id", "--control-sha", "--sha", "--ref", "--event", "--purpose", "--archive"];
  if (["stage", "prepare"].includes(action)) names.push("--directory");
  if (!["verify", "stage", "prepare"].includes(action) || rest.length !== names.length * 2) throw new Error("provide exact handoff, product and local archive identities");
  const v = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!names.includes(rest[i]) || Object.hasOwn(v, rest[i]) || !rest[i + 1] || rest[i + 1].startsWith("--")) throw new Error("invalid handoff arguments");
    v[rest[i]] = rest[i + 1];
  }
  for (const name of ["--run-id", "--attempt", "--artifact-id"]) if (!/^[1-9][0-9]*$/.test(v[name])) throw new Error("invalid handoff integer");
  const options = { runId: Number(v["--run-id"]), runAttempt: Number(v["--attempt"]), artifactId: Number(v["--artifact-id"]),
    controlSha: v["--control-sha"], sha: v["--sha"], ref: v["--ref"], event: v["--event"], purpose: v["--purpose"],
    filename: v["--archive"], directory: v["--directory"] };
  expectations(options); return { action, options };
}
async function main() {
  const { action, options } = argumentsFor(process.argv.slice(2));
  const controller = new AbortController(), cancel = () => controller.abort();
  process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
  try {
    const result = action === "verify" ? verifyHandoffArchive(options) : await (action === "prepare" ? prepareHandoff : stageHandoff)({ ...options, signal: controller.signal });
    controller.signal.throwIfAborted();
    console.log(JSON.stringify(result, null, 2));
  } finally { process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel); }
}
if (require.main === module) main().catch(() => { console.error("Artifact handoff authentication/staging failed; no release authorization granted."); process.exitCode = 1; });
module.exports = { verifyHandoffArchive, stageHandoff, prepareHandoff, readManifestZip, argumentsFor, workflow, jobName, requiredSteps };

"use strict";

// Shared trust boundary for small artifacts emitted by a reviewed single-job
// control workflow. Callers supply the expected control SHA independently, not
// from the artifact being authenticated. This is transport, not product policy.
const fs = require("node:fs"), { createHash } = require("node:crypto");
const { githubApi, jobsFromPages } = require("./product-acceptance.cjs");
const { identity } = require("./artifact-set.cjs");
const repository = "sagemathinc/sagejs";
const maxArchiveBytes = 131072, maxJsonBytes = 65536;
const positive = (x) => Number.isSafeInteger(x) && x > 0;
function expectations(options) {
  if (![options.runId, options.runAttempt, options.artifactId].every(positive) || !/^[a-f0-9]{40}$/.test(options.controlSha ?? "")) throw new Error("explicit control run/attempt/artifact/source identities required");
}
function validateRun(run, options, contract) {
  if (run?.id !== options.runId || run.run_attempt !== options.runAttempt || run.head_sha !== options.controlSha ||
      run.path !== contract.workflow || run.event !== "workflow_dispatch" || run.status !== "completed" || run.conclusion !== "success" ||
      run.repository?.full_name !== repository || run.head_repository?.full_name !== repository ||
      !positive(run.repository.id) || run.head_repository.id !== run.repository.id || typeof run.head_branch !== "string") throw new Error("control workflow/attempt/source did not succeed");
}
function validateArtifact(artifact, run, options, contract, job) {
  const origin = artifact?.workflow_run, created = Date.parse(artifact?.created_at);
  if (artifact?.id !== options.artifactId || artifact.name !== `${contract.artifactPrefix}${options.runAttempt}` || artifact.expired !== false ||
      !/^sha256:[a-f0-9]{64}$/.test(artifact.digest ?? "") || !positive(artifact.size_in_bytes) || artifact.size_in_bytes > maxArchiveBytes ||
      origin?.id !== options.runId || origin.head_sha !== options.controlSha || origin.head_branch !== run.head_branch ||
      origin.repository_id !== run.repository.id || origin.head_repository_id !== run.repository.id ||
      !Number.isFinite(created) || !(created >= Date.parse(job.started_at) && created <= Date.parse(job.completed_at))) throw new Error("control artifact is unavailable or does not belong to the pinned attempt");
}
function inspectControlArtifact(options, contract, api = githubApi) {
  expectations(options);
  const endpoint = `repos/${repository}/actions/runs/${options.runId}/attempts/${options.runAttempt}`;
  const run = api(endpoint); validateRun(run, options, contract);
  const jobs = jobsFromPages(api(`${endpoint}/jobs?per_page=100`, true), run);
  if (jobs.length !== 1 || jobs[0].name !== contract.jobName || jobs[0].status !== "completed" || jobs[0].conclusion !== "success") throw new Error("control artifact requires its single successful job");
  const job = jobs[0];
  for (const name of contract.requiredSteps) {
    const steps = job.steps?.filter((step) => step.name === name);
    if (steps?.length !== 1 || steps[0].status !== "completed" || steps[0].conclusion !== "success") throw new Error("required control verification or retention step did not succeed");
  }
  const artifactEndpoint = `repos/${repository}/actions/artifacts/${options.artifactId}`, artifact = api(artifactEndpoint);
  validateArtifact(artifact, run, options, contract, job);
  return { endpoint, artifactEndpoint, run, job, artifact };
}
function readJsonZip(bytes, name) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 22 || bytes.length > maxArchiveBytes) throw new Error("control ZIP exceeds size limit");
  let count = 0, length;
  const files = require("fflate").unzipSync(bytes, { filter(file) {
    if (++count !== 1 || file.name !== name || !positive(file.originalSize) || file.originalSize > maxJsonBytes ||
        !positive(file.size) || file.size > maxArchiveBytes || ![0, 8].includes(file.compression)) throw new Error("invalid control ZIP member");
    length = file.originalSize; return true;
  } });
  if (count !== 1 || !files[name] || files[name].length !== length) throw new Error("control ZIP must contain exactly one bounded JSON member");
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(files[name]));
}
function verifyControlArtifact(options, contract, consume, api = githubApi) {
  const { endpoint, artifactEndpoint, run, job, artifact } = inspectControlArtifact(options, contract, api);
  const stat = fs.lstatSync(options.filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== artifact.size_in_bytes) throw new Error("control archive must be an ordinary file with the pinned size");
  const bytes = fs.readFileSync(options.filename);
  if (`sha256:${createHash("sha256").update(bytes).digest("hex")}` !== artifact.digest) throw new Error("control ZIP digest mismatch");
  const value = consume(bytes, run);
  const currentArtifact = api(artifactEndpoint); validateArtifact(currentArtifact, run, options, contract, job);
  if (identity(currentArtifact) !== identity(artifact)) throw new Error("control artifact changed during inspection");
  const after = api(endpoint); validateRun(after, options, contract);
  if (after.head_branch !== run.head_branch || after.repository.id !== run.repository.id) throw new Error("control workflow identity changed during inspection");
  return { value, authentication: { repository, workflow: contract.workflow, controlRevision: options.controlSha,
    runId: options.runId, runAttempt: options.runAttempt, jobId: job.id, artifactId: options.artifactId, archiveDigest: artifact.digest } };
}
module.exports = { inspectControlArtifact, verifyControlArtifact, readJsonZip };

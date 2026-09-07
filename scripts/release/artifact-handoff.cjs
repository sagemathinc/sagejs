#!/usr/bin/env node
"use strict";

// Authenticate the small retained transport manifest, not mathematical product
// contents. Control-tooling revision and product revision are deliberately
// separate so an uploader fix need not invalidate qualified executable bytes.
const { githubApi } = require("./product-acceptance.cjs");
const { validateArtifactSet } = require("./artifact-set.cjs");
const { verifyControlArtifact, readJsonZip } = require("./control-artifact.cjs");
const { stageArtifactSet } = require("./stage-artifacts.cjs");
const { prepareArtifact } = require("./extract-artifact.cjs");
const workflow = ".github/workflows/release-artifact-handoff.yml";
const jobName = "Freeze qualified release artifact set v1";
const requiredSteps = ["Capture exact qualified artifact set", "Retain frozen artifact set"];
const contract = Object.freeze({ workflow, jobName, requiredSteps, artifactPrefix: "sagejs-artifact-set-attempt-" });
const positive = (x) => Number.isSafeInteger(x) && x > 0;
const sha = (x) => /^[a-f0-9]{40}$/.test(x ?? "");

function expectations(options) {
  if (![options.runId, options.runAttempt, options.artifactId].every(positive) || !sha(options.controlSha) || !sha(options.sha) ||
      !["push", "workflow_dispatch"].includes(options.event) || !["qualification", "release"].includes(options.purpose) ||
      typeof options.ref !== "string" || !options.ref || /[\s\x00-\x1f]/.test(options.ref)) throw new Error("explicit handoff and product identities required");
}
function readManifestZip(bytes) {
  return validateArtifactSet(readJsonZip(bytes, "artifact-set.json"));
}
function verifyHandoffArchive(options, request = githubApi) {
  expectations(options);
  const accepted = verifyControlArtifact(options, contract, (bytes, run) => {
    const manifest = readManifestZip(bytes);
    if (manifest.sourceRevision !== options.sha || manifest.ref !== options.ref || manifest.event !== options.event ||
        manifest.purpose !== options.purpose || manifest.repositoryId !== run.repository.id) throw new Error("handoff product identity does not match the requested candidate");
    return manifest;
  }, request);
  const manifest = accepted.value;
  return { manifest, authentication: { schema: "sagejs.artifact-handoff-authentication/v1", ...accepted.authentication, manifestDigest: manifest.manifestDigest,
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
module.exports = { verifyHandoffArchive, stageHandoff, prepareHandoff, readManifestZip, argumentsFor, workflow, jobName, requiredSteps, contract };

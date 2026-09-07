#!/usr/bin/env node
"use strict";

// Read-only product acceptance for the existing app deployer. Artifact bytes,
// numerical evidence, main ancestry and origin checks remain separate gates.
const fs = require("node:fs");
const { inspectProductAcceptance, githubApi } = require("./product-acceptance.cjs");
const repository = "sagemathinc/sagejs";

function inspectDeploymentInputs(options, api = githubApi) {
  for (const id of [options.sourceRunId, options.qualificationRunId]) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("deployment requires two positive run IDs");
  }
  if (!["preview", "production"].includes(options.target)) throw new Error("invalid deployment target");
  if (options.target === "preview" && !/^[a-z0-9][a-z0-9-]{0,38}$/.test(options.previewName ?? "")) throw new Error("invalid preview name");
  const browserRun = api(`repos/${repository}/actions/runs/${options.sourceRunId}`);
  const nativeRun = api(`repos/${repository}/actions/runs/${options.qualificationRunId}`);
  if (!/^[a-f0-9]{40}$/.test(browserRun?.head_sha ?? "") || nativeRun?.head_sha !== browserRun.head_sha) {
    throw new Error("browser and numerical qualification sources differ or are invalid");
  }
  if (nativeRun.event !== "push") throw new Error("deployment requires a pushed native qualification source");
  const inspect = (kind, run, runId) => inspectProductAcceptance({ kind, runId,
    sha: browserRun.head_sha, ref: run.head_branch, event: run.event,
    purpose: run.event === "push" && /^v\d+\.\d+\.\d+(?:\+release\.\d+)?$/.test(run.head_branch) ? "release" : "qualification",
  }, api);
  const browser = inspect("browser", browserRun, options.sourceRunId);
  const native = inspect("native", nativeRun, options.qualificationRunId);
  // Inspection of the second run must not hide a rerun of the first. No claim
  // of cross-run atomicity: selected immutable artifact IDs must also be bound
  // by the artifact consumer, and activation rechecks this observation.
  for (const accepted of [browser, native]) {
    const after = api(`repos/${repository}/actions/runs/${accepted.runId}`);
    if (after.run_attempt !== accepted.runAttempt || after.head_sha !== accepted.sourceRevision) throw new Error("product attempt changed during deployment inspection");
  }
  return { schema: "sagejs.deployment-product-inputs/v1", sourceRevision: browserRun.head_sha,
    branch: options.target === "production" ? "main" : `preview-${options.previewName}-${browserRun.head_sha.slice(0, 12)}`,
    browser, native };
}

function identity(value) {
  return [value?.sourceRevision, value?.branch, ...[value?.browser, value?.native].flatMap((r) =>
    [r?.repository, r?.workflow, r?.sourceRevision, r?.ref, r?.event, r?.runId, r?.runAttempt, r?.jobId])];
}
function requireSameDeploymentInputs(previous, current) {
  if (previous?.schema !== current.schema || JSON.stringify(identity(previous)) !== JSON.stringify(identity(current))) {
    throw new Error("deployment product identity changed; repeat artifact preparation before activation");
  }
}
if (require.main === module) {
  try {
    for (const name of ["SOURCE_RUN_ID", "QUALIFICATION_RUN_ID"]) {
      if (!/^[1-9][0-9]*$/.test(process.env[name] ?? "")) throw new Error("invalid deployment run ID");
    }
    const observation = inspectDeploymentInputs({ sourceRunId: Number(process.env.SOURCE_RUN_ID),
      qualificationRunId: Number(process.env.QUALIFICATION_RUN_ID), target: process.env.TARGET, previewName: process.env.PREVIEW_NAME });
    if (process.argv.length === 4 && process.argv[2] === "--recheck") {
      requireSameDeploymentInputs(JSON.parse(fs.readFileSync(process.argv[3], "utf8")), observation);
    } else if (process.argv.length !== 2) throw new Error("invalid deployment inspection arguments");
    console.log(JSON.stringify(observation));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { inspectDeploymentInputs, requireSameDeploymentInputs };

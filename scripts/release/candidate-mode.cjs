#!/usr/bin/env node
"use strict";

// Admission for the explicit, non-publishing CI qualification path. This does
// not qualify any artifact; the complete producer/gate closure still must pass.
const { execFileSync } = require("node:child_process");
function validateCandidateRequest({ kind, event, ref, sha, checkoutSha, inputs }) {
  if (!["native", "browser"].includes(kind)) throw new Error("unknown qualification workflow kind");
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) throw new Error("invalid qualification inputs");
  if (inputs.prepared_request || inputs.publish_prepared) throw new Error("prepared artifact consumption cannot invoke a producer campaign");
  if (inputs.qualify_release !== undefined && typeof inputs.qualify_release !== "boolean") throw new Error("qualify_release must be boolean");
  if (inputs.qualify_release !== true) {
    if (inputs.candidate_sha) throw new Error("candidate_sha requires qualify_release=true");
    return { qualifyRelease: false };
  }
  if (event !== "workflow_dispatch" || typeof ref !== "string" || !ref.startsWith("refs/heads/")) {
    throw new Error("pre-tag qualification requires a manual branch dispatch");
  }
  if (!/^[a-f0-9]{40}$/.test(inputs.candidate_sha ?? "") ||
      sha !== inputs.candidate_sha || checkoutSha !== inputs.candidate_sha) {
    throw new Error("candidate_sha must match the exact dispatched and checked-out source");
  }
  if (kind === "native" && (inputs.platform_smoke !== false || inputs.native_targets !== "all" ||
      (inputs.recovery_run_id ?? "") !== "" || (inputs.recovery_tag ?? "") !== "")) {
    throw new Error("full qualification requires platform_smoke=false, native_targets=all and no publication recovery request");
  }
  return { qualifyRelease: true, candidateSha: inputs.candidate_sha, purpose: "qualification", publishes: false };
}
if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw new Error("specify native or browser workflow kind");
    let inputs;
    try { inputs = JSON.parse(process.env.SAGEJS_RELEASE_INPUTS ?? "{}"); }
    catch { throw new Error("invalid qualification input JSON"); }
    const checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "pipe"] }).trim();
    console.log(JSON.stringify(validateCandidateRequest({ kind: process.argv[2], event: process.env.GITHUB_EVENT_NAME,
      ref: process.env.GITHUB_REF, sha: process.env.GITHUB_SHA, checkoutSha, inputs })));
  } catch (error) {
    console.error(error.code ? "Cannot inspect the qualification checkout" : error.message);
    process.exitCode = 1;
  }
}
module.exports = { validateCandidateRequest };

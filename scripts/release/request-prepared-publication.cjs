#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const { requestFromInputs } = require("./publish-prepared.cjs");

// This helper only dispatches the protected, npm-trusted workflow. It neither
// publishes nor reruns a producer; that workflow reauthenticates every input.
function dispatchArguments(raw) {
  const { request } = requestFromInputs({ prepared_request: raw, publish_prepared: true });
  return ["workflow", "run", ".github/workflows/ci.yml",
    "--repo", "sagemathinc/sagejs", "--ref", request.tag,
    "--raw-field", `prepared_request=${JSON.stringify(request)}`,
    "--field", "publish_prepared=true"];
}

if (require.main === module) {
  try {
    execFileSync("gh", dispatchArguments(process.env.PREPARED_REQUEST), { stdio: "inherit" });
  } catch (error) {
    console.error("Prepared publication request failed; no producer rerun was requested.");
    process.exitCode = 1;
  }
}

module.exports = { dispatchArguments };

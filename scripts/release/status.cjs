"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function validateCandidate(candidate) {
  if (!/^[0-9a-f]{40}$/.test(candidate || "")) throw new Error("full candidate SHA required");
}

// A status read never modifies a lock or launches work. An unreachable remote
// owner or EPERM is unknown, not evidence of termination.
function ownerState(owner, { hostname = os.hostname(), probe = process.kill } = {}) {
  if (!owner || owner.host !== hostname || !Number.isSafeInteger(owner.pid) || owner.pid <= 0) return "unknown";
  try { probe(owner.pid, 0); return "live"; }
  catch (error) { return error.code === "ESRCH" ? "missing" : "unknown"; }
}

function readStatus(root, candidate, options) {
  validateCandidate(candidate);
  const directory = path.join(root, "build/release-runner", candidate);
  const filename = path.join(directory, "status.json");
  let journal;
  try { journal = JSON.parse(fs.readFileSync(filename, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return { candidate, state: "unrecorded", ownerState: "unknown" };
    throw new Error(`cannot read release status: ${error.message}`);
  }
  if (journal.schema !== "sagejs.release-run/v1" || journal.source?.commit !== candidate) {
    throw new Error("invalid release status identity/schema");
  }
  return { ...journal, ownerState: journal.state === "running" ? ownerState(journal.owner, options) : "terminal",
    note: "Scheduling status only; not qualification or publication authority. Inspect child processes before recovering a missing owner." };
}

module.exports = { readStatus, ownerState, validateCandidate };

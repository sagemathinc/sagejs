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

function readStatus(root, candidate, options = {}) {
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
  const observed = options.now ?? Date.now();
  if (!Number.isFinite(observed)) throw new Error("invalid status observation time");
  const age = (timestamp) => {
    const parsed = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
    return Number.isFinite(parsed) && parsed <= observed ? (observed - parsed) / 1000 : null;
  };
  // Do not rewrite the durable journal or present observation age as proof of
  // execution. A missing/remote owner may have stopped long ago. Only a locally
  // live owner gets a wall-time estimate; even then it is not a progress probe.
  const owner = journal.state === "running" ? ownerState(journal.owner, options) : "terminal";
  const live = owner === "live";
  return { ...journal, ownerState: owner,
    observation: {
      observedAt: new Date(observed).toISOString(),
      journalAgeSeconds: age(journal.updated),
      elapsedSeconds: live ? age(journal.started) : null,
      activeStages: (journal.stages || []).filter((stage) => ["running", "checking"].includes(stage.state))
        .map((stage) => ({ id: stage.id, state: stage.state,
          elapsedSeconds: live ? age(stage.started) : null })),
      authority: "Read-time wall-clock estimates only; not evidence of child progress or health.",
    },
    note: "Scheduling status only; not qualification or publication authority. Inspect child processes before recovering a missing owner." };
}

module.exports = { readStatus, ownerState, validateCandidate };

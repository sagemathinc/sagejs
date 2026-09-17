#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const api = require("./row34_real_cubic_presentation_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const COORDINATOR = path.join(__dirname, "row34_real_cubic_presentation_coordinator.cjs");
const expected = {
  3: { digest: api.FIELDS[3].w0, classNumber: "6", invariants: ["6"] },
  4: { digest: api.FIELDS[4].w0, classNumber: "2", invariants: ["2"] },
};

function check(panelIndex, selected, output) {
  const run = spawnSync("node", [COORDINATOR, "--panel-index", String(panelIndex),
    "--pristine-w0", selected, "--pristine-sha256", expected[panelIndex].digest,
    "--output-dir", output], { cwd: ROOT, encoding: "utf8", timeout: 600_000,
    maxBuffer: 256 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(run.stderr || `row ${panelIndex} coordinator exited ${run.status}`);
  const receipt = JSON.parse(run.stdout);
  const owner = JSON.parse(fs.readFileSync(receipt.path));
  api.verifyOwner(owner, owner.ancestry);
  if ((fs.statSync(receipt.path).mode & 0o777) !== 0o444 ||
      owner.presentation.classNumber !== expected[panelIndex].classNumber ||
      JSON.stringify(owner.presentation.invariants) !== JSON.stringify(expected[panelIndex].invariants) ||
      owner.completion.publicComplete !== false || owner.completion.classWitnessesComplete !== false)
    throw new Error(`row ${panelIndex} presentation boundary changed`);
  return { panelIndex, owner: path.basename(receipt.path), sha256: receipt.sha256,
    classNumber: owner.presentation.classNumber, invariants: owner.presentation.invariants,
    hnfState: owner.replay.hnfState };
}

if (process.argv.length !== 4) {
  process.stderr.write("usage: check_row34_real_cubic_presentation.cjs ROW3_W0 ROW4_W0\n");
  process.exit(2);
}
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "row34-real-cubic-"));
try {
  const result = [check(3, path.resolve(process.argv[2]), temporary),
    check(4, path.resolve(process.argv[3]), temporary)];
  process.stdout.write(`${JSON.stringify({ ok: true, presentations: result })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

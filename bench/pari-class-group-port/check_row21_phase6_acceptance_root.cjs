"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const host = require("./row21_phase6_acceptance_host.cjs");
const source = require("./row21_phase6_acceptance_source.cjs");

function stable(value) { return `${JSON.stringify(value)}\n`; }
function sha(value) { return crypto.createHash("sha256").update(value).digest("hex"); }

async function main() {
  const resident = await host.prepareResident();
  const first = host.runInvocation(resident), second = host.runInvocation(resident);
  assert.deepEqual(second.projection, first.projection);
  assert.deepEqual(first.projection.terminalState, ["0", "0", "0", "0", "2"]);
  assert.deepEqual(first.projection.connectedState, ["0", "0", "3", "8", "32"]);
  assert.deepEqual(first.projection.analyticState, ["2135", "321"]);
  assert.deepEqual(first.projection.postHnfState, ["0", "8", "1"]);
  assert.deepEqual(first.projection.multipleState, ["0", "0", "185", "2"]);
  assert.deepEqual(first.projection.acceptanceState, ["2", "0", "0"]);
  assert.deepEqual(first.projection.reconstructionState, ["0", "5", "189", "3"]);
  assert.equal(first.projection.classNumber, "1");
  const projection = stable(first.projection);
  process.stdout.write(stable({
    schema: "sagejs.pari-class-group/row21-phase6-acceptance-check-v1",
    firstKernelNanoseconds: first.kernelNanoseconds,
    secondKernelNanoseconds: second.kernelNanoseconds,
    projectionSha256: sha(projection), projection: first.projection,
    generatedSourceSha256: sha(fs.readFileSync(source.OUTPUT)),
    coreSourceSha256: sha(fs.readFileSync(resident.built.coreSourcePath)),
    coreSourceBytes: fs.statSync(resident.built.coreSourcePath).size,
    deterministic: true, boundary: first.boundary,
    timingQualification: "diagnostic-only; no matched PARI comparison",
  }));
}

main().catch(error => { console.error(error?.stack || error); process.exitCode = 1; });

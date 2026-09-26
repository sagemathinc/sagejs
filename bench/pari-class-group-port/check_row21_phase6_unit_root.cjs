"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const zlib = require("node:zlib");
const host = require("./row21_phase6_unit_host.cjs");
const source = require("./row21_phase6_unit_source.cjs");

const REFERENCE =
  "/scratch/sagejs-row21-live-unit-owner/" +
  "row21-live-units-8d474d9ddbcaa1d8cfca584b089e666100f143834105ce393f82f34b0140fcd9.json.gz";
function stable(value) { return `${JSON.stringify(value)}\n`; }
function sha(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function flatten(columns) { return columns.flat().map(String); }

async function main() {
  const resident = await host.prepareResident();
  const beforeUsage = process.resourceUsage();
  const first = host.runInvocation(resident), second = host.runInvocation(resident);
  const afterUsage = process.resourceUsage();
  assert.deepEqual(second.projection, first.projection);
  // Keep the answer-bearing oracle out of memory until both resident
  // computations have finished.  This makes the no-fixture input boundary
  // mechanically inspectable rather than merely relying on lack of data flow.
  const referenceRaw = zlib.gunzipSync(fs.readFileSync(REFERENCE));
  const reference = JSON.parse(referenceRaw);
  assert.equal(reference.schema, "sagejs.pari-class-group/row21-live-unit-owner-v1");
  const p = first.projection;
  assert.deepEqual(p.terminalState,
    ["0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "1", "1"]);
  assert.deepEqual(p.acceptanceState, ["2", "0", "0"]);
  assert.deepEqual(p.integerTransform, reference.transforms.integerLll);
  assert.deepEqual(p.realTransform, reference.transforms.realLll);
  assert.deepEqual(p.relationToUnit, reference.transforms.relationToUnit);
  assert.deepEqual(p.factor, reference.transforms.getfuFactor);
  assert.deepEqual(p.units, flatten(reference.units.exactIntegralBasis));
  assert.deepEqual(p.inverses, flatten(reference.units.exactInverseIntegralBasis));
  assert.deepEqual(p.norms, reference.units.norms);
  assert.deepEqual(p.realSigns, flatten(reference.units.realSigns));
  assert.deepEqual(p.integerState, reference.replay.integerLatticeState);
  assert.deepEqual(p.realState, reference.replay.realLatticeState);
  assert.deepEqual(p.cleanState, reference.replay.cleanarchState);
  assert.deepEqual(p.getfuRealState, reference.replay.getfuRealLatticeState);
  assert.deepEqual(p.getfuState, reference.replay.getfuState);
  assert.deepEqual(p.logsReal, reference.replay.outputLogs.real);
  assert.deepEqual(p.logsImag, reference.replay.outputLogs.imaginary);
  const sixHundredSeconds = 600_000_000_000n;
  assert(BigInt(first.kernelNanoseconds) < sixHundredSeconds);
  assert(BigInt(second.kernelNanoseconds) < sixHundredSeconds);
  const maxRssKiB = Math.max(beforeUsage.maxRSS, afterUsage.maxRSS);
  assert(maxRssKiB < 4 * 1024 * 1024);
  const core = fs.readFileSync(resident.built.coreSourcePath, "utf8");
  for (const forbidden of ["napi_", "PyObject", "child_process", "writeFileSync"])
    assert.equal(core.includes(forbidden), false, `forbidden timed-core token ${forbidden}`);
  process.stdout.write(stable({
    schema: "sagejs.pari-class-group/row21-phase6-unit-check-v1",
    firstKernelNanoseconds: first.kernelNanoseconds,
    secondKernelNanoseconds: second.kernelNanoseconds,
    projectionSha256: sha(stable(p)), generatedSourceSha256: sha(fs.readFileSync(source.OUTPUT)),
    coreSourceSha256: sha(core), coreSourceBytes: Buffer.byteLength(core),
    referenceRawSha256: sha(referenceRaw), deterministic: true,
    exactReferenceAgreement: true, comparedReferenceFields: Object.freeze([
      "transforms", "units", "inverses", "norms", "realSigns",
      "stageStates", "outputLogs",
    ]), maxRssKiB,
    resourceUsageDelta: Object.freeze({
      userCpuMicros: afterUsage.userCPUTime - beforeUsage.userCPUTime,
      systemCpuMicros: afterUsage.systemCPUTime - beforeUsage.systemCPUTime,
    }), boundary: first.boundary,
    timingQualification: "diagnostic-only; no matched PARI comparison",
    underFourGiBAndSixHundredSeconds:
      maxRssKiB < 4 * 1024 * 1024 &&
      BigInt(first.kernelNanoseconds) < sixHundredSeconds &&
      BigInt(second.kernelNanoseconds) < sixHundredSeconds,
  }));
}

main().catch(error => { console.error(error?.stack || error); process.exitCode = 1; });

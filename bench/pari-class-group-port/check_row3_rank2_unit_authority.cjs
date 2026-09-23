#!/usr/bin/env node
// sagejs-test-tier: specialized
// sagejs-test-platform: linux
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const api = require("./row3_rank2_unit_authority_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const COORDINATOR = path.join(__dirname, "row3_rank2_unit_authority_coordinator.cjs");
if (process.argv.length !== 4) {
  process.stderr.write("usage: check_row3_rank2_unit_authority.cjs PRESENTATION ROW3_W0\n");
  process.exit(2);
}
const presentationPath = path.resolve(process.argv[2]);
const w0Path = path.resolve(process.argv[3]);
const presentation = JSON.parse(fs.readFileSync(presentationPath));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "row3-rank2-unit-"));

function clone(value) { return JSON.parse(JSON.stringify(value)); }
let owner;
function reject(mutate) {
  const changed = clone(owner); mutate(changed);
  assert.throws(() => api.verifyOwner(changed, presentation, owner.ancestry), api.Row3UnitFailure);
}

try {
  function runCoordinator() {
    const run = spawnSync("timeout", ["600", "prlimit", "--as=4294967296",
      "--rss=4294967296", "--cpu=600", "--", "node", COORDINATOR,
      "--presentation", presentationPath, "--presentation-sha256", api.PRESENTATION_SHA256,
      "--pristine-w0", w0Path, "--pristine-sha256", api.W0_SHA256,
      "--output-dir", temporary], { cwd: ROOT, encoding: "utf8", timeout: 610_000,
      maxBuffer: 256 * 1024 * 1024 });
    assert.equal(run.status, 0, run.stderr || String(run.error));
    return JSON.parse(run.stdout);
  }
  const started = process.hrtime.bigint();
  const receipt = runCoordinator();
  const repeated = runCoordinator();
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.deepEqual(repeated, receipt, "publication is not idempotent");
  owner = JSON.parse(fs.readFileSync(receipt.path));
  assert.equal(api.verifyOwner(owner, presentation, owner.ancestry), true);
  assert.equal(fs.statSync(receipt.path).mode & 0o777, 0o444);

  reject(value => { value.units.rawUnitProvenance[0] = String(BigInt(value.units.rawUnitProvenance[0]) + 1n); });
  reject(value => { value.units.unitKernelTransform[0] = String(BigInt(value.units.unitKernelTransform[0]) + 1n); });
  reject(value => { value.sourceLogs.kernelLogs[1] = String(BigInt(value.sourceLogs.kernelLogs[1]) + 1n); });
  reject(value => { value.units.unitNorms[1] = "1"; });
  reject(value => { value.units.unitRealSigns[3] = 1; });
  reject(value => { value.replay.getfuState[3] = 20; });
  reject(value => { value.regulator.packed[0] = String(BigInt(value.regulator.packed[0]) + 1n); });
  reject(value => { value.sourceLogs.frozenW0UsedAsInput = false; });
  reject(value => { value.completion.inputBoundaryComplete = true; });
  reject(value => { value.ancestry.pristineW0Sha256 = "0".repeat(64); });

  const probe = String.raw`import importlib,json,sys
sys.path.extend(['src/lib','src/baselib'])
m=importlib.import_module('bench.pari-class-group-port.row3_rank2_unit_authority')
p=json.load(open(sys.argv[1]));w=json.load(open(sys.argv[2]));called=[];base=m._event
def event(events,name):
 called.append(name)
 if name in ('fundamental_units','result'): raise AssertionError('answer event read')
 return base(events,name)
m._event=event
o=m.compose_row3_rank2_unit_authority(p,m.PRESENTATION_SHA256,w,m.W0_SHA256)
assert called==['prepared','factor_base'],called
print(json.dumps({'events':called,'arithmeticSha256':o['replay']['arithmeticSha256']}))`;
  const probeRun = spawnSync("timeout", ["600", "prlimit", "--as=4294967296",
    "--rss=4294967296", "--cpu=600", "--", "python3", "-c", probe,
    presentationPath, w0Path], { cwd: ROOT, encoding: "utf8", timeout: 610_000,
    maxBuffer: 256 * 1024 * 1024 });
  assert.equal(probeRun.status, 0, probeRun.stderr || String(probeRun.error));
  const eventProbe = JSON.parse(probeRun.stdout);
  assert.deepEqual(eventProbe.events, ["prepared", "factor_base"]);
  assert.equal(eventProbe.arithmeticSha256, owner.replay.arithmeticSha256);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    authoritySha256: receipt.sha256,
    authorityBytes: receipt.bytes,
    elapsedMs,
    unitKernelTransform: owner.units.unitKernelTransform,
    rawUnitProvenanceSha256: require("node:crypto").createHash("sha256").update(
      owner.units.rawUnitProvenance.join("\n")).digest("hex"),
    nonzeroRelationFactors: owner.units.nonzeroRelationFactors,
    unitNorms: owner.units.unitNorms,
    unitRealSigns: owner.units.unitRealSigns,
    regulator: owner.regulator.computedFloat,
    getfuReason: owner.units.reason,
    maximumRealExponent: owner.replay.getfuState[3],
    frozenW0UsedAsInput: owner.sourceLogs.frozenW0UsedAsInput,
    inputBoundaryComplete: owner.completion.inputBoundaryComplete,
    forbiddenAnswerEventsRead: false,
    mutationsRejected: 10,
    idempotentPublication: true,
  })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

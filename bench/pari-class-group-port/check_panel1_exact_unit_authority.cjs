#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const { verifyOwner } = require("./panel1_exact_unit_authority_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const coordinator = path.join(__dirname, "panel1_exact_unit_authority_coordinator.cjs");
const storageSource = path.join(__dirname, "panel1_exact_unit_storage.py");
const presentation = process.argv[2] ||
  "/scratch/sagejs-runtime/pari-class-group-e2e-20260917/panel1-authority/" +
  "panel1-presentation-c5442d0848ec8fb2e6d8f24e516458a15f24f3415d7a1da62d8d5848c2ab0bcf.json";
const presentationSha = process.argv[3] ||
  "c5442d0848ec8fb2e6d8f24e516458a15f24f3415d7a1da62d8d5848c2ab0bcf";
const pristine = "/scratch/sagejs-pari-development-panel-a998/panel-01-394cce5d99f0e9f8.json";
const pristineSha = "f043f34a7c732269791a3c8c16cb3b30767b84ecec3c340659433d53f05aeb72";

const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", timeout: 600_000,
    maxBuffer: 128 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}
function values(buffer) { return buffer?.toArray ? buffer.toArray() : Array.from(buffer); }

(async () => {
  assert.equal(fs.statSync(presentation).mode & 0o777, 0o444);
  assert.equal(sha256(fs.readFileSync(presentation)), presentationSha);
  assert.equal(sha256(fs.readFileSync(pristine)), pristineSha);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-panel1-exact-units-"));
  try {
    const args = [coordinator, "--presentation-owner", presentation,
      "--presentation-sha256", presentationSha, "--pristine-w0", pristine,
      "--pristine-sha256", pristineSha, "--output-dir", temporary];
    const first = JSON.parse(run(process.execPath, args));
    const second = JSON.parse(run(process.execPath, args));
    assert.deepEqual(second, first, "cold replay changed exact owner");
    assert.deepEqual(fs.readdirSync(temporary), [path.basename(first.path)]);
    assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
    assert.equal(sha256(fs.readFileSync(first.path)), first.sha256);
    const owner = JSON.parse(fs.readFileSync(first.path));
    verifyOwner(owner);
    assert.deepEqual(owner.unitTransform,
      ["0","0","0","0","1","0","0","0","0","0","0","119","0","1"]);
    assert.deepEqual(owner.exactUnits[0], ["6671", "-2224", "1"]);
    const unitBits = owner.exactUnits.map((unit) => unit.map((entry) => {
      const value = BigInt(entry); return (value < 0n ? -value : value).toString(2).length;
    }));
    assert.deepEqual(unitBits, [[13, 12, 1], [9259, 9253, 9247]]);
    assert.deepEqual(owner.unitNorms, ["1", "1"]);
    assert.deepEqual(owner.signPhases, [0, 1, 1, 1, 1, 0]);

    const built = await compileKernel({ sourcePath: storageSource });
    const storage = require(built.modulePath).pari_panel1_exact_unit_storage;
    assert(storage.nativeAvailable);
    const units = owner.exactUnits.flat().map(BigInt);
    const tensor = owner.field.multiplicationTensor.map(BigInt);
    for (const backend of ["javascript", "gmp"]) {
      const exact = (entries) => backend === "javascript" ? entries.slice() :
        storage.createIntegerBuffer(entries.length, 16384, entries);
      const published = exact(Array(6).fill(77n));
      const norms = exact([77n, 77n]);
      const state = Array(4).fill(77n);
      assert.equal(storage[backend](exact(units), exact(tensor), published, norms, state), 0n);
      assert.deepEqual(values(published), units);
      assert.deepEqual(values(norms), [1n, 1n]);
      assert.deepEqual(state, [0n, 1n, 1n, 6n]);
      const shortened = exact(Array(5).fill(77n));
      assert.throws(() => storage[backend](exact(units), exact(tensor), shortened,
        norms, state), /short panel-1 exact-unit storage/);
    }

    const mutationScript = String.raw`
import copy,dataclasses,decimal,fractions,hashlib,importlib,json,sys,typing
sys.path[:0]=['src/lib','src/baselib']
m=importlib.import_module('bench.pari-class-group-port.panel1_exact_unit_authority')
base=json.load(open(sys.argv[1]));count=0
def reject(change):
 global count
 value=copy.deepcopy(base);change(value)
 try:m.compose_panel1_exact_unit_authority(value,sys.argv[2])
 except ValueError:count+=1
 else:raise AssertionError('mutation accepted')
reject(lambda x:x['field'].__setitem__('id','forged'))
reject(lambda x:x['dimensions'].__setitem__('relationCount',57))
reject(lambda x:x['relations']['principalGenerators'].__setitem__(0,str(int(x['relations']['principalGenerators'][0])+1)))
reject(lambda x:x['relations']['packedLogs'].__setitem__(0,str(int(x['relations']['packedLogs'][0])+1)))
reject(lambda x:x['presentation']['rawToKernel'].__setitem__(0,str(int(x['presentation']['rawToKernel'][0])+1)))
reject(lambda x:x['replay'].__setitem__('rawRelationsTimesKernelZero',False))
reject(lambda x:x['field'].__setitem__('rootIntervals',[['1','2'],['-142','-141'],['140','141']]))
reject(lambda x:x['field']['multiplicationTensor'].__setitem__(0,'2'))
print(count)
`;
    assert.equal(run("python3", ["-c", mutationScript, presentation, presentationSha]).trim(), "8");
    assert.deepEqual(fs.readdirSync(temporary), [path.basename(first.path)],
      "failed mutations published an owner");
    console.log(JSON.stringify({ schema: "panel1-exact-unit-authority-check-v1",
      ownerSha256: first.sha256, ownerBytes: first.bytes, coldReplay: true,
      unitBits, unitNorms: owner.unitNorms, signPhases: owner.signPhases,
      rawProvenanceShape: owner.rawUnitProvenanceShape, exactStorageBits: 16384,
      native: true, backends: ["javascript", "gmp"], mutationsRejected: 8,
      publication: "atomic-idempotent-0444", producerUnitInputs: false }));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

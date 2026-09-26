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
const coordinator = require("./row20_successful_c6_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-20-36db16a4e174ca1a.json";
const SOURCE = path.join(__dirname, "row20_successful_c6.py");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", timeout: 600_000,
    maxBuffer: 128 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

assert.equal(sha(fs.readFileSync(W0)), coordinator.W0_SHA256);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row20-c6-"));
try {
  const args = [path.join(__dirname, "row20_successful_c6_coordinator.cjs"),
    "--pristine-w0", W0, "--pristine-sha256", coordinator.W0_SHA256,
    "--output-dir", temporary];
  const first = JSON.parse(run(process.execPath, args));
  assert.deepEqual(JSON.parse(run(process.execPath, args)), first);
  assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
  assert.equal(sha(fs.readFileSync(first.path)), first.sha256);
  const owner = JSON.parse(fs.readFileSync(first.path));
  coordinator.verifyOwner(owner);

  const oracleIsolation = String.raw`
import copy,hashlib,importlib,json,sys
sys.set_int_max_str_digits(100000);sys.path += ['src/lib','src/baselib']
m=importlib.import_module('bench.pari-class-group-port.row20_successful_c6')
x=json.load(open(sys.argv[1])); original=m.pari_getfu_mixed_quintic; seen=[]
def wrapper(*args):
 event=next(e for e in x['events'] if e['event']=='fundamental_units')
 assert event['fu']['values'][0]['coefficients'][0]['value']=='POISON'
 seen.append(True);return original(*args)
m.pari_getfu_mixed_quintic=wrapper
event=next(e for e in x['events'] if e['event']=='fundamental_units')
event['fu']['values'][0]['coefficients'][0]['value']='POISON'
try:m.compose_authenticated_row20(x,sys.argv[2])
except (ValueError,TypeError):pass
else:raise AssertionError('poisoned comparison oracle was accepted')
assert seen==[True]
print('isolated')
`;
  assert.equal(run("python3", ["-c", oracleIsolation, W0, coordinator.W0_SHA256]).trim(),
    "isolated");

  const nativeScript = String.raw`
const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{const root=process.argv[1],source=process.argv[2];
 const {compileKernel}=require(path.join(root,'tools/native-kernel/compiler.cjs'));
 const built=await compileKernel({sourcePath:source});const m=require(built.modulePath);
 const f=m.pari_getfu_quintic_unit_inverse;assert(f.nativeAvailable);
 const tensor=JSON.parse(require('node:fs').readFileSync(0,'utf8'));
 for(const backend of ['javascript','gmp']){const input=[-33n,-3n,-13n,-1n,15n];
  const unit=backend==='javascript'?input:f.createIntegerBuffer(5,128,input);
  const table=backend==='javascript'?tensor.map(BigInt):f.createIntegerBuffer(125,128,tensor.map(BigInt));
  const work=backend==='javascript'?Array(25).fill(0n):f.createIntegerBuffer(25,512);
  const inverse=backend==='javascript'?Array(5).fill(0n):f.createIntegerBuffer(5,512);
  assert.equal(f[backend](unit,0n,table,work,inverse),1n,backend);
  const values=(inverse.toArray?inverse.toArray():inverse).map(BigInt);
  assert.deepEqual(values,[7n,-7n,15n,-9n,9n],backend);
 }
 console.log(JSON.stringify({native:true,backends:['javascript','gmp']}));
})().catch(error=>{console.error(error);process.exitCode=1});
`;
  const bundle = JSON.parse(fs.readFileSync(W0));
  const native = JSON.parse(run(process.execPath, ["-e", nativeScript,
    process.env.SAGEJS_REPLAY_RUNTIME_ROOT || ROOT, SOURCE],
  { input: JSON.stringify(bundle.prepared.multiplicationTensor) }));

  const mutation = JSON.parse(JSON.stringify(bundle));
  mutation.events.find(event => event.event === "acceptance").lattice.values[0].values[0].value = "2";
  const mutationScript = String.raw`
import importlib,json,sys
sys.path += ['src/lib','src/baselib'];m=importlib.import_module('bench.pari-class-group-port.row20_successful_c6')
try:m.compose_authenticated_row20(json.load(sys.stdin),sys.argv[1])
except ValueError:print('rejected')
else:raise AssertionError('mutated source owner was accepted')
`;
  assert.equal(run("python3", ["-c", mutationScript, coordinator.W0_SHA256],
    { input: JSON.stringify(mutation) }).trim(), "rejected");
  const failedDirectory = path.join(temporary, "failed");
  const failed = spawnSync(process.execPath, [path.join(__dirname,
    "row20_successful_c6_coordinator.cjs"), "--pristine-w0", W0,
    "--pristine-sha256", "0".repeat(64), "--output-dir", failedDirectory],
  { cwd: ROOT, encoding: "utf8", timeout: 30_000 });
  assert.notEqual(failed.status, 0);
  assert.equal(fs.existsSync(failedDirectory), false);
  console.log(JSON.stringify({ schema: "row20-successful-c6-check-v1", cpython: true,
    native, oracleIsolation: true, mutationsRejected: 1, failedPublicationAtomic: true,
    ownerSha256: first.sha256,
    publication: "atomic-idempotent-0444" }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

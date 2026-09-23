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
const coordinator = require("./panel8_c6_getfu_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const c5Coordinator = path.join(__dirname, "panel8_c5_unit_lattice_cleanarch_coordinator.cjs");
const c6Coordinator = path.join(__dirname, "panel8_c6_getfu_coordinator.cjs");
const sourcePath = path.join(__dirname, "panel8_c6_getfu.py");
const accepted = "/scratch/sagejs-runtime/pari-class-group-e2e-20260917/panel8-authority/panel8-accepted-retry-b2e1a6a0d737880627d8829569c24447557c389690d2ec5a35a9e1c6c0430591.json";
const acceptedSha = "b2e1a6a0d737880627d8829569c24447557c389690d2ec5a35a9e1c6c0430591";
const w0 = "/scratch/sagejs-pari-development-panel-a998/panel-08-4184b3a9e86b3cc2.json";
const w0Sha = "4f7535622072f1350787ca8caab417cce4023aea4ef68c67c3fb20ef65d01ca1";
const expectedC5 = "f93fa0ff5f68531646f213d799339e87a7b2d338e18457399fe81d6b0fb1df21";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", timeout: 600_000,
    maxBuffer: 128 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-panel8-c6-"));
const c5Directory = path.join(temporary, "c5");
const c6Directory = path.join(temporary, "c6");
try {
  const c5 = JSON.parse(run(process.execPath, [c5Coordinator,
    "--accepted-owner", accepted, "--accepted-sha256", acceptedSha,
    "--pristine-w0", w0, "--pristine-sha256", w0Sha, "--output-dir", c5Directory]));
  assert.equal(c5.sha256, expectedC5);
  const args = [c6Coordinator, "--c5-owner", c5.path, "--c5-sha256", c5.sha256,
    "--accepted-owner", accepted, "--accepted-sha256", acceptedSha,
    "--pristine-w0", w0, "--pristine-sha256", w0Sha, "--output-dir", c6Directory];
  const first = JSON.parse(run(process.execPath, args));
  assert.deepEqual(JSON.parse(run(process.execPath, args)), first);
  assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
  assert.equal(sha(fs.readFileSync(first.path)), first.sha256);
  const owner = JSON.parse(fs.readFileSync(first.path));
  coordinator.verifyOwner(owner);
  assert.deepEqual(owner.state, [3, 15, -185, 0, 69863, 0, 0, 1]);
  assert.equal(owner.ancestry.c5OwnerSha256, expectedC5);

  const prepared = coordinator.preparedInput(JSON.parse(fs.readFileSync(w0)), w0Sha,
    JSON.parse(fs.readFileSync(c5.path)).field);
  const fixtureScript = String.raw`
import importlib,inspect,json,sys
sys.set_int_max_str_digits(100000)
sys.path += ['src/lib','src/baselib']
m=importlib.import_module('bench.pari-class-group-port.panel8_c6_getfu')
c5=json.load(open(sys.argv[1]));accepted=json.load(open(sys.argv[2]));prepared=json.load(sys.stdin)
original=m.pari_panel8_c6_getfu;captured=[]
def wrapper(*args):
 captured[:]=args
 return original(*args)
m.pari_panel8_c6_getfu=wrapper
result=m.compose_authenticated_panel8_c6(c5,accepted,prepared,sys.argv[3],sys.argv[4],sys.argv[5],sys.argv[6])
names=[];raw={}
for parameter,value in zip(inspect.signature(original).parameters.values(),captured):
 kind='int' if parameter.name=='precision' else ('Int64Buffer' if parameter.name in ('state','pivots') else 'IntegerBuffer')
 raw[parameter.name]=str(value) if kind=='int' else [str(x) for x in value]
 names.append([parameter.name,kind])
print(json.dumps({'names':names,'raw':raw,'result':result},separators=(',',':')))
`;
  const fixture = JSON.parse(run("python3", ["-c", fixtureScript, c5.path, accepted,
    c5.sha256, acceptedSha, w0Sha, sha(fs.readFileSync(sourcePath))],
  { input: JSON.stringify(prepared) }));
  const nativeScript = String.raw`
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=process.argv[1],source=process.argv[2],fixture=JSON.parse(fs.readFileSync(0,'utf8'));
(async()=>{const {compileKernel}=require(path.join(root,'tools/native-kernel/compiler.cjs'));
 const built=await compileKernel({sourcePath:source});const f=require(built.modulePath).pari_panel8_c6_getfu;
 assert(f.nativeAvailable);const view=x=>(x.toArray?x.toArray():Array.from(x)).map(BigInt);
 for(const backend of ['javascript','gmp']){const values={};
  for(const [name,kind]of fixture.names){const raw=fixture.raw[name];
   if(kind==='int')values[name]=BigInt(raw);
   else if(kind==='Int64Buffer')values[name]=backend==='javascript'?raw.map(BigInt):f.createInt64Buffer(raw.map(BigInt));
   else values[name]=backend==='javascript'?raw.map(BigInt):f.createIntegerBuffer(raw.length,4096,raw.map(BigInt));
  }
  const status=f[backend](...fixture.names.map(([name])=>values[name]));assert.equal(status,3n,backend);
  assert.deepEqual(view(values.state).map(Number),[3,15,-185,0,69863,0,0,1],backend);
  for(const name of ['output_units','output_logs_real','output_logs_imag','output_factor'])
   assert(view(values[name]).every(x=>x===31337n),backend+': '+name+' was published');
  const shortened=fixture.names.map(([name])=>values[name]);const at=fixture.names.findIndex(([name])=>name==='output_units');
  shortened[at]=backend==='javascript'?Array(7).fill(31337n):f.createIntegerBuffer(7,4096,Array(7).fill(31337n));
  assert.throws(()=>f[backend](...shortened),/short mixed quartic getfu workspace/);
 }
 console.log(JSON.stringify({native:true,backends:['javascript','gmp'],coreBytes:fs.statSync(built.coreSourcePath).size}));
})().catch(error=>{console.error(error);process.exitCode=1});
`;
  const native = JSON.parse(run(process.execPath, ["-e", nativeScript,
    process.env.SAGEJS_REPLAY_RUNTIME_ROOT || ROOT, sourcePath], { input: JSON.stringify(fixture) }));

  // Mutations are rejected by the authenticated Python boundary.  The W0
  // authentication itself is independently exercised by its focused suite.
  const mutationScript = String.raw`
import copy,importlib,json,sys
sys.set_int_max_str_digits(100000)
sys.path += ['src/lib','src/baselib'];m=importlib.import_module('bench.pari-class-group-port.panel8_c6_getfu')
c5=json.load(open(sys.argv[1]));accepted=json.load(open(sys.argv[2]));prepared=json.load(sys.stdin);count=0
def reject(c=None,p=None):
 global count
 x=copy.deepcopy(c5);y=copy.deepcopy(prepared)
 if c:c(x)
 if p:p(y)
 try:m.compose_authenticated_panel8_c6(x,accepted,y,sys.argv[3],sys.argv[4],sys.argv[5],sys.argv[6])
 except ValueError:count+=1
 else:raise AssertionError('mutation accepted')
reject(c=lambda x:x['getfuFactor'].__setitem__(1,'1'))
reject(c=lambda x:x['cleanA'].__setitem__(0,'0'))
reject(c=lambda x:x['getfuCandidateA'].__setitem__(0,'0'))
reject(p=lambda x:x['embeddingReal'].__setitem__(0,'2'))
reject(p=lambda x:x['multiplicationTensor'].__setitem__(0,'2'))
reject(p=lambda x:x.__setitem__('w0Sha256','0'*64))
print(count)
`;
  assert.equal(run("python3", ["-c", mutationScript, c5.path, accepted, c5.sha256,
    acceptedSha, w0Sha, sha(fs.readFileSync(sourcePath))], { input: JSON.stringify(prepared) }).trim(), "6");
  assert.deepEqual(fs.readdirSync(c6Directory), [path.basename(first.path)]);
  console.log(JSON.stringify({ schema: "panel8-c6-getfu-check-v1", cpython: true, native,
    mutationsRejected: 6, ownerSha256: first.sha256,
    scheduleRegression: "PARI-column-major-factor-[1,0,-2,1]", publication: "atomic-idempotent-0444" }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

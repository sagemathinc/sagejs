#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { verifyOwner } = require("./panel8_c5_unit_lattice_cleanarch_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const coordinator = path.join(__dirname, "panel8_c5_unit_lattice_cleanarch_coordinator.cjs");
const sourcePath = path.join(__dirname, "panel8_c5_unit_lattice_cleanarch.py");
const accepted = "/scratch/sagejs-runtime/pari-class-group-e2e-20260917/panel8-authority/panel8-accepted-retry-b2e1a6a0d737880627d8829569c24447557c389690d2ec5a35a9e1c6c0430591.json";
const acceptedSha = "b2e1a6a0d737880627d8829569c24447557c389690d2ec5a35a9e1c6c0430591";
const pristine = "/scratch/sagejs-pari-development-panel-a998/panel-08-4184b3a9e86b3cc2.json";
const pristineSha = "4f7535622072f1350787ca8caab417cce4023aea4ef68c67c3fb20ef65d01ca1";

const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", timeout: 600_000,
    maxBuffer: 128 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-panel8-c5-"));
try {
  assert.equal(fs.statSync(accepted).mode & 0o777, 0o444);
  assert.equal(sha256(fs.readFileSync(accepted)), acceptedSha);
  assert.equal(sha256(fs.readFileSync(pristine)), pristineSha);
  const args = [coordinator, "--accepted-owner", accepted, "--accepted-sha256", acceptedSha,
    "--pristine-w0", pristine, "--pristine-sha256", pristineSha, "--output-dir", temporary];
  const first = JSON.parse(run(process.execPath, args));
  const second = JSON.parse(run(process.execPath, args));
  assert.deepEqual(second, first);
  assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
  assert.equal(sha256(fs.readFileSync(first.path)), first.sha256);
  const owner = JSON.parse(fs.readFileSync(first.path));
  verifyOwner(owner);
  assert.deepEqual(owner.state, [0, 192, 3, 0, 0, 0, 0, -1, 0, 0, 1, 1, 9, 3, 2, 9]);
  assert.deepEqual(owner.getfuFactor, ["1", "0", "-2", "1"]);

  // Capture the exact CPython call packet after a successful authenticated
  // composition.  Reference event 489 is not included in this packet.
  const fixtureScript = String.raw`
import importlib,inspect,json,sys,typing
sys.path += ['src/lib','src/baselib']
m=importlib.import_module('bench.pari-class-group-port.panel8_c5_unit_lattice_cleanarch')
accepted=json.load(open(sys.argv[1]));pristine=json.load(open(sys.argv[2]))
original=m.pari_panel8_c5_unit_lattice_cleanarch; captured=[]
def wrapper(*args):
 captured[:] = args
 return original(*args)
m.pari_panel8_c5_unit_lattice_cleanarch=wrapper
result=m.compose_authenticated_panel8_c5(accepted,pristine,sys.argv[3],sys.argv[4])
int64={'selected','selection_state','selection_row_pivots','selection_heights','selection_hnf_state','clean_state','state'}
floats={'integer_mu','integer_r','integer_s','integer_approximate','integer_float_gram','integer_normalized','integer_temporary','integer_dpe_scratch','real_mu','real_r','real_s','real_approximate','real_float_gram','real_normalized','real_temporary','real_dpe_scratch'}
names=[];raw={}
for parameter,value in zip(inspect.signature(original).parameters.values(),captured):
 if parameter.name=='precision':kind='int';raw[parameter.name]=str(value)
 elif parameter.name in int64:kind='Int64Buffer';raw[parameter.name]=[str(x) for x in value]
 elif parameter.name in floats:kind='Float64Buffer';raw[parameter.name]=value
 else:kind='IntegerBuffer';raw[parameter.name]=[str(x) for x in value]
 names.append([parameter.name,kind])
print(json.dumps({'names':names,'raw':raw,'result':result},separators=(',',':')))
`;
  const fixture = JSON.parse(run("python3", ["-c", fixtureScript, accepted, pristine,
    acceptedSha, pristineSha]));
  const nativeScript = String.raw`
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const runtimeRoot=process.argv[1],sourcePath=process.argv[2],fixture=JSON.parse(fs.readFileSync(0,'utf8'));
(async()=>{const {compileKernel}=require(path.join(runtimeRoot,'tools/native-kernel/compiler.cjs'));
 const built=await compileKernel({sourcePath});const f=require(built.modulePath).pari_panel8_c5_unit_lattice_cleanarch;
 assert(f.nativeAvailable);const core=fs.readFileSync(built.coreSourcePath,'utf8');assert.doesNotMatch(core,/napi_call_function|PyObject_Call|v8::/);
 const view=(x)=>Array.isArray(x)?x:x.toArray?x.toArray():Array.from(x);
 for(const backend of ['javascript','gmp']){
  const values={};
  for(const [name,kind]of fixture.names){const raw=fixture.raw[name];
   if(kind==='IntegerBuffer')values[name]=backend==='javascript'?raw.map(BigInt):f.createIntegerBuffer(raw.length,4096,raw.map(BigInt));
   else if(kind==='Int64Buffer')values[name]=backend==='javascript'?raw.map(BigInt):f.createInt64Buffer(raw.map(Number));
   else if(kind==='Float64Buffer')values[name]=backend==='javascript'?raw.map(Number):f.createFloat64Buffer(raw);
   else values[name]=BigInt(raw);
  }
  const status=f[backend](...fixture.names.map(([name])=>values[name]));assert.equal(status,0n,backend);
  const expected=fixture.result;
  for(const [name,key]of [['output_u1','u1'],['output_u2','u2'],['output_u','u'],['output_au','au'],['output_clean','cleanA'],['output_factor','getfuFactor'],['output_final_a','a'],['output_getfu_candidate_a','getfuCandidateA']])
   assert.deepEqual(view(values[name]).map(String),expected[key],backend+': '+name);
  assert.deepEqual(view(values.state).map(Number),expected.state,backend+': state');
  const shortened=fixture.names.map(([name])=>values[name]);const at=fixture.names.findIndex(([name])=>name==='output_final_a');
  shortened[at]=backend==='javascript'?Array(41).fill(77n):f.createIntegerBuffer(41,4096,Array(41).fill(77n));
  assert.throws(()=>f[backend](...shortened),/short panel-8 C5 owner/);
 }
 console.log(JSON.stringify({native:true,backends:['javascript','gmp'],coreBytes:Buffer.byteLength(core)}));
})().catch((error)=>{console.error(error);process.exitCode=1});
`;
  const native = JSON.parse(run(process.execPath, ["-e", nativeScript,
    process.env.SAGEJS_REPLAY_RUNTIME_ROOT || ROOT, sourcePath], { input: JSON.stringify(fixture) }));

  // Mutations are supplied only to the authenticated Python boundary.  No
  // failed case may create another immutable publication.
  const mutationScript = String.raw`
import copy,importlib,json,sys
sys.path += ['src/lib','src/baselib']
m=importlib.import_module('bench.pari-class-group-port.panel8_c5_unit_lattice_cleanarch')
a=json.load(open(sys.argv[1]));p=json.load(open(sys.argv[2]));count=0
def reject(change):
 global count
 x=copy.deepcopy(a);change(x)
 try:m.compose_authenticated_panel8_c5(x,p,sys.argv[3],sys.argv[4])
 except ValueError:count+=1
 else:raise AssertionError('mutation accepted')
reject(lambda x:x['field'].__setitem__('id','forged'))
reject(lambda x:x['ancestry'].__setitem__('preparedW0Sha256','0'*64))
reject(lambda x:x['terminal'].__setitem__('relationLatticeShape',[8,2]))
reject(lambda x:x['terminal']['relationLattice'].__setitem__(0,str(int(x['terminal']['relationLattice'][0])+1)))
reject(lambda x:x['terminal']['transformedLogs'].__setitem__(0,'0'))
reject(lambda x:x['pristineComparison'].__setitem__('terminalStateCompared',False))
print(count)
`;
  assert.equal(run("python3", ["-c", mutationScript, accepted, pristine,
    acceptedSha, pristineSha]).trim(), "6");
  assert.deepEqual(fs.readdirSync(temporary), [path.basename(first.path)]);
  console.log(JSON.stringify({ schema: "panel8-c5-unit-lattice-check-v1", cpython: true,
    native, mutationsRejected: 6, ownerSha256: first.sha256,
    publication: "atomic-idempotent-0444", answerFixtures: false }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

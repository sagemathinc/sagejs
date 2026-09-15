"use strict";
// A single source-transparent call consumes prepared inputs, not stage answers.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:180000,maxBuffer:128*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const fixturePath=path.resolve(process.argv[2]),fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
 assert.equal(fixture.expected.length,4);assert.equal(fixture.nativeOutputs.filter(r=>r.backend==='gmp').length,4,'requires qualified native stage-chain fixtures');
 const sourcePath=path.join(__dirname,'connected_relation_hnf.py');
 const names=fs.readFileSync(sourcePath,'utf8').match(/def pari_connected_relation_hnf\(([\s\S]*?)\n\)/)[1].trim().split('\n').map(s=>s.trim().replace(/,$/,'').split(': '));
 const inputs=fixture.inputs.map((raw,index)=>{
  const v=structuredClone(raw),n=Number(v.n),ru=(n+Number(v.admission_real_count))/2,kc=v.relation.length,cacheCapacity=Number(v.relation_state[1]);
  // Fixed diagnostic allocation ceiling, not a supplied relation count or rank.
  const hnfColumnCapacity=128,cap=Math.max(64,(kc+hnfColumnCapacity)**2,7*ru*(kc+hnfColumnCapacity));
  const primes=v.admission_prime_counts.flatMap((count,p)=>Number(count)?[String(p)]:[]);
  Object.assign(v,{initial_additional:'2',initial_target:'400',initial_primes:primes,initial_offsets:primes.map(p=>v.admission_prime_offsets[Number(p)]),initial_counts:primes.map(p=>v.admission_prime_counts[Number(p)]),initial_complete:primes.map(()=>'1'),hnf_k0:'0',hnf_original:Array(kc*cacheCapacity).fill('77'),chain_state:['0','77','77','77'],log_precision:'128',log_completed:['0'],log_embeddings:Array(cacheCapacity*7*ru).fill('0'),log_coordinates:Array(n).fill('0'),log_column:Array(7*ru).fill('0'),log_cache:Array(3).fill('0'),log_pi_cache:Array(3).fill('0'),log_a:Array(64).fill('0'),log_b:Array(64).fill('0'),log_p:Array(64).fill('0'),log_q:Array(64).fill('0'),log_stack:Array(128).fill('0')});
  for(const [name,kind]of names)if(!(name in v)){assert(name.startsWith('hnf_')&&kind!=='int',name);v[name]=Array(cap).fill('77');}
  v.hnf_perm=Array.from({length:kc},(_,i)=>String(i+1));
  return Object.fromEntries(names.map(([name])=>[name,v[name]]));
 });
 const cp=JSON.parse(run('python3',['-c',`import json,sys,decimal,importlib,copy
sys.set_int_max_str_digits(100000);sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.connected_relation_hnf').pari_connected_relation_hnf
d=json.load(sys.stdin);out=[]
def values(raw):
 v={}
 for name,kind in d['names']:
  conv=float if kind in ('float','Float64Buffer') else int;x=raw[name];v[name]=list(map(conv,x)) if isinstance(x,list) else conv(x)
 return v
for index,raw in enumerate(d['inputs']):
 v=values(raw);e=d['expected'][index];status=f(**v);assert status==0;last=v['relation_state'][0];n=v['n'];kc=len(v['relation']);ru=(n+v['admission_real_count'])//2
 assert last==e['last'];assert v['chain_state']==[3,0,len(v['initial_primes']),last]
 assert v['relation_records'][:last*kc]==e['records'];assert list(map(str,v['generators'][:last*n]))==e['generators'];assert list(map(str,v['log_embeddings'][:last*7*ru]))==e['logs']
 for key,name in [('H','hnf_result_h'),('D','hnf_result_dep'),('B','hnf_result_b'),('C','hnf_result_c')]:assert list(map(str,v[name][:len(e[key])]))==e[key],(index,key)
 assert v['hnf_perm']==e['perm'];before=copy.deepcopy(v);assert f(**v)==0 and v==before
 out.append(v['chain_state'])
bad=values(d['inputs'][0]);bad['chain_state']=[];before=copy.deepcopy(bad)
try:f(**bad)
except ValueError:pass
else:raise AssertionError('short state accepted')
assert bad==before
for phase in [1,2]:
 bad=values(d['inputs'][0]);bad['chain_state'][0]=phase;before=copy.deepcopy(bad)
 try:f(**bad)
 except ValueError:pass
 else:raise AssertionError('partial stage accepted')
 assert bad==before
bad=values(d['inputs'][0]);bad['hnf_result_h']=[]
try:f(**bad)
except ValueError:pass
else:raise AssertionError('short HNF output accepted')
assert bad['chain_state'][0]==2 and bad['log_completed'][0]>0
before=copy.deepcopy(bad)
try:f(**bad)
except ValueError:pass
else:raise AssertionError('failed HNF stage reused')
assert bad==before
print(json.dumps(out))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify({names,inputs,expected:fixture.expected})}));
 const summary={cases:4,cp,qualifiedTiming:false,preparedBoundary:fixture.summary.preparedBoundary,oneNativeCall:true,hnfColumnAllocationCeiling:128};
 if(process.argv.includes('--source-only')){console.log(JSON.stringify(summary));return;}
 const built=await compileKernel({sourcePath}),f=require(built.modulePath).pari_connected_relation_hnf;assert(f.nativeAvailable);assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
 const nativeOutputs=[];
 for(const backend of ['javascript','gmp'])for(let index=0;index<inputs.length;index++){
  const v=Object.fromEntries(names.map(([name,kind])=>{const conv=kind==='float'||kind==='Float64Buffer'?Number:BigInt,x=inputs[index][name];return [name,Array.isArray(x)?x.map(conv):conv(x)];})),e=fixture.expected[index],invoke=()=>f[backend](...names.map(([name])=>v[name]));
  assert.equal(invoke(),0n);assert.deepEqual(v.chain_state,cp[index].map(BigInt));const last=Number(v.relation_state[0]),kc=v.relation.length,n=Number(v.n),ru=(n+Number(v.admission_real_count))/2;
  assert.equal(last,e.last);assert.deepEqual(v.relation_records.slice(0,last*kc).map(Number),e.records);assert.deepEqual(v.generators.slice(0,last*n).map(String),e.generators);assert.deepEqual(v.log_embeddings.slice(0,last*7*ru).map(String),e.logs);
  for(const [key,name]of [['H','hnf_result_h'],['D','hnf_result_dep'],['B','hnf_result_b'],['C','hnf_result_c']])assert.deepEqual(v[name].slice(0,e[key].length).map(String),e[key],backend+' '+index+' '+key);
  assert.deepEqual(v.hnf_perm.map(Number),e.perm);
  const nh=Number(v.hnf_state[0]),nb=Number(v.hnf_state[2]);
  nativeOutputs.push({backend,field:index,degree:n,logRows:ru,factorCount:kc,H:v.hnf_result_h.slice(0,nh*nh).map(String),C:v.hnf_result_c.slice(0,7*ru*last).map(String),perm:v.hnf_perm.map(Number),hnfState:[nh,last-nb,nb,kc-nb-nh,last-nb-nh],rawHnfState:v.hnf_state.slice(0,9).map(Number),generators:v.generators.slice(0,last*n).map(String),chainState:v.chain_state.map(Number)});
  const dump=()=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x),before=dump();assert.equal(invoke(),0n);assert.equal(dump(),before);
 }
 for(const backend of ['javascript','gmp'])for(const phase of [-1,1,2]){
  const v=Object.fromEntries(names.map(([name,kind])=>{const conv=kind==='float'||kind==='Float64Buffer'?Number:BigInt,x=inputs[0][name];return [name,Array.isArray(x)?x.map(conv):conv(x)];}));
  if(phase===-1)v.chain_state=[];else v.chain_state[0]=BigInt(phase);
  const dump=()=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x),before=dump();assert.throws(()=>f[backend](...names.map(([name])=>v[name])),/short connected relation HNF state|cannot reuse a partial relation HNF stage/);assert.equal(dump(),before);
 }
 for(const backend of ['javascript','gmp']){
  const v=Object.fromEntries(names.map(([name,kind])=>{const conv=kind==='float'||kind==='Float64Buffer'?Number:BigInt,x=inputs[0][name];return [name,Array.isArray(x)?x.map(conv):conv(x)];}));v.hnf_result_h=[];
  const invoke=()=>f[backend](...names.map(([name])=>v[name]));assert.throws(invoke,/short connected final workspace/);assert.equal(v.chain_state[0],2n);assert(v.log_completed[0]>0n);
  const dump=()=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x),before=dump();assert.throws(invoke,/cannot reuse a partial relation HNF stage/);assert.equal(dump(),before);
 }
 summary.coreBytes=fs.statSync(built.coreSourcePath).size;summary.coreHash=createHash('sha256').update(fs.readFileSync(built.coreSourcePath)).digest('hex');summary.atomicGuardCases=6;summary.partialFailureReplayGuard=true;summary.outputHash=createHash('sha256').update(JSON.stringify(nativeOutputs)).digest('hex');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-connected-relation-hnf-'));fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({summary,nativeOutputs,expected:fixture.expected}));summary.artifactDirectory=dir;console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exit(1);});

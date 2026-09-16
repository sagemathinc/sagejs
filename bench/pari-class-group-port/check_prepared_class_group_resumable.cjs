"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
(async()=>{
 const backendAt=process.argv.indexOf('--backend'),backend=backendAt<0?'gmp':process.argv[backendAt+1];
 assert(['javascript','gmp'].includes(backend),'--backend must be javascript or gmp');
 const limit=fs.readFileSync('/proc/self/limits','utf8').split('\n').find(x=>x.startsWith('Max address space'))?.trim().split(/\s+/)[3];
 assert(limit&&limit!=='unlimited'&&Number(limit)<=4294967296,'requires prlimit --as=4294967296 and NODE_OPTIONS=--max-old-space-size=1536');
 const continuation=JSON.parse(fs.readFileSync(process.argv[2])),analytic=JSON.parse(fs.readFileSync(process.argv[3])),events=JSON.parse(fs.readFileSync(process.argv[4])),initial=JSON.parse(fs.readFileSync(process.argv[5])).expected.find(x=>x.field===2);
 const inverse=analytic.nativeOutputs.find(x=>x.field===2&&x.backend==='gmp');assert(inverse);assert(initial);
 const sourcePath=path.join(__dirname,'prepared_class_group_resumable.py'),names=fs.readFileSync(sourcePath,'utf8').match(/def pari_prepared_class_group_resumable\(([\s\S]*?)\n\)/)[1].trim().split('\n').map(x=>x.trim().replace(/,$/,'').split(': '));
 const raw=structuredClone(continuation.preparedInput),kc=raw.relation.length,ru=(Number(raw.n)+Number(raw.admission_real_count))/2,cap=4096;
 Object.assign(raw,{accept_inverse_hr:inverse.inverseHR,pass_limit:3,automorphism_count:1,relation_prime_count:initial.KCZ,checking_prime_count:initial.KCZ2,driver_state:[0,77,77,77,77,77,77,77],driver_trace:Array(15).fill(77),outer_state:Array(19).fill(0),class_invariants:Array(kc).fill(77),class_number:[77]});
 for(const [name,kind]of names)if(!(name in raw)){assert(kind.endsWith('Buffer'),name);raw[name]=Array(cap).fill('77');}
 const wantAcceptance=events.filter(x=>x.event==='acceptance').at(-1),wantL=events.filter(x=>x.event==='acceptance_lattice').at(-1).L,appends=events.filter(x=>x.event==='hnfadd_input'),finalHnf=events.filter(x=>x.event==='hnfadd_output').at(-1);
 const wanted={classNumber:wantAcceptance.h,regulator:[wantAcceptance.R.mantissa,String(wantAcceptance.R.precision),String(wantAcceptance.R.exponent)],L:wantL,records:[...initial.records.map(String),...appends.flatMap(x=>x.newRelations.map(String))],generators:[...initial.generators,...appends.flatMap(x=>x.newGenerators.map(String))],logs:[...initial.logs,...appends.flatMap(x=>x.newLogs)],C:finalHnf.C};
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-prepared-class-resumable-'));
 const python=String.raw`
import sys,json,importlib,copy,decimal
sys.set_int_max_str_digits(100000);sys.path[:0]=sys.argv[1:3]
driver=importlib.import_module('bench.pari-class-group-port.prepared_class_group_resumable')
logs=importlib.import_module('bench.pari-class-group-port.collected_log_embeddings')
f=driver.pari_prepared_class_group_resumable
initialize=driver.pari_initialize_owned_relations;append=logs.pari_append_relation_log_embeddings
initial_counts=[];scalar_prefixes=[]
def recorded_initialize(*args):
 count=initialize(*args);initial_counts.append(count);return count
def recorded_append(*args):
 scalar_prefixes.append(args[-1]);return append(*args)
driver.pari_initialize_owned_relations=recorded_initialize
logs.pari_append_relation_log_embeddings=recorded_append
d=json.load(sys.stdin);out=[]
def fresh():
 return {k:([float(y) if t=='Float64Buffer' else int(y) for y in d['raw'][k]] if t.endswith('Buffer') else float(d['raw'][k]) if t=='float' else bool(d['raw'][k]) if t=='bool' else int(d['raw'][k])) for k,t in d['names']}
for passes in [1,2,3]:
 initial_counts.clear();scalar_prefixes.clear()
 v=fresh();v['pass_limit']=passes;status=f(**v);last=v['relation_state'][0];w=d['wanted'];kc=len(v['relation']);n=v['n'];places=(n+v['admission_real_count'])//2
 assert len(initial_counts)==1 and scalar_prefixes==initial_counts*passes,(initial_counts,scalar_prefixes)
 assert status==(0 if passes==3 else -200),(passes,status,v['driver_state'],v['accept_acceptance_state'][:3],v['accept_multiple_state'][:4])
 assert last==149+passes and v['relation_state'][4]==last and v['driver_state'][3]==last
 assert v['driver_state'][2]==passes and v['outer_state'][2]==passes and v['outer_state'][3]==passes-1 and v['outer_state'][4]==10
 assert v['driver_trace'][:5*passes]==[150,5,0,0,10,151,5,1,1,10,152,0,2,2,10][:5*passes]
 assert list(map(str,v['relation_records'][:kc*last]))==w['records'][:kc*last]
 assert list(map(str,v['generators'][:n*last]))==w['generators'][:n*last]
 assert list(map(str,v['log_embeddings'][:7*places*last]))==w['logs'][:7*places*last]
 if status==0:
  assert str(v['class_number'][0])==w['classNumber'] and v['driver_state'][4:6]==[1,0]
  assert list(map(str,v['accept_regulator'][:3]))==w['regulator']
  assert list(map(str,v['accept_relations'][:len(w['L'])]))==list(map(str,w['L']))
  assert list(map(str,v['hnf_result_c'][:len(w['C'])]))==w['C']
 else:assert v['class_number']==[77] and v['class_invariants']==[77]*kc and v['driver_state'][4]==0
 before=copy.deepcopy(v);assert f(**v)==status and v==before
 assert len(initial_counts)==1 and scalar_prefixes==initial_counts*passes
 out.append(dict(passes=passes,status=status,driverState=v['driver_state'],trace=v['driver_trace'],outer=v['outer_state'],relationState=list(map(str,v['relation_state'])),classNumber=str(v['class_number'][0]),regulator=list(map(str,v['accept_regulator'][:3])),L=list(map(str,v['accept_relations'][:len(w['L'])]))))
for key,value in [('automorphism_count',2),('checking_prime_count',d['raw']['relation_prime_count']+1)]:
 v=fresh();v[key]=value;assert f(**v) in [-203,-206];assert v['driver_state'][4:6]==[0,0] and v['class_number']==[77]
for phase in [1,2,3]:
 v=fresh();v['driver_state'][0]=phase;before=copy.deepcopy(v)
 try:f(**v)
 except ValueError:pass
 else:raise AssertionError('partial driver reused')
 assert v==before
print(json.dumps(out))
`;
 const r=spawnSync('python3',['-c',python,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify({raw,names,wanted}),encoding:'utf8',timeout:120000,maxBuffer:128*1024*1024});assert.equal(r.status,0,r.stderr||String(r.error));const expected=JSON.parse(r.stdout);
 const capacities={};let ownerBytes=0;
 for(const [name,kind]of names)if(kind==='IntegerBuffer'){
  let words=name.startsWith('hnf_cup_')?4:64;
  for(const x of raw[name]){const v=BigInt(x),a=v<0n?-v:v;words=Math.max(words,Math.ceil(a.toString(2).length/64));}
  capacities[name]=words;ownerBytes+=raw[name].length*(4+8*words);
 }else if(kind.endsWith('Buffer'))ownerBytes+=raw[name].length*8;
 assert(ownerBytes<2*1024**3,'declared resident owners exceed2GiB');
 fs.writeFileSync(path.join(dir,'inputs.json'),JSON.stringify({names,raw,expected,wanted,capacities,ownerBytes}));
 if(process.argv.includes('--source-only')){console.log(JSON.stringify({artifactDirectory:dir,expected,ownerBytes}));return;}
 const built=await compileKernel({sourcePath}),f=require(built.modulePath).pari_prepared_class_group_resumable;assert(f.nativeAvailable);assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
 const at=process.argv.indexOf('--passes'),passes=at<0?3:Number(process.argv[at+1]);assert([1,2,3].includes(passes));raw.pass_limit=passes;
 const v=Object.fromEntries(names.map(([name,kind])=>[name,backend==='javascript'&&kind.endsWith('Buffer')?raw[name].map(kind==='Float64Buffer'?Number:BigInt):kind==='IntegerBuffer'?f.createIntegerBuffer(raw[name].length,capacities[name],raw[name].map(BigInt)):kind==='Int64Buffer'?f.createInt64Buffer(raw[name]):kind==='Float64Buffer'?f.createFloat64Buffer(raw[name]):kind==='float'?Number(raw[name]):kind==='bool'?Boolean(raw[name]):BigInt(raw[name])]));
 const view=x=>Array.isArray(x)?x:x.toArray?x.toArray():Array.from(x),invoke=()=>f[backend](...names.map(([k])=>v[k]));
 for(const [key,value,expectedStatus]of [['automorphism_count',2n,-203n],['checking_prime_count',BigInt(raw.relation_prime_count)+1n,-206n]]){
  const args=names.map(([k])=>v[k]),state=backend==='javascript'?[0n,77n,77n,77n,77n,77n,77n,77n]:f.createInt64Buffer([0,77,77,77,77,77,77,77]);args[names.findIndex(([k])=>k==='driver_state')]=state;args[names.findIndex(([k])=>k===key)]=value;
  assert.equal(f[backend](...args),expectedStatus);assert.equal(state[4],0n);assert.equal(state[5],0n);assert.deepEqual(view(v.class_number),[77n]);
 }
 const status=invoke(),e=expected[passes-1],last=Number(view(v.relation_state)[0]);assert.equal(status,BigInt(e.status));
 const actual={passes,status:Number(status),driverState:view(v.driver_state).map(Number),trace:view(v.driver_trace).map(Number),outer:view(v.outer_state).map(Number),relationState:view(v.relation_state).map(String),classNumber:String(view(v.class_number)[0]),regulator:view(v.accept_regulator).slice(0,3).map(String),L:view(v.accept_relations).slice(0,wantL.length).map(String)};assert.deepEqual(actual,e);
 for(const [name,want,length]of [['relation_records',wanted.records,kc*last],['generators',wanted.generators,Number(raw.n)*last],['log_embeddings',wanted.logs,7*ru*last]])assert.deepEqual(view(v[name]).slice(0,length).map(String),want.slice(0,length),name);
 if(status===0n)assert.deepEqual(view(v.hnf_result_c).slice(0,wanted.C.length).map(String),wanted.C);
 if(status!==0n)assert(view(v.class_invariants).every(x=>x===77n));
 const ownerDigest=()=>{const h=createHash('sha256');for(const [name,kind]of names)if(kind.endsWith('Buffer')){h.update(name+'\0');if(backend==='javascript'){const a=v[name];for(let i=0;i<a.length;i+=1024)h.update(a.slice(i,i+1024).map(x=>Object.is(x,-0)?'-0':String(x)).join(',')+',');}else for(const a of kind==='IntegerBuffer'?[v[name].sizes,v[name].limbs]:[v[name]])h.update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength));}return h.digest('hex');};
 const before=ownerDigest();assert.equal(invoke(),status);assert.equal(ownerDigest(),before,'terminal repeat mutated an owner');
 const summary={field:2,backend,oneSameSourceEntry:true,oneNativeEntry:backend==='gmp',storage:backend==='gmp'?'packed-owners':'raw-bigint-and-number-arrays',passes,actual,ownerBytes:backend==='gmp'?ownerBytes:null,packedOwnerBytesEstimate:ownerBytes,coreBytes:fs.statSync(built.coreSourcePath).size,coreSha256:hash(fs.readFileSync(built.coreSourcePath)),qualifiedTiming:false,boundary:'prepared nf/factorbase/analytic inverse hR; same-source derived empty-W RELAT corridor; no fundamental unit maps',artifactDirectory:dir};
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({summary,expected,...(backend==='gmp'?{nativeOutput:actual}:{javascriptOutput:actual})}));console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exitCode=1;});

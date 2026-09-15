"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:180000,maxBuffer:128*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const fixture=JSON.parse(fs.readFileSync(path.resolve(process.argv[2]),'utf8')),[acceptanceCases,acceptanceExpected]=JSON.parse(fs.readFileSync(path.resolve(process.argv[3]),'utf8'));
 const analyticAt=process.argv.indexOf('--analytic-fixtures'),analyticPayload=analyticAt<0?null:JSON.parse(fs.readFileSync(path.resolve(process.argv[analyticAt+1]),'utf8'));
 const analyticValue=(field,backend)=>{const a=analyticPayload.nativeOutputs.find(r=>r.field===field&&r.backend===backend);assert(a,'missing analytic field/backend '+field+'/'+backend);return a.inverseHR;};
 assert(fixture.nativeOutputs.some(r=>r.backend==='gmp'),'requires previously validated collector native outputs');
 const sourcePath=path.join(__dirname,'prepared_class_group_attempt.py'),names=fs.readFileSync(sourcePath,'utf8').match(/def pari_prepared_class_group_attempt\(([\s\S]*?)\n\)/)[1].trim().split('\n').map(s=>s.trim().replace(/,$/,'').split(': '));
 const expected=fixture.expected.map(e=>{const i=acceptanceCases.findIndex(r=>r.genuine&&r.field===e.field&&JSON.stringify(r.C)===JSON.stringify(e.C));assert(i>=0,'missing matching independently replayed acceptance fixture');return {action:acceptanceExpected[i]?.acceptance[1]??-100,acceptance:acceptanceExpected[i],field:e.field};});
 const inputs=fixture.inputs.map((raw,index)=>{
  const v=structuredClone(raw),e=fixture.expected[index],n=Number(v.n),ru=(n+Number(v.admission_real_count))/2,kc=v.relation.length,capacity=Number(v.relation_state[1]),cap=Math.max(64,(kc+128)**2,7*ru*(kc+128));
  const primes=e.groups?e.groups.map(g=>String(g.p)):v.admission_prime_counts.flatMap((count,p)=>Number(count)?[String(p)]:[]);
  Object.assign(v,{initial_additional:String(e.additional??2),initial_target:String(e.target??400),initial_primes:primes,initial_offsets:primes.map(p=>v.admission_prime_offsets[Number(p)]),initial_counts:primes.map(p=>v.admission_prime_counts[Number(p)]),initial_complete:e.groups?e.groups.map(g=>String(g.complete)):primes.map(()=>'1'),hnf_k0:'0',hnf_original:Array(kc*capacity).fill('77'),hnf_perm:(e.initialPerm??Array.from({length:kc},(_,j)=>j+1)).map(String),chain_state:['0','77','77','77'],log_precision:'128',log_completed:['0'],log_embeddings:Array(capacity*7*ru).fill('0'),log_coordinates:Array(n).fill('0'),log_column:Array(7*ru).fill('0'),log_cache:Array(3).fill('0'),log_pi_cache:Array(3).fill('0'),log_a:Array(64).fill('0'),log_b:Array(64).fill('0'),log_p:Array(64).fill('0'),log_q:Array(64).fill('0'),log_stack:Array(128).fill('0'),accept_inverse_hr:e.inverseHR,accept_cache_changed:true,attempt_state:['0','77','77','77'],class_invariants:Array(kc).fill('77'),class_number:['77']});
  // Actual-policy fixtures publish pristine complete wrapper inputs, including
  // source k0 and logarithm precision. Do not replace these with toy settings.
  const preparedNative=fixture.nativeInputs?.find(r=>r.backend==='gmp'&&r.field===e.field);
  if(preparedNative)Object.assign(v,structuredClone(preparedNative.input));
  if(analyticPayload){v.accept_inverse_hr=analyticValue(e.field,'gmp');assert.deepEqual(v.accept_inverse_hr,e.inverseHR,'native analytic/source mismatch');}
  assert(Array.isArray(v.accept_inverse_hr),'analytic inverse hR must be supplied explicitly');
  for(const [name,kind]of names)if(!(name in v)){assert(kind.endsWith('Buffer'),name);v[name]=Array(name.startsWith('hnf_')?cap:4096).fill('77');}
  v.accept_multiple_state=['77','0','73','77'];v.accept_post_hnf_state=['77','77','77'];v.accept_acceptance_state=['77','77','77'];v.accept_reconstruction_state=Array(4).fill('77');v.smith_state=Array(6).fill('77');
  return Object.fromEntries(names.map(([name])=>[name,v[name]]));
 });
 const cp=JSON.parse(run('python3',['-c',`import json,sys,decimal,importlib,copy
sys.set_int_max_str_digits(100000);sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.prepared_class_group_attempt').pari_prepared_class_group_attempt
d=json.load(sys.stdin);out=[]
for ix,raw in enumerate(d['inputs']):
 v={}
 for name,kind in d['names']:
  conv=bool if kind=='bool' else float if kind in ('float','Float64Buffer') else int;x=raw[name];v[name]=list(map(conv,x)) if isinstance(x,list) else conv(x)
 e=d['expected'][ix];action=f(**v);assert action==e['action'],(ix,action,e)
 assert v['attempt_state'][0]==4 and v['attempt_state'][1]==action
 if action==0:
  assert v['attempt_state'][3]==1 and v['class_number'][0]==v['accept_class_number'][0]
  assert v['accept_regulator'][:3]==list(map(int,e['acceptance']['regulator']))
 else:assert v['attempt_state'][3]==0 and v['class_number']==[77] and v['class_invariants']==[77]*len(v['relation'])
 before=copy.deepcopy(v);assert f(**v)==action and v==before
 count=v['attempt_state'][2];out.append({'action':action,'state':v['attempt_state'],'invariants':list(map(str,v['class_invariants'][:count])),'classNumber':str(v['class_number'][0]),'regulator':list(map(str,v['accept_regulator'][:3])),'H':list(map(str,v['hnf_result_h'][:v['hnf_state'][0]**2]))})
print(json.dumps(out))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify({inputs,names,expected})}));
 const summary={cases:inputs.length,cp,oneNativeCall:true,qualifiedTiming:false,inputFixtureHash:createHash('sha256').update(fs.readFileSync(path.resolve(process.argv[2]))).digest('hex'),acceptanceFixtureHash:createHash('sha256').update(fs.readFileSync(path.resolve(process.argv[3]))).digest('hex'),sourcePolicy:fixture.summary.policy??fixture.summary.preparedBoundary,boundary:'Prepared nf/factor-base/ideal packets, initial search policy and analytic inverse hR; one initial attempt, no retries, honesty proof or full unit maps. Only accepted-candidate invariants publish; completeness requires the caller honesty gate.'};
 if(process.argv.includes('--source-only')){console.log(JSON.stringify(summary));return;}
 const built=await compileKernel({sourcePath}),f=require(built.modulePath).pari_prepared_class_group_attempt;assert(f.nativeAvailable);assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
 const nativeOutputs=[];
 for(const backend of ['javascript','gmp'])for(let i=0;i<inputs.length;i++){
  const v=Object.fromEntries(names.map(([name,kind])=>{const conv=kind==='bool'?Boolean:kind==='float'||kind==='Float64Buffer'?Number:BigInt,x=inputs[i][name];return [name,Array.isArray(x)?x.map(conv):conv(x)];})),invoke=()=>f[backend](...names.map(([name])=>v[name]));
  if(analyticPayload)v.accept_inverse_hr=analyticValue(expected[i].field,backend).map(BigInt);
  const action=invoke();assert.equal(action,BigInt(expected[i].action));assert.deepEqual(v.attempt_state,cp[i].state.map(BigInt));const count=Number(v.attempt_state[2]);assert.deepEqual(v.class_invariants.slice(0,count).map(String),cp[i].invariants);assert.equal(String(v.class_number[0]),cp[i].classNumber);assert.deepEqual(v.accept_regulator.slice(0,3).map(String),cp[i].regulator);
  if(action!==0n){assert.deepEqual(v.class_number,[77n]);assert(v.class_invariants.every(x=>x===77n));}
  nativeOutputs.push({backend,field:expected[i].field,action:Number(action),attemptState:v.attempt_state.map(Number),invariants:v.class_invariants.slice(0,count).map(String),classNumber:String(v.class_number[0]),regulator:v.accept_regulator.slice(0,3).map(String),relationCount:String(v.relation_state[0]),hnfState:v.hnf_state.slice(0,9).map(Number)});
  const dump=()=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x),before=dump();assert.equal(invoke(),action);assert.equal(dump(),before);
 }
 for(const backend of ['javascript','gmp'])for(const kind of ['state','partial','result']){
  const v=Object.fromEntries(names.map(([name,type])=>{const conv=type==='bool'?Boolean:type==='float'||type==='Float64Buffer'?Number:BigInt,x=inputs[0][name];return [name,Array.isArray(x)?x.map(conv):conv(x)];}));
  if(kind==='state')v.attempt_state=[];if(kind==='partial')v.attempt_state[0]=2n;if(kind==='result')v.class_invariants=[];
  const dump=()=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x),before=dump();assert.throws(()=>f[backend](...names.map(([name])=>v[name])),/short prepared class attempt state|cannot reuse a partial class group attempt|short prepared class result owners/);assert.equal(dump(),before);
 }
 summary.analyticProvenance=analyticPayload?'actual native producer matched by field/backend':'upstream-prepared inverse hR';summary.coreBytes=fs.statSync(built.coreSourcePath).size;summary.coreHash=createHash('sha256').update(fs.readFileSync(built.coreSourcePath)).digest('hex');summary.outputHash=createHash('sha256').update(JSON.stringify(nativeOutputs)).digest('hex');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-prepared-class-attempt-'));fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({summary,nativeOutputs}));summary.artifactDirectory=dir;console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exitCode=1;});

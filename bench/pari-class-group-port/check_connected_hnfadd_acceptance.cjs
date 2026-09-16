"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
const sourcePath=path.join(__dirname,'connected_hnfadd_acceptance.py');
const signature=fs.readFileSync(sourcePath,'utf8').match(/def pari_connected_hnfadd_acceptance\(([\s\S]*?)\n\)/)[1].trim().split('\n').map(x=>x.trim().replace(/,$/,'').split(': '));
(async()=>{
 const limit=fs.readFileSync('/proc/self/limits','utf8').split('\n').find(x=>x.startsWith('Max address space'));
 const soft=limit?.trim().split(/\s+/)[3];assert(soft&&soft!=='unlimited'&&Number(soft)<=4294967296,'Run this Linux diagnostic under prlimit --as=4294967296 and NODE_OPTIONS=--max-old-space-size=1536');
 const analytic=JSON.parse(fs.readFileSync(process.argv[4])).nativeOutputs,cases=[];
 for(const [field,file]of [[2,process.argv[2]],[3,process.argv[3]]]){
  const events=JSON.parse(fs.readFileSync(file));let input=null,output=null,multiple=null;
  for(const e of events){
   if(e.event==='hnfadd_input')input=e;
   if(e.event==='hnfadd_output')output=e;
   if(e.event==='regulator_multiple')multiple=e;
   if(e.event==='acceptance'&&input&&output){
    const inv=analytic.find(x=>x.field===field&&x.backend==='gmp');assert(inv,'missing actual analytic output');
    cases.push({field,input,output,multiple,acceptance:e,inverseHR:inv.inverseHR,changed:true,kind:'actual'});input=null;output=null;
   }
   if(e.event==='acceptance_lattice'&&cases.length&&cases.at(-1).field===field)cases.at(-1).L=e.L;
  }
 }
 assert.equal(cases.length,6);
 cases.push({...cases[1],kind:'unchanged',changed:false});
 cases.push({...cases[0],kind:'empty'});
 cases.push({field:-1,kind:'dimension',changed:true,inverseHR:cases[0].inverseHR,input:{H:[],D:[],B:[],C:[],hRows:0,bColumns:0,totalColumns:0,logRows:3,perm:[1],rows:1,newRelations:['0'],newColumns:1,newLogs:Array.from({length:3},()=>['1','0','0','-192','0','-1','0']).flat(),last:1}});
 function argumentsFor(r){
  const x=r.input,lig=x.rows-x.bColumns,width=x.newColumns+x.hRows;
  const cap=Math.max(64,7*x.logRows*(x.totalColumns+x.newColumns),(lig+width)**2,lig*x.rows,x.rows);
  const v=Object.fromEntries(signature.map(([n,t])=>[n,t.endsWith('Buffer')?Array(cap).fill('77'):0]));
  Object.assign(v,{h:x.H,h_rows:x.hRows,dep:x.D,b:x.B,b_columns:x.bColumns,logs:x.C,total_columns:x.totalColumns,log_rows:x.logRows,perm:x.perm,rows:x.rows,new_relations:x.newRelations,new_columns:r.kind==='empty'?0:x.newColumns,new_logs:x.newLogs,accept_degree:4,accept_inverse_hr:r.inverseHR,accept_cache_changed:r.changed});
  // Deliberately stale need1: connector must replace it at source dimension gate.
  v.accept_multiple_state[1]='1';return structuredClone(v);
 }
 const raw=cases.map(argumentsFor),dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-connected-hnfadd-acceptance-'));
 const python=String.raw`
import sys,json,importlib,copy
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.connected_hnfadd_acceptance').pari_connected_hnfadd_acceptance
sig,raw,cases=json.load(sys.stdin);out=[]
keys=['h','dep','b','logs','new_relations','new_logs','attempt_state','state','perm','result_h','result_dep','result_b','result_c','accept_post_hnf_state','accept_acceptance_state','accept_multiple_state','accept_multiple','accept_class_number','accept_regulator','accept_relations','accept_denominator']
for v,r in zip(raw,cases):
 v={n:([int(y) for y in v[n]] if t.endswith('Buffer') else bool(v[n]) if t=='bool' else int(v[n])) for n,t in sig}
 before=repr(v);readonly=repr([v[k] for k in keys[:6]])
 if r is cases[0]:
  for key in ['attempt_state','accept_multiple_state']:
   bad=copy.deepcopy(v);bad[key]=[];saved=repr(bad)
   try:f(**bad)
   except ValueError:pass
   else:raise AssertionError('short state accepted')
   assert repr(bad)==saved
 status=f(**v)
 assert repr([v[k] for k in keys[:6]])==readonly
 if r['kind']=='empty':assert status==1 and repr(v)==before
 elif r['kind']=='dimension':
  assert status==-100 and v['attempt_state'][:4]==[2,-100,1,1]
  assert v['accept_post_hnf_state'][:3]==[1,1,0]
  assert all(x==77 for x in v['accept_regulator']) and all(x==77 for x in v['accept_acceptance_state'])
  assert v['accept_multiple_state'][1]==1
 else:
  assert v['attempt_state'][0]==3 and v['state'][8]==0
  for key,name in [('H','result_h'),('D','result_dep'),('B','result_b'),('C','result_c')]:
   want=list(map(int,r['output'][key]));assert v[name][:len(want)]==want,(r['field'],r['input']['last'],key)
  assert v['perm']==r['output']['perm']
  expected=4 if r['kind']=='unchanged' else 5 if r['acceptance']['code']==1 else 0
  assert status==expected,(r['field'],r['input']['last'],status,expected)
  assert v['accept_multiple_state'][1]==(1 if expected else 0)
  m=r['multiple']['R'];assert v['accept_multiple'][:3]==[int(m['mantissa']),m['precision'],m['exponent']]
  if status==0:
   z=r['acceptance']['R'];assert v['accept_regulator'][:3]==[int(z['mantissa']),z['precision'],z['exponent']]
   assert v['accept_class_number'][0]==int(r['acceptance']['h'])
   if r.get('L'):assert v['accept_relations'][:len(r['L'])]==list(map(int,r['L']))
  else:assert all(x==77 for x in v['accept_regulator']) and all(x==77 for x in v['accept_relations'])
 out.append({'status':status,'outputs':{k:list(map(str,v[k])) for k in keys}})
print(json.dumps(out))
`;
 const cp=spawnSync('python3',['-c',python,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([signature,raw,cases]),encoding:'utf8',timeout:60000,maxBuffer:64*1024*1024});assert.equal(cp.status,0,cp.stderr||String(cp.error));
 const expected=JSON.parse(cp.stdout);
 const maximumBits=expected.reduce((max,r)=>Math.max(max,...Object.values(r.outputs).flat().map(x=>(BigInt(x)<0n?-BigInt(x):BigInt(x)).toString(2).length)),0);
 const wordCapacity=64;assert(maximumBits<=wordCapacity*64,'CP outputs exceed declared packed word capacity');
 const allocationBytes=raw.map(v=>signature.reduce((sum,[n,t])=>sum+(t==='IntegerBuffer'?v[n].length*(4+8*wordCapacity):t==='Int64Buffer'?8*v[n].length:0),0));
 assert(Math.max(...allocationBytes)<1024**3,'single-case packed allocation exceeds1GiB');
 fs.writeFileSync(path.join(dir,'cp-fixtures.json'),JSON.stringify({cases,signature,inputs:raw,expected,maximumBits,wordCapacity,allocationBytes}));
 const built=await compileKernel({sourcePath}),f=require(built.modulePath).pari_connected_hnfadd_acceptance;assert(f.nativeAvailable);
 assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
 const nativeOutputs=[];
 // Large generated-JavaScript append replay exceeded this diagnostic's budget.
 // GMP covers every actual transition; JS is limited to the two small gates.
 for(const backend of ['gmp','javascript'])for(let i=0;i<cases.length;i++){
  if(backend==='javascript'&&!['empty','dimension'].includes(cases[i].kind))continue;
  const v=Object.fromEntries(signature.map(([n,t])=>[n,t==='IntegerBuffer'?f.createIntegerBuffer(raw[i][n].length,wordCapacity,raw[i][n].map(BigInt)):t==='Int64Buffer'?raw[i][n].map(BigInt):t==='bool'?raw[i][n]:BigInt(raw[i][n])]));
  const result=f[backend](...signature.map(([n])=>v[n]));assert.equal(result,BigInt(expected[i].status));
  const view=x=>Array.isArray(x)?x:x.toArray();
  for(const [key,want]of Object.entries(expected[i].outputs))assert.deepEqual(view(v[key]).map(String),want,backend+' case'+i+' '+key);
  nativeOutputs.push({backend,field:cases[i].field,last:cases[i].input.last,kind:cases[i].kind,status:Number(result),attemptState:view(v.attempt_state).slice(0,4).map(Number),classNumber:String(view(v.accept_class_number)[0]),regulator:view(v.accept_regulator).slice(0,3).map(String)});
 }
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({cases,signature,inputs:raw,expected,nativeOutputs}));
 console.log(JSON.stringify({cases:cases.length,actualAppendStages:6,atomicCpGuards:2,maximumBits,wordCapacity,allocationBytes,nativeOutputs,traceSha256:hash(JSON.stringify(expected)),coreBytes:fs.statSync(built.coreSourcePath).size,cacheKey:built.cacheKey,artifactDirectory:dir,qualifiedTiming:false},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});

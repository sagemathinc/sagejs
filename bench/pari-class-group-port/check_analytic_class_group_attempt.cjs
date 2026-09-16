"use strict";
// Prepared field data -> analytic inverse hR -> initial class candidate.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
const encode=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v);
(async()=>{
 const preparedBytes=fs.readFileSync(process.argv[2]),analyticBytes=fs.readFileSync(process.argv[3]);
 const prepared=JSON.parse(preparedBytes),analytic=JSON.parse(analyticBytes);
 const sourcePath=path.join(__dirname,'analytic_class_group_attempt.py'),source=fs.readFileSync(sourcePath,'utf8');
 const names=source.match(/def pari_analytic_class_group_attempt\(([\s\S]*?)\n\)/)[1].trim().split('\n').map(s=>s.trim().replace(/,$/,'').split(': '));
 const inputs=prepared.inputs.map((raw,i)=>{
  const field=prepared.expected[i].field,a=analytic.cases[field];assert(a,'missing analytic raw field');
  assert.equal(Number(a.real_places),Number(raw.admission_real_count));assert.equal(Number(a.real_places)+2*Number(a.complex_places),Number(raw.n));
  const v=structuredClone(raw);v.accept_inverse_hr=['-991','-992','-993']; // Deliberately not the source answer.
  for(const [name]of analytic.names)if(!['real_places','complex_places'].includes(name))v['analytic_'+name]=structuredClone(a[name]);
  v.analytic_log_discriminant=[-999.0]; // Output-only; raw discriminant drives LOGD.
  v.analytic_state=['77','77'];
  for(const [name]of names)assert(name in v,name);
  return Object.fromEntries(names.map(([name])=>[name,v[name]]));
 });
 const expected=prepared.expected.map((e,i)=>({field:e.field,...prepared.summary.cp[i],analytic:analytic.expected[e.field],logDiscriminant:analytic.cases[e.field].log_discriminant[0]}));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-analytic-class-attempt-'));
 const payload={names,inputs,expected};
 fs.writeFileSync(path.join(dir,'inputs.json'),JSON.stringify(payload));
 const script=`import json,sys,importlib,copy,decimal
sys.set_int_max_str_digits(100000);sys.path[:0]=sys.argv[1:3]
module=importlib.import_module('bench.pari-class-group-port.analytic_class_group_attempt');f=module.pari_analytic_class_group_attempt
d=json.load(sys.stdin);out=[]
for raw,e in zip(d['inputs'],d['expected']):
 v={}
 for name,kind in d['names']:
  conv=bool if kind=='bool' else float if kind in ('float','Float64Buffer') else int;x=raw[name];v[name]=list(map(conv,x)) if isinstance(x,list) else conv(x)
 original=copy.deepcopy(v);result=f(**v)
 assert result==e['action'];assert v['attempt_state']==e['state']
 assert v['analytic_state']==list(map(int,e['analytic'][:2]));assert v['accept_inverse_hr']==list(map(int,e['analytic'][2:]))
 assert v['analytic_log_discriminant']==[e['logDiscriminant']]
 assert str(v['class_number'][0])==e['classNumber'];assert list(map(str,v['class_invariants'][:v['attempt_state'][2]]))==e['invariants']
 assert list(map(str,v['accept_regulator'][:3]))==e['regulator']
 before=copy.deepcopy(v);assert f(**v)==result and v==before
 # Terminal repeat must not inspect/recompute even malformed analytic data.
 v['analytic_primes']=[];v['analytic_state']=[];v['accept_inverse_hr']=[];before=copy.deepcopy(v);assert f(**v)==result and v==before
 for kind in ('state','partial','result','chain','analytic','log'):
  w=copy.deepcopy(original)
  if kind=='state':w['attempt_state']=[]
  if kind=='partial':w['attempt_state'][0]=2
  if kind=='result':w['class_number']=[]
  if kind=='chain':w['chain_state'][0]=1
  if kind=='analytic':w['analytic_state']=[]
  if kind=='log':w['analytic_log_discriminant']=[]
  before=copy.deepcopy(w)
  try:f(**w)
  except ValueError:pass
  else:raise AssertionError(kind)
  assert w==before,kind
 w=copy.deepcopy(original);w['analytic_discriminant']=0
 try:f(**w)
 except ValueError:pass
 else:raise AssertionError('zero discriminant')
 assert w['attempt_state']==[1,-1,0,0]
 assert w['class_number']==original['class_number'] and w['class_invariants']==original['class_invariants']
 before=copy.deepcopy(w)
 try:f(**w)
 except ValueError:pass
 else:raise AssertionError('failed analytic reentry')
 assert w==before
 out.append({'field':e['field'],'action':result,'classNumber':e['classNumber'],'invariants':e['invariants'],'regulator':e['regulator'],'analytic':e['analytic']})
print(json.dumps(out))
`;
 const r=spawnSync('python3',['-c',script,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(payload),encoding:'utf8',maxBuffer:128*1024*1024,timeout:60000});assert.equal(r.status,0,r.stderr||String(r.error));
 const cp=JSON.parse(r.stdout),nativeOutputs=[];let kernelArtifacts=null;
 const at=process.argv.indexOf('--backend'),backend=at<0?null:process.argv[at+1];
 assert([null,'javascript','gmp','tagged'].includes(backend),'unsupported backend');
 if(backend){
  let f;
  if(backend==='javascript'){
   const {lowerSource}=require('../../tools/native-kernel/ir.cjs'),{createNativeImportResolver}=require('../../tools/native-kernel/native-imports.cjs'),{generateJavaScript}=require('../../tools/native-kernel/js-backend.cjs');
   const resolveNativeImport=createNativeImportResolver({root:path.resolve(__dirname,'../..'),lowerSource,initialSourcePath:sourcePath});
   const ir=await lowerSource(source,sourcePath,{resolveNativeImport}),modulePath=path.join(dir,'kernel.cjs');fs.writeFileSync(modulePath,generateJavaScript(ir,{sourcePath}));f=require(modulePath).pari_analytic_class_group_attempt;
  }else{
   const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');const built=await compileKernel({sourcePath});f=require(built.modulePath).pari_analytic_class_group_attempt;assert(f.nativeAvailable);
   assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
   kernelArtifacts={coreSourcePath:built.coreSourcePath,coreHash:hash(fs.readFileSync(built.coreSourcePath)),coreBytes:fs.statSync(built.coreSourcePath).size,modulePath:built.modulePath,moduleHash:hash(fs.readFileSync(built.modulePath))};
   assert(built.addonPath&&fs.existsSync(built.addonPath),'missing native addon artifact');
   const irBytes=encode(built.ir),irPath=path.join(dir,'ir.json');fs.writeFileSync(irPath,irBytes);
   Object.assign(kernelArtifacts,{addonPath:built.addonPath,addonHash:hash(fs.readFileSync(built.addonPath)),irPath,irHash:hash(irBytes)});
  }
  for(let i=0;i<inputs.length;i++){
   const convert=()=>Object.fromEntries(names.map(([name,kind])=>{const c=kind==='bool'?Boolean:['float','Float64Buffer'].includes(kind)?Number:BigInt,x=inputs[i][name];return [name,Array.isArray(x)?x.map(c):c(x)];}));
   const v=convert(),e=expected[i],invoke=w=>f[backend](...names.map(([name])=>w[name]));
   const result=invoke(v);assert.equal(result,BigInt(e.action));assert.deepEqual(v.attempt_state,e.state.map(BigInt));
   assert.deepEqual(v.analytic_state.map(String),e.analytic.slice(0,2));assert.deepEqual(v.accept_inverse_hr.map(String),e.analytic.slice(2));
   assert.deepEqual(v.analytic_log_discriminant,[e.logDiscriminant]);
   assert.equal(String(v.class_number[0]),e.classNumber);assert.deepEqual(v.class_invariants.slice(0,Number(v.attempt_state[2])).map(String),e.invariants);assert.deepEqual(v.accept_regulator.slice(0,3).map(String),e.regulator);
   let before=encode(v);assert.equal(invoke(v),result);assert.equal(encode(v),before);
   v.analytic_primes=[];v.analytic_state=[];v.accept_inverse_hr=[];before=encode(v);assert.equal(invoke(v),result);assert.equal(encode(v),before);
   for(const kind of ['state','partial','result','chain','analytic','log']){
    const w=convert();if(kind==='state')w.attempt_state=[];if(kind==='partial')w.attempt_state[0]=2n;if(kind==='result')w.class_number=[];if(kind==='chain')w.chain_state[0]=1n;if(kind==='analytic')w.analytic_state=[];
    if(kind==='log')w.analytic_log_discriminant=[];
    const before=encode(w);assert.throws(()=>invoke(w),/short|partial|fresh/);assert.equal(encode(w),before);
   }
   nativeOutputs.push({backend,...cp[i]});
   const failed=convert();failed.analytic_discriminant=0n;
   const classBefore=encode([failed.class_number,failed.class_invariants]);
   assert.throws(()=>invoke(failed),/zero number-field discriminant/);assert.deepEqual(failed.attempt_state,[1n,-1n,0n,0n]);
   assert.equal(encode([failed.class_number,failed.class_invariants]),classBefore);
   const failureBefore=encode(failed);assert.throws(()=>invoke(failed),/partial/);assert.equal(encode(failed),failureBefore);
  }
 }
 const summary={cp,nativeOutputs,kernelArtifacts,sourceHash:hash(source),checkerHash:hash(fs.readFileSync(__filename)),preparedHash:hash(preparedBytes),analyticHash:hash(analyticBytes),qualifiedTiming:false,boundary:'Prepared nf/factor-base/ideal packets and raw analytic discriminant/signature/roots of unity/prime patterns; LOGD and inverse hR computed inside one translated call; initial candidate only, no honesty or retries',artifactDirectory:dir};
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({summary,names,inputs,expected,nativeOutputs}));console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exitCode=1;});

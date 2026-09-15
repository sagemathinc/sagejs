"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:180000,maxBuffer:64*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]);
 const control=JSON.parse(run(process.execPath,[path.join(__dirname,'check_regulator_acceptance.cjs'),pari,archive,'--source-only']));
 const multi=JSON.parse(run(process.execPath,[path.join(__dirname,'check_regulator_multiple.cjs'),pari,archive,'--source-only']));
 const [inputs,outputs]=JSON.parse(fs.readFileSync(path.join(multi.artifactDirectory,'fixtures.json'))),bases=[];
 for(const rows of [2,3,4])for(const status of [0,1,2,3,4]){
  const ix=inputs.findIndex((r,i)=>r.rows===rows&&r.columns>=rows-1&&outputs[i].state[0]===status);
  if(ix>=0)bases.push(inputs[ix]);
 }
 const cases=[];for(const r of bases)for(const h of [1,2])for(const exponent of [-2,0,2])for(const changed of [true,false]){
  const C=[];for(let i=0;i<r.rows*r.columns;i++)C.push('1',...r.values.slice(3*i,3*i+3),'0','-1','0');
  for(let i=0;i<r.rows;i++)C.push('1','0','-1','0','0','-1','0');
  cases.push({...r,h,H:[String(h)],hRows:1,bColumns:0,cColumns:r.columns+1,need:0,changed,C,kc:1,inv:[String(1n<<127n),'128',String(exponent)],zeta:[String(1n<<127n),'128',String(exponent+(h===2?1:0))]});
 }
 const syntheticReady=cases.length;for(let i=0;i<Math.min(6,syntheticReady);i++)cases.push({...cases[i],kc:2,need:1});
 const fixtureOption=process.argv.indexOf('--collector-fixtures');let genuine=0,collectorRows=[],collectorProvenance='none';
 if(fixtureOption>=0){
  const payload=JSON.parse(fs.readFileSync(process.argv[fixtureOption+1]));
  if(Array.isArray(payload)){collectorRows=payload;collectorProvenance='upstream-produced diagnostic matrices';}
  else{
   assert(Array.isArray(payload.nativeOutputs)&&payload.nativeOutputs.length>0,'native collector payload must contain actual produced outputs; no fallback to expected matrices');
   collectorProvenance='same-source collector and HNF produced matrices; only inverseHR remains upstream-prepared';
   collectorRows=payload.nativeOutputs.map(r=>{
    assert(['javascript','gmp'].includes(r.backend));const reference=payload.expected.find(e=>e.field===r.field);assert(reference);
    for(const key of ['H','D','B','C','hnfState'])assert.deepEqual(r[key],reference[key],'native '+r.backend+' field '+r.field+' '+key);
    return {...r,inverseHR:reference.inverseHR};
   });
  }
 }
 for(const r of collectorRows){
  const [hRows,withoutB,bColumns,missing,columns]=r.hnfState,cColumns=withoutB+bColumns,rows=r.C.length/(7*cColumns),kc=hRows+bColumns+missing;
  const inverseHR=r.inverseHR;
  const need=Math.min(kc,missing+Math.max(0,rows-1-columns));assert(need>0||inverseHR,'ready genuine fixtures require computed inverseHR, never a true regulator or class-number answer');
  const values=[];for(let i=0;i<rows*columns;i++)values.push(...r.C.slice(7*i+1,7*i+4));
  let h=1n;for(let i=0;i<hRows;i++)h*=BigInt(r.H[i*hRows+i]);
  cases.push({field:r.field,producerBackend:r.backend||'upstream',rows,columns,degree:r.degree||(r.field<2?3:4),h:String(h),hRows,bColumns,cColumns,kc,need,H:r.H,C:r.C,values,inv:inverseHR||[String(1n<<127n),'128','0'],changed:true,genuine:true});genuine++;
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-post-hnf-acceptance-'));
 let oracleSource=fs.readFileSync(path.join(control.artifactDirectory,'oracle.c'),'utf8');
 // A ready post-HNF dimension gate has need=0 on entry to compute_multiple_of_R.
 assert(oracleSource.includes('need=71,bits=73'));oracleSource=oracleSource.replace('need=71,bits=73','need=0,bits=73');
 const old='GEN z=scalar(),lambda=NULL,L=NULL;';assert(oracleSource.includes(old));
 oracleSource=oracleSource.replace(old,'long hs=itos(rd());GEN H=cgetg(hs+1,t_MAT);for(long j=1;j<=hs;j++){gel(H,j)=cgetg(hs+1,t_COL);for(long i=1;i<=hs;i++)gcoeff(H,i,j)=rd();}GEN z=mulir(ZM_det_triangular(H),scalar()),lambda=NULL,L=NULL;');
 const source=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle'),lib=path.join(pari,'Olinux-x86_64');fs.writeFileSync(source,oracleSource);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,source,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const readyCases=cases.filter(r=>r.need===0),ready=readyCases.length;
 const trace=run(exe,[],{input:[ready,...readyCases.flatMap(r=>[r.rows,r.columns,r.degree,r.changed?1:0,...r.values,r.hRows,...r.H,...r.inv])].join(' ')});
 const oracleExpected=trace.trim().split('\n').map(JSON.parse);let oi=0;const expected=cases.map(r=>r.need===0?oracleExpected[oi++]:null);
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify([cases,expected]));
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];f=importlib.import_module('bench.pari-class-group-port.post_hnf_acceptance').pari_post_hnf_acceptance
for ix,(r,e) in enumerate(zip(*json.load(sys.stdin))):
 n=r['rows'];c=r['columns'];z=n*(c+1);q=n*n;s=(n-1)*c
 lengths=[3*z,c+1,3,3*z,n,c+1,3,z,z,n,c+1,c+1,10,3*q,3*q,3*q,3,n,5,3*q,3*q,3*q,n,3,3*q,3*q,3,3*s]
 a=[[77]*(3*n*c),n,c,r['degree']]+[[77]*k for k in lengths]+[[77,0,73,77],[77]*3]+[[77]*k for k in [3*s,s,s,n-1,s,15,3,s,1,4,n-1,c]]+[r['changed'],[77]*3]
 h=[77];post=[77]*3;args=[r['kc'],r['hRows'],r['bColumns'],r['cColumns'],n,r['degree'],list(map(int,r['H'])),list(map(int,r['C'])),list(map(int,r['inv'])),a[0],h,a[33],post]+a[4:33]+a[34:]
 result=f(*args)
 if e is None:
  assert result==-100 and post==[r['need'],c,0] and h==[77]
  assert a[47]==[77]*3 and a[0]==[77]*(3*n*c)
  continue
 assert post==[0,c,1] and h==[int(r['h'])] and a[0]==list(map(int,r['values']))
 if 'zeta' in r:assert a[33]==list(map(int,r['zeta']))
 assert result==e['acceptance'][1] and a[47]==e['acceptance'],(ix,a[47],e)
 assert a[32]==e['multiple_state'] and a[43]==e['reconstruction_state'],(ix,a[32],a[43],e)
 for at,key,length in [(30,'multiple',3),(31,'coordinates',3*s),(40,'regulator',3),(41,'relations',s)]:assert a[at]==(list(map(int,e[key])) if e[key] else [77]*length),(ix,key)
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])});
 const genuineOutcomes=cases.flatMap((r,i)=>r.genuine?[{field:r.field,producerBackend:r.producerBackend,need:r.need,tentativeClassNumber:r.h,acceptance:expected[i]?.acceptance??null,multipleState:expected[i]?.multiple_state??null,reconstructionState:expected[i]?.reconstruction_state??null,regulator:expected[i]?.regulator??null}]:[]);
 const summary={cases:cases.length,readyCases:ready,rankGateCases:cases.length-ready,genuinePostHnfCases:genuine,genuineAcceptedCases:cases.filter((r,i)=>r.genuine&&expected[i]&&expected[i].acceptance[1]===0).length,collectorProvenance,genuineOutcomes,qualifiedTiming:false,traceSha256:createHash('sha256').update(trace).digest('hex'),artifactDirectory:dir};
 if(process.argv.includes('--source-only')){console.log(JSON.stringify(summary));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'post_hnf_acceptance.py')}),f=require(built.modulePath).pari_post_hnf_acceptance;assert(f.nativeAvailable);
 assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
 const words=new Set([5,6,8,9,10,21,22,26,27,32,39,43,44,45,47]);
 for(const backend of ['javascript','gmp'])for(let ix=0;ix<cases.length;ix++){
  const r=cases[ix],e=expected[ix],n=r.rows,c=r.columns,z=n*(c+1),q=n*n,s=(n-1)*c,make=(k,at)=>words.has(at)?Array(k).fill(77n):f.createIntegerBuffer(k,1024,Array(k).fill(77n)),view=x=>Array.isArray(x)?x:x.toArray();
  const lengths=[3*z,c+1,3,3*z,n,c+1,3,z,z,n,c+1,c+1,10,3*q,3*q,3*q,3,n,5,3*q,3*q,3*q,n,3,3*q,3*q,3,3*s];
  const a=[make(3*n*c,0),BigInt(n),BigInt(c),BigInt(r.degree),...lengths.map((k,i)=>make(k,i+4)),[77n,0n,73n,77n],make(3,33),...[3*s,s,s,n-1,s,15,3,s,1,4,n-1,c].map((k,i)=>make(k,i+34)),r.changed,[77n,77n,77n]],h=make(1,0),post=[77n,77n,77n];
  const result=f[backend](...[r.kc,r.hRows,r.bColumns,r.cColumns,n,r.degree].map(BigInt),r.H.map(BigInt),r.C.map(BigInt),r.inv.map(BigInt),a[0],h,a[33],post,...a.slice(4,33),...a.slice(34));
  if(!e){assert.equal(result,-100n);assert.deepEqual(post,[BigInt(r.need),BigInt(c),0n]);assert.deepEqual(view(h),[77n]);assert.deepEqual(a[47],[77n,77n,77n]);continue;}
  assert.deepEqual(post,[0n,BigInt(c),1n]);assert.deepEqual(view(h),[BigInt(r.h)]);assert.deepEqual(view(a[0]),r.values.map(BigInt));if(r.zeta)assert.deepEqual(view(a[33]),r.zeta.map(BigInt));
  assert.equal(result,BigInt(e.acceptance[1]));assert.deepEqual(a[47],e.acceptance.map(BigInt));assert.deepEqual(a[32],e.multiple_state.map(BigInt));assert.deepEqual(a[43],e.reconstruction_state.map(BigInt));
  for(const [at,key,length]of [[30,'multiple',3],[31,'coordinates',3*s],[40,'regulator',3],[41,'relations',s]])assert.deepEqual(view(a[at]),e[key].length?e[key].map(BigInt):Array(length).fill(77n),backend+' '+ix+' '+key);
 }
 console.log(JSON.stringify({...summary,coreBytes:fs.statSync(built.coreSourcePath).size,cacheKey:built.cacheKey}));
})().catch(e=>{console.error(e);process.exitCode=1;});

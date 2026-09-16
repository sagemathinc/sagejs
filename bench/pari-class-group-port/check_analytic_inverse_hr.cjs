"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]);
 const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 assert.equal(hash(archive),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 assert(['904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac','d8b09a54e51399c83f2faa92ccc3f1f70f41d660b1cb279738bc207ff553f87a'].includes(hash(path.join(pari,'src/basemath/buch2.c'))));
 const {records}=JSON.parse(run(process.execPath,[path.join(__dirname,'check_compiled_residue.cjs'),pari,'--export-fixtures']));
 const {fields}=JSON.parse(run(process.execPath,[path.join(__dirname,'check_selected_inverse_hr.cjs'),pari,archive,'--export-fixtures']));
 assert.equal(records.length,4);assert.equal(fields.length,4);
 for(let i=0;i<4;i++){assert.equal(fields[i].field,i);assert.deepEqual(records[i].selected.slice(0,3),[fields[i].degree,fields[i].r1,fields[i].r2]);assert.equal(records[i].selected[4],fields[i].residueBound);assert(Number.isFinite(records[i].selected[3])&&records[i].selected[3]>0);}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-analytic-invhr-'));
 const source=fs.readFileSync(path.join(__dirname,'analytic_inverse_hr.py'),'utf8');
 const names=source.match(/def pari_analytic_inverse_hr\(([\s\S]*?)\n\)/)[1].trim().split('\n').map(s=>s.trim().replace(/,$/,'').split(': '));
 const cases=records.map((r,i)=>{const f=fields[i];return {discriminant:f.discriminant,real_places:String(f.r1),complex_places:String(f.r2),roots_of_unity:f.rootsOfUnity,log_discriminant:[r.selected[3]],primes:r.primes,offsets:r.offsets,counts:r.counts,degrees:r.degrees,multiplicities:r.multiplicities,coefficients:Array(7).fill(0),table:Array(31).fill(0),tail:[0],logarithms:Array(r.primes.length).fill(0),log_inverse_residue:[0],inverse_residue:Array(3).fill('0'),exp_cache:Array(3).fill('0'),pi_cache:Array(3).fill('0'),a:Array(1024).fill('0'),b:Array(1024).fill('0'),p:Array(1024).fill('0'),q:Array(1024).fill('0'),stack:Array(128).fill('0')};});
 const expected=fields.map((f,i)=>[String(f.residueBound),String(records[i].selected[5]),...f.inverse_hr]);
 const replay=JSON.parse(run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.analytic_inverse_hr').pari_analytic_inverse_hr
d=json.load(sys.stdin);out=[]
for raw,want in zip(d['cases'],d['expected']):
 v={}
 for name,kind in d['names']:
  convert=float if kind=='Float64Buffer' else int;x=raw[name];v[name]=list(map(convert,x)) if isinstance(x,list) else convert(x)
 result=list(map(str,f(**v)));assert result==want,(result,want)
 assert list(map(str,f(**v)))==want
 out.append({'result':result,'inverseResidue':list(map(str,v['inverse_residue']))})
print(json.dumps(out))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify({cases,names,expected})}));
 for(let i=0;i<4;i++)assert.deepEqual(replay[i].inverseResidue,fields[i].inverseResidue);
 const nativeOutputs=[];let coreBytes=null;
 if(!process.argv.includes('--source-only')){
  const built=await compileKernel({sourcePath:path.join(__dirname,'analytic_inverse_hr.py')}),mod=require(built.modulePath),f=mod.pari_analytic_inverse_hr;
  assert(f.nativeAvailable);assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);coreBytes=fs.statSync(built.coreSourcePath).size;
  for(const backend of ['javascript','gmp'])for(let i=0;i<cases.length;i++){
   const v=Object.fromEntries(names.map(([name,kind])=>{const convert=kind==='Float64Buffer'?Number:BigInt,x=cases[i][name];return [name,Array.isArray(x)?x.map(convert):convert(x)];}));
   const result=f[backend](...names.map(([name])=>v[name]));assert.deepEqual(result.map(String),expected[i]);assert.deepEqual(v.inverse_residue.map(String),fields[i].inverseResidue);
   assert.deepEqual(f[backend](...names.map(([name])=>v[name])).map(String),expected[i]);assert.deepEqual(v.inverse_residue.map(String),fields[i].inverseResidue);
   nativeOutputs.push({backend,field:i,result:result.map(String),inverseHR:result.slice(2).map(String)});
  }
 }
 const summary={cases:cases.length,nativeOutputs,traceSha256:createHash('sha256').update(JSON.stringify(replay)).digest('hex'),coreBytes,qualifiedTiming:false,preparedBoundary:'Only field signature/discriminant/roots of unity/LOGD and prime decompositions prepared; source-transparent residue bound, prime logarithms, accumulation, real exponential and hR normalization connected',artifactDirectory:dir};
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({summary,cases,names,expected,replay,nativeOutputs}));console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exitCode=1;});

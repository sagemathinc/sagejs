"use strict";
// Diagnostic boundary measurements, deliberately not a qualified paired run.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
const {source}=require('./collector_c_control.cjs');
function run(command,args,options={}) {
 const r=spawnSync(command,args,{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,...options});
 assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;
}
function result(v,status) {
 const last=Number(v.relation_state[0]),size=v.relation.length,n=Number(v.n);
 return {status:Number(status),trials:Number(v.state[1]),attempts:Number(v.counters[0]),
  relid:Number(v.progress[0]),nfact:Number(v.progress[1]),fact_count:Number(v.counters[2]),
  last,missing:Number(v.relation_state[2]),sup:Number(v.relation_state[3]),
  basis:v.relation_basis.map(Number),hashes:v.relation_hashes.slice(0,last).map(Number),
  records:v.relation_records.slice(0,last*size).map(Number),
  generators:v.generators.slice(0,last*n).map(String)};
}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]);
 const repetitions=Number(process.argv[4]||1);
 assert(Number.isInteger(repetitions)&&repetitions>=1&&repetitions<=100);
 const fixture=JSON.parse(run(process.execPath,[path.join(__dirname,'check_compiled_ideal_collector.cjs'),pari,'--export-fixtures']));
 const pristine=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-collector-measure-')),c=path.join(dir,'control.c'),exe=path.join(dir,'control'),lib=path.join(pari,'Olinux-x86_64');
 fs.writeFileSync(c,source(pristine));
 run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const compileStart=performance.now();
 const built=await compileKernel({sourcePath:path.join(__dirname,'ideal_collector.py')});
 const compileOrCacheSeconds=(performance.now()-compileStart)/1000;
 const mod=require(built.modulePath);
 const measurements=[];
 // C includes stack allocation and cloning within its entry, but no cache setup.
 for(const row of run(exe,[String(repetitions)]).trim().split('\n').map(JSON.parse)) {
  const {index,repetitions:count,seconds,...actual}=row;
  assert.deepEqual(actual,fixture.cases[index].expected);
  measurements.push({backend:'pari-prepared-entry',index,repetitions:count,seconds});
 }
 const python=run('python3',['-c',`
import sys,json,decimal,importlib,time
sys.set_int_max_str_digits(100000)
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.ideal_collector').pari_collect_ideal_relations
payload=json.load(sys.stdin)
for case in payload['fixture']['cases']:
 elapsed=0
 for rep in range(payload['repetitions']+1):
  v={}
  for name,kind in payload['fixture']['names']:
   x=case['input'][name]; conv=float if kind in ('float','Float64Buffer') else int
   v[name]=list(map(conv,x)) if isinstance(x,list) else conv(x)
  args=[v[name] for name,kind in payload['fixture']['names']]
  start=time.perf_counter(); status=f(*args); duration=time.perf_counter()-start
  if rep: elapsed+=duration
  last=v['relation_state'][0]; size=len(v['relation']); n=v['n']
  actual=dict(status=status,trials=v['state'][1],attempts=v['counters'][0],relid=v['progress'][0],nfact=v['progress'][1],fact_count=v['counters'][2],last=last,missing=v['relation_state'][2],sup=v['relation_state'][3],basis=v['relation_basis'],hashes=v['relation_hashes'][:last],records=v['relation_records'][:last*size],generators=list(map(str,v['generators'][:last*n])))
  assert actual==case['expected'],case['index']
 print(json.dumps(dict(backend='cpython-call',index=case['index'],repetitions=payload['repetitions'],seconds=elapsed)))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{
  input:JSON.stringify({fixture,repetitions})});
 measurements.push(...python.trim().split('\n').map(JSON.parse));
 for(const backend of ['javascript','gmp','gmp-packed'])for(const entry of fixture.cases) {
  let seconds=0;
  for(let rep=0;rep<=repetitions;rep++) {
   const v={};
   for(const [name,kind] of fixture.names) {
    const convert=kind==='float'||kind==='Float64Buffer'?Number:BigInt,x=entry.input[name];
    v[name]=Array.isArray(x)?x.map(convert):convert(x);
    if(backend==='gmp-packed'&&Array.isArray(x)) {
     if(kind==='IntegerBuffer') {
      const words=v[name].reduce((m,x)=>Math.max(m,Math.ceil((x<0n?-x:x).toString(2).length/64)),8);
      v[name]=mod.createIntegerBuffer(x.length,words,v[name]);
     } else if(kind==='Int64Buffer')v[name]=BigInt64Array.from(v[name]);
     else if(kind==='Float64Buffer')v[name]=Float64Array.from(v[name]);
    }
   }
   const args=fixture.names.map(([name])=>v[name]);
   const start=performance.now(),status=mod.pari_collect_ideal_relations[backend==='gmp-packed'?'gmp':backend](...args);
   const duration=(performance.now()-start)/1000;if(rep)seconds+=duration;
   if(backend==='gmp-packed')for(const [name,kind] of fixture.names) {
    if(kind==='IntegerBuffer')v[name]=v[name].toArray();
    else if(kind==='Int64Buffer'||kind==='Float64Buffer')v[name]=Array.from(v[name]);
   }
   assert.deepEqual(result(v,status),entry.expected,`${backend} case ${entry.index}`);
  }
  measurements.push({backend:backend+'-host-call',index:entry.index,repetitions,seconds});
 }
 const totals=Object.fromEntries([...new Set(measurements.map(r=>r.backend))].map(backend=>[
  backend,measurements.filter(r=>r.backend===backend).reduce((sum,r)=>sum+r.seconds,0)]));
 console.log(JSON.stringify({schema:'collector-call-diagnostic-v1',qualified:false,
  boundary:'C entry excludes initial allocation; GMP host call includes marshalling, allocation and copyback. No equal-boundary speed ratio.',
  compileOrCacheSeconds,modulePath:built.modulePath,node:process.version,
  host:{platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0]?.model},
  generatedCoreBytes:fs.statSync(built.coreSourcePath).size,
  controlSourceSha256:createHash('sha256').update(fs.readFileSync(c)).digest('hex'),
  provenance:fixture.provenance,totals,measurements}));
})().catch(e=>{console.error(e);process.exitCode=1;});

"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const rows=JSON.parse(run(process.execPath,[path.join(__dirname,'check_log_embedding.cjs'),process.argv[2],'--export-fixtures']));
 assert.equal(rows.length,80);
 const groups=Array.from({length:4},(_,i)=>rows.slice(20*i,20*i+20));
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.relation_log_embeddings').pari_append_relation_log_embeddings
for group in json.load(sys.stdin):
 r=group[0];n=r['n'];width=len(r['expected']);matrix=[list(map(int,v)) for v in r['matrix']]
 generators=[int(v) for s in group for v in ([s['coords'][0]]+['0']*(n-1) if s['scalar'] else s['coords'])]
 metadata=[v for i in range(20) for v in (i+1,0,0)]
 completed=[0];out=[77]*(20*width);coords=[0]*n;column=[0]*width
 work=[[0]*3,[0]*3]+[[0]*64 for _ in range(4)]+[[0]*128]
 for count in (10,20):
  if count==20:
   metadata[32]=1;before=str((completed,out,coords,column,work))
   try:f(*matrix,generators,metadata,count,n,r['r1'],128,completed,out,coords,column,*work)
   except ValueError:pass
   else:raise AssertionError('automorphism accepted')
   assert str((completed,out,coords,column,work))==before;metadata[32]=0
  assert f(*matrix,generators,metadata,count,n,r['r1'],128,completed,out,coords,column,*work)==count
  assert out[:count*width]==[int(v) for s in group[:count] for v in s['expected']]
  assert out[count*width:]==[77]*((20-count)*width)
 before=str((out,coords,column,work));assert f([],[],[],generators,metadata,20,n,r['r1'],128,completed,out,coords,column,*work)==20;assert str((out,coords,column,work))==before
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(groups)});
 const built=await compileKernel({sourcePath:path.join(__dirname,'relation_log_embeddings.py')}),f=require(built.modulePath).pari_append_relation_log_embeddings;assert(f.nativeAvailable);
 for(const backend of ['javascript','gmp'])for(const group of groups){
  const r=group[0],n=r.n,width=r.expected.length;
  const make=(n,value=0n)=>backend==='javascript'?Array(n).fill(value):f.createIntegerBuffer(n,64,Array(n).fill(value));
  const generators=group.flatMap(s=>s.scalar?[s.coords[0],...Array(n-1).fill('0')]:s.coords).map(BigInt),metadata=group.flatMap((_,i)=>[BigInt(i+1),0n,0n]);
  const completed=make(1),out=make(20*width,77n),coords=make(n),column=make(width),work=[make(3),make(3),...Array.from({length:4},()=>make(64)),make(128)];
  const values=b=>Array.isArray(b)?b.slice():b.toArray();
  for(const count of [10,20]){
   if(count===20){metadata[32]=1n;const before=[completed,out,coords,column,...work].map(values);assert.throws(()=>f[backend](...r.matrix.map(v=>v.map(BigInt)),generators,metadata,20n,BigInt(n),BigInt(r.r1),128n,completed,out,coords,column,...work));assert.deepEqual([completed,out,coords,column,...work].map(values),before);metadata[32]=0n;}
   assert.equal(f[backend](...r.matrix.map(v=>v.map(BigInt)),generators,metadata,BigInt(count),BigInt(n),BigInt(r.r1),128n,completed,out,coords,column,...work),BigInt(count));assert.deepEqual(values(out),[...group.slice(0,count).flatMap(s=>s.expected).map(BigInt),...Array((20-count)*width).fill(77n)]);
  }
  const snapshot=()=>[out,coords,column,...work].map(values),before=snapshot();assert.equal(f[backend]([],[],[],generators,metadata,20n,BigInt(n),BigInt(r.r1),128n,completed,out,coords,column,...work),20n);assert.deepEqual(snapshot(),before);
 }
 console.log(JSON.stringify({fields:groups.length,columns:80,stagedPrefixes:[10,20],backends:['PARI','CPython','javascript','gmp'],core_bytes:fs.statSync(built.coreSourcePath).size}));
})().catch(e=>{console.error(e);process.exitCode=1;});

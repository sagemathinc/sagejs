"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const rows=JSON.parse(run(process.execPath,[path.join(__dirname,'check_log_embedding.cjs'),process.argv[2],'--scalar-provenance','--export-fixtures']));
 assert.equal(rows.length,192);
 const groups=[];
 for(let i=0;i<rows.length;i+=8){
  const columns=rows.slice(i,i+4),scalars=rows.slice(i+4,i+8);
  groups.push({prefix:4,rows:[...scalars,...columns]});
  // Scalar-shaped coordinates with zero prefix MUST remain columns.
  groups.push({prefix:0,rows:[...columns,...columns]});
 }
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.relation_log_embeddings').pari_append_relation_log_embeddings
for packet in json.load(sys.stdin):
 group=packet['rows'];prefix=packet['prefix'];r=group[0];n=r['n'];width=len(r['expected']);matrix=[list(map(int,v)) for v in r['matrix']]
 generators=[int(v) for s in group for v in s['coords']];metadata=[v for i in range(8) for v in (i+1,0,0)]
 completed=[0];out=[77]*(8*width);coords=[0]*n;column=[0]*width
 work=[[0]*3,[0]*3]+[[0]*64 for _ in range(4)]+[[0]*128]
 def call(count,chosen=prefix,mat=matrix):return f(*mat,generators,metadata,count,n,r['r1'],r['precision'],completed,out,coords,column,*work,chosen)
 for invalid in (-1,9):
  before=str((completed,out,coords,column,work))
  try:call(8,invalid)
  except ValueError:pass
  else:raise AssertionError('invalid prefix accepted')
  assert str((completed,out,coords,column,work))==before
 for count in (4,8):
  if count==8:
   metadata[14]=1;before=str((completed,out,coords,column,work))
   try:call(count)
   except ValueError:pass
   else:raise AssertionError('automorphism accepted')
   assert str((completed,out,coords,column,work))==before;metadata[14]=0
  assert call(count)==count
  assert out[:count*width]==[int(v) for s in group[:count] for v in s['expected']]
  assert out[count*width:]==[77]*((8-count)*width)
 before=str((out,coords,column,work));assert call(8,mat=[[],[],[]])==8;assert str((out,coords,column,work))==before
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(groups)});
 if(process.argv.includes('--cpython-only')){console.log(JSON.stringify({groups:groups.length,columns:groups.length*8,backends:['PARI','CPython']}));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'relation_log_embeddings.py')}),f=require(built.modulePath).pari_append_relation_log_embeddings;assert(f.nativeAvailable);
 for(const backend of ['javascript','gmp','tagged'])for(const {prefix,rows:group} of groups){
  const r=group[0],n=r.n,width=r.expected.length;
  const make=(n,value=0n)=>backend==='javascript'?Array(n).fill(value):f.createIntegerBuffer(n,64,Array(n).fill(value));
  const generators=group.flatMap(s=>s.coords).map(BigInt),metadata=group.flatMap((_,i)=>[BigInt(i+1),0n,0n]);
  const completed=make(1),out=make(8*width,77n),coords=make(n),column=make(width),work=[make(3),make(3),...Array.from({length:4},()=>make(64)),make(128)];
  const values=b=>Array.isArray(b)?b.slice():b.toArray();
  const snapshot=()=>[completed,out,coords,column,...work].map(values);
  const call=(count,chosen=prefix,matrix=r.matrix.map(v=>v.map(BigInt)))=>f[backend](...matrix,generators,metadata,BigInt(count),BigInt(n),BigInt(r.r1),BigInt(r.precision),completed,out,coords,column,...work,BigInt(chosen));
  for(const invalid of [-1,9]){const before=snapshot();assert.throws(()=>call(8,invalid));assert.deepEqual(snapshot(),before);}
  for(const count of [4,8]){
   if(count===8){metadata[14]=1n;const before=snapshot();assert.throws(()=>call(8));assert.deepEqual(snapshot(),before);metadata[14]=0n;}
   assert.equal(call(count),BigInt(count));assert.deepEqual(values(out),[...group.slice(0,count).flatMap(s=>s.expected).map(BigInt),...Array((8-count)*width).fill(77n)]);
  }
  const before=snapshot();assert.equal(call(8,prefix,[[],[],[]]),8n);assert.deepEqual(snapshot(),before);
 }
 console.log(JSON.stringify({groups:groups.length,columns:groups.length*8,scalarPrefixes:[0,4],stagedPrefixes:[4,8],backends:['PARI','CPython','javascript','gmp','tagged'],core_bytes:fs.statSync(built.coreSourcePath).size}));
})().catch(e=>{console.error(e);process.exitCode=1;});

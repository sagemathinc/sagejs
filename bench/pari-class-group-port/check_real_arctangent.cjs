"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(createHash('sha256').update(fs.readFileSync(path.join(pari,'src/basemath/trans2.c'))).digest('hex'),'ba216185308293f3002b294558892d52e5b5d5f1d4ddbf5038684d32ab27fcf2');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-atan-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`#include "pari.h"
int main(void){pari_init(64000000,10000);setrand(stoi(1729));long es[]={-1000,-101,-100,-65,-2,-1,0,1,2,65,512};
for(long bits=64;bits<=384;bits+=64)for(long k=0;k<16;k++)for(long ei=0;ei<11;ei++)for(long sign=-1;sign<=1;sign+=2){pari_sp av=avma;long de;GEN m=addii(int2n(bits-1),randomi(int2n(bits-1)));if(k==0)m=int2n(bits-1);if(k==1)m=addii(int2n(bits-1),gen_1);if(k==2)m=subis(int2n(bits),1);if(sign<0)m=negi(m);GEN x=itor(m,bits);setexpo(x,es[ei]);GEN y=gatan(x,bits);pari_printf("%Ps %ld %ld %Ps %ld %ld\\n",m,bits,es[ei],signe(y)?mantissa_real(y,&de):gen_0,signe(y)?bit_prec(y):0,expo(y));avma=av;}pari_close();return 0;}`);
 run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[]),rows=trace.trim().split('\n').map(s=>s.split(' '));assert.equal(rows.length,2112);
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.real_arctangent').pari_real_arctangent
work=[[0]*3]+[[0]*64 for _ in range(4)]+[[0]*128]
for ix,row in enumerate(json.load(sys.stdin)):
 v=list(map(int,row));got=f(*v[:3],*work);assert got==tuple(v[3:]),(ix,v,got)
assert f(0,0,-137,*work)==(0,0,-137)
for args in [(1,63,0),(1,448,0),(1,64,0),(1<<63,64,-10001),(1<<63,64,513)]:
 before=str(work)
 try:f(*args,*work)
 except ValueError:pass
 else:raise AssertionError(args)
 assert str(work)==before
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(rows)});
 if(process.argv.includes('--cpython-only')){console.log(JSON.stringify({cases:rows.length,backends:['PARI','CPython'],trace_sha256:createHash('sha256').update(trace).digest('hex')}));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'real_arctangent.py')}),f=require(built.modulePath).pari_real_arctangent;assert(f.nativeAvailable);
 for(const backend of ['javascript','gmp']){
  const make=n=>backend==='javascript'?Array(n).fill(0n):f.createIntegerBuffer(n,64);
  const work=[make(3),...Array.from({length:4},()=>make(64)),make(128)];
  for(const [i,row]of rows.entries()){const v=row.map(BigInt);assert.deepEqual(f[backend](...v.slice(0,3),...work),v.slice(3),`${backend} ${i}`);}
  assert.deepEqual(f[backend](0n,0n,-137n,...work),[0n,0n,-137n]);
  for(const args of [[1n,63n,0n],[1n,448n,0n],[1n,64n,0n],[1n<<63n,64n,-10001n],[1n<<63n,64n,513n]]){
   const snapshot=()=>work.map(v=>Array.isArray(v)?v.slice():v.toArray());
   const before=snapshot();assert.throws(()=>f[backend](...args,...work));assert.deepEqual(snapshot(),before);
  }
 }
 console.log(JSON.stringify({cases:rows.length,backends:['PARI','CPython','javascript','gmp'],trace_sha256:createHash('sha256').update(trace).digest('hex'),core_bytes:fs.statSync(built.coreSourcePath).size}));
})().catch(e=>{console.error(e);process.exitCode=1;});

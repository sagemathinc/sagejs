"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),lib=path.join(pari,'Olinux-x86_64');
 const source=fs.readFileSync(path.join(pari,'src/basemath/trans2.c'),'utf8');
 assert.equal(createHash('sha256').update(source).digest('hex'),'ba216185308293f3002b294558892d52e5b5d5f1d4ddbf5038684d32ab27fcf2');
 const start=source.indexOf('static GEN\nmparg('),end=source.indexOf('\nstatic GEN\nrfix(',start);
 assert(start>=0&&end>start);const leaf=source.slice(start,end);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-arg-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 // gatan(t_REAL) dispatches directly to the same static mpatan leaf. All
 // mparg branches below are extracted verbatim, not a handwritten oracle.
 fs.writeFileSync(c,`#include "pari.h"
#define mpatan(x) gatan((x),DEFAULTPREC)
${leaf}
static void emit(GEN x){long e;pari_printf("%Ps %ld %ld ",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
int main(void){pari_init(64000000,10000);setrand(stoi(1729));long es[]={-101,-3,-2,-1,0,1,2,3,65};
for(long px=64;px<=384;px+=64)for(long py=64;py<=384;py+=64)for(long ei=0;ei<9;ei++)for(long sign=0;sign<4;sign++){pari_sp av=avma;GEN x=itor(addii(int2n(px-1),randomi(int2n(px-1))),px),y=itor(addii(int2n(py-1),randomi(int2n(py-1))),py);setexpo(x,es[ei]);setexpo(y,0);if(sign&1)setsigne(x,-1);if(sign&2)setsigne(y,-1);emit(x);emit(y);emit(mparg(x,y));pari_printf("\\n");avma=av;}
for(long p=64;p<=384;p+=64)for(long axis=0;axis<2;axis++)for(long s=-1;s<=1;s+=2){pari_sp av=avma;GEN x=real_0_bit(-137),y=itor(stoi(s),p);if(axis){GEN t=x;x=y;y=t;}emit(x);emit(y);emit(mparg(x,y));pari_printf("\\n");avma=av;}
pari_close();return 0;}`);
 run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[]),rows=trace.trim().split('\n').map(s=>s.trim().split(' '));assert.equal(rows.length,1320);
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.complex_argument').pari_real_components_argument
work=[[0]*3]+[[0]*64 for _ in range(4)]+[[0]*128]
for ix,row in enumerate(json.load(sys.stdin)):
 v=list(map(int,row));got=f(*v[:6],*work);assert got==tuple(v[6:]),(ix,v,got)
try:f(0,0,-137,0,0,-137,*work)
except ValueError:pass
else:raise AssertionError('zero argument')
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(rows)});
 if(process.argv.includes('--cpython-only')){console.log(JSON.stringify({cases:rows.length,backends:['PARI','CPython'],trace_sha256:createHash('sha256').update(trace).digest('hex')}));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'complex_argument.py')}),f=require(built.modulePath).pari_real_components_argument;assert(f.nativeAvailable);
 for(const backend of ['javascript','gmp']){
  const make=n=>backend==='javascript'?Array(n).fill(0n):f.createIntegerBuffer(n,64);
  const work=[make(3),...Array.from({length:4},()=>make(64)),make(128)];
  for(const [i,row]of rows.entries()){const v=row.map(BigInt);assert.deepEqual(f[backend](...v.slice(0,6),...work),v.slice(6),`${backend} ${i}`);}
  assert.throws(()=>f[backend](0n,0n,-137n,0n,0n,-137n,...work));
 }
 console.log(JSON.stringify({cases:rows.length,backends:['PARI','CPython','javascript','gmp'],trace_sha256:createHash('sha256').update(trace).digest('hex'),core_bytes:fs.statSync(built.coreSourcePath).size}));
})().catch(e=>{console.error(e);process.exitCode=1;});

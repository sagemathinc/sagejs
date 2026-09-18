"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),lib=path.join(pari,'Olinux-x86_64');
 for(const [file,hash]of [['trans1.c','287fbc089af72e8abcae073ea059880fdb138d7b4cd3c2bea39be547f3ca7835'],['trans2.c','ba216185308293f3002b294558892d52e5b5d5f1d4ddbf5038684d32ab27fcf2']])assert.equal(createHash('sha256').update(fs.readFileSync(path.join(pari,'src/basemath',file))).digest('hex'),hash);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-clog-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`#include "pari.h"
static void emit(GEN x){long e;if(typ(x)==t_INT){pari_printf("%Ps -1 0 ",x);return;}pari_printf("%Ps %ld %ld ",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
static void sample(GEN x,GEN y,long p){emit(x);emit(y);pari_printf("%ld ",p);GEN z=glog(mkcomplex(x,y),nbits2prec(p));if(typ(z)==t_COMPLEX){pari_printf("2 ");emit(gel(z,1));emit(gel(z,2));}else{pari_printf("1 ");emit(z);emit(gen_0);}pari_printf("\\n");}
int main(void){pari_init(64000000,10000);setrand(stoi(1729));long es[]={-101,-3,-2,-1,0,1,2,3,65};
for(long px=64;px<=448;px+=64)for(long py=64;py<=448;py+=64)for(long ei=0;ei<9;ei++)for(long sign=0;sign<4;sign++){pari_sp av=avma;GEN x=itor(addii(int2n(px-1),randomi(int2n(px-1))),nbits2prec(px)),y=itor(addii(int2n(py-1),randomi(int2n(py-1))),nbits2prec(py));setexpo(x,es[ei]);setexpo(y,0);if(sign&1)setsigne(x,-1);if(sign&2)setsigne(y,-1);sample(x,y,128);avma=av;}
for(long p=64;p<=448;p+=64)for(long axis=0;axis<2;axis++)for(long s=-1;s<=1;s+=2){pari_sp av=avma;GEN x=real_0_bit(-137),y=itor(stoi(s),nbits2prec(p));if(axis){GEN t=x;x=y;y=t;}sample(x,y,128);avma=av;}
pari_close();return 0;}`);
 run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[]),rows=trace.trim().split('\n').map(s=>s.trim().split(' '));assert.equal(rows.length,1792);
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.complex_logarithm').pari_real_pair_logarithm
work=[[0]*3,[0]*3]+[[0]*64 for _ in range(4)]+[[0]*128]
for ix,row in enumerate(json.load(sys.stdin)):
 v=list(map(int,row));got=f(*v[:7],*work);assert got==tuple(v[7:]),(ix,v,got)
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(rows)});
 if(process.argv.includes('--cpython-only')){console.log(JSON.stringify({cases:rows.length,backends:['PARI','CPython'],trace_sha256:createHash('sha256').update(trace).digest('hex')}));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'complex_logarithm.py')}),f=require(built.modulePath).pari_real_pair_logarithm;assert(f.nativeAvailable);
 for(const backend of ['javascript','gmp']){
  const make=n=>backend==='javascript'?Array(n).fill(0n):f.createIntegerBuffer(n,64);
  const work=[make(3),make(3),...Array.from({length:4},()=>make(64)),make(128)];
  for(const [i,row]of rows.entries()){const v=row.map(BigInt);assert.deepEqual(f[backend](...v.slice(0,7),...work),v.slice(7),`${backend} ${i}`);}
 }
 console.log(JSON.stringify({cases:rows.length,backends:['PARI','CPython','javascript','gmp'],trace_sha256:createHash('sha256').update(trace).digest('hex'),core_bytes:fs.statSync(built.coreSourcePath).size}));
})().catch(e=>{console.error(e);process.exitCode=1;});

"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-root-")),source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
fs.writeFileSync(source,`#include "pari.h"
int main(void){pari_init(16000000,10000);setrand(stoi(1729));long ps[]={64,128,256,384};
for(long n=1;n<=10;n++)for(long pi=0;pi<4;pi++)for(long k=0;k<20;k++)for(long sign=-1;sign<=1;sign+=2){pari_sp av=avma;long p=ps[pi],e=k*13-100,de;GEN m=addii(int2n(p-1),randomi(int2n(p-1)));
if(k==0)m=int2n(p-1);if(k==1)m=addis(int2n(p-1),1);if(k==2)m=subis(int2n(p),1);if(k==3){m=int2n(p-1);e=0;}if(sign<0)m=negi(m);
GEN x=itor(m,p);setexpo(x,e);GEN y=sqrtnr_abs(x,n);pari_printf("%Ps %ld %ld %ld %Ps %ld %ld\\n",m,p,e,n,signe(y)?mantissa_real(y,&de):gen_0,signe(y)?bit_prec(y):0,expo(y));avma=av;}
pari_close();return 0;}`);
const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe],{encoding:"utf8",timeout:30000});assert.equal(cc.status,0,cc.stderr);
const run=spawnSync(exe,[],{encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});assert.equal(run.status,0,run.stderr);
const rows=run.stdout.trim().split("\n").map(s=>s.split(" "));assert.equal(rows.length,1600);
const py=spawnSync("python3",["-c",`
import sys,json,importlib
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,"../.."))},${JSON.stringify(path.resolve(__dirname,"../../src/lib"))}]
f=importlib.import_module('bench.pari-class-group-port.real_root').pari_real_root_abs
cache=[0]*3;a=[0]*64;b=[0]*64;p=[0]*64;q=[0]*64;stack=[0]*128
for ix,row in enumerate(json.load(sys.stdin)):
    v=list(map(int,row));got=f(*v[:4],cache,a,b,p,q,stack);assert got==tuple(v[4:]),(ix,v,got)
`],{input:JSON.stringify(rows),encoding:"utf8",timeout:30000});assert.equal(py.status,0,py.stderr);
const built=await compileKernel({sourcePath:path.join(__dirname,"real_root.py")}),mod=require(built.modulePath);
for(const backend of ["javascript","gmp"]){const cache=Array(3).fill(0n),a=Array(64).fill(0n),b=a.slice(),p=a.slice(),q=a.slice(),stack=Array(128).fill(0n);
for(const [ix,row] of rows.entries()){const v=row.map(BigInt);assert.deepEqual(mod.pari_real_root_abs[backend](...v.slice(0,4),cache,a,b,p,q,stack),v.slice(4),`${backend} ${ix}`);}}
console.log("1600 degree-1–10 real roots match PARI/CPython/JS/GMP, including precision growth");
})().catch(e=>{console.error(e);process.exitCode=1;});

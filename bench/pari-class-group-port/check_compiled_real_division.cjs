"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
function functionBody(core,name){
 const match=new RegExp("static int "+name+"\\([^\\n]*\\)\\n\\{").exec(core);assert(match,`missing definition ${name}`);
 const first=match.index+match[0].length-1;let end=first+1,depth=1;
 for(;depth&&end<core.length;end++){if(core[end]==="{")depth++;else if(core[end]==="}")depth--;}
 assert.equal(depth,0);return core.slice(first,end);
}
(async()=>{
 const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-real-division-")),source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
 fs.writeFileSync(source,`#include "pari.h"
int main(void){pari_init(16000000,10000);setrand(stoi(314159));long ps[]={64,128,192,256,512,1024,1920,2176,2240,2304,2368};
for(long ai=0;ai<11;ai++)for(long bi=0;bi<11;bi++)for(long k=0;k<64;k++)for(long sign=-1;sign<=1;sign+=2){pari_sp av=avma;long p=ps[ai],q=ps[bi],de,ex=k-12,ey=12-k;
GEN a=addii(int2n(p-1),randomi(int2n(p-1))),b=addii(int2n(q-1),randomi(int2n(q-1)));
if(k==0)a=int2n(p-1);if(k==1)b=int2n(q-1);if(k==2){a=subis(int2n(p),1);b=subis(int2n(q),1);}if(k==3)a=gen_0;
if(k>=24){long t=(k-24)%5,s=(k-24)/5;GEN top=addis(int2n(63),s);a=shifti(top,p-64);b=shifti(top,q-64);if(t==0)a=addis(a,1);if(t==1)b=addis(b,1);if(t==2)a=addii(a,subis(int2n(p-64),1));if(t==3)b=addii(b,subis(int2n(q-64),1));if(t==4){a=subis(int2n(p),1);b=addis(b,1);}}
/* Regression: small divrr truncates intermediate products near a/b=1. */
if(k>=20&&k<=23){a=addis(divis(int2n(p+1),3),k-20);b=addis(divis(int2n(q+1),3),1);}
if(sign<0)a=negi(a);if(k%2)b=negi(b);GEN x=itor(a,p),y=itor(b,q);setexpo(x,ex);setexpo(y,ey);GEN z=divrr(x,y);
pari_printf("%Ps %ld %ld %Ps %ld %ld %Ps %ld %ld\\n",a,p,ex,b,q,ey,signe(z)?mantissa_real(z,&de):gen_0,signe(z)?bit_prec(z):0,expo(z));avma=av;}pari_close();return 0;}`);
 const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe],{encoding:"utf8",timeout:30000});assert.equal(cc.status,0,cc.stderr);
 const run=spawnSync(exe,[],{encoding:"utf8",timeout:180000,maxBuffer:16*1024*1024});assert.equal(run.status,0,run.stderr || String(run.error));
 const rows=run.stdout.trim().split("\n").map(x=>x.split(" "));assert.equal(rows.length,15488);
 const py=spawnSync("python3",["-c",`
import sys,json,importlib
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,"../.."))},${JSON.stringify(path.resolve(__dirname,"../../src/lib"))}]
f=importlib.import_module('bench.pari-class-group-port.real_division').pari_real_division
for ix,row in enumerate(json.load(sys.stdin)):
    v=list(map(int,row));got=f(*v[:6]);assert got==tuple(v[6:]),(ix,v,got)
`],{input:JSON.stringify(rows),encoding:"utf8",timeout:180000});assert.equal(py.status,0,py.stderr || String(py.error));
 const built=await compileKernel({sourcePath:path.join(__dirname,"real_division.py")}),mod=require(built.modulePath);
 const core=fs.readFileSync(built.coreSourcePath,"utf8"),nativeBody=functionBody(core,"native_pari_real_division"),taggedBody=functionBody(core,"tagged_pari_real_division");
 const count=(body,operation)=>body.split(operation).length-1;
 const operations={nativeDivmod:count(nativeBody,"mpz_fdiv_qr("),nativeQuotientOnly:count(nativeBody,"mpz_fdiv_q("),taggedDivmod:count(taggedBody,"sagejs_tagged_divmod("),taggedQuotientOnly:count(taggedBody,"sagejs_tagged_floordiv(")};
 assert.deepEqual(operations,{nativeDivmod:2,nativeQuotientOnly:0,taggedDivmod:2,taggedQuotientOnly:0});
 // The remaining remainder-only operations validate precision modulo 64;
 // they are not duplicate divisions of the real mantissa operands.
 for(const row of rows)for(const backend of ["javascript","gmp","tagged"]){const v=row.map(BigInt);assert.deepEqual(mod.pari_real_division[backend](...v.slice(0,6)),v.slice(6),`${backend}: ${row}`);}
 for(const backend of ["javascript","gmp","tagged"]){
   assert.throws(()=>mod.pari_real_division[backend](1n<<63n,64n,0n,0n,0n,0n),/zero real divisor/);
   assert.throws(()=>mod.pari_real_division[backend](1n<<2431n,2432n,0n,1n<<2303n,2304n,0n),/unsupported real division precision/);
 }
 console.log("15488 unequal-precision real divisions through p2368 match PARI/CPython/JS/GMP/tagged; p2432 rejects; quotient-leaf substitution remains explicit");
 console.log(JSON.stringify({operations,coreSourcePath:built.coreSourcePath,coreBytes:Buffer.byteLength(core),coreSha256:require('node:crypto').createHash('sha256').update(core).digest('hex'),artifactDirectory:dir,qualifiedTiming:false}));
})().catch(e=>{console.error(e);process.exitCode=1;});

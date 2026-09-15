"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
  const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-reciprocal-"));
  const source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
  fs.writeFileSync(source,`#include "pari.h"
int main(void){pari_init(16000000,10000);setrand(stoi(1729));
long precs[]={64,128,192,256,512,1024,2048};
for(long pi=0;pi<7;pi++)for(long pattern=0;pattern<40;pattern++)for(long sign=-1;sign<=1;sign+=2){
pari_sp av=avma;long p=precs[pi],e=pattern-20,de;GEN m=addii(int2n(p-1),randomi(int2n(p-1)));
if(pattern==0)m=int2n(p-1);if(pattern==1)m=addis(int2n(p-1),1);if(pattern==2)m=subis(int2n(p),1);
if(sign<0)m=negi(m);GEN x=itor(m,p);setexpo(x,e);GEN y=invr(x);GEN out=mantissa_real(y,&de);
pari_printf("%Ps %ld %ld %Ps %ld %ld\\n",m,p,e,out,bit_prec(y),expo(y));avma=av;
}pari_close();return 0;}`);
  const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe],{encoding:"utf8",timeout:30000});assert.equal(cc.status,0,cc.stderr);
  const run=spawnSync(exe,[],{encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});assert.equal(run.status,0,run.stderr);
  const records=run.stdout.trim().split("\n").map(line=>line.split(" "));assert.equal(records.length,560);
  const py=spawnSync("python3",["-c",`
import sys,json,importlib
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,"../.."))},${JSON.stringify(path.resolve(__dirname,"../../src/lib"))}]
f=importlib.import_module('bench.pari-class-group-port.exponential').pari_real_reciprocal
for row in json.load(sys.stdin):
    values=list(map(int,row));got=f(*values[:3]);assert got==tuple(values[3:]),(values,got)
`],{input:JSON.stringify(records),encoding:"utf8",timeout:30000});assert.equal(py.status,0,py.stderr);
  const built=await compileKernel({sourcePath:path.join(__dirname,"exponential.py")}),mod=require(built.modulePath);
  for(const row of records)for(const backend of ["javascript","gmp","tagged"]){
    const values=row.map(BigInt);
    assert.deepEqual(mod.pari_real_reciprocal[backend](...values.slice(0,3)),values.slice(3),`${backend}: ${row}`);
  }
  for(const backend of ["javascript","gmp","tagged"])assert.throws(()=>mod.pari_real_reciprocal[backend](0n,64n,0n),/zero reciprocal/);
  console.log(`${records.length} reciprocal outputs match actual PARI/CPython/JS/GMP/tagged; quotient-loop substitution remains explicit`);
})().catch(error=>{console.error(error);process.exitCode=1;});

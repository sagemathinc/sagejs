"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
  const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-real-conversion-"));
  const source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
  fs.writeFileSync(source,`#include "pari.h"
int main(void){pari_init(16000000,10000);setrand(stoi(314159));
long precs[]={64,128,256,512,2176,2240,2304,2368,2432};long sizes[]={0,1,63,64,65,127,128,129,191,192,193,513,1025};
for(long pi=0;pi<9;pi++)for(long ai=0;ai<13;ai++)for(long bi=1;bi<13;bi++)for(long sign=-1;sign<=1;sign+=2){
pari_sp av=avma;long p=precs[pi],ab=sizes[ai],bb=sizes[bi],de;GEN a=ab?addii(int2n(ab-1),randomi(int2n(ab-1))):gen_0,b=addii(int2n(bb-1),randomi(int2n(bb-1)));
if(sign<0)a=negi(a);if((ai+bi)%2)b=negi(b);GEN y=rdivii(a,b,p),out=signe(y)?mantissa_real(y,&de):gen_0;
pari_printf("%Ps %Ps %ld %Ps %ld %ld\\n",a,b,p,out,signe(y)?bit_prec(y):0,expo(y));avma=av;
}pari_close();return 0;}`);
  const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe],{encoding:"utf8",timeout:30000});assert.equal(cc.status,0,cc.stderr);
  const run=spawnSync(exe,[],{encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});assert.equal(run.status,0,run.stderr);
  const records=run.stdout.trim().split("\n").map(line=>line.split(" "));assert.equal(records.length,2808);
  const py=spawnSync("python3",["-c",`
import sys,json,importlib
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,"../.."))},${JSON.stringify(path.resolve(__dirname,"../../src/lib"))}]
f=importlib.import_module('bench.pari-class-group-port.real_conversion').pari_rational_to_real
for row in json.load(sys.stdin):
    values=list(map(int,row));got=f(*values[:3]);assert got==tuple(values[3:]),(values,got)
`],{input:JSON.stringify(records),encoding:"utf8",timeout:30000});assert.equal(py.status,0,py.stderr);
  const built=await compileKernel({sourcePath:path.join(__dirname,"real_conversion.py")}),mod=require(built.modulePath);
  for(const row of records)for(const backend of ["javascript","gmp","tagged"]){
    const values=row.map(BigInt);
    assert.deepEqual(mod.pari_rational_to_real[backend](...values.slice(0,3)),values.slice(3),`${backend}: ${row}`);
  }
  for(const backend of ["javascript","gmp","tagged"])
    assert.throws(()=>mod.pari_rational_to_real[backend](1n,3n,2496n),/unsupported rational-to-real precision/);
  console.log(`${records.length} rational conversion outputs match actual PARI/CPython/JS/GMP/tagged`);
})().catch(error=>{console.error(error);process.exitCode=1;});

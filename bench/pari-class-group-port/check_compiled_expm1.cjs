"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
  const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-expm1-"));
  const source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
  fs.writeFileSync(source,`#include "pari.h"
int main(void){pari_init(16000000,10000);
long precs[]={64,128,192,256,512};long exps[]={-1000,-513,-512,-257,-256,-129,-128,-65,-64,-63,-32,-10,-3,-2,-1,0,1,5};
for(long pi=0;pi<5;pi++)for(long ei=0;ei<18;ei++)for(long pattern=0;pattern<3;pattern++)for(long sign=-1;sign<=1;sign+=2){
pari_sp av=avma;long p=precs[pi],e=exps[ei],de;GEN m=int2n(p-1);
if(pattern==1)m=subis(int2n(p),1);if(pattern==2)m=addii(m,int2n(p-3));if(sign<0)m=negi(m);
GEN x=itor(m,p);setexpo(x,e);GEN y=exp1r_abs(x);GEN out=mantissa_real(y,&de);
pari_printf("%Ps %ld %ld %Ps %ld %ld\\n",m,p,e,out,bit_prec(y),expo(y));avma=av;
}pari_close();return 0;}`);
  const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe],{encoding:"utf8",timeout:30000});assert.equal(cc.status,0,cc.stderr);
  const run=spawnSync(exe,[],{encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});assert.equal(run.status,0,run.stderr);
  const records=run.stdout.trim().split("\n").map(line=>line.split(" "));assert.equal(records.length,540);
  const py=spawnSync("python3",["-c",`
import sys,json,importlib
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,"../.."))},${JSON.stringify(path.resolve(__dirname,"../../src/lib"))}]
f=importlib.import_module('bench.pari-class-group-port.exponential').pari_exp1r_abs
for row in json.load(sys.stdin):
    values=list(map(int,row))
    try: got=f(*values[:3])
    except ValueError as error:
        print(json.dumps(str(error)));continue
    assert got==tuple(values[3:]),(values,got)
    print('null')
`],{input:JSON.stringify(records),encoding:"utf8",timeout:30000});assert.equal(py.status,0,py.stderr);
  const failures=py.stdout.trim().split('\n').map(JSON.parse);
  assert.deepEqual(failures,Array(records.length).fill(null));
  console.log('540 CPython outputs match PARI, including the former precision-growth failures');
  const built=await compileKernel({sourcePath:path.join(__dirname,"exponential.py")}),mod=require(built.modulePath);
  for(const [index,row] of records.entries())for(const backend of ["javascript","gmp"]){
    const values=row.map(BigInt);
    if(failures[index]){assert.throws(()=>mod.pari_exp1r_abs[backend](...values.slice(0,3)),new RegExp(failures[index]));continue;}
    assert.deepEqual(mod.pari_exp1r_abs[backend](...values.slice(0,3)),values.slice(3),`${backend}: ${row}`);
  }
  console.log(`${records.length-failures.filter(Boolean).length} exp1r_abs outputs match actual PARI/CPython/JS/GMP; ${failures.filter(Boolean).length} explicit representation failures`);
})().catch(error=>{console.error(error);process.exitCode=1;});

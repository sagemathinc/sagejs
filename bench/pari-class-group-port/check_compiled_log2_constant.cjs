"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
  const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-log2-constant-"));
  const source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
  fs.writeFileSync(source,`#include "pari.h"
int main(void){pari_init(16000000,10000);long ps[]={64,128,64,192,256,128,512,320,1024,64,1984,128};
for(long i=0;i<12;i++){pari_sp av=avma;long d;GEN y=mplog2(ps[i]),m=mantissa_real(y,&d),c=constlog2(ps[i]),cm=mantissa_real(c,&d);
pari_printf("%ld %Ps %ld %ld %Ps %ld %ld\\n",ps[i],m,bit_prec(y),expo(y),cm,bit_prec(c),expo(c));avma=av;}
pari_close();return 0;}`);
  const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe],{encoding:"utf8",timeout:30000});assert.equal(cc.status,0,cc.stderr);
  const run=spawnSync(exe,[],{encoding:"utf8",timeout:30000,maxBuffer:1024*1024});assert.equal(run.status,0,run.stderr);
  const records=run.stdout.trim().split('\n').map(line=>line.split(' '));assert.equal(records.length,12);
  const py=spawnSync('python3',['-c',`
import sys,json,importlib
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,'../..'))},${JSON.stringify(path.resolve(__dirname,'../../src/lib'))}]
f=importlib.import_module('bench.pari-class-group-port.logarithm_constant').pari_log2_constant
cache=[0]*3;scratch=[[0]*1024 for _ in range(4)]+[[0]*91]
for row in json.load(sys.stdin):
    values=list(map(int,row));got=f(values[0],cache,*scratch);assert got==tuple(values[1:4]),(values,got);assert cache==values[4:]
`],{input:JSON.stringify(records),encoding:'utf8',timeout:30000});assert.equal(py.status,0,py.stderr);
  const built=await compileKernel({sourcePath:path.join(__dirname,'logarithm_constant.py')}),mod=require(built.modulePath);
  for(const backend of ['javascript','gmp']){
    const cache=mod.createIntegerBuffer(3,64),scratch=[...Array.from({length:4},()=>mod.createIntegerBuffer(1024,64)),mod.createIntegerBuffer(91,64)];
    for(const row of records){
      const values=row.map(BigInt);assert.deepEqual(mod.pari_log2_constant[backend](values[0],cache,...scratch),values.slice(1,4));
      assert.deepEqual(cache.toArray(),values.slice(4));
    }
    const final=records.at(-1).map(BigInt);
    assert.deepEqual(mod.pari_log2_constant[backend](final[0],cache,[],[],[],[],[]),final.slice(1,4));
  }
  console.log('12 increasing/decreasing precision requests and cache states match PARI/CPython/JS/GMP; warm calls require no series scratch');
})().catch(error=>{console.error(error);process.exitCode=1;});

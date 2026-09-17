"use strict";
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{compileKernel}=require('../../tools/native-kernel/compiler.cjs');
(async()=>{
  const pari=path.resolve(process.argv[2]),lib=path.join(pari,'Olinux-x86_64'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-mpexp-'));
  const source=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
  fs.writeFileSync(source,`#include "pari.h"
#include <math.h>
void one(double d,long precision){pari_sp av=avma;long shift;GEN x=rtor(dbltor(d),precision),y=mpexp(x),xm=signe(x)?mantissa_real(x,&shift):gen_0,ym=signe(y)?mantissa_real(y,&shift):gen_0;
pari_printf("%Ps %ld %ld %Ps %ld %ld\\n",xm,signe(x)?bit_prec(x):0,expo(x),ym,signe(y)?bit_prec(y):0,expo(y));avma=av;}
int main(void){pari_init(64000000,10000);for(long k=-160;k<=160;k++)one(k/16.0,64);for(long e=-1000;e<=0;e+=10){one(ldexp(1.0,e),64);one(-ldexp(1.0,e),64);}long precisions[]={128,192,512};for(long j=0;j<3;j++)for(long k=-20;k<=20;k++)one(k/8.0,precisions[j]);long high[]={2176,2240,2304};for(long j=0;j<3;j++)for(long k=-2;k<=2;k++)one(k/8.0,high[j]);pari_close();return 0;}`);
  const cc=spawnSync('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,source,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe],{encoding:'utf8',timeout:30000});assert.equal(cc.status,0,cc.stderr);
  const run=spawnSync(exe,[],{encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});assert.equal(run.status,0,run.stderr);
  const rows=run.stdout.trim().split('\n').map(line=>line.split(' '));assert.equal(rows.length,661);
  const py=spawnSync('python3',['-c',`
import sys,json,importlib
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,'../..'))},${JSON.stringify(path.resolve(__dirname,'../../src/lib'))}]
f=importlib.import_module('bench.pari-class-group-port.exponential_entry').pari_prepared_exp
cache=[0]*3;scratch=[[0]*1024 for _ in range(4)]+[[0]*91]
for row in json.load(sys.stdin):
    values=list(map(int,row))
    try:got=f(*values[:3],cache,*scratch)
    except ValueError as e:print(json.dumps(str(e)));continue
    assert got==tuple(values[3:]),(values,got)
    print('null')
`],{input:JSON.stringify(rows),encoding:'utf8',timeout:30000});assert.equal(py.status,0,py.stderr);
  const failures=py.stdout.trim().split('\n').map(JSON.parse);
  assert.deepEqual(failures,Array(rows.length).fill(null));
  const built=await compileKernel({sourcePath:path.join(__dirname,'exponential_entry.py')}),mod=require(built.modulePath);
  for(const backend of ['javascript','gmp']){
    const cache=mod.createIntegerBuffer(3,64),scratch=[...Array.from({length:4},()=>mod.createIntegerBuffer(1024,64)),mod.createIntegerBuffer(91,64)];
    for(const [i,row] of rows.entries()){
      const values=row.map(BigInt);
      if(failures[i]){assert.throws(()=>mod.pari_prepared_exp[backend](...values.slice(0,3),cache,...scratch),new RegExp(failures[i]));continue;}
      assert.deepEqual(mod.pari_prepared_exp[backend](...values.slice(0,3),cache,...scratch),values.slice(3),`${backend}: ${row}`);
    }
    assert.throws(()=>mod.pari_prepared_exp[backend](1n<<2367n,2368n,-2n,cache,...scratch),/unsupported exponential range reduction input/);
  }
  console.log(`${rows.length-failures.filter(Boolean).length} connected mpexp outputs through p2304 match PARI/CPython/JS/GMP; p2368 entry rejects; ${failures.filter(Boolean).length} explicit failures`);
})().catch(error=>{console.error(error);process.exitCode=1;});

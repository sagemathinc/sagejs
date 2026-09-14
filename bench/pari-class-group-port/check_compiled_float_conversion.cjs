"use strict";
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{compileKernel}=require('../../tools/native-kernel/compiler.cjs');
(async()=>{
  const pari=path.resolve(process.argv[2]),lib=path.join(pari,'Olinux-x86_64'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-rtodbl-'));
  const source=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
  fs.writeFileSync(source,`#include "pari.h"
int main(void){pari_init(16000000,10000);long ps[]={64,128,256,512},es[]={-1074,-1024,-1023,-1022,-1000,-1,0,1,1000,1022,1023};ulong lows[]={0,1023,1024,1025,0x4000000000000000UL,0x7fffffffffffffffUL};
for(long pi=0;pi<4;pi++)for(long ei=0;ei<11;ei++)for(long k=0;k<6;k++)for(long sign=-1;sign<=1;sign+=2){
pari_sp av=avma;GEN m=shifti(utoi(HIGHBIT|lows[k]),ps[pi]-64);if(ps[pi]>64)m=addis(m,1);if(sign<0)m=negi(m);GEN x=itor(m,ps[pi]);setexpo(x,es[ei]);
pari_printf("%Ps %ld %ld ",m,ps[pi],es[ei]);
pari_CATCH(CATCH_ALL){puts("overflow");}pari_TRY{union{double f;ulong u;}d;d.f=rtodbl(x);printf("%016lx\\n",d.u);}pari_ENDCATCH;
avma=av;}
pari_close();return 0;}`);
  const cc=spawnSync('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,source,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe],{encoding:'utf8',timeout:30000});assert.equal(cc.status,0,cc.stderr);
  const run=spawnSync(exe,[],{encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});assert.equal(run.status,0,run.stderr);
  const rows=run.stdout.trim().split('\n').map(line=>line.split(' '));assert.equal(rows.length,528);
  const py=spawnSync('python3',['-c',`
import sys,json,struct,importlib
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,'../..'))},${JSON.stringify(path.resolve(__dirname,'../../src/lib'))}]
f=importlib.import_module('bench.pari-class-group-port.float_conversion').pari_real_to_float
for row in json.load(sys.stdin):
    args=list(map(int,row[:3]));want=row[3]
    try:got=struct.pack('>d',f(*args)).hex()
    except OverflowError:got='overflow'
    assert got==want,(row,got)
`],{input:JSON.stringify(rows),encoding:'utf8',timeout:30000});assert.equal(py.status,0,py.stderr);
  const built=await compileKernel({sourcePath:path.join(__dirname,'float_conversion.py')}),mod=require(built.modulePath);
  for(const row of rows)for(const backend of ['javascript','gmp']){
    const args=row.slice(0,3).map(BigInt);
    if(row[3]==='overflow'){assert.throws(()=>mod.pari_real_to_float[backend](...args),/t_REAL->double conversion/);continue;}
    const bytes=Buffer.alloc(8);bytes.writeDoubleBE(mod.pari_real_to_float[backend](...args));assert.equal(bytes.toString('hex'),row[3],`${backend}: ${row}`);
  }
  console.log('528 real-to-binary64 conversions match PARI bit-for-bit in CPython/JS/GMP, including overflow and signed zero');
})().catch(error=>{console.error(error);process.exitCode=1;});

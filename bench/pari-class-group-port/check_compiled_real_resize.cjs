"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
  const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-real-resize-"));
  const source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
  fs.writeFileSync(source,`#include "pari.h"
int main(void){pari_init(8000000,10000);long precs[]={64,128,192,256,512,2176,2240,2304,2368,2432,2496};
for(long pi=0;pi<11;pi++)for(long ti=0;ti<11;ti++)for(long pattern=0;pattern<5;pattern++)for(long sign=-1;sign<=1;sign+=2)for(long mode=0;mode<2;mode++){
long p=precs[pi],t=precs[ti];if(mode && t>p)continue;pari_sp av=avma;
GEN m=int2n(p-1);if(pattern==1)m=subis(int2n(p),1);if(pattern==2)m=addis(m,1);if(pattern==3)m=addii(m,int2n(p/2));if(pattern==4&&p>t)m=addii(m,int2n(p-t-1));
if(sign<0)m=negi(m);GEN x=itor(m,nbits2prec(p));shiftr_inplace(x,-p-16);GEN y=gcopy(x);
if(mode)setprec(y,nbits2prec(t));else y=rtor(x,nbits2prec(t));long de;GEN out=mantissa_real(y,&de);
pari_printf("%ld %Ps %ld %ld %ld %Ps %ld %ld\\n",mode,m,p,expo(x),t,out,bit_prec(y),expo(y));avma=av;}
for(long e=-1000;e<=100;e+=100)for(long ti=0;ti<11;ti++){long t=precs[ti];GEN x=real_0_bit(e),y=rtor(x,nbits2prec(t));printf("0 0 0 %ld %ld 0 0 %ld\\n",e,t,expo(y));}
pari_close();return 0;}`);
  const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe],{encoding:"utf8",timeout:30000});assert.equal(cc.status,0,cc.stderr);
  const run=spawnSync(exe,[],{encoding:"utf8",timeout:30000,maxBuffer:2*1024*1024});assert.equal(run.status,0,run.stderr);
  const records=run.stdout.trim().split("\n").map(line=>line.split(" "));
  // Rejected representation requests must not silently round or grow a header.
  const invalid=[
    [0,1n<<63n,64n,0n,0n], [0,1n<<63n,64n,0n,65n],
    [0,1n<<63n,64n,0n,2560n], [0,1n,64n,0n,64n],
    [0,1n<<63n,63n,0n,64n], [1,1n<<63n,64n,0n,128n],
    [1,0n,64n,0n,64n], [1,1n<<63n,64n,0n,63n],
  ];
  const py=spawnSync("python3",["-c",`
import sys,json,importlib
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,"../.."))},${JSON.stringify(path.resolve(__dirname,"../../src/lib"))}]
module=importlib.import_module('bench.pari-class-group-port.exponential')
pari_real_resize,pari_real_truncate=module.pari_real_resize,module.pari_real_truncate
for row in json.load(sys.stdin):
    mode,m,p,e,t,om,op,oe=map(int,row)
    assert (pari_real_truncate if mode else pari_real_resize)(m,p,e,t)==(om,op,oe),row
for row in ${JSON.stringify(invalid.map(row=>row.map(String)))}:
    mode,m,p,e,t=map(int,row)
    try:
        (pari_real_truncate if mode else pari_real_resize)(m,p,e,t)
    except ValueError:
        pass
    else:
        raise AssertionError(row)
`],{input:JSON.stringify(records),encoding:"utf8",timeout:30000});assert.equal(py.status,0,py.stderr);
  const built=await compileKernel({sourcePath:path.join(__dirname,"exponential.py")}),mod=require(built.modulePath);
  for(const row of records)for(const backend of ["javascript","gmp","tagged"]){
    const [mode,...values]=row.map(BigInt),fn=mode?mod.pari_real_truncate:mod.pari_real_resize;
    assert.deepEqual(fn[backend](...values.slice(0,4)),values.slice(4));
  }
  for(const [mode,...args] of invalid)for(const backend of ["javascript","gmp","tagged"]){
    const fn=mode?mod.pari_real_truncate:mod.pari_real_resize;
    assert.throws(()=>fn[backend](...args),/precision|mantissa/);
  }
  console.log(`${records.length} precision-copy/truncation controls match PARI/CPython/JS/GMP/tagged; ${invalid.length} invalid requests rejected by CPython/JS/GMP/tagged`);
})().catch(error=>{console.error(error);process.exitCode=1;});

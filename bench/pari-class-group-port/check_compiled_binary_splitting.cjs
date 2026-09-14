"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
  const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-abpq-"));
  const source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
  fs.writeFileSync(source,`#include "pari.h"
#include "paripriv.h"
int main(void){pari_init(16000000,10000);struct abpq A;abpq_init(&A,70);
for(long i=0;i<70;i++){A.a[i]=stoi(i%5-2);A.b[i]=stoi(2*i+1);A.p[i]=stoi(i%3+1);A.q[i]=stoi(i%4+2);}
for(long start=0;start<4;start++)for(long n=1;n<=64;n++){
pari_sp av=avma;struct abpq_res R;abpq_sum(&R,start,start+n,&A);
pari_printf("%ld %ld %Ps %Ps %Ps %Ps\\n",start,start+n,R.P,R.Q,R.B,R.T);avma=av;
}
long precs[]={64,128,192,256,512},us[]={1,1,1,2},vs[]={26,4801,8749,3};
for(long pi=0;pi<5;pi++)for(long k=0;k<4;k++){pari_sp av=avma;long de;GEN y=atanhuu(us[k],vs[k],precs[pi]),m=mantissa_real(y,&de);pari_printf("atanh %ld %ld %ld %Ps %ld %ld\\n",us[k],vs[k],precs[pi],m,bit_prec(y),expo(y));avma=av;}
pari_close();return 0;}`);
  const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe],{encoding:"utf8",timeout:30000});assert.equal(cc.status,0,cc.stderr);
  const run=spawnSync(exe,[],{encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});assert.equal(run.status,0,run.stderr);
  const lines=run.stdout.trim().split("\n");
  const records=lines.filter(line=>!line.startsWith('atanh ')).map(line=>line.split(" "));assert.equal(records.length,256);
  const atanhs=lines.filter(line=>line.startsWith('atanh ')).map(line=>line.split(' ').slice(1));assert.equal(atanhs.length,20);
  const py=spawnSync("python3",["-c",`
import sys,json,importlib
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,"../.."))},${JSON.stringify(path.resolve(__dirname,"../../src/lib"))}]
module=importlib.import_module('bench.pari-class-group-port.binary_splitting')
f=module.pari_abpq_sum
a=[i%5-2 for i in range(70)];b=[2*i+1 for i in range(70)];p=[i%3+1 for i in range(70)];q=[i%4+2 for i in range(70)]
records,atanhs=json.load(sys.stdin)
for row in records:
    values=list(map(int,row));got=f(a,b,p,q,*values[:2],[0]*91);assert got==tuple(values[2:]),(values,got)
for row in atanhs:
    values=list(map(int,row));got=module.pari_atanhuu(*values[:3],[0]*1024,[0]*1024,[0]*1024,[0]*1024,[0]*91);assert got==tuple(values[3:]),(values,got)
`],{input:JSON.stringify([records,atanhs]),encoding:"utf8",timeout:30000});assert.equal(py.status,0,py.stderr);
  const built=await compileKernel({sourcePath:path.join(__dirname,"binary_splitting.py")}),mod=require(built.modulePath);
  const a=Array.from({length:70},(_,i)=>BigInt(i%5-2)),b=a.map((_,i)=>BigInt(2*i+1)),p=a.map((_,i)=>BigInt(i%3+1)),q=a.map((_,i)=>BigInt(i%4+2));
  for(const row of records)for(const backend of ["javascript","gmp","tagged"]){
    const values=row.map(BigInt),inputs=[a.slice(),b.slice(),p.slice(),q.slice()];
    assert.deepEqual(mod.pari_abpq_sum[backend](...inputs,...values.slice(0,2),Array(91).fill(0n)),values.slice(2),`${backend}: ${row}`);
    assert.deepEqual(inputs,[a,b,p,q]);
  }
  for(const backend of ["javascript","gmp","tagged"]){
    const f=mod.pari_abpq_sum[backend],ones=Array(4096).fill(1n);
    assert.deepEqual(f(ones,ones,ones,ones,0n,4096n,Array(91).fill(0n)),[1n,1n,1n,4096n]);
    assert.throws(()=>f(a,b,p,q,0n,1n,Array(90).fill(0n)),/91 entries/);
    assert.throws(()=>f(a,b,p,q,0n,71n,Array(91).fill(0n)),/input exhausted/);
    assert.throws(()=>f(a,b,p,q,1n,1n,Array(91).fill(0n)),/interval/);
  }
  for(const row of atanhs)for(const backend of ['javascript','gmp']){
    const values=row.map(BigInt);
    assert.deepEqual(mod.pari_atanhuu[backend](...values.slice(0,3),...Array.from({length:4},()=>mod.createIntegerBuffer(1024,64)),mod.createIntegerBuffer(91,64)),values.slice(3),`${backend}: ${row}`);
  }
  console.log('256 binary-splitting outputs match PARI/CPython/JS/GMP/tagged; maximum-depth and scratch guards pass');
  console.log('20 connected atanhuu outputs match PARI/CPython/JS/GMP');
})().catch(error=>{console.error(error);process.exitCode=1;});

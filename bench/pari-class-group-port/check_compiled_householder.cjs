"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-qr-"));
const source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
fs.writeFileSync(source,`#include "pari.h"
static void scalar(GEN x){long e;if(typ(x)==t_INT)pari_printf(" %Ps -1 0",x);else pari_printf(" %Ps %ld %ld",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
static void emit(GEN x,long p){long n=lg(x)-1;GEN y=gaussred_from_QR(x,p);printf("%ld %ld %d",n,p,y!=NULL);for(long i=1;i<=n;i++)for(long j=1;j<=n;j++)scalar(gcoeff(x,i,j));if(y)for(long i=1;i<=n;i++)for(long j=1;j<=n;j++)scalar(gcoeff(y,i,j));puts("");}
int main(void){pari_init(64000000,10000);
const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};long primes[]={2,3,7};
for(long f=0;f<4;f++)for(long p=128;p<=256;p+=64){pari_sp av=avma;GEN nf=nfinit(gp_read_str(polys[f]),p);
for(long k=0;k<3;k++){GEN pr=gel(idealprimedec(nf,stoi(primes[k])),1),I=idealhnf(nf,pr),u=ZM_lll(ZM_mul(nf_get_roundG(nf),I),0.99,LLL_IM);emit(RgM_mul(nf_get_G(nf),ZM_mul(I,u)),p);}avma=av;}
for(long n=1;n<=5;n++)for(long mode=0;mode<6;mode++){pari_sp av=avma;long p=mode==5?64:192;GEN x=zeromatcopy(n,n);
for(long i=1;i<=n;i++)for(long j=1;j<=n;j++){GEN a=stoi(i==j?10:((i*7+j*3)%5-2));if(mode==3)a=gen_0;if(mode==4)a=stoi(i==j?-1:0);if(mode==5)a=i==j?int2n(20):gen_0;
if(mode==1||mode==5||(mode==2&&(i+j)%2))a=itor(a,p);gcoeff(x,i,j)=a;}emit(x,p);avma=av;}
pari_close();return 0;}`);
const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe],{encoding:"utf8",timeout:30000});assert.equal(cc.status,0,cc.stderr);
const run=spawnSync(exe,[],{encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});assert.equal(run.status,0,run.stderr);
const rows=run.stdout.trim().split("\n").map(line=>{const a=line.split(" "),n=Number(a[0]);return {n,p:Number(a[1]),status:Number(a[2]),input:a.slice(3,3+3*n*n),result:a.slice(3+3*n*n)};});assert.equal(rows.length,66);
assert.equal(rows.filter(r=>!r.status).length,9);
const py=spawnSync("python3",["-c",`
import sys,json,importlib
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,"../.."))},${JSON.stringify(path.resolve(__dirname,"../../src/lib"))}]
f=importlib.import_module('bench.pari-class-group-port.householder').pari_prepared_householder
for ix,r in enumerate(json.load(sys.stdin)):
    n=r['n'];out=[99]*(3*n*n)
    got=f(list(map(int,r['input'])),n,r['p'],out,[0]*(3*n*n),[0]*(3*n),[0]*(3*n),[0]*(3*n))
    assert got==r['status'],(ix,r,got)
    if got: assert out==list(map(int,r['result'])),(ix,r,out)
`],{input:JSON.stringify(rows),encoding:"utf8",timeout:30000});assert.equal(py.status,0,py.stderr);
const built=await compileKernel({sourcePath:path.join(__dirname,"householder.py")}),mod=require(built.modulePath);
for(const [ix,r] of rows.entries())for(const backend of ["javascript","gmp","tagged"]){
 const n=r.n,out=Array(3*n*n).fill(99n),input=r.input.map(BigInt),before=input.slice();
 const got=mod.pari_prepared_householder[backend](input,BigInt(n),BigInt(r.p),out,Array(3*n*n).fill(0n),Array(3*n).fill(0n),Array(3*n).fill(0n),Array(3*n).fill(0n));
 assert.equal(got,BigInt(r.status),`${ix} ${backend}`);assert.deepEqual(input,before);
 if(got)assert.deepEqual(out,r.result.map(BigInt),`${ix} ${backend}`);
}
for(const backend of ["javascript","gmp","tagged"]){
 assert.throws(()=>mod.pari_prepared_householder[backend]([],0n,192n,[],[],[],[],[]),/unsupported QR shape/);
 assert.throws(()=>mod.pari_prepared_householder[backend]([],2n,192n,[],[],[],[],[]),/matrix storage too small/);
}
console.log(`66 QR cases (${rows.filter(r=>!r.status).length} upstream precision failures), including 36 actual LLL-reduced ideal embedding matrices, match PARI/CPython/JS/GMP/tagged`);
})().catch(e=>{console.error(e);process.exitCode=1;});

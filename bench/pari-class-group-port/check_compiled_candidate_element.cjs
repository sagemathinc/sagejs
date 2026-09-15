"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-candidate-element-")),source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
fs.writeFileSync(source,`#include "pari.h"
int main(void){pari_init(64000000,10000);setrand(stoi(1729));const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};long primes[]={2,3,7};
for(long f=0;f<4;f++){pari_sp av=avma;GEN nf=nfinit(gp_read_str(polys[f]),192);long n=nf_get_degree(nf);
for(long ip=0;ip<3;ip++){GEN I=idealhnf(nf,gel(idealprimedec(nf,stoi(primes[ip])),1)),u=ZM_lll(ZM_mul(nf_get_roundG(nf),I),0.99,LLL_IM),base=ZM_mul(I,u);
for(long scale=0;scale<2;scale++)for(long pattern=0;pattern<8;pattern++)for(long track=0;track<2;track++)for(long limit=0;limit<2;limit++){
GEN ideal=scale?ZM_Z_mul(base,int2n(80)):base,x=const_vecsmall(n,0),gx=cgetg(n+1,t_COL);for(long i=1;i<=n;i++){x[i]=itos(randomi(stoi(7)))-3;gel(gx,i)=stoi(99);}
if(pattern==0)for(long i=1;i<=n;i++)x[i]=0;if(pattern==1||pattern==2){for(long i=1;i<=n;i++)x[i]=0;x[pattern]=1;}if(pattern==3)for(long i=1;i<=n;i++)x[i]*=2;
long initial=limit?500:499,attempts=initial,small=17,status=0;
if(zv_content(x)==1){gx=ZM_zc_mul(ideal,x);if(!ZV_isscalar(gx)){if(++attempts>500)status=-1;else {status=1;if(track)small++;}}}
printf("%ld %ld %ld %ld %ld %ld",n,track,initial,status,attempts,small);for(long i=1;i<=n;i++)printf(" %ld",x[i]);for(long i=1;i<=n;i++)for(long j=1;j<=n;j++)pari_printf(" %Ps",gcoeff(ideal,i,j));for(long i=1;i<=n;i++)pari_printf(" %Ps",gel(gx,i));puts("");}}avma=av;}pari_close();return 0;}`);
const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe],{encoding:"utf8",timeout:30000});assert.equal(cc.status,0,cc.stderr);
const run=spawnSync(exe,[],{encoding:"utf8",timeout:30000,maxBuffer:8*1024*1024});assert.equal(run.status,0,run.stderr);
const rows=run.stdout.trim().split("\n").map(line=>{const a=line.split(" "),n=Number(a[0]);return {n,track:a[1],initial:a[2],status:a[3],counters:a.slice(4,6),x:['0',...a.slice(6,6+n)],ideal:a.slice(6+n,6+n+n*n),element:a.slice(6+n+n*n)};});assert.equal(rows.length,768);assert.deepEqual([...new Set(rows.map(r=>Number(r.status)))].sort(),[-1,0,1]);
const py=spawnSync("python3",["-c",`
import sys,json,importlib
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,"../.."))},${JSON.stringify(path.resolve(__dirname,"../../src/lib"))}]
f=importlib.import_module('bench.pari-class-group-port.candidate_element').pari_candidate_element
for r in json.load(sys.stdin):
    out=[99]*r['n'];c=[int(r['initial']),17]
    got=f(list(map(int,r['x'])),list(map(int,r['ideal'])),r['n'],out,c,int(r['track']))
    assert got==int(r['status']) and out==list(map(int,r['element'])) and c==list(map(int,r['counters'])),(r,got,out,c)
`],{input:JSON.stringify(rows),encoding:"utf8",timeout:30000});assert.equal(py.status,0,py.stderr);
const built=await compileKernel({sourcePath:path.join(__dirname,"candidate_element.py")}),mod=require(built.modulePath);
for(const r of rows)for(const backend of ["javascript","gmp","tagged"]){const out=Array(r.n).fill(99n),c=[BigInt(r.initial),17n];const got=mod.pari_candidate_element[backend](r.x.map(BigInt),r.ideal.map(BigInt),BigInt(r.n),out,c,BigInt(r.track));assert.equal(got,BigInt(r.status));assert.deepEqual(out,r.element.map(BigInt));assert.deepEqual(c.map(BigInt),r.counters.map(BigInt));}
console.log("768 candidate filters/multiplications match PARI/CPython/JS/GMP/tagged, including partial writes and factor-attempt boundary");
})().catch(e=>{console.error(e);process.exitCode=1;});

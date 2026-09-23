"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
  const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-grh-"));
  const source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
  fs.writeFileSync(source,`#include "${path.join(pari,"src/basemath/buch2.c")}"
int main(void){pari_init(64000000,10000);
const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
for(long field=0;field<4;field++){
GEN nf=nfinit(gp_read_str(polys[field]),nbits2prec(192));GRHcheck_t S;
double ld=dbllog2(absi_shallow(nf_get_disc(nf)))*M_LN2;init_GRHcheck(&S,nf_get_degree(nf),nf_get_r1(nf),ld);cache_prime_dec(&S,10000,nf);
printf("%.17g %.17g %ld %ld",S.cD,S.cN,(long)(4*ld*ld),S.nprimes);
for(long i=0;i<S.nprimes;i++){GEN f=gel(S.primes[i].dec,1),n=gel(S.primes[i].dec,2);printf(" %lu %.17g %ld",S.primes[i].p,S.primes[i].logp,lg(f)-1);for(long j=1;j<lg(f);j++)printf(" %ld %ld",f[j],n[j]);}
for(long bound=1;bound<=300;bound++)printf(" %d",GRHchk(nf,&S,bound));
long starts[]={1,2,10,100,500,1000};
for(long k=0;k<6;k++){long initial=starts[k],high=initial,low=initial;
while(!GRHchk(nf,&S,high)){low=high;high*=2;}
while(high-low>1){long t=(low+high)/2;if(GRHchk(nf,&S,t))high=t;else low=t;}
long result=(high==initial+1&&GRHchk(nf,&S,initial))?initial:high;
if(result>(long)(4*ld*ld))result=(long)(4*ld*ld);printf(" %ld",result);}
printf(" %ld",nf_get_degree(nf));for(long n=1;n<=8;n++)printf(" %ld",nthideal(&S,nf,n));
puts("");free_GRHcheck(&S);
}pari_close();return 0;}`);
  const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe],{encoding:"utf8",timeout:30000});assert.equal(cc.status,0,cc.stderr);
  const run=spawnSync(exe,[],{encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});assert.equal(run.status,0,run.stderr);
  const records=run.stdout.trim().split("\n").map(line=>{
    const r=line.split(" "),logs=r.slice(0,2).map(Number),maximum=r[2],size=Number(r[3]);let pos=4;
    const primes=[],offsets=[],counts=[],degrees=[],multiplicities=[];
    for(let i=0;i<size;i++){primes.push(r[pos++]);logs.push(Number(r[pos++]));const count=Number(r[pos++]);offsets.push(String(degrees.length));counts.push(String(count));for(let j=0;j<count;j++){degrees.push(r[pos++]);multiplicities.push(r[pos++]);}}
    const checks=r.slice(pos,pos+300),search=r.slice(pos+300,pos+306),degree=r[pos+306],nth=r.slice(pos+307);assert.equal(nth.length,8);
    return {maximum,primes,offsets,counts,degrees,multiplicities,logs,checks,search,degree,nth};
  });
  const py=spawnSync("python3",["-c",`
import sys,json,importlib
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,"../.."))},${JSON.stringify(__dirname)},${JSON.stringify(path.resolve(__dirname,"../../src/lib"))}]
from grh_bound import pari_prepared_grh_check,pari_prepared_grh_search
pari_prepared_nthideal=importlib.import_module('bench.pari-class-group-port.initial_base').pari_prepared_nthideal
for r in json.load(sys.stdin):
    args=[list(map(int,r[k])) for k in ['primes','offsets','counts','degrees','multiplicities']]+[r['logs'],[0.0,0.0]]
    for b,want in enumerate(r['checks'],1):assert pari_prepared_grh_check(b,*args)==int(want),(b,want)
    for initial,want in zip([1,2,10,100,500,1000],r['search']):assert pari_prepared_grh_search(initial,int(r['maximum']),*args)==int(want)
    for n,want in enumerate(r['nth'],1):assert pari_prepared_nthideal(int(r['degree']),n,*args[:5],[0]*(n+1))==int(want)
print('CPython matches GRHchk and search')
`],{input:JSON.stringify(records),encoding:"utf8",timeout:30000});assert.equal(py.status,0,py.stderr);
  const built=await compileKernel({sourcePath:path.join(__dirname,"grh_bound.py")}),mod=require(built.modulePath);
  const nthBuilt=await compileKernel({sourcePath:path.join(__dirname,"initial_base.py")}),nthMod=require(nthBuilt.modulePath);
  for(const r of records)for(const backend of ["javascript","gmp"]){
    const args=[...['primes','offsets','counts','degrees','multiplicities'].map(k=>r[k].map(BigInt)),r.logs,[0,0]];
    for(let b=1;b<=300;b++)assert.equal(mod.pari_prepared_grh_check[backend](BigInt(b),...args),BigInt(r.checks[b-1]),`${backend} bound=${b}`);
    for(const [i,initial] of [1,2,10,100,500,1000].entries())assert.equal(mod.pari_prepared_grh_search[backend](BigInt(initial),BigInt(r.maximum),...args),BigInt(r.search[i]));
    assert.throws(()=>mod.pari_prepared_grh_check[backend](BigInt(r.primes.at(-1)),...args),/catalog exhausted/);
  }
  assert(records.some(r=>r.checks.includes("0")&&r.checks.includes("1")));
  for(const r of records)for(const backend of ["javascript","gmp","tagged"]){
    const args=['primes','offsets','counts','degrees','multiplicities'].map(k=>r[k].map(BigInt));
    for(let n=1;n<=8;n++)assert.equal(nthMod.pari_prepared_nthideal[backend](BigInt(r.degree),BigInt(n),...args,Array(n+1).fill(0n)),BigInt(r.nth[n-1]));
    assert.throws(()=>nthMod.pari_prepared_nthideal[backend](BigInt(r.degree),1n,[],[],[],[],[],[0n,0n]),/catalog exhausted/);
  }
  console.log("1200 GRHchk decisions and 24 bound searches match PARI 2.17.4, CPython, JS and GMP; catalog exhaustion remains explicit");
  console.log("32 nthideal controls match PARI, CPython, JS, GMP and tagged execution");
})().catch(error=>{console.error(error);process.exitCode=1;});

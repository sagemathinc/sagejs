"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
  const hnf=process.argv.includes("--hnf");
  const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-valuation-"));
  const source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
  fs.writeFileSync(source,`#include <pari.h>
static void integer(GEN x){char *s=GENtostr(x);printf(" %s",s);pari_free(s);}
int main(void){pari_init(64000000,500000);
const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
long primes[]={2,3,5,7,11,13,17,19},powers[]={0,1,15,16,17,64,257};
for(long f=0;f<4;f++){GEN nf=nfinit(gp_read_str(polys[f]),nbits2prec(192));long n=nf_get_degree(nf);
for(long pi=0;pi<8;pi++){GEN p=stoi(primes[pi]),dec=idealprimedec(nf,p);
for(long j=1;j<lg(dec);j++){GEN P=gel(dec,j),tau=pr_get_tau(P);long inert=typ(tau)==t_INT;
for(long k=0;k<7;k++){pari_sp av=avma;GEN v=cgetg(n+1,t_COL),scale=powiu(p,powers[k]);
if(getenv("SAGEJS_HNF_VALUATION")) {
GEN A=idealhnf(nf,idealpows(nf,P,powers[k]));
if(k%3==0 && lg(dec)>2) A=idealmul(nf,A,gel(dec,j==lg(dec)-1?1:j+1));
if(k%2) A=idealmul(nf,A,stoi(3));
printf("%ld %ld %ld %ld %ld",n,primes[pi],pr_get_e(P),pr_get_f(P),inert);
for(long row=1;row<=n;row++)for(long col=1;col<=n;col++)integer(gcoeff(A,row,col));
for(long row=1;row<=n;row++)for(long col=1;col<=n;col++)integer(inert?gen_0:gcoeff(tau,row,col));
printf(" %ld\\n",idealval(nf,A,P));avma=av;continue;
}
for(long i=1;i<=n;i++)gel(v,i)=mulis(scale,(i==2 && k%2)?0:i%2?i:-i-1);
printf("%ld %ld %ld %ld",n,primes[pi],pr_get_e(P),inert);
for(long i=1;i<=n;i++)integer(gel(v,i));
for(long row=1;row<=n;row++)for(long col=1;col<=n;col++)integer(inert?gen_0:gcoeff(tau,row,col));
printf(" %ld\\n",ZC_nfval(v,P));avma=av;
}}}}pari_close();return 0;}
`);
  const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-o",exe],{encoding:"utf8",timeout:30000});
  assert.equal(cc.status,0,cc.stderr);
  const env={...process.env};delete env.SAGEJS_HNF_VALUATION;if(hnf)env.SAGEJS_HNF_VALUATION="1";
  const oracle=spawnSync(exe,[],{env,encoding:"utf8",timeout:30000,maxBuffer:8*1024*1024});assert.equal(oracle.status,0,oracle.stderr);
  const rows=oracle.stdout.trim().split("\n").map(line=>line.split(" "));
  assert(rows.some(r=>r[hnf?4:3]==="1"));
  assert(rows.some(r=>BigInt(r[2])>1n));
  assert(rows.some(r=>BigInt(r.at(-1))>32n));
  const python=spawnSync("python3",["-c",`
import sys,json
sys.path.insert(0,${JSON.stringify(path.resolve(__dirname,"../../src/lib"))})
sys.path.insert(0,${JSON.stringify(__dirname)})
from valuation import pari_prepared_ideal_valuation,pari_prepared_hnf_valuation
for row in json.load(sys.stdin):
    r=list(map(int,row));n=r[0]
    if ${hnf?"True":"False"}:
        result=pari_prepared_hnf_valuation(r[5:5+n*n],r[5+n*n:-1],[0]*(n*n),[0]*(n*n),[0]*n,[0]*n,*r[:5])
    else:
        result=pari_prepared_ideal_valuation(r[4:4+n],r[4+n:-1],[0]*n,[0]*n,[0]*n,[0]*32,*r[:4])
    assert result==r[-1],(r,result)
print("CPython prepared prime-ideal valuations match PARI")
`],{input:JSON.stringify(rows),encoding:"utf8",timeout:30000});
  assert.equal(python.status,0,python.stderr);console.log(python.stdout.trim());
  const built=await compileKernel({sourcePath:path.join(__dirname,"valuation.py")}),mod=require(built.modulePath);
  for(const row of rows){const r=row.map(BigInt),n=Number(r[0]);
    for(const backend of ["javascript","gmp","tagged"]){
      const result=hnf?
        mod.pari_prepared_hnf_valuation[backend](r.slice(5,5+n*n),r.slice(5+n*n,-1),mod.createIntegerBuffer(n*n,64),mod.createIntegerBuffer(n*n,64),mod.createIntegerBuffer(n,64),mod.createIntegerBuffer(n,64),...r.slice(0,5)):
        mod.pari_prepared_ideal_valuation[backend](r.slice(4,4+n),r.slice(4+n,-1),mod.createIntegerBuffer(n,64),mod.createIntegerBuffer(n,64),mod.createIntegerBuffer(n,64),mod.createIntegerBuffer(32,64),...r.slice(0,4));
      assert.equal(result,r.at(-1));
    }
  }
  console.log(`${rows.length} prepared ${hnf?"HNF ideal":"element"} valuations match in JS/GMP/tagged`);
})().catch(error=>{console.error(error);process.exitCode=1;});

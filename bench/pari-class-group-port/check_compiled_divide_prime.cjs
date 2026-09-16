"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
  const diagnostic=process.argv.includes("--diagnostic");
  const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-divide-prime-"));
  const source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
  fs.writeFileSync(source,`#include "${path.join(pari,"src/basemath/buch2.c")}"
#include <time.h>
static double elapsed(struct timespec a,struct timespec b){return (b.tv_sec-a.tv_sec)+(b.tv_nsec-a.tv_nsec)*1e-9;}
static void emit_integer(GEN x){char *s=GENtostr(x);printf(" %s",s);pari_free(s);}
int main(void){pari_init(64000000,500000);double timing[3]={0,0,0};long calls=0;
const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
long primes[]={2,3,5,7,11,13,17,19};
for(long f=0;f<4;f++){GEN nf=nfinit(gp_read_str(polys[f]),nbits2prec(192));long n=nf_get_degree(nf);
for(long pi=0;pi<8;pi++){GEN p=stoi(primes[pi]),dec=idealprimedec(nf,p);long full=lg(dec)-1;
for(long mode=0;mode<3;mode++)for(long cut=0;cut<2;cut++)for(long k=0;k<=3;k++){
pari_sp av=avma;GEN m=cgetg(n+1,t_COL);for(long i=1;i<=n;i++)gel(m,i)=mulis(powiu(p,k),i%2?i:-i-1);
GEN I=idealhnf(nf,idealpows(nf,gel(dec,1),k));
GEN N=mode==1?idealnorm(nf,I):nfnorm(nf,m);if(mode==2)N=diviiexact(N,idealnorm(nf,I));
long kn=Z_pval(N,p);if(!kn){avma=av;continue;}
GEN LP=shallowcopy(dec);setlg(LP,full+1-cut);long g=lg(LP)-1;
FACT fact[16];fact[0].pr=1;fact[1].pr=99;fact[1].ex=7;
long ok=mode==0?divide_p_elt(LP,23,kn,m,fact):mode==1?divide_p_id(LP,23,kn,nf,I,fact):divide_p_quo(LP,23,kn,nf,I,m,fact);
if(getenv("SAGEJS_DIVIDE_DIAGNOSTIC")){
  for(long sample=0;sample<3;sample++){struct timespec begin,end;clock_gettime(CLOCK_MONOTONIC,&begin);
    for(long rep=0;rep<20;rep++){pari_sp keep=avma;FACT scratch[16];scratch[0].pr=1;scratch[1].pr=99;scratch[1].ex=7;
      long result=mode==0?divide_p_elt(LP,23,kn,m,scratch):mode==1?divide_p_id(LP,23,kn,nf,I,scratch):divide_p_quo(LP,23,kn,nf,I,m,scratch);
      if(result!=ok || scratch[0].pr!=fact[0].pr)abort();avma=keep;
    }clock_gettime(CLOCK_MONOTONIC,&end);timing[sample]+=elapsed(begin,end);
  }calls+=20;
}
printf("%ld %ld %ld %ld %ld %ld %ld",n,primes[pi],mode,g,kn,ok,fact[0].pr);
for(long j=1;j<=g;j++){GEN P=gel(LP,j),tau=pr_get_tau(P);long inert=typ(tau)==t_INT;
printf(" %ld %ld %ld",pr_get_e(P),pr_get_f(P),inert);
for(long row=1;row<=n;row++)for(long col=1;col<=n;col++)emit_integer(inert?gen_0:gcoeff(tau,row,col));}
for(long i=1;i<=n;i++)emit_integer(gel(m,i));
for(long row=1;row<=n;row++)for(long col=1;col<=n;col++)emit_integer(gcoeff(I,row,col));
for(long j=1;j<=fact[0].pr;j++)printf(" %ld %ld",fact[j].pr,fact[j].ex);printf("\\n");avma=av;
}}}if(getenv("SAGEJS_DIVIDE_DIAGNOSTIC"))fprintf(stderr,"DIAGNOSTIC %ld %.9f %.9f %.9f\\n",calls,timing[0],timing[1],timing[2]);pari_close();return 0;}
`);
  const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe],{encoding:"utf8",timeout:30000});
  assert.equal(cc.status,0,cc.stderr);
  const env={...process.env};delete env.SAGEJS_DIVIDE_DIAGNOSTIC;if(diagnostic)env.SAGEJS_DIVIDE_DIAGNOSTIC="1";
  const oracle=spawnSync(exe,[],{env,encoding:"utf8",timeout:30000,maxBuffer:8*1024*1024});assert.equal(oracle.status,0,oracle.stderr);
  const records=oracle.stdout.trim().split("\n").map(line=>{
    const r=line.split(" ").map(BigInt),[n,p,mode,g,kn,ok,count]=r.slice(0,7);let pos=7;
    const tau=[],es=[],fs=[],inert=[];
    for(let j=0;j<Number(g);j++){es.push(r[pos++]);fs.push(r[pos++]);inert.push(r[pos++]);tau.push(...r.slice(pos,pos+Number(n*n)));pos+=Number(n*n);}
    const m=r.slice(pos,pos+Number(n));pos+=Number(n);const I=r.slice(pos,pos+Number(n*n));pos+=Number(n*n);
    return {n,p,mode,g,kn,ok,count,tau,es,fs,inert,m,I,result:r.slice(pos)};
  });
  assert(records.some(r=>r.ok===0n)&&records.some(r=>r.ok===1n));
  const python=spawnSync("python3",["-c",`
import sys,json
sys.path.insert(0,${JSON.stringify(path.resolve(__dirname,"../../src/lib"))})
sys.path.insert(0,${JSON.stringify(__dirname)})
from valuation import pari_prepared_divide_prime
for r in json.load(sys.stdin):
    r={k:list(map(int,v)) if isinstance(v,list) else int(v) for k,v in r.items()};n=r['n']
    indices=[99]+[0]*15; exponents=[7]+[0]*15
    out=pari_prepared_divide_prime(r['m'],r['I'],r['tau'],r['es'],r['fs'],r['inert'],[0]*(n*n),[0]*n,[0]*n,[0]*n,[0]*32,[0]*(n*n),[0]*(n*n),[0]*n,[0]*n,indices,exponents,n,r['p'],r['g'],23,r['kn'],r['mode'],1)
    assert out==(r['ok'],r['count']),(r,out)
    assert [v for pair in zip(indices[:out[1]],exponents[:out[1]]) for v in pair]==r['result']
print('CPython divide_p output and partial writes match upstream')
`],{input:JSON.stringify(records,(_,v)=>typeof v==="bigint"?String(v):v),encoding:"utf8",timeout:30000});
  assert.equal(python.status,0,python.stderr);console.log(python.stdout.trim());
  const built=await compileKernel({sourcePath:path.join(__dirname,"valuation.py")}),mod=require(built.modulePath);
  for(const r of records)for(const backend of ["javascript","gmp","tagged"]){
    const n=Number(r.n),buf=len=>mod.createIntegerBuffer(len,64),indices=[99n,...Array(15).fill(0n)],exponents=[7n,...Array(15).fill(0n)];
    const out=mod.pari_prepared_divide_prime[backend](r.m,r.I,r.tau,r.es,r.fs,r.inert,buf(n*n),buf(n),buf(n),buf(n),buf(32),buf(n*n),buf(n*n),buf(n),buf(n),indices,exponents,r.n,r.p,r.g,23n,r.kn,r.mode,1n);
    assert.deepEqual(out,[r.ok,r.count]);
    assert.deepEqual(indices.slice(0,Number(r.count)).flatMap((v,i)=>[v,exponents[i]]),r.result);
  }
  console.log(`${records.length} upstream divide_p cases match in JS/GMP/tagged, including partial failure state`);
  if(diagnostic){
    // Boundary diagnostic only: PARI timings are C calls, port timings include
    // a public invocation per call. Samples are short and not paired; these
    // numbers cannot qualify the plan's prepared-field performance target.
    console.log(oracle.stderr.trim());
    const prepared=records.map(r=>{
      const n=Number(r.n),buf=len=>mod.createIntegerBuffer(len,64),packed=values=>mod.createIntegerBuffer(values.length,64,values);
      return [packed(r.m),packed(r.I),packed(r.tau),packed(r.es),packed(r.fs),packed(r.inert),buf(n*n),buf(n),buf(n),buf(n),buf(32),buf(n*n),buf(n*n),buf(n),buf(n),packed([99n,...Array(15).fill(0n)]),packed([7n,...Array(15).fill(0n)]),r.n,r.p,r.g,23n,r.kn,r.mode,1n];
    });
    for(const backend of ["javascript","gmp","tagged"]){
      const fn=mod.pari_prepared_divide_prime[backend];
      for(const args of prepared)fn(...args);
      const samples=[];
      for(let sample=0;sample<3;sample++){
        const start=process.hrtime.bigint();
        for(const args of prepared)for(let rep=0;rep<20;rep++)fn(...args);
        samples.push(Number(process.hrtime.bigint()-start)/1e9);
      }
      console.log(JSON.stringify({diagnostic:true,backend,callsPerSample:records.length*20,seconds:samples,boundary:"public-call-per-candidate; prepared packed buffers"}));
      const batch=mod.pari_prepared_divide_prime_batch[backend];
      for(let i=0;i<prepared.length;i++)assert.equal(batch(...prepared[i],20n),20n*(records[i].ok+records[i].count));
      const batched=[];
      for(let sample=0;sample<3;sample++){
        const start=process.hrtime.bigint();
        for(const args of prepared)batch(...args,20n);
        batched.push(Number(process.hrtime.bigint()-start)/1e9);
      }
      console.log(JSON.stringify({diagnostic:true,backend,callsPerSample:records.length*20,seconds:batched,boundary:"20 logical calls per public invocation; same packed buffers"}));
    }
    console.log(JSON.stringify({coreBytes:fs.statSync(built.coreSourcePath).size,corePath:built.coreSourcePath}));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});

"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
  const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-divide-prime-"));
  const source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
  fs.writeFileSync(source,`#include "${path.join(pari,"src/basemath/buch2.c")}"
static void emit_integer(GEN x){char *s=GENtostr(x);printf(" %s",s);pari_free(s);}
int main(void){pari_init(64000000,500000);
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
printf("%ld %ld %ld %ld %ld %ld %ld",n,primes[pi],mode,g,kn,ok,fact[0].pr);
for(long j=1;j<=g;j++){GEN P=gel(LP,j),tau=pr_get_tau(P);long inert=typ(tau)==t_INT;
printf(" %ld %ld %ld",pr_get_e(P),pr_get_f(P),inert);
for(long row=1;row<=n;row++)for(long col=1;col<=n;col++)emit_integer(inert?gen_0:gcoeff(tau,row,col));}
for(long i=1;i<=n;i++)emit_integer(gel(m,i));
for(long row=1;row<=n;row++)for(long col=1;col<=n;col++)emit_integer(gcoeff(I,row,col));
for(long j=1;j<=fact[0].pr;j++)printf(" %ld %ld",fact[j].pr,fact[j].ex);printf("\\n");avma=av;
}}}pari_close();return 0;}
`);
  const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe],{encoding:"utf8",timeout:30000});
  assert.equal(cc.status,0,cc.stderr);
  const oracle=spawnSync(exe,[],{encoding:"utf8",timeout:30000,maxBuffer:8*1024*1024});assert.equal(oracle.status,0,oracle.stderr);
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
})().catch(error=>{console.error(error);process.exitCode=1;});

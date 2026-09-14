"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
  const initialMode=process.argv.includes("--initial");
  const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-factor-base-"));
  const source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
  fs.writeFileSync(source,`#include "${path.join(pari,"src/basemath/buch2.c")}"
#include <assert.h>
int main(void){pari_init(64000000,10000);
const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
long bounds[]={2,3,5,7,11,37,101,300};
for(long field=0;field<4;field++){GEN nf=nfinit(gp_read_str(polys[field]),nbits2prec(192));long n=nf_get_degree(nf);
for(long bi=0;bi<${initialMode?3:8};bi++)for(long split=0;split<${initialMode?1:2};split++){
pari_sp av=avma;long C2=bounds[bi],C1=split?C2:C2/2;GRHcheck_t S;init_GRHcheck(&S,n,nf_get_r1(nf),dbllog2(absi_shallow(nf_get_disc(nf)))*M_LN2);cache_prime_dec(&S,C2+1,nf);
double ld=dbllog2(absi_shallow(nf_get_disc(nf)))*M_LN2,ld2=ld*ld,cbach=bi==2?13.0:bi?0.3:0.0,cbach2=0.3,original_cbach=cbach;
${initialMode?`if(cbach>12.0){if(cbach2<cbach)cbach2=cbach;cbach=12.0;}
long initial=(long)(cbach2*ld2);if(initial<1)initial=1;long high=initial,low=initial;
while(!GRHchk(nf,&S,high)){low=high;high*=2;}while(high-low>1){long t=(low+high)/2;if(GRHchk(nf,&S,t))high=t;else low=t;}
C2=(high==initial+1&&GRHchk(nf,&S,initial))?initial:high;if(C2>(long)(4*ld2))C2=(long)(4*ld2);
C1=cbach?(long)(cbach*ld2):C2;long lower=nthideal(&S,nf,n);if(C1<lower)C1=lower;if(C2<C1)C2=C1;cache_prime_dec(&S,C2+1,nf);` : ""}
FB_t F={0};FBgen(&F,nf,n,C1,C2,&S);GEN full=cgetg(S.nprimes+1,t_VEC);long total=0;
for(long i=0;i<S.nprimes;i++){gel(full,i+1)=idealprimedec(nf,utoipos(S.primes[i].p));total+=lg(gel(full,i+1))-1;}
long selected=0;for(long i=1;i<=F.KCZ2;i++)selected+=lg(gel(F.LV,F.FB[i]))-1;
char*prod=GENtostr(F.prodZ);printf("%ld %ld %ld %ld %ld %ld %ld %ld %s %.17g",n,C1,C2,S.nprimes,F.KC,F.KCZ,F.KCZ2,selected,prod,log((double)C2+0.5));pari_free(prod);
for(long i=0;i<S.nprimes;i++){GEN group=gel(full,i+1);printf(" %lu %.17g %ld",S.primes[i].p,S.primes[i].logp,lg(group)-1);for(long j=1;j<lg(group);j++)printf(" %ld",pr_get_f(gel(group,j)));}
for(long i=1;i<=F.KCZ2;i++){long p=F.FB[i],pi=0,base=0;while(S.primes[pi].p!=p){base+=lg(gel(full,pi+1))-1;pi++;}GEN all=gel(full,pi+1),group=gel(F.LV,p);
printf(" %ld %ld %ld %d",p,F.iLP[p],lg(group)-1,isclone(group)?1:0);
for(long j=1;j<lg(group);j++){long found=-1;for(long k=1;k<lg(all);k++)if(gequal(gel(group,j),gel(all,k))){found=base+k-1;break;}assert(found>=0);printf(" %ld",found);}}
${initialMode?'printf(" %ld %.17g %.17g %.17g",nf_get_r1(nf),ld,original_cbach,0.3);':""}
puts("");free_GRHcheck(&S);avma=av;
}}pari_close();return 0;}`);
  const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe],{encoding:"utf8",timeout:30000});assert.equal(cc.status,0,cc.stderr);
  const run=spawnSync(exe,[],{encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});assert.equal(run.status,0,run.stderr);
  const records=run.stdout.trim().split("\n").map(line=>{
    const r=line.split(" "),n=Number(r[0]),c1=Number(r[1]),c2=Number(r[2]),size=Number(r[3]),result=r.slice(4,9);let pos=10;
    const primes=[],fullOffsets=[],fullCounts=[],degrees=[],logs=[Number(r[9])];
    for(let i=0;i<size;i++){primes.push(r[pos++]);logs.push(Number(r[pos++]));const count=Number(r[pos++]);fullOffsets.push(String(degrees.length));fullCounts.push(String(count));degrees.push(...r.slice(pos,pos+count));pos+=count;}
    const selectedPrimes=[],offsets=Array(c2+1).fill("-1"),counts=Array(c2+1).fill("0"),complete=Array(c2+1).fill("0"),indices=[];
    for(let i=0;i<Number(result[2]);i++){const p=Number(r[pos++]);selectedPrimes.push(String(p));offsets[p]=r[pos++];counts[p]=r[pos++];complete[p]=r[pos++];indices.push(...r.slice(pos,pos+Number(counts[p])));pos+=Number(counts[p]);}
    let realPlaces,configuration;
    if(initialMode){realPlaces=Number(r[pos++]);configuration=r.slice(pos,pos+3).map(Number);pos+=3;}
    const patternOffsets=[],patternCounts=[],patternDegrees=[],multiplicities=[];
    for(let i=0;i<size;i++){
      patternOffsets.push(patternDegrees.length);let last=null;
      for(const f of degrees.slice(Number(fullOffsets[i]),Number(fullOffsets[i])+Number(fullCounts[i]))){
        if(f!==last){patternDegrees.push(f);multiplicities.push(1);last=f;}else multiplicities[multiplicities.length-1]++;
      }
      patternCounts.push(patternDegrees.length-patternOffsets.at(-1));
    }
    assert.equal(pos,r.length);return {n,c1,c2,primes,fullOffsets,fullCounts,degrees,logs,result,selectedPrimes,offsets,counts,complete,indices,realPlaces,configuration,patternOffsets,patternCounts,patternDegrees,multiplicities};
  });
  const py=spawnSync("python3",["-c",`
import sys,json,importlib,decimal
sys.set_int_max_str_digits(20000) # Bounded oracle serialization, not a kernel limit.
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,"../.."))},${JSON.stringify(__dirname)},${JSON.stringify(path.resolve(__dirname,"../../src/lib"))}]
from factor_base import pari_prepared_factor_base
initial_base=importlib.import_module('bench.pari-class-group-port.initial_base').pari_prepared_initial_base
for r in json.load(sys.stdin):
    p=[0]*len(r['primes']);o=[0]*(r['c2']+1);c=o.copy();a=o.copy();indices=[0]*len(r['degrees'])
    if ${initialMode?"True":"False"}:
        result=initial_base(r['n'],r['realPlaces'],r['configuration'],list(map(int,r['primes'])),*[list(map(int,r[k])) for k in ['patternOffsets','patternCounts','patternDegrees','multiplicities','fullOffsets','fullCounts','degrees']],[0]*(r['n']+1),[0.0]*(len(r['primes'])+2),[0.0,0.0],[0.0]*(len(r['primes'])+1),p,o,c,a,indices)
        assert result[:2]==(r['c1'],r['c2'])
        result=result[2:]
    else:
        result=pari_prepared_factor_base(r['n'],r['c1'],r['c2'],list(map(int,r['primes'])),list(map(int,r['fullOffsets'])),list(map(int,r['fullCounts'])),list(map(int,r['degrees'])),r['logs'],p,o,c,a,indices)
    assert list(result)==list(map(int,r['result']))
    for got,key in [(p[:result[2]],'selectedPrimes'),(o,'offsets'),(c,'counts'),(a,'complete'),(indices[:result[3]],'indices')]:assert got==list(map(int,r[key])),(r,key,got)
print('CPython factor-base selection matches actual FBgen')
`],{input:JSON.stringify(records),encoding:"utf8",timeout:30000});assert.equal(py.status,0,py.stderr);
  const built=await compileKernel({sourcePath:path.join(__dirname,initialMode?"initial_base.py":"factor_base.py")}),mod=require(built.modulePath);
  for(const r of records)for(const backend of ["javascript","gmp"]){
    const p=Array(r.primes.length).fill(0n),o=Array(r.c2+1).fill(0n),c=o.slice(),a=o.slice(),indices=Array(r.degrees.length).fill(0n);
    const args=[BigInt(r.n),BigInt(r.c1),BigInt(r.c2),r.primes.map(BigInt),r.fullOffsets.map(BigInt),r.fullCounts.map(BigInt),r.degrees.map(BigInt),r.logs,p,o,c,a,indices];
    let result;
    if(initialMode){
      result=mod.pari_prepared_initial_base[backend](BigInt(r.n),BigInt(r.realPlaces),r.configuration,r.primes.map(BigInt),...['patternOffsets','patternCounts','patternDegrees','multiplicities','fullOffsets','fullCounts','degrees'].map(k=>r[k].map(BigInt)),Array(r.n+1).fill(0n),Array(r.primes.length+2).fill(0),[0,0],Array(r.primes.length+1).fill(0),p,o,c,a,indices);
      assert.deepEqual(result.slice(0,2),[BigInt(r.c1),BigInt(r.c2)]);result=result.slice(2);
    }else result=mod.pari_prepared_factor_base[backend](...args);
    if(!initialMode&&r===records[0]&&backend==="gmp")assert.throws(()=>mod.pari_prepared_factor_base.tagged(...args),/tagged native backend is not available for mixed exact\/Float64/);
    assert.deepEqual(result,r.result.map(BigInt));for(const [got,key] of [[p.slice(0,Number(result[2])),"selectedPrimes"],[o,"offsets"],[c,"counts"],[a,"complete"],[indices.slice(0,Number(result[3])),"indices"]])assert.deepEqual(got,r[key].map(BigInt));
  }
  if(!initialMode)assert(records.some(r=>r.result[0]!==r.result[3]));
  assert(records.some(r=>r.complete.some((v,i)=>v==="0"&&r.counts[i]!=="0")));
  console.log(`${records.length} ${initialMode?"connected initial":"declared-bound"} factor-base selections match FBgen/CPython/JS/GMP; tagged mixed capability unavailable`);
})().catch(error=>{console.error(error);process.exitCode=1;});

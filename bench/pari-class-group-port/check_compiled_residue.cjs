"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
  const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-residue-"));
  const source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
  fs.writeFileSync(source,`#include "pari.h"
static double captured_log;
static GEN capture_exp(GEN x){captured_log=rtodbl(x);return mpexp(x);}
/* Observe the argument; the upstream exponential still executes. */
#define mpexp capture_exp
#include "${path.join(pari,"src/basemath/buch2.c")}"
#undef mpexp
int main(void){pari_init(64000000,10000);
const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
long bounds[]={2,3,4,5,8,16,31,32,64,101,300,1000,10000};
for(long field=0;field<4;field++){
GEN nf=nfinit(gp_read_str(polys[field]),nbits2prec(192));GRHcheck_t S;
init_GRHcheck(&S,nf_get_degree(nf),nf_get_r1(nf),dbllog2(absi_shallow(nf_get_disc(nf)))*M_LN2);cache_prime_dec(&S,10001,nf);
printf("%ld",S.nprimes);
for(long i=0;i<S.nprimes;i++){GEN f=gel(S.primes[i].dec,1),n=gel(S.primes[i].dec,2);printf(" %lu %.17g %ld",S.primes[i].p,S.primes[i].logp,lg(f)-1);for(long j=1;j<lg(f);j++)printf(" %ld %ld",f[j],n[j]);}
for(long bi=0;bi<13;bi++){long bound=bounds[bi],count=0;GEN value=compute_invres(&S,bound);(void)value;while(count<S.nprimes && (long)(log((double)bound)/S.primes[count].logp)>=1)count++;printf(" %ld %.17g",count,captured_log);}
puts("");free_GRHcheck(&S);
}pari_close();return 0;}`);
  const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe],{encoding:"utf8",timeout:30000});assert.equal(cc.status,0,cc.stderr);
  const run=spawnSync(exe,[],{encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});assert.equal(run.status,0,run.stderr);
  const records=run.stdout.trim().split("\n").map(line=>{
    const r=line.split(" "),size=Number(r[0]);let pos=1;
    const primes=[],offsets=[],counts=[],degrees=[],multiplicities=[],logs=[];
    for(let i=0;i<size;i++){primes.push(r[pos++]);logs.push(Number(r[pos++]));const count=Number(r[pos++]);offsets.push(String(degrees.length));counts.push(String(count));for(let j=0;j<count;j++){degrees.push(r[pos++]);multiplicities.push(r[pos++]);}}
    const expected=[];for(let i=0;i<13;i++)expected.push([Number(r[pos++]),Number(r[pos++])]);assert.equal(pos,r.length);
    return {primes,offsets,counts,degrees,multiplicities,logs,expected};
  });
  const bounds=[2,3,4,5,8,16,31,32,64,101,300,1000,10000];
  for(const r of records)r.replayLogs=bounds.map(Math.log);
  const py=spawnSync("python3",["-c",`
import sys,json,math
sys.path[:0]=[${JSON.stringify(__dirname)},${JSON.stringify(path.resolve(__dirname,"../../src/lib"))}]
from residue import pari_prepared_log_inverse_residue
import residue
replays=[]
for r in json.load(sys.stdin):
    args=[list(map(int,r[k])) for k in ['primes','offsets','counts','degrees','multiplicities']]+[r['logs']]
    replay=[]
    for bi,(bound,(count,want)) in enumerate(zip(${JSON.stringify(bounds)},r['expected'])):
        residue.log=math.log
        out=[0.0];got=pari_prepared_log_inverse_residue(bound,*args,out)
        assert got==count
        assert math.isclose(out[0],want,rel_tol=1e-12,abs_tol=1e-14),(bound,out,want)
        residue.log=lambda value:r['replayLogs'][bi]
        out=[0.0];got=pari_prepared_log_inverse_residue(bound,*args,out)
        replay.append([got,out[0]])
    replays.append(replay)
print(json.dumps(replays))
`],{input:JSON.stringify(records),encoding:"utf8",timeout:30000});assert.equal(py.status,0,py.stderr);
  const built=await compileKernel({sourcePath:path.join(__dirname,"residue.py")}),mod=require(built.modulePath);
  const replays=JSON.parse(py.stdout),divergences=[];
  for(const r of records)for(const backend of ["javascript","gmp"]){
    const args=[...['primes','offsets','counts','degrees','multiplicities'].map(k=>r[k].map(BigInt)),r.logs];
    for(const [i,bound] of bounds.entries()){
      const out=[0],got=mod.pari_prepared_log_inverse_residue[backend](BigInt(bound),...args,out),[count,want]=backend==="javascript"?replays[records.indexOf(r)][i]:r.expected[i];
      assert.equal(got,BigInt(count),`${backend} bound=${bound} output=${out[0]} reference=${want}`);assert(Math.abs(out[0]-want)<=1e-14+1e-12*Math.abs(want),`${backend} bound=${bound}: ${out[0]} != ${want}`);
      if(backend==="javascript"&&count!==r.expected[i][0])divergences.push({field:records.indexOf(r),bound,pariCount:r.expected[i][0],javascriptCount:count});
    }
    assert.throws(()=>mod.pari_prepared_log_inverse_residue[backend](BigInt(r.primes.at(-1)),...args,[0]),/catalog exhausted/);
  }
  console.log("52 inverse-residue log accumulations and work counts match PARI/CPython/GMP; JavaScript matches a separately labeled CPython logarithm replay");
  console.log(JSON.stringify({javascriptWorkDivergences:divergences,finalPariRealExponential:"unported"}));
})().catch(error=>{console.error(error);process.exitCode=1;});

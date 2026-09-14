"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
  const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-factor-front-"));
  const source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
  fs.writeFileSync(source,`#include <pari.h>
#include <paripriv.h>
int main(void){pari_init(64000000,10000);char s[128];
printf("%lu %lu",GP_DATA->factorlimit,maxprimelim());for(long i=1;i<=pari_PRIMES[0];i++)printf(" %lu",pari_PRIMES[i]);printf("\\n");
GEN products=prodprimes();for(long i=1;i<lg(products);i++){char *t=GENtostr(gel(products,i));printf("%s%s",i==1?"":" ",t);pari_free(t);}printf("\\n");
while(scanf("%127s",s)==1){pari_sp av=avma;GEN n=gp_read_str(s),f=factoru(itou(n));
printf("%s",s);for(long i=1;i<lg(gel(f,1));i++)printf(" %lu %ld",uel(gel(f,1),i),gel(f,2)[i]);printf("\\n");avma=av;}
pari_close();return 0;}
`);
  const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-o",exe],{encoding:"utf8",timeout:30000});assert.equal(cc.status,0,cc.stderr);
  const inputs=[1n,2n,12n,3n**20n,2n**60n,101n*103n,101n**5n,251n*257n,617n*619n,1009n*1013n,1000003n*1000033n,18446744073709551557n];
  for (let n=3n;n<200n;n+=2n) inputs.push(n);
  for (const p of [127n,131n,251n,257n,659n,661n,673n,677n,1009n]) {
    inputs.push(p*p, p*p*p, 6n*p*p);
  }
  const run=spawnSync(exe,[],{input:inputs.join("\n")+"\n",encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});assert.equal(run.status,0,run.stderr);
  const lines=run.stdout.trim().split("\n").map(l=>l.split(" "));const [factorlimit,primeLimit,...primes]=lines[0],products=lines[1],rows=lines.slice(2);
  const data={factorlimit,primeLimit,primes,products,rows};
  const python=spawnSync("python3",["-c",`
import sys,json,decimal
sys.set_int_max_str_digits(100000)
sys.path.insert(0,${JSON.stringify(path.resolve(__dirname,"../../src/lib"))})
sys.path.insert(0,${JSON.stringify(__dirname)})
from factorization import pari_word_factor_front
d=json.load(sys.stdin); results=[]
for row in d['rows']:
  for fast in [0,1]:
    n=int(row[0]);p=[97]+[0]*16;e=[7]+[0]*16
    count,residual=pari_word_factor_front(n,list(map(int,d['primes'])),list(map(int,d['products'])),int(d['factorlimit']),int(d['primeLimit']),p,e,1,fast)
    assert p[0]==97 and e[0]==7
    oracle=dict(zip(map(int,row[1::2]),map(int,row[2::2])))
    product=residual
    for prime,exponent in zip(p[1:count],e[1:count]):
        assert oracle[prime]==exponent
        product*=prime**exponent
    assert product==n
    if residual==1: assert list(zip(p[1:count],e[1:count]))==list(oracle.items())
    results.append([str(count),str(residual),*[str(v) for pair in zip(p[:count],e[:count]) for v in pair]])
print(json.dumps(results))
`],{input:JSON.stringify(data),encoding:"utf8",timeout:30000});assert.equal(python.status,0,python.stderr);
  const expected=JSON.parse(python.stdout).map(r=>r.map(BigInt));
  const built=await compileKernel({sourcePath:path.join(__dirname,"factorization.py")}),mod=require(built.modulePath);
  for(let i=0;i<inputs.length;i++)for(const fast of [0n,1n])for(const backend of ["javascript","gmp","tagged"]){
    const p=[97n,...Array(16).fill(0n)],e=[7n,...Array(16).fill(0n)],out=mod.pari_word_factor_front[backend](inputs[i],primes.map(BigInt),products.map(BigInt),BigInt(factorlimit),BigInt(primeLimit),p,e,1n,fast);
    assert.deepEqual([...out,...p.slice(0,Number(out[0])).flatMap((v,j)=>[v,e[j]])],expected[2*i+Number(fast)]);
  }
  const complete=expected.filter(r=>r[1]===1n).length;assert(complete>0&&complete<expected.length);
  console.log(`${expected.length} word factor-front cases match CPython/JS/GMP/tagged: ${complete} complete PARI factorizations, ${expected.length-complete} explicit unresolved cofactors`);
})().catch(error=>{console.error(error);process.exitCode=1;});

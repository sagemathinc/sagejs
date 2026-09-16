"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const {spawnSync} = require("node:child_process");
const {compileKernel} = require("../../tools/native-kernel/compiler.cjs");
(async () => {
  const pari = path.resolve(process.argv[2]), lib = path.join(pari,"Olinux-x86_64");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-word-prime-"));
  const source = path.join(dir,"oracle.c"), exe = path.join(dir,"oracle");
  fs.writeFileSync(source,`#include <pari.h>
#include <paripriv.h>
int main(void){pari_init(64000000,10000);char s[128];
printf("%lu",maxprimelim());for(long i=1;i<=pari_PRIMES[0];i++)printf(" %lu",pari_PRIMES[i]);puts("");
while(scanf("%127s",s)==1){pari_sp av=avma;ulong n=itou(gp_read_str(s));
int nosmall=1;for(long i=1;i<=pari_PRIMES[0]&&pari_PRIMES[i]<=661;i++)if(n%pari_PRIMES[i]==0)nosmall=0;
printf("%s %d %d %d %d\\n",s,uisprime(n),nosmall,nosmall?uisprime_661(n):0,(n>=1009&&(n&1))?uislucaspsp(n):-1);avma=av;}
pari_close();return 0;}`);
  const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-o",exe],{encoding:"utf8",timeout:30000}); assert.equal(cc.status,0,cc.stderr);
  const inputs=[];
  for(let n=0n;n<200n;n++)inputs.push(n);
  for(const center of [341531n,452929n,1016801n,1050535501n,350269456337n,1n<<63n,(1n<<64n)-33n])
    for(let offset=-16n;offset<=16n;offset++)inputs.push(center+offset);
  for(const n of [2047n,1373653n,25326001n,3215031751n,2152302898747n,3474749660383n,341550071728321n,3825123056546413051n,18446744073709551557n,18446744073709551615n])inputs.push(n);
  for(const n of [1009n,1000003n,4294967291n])inputs.push(n*n);
  let state=0x3141592653589793n;
  for(let i=0;i<128;i++){
    state=(state*6364136223846793005n+1442695040888963407n)&((1n<<64n)-1n);
    inputs.push(state|1n);
  }
  const run=spawnSync(exe,[],{input:inputs.join("\n")+"\n",encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024}); assert.equal(run.status,0,run.stderr);
  const lines=run.stdout.trim().split("\n").map(l=>l.split(" "));
  const [limit,...primes]=lines[0], rows=lines.slice(1), cases=[], lucas=[];
  for(const [n,prime,nosmall,special,lucasResult] of rows){cases.push([n,"0",prime]);if(nosmall==="1")cases.push([n,"1",special]);if(lucasResult!=="-1")lucas.push([n,lucasResult]);}
  const py=spawnSync("python3",["-c",`
import sys,json
sys.path.insert(0,${JSON.stringify(path.resolve(__dirname,"../../src/lib"))})
sys.path.insert(0,${JSON.stringify(__dirname)})
from factorization import pari_word_prime,pari_word_lucas
d=json.load(sys.stdin)
for n,mode,result in d['cases']:
    assert pari_word_prime(int(n),list(map(int,d['primes'])),int(d['limit']),int(mode))==int(result),(n,mode)
for n,result in d['lucas']:
    assert pari_word_lucas(int(n))==int(result),(n,'lucas')
print(len(d['cases']))
`],{input:JSON.stringify({limit,primes,cases,lucas}),encoding:"utf8",timeout:30000});assert.equal(py.status,0,py.stderr);
  const built=await compileKernel({sourcePath:path.join(__dirname,"factorization.py")}),mod=require(built.modulePath);
  const table=primes.map(BigInt);
  for(const [n,mode,result] of cases)for(const backend of ["javascript","gmp","tagged"])
    assert.equal(mod.pari_word_prime[backend](BigInt(n),table,BigInt(limit),BigInt(mode)),BigInt(result),`${backend}: ${n}, ${mode}`);
  for(const [n,result] of lucas)for(const backend of ["javascript","gmp","tagged"])
    assert.equal(mod.pari_word_lucas[backend](BigInt(n)),BigInt(result),`${backend}: Lucas ${n}`);
  console.log(`${cases.length} word primality decisions and ${lucas.length} Lucas controls match PARI/CPython/JS/GMP/tagged`);
})().catch(error=>{console.error(error);process.exitCode=1;});

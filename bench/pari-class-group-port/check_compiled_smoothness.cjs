"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
  const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-smoothness-"));
  const source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
  fs.writeFileSync(source,`#include <pari.h>
int main(void) { char a[4096],b[4096]; pari_init(32000000,500000);
while(scanf("%4095s %4095s",a,b)==2) { pari_sp av=avma;
GEN x=gp_read_str(a),f=gp_read_str(b),z=Z_ppo(x,f); char *s=GENtostr(z);
printf("%s\\n",s);pari_free(s);avma=av; } pari_close();return 0; }
`);
  const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-o",exe],{encoding:"utf8",timeout:30000});
  assert.equal(cc.status,0,cc.stderr);
  const rows=[];
  for(const k of [0n,1n,2n,7n,64n,257n,1024n])for(const extra of [1n,17n,19n])for(const sign of [1n,-1n])
    for(const product of [1n,30n,2n*3n*5n*17n,2n**10n*3n**5n])rows.push([sign*2n**k*3n**(k/2n)*extra,product]);
  const input=rows.map(r=>r.join(" ")).join("\n")+"\n";
  const oracle=spawnSync(exe,[],{input,encoding:"utf8",timeout:30000});assert.equal(oracle.status,0,oracle.stderr);
  const expected=oracle.stdout.trim().split("\n").map(BigInt);assert.equal(expected.length,rows.length);
  const python=spawnSync("python3",["-c",`
import sys,json
sys.path.insert(0,${JSON.stringify(path.resolve(__dirname,"../../src/lib"))})
sys.path.insert(0,${JSON.stringify(__dirname)})
from short_product import pari_prime_to_part,pari_smoothness_precheck
for a,b,z in json.load(sys.stdin):
    a,b,z=int(a),int(b),int(z)
    assert pari_prime_to_part(a,b)==z
    assert pari_smoothness_precheck(a,b)==int(abs(z)==1)
print("CPython prime-to part matches PARI")
`],{input:JSON.stringify(rows.map((r,i)=>[...r,expected[i]].map(String))),encoding:"utf8",timeout:30000});
  assert.equal(python.status,0,python.stderr);console.log(python.stdout.trim());
  const built=await compileKernel({sourcePath:path.join(__dirname,"short_product.py")}),mod=require(built.modulePath);
  for(let i=0;i<rows.length;i++)for(const backend of ["javascript","gmp","tagged"]){
    assert.equal(mod.pari_prime_to_part[backend](...rows[i]),expected[i]);
    assert.equal(mod.pari_smoothness_precheck[backend](...rows[i]),expected[i]===1n||expected[i]===-1n?1n:0n);
  }
  console.log(`${rows.length} PARI prime-to parts and smoothness gates match in JS/GMP/tagged`);
})().catch(error=>{console.error(error);process.exitCode=1;});

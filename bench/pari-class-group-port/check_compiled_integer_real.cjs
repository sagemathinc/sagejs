"use strict";
const assert=require("node:assert/strict"),path=require("node:path");
const {spawnSync}=require("node:child_process");
const {compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
  const oracle=spawnSync("python3",[path.join(__dirname,"check_integer_real.py"),process.argv[2]],{encoding:"utf8",timeout:30000,maxBuffer:1024*1024});
  assert.equal(oracle.status,0,oracle.stderr);const rows=JSON.parse(oracle.stdout);
  const python=spawnSync("python3",["-c",`
import sys,json
sys.path.insert(0,${JSON.stringify(path.resolve(__dirname,"../../src/lib"))})
sys.path.insert(0,${JSON.stringify(__dirname)})
from short_product import pari_word_integer_real_product,pari_word_integer_real_sum
for row in json.load(sys.stdin):
    r=list(map(int,row))
    for j,f in enumerate((pari_word_integer_real_product,pari_word_integer_real_sum)):
        actual=f(*r[:4]); expected=tuple(r[4+3*j:7+3*j])
        assert actual==expected,(r,j,actual)
print("CPython integer/real arithmetic matches PARI")
`],{input:JSON.stringify(rows),encoding:"utf8",timeout:30000});
  assert.equal(python.status,0,python.stderr);console.log(python.stdout.trim());
  const b=await compileKernel({sourcePath:path.join(__dirname,"short_product.py")}),mod=require(b.modulePath);
  for(const row of rows)for(const [j,name] of ["pari_word_integer_real_product","pari_word_integer_real_sum"].entries()) {
    const r=row.map(BigInt);
    for(const f of [mod[name].javascript,mod[name].gmp,mod[name].tagged])assert.deepEqual(f(...r.slice(0,4)),r.slice(4+3*j,7+3*j));
  }
  console.log(`${rows.length*2} integer/real operations match PARI in generated JS, GMP and tagged`);
})().catch(error=>{console.error(error);process.exitCode=1;});

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
from short_product import pari_word_integer_real_product,pari_word_integer_real_sum,pari_real_word_division,pari_real_integer_division
for row in json.load(sys.stdin):
    r=list(map(int,row))
    if len(r)==7:
        actual=pari_real_integer_division(*r[:4]); expected=tuple(r[4:])
        assert actual==expected,(r,actual)
        continue
    functions=(pari_word_integer_real_product,pari_word_integer_real_sum)
    if len(r)==13: functions+= (pari_real_integer_division,)
    for j,f in enumerate(functions):
        actual=f(*r[:4]); expected=tuple(r[4+3*j:7+3*j])
        assert actual==expected,(r,j,actual)
print("CPython integer/real arithmetic matches PARI")
for divisor,error in ((0,ZeroDivisionError),(2**63,ValueError),(-2**63,ValueError),(2**100,ValueError)):
    try: pari_real_word_division(divisor,2**63,64,0)
    except error: pass
    else: raise AssertionError((divisor,error))
`],{input:JSON.stringify(rows),encoding:"utf8",timeout:30000});
  assert.equal(python.status,0,python.stderr);console.log(python.stdout.trim());
  const b=await compileKernel({sourcePath:path.join(__dirname,"short_product.py")}),mod=require(b.modulePath);
  let operations=0;
  for(const row of rows)for(const [j,name] of (row.length===7?["pari_real_integer_division"]:["pari_word_integer_real_product","pari_word_integer_real_sum",...(row.length===13?["pari_real_integer_division"]:[])]).entries()) {
    const r=row.map(BigInt);
    for(const f of [mod[name].javascript,mod[name].gmp,mod[name].tagged])assert.deepEqual(f(...r.slice(0,4)),r.slice(4+3*j,7+3*j));
    operations++;
  }
  console.log(`${operations} integer/real operations match PARI in generated JS, GMP and tagged`);
  for(const f of [mod.pari_real_word_division.javascript,mod.pari_real_word_division.gmp,mod.pari_real_word_division.tagged]) {
    assert.throws(()=>f(0n,1n<<63n,64n,0n),/zero ideal norm divisor/);
    for(const divisor of [1n<<63n,-(1n<<63n),1n<<100n])assert.throws(()=>f(divisor,1n<<63n,64n,0n),/big ideal norm divisor/);
  }
})().catch(error=>{console.error(error);process.exitCode=1;});

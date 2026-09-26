"use strict";
const assert=require("node:assert/strict"),path=require("node:path");
const {spawnSync}=require("node:child_process");
const {compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
  const oracle=spawnSync("python3",[path.join(__dirname,"check_matrix_rows.py"),process.argv[2],"--gate-json"],{encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});
  assert.equal(oracle.status,0,oracle.stderr);const rows=JSON.parse(oracle.stdout);
  const python=spawnSync("python3",["-c",`
import sys,json
sys.path.insert(0,${JSON.stringify(path.resolve(__dirname,"../../src/lib"))})
sys.path.insert(0,${JSON.stringify(__dirname)})
from short_product import pari_prepared_factorgen_numerical
for row in json.load(sys.stdin):
    r=list(map(int,row)); n,real=r[:2]; end=2+3*n*n; entries=r[2:end]
    coefficients=r[end:end+n]; m=[0]*n; p=[0]*n; e=[0]*n
    result=pari_prepared_factorgen_numerical(entries[0::3],entries[1::3],entries[2::3],coefficients,m,p,e,n,real,r[-4])
    assert result==tuple(r[-3:]),(r,result)
    assert [v for triple in zip(m,p,e) for v in triple]==r[end+n:-7]
print("CPython connected factorgen numerical gate matches PARI")
`],{input:JSON.stringify(rows),encoding:"utf8",timeout:30000});
  assert.equal(python.status,0,python.stderr);console.log(python.stdout.trim());
  const b=await compileKernel({sourcePath:path.join(__dirname,"short_product.py")}),mod=require(b.modulePath);
  let passed=0;
  for(const row of rows){
    const r=row.map(BigInt),n=Number(r[0]),end=2+3*n*n,entries=r.slice(2,end);
    passed+=Number(r.at(-1));
    for(const f of [mod.pari_prepared_factorgen_numerical.javascript,mod.pari_prepared_factorgen_numerical.gmp,mod.pari_prepared_factorgen_numerical.tagged]){
      const args=[0,1,2].map(offset=>entries.filter((_,i)=>i%3===offset));
      const out=[Array(n).fill(0n),Array(n).fill(0n),Array(n).fill(0n)];
      args.push(r.slice(end,end+n),...out,r[0],r[1],r.at(-4));
      assert.deepEqual(f(...args),r.slice(-3));
      assert.deepEqual(Array.from({length:n},(_,i)=>out.map(a=>a[i])).flat(),r.slice(end+n,-7));
    }
  }
  assert(passed>0 && passed<rows.length);
  console.log(`${rows.length} connected gates match in JS/GMP/tagged: ${passed} proceed, ${rows.length-passed} reject; not relation acceptance`);
})().catch(error=>{console.error(error);process.exitCode=1;});

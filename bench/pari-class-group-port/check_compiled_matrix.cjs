"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const {compileKernel} = require("../../tools/native-kernel/compiler.cjs");
(async () => {
  const matrix=process.argv.includes("--matrix-norm");
  const oracle = spawnSync("python3", [path.join(__dirname,"check_matrix_rows.py"),process.argv[2], ...(matrix ? ["--matrix-json"] : [])],
    {encoding:"utf8",timeout:30000,maxBuffer:1024*1024});
  assert.equal(oracle.status,0,oracle.stderr);
  const rows=JSON.parse(oracle.stdout);
  if(matrix) {
    const python=spawnSync("python3",["-c",`
import sys,json
sys.path.insert(0,${JSON.stringify(path.resolve(__dirname,"../../src/lib"))})
sys.path.insert(0,${JSON.stringify(__dirname)})
from short_product import pari_prepared_matrix_norm
for row in json.load(sys.stdin):
    r=list(map(int,row)); n,real=r[:2]; end=2+3*n*n; entries=r[2:end]
    coefficients=r[end:end+n]; expected=r[end+n:-3]
    m=[0]*n; p=[0]*n; e=[0]*n
    actual=pari_prepared_matrix_norm(entries[0::3],entries[1::3],entries[2::3],coefficients,m,p,e,n,real)
    assert actual==tuple(r[-3:]),(r,actual)
    assert [v for triple in zip(m,p,e) for v in triple]==expected
print("CPython matrix-to-norm path matches PARI")
`],{input:JSON.stringify(rows),encoding:"utf8",timeout:30000});
    assert.equal(python.status,0,python.stderr);console.log(python.stdout.trim());
    const b=await compileKernel({sourcePath:path.join(__dirname,"short_product.py")}),mod=require(b.modulePath);
    for(const row of rows) {
      const r=row.map(BigInt),n=Number(r[0]),end=2+3*n*n,entries=r.slice(2,end),coefficients=r.slice(end,end+n);
      for(const f of [mod.pari_prepared_matrix_norm.javascript,mod.pari_prepared_matrix_norm.gmp,mod.pari_prepared_matrix_norm.tagged]) {
        const args=[0,1,2].map(offset=>entries.filter((_,i)=>i%3===offset));
        const outputs=[Array(n).fill(0n),Array(n).fill(0n),Array(n).fill(0n)];
        args.push(coefficients,...outputs,r[0],r[1]);
        assert.deepEqual(f(...args),r.slice(-3));
        assert.deepEqual(Array.from({length:n},(_,i)=>outputs.map(a=>a[i])).flat(),r.slice(end+n,-3));
      }
    }
    console.log(`${rows.length} matrix-to-norm paths match PARI in generated JS, forced GMP and tagged`);
    return;
  }
  const python=spawnSync("python3",["-c",`
import sys,json
sys.path.insert(0,${JSON.stringify(path.resolve(__dirname,"../../src/lib"))})
sys.path.insert(0,${JSON.stringify(__dirname)})
from short_product import pari_prepared_embedding_row
for row in json.load(sys.stdin):
    r=list(map(int,row)); n=r[0]; entries=r[1:1+3*n]; coefficients=r[1+3*n:1+4*n]
    actual=pari_prepared_embedding_row(entries[0::3],entries[1::3],entries[2::3],coefficients,0,n)
    assert actual==tuple(r[1+4*n:]),(r,actual)
print("CPython embedding rows match PARI")
`],{input:JSON.stringify(rows),encoding:"utf8",timeout:30000});
  assert.equal(python.status,0,python.stderr);console.log(python.stdout.trim());
  const b=await compileKernel({sourcePath:path.join(__dirname,"short_product.py")}),mod=require(b.modulePath);
  for(const row of rows){
    const r=row.map(BigInt),n=Number(r[0]),entries=r.slice(1,1+3*n),coefficients=r.slice(1+3*n,1+4*n);
    const args=[0,1,2].map(offset=>entries.filter((_,i)=>i%3===offset));
    args.push(coefficients,0n,BigInt(n));
    for(const f of [mod.pari_prepared_embedding_row.javascript,mod.pari_prepared_embedding_row.gmp,mod.pari_prepared_embedding_row.tagged])
      assert.deepEqual(f(...args),r.slice(1+4*n));
  }
  console.log(`${rows.length} embedding rows match PARI in generated JS, forced GMP and tagged`);
})().catch(error=>{console.error(error);process.exitCode=1;});

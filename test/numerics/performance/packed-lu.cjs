// sagejs-test-tier: native
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { compileKernel } = require("../../../tools/native-kernel/compiler.cjs");
const { pythonPrefix } = require("../../../bench/numerics/performance/run.cjs");
const { removeLoadedNativeCache } = require("../../helpers/native-cache-cleanup.cjs");
const { buildWasmProductionPacks } = require("../../../tools/native-kernel/wasm-production-pack.cjs");
const { inspectToolchain, wasmKernelToolchain } = require("../../../packages/wasm-toolchain/scripts/toolchain.cjs");
const root = path.resolve(__dirname, "../../..");
const logical = "sagejs/numerics/linear_algebra/_packed_lu.py";
async function browserLU({loader,manifest,assets,cases,logical}) {
  const {instantiateWasmKernelPacks}=await import(loader);
  const resolver=await instantiateWasmKernelPacks({manifest,load:pack=>Uint8Array.from(assets[pack.asset]),host(_pack,module){
    const imports={};for(const item of WebAssembly.Module.imports(module)) {
      if(item.module!=="wasi_snapshot_preview1") throw Error("unexpected import");
      imports[item.module]??={};imports[item.module][item.name]=()=>{throw Error("host callback");};
    }return imports;
  }});
  const run=resolver.resolve(logical,"factor_partial_pivot");
  return cases.map(entry=>{
    const w=new Float64Array(entry.values.length),p=new Float64Array(entry.rows),o=new Float64Array(1);
    if(run(Float64Array.from(entry.values),w,p,o,BigInt(entry.rows),BigInt(entry.columns))!==0) throw Error("factorization failed");
    return [Array.from(w),Array.from(p),Array.from(o)];
  });
}
const cases = [];
for (const [rows, columns] of [[1,1],[2,2],[3,3],[5,3],[3,5],[8,8],[32,32]]) {
  for (let seed = 1; seed <= 5; seed++) {
    let state = seed;
    const values = Array.from({length:rows*columns}, () => {
      state = (Math.imul(state,1664525)+1013904223) >>> 0;
      return (state % 41)-20;
    });
    cases.push({rows,columns,values});
  }
}
cases.push({rows:3,columns:3,values:[0,1,2,0,2,4,0,3,6]});
cases.push({rows:2,columns:2,values:[0,0,0,0]});
cases.push({rows:2,columns:2,values:[1e-300,1,1,1]});
for(const [rows,columns] of [[128,128],[128,1],[1,128]]) {
  cases.push({rows,columns,values:Array.from({length:rows*columns},(_,i)=>Math.floor(i/columns)===i%columns?129:(i*7)%11-5)});
}

test("bounded packed LU matches ordinary factorization and independent reconstruction", async () => {
  const program = pythonPrefix(root) + `
import json, math, sys
from sagejs.numerics.linear_algebra._packed_lu import factor_partial_pivot
from sagejs.numerics.linear_algebra.factorizations import lu_factorize
from sagejs.numerics.linear_algebra.storage import DenseMatrix
answers=[]
for case in json.load(sys.stdin):
    r,c,a=case['rows'],case['columns'],case['values']
    w,p,o=[0.0]*len(a),[0.0]*r,[0.0]
    assert factor_partial_pivot(a,w,p,o,r,c)==0.0
    reference=lu_factorize(DenseMatrix(r,c,a))
    assert w==list(reference._packed.entries)
    assert p==list(reference._row_permutation) and o[0]==reference.swaps
    for i in range(r):
        for j in range(c):
            terms=[]
            for k in range(min(r,c)):
                left=1.0 if i==k else (w[i*c+k] if i>k else 0.0)
                right=w[k*c+j] if k<=j else 0.0
                terms.append(left*right)
            residual=abs(math.fsum(terms)-a[int(p[i])*c+j])
            assert residual<=1e-12*max(1.0,math.fsum(abs(x) for x in terms))
    answers.append([w,p,o])
print(json.dumps(answers))
`;
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const oracle = spawnSync(python,["-I","-c",program],{input:JSON.stringify(cases),encoding:"utf8",timeout:120000});
  if(oracle.error) throw oracle.error;
  assert.equal(oracle.status,0,oracle.stderr || oracle.stdout || "oracle failed");
  const expected = JSON.parse(oracle.stdout);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-packed-lu-"));
  try {
    const compiled = await compileKernel({sourcePath:path.join(root,"src/lib",logical),cacheRoot:directory,functions:["factor_partial_pivot"]});
    const fn = require(compiled.modulePath).factor_partial_pivot;
    assert.equal(fn.nativeAvailable,true);
    const implementations = [fn,fn.javascript];
    if(inspectToolchain({root}).ready) {
      const manifestPath=path.join(directory,"sources.json");
      fs.writeFileSync(manifestPath,JSON.stringify({kernels:[{id:"packed-lu-production",source:"src/lib/"+logical,functions:["factor_partial_pivot"],fallback:"same-source",oracles:["CPython","reconstruction"]}]}));
      const toolchain=wasmKernelToolchain({root});
      for(const key of ["gmpPrefix","flintPrefix","mpfrPrefix","mpcPrefix"]) toolchain[key]=path.join(directory,"absent",key);
      const manifest=await buildWasmProductionPacks({root,manifestPath,outputRoot:directory,toolchain,isolateFloat64:true});
      const {instantiateWasmKernelPacks}=await import(pathToFileURL(path.join(root,"tools/native-kernel/wasm-pack-loader.mjs")));
      const resolver=await instantiateWasmKernelPacks({manifest,load:pack=>fs.readFileSync(path.join(directory,pack.asset)),host(_pack,module){
        const imports={};for(const item of WebAssembly.Module.imports(module)) {
          assert.equal(item.module,"wasi_snapshot_preview1");imports[item.module]??={};
          imports[item.module][item.name]=()=>{throw Error("host callback");};
        }return imports;
      }});
      implementations.push(resolver.resolve(logical,"factor_partial_pivot"));
      if(process.env.SAGEJS_NUMERICAL_BROWSER_TESTS==="1") {
        const {runBrowserCases}=require("../../helpers/float64-wasm.cjs");
        const payload={manifest,logical,cases,
          loader:"data:text/javascript;base64,"+fs.readFileSync(path.join(root,"tools/native-kernel/wasm-pack-loader.mjs")).toString("base64"),
          assets:Object.fromEntries(manifest.packs.map(pack=>[pack.asset,Array.from(fs.readFileSync(path.join(directory,pack.asset)))])),
        };
        const server=require("node:http").createServer((_request,response)=>response.end("<!doctype html><title>LU witness</title>"));
        await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
        try {
          for(const engine of ["chromium","firefox","webkit"]) assert.deepEqual(await runBrowserCases(engine,browserLU,payload,{pageUrl:`http://127.0.0.1:${server.address().port}`}),expected,engine);
        } finally {await new Promise(resolve=>server.close(resolve));}
      }
    }
    for(const run of implementations) {
      for(const [index,entry] of cases.entries()) {
        const input=Float64Array.from(entry.values),working=new Float64Array(input.length),permutation=new Float64Array(entry.rows),output=new Float64Array(1);
        assert.equal(run(input,working,permutation,output,BigInt(entry.rows),BigInt(entry.columns)),0);
        assert.deepEqual([Array.from(working),Array.from(permutation),Array.from(output)],expected[index]);
        assert.deepEqual(Array.from(input),entry.values);
      }
      const call=(values,r,c)=>run(Float64Array.from(values),new Float64Array(values.length),new Float64Array(Math.min(r,128)),new Float64Array(1),BigInt(r),BigInt(c));
      assert.equal(call([],0,0),1);
      assert.equal(call([],129,1),1);
      assert.equal(call([1],2,2),1);
      assert.equal(call([Infinity],1,1),2);
      assert.equal(call([NaN],1,1),2);
      assert.equal(call([1e308,1e308,-1e308,1e308],2,2),2);
    }
  } finally {removeLoadedNativeCache(directory);}
});

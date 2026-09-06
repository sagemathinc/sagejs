// sagejs-test-tier: native
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../../tools/native-kernel/compiler.cjs");
const { generateHostCore } = require("../../../tools/native-kernel/c-backend.cjs");
const { pythonPrefix } = require("../../../bench/numerics/performance/run.cjs");
const { removeLoadedNativeCache } = require("../../helpers/native-cache-cleanup.cjs");
const { buildWasmProductionPacks } = require("../../../tools/native-kernel/wasm-production-pack.cjs");
const { inspectToolchain, wasmKernelToolchain } = require("../../../packages/wasm-toolchain/scripts/toolchain.cjs");
const root = path.resolve(__dirname, "../../..");
const sourcePath = path.join(root, "src/lib/sagejs/numerics/linear_algebra/_packed_validation.py");
async function browserProducts({loader,manifest,assets,logical,cases}) {
  const {instantiateWasmKernelPacks}=await import(loader);
  const resolver=await instantiateWasmKernelPacks({manifest,load:pack=>Uint8Array.from(assets[pack.asset]),host(_pack,module){
    const imports={};for(const item of WebAssembly.Module.imports(module)) {
      if(item.module!=="wasi_snapshot_preview1") throw Error("unexpected import");
      imports[item.module]??={};imports[item.module][item.name]=()=>{throw Error("host callback");};
    }return imports;
  }});
  const run=resolver.resolve(logical,"reconstruction_row");
  return cases.map(({rows,inner,columns,left,right})=>{
    const result=[];
    for(let row=0;row<rows;row++) {
      const output=new Float64Array(columns);
      if(run(Float64Array.from(left),Float64Array.from(right),new Float64Array(inner),new Float64Array(inner),new Float64Array(1),output,BigInt(row),BigInt(rows),BigInt(inner),BigInt(columns))!==0) throw Error("reconstruction failed");
      result.push(Array.from(output));
    }
    return result;
  });
}
const cases = [];
let state = 12345;
function sample() {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return ((state % 2001) - 1000) * 2 ** ((state % 81) - 40);
}
for (const [rows, inner, columns] of [[1,0,3], [1,1,1], [2,3,5], [5,3,2], [8,8,8], [32,32,32], [1,128,128]]) {
  for (let repeat = 0; repeat < 3; repeat++) cases.push({rows, inner, columns,
    left: Array.from({length: rows * inner}, sample), right: Array.from({length: inner * columns}, sample)});
}
for (const terms of [[1e16,1,-1e16], [1e-16,1,1e16], [Number.MIN_VALUE,Number.MIN_VALUE,-Number.MIN_VALUE], [0,-0,0]]) {
  cases.push({rows:1,inner:terms.length,columns:1,left:terms,right:terms.map(()=>1)});
}
// Separate multiplication rounding, not a fused dot-product oracle.
cases.push({rows:1,inner:2,columns:1,left:[1+2**-27,-1],right:[1-2**-27,1]});

test("reconstruction rows retain rounded products and independent fsum semantics", async () => {
  const program = pythonPrefix(root) + `
import json, math, sys
from sagejs.numerics.linear_algebra._packed_validation import reconstruction_row
answers=[]
for case in json.load(sys.stdin):
    r,k,c=case['rows'],case['inner'],case['columns']
    left,right=list(map(float,case['left'])),list(map(float,case['right']))
    result=[]
    for row in range(r):
        output=[99.0]*(c+1)
        assert reconstruction_row(left,right,[0.0]*k,[0.0]*k,[0.0],output,row,r,k,c)==0.0
        expected=[math.fsum([left[row*k+i]*right[i*c+j] for i in range(k)]) for j in range(c)]
        assert output[:c]==expected and output[c]==99.0
        result.append(expected)
    answers.append(result)
assert reconstruction_row([],[],[],[],[0.0],[],0,1,-1,0)==1.0
assert reconstruction_row([],[],[],[],[0.0],[],-1,1,0,0)==1.0
print(json.dumps(answers))
`;
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const oracle = spawnSync(python, ["-I", "-c", program], {input:JSON.stringify(cases),encoding:"utf8",timeout:120000});
  assert.equal(oracle.status,0,oracle.stderr);
  const expected = JSON.parse(oracle.stdout);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-validation-rows-"));
  try {
    const compiled = await compileKernel({sourcePath,cacheRoot:directory,functions:["reconstruction_row"]});
    const audit=generateHostCore(compiled.ir).audit;
    assert.equal(audit.hostCallbacks,0);
    assert.deepEqual(audit.nativeDependencies,["libc","libm"]);
    assert.deepEqual(audit.functions,["reconstruction_row","finite_sum"]);
    const fn = require(compiled.modulePath).reconstruction_row;
    assert.equal(fn.nativeAvailable,true);
    const implementations = [fn,fn.javascript];
    if (inspectToolchain({root}).ready) {
      const manifestPath=path.join(directory,"sources.json");
      const logical="sagejs/numerics/linear_algebra/_packed_validation.py";
      fs.writeFileSync(manifestPath,JSON.stringify({kernels:[{id:"reconstruction-row-production",source:"src/lib/"+logical,functions:["reconstruction_row"],fallback:"same-source",oracles:["CPython math.fsum"]}]}));
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
      implementations.push(resolver.resolve(logical,"reconstruction_row"));
      if(process.env.SAGEJS_NUMERICAL_BROWSER_TESTS==="1") {
        const {runBrowserCases}=require("../../helpers/float64-wasm.cjs");
        const payload={manifest,logical,cases,
          loader:"data:text/javascript;base64,"+fs.readFileSync(path.join(root,"tools/native-kernel/wasm-pack-loader.mjs")).toString("base64"),
          assets:Object.fromEntries(manifest.packs.map(pack=>[pack.asset,Array.from(fs.readFileSync(path.join(directory,pack.asset)))])),
        };
        const server=require("node:http").createServer((_request,response)=>response.end("<!doctype html><title>Reconstruction witness</title>"));
        await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
        try {
          for(const engine of ["chromium","firefox","webkit"]) assert.deepEqual(await runBrowserCases(engine,browserProducts,payload,{pageUrl:`http://127.0.0.1:${server.address().port}`}),expected,engine);
        } finally {await new Promise(resolve=>server.close(resolve));}
      }
    }
    for (const run of implementations) {
      for (const [n,entry] of cases.entries()) {
        const {rows,inner,columns}=entry;
        const left=Float64Array.from(entry.left),right=Float64Array.from(entry.right);
        for(let row=0;row<rows;row++) {
          const output=new Float64Array(columns+1).fill(99);
          assert.equal(run(left,right,new Float64Array(inner),new Float64Array(inner),new Float64Array(1),output,BigInt(row),BigInt(rows),BigInt(inner),BigInt(columns)),0);
          assert.deepEqual(Array.from(output),[...expected[n][row],99]);
        }
        assert.deepEqual(Array.from(left),entry.left);
        assert.deepEqual(Array.from(right),entry.right);
      }
      const invoke=(left,right,inner=1,columns=1,rows=1,row=0)=>run(Float64Array.from(left),Float64Array.from(right),new Float64Array(128),new Float64Array(128),new Float64Array(1),new Float64Array(128),BigInt(row),BigInt(rows),BigInt(inner),BigInt(columns));
      assert.equal(invoke([Infinity],[0]),2);
      assert.equal(invoke([NaN],[1]),2);
      assert.equal(invoke([1e308],[2]),2);
      assert.equal(invoke([1e308,1e308,-1e308],[1,1,1],3),2);
      assert.equal(invoke([],[],129),1);
      assert.equal(invoke([],[],0,129),1);
      assert.equal(invoke([],[],0,0,129),1);
      assert.equal(invoke([],[],0,0,1,1),1);
      assert.equal(invoke([],[],1),1);
    }
  } finally {removeLoadedNativeCache(directory);}
});

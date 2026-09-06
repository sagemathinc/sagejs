// sagejs-test-tier: native
"use strict";
const test=require("node:test"), assert=require("node:assert/strict");
const fs=require("node:fs"), path=require("node:path"), os=require("node:os");
const {spawnSync}=require("node:child_process");
const {compileKernel}=require("../../../tools/native-kernel/compiler.cjs");
const {pythonPrefix}=require("../../../bench/numerics/performance/run.cjs");
const {removeLoadedNativeCache}=require("../../helpers/native-cache-cleanup.cjs");
const {inspectToolchain,wasmKernelToolchain}=require("../../../packages/wasm-toolchain/scripts/toolchain.cjs");
const {buildWasmProductionPacks}=require("../../../tools/native-kernel/wasm-production-pack.cjs");
const {runBrowserCases}=require("../../helpers/float64-wasm.cjs");
const root=path.resolve(__dirname,"../../..");
const logical="sagejs/numerics/linear_algebra/_packed_validation.py";

async function wasmNorms({loader,manifest,assets,cases,logical}) {
  const {instantiateWasmKernelPacks}=await import(loader);
  const resolver=await instantiateWasmKernelPacks({manifest,load:pack=>Uint8Array.from(assets[pack.asset]),host(_pack,module){
    const imports={};
    for(const item of WebAssembly.Module.imports(module)) {
      if(item.module!=="wasi_snapshot_preview1")throw Error("unexpected import");
      imports[item.module]??={};imports[item.module][item.name]=()=>{throw Error("host callback");};
    }
    return imports;
  }});
  const run=resolver.resolve(logical,"lu_residual_norms");
  return cases.map(entry=>{
    const n=entry.size,output=new Float64Array(2);
    const status=run(Float64Array.from(entry.source),Float64Array.from(entry.factors),Float64Array.from(entry.permutation),
      new Float64Array(n),new Float64Array(n),new Float64Array(n),new Float64Array(n),new Float64Array(1),output,BigInt(n));
    if(status!==0)throw Error("residual norms rejected");
    return Array.from(output);
  });
}

test("fused LU residual norms match independent accurate reconstruction",async(t)=>{
  const program=pythonPrefix(root)+`
import json, math
from sagejs.numerics.linear_algebra.storage import DenseMatrix
from sagejs.numerics.linear_algebra.factorizations import lu_factorize
from sagejs.numerics.linear_algebra._packed_validation import lu_residual_norms
cases=[]
for n in (1,2,3,8,16,32,128):
    for perturb in (False,True):
        a=[float(n if i//n==i%n else (i*17+3)%13-6) for i in range(n*n)]
        factor=lu_factorize(DenseMatrix(n,n,a))
        f=list(factor._packed.entries)
        p=[float(i) for i in factor._row_permutation]
        if perturb: f[0]+=0.125
        error=0.0
        norm=0.0
        for row in range(n):
            w=p.index(float(row))
            differences=[]
            for column in range(n):
                terms=[]
                for k in range(n):
                    left=1.0 if k==w else (f[w*n+k] if k<w else 0.0)
                    right=f[k*n+column] if k<=column else 0.0
                    terms.append(left*right)
                differences.append(abs(a[row*n+column]-math.fsum(terms)))
            error=max(error,math.fsum(differences))
            norm=max(norm,math.fsum(abs(a[row*n+c]) for c in range(n)))
        out=[-3.0,-4.0]
        assert lu_residual_norms(a,f,p,[0.0]*n,[0.0]*n,[0.0]*n,[0.0]*n,[0.0],out,n)==0
        assert out==[error,norm]
        cases.append(dict(size=n,source=a,factors=f,permutation=p,expected=out))
epsilon=2.0**-27
for n,a,f,p,expected in (
    (3,[1.,0.,1.,0.,1.,1.,1e16,1.,0.],
       [1.,0.,1.,0.,1.,1.,1e16,1.,-1e16],[0.,1.,2.],[1.,1e16]),
    (2,[1.,1.-epsilon,1.+epsilon,0.],
       [1.,1.-epsilon,1.+epsilon,-1.],[0.,1.],[0.,2.-epsilon]),
    (1,[5e-324],[5e-324],[0.],[0.,5e-324]),
    (1,[-0.],[-0.],[0.],[0.,0.]),
):
    out=[-3.,-4.]
    assert lu_residual_norms(a,f,p,[0.]*n,[0.]*n,[0.]*n,[0.]*n,[0.],out,n)==0
    assert out==expected
    assert all(math.copysign(1.,value)==1. for value in out)
    cases.append(dict(size=n,source=a,factors=f,permutation=p,expected=expected))
print(json.dumps(cases))
`;
  const oracle=spawnSync(process.env.PYTHON||(process.platform==="win32"?"python":"python3"),["-I","-c",program],{encoding:"utf8",timeout:180000,maxBuffer:8*1024*1024});
  if(oracle.error)throw oracle.error;
  assert.equal(oracle.status,0,oracle.stderr||oracle.stdout);
  const cases=JSON.parse(oracle.stdout);
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-lu-validation-"));
  try {
    const compiled=await compileKernel({sourcePath:path.join(root,"src/lib",logical),cacheRoot:directory,functions:["lu_residual_norms"]});
    const fn=require(compiled.modulePath).lu_residual_norms;
    assert.equal(fn.nativeAvailable,true);
    for(const run of [fn,fn.javascript]) {
      function invoke(entry,change){
        const n=entry.size;
        const args=[Float64Array.from(entry.source),Float64Array.from(entry.factors),Float64Array.from(entry.permutation),
          new Float64Array(n),new Float64Array(n),new Float64Array(n),new Float64Array(n),new Float64Array(1),Float64Array.from([-3,-4]),BigInt(n)];
        if(change)change(args);
        const inputs=args.slice(0,3).map(x=>Array.from(x));
        const status=run(...args);
        assert.deepEqual(args.slice(0,3).map(x=>Array.from(x)),inputs,"read-only inputs changed");
        return {status,output:Array.from(args[8])};
      }
      for(const entry of cases)assert.deepEqual(invoke(entry),{status:0,output:entry.expected});
      const entry=cases.find(x=>x.size===3);
      for(const change of [
        args=>args[2].fill(0), args=>{args[2][0]=0.5;}, args=>{args[2][0]=NaN;},
        args=>{args[9]=0n;},args=>{args[9]=129n;},
        ...Array.from({length:9},(_,i)=>args=>{args[i]=new Float64Array(i===8?1:0);}),
      ]) {
        const result=invoke(entry,change);
        assert.equal(result.status,1);
        assert.deepEqual(result.output,result.output.length===1?[0]:[-3,-4]);
      }
      for(const change of [args=>{args[0][0]=Infinity;},args=>{args[1][0]=NaN;},
        args=>args[0].fill(1e308)]) {
        assert.deepEqual(invoke(entry,change),{status:2,output:[-3,-4]});
      }
    }
    if(inspectToolchain({root}).ready) {
      const manifestPath=path.join(directory,"sources.json");
      fs.writeFileSync(manifestPath,JSON.stringify({kernels:[{id:"lu-validation-production",source:"src/lib/"+logical,functions:["lu_residual_norms"],fallback:"same-source",oracles:["CPython math.fsum"]}]}));
      const toolchain=wasmKernelToolchain({root});
      for(const name of ["gmpPrefix","flintPrefix","mpfrPrefix","mpcPrefix"])toolchain[name]=path.join(directory,"absent",name);
      const manifest=await buildWasmProductionPacks({root,manifestPath,outputRoot:directory,toolchain,isolateFloat64:true});
      const payload={manifest,cases,logical,
        loader:"data:text/javascript;base64,"+fs.readFileSync(path.join(root,"tools/native-kernel/wasm-pack-loader.mjs")).toString("base64"),
        assets:Object.fromEntries(manifest.packs.map(pack=>[pack.asset,Array.from(fs.readFileSync(path.join(directory,pack.asset)))]))};
      const expected=cases.map(entry=>entry.expected);
      assert.deepEqual(await wasmNorms(payload),expected);
      if(process.env.SAGEJS_NUMERICAL_BROWSER_TESTS==="1") {
        const server=require("node:http").createServer((_request,response)=>response.end("<!doctype html><title>LU validation witness</title>"));
        await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
        try {
          for(const engine of ["chromium","firefox","webkit"])
            assert.deepEqual(await runBrowserCases(engine,wasmNorms,payload,{pageUrl:`http://127.0.0.1:${server.address().port}`}),expected,engine);
        } finally {await new Promise(resolve=>server.close(resolve));}
      }
    } else t.diagnostic("WASI unavailable: native/source checks only, no Wasm qualification");
  } finally {removeLoadedNativeCache(directory);}
});

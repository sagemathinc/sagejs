"use strict";
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const assert=require("node:assert/strict");
const {createHash}=require("node:crypto");
const {performance}=require("node:perf_hooks");
const {compileKernel}=require("../../../tools/native-kernel/compiler.cjs");
const {removeLoadedNativeCache}=require("../../../test/helpers/native-cache-cleanup.cjs");
const root=path.resolve(__dirname,"../../..");
const output=process.argv[2];
if(!output||process.argv.length!==3||fs.existsSync(output))throw Error("usage: lu-validation-core.cjs NEW_RECEIPT.json");
const hash=value=>createHash("sha256").update(value).digest("hex");
const sources=["src/lib/sagejs/numerics/linear_algebra/_packed_validation.py","src/lib/sagejs/numerics/_packed_sum.py"];
const snapshot=()=>Object.fromEntries(sources.map(name=>[name,hash(fs.readFileSync(path.join(root,name)))]));
(async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-lu-norm-timing-"));
  try {
    const before=snapshot();
    const compiled=await compileKernel({sourcePath:path.join(root,sources[0]),cacheRoot:directory,functions:["lu_residual_norms"]});
    const fn=require(compiled.modulePath).lu_residual_norms;
    assert.equal(fn.nativeAvailable,true);
    const records=[];
    for(const size of [16,32,64,128]) {
      // Deliberately inconsistent factors require computing a nonzero residual.
      // This is validation arithmetic, not a timing of factorization or solving.
      const source=Float64Array.from({length:size*size},(_,i)=>i%size===Math.floor(i/size)?size:((i*17)%41-20)/7);
      const factors=Float64Array.from({length:size*size},(_,i)=>((i*13)%37-18)/11);
      const permutation=Float64Array.from({length:size},(_,i)=>size-i-1);
      const args=[source,factors,permutation,...Array.from({length:4},()=>new Float64Array(size)),new Float64Array(1),new Float64Array(2),BigInt(size)];
      function run(implementation){assert.equal(implementation(...args),0);return Array.from(args[8]);}
      const expected=run(fn.javascript);
      assert.ok(expected[0]>0&&expected[1]>0);
      assert.deepEqual(run(fn),expected);
      for(let i=0;i<3;i++){run(fn);run(fn.javascript);}
      const samples={native:[],javascript:[]};
      for(let block=0;block<7;block++)for(const name of block%2?["javascript","native"]:["native","javascript"]){
        const start=performance.now();const answer=run(name==="native"?fn:fn.javascript);
        samples[name].push(performance.now()-start);assert.deepEqual(answer,expected);
      }
      records.push({size,samples_ms:samples,norms:expected});
    }
    assert.deepEqual(snapshot(),before);
    const report={schema:"sagejs.lu-validation-core-development/v1",qualification:false,
      host:{platform:process.platform,arch:process.arch,node:process.version,cpu:os.cpus()[0]?.model},
      sources:before,benchmark_sha256:hash(fs.readFileSync(__filename)),
      artifact:{cache_key:compiled.cacheKey,native_abi:compiled.nativeAbi,core_sha256:hash(fs.readFileSync(compiled.coreSourcePath)),addon_sha256:hash(fs.readFileSync(compiled.addonPath))},
      policy:{warmups:3,blocks:7,order:"alternating",storage:"reused disjoint Float64Array buffers; normal wrapper marshalling included",
        included:["permutation proof","reconstruction residual norm","input infinity norm"],
        excluded:["packing/allocation","public factorization","public validation contract","result construction","callback checks","startup","memory qualification","four-platform and browser timing"]},records};
    fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
    console.log(JSON.stringify(records.map(row=>({size:row.size,median_ms:Object.fromEntries(Object.entries(row.samples_ms).map(([name,values])=>[name,[...values].sort((a,b)=>a-b)[3]]))})),null,2));
  } finally {removeLoadedNativeCache(directory);}
})().catch(error=>{console.error(error);process.exitCode=1;});

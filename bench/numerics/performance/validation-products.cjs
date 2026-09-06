"use strict";
const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");
const {createHash}=require("node:crypto");
const {performance}=require("node:perf_hooks");
const {compileKernel}=require("../../../tools/native-kernel/compiler.cjs");
const {removeLoadedNativeCache}=require("../../../test/helpers/native-cache-cleanup.cjs");
const root=path.resolve(__dirname,"../../..");
const output=process.argv[2];
if(!output || process.argv.length!==3 || fs.existsSync(output)) throw Error("usage: validation-products.cjs NEW_RECEIPT.json");
const sources=["src/lib/sagejs/numerics/linear_algebra/_packed_validation.py","src/lib/sagejs/numerics/_packed_sum.py"];
const hash=value=>createHash("sha256").update(value).digest("hex");
const sourceHashes=()=>Object.fromEntries(sources.map(s=>[s,hash(fs.readFileSync(path.join(root,s)))]));
(async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-validation-timing-"));
  try {
    const before=sourceHashes();
    const compiled=await compileKernel({sourcePath:path.join(root,sources[0]),cacheRoot:directory,functions:["reconstruction_row"]});
    const fn=require(compiled.modulePath).reconstruction_row;
    if(!fn.nativeAvailable) throw Error("native candidate unavailable");
    const records=[];
    for(const size of [16,32,64]) {
      const left=Float64Array.from({length:size*size},(_,i)=>((i*17)%41-20)/7);
      const right=Float64Array.from({length:size*size},(_,i)=>((i*13)%37-18)/11);
      const products=new Float64Array(size),partials=new Float64Array(size),sum=new Float64Array(1),rowOutput=new Float64Array(size);
      const dimension=BigInt(size),rows=Array.from({length:size},(_,i)=>BigInt(i));
      function run(implementation,retain=false) {
        const answer=[];
        for(const row of rows) {
          if(implementation(left,right,products,partials,sum,rowOutput,row,dimension,dimension,dimension)!==0) throw Error("reconstruction rejected");
          if(retain) answer.push(...rowOutput);
        }
        return answer;
      }
      const nativeAnswer=run(fn,true),dynamicAnswer=run(fn.javascript,true);
      if(JSON.stringify(nativeAnswer)!==JSON.stringify(dynamicAnswer)) throw Error("differential mismatch");
      for(let i=0;i<3;i++){run(fn);run(fn.javascript);}
      const samples={native:[],javascript:[]};
      for(let block=0;block<7;block++) for(const name of block%2?["javascript","native"]:["native","javascript"]) {
        const start=performance.now();run(name==="native"?fn:fn.javascript);samples[name].push(performance.now()-start);
      }
      records.push({size,samples_ms:samples,output_sha256:hash(JSON.stringify(nativeAnswer))});
    }
    if(JSON.stringify(before)!==JSON.stringify(sourceHashes())) throw Error("mathematical sources changed during measurement");
    const receipt={schema:"sagejs.validation-product-timing/v1",host:{platform:process.platform,arch:process.arch,node:process.version,cpu:os.cpus()[0]?.model},
      sources:before,benchmark_sha256:hash(fs.readFileSync(__filename)),
      artifact:{cache_key:compiled.cacheKey,native_abi:compiled.nativeAbi,core_sha256:hash(fs.readFileSync(compiled.coreSourcePath)),addon_sha256:hash(fs.readFileSync(compiled.addonPath))},
      policy:{warmups:3,blocks:7,order:"alternating",storage:"reused Float64Array arguments; normal wrapper marshalling included",unit:"one full product through bounded row calls"},
      records,limitations:["local-development-only","not-public-validation-or-LU-call","excludes-allocation-of-initial-buffers","excludes-norms-and-result-construction","not-a-target-or-default-promotion"]};
    fs.writeFileSync(output,JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
    console.log(JSON.stringify(records.map(r=>({size:r.size,...Object.fromEntries(Object.entries(r.samples_ms).map(([k,v])=>[k+"_median_ms",[...v].sort((a,b)=>a-b)[3]]))}))));
  } finally {removeLoadedNativeCache(directory);}
})().catch(error=>{console.error(error);process.exitCode=1;});

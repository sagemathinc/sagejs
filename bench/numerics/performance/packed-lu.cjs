"use strict";
// Isolated development measurement, explicitly not public solve qualification.
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {createHash}=require("node:crypto");
const {compileKernel}=require("../../../tools/native-kernel/compiler.cjs");
const {removeLoadedNativeCache}=require("../../../test/helpers/native-cache-cleanup.cjs");
const root=path.resolve(__dirname,"../../..");
async function main() {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-lu-benchmark-"));
  try {
    const sourcePath=path.join(root,"src/lib/sagejs/numerics/linear_algebra/_packed_lu.py");
    const started=performance.now();
    const artifact=await compileKernel({sourcePath,cacheRoot:directory,functions:["factor_partial_pivot"]});
    const compileMs=performance.now()-started,fn=require(artifact.modulePath).factor_partial_pivot;
    if(!fn.nativeAvailable) throw Error("native unavailable");
    const rows=[];
    for(const n of [8,32,64,128]) {
      const input=Float64Array.from({length:n*n},(_,i)=>(i%n===Math.floor(i/n)?n:((i*17+3)%13)-6));
      const w=new Float64Array(n*n),p=new Float64Array(n),o=new Float64Array(1);
      const samples={native:[],javascript:[]},batch=n<=32?100:10;
      for(let block=0;block<10;block++) for(const mode of (block%2?["native","javascript"]:["javascript","native"])) {
        const run=mode==="native"?fn:fn.javascript;
        const begin=performance.now();
        for(let i=0;i<batch;i++) if(run(input,w,p,o,BigInt(n),BigInt(n))!==0) throw Error("unexpected failure");
        const elapsed=performance.now()-begin;
        if(block>=3) samples[mode].push(elapsed/batch);
      }
      rows.push({n,batch,samples_ms_per_factorization:samples});
    }
    console.log(JSON.stringify({schema:"sagejs.packed-lu-development/v1",source_sha256:createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex"),host:{platform:process.platform,arch:process.arch,node:process.version,cpu:os.cpus()[0]?.model},fresh_compile_ms:compileMs,warmups:3,samples:7,rows,included:["generated adapter call","source-to-workspace copy","partial pivot factorization"],excluded:["public input conversion","planning and results","independent reconstruction checks","buffer allocation","cold process startup"],qualification:false},null,2));
  } finally {removeLoadedNativeCache(directory);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

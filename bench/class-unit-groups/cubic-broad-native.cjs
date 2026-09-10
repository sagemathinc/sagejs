"use strict";
// Isolated research-kernel coverage, not public Sage.js timings or receipts.
const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const {validate,sha256} = require("./cubic-broad-corpus.cjs");

function attempt(record, artifact) {
  const addon = require(path.resolve(artifact));
  if (!addon.nativeAvailable) throw Error("actual native addon is required");
  const kernel = addon.certified_complex_cubic_class_group_v1;
  const attempts = [];
  for (const effort of [5,1,7,8]) {
    const output = kernel.createIntegerBuffer(64,256);
    const input = kernel.packIntegerBuffer(record.coefficients.map(BigInt));
    const scratch = [kernel.createUInt64Buffer(4161),
      ...[512,4,9,16,16,144,48,109,1,1,1].map(n=>kernel.createIntegerBuffer(n,64))];
    try {
      const start = performance.now();
      const accepted = kernel.fmpz(output,input,...scratch,0,effort,1048576,3145728);
      attempts.push({effort,accepted,local_diagnostic_ms:performance.now()-start,
        output:output.toArray().map(String)});
      if (accepted) break;
    } catch (error) {
      attempts.push({effort,error:String(error),output:output.toArray().map(String)});
      break;
    }
  }
  return {label:record.label,source_hash:addon.sourceHash,cache_key:addon.cacheKey,attempts};
}

function main(args) {
  if (args[0]==="child") {
    const record=JSON.parse(fs.readFileSync(0,"utf8"));
    console.log(JSON.stringify(attempt(record,args[1])));
    return;
  }
  const [corpusFile,destination,artifact]=args;
  if (!artifact) throw Error("usage: cubic-broad-native.cjs CORPUS OUTPUT ARTIFACT");
  const corpus=validate(JSON.parse(fs.readFileSync(corpusFile,"utf8")));
  const absoluteArtifact=path.resolve(artifact);
  fs.mkdirSync(destination,{recursive:false});
  const addon=require(absoluteArtifact);
  if (!addon.nativeAvailable) throw Error("actual native addon is required");
  fs.writeFileSync(path.join(destination,"protocol.json"),JSON.stringify({
    corpus_sha256:corpus.payload_sha256,source_hash:addon.sourceHash,cache_key:addon.cacheKey,
    artifact:absoluteArtifact,artifact_js_sha256:sha256(fs.readFileSync(absoluteArtifact)),
    artifact_binary_sha256:sha256(fs.readFileSync(path.join(path.dirname(absoluteArtifact),"build/Release/sagejs_native_kernel.node"))),
    runner_sha256:sha256(fs.readFileSync(__filename)),started_at:new Date().toISOString(),
    scope:"Local direct research-kernel coverage, not public dispatch/fallback or competitive timing. Real fields are outside the declared signature and not invoked.",
    process_timeout_ms:10000,efforts:[5,1,7,8],memory_limit:1048576,temporary_limit:3145728,
  },null,2)+"\n");
  let completed=0;
  for (const record of corpus.records) {
    let result;
    if (record.r2===0) result={label:record.label,status:"outside-complex-signature"};
    else {
      const run=cp.spawnSync(process.execPath,[__filename,"child",absoluteArtifact],{
        input:JSON.stringify(record),encoding:"utf8",timeout:10000,maxBuffer:4*1024*1024,
        env:{...process.env,SAGEJS_NATIVE_MODE:"native"},
      });
      if (run.error || run.status!==0) result={label:record.label,status:run.error?.code==="ETIMEDOUT"?"timeout":"process-error",
        error:run.error?.message,exit_status:run.status,signal:run.signal,stdout:run.stdout,stderr:run.stderr};
      else {
        result=JSON.parse(run.stdout);
        if(result.source_hash!==addon.sourceHash || result.cache_key!==addon.cacheKey) throw Error("artifact identity changed");
        result.status=result.attempts.some(a=>a.accepted)?"accepted":result.attempts.some(a=>a.error)?"exception":"declined";
      }
    }
    fs.writeFileSync(path.join(destination,record.label+".json"),JSON.stringify(result,null,2)+"\n");
    completed++;
    if (completed%50===0) console.log(JSON.stringify({completed,total:corpus.records.length,label:record.label,status:result.status}));
  }
  fs.writeFileSync(path.join(destination,"finished.json"),JSON.stringify({fields:completed,finished_at:new Date().toISOString()})+"\n");
}
if (require.main===module) main(process.argv.slice(2));
module.exports={attempt};

"use strict";
// Recompile an identified diagnostic source with the compiler's symbol option.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const [manifestPath,destination,...extra]=process.argv.slice(2);assert.ok(manifestPath&&destination&&!extra.length);
const hash=x=>crypto.createHash("sha256").update(x).digest("hex");
async function main(){
  const original=JSON.parse(fs.readFileSync(manifestPath));assert.equal(original.records.length,1);
  const r=original.records[0];assert.equal(hash(fs.readFileSync(r.sourcePath)),r.sourceSha256);
  fs.mkdirSync(destination);
  const compiled=await require("../../tools/native-kernel/compiler.cjs").compileKernel({sourcePath:r.sourcePath,cacheRoot:path.resolve(destination,"cache"),profileSymbols:true});
  const result={...original,profile_symbols:true,timing_evidence:false,original_manifest_sha256:hash(fs.readFileSync(manifestPath)),
    records:[{...r,cacheKey:compiled.cacheKey,modulePath:compiled.modulePath}]};
  fs.writeFileSync(path.join(destination,"builds.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e);process.exitCode=1;});

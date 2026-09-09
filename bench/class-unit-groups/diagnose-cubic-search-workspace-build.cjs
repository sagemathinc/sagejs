"use strict";
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {pythonExecutable} = require('../../tools/python-executable.cjs');
const hash = x => require('node:crypto').createHash('sha256').update(x).digest('hex');
function searchWorkspaceSource(source) {
  const result = spawnSync(pythonExecutable(), [path.join(__dirname,'cubic-search-workspace-transform.py')], {input:source,encoding:'utf8',maxBuffer:4000000});
  assert.equal(result.status,0,result.stderr);
  return result.stdout;
}
async function main() {
  const [rootArg,input,directory,...extra]=process.argv.slice(2);
  assert(rootArg&&input&&directory&&!extra.length);
  fs.mkdirSync(directory);
  const original=fs.readFileSync(input,'utf8'), source=searchWorkspaceSource(original);
  const sourcePath=path.resolve(directory,'search-workspace.py');
  fs.writeFileSync(sourcePath,source);
  const {compileKernel}=require(path.join(path.resolve(rootArg),'tools/native-kernel/compiler.cjs'));
  const compiled=await compileKernel({sourcePath,cacheRoot:path.resolve(directory,'cache')});
  const manifest={schema:'sagejs.diagnostic/cubic-search-workspace-ablation-v1',promotion:false,public_receipt_qualified:false,independent_exact_replay:false,resource_limits_changed:false,inputSourceSha256:hash(original),sourceByteDelta:Buffer.byteLength(source)-Buffer.byteLength(original),records:[{name:'search_workspace',sourcePath,sourceSha256:hash(source),cacheKey:compiled.cacheKey,modulePath:compiled.modulePath}]};
  fs.writeFileSync(path.join(directory,'builds.json'),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify(manifest));
}
module.exports={searchWorkspaceSource};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});

"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {pythonExecutable}=require('../../tools/python-executable.cjs');
const {formatPythonSource}=require('../../tools/python-format.cjs');
const hash=s=>require('node:crypto').createHash('sha256').update(s).digest('hex');
function absoluteValueSource(source){
  const result=spawnSync(pythonExecutable(),[path.join(__dirname,'cubic-absolute-value-transform.py')],{input:source,encoding:'utf8',maxBuffer:4000000});
  assert.equal(result.status,0,result.stderr);
  const before=`    absolute_zero = coefficient_zero
    absolute_one = coefficient_one
    absolute_two = coefficient_two
    absolute_zero = abs(absolute_zero)
    absolute_one = abs(absolute_one)
    absolute_two = abs(absolute_two)
`;
  const after=`    absolute_zero = abs(coefficient_zero)
    absolute_one = abs(coefficient_one)
    absolute_two = abs(coefficient_two)
`;
  assert.equal(result.stdout.split(before).length,2);
  return formatPythonSource(result.stdout.replace(before,after));
}
async function main(){
  const [rootArg,input,directory,...extra]=process.argv.slice(2);assert(rootArg&&input&&directory&&!extra.length);
  fs.mkdirSync(directory);const original=fs.readFileSync(input,'utf8'),source=absoluteValueSource(original),sourcePath=path.resolve(directory,'absolute-value.py');
  fs.writeFileSync(sourcePath,source);
  const {compileKernel}=require(path.join(path.resolve(rootArg),'tools/native-kernel/compiler.cjs'));
  const compiled=await compileKernel({sourcePath,cacheRoot:path.resolve(directory,'cache')});
  const manifest={schema:'sagejs.diagnostic/cubic-absolute-value-ablation-v1',promotion:false,public_receipt_qualified:false,independent_exact_replay:false,resource_limits_changed:false,inputSourceSha256:hash(original),sourceByteDelta:Buffer.byteLength(source)-Buffer.byteLength(original),formattedInputBytes:Buffer.byteLength(formatPythonSource(original)),records:[{name:'absolute_value',sourcePath,sourceSha256:hash(source),cacheKey:compiled.cacheKey,modulePath:compiled.modulePath}]};
  fs.writeFileSync(path.join(directory,'builds.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest));
}
module.exports={absoluteValueSource};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});

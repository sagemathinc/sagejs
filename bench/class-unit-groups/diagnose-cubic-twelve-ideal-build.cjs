"use strict";
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const staging = 'and factor_count <= 11\n';
const ordering = '_CUBIC_NARROW_ADJACENT_MAX_FACTORS = 11\n';
function variants(source) {
  assert.equal(source.split(staging).length, 2, 'staged guard changed');
  assert.equal(source.split(ordering).length, 2, 'ordering guard changed');
  return [
    ['baseline', false, false], ['staging12', true, false],
    ['ordering12', false, true], ['both12', true, true],
  ].map(([name, stage, order]) => ({name, staging_limit:stage ? 12 : 11,
    ordering_limit:order ? 12 : 11,
    source:source.replace(staging, stage ? 'and factor_count <= 12\n' : staging)
      .replace(ordering, order ? '_CUBIC_NARROW_ADJACENT_MAX_FACTORS = 12\n' : ordering)}));
}
async function main() {
  const [rootArg, outputArg, ...extra] = process.argv.slice(2);
  assert.ok(rootArg && outputArg && extra.length === 0,
    'Usage: diagnose-cubic-twelve-ideal-build.cjs BUILT_ROOT FRESH_DIRECTORY');
  const root=path.resolve(rootArg), directory=path.resolve(outputArg);
  assert.ok(!fs.existsSync(path.join(directory,'builds.json')), 'preserve previous evidence');
  const source=fs.readFileSync(path.join(root,'src/lib/sagejs/number_fields/cubic_class_number_native.py'),'utf8');
  const candidates=variants(source);
  fs.mkdirSync(directory,{recursive:true});
  const {compileKernel}=require(path.join(root,'tools/native-kernel/compiler.cjs'));
  const records=[];
  for(const candidate of candidates) {
    const sourcePath=path.join(directory,candidate.name+'.py');
    if(fs.existsSync(sourcePath))assert.equal(fs.readFileSync(sourcePath,'utf8'),candidate.source);
    fs.writeFileSync(sourcePath,candidate.source);
    const compiled=await compileKernel({sourcePath,cacheRoot:path.join(directory,'cache-'+candidate.name)});
    const {source:unused,...policy}=candidate;
    records.push({...policy,sourcePath,
      sourceSha256:crypto.createHash('sha256').update(candidate.source).digest('hex'),
      cacheKey:compiled.cacheKey,modulePath:compiled.modulePath});
    console.log(JSON.stringify(records.at(-1)));
  }
  fs.writeFileSync(path.join(directory,'builds.json'),JSON.stringify({
    schema:'sagejs.diagnostic/twelve-ideal-ablation-build-v1',
    promotion:false,public_receipt_qualified:false,independent_exact_replay:false,
    acceptance_rule_changed:false,resource_limits_changed:false,records},null,2));
}
module.exports={variants};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});

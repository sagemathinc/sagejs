"use strict";
// Search-policy ablation only: this is not PARI's volume-based radius formula.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {variants}=require('./diagnose-cubic-twelve-ideal-build.cjs');
function radiusSource(source) {
  const marker='    elif bound_two < bound:\n        bound = bound_two\n';
  assert.equal(source.split(marker).length,2,'radius policy drift');
  return source.replace(marker,'    elif bound_two > bound:\n        bound = bound_two\n');
}
async function main(){
  const [rootArg,dirArg,...extra]=process.argv.slice(2);assert.ok(rootArg&&dirArg&&!extra.length);
  const root=path.resolve(rootArg),directory=path.resolve(dirArg);
  assert.ok(!fs.existsSync(path.join(directory,'builds.json')));
  fs.mkdirSync(directory,{recursive:true});
  const source=fs.readFileSync(path.join(root,'src/lib/sagejs/number_fields/cubic_class_number_native.py'),'utf8');
  const {compileKernel}=require(path.join(root,'tools/native-kernel/compiler.cjs'));
  const records=[];
  for(const v of variants(source).filter(v=>['baseline','ordering12'].includes(v.name))){
    const text=radiusSource(v.source),sourcePath=path.join(directory,v.name+'.py');
    fs.writeFileSync(sourcePath,text);
    const c=await compileKernel({sourcePath,cacheRoot:path.join(directory,'cache-'+v.name)});
    records.push({name:v.name,sourcePath,sourceSha256:crypto.createHash('sha256').update(text).digest('hex'),cacheKey:c.cacheKey,modulePath:c.modulePath});
    console.log(JSON.stringify(records.at(-1)));
  }
  fs.writeFileSync(path.join(directory,'builds.json'),JSON.stringify({schema:'sagejs.diagnostic/cubic-radius-ablation-v1',
    promotion:false,public_receipt_qualified:false,resource_limits_changed:false,acceptance_rule_changed:false,records},null,2));
}
module.exports={radiusSource};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});

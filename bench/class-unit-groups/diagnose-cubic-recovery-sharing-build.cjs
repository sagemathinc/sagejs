"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function shareRecoverySource(source){
  const start=source.indexOf('def _cubic_relation_prefix_has_archimedean_unit(');
  const end=source.indexOf('\ndef ',start+1);assert(start>=0&&end>start);
  const body=source.slice(start,end);
  const begin=body.indexOf('    unit_candidate_found = False\n');
  const finish=body.indexOf('\n    if not unit_candidate_found:\n',begin)+1;assert(begin>=0&&finish>begin);
  assert(body.slice(begin,finish).includes('while reduction_active and reduction_step < 1024:'));
  const replacement=`    unit_candidate_found, best_regulator_lower, best_regulator_upper = (
        _cubic_discover_dependency_unit(
            prefix_dependencies_reduced,
            prefix_logs,
            prefix_unit_combinations,
            relation_count,
            dependency_count,
            True,
            False,
            0,
            0,
        )
    )
`;
  return source.slice(0,start)+body.slice(0,begin)+replacement+body.slice(finish)+source.slice(end);
}
async function main(){
  const [rootArg,sourceArg,directoryArg,...extra]=process.argv.slice(2);assert(rootArg&&sourceArg&&directoryArg&&!extra.length);
  const directory=path.resolve(directoryArg);fs.mkdirSync(directory);
  const original=fs.readFileSync(sourceArg,'utf8'),source=shareRecoverySource(original),sourcePath=path.join(directory,'shared-recovery.py');fs.writeFileSync(sourcePath,source);
  const {compileKernel}=require(path.join(path.resolve(rootArg),'tools/native-kernel/compiler.cjs'));
  const compiled=await compileKernel({sourcePath,cacheRoot:path.join(directory,'cache')});
  const manifest={schema:'sagejs.diagnostic/cubic-recovery-sharing-ablation-v1',promotion:false,public_receipt_qualified:false,independent_exact_replay:false,inputSourceSha256:hash(original),sourceByteDelta:Buffer.byteLength(source)-Buffer.byteLength(original),records:[{name:'shared_recovery',sourcePath,sourceSha256:hash(source),cacheKey:compiled.cacheKey,modulePath:compiled.modulePath}]};
  fs.writeFileSync(path.join(directory,'builds.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest));
}
module.exports={shareRecoverySource};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});

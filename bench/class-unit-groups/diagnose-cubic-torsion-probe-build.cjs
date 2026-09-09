"use strict";
// Isolated probe: certify an all-torsion kernel before invoking recovery LLL.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const helperPath=path.join(__dirname,'cubic-torsion-prefix.py');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function torsionProbeSource(source){
  assert(!source.includes('def _cubic_dependency_logs_certify_torsion('));
  const start=source.indexOf('def _cubic_relation_prefix_has_archimedean_unit(');
  const end=source.indexOf('\ndef ',start+1);assert(start>=0&&end>start);
  const body=source.slice(start,end);
  const reduction=body.indexOf('    if not fmpz_matrix_lll_transform_prefix(');
  assert(reduction>=0);
  const first=body.indexOf('    if not _cubic_fill_dependency_logs(');
  const last=body.indexOf('    relation_index: uint64 = 0',first);
  assert(first>reduction&&last>first);
  const logs=body.slice(first,last);
  assert(logs.endsWith('        return -1\n'));
  const probe=logs.replace('if not _cubic_fill_dependency_logs(', 'if _cubic_fill_dependency_logs(')
    .replace('        dependency_scale,','        analytic_scale,')
    .replace('        dependency_precision,','        analytic_precision,')
    .replace('        return -1\n',`        if _cubic_dependency_logs_certify_torsion(
            prefix_dependencies,
            prefix_logs,
            dependency_count,
            relation_count,
            analytic_scale,
        ):
            return 0
`);
  const helper=fs.readFileSync(helperPath,'utf8').replace(/^from __future__ import annotations\n/, '').trimStart();
  return source.slice(0,start)+helper+'\n\n'+body.slice(0,reduction)+probe+'\n'+body.slice(reduction)+source.slice(end);
}
async function main(){
  const [rootArg,sourceArg,directoryArg,...extra]=process.argv.slice(2);assert(rootArg&&sourceArg&&directoryArg&&!extra.length);
  const directory=path.resolve(directoryArg);fs.mkdirSync(directory);
  const original=fs.readFileSync(sourceArg,'utf8'),source=torsionProbeSource(original),sourcePath=path.join(directory,'torsion-probe.py');
  fs.writeFileSync(sourcePath,source);
  const {compileKernel}=require(path.join(path.resolve(rootArg),'tools/native-kernel/compiler.cjs'));
  const compiled=await compileKernel({sourcePath,cacheRoot:path.join(directory,'cache')});
  const manifest={schema:'sagejs.diagnostic/cubic-torsion-probe-ablation-v1',promotion:false,
    public_receipt_qualified:false,independent_exact_replay:false,lll_fallback_retained:true,
    resource_limits_changed:false,inputSourceSha256:hash(original),sourceByteDelta:Buffer.byteLength(source)-Buffer.byteLength(original),
    records:[{name:'torsion_probe',sourcePath,sourceSha256:hash(source),cacheKey:compiled.cacheKey,modulePath:compiled.modulePath}]};
  fs.writeFileSync(path.join(directory,'builds.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest));
}
module.exports={torsionProbeSource};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});

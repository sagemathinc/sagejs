"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const {initialVolumeSource}=require("./diagnose-cubic-initial-volume-build.cjs");
const hash=x=>crypto.createHash("sha256").update(x).digest("hex"),builderHash=hash(fs.readFileSync(__filename));
function bfLookupSource(original){
  const source=initialVolumeSource(original,true),template=fs.readFileSync(path.join(__dirname,"cubic-bf-value-lookup-template.py"),"utf8");
  const before=`                    analytic_value_index: uint64 = 0
                    while (
                        analytic_value_index < analytic_value_count
                        and analytic_workspace[
                            _CUBIC_ANALYTIC_VALUE_OFFSET + analytic_value_index
                        ]
                        != analytic_norm_index
                    ):
                        analytic_value_index += 1`;
  assert.equal(source.split(before).length,2);
  const changed=source.replace(before,`                    analytic_value_index: uint64 = _cubic_bf_value_index(
                        analytic_workspace, analytic_value_count, analytic_norm_index
                    )`);
  return changed.replace("def _cubic_prepare_bf_plan(",template.slice(template.indexOf("def _cubic_bf_value_index("))+"\n\ndef _cubic_prepare_bf_plan(");
}
async function main(){
  const [rootArg,destArg,...extra]=process.argv.slice(2);assert.ok(rootArg&&destArg&&!extra.length);
  const root=path.resolve(rootArg),dest=path.resolve(destArg);fs.mkdirSync(dest);
  const original=fs.readFileSync(path.join(root,"src/lib/sagejs/number_fields/cubic_class_number_native.py"),"utf8");
  const text=require(path.join(root,"tools/python-format.cjs")).formatPythonSource(bfLookupSource(original));
  const sourcePath=path.join(dest,"bf-lookup.py");fs.writeFileSync(sourcePath,text);
  const compiled=await require(path.join(root,"tools/native-kernel/compiler.cjs")).compileKernel({sourcePath,cacheRoot:path.join(dest,"cache")});
  const result={schema:"sagejs.diagnostic/cubic-volume-batch-ablation-v1",promotion:false,public_receipt_qualified:false,
    production_source_sha256:hash(original),builder_sha256:builderHash,acceptance_rule_changed:false,resource_limits_changed:false,
    checkpoint_trace:false,records:[{name:"bf_lookup",sourcePath,sourceSha256:hash(text),cacheKey:compiled.cacheKey,modulePath:compiled.modulePath}]};
  fs.writeFileSync(path.join(dest,"builds.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
module.exports={bfLookupSource};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});

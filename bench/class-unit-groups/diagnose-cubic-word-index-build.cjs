"use strict";
// Diagnostic source typing only: no compiler, acceptance, or layout change.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const {bfLookupSource}=require("./diagnose-cubic-bf-lookup-build.cjs");
const aliases={
  _CUBIC_ANALYTIC_COEFFICIENT_OFFSET:"bf_word_coefficient_offset",
  _CUBIC_ANALYTIC_TERM_OFFSET:"bf_word_term_offset",
  _CUBIC_ANALYTIC_TERM_STRIDE:"bf_word_term_stride",
  _CUBIC_ANALYTIC_VALUE_OFFSET:"bf_word_value_offset",
};
const functions=["_cubic_bf_value_index","_cubic_prepare_bf_plan","_cubic_evaluate_bf_plan","_cubic_bf_finite_bounds"];
function wordIndexSource(original){
  let source=bfLookupSource(original);
  for(const alias of Object.values(aliases))assert.ok(!source.includes(alias));
  for(const name of functions){
    const start=source.indexOf(`def ${name}(`);assert.ok(start>=0);
    const end=source.indexOf("\n\ndef ",start+1);assert.ok(end>start);
    let body=source.slice(start,end);const declarations=[];
    for(const [constant,alias] of Object.entries(aliases)){
      if(!body.includes(constant))continue;
      body=body.replace(new RegExp(`\\b${constant}\\b`,"g"),alias);
      declarations.push(`    ${alias}: uint64 = ${constant}`);
    }
    assert.ok(declarations.length);
    const docStart=body.indexOf('    """'),docEnd=body.indexOf('"""',docStart+7)+3;
    assert.ok(docStart>0&&docEnd>docStart+7);
    body=body.slice(0,docEnd)+"\n"+declarations.join("\n")+body.slice(docEnd);
    source=source.slice(0,start)+body+source.slice(end);
  }
  return source;
}
const hash=x=>crypto.createHash("sha256").update(x).digest("hex");
async function main(){
  const [rootArg,destination,...extra]=process.argv.slice(2);assert.ok(rootArg&&destination&&!extra.length);
  const root=path.resolve(rootArg),dest=path.resolve(destination);fs.mkdirSync(dest);
  const original=fs.readFileSync(path.join(root,"src/lib/sagejs/number_fields/cubic_class_number_native.py"),"utf8");
  const text=require(path.join(root,"tools/python-format.cjs")).formatPythonSource(wordIndexSource(original));
  const sourcePath=path.join(dest,"word-index.py");fs.writeFileSync(sourcePath,text);
  const compiled=await require(path.join(root,"tools/native-kernel/compiler.cjs")).compileKernel({sourcePath,cacheRoot:path.join(dest,"cache")});
  const result={schema:"sagejs.diagnostic/cubic-volume-batch-ablation-v1",promotion:false,public_receipt_qualified:false,
    production_source_sha256:hash(original),builder_sha256:hash(fs.readFileSync(__filename)),
    acceptance_rule_changed:false,resource_limits_changed:false,checkpoint_trace:false,
    records:[{name:"word_index",sourcePath,sourceSha256:hash(text),cacheKey:compiled.cacheKey,modulePath:compiled.modulePath}]};
  fs.writeFileSync(path.join(dest,"builds.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
module.exports={wordIndexSource,aliases,functions};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});

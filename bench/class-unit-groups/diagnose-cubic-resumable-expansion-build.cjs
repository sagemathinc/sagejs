"use strict";
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { expansionSource } = require("./diagnose-cubic-expansion-build.cjs");
function once(source, before, after) {
  assert.equal(source.split(before).length, 2, `source boundary drift: ${before.slice(0,60)}`);
  return source.replace(before, after);
}
function inFunction(source, name, change) {
  const start = source.indexOf(`def ${name}(`), end = source.indexOf("\ndef ", start+1);
  assert(start >= 0 && end > start);
  return source.slice(0,start)+change(source.slice(start,end))+source.slice(end);
}
function addCallArgument(body, name, argument) {
  const start=body.indexOf(name+"("); assert(start>=0);
  assert.equal(body.indexOf(name+"(",start+1),-1);
  let end=start+name.length+1, depth=1;
  while(depth && end<body.length){ if(body[end]==="(")depth++;if(body[end]===")")depth--;end++; }
  assert.equal(depth,0); const close=end-1, indent=body.slice(body.lastIndexOf("\n",close)+1,close);
  assert.match(indent,/^ *$/);
  return body.slice(0,close)+`    ${argument},\n${indent}`+body.slice(close);
}
function shellAdmissionSource(source) {
  source=inFunction(source,"_cubic_reduced_ellipsoid_candidate",body=>once(once(body,
    "    coefficient_two: int,\n", "    coefficient_two: int,\n    lower_bound: int,\n"),
    "if t2 <= 0 or t2 > bound:", "if t2 <= lower_bound or t2 > bound:"));
  source=inFunction(source,"_cubic_plan_reduced_ideal_ellipsoid",body=>addCallArgument(body,"_cubic_reduced_ellipsoid_candidate","0"));
  source=inFunction(source,"_cubic_append_reduced_ideal_ellipsoid",body=>addCallArgument(once(body,
    "    proposal_budget: uint64,\n", "    proposal_budget: uint64,\n    lower_bound: int,\n"),"_cubic_reduced_ellipsoid_candidate","lower_bound"));
  return inFunction(source,"_cubic_collect_adjacent_relation_prefix",body=>addCallArgument(body,"_cubic_append_reduced_ideal_ellipsoid","0"));
}
function resumableSource(source, geometry, prefix) {
  source = shellAdmissionSource(source);
  const end=geometry.indexOf("\ndef _cubic_collect_expanded_shell("); assert(end>0);
  source = expansionSource(source,geometry.slice(0,end)+"\n"+prefix);
  source = once(source,"            while staged_attempt < 3:","            while staged_attempt < 5:");
  source = once(source,"                if staged_attempt >= 2:","                if staged_attempt >= 4:");
  source = once(source,"                if staged_attempt == 1 or factor_count == 12:","                if staged_attempt >= 1 or factor_count == 12:");
  source = once(source,"                    staged_attempt = 1\n                    relation_collection_target = presentation_storage_rows - 1\n",`                    if staged_attempt == 0:
                        staged_attempt = 1
                    expansion_width: uint64 = 1
                    if staged_attempt == 2:
                        expansion_width = 3
                    elif staged_attempt == 3:
                        expansion_width = 4
                    relation_collection_target = relation_count + expansion_width
                    if relation_collection_target >= presentation_storage_rows:
                        relation_collection_target = presentation_storage_rows - 1
`);
  source = once(source,"            expanded_parameters = arena.foreign_resource(fmpz_matrix, 1, 11)\n", "            expanded_parameters = arena.foreign_resource(fmpz_matrix, 1, 11)\n            expanded_state = arena.foreign_resource(fmpz_matrix, 1, 6)\n");
  source = once(source,"= _cubic_collect_expanded_shell(\n", "= _cubic_collect_expanded_shell_prefix(\n");
  return once(source,"                        presentation_storage_rows, relation_collection_target,\n", "                        presentation_storage_rows, relation_collection_target,\n                        expanded_state, adjacent_proposal_budget,\n");
}
async function main() {
  const [rootArg,dirArg,...extra]=process.argv.slice(2);assert(rootArg&&dirArg&&!extra.length);
  const root=path.resolve(rootArg),directory=path.resolve(dirArg);fs.mkdirSync(directory);
  const read=name=>fs.readFileSync(path.join(__dirname,name),"utf8");
  const original=fs.readFileSync(path.join(root,"src/lib/sagejs/number_fields/cubic_class_number_native.py"),"utf8");
  const source=resumableSource(original,read("cubic-expanded-shell-experiment.py"),read("cubic-expanded-prefix-experiment.py"));
  const sourcePath=path.join(directory,"resumable.py");fs.writeFileSync(sourcePath,source);
  const {compileKernel}=require(path.join(root,"tools/native-kernel/compiler.cjs"));
  const compiled=await compileKernel({sourcePath,cacheRoot:path.join(directory,"cache")});
  const record={name:"resumable_expanded_shell",sourcePath,sourceSha256:crypto.createHash("sha256").update(source).digest("hex"),cacheKey:compiled.cacheKey,modulePath:compiled.modulePath};
  const manifest={schema:"sagejs.diagnostic/cubic-expansion-ablation-v1",promotion:false,public_receipt_qualified:false,independent_exact_replay:false,acceptance_rule_changed:false,resource_limits_changed:false,checkpoints:[1,4,8],additional_scratch:"1x11 plan and 1x6 cursor; unchanged arena limits",records:[record]};
  fs.writeFileSync(path.join(directory,"builds.json"),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest));
}
module.exports={shellAdmissionSource,resumableSource};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});

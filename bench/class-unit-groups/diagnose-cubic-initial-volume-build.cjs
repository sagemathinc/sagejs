"use strict";
// Source-copy experiment: initial discovery policy only, never certification.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const {permutedAnalyticResumeSource,discoveryAuditSource}=require("./diagnose-cubic-analytic-resume-build.cjs");
const {checkpointTraceSource}=require("./diagnose-cubic-volume-batch-build.cjs");
const hash=x=>crypto.createHash("sha256").update(x).digest("hex");
const builderHash=hash(fs.readFileSync(__filename));
function once(s,a,b){assert.equal(s.split(a).length,2,`unique replacement: ${a}`);return s.replace(a,b);}
function functionSource(s,name){const start=s.indexOf(`def ${name}(`),end=s.indexOf("\n\ndef ",start);const native=s.indexOf("\n\n@native",start);assert.ok(start>=0);return s.slice(start,Math.min(...[end,native].filter(n=>n>start)));}
function initialVolumeSource(original,leanPlan=false){
  let s=permutedAnalyticResumeSource(original);
  let append=functionSource(s,"_cubic_append_volume_ideal_ellipsoid");
  append=once(append,"def _cubic_append_volume_ideal_ellipsoid(","def _cubic_append_initial_volume_ellipsoid(");
  append=once(append,"    lower_bound: int,\n)","    lower_bound: int,\n    visit_limit: uint64,\n)");
  append=once(append,"        and proposal_count < proposal_budget","        and proposal_count < proposal_budget\n        and relation_count < visit_limit");
  let prepare=functionSource(s,"_cubic_expansion_parameters");
  prepare=once(prepare,"def _cubic_expansion_parameters(","def _cubic_initial_volume_parameters(");
  prepare=once(prepare,"    if bound <= old_bound:\n        return 0","    if bound < old_bound:\n        bound = old_bound");
  prepare=prepare.replace('"""Prepare a new outer shell without mutating the original plan.',
    '"""Prepare a full initial volume region; same-matrix output is allowed.');
  prepare=prepare.replace('Return 0 for an unprepared or already-large plan, 1 for a prepared shell,',
    'Return 0 for an unprepared plan, 1 for a prepared full region,');
  const template=fs.readFileSync(path.join(__dirname,"cubic-initial-volume-template.py"),"utf8");
  let collector=template.slice(template.indexOf("def _cubic_collect_initial_volume_prefix("));
  let initialPlan="";
  if(leanPlan){
    initialPlan=functionSource(s,"_cubic_plan_adjacent_ideal");
    const score=initialPlan.indexOf("    best_score = -1");assert.ok(score>0);
    initialPlan=initialPlan.slice(0,score)+"    return 4\n";
    initialPlan=once(initialPlan,"def _cubic_plan_adjacent_ideal(","def _cubic_plan_initial_volume_ideal(");
    collector=once(collector,"                plan = _cubic_plan_adjacent_ideal(","                plan = _cubic_plan_initial_volume_ideal(");
  }
  const old=functionSource(s,"_cubic_collect_adjacent_relation_prefix");
  const parameters=[...old.slice(0,old.indexOf(") ->")).matchAll(/^    (\w+):/gm)].map(m=>m[1]);
  assert.equal(parameters.length,38);
  const dispatch=`    if (bounded_relation_collection and streaming_relation_collection\n        and use_pari_permutation and factor_count == 12):\n        return _cubic_collect_initial_volume_prefix(\n${parameters.map(n=>`            ${n},`).join("\n")}\n        )\n`;
  const bodyStart=old.indexOf("    while (");assert.ok(bodyStart>0);
  s=once(s,old,old.slice(0,bodyStart)+dispatch+old.slice(bodyStart));
  s=once(s,"    online_hnf: FmpzMatrix\n    support: FmpzMatrix\n    membership: FmpzMatrix\n",
    "    online_hnf: FmpzMatrix\n    support: FmpzMatrix\n    membership: FmpzMatrix\n    visits: FmpzMatrix\n");
  s=once(s,"        search = CubicSearchWorkspace(",`        initial_visit_rows: uint64 = 1
        if bounded_relation_collection and use_pari_permutation and factor_count == 12:
            initial_visit_rows = factor_count + 1
        initial_visits = arena.foreign_resource(fmpz_matrix, initial_visit_rows, 6)
        search = CubicSearchWorkspace(`);
  s=once(s,"            online_membership_coordinates,\n        )\n        (\n            relation_count,",
    "            online_membership_coordinates,\n            initial_visits,\n        )\n        (\n            relation_count,");
  // Reuse the actual root's retained-collector call, including all borrowed
  // owners. Only the staged branch's storage ceiling differs.
  const root=s.slice(s.indexOf("def certified_complex_cubic_class_group_v1("));
  const callStart=root.indexOf("                    (\n                        relation_count,",root.indexOf("relation_collection_target = factor_count + 22"));
  const callEnd=root.indexOf("\n                if (",callStart);
  assert.ok(callStart>0 && callEnd>callStart);
  const call=once(root.slice(callStart,callEnd),"                        relation_capacity,","                        presentation_storage_rows,");
  const expStart=s.indexOf("                    relation_count, online_relation_count, online_relation_status = (",s.indexOf("            staged_attempt: uint64 = 0"));
  const expEnd=s.indexOf("\n                else:",expStart);
  assert.ok(expStart>0 && expEnd>expStart);
  const expansion=s.slice(expStart,expEnd);
  s=s.slice(0,expStart)+"                    if bounded_relation_collection and use_pari_permutation and factor_count == 12:\n"+
    call.split("\n").map(l=>"    "+l).join("\n")+"\n                    else:\n"+
    expansion.split("\n").map(l=>"    "+l).join("\n")+s.slice(expEnd);
  return once(s,"def _cubic_collect_adjacent_relation_prefix(",append+"\n\n"+prepare+"\n\n"+initialPlan+"\n\n"+collector+"\n\ndef _cubic_collect_adjacent_relation_prefix(");
}
function initialVisitAuditSource(source){
  let s=discoveryAuditSource(source);
  const save=`                audit_row = 0
                while audit_row < initial_visit_rows * 6:
                    diagnostic_state[20000 + audit_row] = search.visits[audit_row // 6, audit_row % 6]
                    audit_row += 1
`;
  const compare=`                audit_row = 0
                while audit_row < initial_visit_rows * 6:
                    if diagnostic_state[20000 + audit_row] != search.visits[audit_row // 6, audit_row % 6]:
                        diagnostic_trace[12] = 20001 + audit_row
                        diagnostic_trace[13] = staged_attempt
                        return False
                    audit_row += 1
`;
  s=once(s,"                staged_status = _cubic_try_bounded_exact_closure(",save+"                staged_status = _cubic_try_bounded_exact_closure(");
  return once(s,"                diagnostic_trace[9] += 1",compare+"                diagnostic_trace[9] += 1");
}
async function main(){
  const [rootArg,dirArg,mode,...rest]=process.argv.slice(2);assert.ok(rootArg&&dirArg&&["plain","trace","lean","lean-trace","lean-audit"].includes(mode)&&!rest.length);
  const root=path.resolve(rootArg),dir=path.resolve(dirArg);fs.mkdirSync(dir);
  const original=fs.readFileSync(path.join(root,"src/lib/sagejs/number_fields/cubic_class_number_native.py"),"utf8");
  const audit=mode.endsWith("audit"),trace=mode.endsWith("trace")||audit,lean=mode.startsWith("lean");
  let source=initialVolumeSource(original,lean);if(audit)source=initialVisitAuditSource(source);else if(trace)source=checkpointTraceSource(source);
  const text=require(path.join(root,"tools/python-format.cjs")).formatPythonSource(source),sourcePath=path.join(dir,"initial-volume.py");fs.writeFileSync(sourcePath,text);
  const compiled=await require(path.join(root,"tools/native-kernel/compiler.cjs")).compileKernel({sourcePath,cacheRoot:path.join(dir,"cache")});
  const manifest={schema:"sagejs.diagnostic/cubic-volume-batch-ablation-v1",promotion:false,public_receipt_qualified:false,production_source_sha256:hash(original),builder_sha256:builderHash,source_policy:"initial-volume-four-row-visits-twelve-factors",checkpoint_trace:trace,discovery_state_audit:audit,skip_unused_direction_scoring:lean,acceptance_rule_changed:false,resource_limits_changed:false,records:[{name:lean?"initial_volume_lean":"initial_volume",sourcePath,sourceSha256:hash(text),cacheKey:compiled.cacheKey,modulePath:compiled.modulePath}]};
  fs.writeFileSync(path.join(dir,"builds.json"),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest));
}
module.exports={initialVolumeSource,functionSource,initialVisitAuditSource};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});

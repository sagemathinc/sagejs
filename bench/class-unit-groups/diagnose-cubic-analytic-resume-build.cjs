"use strict";
// Source-copy experiment only. The production certificate is never changed.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { volumeBatchSource, checkpointTraceSource } = require("./diagnose-cubic-volume-batch-build.cjs");
const hash = data => crypto.createHash("sha256").update(data).digest("hex");
const builderSha256 = hash(fs.readFileSync(__filename));
function once(source, before, after) {
  assert.equal(source.split(before).length,2,`unique replacement: ${before}`);
  return source.replace(before,after);
}
function analyticResumeSource(source) {
  let result = volumeBatchSource(source,true);
  const template = fs.readFileSync(path.join(__dirname,"cubic-analytic-resume-template.py"),"utf8");
  const helper = template.slice(template.indexOf("def _cubic_can_resume_bounded_search("));
  result = once(result,"def _cubic_collect_expanded_shell_prefix(",helper+"\n\ndef _cubic_collect_expanded_shell_prefix(");
  return once(result,"if output[63] != 43 or output[59] != 434:",
    "if not _cubic_can_resume_bounded_search(staged_status, output):");
}
function permutedAnalyticResumeSource(source) {
  return once(analyticResumeSource(source), `        use_pari_permutation = (
            (relation_effort >= 3 and relation_effort <= 5)
            and factor_count <= _CUBIC_NARROW_ADJACENT_MAX_FACTORS`,
    `        use_pari_permutation = (
            (relation_effort >= 3 and relation_effort <= 5)
            and factor_count <= 12`);
}
function discoveryAuditSource(source) {
  let result = checkpointTraceSource(source);
  result = once(result,"    diagnostic_trace: IntegerBuffer,\n) -> bool:",
    "    diagnostic_trace: IntegerBuffer,\n    diagnostic_state: IntegerBuffer,\n) -> bool:");
  result = once(result,"    if len(diagnostic_trace) != 256:",
    "    if len(diagnostic_state) != 32768:\n        return False\n    if len(diagnostic_trace) != 256:");
  // All persistent vector entries, full modular buffer, and logical matrix
  // prefixes are compared exactly, not hashed. Exclude only named scratch.
  const regions = [
    ["_HNF_SCRATCH_OFFSET","workspace[audit_row]"],
    ["_CUBIC_WORKSPACE_LENGTH - _NORM_FORM_OFFSET","workspace[_NORM_FORM_OFFSET + audit_row]"],
    ["_CUBIC_MODULAR_WORKSPACE_LENGTH","modular_workspace[audit_row]"],
    ["adjacent_order_rows","search.order[audit_row, 0]"],
    ["factor_count * 9","search.transforms[audit_row // 3, audit_row % 3]"],
    ["factor_count * 11","search.parameters[audit_row // 11, audit_row % 11]"],
    ["relation_count * factor_count","search.relations[audit_row // factor_count, audit_row % factor_count]"],
    ["relation_count * 3","search.elements[audit_row // 3, audit_row % 3]"],
    ["factor_count * factor_count","search.online_basis[audit_row // factor_count, audit_row % factor_count]"],
    ["relation_count","search.support[audit_row, 0]"],
    ["relation_count * factor_count","relation_matrix[audit_row // factor_count, audit_row % factor_count]"],
    ["factor_count * factor_count","relation_hnf[audit_row // factor_count, audit_row % factor_count]"],
    ["factor_count * 11","expanded_parameters[audit_row // 11, audit_row % 11]"],
    ["(factor_count + 1) * 6","expanded_state[audit_row // 6, audit_row % 6]"],
  ];
  function loops(compare) {
    const lines = ["                audit_index: uint64 = 0", "                audit_row: uint64 = 0"];
    for (const [count,value] of regions) {
      lines.push("                audit_row = 0",`                while audit_row < ${count}:`,
        "                    if audit_index >= 32768:","                        return False");
      if (compare) lines.push(`                    if diagnostic_state[audit_index] != ${value}:`,
        "                        diagnostic_trace[12] = audit_index + 1",
        "                        diagnostic_trace[13] = staged_attempt", "                        return False");
      else lines.push(`                    diagnostic_state[audit_index] = ${value}`);
      lines.push("                    audit_index += 1", "                    audit_row += 1");
    }
    if (compare) lines.push("                diagnostic_trace[9] += 1", "                diagnostic_trace[10] = audit_index");
    return lines.join("\n")+"\n";
  }
  result = once(result,"                staged_status = _cubic_try_bounded_exact_closure(",
    loops(false)+"                staged_status = _cubic_try_bounded_exact_closure(");
  return once(result,"                diagnostic_slot: uint64 = 16 + 8 * staged_attempt",
    loops(true)+"                diagnostic_slot: uint64 = 16 + 8 * staged_attempt");
}
async function main() {
  const [rootArg,directoryArg,mode,...extra] = process.argv.slice(2);
  assert.ok(rootArg && directoryArg && ["plain","audit","permuted","permuted-audit"].includes(mode) && !extra.length);
  const audit = mode.endsWith("audit"), permuted = mode.startsWith("permuted");
  const root = path.resolve(rootArg), directory = path.resolve(directoryArg);
  fs.mkdirSync(directory);
  const source = fs.readFileSync(path.join(root,"src/lib/sagejs/number_fields/cubic_class_number_native.py"),"utf8");
  let candidate = permuted ? permutedAnalyticResumeSource(source) : analyticResumeSource(source);
  if (audit) candidate = discoveryAuditSource(candidate);
  const { formatPythonSource } = require(path.join(root,"tools/python-format.cjs"));
  const text = formatPythonSource(candidate), sourcePath = path.join(directory,"analytic-resume.py");
  fs.writeFileSync(sourcePath,text);
  const { compileKernel } = require(path.join(root,"tools/native-kernel/compiler.cjs"));
  const compiled = await compileKernel({sourcePath,cacheRoot:path.join(directory,"cache")});
  const manifest = {schema:"sagejs.diagnostic/cubic-volume-batch-ablation-v1",promotion:false,
    public_receipt_qualified:false,production_source_sha256:hash(source),
    builder_sha256:builderSha256,template_sha256:hash(fs.readFileSync(path.join(__dirname,"cubic-analytic-resume-template.py"))),
    resource_limits_changed:false,acceptance_rule_changed:false,early_twelve_factor_checkpoint:true,
    analytic_insufficiency_resumption:true,permutation_extended_to_twelve:permuted,
    checkpoint_trace:audit,discovery_state_audit:audit,
    records:[{name:permuted ? "analytic_resume_permuted" : "analytic_resume",sourcePath,sourceSha256:hash(text),cacheKey:compiled.cacheKey,modulePath:compiled.modulePath}]};
  fs.writeFileSync(path.join(directory,"builds.json"),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify(manifest));
}
module.exports = {analyticResumeSource,permutedAnalyticResumeSource,discoveryAuditSource};
if (require.main === module) main().catch(error=>{console.error(error);process.exitCode=1;});

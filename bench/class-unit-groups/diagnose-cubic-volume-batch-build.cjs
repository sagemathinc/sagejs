"use strict";
// Fresh source-copy experiments only: never changes the production registry.
const fs = require("node:fs"), path = require("node:path");
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const { conditionalSource } = require("./diagnose-cubic-conditional-build.cjs");
const hash = x => crypto.createHash("sha256").update(x).digest("hex");
function once(source, before, after) {
  assert.equal(source.split(before).length, 2, `unique replacement: ${before}`);
  return source.replace(before, after);
}
function volumeBatchSource(source, early = false) {
  const conditional = conditionalSource(source);
  const start = conditional.indexOf("def _cubic_conditional_centered_value(");
  const end = conditional.indexOf("\n\n@native", start);
  assert.ok(start >= 0 && end > start);
  const helper = conditional.slice(start, end).replaceAll(
    "_cubic_append_reduced_ideal_ellipsoid", "_cubic_append_volume_ideal_ellipsoid");
  const prepStart = source.indexOf("def _cubic_expansion_parameters(");
  const collectStart = source.indexOf("def _cubic_collect_expanded_shell_prefix(", prepStart);
  const collectEnd = source.indexOf("\n\n@native", collectStart);
  assert.ok(prepStart > 0 && collectStart > prepStart && collectEnd > collectStart);
  let prep = source.slice(prepStart, collectStart);
  prep = once(prep, `    bound = 8 * g00
    if 2 * g11 > bound:
        bound = 2 * g11
    if bound <= old_bound:
        return 0
`, "");
  prep = once(prep, "    if determinant <= 0 or c0 <= 0 or c1 <= 0 or c2 <= 0:",
    "    if g00 <= 0 or determinant <= 0 or c0 <= 0 or c1 <= 0 or c2 <= 0:");
  prep = once(prep, "    l0 = _cubic_ceil_sqrt(", `    # Exact T=478 volume policy; discovery bound, not a completeness bound.
    if 228484 * c2 * c2 * c2 < determinant * determinant:
        bound = _cubic_ceil_sqrt(228484 * c2)
    else:
        cube = 228484 * determinant
        bound = _cubic_floor_cube_root(cube)
        if bound < 0:
            return -1
        if bound * bound * bound < cube:
            bound += 1
    if 2 * g11 > bound:
        bound = 2 * g11
    if bound <= old_bound:
        return 0
    l0 = _cubic_ceil_sqrt(`);
  prep = prep.replaceAll("expanded[0,", "expanded[row,");
  const template = fs.readFileSync(path.join(__dirname, "cubic-volume-batch-template.py"), "utf8");
  const collector = template.slice(template.indexOf("def _cubic_collect_expanded_shell_prefix("));
  let result = source.slice(0, prepStart) + helper + "\n\n" + prep + collector + source.slice(collectEnd);
  result = once(result, "expanded_parameters = arena.foreign_resource(fmpz_matrix, 1, 11)",
    "expanded_parameters = arena.foreign_resource(fmpz_matrix, factor_count, 11)");
  result = once(result, "expanded_state = arena.foreign_resource(fmpz_matrix, 1, 6)",
    "expanded_state = arena.foreign_resource(fmpz_matrix, factor_count + 1, 6)");
  if (early) result = once(result,
    "elif relation_effort == 5 and (not staged_certification or factor_count == 12):",
    "elif relation_effort == 5 and not staged_certification:");
  return result;
}
function checkpointTraceSource(source) {
  const start = source.indexOf("def certified_complex_cubic_class_group_v1(");
  assert.ok(start > 0);
  let body = source.slice(start);
  body = once(body, "    temporary_limit: uint64,\n) -> bool:",
    "    temporary_limit: uint64,\n    diagnostic_trace: IntegerBuffer,\n) -> bool:");
  body = once(body, "    if (\n        len(output)",
    "    if len(diagnostic_trace) != 256:\n        return False\n    if (\n        len(output)");
  body = once(body, "        uncompacted_relation_count: uint64 = relation_count", `        diagnostic_trace[0] = relation_count
        diagnostic_trace[1] = modular_workspace[_CUBIC_MODULAR_RANK_OFFSET]
        diagnostic_trace[2] = relation_collection_target
        diagnostic_trace[4] = adjacent_phase
        diagnostic_trace[5] = adjacent_factor_cursor
        diagnostic_trace[6] = ellipsoid_count
        diagnostic_trace[7] = adjacent_planned_count
        diagnostic_trace[8] = adjacent_enumerated_count
        uncompacted_relation_count: uint64 = relation_count`);
  body = once(body, "                if staged_status == 1:", `                diagnostic_slot: uint64 = 16 + 8 * staged_attempt
                diagnostic_trace[3] += 1
                diagnostic_trace[diagnostic_slot] = relation_count
                diagnostic_trace[diagnostic_slot + 1] = class_number_upper
                diagnostic_trace[diagnostic_slot + 2] = staged_status
                diagnostic_trace[diagnostic_slot + 3] = output[63]
                diagnostic_trace[diagnostic_slot + 4] = output[59]
                if staged_status == 1:`);
  return source.slice(0, start) + body;
}
async function main() {
  const [rootArg, directoryArg, policy, trace, ...extra] = process.argv.slice(2);
  assert.ok(rootArg && directoryArg && ["baseline", "recovery", "early"].includes(policy) && !extra.length);
  assert.ok(trace === undefined || trace === "trace");
  assert.ok(policy !== "baseline" || trace === "trace");
  const root = path.resolve(rootArg), directory = path.resolve(directoryArg);
  fs.mkdirSync(directory);
  const source = fs.readFileSync(path.join(root, "src/lib/sagejs/number_fields/cubic_class_number_native.py"), "utf8");
  const sourcePath = path.join(directory, "volume-batch.py");
  const { formatPythonSource } = require(path.join(root, "tools/python-format.cjs"));
  let candidate = policy === "baseline" ? source : volumeBatchSource(source, policy === "early");
  if (trace) candidate = checkpointTraceSource(candidate);
  const text = formatPythonSource(candidate);
  fs.writeFileSync(sourcePath, text);
  const { compileKernel } = require(path.join(root, "tools/native-kernel/compiler.cjs"));
  const compiled = await compileKernel({ sourcePath, cacheRoot: path.join(directory, "cache") });
  const manifest = { schema: "sagejs.diagnostic/cubic-volume-batch-ablation-v1",
    promotion: false, public_receipt_qualified: false, production_source_sha256: hash(source),
    template_sha256: hash(fs.readFileSync(path.join(__dirname, "cubic-volume-batch-template.py"))),
    builder_sha256: hash(fs.readFileSync(__filename)), resource_limits_changed: false,
    acceptance_rule_changed: false, radius_policy: policy === "baseline" ? "baseline" : "exact-T478-recovery-only",
    ideal_visit_row_quota: policy === "baseline" ? null : 4, early_twelve_factor_checkpoint: policy === "early",
    checkpoint_trace: Boolean(trace),
    records: [{ name: `volume-batch-${policy}`, sourcePath, sourceSha256: hash(text),
      cacheKey: compiled.cacheKey, modulePath: compiled.modulePath }] };
  fs.writeFileSync(path.join(directory, "builds.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest));
}
module.exports = { volumeBatchSource, checkpointTraceSource };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });

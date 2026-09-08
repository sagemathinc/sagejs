"use strict";
// A separate source-copy phase; production source and acceptance are unchanged.
const fs = require("node:fs"), path = require("node:path");
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const { captureSource } = require("./diagnose-cubic-relation-capture-build.cjs");
function once(source, before, after) {
  assert.equal(source.split(before).length, 2, `source boundary drift: ${before.slice(0, 80)}`);
  return source.replace(before, after);
}
function expansionSource(source, helpers) {
  source = once(source, "and factor_count <= 11\n", "and factor_count <= 12\n");
  source = once(source, "        if staged_certification:\n            # Try the smaller prefix", "        if staged_certification and factor_count <= 11:\n            # Try the smaller prefix");
  source = once(source, "elif relation_effort == 5 and not staged_certification:", "elif relation_effort == 5 and (not staged_certification or factor_count == 12):");
  source = once(source, "            staged_attempt: uint64 = 0\n            while staged_attempt < 2:", "            expanded_parameters = arena.foreign_resource(fmpz_matrix, 1, 11)\n            staged_attempt: uint64 = 0\n            while staged_attempt < 3:");
  source = once(source, "                if staged_attempt != 0:\n                    return False\n", "                if staged_attempt >= 2:\n                    return False\n");
  const begin = source.indexOf("                relation_collection_target = factor_count + 22\n", source.indexOf("            while staged_attempt < 3:"));
  const end = source.indexOf("                if (\n                    online_relation_status < 0", begin);
  assert(begin > 0 && end > begin);
  const resume = source.slice(begin, end);
  const expansion = `                if staged_attempt == 1 or factor_count == 12:
                    if output[63] != 43 or output[59] != 434:
                        return False
                    staged_attempt = 1
                    relation_collection_target = presentation_storage_rows - 1
                    relation_count, online_relation_count, online_relation_status = _cubic_collect_expanded_shell(
                        workspace, modular_workspace, adjacent_order, adjacent_transforms,
                        adjacent_ellipsoid_parameters, expanded_parameters,
                        relation_candidates, relation_elements, hnf_source, hnf_result,
                        online_relation_basis, online_relation_source, online_relation_hnf,
                        relation_support, online_membership_coordinates, factor_count,
                        group_count, use_pari_permutation, relation_count,
                        online_relation_count, online_relation_status,
                        presentation_storage_rows, relation_collection_target,
                    )
                else:
` + resume.split("\n").map(line => line ? "    " + line : line).join("\n");
  source = source.slice(0, begin) + expansion + source.slice(end);
  return once(source, "\n@native\ndef certified_complex_cubic_class_group_v1(", "\n" + helpers + "\n@native\ndef certified_complex_cubic_class_group_v1(");
}
async function main() {
  const [rootArg, directoryArg, mode, ...extra] = process.argv.slice(2);
  assert(rootArg && directoryArg && !extra.length && (!mode || ["capture", "batch1", "batch4"].includes(mode)));
  const root = path.resolve(rootArg), directory = path.resolve(directoryArg);
  fs.mkdirSync(directory); // Never overwrite an earlier experiment.
  const source = fs.readFileSync(path.join(root, "src/lib/sagejs/number_fields/cubic_class_number_native.py"), "utf8");
  const helpers = fs.readFileSync(path.join(__dirname, "cubic-expanded-shell-experiment.py"), "utf8");
  let text = expansionSource(source, helpers);
  if (mode === "batch1" || mode === "batch4") {
    const width = mode === "batch1" ? 1 : 4;
    text = once(text,
      "                    relation_collection_target = presentation_storage_rows - 1\n",
      `                    relation_collection_target = relation_count + ${width}\n                    if relation_collection_target >= presentation_storage_rows:\n                        relation_collection_target = presentation_storage_rows - 1\n`);
  }
  if (mode === "capture") {
    const marker = "        uncompacted_relation_count: uint64 = relation_count\n";
    const captured = captureSource(text);
    const start = text.indexOf(marker);
    assert(start > 0);
    const block = captured.slice(start, start + captured.length - text.length);
    const indented = "                output[55] = previous_relation_count\n" + block.split("\n").map(line => line ? "        " + line : line).join("\n");
    text = once(text, "                staged_attempt += 1\n", indented + "                staged_attempt += 1\n");
  }
  const sourcePath = path.join(directory, "expansion.py");
  fs.writeFileSync(sourcePath, text);
  const { compileKernel } = require(path.join(root, "tools/native-kernel/compiler.cjs"));
  const compiled = await compileKernel({ sourcePath, cacheRoot: path.join(directory, "cache") });
  const record = { name: "resident_expanded_shell" + (mode ? "_" + mode : ""), sourcePath,
    sourceSha256: crypto.createHash("sha256").update(text).digest("hex"),
    cacheKey: compiled.cacheKey, modulePath: compiled.modulePath };
  const manifest = { schema: mode === "capture" ? "sagejs.diagnostic/raw-cubic-relation-capture-v1" : "sagejs.diagnostic/cubic-expansion-ablation-v1",
    diagnostic_only: true, can_certify: mode !== "capture", can_time_production: false,
    promotion: false, public_receipt_qualified: false, independent_exact_replay: false,
    acceptance_rule_changed: false, resource_limits_changed: false,
    additional_scratch: "one resident 1x11 integer matrix; existing arena limits unchanged",
    population: "existing staged regime plus factor-count twelve; no polynomial dispatch",
    records: [record] };
  fs.writeFileSync(path.join(directory, "builds.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest));
}
module.exports = { expansionSource };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });

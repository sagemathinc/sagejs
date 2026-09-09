"use strict";
// An isolated ablation, not a production policy: HNF dependencies without LLL.
const fs = require("node:fs"), path = require("node:path");
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const hash = value => crypto.createHash("sha256").update(value).digest("hex");

function unreducedRecoverySource(source) {
  const start = source.indexOf("def _cubic_relation_prefix_has_archimedean_unit(");
  const end = source.indexOf("\ndef ", start + 1);
  assert(start >= 0 && end > start, "recovery helper must exist");
  const body = source.slice(start, end);
  const reduction = `    if not fmpz_matrix_lll_transform_prefix(
        prefix_dependencies_reduced,
        prefix_dependency_transform,
        prefix_dependencies,
        dependency_count,
        relation_count,
    ):
        return -1
`;
  assert.equal(body.split(reduction).length, 2, "require exactly one recovery LLL boundary");
  const replacement = `    # Diagnostic only: retain the exact HNF kernel basis without LLL.
    dependency_row = 0
    while dependency_row < dependency_count:
        relation_index = 0
        while relation_index < relation_count:
            prefix_dependencies_reduced[dependency_row, relation_index] = (
                prefix_dependencies[dependency_row, relation_index]
            )
            relation_index += 1
        dependency_row += 1
`;
  return source.slice(0, start) + body.replace(reduction, replacement) + source.slice(end);
}

async function main() {
  const [rootArg, sourceArg, directoryArg, ...extra] = process.argv.slice(2);
  assert(rootArg && sourceArg && directoryArg && !extra.length);
  const root = path.resolve(rootArg), directory = path.resolve(directoryArg);
  fs.mkdirSync(directory);
  const original = fs.readFileSync(sourceArg, "utf8");
  const source = unreducedRecoverySource(original);
  const sourcePath = path.join(directory, "unreduced-recovery.py");
  fs.writeFileSync(sourcePath, source);
  const { compileKernel } = require(path.join(root, "tools/native-kernel/compiler.cjs"));
  const compiled = await compileKernel({ sourcePath, cacheRoot: path.join(directory, "cache") });
  const manifest = {
    schema: "sagejs.diagnostic/cubic-unreduced-recovery-ablation-v1",
    promotion: false, public_receipt_qualified: false, independent_exact_replay: false,
    certification_checks_changed: false, resource_limits_changed: false,
    acceptance_outcomes_may_change: true,
    inputSourceSha256: hash(original),
    sourceByteDelta: Buffer.byteLength(source) - Buffer.byteLength(original),
    records: [{ name: "unreduced_recovery", sourcePath, sourceSha256: hash(source),
      cacheKey: compiled.cacheKey, modulePath: compiled.modulePath }],
  };
  fs.writeFileSync(path.join(directory, "builds.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest));
}
module.exports = { unreducedRecoverySource };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });

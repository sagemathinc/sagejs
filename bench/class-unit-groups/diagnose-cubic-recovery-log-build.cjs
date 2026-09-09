"use strict";
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const crypto = require("node:crypto");

function recoveryLogSource(source) {
  const start = source.indexOf("def _cubic_relation_prefix_has_archimedean_unit(");
  const end = source.indexOf("\ndef ", start + 1);
  assert(start >= 0 && end > start);
  const body = source.slice(start, end);
  const first = body.indexOf("    relation_index: uint64 = 0\n    while relation_index < relation_count:\n");
  const last = body.indexOf("\n    unit_candidate_found = False", first);
  assert(first >= 0 && last > first);
  const loop = body.slice(first, last);
  assert.equal((loop.match(/_cubic_real_log_bounds\(/g) || []).length, 1);
  assert(loop.endsWith("        relation_index += 1\n"));
  const replacement = `    if not _cubic_fill_dependency_logs(
        coefficients,
        log_numerators,
        log_denominators,
        log_endpoints,
        relation_elements,
        prefix_logs,
        denominator,
        basis_zero_zero,
        basis_zero_one,
        basis_zero_two,
        basis_one_one,
        basis_one_two,
        basis_two_two,
        relation_count,
        True,
        dependency_scale,
        dependency_precision,
    ):
        return -1
    relation_index: uint64 = 0
`;
  return source.slice(0, start) + body.slice(0, first) + replacement + body.slice(last) + source.slice(end);
}

async function main() {
  const [rootArg, sourceArg, directoryArg, ...extra] = process.argv.slice(2);
  assert(rootArg && sourceArg && directoryArg && !extra.length);
  const root = path.resolve(rootArg), directory = path.resolve(directoryArg);
  fs.mkdirSync(directory);
  const original = fs.readFileSync(sourceArg, "utf8"), source = recoveryLogSource(original);
  const sourcePath = path.join(directory, "recovery-log.py");
  fs.writeFileSync(sourcePath, source);
  const { compileKernel } = require(path.join(root, "tools/native-kernel/compiler.cjs"));
  const compiled = await compileKernel({ sourcePath, cacheRoot: path.join(directory, "cache") });
  const hash = x => crypto.createHash("sha256").update(x).digest("hex");
  const manifest = { schema: "sagejs.diagnostic/cubic-recovery-log-ablation-v1",
    promotion: false, public_receipt_qualified: false, independent_exact_replay: false,
    acceptance_rule_changed: false, resource_limits_changed: false,
    inputSourceSha256: hash(original), sourceByteDelta: Buffer.byteLength(source) - Buffer.byteLength(original),
    records: [{ name: "recovery_batch_logs", sourcePath, sourceSha256: hash(source),
      cacheKey: compiled.cacheKey, modulePath: compiled.modulePath }] };
  fs.writeFileSync(path.join(directory, "builds.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest));
}
module.exports = { recoveryLogSource };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });

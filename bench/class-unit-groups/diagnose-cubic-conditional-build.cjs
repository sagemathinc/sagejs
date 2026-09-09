"use strict";
// Isolated source-copy experiment. No production index or source is modified.
const fs = require("node:fs"), path = require("node:path");
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const hash = x => crypto.createHash("sha256").update(x).digest("hex");

function conditionalSource(source) {
  const start = source.indexOf("def _cubic_append_reduced_ideal_ellipsoid(");
  const end = source.indexOf("\n\n@native", start);
  assert.ok(start >= 0 && end > start);
  const original = source.slice(start, end);
  const tailStart = original.indexOf("        if status == 1:\n");
  assert.ok(tailStart > 0);
  const template = fs.readFileSync(path.join(__dirname, "cubic-conditional-prefix-template.py"), "utf8");
  const helpers = template.slice(template.indexOf("def _cubic_conditional_centered_value("));
  const marker = "        # ORIGINAL_ADMISSION_AND_RETURN\n";
  assert.equal(helpers.split(marker).length, 2);
  assert.equal(helpers.indexOf("def _cubic_append_reduced_ideal_ellipsoid("), helpers.lastIndexOf("def _cubic_append_reduced_ideal_ellipsoid("));
  const replacement = helpers.replace(marker, original.slice(tailStart));
  return source.slice(0, start) + replacement + source.slice(end);
}

async function main() {
  const [rootArg, directoryArg, ...extra] = process.argv.slice(2);
  assert.ok(rootArg && directoryArg && !extra.length);
  const root = path.resolve(rootArg), directory = path.resolve(directoryArg);
  fs.mkdirSync(directory); // Never replace a previous experiment.
  const source = fs.readFileSync(path.join(root, "src/lib/sagejs/number_fields/cubic_class_number_native.py"), "utf8");
  const sourcePath = path.join(directory, "conditional.py");
  const { formatPythonSource } = require(path.join(root, "tools/python-format.cjs"));
  const text = formatPythonSource(conditionalSource(source));
  fs.writeFileSync(sourcePath, text);
  const { compileKernel } = require(path.join(root, "tools/native-kernel/compiler.cjs"));
  const compiled = await compileKernel({ sourcePath, cacheRoot: path.join(directory, "cache") });
  const record = { name: "conditional", sourcePath, sourceSha256: hash(text), cacheKey: compiled.cacheKey, modulePath: compiled.modulePath };
  const manifest = { schema: "sagejs.diagnostic/cubic-conditional-ablation-v1",
    promotion: false, public_receipt_qualified: false, production_source_sha256: hash(source),
    template_sha256: hash(fs.readFileSync(path.join(__dirname, "cubic-conditional-prefix-template.py"))),
    builder_sha256: hash(fs.readFileSync(__filename)),
    resource_limits_changed: false, acceptance_rule_changed: false,
    radius_policy_changed: false, cursor_encoding_changed: true,
    virtual_proposal_budget_preserved: true, records: [record] };
  fs.writeFileSync(path.join(directory, "builds.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest));
}
module.exports = { conditionalSource };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });

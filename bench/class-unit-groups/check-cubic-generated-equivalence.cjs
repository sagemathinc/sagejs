"use strict";
// Compare current lowering with an explicitly supplied, preserved native cache.
// Fix only the generated symbol identity; never reuse its compiler identity as
// a qualification receipt for the current compiler.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const root = path.resolve(__dirname, "../..");
const [baselinePath, ...extra] = process.argv.slice(2);
assert(baselinePath && extra.length === 0, "supply one baseline cache directory");
const baseline = path.resolve(baselinePath);
const hash = data => crypto.createHash("sha256").update(data).digest("hex");
const { lowerSource } = require(path.join(root, "tools/native-kernel/ir.cjs"));
const { createNativeImportResolver } = require(path.join(root, "tools/native-kernel/native-imports.cjs"));
const { generateArtifacts } = require(path.join(root, "tools/native-kernel/c-backend.cjs"));
(async () => {
  const before = JSON.parse(fs.readFileSync(path.join(baseline, "manifest.json")));
  const sourcePath = path.join(root, "src/lib/sagejs/number_fields/cubic_class_number_native.py");
  assert.equal(before.sourcePath, sourcePath, "baseline must use the same source path");
  const source = fs.readFileSync(sourcePath, "utf8");
  assert.equal(hash(source), before.sourceHash, "mathematical source must be unchanged");
  const ir = await lowerSource(source, sourcePath, {
    functions: ["certified_complex_cubic_class_group_v1"],
    resolveNativeImport: createNativeImportResolver({ root, lowerSource, initialSourcePath: sourcePath }),
  });
  // Compare the durable JSON representation: optional undefined properties
  // cannot survive the baseline manifest's JSON serialization.
  const irHash = hash(JSON.stringify(ir));
  assert.equal(irHash, hash(JSON.stringify(before.ir)), "serialized IR changed");
  const artifacts = generateArtifacts(ir, { moduleIdentity: before.moduleIdentity });
  const hashes = {};
  for (const [name, key] of [["kernel_core.c", "coreSource"], ["kernel_core.h", "coreHeader"], ["kernel.c", "adapterSource"]]) {
    const bytes = Buffer.from(artifacts[key]);
    assert(bytes.equals(fs.readFileSync(path.join(baseline, name))), `${name} changed`);
    hashes[name] = { bytes: bytes.length, sha256: hash(bytes) };
  }
  console.log(JSON.stringify({ status: "pass", baseline: before.cacheKey,
    source_sha256: hash(source), functions: ir.functions.length, ir_sha256: irHash,
    serialized_ir_equal: true, identity_fixed_for_comparison: true, artifacts: hashes,
    driver_sha256: hash(fs.readFileSync(__filename)),
  }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });

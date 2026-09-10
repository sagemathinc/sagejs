"use strict";

// Compile the identical mathematical input with an explicitly selected compiler
// checkout. This does not alter the source or publish a production kernel.
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const hash = (value) => createHash("sha256").update(value).digest("hex");

async function main() {
  const [compilerRoot, sourceArgument, destination, name, ...extra] = process.argv.slice(2);
  assert.ok(compilerRoot && sourceArgument && destination && name && extra.length === 0);
  assert.match(name, /^[a-z0-9_-]+$/);
  const root = path.resolve(compilerRoot);
  const sourcePath = path.resolve(sourceArgument);
  const directory = path.resolve(destination);
  fs.mkdirSync(directory); // Refuse to overwrite an earlier experiment.
  const before = fs.readFileSync(sourcePath);
  const started = process.hrtime.bigint();
  const compiled = await require(path.join(root, "tools/native-kernel/compiler.cjs"))
    .compileKernel({ sourcePath, cacheRoot: path.join(directory, "cache") });
  const compileMilliseconds = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(hash(fs.readFileSync(sourcePath)), hash(before));
  const artifactDirectory = path.dirname(compiled.modulePath);
  const manifest = JSON.parse(fs.readFileSync(path.join(artifactDirectory, "manifest.json")));
  assert.equal(manifest.sourceHash, hash(before));
  const indexCounts = { Integer: 0, uint64: 0 };
  function visit(items) {
    for (const op of items || []) {
      if (op.kind.startsWith("integer.vector.") && op.indexType in indexCounts) {
        indexCounts[op.indexType] += 1;
      }
      visit(op.setup);
      visit(op.body);
      visit(op.alternative);
      visit(op.condition?.operations);
      visit(op.right?.operations);
    }
  }
  for (const fn of manifest.ir.functions) visit(fn.body);
  const core = fs.readFileSync(path.join(artifactDirectory, "kernel_core.c"));
  const result = {
    schema: "sagejs.diagnostic/cubic-volume-batch-ablation-v1",
    promotion: false,
    public_receipt_qualified: false,
    production_source_sha256: hash(before),
    builder_sha256: hash(fs.readFileSync(__filename)),
    acceptance_rule_changed: false,
    resource_limits_changed: false,
    checkpoint_trace: false,
    compiler_root: root,
    compile_milliseconds: compileMilliseconds,
    vector_index_counts: indexCounts,
    generated_core_bytes: core.length,
    generated_core_sha256: hash(core),
    records: [{ name, sourcePath, sourceSha256: hash(before),
      cacheKey: compiled.cacheKey, modulePath: compiled.modulePath }],
  };
  fs.writeFileSync(path.join(directory, "builds.json"), JSON.stringify(result, null, 2));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

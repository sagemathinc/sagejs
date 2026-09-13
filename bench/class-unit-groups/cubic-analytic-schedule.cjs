"use strict";

// Diagnostic source copies only. Discovery cutoffs never authorize acceptance.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const declaration = "_CUBIC_ANALYTIC_THRESHOLD = 997\n";

function atCutoff(source, cutoff) {
  assert.ok(Number.isSafeInteger(cutoff) && cutoff >= 69 && cutoff < 1494,
    "initial cutoff must satisfy 69 <= X < 1494");
  assert.equal(cutoff % 9, 0, "cutoff must be a multiple of nine for the current BF formula");
  assert.equal(source.split(declaration).length, 2, "initial declaration drift");
  assert.equal(source.split("_CUBIC_ANALYTIC_REFINED_THRESHOLD = 1494\n").length,
    2, "refinement declaration drift");
  return source.replace(declaration, `_CUBIC_ANALYTIC_THRESHOLD = ${cutoff}\n`);
}

async function build(rootArg, sourceArg, destinationArg, cutoffArgs) {
  const root = path.resolve(rootArg), sourcePath = path.resolve(sourceArg);
  const destination = path.resolve(destinationArg);
  const cutoffs = cutoffArgs.map((text) => {
    assert.match(text, /^[1-9][0-9]*$/, "decimal cutoff required");
    return Number(text);
  });
  assert.ok(cutoffs.length > 0 && !cutoffs.includes(997), "997 is the implicit baseline");
  assert.equal(new Set(cutoffs).size, cutoffs.length, "duplicate cutoff");
  const source = fs.readFileSync(sourcePath, "utf8");
  const variants = [{ cutoff: 997, text: source },
    ...cutoffs.map((cutoff) => ({ cutoff, text: atCutoff(source, cutoff) }))];
  const { compileKernel } = require(path.join(root, "tools/native-kernel/compiler.cjs"));
  fs.mkdirSync(destination); // A fresh child; never overwrite previous evidence.
  const records = [];
  for (const { cutoff, text } of variants) {
    const selected = path.join(destination, `cutoff-${cutoff}.py`);
    fs.writeFileSync(selected, text);
    const compiled = await compileKernel({ sourcePath: selected,
      cacheRoot: path.join(destination, "cache") });
    assert.equal(hash(fs.readFileSync(selected)), hash(text), "source changed while compiling");
    records.push({ name: `cutoff_${cutoff}`, cutoff, sourcePath: selected,
      sourceSha256: hash(text), cacheKey: compiled.cacheKey, modulePath: compiled.modulePath });
    console.error(`compiled cutoff ${cutoff}: ${compiled.cacheKey}`);
  }
  assert.equal(hash(fs.readFileSync(sourcePath)), hash(source), "input source changed");
  const manifest = {
    schema: "sagejs.diagnostic/cubic-volume-batch-ablation-v1",
    promotion: false, public_receipt_qualified: false, independent_exact_replay: false,
    acceptance_rule_changed: false, resource_limits_changed: false,
    baseline_formula_qualified: false,
    formula_review: "997 baseline uses floor(X/9); candidates require exact integer X/9",
    // Legacy packager field means its supplied baseline, not production promotion.
    production_source_sha256: hash(source), baseline_source_path: sourcePath,
    compiler_root: root, builder_sha256: hash(fs.readFileSync(__filename)),
    baseline: records[0], records: records.slice(1),
  };
  fs.writeFileSync(path.join(destination, "builds.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

function summarize(report) {
  assert.equal(report.public_receipt_qualified, false);
  assert.equal(report.independent_exact_replay, false);
  assert.ok(report.records.length >= 2);
  const baseline = report.records.find((r) => r.name === "baseline");
  assert.ok(baseline, "missing baseline");
  return report.records.map((record) => {
    assert.equal(record.observations.length, baseline.observations.length);
    const result = { name: record.name, accepted: 0, errors: 0, gains: [], losses: [],
      thresholds: {}, discriminant_bits: {}, changed_relation_counts: 0 };
    record.observations.forEach((row, index) => {
      const old = baseline.observations[index];
      assert.deepEqual(row.coefficients, old.coefficients, "corpus order changed");
      assert.equal(row.label, old.label);
      assert.equal(row.h, old.h);
      assert.deepEqual(row.invariants, old.invariants);
      if (row.error) result.errors++;
      if (row.accepted && !old.accepted) result.gains.push(row.label);
      if (!row.accepted && old.accepted) result.losses.push(row.label);
      if (!row.accepted) return;
      result.accepted++;
      assert.equal(row.output[1], row.h);
      assert.deepEqual(row.output.slice(3, 3 + Number(row.output[2])).sort(), row.invariants);
      const threshold = row.output[36];
      result.thresholds[threshold] = (result.thresholds[threshold] || 0) + 1;
      if (old.accepted && row.output[23] !== old.output[23]) result.changed_relation_counts++;
      if (BigInt(row.output[47]) === 0n) return; // Nonanalytic acceptance.
      const d = BigInt(row.output[28]);
      assert.ok(d < 0n);
      const bits = (-d).toString(2).length;
      const bucket = result.discriminant_bits[bits] ||= { accepted: 0, refined: 0 };
      bucket.accepted++;
      if (threshold === "1494") bucket.refined++;
    });
    return result;
  });
}

async function main(args) {
  const [command, ...rest] = args;
  if (command === "build") {
    assert.ok(rest.length >= 4, "build COMPILER_ROOT SOURCE FRESH_DEST CUTOFF...");
    console.log(JSON.stringify(await build(rest[0], rest[1], rest[2], rest.slice(3))));
  } else if (command === "summarize") {
    assert.equal(rest.length, 1, "summarize CORPUS_REPORT");
    const bytes = fs.readFileSync(rest[0]);
    console.log(JSON.stringify({ diagnostic: true, input_sha256: hash(bytes),
      records: summarize(JSON.parse(bytes)) }, null, 2));
  } else {
    throw new Error("expected build or summarize");
  }
}

module.exports = { atCutoff, summarize };
if (require.main === module) main(process.argv.slice(2)).catch((error) => {
  console.error(error); process.exitCode = 1;
});

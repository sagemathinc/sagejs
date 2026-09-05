// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const { createNativeImportResolver } = require("../tools/native-kernel/native-imports.cjs");

const root = resolve(__dirname, "..");
const fixture = join(__dirname, "fixtures/cubic-bf-prefix.py");
const names = ["bf_exact_snapshot", "bf_prefix_schedule"];

function expandedFixture() {
  const production = readFileSync(join(root,
    "src/lib/sagejs/number_fields/cubic_class_number_native.py"), "utf8");
  const start = production.indexOf("\ndef _cubic_evaluate_bf_plan(") + 1;
  const end = production.indexOf("\ndef ", start + 1);
  assert.ok(start > 0 && end > start);
  const current = production.slice(start, end);
  const original = current.replace("def _cubic_evaluate_bf_plan(",
    "def _original_exact_bf_evaluation(").replace(
      "integer_log_sqrt_balls_prefix_resource(\n        analytic_endpoints,\n        analytic_values,\n        analytic_value_count,",
      "integer_log_sqrt_balls_resource(\n        analytic_endpoints,\n        analytic_values,",
    );
  assert.doesNotMatch(original, /integer_log_sqrt_balls_prefix_resource/);
  // The oracle is the previous exact-shape operation, not a separately
  // reimplemented BF formula. Every mathematical helper is actual source.
  return production + "\n" + original + "\n" + readFileSync(fixture, "utf8");
}

test("BF prefix evaluation stays in one closed fmpz allocation scope", async () => {
  const ir = await lowerSource(expandedFixture(), fixture, {
    functions: names,
    resolveNativeImport: createNativeImportResolver({ root, lowerSource,
      initialSourcePath: fixture }),
  });
  for (const fn of ir.functions) {
    assert.equal(fn.analysis.backend.kind, "fmpz", fn.name);
    assert.equal(fn.analysis.liveExactWorkspace?.scopes.length || 0,
      names.includes(fn.name) ? 1 : 0, fn.name);
  }
  assert.ok(ir.callGraph.bf_prefix_schedule.includes("_cubic_prepare_bf_plan"));
  assert.ok(ir.callGraph.bf_prefix_schedule.includes("_cubic_evaluate_bf_plan"));
});

test("actual BF plans agree after grow/shrink reuse and changed class-bound deduplication", {
  timeout: 240_000,
}, async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-cubic-bf-prefix-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const sourcePath = join(temporary, "bf_prefix.py");
  writeFileSync(sourcePath, expandedFixture());
  const compiled = await compileKernel({ sourcePath, functions: names,
    cacheRoot: join(temporary, "cache") });
  const result = spawnSync(process.execPath, ["-e", String.raw`
const assert = require("node:assert/strict");
const module = require(process.argv[1]);
const exact = module.bf_exact_snapshot;
const reused = module.bf_prefix_schedule;
const parameters = [[997, 1n], [1494, 2n], [997, 3n], [997, 1n]];
let reference;
for (const backend of ["javascript", "gmp", "fmpz"]) {
  const polynomial = exact.packIntegerBuffer([-1n, -1n, 0n, 1n], 8);
  const full = reused.createIntegerBuffer(4 * 4096, 8);
  assert.equal(reused[backend](polynomial, full), true);
  const observations = full.toArray();
  const valueCounts = [];
  for (let stage = 0; stage < parameters.length; stage++) {
    const [threshold, classUpper] = parameters[stage];
    const out = exact.createIntegerBuffer(4096, 8);
    assert.equal(exact[backend](polynomial, out, threshold, classUpper), true);
    const got = observations.slice(stage * 4096, (stage + 1) * 4096);
    assert.deepEqual(got, out.toArray(), backend + " stage " + stage);
    assert.ok(got[2] <= got[3]);
    assert.ok(got[4] >= 0n);
    const terms = Number(got[0]), values = Number(got[1]);
    valueCounts.push(values);
    assert.equal(got[5 + 4], classUpper);
    let classSeedUsed = false;
    for (let term = 0; term < terms; term++) {
      const termOffset = 1285 + 5 * term;
      const norm = got[termOffset + 2];
      const valueIndex = Number(got[termOffset + 4]);
      assert.ok(valueIndex >= 0 && valueIndex < values);
      assert.equal(got[5 + valueIndex], norm);
      if (norm === classUpper) {
        assert.equal(valueIndex, 4, "deduplicated class bound must use seed slot 4");
        classSeedUsed = true;
      }
    }
    if (classUpper === 2n) assert.equal(classSeedUsed, true);
  }
  assert.ok(valueCounts[1] > valueCounts[0]);
  assert.ok(valueCounts[2] < valueCounts[1]);
  assert.deepEqual(observations.slice(0, 4096), observations.slice(3 * 4096));
  if (reference) assert.deepEqual(observations, reference);
  reference = observations;
  assert.deepEqual(polynomial.toArray(), [-1n, -1n, 0n, 1n]);
  console.log(backend + " BF live value counts: " + valueCounts.join(", "));
}
`, compiled.modulePath], { cwd: root, encoding: "utf8", timeout: 180_000 });
  assert.equal(result.status, 0, `${result.error || ""}\n${result.stdout}${result.stderr}`);
  console.log(result.stdout.trim());
});

#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const root = path.resolve(__dirname, "../..");
const sourcePath = path.join(__dirname, "pari_unified_complete_h1_root.py");
const residentSourcePath = path.join(__dirname, "resident_generated_class_attempt.py");
const residentCheckerPath = path.join(__dirname, "check_resident_generated_class_attempt.cjs");
const bridgeCheckerPath = path.join(__dirname, "check_live_h1_owner_bridge.cjs");

function signature(source, entry) {
  const match = source.match(new RegExp(`def ${entry}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing ${entry} signature`);
  return match[1].trim().split("\n")
    .map(line => line.trim().replace(/,$/, "").split(": "));
}

function values(value) {
  return Array.isArray(value) ? value
    : value.toArray ? value.toArray() : Array.from(value);
}

const classSizes = Object.freeze({
  class_hnf_transform_inverse: 225,
  class_hnf_inverse_augmented: 450,
  class_hnf_inverse_state: 5,
  class_relation_to_presentation_scratch: 120,
  class_presentation_to_relation_scratch: 120,
  class_relation_witness_state: 8,
  class_presentation_scratch: 64,
  class_smith_scratch: 64,
  class_left_scratch: 64,
  class_left_inverse_scratch: 64,
  class_right_scratch: 64,
  class_ur_scratch: 64,
  class_y_scratch: 64,
  class_uir_scratch: 64,
  class_x_scratch: 64,
  class_m1_scratch: 64,
  class_m2_scratch: 64,
  class_invariants_scratch: 8,
  class_class_number_scratch: 1,
  class_smith_column_scratch: 8,
  class_right_inverse_scratch: 64,
  class_smith_augmented_scratch: 128,
  class_left_inverse_state: 5,
  class_right_inverse_state: 5,
  class_first_division_state: 6,
  class_second_division_state: 6,
  class_smith_state: 7,
  class_binding_state: 9,
  class_published_presentation: 64,
  class_published_smith: 64,
  class_published_left: 64,
  class_published_left_inverse: 64,
  class_published_right: 64,
  class_published_right_inverse: 64,
  class_published_relation_to_presentation: 120,
  class_published_presentation_to_relation: 120,
  class_published_state: 16,
});

const precisionSizes = Object.freeze({
  precision_kernel_relation_map: 511,
  precision_retained_relation_map: 146,
  precision_kernel_factors: 21,
  precision_exact_units_integral: 6,
  precision_exact_units_power: 6,
  precision_exact_norms: 2,
  precision_root_m: 3,
  precision_root_p: 3,
  precision_root_e: 3,
  precision_embedding_m: 9,
  precision_embedding_p: 9,
  precision_embedding_e: 9,
  precision_embedding_state: 4,
  precision_atom_logs: 1533,
  precision_transformed_logs: 42,
  precision_clean_scratch: 42,
  precision_clean_result: 42,
  precision_rebuilt_logs: 42,
  precision_phase_scratch: 6,
  precision_rebuilt_phases: 6,
  precision_log_cache: 3,
  precision_pi_cache: 3,
  precision_transcendental_a: 512,
  precision_transcendental_b: 512,
  precision_transcendental_p: 512,
  precision_transcendental_q: 512,
  precision_transcendental_stack: 128,
  precision_clean_state: 4,
  precision_precision_state: 5,
  precision_determinant_values: 12,
  precision_determinant_work: 12,
  precision_determinant_output: 3,
  precision_determinant_pivots: 1,
  precision_determinant_state: 5,
  precision_authority_state: 8,
});

const finalSizes = Object.freeze({
  torsion_order: 1,
  torsion_generator: 3,
  torsion_state: 6,
  final_polynomial: 4,
  final_presentation: 64,
  final_smith: 64,
  final_left: 64,
  final_left_inverse: 64,
  final_right: 64,
  final_right_inverse: 64,
  final_relation_to_presentation: 120,
  final_presentation_to_relation: 120,
  final_compact_provenance: 14,
  final_retained_relation_map: 146,
  final_exact_units: 6,
  final_exact_norms: 2,
  final_regulator: 3,
  final_torsion_order: 1,
  final_torsion_generator: 3,
  final_invariants: 8,
  final_state: 16,
});

async function main() {
  const fixturePaths = process.argv.slice(2, 5);
  assert.equal(fixturePaths.length, 3, "prepared, analytic and Kummer fixtures required");

  // The resident sanitizer admits only prepared-field inputs and fresh owners.
  const prepared = spawnSync(process.execPath, [residentCheckerPath, ...fixturePaths], {
    cwd: root,
    encoding: "utf8",
    timeout: 900_000,
    maxBuffer: 128 * 1024 * 1024,
  });
  assert.equal(prepared.status, 0, prepared.stderr || String(prepared.error));
  const receipt = JSON.parse(prepared.stdout.trim().split("\n").at(-1));
  const sanitized = JSON.parse(fs.readFileSync(path.join(receipt.directory, "inputs.json"), "utf8"));

  const source = fs.readFileSync(sourcePath, "utf8");
  const names = signature(source, "pari_unified_complete_h1_root");
  const residentNames = signature(fs.readFileSync(residentSourcePath, "utf8"),
    "pari_resident_generated_class_attempt");
  assert.equal(residentNames.length, 351);
  assert.deepEqual(names.slice(0, 351), residentNames);

  const bridgeChecker = fs.readFileSync(bridgeCheckerPath, "utf8");
  const sizesLiteral = bridgeChecker.match(/const sizes = (\{[\s\S]*?\n\});/);
  assert(sizesLiteral, "missing bridge workspace sizes");
  const vm = require("node:vm");
  const bridgeSizes = vm.runInNewContext(`(${sizesLiteral[1]})`, {
    columnCapacity: 16,
  });
  const sizes = { ...bridgeSizes, ...classSizes, ...precisionSizes, ...finalSizes,
    bridge_prep_state: 8, unified_state: 12 };
  const candidate = sanitized.input;
  const input = {};
  const finalNames = new Set(Object.keys(finalSizes).filter(name => name.startsWith("final_")));
  const int64Names = new Set(names.filter(([, kind]) => kind === "Int64Buffer").map(([name]) => name));
  for (const [name, kind] of names) {
    if (Object.hasOwn(candidate, name)) {
      input[name] = structuredClone(candidate[name]);
    } else {
      const size = sizes[name];
      assert(Number.isInteger(size), `missing size for ${name}`);
      let fill = finalNames.has(name) ? 777 : 0;
      input[name] = Array(size).fill(fill);
    }
    if (name === "precision_authority_state") {
      // An answer-shaped external success must be destroyed, never trusted.
      input[name] = [0, 7, 2, 1, 1, 1, 0, 1];
    }
    if (Array.isArray(input[name])) {
      input[name] = kind === "Float64Buffer"
        ? input[name].map(Number) : input[name].map(BigInt);
    } else if (kind === "float") input[name] = Number(input[name]);
    else if (kind === "bool") input[name] = Boolean(input[name]);
    else input[name] = BigInt(input[name]);
  }
  input.final_state.fill(0n);
  const finalBefore = Object.fromEntries([...finalNames]
    .filter(name => name !== "final_state")
    .map(name => [name, values(input[name]).map(BigInt)]));

  const built = await compileKernel({ sourcePath });
  const fn = require(built.modulePath).pari_unified_complete_h1_root;
  assert(fn.nativeAvailable);
  const status = fn.gmp(...names.map(([name]) => input[name]));
  assert.equal(status, 4n);
  assert.deepEqual(values(input.final_state).map(BigInt), [
    4n, 0n, 0n, 0n, -1n, 4n, 73n, 8n,
    1n, 0n, 2n, 2n, 0n, 0n, 0n, 0n,
  ]);
  assert.deepEqual(values(input.unified_state).map(BigInt), [
    0n, 0n, 0n, 1n, 0n, 7n, 73n, 8n, 48n, 48n, 2n, 7n,
  ]);
  assert.deepEqual(values(input.class_published_state).slice(0, 16).map(BigInt), [
    0n, 8n, 15n, 7n, 120n, 450n, 64n, 320n,
    1n, 0n, 0n, 0n, 120n, 120n, 192n, 624n,
  ]);
  assert.deepEqual(values(input.torsion_order).map(BigInt), [2n]);
  assert.deepEqual(values(input.torsion_generator).map(BigInt), [-1n, 0n, 0n]);
  assert.equal(values(input.torsion_state)[5], 1n);
  assert.deepEqual(values(input.precision_authority_state).map(BigInt),
    [-1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]);
  for (const [name, expected] of Object.entries(finalBefore)) {
    assert.deepEqual(values(input[name]).map(BigInt), expected,
      `${name} changed before final publication`);
  }

  // The inherited analytic scalars are policy inputs only after the native
  // root authenticates them against the neutral polynomial.
  input.final_state.fill(0n);
  input.analytic_discriminant += 1n;
  assert.throws(() => fn.gmp(...names.map(([name]) => input[name])),
    /analytic scalars are inconsistent/);
  for (const [name, expected] of Object.entries(finalBefore)) {
    assert.deepEqual(values(input[name]).map(BigInt), expected,
      `${name} changed after analytic-scalar mutation`);
  }

  // The new torsion leaf is independently differential-tested and fails
  // transactionally for reducible/non-real mutations.
  const torsion = require(built.modulePath).pari_exact_real_cubic_torsion;
  const jsOrder = [0n], jsGenerator = [0n, 0n, 0n], jsState = Array(6).fill(0n);
  assert.equal(torsion.javascript([20034n, -20018n, 0n, 1n],
    jsOrder, jsGenerator, jsState), 0n);
  assert.deepEqual(jsOrder, [2n]);
  assert.deepEqual(jsGenerator, [-1n, 0n, 0n]);
  for (const polynomial of [[0n, -20018n, 0n, 1n], [1n, 0n, 0n, 1n]]) {
    const order = [91n], generator = [91n, 91n, 91n], state = [91n, 91n, 91n, 91n, 91n, 91n];
    assert.notEqual(torsion.gmp(polynomial, order, generator, state), 0n);
    assert.deepEqual(order, [91n]);
    assert.deepEqual(generator, [91n, 91n, 91n]);
    assert.deepEqual(state, [91n, 91n, 91n, 91n, 91n, 91n]);
  }
  const dynamic = spawnSync("python3", ["-c", String.raw`
import importlib,sys
sys.path.insert(0,sys.argv[1]);sys.path.append(sys.argv[1]+'/src/lib')
m=importlib.import_module('bench.pari-class-group-port.pari_unified_complete_h1_root')
for f,expected in (([20034,-20018,0,1],0),([0,-20018,0,1],1),([1,0,0,1],2)):
 o=[91];g=[91,91,91];s=[91]*6;r=m.pari_exact_real_cubic_torsion(f,o,g,s)
 assert r==expected
 if r==0: assert o==[2] and g==[-1,0,0] and s[5]==1
 else: assert o==[91] and g==[91,91,91] and s==[91]*6
print('cpython torsion differential and mutations passed')
`, root], { cwd: root, encoding: "utf8", timeout: 120_000 });
  assert.equal(dynamic.status, 0, dynamic.stderr || String(dynamic.error));

  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  assert.match(core, /pari_unified_live_h1_root/);
  assert.match(core, /pari_live_h1_class_witness_suffix/);
  assert.match(core, /pari_exact_real_cubic_torsion/);
  assert.doesNotMatch(core, /pari_unified_full_h1_suffix/);
  assert.doesNotMatch(core, /napi_call_function|PyObject_Call|v8::/);
  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/unified-complete-h1-frontier-v1",
    field: "x^3-20018*x+20034",
    nativeStatus: String(status),
    missingStage: "live-precision-suffix",
    prefixPublished: true,
    classWitnessPublished: true,
    exactTorsionPublished: true,
    externalSuffixAuthorityRejected: true,
    finalPublication: false,
    finalOutputsUnchanged: true,
    cpython: dynamic.stdout.trim(),
    cacheKey: built.cacheKey,
  }));
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

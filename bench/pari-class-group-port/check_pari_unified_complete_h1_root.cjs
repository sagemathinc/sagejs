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

// Deliberately independent storage ceilings.  None equals the successful
// field's 8 x 15 class block, 73 relations, or seven compact factors.  The
// kernel must obtain logical extents from its authenticated live states and
// leave all padded cells untouched.
const storagePolicy = Object.freeze({
  degree: 3,
  classRows: 12,
  classColumns: 24,
  relations: 96,
  compactFactors: 12,
  unitRank: 4,
});
const classSquareCapacity = storagePolicy.classRows ** 2;
const classRelationCapacity = storagePolicy.classRows * storagePolicy.classColumns;
const classTransformCapacity = storagePolicy.classColumns ** 2;

const classSizes = Object.freeze({
  class_hnf_transform_inverse: classTransformCapacity,
  class_hnf_inverse_augmented: 2 * classTransformCapacity,
  class_hnf_inverse_state: 5,
  class_relation_to_presentation_scratch: classRelationCapacity,
  class_presentation_to_relation_scratch: classRelationCapacity,
  class_relation_witness_state: 8,
  class_presentation_scratch: classSquareCapacity,
  class_smith_scratch: classSquareCapacity,
  class_left_scratch: classSquareCapacity,
  class_left_inverse_scratch: classSquareCapacity,
  class_right_scratch: classSquareCapacity,
  class_ur_scratch: classSquareCapacity,
  class_y_scratch: classSquareCapacity,
  class_uir_scratch: classSquareCapacity,
  class_x_scratch: classSquareCapacity,
  class_m1_scratch: classSquareCapacity,
  class_m2_scratch: classSquareCapacity,
  class_invariants_scratch: storagePolicy.classRows,
  class_class_number_scratch: 1,
  class_smith_column_scratch: storagePolicy.classRows,
  class_right_inverse_scratch: classSquareCapacity,
  class_smith_augmented_scratch: 2 * classSquareCapacity,
  class_left_inverse_state: 5,
  class_right_inverse_state: 5,
  class_first_division_state: 6,
  class_second_division_state: 6,
  class_smith_state: 7,
  class_binding_state: 9,
  class_published_presentation: classSquareCapacity,
  class_published_smith: classSquareCapacity,
  class_published_left: classSquareCapacity,
  class_published_left_inverse: classSquareCapacity,
  class_published_right: classSquareCapacity,
  class_published_right_inverse: classSquareCapacity,
  class_published_relation_to_presentation: classRelationCapacity,
  class_published_presentation_to_relation: classRelationCapacity,
  class_published_state: 16,
});

const precisionSizes = Object.freeze({
  precision_kernel_relation_map: storagePolicy.compactFactors * storagePolicy.relations,
  precision_retained_relation_map: storagePolicy.unitRank * storagePolicy.relations,
  precision_kernel_factors: storagePolicy.degree * storagePolicy.compactFactors,
  precision_exact_units_integral: storagePolicy.degree * storagePolicy.unitRank,
  precision_exact_units_power: storagePolicy.degree * storagePolicy.unitRank,
  precision_exact_norms: storagePolicy.unitRank,
  precision_root_m: 6,
  precision_root_p: 6,
  precision_root_e: 6,
  precision_embedding_m: 9,
  precision_embedding_p: 9,
  precision_embedding_e: 9,
  precision_embedding_state: 4,
  precision_atom_logs: 21 * storagePolicy.relations,
  precision_transformed_logs: 7 * storagePolicy.degree * storagePolicy.unitRank,
  precision_clean_scratch: 7 * storagePolicy.degree * storagePolicy.unitRank,
  precision_clean_result: 7 * storagePolicy.degree * storagePolicy.unitRank,
  precision_rebuilt_logs: 7 * storagePolicy.degree * storagePolicy.unitRank,
  precision_phase_scratch: storagePolicy.degree * storagePolicy.unitRank,
  precision_rebuilt_phases: storagePolicy.degree * storagePolicy.unitRank,
  precision_log_cache: 3,
  precision_pi_cache: 3,
  precision_transcendental_a: 512,
  precision_transcendental_b: 512,
  precision_transcendental_p: 512,
  precision_transcendental_q: 512,
  precision_transcendental_stack: 128,
  precision_clean_state: 4,
  precision_precision_state: 5,
  precision_determinant_values: 3 * storagePolicy.unitRank ** 2,
  precision_determinant_work: 3 * storagePolicy.unitRank ** 2,
  precision_determinant_output: 3,
  precision_determinant_pivots: 1,
  precision_determinant_state: 5,
  precision_authority_state: 16,
  precision_resident_root_m: 3,
  precision_resident_root_p: 3,
  precision_resident_root_e: 3,
  precision_staged_retry_relations: storagePolicy.unitRank * storagePolicy.relations,
  precision_embedding_packed: 27,
  precision_getfu_clean_logs: 18,
  precision_getfu_clean_phases: 6,
  precision_getfu_factor: 4,
  precision_getfu_matep: 18,
  precision_getfu_transformed_arch: 18,
  precision_getfu_transformed_clean: 18,
  precision_getfu_transformed_phases: 6,
  precision_getfu_exponentials: 18,
  precision_getfu_solve_work: 27,
  precision_getfu_solve_rhs: 18,
  precision_getfu_solved: 18,
  precision_getfu_rounded: 6,
  precision_getfu_multiplication: 9,
  precision_getfu_inverse: 3,
  precision_getfu_candidate_units: 6,
  precision_getfu_normalized_factor: 4,
  precision_staged_getfu_units: 6,
  precision_staged_getfu_logs: 18,
  precision_staged_getfu_phases: 6,
  precision_staged_getfu_factor: 4,
  precision_getfu_state: 8,
  precision_getfu_pivots: 3,
  precision_getfu_exp_cache: 512,
  precision_getfu_exp_a: 512,
  precision_getfu_exp_b: 512,
  precision_getfu_exp_p: 512,
  precision_getfu_exp_q: 512,
  precision_getfu_exp_stack: 128,
  precision_retry_state: 6,
  precision_published_retained_relations: storagePolicy.unitRank * storagePolicy.relations,
  precision_published_logs: 18,
  precision_published_phases: 6,
});

const finalSizes = Object.freeze({
  torsion_order: 1,
  torsion_generator: 3,
  torsion_state: 6,
  final_polynomial: 4,
  final_presentation: classSquareCapacity,
  final_smith: classSquareCapacity,
  final_left: classSquareCapacity,
  final_left_inverse: classSquareCapacity,
  final_right: classSquareCapacity,
  final_right_inverse: classSquareCapacity,
  final_relation_to_presentation: classRelationCapacity,
  final_presentation_to_relation: classRelationCapacity,
  final_compact_provenance: storagePolicy.unitRank * storagePolicy.compactFactors,
  final_retained_relation_map: storagePolicy.unitRank * storagePolicy.relations,
  final_exact_units: storagePolicy.degree * storagePolicy.unitRank,
  final_exact_norms: storagePolicy.unitRank,
  final_regulator: 3,
  final_torsion_order: 1,
  final_torsion_generator: 3,
  final_invariants: storagePolicy.classRows,
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
    unified_state: 12 };
  const candidate = sanitized.input;
  const input = {};
  const finalNames = new Set(Object.keys(finalSizes).filter(name => name.startsWith("final_")));
  const int64Names = new Set(names.filter(([, kind]) => kind === "Int64Buffer").map(([name]) => name));
  for (const [name, kind] of names) {
    if (Object.hasOwn(candidate, name)) {
      input[name] = structuredClone(candidate[name]);
    } else if (name === "precision_resource_cap") {
      input[name] = 192n;
    } else {
      const size = sizes[name];
      assert(Number.isInteger(size), `missing size for ${name}`);
      let fill = finalNames.has(name) ? 777 : 0;
      input[name] = Array(size).fill(fill);
    }
    if (name === "precision_authority_state") {
      // An answer-shaped external success must be destroyed, never trusted.
      input[name] = [0, 5, 2304, 0, 3, 73, 15, 7, 2, 7, 2, 0, 0, 0, 1, 4096];
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
  // Zero-filled JavaScript arrays are packed with the ordinary eight-word
  // minimum.  Retry owners hold 2000+-bit exact units, so declare their bound
  // explicitly just as the standalone live-suffix checker does.
  for (const [name, kind] of names) {
    if (kind === "IntegerBuffer" &&
        (name.startsWith("precision_") || name.startsWith("final_"))) {
      input[name] = fn.createIntegerBuffer(input[name].length, 128, input[name]);
    }
  }

  // A caller cap at the initial 192 bits cannot reach signed getfu success.
  // Prefix and exact class evidence may publish internally, but the immutable
  // terminal bundle remains byte-for-byte untouched.
  const cappedStatus = fn.gmp(...names.map(([name]) => input[name]));
  assert.equal(cappedStatus, 4n);
  assert.deepEqual(values(input.final_state).map(BigInt), [
    4n, 0n, 0n, -1n, 1n, 4n, 73n, 8n,
    1n, 0n, 2n, 0n, 0n, 0n, 0n, 0n,
  ]);
  assert.deepEqual(values(input.unified_state).map(BigInt), [
    0n, 0n, 0n, 1n, 0n, 7n, 73n, 8n, 48n, 48n, 2n, 7n,
  ]);
  assert.deepEqual(values(input.class_published_state).slice(0, 16).map(BigInt), [
    0n, 8n, 15n, 7n, 120n, 450n, 64n, 320n,
    1n, 0n, 0n, 0n, 120n, 120n, 192n, 624n,
  ]);
  assert.deepEqual(values(input.precision_authority_state).map(BigInt).slice(0, 5),
    [1n, 1n, 192n, 3n, 3n]);
  assert.equal(values(input.precision_authority_state)[14], 0n);
  for (const [name, expected] of Object.entries(finalBefore)) {
    assert.deepEqual(values(input[name]).map(BigInt), expected,
      `${name} changed before final publication`);
  }

  // The root's shape authority is a conjunction of independently produced
  // prefix states.  Every forged logical dimension is rejected without
  // rewriting the supplied authority buffers.
  const authenticate = require(built.modulePath).pari_authenticate_h1_live_dimensions;
  assert(authenticate.nativeAvailable);
  const liveDimensionState = {
    unified_state: values(input.unified_state).slice(0, 12).map(BigInt),
    bridge_state: values(input.bridge_state).slice(0, 16).map(BigInt),
    hnf_state: values(input.hnf_state).slice(0, 9).map(BigInt),
    hnf_assembly_state: values(input.hnf_assembly_state).slice(0, 6).map(BigInt),
  };
  assert.equal(authenticate.gmp(...Object.values(liveDimensionState)), 0n);
  for (const [owner, index] of [
    ["unified_state", 6],
    ["bridge_state", 8],
    ["hnf_state", 7],
    ["hnf_assembly_state", 0],
    ["hnf_assembly_state", 2],
    ["hnf_assembly_state", 4],
  ]) {
    const forged = structuredClone(liveDimensionState);
    forged[owner][index] += 1n;
    const before = structuredClone(forged);
    assert.equal(authenticate.gmp(...Object.values(forged)), 1n,
      `forged ${owner}[${index}] accepted`);
    assert.deepEqual(forged, before, `dimension authority mutated ${owner}`);
  }

  // Mutation after the prefix/class boundary cannot be hidden by successful
  // caller-shaped authority bytes: exact relation replay rejects it and the
  // terminal owners remain unchanged.
  const originalGenerator = input.generators[0];
  input.generators[0] += 1n;
  input.precision_resource_cap = 4096n;
  input.final_state.fill(0n);
  assert.throws(() => fn.gmp(...names.map(([name]) => input[name])),
    /nonintegral principal relation quotient|live kernel relation did not reconstruct a unit|getfu unit detached/);
  for (const [name, expected] of Object.entries(finalBefore)) {
    assert.deepEqual(values(input[name]).map(BigInt), expected,
      `${name} changed after generator mutation`);
  }
  input.generators[0] = originalGenerator;

  // With the source-policy cap available, the same in-memory owners retry to
  // 2304 bits, publish exact units/regulator/torsion, and commit final_state
  // last.  Public completion deliberately remains false.
  input.final_state.fill(0n);
  const status = fn.gmp(...names.map(([name]) => input[name]));
  assert.equal(status, 0n);
  assert.deepEqual(values(input.final_state).map(BigInt), [
    0n, 0n, 0n, 0n, 0n, 0n, 73n, 8n,
    1n, 0n, 2n, 2n, 1n, 811n, 1n, 0n,
  ]);
  assert.deepEqual(values(input.precision_authority_state).map(BigInt).slice(0, 5),
    [0n, 5n, 2304n, 0n, 3n]);
  assert.equal(values(input.precision_authority_state)[14], 1n);
  const classRows = Number(values(input.class_published_state)[1]);
  const classColumns = Number(values(input.class_published_state)[2]);
  const relationCount = Number(values(input.final_state)[6]);
  const unitRank = Number(values(input.final_state)[10]);
  const compactFactors = Number(values(input.bridge_state)[13]);
  assert.deepEqual(values(input.final_exact_norms).slice(0, unitRank).map(BigInt),
    [-1n, -1n]);
  assert.deepEqual(values(input.final_torsion_order).map(BigInt), [2n]);
  assert.deepEqual(values(input.final_torsion_generator).map(BigInt), [-1n, 0n, 0n]);
  assert(values(input.final_exact_units).slice(0, storagePolicy.degree * unitRank)
    .some(value => BigInt(value) !== 0n));
  assert(values(input.final_regulator).slice(0, 3)
    .some(value => BigInt(value) !== 0n));
  assert.notDeepEqual(values(input.final_polynomial).slice(0, storagePolicy.degree + 1)
    .map(BigInt), finalBefore.final_polynomial.slice(0, storagePolicy.degree + 1));

  // Successful publication writes only live logical prefixes.  Policy-sized
  // padding is neither interpreted as a dimension nor overwritten.
  const logicalFinalSizes = {
    final_polynomial: storagePolicy.degree + 1,
    final_presentation: classRows ** 2,
    final_smith: classRows ** 2,
    final_left: classRows ** 2,
    final_left_inverse: classRows ** 2,
    final_right: classRows ** 2,
    final_right_inverse: classRows ** 2,
    final_relation_to_presentation: classRows * classColumns,
    final_presentation_to_relation: classRows * classColumns,
    final_compact_provenance: unitRank * compactFactors,
    final_retained_relation_map: unitRank * relationCount,
    final_exact_units: storagePolicy.degree * unitRank,
    final_exact_norms: unitRank,
    final_regulator: 3,
    final_torsion_order: 1,
    final_torsion_generator: storagePolicy.degree,
    final_invariants: classRows,
  };
  for (const [name, logicalSize] of Object.entries(logicalFinalSizes)) {
    assert.deepEqual(values(input[name]).slice(logicalSize).map(BigInt),
      finalBefore[name].slice(logicalSize), `${name} padding was overwritten`);
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
  assert.match(core, /pari_live_retrying_h1_suffix/);
  assert.doesNotMatch(core, /napi_call_function|PyObject_Call|v8::/);
  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/unified-complete-h1-internal-v2",
    field: "x^3-20018*x+20034",
    nativeStatus: String(status),
    retryPrecision: String(values(input.precision_authority_state)[2]),
    prefixPublished: true,
    classWitnessPublished: true,
    exactTorsionPublished: true,
    cappedFinalOutputsUnchanged: true,
    generatorMutationRejected: true,
    internalCorrespondenceComplete: true,
    finalPublication: true,
    publicComplete: false,
    cpython: dynamic.stdout.trim(),
    cacheKey: built.cacheKey,
  }));
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

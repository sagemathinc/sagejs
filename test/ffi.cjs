"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const declarations = require("../tools/ffi/declarations.cjs");
const sourceDeclarations = require("../tools/ffi/source-declarations.cjs");
const boundaryAudit = require("../tools/ffi/boundary-audit.cjs");
const nativeExportAudit = require("../tools/ffi/native-export-audit.cjs");
const nativeExportPolicy = require("../tools/ffi/native-export-policy.cjs");
const hostAdapters = require("../tools/ffi/host-adapters.cjs");
const {
  bindingGyp,
  compileKernel,
  foreignCompilationInputs,
  generatedCxxLanguageSettings,
  nativeBuildWorkspace,
} = require("../tools/native-kernel/compiler.cjs");
const {
  generateC,
  generateHostCore,
} = require("../tools/native-kernel/c-backend.cjs");
const {
  generateExceptionShims,
} = require("../tools/native-kernel/ffi-codegen.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const {
  removeLoadedNativeCache,
} = require("./helpers/native-cache-cleanup.cjs");

const root = join(__dirname, "..");
const witness = join(root, "bench", "native-ffi-flint.py");
const matrixWitness = join(root, "bench", "native-ffi-flint-matrix.py");
const resourceWitness = join(root, "bench", "native-ffi-flint-resource.py");
const igraphWitness = join(root, "bench", "native-ffi-igraph.py");
const igraphCanonicalWitness = join(
  root, "bench", "native-ffi-igraph-canonical.py",
);
const polynomialWitness = join(
  root, "bench", "native-ffi-flint-polynomial.py",
);

test("native-boundary paths use repository separators on every host", () => {
  assert.equal(boundaryAudit.portablePath("ffi\\flint.ffi.py"), "ffi/flint.ffi.py");
  assert.equal(boundaryAudit.portablePath("ffi/flint.ffi.py"), "ffi/flint.ffi.py");
});

test("loaded native test caches defer Windows cleanup until DLL unload", () => {
  const lock = Object.assign(new Error("loaded native addon"), {
    code: "EPERM",
  });
  let spawned = null;
  let unref = false;
  assert.equal(
    removeLoadedNativeCache("C:\\temporary\\native-cache", {
      platform: "win32",
      remove() {
        throw lock;
      },
      spawnProcess(executable, args, options) {
        spawned = { executable, args, options };
        return { unref() { unref = true; } };
      },
    }),
    "deferred",
  );
  assert.equal(spawned.executable, process.execPath);
  assert.equal(spawned.args.at(-2), "C:\\temporary\\native-cache");
  assert.equal(spawned.args.at(-1), String(process.pid));
  assert.deepEqual(spawned.options, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  assert.equal(unref, true);
  assert.throws(
    () => removeLoadedNativeCache("/temporary/native-cache", {
      platform: "linux",
      remove() {
        throw lock;
      },
    }),
    (error) => error === lock,
  );
});

function runSage(args, input = undefined, env = {}) {
  const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
    input,
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    `sagejs ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout;
}

function runSageDiagnostic(args, input) {
  const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), ...args], {
    cwd: root,
    encoding: "utf8",
    input,
  });
  return `${result.stdout}\n${result.stderr}`;
}

function packedIntegerBuffer(values, wordCapacity = undefined) {
  const exact = values.map((value) => BigInt(value));
  const required = exact.reduce((maximum, value) => {
    let magnitude = value < 0n ? -value : value;
    let words = 0;
    while (magnitude !== 0n) {
      words += 1;
      magnitude >>= 64n;
    }
    return Math.max(maximum, words);
  }, 1);
  const capacity = Math.max(required, wordCapacity ?? required);
  const sizes = new Int32Array(exact.length);
  const limbs = new BigUint64Array(exact.length * capacity);
  for (let index = 0; index < exact.length; index += 1) {
    let magnitude = exact[index] < 0n ? -exact[index] : exact[index];
    let words = 0;
    while (magnitude !== 0n) {
      limbs[index * capacity + words] = magnitude & 0xffffffffffffffffn;
      magnitude >>= 64n;
      words += 1;
    }
    sizes[index] = exact[index] < 0n ? -words : words;
  }
  return { sizes, limbs, length: exact.length, wordCapacity: capacity };
}

function unpackIntegerBuffer(buffer) {
  return Array.from({ length: buffer.length }, (_, index) => {
    const signedSize = buffer.sizes[index];
    let magnitude = 0n;
    for (let word = Math.abs(signedSize) - 1; word >= 0; word -= 1) {
      magnitude = (magnitude << 64n) |
        buffer.limbs[index * buffer.wordCapacity + word];
    }
    return signedSize < 0 ? -magnitude : magnitude;
  });
}

test("FFI declarations are strict and generated modules are current", () => {
  const registry = declarations.loadRegistry({ root });
  assert.equal(registry.schema, "sagejs.ffi/declaration-v6");
  assert.equal(registry.catalog.schema, "sagejs.ffi/abi-catalog-v2");
  assert.equal(registry.libraries.length, 4);
  const fflas = registry.byId.get("fflas");
  assert.doesNotMatch(
    declarations.generatePythonModule(fflas),
    /from typing import Any/,
  );
  const flint = registry.byId.get("flint");
  assert.equal(flint.library.python_module, "sagejs.ffi.flint");
  assert.deepEqual(
    flint.functions.map((fn) => fn.id),
    [
      "fmpz_polynomial", "fmpz_polynomial_set_coefficient",
      "fmpz_polynomial_seal", "fmpz_polynomial_length",
      "fmpz_polynomial_equal", "fmpz_polynomial_coefficient",
      "fmpz_polynomial_add", "fmpz_polynomial_sub",
      "fmpz_polynomial_neg", "fmpz_polynomial_scalar_floor_div",
      "fmpz_polynomial_truncate", "fmpz_polynomial_compose",
      "fmpz_polynomial_reverse", "fmpz_polynomial_shift_left",
      "fmpz_polynomial_shift_right", "fmpz_polynomial_integral",
      "fmpz_polynomial_resultant", "fmpz_polynomial_discriminant",
      "fmpz_polynomial_derivative",
      "fmpz_polynomial_mul",
      "fmpz_polynomial_gcd", "fmpz_polynomial_xgcd_resource",
      "fmpz_polynomial_xgcd_result_gcd",
      "fmpz_polynomial_xgcd_result_left_coefficient",
      "fmpz_polynomial_xgcd_result_right_coefficient",
      "fmpz_polynomial_factor_resource",
      "fmpz_polynomial_divexact",
      "fmpz_polynomial_quo_rem_resource",
      "fmpz_polynomial_division_result_quotient",
      "fmpz_polynomial_division_result_remainder",
      "fmpz_polynomial_pow",
      "fmpz_polynomial_cyclotomic",
      "fmpz_polynomial_evaluate",
      "fmpz_polynomial_evaluate_rational", "fmpz_polynomial_serialize",
      "fmpz_polynomial_format",
      "fmpz_polynomial_from_byte_region",
      "fmpq_polynomial", "fmpq_polynomial_set_coefficient",
      "fmpq_polynomial_seal", "fmpq_polynomial_length",
      "fmpq_polynomial_equal", "fmpq_polynomial_coefficient_numerator",
      "fmpq_polynomial_coefficient_denominator", "fmpq_polynomial_add",
      "fmpq_polynomial_sub", "fmpq_polynomial_neg",
      "fmpq_polynomial_scalar_div", "fmpq_polynomial_truncate",
      "fmpq_polynomial_compose", "fmpq_polynomial_reverse",
      "fmpq_polynomial_shift_left", "fmpq_polynomial_shift_right",
      "fmpq_polynomial_integral", "fmpq_polynomial_resultant",
      "fmpq_polynomial_discriminant",
      "fmpq_polynomial_derivative",
      "fmpq_polynomial_mul", "fmpq_polynomial_gcd",
      "fmpq_polynomial_xgcd_resource",
      "fmpq_polynomial_xgcd_result_gcd",
      "fmpq_polynomial_xgcd_result_left_coefficient",
      "fmpq_polynomial_xgcd_result_right_coefficient",
      "fmpq_polynomial_factor_resource",
      "exact_polynomial_factorization_count",
      "exact_polynomial_factorization_exponent",
      "exact_polynomial_factorization_unit_numerator",
      "exact_polynomial_factorization_unit_denominator",
      "exact_polynomial_factorization_fmpz_factor",
      "exact_polynomial_factorization_fmpq_factor",
      "fmpq_polynomial_divexact",
      "fmpq_polynomial_quo_rem_resource",
      "fmpq_polynomial_division_result_quotient",
      "fmpq_polynomial_division_result_remainder",
      "fmpq_polynomial_pow",
      "fmpq_polynomial_evaluate", "fmpq_polynomial_serialize",
      "fmpq_polynomial_format",
      "fmpq_polynomial_from_byte_region",
      "fmpz_vector_from_byte_region", "fmpq_vector_from_byte_region",
      "fmpz_vector_length", "fmpq_vector_length",
      "fmpz_vector_entry", "fmpq_vector_entry_numerator",
      "fmpq_vector_entry_denominator",
      "fmpz_vector_set_entry", "fmpq_vector_set_entry",
      "fmpz_vector_copy", "fmpq_vector_copy",
      "fmpz_vector_serialize", "fmpq_vector_serialize",
      "fmpz_vector_equal", "fmpq_vector_equal",
      "fmpz_vector_add", "fmpq_vector_add",
      "fmpz_vector_sub", "fmpq_vector_sub",
      "fmpz_vector_scalar_mul", "fmpq_vector_scalar_mul",
      "fmpz_vector_dot", "fmpq_vector_dot",
      "fmpz_matrix", "fmpz_matrix_nrows", "fmpz_matrix_ncols",
      "fmpz_matrix_set_entry", "fmpz_matrix_entry",
      "fmpz_matrix_export_mod_ui", "fmpz_matrix_copy",
      "fmpz_matrix_neg", "fmpz_matrix_scalar_mul", "fmpz_matrix_equal",
      "fmpz_matrix_is_zero", "fmpz_matrix_is_one", "fmpz_matrix_add",
      "fmpz_matrix_sub", "fmpz_matrix_transpose", "fmpz_matrix_mul",
      "fmpz_matrix_mul_vector", "fmpz_vector_mul_matrix",
      "fmpz_matrix_pow", "fmpz_matrix_rank",
      "fmpz_matrix_rank_mod_46337", "fmpz_matrix_det",
      "fmpz_matrix_trace", "fmpz_matrix_hnf", "fmpz_matrix_snf",
      "fmpz_matrix_hnf_transform", "fmpz_matrix_snf_transform",
      "fmpz_matrix_right_kernel", "fmpz_matrix_charpoly",
      "fmpz_matrix_minpoly", "fmpq_matrix_from_fmpz",
      "fmpz_matrix_from_fmpq_integral", "fmpz_matrix_submatrix",
      "fmpz_matrix_select_rows", "fmpz_matrix_prefix_rows",
      "fmpz_matrix_select_columns",
      "fmpz_matrix_swap_rows", "fmpz_matrix_swap_columns",
      "fmpz_matrix_set_block", "fmpz_matrix_stack",
      "fmpz_matrix_augment", "fmpz_matrix_nonzero_count",
      "fmpz_matrix_echelon_pivots",
      "fmpz_matrix_format", "fmpz_matrix_serialize",
      "fmpz_matrix_serialize_sequence", "flint_byte_region",
      "flint_byte_region_set", "fmpz_matrix_deserialize",
      "fmpz_matrix_deserialize_entries",
      "fmpq_matrix", "fmpq_matrix_randbits", "fmpq_matrix_nrows",
      "fmpq_matrix_ncols",
      "fmpq_matrix_set_entry", "fmpq_matrix_add_scaled_entry",
      "fmpq_matrix_entry_numerator",
      "fmpq_matrix_entry_denominator", "fmpq_matrix_entry_is_zero",
      "fmpq_matrix_copy", "fmpq_matrix_neg", "fmpq_matrix_scalar_mul",
      "fmpq_matrix_equal", "fmpq_matrix_is_zero", "fmpq_matrix_is_one",
      "fmpq_matrix_add", "fmpq_matrix_sub",
      "fmpq_matrix_transpose", "fmpq_matrix_mul",
      "fmpq_matrix_mul_vector", "fmpq_vector_mul_matrix",
      "fmpq_matrix_inv",
      "fmpq_matrix_solve", "fmpq_matrix_rref",
      "fmpq_matrix_right_kernel",
      "fmpq_matrix_charpoly", "fmpq_matrix_minpoly",
      "fmpq_matrix_rank", "fmpq_matrix_det", "fmpq_matrix_trace",
      "fmpq_matrix_submatrix", "fmpq_matrix_select_rows",
      "fmpq_matrix_prefix_rows",
      "fmpq_matrix_select_columns",
      "fmpq_matrix_swap_rows", "fmpq_matrix_swap_columns",
      "fmpq_matrix_set_block",
      "fmpq_matrix_stack", "fmpq_matrix_augment",
      "fmpq_matrix_nonzero_count",
      "fmpq_matrix_echelon_pivots",
      "fmpq_value_numerator",
      "fmpq_value_denominator", "fmpq_matrix_format",
      "fmpq_matrix_serialize", "fmpq_matrix_serialize_sequence",
      "fmpq_matrix_deserialize",
      "flint_byte_region_length",
      "flint_byte_region_get",
      "dirichlet_group_init", "dirichlet_group_size",
      "dirichlet_group_num_primitive", "n_is_prime", "fmpz_gcd",
      "fmpz_mat_rank", "fmpz_mat_mul", "fmpz_mat_det",
      "fmpz_mat_charpoly", "fmpz_mat_hnf", "fmpz_mat_hnf_transform",
      "fmpz_mat_snf_transform", "fmpz_mat_right_kernel",
      "fmpq_mat_rank", "fmpq_mat_mul", "fmpq_mat_rref",
      "fmpq_mat_inv", "fmpq_mat_solve", "fmpq_mat_det",
      "fmpq_mat_charpoly",
      "nmod_matrix_from_entries", "nmod_matrix_random",
      "nmod_matrix_nrows", "nmod_matrix_ncols", "nmod_matrix_modulus",
      "nmod_matrix_entry", "nmod_matrix_set_entry", "nmod_matrix_copy",
      "nmod_matrix_equal", "nmod_matrix_is_zero", "nmod_matrix_is_one",
      "nmod_matrix_nonzero_count", "nmod_matrix_add", "nmod_matrix_sub",
      "nmod_matrix_neg", "nmod_matrix_scalar_mul", "nmod_matrix_transpose",
      "nmod_matrix_mul", "nmod_matrix_inv", "nmod_matrix_solve",
      "nmod_matrix_rank", "nmod_matrix_rref", "nmod_matrix_right_kernel",
      "nmod_matrix_det", "nmod_matrix_trace", "nmod_matrix_select_rows",
      "nmod_matrix_select_columns", "nmod_matrix_set_block",
      "nmod_matrix_mul_vector", "nmod_vector_mul_matrix",
      "nmod_matrix_stack", "nmod_matrix_augment", "nmod_matrix_swap_rows",
      "nmod_matrix_swap_columns", "nmod_matrix_format",
      "nmod_matrix_serialize", "nmod_matrix_charpoly", "nmod_matrix_minpoly",
      "nmod_mat_rank", "nmod_mat_det", "nmod_mat_charpoly",
      "nmod_mat_minpoly", "nmod_mat_inv", "nmod_mat_rref",
      "nmod_mat_mul", "nmod_mat_right_kernel", "nmod_mat_solve",
      "fmpz_poly_mul", "fmpq_poly_mul",
      "nmod_poly_add", "nmod_poly_sub", "nmod_poly_neg",
      "nmod_poly_equal", "nmod_poly_derivative", "nmod_poly_evaluate",
      "nmod_poly_compose", "nmod_poly_reverse",
      "nmod_poly_shift_left", "nmod_poly_shift_right",
      "nmod_poly_truncate", "nmod_poly_integral",
      "nmod_poly_resultant", "nmod_poly_discriminant",
      "nmod_poly_mul",
      "nmod_poly_divexact", "nmod_poly_divrem",
      "fmpz_poly_divexact", "fmpq_poly_divexact",
      "nmod_poly_gcd", "nmod_poly_xgcd",
      "nmod_poly_is_irreducible", "nmod_poly_factor",
      "nmod_poly_roots", "fmpz_poly_factor", "fmpq_poly_factor",
      "fq_context", "fq_context_characteristic", "fq_context_degree",
      "fq_element", "fq_element_copy", "fq_element_extension_degree",
      "fq_element_coordinate", "fq_element_equal", "fq_element_add",
      "fq_element_sub", "fq_element_mul", "fq_element_neg",
      "fq_element_inverse", "fq_element_pow", "fq_element_is_zero",
      "fq_element_is_one", "fq_element_coordinate_bytes", "fq_polynomial",
      "fq_polynomial_copy", "fq_polynomial_length",
      "fq_polynomial_extension_degree", "fq_polynomial_coordinate",
      "fq_polynomial_equal", "fq_polynomial_add", "fq_polynomial_sub",
      "fq_polynomial_mul", "fq_polynomial_neg", "fq_polynomial_pow",
      "fq_polynomial_coordinate_bytes", "fmpz_mod_polynomial",
      "fmpz_mod_polynomial_set_coefficient", "fmpz_mod_polynomial_seal",
      "fmpz_mod_polynomial_modulus", "fmpz_mod_polynomial_is_zero",
      "fmpz_mod_polynomial_length", "fmpz_mod_polynomial_entry_count",
      "fmpz_mod_polynomial_coefficient", "fmpz_mod_polynomial_copy",
      "fmpz_mod_polynomial_equal", "fmpz_mod_polynomial_add",
      "fmpz_mod_polynomial_sub", "fmpz_mod_polynomial_mul",
      "fmpz_mod_polynomial_neg", "fmpz_mod_polynomial_pow",
      "fmpz_mod_polynomial_derivative", "fmpz_mod_polynomial_evaluate",
      "fmpz_mod_polynomial_gcd", "fmpz_mod_polynomial_divrem_resource",
      "fmpz_mod_polynomial_division_result_quotient",
      "fmpz_mod_polynomial_division_result_remainder",
      "fmpz_mod_polynomial_xgcd_resource",
      "fmpz_mod_polynomial_xgcd_result_gcd",
      "fmpz_mod_polynomial_xgcd_result_left_coefficient",
      "fmpz_mod_polynomial_xgcd_result_right_coefficient",
      "fmpz_mod_polynomial_factor_resource",
      "fmpz_mod_polynomial_roots_resource", "fmpz_mod_polynomial_format",
      "fmpz_mod_polynomial_serialize", "fmpz_mod_polynomial_deserialize",
      "number_field_order_pmaximal",
      "number_field_order_maximal_at_primes",
      "number_field_order_from_polynomial_resource",
      "number_field_order_resource_status",
      "number_field_order_resource_degree",
      "number_field_order_resource_supplied_primes",
      "number_field_order_resource_resolved_primes",
      "number_field_order_resource_native_primes",
      "number_field_order_resource_unramified_primes",
      "number_field_analyze_resource",
    ],
  );
  assert.deepEqual(
    flint.resources.map((resource) => resource.python_name),
    [
      "FmpzMatrix", "FmpqMatrix", "FmpzVector", "FmpqVector",
      "NmodMatrix", "FmpqValue", "FlintByteRegion",
      "NumberFieldOrderResource", "NumberFieldAnalysisResource",
      "FmpzPolynomial", "FmpqPolynomial", "FmpzModPolynomial",
      "FmpzModPolynomialDivisionResult", "FmpzModPolynomialXgcdResult",
      "FmpzModPolynomialFactorization", "FmpzModPolynomialRoots",
      "FqContext", "FqElement", "FqPolynomial",
      "ExactPolynomialFactorization",
      "FmpzPolynomialDivisionResult", "FmpqPolynomialDivisionResult",
      "FmpzPolynomialXgcdResult", "FmpqPolynomialXgcdResult",
      "DirichletGroup",
    ],
  );
  const byteRegion = flint.byResourceType.get("FlintByteRegion");
  assert.deepEqual(byteRegion.host_transfer, {
    kind: "copied_bytes",
    dynamic: { export: "ffiFlintByteRegionCopyBytes" },
    native: {
      data_symbol: "sagejs_flint_byte_region_data",
      length_symbol: "sagejs_flint_byte_region_length",
    },
    targets: { dynamic: true, wasm: true },
  });
  assert.deepEqual(byteRegion.host_ingress, {
    kind: "copied_bytes",
    dynamic: { export: "ffiFlintByteRegionFromBytes" },
    native: { init_symbol: "sagejs_flint_byte_region_init_copy" },
    targets: { dynamic: true, wasm: true },
  });
  const exactFactors = flint.byResourceType.get(
    "ExactPolynomialFactorization",
  );
  assert.deepEqual(exactFactors.host_transfer, {
    kind: "copied_bytes",
    dynamic: { export: "ffiExactPolynomialFactorizationCopyBytes" },
    native: {
      copy_symbol: "sagejs_exact_polynomial_factorization_copy_bytes",
      clear_symbol: "sagejs_exact_polynomial_factorization_free_bytes",
    },
    targets: { dynamic: true, wasm: false },
  });
  assert.match(flint.identity, /^flint@[0-9a-f]{64}$/);
  const generated = declarations.generatedModulePath(root, flint);
  assert.match(
    declarations.generatePythonModule(flint),
    /from typing import Any/,
  );
  assert.equal(
    readFileSync(generated, "utf8"),
    declarations.generatePythonModule(flint),
  );
  assert.deepEqual(
    declarations.generatedModulePaths(root, flint).map((filename) =>
      readFileSync(filename, "utf8")),
    [declarations.generatePythonModule(flint), declarations.generatePythonModule(flint)],
  );
  assert.match(
    readFileSync(generated, "utf8"),
    /_runtime\.ffi_call\(\n\s+__sagejs_ffi_declaration__ \+ ":n_is_prime"/,
  );
  assert.match(
    readFileSync(generated, "utf8"),
    /def take_bytes\(self\).*?finally:\n\s+self\.close\(\)/s,
  );
  assert.match(
    readFileSync(generated, "utf8"),
    /def from_bytes\(cls, source: Any\).*?"ByteBuffer"/s,
  );
  const igraph = registry.byId.get("igraph");
  assert.deepEqual(igraph.ownershipGraph, [
    { resource: "graph", ownership: "owned", owner: null, root: "graph" },
    { resource: "edges", ownership: "borrowed", owner: "graph", root: "graph" },
  ]);
  assert.match(runSage(["ffi", "check"]), /408 function\(s\)/);
  const inspection = JSON.parse(
    runSage(["ffi", "explain", "flint", "--json"]),
  );
  assert.equal(inspection.identity, flint.identity);
  assert.equal(
    inspection.functions.find((fn) => fn.id === "fmpz_gcd").native.symbol,
    "fmpz_gcd",
  );
  const polynomialPlan = inspection.functions.find(
    (fn) => fn.id === "nmod_poly_mul",
  ).call_plan;
  assert.equal(polynomialPlan.schema, "sagejs.ffi/call-plan-v2");
  assert.equal(polynomialPlan.result.domain, "status");
  assert.deepEqual(polynomialPlan.result.success, [1]);
  assert.deepEqual(polynomialPlan.transactions, [
    { buffer: "output", commit: "success", staging: "temporary" },
  ]);
  assert.equal(polynomialPlan.arguments[0].lowering.adapter, "packed_slice");
  const canonical = registry.byId.get("igraph").functions.find(
    (fn) => fn.id === "canonical_permutation",
  );
  assert.equal(canonical.call_plan.arguments[2].lowering.kind, "record");
  assert.equal(canonical.exceptions.policy, "cxx_to_status");
  assert.match(canonical.call_plan.symbol,
    /^sagejs_ffi_shield_igraph_canonical_permutation$/);
  const nullable = registry.byId.get("igraph").functions.find(
    (fn) => fn.id === "first_edge_endpoint",
  );
  assert.equal(nullable.result.domain, "nullable");
  assert.equal(nullable.call_plan.native_return_c_type, "const uint64_t *");
  assert.equal(
    inspection.resources.find(
      (resource) => resource.id === "dirichlet_group",
    ).native.clear_symbol,
    "dirichlet_group_clear",
  );
});

test("generated host adapters cover values and safe owned resources", async () => {
  const registry = declarations.loadRegistry({ root });
  for (const declaration of registry.libraries) {
    const filename = hostAdapters.generatedHostAdapterPath(root, declaration);
    const source = hostAdapters.generatedHostAdapterSource(declaration);
    const functions = hostAdapters.generatedHostFunctions(declaration);
    assert.equal(readFileSync(filename, "utf8"), source);
    assert.match(source, /whose core calls the declared foreign symbols/);
    assert.doesNotMatch(source, /sagejs\.runtime|ffi_call/);
    assert.equal(functions.length, {
      fflas: 10,
      flint: 365,
      igraph: 2,
      m4ri: 26,
    }[declaration.library.id]);
    if (declaration.library.id === "flint") {
      const ir = await lowerSource(source, filename);
      const adapter = generateC(ir);
      assert.match(
        adapter,
        /FFI copied-byte ingress requires a Uint8Array/,
      );
      assert.match(adapter, /calloc\(1, sizeof\(\*holder\)\)/);
      assert.match(
        adapter,
        /declared initializer is transactional: failure owns nothing/,
      );
      assert.match(
        adapter,
        /if \(!sagejs_flint_byte_region_init_copy[\s\S]*?goto fail;[\s\S]*?holder->initialized = 1;/,
      );
    }
  }
});

test("computed resource byte transfers lower to one generated copy", async () => {
  const registry = declarations.loadRegistry({ root });
  const flint = registry.byId.get("flint");
  const resource = flint.byResourceType.get(
    "ExactPolynomialFactorization",
  );
  assert.deepEqual(resource.host_transfer, {
    kind: "copied_bytes",
    dynamic: { export: "ffiExactPolynomialFactorizationCopyBytes" },
    native: {
      copy_symbol: "sagejs_exact_polynomial_factorization_copy_bytes",
      clear_symbol: "sagejs_exact_polynomial_factorization_free_bytes",
    },
    targets: { dynamic: true, wasm: false },
  });

  const filename = hostAdapters.generatedHostAdapterPath(root, flint);
  const source = hostAdapters.generatedHostAdapterSource(flint);
  const ir = await lowerSource(source, filename);
  const adapter = generateC(ir);
  assert.match(
    adapter,
    /sagejs_exact_polynomial_factorization_copy_bytes\(/,
  );
  assert.match(
    adapter,
    /sagejs_exact_polynomial_factorization_free_bytes\(/,
  );
});

test("packages publish every generated host adapter as the canonical export", () => {
  for (const [packagePath, expected] of [
    ["../packages/flint", 366],
    ["../packages/fflas", 10],
    ["../packages/graph", 2],
  ]) {
    const backend = require(packagePath);
    const manifest = backend.__sagejs_ffi_manifest__;
    assert.equal(manifest.schema, "sagejs.ffi/generated-host-adapter-v1");
    assert.equal(manifest.functions.length, expected);
    assert.equal(manifest.host_isolation.callbacks_inside_core, 0);
    for (const item of manifest.functions) {
      assert.equal(typeof backend[item.export], "function");
    }
  }

  const flint = require("../packages/flint");
  assert.equal(flint.__sagejs_ffi_oracles__, undefined);
  const left = BigUint64Array.from([1n, 2n, 3n]);
  const right = BigUint64Array.from([4n, 5n, 6n]);
  const generated = new BigUint64Array(5);
  assert.equal(
    flint.ffiNmodPolyMul(generated, left, right, 5n, 3n, 3n, 101n),
    true,
  );
  assert.deepEqual(Array.from(generated), [4n, 13n, 28n, 27n, 18n]);

  for (const [name, sourceNumerators, sourceDenominators, expectedUnit] of [
    ["ffiFmpzPolyFactor", [2n, -3n, 0n, 1n], null, [1n, 1n]],
    [
      "ffiFmpqPolyFactor",
      [3n, -9n, 0n, 3n],
      [5n, 10n, 1n, 10n],
      [3n, 10n],
    ],
  ]) {
    const run = (callable) => {
      const factorCoefficients = packedIntegerBuffer(Array(6).fill(0n), 4);
      const offsets = new BigUint64Array(4);
      const exponents = new BigUint64Array(4);
      const factorCount = new BigUint64Array(1);
      const unitNumerator = packedIntegerBuffer([0n], 4);
      const unitDenominator = packedIntegerBuffer([0n], 4);
      const args = [
        factorCoefficients,
        offsets,
        exponents,
        factorCount,
        unitNumerator,
        unitDenominator,
        packedIntegerBuffer(sourceNumerators, 4),
      ];
      if (sourceDenominators !== null) {
        args.push(packedIntegerBuffer(sourceDenominators, 4));
      }
      args.push(6n, 4n, 1n);
      assert.equal(Reflect.apply(callable, flint, args), true);
      return {
        coefficients: unpackIntegerBuffer(factorCoefficients),
        offsets: Array.from(offsets),
        exponents: Array.from(exponents),
        factorCount: Array.from(factorCount),
        unitNumerator: unpackIntegerBuffer(unitNumerator),
        unitDenominator: unpackIntegerBuffer(unitDenominator),
      };
    };
    assert.deepEqual(run(flint[name]), {
      coefficients: [2n, 1n, -1n, 1n, 0n, 0n],
      offsets: [0n, 2n, 4n, 0n],
      exponents: [1n, 2n, 0n, 0n],
      factorCount: [2n],
      unitNumerator: [expectedUnit[0]],
      unitDenominator: [expectedUnit[1]],
    });
  }
});

test("FFI v7 Python declarations lower deterministically to the checked JSON IR", async () => {
  const sourceRegistry = await sourceDeclarations.loadSourceRegistry({ root });
  const registry = declarations.loadRegistry({ root });
  assert.equal(sourceRegistry.schema, "sagejs.ffi/source-declaration-v1");
  assert.deepEqual(
    sourceRegistry.sources.map((source) => source.document.library.id),
    ["fflas", "flint", "igraph", "m4ri"],
  );
  for (const source of sourceRegistry.sources) {
    const id = source.document.library.id;
    assert.equal(readFileSync(source.normalizedFilename, "utf8"), source.text);
    assert.equal(source.declaration.identity, registry.byId.get(id).identity);
    assert.equal(source.declaration.sourceFilename, source.filename);
    assert.ok(source.locations.library.line > 0);
    assert.equal(
      Object.keys(source.locations.functions).length,
      source.document.functions.length,
    );
    assert.equal(
      runSage(["ffi", "emit-json", source.filename]),
      source.text,
    );
  }
  assert.match(runSage(["ffi", "diff"]), /flint: matches[\s\S]*igraph: matches/);
  const inspection = JSON.parse(runSage(["ffi", "explain", "igraph", "--json"]));
  assert.equal(inspection.source, "ffi/igraph.ffi.py");
  assert.equal(inspection.declaration, "ffi/igraph.ffi.json");
  assert.equal(inspection.abi_catalog.declaration, "ffi/abi-types.json");
  const difference = JSON.parse(runSage(["ffi", "diff", "igraph", "--json"]));
  assert.equal(difference.source, "ffi/igraph.ffi.py");
  assert.equal(difference.lowered, "ffi/igraph.ffi.json");
  const checked = JSON.parse(runSage(["ffi", "check", "igraph", "--json"]));
  assert.deepEqual(checked.source_declarations, ["ffi/igraph.ffi.py"]);
});

test("FFI v7 source parser is formatting-independent and reports source locations", async () => {
  const registry = declarations.loadRegistry({ root });
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-source-"));
  try {
    const original = readFileSync(join(root, "ffi", "igraph.ffi.py"), "utf8");
    const commented = original.replace(
      "igraph = Library(",
      "# Formatting and comments are not declaration semantics.\nigraph = Library(",
    );
    const commentedFile = join(temporary, "igraph.ffi.py");
    writeFileSync(commentedFile, commented);
    const parsed = await sourceDeclarations.parseDeclarationSource(
      commentedFile, { catalog: registry.catalog },
    );
    assert.equal(parsed.text, readFileSync(join(root, "ffi", "igraph.ffi.json"), "utf8"));

    const invalid = original.replace(
      "effects=Effects(pure=True),",
      "effects=Effects(pure=True, mystery=True),",
    );
    const invalidFile = join(temporary, "invalid.ffi.py");
    writeFileSync(invalidFile, invalid);
    await assert.rejects(
      () => sourceDeclarations.parseDeclarationSource(
        invalidFile, { catalog: registry.catalog },
      ),
      new RegExp(`FFI source .*invalid\\.ffi\\.py:[0-9]+:[0-9]+: ` +
        "Effects has unknown keyword mystery"),
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("FFI declarations preserve explicit Linux and Darwin link overrides", async () => {
  const sourceRegistry = await sourceDeclarations.loadSourceRegistry({ root });
  const source = sourceRegistry.byId.get("fflas");
  assert.deepEqual(source.declaration.library.native.link.linux, [
    "libgivaro.a", "libopenblas.a", "libgmpxx.a", "libgmp.a",
  ]);
  assert.deepEqual(source.declaration.library.native.link.darwin, [
    "libgivaro.a", "Accelerate.tbd", "libgmpxx.a", "libgmp.a",
  ]);

  const original = readFileSync(join(root, "ffi", "igraph.ffi.py"), "utf8");
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-link-platform-"));
  try {
    const invalid = original.replace(
      "link_windows=[\"igraph.lib\"],",
      "link_windows=[\"igraph.lib\"],\n    link_darwin=[\"../escape.tbd\"],",
    );
    const filename = join(temporary, "invalid.ffi.py");
    writeFileSync(filename, invalid);
    await assert.rejects(
      () => sourceDeclarations.parseDeclarationSource(filename),
      /library\.native\.link\.darwin contains unsafe value/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("native-boundary audit is a reviewed exact ratchet", () => {
  const filename = boundaryAudit.snapshotPath(root);
  const snapshot = JSON.parse(readFileSync(filename, "utf8"));
  const current = boundaryAudit.validateBoundarySnapshot(snapshot, { root });
  assert.ok(current.counts["napi-export"] >= 280);
  assert.ok(current.counts["runtime-intrinsic"] >= 100);
  assert.equal(current.counts["declared-ffi"], 408);
  assert.equal(current.counts["declared-ffi-resource"], 29);
  assert.match(runSage(["ffi", "audit"]), /inventoried native boundaries/);
  assert.equal(
    current.boundaries.filter((item) =>
      item.kind === "napi-export" &&
      item.disposition === "legacy-handwritten-dynamic"
    ).length,
    0,
  );
  const stale = structuredClone(snapshot);
  stale.boundaries.pop();
  assert.throws(
    () => boundaryAudit.validateBoundarySnapshot(stale, { root }),
    /native-boundary inventory has drifted/,
  );
});

test("every N-API export has an exact symbol-level architecture decision", () => {
  const filename = nativeExportAudit.inventoryPath(root);
  const inventory = nativeExportAudit.validateNativeExportInventory(
    JSON.parse(readFileSync(filename, "utf8")), { root },
  );
  assert.equal(inventory.schema, "sagejs.native-export-inventory/v1");
  assert.equal(inventory.exports.length, 303);
  assert.equal(inventory.exports.filter((item) =>
    item.family.startsWith("dense-matrix")).length, 50);
  assert.equal(inventory.exports.filter((item) =>
    item.implementation.path === "packages/flint/src/matrix.c").length, 50);
  assert.ok(inventory.exports.every((item) =>
    /^[0-9a-f]{64}$/.test(item.implementation.sha256)));
  assert.equal(inventory.exports.filter((item) =>
    item.decision === "legacy-handwritten-dynamic").length, 0);
  const policy = nativeExportPolicy.loadNativeExportPolicy({ root });
  assert.deepEqual(
    Object.fromEntries(Object.entries(policy.document.matrix_remediation.groups)
      .map(([id, group]) => [id, group.exports.length])),
    {
      "representation-primitives": 16,
      "foreign-and-thin-bridges": 22,
      "source-owned-algorithm-exceptions": 12,
    },
  );
  assert.equal(policy.matrixExports.size, 50);
  const missing = structuredClone(
    inventory.exports.map((item) => ({
      id: item.id,
      declaration: item.declared_ffi === null ? undefined : item.declared_ffi,
    })),
  );
  missing.push({
    id: "napi:@sagemath/sagejs-flint:unreviewedNewExport",
  });
  assert.throws(
    () => nativeExportPolicy.validateNativeExportPolicy(policy, missing),
    /unclassified N-API exports/,
  );
});

test("FFI declarations fail closed on unknown fields", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-invalid-"));
  try {
    const directory = join(temporary, "ffi");
    mkdirSync(directory);
    const document = JSON.parse(
      readFileSync(join(root, "ffi", "flint.ffi.json"), "utf8"),
    );
    document.functions[0].unsafe_magic = true;
    writeFileSync(
      join(directory, "invalid.ffi.json"),
      `${JSON.stringify(document, null, 2)}\n`,
    );
    assert.throws(
      () => declarations.loadRegistry({ root: temporary }),
      /unknown field unsafe_magic/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("FFI declarations reject incompatible ownership and ABI mappings", () => {
  function invalid(mutator, pattern) {
    const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-invalid-"));
    try {
      const directory = join(temporary, "ffi");
      mkdirSync(directory);
      const document = JSON.parse(
        readFileSync(join(root, "ffi", "flint.ffi.json"), "utf8"),
      );
      mutator(document);
      writeFileSync(
        join(directory, "invalid.ffi.json"),
        `${JSON.stringify(document, null, 2)}\n`,
      );
      assert.throws(() => declarations.loadRegistry({ root: temporary }), pattern);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  invalid(
    (document) => {
      document.functions.find(
        (fn) => fn.id === "fmpz_gcd",
      ).signature.parameters[0].ownership = "owned";
    },
    /Integer inputs must use borrowed ownership/,
  );
  invalid(
    (document) => {
      document.functions.find(
        (fn) => fn.id === "n_is_prime",
      ).native.arguments[0].abi_type = "fmpz_t";
    },
    /uint64 requires ulong or uint64_t, not fmpz_t/,
  );
  invalid(
    (document) => {
      document.functions.find(
        (fn) => fn.id === "fmpz_gcd",
      ).native.arguments.pop();
    },
    /omits native source right/,
  );
  invalid(
    (document) => {
      document.functions.find(
        (fn) => fn.id === "nmod_mat_rank",
      ).native.arguments[0].adapter.data = "rows";
    },
    /adapter data must be UInt64Buffer/,
  );
  invalid(
    (document) => {
      document.functions.find(
        (fn) => fn.id === "nmod_mat_inv",
      ).effects.pure = true;
    },
    /effects.pure functions may not declare writes/,
  );
  invalid(
    (document) => {
      document.functions.find(
        (fn) => fn.id === "nmod_mat_inv",
      ).errors.exception = "KeyError";
    },
    /uses unsupported error exception KeyError/,
  );
  invalid(
    (document) => {
      document.resources[0].native.clear_symbol = "not a C symbol";
    },
    /clear_symbol must be a C identifier/,
  );
  invalid(
    (document) => {
      document.resources.find(
        (resource) => resource.id === "byte_region",
      ).host_transfer.kind = "borrow_pointer";
    },
    /unsupported host transfer borrow_pointer/,
  );
  invalid(
    (document) => {
      document.resources.find(
        (resource) => resource.id === "byte_region",
      ).host_transfer.native.data_symbol = "region->data";
    },
    /byte-copy data_symbol must be an identifier/,
  );
  invalid(
    (document) => {
      document.resources.find(
        (resource) => resource.id === "exact_polynomial_factorization",
      ).host_transfer.native.clear_symbol = "free(bytes)";
    },
    /byte-copy clear_symbol must be an identifier/,
  );
  invalid(
    (document) => {
      document.resources.find(
        (resource) => resource.id === "byte_region",
      ).host_ingress.kind = "borrow_pointer";
    },
    /unsupported host ingress borrow_pointer/,
  );
  invalid(
    (document) => {
      document.resources.find(
        (resource) => resource.id === "byte_region",
      ).host_ingress.native.init_symbol = "region->copy";
    },
    /byte-ingress init_symbol must be an identifier/,
  );
  invalid(
    (document) => {
      document.functions.find(
        (fn) => fn.id === "n_is_prime",
      ).result.success = [1];
    },
    /direct result cannot declare failures/,
  );
  invalid(
    (document) => {
      document.functions.find(
        (fn) => fn.id === "nmod_mat_inv",
      ).exceptions = {
        policy: "cxx_to_status", failure_status: 0,
      };
    },
    /C\+\+ shields require a distinct failure status and no wasm target/,
  );
});

test("FFI v6 records and nullable domains fail closed", () => {
  function invalid(mutator, pattern) {
    const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-v6-invalid-"));
    try {
      const directory = join(temporary, "ffi");
      mkdirSync(directory);
      const document = JSON.parse(
        readFileSync(join(root, "ffi", "igraph.ffi.json"), "utf8"),
      );
      mutator(document);
      writeFileSync(join(directory, "invalid.ffi.json"),
        `${JSON.stringify(document, null, 2)}\n`);
      assert.throws(() => declarations.loadRegistry({ root: temporary }), pattern);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  invalid(
    (document) => {
      delete document.functions[5].native.arguments[2].adapter.fields.directed;
    },
    /record fields is missing directed/,
  );
  invalid(
    (document) => {
      document.functions[6].native.return_type = "uint64_t";
    },
    /nullable result needs a pointer ABI/,
  );
});

test("FFI ownership graphs reject cycles", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-cycle-"));
  try {
    const directory = join(temporary, "ffi");
    mkdirSync(directory);
    const document = JSON.parse(
      readFileSync(join(root, "ffi", "igraph.ffi.json"), "utf8"),
    );
    document.resources[1].owner = "edges";
    writeFileSync(join(directory, "invalid.ffi.json"),
      `${JSON.stringify(document, null, 2)}\n`);
    assert.throws(
      () => declarations.loadRegistry({ root: temporary }),
      /ownership graph contains a cycle/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("safe generated FLINT surface works in ordinary Sage.js", () => {
  const output = runSage(["--python"], [
    "from sagejs.ffi.flint import n_is_prime, fmpz_gcd",
    "print(n_is_prime(97))",
    "print(n_is_prime(221))",
    "print(fmpz_gcd((2**127 - 1) * 17, (2**61 - 1) * 17))",
    "",
  ].join("\n"));
  assert.equal(output.trim(), "True\nFalse\n17");
  assert.match(
    runSageDiagnostic(["--python"],
      "from sagejs.ffi.flint import n_is_prime\nn_is_prime(-1)\n"),
    /invalid dynamic FFI argument for uint64/,
  );
  assert.match(
    runSageDiagnostic(["--python"],
      "from sagejs.ffi.flint import fmpz_gcd\nfmpz_gcd(1.5, 2)\n"),
    /invalid dynamic FFI argument for Integer/,
  );
});

test("dynamic FFI maps IndexError and rejects unknown exception classes", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-index-error-"));
  try {
    const backendPath = join(temporary, "nullable.cjs");
    writeFileSync(backendPath, "module.exports = { missing() { return null; } };\n");
    const output = runSage(["--python"], [
      "def exercise_exception_mapping():",
      "    import sagejs.runtime as runtime",
      "    identity = 'test@' + '0'*64 + ':'",
      "    def call(exception):",
      "        return runtime.ffi_call(",
      "            identity + exception,",
      `            ${JSON.stringify(backendPath)},`,
      "            'missing', [], [], 'uint64',",
      "            ['nullable', [], 'error'],",
      "            exception, 'missing coordinate', [],",
      "        )",
      "    try:",
      "        call('IndexError')",
      "    except IndexError as error:",
      "        print(type(error).__name__, str(error))",
      "    try:",
      "        call('KeyError')",
      "    except RuntimeError as error:",
      "        print(type(error).__name__, str(error))",
      "exercise_exception_mapping()",
      "",
    ].join("\n"));
    assert.equal(
      output.trim(),
      "IndexError missing coordinate\nRuntimeError unsupported FFI exception KeyError",
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("packed FLINT matrix declarations work in ordinary Sage.js", () => {
  const flint = require("../packages/flint");
  assert.equal(
    flint.ffiNmodMatRank(
      new BigUint64Array([1n << 32n]), 1, 1, 97n,
    ),
    1n,
  );
  const output = runSage(["--python"], [
    "def exercise_packed_matrices():",
    "    from sagejs.ffi.flint import nmod_mat_rank, nmod_mat_inv",
    "    import sagejs.runtime as runtime",
    "    source = runtime.uint64_buffer([1, 2, 3, 4])",
    "    print(nmod_mat_rank(source, 2, 2, 5))",
    "    out = runtime.uint64_buffer(4)",
    "    print(nmod_mat_inv(out, source, 2, 5), list(out))",
    "    try:",
    "        singular = runtime.uint64_buffer([1, 2, 2, 4])",
    "        nmod_mat_inv(runtime.uint64_buffer(4), singular, 2, 5)",
    "    except ValueError as error:",
    "        print(type(error).__name__, str(error))",
    "",
    "exercise_packed_matrices()",
  ].join("\n"));
  assert.equal(
    output.trim(),
    "2\nTrue [3, 1, 4, 2]\nValueError matrix is singular",
  );
});

test("packed-slice declarations work through both ordinary dynamic adapters", () => {
  const output = runSage(["--python"], [
    "def exercise_packed_slices():",
    "    from sagejs.ffi.igraph import canonical_permutation, first_edge_endpoint",
    "    from sagejs.ffi.flint import nmod_poly_mul",
    "    import sagejs.runtime as runtime",
    "    labels = runtime.uint64_buffer([99] * 6)",
    "    edges = runtime.uint64_buffer([0,1,1,2,2,3,3,4,4,5,5,0])",
    "    print(canonical_permutation(labels, edges, 6, 12, False), list(labels))",
    "    print(first_edge_endpoint(edges, 12))",
    "    try:",
    "        first_edge_endpoint(runtime.uint64_buffer(0), 0)",
    "    except ValueError as error:",
    "        print(type(error).__name__, str(error))",
    "    product = runtime.uint64_buffer([99] * 5)",
    "    left = runtime.uint64_buffer([1,2,3])",
    "    right = runtime.uint64_buffer([4,5,6])",
    "    print(nmod_poly_mul(product, left, right, 5, 3, 3, 101), list(product))",
    "",
    "exercise_packed_slices()",
  ].join("\n"));
  assert.equal(
    output.trim(),
    "True [3, 4, 2, 5, 1, 0]\n0\n" +
      "ValueError graph has no edge endpoints\nTrue [4, 13, 28, 27, 18]",
  );
});

test("packed univariate polynomials are independent of legacy N-API objects", () => {
  const source = [
    "R = PolynomialRing(ZZ, 'x'); x = R.gen()",
    "f = (x - 1)**3 * (x + 2)",
    "assert (f // (x - 1)) * (x - 1) == f",
    "assert f.factor().value() == f",
    "large = ((2**200) * x + 1) * (x - 3)",
    "assert large.factor().value() == large",
    "assert R([1, 2, 3]) == 1 + 2*x + 3*x**2",
    "S = PolynomialRing(QQ, 'y'); y = S.gen()",
    "g = QQ(3) / QQ(10) * (y - 1)**2 * (y + 2)",
    "assert (g // (y - 1)) * (y - 1) == g",
    "assert g.factor().value() == g",
    "large_q = (QQ(1) / (2**180)) * ((2**170) * y + 3) * (y - 5)",
    "assert large_q.factor().value() == large_q",
    "stress_q = S([QQ(i % 17 - 8) / (i % 7 + 1) for i in range(128)])",
    "assert len(stress_q.coefficients()) == 127",
    "T = PolynomialRing(GF(5), 'z'); z = T.gen()",
    "h = (z - 1)**2 * (z + 2)",
    "assert (h // (z - 1)) * (z - 1) == h",
    "assert gcd(h, (z - 1)**4) == z**2 + 3*z + 1",
    "assert h.factor().value() == h",
    "assert h.roots() == [(T(3), 1), (T(1), 2)]",
    "assert (z**2 + z + 1).is_irreducible()",
    "print('packed-polynomial-independent')",
    "",
  ].join("\n");
  for (const nativeDisabled of [false, true]) {
    const result = spawnSync(
      process.execPath,
      [join(root, "bin", "sagejs"), "--python"],
      {
        cwd: root,
        encoding: "utf8",
        input: source,
        env: {
          ...process.env,
          SAGEJS_FORBID_POLYNOMIAL_NAPI: "1",
          ...(nativeDisabled ? { SAGEJS_NATIVE_DISABLE: "1" } : {}),
        },
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stdout.trim(), "packed-polynomial-independent");
    assert.doesNotMatch(result.stderr, /forbidden legacy mathematical N-API/);
  }
});

test("generated opaque FLINT resources close deterministically", () => {
  const output = runSage(["--python"], [
    "from sagejs.ffi.flint import dirichlet_group, dirichlet_group_size, dirichlet_group_num_primitive",
    "group = dirichlet_group(5)",
    "print(dirichlet_group_size(group), dirichlet_group_num_primitive(group), group.closed)",
    "group.close()",
    "group.close()",
    "print(group.closed)",
    "try:",
    "    dirichlet_group_size(group)",
    "except ValueError as error:",
    "    print(type(error).__name__, str(error))",
    "with dirichlet_group(7) as scoped:",
    "    print(dirichlet_group_size(scoped))",
    "print(scoped.closed)",
    "",
  ].join("\n"));
  assert.equal(
    output.trim(),
    "4 3 False\nTrue\nValueError FFI resource is closed\n6\nTrue",
  );
});

test("resource results accept checked UInt64Buffer arguments", () => {
  const source = [
    "import sagejs.runtime as runtime",
    "from sagejs.ffi.flint import fmpq_matrix, fmpq_matrix_ncols, fmpq_matrix_nrows, fmpq_matrix_select_columns, fmpq_matrix_select_rows",
    "source = fmpq_matrix(3, 2)",
    "rows = fmpq_matrix_select_rows(source, runtime.uint64_buffer([2, 0, 2]), 3)",
    "columns = fmpq_matrix_select_columns(source, runtime.uint64_buffer([1, 0, 1]), 3)",
    "empty = fmpq_matrix_select_rows(source, runtime.uint64_buffer(0), 0)",
    "print(fmpq_matrix_nrows(rows), fmpq_matrix_ncols(rows))",
    "print(fmpq_matrix_nrows(columns), fmpq_matrix_ncols(columns))",
    "print(fmpq_matrix_nrows(empty), fmpq_matrix_ncols(empty))",
    "for invalid in [[-1], [2**65]]:",
    "    try:",
    "        fmpq_matrix_select_rows(source, invalid, 1)",
    "    except TypeError as error:",
    "        print(str(error))",
    "try:",
    "    fmpq_matrix_select_rows(source, runtime.uint64_buffer([3]), 1)",
    "except ValueError as error:",
    "    print(type(error).__name__, str(error))",
    "source.close()",
    "try:",
    "    fmpq_matrix_select_rows(source, runtime.uint64_buffer([0]), 1)",
    "except ValueError as error:",
    "    print(str(error))",
    "rows.close(); columns.close(); empty.close()",
    "",
  ].join("\n");
  const directory = mkdtempSync(join(tmpdir(), "sagejs-ffi-resource-buffer-"));
  try {
    const path = join(directory, "resource_buffer.py");
    writeFileSync(path, source);
    const output = runSage([path]);
    assert.equal(
      output.trim(),
      "3 2\n3 3\n0 2\n" +
      "invalid UInt64Buffer entry\n" +
      "invalid UInt64Buffer entry\n" +
        "ValueError rational matrix row selection contains an invalid index\n" +
        "FFI resource is closed",
    );

    const unmappedPath = join(directory, "unmapped_resource_error.py");
    writeFileSync(unmappedPath, [
      "import sagejs.ffi.flint as flint",
      "import sagejs.runtime as runtime",
      "source = flint.fmpq_matrix(3, 2)",
      "resource_identity = 'resource:' + flint.__sagejs_ffi_declaration__ + ':fmpq_matrix'",
      "runtime.ffi_resource_create(",
      "    flint.__sagejs_ffi_declaration__ + ':unmapped_resource_failure',",
      "    resource_identity,",
      "    '@sagemath/sagejs-flint',",
      "    'ffiFmpqMatrixSelectRows',",
      "    'ffiFmpqMatrixClose',",
      "    [source._ffi_borrow(), runtime.uint64_buffer([3]), 1],",
      "    [resource_identity, 'UInt64Buffer', 'uint64'],",
      "    [None, None, None],",
      "    'zero_is_error',",
      "    None,",
      "    None,",
      ")",
      "",
    ].join("\n"));
    const unmapped = spawnSync(
      process.execPath,
      [join(root, "bin", "sagejs"), unmappedPath],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(unmapped.status, 1, unmapped.stdout + unmapped.stderr);
    assert.match(
      unmapped.stderr,
      /Error: rational matrix row selection contains an invalid index/,
    );
    assert.doesNotMatch(unmapped.stderr, /ValueError:/);

    const falseBackendPath = join(directory, "false-resource-backend.cjs");
    writeFileSync(
      falseBackendPath,
      "module.exports = { create() { return false; }, close() {} };\n",
    );
    const falseStatusPath = join(directory, "unmapped_false_status.py");
    writeFileSync(
      falseStatusPath,
      [
        "import sagejs.runtime as runtime",
        "try:",
        "    runtime.ffi_resource_create(",
        "        'test@0000000000000000000000000000000000000000000000000000000000000000:false_status',",
        "        'resource:test@0000000000000000000000000000000000000000000000000000000000000000:false_resource',",
        `        ${JSON.stringify(falseBackendPath)},`,
        "        'create',",
        "        'close',",
        "        [],",
        "        [],",
        "        [],",
        "        'zero_is_error',",
        "        None,",
        "        None,",
        "    )",
        "except RuntimeError as error:",
        "    print(str(error))",
        "",
      ].join("\n"),
    );
    assert.equal(
      runSage([falseStatusPath]).trim(),
      "FFI declaration " +
        "test@0000000000000000000000000000000000000000000000000000000000000000:false_status " +
        "returned a failed status without a declared exception",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("generated rational matrix resources execute direct FLINT operations", () => {
  const flint = require("../packages/flint");
  const huge = 2n ** 1024n + 3n;
  const skewDenominator = 2n ** 257n + 93n;
  const leftEntries = [
    [2n ** 521n + 17n, 97n],
    [-13n, skewDenominator],
    [5n, 7n],
    [huge, 11n],
  ];
  const rightEntries = [
    [-(2n ** 509n + 29n), 89n],
    [2n ** 333n + 1n, 3n],
    [-19n, 23n],
    [17n, 2n ** 311n + 9n],
  ];

  function resourceMatrix(rows, columns, entries) {
    const resource = flint.ffiFmpqMatrixCreate(BigInt(rows), BigInt(columns));
    for (let index = 0; index < entries.length; index += 1) {
      assert.equal(flint.ffiFmpqMatrixSetEntry(
        resource,
        BigInt(Math.floor(index / columns)),
        BigInt(index % columns),
        entries[index][0],
        entries[index][1],
      ), true);
    }
    return resource;
  }

  function resourceEntries(resource) {
    const rows = Number(flint.ffiFmpqMatrixNrows(resource));
    const columns = Number(flint.ffiFmpqMatrixNcols(resource));
    return Array.from({ length: rows * columns }, (_, index) => [
      flint.ffiFmpqMatrixEntryNumerator(
        resource, BigInt(Math.floor(index / columns)), BigInt(index % columns)),
      flint.ffiFmpqMatrixEntryDenominator(
        resource, BigInt(Math.floor(index / columns)), BigInt(index % columns)),
    ]);
  }

  function oracleEntries(matrix, rows, columns) {
    return Array.from({ length: rows * columns }, (_, index) => {
      const value = flint.matrixEntry(
        matrix, Math.floor(index / columns), index % columns,
      );
      return [BigInt(value.numerator), BigInt(value.denominator)];
    });
  }

  const left = resourceMatrix(2, 2, leftEntries);
  const right = resourceMatrix(2, 2, rightEntries);
  const oracleLeft = flint.qqMatrix(2, 2, leftEntries);
  const oracleRight = flint.qqMatrix(2, 2, rightEntries);
  const originalLeft = resourceEntries(left);
  const originalRight = resourceEntries(right);
  const results = [];
  try {
    const accumulator = resourceMatrix(1, 1, [[1n, 3n]]);
    try {
      assert.equal(
        flint.ffiFmpqMatrixAddScaledEntry(
          accumulator, 0n, 0n, 5n, 7n, -2n,
        ),
        true,
      );
      assert.deepEqual(resourceEntries(accumulator), [[-23n, 21n]]);
      assert.throws(
        () => flint.ffiFmpqMatrixAddScaledEntry(
          accumulator, 0n, 0n, 1n, 0n, 1n,
        ),
        /invalid rational matrix entry update/,
      );
      assert.throws(
        () => flint.ffiFmpqMatrixAddScaledEntry(
          accumulator, 1n, 0n, 1n, 1n, 1n,
        ),
        /invalid rational matrix entry update/,
      );
    } finally {
      flint.ffiFmpqMatrixClose(accumulator);
    }
    for (const [resourceResult, oracleResult, rows, columns] of [
      [flint.ffiFmpqMatrixNeg(left), flint.matrixNeg(oracleLeft), 2, 2],
      [flint.ffiFmpqMatrixScalarMul(left, -17n, 19n),
        flint.matrixScalarMul(oracleLeft, -17n, 19n), 2, 2],
      [flint.ffiFmpqMatrixAdd(left, right),
        flint.matrixAdd(oracleLeft, oracleRight), 2, 2],
      [flint.ffiFmpqMatrixSub(left, right),
        flint.matrixSub(oracleLeft, oracleRight), 2, 2],
      [flint.ffiFmpqMatrixTranspose(left),
        flint.matrixTranspose(oracleLeft), 2, 2],
      [flint.ffiFmpqMatrixInv(left), flint.matrixInverse(oracleLeft), 2, 2],
      [flint.ffiFmpqMatrixSolve(left, right),
        flint.matrixSolve(oracleLeft, oracleRight), 2, 2],
    ]) {
      results.push(resourceResult);
      assert.deepEqual(
        resourceEntries(resourceResult),
        oracleEntries(oracleResult, rows, columns),
      );
    }
    assert.equal(flint.ffiFmpqMatrixEqual(left, left), true);
    assert.equal(flint.ffiFmpqMatrixEqual(left, right), false);
    assert.equal(
      flint.ffiFmpqMatrixEqual(left, right),
      flint.matrixEqual(oracleLeft, oracleRight),
    );
    assert.equal(flint.ffiFmpqMatrixIsZero(left), false);
    assert.equal(flint.ffiFmpqMatrixIsOne(left), false);
    assert.equal(
      flint.ffiFmpqMatrixRank(left),
      BigInt(flint.matrixRank(oracleLeft)),
    );
    const trace = flint.ffiFmpqMatrixTrace(left);
    try {
      const firstNumerator = leftEntries[0][0];
      const firstDenominator = leftEntries[0][1];
      const secondNumerator = leftEntries[3][0];
      const secondDenominator = leftEntries[3][1];
      const numerator = firstNumerator * secondDenominator +
        secondNumerator * firstDenominator;
      const denominator = firstDenominator * secondDenominator;
      let leftGcd = numerator < 0n ? -numerator : numerator;
      let rightGcd = denominator;
      while (rightGcd !== 0n) {
        [leftGcd, rightGcd] = [rightGcd, leftGcd % rightGcd];
      }
      assert.equal(flint.ffiFmpqValueNumerator(trace), numerator / leftGcd);
      assert.equal(flint.ffiFmpqValueDenominator(trace), denominator / leftGcd);
    } finally {
      flint.ffiFmpqValueClose(trace);
    }
    assert.deepEqual(resourceEntries(left), originalLeft);
    assert.deepEqual(resourceEntries(right), originalRight);

    const rectangular = resourceMatrix(2, 3, [
      [1n, 1n], [2n, 1n], [3n, 1n],
      [4n, 1n], [5n, 1n], [6n, 1n],
    ]);
    const singular = resourceMatrix(2, 2, [
      [1n, 1n], [2n, 1n], [2n, 1n], [4n, 1n],
    ]);
    const wrongRows = resourceMatrix(3, 1, [
      [1n, 1n], [2n, 1n], [3n, 1n],
    ]);
    const zero = resourceMatrix(2, 2, [
      [0n, 1n], [0n, 1n], [0n, 1n], [0n, 1n],
    ]);
    const identity = resourceMatrix(2, 2, [
      [1n, 1n], [0n, 1n], [0n, 1n], [1n, 1n],
    ]);
    try {
      assert.equal(flint.ffiFmpqMatrixIsZero(zero), true);
      assert.equal(flint.ffiFmpqMatrixIsOne(zero), false);
      assert.equal(flint.ffiFmpqMatrixIsZero(identity), false);
      assert.equal(flint.ffiFmpqMatrixIsOne(identity), true);
      assert.equal(flint.ffiFmpqMatrixEqual(left, rectangular), false);
      assert.throws(
        () => flint.ffiFmpqMatrixScalarMul(left, 1n, 0n),
        /invalid rational matrix scalar/,
      );
      assert.throws(
        () => flint.ffiFmpqMatrixTrace(rectangular),
        /trace requires a square rational matrix/,
      );
      assert.throws(
        () => flint.ffiFmpqMatrixAdd(left, rectangular),
        /dimensions are incompatible/,
      );
      assert.throws(
        () => flint.ffiFmpqMatrixSub(left, rectangular),
        /dimensions are incompatible/,
      );
      assert.throws(() => flint.ffiFmpqMatrixInv(rectangular), /singular/);
      assert.throws(() => flint.ffiFmpqMatrixInv(singular), /singular/);
      assert.throws(
        () => flint.ffiFmpqMatrixSolve(left, wrongRows),
        /no solutions/,
      );
      assert.throws(
        () => flint.ffiFmpqMatrixSolve(singular, right),
        /no solutions/,
      );
    } finally {
      flint.ffiFmpqMatrixClose(identity);
      flint.ffiFmpqMatrixClose(zero);
      flint.ffiFmpqMatrixClose(wrongRows);
      flint.ffiFmpqMatrixClose(singular);
      flint.ffiFmpqMatrixClose(rectangular);
    }
    const closed = flint.ffiFmpqMatrixCreate(1n, 1n);
    flint.ffiFmpqMatrixClose(closed);
    for (const operation of [
      () => flint.ffiFmpqMatrixNeg(closed),
      () => flint.ffiFmpqMatrixScalarMul(closed, 1n, 2n),
      () => flint.ffiFmpqMatrixEqual(closed, left),
      () => flint.ffiFmpqMatrixIsZero(closed),
      () => flint.ffiFmpqMatrixIsOne(closed),
      () => flint.ffiFmpqMatrixTrace(closed),
      () => flint.ffiFmpqMatrixRank(closed),
      () => flint.ffiFmpqMatrixRightKernel(closed),
    ]) {
      assert.throws(operation, /resource is closed|Invalid argument/);
    }
  } finally {
    for (const result of results.reverse()) flint.ffiFmpqMatrixClose(result);
    flint.ffiFmpqMatrixClose(right);
    flint.ffiFmpqMatrixClose(left);
  }
});

test("generated rational matrix resources provide structural operations", () => {
  const flint = require("../packages/flint");
  const resources = [];

  function create(rows, columns, entries = []) {
    const result = flint.ffiFmpqMatrixCreate(BigInt(rows), BigInt(columns));
    resources.push(result);
    for (let index = 0; index < entries.length; index += 1) {
      const [numerator, denominator] = entries[index];
      assert.equal(flint.ffiFmpqMatrixSetEntry(
        result,
        BigInt(Math.floor(index / columns)),
        BigInt(index % columns),
        numerator,
        denominator,
      ), true);
    }
    return result;
  }

  function remember(result) {
    resources.push(result);
    return result;
  }

  function shape(matrix) {
    return [
      Number(flint.ffiFmpqMatrixNrows(matrix)),
      Number(flint.ffiFmpqMatrixNcols(matrix)),
    ];
  }

  function entry(matrix, row, column) {
    return [
      flint.ffiFmpqMatrixEntryNumerator(
        matrix, BigInt(row), BigInt(column),
      ),
      flint.ffiFmpqMatrixEntryDenominator(
        matrix, BigInt(row), BigInt(column),
      ),
    ];
  }

  function entries(matrix) {
    const [rows, columns] = shape(matrix);
    return Array.from({ length: rows * columns }, (_, index) =>
      entry(matrix, Math.floor(index / columns), index % columns));
  }

  function selectedEntries(source, selectedRows, selectedColumns) {
    return selectedRows.flatMap((row) =>
      selectedColumns.map((column) => entry(source, row, column)));
  }

  try {
    const source = create(3, 4, [
      [1n, 2n], [0n, 1n], [3n, 4n], [5n, 6n],
      [-7n, 8n], [9n, 10n], [11n, 12n], [13n, 14n],
      [15n, 16n], [-17n, 18n], [19n, 20n], [21n, 22n],
    ]);
    const original = entries(source);
    assert.equal(flint.ffiFmpqMatrixNonzeroCount(source), 11n);

    const submatrix = remember(
      flint.ffiFmpqMatrixSubmatrix(source, 1n, 3n, 1n, 4n),
    );
    assert.deepEqual(shape(submatrix), [2, 3]);
    assert.deepEqual(
      entries(submatrix),
      selectedEntries(source, [1, 2], [1, 2, 3]),
    );

    const selectedRows = remember(flint.ffiFmpqMatrixSelectRows(
      source, new BigUint64Array([2n, 0n, 2n]), 3n,
    ));
    assert.deepEqual(shape(selectedRows), [3, 4]);
    assert.deepEqual(
      entries(selectedRows),
      selectedEntries(source, [2, 0, 2], [0, 1, 2, 3]),
    );

    const selectedColumns = remember(flint.ffiFmpqMatrixSelectColumns(
      source, new BigUint64Array([3n, 1n, 3n, 0n]), 4n,
    ));
    assert.deepEqual(shape(selectedColumns), [3, 4]);
    assert.deepEqual(
      entries(selectedColumns),
      selectedEntries(source, [0, 1, 2], [3, 1, 3, 0]),
    );

    const top = remember(flint.ffiFmpqMatrixSelectRows(
      source, new BigUint64Array([2n, 0n]), 2n,
    ));
    const bottom = remember(flint.ffiFmpqMatrixSelectRows(
      source, new BigUint64Array([1n]), 1n,
    ));
    const stacked = remember(flint.ffiFmpqMatrixStack(top, bottom));
    assert.deepEqual(shape(stacked), [3, 4]);
    assert.deepEqual(
      entries(stacked),
      selectedEntries(source, [2, 0, 1], [0, 1, 2, 3]),
    );

    const left = remember(flint.ffiFmpqMatrixSelectColumns(
      source, new BigUint64Array([3n, 1n]), 2n,
    ));
    const right = remember(flint.ffiFmpqMatrixSelectColumns(
      source, new BigUint64Array([0n]), 1n,
    ));
    const augmented = remember(flint.ffiFmpqMatrixAugment(left, right));
    assert.deepEqual(shape(augmented), [3, 3]);
    assert.deepEqual(
      entries(augmented),
      selectedEntries(source, [0, 1, 2], [3, 1, 0]),
    );

    const blockTarget = create(4, 5);
    assert.equal(
      flint.ffiFmpqMatrixSetBlock(blockTarget, 1n, 1n, submatrix), true,
    );
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        const expected = row >= 1 && row < 3 && column >= 1 && column < 4
          ? entry(submatrix, row - 1, column - 1)
          : [0n, 1n];
        assert.deepEqual(entry(blockTarget, row, column), expected);
      }
    }
    const blockBeforeFailure = entries(blockTarget);
    assert.throws(
      () => flint.ffiFmpqMatrixSetBlock(blockTarget, 3n, 3n, submatrix),
      /block bounds or aliases are invalid/,
    );
    assert.deepEqual(entries(blockTarget), blockBeforeFailure);
    assert.throws(
      () => flint.ffiFmpqMatrixSetBlock(source, 0n, 0n, source),
      /block bounds or aliases are invalid/,
    );
    assert.deepEqual(entries(source), original);

    assert.throws(
      () => flint.ffiFmpqMatrixSubmatrix(source, 2n, 1n, 0n, 1n),
      /submatrix bounds are invalid/,
    );
    assert.throws(
      () => flint.ffiFmpqMatrixSelectRows(
        source, new BigUint64Array([3n]), 1n,
      ),
      /row selection contains an invalid index/,
    );
    assert.throws(
      () => flint.ffiFmpqMatrixSelectColumns(
        source, new BigUint64Array([4n]), 1n,
      ),
      /column selection contains an invalid index/,
    );
    assert.throws(
      () => flint.ffiFmpqMatrixSelectRows(
        source, new BigUint64Array([0n, 1n]), 1n,
      ),
      /packed slice length does not match/,
    );
    const wrongColumns = create(1, 3);
    const wrongRows = create(2, 1);
    assert.throws(
      () => flint.ffiFmpqMatrixStack(source, wrongColumns),
      /same number of columns/,
    );
    assert.throws(
      () => flint.ffiFmpqMatrixAugment(source, wrongRows),
      /same number of rows/,
    );

    const noRows = create(0, 4);
    const noColumns = create(3, 0);
    const emptyRows = remember(flint.ffiFmpqMatrixSelectRows(
      noRows, new BigUint64Array(0), 0n,
    ));
    const columnsOfNoRows = remember(flint.ffiFmpqMatrixSelectColumns(
      noRows, new BigUint64Array([3n, 1n]), 2n,
    ));
    const rowsOfNoColumns = remember(flint.ffiFmpqMatrixSelectRows(
      noColumns, new BigUint64Array([2n, 0n]), 2n,
    ));
    const emptyColumns = remember(flint.ffiFmpqMatrixSelectColumns(
      noColumns, new BigUint64Array(0), 0n,
    ));
    assert.deepEqual(shape(emptyRows), [0, 4]);
    assert.deepEqual(shape(columnsOfNoRows), [0, 2]);
    assert.deepEqual(shape(rowsOfNoColumns), [2, 0]);
    assert.deepEqual(shape(emptyColumns), [3, 0]);
    assert.equal(flint.ffiFmpqMatrixNonzeroCount(emptyRows), 0n);
    assert.equal(flint.ffiFmpqMatrixNonzeroCount(emptyColumns), 0n);
  } finally {
    for (const resource of resources.reverse()) {
      flint.ffiFmpqMatrixClose(resource);
    }
  }
});

test("generated igraph views pin owners and invalidate on explicit close", () => {
  const output = runSage(["--python"], [
    "from sagejs.ffi.igraph import complete_graph, vertex_count, edges, edge_count, edge_checksum",
    "graph = complete_graph(5, False, False)",
    "view = edges(graph)",
    "print(vertex_count(graph), edge_count(view), edge_checksum(view), view.valid, graph.closed)",
    "graph.close()",
    "graph.close()",
    "print(view.valid, graph.closed)",
    "try:",
    "    edge_count(view)",
    "except ValueError as error:",
    "    print(type(error).__name__, str(error))",
    "",
  ].join("\n"));
  assert.equal(
    output.trim(),
    "5 10 4663669198664987395 True False\nFalse True\n" +
      "ValueError FFI resource is closed",
  );
});

test("typed FFI imports lower to declared host-isolated calls", async () => {
  const source = readFileSync(witness, "utf8");
  const ir = await lowerSource(source, witness);
  assert.equal(ir.version, 22);
  assert.equal(ir.foreignLibraries.length, 1);
  assert.equal(ir.foreignLibraries[0].id, "flint");
  assert.match(ir.foreignLibraries[0].declarationHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(ir.callGraph, {
    flint_word_is_prime: [],
    flint_integer_gcd: [],
  });
  const calls = ir.functions.map((fn) => fn.body[0]);
  assert.deepEqual(calls.map((call) => call.kind), ["ffi.call", "ffi.call"]);
  assert.deepEqual(
    calls.map((call) => call.foreign.declarationId),
    ["flint:n_is_prime", "flint:fmpz_gcd"],
  );
  assert.deepEqual(
    ir.functions.map((fn) => fn.analysis.effects.calls[0].split(":").at(-1)),
    ["n_is_prime", "fmpz_gcd"],
  );
  const core = generateHostCore(ir);
  assert.equal(core.audit.isolated, true);
  assert.equal(core.audit.hostCallbacks, 0);
  assert.ok(core.audit.nativeDependencies.includes("flint"));
  assert.match(core.source, /#include <flint\/fmpz\.h>/);
  assert.match(core.source, /n_is_prime\(\(ulong\)/);
  assert.match(core.source, /fmpz_gcd\(/);
  assert.match(core.source, /fmpz_set_mpz\(/);
  assert.match(core.source, /fmpz_get_mpz\(/);
  assert.doesNotMatch(core.source, /\b(?:napi_|PyObject|Py_|JSValue|v8::)/);
});

test("owned FLINT resources lower to lexical init and all-exit cleanup", async () => {
  const source = readFileSync(resourceWitness, "utf8");
  const ir = await lowerSource(source, resourceWitness);
  const fn = ir.functions[0];
  assert.equal(fn.foreignResources[0].python_name, "DirichletGroup");
  assert.match(fn.resourceAliases.group, /^sagejs_native_tmp_/);
  assert.equal(fn.analysis.effects.pure, false);
  assert.equal(fn.analysis.effects.replaySafe, false);
  const core = generateHostCore(ir);
  assert.equal(core.audit.isolated, true);
  assert.equal(core.audit.hostCallbacks, 0);
  assert.match(core.source, /dirichlet_group_init\(/);
  assert.match(core.source, /dirichlet_group_size\(/);
  assert.match(core.source, /dirichlet_group_num_primitive\(/);
  assert.match(core.source, /if \([^\n]*_initialized\)/);
  assert.match(core.source, /dirichlet_group_clear\(/);
  assert.doesNotMatch(core.source, /\b(?:napi_|PyObject|Py_|JSValue|v8::)/);
});

test("compiled owned resources agree with fallback and reject loop allocation", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-resource-"));
  try {
    const result = await compileKernel({
      sourcePath: resourceWitness,
      cacheRoot: temporary,
    });
    const module = require(result.modulePath);
    assert.deepEqual(module.dirichlet_summary(5n), [4n, 3n]);
    assert.deepEqual(module.dirichlet_summary.javascript(5n), [4n, 3n]);
    assert.throws(() => module.dirichlet_summary(0n));
    assert.throws(() => module.dirichlet_summary.javascript(0n));
  } finally {
    removeLoadedNativeCache(temporary);
  }
  await assert.rejects(
    () => lowerSource(
      "from sagejs.ffi.flint import dirichlet_group\n" +
      "def f(modulus: uint64, count: uint64) -> bool:\n" +
      "    for index in range(count):\n" +
      "        group = dirichlet_group(modulus)\n" +
      "    return True\n",
      "resource-in-loop.py",
    ),
    /owned FFI resources must be created in the top-level native block/,
  );
});

test("public kernels borrow and transfer generated FLINT resources", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-public-resource-"));
  try {
    const sourcePath = join(temporary, "resource_kernel.py");
    writeFileSync(sourcePath, [
      "from sagejs.ffi.flint import (",
      "    FmpqMatrix,",
      "    fmpq_matrix,",
      "    fmpq_matrix_copy,",
      "    fmpq_matrix_nrows,",
      ")",
      "from sagejs.native import native, uint64",
      "",
      "@native",
      "def create(rows: uint64, columns: uint64) -> FmpqMatrix:",
      "    return fmpq_matrix(rows, columns)",
      "",
      "@native",
      "def clone(matrix: FmpqMatrix) -> FmpqMatrix:",
      "    return fmpq_matrix_copy(matrix)",
      "",
      "@native",
      "def rows(matrix: FmpqMatrix) -> uint64:",
      "    return fmpq_matrix_nrows(matrix)",
      "",
    ].join("\n"));
    const compiled = await compileKernel({ sourcePath });
    const wrapperSource = readFileSync(compiled.modulePath, "utf8");
    assert.match(wrapperSource, /sagejsFfiAdoptNativeResourceResult/);
    assert.match(wrapperSource, /sagejsFfiPublishResourceResult/);
    assert.match(wrapperSource, /"pythonModule":"sagejs\.ffi\.flint"/);
    assert.match(wrapperSource, /"pythonName":"FmpqMatrix"/);
    assert.match(wrapperSource, /"closeExport":"ffiFmpqMatrixClose"/);
    assert.match(
      wrapperSource,
      /backend: nativeAddon,[\s\S]*?ownership: "owned"[\s\S]*?}, metadata, true\)/,
    );
    // Load the generated addon directly so this test exercises N-API type-tag
    // compatibility between two independently compiled resource adapters. The
    // ordinary public wrapper intentionally accepts only safe Python resource
    // objects, not raw addon handles.
    const kernel = require(compiled.addonPath);
    const flint = require("../packages/flint");
    const matrix = flint.ffiFmpqMatrixCreate(1n, 1n);
    assert.equal(
      flint.ffiFmpqMatrixSetEntry(matrix, 0n, 0n, 17n, 19n),
      true,
    );
    assert.throws(
      () => flint.ffiFmpqMatrixEntryNumerator(matrix, 1n, 0n),
      /out of bounds/,
    );
    const clone = kernel.clone(matrix);
    assert.equal(flint.ffiFmpqMatrixEntryNumerator(clone, 0n, 0n), 17n);
    assert.equal(flint.ffiFmpqMatrixEntryDenominator(clone, 0n, 0n), 19n);
    flint.ffiFmpqMatrixClose(clone);
    flint.ffiFmpqMatrixClose(matrix);

    const runnerPath = join(temporary, "exercise_resource_kernel.py");
    writeFileSync(runnerPath, [
      "from resource_kernel import clone, create, rows",
      "from sagejs.ffi.flint import (",
      "    fmpq_matrix,",
      "    fmpq_matrix_entry_denominator,",
      "    fmpq_matrix_entry_numerator,",
      "    fmpq_matrix_ncols,",
      "    fmpq_matrix_nrows,",
      "    fmpq_matrix_set_entry,",
      "    fmpz_matrix,",
      ")",
      "",
      "source = create(2, 3)",
      "assert type(source).__name__ == 'FmpqMatrix'",
      "assert rows(source) == 2",
      "assert fmpq_matrix_ncols(source) == 3",
      "assert fmpq_matrix_set_entry(source, 1, 2, 17, 19)",
      "copy = clone(source)",
      "assert type(copy).__name__ == 'FmpqMatrix'",
      "assert fmpq_matrix_entry_numerator(copy, 1, 2) == 17",
      "assert fmpq_matrix_entry_denominator(copy, 1, 2) == 19",
      "source.close()",
      "source.close()",
      "assert source.closed",
      "assert fmpq_matrix_nrows(copy) == 2",
      "for operation in [lambda: rows(source), lambda: clone(source)]:",
      "    try:",
      "        operation()",
      "    except ValueError as error:",
      "        assert str(error) == 'FFI resource is closed'",
      "    else:",
      "        raise AssertionError('closed resource was accepted')",
      "wrong = fmpz_matrix(1, 1)",
      "try:",
      "    clone(wrong)",
      "except TypeError as error:",
      "    assert 'wrong FFI resource type' in str(error)",
      "else:",
      "    raise AssertionError('wrong resource type was accepted')",
      "wrong.close()",
      "copy.close()",
      "copy.close()",
      "assert copy.closed",
      "print('owned-resource-result-ok')",
      "",
    ].join("\n"));
    for (const env of [{}, { SAGEJS_NATIVE_DISABLE: "1" }]) {
      assert.equal(
        runSage([runnerPath], undefined, env).trim(),
        "owned-resource-result-ok",
      );
    }

    const lifecycle = spawnSync(process.execPath, ["--expose-gc", "-e", `
const assert = require("node:assert/strict");
globalThis.__sagejs_load_module__ = () => ({
  FmpqMatrix(token) { return { token }; },
});
const wrapper = require(${JSON.stringify(compiled.modulePath)});
const addon = require(${JSON.stringify(compiled.addonPath)});
const accounted = addon.__sagejsFfiResourceExternalMemory;
const tag = () => globalThis.__sagejs_ffi_resource_tag__;

const explicit = wrapper.create(32n, 32n);
const explicitState = explicit.token[tag()];
assert.ok(accounted(explicitState.handle) > 0n);
Reflect.apply(explicitState.close, explicitState.backend, [explicitState.handle]);
explicitState.closed = true;
assert.equal(accounted(explicitState.handle), 0n);
explicitState.handle = null;

function unreachableHolder() {
  const value = wrapper.create(32n, 32n);
  return new WeakRef(value.token[tag()].handle);
}

(async () => {
  const reference = unreachableHolder();
  let collected = false;
  for (let turn = 0; turn < 50; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    global.gc();
    await new Promise((resolve) => setImmediate(resolve));
    if (reference.deref() === undefined) {
      collected = true;
      break;
    }
  }
  assert.equal(collected, true, "native owned holder stayed strongly reachable");
  process.stdout.write("owned-resource-lifecycle-ok");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
`], { cwd: root, encoding: "utf8" });
    assert.equal(
      lifecycle.status,
      0,
      `${lifecycle.stdout}\n${lifecycle.stderr}`,
    );
    assert.equal(lifecycle.stdout, "owned-resource-lifecycle-ok");
  } finally {
    removeLoadedNativeCache(temporary);
  }
});

test("borrowed igraph views lower without cleanup and agree across paths", async () => {
  const source = readFileSync(igraphWitness, "utf8");
  const ir = await lowerSource(source, igraphWitness);
  const fn = ir.functions[0];
  assert.deepEqual(
    fn.foreignResources.map((resource) => [resource.python_name, resource.ownership]),
    [["IGraph", "owned"], ["IGraphEdges", "borrowed"]],
  );
  const core = generateHostCore(ir);
  assert.equal(core.audit.isolated, true);
  assert.equal(core.audit.hostCallbacks, 0);
  assert.match(core.source, /sagejs_igraph_edges_borrow\(/);
  assert.match(core.source, /sagejs_igraph_graph_clear\(/);
  assert.doesNotMatch(core.source, /napi_|PyObject|JSValue|v8::/);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-igraph-"));
  try {
    const result = await compileKernel({
      sourcePath: igraphWitness,
      cacheRoot: temporary,
    });
    const module = require(result.modulePath);
    assert.deepEqual(
      module.complete_graph_summary(5n),
      [5n, 10n, 4663669198664987395n],
    );
    assert.deepEqual(
      module.complete_graph_summary.javascript(5n),
      [5n, 10n, 4663669198664987395n],
    );
  } finally {
    removeLoadedNativeCache(temporary);
  }
});

test("packed matrix FFI lowers to lexical FLINT storage with checked status", async () => {
  const source = readFileSync(matrixWitness, "utf8");
  const ir = await lowerSource(source, matrixWitness);
  assert.deepEqual(
    ir.functions.map((fn) => fn.analysis.effects.externalWrites),
    [[], ["output"]],
  );
  assert.equal(ir.functions[0].analysis.effects.replaySafe, true);
  assert.equal(ir.functions[1].analysis.effects.replaySafe, false);
  const core = generateHostCore(ir);
  assert.equal(core.audit.hostCallbacks, 0);
  assert.match(core.header, /sagejs_uint64_buffer/);
  assert.match(core.source, /nmod_mat_init\(/);
  assert.match(core.source, /nmod_mat_rank\(/);
  assert.match(core.source, /nmod_mat_inv\(/);
  assert.match(core.source, /nmod_mat_clear\(/);
  assert.match(core.source, /matrix is singular/);
  assert.doesNotMatch(core.source, /\b(?:napi_|PyObject|Py_|JSValue|v8::)/);
});

test("compiled packed matrix FFI agrees with fallback and supports aliasing", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-matrix-"));
  try {
    const result = await compileKernel({
      sourcePath: matrixWitness,
      cacheRoot: temporary,
    });
    const module = require(result.modulePath);
    const source = module.createUInt64Buffer([1n, 2n, 3n, 4n]);
    assert.equal(module.flint_nmod_rank(source, 2n, 2n, 5n), 2n);
    assert.equal(
      module.flint_nmod_rank.javascript(source, 2n, 2n, 5n),
      2n,
    );
    const output = module.createUInt64Buffer(4);
    assert.equal(module.flint_nmod_inverse(output, source, 2n, 5n), true);
    assert.deepEqual(Array.from(output), [3n, 1n, 4n, 2n]);
    const alias = module.createUInt64Buffer([1n, 2n, 3n, 4n]);
    assert.equal(module.flint_nmod_inverse(alias, alias, 2n, 5n), true);
    assert.deepEqual(Array.from(alias), [3n, 1n, 4n, 2n]);
    const dynamicOutput = module.createUInt64Buffer(4);
    assert.equal(module.flint_nmod_inverse.javascript(
      dynamicOutput, source, 2n, 5n,
    ), true);
    assert.deepEqual(Array.from(dynamicOutput), [3n, 1n, 4n, 2n]);
    const singular = module.createUInt64Buffer([1n, 2n, 2n, 4n]);
    const failedOutput = module.createUInt64Buffer([9n, 9n, 9n, 9n]);
    assert.throws(
      () => module.flint_nmod_inverse(
        failedOutput, singular, 2n, 5n,
      ),
      /matrix is singular/,
    );
    assert.deepEqual(Array.from(failedOutput), [9n, 9n, 9n, 9n]);
    assert.deepEqual(module.flint_nmod_inverse.effects.externalWrites, ["output"]);
  } finally {
    removeLoadedNativeCache(temporary);
  }
});

test("generic packed slices compile igraph and FLINT without symbol intrinsics", async () => {
  const codeGenerator = readFileSync(
    join(root, "tools", "native-kernel", "ffi-codegen.cjs"), "utf8",
  );
  assert.doesNotMatch(codeGenerator,
    /sagejs_igraph_canonical_permutation_packed|sagejs_flint_nmod_poly_mul_packed/);
  for (const sourcePath of [igraphCanonicalWitness, polynomialWitness]) {
    const source = readFileSync(sourcePath, "utf8");
    const ir = await lowerSource(source, sourcePath);
    const operation = ir.functions[0].body.find((item) => item.kind === "ffi.call");
    assert.equal(operation.foreign.function.call_plan.schema,
      "sagejs.ffi/call-plan-v2");
    assert.equal(operation.foreign.function.call_plan.arguments[0]
      .lowering.adapter, "packed_slice");
    const core = generateHostCore(ir);
    assert.equal(core.audit.hostCallbacks, 0);
    assert.match(core.source, /unable to stage FFI output/);
    assert.match(core.source, /memcpy\(/);
    if (sourcePath === igraphCanonicalWitness) {
      assert.ok(core.audit.nativeDependencies.includes("C++ runtime"));
      assert.match(core.source, /sagejs_igraph_canonical_request_t/);
      assert.match(core.source,
        /sagejs_ffi_shield_igraph_canonical_permutation/);
      assert.match(core.source, /graph has no edge endpoints/);
    }
    assert.doesNotMatch(core.source, /\b(?:napi_|PyObject|Py_|JSValue|v8::)/);
  }
});

test("generated C++ shields convert actual exceptions to declared status", (t) => {
  if (process.platform === "win32") {
    t.skip("portable compiler smoke test uses Unix C++ command-line syntax");
    return;
  }
  const compiler = process.env.CXX || "c++";
  if (spawnSync(compiler, ["--version"]).status !== 0) {
    t.skip(`${compiler} is unavailable`);
    return;
  }
  const fn = {
    declaration_id: "witness:may_throw",
    result: { domain: "status", success: [1], absence: null },
    exceptions: { policy: "cxx_to_status", failure_status: -7 },
    call_plan: {
      symbol: "sagejs_ffi_shield_witness_may_throw",
      foreign_symbol: "witness_may_throw",
      native_return_c_type: "int",
      arguments: [{
        position: 0,
        lowering: { kind: "scalar", c_type: "uint64_t" },
      }],
    },
  };
  const second = {
    ...fn,
    declaration_id: "witness:may_throw_too",
    call_plan: {
      ...fn.call_plan,
      declaration_id: "witness:may_throw_too",
      symbol: "sagejs_ffi_shield_witness_may_throw_too",
      foreign_symbol: "witness_may_throw_too",
    },
  };
  fn.call_plan.declaration_id = fn.declaration_id;
  const ir = {
    foreignLibraries: [{ native: { headers: ["witness.hpp"] } }],
    functions: [{
      body: [
        { kind: "ffi.call", foreign: { function: fn } },
        { kind: "ffi.call", foreign: { function: second } },
      ],
    }],
  };
  const generated = generateExceptionShims(ir);
  assert.ok(generated);
  assert.equal(generated.functions.length, 2);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-shield-"));
  try {
    writeFileSync(join(temporary, "ffi_shims.h"), generated.header);
    writeFileSync(join(temporary, "ffi_shims.cc"), generated.source);
    writeFileSync(join(temporary, "witness.hpp"),
      "#include <stdint.h>\n" +
      "extern \"C\" int witness_may_throw(uint64_t);\n" +
      "extern \"C\" int witness_may_throw_too(uint64_t);\n");
    writeFileSync(join(temporary, "witness.cc"),
      "#include <stdexcept>\n#include \"witness.hpp\"\n" +
      "extern \"C\" int witness_may_throw(uint64_t value) {\n" +
      "  if (value == 7) throw std::runtime_error(\"witness\");\n" +
      "  return 1;\n}\n" +
      "extern \"C\" int witness_may_throw_too(uint64_t value) {\n" +
      "  if (value == 8) throw std::runtime_error(\"second witness\");\n" +
      "  return 1;\n}\n");
    writeFileSync(join(temporary, "main.cc"),
      "#include \"ffi_shims.h\"\n" +
      "int main() {\n" +
      "  if (sagejs_ffi_shield_witness_may_throw(2) != 1) return 1;\n" +
      "  if (sagejs_ffi_shield_witness_may_throw(7) != -7) return 2;\n" +
      "  if (sagejs_ffi_shield_witness_may_throw_too(3) != 1) return 3;\n" +
      "  if (sagejs_ffi_shield_witness_may_throw_too(8) != -7) return 4;\n" +
      "  return 0;\n}\n");
    const executable = join(temporary, "shield-test");
    const build = spawnSync(compiler, [
      "-std=c++17", `-I${temporary}`, join(temporary, "ffi_shims.cc"),
      join(temporary, "witness.cc"), join(temporary, "main.cc"),
      "-o", executable,
    ], { encoding: "utf8" });
    assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
    const run = spawnSync(executable, [], { encoding: "utf8" });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("generated binding.gyp pins portable C++17 settings on every host", () => {
  assert.deepEqual(generatedCxxLanguageSettings("linux"), {
    compilerFlag: "-std=c++17",
    msvc: null,
    xcode: null,
  });
  assert.deepEqual(generatedCxxLanguageSettings("darwin"), {
    compilerFlag: "-std=c++17",
    msvc: null,
    xcode: "c++17",
  });
  assert.deepEqual(generatedCxxLanguageSettings("win32"), {
    compilerFlag: null,
    msvc: "stdcpp17",
    xcode: null,
  });

  const ir = {
    foreignLibraries: [],
    functions: [{ kernelKind: "prime-field-matrix" }],
  };
  const linux = bindingGyp(ir, true, true, "linux").targets[0];
  assert.deepEqual(linux["cflags_cc!"], ["-fno-exceptions", "-fno-rtti"]);
  assert.deepEqual(linux.cflags_cc, [
    "-std=c++17",
    "-fexceptions",
    "-frtti",
  ]);
  assert.equal(linux.xcode_settings, undefined);

  const macos = bindingGyp(ir, true, true, "darwin").targets[0];
  assert.deepEqual(macos.cflags_cc, [
    "-std=c++17",
    "-fexceptions",
    "-frtti",
  ]);
  assert.deepEqual(macos.xcode_settings, {
    CLANG_CXX_LANGUAGE_STANDARD: "c++17",
    GCC_ENABLE_CPP_EXCEPTIONS: "YES",
    GCC_ENABLE_CPP_RTTI: "YES",
    GCC_OPTIMIZATION_LEVEL: "3",
    MACOSX_DEPLOYMENT_TARGET:
      process.env.MACOSX_DEPLOYMENT_TARGET || "13.0",
  });

  const windows = bindingGyp(ir, true, true, "win32").targets[0];
  assert.equal(
    windows.configurations.Release.msbuild_toolset,
    "ClangCL",
  );
  assert.deepEqual(windows.msvs_settings.VCCLCompilerTool, {
    ExceptionHandling: 1,
    LanguageStandard: "stdcpp17",
    Optimization: 3,
    RuntimeTypeInfo: "true",
    WarningLevel: 3,
  });
  assert.equal(windows.cflags_cc, undefined);

  const exactWindows = bindingGyp({
    foreignLibraries: [],
    functions: [{ kernelKind: "integer" }],
  }, true, false, "win32").targets[0];
  assert.equal(
    exactWindows.configurations.Release.msbuild_toolset,
    "ClangCL",
  );
});

test("Windows native builds use a short disposable junction", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-native-build-path-"));
  try {
    const outputPath = join(
      temporary,
      "source-local-cache-with-a-deliberately-long-name",
      ".sagejs-native-kernels",
      "a".repeat(64),
    );
    mkdirSync(outputPath, { recursive: true });
    writeFileSync(join(outputPath, "witness.txt"), "junction-target\n");
    const homeDirectory = join(temporary, "h");
    const aliasRoot = join(homeDirectory, ".sagejs-native-build");
    const workspace = nativeBuildWorkspace(outputPath, {
      platform: "win32",
      environment: {},
      homeDirectory,
    });
    const aliasPath = workspace.directory;
    try {
      assert.ok(aliasPath.startsWith(aliasRoot));
      assert.ok(aliasPath.length < outputPath.length);
      assert.equal(
        readFileSync(join(aliasPath, "witness.txt"), "utf8"),
        "junction-target\n",
      );
      writeFileSync(join(aliasPath, "built.txt"), "built-through-alias\n");
      assert.equal(
        readFileSync(join(outputPath, "built.txt"), "utf8"),
        "built-through-alias\n",
      );
    } finally {
      workspace.close();
      workspace.close();
    }
    assert.equal(existsSync(aliasPath), false);
    assert.equal(existsSync(join(outputPath, "witness.txt")), true);

    const direct = nativeBuildWorkspace(outputPath, { platform: "linux" });
    assert.equal(direct.directory, outputPath);
    direct.close();
    assert.equal(existsSync(outputPath), true);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("generated binding.gyp selects exact-platform link declarations", () => {
  const prefix = join(root, "packages", "fflas", ".native", "prefix", "lib");
  const ir = {
    foreignLibraries: [{
      id: "platform_witness",
      native: {
        link: {
          unix: ["fallback.a"],
          windows: ["witness.lib"],
          linux: ["linux.a"],
          darwin: ["Darwin.tbd"],
        },
        toolchain: {
          prefix_environment: "SAGEJS_FFLAS_PREFIX",
          unix_default: "packages/fflas/.native/prefix",
          windows_default: "packages/fflas/.native/prefix",
          include_dirs: ["include"],
          source_include_dirs: ["packages/fflas/include"],
        },
      },
    }],
    functions: [{ kernelKind: "prime-field-matrix" }],
  };
  assert.ok(bindingGyp(ir, true, false, "linux").targets[0].libraries
    .includes(join(prefix, "linux.a")));
  assert.deepEqual(
    bindingGyp(ir, true, false, "linux").targets[0].include_dirs.slice(0, 2),
    [
      join(root, "packages", "fflas", "include"),
      join(root, "packages", "fflas", ".native", "prefix", "include"),
    ],
  );
  assert.ok(bindingGyp(ir, true, false, "darwin").targets[0].libraries
    .includes(join(prefix, "Darwin.tbd")));
  delete ir.foreignLibraries[0].native.link.darwin;
  assert.ok(bindingGyp(ir, true, false, "darwin").targets[0].libraries
    .includes(join(prefix, "fallback.a")));
  ir.foreignLibraries[0].native.link.darwin = [];
  assert.equal(bindingGyp(ir, true, false, "darwin").targets[0].libraries
    .includes(join(prefix, "fallback.a")), false);
});

test("native foreign input identity hashes only selected platform links", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-platform-link-inputs-"));
  const previous = process.env.SAGEJS_PLATFORM_LINK_TEST_PREFIX;
  try {
    mkdirSync(join(temporary, "lib"), { recursive: true });
    const selected = process.platform === "win32"
      ? "selected.lib"
      : process.platform === "darwin" ? "selected.tbd" : "selected.a";
    writeFileSync(join(temporary, "lib", selected), "selected platform input\n");
    process.env.SAGEJS_PLATFORM_LINK_TEST_PREFIX = temporary;
    const link = {
      unix: ["missing-fallback.a"],
      windows: ["selected.lib"],
      linux: ["selected.a"],
      darwin: ["selected.tbd"],
    };
    const inputs = foreignCompilationInputs({
      foreignLibraries: [{
        id: "platform_link_test",
        native: {
          headers: [],
          link,
          toolchain: {
            prefix_environment: "SAGEJS_PLATFORM_LINK_TEST_PREFIX",
            unix_default: "unused",
            windows_default: "unused",
            include_dirs: [],
            source_include_dirs: [],
          },
        },
      }],
    });
    assert.deepEqual(inputs[0].libraries.map(({ name }) => name), [selected]);
  } finally {
    if (previous === undefined) {
      delete process.env.SAGEJS_PLATFORM_LINK_TEST_PREFIX;
    } else {
      process.env.SAGEJS_PLATFORM_LINK_TEST_PREFIX = previous;
    }
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("compiled packed slices agree with fallbacks and commit outputs transactionally", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-slices-"));
  try {
    const graphResult = await compileKernel({
      sourcePath: igraphCanonicalWitness,
      cacheRoot: join(temporary, "graph"),
    });
    const graph = require(graphResult.modulePath);
    assert.ok(existsSync(graphResult.shimSourcePath));
    assert.ok(existsSync(graphResult.shimHeaderPath));
    if (process.platform !== "win32") {
      const binding = JSON.parse(readFileSync(
        join(graphResult.outputPath, "binding.gyp"),
        "utf8",
      ));
      assert.deepEqual(
        binding.targets[0]["cflags_cc!"],
        ["-fno-exceptions", "-fno-rtti"],
      );
      assert.deepEqual(
        binding.targets[0].cflags_cc,
        ["-std=c++17", "-fexceptions", "-frtti"],
      );
      if (process.platform === "darwin") {
        assert.equal(
          binding.targets[0].xcode_settings.CLANG_CXX_LANGUAGE_STANDARD,
          "c++17",
        );
      }
    }
    assert.match(readFileSync(graphResult.shimSourcePath, "utf8"),
      /catch \(\.\.\.\)/);
    assert.match(readFileSync(graphResult.shimSourcePath, "utf8"),
      /return 0;/);
    const edges = graph.createUInt64Buffer([
      0n, 1n, 1n, 2n, 2n, 3n, 3n, 4n, 4n, 5n, 5n, 0n,
    ]);
    const labels = graph.createUInt64Buffer(6);
    assert.equal(graph.igraph_canonical_labels(labels, edges, 6n, 12n, false), true);
    const dynamicLabels = graph.createUInt64Buffer(6);
    assert.equal(graph.igraph_canonical_labels.javascript(
      dynamicLabels, edges, 6n, 12n, false,
    ), true);
    assert.deepEqual(Array.from(labels), Array.from(dynamicLabels));
    assert.equal(graph.igraph_first_endpoint(edges, 12n), 0n);
    assert.equal(graph.igraph_first_endpoint.javascript(
      edges, 12n,
    ), 0n);
    const noEdges = graph.createUInt64Buffer(0);
    assert.throws(() => graph.igraph_first_endpoint(noEdges, 0n),
      /graph has no edge endpoints/);
    assert.throws(() => graph.igraph_first_endpoint.javascript(noEdges, 0n),
      /graph has no edge endpoints/);
    const failedLabels = graph.createUInt64Buffer([
      91n, 92n, 93n, 94n, 95n, 96n,
    ]);
    const oddEdges = graph.createUInt64Buffer([0n, 1n, 2n]);
    assert.throws(() => graph.igraph_canonical_labels(
      failedLabels, oddEdges, 6n, 3n, false,
    ), /canonical labeling failed/);
    assert.deepEqual(Array.from(failedLabels), [91n, 92n, 93n, 94n, 95n, 96n]);

    const polynomialResult = await compileKernel({
      sourcePath: polynomialWitness,
      cacheRoot: join(temporary, "flint"),
    });
    const polynomial = require(polynomialResult.modulePath);
    const left = polynomial.createUInt64Buffer([1n, 2n, 3n]);
    const right = polynomial.createUInt64Buffer([4n, 5n, 6n]);
    const product = polynomial.createUInt64Buffer(5);
    assert.equal(polynomial.flint_nmod_polynomial_product(
      product, left, right, 5n, 3n, 3n, 101n,
    ), true);
    assert.deepEqual(Array.from(product), [4n, 13n, 28n, 27n, 18n]);
    const failedProduct = polynomial.createUInt64Buffer([
      81n, 82n, 83n, 84n,
    ]);
    assert.throws(() => polynomial.flint_nmod_polynomial_product(
      failedProduct, left, right, 4n, 3n, 3n, 101n,
    ), /invalid packed polynomial multiplication/);
    assert.deepEqual(Array.from(failedProduct), [81n, 82n, 83n, 84n]);
  } finally {
    removeLoadedNativeCache(temporary);
  }
});

test("declared FLINT functions execute identically through native and fallback paths", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-native-"));
  try {
    const result = await compileKernel({ sourcePath: witness, cacheRoot: temporary });
    const module = require(result.modulePath);
    for (const value of [2, 97, 221, 18446744073709551557n]) {
      assert.equal(
        module.flint_word_is_prime(value),
        module.flint_word_is_prime.javascript(value),
      );
    }
    const left = ((2n ** 127n) - 1n) * 17n;
    const right = ((2n ** 61n) - 1n) * 17n;
    assert.equal(module.flint_integer_gcd(left, right), 17n);
    assert.equal(module.flint_integer_gcd.gmp(left, right), 17n);
    assert.equal(module.flint_integer_gcd.javascript(left, right), 17n);
    assert.equal(module.flint_integer_gcd.backendFor(left, right), "tagged");
    assert.equal(module.flint_integer_gcd.effects.pure, true);
    assert.equal(module.flint_integer_gcd.effects.replaySafe, true);
    assert.equal(module.flint_integer_gcd.effects.threadSafe, true);
    assert.equal(module.flint_integer_gcd.effects.mayAllocate, true);
    assert.equal(module.flint_word_is_prime.effects.mayAllocate, false);
  } finally {
    removeLoadedNativeCache(temporary);
  }
});

test("native FFI compilation rejects undeclared imports and functions", async () => {
  await assert.rejects(
    () => lowerSource(
      "from sagejs.ffi.missing import mystery\n" +
        "def f(value: uint64) -> bool:\n    return mystery(value)\n",
      "missing-ffi.py",
    ),
    /undeclared FFI module sagejs\.ffi\.missing/,
  );
  await assert.rejects(
    () => lowerSource(
      "from sagejs.ffi.flint import mystery\n" +
        "def f(value: uint64) -> bool:\n    return mystery(value)\n",
      "missing-function.py",
    ),
    /has no declared FFI function or resource mystery/,
  );
});

test("native FFI imports preserve Python aliases and shadowing", async () => {
  const ir = await lowerSource(
    "from sagejs.ffi.flint import n_is_prime as abs\n" +
      "def f(value: uint64) -> bool:\n    return abs(value)\n",
    "aliased-ffi.py",
  );
  assert.equal(ir.functions[0].body[0].kind, "ffi.call");
  assert.equal(ir.functions[0].body[0].foreign.import.localName, "abs");
  assert.equal(ir.functions[0].body[0].foreign.function.pythonName, "n_is_prime");
});

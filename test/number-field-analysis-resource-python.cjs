#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { createSage } = require("../dist/tools/kernel.js");
const { removeLoadedNativeCache } = require("./helpers/native-cache-cleanup.cjs");

const root = resolve(__dirname, "..");

test("independent Python authenticates and corrupts fused field analysis", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "import sagejs.ffi.flint as flint",
      "from sagejs.number_fields.field_analysis_resource import NativeFieldAnalysisResult, authenticated_field_analysis_matches, decode_field_analysis_resource, native_field_analysis",
      "def packed(coefficients, scale=1, bound=1000):",
      "    polynomial = flint.fmpz_polynomial(len(coefficients))",
      "    try:",
      "        for i, value in enumerate(coefficients):",
      "            flint.fmpz_polynomial_set_coefficient(polynomial, i, value)",
      "        flint.fmpz_polynomial_seal(polynomial)",
      "        resource = flint.number_field_analyze_resource(polynomial, scale, bound)",
      "        try:",
      "            return list(resource.copy_bytes())",
      "        finally:",
      "            resource.close()",
      "    finally:",
      "        polynomial.close()",
      "def put_u64(raw, offset, value):",
      "    for i in range(8):",
      "        raw[offset + i] = (value >> (8 * i)) & 255",
      "def integer_regions(raw):",
      "    count = sum(raw[56 + i] << (8 * i) for i in range(8))",
      "    offset = 80",
      "    answer = []",
      "    for unused in range(count):",
      "        header = sum(raw[offset + i] << (8 * i) for i in range(4))",
      "        length = header & 0x7fffffff",
      "        answer.append((offset, offset + 4, offset + 4 + length))",
      "        offset += 4 + length",
      "    return answer",
      "def replace_small_integer(raw, index, value):",
      "    regions = integer_regions(raw)",
      "    header, body, end = regions[index]",
      "    encoded = [0, 0, 0, 0] if value == 0 else [1, 0, 0, 0, value]",
      "    raw[header:end] = encoded",
      "def rejects(raw, polynomial=None, scale=None, bound=None):",
      "    try:",
      "        decode_field_analysis_resource(raw, expected_polynomial=polynomial, expected_scale=scale, expected_trial_bound=bound)",
      "        return False",
      "    except ValueError:",
      "        return True",
      "complete_raw = packed([-5, 0, 1], 3)",
      "complete = decode_field_analysis_resource(complete_raw, expected_polynomial=[-5, 0, 1], expected_scale=3)",
      "partial_raw = packed([-1022117, 0, 1])",
      "partial = decode_field_analysis_resource(partial_raw)",
      "arbitrary_raw = packed([-18446744073709551629, 0, 1])",
      "arbitrary = decode_field_analysis_resource(arbitrary_raw)",
      "wild_raw = packed([-2, 0, 0, 1])",
      "wild = decode_field_analysis_resource(wild_raw)",
      "tame = decode_field_analysis_resource(packed([-5, 0, 0, 1]))",
      "multi = decode_field_analysis_resource(packed([-10, 0, 0, 1]))",
      "checks = []",
      "checks.append(rejects(complete_raw[:-1]))",
      "tampered = complete_raw[:]",
      "put_u64(tampered, 56, (1 << 64) - 1)",
      "checks.append(rejects(tampered))",
      "tampered = complete_raw + [0]",
      "checks.append(rejects(tampered))",
      "tampered = complete_raw[:]",
      "put_u64(tampered, 40, 99)",
      "checks.append(rejects(tampered))",
      "tampered = complete_raw[:]",
      "regions = integer_regions(tampered)",
      "tampered[regions[3][1]] = tampered[regions[3][1]] + 1",
      "checks.append(rejects(tampered))",
      "tampered = partial_raw[:]",
      "put_u64(tampered, 16, 0)",
      "checks.append(rejects(tampered))",
      "tampered = partial_raw[:]",
      "regions = integer_regions(tampered)",
      "tampered[regions[13][1]] = 0",
      "checks.append(rejects(tampered))",
      "tampered = complete_raw[:]",
      "regions = integer_regions(tampered)",
      "tampered[regions[14][1]] = 3",
      "checks.append(rejects(tampered))",
      "tampered = complete_raw[:]",
      "put_u64(tampered, 72, 0)",
      "checks.append(rejects(tampered))",
      "tampered = complete_raw[:]",
      "put_u64(tampered, 72, 2)",
      "checks.append(rejects(tampered))",
      "tampered = complete_raw[:]",
      "replace_small_integer(tampered, 17, 0)",
      "checks.append(rejects(tampered))",
      "alternate = complete_raw[:]",
      "replace_small_integer(alternate, 16, 2)",
      "replace_small_integer(alternate, 17, 3)",
      "checks.append(decode_field_analysis_resource(alternate).certified)",
      "checks.append(len(wild.fixed_point_witnesses[0].radical_rows) > 0)",
      "tampered = wild_raw[:]",
      "replace_small_integer(tampered, 16, 1)",
      "checks.append(rejects(tampered))",
      "tampered = complete_raw[:]",
      "regions = integer_regions(tampered)",
      "zero_header = regions[7][0]",
      "tampered[zero_header + 3] = 128",
      "checks.append(rejects(tampered))",
      "tampered = complete_raw[:]",
      "regions = integer_regions(tampered)",
      "first_header, first_body, first_end = regions[0]",
      "tampered[first_header] = 2",
      "tampered.insert(first_end, 0)",
      "checks.append(rejects(tampered))",
      "checks.append(rejects(complete_raw, [-6, 0, 1], 3))",
      "checks.append(rejects(complete_raw, [-5, 0, 1], 4))",
      "checks.append(rejects(complete_raw, [-5, 0, 1], 3, 999))",
      "immutable = True",
      "try:",
      "    complete.status = 1",
      "    immutable = False",
      "except AttributeError:",
      "    pass",
      "try:",
      "    complete.components[0].value = 3",
      "    immutable = False",
      "except AttributeError:",
      "    pass",
      "try:",
      "    complete.fixed_point_witnesses[0].prime = 3",
      "    immutable = False",
      "except AttributeError:",
      "    pass",
      "checks.append(immutable and complete.certified)",
      "checks.append(authenticated_field_analysis_matches(complete, polynomial=[-5, 0, 1], scale=3, trial_bound=1000, equation_discriminant=complete.equation_discriminant, basis_numerator=[list(row) for row in complete.basis_numerator], basis_denominator=complete.basis_denominator, index=complete.index, order_discriminant=complete.order_discriminant))",
      "checks.append(not authenticated_field_analysis_matches(complete, polynomial=[-6, 0, 1], scale=3, trial_bound=1000))",
      "complete.__dict__['status'] = 1",
      "checks.append(not complete.certified and not authenticated_field_analysis_matches(complete, polynomial=[-5, 0, 1], scale=3, trial_bound=1000))",
      "complete.__dict__['status'] = 0",
      "direct = NativeFieldAnalysisResult(complete.status, complete.trial_bound, complete.resolved_components, complete.native_primes, complete.scale, list(complete.polynomial), list(complete.components), list(complete.fixed_point_witnesses), [list(row) for row in complete.basis_numerator], complete.basis_denominator, complete.index, complete.equation_discriminant, complete.order_discriminant)",
      "checks.append(not direct.certified and not authenticated_field_analysis_matches(direct, polynomial=[-5, 0, 1], scale=3, trial_bound=1000))",
      "saved_analysis = flint.number_field_analyze_resource",
      "native_calls = [0]",
      "def counted_analysis(polynomial, scale, bound):",
      "    native_calls[0] = native_calls[0] + 1",
      "    return saved_analysis(polynomial, scale, bound)",
      "flint.number_field_analyze_resource = counted_analysis",
      "try:",
      "    convenient = native_field_analysis([-5, 0, 1], scale=3)",
      "finally:",
      "    flint.number_field_analyze_resource = saved_analysis",
      "checks.append(native_calls == [1] and convenient.candidate_complete and convenient.certified and convenient.index == 2)",
      "[complete.certified, complete.locally_certified_primes, partial.certified, partial.locally_certified_primes, arbitrary.certified, wild.certified, wild.locally_certified_primes, tame.certified, tame.locally_certified_primes, multi.certified, multi.locally_certified_primes, checks]",
    ].join("\n"));
    assert.equal(result.repr,
      "[True, [2], False, [2], False, True, [2, 3], True, [3, 5], True, [2, 3, 5], [True, True, True, True, True, True, True, True, True, True, True, True, True, True, True, True, True, True, True, True, True, True, True, True, True]]");
  } finally {
    await session.close();
  }
});

test("packed fixed-point proof matches the CPython reference", () => {
  const program = String.raw`
import sys
sys.path.append(${JSON.stringify(resolve(root, "src", "lib"))})

from sagejs.number_fields.field_analysis_resource import (
    _modular_rref,
    _order_arithmetic,
    _p_radical_rows,
    _radical_lattice,
    _selected_multiplier_rows,
    packed_field_analysis_fixed_points_are_valid,
)

degree = 3
polynomial = [-2, 0, 0, 1]
numerator = [1, 0, 0, 0, 1, 0, 0, 0, 1]
primes = [2, 3]
dimensions = [2, 2]
radical_rows = [
    [[0, 1, 0], [0, 0, 1]],
    [[1, 0, 2], [0, 1, 1]],
]
selectors_by_prime = [[0, 1, 2], [0, 1, 2]]
radicals = []
selectors = []
for rows, selected in zip(radical_rows, selectors_by_prime):
    for row in rows:
        radicals.extend(row)
    radicals.extend([0] * ((degree - len(rows)) * degree))
    selectors.extend(selected)
workspace = [0] * (
    degree ** 3 + 4 * degree ** 2 + 7 * degree + (2 * degree - 1) ** 2
)
assert packed_field_analysis_fixed_points_are_valid(
    workspace,
    polynomial,
    numerator,
    1,
    primes,
    dimensions,
    radicals,
    selectors,
    -108,
    degree,
    2,
)

table, identity = _order_arithmetic(
    polynomial,
    [numerator[row * degree:(row + 1) * degree] for row in range(degree)],
    1,
)
for prime, expected, selected in zip(primes, radical_rows, selectors_by_prime):
    assert _p_radical_rows(table, identity, prime) == expected
    equations = _selected_multiplier_rows(
        selected,
        _radical_lattice(expected, degree, prime),
        table,
        prime,
    )
    assert len(_modular_rref(equations, prime)[0]) == degree

bad_radicals = list(radicals)
bad_radicals[1] = 0
assert not packed_field_analysis_fixed_points_are_valid(
    [0] * len(workspace), polynomial, numerator, 1, primes, dimensions,
    bad_radicals, selectors, -108, degree, 2,
)
bad_selectors = list(selectors)
bad_selectors[1] = 0
assert not packed_field_analysis_fixed_points_are_valid(
    [0] * len(workspace), polynomial, numerator, 1, primes, dimensions,
    radicals, bad_selectors, -108, degree, 2,
)
assert not packed_field_analysis_fixed_points_are_valid(
    [0] * len(workspace), polynomial, numerator, 1, primes, dimensions,
    radicals, selectors, -107, degree, 2,
)
print("CPYTHON_PACKED_FIELD_ANALYSIS_OK")
`;
  const python = process.platform === "win32" ? "python" : "python3";
  const result = spawnSync(python, ["-c", program], {
    cwd: root,
    encoding: "utf8",
    timeout: 60_000,
    env: process.env,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), "CPYTHON_PACKED_FIELD_ANALYSIS_OK");
});

test("packed field-analysis proof is source-transparent and differential", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-field-analysis-kernel-"));
  const cache = join(temporary, "cache");
  const witness = join(temporary, "witness.py");
  const sagejs = join(root, "bin", "sagejs");
  const source = join(
    root,
    "src",
    "lib",
    "sagejs",
    "number_fields",
    "field_analysis_resource.py",
  );
  const blSource = join(
    root,
    "src",
    "lib",
    "sagejs",
    "number_fields",
    "bl_composite_kernel.py",
  );
  const program = String.raw`
from sagejs.native import integer_buffer_values, is_compiled, kernel_integer_buffer, kernel_integer_zeros
from sagejs.number_fields.field_analysis_resource import (
    _modular_rref,
    _order_arithmetic,
    _p_radical_rows,
    _radical_lattice,
    _selected_multiplier_rows,
    native_field_analysis,
    packed_field_analysis_decode_integers,
    packed_field_analysis_fixed_points_are_valid,
)

cases = [
    [3, -2, 0, 0, 0, 0, 0, 1],
    [8, -2, 1, 1],
    [-8, -1, 0, 1],
    [2, 1, -1, 2, -1, 1],
    [3136, 0, -3136, 0, 840, 0, -56, 0, 1],
    [-25772600, 0, 0, 0, 0, -29080, 0, 0, 0, 0, 1],
]
for coefficients in cases:
    result = native_field_analysis(coefficients, 1, 1000)
    assert result.certified
    degree = len(coefficients) - 1
    rows = [list(row) for row in result.basis_numerator]
    table, identity = _order_arithmetic(
        coefficients, rows, result.basis_denominator
    )
    for fixed_point in result.fixed_point_witnesses:
        radical = [list(row) for row in fixed_point.radical_rows]
        assert radical == _p_radical_rows(table, identity, fixed_point.prime)
        equations = _selected_multiplier_rows(
            list(fixed_point.selectors),
            _radical_lattice(radical, degree, fixed_point.prime),
            table,
            fixed_point.prime,
        )
        assert len(_modular_rref(equations, fixed_point.prime)[0]) == degree
encoded = [0] * 80 + [1, 0, 0, 0, 5, 1, 0, 0, 128, 7]
encoded[56] = 2
decoded = kernel_integer_zeros(packed_field_analysis_decode_integers, 2, 8)
assert packed_field_analysis_decode_integers(
    kernel_integer_buffer(packed_field_analysis_decode_integers, encoded),
    decoded,
    2,
)
assert list(integer_buffer_values(decoded)) == [5, -7]
noncanonical = list(encoded)
noncanonical[84] = 0
assert not packed_field_analysis_decode_integers(
    kernel_integer_buffer(packed_field_analysis_decode_integers, noncanonical),
    kernel_integer_zeros(packed_field_analysis_decode_integers, 2, 8),
    2,
)
print("compiled=" + str(is_compiled(packed_field_analysis_fixed_points_are_valid)))
print("decoder_compiled=" + str(is_compiled(packed_field_analysis_decode_integers)))
print("FIELD_ANALYSIS_KERNEL_DIFFERENTIAL_OK")
`;
  function run(args, env = {}) {
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
      env: { ...process.env, ...env },
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout;
  }
  try {
    writeFileSync(witness, program);
    const explanation = run([
      sagejs,
      "native",
      "explain",
      source,
      "--function",
      "packed_field_analysis_fixed_points_are_valid",
    ]);
    assert.match(explanation, /source-transparent: yes/);
    assert.match(explanation, /host boundary: 1 public crossing\/call/);
    assert.match(explanation, /0 callbacks inside core/);
    run([sagejs, "native", "compile", source, "--cache-root", cache]);
    run([sagejs, "native", "compile", blSource, "--cache-root", cache]);
    const nativeResult = run([sagejs, witness], {
      SAGEJS_NATIVE_CACHE_DIR: cache,
      SAGEJS_NATIVE_REQUIRED: "1",
    });
    writeFileSync(
      witness,
      [
        "import sagejs.number_fields.field_analysis_resource as _field_analysis",
        "_field_analysis.packed_field_analysis_fixed_points_are_valid = getattr(_field_analysis.packed_field_analysis_fixed_points_are_valid, '__sagejs_native_source__', _field_analysis.packed_field_analysis_fixed_points_are_valid)",
        program,
      ].join("\n"),
    );
    const dynamicResult = run([sagejs, witness], {
      SAGEJS_NATIVE_DISABLE: "1",
    });
    assert.match(nativeResult, /compiled=True/);
    assert.match(nativeResult, /decoder_compiled=True/);
    assert.match(dynamicResult, /compiled=False/);
    assert.match(dynamicResult, /decoder_compiled=False/);
    assert.match(nativeResult, /FIELD_ANALYSIS_KERNEL_DIFFERENTIAL_OK/);
    assert.match(dynamicResult, /FIELD_ANALYSIS_KERNEL_DIFFERENTIAL_OK/);
  } finally {
    removeLoadedNativeCache(temporary);
  }
});

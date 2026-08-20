"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("wide-prime polynomial resources follow backend capability without Node", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "import sagejs.runtime as rt",
      "import sagejs._baselib.polynomial as polynomial",
      "backend = rt.flint_backend()",
      "PolynomialRing(GF(18446744073709551653), 'warmup').gen()",
      "polynomial._generated_flint_resources_available_cache = rt.undefined",
      "global_object = rt.global_object",
      "saved_process = rt.reflect.get(global_object, 'process')",
      "formatter = rt.reflect.get(backend, 'ffiFmpzModPolynomialFormat')",
      "rt.reflect.deleteProperty(global_object, 'process')",
      "rt.reflect.deleteProperty(backend, 'ffiFmpzModPolynomialFormat')",
      "try:",
      "    R = PolynomialRing(GF(18446744073709551629), 'x')",
      "    x = R.gen()",
      "    f = x^4 + 3*x + 7",
      "    answer = [f.gcd(f.derivative()), f(5)]",
      "finally:",
      "    rt.reflect.set(backend, 'ffiFmpzModPolynomialFormat', formatter)",
      "    rt.reflect.set(global_object, 'process', saved_process)",
      "answer",
    ].join("\n"));
    assert.equal(result.repr, "[1, 647]");
  } finally {
    await session.close();
  }
});

test("integer row selection falls back when the generated selector is absent", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "import sagejs.runtime as rt",
      "backend = rt.flint_backend()",
      "selector = rt.reflect.get(backend, 'ffiFmpzMatrixSelectRows')",
      "A = matrix(ZZ, [[2^70, 2, 3], [4, 5, 6], [7, 8, 9]])",
      "rt.reflect.deleteProperty(backend, 'ffiFmpzMatrixSelectRows')",
      "try:",
      "    selected = A.matrix_from_rows([2, 0, 2])",
      "    empty = A.matrix_from_rows([])",
      "    answer = [selected.list(), selected.dimensions(), empty.dimensions()]",
      "finally:",
      "    rt.reflect.set(backend, 'ffiFmpzMatrixSelectRows', selector)",
      "answer",
    ].join("\n"));
    assert.equal(
      result.repr,
      "[[7, 8, 9, 1180591620717411303424, 2, 3, 7, 8, 9], (3, 3), (0, 3)]",
    );
  } finally {
    await session.close();
  }
});

test("rational matrix operations fall back independently of resource storage", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "import sagejs.runtime as rt",
      "backend = rt.flint_backend()",
      "inverse_function = rt.reflect.get(backend, 'ffiFmpqMatrixInv')",
      "solve_function = rt.reflect.get(backend, 'ffiFmpqMatrixSolve')",
      "rt.reflect.deleteProperty(backend, 'ffiFmpqMatrixInv')",
      "rt.reflect.deleteProperty(backend, 'ffiFmpqMatrixSolve')",
      "try:",
      "    polynomial_ring = PolynomialRing(QQ, 'x')",
      "    x = polynomial_ring.gen()",
      "    K = NumberField(x^2 - 5, 'a')",
      "    basis = K.equation_order().basis_matrix()",
      "    basis_ok = basis.det() == 1 and basis*basis.inverse() == identity_matrix(QQ, 2)",
      "    large = 2^521 + 17",
      "    A = matrix(QQ, [[QQ(large, 97), -QQ(13, 2^257 + 93)], [QQ(5, 7), QQ(2^1024 + 3, 11)]])",
      "    right = matrix(QQ, [[QQ(2^509 + 29, 89)], [-QQ(19, 23)]])",
      "    inverse = A.inverse()",
      "    solution = A.solve_right(right)",
      "    identity_ok = A*inverse == identity_matrix(QQ, 2)",
      "    solution_ok = A*solution == right",
      "    singular = matrix(QQ, [[QQ(1, 2), QQ(1, 3)], [1, QQ(2, 3)]])",
      "    singular_inverse = False",
      "    try:",
      "        singular.inverse()",
      "    except ZeroDivisionError:",
      "        singular_inverse = True",
      "    consistent = matrix(QQ, [[QQ(5, 7)], [QQ(10, 7)]])",
      "    consistent_solution = singular.solve_right(consistent)",
      "    consistent_ok = singular*consistent_solution == consistent",
      "    inconsistent = False",
      "    try:",
      "        singular.solve_right(vector(QQ, [QQ(5, 7), QQ(11, 7)]))",
      "    except ValueError:",
      "        inconsistent = True",
      "    answer = [basis_ok, identity_ok, solution_ok, singular_inverse, consistent_ok, inconsistent]",
      "finally:",
      "    rt.reflect.set(backend, 'ffiFmpqMatrixInv', inverse_function)",
      "    rt.reflect.set(backend, 'ffiFmpqMatrixSolve', solve_function)",
      "answer",
    ].join("\n"));
    assert.equal(result.repr, "[True, True, True, True, True, True]");
  } finally {
    await session.close();
  }
});

test("modular-symbol integer matrices use the portable exact ingress", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "import sagejs.runtime as rt",
      "backend = rt.flint_backend()",
      "global_object = rt.global_object",
      "saved_process = rt.reflect.get(global_object, 'process')",
      "export_packed = rt.reflect.get(backend, 'zzMatrixExportPacked')",
      "from_fmpz = rt.reflect.get(backend, 'ffiFmpqMatrixFromFmpz')",
      "fmpq_close = rt.reflect.get(backend, 'ffiFmpqMatrixClose')",
      "warmup = matrix(QQ, 1, 1, [1])",
      "rt.reflect.deleteProperty(global_object, 'process')",
      "rt.reflect.deleteProperty(backend, 'zzMatrixExportPacked')",
      "rt.reflect.deleteProperty(backend, 'ffiFmpqMatrixFromFmpz')",
      "rt.reflect.deleteProperty(backend, 'ffiFmpqMatrixClose')",
      "try:",
      "    integer_matrix = matrix(ZZ, 2, 2, [2^130 + 7, -3, 0, 11])",
      "    rational_matrix = integer_matrix.change_ring(QQ)",
      "    rational_identity = identity_matrix(QQ, 2)",
      "    packed_ok = rational_matrix.list() == [2^130 + 7, -3, 0, 11] and rational_identity.list() == [1, 0, 0, 1]",
      "    rt.reflect.set(backend, 'ffiFmpqMatrixClose', fmpq_close)",
      "    M = ModularSymbols(37, 2)",
      "    C = M.cuspidal_subspace()",
      "    answer = [packed_ok, M.dimension(), C.dimension(), M.hecke_matrix(2).trace()]",
      "finally:",
      "    rt.reflect.set(backend, 'ffiFmpqMatrixFromFmpz', from_fmpz)",
      "    rt.reflect.set(backend, 'ffiFmpqMatrixClose', fmpq_close)",
      "    rt.reflect.set(backend, 'zzMatrixExportPacked', export_packed)",
      "    rt.reflect.set(global_object, 'process', saved_process)",
      "answer",
    ].join("\n"));
    assert.equal(result.repr, "[True, 5, 4, -1]");
  } finally {
    await session.close();
  }
});

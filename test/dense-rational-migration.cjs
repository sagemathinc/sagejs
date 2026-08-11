#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { compile } = require("@sagemath/sagejs/native");

const root = join(__dirname, "..");
const sourcePath = join(
  root, "src", "lib", "sagejs", "kernels", "matrix", "dense_rational.py",
);
const flintSourcePath = join(
  root, "src", "lib", "sagejs", "kernels", "matrix",
  "dense_rational_flint.py",
);
const integerSourcePath = join(
  root, "src", "lib", "sagejs", "kernels", "matrix", "dense_integer.py",
);
const matrixSourcePath = join(root, "src", "baselib", "matrix.py");

function runSage(source, environment) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-dense-rational-script-"));
  try {
    const scriptPath = join(directory, "production.py");
    writeFileSync(scriptPath, source);
    const result = spawnSync(
      process.execPath,
      [join(root, "bin", "sagejs"), scriptPath],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, ...environment },
      },
    );
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const productionScript = String.raw`
from sagejs.native import RationalBuffer
import sagejs.runtime as runtime

normalized = RationalBuffer([2, 0, -6], [-4, 9, -8])
assert normalized.numerators == [-1, 0, 3]
assert normalized.denominators == [2, 1, 4]

large = 2**190
A = matrix(QQ, 3, 3, [
    QQ(large + 1)/3, -QQ(7)/5, 3,
    QQ(5)/11, QQ(large - 2)/13, QQ(11)/17,
    -QQ(13)/19, QQ(17)/23, QQ(19)/29,
])
B = matrix(QQ, 3, 3, range(9)) / 31

assert A[0, 0] == QQ(large + 1)/3
resource_left = matrix(QQ, 2, 2, [
    QQ(2**521 + 17)/97, -QQ(13)/(2**257 + 93),
    QQ(5)/7, QQ(2**1024 + 3)/11,
])
resource_right = matrix(QQ, 2, 2, [
    -QQ(2**509 + 29)/89, QQ(2**333 + 1)/3,
    -QQ(19)/23, QQ(17)/(2**311 + 9),
])
left_before = resource_left.__copy__()
right_before = resource_right.__copy__()
resource_sum = resource_left + resource_right
resource_difference = resource_sum - resource_right
resource_transpose = resource_left.transpose()
resource_inverse = resource_left.inverse()
resource_solution = resource_left.solve_right(resource_right)
resource_negated = -resource_left
resource_scaled = QQ(6, -14)*resource_left
resource_zero_scaled = QQ(0, 2**4096 + 1)*resource_left
resource_equal = resource_left.__copy__()
assert resource_equal == resource_left
assert not (resource_equal != resource_left)
resource_equal[0, 0] = resource_equal[0, 0] + QQ(1, 2**601 + 15)
assert resource_equal != resource_left
assert not (resource_equal == resource_left)
assert resource_negated[0, 0] == -resource_left[0, 0]
assert resource_scaled[0, 0] == -QQ(3, 7)*resource_left[0, 0]
assert resource_zero_scaled.is_zero()
assert not resource_zero_scaled.is_one()
assert resource_zero_scaled.rank() == 0
assert resource_left.trace() == (
    QQ(2**521 + 17, 97) + QQ(2**1024 + 3, 11)
)
for resource_name, resource_value in [
    ('left', resource_left), ('right', resource_right), ('sum', resource_sum),
    ('difference', resource_difference), ('transpose', resource_transpose),
    ('inverse', resource_inverse), ('solution', resource_solution),
    ('negated', resource_negated), ('scaled', resource_scaled),
    ('zero-scaled', resource_zero_scaled), ('equal-copy', resource_equal),
]:
    resource_storage = resource_value._rational_storage_cache
    if runtime.reflect.get(resource_storage, 'numerators') is not runtime.undefined:
        raise AssertionError(resource_name + ' materialized numerators')
    if runtime.reflect.get(resource_storage, 'denominators') is not runtime.undefined:
        raise AssertionError(resource_name + ' materialized denominators')
assert resource_difference == resource_left
assert resource_transpose.transpose() == resource_left
assert resource_left*resource_inverse == identity_matrix(QQ, 2)
assert resource_left*resource_solution == resource_right
assert resource_left == left_before and resource_right == right_before

resource_rank = matrix(QQ, 2, 3, [1, 0, 0, 0, 0, 0])
assert resource_rank.rank() == 1
assert resource_rank.rank() == 1
resource_rank[1, 1] = QQ(2**701 + 1, 2**257 + 93)
assert resource_rank.rank() == 2
rank_storage = resource_rank._rational_storage_cache
assert runtime.reflect.get(rank_storage, 'numerators') is runtime.undefined
assert runtime.reflect.get(rank_storage, 'denominators') is runtime.undefined

assert zero_matrix(QQ, 0, 7).is_zero()
assert not zero_matrix(QQ, 0, 7).is_one()
assert zero_matrix(QQ, 0, 0).is_zero()
assert zero_matrix(QQ, 0, 0).is_one()
assert zero_matrix(QQ, 2, 3).is_zero()
assert not zero_matrix(QQ, 2, 3).is_one()
assert identity_matrix(QQ, 3).is_one()
assert not identity_matrix(QQ, 3).is_zero()
assert zero_matrix(QQ, 0, 0).trace() == 0

try:
    matrix(QQ, 2, 3, range(6)).inverse()
    raise AssertionError('nonsquare inverse unexpectedly succeeded')
except ArithmeticError:
    pass
singular = matrix(QQ, 2, 2, [1, 2, 2, 4])
try:
    singular.inverse()
    raise AssertionError('singular inverse unexpectedly succeeded')
except ZeroDivisionError:
    pass
consistent_right = matrix(QQ, 2, 1, [3, 6])
consistent_solution = singular.solve_right(consistent_right)
consistent_storage = consistent_solution._rational_storage_cache
assert runtime.reflect.get(consistent_storage, 'numerators') is runtime.undefined
assert runtime.reflect.get(consistent_storage, 'denominators') is runtime.undefined
assert singular*consistent_solution == consistent_right
try:
    singular.solve_right(vector(QQ, [0, 1]))
    raise AssertionError('inconsistent system unexpectedly solved')
except ValueError:
    pass
try:
    resource_left.solve_right(matrix(QQ, 3, 1, [1, 2, 3]))
    raise AssertionError('dimension-mismatched system unexpectedly solved')
except ValueError:
    pass

display = matrix(QQ, 2, 3, [QQ(1)/2, -7, 0, QQ(11)/13, -QQ(2)/3, QQ(5)/17])
assert display.str() == '[  1/2    -7     0]\n[11/13  -2/3  5/17]'
display.subdivide(1, 1)
assert display.str() == (
    '[  1/2|   -7     0]\n[-----------------]\n[11/13| -2/3  5/17]'
)
assert (A + B) - B == A
assert -(-A) == A
assert (QQ(3)/7)*A == A*(QQ(3)/7)
assert A.transpose().transpose() == A
selected_rows = A.matrix_from_rows([2, 0, 2])
selected_columns = A.matrix_from_columns([2, 0, 2])
empty_rows = A.matrix_from_rows([])
empty_columns = A.matrix_from_columns([])
stacked = A.stack(B, subdivide=True)
augmented = A.augment(B, subdivide=True)
assert selected_rows == matrix(QQ, [A.row(2), A.row(0), A.row(2)])
assert selected_columns == matrix(QQ, [A.column(2), A.column(0), A.column(2)]).transpose()
assert empty_rows.dimensions() == (0, 3)
assert empty_columns.dimensions() == (3, 0)
assert stacked.matrix_from_rows([0, 1, 2]) == A
assert stacked.matrix_from_rows([3, 4, 5]) == B
assert augmented.matrix_from_columns([0, 1, 2]) == A
assert augmented.matrix_from_columns([3, 4, 5]) == B
assert stacked._row_subdivisions == [3]
assert augmented._col_subdivisions == [3]
for structural_name, structural_value in [
    ('selected rows', selected_rows), ('selected columns', selected_columns),
    ('empty rows', empty_rows), ('empty columns', empty_columns),
    ('stacked', stacked), ('augmented', augmented),
]:
    structural_storage = structural_value._rational_storage_cache
    if runtime.reflect.get(structural_storage, 'numerators') is not runtime.undefined:
        raise AssertionError(structural_name + ' materialized numerators')
    if runtime.reflect.get(structural_storage, 'denominators') is not runtime.undefined:
        raise AssertionError(structural_name + ' materialized denominators')

integral_rationals = matrix(QQ, 2, 3, [-3, 0, 2**257 + 1, 5, -7, 11])
converted_integers = integral_rationals.change_ring(ZZ)
assert [converted_integers[row, column] for row in range(2) for column in range(3)] == [
    -3, 0, 2**257 + 1, 5, -7, 11,
]
assert converted_integers._has_fmpz_matrix_resource()
try:
    matrix(QQ, 1, 2, [1, QQ(1)/2]).change_ring(ZZ)
    raise AssertionError('nonintegral rational matrix converted to ZZ')
except TypeError:
    pass

C = matrix(QQ, 3, 3, [2, 4, 4, 6, 6, 12, 10, 4, 16]) / 7
assert C.rank() == 3
assert C.det() == QQ(48)/343
assert C*C == matrix(QQ, 3, 3, [
    68, 48, 120, 168, 108, 288, 204, 128, 344]) / 49
first_inverse = C.inverse()
assert first_inverse.is_mutable()
first_inverse[0, 0] = first_inverse[0, 0] + 1
second_inverse = C.inverse()
assert second_inverse.is_mutable()
assert C*second_inverse == identity_matrix(QQ, 3)
assert first_inverse != second_inverse
assert C._inverse_cache.is_immutable()
right = matrix(QQ, 3, 2, [
    QQ(1)/2, QQ(2)/3, QQ(3)/5,
    QQ(5)/7, QQ(7)/11, QQ(11)/13])
assert C*C.solve_right(right) == right
assert C.charpoly()(C).is_zero()
eigen = matrix(QQ, [[0, 2], [1, 0]]).eigenvalues()
assert eigen[0] > 0 and eigen[1] < 0
assert eigen[0] * eigen[0] == 2
assert eigen[1] * eigen[1] == 2

wide = matrix(QQ, 2, 4, [1, 2, 3, 4, 2, 4, 6, 8]) / 5
K = wide.right_kernel_matrix()
assert K.nrows() == 3
assert wide*K.transpose() == zero_matrix(QQ, 2, 3)

mutable = matrix(QQ, 2, 2, [QQ(1)/2, QQ(2)/3, QQ(3)/4, QQ(4)/5])
mutable[0, 1] = -QQ(2**320 + 9)/37
assert mutable[0, 1] == -QQ(2**320 + 9)/37

# Exact entries are independently variable-sized.  One enormous value must not
# force a uniform per-entry limb capacity or prevent the compact values beside
# it from round-tripping through the public serialization boundary.
skewed = matrix(QQ, 2, 2, [1, 2, 3, QQ(2**20000 + 1)/97])
assert skewed[0, 0] == 1
assert skewed[1, 1] == QQ(2**20000 + 1)/97
assert loads(dumps(skewed)) == skewed
assert str(2**20000 + 1) in skewed.str()

immutable = mutable.__copy__()
immutable.set_immutable()
try:
    immutable[0, 0] = 7
    raise AssertionError('immutable mutation unexpectedly succeeded')
except ValueError:
    pass

assert zero_matrix(QQ, 50).is_zero()
assert identity_matrix(QQ, 50).is_one()
set_random_seed(20260811)
random_value = random_matrix(QQ, 40)
assert random_value.dimensions() == (40, 40)
set_random_seed(20260811)
assert random_matrix(QQ, 40) == random_value
for entry in random_value.list():
    assert 1 <= abs(entry.numerator()) <= 3
    assert 1 <= entry.denominator() <= 3
assert loads(dumps(A)) == A
try:
    A._native
    raise AssertionError('packed rational matrix exposed an N-API handle')
except RuntimeError:
    pass
print('dense-rational-independent-ok')
`;

(async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-dense-rational-"));
  try {
    const matrixSource = readFileSync(matrixSourcePath, "utf8");
    assert.match(
      matrixSource,
      /__import__\(\s*['"]sagejs\.kernels\.matrix\.dense_rational['"]/,
    );
    assert.doesNotMatch(matrixSource, /\.qqMatrix\s*\(/);

    const compiled = await compile({ sourcePath, cacheRoot: temporary });
    const compiledFlint = await compile({
      sourcePath: flintSourcePath,
      cacheRoot: temporary,
    });
    await compile({ sourcePath: integerSourcePath, cacheRoot: temporary });
    const kernel = require(compiled.modulePath);
    const flintKernel = require(compiledFlint.modulePath);

    const functions = new Map(
      compiled.ir.functions.map((fn) => [fn.name, fn]),
    );
    assert.equal(
      functions.get("dense_rational_matrix_add").analysis.backend.kind,
      "tagged",
    );
    assert.equal(
      functions.get("dense_rational_matrix_add").analysis
        .taggedInteger.representation,
      "tagged-int64-gmp",
    );
    assert.ok(functions.has("dense_rational_matrix_kernel_from_rref"));

    for (const name of [
      "flint_dense_rational_matrix_mul",
      "flint_dense_rational_matrix_rank",
      "flint_dense_rational_matrix_rref",
      "flint_dense_rational_matrix_inverse",
      "flint_dense_rational_matrix_solve",
      "flint_dense_rational_matrix_determinant",
      "flint_dense_rational_matrix_charpoly",
    ]) {
      const fn = compiledFlint.ir.functions.find((candidate) =>
        candidate.name === name
      );
      assert.ok(fn, `missing ${name}`);
      assert.match(fn.foreignDependencies[0], /^flint@[a-f0-9]{64}:fmpq_mat_/);
      assert.equal(flintKernel[name].nativeAvailable, true);
    }

    for (const generated of [
      readFileSync(compiled.coreSourcePath, "utf8"),
      readFileSync(compiledFlint.coreSourcePath, "utf8"),
    ]) {
      assert.doesNotMatch(
        generated,
        /\b(?:napi_|node_api|PyObject|Py_|JSValue|v8::)/,
      );
    }

    const pack = kernel.dense_rational_matrix_add.packIntegerBuffer;
    const leftNumerators = pack([1n, 2n]);
    const leftDenominators = pack([2n, 3n]);
    const rightNumerators = pack([3n, -5n]);
    const rightDenominators = pack([7n, 11n]);
    const outputNumerators = kernel.createIntegerBuffer(2, 4);
    const outputDenominators = kernel.createIntegerBuffer(2, 4);
    assert.equal(kernel.dense_rational_matrix_add(
      outputNumerators,
      outputDenominators,
      leftNumerators,
      leftDenominators,
      rightNumerators,
      rightDenominators,
    ), true);
    assert.deepEqual(outputNumerators.toArray(), [13n, 7n]);
    assert.deepEqual(outputDenominators.toArray(), [14n, 33n]);

    // Paired rational output is one transaction: an undersized denominator
    // component must not commit the already-valid numerator component.
    const flintPack =
      flintKernel.flint_dense_rational_matrix_mul.packIntegerBuffer;
    const transactionalNumerator = flintPack([17n]);
    const transactionalDenominator =
      flintKernel.createIntegerBuffer(1, 1);
    assert.throws(
      () => flintKernel.flint_dense_rational_matrix_mul(
        transactionalNumerator,
        transactionalDenominator,
        flintPack([1n]),
        flintPack([1n << 80n]),
        flintPack([1n]),
        flintPack([1n << 80n]),
        1n,
        1n,
        1n,
      ),
      /IntegerBuffer word capacity exceeded/,
    );
    assert.deepEqual(transactionalNumerator.toArray(), [17n]);
    assert.deepEqual(transactionalDenominator.toArray(), [0n]);

    // Rank and RREF use checked status plus explicit exact output storage;
    // an invalid denominator cannot leak the C sentinel through uint64.
    const checkedRank = flintKernel.createIntegerBuffer(1, 1);
    assert.throws(
      () => flintKernel.flint_dense_rational_matrix_rank(
        checkedRank,
        flintPack([1n]),
        flintPack([0n]),
        1n,
        1n,
        1n,
      ),
      /FLINT rational matrix rank failed/,
    );
    assert.deepEqual(checkedRank.toArray(), [0n]);

    const requiredEnvironment = {
      SAGEJS_NATIVE_CACHE_DIR: temporary,
      SAGEJS_NATIVE_REQUIRED: "1",
      SAGEJS_FORBID_QQ_MATRIX_NAPI: "1",
    };
    assert.equal(
      runSage(productionScript, requiredEnvironment),
      "dense-rational-independent-ok",
    );
    assert.equal(
      runSage(productionScript, {
        SAGEJS_NATIVE_CACHE_DIR: temporary,
        SAGEJS_NATIVE_AUTOLOAD: "0",
        SAGEJS_FORBID_QQ_MATRIX_NAPI: "1",
      }),
      "dense-rational-independent-ok",
    );

    const trace = runSage(String.raw`
A = random_matrix(QQ, 4)
I = identity_matrix(QQ, 4)
R = random_matrix(QQ, 4, 2)
A + A
A - A
-A
(QQ(3)/7)*A
A.transpose()
A * A
A == A.__copy__()
A != I
A.is_zero()
I.is_one()
A.trace()
A.rank()
I.inverse()
I.solve_right(R)
A.det()
A.matrix_from_rows([3, 1, 3])
A.matrix_from_columns([3, 1, 3])
A.stack(I)
A.augment(I)
A.density()
print('trace-ok')
`, {
      ...requiredEnvironment,
      SAGEJS_NATIVE_TRACE: "1",
    });
    assert.match(trace, /Matrix\.random_matrix QQ 4x4 -> generated-flint-resource/);
    assert.match(trace, /Matrix\.add QQ 4x4 -> generated-flint-resource/);
    assert.match(trace, /Matrix\.subtract QQ 4x4 -> generated-flint-resource/);
    assert.match(trace, /Matrix\.negate QQ 4x4 -> generated-flint-resource/);
    assert.match(trace, /Matrix\.scalar_multiply QQ 4x4 -> generated-flint-resource/);
    assert.match(trace, /Matrix\.transpose QQ 4x4 -> generated-flint-resource/);
    assert.match(trace, /Matrix\.multiply QQ 4x4 -> generated-flint-resource/);
    assert.match(trace, /Matrix\.equal QQ 4x4 -> generated-flint-resource/);
    assert.match(trace, /Matrix\.is_zero QQ 4x4 -> generated-flint-resource/);
    assert.match(trace, /Matrix\.is_one QQ 4x4 -> generated-flint-resource/);
    assert.match(trace, /Matrix\.trace QQ 4x4 -> generated-flint-resource/);
    assert.match(trace, /Matrix\.rank QQ 4x4 -> generated-flint-resource/);
    assert.match(trace, /Matrix\.inverse QQ 4x4 -> generated-flint-resource/);
    assert.match(trace, /Matrix\.solve_right QQ 4x2 -> generated-flint-resource/);
    assert.match(trace, /Matrix\.determinant QQ 4x4 -> generated-flint-resource/);
    assert.match(trace, /Matrix\.matrix_from_rows QQ 3x4 -> generated-flint-resource/);
    assert.match(trace, /Matrix\.matrix_from_columns QQ 4x3 -> generated-flint-resource/);
    assert.match(trace, /Matrix\.stack QQ 8x4 -> generated-flint-resource/);
    assert.match(trace, /Matrix\.augment QQ 4x8 -> generated-flint-resource/);
    assert.match(trace, /Matrix\.density QQ 4x4 -> generated-flint-resource/);
    assert.match(trace, /trace-ok/);

    console.log("dense rational matrix migration tests passed");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");

function runSage(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-matrix-constructors-"));
  try {
    const script = join(directory, "check.py");
    writeFileSync(script, source);
    const result = spawnSync(
      process.execPath,
      [join(root, "bin", "sagejs"), script],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, ...environment },
      },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const semantics = String.raw`
import sagejs.runtime as runtime


def random_state():
    return runtime.reflect.get(runtime.global_object, '__sagejs_random_state__')


def legacy_random_int(start, stop):
    start = runtime.integer_bigint(start)
    stop = runtime.integer_bigint(stop)
    width = stop - start + runtime.bigint(1)
    if width <= 0:
        raise ValueError('empty random integer range')
    word_base = runtime.bigint(4294967296)
    span = runtime.bigint(1)
    words = 0
    while span < width:
        span *= word_base
        words += 1
    while True:
        value = runtime.bigint(0)
        for _index in range(words):
            word = runtime.integer_bigint(
                runtime.math.floor(float(random()) * 4294967296)
            )
            value = value * word_base + word
        limit = span - span % width
        if value < limit:
            return runtime.normalize_integer(start + value % width)


def uniform_word_residue(modulus):
    word_base = runtime.bigint(4294967296)
    modulus = runtime.integer_bigint(modulus)
    limit = word_base - word_base % modulus
    bucket = limit // modulus
    while True:
        word = runtime.integer_bigint(
            runtime.math.floor(float(random()) * 4294967296)
        )
        if word < limit:
            return runtime.normalize_integer(word // bucket)


def legacy_full_density(count, start, stop, modulus=None):
    values = []
    for _index in range(count):
        random()  # MatrixSpace's density test remains part of its RNG contract.
        if modulus is None:
            values.append(legacy_random_int(start, stop))
        else:
            values.append(uniform_word_residue(modulus))
    return values


def legacy_density(count, density, start, stop):
    values = []
    for _index in range(count):
        if float(random()) > density:
            values.append(0)
        else:
            values.append(legacy_random_int(start, stop))
    return values


def expect_error(function):
    try:
        function()
    except Exception:
        return
    raise AssertionError('operation unexpectedly succeeded')


# Full-density specialization preserves the public random-state progression.
# Prime residues use exact high-order buckets rather than the LCG's correlated
# low bits, so their values deliberately differ from the former scalar loop.
for seed in [0, 1, 17, 999999]:
    set_random_seed(seed)
    integer = MatrixSpace(ZZ, 3, 4).random_element(x=0, y=2147483648)
    integer_state = random_state()
    set_random_seed(seed)
    expected_integer = legacy_full_density(12, 0, 2147483648)
    assert integer.list() == expected_integer
    assert integer_state == random_state()

    set_random_seed(seed)
    rational = MatrixSpace(QQ, 3, 4).random_element(x=-5, y=7)
    rational_state = random_state()
    set_random_seed(seed)
    expected_rational = legacy_full_density(12, -5, 7)
    assert rational.list() == expected_rational
    assert rational_state == random_state()

    set_random_seed(seed)
    finite = MatrixSpace(GF(7), 3, 4).random_element()
    finite_state = random_state()
    set_random_seed(seed)
    expected_finite = legacy_full_density(12, 0, 0, 7)
    assert [value._value for value in finite.list()] == expected_finite
    assert finite_state == random_state()

# Wider intervals, sparse density, and explicit sparse parents retain the
# general public fallback and its observable random stream.
set_random_seed(20260811)
wide = MatrixSpace(ZZ, 2, 3).random_element(x=-(2**80), y=2**80)
wide_state = random_state()
set_random_seed(20260811)
assert wide.list() == legacy_full_density(6, -(2**80), 2**80)
assert wide_state == random_state()

set_random_seed(81)
partial = MatrixSpace(ZZ, 2, 4).random_element(density=0.375, x=-3, y=6)
partial_state = random_state()
set_random_seed(81)
assert partial.list() == legacy_density(8, 0.375, -3, 6)
assert partial_state == random_state()

set_random_seed(92)
sparse = MatrixSpace(ZZ, 2, 3, sparse=True).random_element(x=-2, y=2)
sparse_state = random_state()
set_random_seed(92)
assert sparse.list() == legacy_full_density(6, -2, 2)
assert sparse_state == random_state()

# Empty spaces consume no random state and preserve the former deferred bound
# validation. Nonempty invalid intervals still fail.
set_random_seed(77)
before_empty = random_state()
assert MatrixSpace(ZZ, 0, 3).random_element(x=5, y=2).dimensions() == (0, 3)
assert random_state() == before_empty
expect_error(lambda: MatrixSpace(ZZ, 1, 1).random_element(x=5, y=2))
expect_error(lambda: MatrixSpace(ZZ, 1).random_element(density=-0.1))
expect_error(lambda: MatrixSpace(ZZ, 1).random_element(density=1.1))

# Identity construction remains mutable and shape-correct while QQ promotion
# and small-prime packed storage avoid a full-square host entry list.
for ring in [ZZ, QQ, GF(97)]:
    identity = identity_matrix(ring, 5)
    assert identity.dimensions() == (5, 5)
    assert identity.is_one() and identity.is_mutable()
    identity[0, 1] = ring(3)
    assert identity[0, 1] == ring(3)
    assert identity_matrix(ring, 0).dimensions() == (0, 0)
expect_error(lambda: identity_matrix(QQ, -1))

# Diagonal constructors coerce only the O(n) mathematical payload and return
# independently mutable canonical storage.
huge = 2**65537 + 19
integer_diagonal = diagonal_matrix(ZZ, [huge, -2, 0, 7])
assert integer_diagonal.diagonal() == [huge, -2, 0, 7]
rational_diagonal = diagonal_matrix(QQ, [QQ(huge, 17), QQ(-2, 3), 0, 7])
assert rational_diagonal.diagonal() == [QQ(huge, 17), QQ(-2, 3), 0, 7]
finite_diagonal = diagonal_matrix(GF(97), [huge, -2, 0, 7])
assert finite_diagonal.diagonal() == [GF(97)(huge), GF(97)(-2), 0, 7]
assert diagonal_matrix([2, 3, 5]).base_ring() is ZZ
assert diagonal_matrix([QQ(1, 2), 3]).base_ring() is QQ
for diagonal in [integer_diagonal, rational_diagonal, finite_diagonal]:
    assert diagonal.is_mutable()
    diagonal[0, 1] = diagonal.base_ring()(11)
    assert diagonal[0, 1] == diagonal.base_ring()(11)
expect_error(lambda: diagonal_matrix(ZZ, [QQ(1, 2)]))

print('canonical-matrix-constructors-semantics-ok')
`;

test("canonical constructors preserve exact semantics and RNG state", () => {
  for (const nativeDisabled of [false, true]) {
    assert.equal(
      runSage(semantics, nativeDisabled ? { SAGEJS_NATIVE_DISABLE: "1" } : {}),
      "canonical-matrix-constructors-semantics-ok",
    );
  }
});

const isolatedBoundaries = String.raw`
import sagejs.ffi.flint as ffi
import sagejs.kernels.matrix.dense_integer_flint as integer_kernels
import sagejs.kernels.matrix.dense_prime_field as prime_kernels
import sagejs.kernels.matrix.dense_rational_flint as rational_kernels

assert integer_kernels.flint_dense_integer_resource_set_diagonal.nativeAvailable
assert integer_kernels.flint_dense_integer_matrix_space_random_fill.nativeAvailable
assert prime_kernels.dense_prime_field_matrix_identity.nativeAvailable
assert prime_kernels.dense_prime_field_matrix_set_diagonal.nativeAvailable
assert prime_kernels.dense_prime_field_matrix_space_random_fill.nativeAvailable
assert rational_kernels.flint_dense_rational_matrix_set_diagonal.nativeAvailable

def forbidden(*args):
    raise AssertionError('public construction crossed a scalar host setter')

ffi.fmpz_matrix_set_entry = forbidden
ffi.fmpq_matrix_set_entry = forbidden

set_random_seed(31)
Z = MatrixSpace(ZZ, 40, 45).random_element()
set_random_seed(31)
Q = MatrixSpace(QQ, 40, 45).random_element()
set_random_seed(31)
F = MatrixSpace(GF(97), 40, 45).random_element()
assert Z.list() == Q.list()
assert Z.dimensions() == Q.dimensions() == F.dimensions() == (40, 45)

assert identity_matrix(QQ, 40).is_one()
assert identity_matrix(GF(97), 40).is_one()
assert diagonal_matrix(ZZ, range(40)).diagonal() == list(range(40))
assert diagonal_matrix(QQ, [QQ(index, index + 1) for index in range(40)]).nrows() == 40
assert diagonal_matrix(GF(97), range(40)).nrows() == 40

print('canonical-matrix-constructors-isolated-ok')
`;

test("production constructors use compiled bulk/resource boundaries", () => {
  assert.equal(
    runSage(isolatedBoundaries),
    "canonical-matrix-constructors-isolated-ok",
  );
});

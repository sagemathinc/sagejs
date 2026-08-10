"""Public-operation timing matrix for packed dense ``GF(p)`` values.

This benchmark intentionally starts from the public Sage-compatible API.  It
is also used while completing the host-independent dense-prime migration, so
every result contributes a small checksum and cannot be optimized away.
"""

import sagejs.runtime as runtime


def _median(values):
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


def _measure(function, samples=5):
    values = []
    checksum = 0
    for _sample in range(samples):
        started = runtime.wall_time()
        result = function()
        values.append((runtime.wall_time() - started) * 1000)
        if hasattr(result, 'nrows'):
            checksum += result.nrows() + result.ncols()
        elif hasattr(result, 'degree'):
            checksum += result.degree()
        elif result is True:
            checksum += 1
        else:
            checksum += len(str(result))
    return _median(values), checksum


def _report(label, function, samples=5):
    elapsed, checksum = _measure(function, samples)
    print(label, 'median_ms', elapsed, 'checksum', checksum)


set_random_seed(20260810)
left = random_matrix(GF(97), 500)
right = random_matrix(GF(97), 500)
square = random_matrix(GF(97), 200)
polynomial_source = random_matrix(GF(97), 80)
equal_source = left.__copy__()
multiply_source = random_matrix(GF(7), 300)
wide_source = random_matrix(GF(97), 150, 200)
solve_left = random_matrix(GF(97), 100)
solve_right = random_matrix(GF(97), 100, 8)

# Warm every implementation before recording it.
left + right
left - right
-left
13 * left
left.transpose()
left == equal_source
square.__copy__().det()
polynomial_source.__copy__().charpoly()
multiply_source * multiply_source
square.__copy__().rank()
square.__copy__().rref()
wide_source.__copy__().right_kernel_matrix()
solve_left.__copy__().inverse()
solve_left.__copy__().solve_right(solve_right)
polynomial_source.__copy__().minpoly()

_report('add_500', lambda: left + right)
_report('subtract_500', lambda: left - right)
_report('negate_500', lambda: -left)
_report('scalar_500', lambda: 13 * left)
_report('transpose_500', left.transpose)
_report('equal_500', lambda: left == equal_source)
_report('copy_500', left.__copy__)
_report('determinant_200', lambda: square.__copy__().det())
_report(
    'charpoly_80', lambda: polynomial_source.__copy__().charpoly())
_report('multiply_300', lambda: multiply_source * multiply_source)
_report('rank_200', lambda: square.__copy__().rank())
_report('rref_200', lambda: square.__copy__().rref())
_report(
    'right_kernel_150x200',
    lambda: wide_source.__copy__().right_kernel_matrix(),
)
_report('inverse_100', lambda: solve_left.__copy__().inverse())
_report(
    'solve_100x8',
    lambda: solve_left.__copy__().solve_right(solve_right),
)
_report('minpoly_80', lambda: polynomial_source.__copy__().minpoly())

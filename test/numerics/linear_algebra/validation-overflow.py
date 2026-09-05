"""Overflowed validation denominators must never certify a wrong answer."""

import math

from sagejs.numerics.linear_algebra.factorizations import (
    LUFactorization,
    LinearAlgebraError,
)
from sagejs.numerics.linear_algebra.operations import lu
from sagejs.numerics.linear_algebra.storage import DenseMatrix
from sagejs.numerics.linear_algebra.validation import (
    least_squares_stationarity,
    minimum_norm_row_space_error,
    normwise_backward_error,
    validate_cholesky,
    validate_lu,
    validate_qr,
)


def rejects(call):
    try:
        call()
    except LinearAlgebraError as error:
        assert error.code == "nonfinite_intermediate", repr(error.code)
        assert error.details["phase"] == "independent_validation_normalization", repr(
            error.details
        )
        return
    raise AssertionError("unrepresentable validation normalization was accepted")


matrix = DenseMatrix(2, 2, [1e308, 1e308, 0.0, 1e308])
wrong = DenseMatrix(2, 2, [9e307, 1e308, 0.0, 1e308])
assert math.isinf(matrix.norm_infinity()), repr(matrix.norm_infinity())
bad_lu = LUFactorization(matrix, wrong, [0, 1], 0, 0.0)
# Previously this ten-percent entry error reported residual=0 and passed=True.
rejects(lambda: validate_lu(matrix, bad_lu))
result = lu(matrix, trace="none").to_dict()
assert not result["success"] and result["status"] == "validation_failed", repr(result)
assert result["validation"]["truth_level"] == "indeterminate", repr(result)


class BadQR:
    pivoted = False

    def q(self, **options):
        return DenseMatrix.identity(2)

    def r(self):
        return wrong


class BadCholesky:
    def lower(self):
        return DenseMatrix(2, 2, [1e154, 0.0, 0.0, 1e154])


rejects(lambda: validate_qr(matrix, BadQR()))
rejects(
    lambda: validate_cholesky(
        DenseMatrix(2, 2, [1.2e308, 7e307, 7e307, 1.2e308]), BadCholesky()
    )
)
rejects(
    lambda: normwise_backward_error(
        matrix, DenseMatrix(2, 1, [0.5, 0.0]), DenseMatrix(2, 1, [6e307, 0.0])
    )
)
rejects(
    lambda: least_squares_stationarity(
        DenseMatrix(2, 1, [1e308, 1e308]),
        DenseMatrix(1, 1, [0.0]),
        DenseMatrix(2, 1, [1.0, -0.9]),
    )
)
rejects(
    lambda: minimum_norm_row_space_error(
        DenseMatrix(1, 2, [1.7e308, 1.7e308]), DenseMatrix(2, 1, [1.0, 1.0])
    )
)
assert lu([[2.0, 1.0], [1.0, 3.0]], trace="none").success
print("validation overflow guards passed")

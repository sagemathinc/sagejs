"""Independent residual and factorization checks for numerical linear algebra."""

from __future__ import annotations

import math
from typing import Any

from ..model import NumericalValidation
from .factorizations import (
    MACHINE_EPSILON,
    CholeskyFactorization,
    LUFactorization,
    QRFactorization,
)
from .storage import DenseMatrix


def _difference_norm_infinity(left: DenseMatrix, right: DenseMatrix) -> float:
    if left.shape != right.shape:
        raise ValueError("matrix shapes disagree during validation")
    answer = 0.0
    for row in range(left.nrows):
        row_sum = math.fsum(
            abs(left.entry(row, column) - right.entry(row, column))
            for column in range(left.ncols)
        )
        answer = max(answer, row_sum)
    return answer


def _independent_product(left: DenseMatrix, right: DenseMatrix) -> DenseMatrix:
    """Multiply with `math.fsum`, separately from the storage implementation."""
    if left.ncols != right.nrows:
        raise ValueError("matrix dimensions do not conform during validation")
    entries: list[float] = []
    for row in range(left.nrows):
        for column in range(right.ncols):
            terms = [
                left.entry(row, index) * right.entry(index, column)
                for index in range(left.ncols)
            ]
            entries.append(math.fsum(terms))
    return DenseMatrix(left.nrows, right.ncols, entries)


def _factorization_threshold(matrix: DenseMatrix) -> float:
    return 64.0 * MACHINE_EPSILON * max(1, matrix.nrows, matrix.ncols)


def validate_lu(
    matrix: DenseMatrix, factorization: LUFactorization
) -> NumericalValidation:
    """Independently check `A = P * L * U`."""
    reconstructed = _independent_product(
        _independent_product(factorization.permutation_matrix(), factorization.lower()),
        factorization.upper(),
    )
    absolute_error = _difference_norm_infinity(matrix, reconstructed)
    scale = matrix.norm_infinity()
    relative_error = absolute_error / scale if scale != 0.0 else absolute_error
    threshold = _factorization_threshold(matrix)
    passed = relative_error <= threshold
    return NumericalValidation(
        "validated_approximate" if passed else "indeterminate",
        passed,
        checks=[
            {
                "kind": "lu_reconstruction",
                "passed": passed,
                "absolute_error_infinity": absolute_error,
                "relative_error_infinity": relative_error,
                "threshold": threshold,
                "identity": "A = P * L * U",
            }
        ],
        residual=relative_error,
    )


def validate_qr(
    matrix: DenseMatrix, factorization: QRFactorization
) -> NumericalValidation:
    """Independently check reconstruction and column orthogonality."""
    q = factorization.q()
    r = factorization.r()
    reconstructed = _independent_product(q, r)
    if factorization.pivoted:
        target = _independent_product(matrix, factorization.permutation_matrix())
    else:
        target = matrix
    reconstruction_error = _difference_norm_infinity(target, reconstructed)
    scale = matrix.norm_infinity()
    relative_error = (
        reconstruction_error / scale if scale != 0.0 else reconstruction_error
    )
    gram = _independent_product(q.transpose(), q)
    identity = DenseMatrix.identity(gram.nrows)
    orthogonality_error = _difference_norm_infinity(gram, identity)
    threshold = _factorization_threshold(matrix)
    reconstruction_passed = relative_error <= threshold
    orthogonality_passed = orthogonality_error <= threshold
    passed = reconstruction_passed and orthogonality_passed
    return NumericalValidation(
        "validated_approximate" if passed else "indeterminate",
        passed,
        checks=[
            {
                "kind": "qr_reconstruction",
                "passed": reconstruction_passed,
                "relative_error_infinity": relative_error,
                "threshold": threshold,
                "identity": "A * P = Q * R" if factorization.pivoted else "A = Q * R",
            },
            {
                "kind": "q_column_orthogonality",
                "passed": orthogonality_passed,
                "error_infinity": orthogonality_error,
                "threshold": threshold,
            },
        ],
        residual=max(relative_error, orthogonality_error),
    )


def validate_cholesky(
    matrix: DenseMatrix, factorization: CholeskyFactorization
) -> NumericalValidation:
    """Independently check `A = L * L.T` and the positive diagonal."""
    lower = factorization.lower()
    reconstructed = _independent_product(lower, lower.transpose())
    absolute_error = _difference_norm_infinity(matrix, reconstructed)
    scale = matrix.norm_infinity()
    relative_error = absolute_error / scale if scale != 0.0 else absolute_error
    positive_diagonal = all(
        lower.entry(index, index) > 0.0 for index in range(lower.nrows)
    )
    threshold = _factorization_threshold(matrix)
    reconstruction_passed = relative_error <= threshold
    passed = reconstruction_passed and positive_diagonal
    return NumericalValidation(
        "validated_approximate" if passed else "indeterminate",
        passed,
        checks=[
            {
                "kind": "cholesky_reconstruction",
                "passed": reconstruction_passed,
                "relative_error_infinity": relative_error,
                "threshold": threshold,
                "identity": "A = L * L.T",
            },
            {
                "kind": "positive_diagonal",
                "passed": positive_diagonal,
            },
        ],
        residual=relative_error,
    )


def independent_residual(
    matrix: DenseMatrix, solution: DenseMatrix, right: DenseMatrix
) -> DenseMatrix:
    """Return `B - A X` using a separate compensated accumulation path."""
    if matrix.ncols != solution.nrows or matrix.nrows != right.nrows:
        raise ValueError("matrix, solution, and right side dimensions disagree")
    if solution.ncols != right.ncols:
        raise ValueError("solution and right side column counts disagree")
    entries: list[float] = []
    for row in range(matrix.nrows):
        for column in range(right.ncols):
            products = [
                matrix.entry(row, index) * solution.entry(index, column)
                for index in range(matrix.ncols)
            ]
            entries.append(right.entry(row, column) - math.fsum(products))
    return DenseMatrix(right.nrows, right.ncols, entries)


def normwise_backward_error(
    matrix: DenseMatrix,
    solution: DenseMatrix,
    right: DenseMatrix,
    residual: DenseMatrix | None = None,
) -> tuple[float, float]:
    """Return absolute residual and normwise infinity backward error."""
    checked_residual = (
        independent_residual(matrix, solution, right) if residual is None else residual
    )
    residual_norm = checked_residual.norm_infinity()
    denominator = (
        matrix.norm_infinity() * solution.norm_infinity() + right.norm_infinity()
    )
    if denominator == 0.0:
        backward_error = 0.0 if residual_norm == 0.0 else 1.0
    else:
        backward_error = residual_norm / denominator
    return residual_norm, backward_error


def validate_solve(
    matrix: DenseMatrix,
    solution: DenseMatrix,
    right: DenseMatrix,
    *,
    tolerance: float,
    condition_estimate: float | None,
) -> NumericalValidation:
    """Independently validate a linear solve by normwise backward error."""
    residual_norm, backward_error = normwise_backward_error(matrix, solution, right)
    passed = backward_error <= tolerance
    checks: list[dict[str, Any]] = [
        {
            "kind": "linear_system_backward_error",
            "passed": passed,
            "residual_infinity": residual_norm,
            "backward_error_infinity": backward_error,
            "threshold": tolerance,
        }
    ]
    if condition_estimate is not None:
        checks.append(
            {
                "kind": "forward_error_indicator",
                "passed": True,
                "upper_indicator": condition_estimate * backward_error,
                "interpretation": "condition_estimate_times_backward_error",
            }
        )
    return NumericalValidation(
        "validated_approximate" if passed else "indeterminate",
        passed,
        checks=checks,
        residual=residual_norm,
        error_estimate=(
            None if condition_estimate is None else condition_estimate * backward_error
        ),
        condition_estimate=condition_estimate,
    )


def least_squares_stationarity(
    matrix: DenseMatrix, solution: DenseMatrix, right: DenseMatrix
) -> tuple[float, float]:
    """Independently compute residual size and scaled `A.T * residual`."""
    residual = independent_residual(matrix, solution, right)
    gradient = _independent_product(matrix.transpose(), residual)
    residual_norm = residual.norm_infinity()
    denominator = matrix.norm_one() * residual_norm + MACHINE_EPSILON * max(
        1.0, right.norm_infinity()
    )
    stationarity = gradient.norm_infinity() / denominator
    return residual_norm, stationarity


def validate_least_squares(
    matrix: DenseMatrix,
    solution: DenseMatrix,
    right: DenseMatrix,
    *,
    tolerance: float,
    condition_estimate: float | None,
) -> NumericalValidation:
    """Validate least-squares optimality independently via `A.T r`."""
    residual_norm, stationarity = least_squares_stationarity(matrix, solution, right)
    passed = stationarity <= tolerance
    return NumericalValidation(
        "validated_approximate" if passed else "indeterminate",
        passed,
        checks=[
            {
                "kind": "least_squares_stationarity",
                "passed": passed,
                "residual_infinity": residual_norm,
                "scaled_normal_residual": stationarity,
                "threshold": tolerance,
            }
        ],
        residual=residual_norm,
        condition_estimate=condition_estimate,
    )


def validate_inverse(
    matrix: DenseMatrix,
    inverse: DenseMatrix,
    *,
    tolerance: float,
    condition_estimate: float | None,
) -> NumericalValidation:
    """Independently check both `A A^-1` and `A^-1 A`."""
    if matrix.nrows != matrix.ncols or inverse.shape != matrix.shape:
        raise ValueError("inverse validation requires equal square matrices")
    identity = DenseMatrix.identity(matrix.nrows)
    left_error = _difference_norm_infinity(
        _independent_product(matrix, inverse), identity
    )
    right_error = _difference_norm_infinity(
        _independent_product(inverse, matrix), identity
    )
    maximum_error = max(left_error, right_error)
    passed = maximum_error <= tolerance
    return NumericalValidation(
        "validated_approximate" if passed else "indeterminate",
        passed,
        checks=[
            {
                "kind": "left_inverse_residual",
                "passed": left_error <= tolerance,
                "error_infinity": left_error,
                "threshold": tolerance,
            },
            {
                "kind": "right_inverse_residual",
                "passed": right_error <= tolerance,
                "error_infinity": right_error,
                "threshold": tolerance,
            },
        ],
        residual=maximum_error,
        condition_estimate=condition_estimate,
    )

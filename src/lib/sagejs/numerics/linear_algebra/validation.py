"""Independent residual and factorization checks for numerical linear algebra."""

from __future__ import annotations

import math
from collections.abc import Callable
from typing import Any

from ..model import NumericalValidation
from .factorizations import (
    MACHINE_EPSILON,
    CholeskyFactorization,
    LinearAlgebraError,
    LUFactorization,
    QRFactorization,
)
from .storage import DenseMatrix, stable_norm_two


def _finite_validation_scale(value: float) -> float:
    """Reject unrepresentable normalization instead of manufacturing zero error.

    Finite entries do not imply representable norms or norm products. Until a
    scaled normalization path is qualified, nonzero residuals with these
    scales are indeterminate. Exact computed zero residuals may be handled
    explicitly before constructing a denominator.
    """
    if not math.isfinite(value):
        raise LinearAlgebraError(
            "nonfinite_intermediate",
            "the validation normalization exceeds the finite binary64 envelope",
            details={"phase": "independent_validation_normalization"},
        )
    return value


def _difference_norm_infinity(
    left: DenseMatrix,
    right: DenseMatrix,
    *,
    check: Callable[[], None] | None = None,
) -> float:
    if left.shape != right.shape:
        raise ValueError("matrix shapes disagree during validation")
    answer = 0.0
    for row in range(left.nrows):
        if check is not None:
            check()
        row_sum = math.fsum(
            abs(left.entry(row, column) - right.entry(row, column))
            for column in range(left.ncols)
        )
        answer = max(answer, row_sum)
    return answer


def _independent_product(
    left: DenseMatrix,
    right: DenseMatrix,
    *,
    check: Callable[[], None] | None = None,
) -> DenseMatrix:
    """Multiply with `math.fsum`, separately from the storage implementation."""
    if left.ncols != right.nrows:
        raise ValueError("matrix dimensions do not conform during validation")
    # DenseMatrix publishes immutable row-major entries. Validate the shape
    # once, then retain those snapshots instead of repeating checked scalar
    # method calls in the cubic loop. General dots retain every product and
    # fsum in source order, independent of factorization arithmetic.
    rows, inner, columns = left.nrows, left.ncols, right.ncols
    left_entries, right_entries = left.entries, right.entries
    entries: list[float] = []
    for row in range(rows):
        if check is not None:
            check()
        offset = row * inner
        if columns == 0:
            continue
        # Prove a zero/coordinate row from the actual immutable entries, not
        # from a factorization's claimed permutation. Finite storage makes
        # multiplication by 0 or 1 exact; fsum of such a row is its selected
        # entry (or positive zero). No tolerance or backend status is used.
        coordinate: int | None = -1
        for index in range(inner):
            coefficient = left_entries[offset + index]
            if coefficient == 1.0 and coordinate == -1:
                coordinate = index
            elif coefficient != 0.0:
                coordinate = None
                break
        for column in range(columns):
            if check is not None:
                check()
            if coordinate is not None:
                value = (
                    right_entries[coordinate * columns + column]
                    if coordinate >= 0
                    else 0.0
                )
                entries.append(value if value != 0.0 else 0.0)
                continue
            terms = [
                left_entries[offset + index] * right_entries[index * columns + column]
                for index in range(inner)
            ]
            entries.append(math.fsum(terms))
    return DenseMatrix(rows, columns, entries)


def _factorization_threshold(matrix: DenseMatrix) -> float:
    return 64.0 * MACHINE_EPSILON * max(1, matrix.nrows, matrix.ncols)


def validate_lu(
    matrix: DenseMatrix,
    factorization: LUFactorization,
    *,
    check: Callable[[], None] | None = None,
) -> NumericalValidation:
    """Independently check `A = P * L * U`."""
    reconstructed = _independent_product(
        _independent_product(
            factorization.permutation_matrix(), factorization.lower(), check=check
        ),
        factorization.upper(),
        check=check,
    )
    absolute_error = _difference_norm_infinity(matrix, reconstructed, check=check)
    scale = _finite_validation_scale(matrix.norm_infinity())
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
    matrix: DenseMatrix,
    factorization: QRFactorization,
    *,
    check: Callable[[], None] | None = None,
) -> NumericalValidation:
    """Independently check reconstruction and column orthogonality."""
    q = factorization.q(check=check)
    r = factorization.r()
    reconstructed = _independent_product(q, r, check=check)
    if factorization.pivoted:
        target = _independent_product(
            matrix, factorization.permutation_matrix(), check=check
        )
    else:
        target = matrix
    reconstruction_error = _difference_norm_infinity(target, reconstructed, check=check)
    scale = _finite_validation_scale(matrix.norm_infinity())
    relative_error = (
        reconstruction_error / scale if scale != 0.0 else reconstruction_error
    )
    gram = _independent_product(q.transpose(), q, check=check)
    identity = DenseMatrix.identity(gram.nrows)
    orthogonality_error = _difference_norm_infinity(gram, identity, check=check)
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
    matrix: DenseMatrix,
    factorization: CholeskyFactorization,
    *,
    check: Callable[[], None] | None = None,
) -> NumericalValidation:
    """Independently check `A = L * L.T` and the positive diagonal."""
    lower = factorization.lower()
    reconstructed = _independent_product(lower, lower.transpose(), check=check)
    absolute_error = _difference_norm_infinity(matrix, reconstructed, check=check)
    scale = _finite_validation_scale(matrix.norm_infinity())
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
    matrix: DenseMatrix,
    solution: DenseMatrix,
    right: DenseMatrix,
    *,
    check: Callable[[], None] | None = None,
) -> DenseMatrix:
    """Return `B - A X` using a separate compensated accumulation path."""
    if matrix.ncols != solution.nrows or matrix.nrows != right.nrows:
        raise ValueError("matrix, solution, and right side dimensions disagree")
    if solution.ncols != right.ncols:
        raise ValueError("solution and right side column counts disagree")
    entries: list[float] = []
    for row in range(matrix.nrows):
        if check is not None:
            check()
        for column in range(right.ncols):
            if check is not None:
                check()
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
    check: Callable[[], None] | None = None,
) -> tuple[float, float]:
    """Return absolute residual and normwise infinity backward error."""
    checked_residual = (
        independent_residual(matrix, solution, right, check=check)
        if residual is None
        else residual
    )
    residual_norm = checked_residual.norm_infinity()
    if residual_norm == 0.0:
        return 0.0, 0.0
    denominator = _finite_validation_scale(
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
    check: Callable[[], None] | None = None,
) -> NumericalValidation:
    """Independently validate a linear solve by normwise backward error."""
    residual_norm, backward_error = normwise_backward_error(
        matrix, solution, right, check=check
    )
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
    matrix: DenseMatrix,
    solution: DenseMatrix,
    right: DenseMatrix,
    *,
    check: Callable[[], None] | None = None,
) -> tuple[float, float]:
    """Independently compute residual size and scaled `A.T * residual`."""
    residual = independent_residual(matrix, solution, right, check=check)
    gradient = _independent_product(matrix.transpose(), residual, check=check)
    residual_norm = residual.norm_infinity()
    denominator = _finite_validation_scale(
        matrix.norm_one() * residual_norm
        + MACHINE_EPSILON * max(1.0, right.norm_infinity())
    )
    stationarity = gradient.norm_infinity() / denominator
    return residual_norm, stationarity


def minimum_norm_row_space_error(
    matrix: DenseMatrix,
    solution: DenseMatrix,
    *,
    check: Callable[[], None] | None = None,
) -> float:
    """Return the relative component of `solution` outside the row space.

    A consistent underdetermined solution has minimum Euclidean norm exactly
    when every right-side column lies in the row space of `A`.  Build an
    independent reorthogonalized row basis rather than reusing the solver's QR
    factors, then measure the rejected component.
    """
    if matrix.nrows >= matrix.ncols:
        return 0.0
    basis: list[tuple[float, ...]] = []
    for row in range(matrix.nrows):
        if check is not None:
            check()
        source = matrix.row(row)
        source_norm = _finite_validation_scale(stable_norm_two(source))
        if source_norm == 0.0:
            return 1.0
        vector = [value / source_norm for value in source]
        for _ in range(2):
            for direction in basis:
                projection = math.fsum(
                    vector[index] * direction[index] for index in range(matrix.ncols)
                )
                for index in range(matrix.ncols):
                    vector[index] -= projection * direction[index]
        norm = _finite_validation_scale(stable_norm_two(vector))
        if norm == 0.0:
            return 1.0
        basis.append(tuple(value / norm for value in vector))
    maximum_error = 0.0
    for column in range(solution.ncols):
        if check is not None:
            check()
        vector = [solution.entry(row, column) for row in range(solution.nrows)]
        projected = [0.0] * solution.nrows
        for direction in basis:
            coefficient = math.fsum(
                direction[index] * vector[index] for index in range(solution.nrows)
            )
            for index in range(solution.nrows):
                projected[index] += coefficient * direction[index]
        rejected = [vector[index] - projected[index] for index in range(solution.nrows)]
        rejected_norm = _finite_validation_scale(stable_norm_two(rejected))
        solution_norm = _finite_validation_scale(stable_norm_two(vector))
        if solution_norm == 0.0:
            column_error = 0.0 if rejected_norm == 0.0 else 1.0
        else:
            column_error = rejected_norm / solution_norm
        maximum_error = max(maximum_error, column_error)
    return maximum_error


def validate_least_squares(
    matrix: DenseMatrix,
    solution: DenseMatrix,
    right: DenseMatrix,
    *,
    tolerance: float,
    condition_estimate: float | None,
    check: Callable[[], None] | None = None,
) -> NumericalValidation:
    """Validate stationarity, or direct backward error when residual is zero."""
    residual_norm, stationarity = least_squares_stationarity(
        matrix, solution, right, check=check
    )
    _, backward_error = normwise_backward_error(matrix, solution, right, check=check)
    stationarity_passed = stationarity <= tolerance
    consistent_passed = backward_error <= tolerance
    minimum_norm_error = minimum_norm_row_space_error(matrix, solution, check=check)
    minimum_norm_passed = minimum_norm_error <= tolerance
    passed = (stationarity_passed or consistent_passed) and minimum_norm_passed
    return NumericalValidation(
        "validated_approximate" if passed else "indeterminate",
        passed,
        checks=[
            {
                "kind": "least_squares_stationarity",
                "passed": stationarity_passed,
                "residual_infinity": residual_norm,
                "scaled_normal_residual": stationarity,
                "threshold": tolerance,
            },
            {
                "kind": "consistent_system_backward_error",
                "passed": consistent_passed,
                "backward_error_infinity": backward_error,
                "threshold": tolerance,
            },
            {
                "kind": "minimum_norm_row_space",
                "passed": minimum_norm_passed,
                "relative_orthogonal_component": minimum_norm_error,
                "threshold": tolerance,
                "applicable": matrix.nrows < matrix.ncols,
            },
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
    check: Callable[[], None] | None = None,
) -> NumericalValidation:
    """Independently check both `A A^-1` and `A^-1 A`."""
    if matrix.nrows != matrix.ncols or inverse.shape != matrix.shape:
        raise ValueError("inverse validation requires equal square matrices")
    identity = DenseMatrix.identity(matrix.nrows)
    left_error = _difference_norm_infinity(
        _independent_product(matrix, inverse, check=check), identity, check=check
    )
    right_error = _difference_norm_infinity(
        _independent_product(inverse, matrix, check=check), identity, check=check
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

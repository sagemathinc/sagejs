"""Readable binary64 LU, Householder QR, and Cholesky factorizations."""

from __future__ import annotations

import math
from collections.abc import Callable, Iterable
from typing import Any

from .storage import DenseMatrix, stable_norm_two

MACHINE_EPSILON = 2.220446049250313e-16


class LinearAlgebraError(Exception):
    """A classified numerical-linear-algebra failure."""

    def __init__(
        self, code: str, message: str, *, details: dict[str, Any] | None = None
    ) -> None:
        super().__init__(message)
        self.code = code
        self.details = {} if details is None else dict(details)


def _finite_intermediate(
    value: float,
    message: str,
    *,
    details: dict[str, Any] | None = None,
) -> float:
    if not math.isfinite(value):
        raise LinearAlgebraError("nonfinite_intermediate", message, details=details)
    return value


def _finite_sum(
    values: Iterable[float],
    message: str,
    *,
    details: dict[str, Any] | None = None,
) -> float:
    try:
        value = math.fsum(values)
    except (OverflowError, ValueError):
        raise LinearAlgebraError(
            "nonfinite_intermediate", message, details=details
        ) from None
    return _finite_intermediate(value, message, details=details)


def _default_pivot_threshold(matrix: DenseMatrix) -> float:
    scale = matrix.max_abs_entry()
    if scale == 0.0:
        return 0.0
    return MACHINE_EPSILON * max(1, matrix.nrows, matrix.ncols) * scale


class LUFactorization:
    """Partial-pivot LU with Sage-oriented `A = P * L * U` factors."""

    def __init__(
        self,
        original: DenseMatrix,
        packed: DenseMatrix,
        row_permutation: list[int],
        swaps: int,
        pivot_threshold: float,
    ) -> None:
        self.original = original
        self._packed = packed
        self._row_permutation = tuple(row_permutation)
        self.swaps = swaps
        self.pivot_threshold = pivot_threshold

    @property
    def diagonal_pivots(self) -> int:
        """Count usable diagonal pivots, without claiming rectangular rank."""
        diagonal = min(self._packed.nrows, self._packed.ncols)
        pivots = 0
        for index in range(diagonal):
            if abs(self._packed.entry(index, index)) > self.pivot_threshold:
                pivots += 1
        return pivots

    @property
    def nonsingular(self) -> bool:
        return (
            self._packed.nrows == self._packed.ncols
            and self.diagonal_pivots == self._packed.nrows
        )

    def permutation_matrix(self) -> DenseMatrix:
        """Return `P` in the public identity `A = P * L * U`."""
        rows = self._packed.nrows
        entries = [0.0] * (rows * rows)
        for working_row, original_row in enumerate(self._row_permutation):
            entries[original_row * rows + working_row] = 1.0
        return DenseMatrix(rows, rows, entries)

    def lower(self) -> DenseMatrix:
        rows = self._packed.nrows
        diagonal = min(self._packed.nrows, self._packed.ncols)
        entries = [0.0] * (rows * rows)
        for row in range(rows):
            entries[row * rows + row] = 1.0
            for column in range(min(row, diagonal)):
                entries[row * rows + column] = self._packed.entry(row, column)
        return DenseMatrix(rows, rows, entries)

    def upper(self) -> DenseMatrix:
        rows = self._packed.nrows
        columns = self._packed.ncols
        entries = [0.0] * (rows * columns)
        for row in range(rows):
            for column in range(row, columns):
                entries[row * columns + column] = self._packed.entry(row, column)
        return DenseMatrix(rows, columns, entries)

    def solve(
        self,
        right: DenseMatrix,
        *,
        check: Callable[[], None] | None = None,
    ) -> DenseMatrix:
        """Solve `A X = B` using the retained factorization."""
        size = self._packed.nrows
        if self._packed.ncols != size:
            raise LinearAlgebraError(
                "matrix_not_square", "LU solve requires a square coefficient matrix"
            )
        if right.nrows != size:
            raise LinearAlgebraError(
                "dimension_mismatch", "matrix and right side dimensions disagree"
            )
        if not self.nonsingular:
            raise LinearAlgebraError(
                "rank_deficient",
                "the coefficient matrix is numerically rank deficient",
                details={
                    "diagonal_pivots": self.diagonal_pivots,
                    "dimension": size,
                    "pivot_threshold": self.pivot_threshold,
                },
            )
        columns = right.ncols
        working = [0.0] * (size * columns)
        for row in range(size):
            source_row = self._row_permutation[row]
            for column in range(columns):
                working[row * columns + column] = right.entry(source_row, column)
        for row in range(size):
            if check is not None:
                check()
            for column in range(columns):
                value = working[row * columns + column]
                details = {"row": row, "right_side_column": column}
                value = _finite_intermediate(
                    value
                    - _finite_sum(
                        (
                            self._packed.entry(row, index)
                            * working[index * columns + column]
                            for index in range(row)
                        ),
                        "the LU forward solve is not representable in binary64",
                        details=details,
                    ),
                    "the LU forward solve is not representable in binary64",
                    details=details,
                )
                working[row * columns + column] = value
        for row in range(size - 1, -1, -1):
            if check is not None:
                check()
            pivot = self._packed.entry(row, row)
            for column in range(columns):
                value = working[row * columns + column]
                details = {"row": row, "right_side_column": column}
                value = _finite_intermediate(
                    value
                    - _finite_sum(
                        (
                            self._packed.entry(row, index)
                            * working[index * columns + column]
                            for index in range(row + 1, size)
                        ),
                        "the LU back solve is not representable in binary64",
                        details=details,
                    ),
                    "the LU back solve is not representable in binary64",
                    details=details,
                )
                working[row * columns + column] = _finite_intermediate(
                    value / pivot,
                    "the LU solution is not representable in binary64",
                    details=details,
                )
        return DenseMatrix(size, columns, working)

    def slogdet(self) -> tuple[int, float | None]:
        """Return determinant sign and finite `log(abs(det(A)))` if nonsingular."""
        if self._packed.nrows != self._packed.ncols:
            raise LinearAlgebraError(
                "matrix_not_square", "determinant requires a square matrix"
            )
        sign = -1 if self.swaps % 2 else 1
        log_absolute = 0.0
        for index in range(self._packed.nrows):
            pivot = self._packed.entry(index, index)
            if pivot == 0.0:
                return 0, None
            if pivot < 0.0:
                sign = -sign
            log_absolute += math.log(abs(pivot))
        return sign, log_absolute

    def to_dict(self, *, check: Callable[[], None] | None = None) -> dict[str, Any]:
        if check is not None:
            check()
        return {
            "kind": "lu",
            "identity": "A = P * L * U",
            "permutation": self.permutation_matrix().to_dict(),
            "lower": self.lower().to_dict(),
            "upper": self.upper().to_dict(),
            "row_permutation": list(self._row_permutation),
            "swaps": self.swaps,
            "pivot_threshold": self.pivot_threshold,
            "diagonal_pivots": self.diagonal_pivots,
        }


def lu_factorize(
    matrix: DenseMatrix,
    *,
    pivot_threshold: float | None = None,
    check: Callable[[], None] | None = None,
) -> LUFactorization:
    """Compute a partial-pivot LU factorization without mutating the input."""
    if pivot_threshold is None:
        threshold = _default_pivot_threshold(matrix)
    else:
        threshold = float(pivot_threshold)
        if not math.isfinite(threshold) or threshold < 0.0:
            raise ValueError("pivot_threshold must be finite and nonnegative")
    rows = matrix.nrows
    columns = matrix.ncols
    working = list(matrix.entries)
    permutation = list(range(rows))
    swaps = 0
    for index in range(min(rows, columns)):
        if check is not None:
            check()
        pivot_row = index
        pivot_size = 0.0
        for row in range(index, rows):
            candidate = abs(working[row * columns + index])
            if candidate > pivot_size:
                pivot_size = candidate
                pivot_row = row
        if pivot_size == 0.0:
            continue
        if pivot_row != index:
            for column in range(columns):
                upper = index * columns + column
                lower = pivot_row * columns + column
                working[upper], working[lower] = working[lower], working[upper]
            permutation[index], permutation[pivot_row] = (
                permutation[pivot_row],
                permutation[index],
            )
            swaps += 1
        pivot = working[index * columns + index]
        for row in range(index + 1, rows):
            if check is not None:
                check()
            location = row * columns + index
            multiplier = working[location] / pivot
            working[location] = multiplier
            for column in range(index + 1, columns):
                target = row * columns + column
                update = working[target] - (
                    multiplier * working[index * columns + column]
                )
                if not math.isfinite(update):
                    raise LinearAlgebraError(
                        "nonfinite_intermediate",
                        "the LU update is not representable in binary64",
                        details={"row": row, "column": column},
                    )
                working[target] = update
    return LUFactorization(
        matrix,
        DenseMatrix(rows, columns, working),
        permutation,
        swaps,
        threshold,
    )


class QRFactorization:
    """Householder QR, optionally with rank-revealing column pivoting."""

    def __init__(
        self,
        original: DenseMatrix,
        transformed: DenseMatrix,
        reflectors: list[tuple[int, tuple[float, ...]]],
        column_permutation: list[int],
        rank_threshold: float,
        pivoted: bool,
        source_expression: str,
    ) -> None:
        self.original = original
        self._transformed = transformed
        self._reflectors = tuple(reflectors)
        self.column_permutation = tuple(column_permutation)
        self.rank_threshold = rank_threshold
        self.pivoted = pivoted
        self.source_expression = source_expression
        self._q_reduced: DenseMatrix | None = None
        self._q_complete: DenseMatrix | None = None

    @property
    def rank_estimate(self) -> int:
        rank = 0
        for index in range(min(self._transformed.nrows, self._transformed.ncols)):
            if abs(self._transformed.entry(index, index)) > self.rank_threshold:
                rank += 1
        return rank

    def q(
        self,
        *,
        complete: bool = False,
        check: Callable[[], None] | None = None,
    ) -> DenseMatrix:
        cached = self._q_complete if complete else self._q_reduced
        if cached is not None:
            return cached
        rows = self._transformed.nrows
        columns = rows if complete else min(rows, self._transformed.ncols)
        entries = [0.0] * (rows * columns)
        for index in range(min(rows, columns)):
            entries[index * columns + index] = 1.0
        for start, vector in reversed(self._reflectors):
            if check is not None:
                check()
            for column in range(columns):
                if check is not None:
                    check()
                details = {"reflector_start": start, "column": column}
                projection = _finite_sum(
                    (
                        vector[offset] * entries[(start + offset) * columns + column]
                        for offset in range(len(vector))
                    ),
                    "the orthogonal-factor construction is not representable in binary64",
                    details=details,
                )
                for offset in range(len(vector)):
                    location = (start + offset) * columns + column
                    contribution = _finite_intermediate(
                        projection * vector[offset],
                        "the orthogonal-factor construction is not representable in binary64",
                        details=details,
                    )
                    entries[location] = _finite_sum(
                        (entries[location], -contribution, -contribution),
                        "the orthogonal-factor construction is not representable in binary64",
                        details=details,
                    )
        result = DenseMatrix(rows, columns, entries)
        if complete:
            self._q_complete = result
        else:
            self._q_reduced = result
        return result

    def r(self, *, complete: bool = False) -> DenseMatrix:
        rows = self._transformed.nrows
        columns = self._transformed.ncols
        output_rows = rows if complete else min(rows, columns)
        entries = [0.0] * (output_rows * columns)
        for row in range(output_rows):
            for column in range(row, columns):
                entries[row * columns + column] = self._transformed.entry(row, column)
        return DenseMatrix(output_rows, columns, entries)

    def permutation_matrix(self) -> DenseMatrix:
        """Return `P` in the identity `A * P = Q * R`."""
        size = self._transformed.ncols
        entries = [0.0] * (size * size)
        for permuted_column, original_column in enumerate(self.column_permutation):
            entries[original_column * size + permuted_column] = 1.0
        return DenseMatrix(size, size, entries)

    def apply_q_transpose(
        self,
        right: DenseMatrix,
        *,
        check: Callable[[], None] | None = None,
    ) -> DenseMatrix:
        if right.nrows != self._transformed.nrows:
            raise LinearAlgebraError(
                "dimension_mismatch", "Q and right side dimensions disagree"
            )
        entries = list(right.entries)
        columns = right.ncols
        for start, vector in self._reflectors:
            if check is not None:
                check()
            for column in range(columns):
                if check is not None:
                    check()
                details = {"reflector_start": start, "right_side_column": column}
                projection = _finite_sum(
                    (
                        vector[offset] * entries[(start + offset) * columns + column]
                        for offset in range(len(vector))
                    ),
                    "the orthogonal transform is not representable in binary64",
                    details=details,
                )
                for offset in range(len(vector)):
                    location = (start + offset) * columns + column
                    contribution = _finite_intermediate(
                        projection * vector[offset],
                        "the orthogonal transform is not representable in binary64",
                        details=details,
                    )
                    entries[location] = _finite_sum(
                        (entries[location], -contribution, -contribution),
                        "the orthogonal transform is not representable in binary64",
                        details=details,
                    )
        return DenseMatrix(right.nrows, columns, entries)

    def solve_square(
        self,
        right: DenseMatrix,
        *,
        check: Callable[[], None] | None = None,
    ) -> DenseMatrix:
        size = self._transformed.nrows
        if self._transformed.ncols != size:
            raise LinearAlgebraError(
                "matrix_not_square", "QR direct solve requires a square matrix"
            )
        if self.rank_estimate != size:
            raise LinearAlgebraError(
                "rank_deficient",
                "the coefficient matrix is numerically rank deficient",
                details={"rank_estimate": self.rank_estimate, "dimension": size},
            )
        transformed_right = self.apply_q_transpose(right, check=check)
        columns = right.ncols
        permuted_solution = [0.0] * (size * columns)
        for row in range(size - 1, -1, -1):
            if check is not None:
                check()
            pivot = self._transformed.entry(row, row)
            for column in range(columns):
                value = transformed_right.entry(row, column)
                details = {"row": row, "right_side_column": column}
                value = _finite_intermediate(
                    value
                    - _finite_sum(
                        (
                            self._transformed.entry(row, index)
                            * permuted_solution[index * columns + column]
                            for index in range(row + 1, size)
                        ),
                        "the QR back solve is not representable in binary64",
                        details=details,
                    ),
                    "the QR back solve is not representable in binary64",
                    details=details,
                )
                permuted_solution[row * columns + column] = _finite_intermediate(
                    value / pivot,
                    "the QR solution is not representable in binary64",
                    details=details,
                )
        output = [0.0] * (size * columns)
        for permuted_column, original_column in enumerate(self.column_permutation):
            for column in range(columns):
                output[original_column * columns + column] = permuted_solution[
                    permuted_column * columns + column
                ]
        return DenseMatrix(size, columns, output)

    def to_dict(self, *, check: Callable[[], None] | None = None) -> dict[str, Any]:
        factorized = self.source_expression
        return {
            "kind": "pivoted_qr" if self.pivoted else "qr",
            "identity": (
                factorized + " * P = Q * R" if self.pivoted else factorized + " = Q * R"
            ),
            "factorized_operand": factorized,
            "q": self.q(check=check).to_dict(),
            "r": self.r().to_dict(),
            "permutation": self.permutation_matrix().to_dict(),
            "column_permutation": list(self.column_permutation),
            "rank_threshold": self.rank_threshold,
            "rank_estimate": self.rank_estimate,
        }


def qr_factorize(
    matrix: DenseMatrix,
    *,
    pivoted: bool = False,
    rank_tolerance: float | None = None,
    check: Callable[[], None] | None = None,
    source_expression: str = "A",
) -> QRFactorization:
    """Compute a stable Householder QR factorization."""
    rows = matrix.nrows
    columns = matrix.ncols
    transformed = list(matrix.entries)
    permutation = list(range(columns))
    reflectors: list[tuple[int, tuple[float, ...]]] = []
    for index in range(min(rows, columns)):
        if check is not None:
            check()
        if pivoted:
            pivot_column = index
            pivot_norm = -1.0
            for column in range(index, columns):
                if check is not None:
                    check()
                norm = stable_norm_two(
                    transformed[row * columns + column] for row in range(index, rows)
                )
                if norm > pivot_norm:
                    pivot_norm = norm
                    pivot_column = column
            if pivot_column != index:
                for row in range(rows):
                    left = row * columns + index
                    right = row * columns + pivot_column
                    transformed[left], transformed[right] = (
                        transformed[right],
                        transformed[left],
                    )
                permutation[index], permutation[pivot_column] = (
                    permutation[pivot_column],
                    permutation[index],
                )
        norm = stable_norm_two(
            transformed[row * columns + index] for row in range(index, rows)
        )
        if norm == 0.0:
            continue
        leading = transformed[index * columns + index]
        alpha = -norm if leading >= 0.0 else norm
        if not math.isfinite(alpha):
            raise LinearAlgebraError(
                "nonfinite_intermediate",
                "the Householder column norm is not representable in binary64",
                details={"column": index},
            )
        vector = [
            transformed[row * columns + index] / norm for row in range(index, rows)
        ]
        vector[0] -= -1.0 if leading >= 0.0 else 1.0
        vector_norm = stable_norm_two(vector)
        if vector_norm == 0.0:
            continue
        vector = [value / vector_norm for value in vector]
        for column in range(index, columns):
            if check is not None:
                check()
            details = {"reflector_start": index, "column": column}
            projection = _finite_sum(
                (
                    vector[offset] * transformed[(index + offset) * columns + column]
                    for offset in range(len(vector))
                ),
                "the Householder update is not representable in binary64",
                details=details,
            )
            for offset in range(len(vector)):
                location = (index + offset) * columns + column
                contribution = _finite_intermediate(
                    projection * vector[offset],
                    "the Householder update is not representable in binary64",
                    details=details,
                )
                transformed[location] = _finite_sum(
                    (transformed[location], -contribution, -contribution),
                    "the Householder update is not representable in binary64",
                    details=details,
                )
        transformed[index * columns + index] = alpha
        for row in range(index + 1, rows):
            transformed[row * columns + index] = 0.0
        reflectors.append((index, tuple(vector)))
    diagonal_maximum = 0.0
    for index in range(min(rows, columns)):
        diagonal_maximum = max(
            diagonal_maximum, abs(transformed[index * columns + index])
        )
    if rank_tolerance is None:
        threshold = (
            MACHINE_EPSILON * max(1, rows, columns) * diagonal_maximum
            if diagonal_maximum != 0.0
            else 0.0
        )
    else:
        threshold = float(rank_tolerance)
        if not math.isfinite(threshold) or threshold < 0.0:
            raise ValueError("rank_tolerance must be finite and nonnegative")
    return QRFactorization(
        matrix,
        DenseMatrix(rows, columns, transformed),
        reflectors,
        permutation,
        threshold,
        pivoted,
        source_expression,
    )


class CholeskyFactorization:
    """Checked lower-triangular factor `A = L * L.T`."""

    def __init__(self, original: DenseMatrix, lower: DenseMatrix) -> None:
        self.original = original
        self._lower = lower

    def lower(self) -> DenseMatrix:
        return self._lower

    def solve(
        self,
        right: DenseMatrix,
        *,
        check: Callable[[], None] | None = None,
    ) -> DenseMatrix:
        size = self._lower.nrows
        if right.nrows != size:
            raise LinearAlgebraError(
                "dimension_mismatch", "matrix and right side dimensions disagree"
            )
        columns = right.ncols
        working = list(right.entries)
        for row in range(size):
            if check is not None:
                check()
            pivot = self._lower.entry(row, row)
            for column in range(columns):
                value = working[row * columns + column]
                details = {"row": row, "right_side_column": column}
                value = _finite_intermediate(
                    value
                    - _finite_sum(
                        (
                            self._lower.entry(row, index)
                            * working[index * columns + column]
                            for index in range(row)
                        ),
                        "the Cholesky forward solve is not representable in binary64",
                        details=details,
                    ),
                    "the Cholesky forward solve is not representable in binary64",
                    details=details,
                )
                working[row * columns + column] = _finite_intermediate(
                    value / pivot,
                    "the Cholesky forward solution is not representable in binary64",
                    details=details,
                )
        for row in range(size - 1, -1, -1):
            if check is not None:
                check()
            pivot = self._lower.entry(row, row)
            for column in range(columns):
                value = working[row * columns + column]
                details = {"row": row, "right_side_column": column}
                value = _finite_intermediate(
                    value
                    - _finite_sum(
                        (
                            self._lower.entry(index, row)
                            * working[index * columns + column]
                            for index in range(row + 1, size)
                        ),
                        "the Cholesky back solve is not representable in binary64",
                        details=details,
                    ),
                    "the Cholesky back solve is not representable in binary64",
                    details=details,
                )
                working[row * columns + column] = _finite_intermediate(
                    value / pivot,
                    "the Cholesky solution is not representable in binary64",
                    details=details,
                )
        return DenseMatrix(size, columns, working)

    def to_dict(self, *, check: Callable[[], None] | None = None) -> dict[str, Any]:
        if check is not None:
            check()
        return {
            "kind": "cholesky",
            "identity": "A = L * L.T",
            "lower": self._lower.to_dict(),
        }


def cholesky_factorize(
    matrix: DenseMatrix,
    *,
    symmetry_tolerance: float | None = None,
    check: Callable[[], None] | None = None,
) -> CholeskyFactorization:
    """Factor a finite real symmetric positive-definite matrix."""
    if matrix.nrows != matrix.ncols:
        raise LinearAlgebraError(
            "matrix_not_square", "Cholesky factorization requires a square matrix"
        )
    size = matrix.nrows
    absolute_tolerance = (
        None if symmetry_tolerance is None else float(symmetry_tolerance)
    )
    if absolute_tolerance is not None:
        if not math.isfinite(absolute_tolerance) or absolute_tolerance < 0.0:
            raise ValueError("symmetry_tolerance must be finite and nonnegative")
    for row in range(size):
        if check is not None:
            check()
        for column in range(row):
            lower_entry = matrix.entry(row, column)
            upper_entry = matrix.entry(column, row)
            comparison_tolerance = (
                MACHINE_EPSILON * max(1, size) * max(abs(lower_entry), abs(upper_entry))
                if absolute_tolerance is None
                else absolute_tolerance
            )
            if abs(lower_entry - upper_entry) > comparison_tolerance:
                raise LinearAlgebraError(
                    "not_symmetric",
                    "Cholesky factorization requires a symmetric matrix",
                    details={
                        "row": row,
                        "column": column,
                        "tolerance": comparison_tolerance,
                    },
                )
    lower = [0.0] * (size * size)
    for row in range(size):
        if check is not None:
            check()
        for column in range(row + 1):
            if check is not None:
                check()
            details = {"row": row, "column": column}
            correction = _finite_sum(
                (
                    lower[row * size + index] * lower[column * size + index]
                    for index in range(column)
                ),
                "the Cholesky update is not representable in binary64",
                details=details,
            )
            value = matrix.entry(row, column) - correction
            if not math.isfinite(value):
                raise LinearAlgebraError(
                    "nonfinite_intermediate",
                    "the Cholesky update is not representable in binary64",
                    details=details,
                )
            if row == column:
                if value <= 0.0:
                    raise LinearAlgebraError(
                        "not_positive_definite",
                        "Cholesky factorization requires a positive-definite matrix",
                        details={"leading_minor": row + 1, "pivot": value},
                    )
                lower[row * size + column] = math.sqrt(value)
            else:
                lower[row * size + column] = _finite_intermediate(
                    value / lower[column * size + column],
                    "the Cholesky factor is not representable in binary64",
                    details=details,
                )
    return CholeskyFactorization(matrix, DenseMatrix(size, size, lower))

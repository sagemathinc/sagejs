"""Readable binary64 LU, Householder QR, and Cholesky factorizations."""

from __future__ import annotations

import math
from typing import Any

from .storage import DenseMatrix

MACHINE_EPSILON = 2.220446049250313e-16


class LinearAlgebraError(Exception):
    """A classified numerical-linear-algebra failure."""

    def __init__(
        self, code: str, message: str, *, details: dict[str, Any] | None = None
    ) -> None:
        super().__init__(message)
        self.code = code
        self.details = {} if details is None else dict(details)


def _default_pivot_threshold(matrix: DenseMatrix) -> float:
    scale = matrix.norm_infinity()
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
    def rank_estimate(self) -> int:
        diagonal = min(self._packed.nrows, self._packed.ncols)
        rank = 0
        for index in range(diagonal):
            if abs(self._packed.entry(index, index)) > self.pivot_threshold:
                rank += 1
        return rank

    @property
    def nonsingular(self) -> bool:
        return (
            self._packed.nrows == self._packed.ncols
            and self.rank_estimate == self._packed.nrows
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

    def solve(self, right: DenseMatrix) -> DenseMatrix:
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
                    "rank_estimate": self.rank_estimate,
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
            for column in range(columns):
                value = working[row * columns + column]
                value -= math.fsum(
                    self._packed.entry(row, index) * working[index * columns + column]
                    for index in range(row)
                )
                working[row * columns + column] = value
        for row in range(size - 1, -1, -1):
            pivot = self._packed.entry(row, row)
            for column in range(columns):
                value = working[row * columns + column]
                value -= math.fsum(
                    self._packed.entry(row, index) * working[index * columns + column]
                    for index in range(row + 1, size)
                )
                working[row * columns + column] = value / pivot
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

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": "lu",
            "identity": "A = P * L * U",
            "permutation": self.permutation_matrix().to_dict(),
            "lower": self.lower().to_dict(),
            "upper": self.upper().to_dict(),
            "row_permutation": list(self._row_permutation),
            "swaps": self.swaps,
            "pivot_threshold": self.pivot_threshold,
            "rank_estimate": self.rank_estimate,
        }


def lu_factorize(
    matrix: DenseMatrix, *, pivot_threshold: float | None = None
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
            location = row * columns + index
            multiplier = working[location] / pivot
            working[location] = multiplier
            for column in range(index + 1, columns):
                target = row * columns + column
                working[target] -= multiplier * working[index * columns + column]
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
    ) -> None:
        self.original = original
        self._transformed = transformed
        self._reflectors = tuple(reflectors)
        self.column_permutation = tuple(column_permutation)
        self.rank_threshold = rank_threshold
        self.pivoted = pivoted

    @property
    def rank_estimate(self) -> int:
        rank = 0
        for index in range(min(self._transformed.nrows, self._transformed.ncols)):
            if abs(self._transformed.entry(index, index)) > self.rank_threshold:
                rank += 1
        return rank

    def q(self, *, complete: bool = False) -> DenseMatrix:
        rows = self._transformed.nrows
        columns = rows if complete else min(rows, self._transformed.ncols)
        entries = [0.0] * (rows * columns)
        for index in range(min(rows, columns)):
            entries[index * columns + index] = 1.0
        for start, vector in reversed(self._reflectors):
            for column in range(columns):
                projection = 2.0 * math.fsum(
                    vector[offset] * entries[(start + offset) * columns + column]
                    for offset in range(len(vector))
                )
                for offset in range(len(vector)):
                    location = (start + offset) * columns + column
                    entries[location] -= projection * vector[offset]
        return DenseMatrix(rows, columns, entries)

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

    def apply_q_transpose(self, right: DenseMatrix) -> DenseMatrix:
        if right.nrows != self._transformed.nrows:
            raise LinearAlgebraError(
                "dimension_mismatch", "Q and right side dimensions disagree"
            )
        entries = list(right.entries)
        columns = right.ncols
        for start, vector in self._reflectors:
            for column in range(columns):
                projection = 2.0 * math.fsum(
                    vector[offset] * entries[(start + offset) * columns + column]
                    for offset in range(len(vector))
                )
                for offset in range(len(vector)):
                    location = (start + offset) * columns + column
                    entries[location] -= projection * vector[offset]
        return DenseMatrix(right.nrows, columns, entries)

    def solve_square(self, right: DenseMatrix) -> DenseMatrix:
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
        transformed_right = self.apply_q_transpose(right)
        columns = right.ncols
        permuted_solution = [0.0] * (size * columns)
        for row in range(size - 1, -1, -1):
            pivot = self._transformed.entry(row, row)
            for column in range(columns):
                value = transformed_right.entry(row, column)
                value -= math.fsum(
                    self._transformed.entry(row, index)
                    * permuted_solution[index * columns + column]
                    for index in range(row + 1, size)
                )
                permuted_solution[row * columns + column] = value / pivot
        output = [0.0] * (size * columns)
        for permuted_column, original_column in enumerate(self.column_permutation):
            for column in range(columns):
                output[original_column * columns + column] = permuted_solution[
                    permuted_column * columns + column
                ]
        return DenseMatrix(size, columns, output)

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": "pivoted_qr" if self.pivoted else "qr",
            "identity": "A * P = Q * R" if self.pivoted else "A = Q * R",
            "q": self.q().to_dict(),
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
) -> QRFactorization:
    """Compute a stable Householder QR factorization."""
    rows = matrix.nrows
    columns = matrix.ncols
    transformed = list(matrix.entries)
    permutation = list(range(columns))
    reflectors: list[tuple[int, tuple[float, ...]]] = []
    for index in range(min(rows, columns)):
        if pivoted:
            pivot_column = index
            pivot_norm = -1.0
            for column in range(index, columns):
                norm = 0.0
                for row in range(index, rows):
                    norm = math.hypot(norm, transformed[row * columns + column])
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
        norm = 0.0
        for row in range(index, rows):
            norm = math.hypot(norm, transformed[row * columns + index])
        if norm == 0.0:
            continue
        leading = transformed[index * columns + index]
        alpha = -norm if leading >= 0.0 else norm
        vector = [transformed[row * columns + index] for row in range(index, rows)]
        vector[0] -= alpha
        vector_norm = 0.0
        for value in vector:
            vector_norm = math.hypot(vector_norm, value)
        if vector_norm == 0.0:
            continue
        vector = [value / vector_norm for value in vector]
        for column in range(index, columns):
            projection = 2.0 * math.fsum(
                vector[offset] * transformed[(index + offset) * columns + column]
                for offset in range(len(vector))
            )
            for offset in range(len(vector)):
                location = (index + offset) * columns + column
                transformed[location] -= projection * vector[offset]
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
    )


class CholeskyFactorization:
    """Checked lower-triangular factor `A = L * L.T`."""

    def __init__(self, original: DenseMatrix, lower: DenseMatrix) -> None:
        self.original = original
        self._lower = lower

    def lower(self) -> DenseMatrix:
        return self._lower

    def solve(self, right: DenseMatrix) -> DenseMatrix:
        size = self._lower.nrows
        if right.nrows != size:
            raise LinearAlgebraError(
                "dimension_mismatch", "matrix and right side dimensions disagree"
            )
        columns = right.ncols
        working = list(right.entries)
        for row in range(size):
            pivot = self._lower.entry(row, row)
            for column in range(columns):
                value = working[row * columns + column]
                value -= math.fsum(
                    self._lower.entry(row, index) * working[index * columns + column]
                    for index in range(row)
                )
                working[row * columns + column] = value / pivot
        for row in range(size - 1, -1, -1):
            pivot = self._lower.entry(row, row)
            for column in range(columns):
                value = working[row * columns + column]
                value -= math.fsum(
                    self._lower.entry(index, row) * working[index * columns + column]
                    for index in range(row + 1, size)
                )
                working[row * columns + column] = value / pivot
        return DenseMatrix(size, columns, working)

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": "cholesky",
            "identity": "A = L * L.T",
            "lower": self._lower.to_dict(),
        }


def cholesky_factorize(
    matrix: DenseMatrix, *, symmetry_tolerance: float | None = None
) -> CholeskyFactorization:
    """Factor a finite real symmetric positive-definite matrix."""
    if matrix.nrows != matrix.ncols:
        raise LinearAlgebraError(
            "matrix_not_square", "Cholesky factorization requires a square matrix"
        )
    size = matrix.nrows
    scale = matrix.norm_infinity()
    if symmetry_tolerance is None:
        tolerance = MACHINE_EPSILON * max(1, size) * scale
    else:
        tolerance = float(symmetry_tolerance)
        if not math.isfinite(tolerance) or tolerance < 0.0:
            raise ValueError("symmetry_tolerance must be finite and nonnegative")
    for row in range(size):
        for column in range(row):
            if abs(matrix.entry(row, column) - matrix.entry(column, row)) > tolerance:
                raise LinearAlgebraError(
                    "not_symmetric",
                    "Cholesky factorization requires a symmetric matrix",
                    details={"row": row, "column": column, "tolerance": tolerance},
                )
    lower = [0.0] * (size * size)
    for row in range(size):
        for column in range(row + 1):
            correction = math.fsum(
                lower[row * size + index] * lower[column * size + index]
                for index in range(column)
            )
            value = matrix.entry(row, column) - correction
            if row == column:
                positive_tolerance = MACHINE_EPSILON * max(
                    abs(matrix.entry(row, row)), scale
                )
                if value <= positive_tolerance:
                    raise LinearAlgebraError(
                        "not_positive_definite",
                        "Cholesky factorization requires a positive-definite matrix",
                        details={"leading_minor": row + 1, "pivot": value},
                    )
                lower[row * size + column] = math.sqrt(value)
            else:
                lower[row * size + column] = value / lower[column * size + column]
    return CholeskyFactorization(matrix, DenseMatrix(size, size, lower))

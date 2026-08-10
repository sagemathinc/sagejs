"""Readable fallback algorithms for Native Kernel prime-field matrices."""

from __future__ import annotations

from typing import Any

from sagejs.native import native


def _prime_field_rows(source: Any) -> list[list[Any]]:
    return [source.row(row).list() for row in range(source.nrows())]


def _prime_field_echelon_data(
    source: Any,
    pivot_columns: int | None = None,
) -> tuple[list[list[Any]], int]:
    values = _prime_field_rows(source)
    rows = source.nrows()
    columns = source.ncols()
    if pivot_columns is None:
        pivot_columns = columns
    pivot_row = 0
    for pivot_column in range(pivot_columns):
        selected = pivot_row
        while selected < rows and values[selected][pivot_column] == 0:
            selected += 1
        if selected == rows:
            continue
        if selected != pivot_row:
            values[selected], values[pivot_row] = (values[pivot_row], values[selected])
        pivot = values[pivot_row][pivot_column]
        for column in range(pivot_column, columns):
            values[pivot_row][column] /= pivot
        for row in range(rows):
            if row == pivot_row:
                continue
            factor = values[row][pivot_column]
            if factor == 0:
                continue
            values[row][pivot_column] = source.base_ring()(0)
            for column in range(pivot_column + 1, columns):
                values[row][column] -= factor * values[pivot_row][column]
        pivot_row += 1
        if pivot_row == rows:
            break
    return values, pivot_row


def _prime_field_rank_fallback(source: Any) -> int:
    _values, rank = _prime_field_echelon_data(source)
    return rank


def _prime_field_determinant_fallback(source: Any) -> Any:
    if source.nrows() != source.ncols():
        raise ValueError("determinant requires a square matrix")
    values = _prime_field_rows(source)
    field = source.base_ring()
    size = source.nrows()
    determinant = field(1)
    for pivot_column in range(size):
        selected = pivot_column
        while selected < size and values[selected][pivot_column] == 0:
            selected += 1
        if selected == size:
            return field(0)
        if selected != pivot_column:
            values[selected], values[pivot_column] = (
                values[pivot_column],
                values[selected],
            )
            determinant = -determinant
        pivot = values[pivot_column][pivot_column]
        determinant *= pivot
        for row in range(pivot_column + 1, size):
            if values[row][pivot_column] == 0:
                continue
            factor = values[row][pivot_column] / pivot
            values[row][pivot_column] = field(0)
            for column in range(pivot_column + 1, size):
                values[row][column] -= factor * values[pivot_column][column]
    return determinant


def _prime_field_echelon_fallback(source: Any) -> Any:
    values, _rank = _prime_field_echelon_data(source)
    return matrix(
        source.base_ring(),
        source.nrows(),
        source.ncols(),
        [value for row in values for value in row],
    )


def _prime_field_solve_fallback(left: Any, right: Any) -> Any:
    if (
        left.nrows() != left.ncols()
        or right.nrows() != left.nrows()
        or right.base_ring() is not left.base_ring()
    ):
        raise ValueError("solve requires square compatible matrices over one field")
    field = left.base_ring()
    size = left.nrows()
    right_columns = right.ncols()
    augmented = []
    left_rows = _prime_field_rows(left)
    right_rows = _prime_field_rows(right)
    for row in range(size):
        augmented.append(left_rows[row] + right_rows[row])
    augmented_matrix = matrix(
        field,
        size,
        size + right_columns,
        [value for row in augmented for value in row],
    )
    values, rank = _prime_field_echelon_data(augmented_matrix, size)
    if rank != size:
        raise ValueError("matrix is singular")
    answer = []
    for row in range(size):
        answer.extend(values[row][size:])
    return matrix(field, size, right_columns, answer)


class _PrimeFieldDecompositionFallback:
    """Portable decomposition facade used when no native artifact exists."""

    def __init__(self, source: Any) -> None:
        rows = _prime_field_rows(source)
        self.source = matrix(
            source.base_ring(),
            source.nrows(),
            source.ncols(),
            [value for row in rows for value in row],
        )
        self.algorithm = "python"

    def rank(self) -> int:
        return _prime_field_rank_fallback(self.source)

    def determinant(self) -> Any:
        return _prime_field_determinant_fallback(self.source)

    def echelon(self) -> Any:
        return _prime_field_echelon_fallback(self.source)

    def solve(self, right: Any) -> Any:
        return _prime_field_solve_fallback(self.source, right)


def _prime_field_factor_fallback(
    source: Any,
) -> _PrimeFieldDecompositionFallback:
    return _PrimeFieldDecompositionFallback(source)


def _prime_field_factor_rank_fallback(
    decomposition: _PrimeFieldDecompositionFallback,
) -> int:
    return decomposition.rank()


def _prime_field_factor_determinant_fallback(
    decomposition: _PrimeFieldDecompositionFallback,
) -> Any:
    return decomposition.determinant()


def _prime_field_factor_echelon_fallback(
    decomposition: _PrimeFieldDecompositionFallback,
) -> Any:
    return decomposition.echelon()


def _prime_field_factor_solve_fallback(
    decomposition: _PrimeFieldDecompositionFallback,
    right: Any,
) -> Any:
    return decomposition.solve(right)


@native
def prime_field_rank(source: PrimeFieldMatrix) -> uint64:
    return _prime_field_rank_fallback(source)


@native
def prime_field_determinant(
    source: PrimeFieldMatrix,
) -> PrimeFieldElement:
    return _prime_field_determinant_fallback(source)


@native
def prime_field_echelon(
    source: PrimeFieldMatrix,
) -> PrimeFieldMatrix:
    return _prime_field_echelon_fallback(source)


@native
def prime_field_solve(
    left: PrimeFieldMatrix,
    right: PrimeFieldMatrix,
) -> PrimeFieldMatrix:
    return _prime_field_solve_fallback(left, right)


@native
def prime_field_factor(
    source: PrimeFieldMatrix,
) -> PrimeFieldDecomposition:
    return _prime_field_factor_fallback(source)


@native
def prime_field_factor_rank(
    decomposition: PrimeFieldDecomposition,
) -> uint64:
    return _prime_field_factor_rank_fallback(decomposition)


@native
def prime_field_factor_determinant(
    decomposition: PrimeFieldDecomposition,
) -> PrimeFieldElement:
    return _prime_field_factor_determinant_fallback(decomposition)


@native
def prime_field_factor_echelon(
    decomposition: PrimeFieldDecomposition,
) -> PrimeFieldMatrix:
    return _prime_field_factor_echelon_fallback(decomposition)


@native
def prime_field_factor_solve(
    decomposition: PrimeFieldDecomposition,
    right: PrimeFieldMatrix,
) -> PrimeFieldMatrix:
    return _prime_field_factor_solve_fallback(decomposition, right)

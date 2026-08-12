"""Exact reference contracts for classical matrix decompositions.

This module deliberately contains ordinary Python that executes unchanged in
CPython and Sage.js.  It fixes the public mathematical semantics before a
`Matrix` method, generated FLINT resource operation, or source-transparent
native kernel is selected.  The small `ExactMatrixData` value preserves both
dimensions even when one is zero; nested Python lists cannot distinguish
`0 x n` shapes.

The contracts follow Sage:

- `exact_lu` returns `(P, L, U)` with `A = P * L * U`;
- `exact_qr` returns `(Q, R)` with `A = Q * R`, using full or reduced shapes;
- `gram_schmidt_rows` returns `(G, M)` with `A = M * G`.

Scalars are supplied by the caller together with their additive and
multiplicative identities.  LU requires field division; partial pivoting also
requires ordered absolute values.  QR receives an exact square-root operation.
Inner products here are bilinear, not Hermitian: complex exact fields require
a separate conjugating scalar protocol before public wiring.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence
from typing import Any


SquareRoot = Callable[[Any], Any]


class ExactMatrixData:
    """A row-major exact-scalar matrix value with explicit dimensions.

    Algorithms never construct or coerce scalar elements themselves.  The
    caller supplies `zero`, `one`, and entries from one compatible exact scalar
    domain.  Entries are snapped into an immutable tuple, so algorithms may
    safely return new values without aliasing caller storage.
    """

    def __init__(
        self,
        nrows: int,
        ncols: int,
        entries: Iterable[Any],
        zero: Any,
        one: Any,
    ) -> None:
        if nrows < 0 or ncols < 0:
            raise ValueError("matrix dimensions must be nonnegative")
        snapshot = tuple(entries)
        if len(snapshot) != nrows * ncols:
            raise ValueError(
                f"matrix entry count does not match {nrows} x {ncols} dimensions"
            )
        self.nrows = nrows
        self.ncols = ncols
        self.entries = snapshot
        self.zero = zero
        self.one = one

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, ExactMatrixData)
            and self.nrows == other.nrows
            and self.ncols == other.ncols
            and self.entries == other.entries
        )

    @classmethod
    def create(
        cls,
        nrows: int,
        ncols: int,
        entries: Iterable[Any],
        *,
        zero: Any,
        one: Any,
    ) -> ExactMatrixData:
        """Construct by taking an immutable snapshot of exact entries."""
        return cls(nrows, ncols, entries, zero, one)

    @classmethod
    def from_rows(
        cls,
        rows: Sequence[Sequence[Any]],
        *,
        zero: Any,
        one: Any,
        ncols: int | None = None,
    ) -> ExactMatrixData:
        """Construct from rows, with `ncols` preserving an empty row set."""
        row_count = len(rows)
        if row_count == 0:
            column_count = 0 if ncols is None else ncols
        else:
            column_count = len(rows[0])
            if ncols is not None and ncols != column_count:
                raise ValueError("explicit column count disagrees with row data")
        for row in rows:
            if len(row) != column_count:
                raise ValueError("matrix rows must all have the same length")
        return cls.create(
            row_count,
            column_count,
            (value for row in rows for value in row),
            zero=zero,
            one=one,
        )

    @classmethod
    def zero_matrix(
        cls,
        nrows: int,
        ncols: int,
        *,
        zero: Any,
        one: Any,
    ) -> ExactMatrixData:
        """Return the `nrows x ncols` zero matrix."""
        return cls(nrows, ncols, (zero,) * (nrows * ncols), zero, one)

    @classmethod
    def identity(
        cls,
        size: int,
        *,
        zero: Any,
        one: Any,
    ) -> ExactMatrixData:
        """Return the `size x size` identity matrix."""
        entries = [zero] * (size * size)
        for index in range(size):
            entries[index * size + index] = one
        return cls(size, size, entries, zero, one)

    def entry(self, row: int, column: int) -> Any:
        """Return one checked entry."""
        if row < 0 or row >= self.nrows or column < 0 or column >= self.ncols:
            raise IndexError("matrix index out of range")
        return self.entries[row * self.ncols + column]

    def row(self, index: int) -> tuple[Any, ...]:
        """Return one checked immutable row."""
        if index < 0 or index >= self.nrows:
            raise IndexError("matrix row index out of range")
        start = index * self.ncols
        return self.entries[start : start + self.ncols]

    def column(self, index: int) -> tuple[Any, ...]:
        """Return one checked immutable column."""
        if index < 0 or index >= self.ncols:
            raise IndexError("matrix column index out of range")
        return tuple(
            self.entries[row * self.ncols + index] for row in range(self.nrows)
        )

    def transpose(self) -> ExactMatrixData:
        """Return the transpose while preserving empty dimensions."""
        return ExactMatrixData(
            self.ncols,
            self.nrows,
            tuple(
                self.entries[row * self.ncols + column]
                for column in range(self.ncols)
                for row in range(self.nrows)
            ),
            self.zero,
            self.one,
        )

    def multiply(self, other: ExactMatrixData) -> ExactMatrixData:
        """Return the exact matrix product."""
        if self.ncols != other.nrows:
            raise ValueError("incompatible matrix dimensions")
        output: list[Any] = []
        for row in range(self.nrows):
            for column in range(other.ncols):
                value = self.zero
                for index in range(self.ncols):
                    value += self.entry(row, index) * other.entry(index, column)
                output.append(value)
        return ExactMatrixData(
            self.nrows,
            other.ncols,
            output,
            self.zero,
            self.one,
        )


def _dot(left: Sequence[Any], right: Sequence[Any], zero: Any) -> Any:
    if len(left) != len(right):
        raise ValueError("vector dimensions must agree")
    value = zero
    for index in range(len(left)):
        value += left[index] * right[index]
    return value


def _subtract_scaled(
    target: Sequence[Any],
    scale: Any,
    source: Sequence[Any],
) -> list[Any]:
    return [target[index] - scale * source[index] for index in range(len(target))]


def exact_lu(
    matrix: ExactMatrixData,
    *,
    pivot: str = "partial",
) -> tuple[ExactMatrixData, ExactMatrixData, ExactMatrixData]:
    """Return Sage-oriented exact `(P, L, U)` factors.

    For an `m x n` input, `P` and `L` are `m x m`, `U` is `m x n`,
    `L` is unit lower triangular, and `matrix == P * L * U`.  Singular
    and rectangular inputs are valid.  `partial` chooses the largest absolute
    pivot and `nonzero` chooses the first nonzero pivot.
    """
    if pivot not in ("partial", "nonzero"):
        raise ValueError("pivot strategy must be 'partial' or 'nonzero'")

    rows = matrix.nrows
    columns = matrix.ncols
    working = list(matrix.entries)
    permutation = list(range(rows))
    diagonal = min(rows, columns)

    for index in range(diagonal):
        pivot_row = -1
        if pivot == "partial":
            largest = abs(matrix.zero)
            for row in range(index, rows):
                candidate = abs(working[row * columns + index])
                if candidate > largest:
                    largest = candidate
                    pivot_row = row
        else:
            for row in range(index, rows):
                if working[row * columns + index] != 0:
                    pivot_row = row
                    break

        if pivot_row == -1:
            continue
        if pivot_row != index:
            permutation[index], permutation[pivot_row] = (
                permutation[pivot_row],
                permutation[index],
            )
            for column in range(columns):
                upper = index * columns + column
                lower = pivot_row * columns + column
                working[upper], working[lower] = working[lower], working[upper]

        pivot_value = working[index * columns + index]
        for row in range(index + 1, rows):
            location = row * columns + index
            multiplier = working[location] / pivot_value
            working[location] = multiplier
            for column in range(index + 1, columns):
                target = row * columns + column
                working[target] -= multiplier * working[index * columns + column]

    lower_entries = [matrix.zero] * (rows * rows)
    for row in range(rows):
        lower_entries[row * rows + row] = matrix.one
    upper_entries = working.copy()
    for row in range(1, rows):
        for column in range(min(row, diagonal)):
            lower_entries[row * rows + column] = upper_entries[row * columns + column]
            upper_entries[row * columns + column] = matrix.zero

    permutation_entries = [matrix.zero] * (rows * rows)
    for working_row, original_row in enumerate(permutation):
        permutation_entries[original_row * rows + working_row] = matrix.one

    return (
        ExactMatrixData(
            rows,
            rows,
            permutation_entries,
            matrix.zero,
            matrix.one,
        ),
        ExactMatrixData(rows, rows, lower_entries, matrix.zero, matrix.one),
        ExactMatrixData(
            rows,
            columns,
            upper_entries,
            matrix.zero,
            matrix.one,
        ),
    )


def _orthogonal_columns(
    matrix: ExactMatrixData,
    square_root: SquareRoot,
) -> tuple[list[list[Any]], list[list[Any]]]:
    """Return normalized independent columns and reduced QR rows."""
    basis: list[list[Any]] = []
    coefficients = [
        [matrix.zero for _ in range(matrix.ncols)]
        for _ in range(min(matrix.nrows, matrix.ncols))
    ]

    for column in range(matrix.ncols):
        original = list(matrix.column(column))
        orthogonal = original.copy()
        for basis_index, vector in enumerate(basis):
            coefficient = _dot(vector, original, matrix.zero)
            coefficients[basis_index][column] = coefficient
            orthogonal = _subtract_scaled(orthogonal, coefficient, vector)
        norm_squared = _dot(orthogonal, orthogonal, matrix.zero)
        if norm_squared == matrix.zero:
            continue
        scale = square_root(norm_squared)
        if scale == matrix.zero:
            raise ValueError("exact square-root operation returned zero")
        basis.append([value / scale for value in orthogonal])
        coefficients[len(basis) - 1][column] = scale

    return basis, coefficients[: len(basis)]


def exact_qr(
    matrix: ExactMatrixData,
    *,
    square_root: SquareRoot,
    full: bool = True,
) -> tuple[ExactMatrixData, ExactMatrixData]:
    """Return Sage-shaped exact QR factors.

    If `full` is true for an `m x n` matrix, `Q` is `m x m` and `R` is
    `m x n`.  Otherwise `Q` is `m x rank` and `R` is `rank x n`.
    Rank-deficient columns are omitted from the reduced factors. The caller's
    `square_root` must return an exact scalar in the same domain
    or raise. This bilinear reference is intended for rational and real exact
    fields; it does not implement Hermitian inner products.
    """
    basis, coefficient_rows = _orthogonal_columns(matrix, square_root)
    rank = len(basis)

    if full:
        for coordinate in range(matrix.nrows):
            candidate = [matrix.zero] * matrix.nrows
            candidate[coordinate] = matrix.one
            for vector in basis:
                candidate = _subtract_scaled(
                    candidate,
                    _dot(vector, candidate, matrix.zero),
                    vector,
                )
            norm_squared = _dot(candidate, candidate, matrix.zero)
            if norm_squared == matrix.zero:
                continue
            scale = square_root(norm_squared)
            if scale == matrix.zero:
                raise ValueError("exact square-root operation returned zero")
            basis.append([value / scale for value in candidate])
            if len(basis) == matrix.nrows:
                break
        if len(basis) != matrix.nrows:
            raise ArithmeticError("unable to complete an orthonormal basis")
        output_rows = matrix.nrows
    else:
        output_rows = rank

    q_entries = tuple(
        basis[column][row]
        for row in range(matrix.nrows)
        for column in range(len(basis))
    )
    q = ExactMatrixData(
        matrix.nrows,
        len(basis),
        q_entries,
        matrix.zero,
        matrix.one,
    )

    r_entries: list[Any] = []
    for row in range(output_rows):
        if row < rank:
            r_entries.extend(coefficient_rows[row])
        else:
            r_entries.extend([matrix.zero] * matrix.ncols)
    r = ExactMatrixData(
        output_rows,
        matrix.ncols,
        r_entries,
        matrix.zero,
        matrix.one,
    )
    return q, r


def gram_schmidt_rows(
    matrix: ExactMatrixData,
    *,
    orthonormal: bool = False,
    square_root: SquareRoot | None = None,
) -> tuple[ExactMatrixData, ExactMatrixData]:
    """Orthogonalize rows and return Sage-shaped `(G, M)`.

    For an `m x n` matrix of rank `r`, `G` is `r x n`, `M` is `m x r`,
    and `matrix == M * G`.  Exact dependent and zero rows are omitted from
    `G`; this differs intentionally from the deprecated module-level Sage
    helper, which raises on dependent input. Storage beyond the returned
    matrices is `O(m*r + r*n)` for `m` rows, `n` columns, and rank `r`; in
    particular, tall skinny inputs never allocate an `m x m` scratch matrix.

    This uses a bilinear dot product. Complex exact fields need a separate
    Hermitian contract with explicit conjugation.
    """
    if orthonormal and square_root is None:
        raise ValueError("orthonormal Gram-Schmidt requires an exact square root")

    basis: list[list[Any]] = []
    coefficient_rows: list[list[Any]] = []

    for row in range(matrix.nrows):
        original = list(matrix.row(row))
        orthogonal = original.copy()
        coefficients: list[Any] = []
        for vector in basis:
            denominator = (
                matrix.one if orthonormal else _dot(vector, vector, matrix.zero)
            )
            coefficient = _dot(original, vector, matrix.zero) / denominator
            coefficients.append(coefficient)
            orthogonal = _subtract_scaled(orthogonal, coefficient, vector)
        norm_squared = _dot(orthogonal, orthogonal, matrix.zero)
        if norm_squared == matrix.zero:
            coefficient_rows.append(coefficients)
            continue
        if orthonormal:
            if square_root is None:
                raise AssertionError("square-root validation was bypassed")
            scale = square_root(norm_squared)
            if scale == matrix.zero:
                raise ValueError("exact square-root operation returned zero")
            basis.append([value / scale for value in orthogonal])
            coefficients.append(scale)
        else:
            basis.append(orthogonal)
            coefficients.append(matrix.one)
        coefficient_rows.append(coefficients)

    rank = len(basis)
    g = ExactMatrixData(
        rank,
        matrix.ncols,
        tuple(value for row in basis for value in row),
        matrix.zero,
        matrix.one,
    )
    m = ExactMatrixData(
        matrix.nrows,
        rank,
        tuple(
            (
                coefficient_rows[row][column]
                if column < len(coefficient_rows[row])
                else matrix.zero
            )
            for row in range(matrix.nrows)
            for column in range(rank)
        ),
        matrix.zero,
        matrix.one,
    )
    return g, m

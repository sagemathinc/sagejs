"""Exact reference contracts for classical matrix decompositions.

This module deliberately contains ordinary CPython-parseable Python.  It fixes
the public mathematical semantics before a `Matrix` method, generated FLINT
resource operation, or source-transparent native kernel is selected.  The
small immutable `RationalMatrixData` value preserves both dimensions even when
one is zero; nested Python lists cannot distinguish `0 x n` shapes.

The contracts follow Sage:

- `exact_lu` returns `(P, L, U)` with `A = P * L * U`;
- `exact_qr` returns `(Q, R)` with `A = Q * R`, using full or reduced shapes;
- `gram_schmidt_rows` returns `(G, M)` with `A = M * G`.

The reference scalar domain is `fractions.Fraction`.  Consequently normalized
QR succeeds precisely when every required square root is rational.  A future
public ring adapter may supply a different exact square-root operation without
changing the shape, reconstruction, rank-deficiency, or zero-shape contracts.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from fractions import Fraction
from math import isqrt


RationalInput = int | Fraction
SquareRoot = Callable[[Fraction], Fraction]


@dataclass(frozen=True, slots=True)
class RationalMatrixData:
    """An immutable row-major rational matrix with explicit dimensions."""

    nrows: int
    ncols: int
    entries: tuple[Fraction, ...]

    def __post_init__(self) -> None:
        if self.nrows < 0 or self.ncols < 0:
            raise ValueError("matrix dimensions must be nonnegative")
        if len(self.entries) != self.nrows * self.ncols:
            raise ValueError(
                "matrix entry count does not match "
                f"{self.nrows} x {self.ncols} dimensions"
            )
        if any(not isinstance(value, Fraction) for value in self.entries):
            raise TypeError("matrix entries must be fractions")

    @classmethod
    def create(
        cls,
        nrows: int,
        ncols: int,
        entries: Iterable[RationalInput],
    ) -> RationalMatrixData:
        """Construct a matrix while coercing every entry to `Fraction`."""
        return cls(nrows, ncols, tuple(Fraction(value) for value in entries))

    @classmethod
    def from_rows(
        cls,
        rows: Sequence[Sequence[RationalInput]],
        *,
        ncols: int | None = None,
    ) -> RationalMatrixData:
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
        )

    @classmethod
    def zero(cls, nrows: int, ncols: int) -> RationalMatrixData:
        """Return the `nrows x ncols` zero matrix."""
        return cls(nrows, ncols, (Fraction(0),) * (nrows * ncols))

    @classmethod
    def identity(cls, size: int) -> RationalMatrixData:
        """Return the `size x size` identity matrix."""
        entries = [Fraction(0)] * (size * size)
        for index in range(size):
            entries[index * size + index] = Fraction(1)
        return cls(size, size, tuple(entries))

    def entry(self, row: int, column: int) -> Fraction:
        """Return one checked entry."""
        if row < 0 or row >= self.nrows or column < 0 or column >= self.ncols:
            raise IndexError("matrix index out of range")
        return self.entries[row * self.ncols + column]

    def row(self, index: int) -> tuple[Fraction, ...]:
        """Return one checked immutable row."""
        if index < 0 or index >= self.nrows:
            raise IndexError("matrix row index out of range")
        start = index * self.ncols
        return self.entries[start : start + self.ncols]

    def column(self, index: int) -> tuple[Fraction, ...]:
        """Return one checked immutable column."""
        if index < 0 or index >= self.ncols:
            raise IndexError("matrix column index out of range")
        return tuple(
            self.entries[row * self.ncols + index] for row in range(self.nrows)
        )

    def transpose(self) -> RationalMatrixData:
        """Return the transpose while preserving empty dimensions."""
        return RationalMatrixData(
            self.ncols,
            self.nrows,
            tuple(
                self.entries[row * self.ncols + column]
                for column in range(self.ncols)
                for row in range(self.nrows)
            ),
        )

    def multiply(self, other: RationalMatrixData) -> RationalMatrixData:
        """Return the exact matrix product."""
        if self.ncols != other.nrows:
            raise ValueError("incompatible matrix dimensions")
        output: list[Fraction] = []
        for row in range(self.nrows):
            for column in range(other.ncols):
                value = Fraction(0)
                for index in range(self.ncols):
                    value += self.entry(row, index) * other.entry(index, column)
                output.append(value)
        return RationalMatrixData(self.nrows, other.ncols, tuple(output))


def _dot(left: Sequence[Fraction], right: Sequence[Fraction]) -> Fraction:
    if len(left) != len(right):
        raise ValueError("vector dimensions must agree")
    value = Fraction(0)
    for index in range(len(left)):
        value += left[index] * right[index]
    return value


def _subtract_scaled(
    target: Sequence[Fraction],
    scale: Fraction,
    source: Sequence[Fraction],
) -> list[Fraction]:
    return [target[index] - scale * source[index] for index in range(len(target))]


def rational_square_root(value: Fraction) -> Fraction:
    """Return the nonnegative rational square root or fail exactly."""
    if value < 0:
        raise ValueError("a negative rational has no real square root")
    numerator = isqrt(value.numerator)
    denominator = isqrt(value.denominator)
    if numerator * numerator != value.numerator:
        raise TypeError(
            "exact QR decomposition requires square roots outside Rational Field"
        )
    if denominator * denominator != value.denominator:
        raise TypeError(
            "exact QR decomposition requires square roots outside Rational Field"
        )
    return Fraction(numerator, denominator)


def exact_lu(
    matrix: RationalMatrixData,
    *,
    pivot: str = "partial",
) -> tuple[RationalMatrixData, RationalMatrixData, RationalMatrixData]:
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
            largest = Fraction(0)
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

    lower_entries = [Fraction(0)] * (rows * rows)
    for row in range(rows):
        lower_entries[row * rows + row] = Fraction(1)
    upper_entries = working.copy()
    for row in range(1, rows):
        for column in range(min(row, diagonal)):
            lower_entries[row * rows + column] = upper_entries[row * columns + column]
            upper_entries[row * columns + column] = Fraction(0)

    permutation_entries = [Fraction(0)] * (rows * rows)
    for working_row, original_row in enumerate(permutation):
        permutation_entries[original_row * rows + working_row] = Fraction(1)

    return (
        RationalMatrixData(rows, rows, tuple(permutation_entries)),
        RationalMatrixData(rows, rows, tuple(lower_entries)),
        RationalMatrixData(rows, columns, tuple(upper_entries)),
    )


def _orthogonal_columns(
    matrix: RationalMatrixData,
    square_root: SquareRoot,
) -> tuple[list[list[Fraction]], list[list[Fraction]]]:
    """Return normalized independent columns and reduced QR rows."""
    basis: list[list[Fraction]] = []
    coefficients = [
        [Fraction(0) for _ in range(matrix.ncols)]
        for _ in range(min(matrix.nrows, matrix.ncols))
    ]

    for column in range(matrix.ncols):
        original = list(matrix.column(column))
        orthogonal = original.copy()
        for basis_index, vector in enumerate(basis):
            coefficient = _dot(vector, original)
            coefficients[basis_index][column] = coefficient
            orthogonal = _subtract_scaled(orthogonal, coefficient, vector)
        norm_squared = _dot(orthogonal, orthogonal)
        if norm_squared == 0:
            continue
        scale = square_root(norm_squared)
        if scale == 0:
            raise ValueError("exact square-root operation returned zero")
        basis.append([value / scale for value in orthogonal])
        coefficients[len(basis) - 1][column] = scale

    return basis, coefficients[: len(basis)]


def exact_qr(
    matrix: RationalMatrixData,
    *,
    full: bool = True,
    square_root: SquareRoot = rational_square_root,
) -> tuple[RationalMatrixData, RationalMatrixData]:
    """Return Sage-shaped exact QR factors.

    If `full` is true for an `m x n` matrix, `Q` is `m x m` and `R` is
    `m x n`.  Otherwise `Q` is `m x rank` and `R` is `rank x n`.
    Rank-deficient columns are omitted from the reduced factors.  The rational
    reference raises `TypeError` when normalization leaves `QQ`; a public
    exact ring may provide its own `square_root` operation.
    """
    basis, coefficient_rows = _orthogonal_columns(matrix, square_root)
    rank = len(basis)

    if full:
        for coordinate in range(matrix.nrows):
            candidate = [Fraction(0)] * matrix.nrows
            candidate[coordinate] = Fraction(1)
            for vector in basis:
                candidate = _subtract_scaled(candidate, _dot(vector, candidate), vector)
            norm_squared = _dot(candidate, candidate)
            if norm_squared == 0:
                continue
            scale = square_root(norm_squared)
            if scale == 0:
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
    q = RationalMatrixData(matrix.nrows, len(basis), q_entries)

    r_entries: list[Fraction] = []
    for row in range(output_rows):
        if row < rank:
            r_entries.extend(coefficient_rows[row])
        else:
            r_entries.extend([Fraction(0)] * matrix.ncols)
    r = RationalMatrixData(output_rows, matrix.ncols, tuple(r_entries))
    return q, r


def gram_schmidt_rows(
    matrix: RationalMatrixData,
    *,
    orthonormal: bool = False,
    square_root: SquareRoot = rational_square_root,
) -> tuple[RationalMatrixData, RationalMatrixData]:
    """Orthogonalize rows and return Sage-shaped `(G, M)`.

    For an `m x n` matrix of rank `r`, `G` is `r x n`, `M` is `m x r`,
    and `matrix == M * G`.  Exact dependent and zero rows are omitted from
    `G`; this differs intentionally from the deprecated module-level Sage
    helper, which raises on dependent input.
    """
    basis: list[list[Fraction]] = []
    coefficient_rows = [
        [Fraction(0) for _ in range(matrix.nrows)] for _ in range(matrix.nrows)
    ]

    for row in range(matrix.nrows):
        original = list(matrix.row(row))
        orthogonal = original.copy()
        for basis_index, vector in enumerate(basis):
            denominator = Fraction(1) if orthonormal else _dot(vector, vector)
            coefficient = _dot(original, vector) / denominator
            coefficient_rows[row][basis_index] = coefficient
            orthogonal = _subtract_scaled(orthogonal, coefficient, vector)
        norm_squared = _dot(orthogonal, orthogonal)
        if norm_squared == 0:
            continue
        if orthonormal:
            scale = square_root(norm_squared)
            if scale == 0:
                raise ValueError("exact square-root operation returned zero")
            basis.append([value / scale for value in orthogonal])
            coefficient_rows[row][len(basis) - 1] = scale
        else:
            basis.append(orthogonal)
            coefficient_rows[row][len(basis) - 1] = Fraction(1)

    rank = len(basis)
    g = RationalMatrixData(
        rank,
        matrix.ncols,
        tuple(value for row in basis for value in row),
    )
    m = RationalMatrixData(
        matrix.nrows,
        rank,
        tuple(
            coefficient_rows[row][column]
            for row in range(matrix.nrows)
            for column in range(rank)
        ),
    )
    return g, m

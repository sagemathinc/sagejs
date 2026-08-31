"""Portable dense binary64 matrix and vector values.

The storage contract is immutable, row-major, finite, and shape-explicit.  The
ordinary Python implementation uses tuples so it runs unchanged in CPython and
Sage.js.  A future packed backend can marshal the single flat entry sequence to
`Float64Array` without changing the mathematical API.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Iterable, Iterator, Sequence
from typing import Any


def _binary64(value: Any, path: str) -> float:
    """Return one finite binary64 value or raise a location-aware error."""
    try:
        converted = float(value)
    except (TypeError, ValueError, OverflowError):
        raise TypeError(path + " must be convertible to binary64") from None
    if not math.isfinite(converted):
        raise ValueError(path + " must be finite")
    return converted


def stable_norm_two(values: Iterable[float]) -> float:
    """Return a scale-safe Euclidean norm with portable binary64 semantics.

    Sage.js' current dynamic `math.hypot` does not yet preserve CPython's
    scaling behavior near the ends of the binary64 exponent range.  Normalize
    before squaring so this mathematical package does not depend on that
    runtime difference.
    """
    snapshot = tuple(abs(value) for value in values)
    scale = max(snapshot, default=0.0)
    if scale == 0.0:
        return 0.0
    normalized = math.fsum((value / scale) ** 2 for value in snapshot)
    return scale * math.sqrt(normalized)


def stable_sum_nonnegative(values: Iterable[float]) -> float:
    """Return a nonnegative sum without intermediate overflow or cancellation."""
    snapshot = tuple(values)
    scale = max(snapshot, default=0.0)
    if scale == 0.0:
        return 0.0
    return scale * math.fsum(value / scale for value in snapshot)


class DenseVector:
    """An immutable finite binary64 vector."""

    def __init__(self, entries: Iterable[Any]) -> None:
        self._entries = tuple(
            _binary64(value, "vector[" + str(index) + "]")
            for index, value in enumerate(entries)
        )

    @property
    def size(self) -> int:
        return len(self._entries)

    @property
    def entries(self) -> tuple[float, ...]:
        return self._entries

    def entry(self, index: int) -> float:
        if index < 0 or index >= self.size:
            raise IndexError("vector index out of range")
        return self._entries[index]

    def to_list(self) -> list[float]:
        return list(self._entries)

    def norm_infinity(self) -> float:
        answer = 0.0
        for value in self._entries:
            answer = max(answer, abs(value))
        return answer

    def norm_two(self) -> float:
        return stable_norm_two(self._entries)

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": "dense_binary64_vector",
            "shape": [self.size],
            "layout": "contiguous",
            "entries": self.to_list(),
        }

    def __len__(self) -> int:
        return self.size

    def __iter__(self) -> Iterator[float]:
        return iter(self._entries)

    def __repr__(self) -> str:
        return repr(self.to_list())


class DenseMatrix:
    """An immutable finite row-major binary64 matrix with explicit shape."""

    def __init__(self, nrows: int, ncols: int, entries: Iterable[Any]) -> None:
        if isinstance(nrows, bool) or not isinstance(nrows, int) or nrows < 0:
            raise ValueError("matrix row count must be a nonnegative integer")
        if isinstance(ncols, bool) or not isinstance(ncols, int) or ncols < 0:
            raise ValueError("matrix column count must be a nonnegative integer")
        snapshot = tuple(
            _binary64(value, "matrix.entries[" + str(index) + "]")
            for index, value in enumerate(entries)
        )
        if len(snapshot) != nrows * ncols:
            raise ValueError("matrix entry count does not match its shape")
        self._nrows = nrows
        self._ncols = ncols
        self._entries = snapshot

    @classmethod
    def from_rows(
        cls,
        rows: Sequence[Sequence[Any]],
        *,
        ncols: int | None = None,
    ) -> DenseMatrix:
        """Snapshot rectangular rows, preserving an explicit empty width."""
        row_count = len(rows)
        if row_count == 0:
            column_count = 0 if ncols is None else ncols
        else:
            column_count = len(rows[0])
            if ncols is not None and ncols != column_count:
                raise ValueError("explicit column count disagrees with row data")
        entries: list[Any] = []
        for index, row in enumerate(rows):
            if len(row) != column_count:
                raise ValueError("matrix row " + str(index) + " has the wrong length")
            entries.extend(row)
        return cls(row_count, column_count, entries)

    @classmethod
    def zeros(cls, nrows: int, ncols: int) -> DenseMatrix:
        return cls(nrows, ncols, [0.0] * (nrows * ncols))

    @classmethod
    def identity(cls, size: int) -> DenseMatrix:
        entries = [0.0] * (size * size)
        for index in range(size):
            entries[index * size + index] = 1.0
        return cls(size, size, entries)

    @property
    def nrows(self) -> int:
        return self._nrows

    @property
    def ncols(self) -> int:
        return self._ncols

    @property
    def shape(self) -> tuple[int, int]:
        return self._nrows, self._ncols

    @property
    def entries(self) -> tuple[float, ...]:
        return self._entries

    def entry(self, row: int, column: int) -> float:
        if row < 0 or row >= self._nrows or column < 0 or column >= self._ncols:
            raise IndexError("matrix index out of range")
        return self._entries[row * self._ncols + column]

    def row(self, index: int) -> tuple[float, ...]:
        if index < 0 or index >= self._nrows:
            raise IndexError("matrix row index out of range")
        start = index * self._ncols
        return self._entries[start : start + self._ncols]

    def column(self, index: int) -> tuple[float, ...]:
        if index < 0 or index >= self._ncols:
            raise IndexError("matrix column index out of range")
        return tuple(self.entry(row, index) for row in range(self._nrows))

    def to_rows(self) -> list[list[float]]:
        return [list(self.row(row)) for row in range(self._nrows)]

    def transpose(self) -> DenseMatrix:
        return DenseMatrix(
            self._ncols,
            self._nrows,
            (
                self.entry(row, column)
                for column in range(self._ncols)
                for row in range(self._nrows)
            ),
        )

    @property
    def T(self) -> DenseMatrix:
        return self.transpose()

    def multiply(
        self,
        other: DenseMatrix,
        *,
        check: Callable[[], None] | None = None,
    ) -> DenseMatrix:
        if self._ncols != other._nrows:
            raise ValueError("matrix dimensions do not conform for multiplication")
        output: list[float] = []
        for row in range(self._nrows):
            if check is not None:
                check()
            for column in range(other._ncols):
                if check is not None:
                    check()
                output.append(
                    math.fsum(
                        self.entry(row, index) * other.entry(index, column)
                        for index in range(self._ncols)
                    )
                )
        return DenseMatrix(self._nrows, other._ncols, output)

    def multiply_vector(
        self,
        vector: DenseVector,
        *,
        check: Callable[[], None] | None = None,
    ) -> DenseVector:
        if self._ncols != vector.size:
            raise ValueError("matrix and vector dimensions do not conform")
        output: list[float] = []
        for row in range(self._nrows):
            if check is not None:
                check()
            output.append(
                math.fsum(
                    self.entry(row, column) * vector.entry(column)
                    for column in range(self._ncols)
                )
            )
        return DenseVector(output)

    def norm_one(self) -> float:
        answer = 0.0
        for column in range(self._ncols):
            answer = max(
                answer,
                stable_sum_nonnegative(
                    abs(self.entry(row, column)) for row in range(self._nrows)
                ),
            )
        return answer

    def norm_infinity(self) -> float:
        answer = 0.0
        for row in range(self._nrows):
            answer = max(
                answer, stable_sum_nonnegative(abs(value) for value in self.row(row))
            )
        return answer

    def norm_frobenius(self) -> float:
        return stable_norm_two(self._entries)

    def max_abs_entry(self) -> float:
        """Return the largest entry magnitude, or zero for an empty matrix."""
        return max((abs(value) for value in self._entries), default=0.0)

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": "dense_binary64_matrix",
            "shape": [self._nrows, self._ncols],
            "layout": "row_major",
            "entries": list(self._entries),
        }

    def __matmul__(self, other: DenseMatrix) -> DenseMatrix:
        return self.multiply(other)

    def __repr__(self) -> str:
        return repr(self.to_rows())


def as_matrix(value: DenseMatrix | Sequence[Sequence[Any]]) -> DenseMatrix:
    """Coerce nested rows to the immutable binary64 matrix contract."""
    if isinstance(value, DenseMatrix):
        return value
    return DenseMatrix.from_rows(value)


def as_vector(value: DenseVector | Sequence[Any]) -> DenseVector:
    """Coerce one sequence to the immutable binary64 vector contract."""
    if isinstance(value, DenseVector):
        return value
    return DenseVector(value)


def as_right_hand_side(
    value: DenseVector | DenseMatrix | Sequence[Any] | Sequence[Sequence[Any]],
    expected_rows: int | None = None,
) -> tuple[DenseMatrix, bool]:
    """Return a column-matrix right side and whether the input was a vector."""
    if isinstance(value, DenseVector):
        vector = value
        if expected_rows is not None and vector.size != expected_rows:
            raise ValueError("matrix and right side dimensions disagree")
        return DenseMatrix(vector.size, 1, vector.entries), True
    if isinstance(value, DenseMatrix):
        if expected_rows is not None and value.nrows != expected_rows:
            raise ValueError("matrix and right side dimensions disagree")
        return value, False
    snapshot = list(value)
    if len(snapshot) == 0:
        if expected_rows is not None and expected_rows != 0:
            raise ValueError("matrix and right side dimensions disagree")
        return DenseMatrix(0, 1, ()), True
    if isinstance(snapshot[0], (list, tuple)):
        matrix = DenseMatrix.from_rows(snapshot)  # type: ignore[arg-type]
        if expected_rows is not None and matrix.nrows != expected_rows:
            raise ValueError("matrix and right side dimensions disagree")
        return matrix, False
    vector = DenseVector(snapshot)
    if expected_rows is not None and vector.size != expected_rows:
        raise ValueError("matrix and right side dimensions disagree")
    return DenseMatrix(vector.size, 1, vector.entries), True


def restore_right_hand_side(matrix: DenseMatrix, was_vector: bool) -> Any:
    """Restore vector-versus-matrix shape after a solve."""
    if was_vector:
        return [matrix.entry(row, 0) for row in range(matrix.nrows)]
    return matrix.to_rows()

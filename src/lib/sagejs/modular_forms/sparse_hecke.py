"""Immutable exact sparse Hecke operators.

The authoritative representation is compressed sparse row storage. Dense
Sage.js matrices are bounded compatibility objects, never cached canonical
state. The class deliberately contains no graph-construction arithmetic so it
can also serve quaternionic and Hilbert finite Hecke sets.
"""

from __future__ import annotations

from typing import Any, Iterable, Iterator

import sagejs.runtime as runtime


def _global(name: str) -> Any:
    return runtime.reflect.get(runtime.global_object, name)


def _integer(value: Any, label: str) -> int:
    normalized = runtime.normalize_integer(value)
    if runtime.jstype(normalized) != "number" or not runtime.number.isSafeInteger(
        normalized
    ):
        raise TypeError(label + " must be an exact machine integer")
    return runtime.number(normalized)


def _nonnegative(value: Any, label: str) -> int:
    answer = _integer(value, label)
    if answer < 0:
        raise ValueError(label + " must be nonnegative")
    return answer


class SparseHeckeOperator:
    """An exact immutable CSR operator with bounded dense materialization."""

    def __init__(
        self,
        base_ring: Any,
        nrows: Any,
        ncols: Any,
        row_offsets: Iterable[Any],
        columns: Iterable[Any],
        values: Iterable[Any],
        *,
        index: Any = None,
        name: str | None = None,
        dense_entry_limit: Any = 1000000,
    ) -> None:
        rows = _nonnegative(nrows, "row count")
        cols = _nonnegative(ncols, "column count")
        offsets = tuple(_nonnegative(value, "row offset") for value in row_offsets)
        column_data = tuple(_nonnegative(value, "column index") for value in columns)
        value_data = tuple(_integer(value, "sparse value") for value in values)
        if len(offsets) != rows + 1:
            raise ValueError("CSR row offsets have the wrong length")
        if not offsets or offsets[0] != 0:
            raise ValueError("CSR row offsets must begin at zero")
        if offsets[-1] != len(column_data) or len(column_data) != len(value_data):
            raise ValueError("CSR arrays have inconsistent lengths")
        previous = 0
        for offset in offsets:
            if offset < previous or offset > len(column_data):
                raise ValueError("CSR row offsets must be nondecreasing")
            previous = offset
        row = 0
        while row < rows:
            previous_column = -1
            position = offsets[row]
            while position < offsets[row + 1]:
                column = column_data[position]
                if column >= cols:
                    raise ValueError("CSR column index is out of range")
                if column <= previous_column:
                    raise ValueError("CSR columns must be strictly increasing per row")
                if value_data[position] == 0:
                    raise ValueError("CSR storage must omit zero entries")
                previous_column = column
                position += 1
            row += 1
        limit = _nonnegative(dense_entry_limit, "dense entry limit")
        self._base_ring = base_ring
        self._nrows = rows
        self._ncols = cols
        self._row_offsets = offsets
        self._columns = column_data
        self._values = value_data
        self._index = index
        self._name = name if name is not None else "sparse Hecke operator"
        self._dense_entry_limit = limit

    def base_ring(self) -> Any:
        return self._base_ring

    def nrows(self) -> int:
        return self._nrows

    def ncols(self) -> int:
        return self._ncols

    def degree(self) -> int:
        if self._nrows != self._ncols:
            raise ValueError("a nonsquare operator has no degree")
        return self._nrows

    def hecke_index(self) -> Any:
        return self._index

    def is_sparse(self) -> bool:
        return True

    def nonzero_count(self) -> int:
        return len(self._columns)

    nnz = nonzero_count

    def row(self, row: Any) -> tuple[tuple[int, int], ...]:
        index = _nonnegative(row, "row index")
        if index >= self._nrows:
            raise IndexError("sparse operator row index is out of range")
        start = self._row_offsets[index]
        stop = self._row_offsets[index + 1]
        return tuple(
            (self._columns[position], self._values[position])
            for position in range(start, stop)
        )

    neighbors = row

    def rows(self) -> Iterator[tuple[tuple[int, int], ...]]:
        for index in range(self._nrows):
            yield self.row(index)

    def __getitem__(self, key: Any) -> Any:
        if not isinstance(key, tuple) or len(key) != 2:
            raise TypeError("sparse operator indices must be (row, column)")
        row = _nonnegative(key[0], "row index")
        column = _nonnegative(key[1], "column index")
        if row >= self._nrows or column >= self._ncols:
            raise IndexError("sparse operator index is out of range")
        position = self._row_offsets[row]
        stop = self._row_offsets[row + 1]
        while position < stop:
            current = self._columns[position]
            if current == column:
                return self._base_ring(self._values[position])
            if current > column:
                break
            position += 1
        return self._base_ring(0)

    def _entries(self, vector: Any) -> list[Any]:
        entries = list(vector)
        if len(entries) != self._ncols:
            raise ValueError("vector length does not match the sparse operator")
        return entries

    def apply(self, vector: Any) -> Any:
        entries = self._entries(vector)
        answer = []
        for row in range(self._nrows):
            total = self._base_ring(0)
            position = self._row_offsets[row]
            stop = self._row_offsets[row + 1]
            while position < stop:
                total += (
                    self._base_ring(self._values[position])
                    * entries[self._columns[position]]
                )
                position += 1
            answer.append(total)
        return _global("vector")(self._base_ring, answer)

    def transpose_apply(self, vector: Any) -> Any:
        entries = list(vector)
        if len(entries) != self._nrows:
            raise ValueError("vector length does not match the sparse operator")
        answer = [self._base_ring(0) for _ in range(self._ncols)]
        for row in range(self._nrows):
            position = self._row_offsets[row]
            stop = self._row_offsets[row + 1]
            while position < stop:
                column = self._columns[position]
                answer[column] += self._base_ring(self._values[position]) * entries[row]
                position += 1
        return _global("vector")(self._base_ring, answer)

    def apply_mod(self, vector: Any, modulus: Any) -> Any:
        field = _global("GF")(modulus)
        entries = [field(value) for value in self._entries(vector)]
        answer = []
        for row in range(self._nrows):
            total = field(0)
            position = self._row_offsets[row]
            stop = self._row_offsets[row + 1]
            while position < stop:
                total += (
                    field(self._values[position]) * entries[self._columns[position]]
                )
                position += 1
            answer.append(total)
        return _global("vector")(field, answer)

    def apply_block(self, vectors: Iterable[Any], modulus: Any = None) -> list[Any]:
        if modulus is None:
            return [self.apply(vector) for vector in vectors]
        return [self.apply_mod(vector, modulus) for vector in vectors]

    def row_sums(self) -> tuple[int, ...]:
        answer = []
        for row in range(self._nrows):
            answer.append(
                sum(
                    self._values[position]
                    for position in range(
                        self._row_offsets[row], self._row_offsets[row + 1]
                    )
                )
            )
        return tuple(answer)

    def _product_row(self, other: SparseHeckeOperator, row: int) -> dict[int, int]:
        if self._ncols != other._nrows:
            raise ValueError("sparse operator dimensions do not compose")
        answer: dict[int, int] = {}
        for middle, left_value in self.row(row):
            for column, right_value in other.row(middle):
                value = answer.get(column, 0) + left_value * right_value
                if value == 0:
                    answer.pop(column, None)
                else:
                    answer[column] = value
        return answer

    def commutes_with(self, other: SparseHeckeOperator) -> bool:
        if (
            self._nrows != self._ncols
            or other._nrows != other._ncols
            or self._nrows != other._nrows
        ):
            return False
        for row in range(self._nrows):
            if self._product_row(other, row) != other._product_row(self, row):
                return False
        return True

    def matrix(self, max_entries: Any = None, force: bool = False) -> Any:
        limit = (
            self._dense_entry_limit
            if max_entries is None
            else _nonnegative(max_entries, "dense entry limit")
        )
        entries = self._nrows * self._ncols
        if not force and entries > limit:
            raise MemoryError(
                "dense materialization needs "
                + str(entries)
                + " entries, above the explicit limit "
                + str(limit)
            )
        rows = []
        for row in range(self._nrows):
            values = [self._base_ring(0) for _ in range(self._ncols)]
            position = self._row_offsets[row]
            stop = self._row_offsets[row + 1]
            while position < stop:
                values[self._columns[position]] = self._base_ring(
                    self._values[position]
                )
                position += 1
            rows.append(values)
        return _global("matrix")(self._base_ring, rows)

    dense_matrix = matrix

    def structural_data(self) -> dict[str, Any]:
        return {
            "shape": (self._nrows, self._ncols),
            "row_offsets": self._row_offsets,
            "columns": self._columns,
            "values": self._values,
            "hecke_index": self._index,
        }

    def __mul__(self, vector: Any) -> Any:
        return self.apply(vector)

    def _sage_binop_(
        self,
        operator: str,
        other: Any,
        reflected: bool,
    ) -> Any:
        if operator == "mul" and not reflected:
            return self.apply(other)
        raise TypeError(
            "operation " + operator + " is not defined for sparse Hecke operators"
        )

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, SparseHeckeOperator)
            and self._base_ring is other._base_ring
            and self.structural_data() == other.structural_data()
        )

    def __repr__(self) -> str:
        return (
            self._name
            + " of degree "
            + str(self._nrows)
            + " with "
            + str(self.nonzero_count())
            + " nonzero entries"
        )

    __str__ = __repr__
    toString = __repr__


__all__ = ["SparseHeckeOperator"]

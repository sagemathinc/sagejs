"""Lazy public execution of matrix selection and mutation plans.

The bootstrap `Matrix` type delegates here after first use.  This module owns
the representation-aware orchestration, while `matrix_selection` remains the
ordinary Python semantic oracle for validation, staging, and ordering.
"""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime
from sagejs.ffi import flint
from sagejs.linear_algebra import matrix_selection as plans


def row_indices(rows: Any, row_count: int) -> tuple[int, ...]:
    """Return one checked row-index snapshot."""
    return plans.row_indices(rows, row_count)


def column_indices(columns: Any, column_count: int) -> tuple[int, ...]:
    """Return one checked column-index snapshot."""
    return plans.column_indices(columns, column_count)


def _close_matrix_resource(matrix: Any) -> None:
    """Deterministically release one temporary canonical resource."""
    if matrix._has_fmpz_matrix_resource():
        matrix._integer_resource().close()
    elif matrix._has_fmpq_matrix_resource():
        matrix._rational_resource().close()
    elif matrix._has_m4ri_matrix_resource():
        matrix._m4ri_resource().close()


def set_row(target: Any, row: int, values: Any) -> None:
    """Stage and commit one complete row."""
    base = target.base_ring()

    def residue(value: Any) -> int:
        return int(base(value).lift())

    coerce = residue if target._has_packed_prime_storage() else base
    start, stride, entries = plans.prepare_row_update(
        target.nrows(), target.ncols(), int(row), values, coerce
    )
    target._check_batch_mutability()
    if target._has_packed_prime_storage():
        target._set_dense_prime_sequence(entries, start, stride, "set_row")
        return
    if target._has_fmpz_matrix_resource() or target._has_fmpq_matrix_resource():
        block = target._parent.matrix_space(1, target.ncols())(entries)
        try:
            target.set_block(int(row), 0, block)
        finally:
            _close_matrix_resource(block)
        return
    raise NotImplementedError(
        "set_row requires generated exact or packed GF(p) storage"
    )


def set_column(target: Any, column: int, values: Any) -> None:
    """Stage and commit one complete column."""
    base = target.base_ring()

    def residue(value: Any) -> int:
        return int(base(value).lift())

    coerce = residue if target._has_packed_prime_storage() else base
    start, stride, entries = plans.prepare_column_update(
        target.nrows(), target.ncols(), int(column), values, coerce
    )
    target._check_batch_mutability()
    if target._has_packed_prime_storage():
        target._set_dense_prime_sequence(entries, start, stride, "set_column")
        return
    if target._has_fmpz_matrix_resource() or target._has_fmpq_matrix_resource():
        block = target._parent.matrix_space(target.nrows(), 1)(entries)
        try:
            target.set_block(
                0,
                int(column),
                block,
            )
        finally:
            _close_matrix_resource(block)
        return
    raise NotImplementedError(
        "set_column requires generated exact or packed GF(p) storage"
    )


def matrix_from_rows_and_columns(target: Any, rows: Any, columns: Any) -> Any:
    """Execute ordered row-and-column selection."""
    selected_rows, selected_columns = plans.selection_plan(
        target.nrows(),
        target.ncols(),
        (int(index) for index in rows),
        (int(index) for index in columns),
    )
    selected = target.matrix_from_rows(selected_rows)
    try:
        return selected.matrix_from_columns(selected_columns)
    finally:
        _close_matrix_resource(selected)


def submatrix(
    target: Any,
    row: int = 0,
    column: int = 0,
    row_count: int = -1,
    column_count: int = -1,
) -> Any:
    """Execute a half-open rectangular selection."""
    selected_rows, selected_columns = plans.submatrix_plan(
        target.nrows(),
        target.ncols(),
        int(row),
        int(column),
        None if row_count == -1 else int(row_count),
        None if column_count == -1 else int(column_count),
    )
    if selected_rows and selected_columns:
        row_start = selected_rows[0]
        row_stop = selected_rows[-1] + 1
        column_start = selected_columns[0]
        column_stop = selected_columns[-1] + 1
        parent = target._parent.matrix_space(len(selected_rows), len(selected_columns))
        if target._has_fmpz_matrix_resource():
            resource = flint.fmpz_matrix_submatrix(
                target._integer_resource(),
                row_start,
                row_stop,
                column_start,
                column_stop,
            )
            return parent._from_fmpz_matrix_resource(resource)
        if target._has_fmpq_matrix_resource():
            resource = flint.fmpq_matrix_submatrix(
                target._rational_resource(),
                row_start,
                row_stop,
                column_start,
                column_stop,
            )
            return parent._from_fmpq_matrix_resource(resource)
    return matrix_from_rows_and_columns(target, selected_rows, selected_columns)


def delete_rows(target: Any, rows: Any, check: bool = True) -> Any:
    """Return a copy with the specified rows removed."""
    retained = plans.retained_indices(
        target.nrows(),
        (int(index) for index in rows),
        "row",
        bool(check),
    )
    return target.matrix_from_rows(retained)


def delete_columns(target: Any, columns: Any, check: bool = True) -> Any:
    """Return a copy with the specified columns removed."""
    retained = plans.retained_indices(
        target.ncols(),
        (int(index) for index in columns),
        "column",
        bool(check),
    )
    return target.matrix_from_columns(retained)


def swap_rows(target: Any, first: int, second: int) -> None:
    """Swap two rows in canonical storage without copying the matrix."""
    target._check_batch_mutability()
    plans.prepare_row_swap(target.nrows(), target.ncols(), int(first), int(second))
    if first == second:
        target._clear_cache()
        return
    if target._has_fmpz_matrix_resource():
        flint.fmpz_matrix_swap_rows(target._integer_resource(), int(first), int(second))
        target._integer_storage_cache.entries = runtime.undefined
        target._integer_entries_cache = runtime.undefined
        target._clear_cache()
        return
    if target._has_fmpq_matrix_resource():
        flint.fmpq_matrix_swap_rows(
            target._rational_resource(), int(first), int(second)
        )
        target._rational_storage_cache.numerators = runtime.undefined
        target._rational_storage_cache.denominators = runtime.undefined
        target._clear_cache()
        return
    if target._has_packed_prime_storage():
        target._swap_dense_prime_axis(int(first), int(second), False)
        return
    raise NotImplementedError(
        "swap_rows requires generated exact or packed GF(p) storage"
    )


def swap_columns(target: Any, first: int, second: int) -> None:
    """Swap two columns in canonical storage without copying the matrix."""
    target._check_batch_mutability()
    plans.prepare_column_swap(target.nrows(), target.ncols(), int(first), int(second))
    if first == second:
        target._clear_cache()
        return
    if target._has_fmpz_matrix_resource():
        flint.fmpz_matrix_swap_columns(
            target._integer_resource(), int(first), int(second)
        )
        target._integer_storage_cache.entries = runtime.undefined
        target._integer_entries_cache = runtime.undefined
        target._clear_cache()
        return
    if target._has_fmpq_matrix_resource():
        flint.fmpq_matrix_swap_columns(
            target._rational_resource(), int(first), int(second)
        )
        target._rational_storage_cache.numerators = runtime.undefined
        target._rational_storage_cache.denominators = runtime.undefined
        target._clear_cache()
        return
    if target._has_packed_prime_storage():
        target._swap_dense_prime_axis(int(first), int(second), True)
        return
    raise NotImplementedError(
        "swap_columns requires generated exact or packed GF(p) storage"
    )


def with_swapped_rows(target: Any, first: int, second: int) -> Any:
    """Return a mutable copy with two rows swapped."""
    target._check_batch_mutability()
    answer = target.__copy__()
    swap_rows(answer, first, second)
    return answer


def with_swapped_columns(target: Any, first: int, second: int) -> Any:
    """Return a mutable copy with two columns swapped."""
    target._check_batch_mutability()
    answer = target.__copy__()
    swap_columns(answer, first, second)
    return answer


def insert_row(target: Any, index: int, values: Any) -> Any:
    """Insert one row into a dense integer matrix."""
    if not target._has_fmpz_matrix_resource():
        raise NotImplementedError("insert_row is available only for dense ZZ matrices")
    insertion_index, entries = plans.prepare_row_insertion(
        target.nrows(),
        target.ncols(),
        int(index),
        values,
        target.base_ring(),
    )
    inserted = target._parent.matrix_space(1, target.ncols())(entries)
    inserted_resource = inserted._integer_resource()
    temporary: list[Any] = []
    try:
        if insertion_index == 0:
            result = flint.fmpz_matrix_stack(
                inserted_resource, target._integer_resource()
            )
        elif insertion_index == target.nrows():
            result = flint.fmpz_matrix_stack(
                target._integer_resource(), inserted_resource
            )
        else:
            top = flint.fmpz_matrix_submatrix(
                target._integer_resource(),
                0,
                insertion_index,
                0,
                target.ncols(),
            )
            temporary.append(top)
            bottom = flint.fmpz_matrix_submatrix(
                target._integer_resource(),
                insertion_index,
                target.nrows(),
                0,
                target.ncols(),
            )
            temporary.append(bottom)
            with_inserted = flint.fmpz_matrix_stack(top, inserted_resource)
            temporary.append(with_inserted)
            result = flint.fmpz_matrix_stack(with_inserted, bottom)
        return target._parent.matrix_space(
            target.nrows() + 1, target.ncols()
        )._from_fmpz_matrix_resource(result)
    finally:
        for resource in temporary:
            resource.close()
        inserted_resource.close()


__all__ = [
    "column_indices",
    "delete_columns",
    "delete_rows",
    "insert_row",
    "matrix_from_rows_and_columns",
    "row_indices",
    "set_column",
    "set_row",
    "submatrix",
    "swap_columns",
    "swap_rows",
    "with_swapped_columns",
    "with_swapped_rows",
]

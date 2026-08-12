"""Source-transparent kernels over borrowed generated M4RI matrices."""

from __future__ import annotations

from sagejs.ffi.m4ri import (
    M4riMatrix,
    matrix_entry_code,
    matrix_ncols,
    matrix_nrows,
    matrix_set_entry,
)
from sagejs.native import Int64Buffer, native, uint64


@native
def m4ri_dense_matrix_entry(
    source: M4riMatrix,
    row: uint64,
    column: uint64,
) -> int:
    """Read one host-normalized entry through an isolated resource call."""
    return matrix_entry_code(source, row, column)


@native
def m4ri_dense_matrix_set_entry(
    target: M4riMatrix,
    row: uint64,
    column: uint64,
    value: uint64,
) -> bool:
    """Mutate one host-normalized entry through an isolated resource call."""
    if value > 1:
        return False
    return matrix_set_entry(target, row, column, value)


@native
def m4ri_dense_matrix_set_sequence(
    target: M4riMatrix,
    values: Int64Buffer,
    count: uint64,
    start_row: uint64,
    start_column: uint64,
    row_stride: uint64,
    column_stride: uint64,
) -> bool:
    """Transactionally replace one affine row-major entry sequence."""
    rows = matrix_nrows(target)
    columns = matrix_ncols(target)
    if len(values) != count:
        return False
    if row_stride + column_stride != 1:
        return False
    if count > 0:
        if start_row >= rows or start_column >= columns:
            return False
        if row_stride > 0 and count - 1 > (rows - 1 - start_row) // row_stride:
            return False
        if (
            column_stride > 0
            and count - 1 > (columns - 1 - start_column) // column_stride
        ):
            return False
    for index in range(count):
        if values[index] < 0 or values[index] > 1:
            return False
    for index in range(count):
        row = start_row + index * row_stride
        column = start_column + index * column_stride
        zero = row_stride - row_stride
        one = row_stride + column_stride
        if values[index] == 0:
            if not matrix_set_entry(target, row, column, zero):
                return False
        else:
            if not matrix_set_entry(target, row, column, one):
                return False
    return True


@native
def m4ri_dense_matrix_set_block(
    target: M4riMatrix,
    target_rows: uint64,
    target_columns: uint64,
    target_row: uint64,
    target_column: uint64,
    block: M4riMatrix,
    block_rows: uint64,
    block_columns: uint64,
) -> bool:
    """Copy a checked borrowed M4RI resource directly into `target`."""
    if target_row > target_rows or target_column > target_columns:
        return False
    if block_rows > target_rows - target_row:
        return False
    if block_columns > target_columns - target_column:
        return False
    for row in range(block_rows):
        for column in range(block_columns):
            value = matrix_entry_code(block, row, column)
            if value > 1:
                return False
    for row in range(block_rows):
        for column in range(block_columns):
            value = matrix_entry_code(block, row, column)
            if not matrix_set_entry(
                target,
                target_row + row,
                target_column + column,
                value,
            ):
                return False
    return True


@native
def m4ri_dense_matrix_pivots(
    output: Int64Buffer,
    source: M4riMatrix,
) -> int:
    """Write pivot columns without exporting the borrowed M4RI matrix."""
    rows = matrix_nrows(source)
    columns = matrix_ncols(source)
    capacity = rows
    if columns < capacity:
        capacity = columns
    if len(output) < capacity:
        return 0
    pivot_count = 0
    search_start = 0
    for row in range(rows):
        pivot = columns
        for column in range(columns):
            if (
                column >= search_start
                and pivot == columns
                and matrix_entry_code(source, row, column) != 0
            ):
                pivot = column
        if pivot != columns:
            output[pivot_count] = pivot
            pivot_count += 1
            search_start = pivot + 1
    return pivot_count


@native
def m4ri_dense_matrix_nonzero_count(source: M4riMatrix) -> int:
    """Count nonzero entries without crossing the host inside the loop."""
    count = 0
    rows = matrix_nrows(source)
    columns = matrix_ncols(source)
    for row in range(rows):
        for column in range(columns):
            if matrix_entry_code(source, row, column) != 0:
                count += 1
    return count


@native
def m4ri_dense_matrix_nonzero_rows(source: M4riMatrix) -> int:
    """Count nonzero rows of a matrix already in row-echelon form."""
    count = 0
    rows = matrix_nrows(source)
    columns = matrix_ncols(source)
    for row in range(rows):
        nonzero = False
        for column in range(columns):
            if matrix_entry_code(source, row, column) != 0:
                nonzero = True
        if nonzero:
            count += 1
    return count


@native
def m4ri_dense_matrix_is_one(source: M4riMatrix) -> bool:
    """Return whether `source` is the identity matrix."""
    rows = matrix_nrows(source)
    columns = matrix_ncols(source)
    if rows != columns:
        return False
    for row in range(rows):
        for column in range(columns):
            expected = 0
            if row == column:
                expected = 1
            if matrix_entry_code(source, row, column) != expected:
                return False
    return True

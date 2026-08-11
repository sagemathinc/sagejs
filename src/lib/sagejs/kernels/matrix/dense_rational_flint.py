"""Declared FLINT algorithms over compiler-owned rational matrix storage."""

from __future__ import annotations

from sagejs.ffi.flint import (
    FlintByteRegion,
    FmpqMatrix,
    flint_byte_region_get,
    flint_byte_region_length,
    fmpq_mat_charpoly,
    fmpq_mat_det,
    fmpq_mat_inv,
    fmpq_mat_mul,
    fmpq_mat_rank,
    fmpq_mat_rref,
    fmpq_mat_solve,
    fmpq_matrix_entry_is_zero,
    fmpq_matrix_set_entry,
)
from sagejs.native import IntegerBuffer, native, uint64


@native
def flint_dense_rational_matrix_import(
    matrix: FmpqMatrix,
    numerators: IntegerBuffer,
    denominators: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> bool:
    """Populate a borrowed matrix resource without crossing the host per entry."""
    for row in range(rows):
        for column in range(columns):
            index = row * columns + column
            valid = fmpq_matrix_set_entry(
                matrix,
                row,
                column,
                numerators[index],
                denominators[index],
            )
            if not valid:
                return False
    return True


@native
def flint_dense_rational_matrix_nonzero_count(
    matrix: FmpqMatrix,
    rows: uint64,
    columns: uint64,
) -> int:
    """Safely borrow and traverse a generated FLINT matrix resource."""
    count = 0
    for row in range(rows):
        for column in range(columns):
            if not fmpq_matrix_entry_is_zero(matrix, row, column):
                count = count + 1
    return count


@native
def flint_byte_region_copy(
    region: FlintByteRegion,
    output: IntegerBuffer,
    length: uint64,
) -> bool:
    """Copy an owned variable-size C result through a checked packed boundary."""
    if flint_byte_region_length(region) != length:
        return False
    for index in range(length):
        output[index] = flint_byte_region_get(region, index)
    return True


@native
def flint_dense_rational_matrix_mul(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    left_numerators: IntegerBuffer,
    left_denominators: IntegerBuffer,
    right_numerators: IntegerBuffer,
    right_denominators: IntegerBuffer,
    left_rows: uint64,
    inner: uint64,
    right_columns: uint64,
) -> bool:
    return fmpq_mat_mul(
        output_numerators,
        output_denominators,
        left_numerators,
        left_denominators,
        right_numerators,
        right_denominators,
        left_rows,
        inner,
        right_columns,
    )


@native
def flint_dense_rational_matrix_rank(
    rank: IntegerBuffer,
    numerators: IntegerBuffer,
    denominators: IntegerBuffer,
    rows: uint64,
    columns: uint64,
    one: uint64,
) -> bool:
    return fmpq_mat_rank(rank, numerators, denominators, rows, columns, one)


@native
def flint_dense_rational_matrix_rref(
    rank: IntegerBuffer,
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
    rows: uint64,
    columns: uint64,
    one: uint64,
) -> bool:
    return fmpq_mat_rref(
        rank,
        output_numerators,
        output_denominators,
        source_numerators,
        source_denominators,
        rows,
        columns,
        one,
    )


@native
def flint_dense_rational_matrix_inverse(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
    size: uint64,
) -> bool:
    return fmpq_mat_inv(
        output_numerators,
        output_denominators,
        source_numerators,
        source_denominators,
        size,
    )


@native
def flint_dense_rational_matrix_solve(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    left_numerators: IntegerBuffer,
    left_denominators: IntegerBuffer,
    right_numerators: IntegerBuffer,
    right_denominators: IntegerBuffer,
    size: uint64,
    right_columns: uint64,
) -> bool:
    return fmpq_mat_solve(
        output_numerators,
        output_denominators,
        left_numerators,
        left_denominators,
        right_numerators,
        right_denominators,
        size,
        right_columns,
    )


@native
def flint_dense_rational_matrix_determinant(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
    size: uint64,
    one: uint64,
) -> bool:
    return fmpq_mat_det(
        output_numerators,
        output_denominators,
        source_numerators,
        source_denominators,
        size,
        one,
    )


@native
def flint_dense_rational_matrix_charpoly(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
    coefficient_count: uint64,
    size: uint64,
    one: uint64,
) -> bool:
    return fmpq_mat_charpoly(
        output_numerators,
        output_denominators,
        source_numerators,
        source_denominators,
        coefficient_count,
        size,
        one,
    )

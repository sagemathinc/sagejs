"""Declared FLINT algorithms over compiler-owned rational matrix storage."""

from __future__ import annotations

from sagejs.ffi.flint import (
    fmpq_mat_charpoly,
    fmpq_mat_det,
    fmpq_mat_inv,
    fmpq_mat_mul,
    fmpq_mat_rank,
    fmpq_mat_rref,
    fmpq_mat_solve,
)
from sagejs.native import IntegerBuffer, native, uint64


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
    return fmpq_mat_rank(
        rank, numerators, denominators, rows, columns, one)


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

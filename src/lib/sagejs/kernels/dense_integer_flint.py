"""Declared-FLINT algorithms for packed dense integer matrices."""

from __future__ import annotations

from sagejs.ffi.flint import (
    fmpz_mat_charpoly,
    fmpz_mat_det,
    fmpz_mat_hnf,
    fmpz_mat_hnf_transform,
    fmpz_mat_mul,
    fmpz_mat_rank,
    fmpz_mat_right_kernel,
    fmpz_mat_snf_transform,
)
from sagejs.native import IntegerBuffer, native, uint64


@native
def flint_dense_integer_mul(
    output: IntegerBuffer,
    left: IntegerBuffer,
    right: IntegerBuffer,
    left_rows: uint64,
    inner: uint64,
    right_columns: uint64,
) -> bool:
    return fmpz_mat_mul(
        output, left, right, left_rows, inner, right_columns,
    )


@native
def flint_dense_integer_determinant(
    output: IntegerBuffer,
    source: IntegerBuffer,
    size: uint64,
    one: uint64,
) -> bool:
    return fmpz_mat_det(output, source, size, one)


@native
def flint_dense_integer_charpoly(
    output: IntegerBuffer,
    source: IntegerBuffer,
    output_length: uint64,
    size: uint64,
    one: uint64,
) -> bool:
    return fmpz_mat_charpoly(output, source, output_length, size, one)


@native
def flint_dense_integer_rank(
    source: IntegerBuffer, rows: uint64, columns: uint64,
) -> uint64:
    return fmpz_mat_rank(source, rows, columns)


@native
def flint_dense_integer_hnf(
    output: IntegerBuffer,
    source: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> bool:
    return fmpz_mat_hnf(output, source, rows, columns)


@native
def flint_dense_integer_hnf_transform(
    output: IntegerBuffer,
    transform: IntegerBuffer,
    source: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> bool:
    return fmpz_mat_hnf_transform(
        output, transform, source, rows, columns,
    )


@native
def flint_dense_integer_snf_transform(
    output: IntegerBuffer,
    left_transform: IntegerBuffer,
    right_transform: IntegerBuffer,
    source: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> bool:
    return fmpz_mat_snf_transform(
        output,
        left_transform,
        right_transform,
        source,
        rows,
        columns,
    )


@native
def flint_dense_integer_right_kernel(
    output: IntegerBuffer,
    source: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> uint64:
    return fmpz_mat_right_kernel(output, source, rows, columns)


__all__ = [
    'flint_dense_integer_charpoly',
    'flint_dense_integer_determinant',
    'flint_dense_integer_hnf',
    'flint_dense_integer_hnf_transform',
    'flint_dense_integer_mul',
    'flint_dense_integer_rank',
    'flint_dense_integer_right_kernel',
    'flint_dense_integer_snf_transform',
]

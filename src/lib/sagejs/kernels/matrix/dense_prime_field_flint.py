"""Declared-FLINT crossover kernels for packed dense prime matrices.

These tiny typed functions share the exact public buffers used by
``dense_prime``.  Their bodies name explicit generated FFI declarations, so
the compiler emits FLINT calls inside the isolated core without an N-API or
JavaScript callback.  The ordinary path calls the generated safe wrappers.
"""

# Loading sagejs.native first avoids a lazy-module import cycle in Sage.js.
# ruff: noqa: I001

from __future__ import annotations

from sagejs.native import UInt64Buffer, native, uint64
from sagejs.ffi.flint import (
    nmod_mat_charpoly,
    nmod_mat_det,
    nmod_mat_inv,
    nmod_mat_minpoly,
    nmod_mat_mul,
    nmod_mat_rank,
    nmod_mat_right_kernel,
    nmod_mat_rref,
    nmod_mat_solve,
)


@native
def flint_dense_prime_field_matrix_determinant(
    source: UInt64Buffer,
    size: uint64,
    modulus: uint64,
) -> uint64:
    return nmod_mat_det(source, size, modulus)


@native
def flint_dense_prime_field_matrix_charpoly(
    output: UInt64Buffer,
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    size: uint64,
    modulus: uint64,
) -> bool:
    return nmod_mat_charpoly(
        output,
        source,
        output_length,
        source_length,
        size,
        modulus,
    )


@native
def flint_dense_prime_field_matrix_minpoly(
    output: UInt64Buffer,
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    size: uint64,
    modulus: uint64,
) -> bool:
    return nmod_mat_minpoly(
        output,
        source,
        output_length,
        source_length,
        size,
        modulus,
    )


@native
def flint_dense_prime_field_matrix_mul(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    left_rows: uint64,
    inner: uint64,
    right_columns: uint64,
    modulus: uint64,
) -> bool:
    return nmod_mat_mul(
        output,
        left,
        right,
        left_rows,
        inner,
        right_columns,
        modulus,
    )


@native
def flint_dense_prime_field_matrix_inverse(
    output: UInt64Buffer,
    source: UInt64Buffer,
    size: uint64,
    modulus: uint64,
) -> bool:
    return nmod_mat_inv(output, source, size, modulus)


@native
def flint_dense_prime_field_matrix_rank(
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> uint64:
    return nmod_mat_rank(source, rows, columns, modulus)


@native
def flint_dense_prime_field_matrix_rref(
    output: UInt64Buffer,
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> uint64:
    return nmod_mat_rref(output, source, rows, columns, modulus)


@native
def flint_dense_prime_field_matrix_right_kernel(
    output: UInt64Buffer,
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> uint64:
    return nmod_mat_right_kernel(
        output, source, rows, columns, modulus)


@native
def flint_dense_prime_field_matrix_solve(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    size: uint64,
    right_columns: uint64,
    modulus: uint64,
) -> bool:
    return nmod_mat_solve(
        output,
        left,
        right,
        size,
        right_columns,
        modulus,
    )


__all__ = [
    'flint_dense_prime_field_matrix_charpoly',
    'flint_dense_prime_field_matrix_determinant',
    'flint_dense_prime_field_matrix_inverse',
    'flint_dense_prime_field_matrix_minpoly',
    'flint_dense_prime_field_matrix_mul',
    'flint_dense_prime_field_matrix_rank',
    'flint_dense_prime_field_matrix_rref',
    'flint_dense_prime_field_matrix_right_kernel',
    'flint_dense_prime_field_matrix_solve',
]

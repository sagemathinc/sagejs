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
    nmod_mat_inv,
    nmod_mat_mul,
    nmod_mat_rank,
    nmod_mat_right_kernel,
    nmod_mat_rref,
    nmod_mat_solve,
)


@native
def flint_dense_prime_mul(
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
def flint_dense_prime_inverse(
    output: UInt64Buffer,
    source: UInt64Buffer,
    size: uint64,
    modulus: uint64,
) -> bool:
    return nmod_mat_inv(output, source, size, modulus)


@native
def flint_dense_prime_rank(
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> uint64:
    return nmod_mat_rank(source, rows, columns, modulus)


@native
def flint_dense_prime_rref(
    output: UInt64Buffer,
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> uint64:
    return nmod_mat_rref(output, source, rows, columns, modulus)


@native
def flint_dense_prime_right_kernel(
    output: UInt64Buffer,
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> uint64:
    return nmod_mat_right_kernel(
        output, source, rows, columns, modulus)


@native
def flint_dense_prime_solve(
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
    'flint_dense_prime_inverse',
    'flint_dense_prime_mul',
    'flint_dense_prime_rank',
    'flint_dense_prime_rref',
    'flint_dense_prime_right_kernel',
    'flint_dense_prime_solve',
]

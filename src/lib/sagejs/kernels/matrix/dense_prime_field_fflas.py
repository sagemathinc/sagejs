"""Declared-FFLAS accelerators for packed dense small-prime matrices.

The public matrix remains a canonical compiler-owned `UInt64Buffer`. These
typed wrappers cross the generated FFI boundary once, where FFLAS/FFPACK uses
its optimized floating-point modular algorithms without exposing a C++ object
or pointer to Python or JavaScript.
"""

# Loading sagejs.native first avoids a lazy-module import cycle in Sage.js.
# ruff: noqa: I001

from __future__ import annotations

from sagejs.native import UInt64Buffer, native, uint64
from sagejs.ffi.fflas import (
    modular_double_available,
    modular_double_mul,
    modular_double_rank,
    modular_double_rref,
    modular_double_right_nullspace,
    modular_float_available,
    modular_float_mul,
    modular_float_rank,
    modular_float_rref,
    modular_float_right_nullspace,
)


@native
def fflas_dense_prime_field_available() -> bool:
    """Return whether this host provides the FFLAS packed-prime backend."""
    return modular_float_available() and modular_double_available()


@native
def fflas_dense_prime_field_matrix_mul(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    left_rows: uint64,
    inner: uint64,
    right_columns: uint64,
    modulus: uint64,
) -> bool:
    if modulus < 256:
        return modular_float_mul(
            output,
            left,
            right,
            left_rows * right_columns,
            left_rows * inner,
            inner * right_columns,
            left_rows,
            inner,
            right_columns,
            modulus,
        )
    return modular_double_mul(
        output,
        left,
        right,
        left_rows * right_columns,
        left_rows * inner,
        inner * right_columns,
        left_rows,
        inner,
        right_columns,
        modulus,
    )


@native
def fflas_dense_prime_field_matrix_rref(
    output: UInt64Buffer,
    rank_output: UInt64Buffer,
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> bool:
    rank_length: uint64 = 1
    if modulus < 256:
        return modular_float_rref(
            output,
            rank_output,
            source,
            rows * columns,
            rank_length,
            rows * columns,
            rows,
            columns,
            modulus,
        )
    return modular_double_rref(
        output,
        rank_output,
        source,
        rows * columns,
        rank_length,
        rows * columns,
        rows,
        columns,
        modulus,
    )


@native
def fflas_dense_prime_field_matrix_rank(
    rank_output: UInt64Buffer,
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> bool:
    """Compute rank directly with FFPACK's mutable packed-matrix primitive."""
    rank_length: uint64 = 1
    if modulus < 256:
        return modular_float_rank(
            rank_output,
            source,
            rank_length,
            rows * columns,
            rows,
            columns,
            modulus,
        )
    return modular_double_rank(
        rank_output,
        source,
        rank_length,
        rows * columns,
        rows,
        columns,
        modulus,
    )


@native
def fflas_dense_prime_field_matrix_right_nullspace(
    output: UInt64Buffer,
    nullity_output: UInt64Buffer,
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> bool:
    """Compute the canonical row basis of the right nullspace with FFPACK."""
    nullity_length: uint64 = 1
    if modulus < 256:
        return modular_float_right_nullspace(
            output,
            nullity_output,
            source,
            columns * columns,
            nullity_length,
            rows * columns,
            rows,
            columns,
            modulus,
        )
    return modular_double_right_nullspace(
        output,
        nullity_output,
        source,
        columns * columns,
        nullity_length,
        rows * columns,
        rows,
        columns,
        modulus,
    )


__all__ = [
    "fflas_dense_prime_field_available",
    "fflas_dense_prime_field_matrix_mul",
    "fflas_dense_prime_field_matrix_rank",
    "fflas_dense_prime_field_matrix_rref",
    "fflas_dense_prime_field_matrix_right_nullspace",
]

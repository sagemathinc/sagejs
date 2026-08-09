"""Generated safe FFI surface for flint; do not edit by hand."""

from __future__ import annotations

import sagejs.runtime as _runtime
from sagejs.native import UInt64Buffer

__sagejs_ffi_declaration__ = "flint@faa556e5c01d2a259d4c7cc40e3ae46ff0bd98b38a4eeff671abd52b2a469706"


def n_is_prime(value: int) -> bool:
    """Call declared flint:n_is_prime."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":n_is_prime",
        "@sagemath/sagejs-flint",
        "wordIsPrime",
        [value],
        ["uint64"],
        "bool",
        "none",
        None,
        None,
    )


def fmpz_gcd(left: int, right: int) -> int:
    """Call declared flint:fmpz_gcd."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_gcd",
        "@sagemath/sagejs-flint",
        "gcd",
        [left, right],
        ["Integer", "Integer"],
        "Integer",
        "none",
        None,
        None,
    )


def nmod_mat_rank(entries: UInt64Buffer, rows: int, columns: int, modulus: int) -> int:
    """Call declared flint:nmod_mat_rank."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_rank",
        "@sagemath/sagejs-flint",
        "ffiNmodMatRank",
        [entries, rows, columns, modulus],
        ["UInt64Buffer", "uint64", "uint64", "uint64"],
        "uint64",
        "none",
        None,
        None,
    )


def nmod_mat_inv(output: UInt64Buffer, source: UInt64Buffer, size: int, modulus: int) -> bool:
    """Call declared flint:nmod_mat_inv."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_inv",
        "@sagemath/sagejs-flint",
        "ffiNmodMatInv",
        [output, source, size, modulus],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64"],
        "bool",
        "zero_is_error",
        "ValueError",
        "matrix is singular",
    )

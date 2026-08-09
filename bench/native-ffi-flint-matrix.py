"""Packed matrix witnesses for declaration-driven FLINT FFI compilation."""

from sagejs.ffi.flint import nmod_mat_inv, nmod_mat_rank
from sagejs.native import UInt64Buffer, native, uint64


@native
def flint_nmod_rank(
    entries: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> uint64:
    return nmod_mat_rank(entries, rows, columns, modulus)


@native
def flint_nmod_inverse(
    output: UInt64Buffer,
    source: UInt64Buffer,
    size: uint64,
    modulus: uint64,
) -> bool:
    return nmod_mat_inv(output, source, size, modulus)

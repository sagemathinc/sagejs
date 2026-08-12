"""Generated checked host adapters for fflas.

This file is derived from the CPython-parseable declaration source.  Do not
edit it directly; run `sagejs ffi generate fflas`.
The native compiler lowers these actual typed bodies into one host adapter
whose core calls the declared foreign symbols without a host callback.
"""

from __future__ import annotations

from sagejs.ffi.fflas import (
    modular_float_available as _ffi_modular_float_available,
    modular_float_mul as _ffi_modular_float_mul,
    modular_float_rank as _ffi_modular_float_rank,
    modular_float_rref as _ffi_modular_float_rref,
    modular_float_right_nullspace as _ffi_modular_float_right_nullspace,
    modular_double_available as _ffi_modular_double_available,
    modular_double_mul as _ffi_modular_double_mul,
    modular_double_rank as _ffi_modular_double_rank,
    modular_double_rref as _ffi_modular_double_rref,
    modular_double_right_nullspace as _ffi_modular_double_right_nullspace,
)
from sagejs.native import UInt64Buffer, native, uint64


@native
def ffiFflasModularFloatAvailable(

) -> bool:
    return _ffi_modular_float_available(

    )


@native
def ffiFflasModularFloatMul(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    left_rows: uint64,
    inner: uint64,
    right_columns: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_modular_float_mul(
        output,
        left,
        right,
        output_length,
        left_length,
        right_length,
        left_rows,
        inner,
        right_columns,
        modulus,
    )


@native
def ffiFflasModularFloatRank(
    rank_output: UInt64Buffer,
    source: UInt64Buffer,
    rank_length: uint64,
    source_length: uint64,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_modular_float_rank(
        rank_output,
        source,
        rank_length,
        source_length,
        rows,
        columns,
        modulus,
    )


@native
def ffiFflasModularFloatRref(
    output: UInt64Buffer,
    rank_output: UInt64Buffer,
    source: UInt64Buffer,
    output_length: uint64,
    rank_length: uint64,
    source_length: uint64,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_modular_float_rref(
        output,
        rank_output,
        source,
        output_length,
        rank_length,
        source_length,
        rows,
        columns,
        modulus,
    )


@native
def ffiFflasModularFloatRightNullspace(
    output: UInt64Buffer,
    nullity_output: UInt64Buffer,
    source: UInt64Buffer,
    output_length: uint64,
    nullity_length: uint64,
    source_length: uint64,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_modular_float_right_nullspace(
        output,
        nullity_output,
        source,
        output_length,
        nullity_length,
        source_length,
        rows,
        columns,
        modulus,
    )


@native
def ffiFflasModularDoubleAvailable(

) -> bool:
    return _ffi_modular_double_available(

    )


@native
def ffiFflasModularDoubleMul(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    left_rows: uint64,
    inner: uint64,
    right_columns: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_modular_double_mul(
        output,
        left,
        right,
        output_length,
        left_length,
        right_length,
        left_rows,
        inner,
        right_columns,
        modulus,
    )


@native
def ffiFflasModularDoubleRank(
    rank_output: UInt64Buffer,
    source: UInt64Buffer,
    rank_length: uint64,
    source_length: uint64,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_modular_double_rank(
        rank_output,
        source,
        rank_length,
        source_length,
        rows,
        columns,
        modulus,
    )


@native
def ffiFflasModularDoubleRref(
    output: UInt64Buffer,
    rank_output: UInt64Buffer,
    source: UInt64Buffer,
    output_length: uint64,
    rank_length: uint64,
    source_length: uint64,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_modular_double_rref(
        output,
        rank_output,
        source,
        output_length,
        rank_length,
        source_length,
        rows,
        columns,
        modulus,
    )


@native
def ffiFflasModularDoubleRightNullspace(
    output: UInt64Buffer,
    nullity_output: UInt64Buffer,
    source: UInt64Buffer,
    output_length: uint64,
    nullity_length: uint64,
    source_length: uint64,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> bool:
    return _ffi_modular_double_right_nullspace(
        output,
        nullity_output,
        source,
        output_length,
        nullity_length,
        source_length,
        rows,
        columns,
        modulus,
    )

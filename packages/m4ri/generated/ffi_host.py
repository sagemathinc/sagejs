"""Generated checked host adapters for m4ri.

This file is derived from the CPython-parseable declaration source.  Do not
edit it directly; run `sagejs ffi generate m4ri`.
The native compiler lowers these actual typed bodies into one host adapter
whose core calls the declared foreign symbols without a host callback.
"""

from __future__ import annotations

from sagejs.ffi.m4ri import (
    M4riByteRegion,
    M4riMatrix,
    available as _ffi_available,
    matrix as _ffi_matrix,
    matrix_nrows as _ffi_matrix_nrows,
    matrix_ncols as _ffi_matrix_ncols,
    matrix_set_entry as _ffi_matrix_set_entry,
    matrix_swap_rows as _ffi_matrix_swap_rows,
    matrix_swap_columns as _ffi_matrix_swap_columns,
    matrix_entry_code as _ffi_matrix_entry_code,
    matrix_copy as _ffi_matrix_copy,
    matrix_equal as _ffi_matrix_equal,
    matrix_add as _ffi_matrix_add,
    matrix_mul as _ffi_matrix_mul,
    matrix_transpose as _ffi_matrix_transpose,
    matrix_rank as _ffi_matrix_rank,
    matrix_rref as _ffi_matrix_rref,
    matrix_determinant_code as _ffi_matrix_determinant_code,
    matrix_inverse as _ffi_matrix_inverse,
    matrix_solve as _ffi_matrix_solve,
    matrix_right_kernel as _ffi_matrix_right_kernel,
    matrix_logical_words as _ffi_matrix_logical_words,
    matrix_from_logical_words as _ffi_matrix_from_logical_words,
    matrix_sagepack_bytes as _ffi_matrix_sagepack_bytes,
    matrix_from_sagepack_bytes as _ffi_matrix_from_sagepack_bytes,
    matrix_format as _ffi_matrix_format,
)
from sagejs.native import native, uint64


@native
def ffiM4riAvailable(

) -> bool:
    return _ffi_available(

    )


@native
def ffiM4riMatrixCreate(
    rows: uint64,
    columns: uint64,
) -> M4riMatrix:
    return _ffi_matrix(
        rows,
        columns,
    )


@native
def ffiM4riMatrixNrows(
    matrix: M4riMatrix,
) -> uint64:
    return _ffi_matrix_nrows(
        matrix,
    )


@native
def ffiM4riMatrixNcols(
    matrix: M4riMatrix,
) -> uint64:
    return _ffi_matrix_ncols(
        matrix,
    )


@native
def ffiM4riMatrixSetEntry(
    matrix: M4riMatrix,
    row: uint64,
    column: uint64,
    value: uint64,
) -> bool:
    return _ffi_matrix_set_entry(
        matrix,
        row,
        column,
        value,
    )


@native
def ffiM4riMatrixSwapRows(
    matrix: M4riMatrix,
    first: uint64,
    second: uint64,
) -> bool:
    return _ffi_matrix_swap_rows(
        matrix,
        first,
        second,
    )


@native
def ffiM4riMatrixSwapColumns(
    matrix: M4riMatrix,
    first: uint64,
    second: uint64,
) -> bool:
    return _ffi_matrix_swap_columns(
        matrix,
        first,
        second,
    )


@native
def ffiM4riMatrixEntryCode(
    matrix: M4riMatrix,
    row: uint64,
    column: uint64,
) -> uint64:
    return _ffi_matrix_entry_code(
        matrix,
        row,
        column,
    )


@native
def ffiM4riMatrixCopy(
    source: M4riMatrix,
) -> M4riMatrix:
    return _ffi_matrix_copy(
        source,
    )


@native
def ffiM4riMatrixEqual(
    left: M4riMatrix,
    right: M4riMatrix,
) -> bool:
    return _ffi_matrix_equal(
        left,
        right,
    )


@native
def ffiM4riMatrixAdd(
    left: M4riMatrix,
    right: M4riMatrix,
) -> M4riMatrix:
    return _ffi_matrix_add(
        left,
        right,
    )


@native
def ffiM4riMatrixMul(
    left: M4riMatrix,
    right: M4riMatrix,
) -> M4riMatrix:
    return _ffi_matrix_mul(
        left,
        right,
    )


@native
def ffiM4riMatrixTranspose(
    source: M4riMatrix,
) -> M4riMatrix:
    return _ffi_matrix_transpose(
        source,
    )


@native
def ffiM4riMatrixRank(
    source: M4riMatrix,
) -> uint64:
    return _ffi_matrix_rank(
        source,
    )


@native
def ffiM4riMatrixRref(
    source: M4riMatrix,
) -> M4riMatrix:
    return _ffi_matrix_rref(
        source,
    )


@native
def ffiM4riMatrixDeterminantCode(
    source: M4riMatrix,
) -> uint64:
    return _ffi_matrix_determinant_code(
        source,
    )


@native
def ffiM4riMatrixInverse(
    source: M4riMatrix,
) -> M4riMatrix:
    return _ffi_matrix_inverse(
        source,
    )


@native
def ffiM4riMatrixSolve(
    left: M4riMatrix,
    right: M4riMatrix,
) -> M4riMatrix:
    return _ffi_matrix_solve(
        left,
        right,
    )


@native
def ffiM4riMatrixRightKernel(
    source: M4riMatrix,
) -> M4riMatrix:
    return _ffi_matrix_right_kernel(
        source,
    )


@native
def ffiM4riMatrixLogicalWords(
    source: M4riMatrix,
) -> M4riByteRegion:
    return _ffi_matrix_logical_words(
        source,
    )


@native
def ffiM4riMatrixFromLogicalWords(
    source: M4riByteRegion,
    rows: uint64,
    columns: uint64,
) -> M4riMatrix:
    return _ffi_matrix_from_logical_words(
        source,
        rows,
        columns,
    )


@native
def ffiM4riMatrixSagepackBytes(
    source: M4riMatrix,
) -> M4riByteRegion:
    return _ffi_matrix_sagepack_bytes(
        source,
    )


@native
def ffiM4riMatrixFromSagepackBytes(
    source: M4riByteRegion,
    rows: uint64,
    columns: uint64,
) -> M4riMatrix:
    return _ffi_matrix_from_sagepack_bytes(
        source,
        rows,
        columns,
    )


@native
def ffiM4riMatrixFormat(
    source: M4riMatrix,
) -> M4riByteRegion:
    return _ffi_matrix_format(
        source,
    )

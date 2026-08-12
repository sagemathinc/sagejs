"""Safe generated-resource declarations for dense matrices over `GF(2)`."""

from sagejs.ffi.declare import (
    Direct,
    Effects,
    Library,
    Status,
    Writable,
    copied_bytes,
    in_,
    out,
)


m4ri = Library(
    id="m4ri",
    python_module="sagejs.ffi.m4ri",
    package="@sagemath/sagejs-m4ri",
    headers=["sagejs/m4ri_matrix_ffi.h"],
    link_unix=["libm4ri.a"],
    link_windows=[],
    dependencies=["M4RI"],
    prefix_environment="SAGEJS_M4RI_PREFIX",
    unix_default="packages/m4ri/.native/prefix",
    windows_default="packages/m4ri/.native/prefix",
    include_dirs=["include"],
    source_include_dirs=["packages/m4ri/include"],
)


M4riMatrix = m4ri.resource(
    id="matrix",
    abi=sagejs_m4ri_matrix_t,
    ownership="owned",
    close="ffiM4riMatrixClose",
    clear="sagejs_m4ri_matrix_clear",
    size="sagejs_m4ri_matrix_allocated_bytes",
    wasm=True,
)


M4riByteRegion = m4ri.resource(
    id="byte_region",
    abi=sagejs_m4ri_byte_region_t,
    ownership="owned",
    close="ffiM4riByteRegionClose",
    clear="sagejs_m4ri_byte_region_clear",
    size="sagejs_m4ri_byte_region_allocated_bytes",
    host_transfer=copied_bytes(
        dynamic="ffiM4riByteRegionCopyBytes",
        data="sagejs_m4ri_byte_region_data",
        length="sagejs_m4ri_byte_region_length",
        wasm=True,
    ),
    host_ingress=copied_bytes(
        dynamic="ffiM4riByteRegionFromBytes",
        init="sagejs_m4ri_byte_region_init_copy",
        wasm=True,
    ),
    wasm=True,
)


@m4ri.function(
    dynamic="ffiM4riAvailable",
    symbol="sagejs_m4ri_available",
    returns=int,
    abi=[],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def available() -> bool: ...


@m4ri.function(
    dynamic="ffiM4riMatrixCreate",
    symbol="sagejs_m4ri_matrix_init",
    returns=int,
    abi=[
        out("result", sagejs_m4ri_matrix_t),
        in_("rows", uint64_t),
        in_("columns", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[OverflowError]),
    result=Status(
        1,
        exception=OverflowError,
        message="M4RI matrix dimensions are too large or unavailable",
    ),
    wasm=True,
)
def matrix(rows: uint64, columns: uint64) -> M4riMatrix: ...


@m4ri.function(
    dynamic="ffiM4riMatrixNrows",
    symbol="sagejs_m4ri_matrix_nrows",
    returns=uint64_t,
    abi=[in_("matrix", sagejs_m4ri_matrix_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def matrix_nrows(matrix: M4riMatrix) -> uint64: ...


@m4ri.function(
    dynamic="ffiM4riMatrixNcols",
    symbol="sagejs_m4ri_matrix_ncols",
    returns=uint64_t,
    abi=[in_("matrix", sagejs_m4ri_matrix_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def matrix_ncols(matrix: M4riMatrix) -> uint64: ...


@m4ri.function(
    dynamic="ffiM4riMatrixSetEntry",
    symbol="sagejs_m4ri_matrix_set_entry",
    returns=int,
    abi=[
        in_("matrix", sagejs_m4ri_matrix_t),
        in_("row", uint64_t),
        in_("column", uint64_t),
        in_("value", uint64_t),
    ],
    effects=Effects(pure=False, raises=[ValueError], writes=["matrix"]),
    result=Status(
        1,
        exception=ValueError,
        message="M4RI matrix entry or index is invalid",
    ),
    wasm=True,
)
def matrix_set_entry(
    matrix: Writable[M4riMatrix], row: uint64, column: uint64, value: uint64
) -> bool: ...


@m4ri.function(
    dynamic="ffiM4riMatrixEntryCode",
    symbol="sagejs_m4ri_matrix_entry_code",
    returns=uint64_t,
    abi=[
        in_("matrix", sagejs_m4ri_matrix_t),
        in_("row", uint64_t),
        in_("column", uint64_t),
    ],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def matrix_entry_code(matrix: M4riMatrix, row: uint64, column: uint64) -> uint64:
    """Return 0 or 1, or 2 when `(row, column)` is out of bounds."""
    ...


@m4ri.function(
    dynamic="ffiM4riMatrixCopy",
    symbol="sagejs_m4ri_matrix_init_set",
    returns=int,
    abi=[
        out("result", sagejs_m4ri_matrix_t),
        in_("source", sagejs_m4ri_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(1, exception=RuntimeError, message="M4RI matrix copy failed"),
    wasm=True,
)
def matrix_copy(source: M4riMatrix) -> M4riMatrix: ...


@m4ri.function(
    dynamic="ffiM4riMatrixEqual",
    symbol="sagejs_m4ri_matrix_equal",
    returns=int,
    abi=[
        in_("left", sagejs_m4ri_matrix_t),
        in_("right", sagejs_m4ri_matrix_t),
    ],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def matrix_equal(left: M4riMatrix, right: M4riMatrix) -> bool: ...


@m4ri.function(
    dynamic="ffiM4riMatrixAdd",
    symbol="sagejs_m4ri_matrix_add",
    returns=int,
    abi=[
        out("result", sagejs_m4ri_matrix_t),
        in_("left", sagejs_m4ri_matrix_t),
        in_("right", sagejs_m4ri_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="M4RI matrix dimensions are incompatible for addition",
    ),
    wasm=True,
)
def matrix_add(left: M4riMatrix, right: M4riMatrix) -> M4riMatrix: ...


@m4ri.function(
    dynamic="ffiM4riMatrixMul",
    symbol="sagejs_m4ri_matrix_mul",
    returns=int,
    abi=[
        out("result", sagejs_m4ri_matrix_t),
        in_("left", sagejs_m4ri_matrix_t),
        in_("right", sagejs_m4ri_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="M4RI matrix dimensions are incompatible for multiplication",
    ),
    wasm=True,
)
def matrix_mul(left: M4riMatrix, right: M4riMatrix) -> M4riMatrix: ...


@m4ri.function(
    dynamic="ffiM4riMatrixTranspose",
    symbol="sagejs_m4ri_matrix_transpose",
    returns=int,
    abi=[
        out("result", sagejs_m4ri_matrix_t),
        in_("source", sagejs_m4ri_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(1, exception=RuntimeError, message="M4RI transpose failed"),
    wasm=True,
)
def matrix_transpose(source: M4riMatrix) -> M4riMatrix: ...


@m4ri.function(
    dynamic="ffiM4riMatrixRank",
    symbol="sagejs_m4ri_matrix_rank",
    returns=uint64_t,
    abi=[in_("source", sagejs_m4ri_matrix_t)],
    effects=Effects(pure=False, allocates=True),
    result=Direct(),
    wasm=True,
)
def matrix_rank(source: M4riMatrix) -> uint64: ...


@m4ri.function(
    dynamic="ffiM4riMatrixRref",
    symbol="sagejs_m4ri_matrix_rref",
    returns=int,
    abi=[
        out("result", sagejs_m4ri_matrix_t),
        in_("source", sagejs_m4ri_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(1, exception=RuntimeError, message="M4RI RREF failed"),
    wasm=True,
)
def matrix_rref(source: M4riMatrix) -> M4riMatrix:
    """Return RREF storage carrying the rank from the same elimination."""
    ...


@m4ri.function(
    dynamic="ffiM4riMatrixDeterminantCode",
    symbol="sagejs_m4ri_matrix_determinant_code",
    returns=uint64_t,
    abi=[in_("source", sagejs_m4ri_matrix_t)],
    effects=Effects(pure=False, allocates=True),
    result=Direct(),
    wasm=True,
)
def matrix_determinant_code(source: M4riMatrix) -> uint64:
    """Return the determinant 0 or 1, or 2 for a nonsquare matrix."""
    ...


@m4ri.function(
    dynamic="ffiM4riMatrixInverse",
    symbol="sagejs_m4ri_matrix_inverse",
    returns=int,
    abi=[
        out("result", sagejs_m4ri_matrix_t),
        in_("source", sagejs_m4ri_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="M4RI matrix is not invertible"),
    wasm=True,
)
def matrix_inverse(source: M4riMatrix) -> M4riMatrix: ...


@m4ri.function(
    dynamic="ffiM4riMatrixSolve",
    symbol="sagejs_m4ri_matrix_solve",
    returns=int,
    abi=[
        out("result", sagejs_m4ri_matrix_t),
        in_("left", sagejs_m4ri_matrix_t),
        in_("right", sagejs_m4ri_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="M4RI matrix equation has incompatible dimensions or no solution",
    ),
    wasm=True,
)
def matrix_solve(left: M4riMatrix, right: M4riMatrix) -> M4riMatrix: ...


@m4ri.function(
    dynamic="ffiM4riMatrixRightKernel",
    symbol="sagejs_m4ri_matrix_right_kernel",
    returns=int,
    abi=[
        out("result", sagejs_m4ri_matrix_t),
        in_("source", sagejs_m4ri_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(1, exception=RuntimeError, message="M4RI right kernel failed"),
    wasm=True,
)
def matrix_right_kernel(source: M4riMatrix) -> M4riMatrix: ...


@m4ri.function(
    dynamic="ffiM4riMatrixLogicalWords",
    symbol="sagejs_m4ri_matrix_logical_words",
    returns=int,
    abi=[
        out("result", sagejs_m4ri_byte_region_t),
        in_("source", sagejs_m4ri_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(1, exception=RuntimeError, message="M4RI logical-word export failed"),
    wasm=True,
)
def matrix_logical_words(source: M4riMatrix) -> M4riByteRegion: ...


@m4ri.function(
    dynamic="ffiM4riMatrixFromLogicalWords",
    symbol="sagejs_m4ri_matrix_init_logical_words",
    returns=int,
    abi=[
        out("result", sagejs_m4ri_matrix_t),
        in_("source", sagejs_m4ri_byte_region_t),
        in_("rows", uint64_t),
        in_("columns", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid canonical M4RI logical-word data",
    ),
    wasm=True,
)
def matrix_from_logical_words(
    source: M4riByteRegion, rows: uint64, columns: uint64
) -> M4riMatrix: ...


@m4ri.function(
    dynamic="ffiM4riMatrixSagepackBytes",
    symbol="sagejs_m4ri_matrix_sagepack_bytes",
    returns=int,
    abi=[
        out("result", sagejs_m4ri_byte_region_t),
        in_("source", sagejs_m4ri_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(
        1, exception=RuntimeError, message="M4RI SagePack byte export failed"
    ),
    wasm=True,
)
def matrix_sagepack_bytes(source: M4riMatrix) -> M4riByteRegion: ...


@m4ri.function(
    dynamic="ffiM4riMatrixFromSagepackBytes",
    symbol="sagejs_m4ri_matrix_init_sagepack_bytes",
    returns=int,
    abi=[
        out("result", sagejs_m4ri_matrix_t),
        in_("source", sagejs_m4ri_byte_region_t),
        in_("rows", uint64_t),
        in_("columns", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="invalid GF(2) SagePack bytes"),
    wasm=True,
)
def matrix_from_sagepack_bytes(
    source: M4riByteRegion, rows: uint64, columns: uint64
) -> M4riMatrix: ...


@m4ri.function(
    dynamic="ffiM4riMatrixFormat",
    symbol="sagejs_m4ri_matrix_format",
    returns=int,
    abi=[
        out("result", sagejs_m4ri_byte_region_t),
        in_("source", sagejs_m4ri_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(1, exception=RuntimeError, message="M4RI matrix formatting failed"),
    wasm=True,
)
def matrix_format(source: M4riMatrix) -> M4riByteRegion: ...

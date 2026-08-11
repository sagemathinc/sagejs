"""Safe FFLAS/FFPACK declarations for packed small-prime matrices."""

from sagejs.ffi.declare import (
    CxxToStatus,
    Direct,
    Effects,
    Library,
    Status,
    Writable,
    in_,
    out,
    packed_slice,
)


fflas = Library(
    id="fflas",
    python_module="sagejs.ffi.fflas",
    package="@sagemath/sagejs-fflas",
    headers=["sagejs/fflas_matrix_ffi.h"],
    link_unix=[
        "libgivaro.a",
        "libopenblas.a",
        "libgmpxx.a",
        "libgmp.a",
    ],
    link_windows=[],
    dependencies=["FFLAS-FFPACK", "Givaro", "OpenBLAS", "GMP"],
    prefix_environment="SAGEJS_FFLAS_PREFIX",
    unix_default="packages/fflas/.native/prefix",
    windows_default="packages/fflas/.native/prefix",
    include_dirs=["include"],
    source_include_dirs=["packages/fflas/include"],
)


@fflas.function(
    dynamic="ffiFflasModularFloatAvailable",
    symbol="sagejs_fflas_modular_float_available",
    returns=int,
    abi=[],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
)
def modular_float_available() -> bool: ...


@fflas.function(
    dynamic="ffiFflasModularFloatMul",
    symbol="sagejs_fflas_modular_float_mul",
    returns=int,
    abi=[
        out(
            "output_data",
            uint64_t_ptr,
            packed_slice(
                data="output",
                length="output_length",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        in_(
            "left_data",
            uint64_t_ptr,
            packed_slice(
                data="left",
                length="left_length",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_(
            "right_data",
            uint64_t_ptr,
            packed_slice(
                data="right",
                length="right_length",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_("output_length", uint64_t),
        in_("left_length", uint64_t),
        in_("right_length", uint64_t),
        in_("left_rows", uint64_t),
        in_("inner", uint64_t),
        in_("right_columns", uint64_t),
        in_("modulus", uint64_t),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError, OverflowError],
        writes=["output"],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="FFLAS matrix multiplication failed or is unavailable",
    ),
    exceptions=CxxToStatus(0),
    wasm=False,
)
def modular_float_mul(
    output: Writable[UInt64Buffer],
    left: UInt64Buffer,
    right: UInt64Buffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    left_rows: uint64,
    inner: uint64,
    right_columns: uint64,
    modulus: uint64,
) -> bool: ...


@fflas.function(
    dynamic="ffiFflasModularFloatRank",
    symbol="sagejs_fflas_modular_float_rank",
    returns=int,
    abi=[
        out(
            "rank_data",
            uint64_t_ptr,
            packed_slice(
                data="rank_output",
                length="rank_length",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        in_(
            "source_data",
            uint64_t_ptr,
            packed_slice(
                data="source",
                length="source_length",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_("rank_length", uint64_t),
        in_("source_length", uint64_t),
        in_("rows", uint64_t),
        in_("columns", uint64_t),
        in_("modulus", uint64_t),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError, OverflowError],
        writes=["rank_output"],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="FFPACK matrix rank failed or is unavailable",
    ),
    exceptions=CxxToStatus(0),
    wasm=False,
)
def modular_float_rank(
    rank_output: Writable[UInt64Buffer],
    source: UInt64Buffer,
    rank_length: uint64,
    source_length: uint64,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> bool: ...


@fflas.function(
    dynamic="ffiFflasModularFloatRref",
    symbol="sagejs_fflas_modular_float_rref",
    returns=int,
    abi=[
        out(
            "output_data",
            uint64_t_ptr,
            packed_slice(
                data="output",
                length="output_length",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "rank_data",
            uint64_t_ptr,
            packed_slice(
                data="rank_output",
                length="rank_length",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        in_(
            "source_data",
            uint64_t_ptr,
            packed_slice(
                data="source",
                length="source_length",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_("output_length", uint64_t),
        in_("rank_length", uint64_t),
        in_("source_length", uint64_t),
        in_("rows", uint64_t),
        in_("columns", uint64_t),
        in_("modulus", uint64_t),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError, OverflowError],
        writes=["output", "rank_output"],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="FFPACK matrix RREF failed or is unavailable",
    ),
    exceptions=CxxToStatus(0),
    wasm=False,
)
def modular_float_rref(
    output: Writable[UInt64Buffer],
    rank_output: Writable[UInt64Buffer],
    source: UInt64Buffer,
    output_length: uint64,
    rank_length: uint64,
    source_length: uint64,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> bool: ...

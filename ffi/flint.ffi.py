"""Safe FLINT declarations lowered statically to flint.ffi.json."""

from sagejs.ffi.declare import (
    Direct,
    Effects,
    Library,
    Min,
    Status,
    Writable,
    in_,
    out,
    packed_nmod_matrix,
    packed_slice,
)


flint = Library(
    id="flint",
    python_module="sagejs.ffi.flint",
    package="@sagemath/sagejs-flint",
    headers=[
        "flint/dirichlet.h",
        "flint/fmpz.h",
        "flint/nmod_mat.h",
        "flint/ulong_extras.h",
        "sagejs/ffi_algorithms.h",
    ],
    link_unix=["libflint.a", "libopenblas.a"],
    link_windows=["flint.lib", "openblas.lib", "pthreadVC3.lib"],
    dependencies=["GMP", "OpenBLAS", "pthreads"],
    prefix_environment="SAGEJS_FLINT_PREFIX",
    unix_default="packages/flint/.native/prefix",
    windows_default="packages/flint/.native/vcpkg-installed/x64-windows-static-md-release",
    include_dirs=["include"],
    source_include_dirs=["packages/flint/include"],
)


DirichletGroup = flint.resource(
    id="dirichlet_group",
    abi=dirichlet_group_t,
    ownership="owned",
    close="ffiDirichletGroupClose",
    clear="dirichlet_group_clear",
    wasm=True,
)


@flint.function(
    id="dirichlet_group_init",
    dynamic="ffiDirichletGroupCreate",
    symbol="dirichlet_group_init",
    returns=int,
    abi=[
        out("result", dirichlet_group_t),
        in_("modulus", ulong),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="FLINT could not initialize this Dirichlet modulus",
    ),
    wasm=True,
)
def dirichlet_group(modulus: Min[uint64, 1]) -> DirichletGroup:
    ...


@flint.function(
    dynamic="ffiDirichletGroupSize",
    symbol="dirichlet_group_size",
    returns=ulong,
    abi=[in_("group", dirichlet_group_t)],
    effects=Effects(pure=True, raises=[ValueError]),
    result=Direct(),
    wasm=True,
)
def dirichlet_group_size(group: DirichletGroup) -> uint64:
    ...


@flint.function(
    dynamic="ffiDirichletGroupNumPrimitive",
    symbol="dirichlet_group_num_primitive",
    returns=ulong,
    abi=[in_("group", dirichlet_group_t)],
    effects=Effects(pure=True, raises=[ValueError]),
    result=Direct(),
    wasm=True,
)
def dirichlet_group_num_primitive(group: DirichletGroup) -> uint64:
    ...


@flint.function(
    dynamic="wordIsPrime",
    symbol="n_is_prime",
    returns=int,
    abi=[in_("value", ulong)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def n_is_prime(value: uint64) -> bool:
    ...


@flint.function(
    dynamic="gcd",
    symbol="fmpz_gcd",
    returns=void,
    abi=[
        out("result", fmpz_t),
        in_("left", fmpz_t),
        in_("right", fmpz_t),
    ],
    effects=Effects(pure=True, allocates=True),
    result=Direct(),
    wasm=True,
)
def fmpz_gcd(left: Integer, right: Integer) -> Integer:
    ...


@flint.function(
    dynamic="ffiNmodMatRank",
    symbol="nmod_mat_rank",
    returns=slong,
    abi=[
        in_(
            "matrix",
            nmod_mat_t,
            packed_nmod_matrix(
                data="entries",
                rows="rows",
                columns="columns",
                modulus="modulus",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
    ],
    effects=Effects(
        pure=True,
        allocates=True,
        raises=[ValueError, OverflowError],
    ),
    result=Direct(),
    wasm=True,
)
def nmod_mat_rank(
    entries: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> uint64:
    ...


@flint.function(
    dynamic="ffiNmodMatInv",
    symbol="nmod_mat_inv",
    returns=int,
    abi=[
        out(
            "inverse",
            nmod_mat_t,
            packed_nmod_matrix(
                data="output",
                rows="size",
                columns="size",
                modulus="modulus",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        in_(
            "matrix",
            nmod_mat_t,
            packed_nmod_matrix(
                data="source",
                rows="size",
                columns="size",
                modulus="modulus",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError, OverflowError],
        writes=["output"],
    ),
    result=Status(1, exception=ValueError, message="matrix is singular"),
    wasm=True,
)
def nmod_mat_inv(
    output: Writable[UInt64Buffer],
    source: UInt64Buffer,
    size: uint64,
    modulus: uint64,
) -> bool:
    ...


@flint.function(
    dynamic="ffiNmodMatRref",
    symbol="sagejs_flint_nmod_mat_rref_copy",
    returns=slong,
    abi=[
        out(
            "reduced",
            nmod_mat_t,
            packed_nmod_matrix(
                data="output",
                rows="rows",
                columns="columns",
                modulus="modulus",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        in_(
            "matrix",
            nmod_mat_t,
            packed_nmod_matrix(
                data="source",
                rows="rows",
                columns="columns",
                modulus="modulus",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError, OverflowError],
        writes=["output"],
    ),
    result=Direct(),
    wasm=True,
)
def nmod_mat_rref(
    output: Writable[UInt64Buffer],
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> uint64:
    ...


@flint.function(
    dynamic="ffiNmodMatRightKernel",
    symbol="sagejs_flint_nmod_mat_right_kernel",
    returns=slong,
    abi=[
        out(
            "basis",
            nmod_mat_t,
            packed_nmod_matrix(
                data="output",
                rows="columns",
                columns="columns",
                modulus="modulus",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        in_(
            "matrix",
            nmod_mat_t,
            packed_nmod_matrix(
                data="source",
                rows="rows",
                columns="columns",
                modulus="modulus",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError, OverflowError],
        writes=["output"],
    ),
    result=Direct(),
    wasm=True,
)
def nmod_mat_right_kernel(
    output: Writable[UInt64Buffer],
    source: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> uint64:
    ...


@flint.function(
    dynamic="ffiNmodMatSolve",
    symbol="sagejs_flint_nmod_mat_solve",
    returns=int,
    abi=[
        out(
            "solution",
            nmod_mat_t,
            packed_nmod_matrix(
                data="output",
                rows="size",
                columns="right_columns",
                modulus="modulus",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        in_(
            "left_matrix",
            nmod_mat_t,
            packed_nmod_matrix(
                data="left",
                rows="size",
                columns="size",
                modulus="modulus",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_(
            "right_matrix",
            nmod_mat_t,
            packed_nmod_matrix(
                data="right",
                rows="size",
                columns="right_columns",
                modulus="modulus",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError, OverflowError],
        writes=["output"],
    ),
    result=Direct(),
    wasm=True,
)
def nmod_mat_solve(
    output: Writable[UInt64Buffer],
    left: UInt64Buffer,
    right: UInt64Buffer,
    size: uint64,
    right_columns: uint64,
    modulus: uint64,
) -> bool:
    ...


@flint.function(
    dynamic="ffiNmodPolyMul",
    symbol="sagejs_flint_nmod_poly_mul_packed",
    returns=int,
    abi=[
        out(
            "product",
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
        in_("modulus", uint64_t),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError],
        writes=["output"],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="invalid packed polynomial multiplication",
    ),
    wasm=True,
)
def nmod_poly_mul(
    output: Writable[UInt64Buffer],
    left: UInt64Buffer,
    right: UInt64Buffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool:
    ...

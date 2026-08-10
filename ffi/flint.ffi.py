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
    packed_fmpz_matrix,
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
        "flint/fmpz_mat.h",
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
def dirichlet_group(modulus: Min[uint64, 1]) -> DirichletGroup: ...


@flint.function(
    dynamic="ffiDirichletGroupSize",
    symbol="dirichlet_group_size",
    returns=ulong,
    abi=[in_("group", dirichlet_group_t)],
    effects=Effects(pure=True, raises=[ValueError]),
    result=Direct(),
    wasm=True,
)
def dirichlet_group_size(group: DirichletGroup) -> uint64: ...


@flint.function(
    dynamic="ffiDirichletGroupNumPrimitive",
    symbol="dirichlet_group_num_primitive",
    returns=ulong,
    abi=[in_("group", dirichlet_group_t)],
    effects=Effects(pure=True, raises=[ValueError]),
    result=Direct(),
    wasm=True,
)
def dirichlet_group_num_primitive(group: DirichletGroup) -> uint64: ...


@flint.function(
    dynamic="wordIsPrime",
    symbol="n_is_prime",
    returns=int,
    abi=[in_("value", ulong)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def n_is_prime(value: uint64) -> bool: ...


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
def fmpz_gcd(left: Integer, right: Integer) -> Integer: ...


@flint.function(
    dynamic="ffiFmpzMatRank",
    symbol="fmpz_mat_rank",
    returns=slong,
    abi=[
        in_(
            "matrix",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="entries",
                rows="rows",
                columns="columns",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError, OverflowError]),
    result=Direct(),
    wasm=True,
)
def fmpz_mat_rank(
    entries: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> uint64: ...


@flint.function(
    dynamic="ffiFmpzMatMul",
    symbol="sagejs_flint_fmpz_mat_mul",
    returns=int,
    abi=[
        out(
            "output",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="output",
                rows="left_rows",
                columns="right_columns",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        in_(
            "left",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="left",
                rows="left_rows",
                columns="inner",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_(
            "right",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="right",
                rows="inner",
                columns="right_columns",
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
    result=Status(
        1, exception=ValueError, message="FLINT integer matrix multiplication failed"
    ),
    wasm=True,
)
def fmpz_mat_mul(
    output: Writable[IntegerBuffer],
    left: IntegerBuffer,
    right: IntegerBuffer,
    left_rows: uint64,
    inner: uint64,
    right_columns: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpzMatDet",
    symbol="sagejs_flint_fmpz_mat_det",
    returns=int,
    abi=[
        out(
            "result",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="output",
                rows="one",
                columns="one",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        in_(
            "matrix",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="source",
                rows="size",
                columns="size",
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
    result=Status(1, exception=ValueError, message="FLINT integer determinant failed"),
    wasm=True,
)
def fmpz_mat_det(
    output: Writable[IntegerBuffer],
    source: IntegerBuffer,
    size: uint64,
    one: Min[uint64, 1],
) -> bool: ...


@flint.function(
    dynamic="ffiFmpzMatCharpoly",
    symbol="sagejs_flint_fmpz_mat_charpoly",
    returns=int,
    abi=[
        out(
            "coefficients",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="output",
                rows="one",
                columns="output_length",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        in_(
            "matrix",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="source",
                rows="size",
                columns="size",
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
    result=Status(
        1,
        exception=ValueError,
        message="FLINT integer characteristic polynomial failed",
    ),
    wasm=True,
)
def fmpz_mat_charpoly(
    output: Writable[IntegerBuffer],
    source: IntegerBuffer,
    output_length: uint64,
    size: uint64,
    one: Min[uint64, 1],
) -> bool: ...


@flint.function(
    dynamic="ffiFmpzMatHnf",
    symbol="sagejs_flint_fmpz_mat_hnf",
    returns=int,
    abi=[
        out(
            "output",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="output",
                rows="rows",
                columns="columns",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        in_(
            "source",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="source",
                rows="rows",
                columns="columns",
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
    result=Status(1, exception=ValueError, message="FLINT integer Hermite form failed"),
    wasm=True,
)
def fmpz_mat_hnf(
    output: Writable[IntegerBuffer],
    source: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpzMatHnfTransform",
    symbol="sagejs_flint_fmpz_mat_hnf_transform",
    returns=int,
    abi=[
        out(
            "output",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="output",
                rows="rows",
                columns="columns",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "transform",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="transform",
                rows="rows",
                columns="rows",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        in_(
            "source",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="source",
                rows="rows",
                columns="columns",
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
        writes=["output", "transform"],
    ),
    result=Status(
        1, exception=ValueError, message="FLINT integer Hermite transformation failed"
    ),
    wasm=True,
)
def fmpz_mat_hnf_transform(
    output: Writable[IntegerBuffer],
    transform: Writable[IntegerBuffer],
    source: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpzMatSnfTransform",
    symbol="sagejs_flint_fmpz_mat_snf_transform",
    returns=int,
    abi=[
        out(
            "output",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="output",
                rows="rows",
                columns="columns",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "left_transform",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="left_transform",
                rows="rows",
                columns="rows",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "right_transform",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="right_transform",
                rows="columns",
                columns="columns",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        in_(
            "source",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="source",
                rows="rows",
                columns="columns",
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
        writes=["output", "left_transform", "right_transform"],
    ),
    result=Status(
        1, exception=ValueError, message="FLINT integer Smith transformation failed"
    ),
    wasm=True,
)
def fmpz_mat_snf_transform(
    output: Writable[IntegerBuffer],
    left_transform: Writable[IntegerBuffer],
    right_transform: Writable[IntegerBuffer],
    source: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpzMatRightKernel",
    symbol="sagejs_flint_fmpz_mat_right_kernel",
    returns=slong,
    abi=[
        out(
            "output",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="output",
                rows="columns",
                columns="columns",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        in_(
            "source",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="source",
                rows="rows",
                columns="columns",
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
def fmpz_mat_right_kernel(
    output: Writable[IntegerBuffer],
    source: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> uint64: ...


@flint.function(
    dynamic="ffiFmpqMatRank",
    symbol="sagejs_flint_fmpq_mat_rank_parts",
    returns=int,
    abi=[
        out(
            "output_rank",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="rank",
                rows="one",
                columns="one",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        in_(
            "numerators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="numerators",
                rows="rows",
                columns="columns",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_(
            "denominators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="denominators",
                rows="rows",
                columns="columns",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
    ],
    effects=Effects(
        pure=False, allocates=True, raises=[ValueError, OverflowError], writes=["rank"]
    ),
    result=Status(1, exception=ValueError, message="FLINT rational matrix rank failed"),
    wasm=True,
)
def fmpq_mat_rank(
    rank: Writable[IntegerBuffer],
    numerators: IntegerBuffer,
    denominators: IntegerBuffer,
    rows: uint64,
    columns: uint64,
    one: Min[uint64, 1],
) -> bool: ...


@flint.function(
    dynamic="ffiFmpqMatMul",
    symbol="sagejs_flint_fmpq_mat_mul_parts",
    returns=int,
    abi=[
        out(
            "output_numerators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="output_numerators",
                rows="left_rows",
                columns="right_columns",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "output_denominators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="output_denominators",
                rows="left_rows",
                columns="right_columns",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        in_(
            "left_numerators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="left_numerators",
                rows="left_rows",
                columns="inner",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_(
            "left_denominators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="left_denominators",
                rows="left_rows",
                columns="inner",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_(
            "right_numerators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="right_numerators",
                rows="inner",
                columns="right_columns",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_(
            "right_denominators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="right_denominators",
                rows="inner",
                columns="right_columns",
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
        writes=["output_numerators", "output_denominators"],
    ),
    result=Status(
        1, exception=ValueError, message="FLINT rational matrix multiplication failed"
    ),
    wasm=True,
)
def fmpq_mat_mul(
    output_numerators: Writable[IntegerBuffer],
    output_denominators: Writable[IntegerBuffer],
    left_numerators: IntegerBuffer,
    left_denominators: IntegerBuffer,
    right_numerators: IntegerBuffer,
    right_denominators: IntegerBuffer,
    left_rows: uint64,
    inner: uint64,
    right_columns: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpqMatRref",
    symbol="sagejs_flint_fmpq_mat_rref_parts",
    returns=int,
    abi=[
        out(
            "output_rank",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="rank",
                rows="one",
                columns="one",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "output_numerators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="output_numerators",
                rows="rows",
                columns="columns",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "output_denominators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="output_denominators",
                rows="rows",
                columns="columns",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        in_(
            "source_numerators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="source_numerators",
                rows="rows",
                columns="columns",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_(
            "source_denominators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="source_denominators",
                rows="rows",
                columns="columns",
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
        writes=["rank", "output_numerators", "output_denominators"],
    ),
    result=Status(1, exception=ValueError, message="FLINT rational matrix RREF failed"),
    wasm=True,
)
def fmpq_mat_rref(
    rank: Writable[IntegerBuffer],
    output_numerators: Writable[IntegerBuffer],
    output_denominators: Writable[IntegerBuffer],
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
    rows: uint64,
    columns: uint64,
    one: Min[uint64, 1],
) -> bool: ...


@flint.function(
    dynamic="ffiFmpqMatInv",
    symbol="sagejs_flint_fmpq_mat_inv_parts",
    returns=int,
    abi=[
        out(
            "output_numerators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="output_numerators",
                rows="size",
                columns="size",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "output_denominators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="output_denominators",
                rows="size",
                columns="size",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        in_(
            "source_numerators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="source_numerators",
                rows="size",
                columns="size",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_(
            "source_denominators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="source_denominators",
                rows="size",
                columns="size",
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
        writes=["output_numerators", "output_denominators"],
    ),
    result=Status(1, exception=ValueError, message="matrix is singular"),
    wasm=True,
)
def fmpq_mat_inv(
    output_numerators: Writable[IntegerBuffer],
    output_denominators: Writable[IntegerBuffer],
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
    size: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpqMatSolve",
    symbol="sagejs_flint_fmpq_mat_solve_parts",
    returns=int,
    abi=[
        out(
            "output_numerators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="output_numerators",
                rows="size",
                columns="right_columns",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "output_denominators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="output_denominators",
                rows="size",
                columns="right_columns",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        in_(
            "left_numerators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="left_numerators",
                rows="size",
                columns="size",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_(
            "left_denominators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="left_denominators",
                rows="size",
                columns="size",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_(
            "right_numerators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="right_numerators",
                rows="size",
                columns="right_columns",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_(
            "right_denominators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="right_denominators",
                rows="size",
                columns="right_columns",
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
        writes=["output_numerators", "output_denominators"],
    ),
    result=Status(1, exception=ValueError, message="matrix is singular"),
    wasm=True,
)
def fmpq_mat_solve(
    output_numerators: Writable[IntegerBuffer],
    output_denominators: Writable[IntegerBuffer],
    left_numerators: IntegerBuffer,
    left_denominators: IntegerBuffer,
    right_numerators: IntegerBuffer,
    right_denominators: IntegerBuffer,
    size: uint64,
    right_columns: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpqMatDet",
    symbol="sagejs_flint_fmpq_mat_det_parts",
    returns=int,
    abi=[
        out(
            "output_numerators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="output_numerators",
                rows="one",
                columns="one",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "output_denominators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="output_denominators",
                rows="one",
                columns="one",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        in_(
            "source_numerators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="source_numerators",
                rows="size",
                columns="size",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_(
            "source_denominators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="source_denominators",
                rows="size",
                columns="size",
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
        writes=["output_numerators", "output_denominators"],
    ),
    result=Status(1, exception=ValueError, message="FLINT rational determinant failed"),
    wasm=True,
)
def fmpq_mat_det(
    output_numerators: Writable[IntegerBuffer],
    output_denominators: Writable[IntegerBuffer],
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
    size: uint64,
    one: Min[uint64, 1],
) -> bool: ...


@flint.function(
    dynamic="ffiFmpqMatCharpoly",
    symbol="sagejs_flint_fmpq_mat_charpoly_parts",
    returns=int,
    abi=[
        out(
            "output_numerators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="output_numerators",
                rows="one",
                columns="coefficient_count",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "output_denominators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="output_denominators",
                rows="one",
                columns="coefficient_count",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        in_(
            "source_numerators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="source_numerators",
                rows="size",
                columns="size",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_(
            "source_denominators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="source_denominators",
                rows="size",
                columns="size",
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
        writes=["output_numerators", "output_denominators"],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="FLINT rational characteristic polynomial failed",
    ),
    wasm=True,
)
def fmpq_mat_charpoly(
    output_numerators: Writable[IntegerBuffer],
    output_denominators: Writable[IntegerBuffer],
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
    coefficient_count: uint64,
    size: uint64,
    one: Min[uint64, 1],
) -> bool: ...


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
) -> uint64: ...


@flint.function(
    dynamic="ffiNmodMatDet",
    symbol="nmod_mat_det",
    returns=ulong,
    abi=[
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
        pure=True,
        allocates=True,
        raises=[ValueError, OverflowError],
    ),
    result=Direct(),
    wasm=True,
)
def nmod_mat_det(
    source: UInt64Buffer,
    size: uint64,
    modulus: uint64,
) -> uint64: ...


@flint.function(
    dynamic="ffiNmodMatCharpoly",
    symbol="sagejs_flint_nmod_mat_charpoly_packed",
    returns=int,
    abi=[
        out(
            "coefficients",
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
            "entries",
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
        in_("source_length", uint64_t),
        in_("size", uint64_t),
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
        message="FLINT characteristic polynomial failed",
    ),
    wasm=True,
)
def nmod_mat_charpoly(
    output: Writable[UInt64Buffer],
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    size: uint64,
    modulus: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodMatMinpoly",
    symbol="sagejs_flint_nmod_mat_minpoly_packed",
    returns=int,
    abi=[
        out(
            "coefficients",
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
            "entries",
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
        in_("source_length", uint64_t),
        in_("size", uint64_t),
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
        message="FLINT minimal polynomial failed",
    ),
    wasm=True,
)
def nmod_mat_minpoly(
    output: Writable[UInt64Buffer],
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    size: uint64,
    modulus: uint64,
) -> bool: ...


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
) -> bool: ...


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
) -> uint64: ...


@flint.function(
    dynamic="ffiNmodMatMul",
    symbol="sagejs_flint_nmod_mat_mul",
    returns=int,
    abi=[
        out(
            "product",
            nmod_mat_t,
            packed_nmod_matrix(
                data="output",
                rows="left_rows",
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
                rows="left_rows",
                columns="inner",
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
                rows="inner",
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
    result=Status(
        1,
        exception=ValueError,
        message="FLINT matrix multiplication failed",
    ),
    wasm=True,
)
def nmod_mat_mul(
    output: Writable[UInt64Buffer],
    left: UInt64Buffer,
    right: UInt64Buffer,
    left_rows: uint64,
    inner: uint64,
    right_columns: uint64,
    modulus: uint64,
) -> bool: ...


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
) -> uint64: ...


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
) -> bool: ...


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
) -> bool: ...

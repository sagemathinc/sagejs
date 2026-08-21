"""Safe FLINT declarations lowered statically to flint.ffi.json."""

from sagejs.ffi.declare import (
    Direct,
    Effects,
    Library,
    Min,
    Nullable,
    Status,
    Writable,
    copied_bytes,
    computed_bytes,
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
        "sagejs/exact_polynomial_ffi.h",
        "sagejs/exact_vector_ffi.h",
        "sagejs/ffi_algorithms.h",
        "sagejs/fmpz_matrix_ffi.h",
        "sagejs/fmpq_matrix_ffi.h",
        "sagejs/fmpz_mod_polynomial_ffi.h",
        "sagejs/fq_polynomial_ffi.h",
        "sagejs/nmod_matrix_ffi.h",
        "sagejs/number_field_analysis_resource_ffi.h",
        "sagejs/number_field_order_ffi.h",
        "sagejs/number_field_order_resource_ffi.h",
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


FmpzMatrix = flint.resource(
    id="fmpz_matrix",
    abi=sagejs_fmpz_matrix_t,
    ownership="owned",
    close="ffiFmpzMatrixClose",
    clear="sagejs_fmpz_matrix_clear",
    size="sagejs_fmpz_matrix_allocated_bytes",
    wasm=True,
)


FmpqMatrix = flint.resource(
    id="fmpq_matrix",
    abi=sagejs_fmpq_matrix_t,
    ownership="owned",
    close="ffiFmpqMatrixClose",
    clear="sagejs_fmpq_matrix_clear",
    size="sagejs_fmpq_matrix_allocated_bytes",
    wasm=True,
)


FmpzVector = flint.resource(
    id="fmpz_vector",
    abi=sagejs_fmpz_vector_t,
    ownership="owned",
    close="ffiFmpzVectorClose",
    clear="sagejs_fmpz_vector_clear",
    size="sagejs_fmpz_vector_allocated_bytes",
    wasm=True,
)


FmpqVector = flint.resource(
    id="fmpq_vector",
    abi=sagejs_fmpq_vector_t,
    ownership="owned",
    close="ffiFmpqVectorClose",
    clear="sagejs_fmpq_vector_clear",
    size="sagejs_fmpq_vector_allocated_bytes",
    wasm=True,
)


NmodMatrix = flint.resource(
    id="nmod_matrix",
    abi=sagejs_nmod_matrix_t,
    ownership="owned",
    close="ffiNmodMatrixClose",
    clear="sagejs_nmod_matrix_clear",
    size="sagejs_nmod_matrix_allocated_bytes",
    wasm=True,
)


FmpqValue = flint.resource(
    id="fmpq_value",
    abi=sagejs_fmpq_value_t,
    ownership="owned",
    close="ffiFmpqValueClose",
    clear="sagejs_fmpq_value_clear",
    size="sagejs_fmpq_value_allocated_bytes",
    wasm=True,
)


FlintByteRegion = flint.resource(
    id="byte_region",
    abi=sagejs_flint_byte_region_t,
    ownership="owned",
    close="ffiFlintByteRegionClose",
    clear="sagejs_flint_byte_region_clear",
    size="sagejs_flint_byte_region_allocated_bytes",
    host_transfer=copied_bytes(
        dynamic="ffiFlintByteRegionCopyBytes",
        data="sagejs_flint_byte_region_data",
        length="sagejs_flint_byte_region_length",
        wasm=True,
    ),
    host_ingress=copied_bytes(
        dynamic="ffiFlintByteRegionFromBytes",
        init="sagejs_flint_byte_region_init_copy",
        wasm=True,
    ),
    wasm=True,
)


NumberFieldOrderResource = flint.resource(
    id="number_field_order_resource",
    abi=sagejs_number_field_order_resource_t,
    ownership="owned",
    close="ffiNumberFieldOrderResourceClose",
    clear="sagejs_number_field_order_resource_clear",
    size="sagejs_number_field_order_resource_allocated_bytes",
    host_transfer=copied_bytes(
        dynamic="ffiNumberFieldOrderResourceCopyBytes",
        data="sagejs_number_field_order_resource_data",
        length="sagejs_number_field_order_resource_length",
        wasm=False,
    ),
    wasm=False,
)


NumberFieldAnalysisResource = flint.resource(
    id="number_field_analysis_resource",
    abi=sagejs_number_field_analysis_resource_t,
    ownership="owned",
    close="ffiNumberFieldAnalysisResourceClose",
    clear="sagejs_number_field_analysis_resource_clear",
    size="sagejs_number_field_analysis_resource_allocated_bytes",
    host_transfer=copied_bytes(
        dynamic="ffiNumberFieldAnalysisResourceCopyBytes",
        data="sagejs_number_field_analysis_resource_data",
        length="sagejs_number_field_analysis_resource_length",
        wasm=False,
    ),
    wasm=False,
)


FmpzPolynomial = flint.resource(
    id="fmpz_polynomial",
    abi=sagejs_fmpz_polynomial_t,
    ownership="owned",
    close="ffiFmpzPolynomialClose",
    clear="sagejs_fmpz_polynomial_clear",
    size="sagejs_fmpz_polynomial_allocated_bytes",
    wasm=False,
)


FmpqPolynomial = flint.resource(
    id="fmpq_polynomial",
    abi=sagejs_fmpq_polynomial_t,
    ownership="owned",
    close="ffiFmpqPolynomialClose",
    clear="sagejs_fmpq_polynomial_clear",
    size="sagejs_fmpq_polynomial_allocated_bytes",
    wasm=False,
)


FmpzModPolynomial = flint.resource(
    id="fmpz_mod_polynomial",
    abi=sagejs_fmpz_mod_polynomial_t,
    ownership="owned",
    close="ffiFmpzModPolynomialClose",
    clear="sagejs_fmpz_mod_polynomial_clear",
    size="sagejs_fmpz_mod_polynomial_allocated_bytes",
    wasm=True,
)


FmpzModPolynomialDivisionResult = flint.resource(
    id="fmpz_mod_polynomial_division_result",
    abi=sagejs_fmpz_mod_polynomial_division_result_t,
    ownership="owned",
    close="ffiFmpzModPolynomialDivisionResultClose",
    clear="sagejs_fmpz_mod_polynomial_division_result_clear",
    size="sagejs_fmpz_mod_polynomial_division_result_allocated_bytes",
    wasm=True,
)


FmpzModPolynomialXgcdResult = flint.resource(
    id="fmpz_mod_polynomial_xgcd_result",
    abi=sagejs_fmpz_mod_polynomial_xgcd_result_t,
    ownership="owned",
    close="ffiFmpzModPolynomialXgcdResultClose",
    clear="sagejs_fmpz_mod_polynomial_xgcd_result_clear",
    size="sagejs_fmpz_mod_polynomial_xgcd_result_allocated_bytes",
    wasm=True,
)


FmpzModPolynomialFactorization = flint.resource(
    id="fmpz_mod_polynomial_factorization",
    abi=sagejs_fmpz_mod_polynomial_factorization_t,
    ownership="owned",
    close="ffiFmpzModPolynomialFactorizationClose",
    clear="sagejs_fmpz_mod_polynomial_factorization_clear",
    size="sagejs_fmpz_mod_polynomial_factorization_allocated_bytes",
    host_transfer=computed_bytes(
        dynamic="ffiFmpzModPolynomialFactorizationCopyBytes",
        copy="sagejs_fmpz_mod_polynomial_factorization_copy_bytes",
        clear="sagejs_fmpz_mod_polynomial_free_bytes",
        wasm=False,
    ),
    wasm=False,
)


FmpzModPolynomialRoots = flint.resource(
    id="fmpz_mod_polynomial_roots",
    abi=sagejs_fmpz_mod_polynomial_roots_t,
    ownership="owned",
    close="ffiFmpzModPolynomialRootsClose",
    clear="sagejs_fmpz_mod_polynomial_roots_clear",
    size="sagejs_fmpz_mod_polynomial_roots_allocated_bytes",
    host_transfer=computed_bytes(
        dynamic="ffiFmpzModPolynomialRootsCopyBytes",
        copy="sagejs_fmpz_mod_polynomial_roots_copy_bytes",
        clear="sagejs_fmpz_mod_polynomial_free_bytes",
        wasm=False,
    ),
    wasm=False,
)


# These three owned handles share one internally retained, thread-affine FLINT
# context.  Every operation below is therefore explicitly `thread_safe=False`.
# Dependents survive closing the public context wrapper and retain the context
# until the last element or polynomial closes.
FqContext = flint.resource(
    id="fq_context",
    abi=sagejs_fq_context_t,
    ownership="owned",
    close="ffiFqContextClose",
    clear="sagejs_fq_context_clear",
    size="sagejs_fq_context_allocated_bytes",
    wasm=True,
)


FqElement = flint.resource(
    id="fq_element",
    abi=sagejs_fq_element_t,
    ownership="owned",
    close="ffiFqElementClose",
    clear="sagejs_fq_element_clear",
    size="sagejs_fq_element_allocated_bytes",
    wasm=True,
)


FqPolynomial = flint.resource(
    id="fq_polynomial",
    abi=sagejs_fq_polynomial_t,
    ownership="owned",
    close="ffiFqPolynomialClose",
    clear="sagejs_fq_polynomial_clear",
    size="sagejs_fq_polynomial_allocated_bytes",
    wasm=True,
)


ExactPolynomialFactorization = flint.resource(
    id="exact_polynomial_factorization",
    abi=sagejs_exact_polynomial_factorization_t,
    ownership="owned",
    close="ffiExactPolynomialFactorizationClose",
    clear="sagejs_exact_polynomial_factorization_clear",
    size="sagejs_exact_polynomial_factorization_allocated_bytes",
    host_transfer=computed_bytes(
        dynamic="ffiExactPolynomialFactorizationCopyBytes",
        copy="sagejs_exact_polynomial_factorization_copy_bytes",
        clear="sagejs_exact_polynomial_factorization_free_bytes",
        wasm=False,
    ),
    wasm=False,
)


FmpzPolynomialDivisionResult = flint.resource(
    id="fmpz_polynomial_division_result",
    abi=sagejs_fmpz_polynomial_division_result_t,
    ownership="owned",
    close="ffiFmpzPolynomialDivisionResultClose",
    clear="sagejs_fmpz_polynomial_division_result_clear",
    size="sagejs_fmpz_polynomial_division_result_allocated_bytes",
    wasm=False,
)


FmpqPolynomialDivisionResult = flint.resource(
    id="fmpq_polynomial_division_result",
    abi=sagejs_fmpq_polynomial_division_result_t,
    ownership="owned",
    close="ffiFmpqPolynomialDivisionResultClose",
    clear="sagejs_fmpq_polynomial_division_result_clear",
    size="sagejs_fmpq_polynomial_division_result_allocated_bytes",
    wasm=False,
)


# These aggregate owners follow the existing exact-polynomial resource path.
# Their `wasm=False` is that path's current portability limitation; browsers
# execute the ordinary-Python fallback until generated Wasm ownership lands.
FmpzPolynomialXgcdResult = flint.resource(
    id="fmpz_polynomial_xgcd_result",
    abi=sagejs_fmpz_polynomial_xgcd_result_t,
    ownership="owned",
    close="ffiFmpzPolynomialXgcdResultClose",
    clear="sagejs_fmpz_polynomial_xgcd_result_clear",
    size="sagejs_fmpz_polynomial_xgcd_result_allocated_bytes",
    wasm=False,
)


FmpqPolynomialXgcdResult = flint.resource(
    id="fmpq_polynomial_xgcd_result",
    abi=sagejs_fmpq_polynomial_xgcd_result_t,
    ownership="owned",
    close="ffiFmpqPolynomialXgcdResultClose",
    clear="sagejs_fmpq_polynomial_xgcd_result_clear",
    size="sagejs_fmpq_polynomial_xgcd_result_allocated_bytes",
    wasm=False,
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
    dynamic="ffiFmpzPolynomialCreate",
    symbol="sagejs_fmpz_polynomial_init",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("length", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[OverflowError]),
    result=Status(
        1,
        exception=OverflowError,
        message="integer polynomial length is too large",
    ),
    wasm=False,
)
def fmpz_polynomial(length: uint64) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpzPolynomialSetCoefficient",
    symbol="sagejs_fmpz_polynomial_set_coefficient",
    returns=int,
    abi=[
        in_("polynomial", sagejs_fmpz_polynomial_t),
        in_("index", uint64_t),
        in_("coefficient", fmpz_t),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError],
        writes=["polynomial"],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="integer polynomial builder is sealed or index is out of bounds",
    ),
    wasm=False,
)
def fmpz_polynomial_set_coefficient(
    polynomial: Writable[FmpzPolynomial],
    index: uint64,
    coefficient: Integer,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpzPolynomialSeal",
    symbol="sagejs_fmpz_polynomial_seal",
    returns=int,
    abi=[in_("polynomial", sagejs_fmpz_polynomial_t)],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError],
        writes=["polynomial"],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="integer polynomial builder is already sealed",
    ),
    wasm=False,
)
def fmpz_polynomial_seal(polynomial: Writable[FmpzPolynomial]) -> bool: ...


@flint.function(
    dynamic="ffiFmpzPolynomialLength",
    symbol="sagejs_fmpz_polynomial_length",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("polynomial", sagejs_fmpz_polynomial_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="integer polynomial is unsealed"),
    wasm=False,
)
def fmpz_polynomial_length(polynomial: FmpzPolynomial) -> Integer: ...


@flint.function(
    dynamic="ffiFmpzPolynomialEqual",
    symbol="sagejs_fmpz_polynomial_equal",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("left", sagejs_fmpz_polynomial_t),
        in_("right", sagejs_fmpz_polynomial_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer polynomial equality requires sealed resources",
    ),
    wasm=False,
)
def fmpz_polynomial_equal(
    left: FmpzPolynomial,
    right: FmpzPolynomial,
) -> Integer: ...


@flint.function(
    dynamic="ffiFmpzPolynomialCoefficient",
    symbol="sagejs_fmpz_polynomial_coefficient",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("polynomial", sagejs_fmpz_polynomial_t),
        in_("index", uint64_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer polynomial coefficient is out of bounds",
    ),
    wasm=False,
)
def fmpz_polynomial_coefficient(
    polynomial: FmpzPolynomial,
    index: uint64,
) -> Integer: ...


@flint.function(
    dynamic="ffiFmpzPolynomialAdd",
    symbol="sagejs_fmpz_polynomial_add",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("left", sagejs_fmpz_polynomial_t),
        in_("right", sagejs_fmpz_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="integer polynomial is unsealed"),
    wasm=False,
)
def fmpz_polynomial_add(
    left: FmpzPolynomial,
    right: FmpzPolynomial,
) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpzPolynomialSub",
    symbol="sagejs_fmpz_polynomial_sub",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("left", sagejs_fmpz_polynomial_t),
        in_("right", sagejs_fmpz_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="integer polynomial is unsealed"),
    wasm=False,
)
def fmpz_polynomial_sub(
    left: FmpzPolynomial,
    right: FmpzPolynomial,
) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpzPolynomialNeg",
    symbol="sagejs_fmpz_polynomial_neg",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("source", sagejs_fmpz_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="integer polynomial is unsealed"),
    wasm=False,
)
def fmpz_polynomial_neg(source: FmpzPolynomial) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpzPolynomialScalarFloorDiv",
    symbol="sagejs_fmpz_polynomial_scalar_floor_div",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("source", sagejs_fmpz_polynomial_t),
        in_("divisor", fmpz_t),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="integer polynomial scalar division requires a sealed resource and a nonzero divisor",
    ),
    wasm=False,
)
def fmpz_polynomial_scalar_floor_div(
    source: FmpzPolynomial,
    divisor: Integer,
) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpzPolynomialTruncate",
    symbol="sagejs_fmpz_polynomial_truncate",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("source", sagejs_fmpz_polynomial_t),
        in_("stop", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError, OverflowError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer polynomial truncation requires a sealed resource and a supported stop",
    ),
    wasm=False,
)
def fmpz_polynomial_truncate(
    source: FmpzPolynomial,
    stop: uint64,
) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpzPolynomialCompose",
    symbol="sagejs_fmpz_polynomial_compose",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("outer", sagejs_fmpz_polynomial_t),
        in_("inner", sagejs_fmpz_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer polynomial composition requires sealed resources",
    ),
    wasm=False,
)
def fmpz_polynomial_compose(
    outer: FmpzPolynomial,
    inner: FmpzPolynomial,
) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpzPolynomialReverse",
    symbol="sagejs_fmpz_polynomial_reverse",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("source", sagejs_fmpz_polynomial_t),
        in_("length", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError, OverflowError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer polynomial reversal requires a sealed resource and supported length",
    ),
    wasm=False,
)
def fmpz_polynomial_reverse(
    source: FmpzPolynomial,
    length: uint64,
) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpzPolynomialShiftLeft",
    symbol="sagejs_fmpz_polynomial_shift_left",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("source", sagejs_fmpz_polynomial_t),
        in_("amount", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError, OverflowError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer polynomial left shift requires a sealed resource and supported amount",
    ),
    wasm=False,
)
def fmpz_polynomial_shift_left(
    source: FmpzPolynomial,
    amount: uint64,
) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpzPolynomialShiftRight",
    symbol="sagejs_fmpz_polynomial_shift_right",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("source", sagejs_fmpz_polynomial_t),
        in_("amount", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError, OverflowError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer polynomial right shift requires a sealed resource and supported amount",
    ),
    wasm=False,
)
def fmpz_polynomial_shift_right(
    source: FmpzPolynomial,
    amount: uint64,
) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpzPolynomialIntegral",
    symbol="sagejs_fmpq_polynomial_from_fmpz_integral",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("source", sagejs_fmpz_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer polynomial integration requires a sealed resource",
    ),
    wasm=False,
)
def fmpz_polynomial_integral(source: FmpzPolynomial) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpzPolynomialResultant",
    symbol="sagejs_fmpz_polynomial_resultant",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("left", sagejs_fmpz_polynomial_t),
        in_("right", sagejs_fmpz_polynomial_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer polynomial resultant requires sealed resources",
    ),
    wasm=False,
)
def fmpz_polynomial_resultant(
    left: FmpzPolynomial,
    right: FmpzPolynomial,
) -> Integer: ...


@flint.function(
    dynamic="ffiFmpzPolynomialDiscriminant",
    symbol="sagejs_fmpz_polynomial_discriminant",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("source", sagejs_fmpz_polynomial_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer polynomial discriminant requires a sealed resource",
    ),
    wasm=False,
)
def fmpz_polynomial_discriminant(source: FmpzPolynomial) -> Integer: ...


@flint.function(
    dynamic="ffiFmpzPolynomialDerivative",
    symbol="sagejs_fmpz_polynomial_derivative",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("source", sagejs_fmpz_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="integer polynomial is unsealed"),
    wasm=False,
)
def fmpz_polynomial_derivative(source: FmpzPolynomial) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpzPolynomialMul",
    symbol="sagejs_fmpz_polynomial_mul",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("left", sagejs_fmpz_polynomial_t),
        in_("right", sagejs_fmpz_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="integer polynomial is unsealed"),
    wasm=False,
)
def fmpz_polynomial_mul(
    left: FmpzPolynomial,
    right: FmpzPolynomial,
) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpzPolynomialGcd",
    symbol="sagejs_fmpz_polynomial_gcd",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("left", sagejs_fmpz_polynomial_t),
        in_("right", sagejs_fmpz_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="integer polynomial is unsealed"),
    wasm=False,
)
def fmpz_polynomial_gcd(
    left: FmpzPolynomial,
    right: FmpzPolynomial,
) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpzPolynomialXgcdResource",
    symbol="sagejs_fmpz_polynomial_xgcd_resource",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_xgcd_result_t),
        in_("left", sagejs_fmpz_polynomial_t),
        in_("right", sagejs_fmpz_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="integer polynomial is unsealed"),
    wasm=False,
)
def fmpz_polynomial_xgcd_resource(
    left: FmpzPolynomial,
    right: FmpzPolynomial,
) -> FmpzPolynomialXgcdResult: ...


@flint.function(
    dynamic="ffiFmpzPolynomialXgcdResultGcd",
    symbol="sagejs_fmpz_polynomial_xgcd_result_gcd",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("xgcd", sagejs_fmpz_polynomial_xgcd_result_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="invalid integer xgcd result"),
    wasm=False,
)
def fmpz_polynomial_xgcd_result_gcd(
    xgcd: FmpzPolynomialXgcdResult,
) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpzPolynomialXgcdResultLeftCoefficient",
    symbol="sagejs_fmpz_polynomial_xgcd_result_left_coefficient",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("xgcd", sagejs_fmpz_polynomial_xgcd_result_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="invalid integer xgcd result"),
    wasm=False,
)
def fmpz_polynomial_xgcd_result_left_coefficient(
    xgcd: FmpzPolynomialXgcdResult,
) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpzPolynomialXgcdResultRightCoefficient",
    symbol="sagejs_fmpz_polynomial_xgcd_result_right_coefficient",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("xgcd", sagejs_fmpz_polynomial_xgcd_result_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="invalid integer xgcd result"),
    wasm=False,
)
def fmpz_polynomial_xgcd_result_right_coefficient(
    xgcd: FmpzPolynomialXgcdResult,
) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpzPolynomialFactorResource",
    symbol="sagejs_fmpz_polynomial_factor_resource",
    returns=int,
    abi=[
        out("result", sagejs_exact_polynomial_factorization_t),
        in_("source", sagejs_fmpz_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="factorization of 0 is not defined",
    ),
    wasm=False,
)
def fmpz_polynomial_factor_resource(
    source: FmpzPolynomial,
) -> ExactPolynomialFactorization: ...


@flint.function(
    dynamic="ffiFmpzPolynomialDivExact",
    symbol="sagejs_fmpz_polynomial_divexact",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("dividend", sagejs_fmpz_polynomial_t),
        in_("divisor", sagejs_fmpz_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message=(
            "integer polynomial exact division requires sealed resources, "
            "a nonzero divisor, and an exact quotient"
        ),
    ),
    wasm=False,
)
def fmpz_polynomial_divexact(
    dividend: FmpzPolynomial,
    divisor: FmpzPolynomial,
) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpzPolynomialQuoRemResource",
    symbol="sagejs_fmpz_polynomial_quo_rem_resource",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_division_result_t),
        in_("dividend", sagejs_fmpz_polynomial_t),
        in_("divisor", sagejs_fmpz_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer polynomial division requires sealed resources and a nonzero divisor",
    ),
    wasm=False,
)
def fmpz_polynomial_quo_rem_resource(
    dividend: FmpzPolynomial,
    divisor: FmpzPolynomial,
) -> FmpzPolynomialDivisionResult: ...


@flint.function(
    dynamic="ffiFmpzPolynomialDivisionResultQuotient",
    symbol="sagejs_fmpz_polynomial_division_result_quotient",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("division", sagejs_fmpz_polynomial_division_result_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="invalid integer division result"),
    wasm=False,
)
def fmpz_polynomial_division_result_quotient(
    division: FmpzPolynomialDivisionResult,
) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpzPolynomialDivisionResultRemainder",
    symbol="sagejs_fmpz_polynomial_division_result_remainder",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("division", sagejs_fmpz_polynomial_division_result_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="invalid integer division result"),
    wasm=False,
)
def fmpz_polynomial_division_result_remainder(
    division: FmpzPolynomialDivisionResult,
) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpzPolynomialPow",
    symbol="sagejs_fmpz_polynomial_pow",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("source", sagejs_fmpz_polynomial_t),
        in_("exponent", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[OverflowError]),
    result=Status(
        1,
        exception=OverflowError,
        message="integer polynomial exponent is too large",
    ),
    wasm=False,
)
def fmpz_polynomial_pow(
    source: FmpzPolynomial,
    exponent: uint64,
) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpzPolynomialCyclotomic",
    symbol="sagejs_fmpz_polynomial_cyclotomic",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("order", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="cyclotomic polynomial degree must be positive",
    ),
    wasm=False,
)
def fmpz_polynomial_cyclotomic(order: uint64) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpzPolynomialEvaluate",
    symbol="sagejs_fmpz_polynomial_evaluate",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("source", sagejs_fmpz_polynomial_t),
        in_("argument", fmpz_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="integer polynomial is unsealed"),
    wasm=False,
)
def fmpz_polynomial_evaluate(
    source: FmpzPolynomial,
    argument: Integer,
) -> Integer: ...


@flint.function(
    dynamic="ffiFmpzPolynomialEvaluateRational",
    symbol="sagejs_fmpz_polynomial_evaluate_rational",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_value_t),
        in_("source", sagejs_fmpz_polynomial_t),
        in_("numerator", fmpz_t),
        in_("denominator", fmpz_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid rational argument for integer polynomial evaluation",
    ),
    wasm=False,
)
def fmpz_polynomial_evaluate_rational(
    source: FmpzPolynomial,
    numerator: Integer,
    denominator: Integer,
) -> FmpqValue: ...


@flint.function(
    dynamic="ffiFmpzPolynomialSerialize",
    symbol="sagejs_fmpz_polynomial_serialize",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("source", sagejs_fmpz_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[OverflowError]),
    result=Status(
        1,
        exception=OverflowError,
        message="integer polynomial serialization is too large",
    ),
    wasm=False,
)
def fmpz_polynomial_serialize(source: FmpzPolynomial) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiFmpzPolynomialFormat",
    symbol="sagejs_fmpz_polynomial_format",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("source", sagejs_fmpz_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(
        1,
        exception=RuntimeError,
        message="integer polynomial formatting failed",
    ),
    wasm=False,
)
def fmpz_polynomial_format(source: FmpzPolynomial) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiFmpzPolynomialFromByteRegion",
    symbol="sagejs_fmpz_polynomial_from_byte_region",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("source", sagejs_flint_byte_region_t),
        in_("offset", uint64_t),
        in_("length", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid SJPZ v1 integer polynomial serialization",
    ),
    wasm=False,
)
def fmpz_polynomial_from_byte_region(
    source: FlintByteRegion,
    offset: uint64,
    length: uint64,
) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialCreate",
    symbol="sagejs_fmpq_polynomial_init",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("length", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[OverflowError]),
    result=Status(
        1,
        exception=OverflowError,
        message="rational polynomial length is too large",
    ),
    wasm=False,
)
def fmpq_polynomial(length: uint64) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialSetCoefficient",
    symbol="sagejs_fmpq_polynomial_set_coefficient",
    returns=int,
    abi=[
        in_("polynomial", sagejs_fmpq_polynomial_t),
        in_("index", uint64_t),
        in_("numerator", fmpz_t),
        in_("denominator", fmpz_t),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError],
        writes=["polynomial"],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="invalid rational polynomial builder coefficient",
    ),
    wasm=False,
)
def fmpq_polynomial_set_coefficient(
    polynomial: Writable[FmpqPolynomial],
    index: uint64,
    numerator: Integer,
    denominator: Integer,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpqPolynomialSeal",
    symbol="sagejs_fmpq_polynomial_seal",
    returns=int,
    abi=[in_("polynomial", sagejs_fmpq_polynomial_t)],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError],
        writes=["polynomial"],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="rational polynomial builder is already sealed",
    ),
    wasm=False,
)
def fmpq_polynomial_seal(polynomial: Writable[FmpqPolynomial]) -> bool: ...


@flint.function(
    dynamic="ffiFmpqPolynomialLength",
    symbol="sagejs_fmpq_polynomial_length",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("polynomial", sagejs_fmpq_polynomial_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="rational polynomial is unsealed"),
    wasm=False,
)
def fmpq_polynomial_length(polynomial: FmpqPolynomial) -> Integer: ...


@flint.function(
    dynamic="ffiFmpqPolynomialEqual",
    symbol="sagejs_fmpq_polynomial_equal",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("left", sagejs_fmpq_polynomial_t),
        in_("right", sagejs_fmpq_polynomial_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational polynomial equality requires sealed resources",
    ),
    wasm=False,
)
def fmpq_polynomial_equal(
    left: FmpqPolynomial,
    right: FmpqPolynomial,
) -> Integer: ...


@flint.function(
    dynamic="ffiFmpqPolynomialCoefficientNumerator",
    symbol="sagejs_fmpq_polynomial_coefficient_numerator",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("polynomial", sagejs_fmpq_polynomial_t),
        in_("index", uint64_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational polynomial coefficient is out of bounds",
    ),
    wasm=False,
)
def fmpq_polynomial_coefficient_numerator(
    polynomial: FmpqPolynomial,
    index: uint64,
) -> Integer: ...


@flint.function(
    dynamic="ffiFmpqPolynomialCoefficientDenominator",
    symbol="sagejs_fmpq_polynomial_coefficient_denominator",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("polynomial", sagejs_fmpq_polynomial_t),
        in_("index", uint64_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational polynomial coefficient is out of bounds",
    ),
    wasm=False,
)
def fmpq_polynomial_coefficient_denominator(
    polynomial: FmpqPolynomial,
    index: uint64,
) -> Integer: ...


@flint.function(
    dynamic="ffiFmpqPolynomialAdd",
    symbol="sagejs_fmpq_polynomial_add",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("left", sagejs_fmpq_polynomial_t),
        in_("right", sagejs_fmpq_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="rational polynomial is unsealed"),
    wasm=False,
)
def fmpq_polynomial_add(
    left: FmpqPolynomial,
    right: FmpqPolynomial,
) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialSub",
    symbol="sagejs_fmpq_polynomial_sub",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("left", sagejs_fmpq_polynomial_t),
        in_("right", sagejs_fmpq_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="rational polynomial is unsealed"),
    wasm=False,
)
def fmpq_polynomial_sub(
    left: FmpqPolynomial,
    right: FmpqPolynomial,
) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialNeg",
    symbol="sagejs_fmpq_polynomial_neg",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("source", sagejs_fmpq_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="rational polynomial is unsealed"),
    wasm=False,
)
def fmpq_polynomial_neg(source: FmpqPolynomial) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialScalarDiv",
    symbol="sagejs_fmpq_polynomial_scalar_div",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("source", sagejs_fmpq_polynomial_t),
        in_("numerator", fmpz_t),
        in_("denominator", fmpz_t),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="rational polynomial scalar division requires a sealed resource and a nonzero divisor",
    ),
    wasm=False,
)
def fmpq_polynomial_scalar_div(
    source: FmpqPolynomial,
    numerator: Integer,
    denominator: Integer,
) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialTruncate",
    symbol="sagejs_fmpq_polynomial_truncate",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("source", sagejs_fmpq_polynomial_t),
        in_("stop", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError, OverflowError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational polynomial truncation requires a sealed resource and a supported stop",
    ),
    wasm=False,
)
def fmpq_polynomial_truncate(
    source: FmpqPolynomial,
    stop: uint64,
) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialCompose",
    symbol="sagejs_fmpq_polynomial_compose",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("outer", sagejs_fmpq_polynomial_t),
        in_("inner", sagejs_fmpq_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational polynomial composition requires sealed resources",
    ),
    wasm=False,
)
def fmpq_polynomial_compose(
    outer: FmpqPolynomial,
    inner: FmpqPolynomial,
) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialReverse",
    symbol="sagejs_fmpq_polynomial_reverse",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("source", sagejs_fmpq_polynomial_t),
        in_("length", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError, OverflowError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational polynomial reversal requires a sealed resource and supported length",
    ),
    wasm=False,
)
def fmpq_polynomial_reverse(
    source: FmpqPolynomial,
    length: uint64,
) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialShiftLeft",
    symbol="sagejs_fmpq_polynomial_shift_left",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("source", sagejs_fmpq_polynomial_t),
        in_("amount", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError, OverflowError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational polynomial left shift requires a sealed resource and supported amount",
    ),
    wasm=False,
)
def fmpq_polynomial_shift_left(
    source: FmpqPolynomial,
    amount: uint64,
) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialShiftRight",
    symbol="sagejs_fmpq_polynomial_shift_right",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("source", sagejs_fmpq_polynomial_t),
        in_("amount", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError, OverflowError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational polynomial right shift requires a sealed resource and supported amount",
    ),
    wasm=False,
)
def fmpq_polynomial_shift_right(
    source: FmpqPolynomial,
    amount: uint64,
) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialIntegral",
    symbol="sagejs_fmpq_polynomial_integral",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("source", sagejs_fmpq_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational polynomial integration requires a sealed resource",
    ),
    wasm=False,
)
def fmpq_polynomial_integral(source: FmpqPolynomial) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialResultant",
    symbol="sagejs_fmpq_polynomial_resultant",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_value_t),
        in_("left", sagejs_fmpq_polynomial_t),
        in_("right", sagejs_fmpq_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational polynomial resultant requires sealed resources",
    ),
    wasm=False,
)
def fmpq_polynomial_resultant(
    left: FmpqPolynomial,
    right: FmpqPolynomial,
) -> FmpqValue: ...


@flint.function(
    dynamic="ffiFmpqPolynomialDiscriminant",
    symbol="sagejs_fmpq_polynomial_discriminant",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_value_t),
        in_("source", sagejs_fmpq_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational polynomial discriminant requires a sealed resource",
    ),
    wasm=False,
)
def fmpq_polynomial_discriminant(source: FmpqPolynomial) -> FmpqValue: ...


@flint.function(
    dynamic="ffiFmpqPolynomialDerivative",
    symbol="sagejs_fmpq_polynomial_derivative",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("source", sagejs_fmpq_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="rational polynomial is unsealed"),
    wasm=False,
)
def fmpq_polynomial_derivative(source: FmpqPolynomial) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialMul",
    symbol="sagejs_fmpq_polynomial_mul",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("left", sagejs_fmpq_polynomial_t),
        in_("right", sagejs_fmpq_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="rational polynomial is unsealed"),
    wasm=False,
)
def fmpq_polynomial_mul(
    left: FmpqPolynomial,
    right: FmpqPolynomial,
) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialGcd",
    symbol="sagejs_fmpq_polynomial_gcd",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("left", sagejs_fmpq_polynomial_t),
        in_("right", sagejs_fmpq_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="rational polynomial is unsealed"),
    wasm=False,
)
def fmpq_polynomial_gcd(
    left: FmpqPolynomial,
    right: FmpqPolynomial,
) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialXgcdResource",
    symbol="sagejs_fmpq_polynomial_xgcd_resource",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_xgcd_result_t),
        in_("left", sagejs_fmpq_polynomial_t),
        in_("right", sagejs_fmpq_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="rational polynomial is unsealed"),
    wasm=False,
)
def fmpq_polynomial_xgcd_resource(
    left: FmpqPolynomial,
    right: FmpqPolynomial,
) -> FmpqPolynomialXgcdResult: ...


@flint.function(
    dynamic="ffiFmpqPolynomialXgcdResultGcd",
    symbol="sagejs_fmpq_polynomial_xgcd_result_gcd",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("xgcd", sagejs_fmpq_polynomial_xgcd_result_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="invalid rational xgcd result"),
    wasm=False,
)
def fmpq_polynomial_xgcd_result_gcd(
    xgcd: FmpqPolynomialXgcdResult,
) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialXgcdResultLeftCoefficient",
    symbol="sagejs_fmpq_polynomial_xgcd_result_left_coefficient",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("xgcd", sagejs_fmpq_polynomial_xgcd_result_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="invalid rational xgcd result"),
    wasm=False,
)
def fmpq_polynomial_xgcd_result_left_coefficient(
    xgcd: FmpqPolynomialXgcdResult,
) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialXgcdResultRightCoefficient",
    symbol="sagejs_fmpq_polynomial_xgcd_result_right_coefficient",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("xgcd", sagejs_fmpq_polynomial_xgcd_result_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="invalid rational xgcd result"),
    wasm=False,
)
def fmpq_polynomial_xgcd_result_right_coefficient(
    xgcd: FmpqPolynomialXgcdResult,
) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialFactorResource",
    symbol="sagejs_fmpq_polynomial_factor_resource",
    returns=int,
    abi=[
        out("result", sagejs_exact_polynomial_factorization_t),
        in_("source", sagejs_fmpq_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="factorization of 0 is not defined",
    ),
    wasm=False,
)
def fmpq_polynomial_factor_resource(
    source: FmpqPolynomial,
) -> ExactPolynomialFactorization: ...


@flint.function(
    dynamic="ffiExactPolynomialFactorizationCount",
    symbol="sagejs_exact_polynomial_factorization_count",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("factorization", sagejs_exact_polynomial_factorization_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="invalid factorization"),
    wasm=False,
)
def exact_polynomial_factorization_count(
    factorization: ExactPolynomialFactorization,
) -> Integer: ...


@flint.function(
    dynamic="ffiExactPolynomialFactorizationExponent",
    symbol="sagejs_exact_polynomial_factorization_exponent",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("factorization", sagejs_exact_polynomial_factorization_t),
        in_("index", uint64_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="factor index is out of bounds",
    ),
    wasm=False,
)
def exact_polynomial_factorization_exponent(
    factorization: ExactPolynomialFactorization,
    index: uint64,
) -> Integer: ...


@flint.function(
    dynamic="ffiExactPolynomialFactorizationUnitNumerator",
    symbol="sagejs_exact_polynomial_factorization_unit_numerator",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("factorization", sagejs_exact_polynomial_factorization_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="invalid factorization"),
    wasm=False,
)
def exact_polynomial_factorization_unit_numerator(
    factorization: ExactPolynomialFactorization,
) -> Integer: ...


@flint.function(
    dynamic="ffiExactPolynomialFactorizationUnitDenominator",
    symbol="sagejs_exact_polynomial_factorization_unit_denominator",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("factorization", sagejs_exact_polynomial_factorization_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="invalid factorization"),
    wasm=False,
)
def exact_polynomial_factorization_unit_denominator(
    factorization: ExactPolynomialFactorization,
) -> Integer: ...


@flint.function(
    dynamic="ffiExactPolynomialFactorizationFmpzFactor",
    symbol="sagejs_exact_polynomial_factorization_fmpz_factor",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("factorization", sagejs_exact_polynomial_factorization_t),
        in_("index", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="factor index is out of bounds",
    ),
    wasm=False,
)
def exact_polynomial_factorization_fmpz_factor(
    factorization: ExactPolynomialFactorization,
    index: uint64,
) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiExactPolynomialFactorizationFmpqFactor",
    symbol="sagejs_exact_polynomial_factorization_fmpq_factor",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("factorization", sagejs_exact_polynomial_factorization_t),
        in_("index", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="factor index is out of bounds",
    ),
    wasm=False,
)
def exact_polynomial_factorization_fmpq_factor(
    factorization: ExactPolynomialFactorization,
    index: uint64,
) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialDivExact",
    symbol="sagejs_fmpq_polynomial_divexact",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("dividend", sagejs_fmpq_polynomial_t),
        in_("divisor", sagejs_fmpq_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message=(
            "rational polynomial exact division requires sealed resources, "
            "a nonzero divisor, and an exact quotient"
        ),
    ),
    wasm=False,
)
def fmpq_polynomial_divexact(
    dividend: FmpqPolynomial,
    divisor: FmpqPolynomial,
) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialQuoRemResource",
    symbol="sagejs_fmpq_polynomial_quo_rem_resource",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_division_result_t),
        in_("dividend", sagejs_fmpq_polynomial_t),
        in_("divisor", sagejs_fmpq_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational polynomial division requires sealed resources and a nonzero divisor",
    ),
    wasm=False,
)
def fmpq_polynomial_quo_rem_resource(
    dividend: FmpqPolynomial,
    divisor: FmpqPolynomial,
) -> FmpqPolynomialDivisionResult: ...


@flint.function(
    dynamic="ffiFmpqPolynomialDivisionResultQuotient",
    symbol="sagejs_fmpq_polynomial_division_result_quotient",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("division", sagejs_fmpq_polynomial_division_result_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="invalid rational division result"),
    wasm=False,
)
def fmpq_polynomial_division_result_quotient(
    division: FmpqPolynomialDivisionResult,
) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialDivisionResultRemainder",
    symbol="sagejs_fmpq_polynomial_division_result_remainder",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("division", sagejs_fmpq_polynomial_division_result_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="invalid rational division result"),
    wasm=False,
)
def fmpq_polynomial_division_result_remainder(
    division: FmpqPolynomialDivisionResult,
) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialPow",
    symbol="sagejs_fmpq_polynomial_pow",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("source", sagejs_fmpq_polynomial_t),
        in_("exponent", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[OverflowError]),
    result=Status(
        1,
        exception=OverflowError,
        message="rational polynomial exponent is too large",
    ),
    wasm=False,
)
def fmpq_polynomial_pow(
    source: FmpqPolynomial,
    exponent: uint64,
) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqPolynomialEvaluate",
    symbol="sagejs_fmpq_polynomial_evaluate",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_value_t),
        in_("source", sagejs_fmpq_polynomial_t),
        in_("numerator", fmpz_t),
        in_("denominator", fmpz_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid rational polynomial evaluation",
    ),
    wasm=False,
)
def fmpq_polynomial_evaluate(
    source: FmpqPolynomial,
    numerator: Integer,
    denominator: Integer,
) -> FmpqValue: ...


@flint.function(
    dynamic="ffiFmpqPolynomialSerialize",
    symbol="sagejs_fmpq_polynomial_serialize",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("source", sagejs_fmpq_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[OverflowError]),
    result=Status(
        1,
        exception=OverflowError,
        message="rational polynomial serialization is too large",
    ),
    wasm=False,
)
def fmpq_polynomial_serialize(source: FmpqPolynomial) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiFmpqPolynomialFormat",
    symbol="sagejs_fmpq_polynomial_format",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("source", sagejs_fmpq_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(
        1,
        exception=RuntimeError,
        message="rational polynomial formatting failed",
    ),
    wasm=False,
)
def fmpq_polynomial_format(source: FmpqPolynomial) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiFmpqPolynomialFromByteRegion",
    symbol="sagejs_fmpq_polynomial_from_byte_region",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("source", sagejs_flint_byte_region_t),
        in_("offset", uint64_t),
        in_("length", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid SJPQ v1 rational polynomial serialization",
    ),
    wasm=False,
)
def fmpq_polynomial_from_byte_region(
    source: FlintByteRegion,
    offset: uint64,
    length: uint64,
) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpzVectorFromByteRegion",
    symbol="sagejs_fmpz_vector_from_byte_region",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_vector_t),
        in_("source", sagejs_flint_byte_region_t),
        in_("length", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid canonical integer vector entry stream",
    ),
    wasm=True,
)
def fmpz_vector_from_byte_region(
    source: FlintByteRegion,
    length: uint64,
) -> FmpzVector: ...


@flint.function(
    dynamic="ffiFmpzPerfectPowerData",
    symbol="sagejs_fmpz_perfect_power_data",
    returns=int,
    abi=[out("result", sagejs_fmpz_vector_t), in_("number", fmpz_t)],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(
        1,
        exception=RuntimeError,
        message="FLINT perfect-power extraction failed",
    ),
    wasm=True,
)
def fmpz_perfect_power_data(number: Integer) -> FmpzVector: ...


@flint.function(
    dynamic="ffiFmpzIsProbabprime",
    symbol="sagejs_fmpz_probabprime_result",
    returns=int,
    abi=[out("result", fmpz_t), in_("number", fmpz_t)],
    effects=Effects(pure=True, allocates=True, raises=[RuntimeError]),
    result=Status(
        1,
        exception=RuntimeError,
        message="FLINT probable-prime screening failed",
    ),
    wasm=True,
)
def fmpz_is_probabprime(number: Integer) -> Integer: ...


@flint.function(
    dynamic="ffiFmpqVectorFromByteRegion",
    symbol="sagejs_fmpq_vector_from_byte_region",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_vector_t),
        in_("source", sagejs_flint_byte_region_t),
        in_("length", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid canonical rational vector entry stream",
    ),
    wasm=True,
)
def fmpq_vector_from_byte_region(
    source: FlintByteRegion,
    length: uint64,
) -> FmpqVector: ...


@flint.function(
    dynamic="ffiFmpzVectorLength",
    symbol="sagejs_fmpz_vector_length",
    returns=uint64_t,
    abi=[in_("vector", sagejs_fmpz_vector_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def fmpz_vector_length(vector: FmpzVector) -> uint64: ...


@flint.function(
    dynamic="ffiFmpqVectorLength",
    symbol="sagejs_fmpq_vector_length",
    returns=uint64_t,
    abi=[in_("vector", sagejs_fmpq_vector_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def fmpq_vector_length(vector: FmpqVector) -> uint64: ...


@flint.function(
    dynamic="ffiFmpzVectorEntry",
    symbol="sagejs_fmpz_vector_entry",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("vector", sagejs_fmpz_vector_t),
        in_("index", uint64_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[IndexError]),
    result=Status(
        1,
        exception=IndexError,
        message="integer vector index is out of range",
    ),
    wasm=True,
)
def fmpz_vector_entry(vector: FmpzVector, index: uint64) -> Integer: ...


@flint.function(
    dynamic="ffiFmpqVectorEntryNumerator",
    symbol="sagejs_fmpq_vector_entry_numerator",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("vector", sagejs_fmpq_vector_t),
        in_("index", uint64_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[IndexError]),
    result=Status(
        1,
        exception=IndexError,
        message="rational vector index is out of range",
    ),
    wasm=True,
)
def fmpq_vector_entry_numerator(
    vector: FmpqVector,
    index: uint64,
) -> Integer: ...


@flint.function(
    dynamic="ffiFmpqVectorEntryDenominator",
    symbol="sagejs_fmpq_vector_entry_denominator",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("vector", sagejs_fmpq_vector_t),
        in_("index", uint64_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[IndexError]),
    result=Status(
        1,
        exception=IndexError,
        message="rational vector index is out of range",
    ),
    wasm=True,
)
def fmpq_vector_entry_denominator(
    vector: FmpqVector,
    index: uint64,
) -> Integer: ...


@flint.function(
    dynamic="ffiFmpzVectorSetEntry",
    symbol="sagejs_fmpz_vector_set_entry",
    returns=int,
    abi=[
        in_("vector", sagejs_fmpz_vector_t),
        in_("index", uint64_t),
        in_("entry", fmpz_t),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[IndexError],
        writes=["vector"],
    ),
    result=Status(
        1,
        exception=IndexError,
        message="integer vector index is out of range",
    ),
    wasm=True,
)
def fmpz_vector_set_entry(
    vector: Writable[FmpzVector],
    index: uint64,
    entry: Integer,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpqVectorSetEntry",
    symbol="sagejs_fmpq_vector_set_entry",
    returns=int,
    abi=[
        in_("vector", sagejs_fmpq_vector_t),
        in_("index", uint64_t),
        in_("numerator", fmpz_t),
        in_("denominator", fmpz_t),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError],
        writes=["vector"],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="invalid rational vector entry",
    ),
    wasm=True,
)
def fmpq_vector_set_entry(
    vector: Writable[FmpqVector],
    index: uint64,
    numerator: Integer,
    denominator: Integer,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpzVectorCopy",
    symbol="sagejs_fmpz_vector_init_set",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_vector_t),
        in_("source", sagejs_fmpz_vector_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(1, exception=RuntimeError, message="integer vector copy failed"),
    wasm=True,
)
def fmpz_vector_copy(source: FmpzVector) -> FmpzVector: ...


@flint.function(
    dynamic="ffiFmpqVectorCopy",
    symbol="sagejs_fmpq_vector_init_set",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_vector_t),
        in_("source", sagejs_fmpq_vector_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(1, exception=RuntimeError, message="rational vector copy failed"),
    wasm=True,
)
def fmpq_vector_copy(source: FmpqVector) -> FmpqVector: ...


@flint.function(
    dynamic="ffiFmpzVectorSerialize",
    symbol="sagejs_fmpz_vector_serialize",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("source", sagejs_fmpz_vector_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[OverflowError]),
    result=Status(
        1,
        exception=OverflowError,
        message="integer vector serialization is too large",
    ),
    wasm=True,
)
def fmpz_vector_serialize(source: FmpzVector) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiFmpqVectorSerialize",
    symbol="sagejs_fmpq_vector_serialize",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("source", sagejs_fmpq_vector_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[OverflowError]),
    result=Status(
        1,
        exception=OverflowError,
        message="rational vector serialization is too large",
    ),
    wasm=True,
)
def fmpq_vector_serialize(source: FmpqVector) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiFmpzVectorEqual",
    symbol="sagejs_fmpz_vector_equal",
    returns=int,
    abi=[
        in_("left", sagejs_fmpz_vector_t),
        in_("right", sagejs_fmpz_vector_t),
    ],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def fmpz_vector_equal(left: FmpzVector, right: FmpzVector) -> bool: ...


@flint.function(
    dynamic="ffiFmpqVectorEqual",
    symbol="sagejs_fmpq_vector_equal",
    returns=int,
    abi=[
        in_("left", sagejs_fmpq_vector_t),
        in_("right", sagejs_fmpq_vector_t),
    ],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def fmpq_vector_equal(left: FmpqVector, right: FmpqVector) -> bool: ...


@flint.function(
    dynamic="ffiFmpzVectorAdd",
    symbol="sagejs_fmpz_vector_add",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_vector_t),
        in_("left", sagejs_fmpz_vector_t),
        in_("right", sagejs_fmpz_vector_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer vector lengths are incompatible",
    ),
    wasm=True,
)
def fmpz_vector_add(left: FmpzVector, right: FmpzVector) -> FmpzVector: ...


@flint.function(
    dynamic="ffiFmpqVectorAdd",
    symbol="sagejs_fmpq_vector_add",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_vector_t),
        in_("left", sagejs_fmpq_vector_t),
        in_("right", sagejs_fmpq_vector_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational vector lengths are incompatible",
    ),
    wasm=True,
)
def fmpq_vector_add(left: FmpqVector, right: FmpqVector) -> FmpqVector: ...


@flint.function(
    dynamic="ffiFmpzVectorSub",
    symbol="sagejs_fmpz_vector_sub",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_vector_t),
        in_("left", sagejs_fmpz_vector_t),
        in_("right", sagejs_fmpz_vector_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer vector lengths are incompatible",
    ),
    wasm=True,
)
def fmpz_vector_sub(left: FmpzVector, right: FmpzVector) -> FmpzVector: ...


@flint.function(
    dynamic="ffiFmpqVectorSub",
    symbol="sagejs_fmpq_vector_sub",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_vector_t),
        in_("left", sagejs_fmpq_vector_t),
        in_("right", sagejs_fmpq_vector_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational vector lengths are incompatible",
    ),
    wasm=True,
)
def fmpq_vector_sub(left: FmpqVector, right: FmpqVector) -> FmpqVector: ...


@flint.function(
    dynamic="ffiFmpzVectorScalarMul",
    symbol="sagejs_fmpz_vector_scalar_mul",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_vector_t),
        in_("source", sagejs_fmpz_vector_t),
        in_("scalar", fmpz_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(
        1,
        exception=RuntimeError,
        message="integer vector scalar multiplication failed",
    ),
    wasm=True,
)
def fmpz_vector_scalar_mul(
    source: FmpzVector,
    scalar: Integer,
) -> FmpzVector: ...


@flint.function(
    dynamic="ffiFmpqVectorScalarMul",
    symbol="sagejs_fmpq_vector_scalar_mul",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_vector_t),
        in_("source", sagejs_fmpq_vector_t),
        in_("numerator", fmpz_t),
        in_("denominator", fmpz_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid rational vector scalar",
    ),
    wasm=True,
)
def fmpq_vector_scalar_mul(
    source: FmpqVector,
    numerator: Integer,
    denominator: Integer,
) -> FmpqVector: ...


@flint.function(
    dynamic="ffiFmpzVectorDot",
    symbol="sagejs_fmpz_vector_dot",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("left", sagejs_fmpz_vector_t),
        in_("right", sagejs_fmpz_vector_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer vector lengths are incompatible",
    ),
    wasm=True,
)
def fmpz_vector_dot(left: FmpzVector, right: FmpzVector) -> Integer: ...


@flint.function(
    dynamic="ffiFmpqVectorDot",
    symbol="sagejs_fmpq_vector_dot",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_value_t),
        in_("left", sagejs_fmpq_vector_t),
        in_("right", sagejs_fmpq_vector_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational vector lengths are incompatible",
    ),
    wasm=True,
)
def fmpq_vector_dot(left: FmpqVector, right: FmpqVector) -> FmpqValue: ...


@flint.function(
    dynamic="ffiFmpzMatrixCreate",
    symbol="sagejs_fmpz_matrix_init",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_matrix_t),
        in_("rows", uint64_t),
        in_("columns", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[OverflowError]),
    result=Status(
        1,
        exception=OverflowError,
        message="integer matrix dimensions are too large",
    ),
    wasm=True,
)
def fmpz_matrix(rows: uint64, columns: uint64) -> FmpzMatrix: ...


@flint.function(
    dynamic="ffiFmpzMatrixNrows",
    symbol="sagejs_fmpz_matrix_nrows",
    returns=uint64_t,
    abi=[in_("matrix", sagejs_fmpz_matrix_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def fmpz_matrix_nrows(matrix: FmpzMatrix) -> uint64: ...


@flint.function(
    dynamic="ffiFmpzMatrixNcols",
    symbol="sagejs_fmpz_matrix_ncols",
    returns=uint64_t,
    abi=[in_("matrix", sagejs_fmpz_matrix_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def fmpz_matrix_ncols(matrix: FmpzMatrix) -> uint64: ...


@flint.function(
    dynamic="ffiFmpzMatrixSetEntry",
    symbol="sagejs_fmpz_matrix_set_entry",
    returns=int,
    abi=[
        in_("matrix", sagejs_fmpz_matrix_t),
        in_("row", uint64_t),
        in_("column", uint64_t),
        in_("entry", fmpz_t),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError],
        writes=["matrix"],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="integer matrix entry is out of bounds",
    ),
    wasm=True,
)
def fmpz_matrix_set_entry(
    matrix: Writable[FmpzMatrix],
    row: uint64,
    column: uint64,
    entry: Integer,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpzMatrixEntry",
    symbol="sagejs_fmpz_matrix_entry",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("matrix", sagejs_fmpz_matrix_t),
        in_("row", uint64_t),
        in_("column", uint64_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer matrix entry is out of bounds",
    ),
    wasm=True,
)
def fmpz_matrix_entry(
    matrix: FmpzMatrix,
    row: uint64,
    column: uint64,
) -> Integer: ...


@flint.function(
    dynamic="ffiFmpzMatrixExportModUi",
    symbol="sagejs_fmpz_matrix_export_mod_ui",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("source", sagejs_fmpz_matrix_t),
        in_("modulus", uint64_t),
        in_("width", uint64_t),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError, OverflowError],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="integer matrix modular export failed",
    ),
    wasm=False,
)
def fmpz_matrix_export_mod_ui(
    source: FmpzMatrix,
    modulus: uint64,
    width: uint64,
) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiFmpzMatrixCopy",
    symbol="sagejs_fmpz_matrix_init_set",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_matrix_t),
        in_("source", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(1, exception=RuntimeError, message="integer matrix copy failed"),
    wasm=True,
)
def fmpz_matrix_copy(source: FmpzMatrix) -> FmpzMatrix: ...


@flint.function(
    dynamic="ffiFmpzMatrixNeg",
    symbol="sagejs_fmpz_matrix_neg",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_matrix_t),
        in_("source", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(1, exception=RuntimeError, message="integer matrix negation failed"),
    wasm=False,
)
def fmpz_matrix_neg(source: FmpzMatrix) -> FmpzMatrix: ...


@flint.function(
    dynamic="ffiFmpzMatrixScalarMul",
    symbol="sagejs_fmpz_matrix_scalar_mul",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_matrix_t),
        in_("source", sagejs_fmpz_matrix_t),
        in_("scalar", fmpz_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(
        1,
        exception=RuntimeError,
        message="integer matrix scalar multiplication failed",
    ),
    wasm=False,
)
def fmpz_matrix_scalar_mul(
    source: FmpzMatrix,
    scalar: Integer,
) -> FmpzMatrix: ...


@flint.function(
    dynamic="ffiFmpzMatrixEqual",
    symbol="sagejs_fmpz_matrix_equal",
    returns=int,
    abi=[
        in_("left", sagejs_fmpz_matrix_t),
        in_("right", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
)
def fmpz_matrix_equal(left: FmpzMatrix, right: FmpzMatrix) -> bool: ...


@flint.function(
    dynamic="ffiFmpzMatrixIsZero",
    symbol="sagejs_fmpz_matrix_is_zero",
    returns=int,
    abi=[in_("matrix", sagejs_fmpz_matrix_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
)
def fmpz_matrix_is_zero(matrix: FmpzMatrix) -> bool: ...


@flint.function(
    dynamic="ffiFmpzMatrixIsOne",
    symbol="sagejs_fmpz_matrix_is_one",
    returns=int,
    abi=[in_("matrix", sagejs_fmpz_matrix_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
)
def fmpz_matrix_is_one(matrix: FmpzMatrix) -> bool: ...


@flint.function(
    dynamic="ffiFmpzMatrixAdd",
    symbol="sagejs_fmpz_matrix_add",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_matrix_t),
        in_("left", sagejs_fmpz_matrix_t),
        in_("right", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer matrix dimensions are incompatible",
    ),
    wasm=False,
)
def fmpz_matrix_add(left: FmpzMatrix, right: FmpzMatrix) -> FmpzMatrix: ...


@flint.function(
    dynamic="ffiFmpzMatrixSub",
    symbol="sagejs_fmpz_matrix_sub",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_matrix_t),
        in_("left", sagejs_fmpz_matrix_t),
        in_("right", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer matrix dimensions are incompatible",
    ),
    wasm=False,
)
def fmpz_matrix_sub(left: FmpzMatrix, right: FmpzMatrix) -> FmpzMatrix: ...


@flint.function(
    dynamic="ffiFmpzMatrixTranspose",
    symbol="sagejs_fmpz_matrix_transpose",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_matrix_t),
        in_("source", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(
        1,
        exception=RuntimeError,
        message="integer matrix transpose failed",
    ),
    wasm=True,
)
def fmpz_matrix_transpose(source: FmpzMatrix) -> FmpzMatrix: ...


@flint.function(
    dynamic="ffiFmpzMatrixMul",
    symbol="sagejs_fmpz_matrix_mul",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_matrix_t),
        in_("left", sagejs_fmpz_matrix_t),
        in_("right", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer matrix dimensions are incompatible",
    ),
    wasm=True,
)
def fmpz_matrix_mul(left: FmpzMatrix, right: FmpzMatrix) -> FmpzMatrix: ...


@flint.function(
    dynamic="ffiFmpzMatrixMulVector",
    symbol="sagejs_fmpz_matrix_mul_vector",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("matrix", sagejs_fmpz_matrix_t),
        in_("vector", sagejs_flint_byte_region_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError, OverflowError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer matrix-vector input is invalid",
    ),
    wasm=True,
)
def fmpz_matrix_mul_vector(
    matrix: FmpzMatrix,
    vector: FlintByteRegion,
) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiFmpzVectorMulMatrix",
    symbol="sagejs_fmpz_vector_mul_matrix",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("vector", sagejs_flint_byte_region_t),
        in_("matrix", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError, OverflowError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer vector-matrix input is invalid",
    ),
    wasm=True,
)
def fmpz_vector_mul_matrix(
    vector: FlintByteRegion,
    matrix: FmpzMatrix,
) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiFmpzMatrixPow",
    symbol="sagejs_fmpz_matrix_pow",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_matrix_t),
        in_("source", sagejs_fmpz_matrix_t),
        in_("exponent", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message=(
            "integer matrix power requires a square matrix and a FLINT-word exponent"
        ),
    ),
    wasm=False,
)
def fmpz_matrix_pow(
    source: FmpzMatrix,
    exponent: uint64,
) -> FmpzMatrix: ...


@flint.function(
    dynamic="ffiFmpzMatrixRank",
    symbol="sagejs_fmpz_matrix_rank",
    returns=uint64_t,
    abi=[in_("matrix", sagejs_fmpz_matrix_t)],
    effects=Effects(pure=True, allocates=True),
    result=Direct(),
    wasm=False,
)
def fmpz_matrix_rank(matrix: FmpzMatrix) -> uint64: ...


@flint.function(
    dynamic="ffiFmpzMatrixRankMod46337",
    symbol="sagejs_fmpz_matrix_rank_mod_46337",
    returns=uint64_t,
    abi=[in_("matrix", sagejs_fmpz_matrix_t)],
    effects=Effects(pure=True, allocates=True),
    result=Direct(),
    wasm=False,
)
def fmpz_matrix_rank_mod_46337(matrix: FmpzMatrix) -> uint64:
    """Return the matrix rank modulo the fixed prime `46337`.

    A result equal to `min(nrows, ncols)` certifies the exact integer rank.
    Every smaller result is inconclusive and must be followed by an exact rank
    computation.
    """
    ...


@flint.function(
    dynamic="ffiFmpzMatrixDet",
    symbol="sagejs_fmpz_matrix_det",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("source", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="determinant requires a square integer matrix",
    ),
    wasm=True,
)
def fmpz_matrix_det(source: FmpzMatrix) -> Integer: ...


@flint.function(
    dynamic="ffiFmpzMatrixTrace",
    symbol="sagejs_fmpz_matrix_trace",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("source", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="trace requires a square integer matrix",
    ),
    wasm=False,
)
def fmpz_matrix_trace(source: FmpzMatrix) -> Integer: ...


@flint.function(
    dynamic="ffiFmpzMatrixHnf",
    symbol="sagejs_fmpz_matrix_hnf",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_matrix_t),
        in_("source", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(1, exception=RuntimeError, message="integer matrix HNF failed"),
    wasm=True,
)
def fmpz_matrix_hnf(source: FmpzMatrix) -> FmpzMatrix: ...


@flint.function(
    dynamic="ffiFmpzMatrixSnf",
    symbol="sagejs_fmpz_matrix_snf",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_matrix_t),
        in_("source", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(1, exception=RuntimeError, message="integer matrix SNF failed"),
    wasm=False,
)
def fmpz_matrix_snf(source: FmpzMatrix) -> FmpzMatrix: ...


@flint.function(
    dynamic="ffiFmpzMatrixHnfTransform",
    symbol="sagejs_fmpz_matrix_hnf_transform",
    returns=int,
    abi=[
        in_("hermite", sagejs_fmpz_matrix_t),
        in_("transform", sagejs_fmpz_matrix_t),
        in_("source", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError],
        writes=["hermite", "transform"],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="integer matrix HNF transform dimensions or aliases are invalid",
    ),
    wasm=False,
)
def fmpz_matrix_hnf_transform(
    hermite: Writable[FmpzMatrix],
    transform: Writable[FmpzMatrix],
    source: FmpzMatrix,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpzMatrixSnfTransform",
    symbol="sagejs_fmpz_matrix_snf_transform",
    returns=int,
    abi=[
        in_("smith", sagejs_fmpz_matrix_t),
        in_("left_transform", sagejs_fmpz_matrix_t),
        in_("right_transform", sagejs_fmpz_matrix_t),
        in_("source", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError],
        writes=["smith", "left_transform", "right_transform"],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="integer matrix SNF transform dimensions or aliases are invalid",
    ),
    wasm=False,
)
def fmpz_matrix_snf_transform(
    smith: Writable[FmpzMatrix],
    left_transform: Writable[FmpzMatrix],
    right_transform: Writable[FmpzMatrix],
    source: FmpzMatrix,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpzMatrixRightKernel",
    symbol="sagejs_fmpz_matrix_right_kernel",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_matrix_t),
        in_("source", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(
        1,
        exception=RuntimeError,
        message="integer matrix right kernel failed",
    ),
    wasm=True,
)
def fmpz_matrix_right_kernel(source: FmpzMatrix) -> FmpzMatrix: ...


@flint.function(
    dynamic="ffiFmpzMatrixCharpoly",
    symbol="sagejs_fmpz_matrix_charpoly",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("source", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="characteristic polynomial requires a square integer matrix",
    ),
    wasm=False,
)
def fmpz_matrix_charpoly(source: FmpzMatrix) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpzMatrixMinpoly",
    symbol="sagejs_fmpz_matrix_minpoly",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("source", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="minimal polynomial requires a square integer matrix",
    ),
    wasm=False,
)
def fmpz_matrix_minpoly(source: FmpzMatrix) -> FmpzPolynomial: ...


@flint.function(
    dynamic="ffiFmpqMatrixFromFmpz",
    symbol="sagejs_fmpq_matrix_from_fmpz",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("source", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(
        1,
        exception=RuntimeError,
        message="integer to rational matrix conversion failed",
    ),
    wasm=False,
)
def fmpq_matrix_from_fmpz(source: FmpzMatrix) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiFmpzMatrixFromFmpqIntegral",
    symbol="sagejs_fmpz_matrix_from_fmpq_integral",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_matrix_t),
        in_("source", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational matrix contains a nonintegral entry",
    ),
    wasm=False,
)
def fmpz_matrix_from_fmpq_integral(source: FmpqMatrix) -> FmpzMatrix: ...


@flint.function(
    dynamic="ffiFmpzMatrixSubmatrix",
    symbol="sagejs_fmpz_matrix_submatrix",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_matrix_t),
        in_("source", sagejs_fmpz_matrix_t),
        in_("row_start", uint64_t),
        in_("row_stop", uint64_t),
        in_("column_start", uint64_t),
        in_("column_stop", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer matrix submatrix bounds are invalid",
    ),
    wasm=False,
)
def fmpz_matrix_submatrix(
    source: FmpzMatrix,
    row_start: uint64,
    row_stop: uint64,
    column_start: uint64,
    column_stop: uint64,
) -> FmpzMatrix: ...


@flint.function(
    dynamic="ffiFmpzMatrixSelectRows",
    symbol="sagejs_fmpz_matrix_select_rows",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_matrix_t),
        in_("source", sagejs_fmpz_matrix_t),
        in_(
            "selected_rows",
            uint64_t_ptr,
            packed_slice(
                data="indices",
                length="count",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_("count", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer matrix row selection contains an invalid index",
    ),
    wasm=False,
)
def fmpz_matrix_select_rows(
    source: FmpzMatrix,
    indices: UInt64Buffer,
    count: uint64,
) -> FmpzMatrix: ...


@flint.function(
    dynamic="ffiFmpzMatrixPrefixRows",
    symbol="sagejs_fmpz_matrix_prefix_rows",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_matrix_t),
        in_("source", sagejs_fmpz_matrix_t),
        in_("count", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer matrix row-prefix count is invalid",
    ),
    wasm=True,
)
def fmpz_matrix_prefix_rows(source: FmpzMatrix, count: uint64) -> FmpzMatrix: ...


@flint.function(
    dynamic="ffiFmpzMatrixSelectColumns",
    symbol="sagejs_fmpz_matrix_select_columns",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_matrix_t),
        in_("source", sagejs_fmpz_matrix_t),
        in_(
            "selected_columns",
            uint64_t_ptr,
            packed_slice(
                data="indices",
                length="count",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_("count", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="integer matrix column selection contains an invalid index",
    ),
    wasm=False,
)
def fmpz_matrix_select_columns(
    source: FmpzMatrix,
    indices: UInt64Buffer,
    count: uint64,
) -> FmpzMatrix: ...


@flint.function(
    dynamic="ffiFmpzMatrixSwapRows",
    symbol="sagejs_fmpz_matrix_swap_rows",
    returns=int,
    abi=[
        in_("matrix", sagejs_fmpz_matrix_t),
        in_("first", uint64_t),
        in_("second", uint64_t),
    ],
    effects=Effects(pure=False, raises=[ValueError], writes=["matrix"]),
    result=Status(
        1,
        exception=ValueError,
        message="integer matrix row index is out of range",
    ),
    wasm=True,
)
def fmpz_matrix_swap_rows(
    matrix: Writable[FmpzMatrix], first: uint64, second: uint64
) -> bool: ...


@flint.function(
    dynamic="ffiFmpzMatrixSwapColumns",
    symbol="sagejs_fmpz_matrix_swap_columns",
    returns=int,
    abi=[
        in_("matrix", sagejs_fmpz_matrix_t),
        in_("first", uint64_t),
        in_("second", uint64_t),
    ],
    effects=Effects(pure=False, raises=[ValueError], writes=["matrix"]),
    result=Status(
        1,
        exception=ValueError,
        message="integer matrix column index is out of range",
    ),
    wasm=True,
)
def fmpz_matrix_swap_columns(
    matrix: Writable[FmpzMatrix], first: uint64, second: uint64
) -> bool: ...


@flint.function(
    dynamic="ffiFmpzMatrixSetBlock",
    symbol="sagejs_fmpz_matrix_set_block",
    returns=int,
    abi=[
        in_("target", sagejs_fmpz_matrix_t),
        in_("target_row", uint64_t),
        in_("target_column", uint64_t),
        in_("source", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError],
        writes=["target"],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="integer matrix block bounds or aliases are invalid",
    ),
    wasm=False,
)
def fmpz_matrix_set_block(
    target: Writable[FmpzMatrix],
    target_row: uint64,
    target_column: uint64,
    source: FmpzMatrix,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpzMatrixStack",
    symbol="sagejs_fmpz_matrix_stack",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_matrix_t),
        in_("top", sagejs_fmpz_matrix_t),
        in_("bottom", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="stacked integer matrices must have the same number of columns",
    ),
    wasm=False,
)
def fmpz_matrix_stack(
    top: FmpzMatrix,
    bottom: FmpzMatrix,
) -> FmpzMatrix: ...


@flint.function(
    dynamic="ffiFmpzMatrixAugment",
    symbol="sagejs_fmpz_matrix_augment",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_matrix_t),
        in_("left", sagejs_fmpz_matrix_t),
        in_("right", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="augmented integer matrices must have the same number of rows",
    ),
    wasm=False,
)
def fmpz_matrix_augment(
    left: FmpzMatrix,
    right: FmpzMatrix,
) -> FmpzMatrix: ...


@flint.function(
    dynamic="ffiFmpzMatrixNonzeroCount",
    symbol="sagejs_fmpz_matrix_nonzero_count",
    returns=uint64_t,
    abi=[in_("source", sagejs_fmpz_matrix_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
)
def fmpz_matrix_nonzero_count(source: FmpzMatrix) -> uint64: ...


@flint.function(
    dynamic="ffiFmpzMatrixEchelonPivots",
    symbol="sagejs_fmpz_matrix_echelon_pivots",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("source", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(
        1,
        exception=RuntimeError,
        message="integer matrix pivot query failed",
    ),
    wasm=True,
)
def fmpz_matrix_echelon_pivots(source: FmpzMatrix) -> FlintByteRegion:
    """Return pivot columns as packed little-endian `uint64` values."""
    ...


@flint.function(
    dynamic="ffiFmpzMatrixFormat",
    symbol="sagejs_fmpz_matrix_format",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("source", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(1, exception=RuntimeError, message="integer matrix format failed"),
    wasm=True,
)
def fmpz_matrix_format(source: FmpzMatrix) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiFmpzMatrixSerialize",
    symbol="sagejs_fmpz_matrix_serialize",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("source", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[OverflowError]),
    result=Status(
        1,
        exception=OverflowError,
        message="integer matrix serialization is too large",
    ),
    wasm=True,
)
def fmpz_matrix_serialize(source: FmpzMatrix) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiFmpzMatrixSerializeSequence",
    symbol="sagejs_fmpz_matrix_serialize_sequence",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("source", sagejs_fmpz_matrix_t),
        in_("start", uint64_t),
        in_("stride", uint64_t),
        in_("count", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError, OverflowError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid integer matrix entry sequence",
    ),
    wasm=False,
)
def fmpz_matrix_serialize_sequence(
    source: FmpzMatrix,
    start: uint64,
    stride: uint64,
    count: uint64,
) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiFlintByteRegionCreate",
    symbol="sagejs_flint_byte_region_init",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("length", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[OverflowError]),
    result=Status(
        1,
        exception=OverflowError,
        message="FLINT byte-region length is too large",
    ),
    wasm=True,
)
def flint_byte_region(length: uint64) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiFlintByteRegionSet",
    symbol="sagejs_flint_byte_region_set",
    returns=int,
    abi=[
        in_("region", sagejs_flint_byte_region_t),
        in_("index", uint64_t),
        in_("value", uint64_t),
    ],
    effects=Effects(
        pure=False,
        writes=["region"],
        raises=[IndexError, ValueError],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="FLINT byte-region index or byte value is out of bounds",
    ),
    wasm=True,
)
def flint_byte_region_set(
    region: Writable[FlintByteRegion],
    index: uint64,
    value: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpzMatrixDeserialize",
    symbol="sagejs_fmpz_matrix_deserialize",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_matrix_t),
        in_("source", sagejs_flint_byte_region_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid SJZM v1 integer matrix serialization",
    ),
    wasm=True,
)
def fmpz_matrix_deserialize(source: FlintByteRegion) -> FmpzMatrix: ...


@flint.function(
    dynamic="ffiFmpzMatrixDeserializeEntries",
    symbol="sagejs_fmpz_matrix_deserialize_entries",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_matrix_t),
        in_("source", sagejs_flint_byte_region_t),
        in_("rows", uint64_t),
        in_("columns", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid packed integer matrix entries",
    ),
    wasm=True,
)
def fmpz_matrix_deserialize_entries(
    source: FlintByteRegion,
    rows: uint64,
    columns: uint64,
) -> FmpzMatrix: ...


@flint.function(
    dynamic="ffiFmpqMatrixCreate",
    symbol="sagejs_fmpq_matrix_init",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("rows", uint64_t),
        in_("columns", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[OverflowError]),
    result=Status(
        1,
        exception=OverflowError,
        message="rational matrix dimensions are too large",
    ),
    wasm=True,
)
def fmpq_matrix(rows: uint64, columns: uint64) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiFmpqMatrixRandbits",
    symbol="sagejs_fmpq_matrix_randbits",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("rows", uint64_t),
        in_("columns", uint64_t),
        in_("bits", uint64_t),
        in_("seed1", uint64_t),
        in_("seed2", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[OverflowError]),
    result=Status(
        1,
        exception=OverflowError,
        message="rational random matrix parameters are too large",
    ),
    wasm=True,
)
def fmpq_matrix_randbits(
    rows: uint64,
    columns: uint64,
    bits: Min[uint64, 1],
    seed1: uint64,
    seed2: uint64,
) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiFmpqMatrixNrows",
    symbol="sagejs_fmpq_matrix_nrows",
    returns=uint64_t,
    abi=[in_("matrix", sagejs_fmpq_matrix_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def fmpq_matrix_nrows(matrix: FmpqMatrix) -> uint64: ...


@flint.function(
    dynamic="ffiFmpqMatrixNcols",
    symbol="sagejs_fmpq_matrix_ncols",
    returns=uint64_t,
    abi=[in_("matrix", sagejs_fmpq_matrix_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def fmpq_matrix_ncols(matrix: FmpqMatrix) -> uint64: ...


@flint.function(
    dynamic="ffiFmpqMatrixSetEntry",
    symbol="sagejs_fmpq_matrix_set_entry",
    returns=int,
    abi=[
        in_("matrix", sagejs_fmpq_matrix_t),
        in_("row", uint64_t),
        in_("column", uint64_t),
        in_("numerator", fmpz_t),
        in_("denominator", fmpz_t),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError],
        writes=["matrix"],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="invalid rational matrix entry",
    ),
    wasm=True,
)
def fmpq_matrix_set_entry(
    matrix: Writable[FmpqMatrix],
    row: uint64,
    column: uint64,
    numerator: Integer,
    denominator: Integer,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpqMatrixAddScaledEntry",
    symbol="sagejs_fmpq_matrix_add_scaled_entry",
    returns=int,
    abi=[
        in_("matrix", sagejs_fmpq_matrix_t),
        in_("row", uint64_t),
        in_("column", uint64_t),
        in_("numerator", fmpz_t),
        in_("denominator", fmpz_t),
        in_("scale", fmpz_t),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError],
        writes=["matrix"],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="invalid rational matrix entry update",
    ),
    wasm=True,
)
def fmpq_matrix_add_scaled_entry(
    matrix: Writable[FmpqMatrix],
    row: uint64,
    column: uint64,
    numerator: Integer,
    denominator: Integer,
    scale: Integer,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpqMatrixEntryNumerator",
    symbol="sagejs_fmpq_matrix_entry_numerator",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("matrix", sagejs_fmpq_matrix_t),
        in_("row", uint64_t),
        in_("column", uint64_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational matrix entry is out of bounds",
    ),
    wasm=True,
)
def fmpq_matrix_entry_numerator(
    matrix: FmpqMatrix,
    row: uint64,
    column: uint64,
) -> Integer: ...


@flint.function(
    dynamic="ffiFmpqMatrixEntryDenominator",
    symbol="sagejs_fmpq_matrix_entry_denominator",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("matrix", sagejs_fmpq_matrix_t),
        in_("row", uint64_t),
        in_("column", uint64_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational matrix entry is out of bounds",
    ),
    wasm=True,
)
def fmpq_matrix_entry_denominator(
    matrix: FmpqMatrix,
    row: uint64,
    column: uint64,
) -> Integer: ...


@flint.function(
    dynamic="ffiFmpqMatrixEntryIsZero",
    symbol="sagejs_fmpq_matrix_entry_is_zero",
    returns=int,
    abi=[
        in_("matrix", sagejs_fmpq_matrix_t),
        in_("row", uint64_t),
        in_("column", uint64_t),
    ],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def fmpq_matrix_entry_is_zero(
    matrix: FmpqMatrix,
    row: uint64,
    column: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpqMatrixCopy",
    symbol="sagejs_fmpq_matrix_init_set",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("source", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(1, exception=RuntimeError, message="rational matrix copy failed"),
    wasm=True,
)
def fmpq_matrix_copy(source: FmpqMatrix) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiFmpqMatrixNeg",
    symbol="sagejs_fmpq_matrix_neg",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("source", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(1, exception=RuntimeError, message="rational matrix negation failed"),
    wasm=False,
)
def fmpq_matrix_neg(source: FmpqMatrix) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiFmpqMatrixScalarMul",
    symbol="sagejs_fmpq_matrix_scalar_mul",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("source", sagejs_fmpq_matrix_t),
        in_("numerator", fmpz_t),
        in_("denominator", fmpz_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid rational matrix scalar",
    ),
    wasm=False,
)
def fmpq_matrix_scalar_mul(
    source: FmpqMatrix,
    numerator: Integer,
    denominator: Integer,
) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiFmpqMatrixEqual",
    symbol="sagejs_fmpq_matrix_equal",
    returns=int,
    abi=[
        in_("left", sagejs_fmpq_matrix_t),
        in_("right", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
)
def fmpq_matrix_equal(left: FmpqMatrix, right: FmpqMatrix) -> bool: ...


@flint.function(
    dynamic="ffiFmpqMatrixIsZero",
    symbol="sagejs_fmpq_matrix_is_zero",
    returns=int,
    abi=[in_("matrix", sagejs_fmpq_matrix_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
)
def fmpq_matrix_is_zero(matrix: FmpqMatrix) -> bool: ...


@flint.function(
    dynamic="ffiFmpqMatrixIsOne",
    symbol="sagejs_fmpq_matrix_is_one",
    returns=int,
    abi=[in_("matrix", sagejs_fmpq_matrix_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
)
def fmpq_matrix_is_one(matrix: FmpqMatrix) -> bool: ...


@flint.function(
    dynamic="ffiFmpqMatrixAdd",
    symbol="sagejs_fmpq_matrix_add",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("left", sagejs_fmpq_matrix_t),
        in_("right", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational matrix dimensions are incompatible",
    ),
    wasm=False,
)
def fmpq_matrix_add(left: FmpqMatrix, right: FmpqMatrix) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiFmpqMatrixSub",
    symbol="sagejs_fmpq_matrix_sub",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("left", sagejs_fmpq_matrix_t),
        in_("right", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational matrix dimensions are incompatible",
    ),
    wasm=False,
)
def fmpq_matrix_sub(left: FmpqMatrix, right: FmpqMatrix) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiFmpqMatrixTranspose",
    symbol="sagejs_fmpq_matrix_transpose",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("source", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(
        1,
        exception=RuntimeError,
        message="rational matrix transpose failed",
    ),
    wasm=True,
)
def fmpq_matrix_transpose(source: FmpqMatrix) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiFmpqMatrixMul",
    symbol="sagejs_fmpq_matrix_mul",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("left", sagejs_fmpq_matrix_t),
        in_("right", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational matrix dimensions are incompatible",
    ),
    wasm=True,
)
def fmpq_matrix_mul(left: FmpqMatrix, right: FmpqMatrix) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiFmpqMatrixMulVector",
    symbol="sagejs_fmpq_matrix_mul_vector",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("matrix", sagejs_fmpq_matrix_t),
        in_("vector", sagejs_flint_byte_region_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError, OverflowError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational matrix-vector input is invalid",
    ),
    wasm=True,
)
def fmpq_matrix_mul_vector(
    matrix: FmpqMatrix,
    vector: FlintByteRegion,
) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiFmpqVectorMulMatrix",
    symbol="sagejs_fmpq_vector_mul_matrix",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("vector", sagejs_flint_byte_region_t),
        in_("matrix", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError, OverflowError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational vector-matrix input is invalid",
    ),
    wasm=True,
)
def fmpq_vector_mul_matrix(
    vector: FlintByteRegion,
    matrix: FmpqMatrix,
) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiFmpqMatrixInv",
    symbol="sagejs_fmpq_matrix_inv",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("source", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="rational matrix is singular"),
    wasm=False,
)
def fmpq_matrix_inv(source: FmpqMatrix) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiFmpqMatrixSolve",
    symbol="sagejs_fmpq_matrix_solve",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("left", sagejs_fmpq_matrix_t),
        in_("right", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational matrix equation has no solutions",
    ),
    wasm=False,
)
def fmpq_matrix_solve(left: FmpqMatrix, right: FmpqMatrix) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiFmpqMatrixRref",
    symbol="sagejs_fmpq_matrix_rref",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("source", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(1, exception=RuntimeError, message="rational matrix RREF failed"),
    wasm=True,
)
def fmpq_matrix_rref(source: FmpqMatrix) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiFmpqMatrixRightKernel",
    symbol="sagejs_fmpq_matrix_right_kernel",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("source", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(
        1,
        exception=RuntimeError,
        message="rational matrix right kernel failed",
    ),
    wasm=False,
)
def fmpq_matrix_right_kernel(source: FmpqMatrix) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiFmpqMatrixCharpoly",
    symbol="sagejs_fmpq_matrix_charpoly_resource",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("source", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="characteristic polynomial requires a square rational matrix",
    ),
    wasm=False,
)
def fmpq_matrix_charpoly(source: FmpqMatrix) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqMatrixMinpoly",
    symbol="sagejs_fmpq_matrix_minpoly_resource",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("source", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="minimal polynomial requires a square rational matrix",
    ),
    wasm=False,
)
def fmpq_matrix_minpoly(source: FmpqMatrix) -> FmpqPolynomial: ...


@flint.function(
    dynamic="ffiFmpqMatrixRank",
    symbol="sagejs_fmpq_matrix_rank",
    returns=uint64_t,
    abi=[in_("matrix", sagejs_fmpq_matrix_t)],
    effects=Effects(pure=False, allocates=True, writes=["matrix"]),
    result=Direct(),
    wasm=True,
)
def fmpq_matrix_rank(matrix: Writable[FmpqMatrix]) -> uint64: ...


@flint.function(
    dynamic="ffiFmpqMatrixDet",
    symbol="sagejs_fmpq_matrix_det",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_value_t),
        in_("source", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="determinant requires a square rational matrix",
    ),
    wasm=True,
)
def fmpq_matrix_det(source: FmpqMatrix) -> FmpqValue: ...


@flint.function(
    dynamic="ffiFmpqMatrixTrace",
    symbol="sagejs_fmpq_matrix_trace",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_value_t),
        in_("source", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="trace requires a square rational matrix",
    ),
    wasm=False,
)
def fmpq_matrix_trace(source: FmpqMatrix) -> FmpqValue: ...


@flint.function(
    dynamic="ffiFmpqMatrixSubmatrix",
    symbol="sagejs_fmpq_matrix_submatrix",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("source", sagejs_fmpq_matrix_t),
        in_("row_start", uint64_t),
        in_("row_stop", uint64_t),
        in_("column_start", uint64_t),
        in_("column_stop", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational matrix submatrix bounds are invalid",
    ),
    wasm=False,
)
def fmpq_matrix_submatrix(
    source: FmpqMatrix,
    row_start: uint64,
    row_stop: uint64,
    column_start: uint64,
    column_stop: uint64,
) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiFmpqMatrixSelectRows",
    symbol="sagejs_fmpq_matrix_select_rows",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("source", sagejs_fmpq_matrix_t),
        in_(
            "selected_rows",
            uint64_t_ptr,
            packed_slice(
                data="indices",
                length="count",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_("count", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational matrix row selection contains an invalid index",
    ),
    wasm=False,
)
def fmpq_matrix_select_rows(
    source: FmpqMatrix,
    indices: UInt64Buffer,
    count: uint64,
) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiFmpqMatrixPrefixRows",
    symbol="sagejs_fmpq_matrix_prefix_rows",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("source", sagejs_fmpq_matrix_t),
        in_("count", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational matrix row-prefix count is invalid",
    ),
    wasm=True,
)
def fmpq_matrix_prefix_rows(source: FmpqMatrix, count: uint64) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiFmpqMatrixSelectColumns",
    symbol="sagejs_fmpq_matrix_select_columns",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("source", sagejs_fmpq_matrix_t),
        in_(
            "selected_columns",
            uint64_t_ptr,
            packed_slice(
                data="indices",
                length="count",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_("count", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="rational matrix column selection contains an invalid index",
    ),
    wasm=False,
)
def fmpq_matrix_select_columns(
    source: FmpqMatrix,
    indices: UInt64Buffer,
    count: uint64,
) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiFmpqMatrixSwapRows",
    symbol="sagejs_fmpq_matrix_swap_rows",
    returns=int,
    abi=[
        in_("matrix", sagejs_fmpq_matrix_t),
        in_("first", uint64_t),
        in_("second", uint64_t),
    ],
    effects=Effects(pure=False, raises=[ValueError], writes=["matrix"]),
    result=Status(
        1,
        exception=ValueError,
        message="rational matrix row index is out of range",
    ),
    wasm=True,
)
def fmpq_matrix_swap_rows(
    matrix: Writable[FmpqMatrix], first: uint64, second: uint64
) -> bool: ...


@flint.function(
    dynamic="ffiFmpqMatrixSwapColumns",
    symbol="sagejs_fmpq_matrix_swap_columns",
    returns=int,
    abi=[
        in_("matrix", sagejs_fmpq_matrix_t),
        in_("first", uint64_t),
        in_("second", uint64_t),
    ],
    effects=Effects(pure=False, raises=[ValueError], writes=["matrix"]),
    result=Status(
        1,
        exception=ValueError,
        message="rational matrix column index is out of range",
    ),
    wasm=True,
)
def fmpq_matrix_swap_columns(
    matrix: Writable[FmpqMatrix], first: uint64, second: uint64
) -> bool: ...


@flint.function(
    dynamic="ffiFmpqMatrixSetBlock",
    symbol="sagejs_fmpq_matrix_set_block",
    returns=int,
    abi=[
        in_("target", sagejs_fmpq_matrix_t),
        in_("target_row", uint64_t),
        in_("target_column", uint64_t),
        in_("source", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError],
        writes=["target"],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="rational matrix block bounds or aliases are invalid",
    ),
    wasm=False,
)
def fmpq_matrix_set_block(
    target: Writable[FmpqMatrix],
    target_row: uint64,
    target_column: uint64,
    source: FmpqMatrix,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpqMatrixStack",
    symbol="sagejs_fmpq_matrix_stack",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("top", sagejs_fmpq_matrix_t),
        in_("bottom", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="stacked rational matrices must have the same number of columns",
    ),
    wasm=False,
)
def fmpq_matrix_stack(
    top: FmpqMatrix,
    bottom: FmpqMatrix,
) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiFmpqMatrixAugment",
    symbol="sagejs_fmpq_matrix_augment",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("left", sagejs_fmpq_matrix_t),
        in_("right", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="augmented rational matrices must have the same number of rows",
    ),
    wasm=False,
)
def fmpq_matrix_augment(
    left: FmpqMatrix,
    right: FmpqMatrix,
) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiFmpqMatrixNonzeroCount",
    symbol="sagejs_fmpq_matrix_nonzero_count",
    returns=uint64_t,
    abi=[in_("source", sagejs_fmpq_matrix_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
)
def fmpq_matrix_nonzero_count(source: FmpqMatrix) -> uint64: ...


@flint.function(
    dynamic="ffiFmpqMatrixEchelonPivots",
    symbol="sagejs_fmpq_matrix_echelon_pivots",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("source", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(
        1,
        exception=RuntimeError,
        message="rational matrix pivot query failed",
    ),
    wasm=True,
)
def fmpq_matrix_echelon_pivots(source: FmpqMatrix) -> FlintByteRegion:
    """Return pivot columns as packed little-endian `uint64` values."""
    ...


@flint.function(
    dynamic="ffiFmpqValueNumerator",
    symbol="sagejs_fmpq_value_numerator",
    returns=void,
    abi=[out("result", fmpz_t), in_("value", sagejs_fmpq_value_t)],
    effects=Effects(pure=True, allocates=True),
    result=Direct(),
    wasm=True,
)
def fmpq_value_numerator(value: FmpqValue) -> Integer: ...


@flint.function(
    dynamic="ffiFmpqValueDenominator",
    symbol="sagejs_fmpq_value_denominator",
    returns=void,
    abi=[out("result", fmpz_t), in_("value", sagejs_fmpq_value_t)],
    effects=Effects(pure=True, allocates=True),
    result=Direct(),
    wasm=True,
)
def fmpq_value_denominator(value: FmpqValue) -> Integer: ...


@flint.function(
    dynamic="ffiFmpqMatrixFormat",
    symbol="sagejs_fmpq_matrix_format",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("source", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(1, exception=RuntimeError, message="rational matrix format failed"),
    wasm=True,
)
def fmpq_matrix_format(source: FmpqMatrix) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiFmpqMatrixSerialize",
    symbol="sagejs_fmpq_matrix_serialize",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("source", sagejs_fmpq_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[OverflowError]),
    result=Status(
        1,
        exception=OverflowError,
        message="rational matrix serialization is too large",
    ),
    wasm=True,
)
def fmpq_matrix_serialize(source: FmpqMatrix) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiFmpqMatrixSerializeSequence",
    symbol="sagejs_fmpq_matrix_serialize_sequence",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("source", sagejs_fmpq_matrix_t),
        in_("start", uint64_t),
        in_("stride", uint64_t),
        in_("count", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError, OverflowError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid rational matrix entry sequence",
    ),
    wasm=False,
)
def fmpq_matrix_serialize_sequence(
    source: FmpqMatrix,
    start: uint64,
    stride: uint64,
    count: uint64,
) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiFmpqMatrixDeserialize",
    symbol="sagejs_fmpq_matrix_deserialize",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("source", sagejs_flint_byte_region_t),
        in_("rows", uint64_t),
        in_("columns", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid packed rational matrix entries",
    ),
    wasm=True,
)
def fmpq_matrix_deserialize(
    source: FlintByteRegion,
    rows: uint64,
    columns: uint64,
) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiFlintByteRegionLength",
    symbol="sagejs_flint_byte_region_length",
    returns=uint64_t,
    abi=[in_("region", sagejs_flint_byte_region_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
)
def flint_byte_region_length(region: FlintByteRegion) -> uint64: ...


@flint.function(
    dynamic="ffiFlintByteRegionGet",
    symbol="sagejs_flint_byte_region_get",
    returns=uint64_t,
    abi=[in_("region", sagejs_flint_byte_region_t), in_("index", uint64_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
)
def flint_byte_region_get(region: FlintByteRegion, index: uint64) -> uint64: ...


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
    dynamic="ffiFmpzMatHnfModularEldiv",
    symbol="sagejs_flint_fmpz_mat_hnf_modular_eldiv",
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
        in_(
            "elementary_divisor",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="elementary_divisor",
                rows="one",
                columns="one",
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
        message="FLINT modular integer Hermite form failed",
    ),
    wasm=True,
)
def fmpz_mat_hnf_modular_eldiv(
    output: Writable[IntegerBuffer],
    source: IntegerBuffer,
    rows: uint64,
    columns: uint64,
    elementary_divisor: IntegerBuffer,
    one: Min[uint64, 1],
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
    dynamic="ffiNmodMatrixFromEntries",
    symbol="sagejs_nmod_matrix_from_entries",
    returns=int,
    abi=[
        out("result", sagejs_nmod_matrix_t),
        in_(
            "source",
            uint64_t_ptr,
            packed_slice(
                data="entries",
                length="entry_count",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_("entry_count", uint64_t),
        in_("rows", uint64_t),
        in_("columns", uint64_t),
        in_("modulus", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError, OverflowError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid word-prime matrix packed input",
    ),
    wasm=True,
)
def nmod_matrix_from_entries(
    entries: UInt64Buffer,
    entry_count: uint64,
    rows: uint64,
    columns: uint64,
    modulus: uint64,
) -> NmodMatrix: ...


@flint.function(
    dynamic="ffiNmodMatrixRandom",
    symbol="sagejs_nmod_matrix_random",
    returns=int,
    abi=[
        out("result", sagejs_nmod_matrix_t),
        in_("rows", uint64_t),
        in_("columns", uint64_t),
        in_("modulus", uint64_t),
        in_("seed1", uint64_t),
        in_("seed2", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError, OverflowError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid word-prime random matrix parameters",
    ),
    wasm=True,
)
def nmod_matrix_random(
    rows: uint64,
    columns: uint64,
    modulus: uint64,
    seed1: uint64,
    seed2: uint64,
) -> NmodMatrix: ...


@flint.function(
    dynamic="ffiNmodMatrixNrows",
    symbol="sagejs_nmod_matrix_nrows",
    returns=uint64_t,
    abi=[in_("matrix", sagejs_nmod_matrix_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def nmod_matrix_nrows(matrix: NmodMatrix) -> uint64: ...


@flint.function(
    dynamic="ffiNmodMatrixNcols",
    symbol="sagejs_nmod_matrix_ncols",
    returns=uint64_t,
    abi=[in_("matrix", sagejs_nmod_matrix_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def nmod_matrix_ncols(matrix: NmodMatrix) -> uint64: ...


@flint.function(
    dynamic="ffiNmodMatrixModulus",
    symbol="sagejs_nmod_matrix_modulus",
    returns=uint64_t,
    abi=[in_("matrix", sagejs_nmod_matrix_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def nmod_matrix_modulus(matrix: NmodMatrix) -> uint64: ...


@flint.function(
    dynamic="ffiNmodMatrixEntry",
    symbol="sagejs_nmod_matrix_entry",
    returns=uint64_t,
    abi=[
        in_("matrix", sagejs_nmod_matrix_t),
        in_("row", uint64_t),
        in_("column", uint64_t),
    ],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def nmod_matrix_entry(
    matrix: NmodMatrix,
    row: uint64,
    column: uint64,
) -> uint64: ...


@flint.function(
    dynamic="ffiNmodMatrixSetEntry",
    symbol="sagejs_nmod_matrix_set_entry",
    returns=int,
    abi=[
        in_("matrix", sagejs_nmod_matrix_t),
        in_("row", uint64_t),
        in_("column", uint64_t),
        in_("value", uint64_t),
    ],
    effects=Effects(
        pure=False,
        raises=[ValueError],
        writes=["matrix"],
    ),
    result=Status(1, exception=ValueError, message="invalid word-prime matrix entry"),
    wasm=True,
)
def nmod_matrix_set_entry(
    matrix: Writable[NmodMatrix],
    row: uint64,
    column: uint64,
    value: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodMatrixCopy",
    symbol="sagejs_nmod_matrix_init_set",
    returns=int,
    abi=[
        out("result", sagejs_nmod_matrix_t),
        in_("source", sagejs_nmod_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(1, exception=RuntimeError, message="word-prime matrix copy failed"),
    wasm=True,
)
def nmod_matrix_copy(source: NmodMatrix) -> NmodMatrix: ...


@flint.function(
    dynamic="ffiNmodMatrixEqual",
    symbol="sagejs_nmod_matrix_equal",
    returns=int,
    abi=[
        in_("left", sagejs_nmod_matrix_t),
        in_("right", sagejs_nmod_matrix_t),
    ],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def nmod_matrix_equal(left: NmodMatrix, right: NmodMatrix) -> bool: ...


@flint.function(
    dynamic="ffiNmodMatrixIsZero",
    symbol="sagejs_nmod_matrix_is_zero",
    returns=int,
    abi=[in_("matrix", sagejs_nmod_matrix_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def nmod_matrix_is_zero(matrix: NmodMatrix) -> bool: ...


@flint.function(
    dynamic="ffiNmodMatrixIsOne",
    symbol="sagejs_nmod_matrix_is_one",
    returns=int,
    abi=[in_("matrix", sagejs_nmod_matrix_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def nmod_matrix_is_one(matrix: NmodMatrix) -> bool: ...


@flint.function(
    dynamic="ffiNmodMatrixNonzeroCount",
    symbol="sagejs_nmod_matrix_nonzero_count",
    returns=uint64_t,
    abi=[in_("matrix", sagejs_nmod_matrix_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def nmod_matrix_nonzero_count(matrix: NmodMatrix) -> uint64: ...


@flint.function(
    dynamic="ffiNmodMatrixAdd",
    symbol="sagejs_nmod_matrix_add",
    returns=int,
    abi=[
        out("result", sagejs_nmod_matrix_t),
        in_("left", sagejs_nmod_matrix_t),
        in_("right", sagejs_nmod_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="word-prime matrix add mismatch"),
    wasm=True,
)
def nmod_matrix_add(left: NmodMatrix, right: NmodMatrix) -> NmodMatrix: ...


@flint.function(
    dynamic="ffiNmodMatrixSub",
    symbol="sagejs_nmod_matrix_sub",
    returns=int,
    abi=[
        out("result", sagejs_nmod_matrix_t),
        in_("left", sagejs_nmod_matrix_t),
        in_("right", sagejs_nmod_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1, exception=ValueError, message="word-prime matrix subtract mismatch"
    ),
    wasm=True,
)
def nmod_matrix_sub(left: NmodMatrix, right: NmodMatrix) -> NmodMatrix: ...


@flint.function(
    dynamic="ffiNmodMatrixNeg",
    symbol="sagejs_nmod_matrix_neg",
    returns=int,
    abi=[
        out("result", sagejs_nmod_matrix_t),
        in_("source", sagejs_nmod_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(
        1, exception=RuntimeError, message="word-prime matrix negation failed"
    ),
    wasm=True,
)
def nmod_matrix_neg(source: NmodMatrix) -> NmodMatrix: ...


@flint.function(
    dynamic="ffiNmodMatrixScalarMul",
    symbol="sagejs_nmod_matrix_scalar_mul",
    returns=int,
    abi=[
        out("result", sagejs_nmod_matrix_t),
        in_("source", sagejs_nmod_matrix_t),
        in_("scalar", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="invalid word-prime matrix scalar"),
    wasm=True,
)
def nmod_matrix_scalar_mul(
    source: NmodMatrix,
    scalar: uint64,
) -> NmodMatrix: ...


@flint.function(
    dynamic="ffiNmodMatrixTranspose",
    symbol="sagejs_nmod_matrix_transpose",
    returns=int,
    abi=[
        out("result", sagejs_nmod_matrix_t),
        in_("source", sagejs_nmod_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(
        1, exception=RuntimeError, message="word-prime matrix transpose failed"
    ),
    wasm=True,
)
def nmod_matrix_transpose(source: NmodMatrix) -> NmodMatrix: ...


@flint.function(
    dynamic="ffiNmodMatrixMul",
    symbol="sagejs_nmod_matrix_mul",
    returns=int,
    abi=[
        out("result", sagejs_nmod_matrix_t),
        in_("left", sagejs_nmod_matrix_t),
        in_("right", sagejs_nmod_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1, exception=ValueError, message="word-prime matrix multiply mismatch"
    ),
    wasm=True,
)
def nmod_matrix_mul(left: NmodMatrix, right: NmodMatrix) -> NmodMatrix: ...


@flint.function(
    dynamic="ffiNmodMatrixInv",
    symbol="sagejs_nmod_matrix_inv",
    returns=int,
    abi=[
        out("result", sagejs_nmod_matrix_t),
        in_("source", sagejs_nmod_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="word-prime matrix is singular"),
    wasm=True,
)
def nmod_matrix_inv(source: NmodMatrix) -> NmodMatrix: ...


@flint.function(
    dynamic="ffiNmodMatrixSolve",
    symbol="sagejs_nmod_matrix_solve",
    returns=int,
    abi=[
        out("result", sagejs_nmod_matrix_t),
        in_("left", sagejs_nmod_matrix_t),
        in_("right", sagejs_nmod_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="word-prime matrix solve failed"),
    wasm=True,
)
def nmod_matrix_solve(left: NmodMatrix, right: NmodMatrix) -> NmodMatrix: ...


@flint.function(
    dynamic="ffiNmodMatrixRank",
    symbol="sagejs_nmod_matrix_rank",
    returns=uint64_t,
    abi=[in_("matrix", sagejs_nmod_matrix_t)],
    effects=Effects(pure=False, allocates=True, writes=["matrix"]),
    result=Direct(),
    wasm=True,
)
def nmod_matrix_rank(matrix: Writable[NmodMatrix]) -> uint64: ...


@flint.function(
    dynamic="ffiNmodMatrixRref",
    symbol="sagejs_nmod_matrix_rref",
    returns=int,
    abi=[
        out("result", sagejs_nmod_matrix_t),
        in_("source", sagejs_nmod_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(1, exception=RuntimeError, message="word-prime matrix RREF failed"),
    wasm=True,
)
def nmod_matrix_rref(source: NmodMatrix) -> NmodMatrix: ...


@flint.function(
    dynamic="ffiNmodMatrixRightKernel",
    symbol="sagejs_nmod_matrix_right_kernel",
    returns=int,
    abi=[
        out("result", sagejs_nmod_matrix_t),
        in_("source", sagejs_nmod_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(1, exception=RuntimeError, message="word-prime right kernel failed"),
    wasm=True,
)
def nmod_matrix_right_kernel(source: NmodMatrix) -> NmodMatrix: ...


@flint.function(
    dynamic="ffiNmodMatrixDet",
    symbol="sagejs_nmod_matrix_det",
    returns=uint64_t,
    abi=[in_("source", sagejs_nmod_matrix_t)],
    effects=Effects(pure=True, allocates=True),
    result=Direct(),
    wasm=True,
)
def nmod_matrix_det(source: NmodMatrix) -> uint64: ...


@flint.function(
    dynamic="ffiNmodMatrixTrace",
    symbol="sagejs_nmod_matrix_trace",
    returns=uint64_t,
    abi=[in_("source", sagejs_nmod_matrix_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def nmod_matrix_trace(source: NmodMatrix) -> uint64: ...


@flint.function(
    dynamic="ffiNmodMatrixSelectRows",
    symbol="sagejs_nmod_matrix_select_rows",
    returns=int,
    abi=[
        out("result", sagejs_nmod_matrix_t),
        in_("source", sagejs_nmod_matrix_t),
        in_(
            "indices",
            uint64_t_ptr,
            packed_slice(
                data="indices",
                length="count",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_("count", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[IndexError]),
    result=Status(
        1, exception=IndexError, message="word-prime row index is out of range"
    ),
    wasm=True,
)
def nmod_matrix_select_rows(
    source: NmodMatrix,
    indices: UInt64Buffer,
    count: uint64,
) -> NmodMatrix: ...


@flint.function(
    dynamic="ffiNmodMatrixSelectColumns",
    symbol="sagejs_nmod_matrix_select_columns",
    returns=int,
    abi=[
        out("result", sagejs_nmod_matrix_t),
        in_("source", sagejs_nmod_matrix_t),
        in_(
            "indices",
            uint64_t_ptr,
            packed_slice(
                data="indices",
                length="count",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_("count", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[IndexError]),
    result=Status(
        1, exception=IndexError, message="word-prime column index is out of range"
    ),
    wasm=True,
)
def nmod_matrix_select_columns(
    source: NmodMatrix,
    indices: UInt64Buffer,
    count: uint64,
) -> NmodMatrix: ...


@flint.function(
    dynamic="ffiNmodMatrixSetBlock",
    symbol="sagejs_nmod_matrix_set_block",
    returns=int,
    abi=[
        in_("target", sagejs_nmod_matrix_t),
        in_("target_row", uint64_t),
        in_("target_column", uint64_t),
        in_("source", sagejs_nmod_matrix_t),
    ],
    effects=Effects(pure=False, raises=[ValueError], writes=["target"]),
    result=Status(1, exception=ValueError, message="word-prime matrix block mismatch"),
    wasm=True,
)
def nmod_matrix_set_block(
    target: Writable[NmodMatrix],
    target_row: uint64,
    target_column: uint64,
    source: NmodMatrix,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodMatrixMulVector",
    symbol="sagejs_nmod_matrix_mul_column_vector",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("matrix", sagejs_nmod_matrix_t),
        in_(
            "vector",
            uint64_t_ptr,
            packed_slice(
                data="vector",
                length="length",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_("length", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="word-prime matrix-vector mismatch"),
    wasm=True,
)
def nmod_matrix_mul_vector(
    matrix: NmodMatrix,
    vector: UInt64Buffer,
    length: uint64,
) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiNmodVectorMulMatrix",
    symbol="sagejs_nmod_row_vector_mul_matrix",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_(
            "vector",
            uint64_t_ptr,
            packed_slice(
                data="vector",
                length="length",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_("length", uint64_t),
        in_("matrix", sagejs_nmod_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="word-prime vector-matrix mismatch"),
    wasm=True,
)
def nmod_vector_mul_matrix(
    vector: UInt64Buffer,
    length: uint64,
    matrix: NmodMatrix,
) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiNmodMatrixStack",
    symbol="sagejs_nmod_matrix_stack",
    returns=int,
    abi=[
        out("result", sagejs_nmod_matrix_t),
        in_("top", sagejs_nmod_matrix_t),
        in_("bottom", sagejs_nmod_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="word-prime matrix stack mismatch"),
    wasm=True,
)
def nmod_matrix_stack(top: NmodMatrix, bottom: NmodMatrix) -> NmodMatrix: ...


@flint.function(
    dynamic="ffiNmodMatrixAugment",
    symbol="sagejs_nmod_matrix_augment",
    returns=int,
    abi=[
        out("result", sagejs_nmod_matrix_t),
        in_("left", sagejs_nmod_matrix_t),
        in_("right", sagejs_nmod_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1, exception=ValueError, message="word-prime matrix augment mismatch"
    ),
    wasm=True,
)
def nmod_matrix_augment(left: NmodMatrix, right: NmodMatrix) -> NmodMatrix: ...


@flint.function(
    dynamic="ffiNmodMatrixSwapRows",
    symbol="sagejs_nmod_matrix_swap_rows",
    returns=int,
    abi=[
        in_("matrix", sagejs_nmod_matrix_t),
        in_("first", uint64_t),
        in_("second", uint64_t),
    ],
    effects=Effects(pure=False, raises=[IndexError], writes=["matrix"]),
    result=Status(
        1, exception=IndexError, message="word-prime row index is out of range"
    ),
    wasm=True,
)
def nmod_matrix_swap_rows(
    matrix: Writable[NmodMatrix],
    first: uint64,
    second: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodMatrixSwapColumns",
    symbol="sagejs_nmod_matrix_swap_columns",
    returns=int,
    abi=[
        in_("matrix", sagejs_nmod_matrix_t),
        in_("first", uint64_t),
        in_("second", uint64_t),
    ],
    effects=Effects(pure=False, raises=[IndexError], writes=["matrix"]),
    result=Status(
        1, exception=IndexError, message="word-prime column index is out of range"
    ),
    wasm=True,
)
def nmod_matrix_swap_columns(
    matrix: Writable[NmodMatrix],
    first: uint64,
    second: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodMatrixFormat",
    symbol="sagejs_nmod_matrix_format",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("source", sagejs_nmod_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(
        1, exception=RuntimeError, message="word-prime matrix formatting failed"
    ),
    wasm=True,
)
def nmod_matrix_format(source: NmodMatrix) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiNmodMatrixSerialize",
    symbol="sagejs_nmod_matrix_serialize",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("source", sagejs_nmod_matrix_t),
        in_("width", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError, OverflowError]),
    result=Status(
        1, exception=ValueError, message="invalid word-prime matrix serialization width"
    ),
    wasm=True,
)
def nmod_matrix_serialize(
    source: NmodMatrix,
    width: uint64,
) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiNmodMatrixCharpoly",
    symbol="sagejs_nmod_matrix_charpoly",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("source", sagejs_nmod_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="word-prime characteristic polynomial requires a square matrix",
    ),
    wasm=True,
)
def nmod_matrix_charpoly(source: NmodMatrix) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiNmodMatrixMinpoly",
    symbol="sagejs_nmod_matrix_minpoly",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("source", sagejs_nmod_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="word-prime minimal polynomial requires a square matrix",
    ),
    wasm=True,
)
def nmod_matrix_minpoly(source: NmodMatrix) -> FlintByteRegion: ...


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
    dynamic="ffiFmpzPolyMul",
    symbol="sagejs_flint_fmpz_poly_mul_packed",
    returns=int,
    abi=[
        out(
            "output",
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
            "left",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="left",
                rows="one",
                columns="left_length",
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
                rows="one",
                columns="right_length",
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
        message="FLINT integer polynomial multiplication failed",
    ),
    wasm=True,
)
def fmpz_poly_mul(
    output: Writable[IntegerBuffer],
    left: IntegerBuffer,
    right: IntegerBuffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    one: Min[uint64, 1],
) -> bool: ...


@flint.function(
    dynamic="ffiFmpqPolyMul",
    symbol="sagejs_flint_fmpq_poly_mul_packed",
    returns=int,
    abi=[
        out(
            "output_numerators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="output_numerators",
                rows="one",
                columns="output_length",
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
                columns="output_length",
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
                rows="one",
                columns="left_length",
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
                rows="one",
                columns="left_length",
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
                rows="one",
                columns="right_length",
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
                rows="one",
                columns="right_length",
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
        message="FLINT rational polynomial multiplication failed",
    ),
    wasm=True,
)
def fmpq_poly_mul(
    output_numerators: Writable[IntegerBuffer],
    output_denominators: Writable[IntegerBuffer],
    left_numerators: IntegerBuffer,
    left_denominators: IntegerBuffer,
    right_numerators: IntegerBuffer,
    right_denominators: IntegerBuffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    one: Min[uint64, 1],
) -> bool: ...


@flint.function(
    dynamic="ffiNmodPolyAdd",
    symbol="sagejs_flint_nmod_poly_add_packed",
    returns=int,
    abi=[
        out(
            "result",
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
    effects=Effects(pure=False, allocates=True, raises=[ValueError], writes=["output"]),
    result=Status(1, exception=ValueError, message="invalid polynomial addition"),
    wasm=True,
)
def nmod_poly_add(
    output: Writable[UInt64Buffer],
    left: UInt64Buffer,
    right: UInt64Buffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodPolySub",
    symbol="sagejs_flint_nmod_poly_sub_packed",
    returns=int,
    abi=[
        out(
            "result",
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
    effects=Effects(pure=False, allocates=True, raises=[ValueError], writes=["output"]),
    result=Status(1, exception=ValueError, message="invalid polynomial subtraction"),
    wasm=True,
)
def nmod_poly_sub(
    output: Writable[UInt64Buffer],
    left: UInt64Buffer,
    right: UInt64Buffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodPolyNeg",
    symbol="sagejs_flint_nmod_poly_neg_packed",
    returns=int,
    abi=[
        out(
            "result",
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
        in_("source_length", uint64_t),
        in_("modulus", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError], writes=["output"]),
    result=Status(1, exception=ValueError, message="invalid polynomial negation"),
    wasm=True,
)
def nmod_poly_neg(
    output: Writable[UInt64Buffer],
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    modulus: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodPolyEqual",
    symbol="sagejs_flint_nmod_poly_equal_packed",
    returns=int,
    abi=[
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
        in_("left_length", uint64_t),
        in_("right_length", uint64_t),
        in_("modulus", uint64_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[]),
    result=Direct(),
    wasm=True,
)
def nmod_poly_equal(
    left: UInt64Buffer,
    right: UInt64Buffer,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodPolyDerivative",
    symbol="sagejs_flint_nmod_poly_derivative_packed",
    returns=int,
    abi=[
        out(
            "result",
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
        in_("source_length", uint64_t),
        in_("modulus", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError], writes=["output"]),
    result=Status(1, exception=ValueError, message="invalid polynomial derivative"),
    wasm=True,
)
def nmod_poly_derivative(
    output: Writable[UInt64Buffer],
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    modulus: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodPolyEvaluate",
    symbol="sagejs_flint_nmod_poly_evaluate_packed",
    returns=int,
    abi=[
        out(
            "result",
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
        in_("source_length", uint64_t),
        in_("argument", uint64_t),
        in_("modulus", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError], writes=["output"]),
    result=Status(1, exception=ValueError, message="invalid polynomial evaluation"),
    wasm=True,
)
def nmod_poly_evaluate(
    output: Writable[UInt64Buffer],
    source: UInt64Buffer,
    output_length: Min[uint64, 1],
    source_length: uint64,
    argument: uint64,
    modulus: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodPolyCompose",
    symbol="sagejs_flint_nmod_poly_compose_packed",
    returns=int,
    abi=[
        out(
            "result",
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
            "outer_data",
            uint64_t_ptr,
            packed_slice(
                data="outer",
                length="outer_length",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_(
            "inner_data",
            uint64_t_ptr,
            packed_slice(
                data="inner",
                length="inner_length",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_("output_length", uint64_t),
        in_("outer_length", uint64_t),
        in_("inner_length", uint64_t),
        in_("modulus", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError], writes=["output"]),
    result=Status(1, exception=ValueError, message="invalid polynomial composition"),
    wasm=True,
)
def nmod_poly_compose(
    output: Writable[UInt64Buffer],
    outer: UInt64Buffer,
    inner: UInt64Buffer,
    output_length: uint64,
    outer_length: uint64,
    inner_length: uint64,
    modulus: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodPolyReverse",
    symbol="sagejs_flint_nmod_poly_reverse_packed",
    returns=int,
    abi=[
        out(
            "result",
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
        in_("source_length", uint64_t),
        in_("reverse_length", uint64_t),
        in_("modulus", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError], writes=["output"]),
    result=Status(1, exception=ValueError, message="invalid polynomial reversal"),
    wasm=True,
)
def nmod_poly_reverse(
    output: Writable[UInt64Buffer],
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    reverse_length: uint64,
    modulus: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodPolyShiftLeft",
    symbol="sagejs_flint_nmod_poly_shift_left_packed",
    returns=int,
    abi=[
        out(
            "result",
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
        in_("source_length", uint64_t),
        in_("amount", uint64_t),
        in_("modulus", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError], writes=["output"]),
    result=Status(1, exception=ValueError, message="invalid polynomial left shift"),
    wasm=True,
)
def nmod_poly_shift_left(
    output: Writable[UInt64Buffer],
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    amount: uint64,
    modulus: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodPolyShiftRight",
    symbol="sagejs_flint_nmod_poly_shift_right_packed",
    returns=int,
    abi=[
        out(
            "result",
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
        in_("source_length", uint64_t),
        in_("amount", uint64_t),
        in_("modulus", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError], writes=["output"]),
    result=Status(1, exception=ValueError, message="invalid polynomial right shift"),
    wasm=True,
)
def nmod_poly_shift_right(
    output: Writable[UInt64Buffer],
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    amount: uint64,
    modulus: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodPolyTruncate",
    symbol="sagejs_flint_nmod_poly_truncate_packed",
    returns=int,
    abi=[
        out(
            "result",
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
        in_("source_length", uint64_t),
        in_("stop", uint64_t),
        in_("modulus", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError], writes=["output"]),
    result=Status(1, exception=ValueError, message="invalid polynomial truncation"),
    wasm=True,
)
def nmod_poly_truncate(
    output: Writable[UInt64Buffer],
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    stop: uint64,
    modulus: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodPolyIntegral",
    symbol="sagejs_flint_nmod_poly_integral_packed",
    returns=int,
    abi=[
        out(
            "result",
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
        in_("source_length", uint64_t),
        in_("modulus", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError], writes=["output"]),
    result=Status(
        1,
        exception=ValueError,
        message="prime polynomial integration requires degree smaller than the characteristic",
    ),
    wasm=True,
)
def nmod_poly_integral(
    output: Writable[UInt64Buffer],
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    modulus: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodPolyResultant",
    symbol="sagejs_flint_nmod_poly_resultant_packed",
    returns=int,
    abi=[
        out(
            "result",
            uint64_t_ptr,
            packed_slice(
                data="output",
                length="one",
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
        in_("one", uint64_t),
        in_("left_length", uint64_t),
        in_("right_length", uint64_t),
        in_("modulus", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError], writes=["output"]),
    result=Status(1, exception=ValueError, message="invalid polynomial resultant"),
    wasm=True,
)
def nmod_poly_resultant(
    output: Writable[UInt64Buffer],
    left: UInt64Buffer,
    right: UInt64Buffer,
    one: Min[uint64, 1],
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodPolyDiscriminant",
    symbol="sagejs_flint_nmod_poly_discriminant_packed",
    returns=int,
    abi=[
        out(
            "result",
            uint64_t_ptr,
            packed_slice(
                data="output",
                length="one",
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
        in_("one", uint64_t),
        in_("source_length", uint64_t),
        in_("modulus", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError], writes=["output"]),
    result=Status(1, exception=ValueError, message="invalid polynomial discriminant"),
    wasm=True,
)
def nmod_poly_discriminant(
    output: Writable[UInt64Buffer],
    source: UInt64Buffer,
    one: Min[uint64, 1],
    source_length: uint64,
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


@flint.function(
    dynamic="ffiNmodPolyDivExact",
    symbol="sagejs_flint_nmod_poly_divexact_packed",
    returns=int,
    abi=[
        out(
            "quotient",
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
        message="polynomial division is not exact",
    ),
    wasm=True,
)
def nmod_poly_divexact(
    output: Writable[UInt64Buffer],
    left: UInt64Buffer,
    right: UInt64Buffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodPolyDivRem",
    symbol="sagejs_flint_nmod_poly_divrem_packed",
    returns=int,
    abi=[
        out(
            "quotient_output",
            uint64_t_ptr,
            packed_slice(
                data="quotient",
                length="quotient_length",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "remainder_output",
            uint64_t_ptr,
            packed_slice(
                data="remainder",
                length="remainder_length",
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
        in_("quotient_length", uint64_t),
        in_("remainder_length", uint64_t),
        in_("left_length", uint64_t),
        in_("right_length", uint64_t),
        in_("modulus", uint64_t),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError],
        writes=["quotient", "remainder"],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="invalid packed polynomial quotient and remainder",
    ),
    wasm=True,
)
def nmod_poly_divrem(
    quotient: Writable[UInt64Buffer],
    remainder: Writable[UInt64Buffer],
    left: UInt64Buffer,
    right: UInt64Buffer,
    quotient_length: uint64,
    remainder_length: uint64,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpzPolyDivExact",
    symbol="sagejs_flint_fmpz_poly_divexact_packed",
    returns=int,
    abi=[
        out(
            "quotient",
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
            "left",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="left",
                rows="one",
                columns="left_length",
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
                rows="one",
                columns="right_length",
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
        message="polynomial division is not exact",
    ),
    wasm=True,
)
def fmpz_poly_divexact(
    output: Writable[IntegerBuffer],
    left: IntegerBuffer,
    right: IntegerBuffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    one: Min[uint64, 1],
) -> bool: ...


@flint.function(
    dynamic="ffiFmpqPolyDivExact",
    symbol="sagejs_flint_fmpq_poly_divexact_packed",
    returns=int,
    abi=[
        out(
            "output_numerators",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="output_numerators",
                rows="one",
                columns="output_length",
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
                columns="output_length",
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
                rows="one",
                columns="left_length",
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
                rows="one",
                columns="left_length",
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
                rows="one",
                columns="right_length",
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
                rows="one",
                columns="right_length",
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
        message="polynomial division is not exact",
    ),
    wasm=True,
)
def fmpq_poly_divexact(
    output_numerators: Writable[IntegerBuffer],
    output_denominators: Writable[IntegerBuffer],
    left_numerators: IntegerBuffer,
    left_denominators: IntegerBuffer,
    right_numerators: IntegerBuffer,
    right_denominators: IntegerBuffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    one: Min[uint64, 1],
) -> bool: ...


@flint.function(
    dynamic="ffiNmodPolyGcd",
    symbol="sagejs_flint_nmod_poly_gcd_packed",
    returns=int,
    abi=[
        out(
            "gcd",
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
    result=Status(1, exception=ValueError, message="polynomial gcd failed"),
    wasm=True,
)
def nmod_poly_gcd(
    output: Writable[UInt64Buffer],
    left: UInt64Buffer,
    right: UInt64Buffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodPolyXgcd",
    symbol="sagejs_flint_nmod_poly_xgcd_packed",
    returns=int,
    abi=[
        out(
            "gcd_result",
            uint64_t_ptr,
            packed_slice(
                data="gcd_output",
                length="output_length",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "left_coefficient_result",
            uint64_t_ptr,
            packed_slice(
                data="left_coefficient_output",
                length="output_length",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "right_coefficient_result",
            uint64_t_ptr,
            packed_slice(
                data="right_coefficient_output",
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
        writes=[
            "gcd_output",
            "left_coefficient_output",
            "right_coefficient_output",
        ],
    ),
    result=Status(1, exception=ValueError, message="polynomial xgcd failed"),
    wasm=True,
)
def nmod_poly_xgcd(
    gcd_output: Writable[UInt64Buffer],
    left_coefficient_output: Writable[UInt64Buffer],
    right_coefficient_output: Writable[UInt64Buffer],
    left: UInt64Buffer,
    right: UInt64Buffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodPolyIsIrreducible",
    symbol="sagejs_flint_nmod_poly_is_irreducible_packed",
    returns=int,
    abi=[
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
        in_("source_length", uint64_t),
        in_("modulus", uint64_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Direct(),
    wasm=True,
)
def nmod_poly_is_irreducible(
    source: UInt64Buffer,
    source_length: uint64,
    modulus: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodPolyFactor",
    symbol="sagejs_flint_nmod_poly_factor_packed",
    returns=int,
    abi=[
        out(
            "factor_coefficients",
            uint64_t_ptr,
            packed_slice(
                data="factor_coefficients",
                length="factor_coefficients_length",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "offsets",
            uint64_t_ptr,
            packed_slice(
                data="offsets",
                length="offsets_length",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "exponents",
            uint64_t_ptr,
            packed_slice(
                data="exponents",
                length="exponents_length",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "factor_count",
            uint64_t_ptr,
            packed_slice(
                data="factor_count",
                length="factor_count_length",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "unit_output",
            uint64_t_ptr,
            packed_slice(
                data="unit_output",
                length="unit_length",
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
        in_("factor_coefficients_length", uint64_t),
        in_("offsets_length", uint64_t),
        in_("exponents_length", uint64_t),
        in_("factor_count_length", uint64_t),
        in_("unit_length", uint64_t),
        in_("source_length", uint64_t),
        in_("modulus", uint64_t),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError],
        writes=[
            "factor_coefficients",
            "offsets",
            "exponents",
            "factor_count",
            "unit_output",
        ],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="factorization of 0 is not defined",
    ),
    wasm=True,
)
def nmod_poly_factor(
    factor_coefficients: Writable[UInt64Buffer],
    offsets: Writable[UInt64Buffer],
    exponents: Writable[UInt64Buffer],
    factor_count: Writable[UInt64Buffer],
    unit_output: Writable[UInt64Buffer],
    source: UInt64Buffer,
    factor_coefficients_length: uint64,
    offsets_length: uint64,
    exponents_length: uint64,
    factor_count_length: uint64,
    unit_length: uint64,
    source_length: uint64,
    modulus: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiNmodPolyRoots",
    symbol="sagejs_flint_nmod_poly_roots_packed",
    returns=int,
    abi=[
        out(
            "root_values",
            uint64_t_ptr,
            packed_slice(
                data="root_values",
                length="root_values_length",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "multiplicities",
            uint64_t_ptr,
            packed_slice(
                data="multiplicities",
                length="multiplicities_length",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "root_count",
            uint64_t_ptr,
            packed_slice(
                data="root_count",
                length="root_count_length",
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
        in_("root_values_length", uint64_t),
        in_("multiplicities_length", uint64_t),
        in_("root_count_length", uint64_t),
        in_("source_length", uint64_t),
        in_("modulus", uint64_t),
    ],
    effects=Effects(
        pure=False,
        allocates=True,
        raises=[ValueError],
        writes=["root_values", "multiplicities", "root_count"],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="roots of the zero polynomial are not defined",
    ),
    wasm=True,
)
def nmod_poly_roots(
    root_values: Writable[UInt64Buffer],
    multiplicities: Writable[UInt64Buffer],
    root_count: Writable[UInt64Buffer],
    source: UInt64Buffer,
    root_values_length: uint64,
    multiplicities_length: uint64,
    root_count_length: uint64,
    source_length: uint64,
    modulus: uint64,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpzPolyFactor",
    symbol="sagejs_flint_fmpz_poly_factor_packed",
    returns=int,
    abi=[
        out(
            "factor_coefficients",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="factor_coefficients",
                rows="one",
                columns="factor_coefficients_length",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "offsets",
            uint64_t_ptr,
            packed_slice(
                data="offsets",
                length="source_length",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "exponents",
            uint64_t_ptr,
            packed_slice(
                data="exponents",
                length="source_length",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "factor_count",
            uint64_t_ptr,
            packed_slice(
                data="factor_count",
                length="one",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "unit_numerator",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="unit_numerator",
                rows="one",
                columns="one",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "unit_denominator",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="unit_denominator",
                rows="one",
                columns="one",
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
                rows="one",
                columns="source_length",
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
        writes=[
            "factor_coefficients",
            "offsets",
            "exponents",
            "factor_count",
            "unit_numerator",
            "unit_denominator",
        ],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="factorization of 0 is not defined",
    ),
    wasm=True,
)
def fmpz_poly_factor(
    factor_coefficients: Writable[IntegerBuffer],
    offsets: Writable[UInt64Buffer],
    exponents: Writable[UInt64Buffer],
    factor_count: Writable[UInt64Buffer],
    unit_numerator: Writable[IntegerBuffer],
    unit_denominator: Writable[IntegerBuffer],
    source: IntegerBuffer,
    factor_coefficients_length: uint64,
    source_length: uint64,
    one: Min[uint64, 1],
) -> bool: ...


@flint.function(
    dynamic="ffiFmpqPolyFactor",
    symbol="sagejs_flint_fmpq_poly_factor_packed",
    returns=int,
    abi=[
        out(
            "factor_coefficients",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="factor_coefficients",
                rows="one",
                columns="factor_coefficients_length",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "offsets",
            uint64_t_ptr,
            packed_slice(
                data="offsets",
                length="source_length",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "exponents",
            uint64_t_ptr,
            packed_slice(
                data="exponents",
                length="source_length",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "factor_count",
            uint64_t_ptr,
            packed_slice(
                data="factor_count",
                length="one",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "unit_numerator",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="unit_numerator",
                rows="one",
                columns="one",
                access="write",
                aliasing="allowed",
                transactional=True,
            ),
        ),
        out(
            "unit_denominator",
            fmpz_mat_t,
            packed_fmpz_matrix(
                data="unit_denominator",
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
                rows="one",
                columns="source_length",
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
                rows="one",
                columns="source_length",
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
        writes=[
            "factor_coefficients",
            "offsets",
            "exponents",
            "factor_count",
            "unit_numerator",
            "unit_denominator",
        ],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="factorization of 0 is not defined",
    ),
    wasm=True,
)
def fmpq_poly_factor(
    factor_coefficients: Writable[IntegerBuffer],
    offsets: Writable[UInt64Buffer],
    exponents: Writable[UInt64Buffer],
    factor_count: Writable[UInt64Buffer],
    unit_numerator: Writable[IntegerBuffer],
    unit_denominator: Writable[IntegerBuffer],
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
    factor_coefficients_length: uint64,
    source_length: uint64,
    one: Min[uint64, 1],
) -> bool: ...


# Word-characteristic finite extension resources. Coordinates are canonical
# residues in the low-to-high power basis `1, a, ..., a^(degree-1)`.
@flint.function(
    dynamic="ffiFqContextCreate",
    symbol="sagejs_fq_context_init",
    returns=int,
    abi=[
        out("result", sagejs_fq_context_t),
        in_(
            "modulus_entries",
            uint64_t_ptr,
            packed_slice(
                data="modulus",
                length="modulus_length",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_("modulus_length", uint64_t),
        in_("characteristic", uint64_t),
    ],
    effects=Effects(
        pure=False,
        deterministic=True,
        thread_safe=False,
        allocates=True,
        raises=[ValueError],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="finite extension modulus is invalid or unsupported",
    ),
    wasm=True,
)
def fq_context(
    modulus: UInt64Buffer,
    modulus_length: uint64,
    characteristic: uint64,
) -> FqContext: ...


@flint.function(
    dynamic="ffiFqContextCharacteristic",
    symbol="sagejs_fq_context_characteristic",
    returns=uint64_t,
    abi=[in_("context", sagejs_fq_context_t)],
    effects=Effects(pure=True, thread_safe=False),
    result=Direct(),
    wasm=True,
)
def fq_context_characteristic(context: FqContext) -> uint64: ...


@flint.function(
    dynamic="ffiFqContextDegree",
    symbol="sagejs_fq_context_degree",
    returns=uint64_t,
    abi=[in_("context", sagejs_fq_context_t)],
    effects=Effects(pure=True, thread_safe=False),
    result=Direct(),
    wasm=True,
)
def fq_context_degree(context: FqContext) -> uint64: ...


@flint.function(
    dynamic="ffiFqElementCreate",
    symbol="sagejs_fq_element_init_coordinates",
    returns=int,
    abi=[
        out("result", sagejs_fq_element_t),
        in_("context", sagejs_fq_context_t),
        in_(
            "coordinate_entries",
            uint64_t_ptr,
            packed_slice(
                data="coordinates",
                length="coordinate_length",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_("coordinate_length", uint64_t),
    ],
    effects=Effects(
        pure=False,
        deterministic=True,
        thread_safe=False,
        allocates=True,
        raises=[ValueError],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="finite extension element coordinates are invalid",
    ),
    wasm=True,
)
def fq_element(
    context: FqContext,
    coordinates: UInt64Buffer,
    coordinate_length: uint64,
) -> FqElement: ...


@flint.function(
    dynamic="ffiFqElementCopy",
    symbol="sagejs_fq_element_copy",
    returns=int,
    abi=[
        out("result", sagejs_fq_element_t),
        in_("source", sagejs_fq_element_t),
    ],
    effects=Effects(
        pure=False,
        thread_safe=False,
        allocates=True,
        raises=[RuntimeError],
    ),
    result=Status(1, exception=RuntimeError, message="finite extension copy failed"),
    wasm=True,
)
def fq_element_copy(source: FqElement) -> FqElement: ...


@flint.function(
    dynamic="ffiFqElementExtensionDegree",
    symbol="sagejs_fq_element_extension_degree",
    returns=uint64_t,
    abi=[in_("element", sagejs_fq_element_t)],
    effects=Effects(pure=True, thread_safe=False),
    result=Direct(),
    wasm=True,
)
def fq_element_extension_degree(element: FqElement) -> uint64: ...


@flint.function(
    dynamic="ffiFqElementCoordinate",
    symbol="sagejs_fq_element_coordinate_checked",
    returns=const_uint64_t_ptr,
    abi=[
        in_("element", sagejs_fq_element_t),
        in_("basis_index", uint64_t),
    ],
    effects=Effects(pure=True, thread_safe=False, raises=[IndexError]),
    result=Nullable(
        exception=IndexError,
        message="finite extension basis index out of range",
    ),
    wasm=False,
)
def fq_element_coordinate(element: FqElement, basis_index: uint64) -> uint64: ...


@flint.function(
    dynamic="ffiFqElementEqual",
    symbol="sagejs_fq_element_equal",
    returns=int,
    abi=[
        in_("left", sagejs_fq_element_t),
        in_("right", sagejs_fq_element_t),
    ],
    effects=Effects(pure=True, thread_safe=False),
    result=Direct(),
    wasm=True,
)
def fq_element_equal(left: FqElement, right: FqElement) -> bool: ...


@flint.function(
    dynamic="ffiFqElementAdd",
    symbol="sagejs_fq_element_add",
    returns=int,
    abi=[
        out("result", sagejs_fq_element_t),
        in_("left", sagejs_fq_element_t),
        in_("right", sagejs_fq_element_t),
    ],
    effects=Effects(
        pure=False,
        thread_safe=False,
        allocates=True,
        raises=[TypeError],
    ),
    result=Status(1, exception=TypeError, message="finite extension contexts differ"),
    wasm=True,
)
def fq_element_add(left: FqElement, right: FqElement) -> FqElement: ...


@flint.function(
    dynamic="ffiFqElementSub",
    symbol="sagejs_fq_element_sub",
    returns=int,
    abi=[
        out("result", sagejs_fq_element_t),
        in_("left", sagejs_fq_element_t),
        in_("right", sagejs_fq_element_t),
    ],
    effects=Effects(
        pure=False,
        thread_safe=False,
        allocates=True,
        raises=[TypeError],
    ),
    result=Status(1, exception=TypeError, message="finite extension contexts differ"),
    wasm=True,
)
def fq_element_sub(left: FqElement, right: FqElement) -> FqElement: ...


@flint.function(
    dynamic="ffiFqElementMul",
    symbol="sagejs_fq_element_mul",
    returns=int,
    abi=[
        out("result", sagejs_fq_element_t),
        in_("left", sagejs_fq_element_t),
        in_("right", sagejs_fq_element_t),
    ],
    effects=Effects(
        pure=False,
        thread_safe=False,
        allocates=True,
        raises=[TypeError],
    ),
    result=Status(1, exception=TypeError, message="finite extension contexts differ"),
    wasm=True,
)
def fq_element_mul(left: FqElement, right: FqElement) -> FqElement: ...


@flint.function(
    dynamic="ffiFqElementNeg",
    symbol="sagejs_fq_element_neg",
    returns=int,
    abi=[
        out("result", sagejs_fq_element_t),
        in_("source", sagejs_fq_element_t),
    ],
    effects=Effects(
        pure=False,
        thread_safe=False,
        allocates=True,
        raises=[RuntimeError],
    ),
    result=Status(
        1, exception=RuntimeError, message="finite extension negation failed"
    ),
    wasm=True,
)
def fq_element_neg(source: FqElement) -> FqElement: ...


@flint.function(
    dynamic="ffiFqElementInverse",
    symbol="sagejs_fq_element_inverse",
    returns=int,
    abi=[
        out("result", sagejs_fq_element_t),
        in_("source", sagejs_fq_element_t),
    ],
    effects=Effects(
        pure=False,
        thread_safe=False,
        allocates=True,
        raises=[RuntimeError],
    ),
    result=Status(
        1,
        exception=RuntimeError,
        message="finite extension inverse failed",
    ),
    wasm=True,
)
def fq_element_inverse(source: FqElement) -> FqElement: ...


@flint.function(
    dynamic="ffiFqElementPow",
    symbol="sagejs_fq_element_pow",
    returns=int,
    abi=[
        out("result", sagejs_fq_element_t),
        in_("source", sagejs_fq_element_t),
        in_("exponent", fmpz_t),
    ],
    effects=Effects(
        pure=False,
        thread_safe=False,
        allocates=True,
        raises=[RuntimeError],
    ),
    result=Status(
        1,
        exception=RuntimeError,
        message="finite extension power failed",
    ),
    wasm=True,
)
def fq_element_pow(source: FqElement, exponent: Integer) -> FqElement: ...


@flint.function(
    dynamic="ffiFqElementIsZero",
    symbol="sagejs_fq_element_is_zero",
    returns=int,
    abi=[in_("source", sagejs_fq_element_t)],
    effects=Effects(pure=True, thread_safe=False),
    result=Direct(),
    wasm=True,
)
def fq_element_is_zero(source: FqElement) -> bool: ...


@flint.function(
    dynamic="ffiFqElementIsOne",
    symbol="sagejs_fq_element_is_one",
    returns=int,
    abi=[in_("source", sagejs_fq_element_t)],
    effects=Effects(pure=True, thread_safe=False),
    result=Direct(),
    wasm=True,
)
def fq_element_is_one(source: FqElement) -> bool: ...


@flint.function(
    dynamic="ffiFqElementCoordinateBytes",
    symbol="sagejs_fq_element_coordinate_bytes",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("element", sagejs_fq_element_t),
    ],
    effects=Effects(
        pure=False,
        thread_safe=False,
        allocates=True,
        raises=[OverflowError],
    ),
    result=Status(
        1,
        exception=OverflowError,
        message="finite extension element export is too large",
    ),
    wasm=True,
)
def fq_element_coordinate_bytes(element: FqElement) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiFqPolynomialCreate",
    symbol="sagejs_fq_polynomial_init_coordinates",
    returns=int,
    abi=[
        out("result", sagejs_fq_polynomial_t),
        in_("context", sagejs_fq_context_t),
        in_(
            "coordinate_entries",
            uint64_t_ptr,
            packed_slice(
                data="coordinates",
                length="coordinate_length",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_("coordinate_length", uint64_t),
        in_("coefficient_count", uint64_t),
    ],
    effects=Effects(
        pure=False,
        deterministic=True,
        thread_safe=False,
        allocates=True,
        raises=[ValueError],
    ),
    result=Status(
        1,
        exception=ValueError,
        message="finite extension polynomial coordinates are invalid",
    ),
    wasm=True,
)
def fq_polynomial(
    context: FqContext,
    coordinates: UInt64Buffer,
    coordinate_length: uint64,
    coefficient_count: uint64,
) -> FqPolynomial: ...


@flint.function(
    dynamic="ffiFqPolynomialCopy",
    symbol="sagejs_fq_polynomial_copy",
    returns=int,
    abi=[
        out("result", sagejs_fq_polynomial_t),
        in_("source", sagejs_fq_polynomial_t),
    ],
    effects=Effects(
        pure=False,
        thread_safe=False,
        allocates=True,
        raises=[RuntimeError],
    ),
    result=Status(
        1, exception=RuntimeError, message="extension polynomial copy failed"
    ),
    wasm=True,
)
def fq_polynomial_copy(source: FqPolynomial) -> FqPolynomial: ...


@flint.function(
    dynamic="ffiFqPolynomialLength",
    symbol="sagejs_fq_polynomial_length",
    returns=uint64_t,
    abi=[in_("polynomial", sagejs_fq_polynomial_t)],
    effects=Effects(pure=True, thread_safe=False),
    result=Direct(),
    wasm=True,
)
def fq_polynomial_length(polynomial: FqPolynomial) -> uint64: ...


@flint.function(
    dynamic="ffiFqPolynomialExtensionDegree",
    symbol="sagejs_fq_polynomial_extension_degree",
    returns=uint64_t,
    abi=[in_("polynomial", sagejs_fq_polynomial_t)],
    effects=Effects(pure=True, thread_safe=False),
    result=Direct(),
    wasm=True,
)
def fq_polynomial_extension_degree(polynomial: FqPolynomial) -> uint64: ...


@flint.function(
    dynamic="ffiFqPolynomialCoordinate",
    symbol="sagejs_fq_polynomial_coordinate_checked",
    returns=const_uint64_t_ptr,
    abi=[
        in_("polynomial", sagejs_fq_polynomial_t),
        in_("coefficient_index", uint64_t),
        in_("basis_index", uint64_t),
    ],
    effects=Effects(pure=True, thread_safe=False, raises=[IndexError]),
    result=Nullable(
        exception=IndexError,
        message="extension polynomial coordinate index out of range",
    ),
    wasm=False,
)
def fq_polynomial_coordinate(
    polynomial: FqPolynomial,
    coefficient_index: uint64,
    basis_index: uint64,
) -> uint64: ...


@flint.function(
    dynamic="ffiFqPolynomialEqual",
    symbol="sagejs_fq_polynomial_equal",
    returns=int,
    abi=[
        in_("left", sagejs_fq_polynomial_t),
        in_("right", sagejs_fq_polynomial_t),
    ],
    effects=Effects(pure=True, thread_safe=False),
    result=Direct(),
    wasm=True,
)
def fq_polynomial_equal(left: FqPolynomial, right: FqPolynomial) -> bool: ...


@flint.function(
    dynamic="ffiFqPolynomialAdd",
    symbol="sagejs_fq_polynomial_add",
    returns=int,
    abi=[
        out("result", sagejs_fq_polynomial_t),
        in_("left", sagejs_fq_polynomial_t),
        in_("right", sagejs_fq_polynomial_t),
    ],
    effects=Effects(
        pure=False,
        thread_safe=False,
        allocates=True,
        raises=[TypeError],
    ),
    result=Status(
        1, exception=TypeError, message="extension polynomial contexts differ"
    ),
    wasm=True,
)
def fq_polynomial_add(left: FqPolynomial, right: FqPolynomial) -> FqPolynomial: ...


@flint.function(
    dynamic="ffiFqPolynomialSub",
    symbol="sagejs_fq_polynomial_sub",
    returns=int,
    abi=[
        out("result", sagejs_fq_polynomial_t),
        in_("left", sagejs_fq_polynomial_t),
        in_("right", sagejs_fq_polynomial_t),
    ],
    effects=Effects(
        pure=False,
        thread_safe=False,
        allocates=True,
        raises=[TypeError],
    ),
    result=Status(
        1, exception=TypeError, message="extension polynomial contexts differ"
    ),
    wasm=True,
)
def fq_polynomial_sub(left: FqPolynomial, right: FqPolynomial) -> FqPolynomial: ...


@flint.function(
    dynamic="ffiFqPolynomialMul",
    symbol="sagejs_fq_polynomial_mul",
    returns=int,
    abi=[
        out("result", sagejs_fq_polynomial_t),
        in_("left", sagejs_fq_polynomial_t),
        in_("right", sagejs_fq_polynomial_t),
    ],
    effects=Effects(
        pure=False,
        thread_safe=False,
        allocates=True,
        raises=[TypeError],
    ),
    result=Status(
        1, exception=TypeError, message="extension polynomial contexts differ"
    ),
    wasm=True,
)
def fq_polynomial_mul(left: FqPolynomial, right: FqPolynomial) -> FqPolynomial: ...


@flint.function(
    dynamic="ffiFqPolynomialNeg",
    symbol="sagejs_fq_polynomial_neg",
    returns=int,
    abi=[
        out("result", sagejs_fq_polynomial_t),
        in_("source", sagejs_fq_polynomial_t),
    ],
    effects=Effects(
        pure=False,
        thread_safe=False,
        allocates=True,
        raises=[RuntimeError],
    ),
    result=Status(
        1, exception=RuntimeError, message="extension polynomial negation failed"
    ),
    wasm=True,
)
def fq_polynomial_neg(source: FqPolynomial) -> FqPolynomial: ...


@flint.function(
    dynamic="ffiFqPolynomialPow",
    symbol="sagejs_fq_polynomial_pow",
    returns=int,
    abi=[
        out("result", sagejs_fq_polynomial_t),
        in_("source", sagejs_fq_polynomial_t),
        in_("exponent", uint64_t),
    ],
    effects=Effects(
        pure=False,
        thread_safe=False,
        allocates=True,
        raises=[OverflowError],
    ),
    result=Status(
        1, exception=OverflowError, message="extension polynomial exponent is too large"
    ),
    wasm=True,
)
def fq_polynomial_pow(source: FqPolynomial, exponent: uint64) -> FqPolynomial: ...


@flint.function(
    dynamic="ffiFqPolynomialCoordinateBytes",
    symbol="sagejs_fq_polynomial_coordinate_bytes",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("polynomial", sagejs_fq_polynomial_t),
    ],
    effects=Effects(
        pure=False,
        thread_safe=False,
        allocates=True,
        raises=[OverflowError],
    ),
    result=Status(
        1, exception=OverflowError, message="extension polynomial export is too large"
    ),
    wasm=True,
)
def fq_polynomial_coordinate_bytes(polynomial: FqPolynomial) -> FlintByteRegion: ...


# Arbitrary-prime `GF(p)[x]` values own both an `fmpz_mod_ctx_t` and their
# `fmpz_mod_poly_t`.  Every result below is therefore self-contained: operands
# are borrowed only for the synchronous call and no result borrows a context.
@flint.function(
    dynamic="ffiFmpzModPolynomialCreate",
    symbol="sagejs_fmpz_mod_polynomial_init",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_mod_polynomial_t),
        in_("modulus", fmpz_t),
        in_("length", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="modulus must be prime and polynomial length must fit the host",
    ),
    wasm=True,
)
def fmpz_mod_polynomial(modulus: Integer, length: uint64) -> FmpzModPolynomial: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialSetCoefficient",
    symbol="sagejs_fmpz_mod_polynomial_set_coefficient",
    returns=int,
    abi=[
        in_("polynomial", sagejs_fmpz_mod_polynomial_t),
        in_("index", uint64_t),
        in_("coefficient", fmpz_t),
    ],
    effects=Effects(pure=False, raises=[ValueError], writes=["polynomial"]),
    result=Status(
        1,
        exception=ValueError,
        message="coefficient write requires an in-range unsealed polynomial",
    ),
    wasm=True,
)
def fmpz_mod_polynomial_set_coefficient(
    polynomial: Writable[FmpzModPolynomial],
    index: uint64,
    coefficient: Integer,
) -> bool: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialSeal",
    symbol="sagejs_fmpz_mod_polynomial_seal",
    returns=int,
    abi=[in_("polynomial", sagejs_fmpz_mod_polynomial_t)],
    effects=Effects(pure=False, raises=[ValueError], writes=["polynomial"]),
    result=Status(
        1,
        exception=ValueError,
        message="polynomial resource is already sealed",
    ),
    wasm=True,
)
def fmpz_mod_polynomial_seal(
    polynomial: Writable[FmpzModPolynomial],
) -> bool: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialModulus",
    symbol="sagejs_fmpz_mod_polynomial_modulus",
    returns=int,
    abi=[out("result", fmpz_t), in_("source", sagejs_fmpz_mod_polynomial_t)],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="polynomial is unsealed"),
    wasm=True,
)
def fmpz_mod_polynomial_modulus(source: FmpzModPolynomial) -> Integer: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialIsZero",
    symbol="sagejs_fmpz_mod_polynomial_is_zero",
    returns=int,
    abi=[out("result", fmpz_t), in_("source", sagejs_fmpz_mod_polynomial_t)],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="polynomial is unsealed"),
    wasm=True,
)
def fmpz_mod_polynomial_is_zero(source: FmpzModPolynomial) -> Integer: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialLength",
    symbol="sagejs_fmpz_mod_polynomial_length",
    returns=int,
    abi=[out("result", fmpz_t), in_("source", sagejs_fmpz_mod_polynomial_t)],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="polynomial is unsealed"),
    wasm=True,
)
def fmpz_mod_polynomial_length(source: FmpzModPolynomial) -> Integer: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialEntryCount",
    symbol="sagejs_fmpz_mod_polynomial_entry_count",
    returns=uint64_t,
    abi=[in_("source", sagejs_fmpz_mod_polynomial_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=True,
)
def fmpz_mod_polynomial_entry_count(source: FmpzModPolynomial) -> uint64: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialCoefficient",
    symbol="sagejs_fmpz_mod_polynomial_coefficient",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("source", sagejs_fmpz_mod_polynomial_t),
        in_("index", uint64_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="coefficient access requires a sealed polynomial and host-sized index",
    ),
    wasm=True,
)
def fmpz_mod_polynomial_coefficient(
    source: FmpzModPolynomial, index: uint64
) -> Integer: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialCopy",
    symbol="sagejs_fmpz_mod_polynomial_copy",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_mod_polynomial_t),
        in_("source", sagejs_fmpz_mod_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="polynomial is unsealed"),
    wasm=True,
)
def fmpz_mod_polynomial_copy(source: FmpzModPolynomial) -> FmpzModPolynomial: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialEqual",
    symbol="sagejs_fmpz_mod_polynomial_equal",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("left", sagejs_fmpz_mod_polynomial_t),
        in_("right", sagejs_fmpz_mod_polynomial_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="polynomial moduli do not match"),
    wasm=True,
)
def fmpz_mod_polynomial_equal(
    left: FmpzModPolynomial, right: FmpzModPolynomial
) -> Integer: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialAdd",
    symbol="sagejs_fmpz_mod_polynomial_add",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_mod_polynomial_t),
        in_("left", sagejs_fmpz_mod_polynomial_t),
        in_("right", sagejs_fmpz_mod_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="polynomial moduli do not match"),
    wasm=True,
)
def fmpz_mod_polynomial_add(
    left: FmpzModPolynomial, right: FmpzModPolynomial
) -> FmpzModPolynomial: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialSub",
    symbol="sagejs_fmpz_mod_polynomial_sub",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_mod_polynomial_t),
        in_("left", sagejs_fmpz_mod_polynomial_t),
        in_("right", sagejs_fmpz_mod_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="polynomial moduli do not match"),
    wasm=True,
)
def fmpz_mod_polynomial_sub(
    left: FmpzModPolynomial, right: FmpzModPolynomial
) -> FmpzModPolynomial: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialMul",
    symbol="sagejs_fmpz_mod_polynomial_mul",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_mod_polynomial_t),
        in_("left", sagejs_fmpz_mod_polynomial_t),
        in_("right", sagejs_fmpz_mod_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="polynomial moduli do not match"),
    wasm=True,
)
def fmpz_mod_polynomial_mul(
    left: FmpzModPolynomial, right: FmpzModPolynomial
) -> FmpzModPolynomial: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialNeg",
    symbol="sagejs_fmpz_mod_polynomial_neg",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_mod_polynomial_t),
        in_("source", sagejs_fmpz_mod_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="polynomial is unsealed"),
    wasm=True,
)
def fmpz_mod_polynomial_neg(source: FmpzModPolynomial) -> FmpzModPolynomial: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialPow",
    symbol="sagejs_fmpz_mod_polynomial_pow",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_mod_polynomial_t),
        in_("source", sagejs_fmpz_mod_polynomial_t),
        in_("exponent", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[OverflowError]),
    result=Status(
        1, exception=OverflowError, message="polynomial exponent is too large"
    ),
    wasm=True,
)
def fmpz_mod_polynomial_pow(
    source: FmpzModPolynomial, exponent: uint64
) -> FmpzModPolynomial: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialDerivative",
    symbol="sagejs_fmpz_mod_polynomial_derivative",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_mod_polynomial_t),
        in_("source", sagejs_fmpz_mod_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="polynomial is unsealed"),
    wasm=True,
)
def fmpz_mod_polynomial_derivative(
    source: FmpzModPolynomial,
) -> FmpzModPolynomial: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialEvaluate",
    symbol="sagejs_fmpz_mod_polynomial_evaluate",
    returns=int,
    abi=[
        out("result", fmpz_t),
        in_("source", sagejs_fmpz_mod_polynomial_t),
        in_("argument", fmpz_t),
    ],
    effects=Effects(pure=True, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="polynomial is unsealed"),
    wasm=True,
)
def fmpz_mod_polynomial_evaluate(
    source: FmpzModPolynomial, argument: Integer
) -> Integer: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialGcd",
    symbol="sagejs_fmpz_mod_polynomial_gcd",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_mod_polynomial_t),
        in_("left", sagejs_fmpz_mod_polynomial_t),
        in_("right", sagejs_fmpz_mod_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="polynomial moduli do not match"),
    wasm=True,
)
def fmpz_mod_polynomial_gcd(
    left: FmpzModPolynomial, right: FmpzModPolynomial
) -> FmpzModPolynomial: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialDivremResource",
    symbol="sagejs_fmpz_mod_polynomial_divrem_resource",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_mod_polynomial_division_result_t),
        in_("dividend", sagejs_fmpz_mod_polynomial_t),
        in_("divisor", sagejs_fmpz_mod_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="polynomial division requires equal moduli and a nonzero divisor",
    ),
    wasm=True,
)
def fmpz_mod_polynomial_divrem_resource(
    dividend: FmpzModPolynomial, divisor: FmpzModPolynomial
) -> FmpzModPolynomialDivisionResult: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialDivisionResultQuotient",
    symbol="sagejs_fmpz_mod_polynomial_division_result_quotient",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_mod_polynomial_t),
        in_("division", sagejs_fmpz_mod_polynomial_division_result_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="invalid division result"),
    wasm=True,
)
def fmpz_mod_polynomial_division_result_quotient(
    division: FmpzModPolynomialDivisionResult,
) -> FmpzModPolynomial: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialDivisionResultRemainder",
    symbol="sagejs_fmpz_mod_polynomial_division_result_remainder",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_mod_polynomial_t),
        in_("division", sagejs_fmpz_mod_polynomial_division_result_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="invalid division result"),
    wasm=True,
)
def fmpz_mod_polynomial_division_result_remainder(
    division: FmpzModPolynomialDivisionResult,
) -> FmpzModPolynomial: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialXgcdResource",
    symbol="sagejs_fmpz_mod_polynomial_xgcd_resource",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_mod_polynomial_xgcd_result_t),
        in_("left", sagejs_fmpz_mod_polynomial_t),
        in_("right", sagejs_fmpz_mod_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="polynomial moduli do not match"),
    wasm=True,
)
def fmpz_mod_polynomial_xgcd_resource(
    left: FmpzModPolynomial, right: FmpzModPolynomial
) -> FmpzModPolynomialXgcdResult: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialXgcdResultGcd",
    symbol="sagejs_fmpz_mod_polynomial_xgcd_result_gcd",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_mod_polynomial_t),
        in_("xgcd", sagejs_fmpz_mod_polynomial_xgcd_result_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="invalid xgcd result"),
    wasm=True,
)
def fmpz_mod_polynomial_xgcd_result_gcd(
    xgcd: FmpzModPolynomialXgcdResult,
) -> FmpzModPolynomial: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialXgcdResultLeftCoefficient",
    symbol="sagejs_fmpz_mod_polynomial_xgcd_result_left_coefficient",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_mod_polynomial_t),
        in_("xgcd", sagejs_fmpz_mod_polynomial_xgcd_result_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="invalid xgcd result"),
    wasm=True,
)
def fmpz_mod_polynomial_xgcd_result_left_coefficient(
    xgcd: FmpzModPolynomialXgcdResult,
) -> FmpzModPolynomial: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialXgcdResultRightCoefficient",
    symbol="sagejs_fmpz_mod_polynomial_xgcd_result_right_coefficient",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_mod_polynomial_t),
        in_("xgcd", sagejs_fmpz_mod_polynomial_xgcd_result_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="invalid xgcd result"),
    wasm=True,
)
def fmpz_mod_polynomial_xgcd_result_right_coefficient(
    xgcd: FmpzModPolynomialXgcdResult,
) -> FmpzModPolynomial: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialFactorResource",
    symbol="sagejs_fmpz_mod_polynomial_factor_resource",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_mod_polynomial_factorization_t),
        in_("source", sagejs_fmpz_mod_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="factorization of 0 is not defined"),
    wasm=False,
)
def fmpz_mod_polynomial_factor_resource(
    source: FmpzModPolynomial,
) -> FmpzModPolynomialFactorization: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialRootsResource",
    symbol="sagejs_fmpz_mod_polynomial_roots_resource",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_mod_polynomial_roots_t),
        in_("source", sagejs_fmpz_mod_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="factorization of 0 is not defined"),
    wasm=False,
)
def fmpz_mod_polynomial_roots_resource(
    source: FmpzModPolynomial,
) -> FmpzModPolynomialRoots: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialFormat",
    symbol="sagejs_fmpz_mod_polynomial_format",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("source", sagejs_fmpz_mod_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="polynomial is unsealed"),
    wasm=False,
)
def fmpz_mod_polynomial_format(source: FmpzModPolynomial) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialSerialize",
    symbol="sagejs_fmpz_mod_polynomial_serialize",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("source", sagejs_fmpz_mod_polynomial_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(1, exception=ValueError, message="polynomial is unsealed"),
    wasm=True,
)
def fmpz_mod_polynomial_serialize(
    source: FmpzModPolynomial,
) -> FlintByteRegion: ...


@flint.function(
    dynamic="ffiFmpzModPolynomialDeserialize",
    symbol="sagejs_fmpz_mod_polynomial_deserialize",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_mod_polynomial_t),
        in_("source", sagejs_flint_byte_region_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid arbitrary-prime polynomial serialization",
    ),
    wasm=True,
)
def fmpz_mod_polynomial_deserialize(
    source: FlintByteRegion,
) -> FmpzModPolynomial: ...


@flint.function(
    dynamic="ffiNumberFieldOrderPmaximal",
    symbol="sagejs_number_field_order_pmaximal",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("multiplication_table", sagejs_fmpz_matrix_t),
        in_("prime", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid local number-field order data",
    ),
    wasm=True,
)
def number_field_order_pmaximal(
    multiplication_table: FmpzMatrix,
    prime: uint64,
) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiNumberFieldOrderMaximalAtPrimes",
    symbol="sagejs_number_field_order_maximal_at_primes",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_matrix_t),
        in_("multiplication_table", sagejs_fmpz_matrix_t),
        in_(
            "prime_inputs",
            uint64_t_ptr,
            packed_slice(
                data="primes",
                length="prime_count",
                access="read",
                aliasing="allowed",
                transactional=False,
            ),
        ),
        in_("prime_count", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid local number-field order data",
    ),
    wasm=True,
)
def number_field_order_maximal_at_primes(
    multiplication_table: FmpzMatrix,
    primes: UInt64Buffer,
    prime_count: uint64,
) -> FmpqMatrix: ...


@flint.function(
    dynamic="ffiNumberFieldOrderFromPolynomialResource",
    symbol="sagejs_number_field_order_from_polynomial_resource",
    returns=int,
    abi=[
        out("result", sagejs_number_field_order_resource_t),
        in_("polynomial", sagejs_fmpz_polynomial_t),
        in_("prime_hints", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid direct number-field order input",
    ),
    wasm=False,
)
def number_field_order_from_polynomial_resource(
    polynomial: FmpzPolynomial,
    prime_hints: FmpzMatrix,
) -> NumberFieldOrderResource: ...


@flint.function(
    dynamic="ffiNumberFieldOrderResourceStatus",
    symbol="sagejs_number_field_order_resource_status",
    returns=uint64_t,
    abi=[in_("resource", sagejs_number_field_order_resource_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
)
def number_field_order_resource_status(
    resource: NumberFieldOrderResource,
) -> uint64: ...


@flint.function(
    dynamic="ffiNumberFieldOrderResourceDegree",
    symbol="sagejs_number_field_order_resource_degree",
    returns=uint64_t,
    abi=[in_("resource", sagejs_number_field_order_resource_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
)
def number_field_order_resource_degree(
    resource: NumberFieldOrderResource,
) -> uint64: ...


@flint.function(
    dynamic="ffiNumberFieldOrderResourceSuppliedPrimes",
    symbol="sagejs_number_field_order_resource_supplied_primes",
    returns=uint64_t,
    abi=[in_("resource", sagejs_number_field_order_resource_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
)
def number_field_order_resource_supplied_primes(
    resource: NumberFieldOrderResource,
) -> uint64: ...


@flint.function(
    dynamic="ffiNumberFieldOrderResourceResolvedPrimes",
    symbol="sagejs_number_field_order_resource_resolved_primes",
    returns=uint64_t,
    abi=[in_("resource", sagejs_number_field_order_resource_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
)
def number_field_order_resource_resolved_primes(
    resource: NumberFieldOrderResource,
) -> uint64: ...


@flint.function(
    dynamic="ffiNumberFieldOrderResourceNativePrimes",
    symbol="sagejs_number_field_order_resource_native_primes",
    returns=uint64_t,
    abi=[in_("resource", sagejs_number_field_order_resource_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
)
def number_field_order_resource_native_primes(
    resource: NumberFieldOrderResource,
) -> uint64: ...


@flint.function(
    dynamic="ffiNumberFieldOrderResourceUnramifiedPrimes",
    symbol="sagejs_number_field_order_resource_unramified_primes",
    returns=uint64_t,
    abi=[in_("resource", sagejs_number_field_order_resource_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
)
def number_field_order_resource_unramified_primes(
    resource: NumberFieldOrderResource,
) -> uint64: ...


@flint.function(
    dynamic="ffiNumberFieldOrderWithRound2ProofResource",
    symbol="sagejs_number_field_order_with_round2_proof_resource",
    returns=int,
    abi=[
        out("result", sagejs_number_field_analysis_resource_t),
        in_("polynomial", sagejs_fmpz_polynomial_t),
        in_("prime_hints", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid proof-carrying number-field order input",
    ),
    wasm=False,
)
def number_field_order_with_round2_proof_resource(
    polynomial: FmpzPolynomial,
    prime_hints: FmpzMatrix,
) -> NumberFieldAnalysisResource: ...


@flint.function(
    dynamic="ffiNumberFieldAnalyzeResource",
    symbol="sagejs_number_field_analyze_resource",
    returns=int,
    abi=[
        out("result", sagejs_number_field_analysis_resource_t),
        in_("polynomial", sagejs_fmpz_polynomial_t),
        in_("scale", fmpz_t),
        in_("trial_bound", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid fused number-field analysis input",
    ),
    wasm=False,
)
def number_field_analyze_resource(
    polynomial: FmpzPolynomial,
    scale: Integer,
    trial_bound: uint64,
) -> NumberFieldAnalysisResource: ...

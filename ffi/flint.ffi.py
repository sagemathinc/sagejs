"""Safe FLINT declarations lowered statically to flint.ffi.json."""

from sagejs.ffi.declare import (
    Direct,
    Effects,
    Library,
    Min,
    Status,
    Writable,
    copied_bytes,
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
        "sagejs/ffi_algorithms.h",
        "sagejs/fmpz_matrix_ffi.h",
        "sagejs/fmpq_matrix_ffi.h",
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
    wasm=False,
)


FmpqMatrix = flint.resource(
    id="fmpq_matrix",
    abi=sagejs_fmpq_matrix_t,
    ownership="owned",
    close="ffiFmpqMatrixClose",
    clear="sagejs_fmpq_matrix_clear",
    size="sagejs_fmpq_matrix_allocated_bytes",
    wasm=False,
)


FmpqValue = flint.resource(
    id="fmpq_value",
    abi=sagejs_fmpq_value_t,
    ownership="owned",
    close="ffiFmpqValueClose",
    clear="sagejs_fmpq_value_clear",
    size="sagejs_fmpq_value_allocated_bytes",
    wasm=False,
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
        wasm=False,
    ),
    host_ingress=copied_bytes(
        dynamic="ffiFlintByteRegionFromBytes",
        init="sagejs_flint_byte_region_init_copy",
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


ExactPolynomialFactorization = flint.resource(
    id="exact_polynomial_factorization",
    abi=sagejs_exact_polynomial_factorization_t,
    ownership="owned",
    close="ffiExactPolynomialFactorizationClose",
    clear="sagejs_exact_polynomial_factorization_clear",
    size="sagejs_exact_polynomial_factorization_allocated_bytes",
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
    dynamic="ffiFmpzPolynomialDeserialize",
    symbol="sagejs_fmpz_polynomial_deserialize_packed",
    returns=int,
    abi=[
        out("result", sagejs_fmpz_polynomial_t),
        in_("payload", fmpz_t),
        in_("byte_length", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid SJPZ v1 integer polynomial serialization",
    ),
    wasm=False,
)
def fmpz_polynomial_deserialize(
    payload: Integer,
    byte_length: uint64,
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
    dynamic="ffiFmpqPolynomialDeserialize",
    symbol="sagejs_fmpq_polynomial_deserialize_packed",
    returns=int,
    abi=[
        out("result", sagejs_fmpq_polynomial_t),
        in_("payload", fmpz_t),
        in_("byte_length", uint64_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[ValueError]),
    result=Status(
        1,
        exception=ValueError,
        message="invalid SJPQ v1 rational polynomial serialization",
    ),
    wasm=False,
)
def fmpq_polynomial_deserialize(
    payload: Integer,
    byte_length: uint64,
) -> FmpqPolynomial: ...


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
    wasm=False,
)
def fmpz_matrix(rows: uint64, columns: uint64) -> FmpzMatrix: ...


@flint.function(
    dynamic="ffiFmpzMatrixNrows",
    symbol="sagejs_fmpz_matrix_nrows",
    returns=uint64_t,
    abi=[in_("matrix", sagejs_fmpz_matrix_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
)
def fmpz_matrix_nrows(matrix: FmpzMatrix) -> uint64: ...


@flint.function(
    dynamic="ffiFmpzMatrixNcols",
    symbol="sagejs_fmpz_matrix_ncols",
    returns=uint64_t,
    abi=[in_("matrix", sagejs_fmpz_matrix_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
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
    wasm=False,
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
    wasm=False,
)
def fmpz_matrix_entry(
    matrix: FmpzMatrix,
    row: uint64,
    column: uint64,
) -> Integer: ...


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
    wasm=False,
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
    wasm=False,
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
    wasm=False,
)
def fmpz_matrix_mul(left: FmpzMatrix, right: FmpzMatrix) -> FmpzMatrix: ...


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
    wasm=False,
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
    wasm=False,
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
    wasm=False,
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
    dynamic="ffiFmpzMatrixFormat",
    symbol="sagejs_fmpz_matrix_format",
    returns=int,
    abi=[
        out("result", sagejs_flint_byte_region_t),
        in_("source", sagejs_fmpz_matrix_t),
    ],
    effects=Effects(pure=False, allocates=True, raises=[RuntimeError]),
    result=Status(1, exception=RuntimeError, message="integer matrix format failed"),
    wasm=False,
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
    wasm=False,
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
    wasm=False,
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
    wasm=False,
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
    wasm=False,
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
    wasm=False,
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
    wasm=False,
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
    wasm=False,
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
    wasm=False,
)
def fmpq_matrix_nrows(matrix: FmpqMatrix) -> uint64: ...


@flint.function(
    dynamic="ffiFmpqMatrixNcols",
    symbol="sagejs_fmpq_matrix_ncols",
    returns=uint64_t,
    abi=[in_("matrix", sagejs_fmpq_matrix_t)],
    effects=Effects(pure=True),
    result=Direct(),
    wasm=False,
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
    wasm=False,
)
def fmpq_matrix_set_entry(
    matrix: Writable[FmpqMatrix],
    row: uint64,
    column: uint64,
    numerator: Integer,
    denominator: Integer,
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
    wasm=False,
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
    wasm=False,
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
    wasm=False,
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
    wasm=False,
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
    wasm=False,
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
    wasm=False,
)
def fmpq_matrix_mul(left: FmpqMatrix, right: FmpqMatrix) -> FmpqMatrix: ...


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
    wasm=False,
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
    wasm=False,
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
    wasm=False,
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
    dynamic="ffiFmpqValueNumerator",
    symbol="sagejs_fmpq_value_numerator",
    returns=void,
    abi=[out("result", fmpz_t), in_("value", sagejs_fmpq_value_t)],
    effects=Effects(pure=True, allocates=True),
    result=Direct(),
    wasm=False,
)
def fmpq_value_numerator(value: FmpqValue) -> Integer: ...


@flint.function(
    dynamic="ffiFmpqValueDenominator",
    symbol="sagejs_fmpq_value_denominator",
    returns=void,
    abi=[out("result", fmpz_t), in_("value", sagejs_fmpq_value_t)],
    effects=Effects(pure=True, allocates=True),
    result=Direct(),
    wasm=False,
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
    wasm=False,
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
    wasm=False,
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
    wasm=False,
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

"""Generated safe FFI surface for flint; do not edit by hand."""

from __future__ import annotations

from typing import Any

import sagejs.runtime as _runtime

__sagejs_ffi_declaration__ = (
    "flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f"
)


class FmpqMatrix:
    """Opaque owned flint:fmpq_matrix resource."""

    def __init__(self, token: Any) -> None:
        self._token = token

    @property
    def closed(self) -> bool:
        return _runtime.ffi_resource_closed(self._token)

    def close(self) -> None:
        _runtime.ffi_resource_close(self._token)

    def _ffi_borrow(self) -> Any:
        return _runtime.ffi_resource_borrow(
            self._token,
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
        )

    def __enter__(self) -> FmpqMatrix:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class FmpqValue:
    """Opaque owned flint:fmpq_value resource."""

    def __init__(self, token: Any) -> None:
        self._token = token

    @property
    def closed(self) -> bool:
        return _runtime.ffi_resource_closed(self._token)

    def close(self) -> None:
        _runtime.ffi_resource_close(self._token)

    def _ffi_borrow(self) -> Any:
        return _runtime.ffi_resource_borrow(
            self._token,
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_value",
        )

    def __enter__(self) -> FmpqValue:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class FlintByteRegion:
    """Opaque owned flint:byte_region resource."""

    def __init__(self, token: Any) -> None:
        self._token = token

    @property
    def closed(self) -> bool:
        return _runtime.ffi_resource_closed(self._token)

    def close(self) -> None:
        _runtime.ffi_resource_close(self._token)

    def _ffi_borrow(self) -> Any:
        return _runtime.ffi_resource_borrow(
            self._token,
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:byte_region",
        )

    def __enter__(self) -> FlintByteRegion:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class FmpzPolynomial:
    """Opaque owned flint:fmpz_polynomial resource."""

    def __init__(self, token: Any) -> None:
        self._token = token

    @property
    def closed(self) -> bool:
        return _runtime.ffi_resource_closed(self._token)

    def close(self) -> None:
        _runtime.ffi_resource_close(self._token)

    def _ffi_borrow(self) -> Any:
        return _runtime.ffi_resource_borrow(
            self._token,
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpz_polynomial",
        )

    def __enter__(self) -> FmpzPolynomial:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class FmpqPolynomial:
    """Opaque owned flint:fmpq_polynomial resource."""

    def __init__(self, token: Any) -> None:
        self._token = token

    @property
    def closed(self) -> bool:
        return _runtime.ffi_resource_closed(self._token)

    def close(self) -> None:
        _runtime.ffi_resource_close(self._token)

    def _ffi_borrow(self) -> Any:
        return _runtime.ffi_resource_borrow(
            self._token,
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_polynomial",
        )

    def __enter__(self) -> FmpqPolynomial:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class DirichletGroup:
    """Opaque owned flint:dirichlet_group resource."""

    def __init__(self, token: Any) -> None:
        self._token = token

    @property
    def closed(self) -> bool:
        return _runtime.ffi_resource_closed(self._token)

    def close(self) -> None:
        _runtime.ffi_resource_close(self._token)

    def _ffi_borrow(self) -> Any:
        return _runtime.ffi_resource_borrow(
            self._token,
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:dirichlet_group",
        )

    def __enter__(self) -> DirichletGroup:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


def fmpz_polynomial(length: int) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialCreate",
            "ffiFmpzPolynomialClose",
            [length],
            ["uint64"],
            [None],
            "zero_is_error",
            "OverflowError",
            "integer polynomial length is too large",
        )
    )


def fmpz_polynomial_set_coefficient(
    polynomial: FmpzPolynomial, index: int, coefficient: int
) -> bool:
    """Call declared flint:fmpz_polynomial_set_coefficient."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_polynomial_set_coefficient",
        "@sagemath/sagejs-flint",
        "ffiFmpzPolynomialSetCoefficient",
        [polynomial._ffi_borrow(), index, coefficient],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpz_polynomial",
            "uint64",
            "Integer",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "integer polynomial builder is sealed or index is out of bounds",
        [],
    )


def fmpz_polynomial_seal(polynomial: FmpzPolynomial) -> bool:
    """Call declared flint:fmpz_polynomial_seal."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_polynomial_seal",
        "@sagemath/sagejs-flint",
        "ffiFmpzPolynomialSeal",
        [polynomial._ffi_borrow()],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpz_polynomial"
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "integer polynomial builder is already sealed",
        [],
    )


def fmpz_polynomial_length(polynomial: FmpzPolynomial) -> int:
    """Call declared flint:fmpz_polynomial_length."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_polynomial_length",
        "@sagemath/sagejs-flint",
        "ffiFmpzPolynomialLength",
        [polynomial._ffi_borrow()],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpz_polynomial"
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "integer polynomial is unsealed",
        [],
    )


def fmpz_polynomial_coefficient(polynomial: FmpzPolynomial, index: int) -> int:
    """Call declared flint:fmpz_polynomial_coefficient."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_polynomial_coefficient",
        "@sagemath/sagejs-flint",
        "ffiFmpzPolynomialCoefficient",
        [polynomial._ffi_borrow(), index],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpz_polynomial",
            "uint64",
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "integer polynomial coefficient is out of bounds",
        [],
    )


def fmpz_polynomial_add(left: FmpzPolynomial, right: FmpzPolynomial) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_add."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_add",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialAdd",
            "ffiFmpzPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpz_polynomial",
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpz_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer polynomial is unsealed",
        )
    )


def fmpz_polynomial_sub(left: FmpzPolynomial, right: FmpzPolynomial) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_sub."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_sub",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialSub",
            "ffiFmpzPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpz_polynomial",
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpz_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer polynomial is unsealed",
        )
    )


def fmpz_polynomial_neg(source: FmpzPolynomial) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_neg."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_neg",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialNeg",
            "ffiFmpzPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpz_polynomial"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "integer polynomial is unsealed",
        )
    )


def fmpz_polynomial_mul(left: FmpzPolynomial, right: FmpzPolynomial) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_mul."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_mul",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialMul",
            "ffiFmpzPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpz_polynomial",
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpz_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer polynomial is unsealed",
        )
    )


def fmpz_polynomial_pow(source: FmpzPolynomial, exponent: int) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_pow."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_pow",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialPow",
            "ffiFmpzPolynomialClose",
            [source._ffi_borrow(), exponent],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpz_polynomial",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "OverflowError",
            "integer polynomial exponent is too large",
        )
    )


def fmpz_polynomial_evaluate(source: FmpzPolynomial, argument: int) -> int:
    """Call declared flint:fmpz_polynomial_evaluate."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_polynomial_evaluate",
        "@sagemath/sagejs-flint",
        "ffiFmpzPolynomialEvaluate",
        [source._ffi_borrow(), argument],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpz_polynomial",
            "Integer",
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "integer polynomial is unsealed",
        [],
    )


def fmpz_polynomial_evaluate_rational(
    source: FmpzPolynomial, numerator: int, denominator: int
) -> FmpqValue:
    """Call declared flint:fmpz_polynomial_evaluate_rational."""
    return FmpqValue(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_evaluate_rational",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_value",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialEvaluateRational",
            "ffiFmpqValueClose",
            [source._ffi_borrow(), numerator, denominator],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpz_polynomial",
                "Integer",
                "Integer",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "invalid rational argument for integer polynomial evaluation",
        )
    )


def fmpz_polynomial_serialize(source: FmpzPolynomial) -> FlintByteRegion:
    """Call declared flint:fmpz_polynomial_serialize."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_serialize",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialSerialize",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpz_polynomial"
            ],
            [None],
            "zero_is_error",
            "OverflowError",
            "integer polynomial serialization is too large",
        )
    )


def fmpq_polynomial(length: int) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialCreate",
            "ffiFmpqPolynomialClose",
            [length],
            ["uint64"],
            [None],
            "zero_is_error",
            "OverflowError",
            "rational polynomial length is too large",
        )
    )


def fmpq_polynomial_set_coefficient(
    polynomial: FmpqPolynomial, index: int, numerator: int, denominator: int
) -> bool:
    """Call declared flint:fmpq_polynomial_set_coefficient."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_set_coefficient",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialSetCoefficient",
        [polynomial._ffi_borrow(), index, numerator, denominator],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_polynomial",
            "uint64",
            "Integer",
            "Integer",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid rational polynomial builder coefficient",
        [],
    )


def fmpq_polynomial_seal(polynomial: FmpqPolynomial) -> bool:
    """Call declared flint:fmpq_polynomial_seal."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_seal",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialSeal",
        [polynomial._ffi_borrow()],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_polynomial"
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "rational polynomial builder is already sealed",
        [],
    )


def fmpq_polynomial_length(polynomial: FmpqPolynomial) -> int:
    """Call declared flint:fmpq_polynomial_length."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_length",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialLength",
        [polynomial._ffi_borrow()],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_polynomial"
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "rational polynomial is unsealed",
        [],
    )


def fmpq_polynomial_coefficient_numerator(
    polynomial: FmpqPolynomial, index: int
) -> int:
    """Call declared flint:fmpq_polynomial_coefficient_numerator."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_coefficient_numerator",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialCoefficientNumerator",
        [polynomial._ffi_borrow(), index],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_polynomial",
            "uint64",
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "rational polynomial coefficient is out of bounds",
        [],
    )


def fmpq_polynomial_coefficient_denominator(
    polynomial: FmpqPolynomial, index: int
) -> int:
    """Call declared flint:fmpq_polynomial_coefficient_denominator."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_coefficient_denominator",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialCoefficientDenominator",
        [polynomial._ffi_borrow(), index],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_polynomial",
            "uint64",
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "rational polynomial coefficient is out of bounds",
        [],
    )


def fmpq_polynomial_add(left: FmpqPolynomial, right: FmpqPolynomial) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_add."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_add",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialAdd",
            "ffiFmpqPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_polynomial",
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational polynomial is unsealed",
        )
    )


def fmpq_polynomial_sub(left: FmpqPolynomial, right: FmpqPolynomial) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_sub."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_sub",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialSub",
            "ffiFmpqPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_polynomial",
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational polynomial is unsealed",
        )
    )


def fmpq_polynomial_neg(source: FmpqPolynomial) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_neg."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_neg",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialNeg",
            "ffiFmpqPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_polynomial"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "rational polynomial is unsealed",
        )
    )


def fmpq_polynomial_mul(left: FmpqPolynomial, right: FmpqPolynomial) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_mul."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_mul",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialMul",
            "ffiFmpqPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_polynomial",
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational polynomial is unsealed",
        )
    )


def fmpq_polynomial_pow(source: FmpqPolynomial, exponent: int) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_pow."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_pow",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialPow",
            "ffiFmpqPolynomialClose",
            [source._ffi_borrow(), exponent],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_polynomial",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "OverflowError",
            "rational polynomial exponent is too large",
        )
    )


def fmpq_polynomial_evaluate(
    source: FmpqPolynomial, numerator: int, denominator: int
) -> FmpqValue:
    """Call declared flint:fmpq_polynomial_evaluate."""
    return FmpqValue(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_evaluate",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_value",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialEvaluate",
            "ffiFmpqValueClose",
            [source._ffi_borrow(), numerator, denominator],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_polynomial",
                "Integer",
                "Integer",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "invalid rational polynomial evaluation",
        )
    )


def fmpq_polynomial_serialize(source: FmpqPolynomial) -> FlintByteRegion:
    """Call declared flint:fmpq_polynomial_serialize."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_serialize",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialSerialize",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_polynomial"
            ],
            [None],
            "zero_is_error",
            "OverflowError",
            "rational polynomial serialization is too large",
        )
    )


def fmpq_matrix(rows: int, columns: int) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixCreate",
            "ffiFmpqMatrixClose",
            [rows, columns],
            ["uint64", "uint64"],
            [None, None],
            "zero_is_error",
            "OverflowError",
            "rational matrix dimensions are too large",
        )
    )


def fmpq_matrix_randbits(
    rows: int, columns: int, bits: int, seed1: int, seed2: int
) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix_randbits."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_randbits",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixRandbits",
            "ffiFmpqMatrixClose",
            [rows, columns, bits, seed1, seed2],
            ["uint64", "uint64", "uint64", "uint64", "uint64"],
            [None, None, "1", None, None],
            "zero_is_error",
            "OverflowError",
            "rational random matrix parameters are too large",
        )
    )


def fmpq_matrix_nrows(matrix: FmpqMatrix) -> int:
    """Call declared flint:fmpq_matrix_nrows."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_matrix_nrows",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatrixNrows",
        [matrix._ffi_borrow()],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpq_matrix_ncols(matrix: FmpqMatrix) -> int:
    """Call declared flint:fmpq_matrix_ncols."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_matrix_ncols",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatrixNcols",
        [matrix._ffi_borrow()],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpq_matrix_set_entry(
    matrix: FmpqMatrix, row: int, column: int, numerator: int, denominator: int
) -> bool:
    """Call declared flint:fmpq_matrix_set_entry."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_matrix_set_entry",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatrixSetEntry",
        [matrix._ffi_borrow(), row, column, numerator, denominator],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
            "uint64",
            "uint64",
            "Integer",
            "Integer",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid rational matrix entry",
        [],
    )


def fmpq_matrix_entry_numerator(matrix: FmpqMatrix, row: int, column: int) -> int:
    """Call declared flint:fmpq_matrix_entry_numerator."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_matrix_entry_numerator",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatrixEntryNumerator",
        [matrix._ffi_borrow(), row, column],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
            "uint64",
            "uint64",
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "rational matrix entry is out of bounds",
        [],
    )


def fmpq_matrix_entry_denominator(matrix: FmpqMatrix, row: int, column: int) -> int:
    """Call declared flint:fmpq_matrix_entry_denominator."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_matrix_entry_denominator",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatrixEntryDenominator",
        [matrix._ffi_borrow(), row, column],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
            "uint64",
            "uint64",
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "rational matrix entry is out of bounds",
        [],
    )


def fmpq_matrix_entry_is_zero(matrix: FmpqMatrix, row: int, column: int) -> bool:
    """Call declared flint:fmpq_matrix_entry_is_zero."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_matrix_entry_is_zero",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatrixEntryIsZero",
        [matrix._ffi_borrow(), row, column],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
            "uint64",
            "uint64",
        ],
        "bool",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpq_matrix_copy(source: FmpqMatrix) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix_copy."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_copy",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixCopy",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "rational matrix copy failed",
        )
    )


def fmpq_matrix_neg(source: FmpqMatrix) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix_neg."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_neg",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixNeg",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "rational matrix negation failed",
        )
    )


def fmpq_matrix_scalar_mul(
    source: FmpqMatrix, numerator: int, denominator: int
) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix_scalar_mul."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_scalar_mul",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixScalarMul",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow(), numerator, denominator],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
                "Integer",
                "Integer",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "invalid rational matrix scalar",
        )
    )


def fmpq_matrix_equal(left: FmpqMatrix, right: FmpqMatrix) -> bool:
    """Call declared flint:fmpq_matrix_equal."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_matrix_equal",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatrixEqual",
        [left._ffi_borrow(), right._ffi_borrow()],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
        ],
        "bool",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpq_matrix_is_zero(matrix: FmpqMatrix) -> bool:
    """Call declared flint:fmpq_matrix_is_zero."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_matrix_is_zero",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatrixIsZero",
        [matrix._ffi_borrow()],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix"
        ],
        "bool",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpq_matrix_is_one(matrix: FmpqMatrix) -> bool:
    """Call declared flint:fmpq_matrix_is_one."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_matrix_is_one",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatrixIsOne",
        [matrix._ffi_borrow()],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix"
        ],
        "bool",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpq_matrix_add(left: FmpqMatrix, right: FmpqMatrix) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix_add."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_add",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixAdd",
            "ffiFmpqMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational matrix dimensions are incompatible",
        )
    )


def fmpq_matrix_sub(left: FmpqMatrix, right: FmpqMatrix) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix_sub."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_sub",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixSub",
            "ffiFmpqMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational matrix dimensions are incompatible",
        )
    )


def fmpq_matrix_transpose(source: FmpqMatrix) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix_transpose."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_transpose",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixTranspose",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "rational matrix transpose failed",
        )
    )


def fmpq_matrix_mul(left: FmpqMatrix, right: FmpqMatrix) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix_mul."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_mul",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixMul",
            "ffiFmpqMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational matrix dimensions are incompatible",
        )
    )


def fmpq_matrix_inv(source: FmpqMatrix) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix_inv."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_inv",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixInv",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "rational matrix is singular",
        )
    )


def fmpq_matrix_solve(left: FmpqMatrix, right: FmpqMatrix) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix_solve."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_solve",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixSolve",
            "ffiFmpqMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational matrix equation has no solutions",
        )
    )


def fmpq_matrix_rref(source: FmpqMatrix) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix_rref."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_rref",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixRref",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "rational matrix RREF failed",
        )
    )


def fmpq_matrix_rank(matrix: FmpqMatrix) -> int:
    """Call declared flint:fmpq_matrix_rank."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_matrix_rank",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatrixRank",
        [matrix._ffi_borrow()],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpq_matrix_det(source: FmpqMatrix) -> FmpqValue:
    """Call declared flint:fmpq_matrix_det."""
    return FmpqValue(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_det",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_value",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixDet",
            "ffiFmpqValueClose",
            [source._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "determinant requires a square rational matrix",
        )
    )


def fmpq_matrix_trace(source: FmpqMatrix) -> FmpqValue:
    """Call declared flint:fmpq_matrix_trace."""
    return FmpqValue(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_trace",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_value",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixTrace",
            "ffiFmpqValueClose",
            [source._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "trace requires a square rational matrix",
        )
    )


def fmpq_value_numerator(value: FmpqValue) -> int:
    """Call declared flint:fmpq_value_numerator."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_value_numerator",
        "@sagemath/sagejs-flint",
        "ffiFmpqValueNumerator",
        [value._ffi_borrow()],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_value"
        ],
        "Integer",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpq_value_denominator(value: FmpqValue) -> int:
    """Call declared flint:fmpq_value_denominator."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_value_denominator",
        "@sagemath/sagejs-flint",
        "ffiFmpqValueDenominator",
        [value._ffi_borrow()],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_value"
        ],
        "Integer",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpq_matrix_format(source: FmpqMatrix) -> FlintByteRegion:
    """Call declared flint:fmpq_matrix_format."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_format",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixFormat",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "rational matrix format failed",
        )
    )


def fmpq_matrix_serialize(source: FmpqMatrix) -> FlintByteRegion:
    """Call declared flint:fmpq_matrix_serialize."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_serialize",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixSerialize",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:fmpq_matrix"
            ],
            [None],
            "zero_is_error",
            "OverflowError",
            "rational matrix serialization is too large",
        )
    )


def flint_byte_region_length(region: FlintByteRegion) -> int:
    """Call declared flint:flint_byte_region_length."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":flint_byte_region_length",
        "@sagemath/sagejs-flint",
        "ffiFlintByteRegionLength",
        [region._ffi_borrow()],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:byte_region"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def flint_byte_region_get(region: FlintByteRegion, index: int) -> int:
    """Call declared flint:flint_byte_region_get."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":flint_byte_region_get",
        "@sagemath/sagejs-flint",
        "ffiFlintByteRegionGet",
        [region._ffi_borrow(), index],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:byte_region",
            "uint64",
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def dirichlet_group(modulus: int) -> DirichletGroup:
    """Call declared flint:dirichlet_group_init."""
    return DirichletGroup(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":dirichlet_group_init",
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:dirichlet_group",
            "@sagemath/sagejs-flint",
            "ffiDirichletGroupCreate",
            "ffiDirichletGroupClose",
            [modulus],
            ["uint64"],
            ["1"],
            "zero_is_error",
            "ValueError",
            "FLINT could not initialize this Dirichlet modulus",
        )
    )


def dirichlet_group_size(group: DirichletGroup) -> int:
    """Call declared flint:dirichlet_group_size."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":dirichlet_group_size",
        "@sagemath/sagejs-flint",
        "ffiDirichletGroupSize",
        [group._ffi_borrow()],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:dirichlet_group"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def dirichlet_group_num_primitive(group: DirichletGroup) -> int:
    """Call declared flint:dirichlet_group_num_primitive."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":dirichlet_group_num_primitive",
        "@sagemath/sagejs-flint",
        "ffiDirichletGroupNumPrimitive",
        [group._ffi_borrow()],
        [
            "resource:flint@ee0e9f244ecb8183ad09d2384a47eff2ce68a03a84dd7c1f746036a3f475161f:dirichlet_group"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def n_is_prime(value: int) -> bool:
    """Call declared flint:n_is_prime."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":n_is_prime",
        "@sagemath/sagejs-flint",
        "wordIsPrime",
        [value],
        ["uint64"],
        "bool",
        ["direct", [], None],
        None,
        None,
        [],
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
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpz_mat_rank(entries: list[int], rows: int, columns: int) -> int:
    """Call declared flint:fmpz_mat_rank."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mat_rank",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatRank",
        [entries, rows, columns],
        ["IntegerBuffer", "uint64", "uint64"],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [
            [
                "buffer_length",
                "entries",
                ["rows", "columns"],
                ["entries", "rows", "columns"],
            ]
        ],
    )


def fmpz_mat_mul(
    output: list[int],
    left: list[int],
    right: list[int],
    left_rows: int,
    inner: int,
    right_columns: int,
) -> bool:
    """Call declared flint:fmpz_mat_mul."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mat_mul",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatMul",
        [output, left, right, left_rows, inner, right_columns],
        [
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT integer matrix multiplication failed",
        [
            [
                "buffer_length",
                "output",
                ["left_rows", "right_columns"],
                ["output", "left", "right", "left_rows", "inner", "right_columns"],
            ],
            [
                "buffer_length",
                "left",
                ["left_rows", "inner"],
                ["output", "left", "right", "left_rows", "inner", "right_columns"],
            ],
            [
                "buffer_length",
                "right",
                ["inner", "right_columns"],
                ["output", "left", "right", "left_rows", "inner", "right_columns"],
            ],
        ],
    )


def fmpz_mat_det(output: list[int], source: list[int], size: int, one: int) -> bool:
    """Call declared flint:fmpz_mat_det."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mat_det",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatDet",
        [output, source, size, one],
        ["IntegerBuffer", "IntegerBuffer", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT integer determinant failed",
        [
            [
                "buffer_length",
                "output",
                ["one", "one"],
                ["output", "source", "size", "one"],
            ],
            [
                "buffer_length",
                "source",
                ["size", "size"],
                ["output", "source", "size", "one"],
            ],
        ],
    )


def fmpz_mat_charpoly(
    output: list[int], source: list[int], output_length: int, size: int, one: int
) -> bool:
    """Call declared flint:fmpz_mat_charpoly."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mat_charpoly",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatCharpoly",
        [output, source, output_length, size, one],
        ["IntegerBuffer", "IntegerBuffer", "uint64", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT integer characteristic polynomial failed",
        [
            [
                "buffer_length",
                "output",
                ["one", "output_length"],
                ["output", "source", "output_length", "size", "one"],
            ],
            [
                "buffer_length",
                "source",
                ["size", "size"],
                ["output", "source", "output_length", "size", "one"],
            ],
        ],
    )


def fmpz_mat_hnf(output: list[int], source: list[int], rows: int, columns: int) -> bool:
    """Call declared flint:fmpz_mat_hnf."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mat_hnf",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatHnf",
        [output, source, rows, columns],
        ["IntegerBuffer", "IntegerBuffer", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT integer Hermite form failed",
        [
            [
                "buffer_length",
                "output",
                ["rows", "columns"],
                ["output", "source", "rows", "columns"],
            ],
            [
                "buffer_length",
                "source",
                ["rows", "columns"],
                ["output", "source", "rows", "columns"],
            ],
        ],
    )


def fmpz_mat_hnf_transform(
    output: list[int], transform: list[int], source: list[int], rows: int, columns: int
) -> bool:
    """Call declared flint:fmpz_mat_hnf_transform."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mat_hnf_transform",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatHnfTransform",
        [output, transform, source, rows, columns],
        ["IntegerBuffer", "IntegerBuffer", "IntegerBuffer", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT integer Hermite transformation failed",
        [
            [
                "buffer_length",
                "output",
                ["rows", "columns"],
                ["output", "transform", "source", "rows", "columns"],
            ],
            [
                "buffer_length",
                "transform",
                ["rows", "rows"],
                ["output", "transform", "source", "rows", "columns"],
            ],
            [
                "buffer_length",
                "source",
                ["rows", "columns"],
                ["output", "transform", "source", "rows", "columns"],
            ],
        ],
    )


def fmpz_mat_snf_transform(
    output: list[int],
    left_transform: list[int],
    right_transform: list[int],
    source: list[int],
    rows: int,
    columns: int,
) -> bool:
    """Call declared flint:fmpz_mat_snf_transform."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mat_snf_transform",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatSnfTransform",
        [output, left_transform, right_transform, source, rows, columns],
        [
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT integer Smith transformation failed",
        [
            [
                "buffer_length",
                "output",
                ["rows", "columns"],
                [
                    "output",
                    "left_transform",
                    "right_transform",
                    "source",
                    "rows",
                    "columns",
                ],
            ],
            [
                "buffer_length",
                "left_transform",
                ["rows", "rows"],
                [
                    "output",
                    "left_transform",
                    "right_transform",
                    "source",
                    "rows",
                    "columns",
                ],
            ],
            [
                "buffer_length",
                "right_transform",
                ["columns", "columns"],
                [
                    "output",
                    "left_transform",
                    "right_transform",
                    "source",
                    "rows",
                    "columns",
                ],
            ],
            [
                "buffer_length",
                "source",
                ["rows", "columns"],
                [
                    "output",
                    "left_transform",
                    "right_transform",
                    "source",
                    "rows",
                    "columns",
                ],
            ],
        ],
    )


def fmpz_mat_right_kernel(
    output: list[int], source: list[int], rows: int, columns: int
) -> int:
    """Call declared flint:fmpz_mat_right_kernel."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mat_right_kernel",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatRightKernel",
        [output, source, rows, columns],
        ["IntegerBuffer", "IntegerBuffer", "uint64", "uint64"],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [
            [
                "buffer_length",
                "output",
                ["columns", "columns"],
                ["output", "source", "rows", "columns"],
            ],
            [
                "buffer_length",
                "source",
                ["rows", "columns"],
                ["output", "source", "rows", "columns"],
            ],
        ],
    )


def fmpq_mat_rank(
    rank: list[int],
    numerators: list[int],
    denominators: list[int],
    rows: int,
    columns: int,
    one: int,
) -> bool:
    """Call declared flint:fmpq_mat_rank."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_mat_rank",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatRank",
        [rank, numerators, denominators, rows, columns, one],
        [
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT rational matrix rank failed",
        [
            [
                "buffer_length",
                "rank",
                ["one", "one"],
                ["rank", "numerators", "denominators", "rows", "columns", "one"],
            ],
            [
                "buffer_length",
                "numerators",
                ["rows", "columns"],
                ["rank", "numerators", "denominators", "rows", "columns", "one"],
            ],
            [
                "buffer_length",
                "denominators",
                ["rows", "columns"],
                ["rank", "numerators", "denominators", "rows", "columns", "one"],
            ],
        ],
    )


def fmpq_mat_mul(
    output_numerators: list[int],
    output_denominators: list[int],
    left_numerators: list[int],
    left_denominators: list[int],
    right_numerators: list[int],
    right_denominators: list[int],
    left_rows: int,
    inner: int,
    right_columns: int,
) -> bool:
    """Call declared flint:fmpq_mat_mul."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_mat_mul",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatMul",
        [
            output_numerators,
            output_denominators,
            left_numerators,
            left_denominators,
            right_numerators,
            right_denominators,
            left_rows,
            inner,
            right_columns,
        ],
        [
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT rational matrix multiplication failed",
        [
            [
                "buffer_length",
                "output_numerators",
                ["left_rows", "right_columns"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "left_rows",
                    "inner",
                    "right_columns",
                ],
            ],
            [
                "buffer_length",
                "output_denominators",
                ["left_rows", "right_columns"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "left_rows",
                    "inner",
                    "right_columns",
                ],
            ],
            [
                "buffer_length",
                "left_numerators",
                ["left_rows", "inner"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "left_rows",
                    "inner",
                    "right_columns",
                ],
            ],
            [
                "buffer_length",
                "left_denominators",
                ["left_rows", "inner"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "left_rows",
                    "inner",
                    "right_columns",
                ],
            ],
            [
                "buffer_length",
                "right_numerators",
                ["inner", "right_columns"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "left_rows",
                    "inner",
                    "right_columns",
                ],
            ],
            [
                "buffer_length",
                "right_denominators",
                ["inner", "right_columns"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "left_rows",
                    "inner",
                    "right_columns",
                ],
            ],
        ],
    )


def fmpq_mat_rref(
    rank: list[int],
    output_numerators: list[int],
    output_denominators: list[int],
    source_numerators: list[int],
    source_denominators: list[int],
    rows: int,
    columns: int,
    one: int,
) -> bool:
    """Call declared flint:fmpq_mat_rref."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_mat_rref",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatRref",
        [
            rank,
            output_numerators,
            output_denominators,
            source_numerators,
            source_denominators,
            rows,
            columns,
            one,
        ],
        [
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT rational matrix RREF failed",
        [
            [
                "buffer_length",
                "rank",
                ["one", "one"],
                [
                    "rank",
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "rows",
                    "columns",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "output_numerators",
                ["rows", "columns"],
                [
                    "rank",
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "rows",
                    "columns",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "output_denominators",
                ["rows", "columns"],
                [
                    "rank",
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "rows",
                    "columns",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "source_numerators",
                ["rows", "columns"],
                [
                    "rank",
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "rows",
                    "columns",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "source_denominators",
                ["rows", "columns"],
                [
                    "rank",
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "rows",
                    "columns",
                    "one",
                ],
            ],
        ],
    )


def fmpq_mat_inv(
    output_numerators: list[int],
    output_denominators: list[int],
    source_numerators: list[int],
    source_denominators: list[int],
    size: int,
) -> bool:
    """Call declared flint:fmpq_mat_inv."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_mat_inv",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatInv",
        [
            output_numerators,
            output_denominators,
            source_numerators,
            source_denominators,
            size,
        ],
        ["IntegerBuffer", "IntegerBuffer", "IntegerBuffer", "IntegerBuffer", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "matrix is singular",
        [
            [
                "buffer_length",
                "output_numerators",
                ["size", "size"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "size",
                ],
            ],
            [
                "buffer_length",
                "output_denominators",
                ["size", "size"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "size",
                ],
            ],
            [
                "buffer_length",
                "source_numerators",
                ["size", "size"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "size",
                ],
            ],
            [
                "buffer_length",
                "source_denominators",
                ["size", "size"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "size",
                ],
            ],
        ],
    )


def fmpq_mat_solve(
    output_numerators: list[int],
    output_denominators: list[int],
    left_numerators: list[int],
    left_denominators: list[int],
    right_numerators: list[int],
    right_denominators: list[int],
    size: int,
    right_columns: int,
) -> bool:
    """Call declared flint:fmpq_mat_solve."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_mat_solve",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatSolve",
        [
            output_numerators,
            output_denominators,
            left_numerators,
            left_denominators,
            right_numerators,
            right_denominators,
            size,
            right_columns,
        ],
        [
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "matrix is singular",
        [
            [
                "buffer_length",
                "output_numerators",
                ["size", "right_columns"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "size",
                    "right_columns",
                ],
            ],
            [
                "buffer_length",
                "output_denominators",
                ["size", "right_columns"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "size",
                    "right_columns",
                ],
            ],
            [
                "buffer_length",
                "left_numerators",
                ["size", "size"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "size",
                    "right_columns",
                ],
            ],
            [
                "buffer_length",
                "left_denominators",
                ["size", "size"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "size",
                    "right_columns",
                ],
            ],
            [
                "buffer_length",
                "right_numerators",
                ["size", "right_columns"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "size",
                    "right_columns",
                ],
            ],
            [
                "buffer_length",
                "right_denominators",
                ["size", "right_columns"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "size",
                    "right_columns",
                ],
            ],
        ],
    )


def fmpq_mat_det(
    output_numerators: list[int],
    output_denominators: list[int],
    source_numerators: list[int],
    source_denominators: list[int],
    size: int,
    one: int,
) -> bool:
    """Call declared flint:fmpq_mat_det."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_mat_det",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatDet",
        [
            output_numerators,
            output_denominators,
            source_numerators,
            source_denominators,
            size,
            one,
        ],
        [
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT rational determinant failed",
        [
            [
                "buffer_length",
                "output_numerators",
                ["one", "one"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "size",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "output_denominators",
                ["one", "one"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "size",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "source_numerators",
                ["size", "size"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "size",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "source_denominators",
                ["size", "size"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "size",
                    "one",
                ],
            ],
        ],
    )


def fmpq_mat_charpoly(
    output_numerators: list[int],
    output_denominators: list[int],
    source_numerators: list[int],
    source_denominators: list[int],
    coefficient_count: int,
    size: int,
    one: int,
) -> bool:
    """Call declared flint:fmpq_mat_charpoly."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_mat_charpoly",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatCharpoly",
        [
            output_numerators,
            output_denominators,
            source_numerators,
            source_denominators,
            coefficient_count,
            size,
            one,
        ],
        [
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT rational characteristic polynomial failed",
        [
            [
                "buffer_length",
                "output_numerators",
                ["one", "coefficient_count"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "coefficient_count",
                    "size",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "output_denominators",
                ["one", "coefficient_count"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "coefficient_count",
                    "size",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "source_numerators",
                ["size", "size"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "coefficient_count",
                    "size",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "source_denominators",
                ["size", "size"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "coefficient_count",
                    "size",
                    "one",
                ],
            ],
        ],
    )


def nmod_mat_rank(entries: list[int], rows: int, columns: int, modulus: int) -> int:
    """Call declared flint:nmod_mat_rank."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_rank",
        "@sagemath/sagejs-flint",
        "ffiNmodMatRank",
        [entries, rows, columns, modulus],
        ["UInt64Buffer", "uint64", "uint64", "uint64"],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [
            [
                "buffer_length",
                "entries",
                ["rows", "columns"],
                ["entries", "rows", "columns", "modulus"],
            ]
        ],
    )


def nmod_mat_det(source: list[int], size: int, modulus: int) -> int:
    """Call declared flint:nmod_mat_det."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_det",
        "@sagemath/sagejs-flint",
        "ffiNmodMatDet",
        [source, size, modulus],
        ["UInt64Buffer", "uint64", "uint64"],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [["buffer_length", "source", ["size", "size"], ["source", "size", "modulus"]]],
    )


def nmod_mat_charpoly(
    output: list[int],
    source: list[int],
    output_length: int,
    source_length: int,
    size: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_mat_charpoly."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_charpoly",
        "@sagemath/sagejs-flint",
        "ffiNmodMatCharpoly",
        [output, source, output_length, source_length, size, modulus],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT characteristic polynomial failed",
        [
            [
                "buffer_length",
                "output",
                ["output_length"],
                [
                    "output",
                    "source",
                    "output_length",
                    "source_length",
                    "size",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "source",
                ["source_length"],
                [
                    "output",
                    "source",
                    "output_length",
                    "source_length",
                    "size",
                    "modulus",
                ],
            ],
        ],
    )


def nmod_mat_minpoly(
    output: list[int],
    source: list[int],
    output_length: int,
    source_length: int,
    size: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_mat_minpoly."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_minpoly",
        "@sagemath/sagejs-flint",
        "ffiNmodMatMinpoly",
        [output, source, output_length, source_length, size, modulus],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT minimal polynomial failed",
        [
            [
                "buffer_length",
                "output",
                ["output_length"],
                [
                    "output",
                    "source",
                    "output_length",
                    "source_length",
                    "size",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "source",
                ["source_length"],
                [
                    "output",
                    "source",
                    "output_length",
                    "source_length",
                    "size",
                    "modulus",
                ],
            ],
        ],
    )


def nmod_mat_inv(output: list[int], source: list[int], size: int, modulus: int) -> bool:
    """Call declared flint:nmod_mat_inv."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_inv",
        "@sagemath/sagejs-flint",
        "ffiNmodMatInv",
        [output, source, size, modulus],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "matrix is singular",
        [
            [
                "buffer_length",
                "output",
                ["size", "size"],
                ["output", "source", "size", "modulus"],
            ],
            [
                "buffer_length",
                "source",
                ["size", "size"],
                ["output", "source", "size", "modulus"],
            ],
        ],
    )


def nmod_mat_rref(
    output: list[int], source: list[int], rows: int, columns: int, modulus: int
) -> int:
    """Call declared flint:nmod_mat_rref."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_rref",
        "@sagemath/sagejs-flint",
        "ffiNmodMatRref",
        [output, source, rows, columns, modulus],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "uint64"],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [
            [
                "buffer_length",
                "output",
                ["rows", "columns"],
                ["output", "source", "rows", "columns", "modulus"],
            ],
            [
                "buffer_length",
                "source",
                ["rows", "columns"],
                ["output", "source", "rows", "columns", "modulus"],
            ],
        ],
    )


def nmod_mat_mul(
    output: list[int],
    left: list[int],
    right: list[int],
    left_rows: int,
    inner: int,
    right_columns: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_mat_mul."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_mul",
        "@sagemath/sagejs-flint",
        "ffiNmodMatMul",
        [output, left, right, left_rows, inner, right_columns, modulus],
        [
            "UInt64Buffer",
            "UInt64Buffer",
            "UInt64Buffer",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT matrix multiplication failed",
        [
            [
                "buffer_length",
                "output",
                ["left_rows", "right_columns"],
                [
                    "output",
                    "left",
                    "right",
                    "left_rows",
                    "inner",
                    "right_columns",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "left",
                ["left_rows", "inner"],
                [
                    "output",
                    "left",
                    "right",
                    "left_rows",
                    "inner",
                    "right_columns",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "right",
                ["inner", "right_columns"],
                [
                    "output",
                    "left",
                    "right",
                    "left_rows",
                    "inner",
                    "right_columns",
                    "modulus",
                ],
            ],
        ],
    )


def nmod_mat_right_kernel(
    output: list[int], source: list[int], rows: int, columns: int, modulus: int
) -> int:
    """Call declared flint:nmod_mat_right_kernel."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_right_kernel",
        "@sagemath/sagejs-flint",
        "ffiNmodMatRightKernel",
        [output, source, rows, columns, modulus],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "uint64"],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [
            [
                "buffer_length",
                "output",
                ["columns", "columns"],
                ["output", "source", "rows", "columns", "modulus"],
            ],
            [
                "buffer_length",
                "source",
                ["rows", "columns"],
                ["output", "source", "rows", "columns", "modulus"],
            ],
        ],
    )


def nmod_mat_solve(
    output: list[int],
    left: list[int],
    right: list[int],
    size: int,
    right_columns: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_mat_solve."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_solve",
        "@sagemath/sagejs-flint",
        "ffiNmodMatSolve",
        [output, left, right, size, right_columns, modulus],
        ["UInt64Buffer", "UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "uint64"],
        "bool",
        ["direct", [], None],
        None,
        None,
        [
            [
                "buffer_length",
                "output",
                ["size", "right_columns"],
                ["output", "left", "right", "size", "right_columns", "modulus"],
            ],
            [
                "buffer_length",
                "left",
                ["size", "size"],
                ["output", "left", "right", "size", "right_columns", "modulus"],
            ],
            [
                "buffer_length",
                "right",
                ["size", "right_columns"],
                ["output", "left", "right", "size", "right_columns", "modulus"],
            ],
        ],
    )


def fmpz_poly_mul(
    output: list[int],
    left: list[int],
    right: list[int],
    output_length: int,
    left_length: int,
    right_length: int,
    one: int,
) -> bool:
    """Call declared flint:fmpz_poly_mul."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_poly_mul",
        "@sagemath/sagejs-flint",
        "ffiFmpzPolyMul",
        [output, left, right, output_length, left_length, right_length, one],
        [
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT integer polynomial multiplication failed",
        [
            [
                "buffer_length",
                "output",
                ["one", "output_length"],
                [
                    "output",
                    "left",
                    "right",
                    "output_length",
                    "left_length",
                    "right_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "left",
                ["one", "left_length"],
                [
                    "output",
                    "left",
                    "right",
                    "output_length",
                    "left_length",
                    "right_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "right",
                ["one", "right_length"],
                [
                    "output",
                    "left",
                    "right",
                    "output_length",
                    "left_length",
                    "right_length",
                    "one",
                ],
            ],
        ],
    )


def fmpq_poly_mul(
    output_numerators: list[int],
    output_denominators: list[int],
    left_numerators: list[int],
    left_denominators: list[int],
    right_numerators: list[int],
    right_denominators: list[int],
    output_length: int,
    left_length: int,
    right_length: int,
    one: int,
) -> bool:
    """Call declared flint:fmpq_poly_mul."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_poly_mul",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolyMul",
        [
            output_numerators,
            output_denominators,
            left_numerators,
            left_denominators,
            right_numerators,
            right_denominators,
            output_length,
            left_length,
            right_length,
            one,
        ],
        [
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT rational polynomial multiplication failed",
        [
            [
                "buffer_length",
                "output_numerators",
                ["one", "output_length"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "output_length",
                    "left_length",
                    "right_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "output_denominators",
                ["one", "output_length"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "output_length",
                    "left_length",
                    "right_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "left_numerators",
                ["one", "left_length"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "output_length",
                    "left_length",
                    "right_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "left_denominators",
                ["one", "left_length"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "output_length",
                    "left_length",
                    "right_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "right_numerators",
                ["one", "right_length"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "output_length",
                    "left_length",
                    "right_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "right_denominators",
                ["one", "right_length"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "output_length",
                    "left_length",
                    "right_length",
                    "one",
                ],
            ],
        ],
    )


def nmod_poly_mul(
    output: list[int],
    left: list[int],
    right: list[int],
    output_length: int,
    left_length: int,
    right_length: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_poly_mul."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_mul",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyMul",
        [output, left, right, output_length, left_length, right_length, modulus],
        [
            "UInt64Buffer",
            "UInt64Buffer",
            "UInt64Buffer",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid packed polynomial multiplication",
        [
            [
                "buffer_length",
                "output",
                ["output_length"],
                [
                    "output",
                    "left",
                    "right",
                    "output_length",
                    "left_length",
                    "right_length",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "left",
                ["left_length"],
                [
                    "output",
                    "left",
                    "right",
                    "output_length",
                    "left_length",
                    "right_length",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "right",
                ["right_length"],
                [
                    "output",
                    "left",
                    "right",
                    "output_length",
                    "left_length",
                    "right_length",
                    "modulus",
                ],
            ],
        ],
    )


def nmod_poly_divexact(
    output: list[int],
    left: list[int],
    right: list[int],
    output_length: int,
    left_length: int,
    right_length: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_poly_divexact."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_divexact",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyDivExact",
        [output, left, right, output_length, left_length, right_length, modulus],
        [
            "UInt64Buffer",
            "UInt64Buffer",
            "UInt64Buffer",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "polynomial division is not exact",
        [
            [
                "buffer_length",
                "output",
                ["output_length"],
                [
                    "output",
                    "left",
                    "right",
                    "output_length",
                    "left_length",
                    "right_length",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "left",
                ["left_length"],
                [
                    "output",
                    "left",
                    "right",
                    "output_length",
                    "left_length",
                    "right_length",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "right",
                ["right_length"],
                [
                    "output",
                    "left",
                    "right",
                    "output_length",
                    "left_length",
                    "right_length",
                    "modulus",
                ],
            ],
        ],
    )


def fmpz_poly_divexact(
    output: list[int],
    left: list[int],
    right: list[int],
    output_length: int,
    left_length: int,
    right_length: int,
    one: int,
) -> bool:
    """Call declared flint:fmpz_poly_divexact."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_poly_divexact",
        "@sagemath/sagejs-flint",
        "ffiFmpzPolyDivExact",
        [output, left, right, output_length, left_length, right_length, one],
        [
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "polynomial division is not exact",
        [
            [
                "buffer_length",
                "output",
                ["one", "output_length"],
                [
                    "output",
                    "left",
                    "right",
                    "output_length",
                    "left_length",
                    "right_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "left",
                ["one", "left_length"],
                [
                    "output",
                    "left",
                    "right",
                    "output_length",
                    "left_length",
                    "right_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "right",
                ["one", "right_length"],
                [
                    "output",
                    "left",
                    "right",
                    "output_length",
                    "left_length",
                    "right_length",
                    "one",
                ],
            ],
        ],
    )


def fmpq_poly_divexact(
    output_numerators: list[int],
    output_denominators: list[int],
    left_numerators: list[int],
    left_denominators: list[int],
    right_numerators: list[int],
    right_denominators: list[int],
    output_length: int,
    left_length: int,
    right_length: int,
    one: int,
) -> bool:
    """Call declared flint:fmpq_poly_divexact."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_poly_divexact",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolyDivExact",
        [
            output_numerators,
            output_denominators,
            left_numerators,
            left_denominators,
            right_numerators,
            right_denominators,
            output_length,
            left_length,
            right_length,
            one,
        ],
        [
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "polynomial division is not exact",
        [
            [
                "buffer_length",
                "output_numerators",
                ["one", "output_length"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "output_length",
                    "left_length",
                    "right_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "output_denominators",
                ["one", "output_length"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "output_length",
                    "left_length",
                    "right_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "left_numerators",
                ["one", "left_length"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "output_length",
                    "left_length",
                    "right_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "left_denominators",
                ["one", "left_length"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "output_length",
                    "left_length",
                    "right_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "right_numerators",
                ["one", "right_length"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "output_length",
                    "left_length",
                    "right_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "right_denominators",
                ["one", "right_length"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "output_length",
                    "left_length",
                    "right_length",
                    "one",
                ],
            ],
        ],
    )


def nmod_poly_gcd(
    output: list[int],
    left: list[int],
    right: list[int],
    output_length: int,
    left_length: int,
    right_length: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_poly_gcd."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_gcd",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyGcd",
        [output, left, right, output_length, left_length, right_length, modulus],
        [
            "UInt64Buffer",
            "UInt64Buffer",
            "UInt64Buffer",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "polynomial gcd failed",
        [
            [
                "buffer_length",
                "output",
                ["output_length"],
                [
                    "output",
                    "left",
                    "right",
                    "output_length",
                    "left_length",
                    "right_length",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "left",
                ["left_length"],
                [
                    "output",
                    "left",
                    "right",
                    "output_length",
                    "left_length",
                    "right_length",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "right",
                ["right_length"],
                [
                    "output",
                    "left",
                    "right",
                    "output_length",
                    "left_length",
                    "right_length",
                    "modulus",
                ],
            ],
        ],
    )


def nmod_poly_is_irreducible(
    source: list[int], source_length: int, modulus: int
) -> bool:
    """Call declared flint:nmod_poly_is_irreducible."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_is_irreducible",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyIsIrreducible",
        [source, source_length, modulus],
        ["UInt64Buffer", "uint64", "uint64"],
        "bool",
        ["direct", [], None],
        None,
        None,
        [
            [
                "buffer_length",
                "source",
                ["source_length"],
                ["source", "source_length", "modulus"],
            ]
        ],
    )


def nmod_poly_factor(
    factor_coefficients: list[int],
    offsets: list[int],
    exponents: list[int],
    factor_count: list[int],
    unit_output: list[int],
    source: list[int],
    factor_coefficients_length: int,
    offsets_length: int,
    exponents_length: int,
    factor_count_length: int,
    unit_length: int,
    source_length: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_poly_factor."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_factor",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyFactor",
        [
            factor_coefficients,
            offsets,
            exponents,
            factor_count,
            unit_output,
            source,
            factor_coefficients_length,
            offsets_length,
            exponents_length,
            factor_count_length,
            unit_length,
            source_length,
            modulus,
        ],
        [
            "UInt64Buffer",
            "UInt64Buffer",
            "UInt64Buffer",
            "UInt64Buffer",
            "UInt64Buffer",
            "UInt64Buffer",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "factorization of 0 is not defined",
        [
            [
                "buffer_length",
                "factor_coefficients",
                ["factor_coefficients_length"],
                [
                    "factor_coefficients",
                    "offsets",
                    "exponents",
                    "factor_count",
                    "unit_output",
                    "source",
                    "factor_coefficients_length",
                    "offsets_length",
                    "exponents_length",
                    "factor_count_length",
                    "unit_length",
                    "source_length",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "offsets",
                ["offsets_length"],
                [
                    "factor_coefficients",
                    "offsets",
                    "exponents",
                    "factor_count",
                    "unit_output",
                    "source",
                    "factor_coefficients_length",
                    "offsets_length",
                    "exponents_length",
                    "factor_count_length",
                    "unit_length",
                    "source_length",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "exponents",
                ["exponents_length"],
                [
                    "factor_coefficients",
                    "offsets",
                    "exponents",
                    "factor_count",
                    "unit_output",
                    "source",
                    "factor_coefficients_length",
                    "offsets_length",
                    "exponents_length",
                    "factor_count_length",
                    "unit_length",
                    "source_length",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "factor_count",
                ["factor_count_length"],
                [
                    "factor_coefficients",
                    "offsets",
                    "exponents",
                    "factor_count",
                    "unit_output",
                    "source",
                    "factor_coefficients_length",
                    "offsets_length",
                    "exponents_length",
                    "factor_count_length",
                    "unit_length",
                    "source_length",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "unit_output",
                ["unit_length"],
                [
                    "factor_coefficients",
                    "offsets",
                    "exponents",
                    "factor_count",
                    "unit_output",
                    "source",
                    "factor_coefficients_length",
                    "offsets_length",
                    "exponents_length",
                    "factor_count_length",
                    "unit_length",
                    "source_length",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "source",
                ["source_length"],
                [
                    "factor_coefficients",
                    "offsets",
                    "exponents",
                    "factor_count",
                    "unit_output",
                    "source",
                    "factor_coefficients_length",
                    "offsets_length",
                    "exponents_length",
                    "factor_count_length",
                    "unit_length",
                    "source_length",
                    "modulus",
                ],
            ],
        ],
    )


def nmod_poly_roots(
    root_values: list[int],
    multiplicities: list[int],
    root_count: list[int],
    source: list[int],
    root_values_length: int,
    multiplicities_length: int,
    root_count_length: int,
    source_length: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_poly_roots."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_roots",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyRoots",
        [
            root_values,
            multiplicities,
            root_count,
            source,
            root_values_length,
            multiplicities_length,
            root_count_length,
            source_length,
            modulus,
        ],
        [
            "UInt64Buffer",
            "UInt64Buffer",
            "UInt64Buffer",
            "UInt64Buffer",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "roots of the zero polynomial are not defined",
        [
            [
                "buffer_length",
                "root_values",
                ["root_values_length"],
                [
                    "root_values",
                    "multiplicities",
                    "root_count",
                    "source",
                    "root_values_length",
                    "multiplicities_length",
                    "root_count_length",
                    "source_length",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "multiplicities",
                ["multiplicities_length"],
                [
                    "root_values",
                    "multiplicities",
                    "root_count",
                    "source",
                    "root_values_length",
                    "multiplicities_length",
                    "root_count_length",
                    "source_length",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "root_count",
                ["root_count_length"],
                [
                    "root_values",
                    "multiplicities",
                    "root_count",
                    "source",
                    "root_values_length",
                    "multiplicities_length",
                    "root_count_length",
                    "source_length",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "source",
                ["source_length"],
                [
                    "root_values",
                    "multiplicities",
                    "root_count",
                    "source",
                    "root_values_length",
                    "multiplicities_length",
                    "root_count_length",
                    "source_length",
                    "modulus",
                ],
            ],
        ],
    )


def fmpz_poly_factor(
    factor_coefficients: list[int],
    offsets: list[int],
    exponents: list[int],
    factor_count: list[int],
    unit_numerator: list[int],
    unit_denominator: list[int],
    source: list[int],
    factor_coefficients_length: int,
    source_length: int,
    one: int,
) -> bool:
    """Call declared flint:fmpz_poly_factor."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_poly_factor",
        "@sagemath/sagejs-flint",
        "ffiFmpzPolyFactor",
        [
            factor_coefficients,
            offsets,
            exponents,
            factor_count,
            unit_numerator,
            unit_denominator,
            source,
            factor_coefficients_length,
            source_length,
            one,
        ],
        [
            "IntegerBuffer",
            "UInt64Buffer",
            "UInt64Buffer",
            "UInt64Buffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "factorization of 0 is not defined",
        [
            [
                "buffer_length",
                "factor_coefficients",
                ["one", "factor_coefficients_length"],
                [
                    "factor_coefficients",
                    "offsets",
                    "exponents",
                    "factor_count",
                    "unit_numerator",
                    "unit_denominator",
                    "source",
                    "factor_coefficients_length",
                    "source_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "offsets",
                ["source_length"],
                [
                    "factor_coefficients",
                    "offsets",
                    "exponents",
                    "factor_count",
                    "unit_numerator",
                    "unit_denominator",
                    "source",
                    "factor_coefficients_length",
                    "source_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "exponents",
                ["source_length"],
                [
                    "factor_coefficients",
                    "offsets",
                    "exponents",
                    "factor_count",
                    "unit_numerator",
                    "unit_denominator",
                    "source",
                    "factor_coefficients_length",
                    "source_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "factor_count",
                ["one"],
                [
                    "factor_coefficients",
                    "offsets",
                    "exponents",
                    "factor_count",
                    "unit_numerator",
                    "unit_denominator",
                    "source",
                    "factor_coefficients_length",
                    "source_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "unit_numerator",
                ["one", "one"],
                [
                    "factor_coefficients",
                    "offsets",
                    "exponents",
                    "factor_count",
                    "unit_numerator",
                    "unit_denominator",
                    "source",
                    "factor_coefficients_length",
                    "source_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "unit_denominator",
                ["one", "one"],
                [
                    "factor_coefficients",
                    "offsets",
                    "exponents",
                    "factor_count",
                    "unit_numerator",
                    "unit_denominator",
                    "source",
                    "factor_coefficients_length",
                    "source_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "source",
                ["one", "source_length"],
                [
                    "factor_coefficients",
                    "offsets",
                    "exponents",
                    "factor_count",
                    "unit_numerator",
                    "unit_denominator",
                    "source",
                    "factor_coefficients_length",
                    "source_length",
                    "one",
                ],
            ],
        ],
    )


def fmpq_poly_factor(
    factor_coefficients: list[int],
    offsets: list[int],
    exponents: list[int],
    factor_count: list[int],
    unit_numerator: list[int],
    unit_denominator: list[int],
    source_numerators: list[int],
    source_denominators: list[int],
    factor_coefficients_length: int,
    source_length: int,
    one: int,
) -> bool:
    """Call declared flint:fmpq_poly_factor."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_poly_factor",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolyFactor",
        [
            factor_coefficients,
            offsets,
            exponents,
            factor_count,
            unit_numerator,
            unit_denominator,
            source_numerators,
            source_denominators,
            factor_coefficients_length,
            source_length,
            one,
        ],
        [
            "IntegerBuffer",
            "UInt64Buffer",
            "UInt64Buffer",
            "UInt64Buffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "factorization of 0 is not defined",
        [
            [
                "buffer_length",
                "factor_coefficients",
                ["one", "factor_coefficients_length"],
                [
                    "factor_coefficients",
                    "offsets",
                    "exponents",
                    "factor_count",
                    "unit_numerator",
                    "unit_denominator",
                    "source_numerators",
                    "source_denominators",
                    "factor_coefficients_length",
                    "source_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "offsets",
                ["source_length"],
                [
                    "factor_coefficients",
                    "offsets",
                    "exponents",
                    "factor_count",
                    "unit_numerator",
                    "unit_denominator",
                    "source_numerators",
                    "source_denominators",
                    "factor_coefficients_length",
                    "source_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "exponents",
                ["source_length"],
                [
                    "factor_coefficients",
                    "offsets",
                    "exponents",
                    "factor_count",
                    "unit_numerator",
                    "unit_denominator",
                    "source_numerators",
                    "source_denominators",
                    "factor_coefficients_length",
                    "source_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "factor_count",
                ["one"],
                [
                    "factor_coefficients",
                    "offsets",
                    "exponents",
                    "factor_count",
                    "unit_numerator",
                    "unit_denominator",
                    "source_numerators",
                    "source_denominators",
                    "factor_coefficients_length",
                    "source_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "unit_numerator",
                ["one", "one"],
                [
                    "factor_coefficients",
                    "offsets",
                    "exponents",
                    "factor_count",
                    "unit_numerator",
                    "unit_denominator",
                    "source_numerators",
                    "source_denominators",
                    "factor_coefficients_length",
                    "source_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "unit_denominator",
                ["one", "one"],
                [
                    "factor_coefficients",
                    "offsets",
                    "exponents",
                    "factor_count",
                    "unit_numerator",
                    "unit_denominator",
                    "source_numerators",
                    "source_denominators",
                    "factor_coefficients_length",
                    "source_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "source_numerators",
                ["one", "source_length"],
                [
                    "factor_coefficients",
                    "offsets",
                    "exponents",
                    "factor_count",
                    "unit_numerator",
                    "unit_denominator",
                    "source_numerators",
                    "source_denominators",
                    "factor_coefficients_length",
                    "source_length",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "source_denominators",
                ["one", "source_length"],
                [
                    "factor_coefficients",
                    "offsets",
                    "exponents",
                    "factor_count",
                    "unit_numerator",
                    "unit_denominator",
                    "source_numerators",
                    "source_denominators",
                    "factor_coefficients_length",
                    "source_length",
                    "one",
                ],
            ],
        ],
    )

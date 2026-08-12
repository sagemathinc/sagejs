"""Generated safe FFI surface for flint; do not edit by hand."""

from __future__ import annotations

from typing import Any

import sagejs.runtime as _runtime

__sagejs_ffi_declaration__ = (
    "flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d"
)


class FmpzMatrix:
    """Opaque owned flint:fmpz_matrix resource."""

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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
        )

    def __enter__(self) -> FmpzMatrix:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_value",
        )

    def __enter__(self) -> FmpqValue:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class FlintByteRegion:
    """Opaque owned flint:byte_region resource."""

    @classmethod
    def from_bytes(cls, source: Any) -> FlintByteRegion:
        """Copy host bytes into a newly owned resource."""
        return cls(
            _runtime.ffi_resource_create(
                __sagejs_ffi_declaration__ + ":__resource_byte_region_from_bytes",
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:byte_region",
                "@sagemath/sagejs-flint",
                "ffiFlintByteRegionFromBytes",
                "ffiFlintByteRegionClose",
                [source],
                ["ByteBuffer"],
                [None],
                "none",
                "ValueError",
                "unable to copy bytes into FFI resource",
            )
        )

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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:byte_region",
        )

    def __enter__(self) -> FlintByteRegion:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False

    def copy_bytes(self) -> Any:
        """Copy this resource's byte payload into host-owned storage."""
        return _runtime.ffi_resource_copy_bytes(
            self._token,
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:byte_region",
            "ffiFlintByteRegionCopyBytes",
        )

    def take_bytes(self) -> Any:
        """Copy the byte payload and deterministically close this resource."""
        try:
            return self.copy_bytes()
        finally:
            self.close()


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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
        )

    def __enter__(self) -> FmpqPolynomial:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class ExactPolynomialFactorization:
    """Opaque owned flint:exact_polynomial_factorization resource."""

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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:exact_polynomial_factorization",
        )

    def __enter__(self) -> ExactPolynomialFactorization:
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:dirichlet_group",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial"
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial"
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "integer polynomial is unsealed",
        [],
    )


def fmpz_polynomial_equal(left: FmpzPolynomial, right: FmpzPolynomial) -> int:
    """Call declared flint:fmpz_polynomial_equal."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_polynomial_equal",
        "@sagemath/sagejs-flint",
        "ffiFmpzPolynomialEqual",
        [left._ffi_borrow(), right._ffi_borrow()],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "integer polynomial equality requires sealed resources",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialAdd",
            "ffiFmpzPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialSub",
            "ffiFmpzPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialNeg",
            "ffiFmpzPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial"
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialMul",
            "ffiFmpzPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer polynomial is unsealed",
        )
    )


def fmpz_polynomial_gcd(left: FmpzPolynomial, right: FmpzPolynomial) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_gcd."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_gcd",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialGcd",
            "ffiFmpzPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer polynomial is unsealed",
        )
    )


def fmpz_polynomial_factor_resource(
    source: FmpzPolynomial,
) -> ExactPolynomialFactorization:
    """Call declared flint:fmpz_polynomial_factor_resource."""
    return ExactPolynomialFactorization(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_factor_resource",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:exact_polynomial_factorization",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialFactorResource",
            "ffiExactPolynomialFactorizationClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "factorization of 0 is not defined",
        )
    )


def fmpz_polynomial_divexact(
    dividend: FmpzPolynomial, divisor: FmpzPolynomial
) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_divexact."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_divexact",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialDivExact",
            "ffiFmpzPolynomialClose",
            [dividend._ffi_borrow(), divisor._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer polynomial exact division requires sealed resources, a nonzero divisor, and an exact quotient",
        )
    )


def fmpz_polynomial_pow(source: FmpzPolynomial, exponent: int) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_pow."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_pow",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialPow",
            "ffiFmpzPolynomialClose",
            [source._ffi_borrow(), exponent],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "OverflowError",
            "integer polynomial exponent is too large",
        )
    )


def fmpz_polynomial_cyclotomic(order: int) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_cyclotomic."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_cyclotomic",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialCyclotomic",
            "ffiFmpzPolynomialClose",
            [order],
            ["uint64"],
            [None],
            "zero_is_error",
            "ValueError",
            "cyclotomic polynomial degree must be positive",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_value",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialEvaluateRational",
            "ffiFmpqValueClose",
            [source._ffi_borrow(), numerator, denominator],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialSerialize",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial"
            ],
            [None],
            "zero_is_error",
            "OverflowError",
            "integer polynomial serialization is too large",
        )
    )


def fmpz_polynomial_format(source: FmpzPolynomial) -> FlintByteRegion:
    """Call declared flint:fmpz_polynomial_format."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_format",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialFormat",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "integer polynomial formatting failed",
        )
    )


def fmpz_polynomial_deserialize(payload: int, byte_length: int) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_deserialize."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_deserialize",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialDeserialize",
            "ffiFmpzPolynomialClose",
            [payload, byte_length],
            ["Integer", "uint64"],
            [None, None],
            "zero_is_error",
            "ValueError",
            "invalid SJPZ v1 integer polynomial serialization",
        )
    )


def fmpq_polynomial(length: int) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial"
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial"
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "rational polynomial is unsealed",
        [],
    )


def fmpq_polynomial_equal(left: FmpqPolynomial, right: FmpqPolynomial) -> int:
    """Call declared flint:fmpq_polynomial_equal."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_equal",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialEqual",
        [left._ffi_borrow(), right._ffi_borrow()],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "rational polynomial equality requires sealed resources",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialAdd",
            "ffiFmpqPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialSub",
            "ffiFmpqPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialNeg",
            "ffiFmpqPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial"
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialMul",
            "ffiFmpqPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational polynomial is unsealed",
        )
    )


def fmpq_polynomial_gcd(left: FmpqPolynomial, right: FmpqPolynomial) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_gcd."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_gcd",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialGcd",
            "ffiFmpqPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational polynomial is unsealed",
        )
    )


def fmpq_polynomial_factor_resource(
    source: FmpqPolynomial,
) -> ExactPolynomialFactorization:
    """Call declared flint:fmpq_polynomial_factor_resource."""
    return ExactPolynomialFactorization(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_factor_resource",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:exact_polynomial_factorization",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialFactorResource",
            "ffiExactPolynomialFactorizationClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "factorization of 0 is not defined",
        )
    )


def exact_polynomial_factorization_count(
    factorization: ExactPolynomialFactorization,
) -> int:
    """Call declared flint:exact_polynomial_factorization_count."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":exact_polynomial_factorization_count",
        "@sagemath/sagejs-flint",
        "ffiExactPolynomialFactorizationCount",
        [factorization._ffi_borrow()],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:exact_polynomial_factorization"
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "invalid factorization",
        [],
    )


def exact_polynomial_factorization_exponent(
    factorization: ExactPolynomialFactorization, index: int
) -> int:
    """Call declared flint:exact_polynomial_factorization_exponent."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":exact_polynomial_factorization_exponent",
        "@sagemath/sagejs-flint",
        "ffiExactPolynomialFactorizationExponent",
        [factorization._ffi_borrow(), index],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:exact_polynomial_factorization",
            "uint64",
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "factor index is out of bounds",
        [],
    )


def exact_polynomial_factorization_unit_numerator(
    factorization: ExactPolynomialFactorization,
) -> int:
    """Call declared flint:exact_polynomial_factorization_unit_numerator."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":exact_polynomial_factorization_unit_numerator",
        "@sagemath/sagejs-flint",
        "ffiExactPolynomialFactorizationUnitNumerator",
        [factorization._ffi_borrow()],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:exact_polynomial_factorization"
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "invalid factorization",
        [],
    )


def exact_polynomial_factorization_unit_denominator(
    factorization: ExactPolynomialFactorization,
) -> int:
    """Call declared flint:exact_polynomial_factorization_unit_denominator."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":exact_polynomial_factorization_unit_denominator",
        "@sagemath/sagejs-flint",
        "ffiExactPolynomialFactorizationUnitDenominator",
        [factorization._ffi_borrow()],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:exact_polynomial_factorization"
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "invalid factorization",
        [],
    )


def exact_polynomial_factorization_fmpz_factor(
    factorization: ExactPolynomialFactorization, index: int
) -> FmpzPolynomial:
    """Call declared flint:exact_polynomial_factorization_fmpz_factor."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":exact_polynomial_factorization_fmpz_factor",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiExactPolynomialFactorizationFmpzFactor",
            "ffiFmpzPolynomialClose",
            [factorization._ffi_borrow(), index],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:exact_polynomial_factorization",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "factor index is out of bounds",
        )
    )


def exact_polynomial_factorization_fmpq_factor(
    factorization: ExactPolynomialFactorization, index: int
) -> FmpqPolynomial:
    """Call declared flint:exact_polynomial_factorization_fmpq_factor."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":exact_polynomial_factorization_fmpq_factor",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiExactPolynomialFactorizationFmpqFactor",
            "ffiFmpqPolynomialClose",
            [factorization._ffi_borrow(), index],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:exact_polynomial_factorization",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "factor index is out of bounds",
        )
    )


def fmpq_polynomial_divexact(
    dividend: FmpqPolynomial, divisor: FmpqPolynomial
) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_divexact."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_divexact",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialDivExact",
            "ffiFmpqPolynomialClose",
            [dividend._ffi_borrow(), divisor._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational polynomial exact division requires sealed resources, a nonzero divisor, and an exact quotient",
        )
    )


def fmpq_polynomial_pow(source: FmpqPolynomial, exponent: int) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_pow."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_pow",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialPow",
            "ffiFmpqPolynomialClose",
            [source._ffi_borrow(), exponent],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_value",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialEvaluate",
            "ffiFmpqValueClose",
            [source._ffi_borrow(), numerator, denominator],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialSerialize",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial"
            ],
            [None],
            "zero_is_error",
            "OverflowError",
            "rational polynomial serialization is too large",
        )
    )


def fmpq_polynomial_format(source: FmpqPolynomial) -> FlintByteRegion:
    """Call declared flint:fmpq_polynomial_format."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_format",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialFormat",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "rational polynomial formatting failed",
        )
    )


def fmpq_polynomial_deserialize(payload: int, byte_length: int) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_deserialize."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_deserialize",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialDeserialize",
            "ffiFmpqPolynomialClose",
            [payload, byte_length],
            ["Integer", "uint64"],
            [None, None],
            "zero_is_error",
            "ValueError",
            "invalid SJPQ v1 rational polynomial serialization",
        )
    )


def fmpz_matrix(rows: int, columns: int) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixCreate",
            "ffiFmpzMatrixClose",
            [rows, columns],
            ["uint64", "uint64"],
            [None, None],
            "zero_is_error",
            "OverflowError",
            "integer matrix dimensions are too large",
        )
    )


def fmpz_matrix_nrows(matrix: FmpzMatrix) -> int:
    """Call declared flint:fmpz_matrix_nrows."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_matrix_nrows",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatrixNrows",
        [matrix._ffi_borrow()],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpz_matrix_ncols(matrix: FmpzMatrix) -> int:
    """Call declared flint:fmpz_matrix_ncols."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_matrix_ncols",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatrixNcols",
        [matrix._ffi_borrow()],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpz_matrix_set_entry(
    matrix: FmpzMatrix, row: int, column: int, entry: int
) -> bool:
    """Call declared flint:fmpz_matrix_set_entry."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_matrix_set_entry",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatrixSetEntry",
        [matrix._ffi_borrow(), row, column, entry],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "uint64",
            "uint64",
            "Integer",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "integer matrix entry is out of bounds",
        [],
    )


def fmpz_matrix_entry(matrix: FmpzMatrix, row: int, column: int) -> int:
    """Call declared flint:fmpz_matrix_entry."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_matrix_entry",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatrixEntry",
        [matrix._ffi_borrow(), row, column],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "uint64",
            "uint64",
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "integer matrix entry is out of bounds",
        [],
    )


def fmpz_matrix_copy(source: FmpzMatrix) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_copy."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_copy",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixCopy",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "integer matrix copy failed",
        )
    )


def fmpz_matrix_neg(source: FmpzMatrix) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_neg."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_neg",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixNeg",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "integer matrix negation failed",
        )
    )


def fmpz_matrix_scalar_mul(source: FmpzMatrix, scalar: int) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_scalar_mul."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_scalar_mul",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixScalarMul",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow(), scalar],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
                "Integer",
            ],
            [None, None],
            "zero_is_error",
            "RuntimeError",
            "integer matrix scalar multiplication failed",
        )
    )


def fmpz_matrix_equal(left: FmpzMatrix, right: FmpzMatrix) -> bool:
    """Call declared flint:fmpz_matrix_equal."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_matrix_equal",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatrixEqual",
        [left._ffi_borrow(), right._ffi_borrow()],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
        ],
        "bool",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpz_matrix_is_zero(matrix: FmpzMatrix) -> bool:
    """Call declared flint:fmpz_matrix_is_zero."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_matrix_is_zero",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatrixIsZero",
        [matrix._ffi_borrow()],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix"
        ],
        "bool",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpz_matrix_is_one(matrix: FmpzMatrix) -> bool:
    """Call declared flint:fmpz_matrix_is_one."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_matrix_is_one",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatrixIsOne",
        [matrix._ffi_borrow()],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix"
        ],
        "bool",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpz_matrix_add(left: FmpzMatrix, right: FmpzMatrix) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_add."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_add",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixAdd",
            "ffiFmpzMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer matrix dimensions are incompatible",
        )
    )


def fmpz_matrix_sub(left: FmpzMatrix, right: FmpzMatrix) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_sub."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_sub",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixSub",
            "ffiFmpzMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer matrix dimensions are incompatible",
        )
    )


def fmpz_matrix_transpose(source: FmpzMatrix) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_transpose."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_transpose",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixTranspose",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "integer matrix transpose failed",
        )
    )


def fmpz_matrix_mul(left: FmpzMatrix, right: FmpzMatrix) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_mul."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_mul",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixMul",
            "ffiFmpzMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer matrix dimensions are incompatible",
        )
    )


def fmpz_matrix_pow(source: FmpzMatrix, exponent: int) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_pow."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_pow",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixPow",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow(), exponent],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer matrix power requires a square matrix and a FLINT-word exponent",
        )
    )


def fmpz_matrix_rank(matrix: FmpzMatrix) -> int:
    """Call declared flint:fmpz_matrix_rank."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_matrix_rank",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatrixRank",
        [matrix._ffi_borrow()],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpz_matrix_det(source: FmpzMatrix) -> int:
    """Call declared flint:fmpz_matrix_det."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_matrix_det",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatrixDet",
        [source._ffi_borrow()],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix"
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "determinant requires a square integer matrix",
        [],
    )


def fmpz_matrix_trace(source: FmpzMatrix) -> int:
    """Call declared flint:fmpz_matrix_trace."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_matrix_trace",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatrixTrace",
        [source._ffi_borrow()],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix"
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "trace requires a square integer matrix",
        [],
    )


def fmpz_matrix_hnf(source: FmpzMatrix) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_hnf."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_hnf",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixHnf",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "integer matrix HNF failed",
        )
    )


def fmpz_matrix_snf(source: FmpzMatrix) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_snf."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_snf",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixSnf",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "integer matrix SNF failed",
        )
    )


def fmpz_matrix_hnf_transform(
    hermite: FmpzMatrix, transform: FmpzMatrix, source: FmpzMatrix
) -> bool:
    """Call declared flint:fmpz_matrix_hnf_transform."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_matrix_hnf_transform",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatrixHnfTransform",
        [hermite._ffi_borrow(), transform._ffi_borrow(), source._ffi_borrow()],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "integer matrix HNF transform dimensions or aliases are invalid",
        [],
    )


def fmpz_matrix_snf_transform(
    smith: FmpzMatrix,
    left_transform: FmpzMatrix,
    right_transform: FmpzMatrix,
    source: FmpzMatrix,
) -> bool:
    """Call declared flint:fmpz_matrix_snf_transform."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_matrix_snf_transform",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatrixSnfTransform",
        [
            smith._ffi_borrow(),
            left_transform._ffi_borrow(),
            right_transform._ffi_borrow(),
            source._ffi_borrow(),
        ],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "integer matrix SNF transform dimensions or aliases are invalid",
        [],
    )


def fmpz_matrix_right_kernel(source: FmpzMatrix) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_right_kernel."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_right_kernel",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixRightKernel",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "integer matrix right kernel failed",
        )
    )


def fmpz_matrix_charpoly(source: FmpzMatrix) -> FmpzPolynomial:
    """Call declared flint:fmpz_matrix_charpoly."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_charpoly",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixCharpoly",
            "ffiFmpzPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "characteristic polynomial requires a square integer matrix",
        )
    )


def fmpz_matrix_minpoly(source: FmpzMatrix) -> FmpzPolynomial:
    """Call declared flint:fmpz_matrix_minpoly."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_minpoly",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixMinpoly",
            "ffiFmpzPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "minimal polynomial requires a square integer matrix",
        )
    )


def fmpq_matrix_from_fmpz(source: FmpzMatrix) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix_from_fmpz."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_from_fmpz",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixFromFmpz",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "integer to rational matrix conversion failed",
        )
    )


def fmpz_matrix_from_fmpq_integral(source: FmpqMatrix) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_from_fmpq_integral."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_from_fmpq_integral",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixFromFmpqIntegral",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "rational matrix contains a nonintegral entry",
        )
    )


def fmpz_matrix_submatrix(
    source: FmpzMatrix,
    row_start: int,
    row_stop: int,
    column_start: int,
    column_stop: int,
) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_submatrix."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_submatrix",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixSubmatrix",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow(), row_start, row_stop, column_start, column_stop],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
                "uint64",
                "uint64",
                "uint64",
                "uint64",
            ],
            [None, None, None, None, None],
            "zero_is_error",
            "ValueError",
            "integer matrix submatrix bounds are invalid",
        )
    )


def fmpz_matrix_select_rows(
    source: FmpzMatrix, indices: list[int], count: int
) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_select_rows."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_select_rows",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixSelectRows",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow(), indices, count],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
                "UInt64Buffer",
                "uint64",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "integer matrix row selection contains an invalid index",
        )
    )


def fmpz_matrix_select_columns(
    source: FmpzMatrix, indices: list[int], count: int
) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_select_columns."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_select_columns",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixSelectColumns",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow(), indices, count],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
                "UInt64Buffer",
                "uint64",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "integer matrix column selection contains an invalid index",
        )
    )


def fmpz_matrix_set_block(
    target: FmpzMatrix, target_row: int, target_column: int, source: FmpzMatrix
) -> bool:
    """Call declared flint:fmpz_matrix_set_block."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_matrix_set_block",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatrixSetBlock",
        [target._ffi_borrow(), target_row, target_column, source._ffi_borrow()],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "uint64",
            "uint64",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "integer matrix block bounds or aliases are invalid",
        [],
    )


def fmpz_matrix_stack(top: FmpzMatrix, bottom: FmpzMatrix) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_stack."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_stack",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixStack",
            "ffiFmpzMatrixClose",
            [top._ffi_borrow(), bottom._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "stacked integer matrices must have the same number of columns",
        )
    )


def fmpz_matrix_augment(left: FmpzMatrix, right: FmpzMatrix) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_augment."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_augment",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixAugment",
            "ffiFmpzMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "augmented integer matrices must have the same number of rows",
        )
    )


def fmpz_matrix_nonzero_count(source: FmpzMatrix) -> int:
    """Call declared flint:fmpz_matrix_nonzero_count."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_matrix_nonzero_count",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatrixNonzeroCount",
        [source._ffi_borrow()],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpz_matrix_format(source: FmpzMatrix) -> FlintByteRegion:
    """Call declared flint:fmpz_matrix_format."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_format",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixFormat",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "integer matrix format failed",
        )
    )


def fmpz_matrix_serialize(source: FmpzMatrix) -> FlintByteRegion:
    """Call declared flint:fmpz_matrix_serialize."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_serialize",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixSerialize",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix"
            ],
            [None],
            "zero_is_error",
            "OverflowError",
            "integer matrix serialization is too large",
        )
    )


def fmpz_matrix_serialize_sequence(
    source: FmpzMatrix, start: int, stride: int, count: int
) -> FlintByteRegion:
    """Call declared flint:fmpz_matrix_serialize_sequence."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_serialize_sequence",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixSerializeSequence",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow(), start, stride, count],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
                "uint64",
                "uint64",
                "uint64",
            ],
            [None, None, None, None],
            "zero_is_error",
            "ValueError",
            "invalid integer matrix entry sequence",
        )
    )


def flint_byte_region(length: int) -> FlintByteRegion:
    """Call declared flint:flint_byte_region."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":flint_byte_region",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFlintByteRegionCreate",
            "ffiFlintByteRegionClose",
            [length],
            ["uint64"],
            [None],
            "zero_is_error",
            "OverflowError",
            "FLINT byte-region length is too large",
        )
    )


def flint_byte_region_set(region: FlintByteRegion, index: int, value: int) -> bool:
    """Call declared flint:flint_byte_region_set."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":flint_byte_region_set",
        "@sagemath/sagejs-flint",
        "ffiFlintByteRegionSet",
        [region._ffi_borrow(), index, value],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:byte_region",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT byte-region index or byte value is out of bounds",
        [],
    )


def fmpz_matrix_deserialize(source: FlintByteRegion) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_deserialize."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_deserialize",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixDeserialize",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:byte_region"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "invalid SJZM v1 integer matrix serialization",
        )
    )


def fmpz_matrix_deserialize_entries(
    source: FlintByteRegion, rows: int, columns: int
) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_deserialize_entries."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_deserialize_entries",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixDeserializeEntries",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow(), rows, columns],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:byte_region",
                "uint64",
                "uint64",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "invalid packed integer matrix entries",
        )
    )


def fmpq_matrix(rows: int, columns: int) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix"
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix"
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixCopy",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix"
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixNeg",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix"
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixScalarMul",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow(), numerator, denominator],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix"
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix"
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixAdd",
            "ffiFmpqMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixSub",
            "ffiFmpqMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixTranspose",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix"
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixMul",
            "ffiFmpqMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixInv",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix"
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixSolve",
            "ffiFmpqMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixRref",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "rational matrix RREF failed",
        )
    )


def fmpq_matrix_right_kernel(source: FmpqMatrix) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix_right_kernel."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_right_kernel",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixRightKernel",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "rational matrix right kernel failed",
        )
    )


def fmpq_matrix_charpoly(source: FmpqMatrix) -> FmpqPolynomial:
    """Call declared flint:fmpq_matrix_charpoly."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_charpoly",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixCharpoly",
            "ffiFmpqPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "characteristic polynomial requires a square rational matrix",
        )
    )


def fmpq_matrix_minpoly(source: FmpqMatrix) -> FmpqPolynomial:
    """Call declared flint:fmpq_matrix_minpoly."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_minpoly",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixMinpoly",
            "ffiFmpqPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "minimal polynomial requires a square rational matrix",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix"
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_value",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixDet",
            "ffiFmpqValueClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix"
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_value",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixTrace",
            "ffiFmpqValueClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "trace requires a square rational matrix",
        )
    )


def fmpq_matrix_submatrix(
    source: FmpqMatrix,
    row_start: int,
    row_stop: int,
    column_start: int,
    column_stop: int,
) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix_submatrix."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_submatrix",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixSubmatrix",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow(), row_start, row_stop, column_start, column_stop],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
                "uint64",
                "uint64",
                "uint64",
                "uint64",
            ],
            [None, None, None, None, None],
            "zero_is_error",
            "ValueError",
            "rational matrix submatrix bounds are invalid",
        )
    )


def fmpq_matrix_select_rows(
    source: FmpqMatrix, indices: list[int], count: int
) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix_select_rows."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_select_rows",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixSelectRows",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow(), indices, count],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
                "UInt64Buffer",
                "uint64",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "rational matrix row selection contains an invalid index",
        )
    )


def fmpq_matrix_select_columns(
    source: FmpqMatrix, indices: list[int], count: int
) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix_select_columns."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_select_columns",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixSelectColumns",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow(), indices, count],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
                "UInt64Buffer",
                "uint64",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "rational matrix column selection contains an invalid index",
        )
    )


def fmpq_matrix_set_block(
    target: FmpqMatrix, target_row: int, target_column: int, source: FmpqMatrix
) -> bool:
    """Call declared flint:fmpq_matrix_set_block."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_matrix_set_block",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatrixSetBlock",
        [target._ffi_borrow(), target_row, target_column, source._ffi_borrow()],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
            "uint64",
            "uint64",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "rational matrix block bounds or aliases are invalid",
        [],
    )


def fmpq_matrix_stack(top: FmpqMatrix, bottom: FmpqMatrix) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix_stack."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_stack",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixStack",
            "ffiFmpqMatrixClose",
            [top._ffi_borrow(), bottom._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "stacked rational matrices must have the same number of columns",
        )
    )


def fmpq_matrix_augment(left: FmpqMatrix, right: FmpqMatrix) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix_augment."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_augment",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixAugment",
            "ffiFmpqMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "augmented rational matrices must have the same number of rows",
        )
    )


def fmpq_matrix_nonzero_count(source: FmpqMatrix) -> int:
    """Call declared flint:fmpq_matrix_nonzero_count."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_matrix_nonzero_count",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatrixNonzeroCount",
        [source._ffi_borrow()],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpq_value_numerator(value: FmpqValue) -> int:
    """Call declared flint:fmpq_value_numerator."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_value_numerator",
        "@sagemath/sagejs-flint",
        "ffiFmpqValueNumerator",
        [value._ffi_borrow()],
        [
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_value"
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_value"
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixFormat",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix"
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixSerialize",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix"
            ],
            [None],
            "zero_is_error",
            "OverflowError",
            "rational matrix serialization is too large",
        )
    )


def fmpq_matrix_serialize_sequence(
    source: FmpqMatrix, start: int, stride: int, count: int
) -> FlintByteRegion:
    """Call declared flint:fmpq_matrix_serialize_sequence."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_serialize_sequence",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixSerializeSequence",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow(), start, stride, count],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
                "uint64",
                "uint64",
                "uint64",
            ],
            [None, None, None, None],
            "zero_is_error",
            "ValueError",
            "invalid rational matrix entry sequence",
        )
    )


def fmpq_matrix_deserialize(
    source: FlintByteRegion, rows: int, columns: int
) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix_deserialize."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_deserialize",
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixDeserialize",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow(), rows, columns],
            [
                "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:byte_region",
                "uint64",
                "uint64",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "invalid packed rational matrix entries",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:byte_region"
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:byte_region",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:dirichlet_group",
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:dirichlet_group"
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
            "resource:flint@b716ce124ea1cc619defc5e67255364edf500ecf0406642fdbeac9ea1e36737d:dirichlet_group"
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

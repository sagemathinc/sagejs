"""Generated safe FFI surface for flint; do not edit by hand."""

from __future__ import annotations

from typing import Any

import sagejs.runtime as _runtime

__sagejs_ffi_declaration__ = (
    "flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
        )

    def __enter__(self) -> FmpqMatrix:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class FmpzVector:
    """Opaque owned flint:fmpz_vector resource."""

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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_vector",
        )

    def __enter__(self) -> FmpzVector:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class FmpqVector:
    """Opaque owned flint:fmpq_vector resource."""

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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_vector",
        )

    def __enter__(self) -> FmpqVector:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class NmodMatrix:
    """Opaque owned flint:nmod_matrix resource."""

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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
        )

    def __enter__(self) -> NmodMatrix:
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_value",
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
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "ffiFlintByteRegionCopyBytes",
        )

    def take_bytes(self) -> Any:
        """Copy the byte payload and deterministically close this resource."""
        try:
            return self.copy_bytes()
        finally:
            self.close()


class NumberFieldOrderResource:
    """Opaque owned flint:number_field_order_resource resource."""

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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:number_field_order_resource",
        )

    def __enter__(self) -> NumberFieldOrderResource:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False

    def copy_bytes(self) -> Any:
        """Copy this resource's byte payload into host-owned storage."""
        return _runtime.ffi_resource_copy_bytes(
            self._token,
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:number_field_order_resource",
            "ffiNumberFieldOrderResourceCopyBytes",
        )

    def take_bytes(self) -> Any:
        """Copy the byte payload and deterministically close this resource."""
        try:
            return self.copy_bytes()
        finally:
            self.close()


class NumberFieldAnalysisResource:
    """Opaque owned flint:number_field_analysis_resource resource."""

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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:number_field_analysis_resource",
        )

    def __enter__(self) -> NumberFieldAnalysisResource:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False

    def copy_bytes(self) -> Any:
        """Copy this resource's byte payload into host-owned storage."""
        return _runtime.ffi_resource_copy_bytes(
            self._token,
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:number_field_analysis_resource",
            "ffiNumberFieldAnalysisResourceCopyBytes",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
        )

    def __enter__(self) -> FmpqPolynomial:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class FmpqPolynomialWorkspace:
    """Opaque owned flint:fmpq_polynomial_workspace resource."""

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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
        )

    def __enter__(self) -> FmpqPolynomialWorkspace:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class FmpqPolynomialPair:
    """Opaque owned flint:fmpq_polynomial_pair resource."""

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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_pair",
        )

    def __enter__(self) -> FmpqPolynomialPair:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class FmpqMumfordResult:
    """Opaque owned flint:fmpq_mumford_result resource."""

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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_mumford_result",
        )

    def __enter__(self) -> FmpqMumfordResult:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class FmpzModPolynomial:
    """Opaque owned flint:fmpz_mod_polynomial resource."""

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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
        )

    def __enter__(self) -> FmpzModPolynomial:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class FmpzModPolynomialDivisionResult:
    """Opaque owned flint:fmpz_mod_polynomial_division_result resource."""

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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial_division_result",
        )

    def __enter__(self) -> FmpzModPolynomialDivisionResult:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class FmpzModPolynomialXgcdResult:
    """Opaque owned flint:fmpz_mod_polynomial_xgcd_result resource."""

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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial_xgcd_result",
        )

    def __enter__(self) -> FmpzModPolynomialXgcdResult:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class FmpzModPolynomialFactorization:
    """Opaque owned flint:fmpz_mod_polynomial_factorization resource."""

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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial_factorization",
        )

    def __enter__(self) -> FmpzModPolynomialFactorization:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False

    def copy_bytes(self) -> Any:
        """Copy this resource's byte payload into host-owned storage."""
        return _runtime.ffi_resource_copy_bytes(
            self._token,
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial_factorization",
            "ffiFmpzModPolynomialFactorizationCopyBytes",
        )

    def take_bytes(self) -> Any:
        """Copy the byte payload and deterministically close this resource."""
        try:
            return self.copy_bytes()
        finally:
            self.close()


class FmpzModPolynomialRoots:
    """Opaque owned flint:fmpz_mod_polynomial_roots resource."""

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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial_roots",
        )

    def __enter__(self) -> FmpzModPolynomialRoots:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False

    def copy_bytes(self) -> Any:
        """Copy this resource's byte payload into host-owned storage."""
        return _runtime.ffi_resource_copy_bytes(
            self._token,
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial_roots",
            "ffiFmpzModPolynomialRootsCopyBytes",
        )

    def take_bytes(self) -> Any:
        """Copy the byte payload and deterministically close this resource."""
        try:
            return self.copy_bytes()
        finally:
            self.close()


class FqContext:
    """Opaque owned flint:fq_context resource."""

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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_context",
        )

    def __enter__(self) -> FqContext:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class FqElement:
    """Opaque owned flint:fq_element resource."""

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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element",
        )

    def __enter__(self) -> FqElement:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class FqPolynomial:
    """Opaque owned flint:fq_polynomial resource."""

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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial",
        )

    def __enter__(self) -> FqPolynomial:
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:exact_polynomial_factorization",
        )

    def __enter__(self) -> ExactPolynomialFactorization:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False

    def copy_bytes(self) -> Any:
        """Copy this resource's byte payload into host-owned storage."""
        return _runtime.ffi_resource_copy_bytes(
            self._token,
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:exact_polynomial_factorization",
            "ffiExactPolynomialFactorizationCopyBytes",
        )

    def take_bytes(self) -> Any:
        """Copy the byte payload and deterministically close this resource."""
        try:
            return self.copy_bytes()
        finally:
            self.close()


class FmpzPolynomialDivisionResult:
    """Opaque owned flint:fmpz_polynomial_division_result resource."""

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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial_division_result",
        )

    def __enter__(self) -> FmpzPolynomialDivisionResult:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class FmpqPolynomialDivisionResult:
    """Opaque owned flint:fmpq_polynomial_division_result resource."""

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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_division_result",
        )

    def __enter__(self) -> FmpqPolynomialDivisionResult:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class FmpzPolynomialXgcdResult:
    """Opaque owned flint:fmpz_polynomial_xgcd_result resource."""

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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial_xgcd_result",
        )

    def __enter__(self) -> FmpzPolynomialXgcdResult:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class FmpqPolynomialXgcdResult:
    """Opaque owned flint:fmpq_polynomial_xgcd_result resource."""

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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_xgcd_result",
        )

    def __enter__(self) -> FmpqPolynomialXgcdResult:
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:dirichlet_group",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialAdd",
            "ffiFmpzPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialSub",
            "ffiFmpzPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialNeg",
            "ffiFmpzPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "integer polynomial is unsealed",
        )
    )


def fmpz_polynomial_scalar_floor_div(
    source: FmpzPolynomial, divisor: int
) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_scalar_floor_div."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_scalar_floor_div",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialScalarFloorDiv",
            "ffiFmpzPolynomialClose",
            [source._ffi_borrow(), divisor],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
                "Integer",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer polynomial scalar division requires a sealed resource and a nonzero divisor",
        )
    )


def fmpz_polynomial_truncate(source: FmpzPolynomial, stop: int) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_truncate."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_truncate",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialTruncate",
            "ffiFmpzPolynomialClose",
            [source._ffi_borrow(), stop],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer polynomial truncation requires a sealed resource and a supported stop",
        )
    )


def fmpz_polynomial_compose(
    outer: FmpzPolynomial, inner: FmpzPolynomial
) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_compose."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_compose",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialCompose",
            "ffiFmpzPolynomialClose",
            [outer._ffi_borrow(), inner._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer polynomial composition requires sealed resources",
        )
    )


def fmpz_polynomial_reverse(source: FmpzPolynomial, length: int) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_reverse."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_reverse",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialReverse",
            "ffiFmpzPolynomialClose",
            [source._ffi_borrow(), length],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer polynomial reversal requires a sealed resource and supported length",
        )
    )


def fmpz_polynomial_shift_left(source: FmpzPolynomial, amount: int) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_shift_left."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_shift_left",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialShiftLeft",
            "ffiFmpzPolynomialClose",
            [source._ffi_borrow(), amount],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer polynomial left shift requires a sealed resource and supported amount",
        )
    )


def fmpz_polynomial_shift_right(source: FmpzPolynomial, amount: int) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_shift_right."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_shift_right",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialShiftRight",
            "ffiFmpzPolynomialClose",
            [source._ffi_borrow(), amount],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer polynomial right shift requires a sealed resource and supported amount",
        )
    )


def fmpz_polynomial_integral(source: FmpzPolynomial) -> FmpqPolynomial:
    """Call declared flint:fmpz_polynomial_integral."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_integral",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialIntegral",
            "ffiFmpqPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "integer polynomial integration requires a sealed resource",
        )
    )


def fmpz_polynomial_resultant(left: FmpzPolynomial, right: FmpzPolynomial) -> int:
    """Call declared flint:fmpz_polynomial_resultant."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_polynomial_resultant",
        "@sagemath/sagejs-flint",
        "ffiFmpzPolynomialResultant",
        [left._ffi_borrow(), right._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "integer polynomial resultant requires sealed resources",
        [],
    )


def fmpz_polynomial_discriminant(source: FmpzPolynomial) -> int:
    """Call declared flint:fmpz_polynomial_discriminant."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_polynomial_discriminant",
        "@sagemath/sagejs-flint",
        "ffiFmpzPolynomialDiscriminant",
        [source._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial"
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "integer polynomial discriminant requires a sealed resource",
        [],
    )


def fmpz_polynomial_derivative(source: FmpzPolynomial) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_derivative."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_derivative",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialDerivative",
            "ffiFmpzPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialMul",
            "ffiFmpzPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialGcd",
            "ffiFmpzPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer polynomial is unsealed",
        )
    )


def fmpz_polynomial_xgcd_resource(
    left: FmpzPolynomial, right: FmpzPolynomial
) -> FmpzPolynomialXgcdResult:
    """Call declared flint:fmpz_polynomial_xgcd_resource."""
    return FmpzPolynomialXgcdResult(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_xgcd_resource",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial_xgcd_result",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialXgcdResource",
            "ffiFmpzPolynomialXgcdResultClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer polynomial is unsealed",
        )
    )


def fmpz_polynomial_xgcd_result_gcd(xgcd: FmpzPolynomialXgcdResult) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_xgcd_result_gcd."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_xgcd_result_gcd",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialXgcdResultGcd",
            "ffiFmpzPolynomialClose",
            [xgcd._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial_xgcd_result"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "invalid integer xgcd result",
        )
    )


def fmpz_polynomial_xgcd_result_left_coefficient(
    xgcd: FmpzPolynomialXgcdResult,
) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_xgcd_result_left_coefficient."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__
            + ":fmpz_polynomial_xgcd_result_left_coefficient",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialXgcdResultLeftCoefficient",
            "ffiFmpzPolynomialClose",
            [xgcd._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial_xgcd_result"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "invalid integer xgcd result",
        )
    )


def fmpz_polynomial_xgcd_result_right_coefficient(
    xgcd: FmpzPolynomialXgcdResult,
) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_xgcd_result_right_coefficient."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__
            + ":fmpz_polynomial_xgcd_result_right_coefficient",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialXgcdResultRightCoefficient",
            "ffiFmpzPolynomialClose",
            [xgcd._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial_xgcd_result"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "invalid integer xgcd result",
        )
    )


def fmpz_polynomial_factor_resource(
    source: FmpzPolynomial,
) -> ExactPolynomialFactorization:
    """Call declared flint:fmpz_polynomial_factor_resource."""
    return ExactPolynomialFactorization(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_factor_resource",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:exact_polynomial_factorization",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialFactorResource",
            "ffiExactPolynomialFactorizationClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialDivExact",
            "ffiFmpzPolynomialClose",
            [dividend._ffi_borrow(), divisor._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer polynomial exact division requires sealed resources, a nonzero divisor, and an exact quotient",
        )
    )


def fmpz_polynomial_quo_rem_resource(
    dividend: FmpzPolynomial, divisor: FmpzPolynomial
) -> FmpzPolynomialDivisionResult:
    """Call declared flint:fmpz_polynomial_quo_rem_resource."""
    return FmpzPolynomialDivisionResult(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_quo_rem_resource",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial_division_result",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialQuoRemResource",
            "ffiFmpzPolynomialDivisionResultClose",
            [dividend._ffi_borrow(), divisor._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer polynomial division requires sealed resources and a nonzero divisor",
        )
    )


def fmpz_polynomial_division_result_quotient(
    division: FmpzPolynomialDivisionResult,
) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_division_result_quotient."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_division_result_quotient",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialDivisionResultQuotient",
            "ffiFmpzPolynomialClose",
            [division._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial_division_result"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "invalid integer division result",
        )
    )


def fmpz_polynomial_division_result_remainder(
    division: FmpzPolynomialDivisionResult,
) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_division_result_remainder."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_division_result_remainder",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialDivisionResultRemainder",
            "ffiFmpzPolynomialClose",
            [division._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial_division_result"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "invalid integer division result",
        )
    )


def fmpz_polynomial_pow(source: FmpzPolynomial, exponent: int) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_pow."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_pow",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialPow",
            "ffiFmpzPolynomialClose",
            [source._ffi_borrow(), exponent],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_value",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialEvaluateRational",
            "ffiFmpqValueClose",
            [source._ffi_borrow(), numerator, denominator],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialSerialize",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialFormat",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "integer polynomial formatting failed",
        )
    )


def fmpz_polynomial_from_byte_region(
    source: FlintByteRegion, offset: int, length: int
) -> FmpzPolynomial:
    """Call declared flint:fmpz_polynomial_from_byte_region."""
    return FmpzPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_polynomial_from_byte_region",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzPolynomialFromByteRegion",
            "ffiFmpzPolynomialClose",
            [source._ffi_borrow(), offset, length],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
                "uint64",
                "uint64",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "invalid SJPZ v1 integer polynomial serialization",
        )
    )


def fmpq_polynomial_workspace(slot_count: int) -> FmpqPolynomialWorkspace:
    """Call declared flint:fmpq_polynomial_workspace."""
    return FmpqPolynomialWorkspace(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialWorkspaceCreate",
            "ffiFmpqPolynomialWorkspaceClose",
            [slot_count],
            ["uint64"],
            [None],
            "zero_is_error",
            "ValueError",
            "rational polynomial workspace size is unsupported",
        )
    )


def fmpq_polynomial_workspace_load(
    workspace: FmpqPolynomialWorkspace, output: int, source: FmpqPolynomial
) -> bool:
    """Call declared flint:fmpq_polynomial_workspace_load."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace_load",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialWorkspaceLoad",
        [workspace._ffi_borrow(), output, source._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
            "uint64",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid workspace load",
        [],
    )


def fmpq_polynomial_workspace_copy_pair_out(
    workspace: FmpqPolynomialWorkspace, u_slot: int, v_slot: int
) -> FmpqPolynomialPair:
    """Call declared flint:fmpq_polynomial_workspace_copy_pair_out."""
    return FmpqPolynomialPair(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace_copy_pair_out",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_pair",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialWorkspaceCopyPairOut",
            "ffiFmpqPolynomialPairClose",
            [workspace._ffi_borrow(), u_slot, v_slot],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
                "uint64",
                "uint64",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "invalid rational polynomial workspace pair copy",
        )
    )


def fmpq_polynomial_workspace_load_pair(
    workspace: FmpqPolynomialWorkspace,
    u_output: int,
    v_output: int,
    source: FmpqPolynomialPair,
) -> bool:
    """Call declared flint:fmpq_polynomial_workspace_load_pair."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace_load_pair",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialWorkspaceLoadPair",
        [workspace._ffi_borrow(), u_output, v_output, source._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
            "uint64",
            "uint64",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_pair",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid rational polynomial workspace pair load",
        [],
    )


def fmpq_polynomial_workspace_move_mumford_result_out(
    workspace: FmpqPolynomialWorkspace, u_slot: int, v_slot: int, genus: int
) -> FmpqMumfordResult:
    """Call declared flint:fmpq_polynomial_workspace_move_mumford_result_out."""
    return FmpqMumfordResult(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__
            + ":fmpq_polynomial_workspace_move_mumford_result_out",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_mumford_result",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialWorkspaceMoveMumfordResultOut",
            "ffiFmpqMumfordResultClose",
            [workspace._ffi_borrow(), u_slot, v_slot, genus],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
                "uint64",
                "uint64",
                "uint64",
            ],
            [None, None, None, None],
            "zero_is_error",
            "ValueError",
            "invalid rational Mumford workspace move",
        )
    )


def fmpq_polynomial_workspace_load_mumford_result(
    workspace: FmpqPolynomialWorkspace,
    u_output: int,
    v_output: int,
    source: FmpqMumfordResult,
    genus: int,
) -> bool:
    """Call declared flint:fmpq_polynomial_workspace_load_mumford_result."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace_load_mumford_result",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialWorkspaceLoadMumfordResult",
        [workspace._ffi_borrow(), u_output, v_output, source._ffi_borrow(), genus],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
            "uint64",
            "uint64",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_mumford_result",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid rational Mumford workspace load",
        [],
    )


def fmpq_polynomial_workspace_zero(
    workspace: FmpqPolynomialWorkspace, output: int
) -> bool:
    """Call declared flint:fmpq_polynomial_workspace_zero."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace_zero",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialWorkspaceZero",
        [workspace._ffi_borrow(), output],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid workspace slot",
        [],
    )


def fmpq_polynomial_workspace_one(
    workspace: FmpqPolynomialWorkspace, output: int
) -> bool:
    """Call declared flint:fmpq_polynomial_workspace_one."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace_one",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialWorkspaceOne",
        [workspace._ffi_borrow(), output],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid workspace slot",
        [],
    )


def fmpq_polynomial_workspace_copy(
    workspace: FmpqPolynomialWorkspace, output: int, source: int
) -> bool:
    """Call declared flint:fmpq_polynomial_workspace_copy."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace_copy",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialWorkspaceCopy",
        [workspace._ffi_borrow(), output, source],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid workspace slots",
        [],
    )


def fmpq_polynomial_workspace_swap(
    workspace: FmpqPolynomialWorkspace, left: int, right: int
) -> bool:
    """Call declared flint:fmpq_polynomial_workspace_swap."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace_swap",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialWorkspaceSwap",
        [workspace._ffi_borrow(), left, right],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid workspace slots",
        [],
    )


def fmpq_polynomial_workspace_monic(
    workspace: FmpqPolynomialWorkspace, output: int, source: int
) -> bool:
    """Call declared flint:fmpq_polynomial_workspace_monic."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace_monic",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialWorkspaceMonic",
        [workspace._ffi_borrow(), output, source],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid workspace monic input",
        [],
    )


def fmpq_polynomial_workspace_add(
    workspace: FmpqPolynomialWorkspace, output: int, left: int, right: int
) -> bool:
    """Call declared flint:fmpq_polynomial_workspace_add."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace_add",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialWorkspaceAdd",
        [workspace._ffi_borrow(), output, left, right],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid workspace addition",
        [],
    )


def fmpq_polynomial_workspace_sub(
    workspace: FmpqPolynomialWorkspace, output: int, left: int, right: int
) -> bool:
    """Call declared flint:fmpq_polynomial_workspace_sub."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace_sub",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialWorkspaceSub",
        [workspace._ffi_borrow(), output, left, right],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid workspace subtraction",
        [],
    )


def fmpq_polynomial_workspace_neg(
    workspace: FmpqPolynomialWorkspace, output: int, source: int
) -> bool:
    """Call declared flint:fmpq_polynomial_workspace_neg."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace_neg",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialWorkspaceNeg",
        [workspace._ffi_borrow(), output, source],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid workspace negation",
        [],
    )


def fmpq_polynomial_workspace_mul(
    workspace: FmpqPolynomialWorkspace, output: int, left: int, right: int
) -> bool:
    """Call declared flint:fmpq_polynomial_workspace_mul."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace_mul",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialWorkspaceMul",
        [workspace._ffi_borrow(), output, left, right],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid workspace multiplication",
        [],
    )


def fmpq_polynomial_workspace_divexact(
    workspace: FmpqPolynomialWorkspace, output: int, left: int, right: int
) -> bool:
    """Call declared flint:fmpq_polynomial_workspace_divexact."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace_divexact",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialWorkspaceDivExact",
        [workspace._ffi_borrow(), output, left, right],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "workspace quotient is not exact",
        [],
    )


def fmpq_polynomial_workspace_rem(
    workspace: FmpqPolynomialWorkspace, output: int, left: int, right: int
) -> bool:
    """Call declared flint:fmpq_polynomial_workspace_rem."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace_rem",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialWorkspaceRemainder",
        [workspace._ffi_borrow(), output, left, right],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid workspace remainder",
        [],
    )


def fmpq_polynomial_workspace_xgcd(
    workspace: FmpqPolynomialWorkspace,
    gcd: int,
    left_coefficient: int,
    right_coefficient: int,
    left: int,
    right: int,
) -> bool:
    """Call declared flint:fmpq_polynomial_workspace_xgcd."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace_xgcd",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialWorkspaceXgcd",
        [
            workspace._ffi_borrow(),
            gcd,
            left_coefficient,
            right_coefficient,
            left,
            right,
        ],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid workspace xgcd",
        [],
    )


def fmpq_polynomial_workspace_length(
    workspace: FmpqPolynomialWorkspace, slot: int
) -> int:
    """Call declared flint:fmpq_polynomial_workspace_length."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace_length",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialWorkspaceLength",
        [workspace._ffi_borrow(), slot],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
            "uint64",
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpq_polynomial_workspace_allocated_bytes(
    workspace: FmpqPolynomialWorkspace,
) -> int:
    """Call declared flint:fmpq_polynomial_workspace_allocated_bytes."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace_allocated_bytes",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialWorkspaceAllocatedBytes",
        [workspace._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpq_polynomial_workspace_is_zero(
    workspace: FmpqPolynomialWorkspace, slot: int
) -> int:
    """Call declared flint:fmpq_polynomial_workspace_is_zero."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace_is_zero",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialWorkspaceIsZero",
        [workspace._ffi_borrow(), slot],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
            "uint64",
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpq_polynomial_workspace_is_one(
    workspace: FmpqPolynomialWorkspace, slot: int
) -> int:
    """Call declared flint:fmpq_polynomial_workspace_is_one."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace_is_one",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialWorkspaceIsOne",
        [workspace._ffi_borrow(), slot],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
            "uint64",
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpq_polynomial_workspace_equal(
    workspace: FmpqPolynomialWorkspace, left: int, right: int
) -> int:
    """Call declared flint:fmpq_polynomial_workspace_equal."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace_equal",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialWorkspaceEqual",
        [workspace._ffi_borrow(), left, right],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
            "uint64",
            "uint64",
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpq_polynomial_workspace_coefficient_numerator(
    workspace: FmpqPolynomialWorkspace, slot: int, index: int
) -> int:
    """Call declared flint:fmpq_polynomial_workspace_coefficient_numerator."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_polynomial_workspace_coefficient_numerator",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialWorkspaceCoefficientNumerator",
        [workspace._ffi_borrow(), slot, index],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
            "uint64",
            "uint64",
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "workspace coefficient is out of bounds",
        [],
    )


def fmpq_polynomial_workspace_coefficient_denominator(
    workspace: FmpqPolynomialWorkspace, slot: int, index: int
) -> int:
    """Call declared flint:fmpq_polynomial_workspace_coefficient_denominator."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__
        + ":fmpq_polynomial_workspace_coefficient_denominator",
        "@sagemath/sagejs-flint",
        "ffiFmpqPolynomialWorkspaceCoefficientDenominator",
        [workspace._ffi_borrow(), slot, index],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_workspace",
            "uint64",
            "uint64",
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "workspace coefficient is out of bounds",
        [],
    )


def fmpq_polynomial(length: int) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialAdd",
            "ffiFmpqPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialSub",
            "ffiFmpqPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialNeg",
            "ffiFmpqPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "rational polynomial is unsealed",
        )
    )


def fmpq_polynomial_scalar_div(
    source: FmpqPolynomial, numerator: int, denominator: int
) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_scalar_div."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_scalar_div",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialScalarDiv",
            "ffiFmpqPolynomialClose",
            [source._ffi_borrow(), numerator, denominator],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
                "Integer",
                "Integer",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "rational polynomial scalar division requires a sealed resource and a nonzero divisor",
        )
    )


def fmpq_polynomial_truncate(source: FmpqPolynomial, stop: int) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_truncate."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_truncate",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialTruncate",
            "ffiFmpqPolynomialClose",
            [source._ffi_borrow(), stop],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational polynomial truncation requires a sealed resource and a supported stop",
        )
    )


def fmpq_polynomial_compose(
    outer: FmpqPolynomial, inner: FmpqPolynomial
) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_compose."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_compose",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialCompose",
            "ffiFmpqPolynomialClose",
            [outer._ffi_borrow(), inner._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational polynomial composition requires sealed resources",
        )
    )


def fmpq_polynomial_reverse(source: FmpqPolynomial, length: int) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_reverse."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_reverse",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialReverse",
            "ffiFmpqPolynomialClose",
            [source._ffi_borrow(), length],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational polynomial reversal requires a sealed resource and supported length",
        )
    )


def fmpq_polynomial_shift_left(source: FmpqPolynomial, amount: int) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_shift_left."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_shift_left",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialShiftLeft",
            "ffiFmpqPolynomialClose",
            [source._ffi_borrow(), amount],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational polynomial left shift requires a sealed resource and supported amount",
        )
    )


def fmpq_polynomial_shift_right(source: FmpqPolynomial, amount: int) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_shift_right."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_shift_right",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialShiftRight",
            "ffiFmpqPolynomialClose",
            [source._ffi_borrow(), amount],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational polynomial right shift requires a sealed resource and supported amount",
        )
    )


def fmpq_polynomial_integral(source: FmpqPolynomial) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_integral."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_integral",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialIntegral",
            "ffiFmpqPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "rational polynomial integration requires a sealed resource",
        )
    )


def fmpq_polynomial_resultant(left: FmpqPolynomial, right: FmpqPolynomial) -> FmpqValue:
    """Call declared flint:fmpq_polynomial_resultant."""
    return FmpqValue(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_resultant",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_value",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialResultant",
            "ffiFmpqValueClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational polynomial resultant requires sealed resources",
        )
    )


def fmpq_polynomial_discriminant(source: FmpqPolynomial) -> FmpqValue:
    """Call declared flint:fmpq_polynomial_discriminant."""
    return FmpqValue(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_discriminant",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_value",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialDiscriminant",
            "ffiFmpqValueClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "rational polynomial discriminant requires a sealed resource",
        )
    )


def fmpq_polynomial_derivative(source: FmpqPolynomial) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_derivative."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_derivative",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialDerivative",
            "ffiFmpqPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialMul",
            "ffiFmpqPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialGcd",
            "ffiFmpqPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational polynomial is unsealed",
        )
    )


def fmpq_polynomial_xgcd_resource(
    left: FmpqPolynomial, right: FmpqPolynomial
) -> FmpqPolynomialXgcdResult:
    """Call declared flint:fmpq_polynomial_xgcd_resource."""
    return FmpqPolynomialXgcdResult(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_xgcd_resource",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_xgcd_result",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialXgcdResource",
            "ffiFmpqPolynomialXgcdResultClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational polynomial is unsealed",
        )
    )


def fmpq_polynomial_xgcd_result_gcd(xgcd: FmpqPolynomialXgcdResult) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_xgcd_result_gcd."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_xgcd_result_gcd",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialXgcdResultGcd",
            "ffiFmpqPolynomialClose",
            [xgcd._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_xgcd_result"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "invalid rational xgcd result",
        )
    )


def fmpq_polynomial_xgcd_result_left_coefficient(
    xgcd: FmpqPolynomialXgcdResult,
) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_xgcd_result_left_coefficient."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__
            + ":fmpq_polynomial_xgcd_result_left_coefficient",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialXgcdResultLeftCoefficient",
            "ffiFmpqPolynomialClose",
            [xgcd._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_xgcd_result"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "invalid rational xgcd result",
        )
    )


def fmpq_polynomial_xgcd_result_right_coefficient(
    xgcd: FmpqPolynomialXgcdResult,
) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_xgcd_result_right_coefficient."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__
            + ":fmpq_polynomial_xgcd_result_right_coefficient",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialXgcdResultRightCoefficient",
            "ffiFmpqPolynomialClose",
            [xgcd._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_xgcd_result"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "invalid rational xgcd result",
        )
    )


def fmpq_polynomial_factor_resource(
    source: FmpqPolynomial,
) -> ExactPolynomialFactorization:
    """Call declared flint:fmpq_polynomial_factor_resource."""
    return ExactPolynomialFactorization(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_factor_resource",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:exact_polynomial_factorization",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialFactorResource",
            "ffiExactPolynomialFactorizationClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:exact_polynomial_factorization"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:exact_polynomial_factorization",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:exact_polynomial_factorization"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:exact_polynomial_factorization"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiExactPolynomialFactorizationFmpzFactor",
            "ffiFmpzPolynomialClose",
            [factorization._ffi_borrow(), index],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:exact_polynomial_factorization",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiExactPolynomialFactorizationFmpqFactor",
            "ffiFmpqPolynomialClose",
            [factorization._ffi_borrow(), index],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:exact_polynomial_factorization",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialDivExact",
            "ffiFmpqPolynomialClose",
            [dividend._ffi_borrow(), divisor._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational polynomial exact division requires sealed resources, a nonzero divisor, and an exact quotient",
        )
    )


def fmpq_polynomial_quo_rem_resource(
    dividend: FmpqPolynomial, divisor: FmpqPolynomial
) -> FmpqPolynomialDivisionResult:
    """Call declared flint:fmpq_polynomial_quo_rem_resource."""
    return FmpqPolynomialDivisionResult(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_quo_rem_resource",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_division_result",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialQuoRemResource",
            "ffiFmpqPolynomialDivisionResultClose",
            [dividend._ffi_borrow(), divisor._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational polynomial division requires sealed resources and a nonzero divisor",
        )
    )


def fmpq_polynomial_division_result_quotient(
    division: FmpqPolynomialDivisionResult,
) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_division_result_quotient."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_division_result_quotient",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialDivisionResultQuotient",
            "ffiFmpqPolynomialClose",
            [division._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_division_result"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "invalid rational division result",
        )
    )


def fmpq_polynomial_division_result_remainder(
    division: FmpqPolynomialDivisionResult,
) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_division_result_remainder."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_division_result_remainder",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialDivisionResultRemainder",
            "ffiFmpqPolynomialClose",
            [division._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial_division_result"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "invalid rational division result",
        )
    )


def fmpq_polynomial_pow(source: FmpqPolynomial, exponent: int) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_pow."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_pow",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialPow",
            "ffiFmpqPolynomialClose",
            [source._ffi_borrow(), exponent],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_value",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialEvaluate",
            "ffiFmpqValueClose",
            [source._ffi_borrow(), numerator, denominator],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialSerialize",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialFormat",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "rational polynomial formatting failed",
        )
    )


def fmpq_polynomial_from_byte_region(
    source: FlintByteRegion, offset: int, length: int
) -> FmpqPolynomial:
    """Call declared flint:fmpq_polynomial_from_byte_region."""
    return FmpqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_polynomial_from_byte_region",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqPolynomialFromByteRegion",
            "ffiFmpqPolynomialClose",
            [source._ffi_borrow(), offset, length],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
                "uint64",
                "uint64",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "invalid SJPQ v1 rational polynomial serialization",
        )
    )


def fmpz_vector_from_byte_region(source: FlintByteRegion, length: int) -> FmpzVector:
    """Call declared flint:fmpz_vector_from_byte_region."""
    return FmpzVector(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_vector_from_byte_region",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_vector",
            "@sagemath/sagejs-flint",
            "ffiFmpzVectorFromByteRegion",
            "ffiFmpzVectorClose",
            [source._ffi_borrow(), length],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "invalid canonical integer vector entry stream",
        )
    )


def fmpz_perfect_power_data(number: int) -> FmpzVector:
    """Call declared flint:fmpz_perfect_power_data."""
    return FmpzVector(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_perfect_power_data",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_vector",
            "@sagemath/sagejs-flint",
            "ffiFmpzPerfectPowerData",
            "ffiFmpzVectorClose",
            [number],
            ["Integer"],
            [None],
            "zero_is_error",
            "RuntimeError",
            "FLINT perfect-power extraction failed",
        )
    )


def fmpz_is_probabprime(number: int) -> int:
    """Call declared flint:fmpz_is_probabprime."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_is_probabprime",
        "@sagemath/sagejs-flint",
        "ffiFmpzIsProbabprime",
        [number],
        ["Integer"],
        "Integer",
        ["status", [1], None],
        "RuntimeError",
        "FLINT probable-prime screening failed",
        [],
    )


def fmpq_vector_from_byte_region(source: FlintByteRegion, length: int) -> FmpqVector:
    """Call declared flint:fmpq_vector_from_byte_region."""
    return FmpqVector(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_vector_from_byte_region",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_vector",
            "@sagemath/sagejs-flint",
            "ffiFmpqVectorFromByteRegion",
            "ffiFmpqVectorClose",
            [source._ffi_borrow(), length],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "invalid canonical rational vector entry stream",
        )
    )


def fmpz_vector_length(vector: FmpzVector) -> int:
    """Call declared flint:fmpz_vector_length."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_vector_length",
        "@sagemath/sagejs-flint",
        "ffiFmpzVectorLength",
        [vector._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_vector"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpq_vector_length(vector: FmpqVector) -> int:
    """Call declared flint:fmpq_vector_length."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_vector_length",
        "@sagemath/sagejs-flint",
        "ffiFmpqVectorLength",
        [vector._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_vector"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpz_vector_entry(vector: FmpzVector, index: int) -> int:
    """Call declared flint:fmpz_vector_entry."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_vector_entry",
        "@sagemath/sagejs-flint",
        "ffiFmpzVectorEntry",
        [vector._ffi_borrow(), index],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_vector",
            "uint64",
        ],
        "Integer",
        ["status", [1], None],
        "IndexError",
        "integer vector index is out of range",
        [],
    )


def fmpq_vector_entry_numerator(vector: FmpqVector, index: int) -> int:
    """Call declared flint:fmpq_vector_entry_numerator."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_vector_entry_numerator",
        "@sagemath/sagejs-flint",
        "ffiFmpqVectorEntryNumerator",
        [vector._ffi_borrow(), index],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_vector",
            "uint64",
        ],
        "Integer",
        ["status", [1], None],
        "IndexError",
        "rational vector index is out of range",
        [],
    )


def fmpq_vector_entry_denominator(vector: FmpqVector, index: int) -> int:
    """Call declared flint:fmpq_vector_entry_denominator."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_vector_entry_denominator",
        "@sagemath/sagejs-flint",
        "ffiFmpqVectorEntryDenominator",
        [vector._ffi_borrow(), index],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_vector",
            "uint64",
        ],
        "Integer",
        ["status", [1], None],
        "IndexError",
        "rational vector index is out of range",
        [],
    )


def fmpz_vector_set_entry(vector: FmpzVector, index: int, entry: int) -> bool:
    """Call declared flint:fmpz_vector_set_entry."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_vector_set_entry",
        "@sagemath/sagejs-flint",
        "ffiFmpzVectorSetEntry",
        [vector._ffi_borrow(), index, entry],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_vector",
            "uint64",
            "Integer",
        ],
        "bool",
        ["status", [1], None],
        "IndexError",
        "integer vector index is out of range",
        [],
    )


def fmpq_vector_set_entry(
    vector: FmpqVector, index: int, numerator: int, denominator: int
) -> bool:
    """Call declared flint:fmpq_vector_set_entry."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_vector_set_entry",
        "@sagemath/sagejs-flint",
        "ffiFmpqVectorSetEntry",
        [vector._ffi_borrow(), index, numerator, denominator],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_vector",
            "uint64",
            "Integer",
            "Integer",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid rational vector entry",
        [],
    )


def fmpz_vector_copy(source: FmpzVector) -> FmpzVector:
    """Call declared flint:fmpz_vector_copy."""
    return FmpzVector(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_vector_copy",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_vector",
            "@sagemath/sagejs-flint",
            "ffiFmpzVectorCopy",
            "ffiFmpzVectorClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_vector"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "integer vector copy failed",
        )
    )


def fmpq_vector_copy(source: FmpqVector) -> FmpqVector:
    """Call declared flint:fmpq_vector_copy."""
    return FmpqVector(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_vector_copy",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_vector",
            "@sagemath/sagejs-flint",
            "ffiFmpqVectorCopy",
            "ffiFmpqVectorClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_vector"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "rational vector copy failed",
        )
    )


def fmpz_vector_serialize(source: FmpzVector) -> FlintByteRegion:
    """Call declared flint:fmpz_vector_serialize."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_vector_serialize",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpzVectorSerialize",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_vector"
            ],
            [None],
            "zero_is_error",
            "OverflowError",
            "integer vector serialization is too large",
        )
    )


def fmpq_vector_serialize(source: FmpqVector) -> FlintByteRegion:
    """Call declared flint:fmpq_vector_serialize."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_vector_serialize",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpqVectorSerialize",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_vector"
            ],
            [None],
            "zero_is_error",
            "OverflowError",
            "rational vector serialization is too large",
        )
    )


def fmpz_vector_equal(left: FmpzVector, right: FmpzVector) -> bool:
    """Call declared flint:fmpz_vector_equal."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_vector_equal",
        "@sagemath/sagejs-flint",
        "ffiFmpzVectorEqual",
        [left._ffi_borrow(), right._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_vector",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_vector",
        ],
        "bool",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpq_vector_equal(left: FmpqVector, right: FmpqVector) -> bool:
    """Call declared flint:fmpq_vector_equal."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_vector_equal",
        "@sagemath/sagejs-flint",
        "ffiFmpqVectorEqual",
        [left._ffi_borrow(), right._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_vector",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_vector",
        ],
        "bool",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpz_vector_add(left: FmpzVector, right: FmpzVector) -> FmpzVector:
    """Call declared flint:fmpz_vector_add."""
    return FmpzVector(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_vector_add",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_vector",
            "@sagemath/sagejs-flint",
            "ffiFmpzVectorAdd",
            "ffiFmpzVectorClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_vector",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_vector",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer vector lengths are incompatible",
        )
    )


def fmpq_vector_add(left: FmpqVector, right: FmpqVector) -> FmpqVector:
    """Call declared flint:fmpq_vector_add."""
    return FmpqVector(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_vector_add",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_vector",
            "@sagemath/sagejs-flint",
            "ffiFmpqVectorAdd",
            "ffiFmpqVectorClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_vector",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_vector",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational vector lengths are incompatible",
        )
    )


def fmpz_vector_sub(left: FmpzVector, right: FmpzVector) -> FmpzVector:
    """Call declared flint:fmpz_vector_sub."""
    return FmpzVector(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_vector_sub",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_vector",
            "@sagemath/sagejs-flint",
            "ffiFmpzVectorSub",
            "ffiFmpzVectorClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_vector",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_vector",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer vector lengths are incompatible",
        )
    )


def fmpq_vector_sub(left: FmpqVector, right: FmpqVector) -> FmpqVector:
    """Call declared flint:fmpq_vector_sub."""
    return FmpqVector(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_vector_sub",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_vector",
            "@sagemath/sagejs-flint",
            "ffiFmpqVectorSub",
            "ffiFmpqVectorClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_vector",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_vector",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational vector lengths are incompatible",
        )
    )


def fmpz_vector_scalar_mul(source: FmpzVector, scalar: int) -> FmpzVector:
    """Call declared flint:fmpz_vector_scalar_mul."""
    return FmpzVector(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_vector_scalar_mul",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_vector",
            "@sagemath/sagejs-flint",
            "ffiFmpzVectorScalarMul",
            "ffiFmpzVectorClose",
            [source._ffi_borrow(), scalar],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_vector",
                "Integer",
            ],
            [None, None],
            "zero_is_error",
            "RuntimeError",
            "integer vector scalar multiplication failed",
        )
    )


def fmpq_vector_scalar_mul(
    source: FmpqVector, numerator: int, denominator: int
) -> FmpqVector:
    """Call declared flint:fmpq_vector_scalar_mul."""
    return FmpqVector(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_vector_scalar_mul",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_vector",
            "@sagemath/sagejs-flint",
            "ffiFmpqVectorScalarMul",
            "ffiFmpqVectorClose",
            [source._ffi_borrow(), numerator, denominator],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_vector",
                "Integer",
                "Integer",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "invalid rational vector scalar",
        )
    )


def fmpz_vector_dot(left: FmpzVector, right: FmpzVector) -> int:
    """Call declared flint:fmpz_vector_dot."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_vector_dot",
        "@sagemath/sagejs-flint",
        "ffiFmpzVectorDot",
        [left._ffi_borrow(), right._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_vector",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_vector",
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "integer vector lengths are incompatible",
        [],
    )


def fmpq_vector_dot(left: FmpqVector, right: FmpqVector) -> FmpqValue:
    """Call declared flint:fmpq_vector_dot."""
    return FmpqValue(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_vector_dot",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_value",
            "@sagemath/sagejs-flint",
            "ffiFmpqVectorDot",
            "ffiFmpqValueClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_vector",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_vector",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational vector lengths are incompatible",
        )
    )


def fmpz_matrix(rows: int, columns: int) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "uint64",
            "uint64",
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "integer matrix entry is out of bounds",
        [],
    )


def fmpz_matrix_export_mod_ui(
    source: FmpzMatrix, modulus: int, width: int
) -> FlintByteRegion:
    """Call declared flint:fmpz_matrix_export_mod_ui."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_export_mod_ui",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixExportModUi",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow(), modulus, width],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
                "uint64",
                "uint64",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "integer matrix modular export failed",
        )
    )


def fmpz_matrix_copy(source: FmpzMatrix) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_copy."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_copy",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixCopy",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixNeg",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixScalarMul",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow(), scalar],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixAdd",
            "ffiFmpzMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixSub",
            "ffiFmpzMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixTranspose",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixMul",
            "ffiFmpzMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer matrix dimensions are incompatible",
        )
    )


def fmpz_matrix_mul_vector(
    matrix: FmpzMatrix, vector: FlintByteRegion
) -> FlintByteRegion:
    """Call declared flint:fmpz_matrix_mul_vector."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_mul_vector",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixMulVector",
            "ffiFlintByteRegionClose",
            [matrix._ffi_borrow(), vector._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer matrix-vector input is invalid",
        )
    )


def fmpz_vector_mul_matrix(
    vector: FlintByteRegion, matrix: FmpzMatrix
) -> FlintByteRegion:
    """Call declared flint:fmpz_vector_mul_matrix."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_vector_mul_matrix",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpzVectorMulMatrix",
            "ffiFlintByteRegionClose",
            [vector._ffi_borrow(), matrix._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer vector-matrix input is invalid",
        )
    )


def fmpz_matrix_pow(source: FmpzMatrix, exponent: int) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_pow."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_pow",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixPow",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow(), exponent],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpz_matrix_rank_mod_46337(matrix: FmpzMatrix) -> int:
    """Call declared flint:fmpz_matrix_rank_mod_46337."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_matrix_rank_mod_46337",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatrixRankMod46337",
        [matrix._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixHnf",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixSnf",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixRightKernel",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixCharpoly",
            "ffiFmpzPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixMinpoly",
            "ffiFmpzPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixFromFmpz",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixFromFmpqIntegral",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixSubmatrix",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow(), row_start, row_stop, column_start, column_stop],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixSelectRows",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow(), indices, count],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
                "UInt64Buffer",
                "uint64",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "integer matrix row selection contains an invalid index",
        )
    )


def fmpz_matrix_prefix_rows(source: FmpzMatrix, count: int) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_prefix_rows."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_prefix_rows",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixPrefixRows",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow(), count],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "integer matrix row-prefix count is invalid",
        )
    )


def fmpz_matrix_select_columns(
    source: FmpzMatrix, indices: list[int], count: int
) -> FmpzMatrix:
    """Call declared flint:fmpz_matrix_select_columns."""
    return FmpzMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_select_columns",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixSelectColumns",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow(), indices, count],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
                "UInt64Buffer",
                "uint64",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "integer matrix column selection contains an invalid index",
        )
    )


def fmpz_matrix_swap_rows(matrix: FmpzMatrix, first: int, second: int) -> bool:
    """Call declared flint:fmpz_matrix_swap_rows."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_matrix_swap_rows",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatrixSwapRows",
        [matrix._ffi_borrow(), first, second],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "integer matrix row index is out of range",
        [],
    )


def fmpz_matrix_swap_columns(matrix: FmpzMatrix, first: int, second: int) -> bool:
    """Call declared flint:fmpz_matrix_swap_columns."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_matrix_swap_columns",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatrixSwapColumns",
        [matrix._ffi_borrow(), first, second],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "integer matrix column index is out of range",
        [],
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "uint64",
            "uint64",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixStack",
            "ffiFmpzMatrixClose",
            [top._ffi_borrow(), bottom._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixAugment",
            "ffiFmpzMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpz_matrix_echelon_pivots(source: FmpzMatrix) -> FlintByteRegion:
    """Call declared flint:fmpz_matrix_echelon_pivots."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_echelon_pivots",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixEchelonPivots",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "integer matrix pivot query failed",
        )
    )


def fmpz_matrix_format(source: FmpzMatrix) -> FlintByteRegion:
    """Call declared flint:fmpz_matrix_format."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_matrix_format",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixFormat",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixSerialize",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixSerializeSequence",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow(), start, stride, count],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixDeserialize",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpzMatrixDeserializeEntries",
            "ffiFmpzMatrixClose",
            [source._ffi_borrow(), rows, columns],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
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


def fmpq_matrix_add_scaled_entry(
    matrix: FmpqMatrix,
    row: int,
    column: int,
    numerator: int,
    denominator: int,
    scale: int,
) -> bool:
    """Call declared flint:fmpq_matrix_add_scaled_entry."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_matrix_add_scaled_entry",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatrixAddScaledEntry",
        [matrix._ffi_borrow(), row, column, numerator, denominator, scale],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "uint64",
            "uint64",
            "Integer",
            "Integer",
            "Integer",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid rational matrix entry update",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixCopy",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixNeg",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixScalarMul",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow(), numerator, denominator],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixAdd",
            "ffiFmpqMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixSub",
            "ffiFmpqMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixTranspose",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixMul",
            "ffiFmpqMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational matrix dimensions are incompatible",
        )
    )


def fmpq_matrix_mul_vector(
    matrix: FmpqMatrix, vector: FlintByteRegion
) -> FlintByteRegion:
    """Call declared flint:fmpq_matrix_mul_vector."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_mul_vector",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixMulVector",
            "ffiFlintByteRegionClose",
            [matrix._ffi_borrow(), vector._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational matrix-vector input is invalid",
        )
    )


def fmpq_vector_mul_matrix(
    vector: FlintByteRegion, matrix: FmpqMatrix
) -> FlintByteRegion:
    """Call declared flint:fmpq_vector_mul_matrix."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_vector_mul_matrix",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpqVectorMulMatrix",
            "ffiFlintByteRegionClose",
            [vector._ffi_borrow(), matrix._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational vector-matrix input is invalid",
        )
    )


def fmpq_matrix_inv(source: FmpqMatrix) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix_inv."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_inv",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixInv",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixSolve",
            "ffiFmpqMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixRref",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixRightKernel",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixCharpoly",
            "ffiFmpqPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixMinpoly",
            "ffiFmpqPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_value",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixDet",
            "ffiFmpqValueClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_value",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixTrace",
            "ffiFmpqValueClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixSubmatrix",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow(), row_start, row_stop, column_start, column_stop],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixSelectRows",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow(), indices, count],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
                "UInt64Buffer",
                "uint64",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "rational matrix row selection contains an invalid index",
        )
    )


def fmpq_matrix_prefix_rows(source: FmpqMatrix, count: int) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix_prefix_rows."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_prefix_rows",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixPrefixRows",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow(), count],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "rational matrix row-prefix count is invalid",
        )
    )


def fmpq_matrix_select_columns(
    source: FmpqMatrix, indices: list[int], count: int
) -> FmpqMatrix:
    """Call declared flint:fmpq_matrix_select_columns."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_select_columns",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixSelectColumns",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow(), indices, count],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
                "UInt64Buffer",
                "uint64",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "rational matrix column selection contains an invalid index",
        )
    )


def fmpq_matrix_swap_rows(matrix: FmpqMatrix, first: int, second: int) -> bool:
    """Call declared flint:fmpq_matrix_swap_rows."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_matrix_swap_rows",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatrixSwapRows",
        [matrix._ffi_borrow(), first, second],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "rational matrix row index is out of range",
        [],
    )


def fmpq_matrix_swap_columns(matrix: FmpqMatrix, first: int, second: int) -> bool:
    """Call declared flint:fmpq_matrix_swap_columns."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_matrix_swap_columns",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatrixSwapColumns",
        [matrix._ffi_borrow(), first, second],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "rational matrix column index is out of range",
        [],
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "uint64",
            "uint64",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixStack",
            "ffiFmpqMatrixClose",
            [top._ffi_borrow(), bottom._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixAugment",
            "ffiFmpqMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpq_matrix_echelon_pivots(source: FmpqMatrix) -> FlintByteRegion:
    """Call declared flint:fmpq_matrix_echelon_pivots."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpq_matrix_echelon_pivots",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixEchelonPivots",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "rational matrix pivot query failed",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_value"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_value"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixFormat",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixSerialize",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixSerializeSequence",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow(), start, stride, count],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiFmpqMatrixDeserialize",
            "ffiFmpqMatrixClose",
            [source._ffi_borrow(), rows, columns],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:dirichlet_group",
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:dirichlet_group"
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
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:dirichlet_group"
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


def arith_number_of_partitions(size: int) -> int:
    """Call declared flint:arith_number_of_partitions."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":arith_number_of_partitions",
        "@sagemath/sagejs-flint",
        "numberOfPartitions",
        [size],
        ["uint64"],
        "Integer",
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


def fmpz_mat_hnf_modular_eldiv(
    output: list[int],
    source: list[int],
    rows: int,
    columns: int,
    elementary_divisor: list[int],
    one: int,
) -> bool:
    """Call declared flint:fmpz_mat_hnf_modular_eldiv."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mat_hnf_modular_eldiv",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatHnfModularEldiv",
        [output, source, rows, columns, elementary_divisor, one],
        [
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
            "IntegerBuffer",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT modular integer Hermite form failed",
        [
            [
                "buffer_length",
                "output",
                ["rows", "columns"],
                ["output", "source", "rows", "columns", "elementary_divisor", "one"],
            ],
            [
                "buffer_length",
                "source",
                ["rows", "columns"],
                ["output", "source", "rows", "columns", "elementary_divisor", "one"],
            ],
            [
                "buffer_length",
                "elementary_divisor",
                ["one", "one"],
                ["output", "source", "rows", "columns", "elementary_divisor", "one"],
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


def fmpz_mat_lll_transform(
    output: list[int], transform: list[int], source: list[int], rows: int, columns: int
) -> bool:
    """Call declared flint:fmpz_mat_lll_transform."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mat_lll_transform",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatLllTransform",
        [output, transform, source, rows, columns],
        ["IntegerBuffer", "IntegerBuffer", "IntegerBuffer", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT integer LLL transformation failed",
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


def nmod_matrix_from_entries(
    entries: list[int], entry_count: int, rows: int, columns: int, modulus: int
) -> NmodMatrix:
    """Call declared flint:nmod_matrix_from_entries."""
    return NmodMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_matrix_from_entries",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "@sagemath/sagejs-flint",
            "ffiNmodMatrixFromEntries",
            "ffiNmodMatrixClose",
            [entries, entry_count, rows, columns, modulus],
            ["UInt64Buffer", "uint64", "uint64", "uint64", "uint64"],
            [None, None, None, None, None],
            "zero_is_error",
            "ValueError",
            "invalid word-prime matrix packed input",
        )
    )


def nmod_matrix_random(
    rows: int, columns: int, modulus: int, seed1: int, seed2: int
) -> NmodMatrix:
    """Call declared flint:nmod_matrix_random."""
    return NmodMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_matrix_random",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "@sagemath/sagejs-flint",
            "ffiNmodMatrixRandom",
            "ffiNmodMatrixClose",
            [rows, columns, modulus, seed1, seed2],
            ["uint64", "uint64", "uint64", "uint64", "uint64"],
            [None, None, None, None, None],
            "zero_is_error",
            "ValueError",
            "invalid word-prime random matrix parameters",
        )
    )


def nmod_matrix_nrows(matrix: NmodMatrix) -> int:
    """Call declared flint:nmod_matrix_nrows."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_matrix_nrows",
        "@sagemath/sagejs-flint",
        "ffiNmodMatrixNrows",
        [matrix._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def nmod_matrix_ncols(matrix: NmodMatrix) -> int:
    """Call declared flint:nmod_matrix_ncols."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_matrix_ncols",
        "@sagemath/sagejs-flint",
        "ffiNmodMatrixNcols",
        [matrix._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def nmod_matrix_modulus(matrix: NmodMatrix) -> int:
    """Call declared flint:nmod_matrix_modulus."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_matrix_modulus",
        "@sagemath/sagejs-flint",
        "ffiNmodMatrixModulus",
        [matrix._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def nmod_matrix_entry(matrix: NmodMatrix, row: int, column: int) -> int:
    """Call declared flint:nmod_matrix_entry."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_matrix_entry",
        "@sagemath/sagejs-flint",
        "ffiNmodMatrixEntry",
        [matrix._ffi_borrow(), row, column],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "uint64",
            "uint64",
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def nmod_matrix_set_entry(
    matrix: NmodMatrix, row: int, column: int, value: int
) -> bool:
    """Call declared flint:nmod_matrix_set_entry."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_matrix_set_entry",
        "@sagemath/sagejs-flint",
        "ffiNmodMatrixSetEntry",
        [matrix._ffi_borrow(), row, column, value],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid word-prime matrix entry",
        [],
    )


def nmod_matrix_copy(source: NmodMatrix) -> NmodMatrix:
    """Call declared flint:nmod_matrix_copy."""
    return NmodMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_matrix_copy",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "@sagemath/sagejs-flint",
            "ffiNmodMatrixCopy",
            "ffiNmodMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "word-prime matrix copy failed",
        )
    )


def nmod_matrix_equal(left: NmodMatrix, right: NmodMatrix) -> bool:
    """Call declared flint:nmod_matrix_equal."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_matrix_equal",
        "@sagemath/sagejs-flint",
        "ffiNmodMatrixEqual",
        [left._ffi_borrow(), right._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
        ],
        "bool",
        ["direct", [], None],
        None,
        None,
        [],
    )


def nmod_matrix_is_zero(matrix: NmodMatrix) -> bool:
    """Call declared flint:nmod_matrix_is_zero."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_matrix_is_zero",
        "@sagemath/sagejs-flint",
        "ffiNmodMatrixIsZero",
        [matrix._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix"
        ],
        "bool",
        ["direct", [], None],
        None,
        None,
        [],
    )


def nmod_matrix_is_one(matrix: NmodMatrix) -> bool:
    """Call declared flint:nmod_matrix_is_one."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_matrix_is_one",
        "@sagemath/sagejs-flint",
        "ffiNmodMatrixIsOne",
        [matrix._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix"
        ],
        "bool",
        ["direct", [], None],
        None,
        None,
        [],
    )


def nmod_matrix_nonzero_count(matrix: NmodMatrix) -> int:
    """Call declared flint:nmod_matrix_nonzero_count."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_matrix_nonzero_count",
        "@sagemath/sagejs-flint",
        "ffiNmodMatrixNonzeroCount",
        [matrix._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def nmod_matrix_add(left: NmodMatrix, right: NmodMatrix) -> NmodMatrix:
    """Call declared flint:nmod_matrix_add."""
    return NmodMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_matrix_add",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "@sagemath/sagejs-flint",
            "ffiNmodMatrixAdd",
            "ffiNmodMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "word-prime matrix add mismatch",
        )
    )


def nmod_matrix_sub(left: NmodMatrix, right: NmodMatrix) -> NmodMatrix:
    """Call declared flint:nmod_matrix_sub."""
    return NmodMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_matrix_sub",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "@sagemath/sagejs-flint",
            "ffiNmodMatrixSub",
            "ffiNmodMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "word-prime matrix subtract mismatch",
        )
    )


def nmod_matrix_neg(source: NmodMatrix) -> NmodMatrix:
    """Call declared flint:nmod_matrix_neg."""
    return NmodMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_matrix_neg",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "@sagemath/sagejs-flint",
            "ffiNmodMatrixNeg",
            "ffiNmodMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "word-prime matrix negation failed",
        )
    )


def nmod_matrix_scalar_mul(source: NmodMatrix, scalar: int) -> NmodMatrix:
    """Call declared flint:nmod_matrix_scalar_mul."""
    return NmodMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_matrix_scalar_mul",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "@sagemath/sagejs-flint",
            "ffiNmodMatrixScalarMul",
            "ffiNmodMatrixClose",
            [source._ffi_borrow(), scalar],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "invalid word-prime matrix scalar",
        )
    )


def nmod_matrix_transpose(source: NmodMatrix) -> NmodMatrix:
    """Call declared flint:nmod_matrix_transpose."""
    return NmodMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_matrix_transpose",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "@sagemath/sagejs-flint",
            "ffiNmodMatrixTranspose",
            "ffiNmodMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "word-prime matrix transpose failed",
        )
    )


def nmod_matrix_mul(left: NmodMatrix, right: NmodMatrix) -> NmodMatrix:
    """Call declared flint:nmod_matrix_mul."""
    return NmodMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_matrix_mul",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "@sagemath/sagejs-flint",
            "ffiNmodMatrixMul",
            "ffiNmodMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "word-prime matrix multiply mismatch",
        )
    )


def nmod_matrix_inv(source: NmodMatrix) -> NmodMatrix:
    """Call declared flint:nmod_matrix_inv."""
    return NmodMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_matrix_inv",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "@sagemath/sagejs-flint",
            "ffiNmodMatrixInv",
            "ffiNmodMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "word-prime matrix is singular",
        )
    )


def nmod_matrix_solve(left: NmodMatrix, right: NmodMatrix) -> NmodMatrix:
    """Call declared flint:nmod_matrix_solve."""
    return NmodMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_matrix_solve",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "@sagemath/sagejs-flint",
            "ffiNmodMatrixSolve",
            "ffiNmodMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "word-prime matrix solve failed",
        )
    )


def nmod_matrix_rank(matrix: NmodMatrix) -> int:
    """Call declared flint:nmod_matrix_rank."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_matrix_rank",
        "@sagemath/sagejs-flint",
        "ffiNmodMatrixRank",
        [matrix._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def nmod_matrix_rref(source: NmodMatrix) -> NmodMatrix:
    """Call declared flint:nmod_matrix_rref."""
    return NmodMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_matrix_rref",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "@sagemath/sagejs-flint",
            "ffiNmodMatrixRref",
            "ffiNmodMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "word-prime matrix RREF failed",
        )
    )


def nmod_matrix_right_kernel(source: NmodMatrix) -> NmodMatrix:
    """Call declared flint:nmod_matrix_right_kernel."""
    return NmodMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_matrix_right_kernel",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "@sagemath/sagejs-flint",
            "ffiNmodMatrixRightKernel",
            "ffiNmodMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "word-prime right kernel failed",
        )
    )


def nmod_matrix_det(source: NmodMatrix) -> int:
    """Call declared flint:nmod_matrix_det."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_matrix_det",
        "@sagemath/sagejs-flint",
        "ffiNmodMatrixDet",
        [source._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def nmod_matrix_trace(source: NmodMatrix) -> int:
    """Call declared flint:nmod_matrix_trace."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_matrix_trace",
        "@sagemath/sagejs-flint",
        "ffiNmodMatrixTrace",
        [source._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def nmod_matrix_select_rows(
    source: NmodMatrix, indices: list[int], count: int
) -> NmodMatrix:
    """Call declared flint:nmod_matrix_select_rows."""
    return NmodMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_matrix_select_rows",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "@sagemath/sagejs-flint",
            "ffiNmodMatrixSelectRows",
            "ffiNmodMatrixClose",
            [source._ffi_borrow(), indices, count],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
                "UInt64Buffer",
                "uint64",
            ],
            [None, None, None],
            "zero_is_error",
            "IndexError",
            "word-prime row index is out of range",
        )
    )


def nmod_matrix_select_columns(
    source: NmodMatrix, indices: list[int], count: int
) -> NmodMatrix:
    """Call declared flint:nmod_matrix_select_columns."""
    return NmodMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_matrix_select_columns",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "@sagemath/sagejs-flint",
            "ffiNmodMatrixSelectColumns",
            "ffiNmodMatrixClose",
            [source._ffi_borrow(), indices, count],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
                "UInt64Buffer",
                "uint64",
            ],
            [None, None, None],
            "zero_is_error",
            "IndexError",
            "word-prime column index is out of range",
        )
    )


def nmod_matrix_set_block(
    target: NmodMatrix, target_row: int, target_column: int, source: NmodMatrix
) -> bool:
    """Call declared flint:nmod_matrix_set_block."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_matrix_set_block",
        "@sagemath/sagejs-flint",
        "ffiNmodMatrixSetBlock",
        [target._ffi_borrow(), target_row, target_column, source._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "uint64",
            "uint64",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "word-prime matrix block mismatch",
        [],
    )


def nmod_matrix_mul_vector(
    matrix: NmodMatrix, vector: list[int], length: int
) -> FlintByteRegion:
    """Call declared flint:nmod_matrix_mul_vector."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_matrix_mul_vector",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiNmodMatrixMulVector",
            "ffiFlintByteRegionClose",
            [matrix._ffi_borrow(), vector, length],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
                "UInt64Buffer",
                "uint64",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "word-prime matrix-vector mismatch",
        )
    )


def nmod_vector_mul_matrix(
    vector: list[int], length: int, matrix: NmodMatrix
) -> FlintByteRegion:
    """Call declared flint:nmod_vector_mul_matrix."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_vector_mul_matrix",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiNmodVectorMulMatrix",
            "ffiFlintByteRegionClose",
            [vector, length, matrix._ffi_borrow()],
            [
                "UInt64Buffer",
                "uint64",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "word-prime vector-matrix mismatch",
        )
    )


def nmod_matrix_stack(top: NmodMatrix, bottom: NmodMatrix) -> NmodMatrix:
    """Call declared flint:nmod_matrix_stack."""
    return NmodMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_matrix_stack",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "@sagemath/sagejs-flint",
            "ffiNmodMatrixStack",
            "ffiNmodMatrixClose",
            [top._ffi_borrow(), bottom._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "word-prime matrix stack mismatch",
        )
    )


def nmod_matrix_augment(left: NmodMatrix, right: NmodMatrix) -> NmodMatrix:
    """Call declared flint:nmod_matrix_augment."""
    return NmodMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_matrix_augment",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "@sagemath/sagejs-flint",
            "ffiNmodMatrixAugment",
            "ffiNmodMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "word-prime matrix augment mismatch",
        )
    )


def nmod_matrix_swap_rows(matrix: NmodMatrix, first: int, second: int) -> bool:
    """Call declared flint:nmod_matrix_swap_rows."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_matrix_swap_rows",
        "@sagemath/sagejs-flint",
        "ffiNmodMatrixSwapRows",
        [matrix._ffi_borrow(), first, second],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "IndexError",
        "word-prime row index is out of range",
        [],
    )


def nmod_matrix_swap_columns(matrix: NmodMatrix, first: int, second: int) -> bool:
    """Call declared flint:nmod_matrix_swap_columns."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_matrix_swap_columns",
        "@sagemath/sagejs-flint",
        "ffiNmodMatrixSwapColumns",
        [matrix._ffi_borrow(), first, second],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "IndexError",
        "word-prime column index is out of range",
        [],
    )


def nmod_matrix_format(source: NmodMatrix) -> FlintByteRegion:
    """Call declared flint:nmod_matrix_format."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_matrix_format",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiNmodMatrixFormat",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "word-prime matrix formatting failed",
        )
    )


def nmod_matrix_serialize(source: NmodMatrix, width: int) -> FlintByteRegion:
    """Call declared flint:nmod_matrix_serialize."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_matrix_serialize",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiNmodMatrixSerialize",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow(), width],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "invalid word-prime matrix serialization width",
        )
    )


def nmod_matrix_charpoly(source: NmodMatrix) -> FlintByteRegion:
    """Call declared flint:nmod_matrix_charpoly."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_matrix_charpoly",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiNmodMatrixCharpoly",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "word-prime characteristic polynomial requires a square matrix",
        )
    )


def nmod_matrix_minpoly(source: NmodMatrix) -> FlintByteRegion:
    """Call declared flint:nmod_matrix_minpoly."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":nmod_matrix_minpoly",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiNmodMatrixMinpoly",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:nmod_matrix"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "word-prime minimal polynomial requires a square matrix",
        )
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


def nmod_poly_add(
    output: list[int],
    left: list[int],
    right: list[int],
    output_length: int,
    left_length: int,
    right_length: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_poly_add."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_add",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyAdd",
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
        "invalid polynomial addition",
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


def nmod_poly_sub(
    output: list[int],
    left: list[int],
    right: list[int],
    output_length: int,
    left_length: int,
    right_length: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_poly_sub."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_sub",
        "@sagemath/sagejs-flint",
        "ffiNmodPolySub",
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
        "invalid polynomial subtraction",
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


def nmod_poly_neg(
    output: list[int],
    source: list[int],
    output_length: int,
    source_length: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_poly_neg."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_neg",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyNeg",
        [output, source, output_length, source_length, modulus],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid polynomial negation",
        [
            [
                "buffer_length",
                "output",
                ["output_length"],
                ["output", "source", "output_length", "source_length", "modulus"],
            ],
            [
                "buffer_length",
                "source",
                ["source_length"],
                ["output", "source", "output_length", "source_length", "modulus"],
            ],
        ],
    )


def nmod_poly_equal(
    left: list[int], right: list[int], left_length: int, right_length: int, modulus: int
) -> bool:
    """Call declared flint:nmod_poly_equal."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_equal",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyEqual",
        [left, right, left_length, right_length, modulus],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "uint64"],
        "bool",
        ["direct", [], None],
        None,
        None,
        [
            [
                "buffer_length",
                "left",
                ["left_length"],
                ["left", "right", "left_length", "right_length", "modulus"],
            ],
            [
                "buffer_length",
                "right",
                ["right_length"],
                ["left", "right", "left_length", "right_length", "modulus"],
            ],
        ],
    )


def nmod_poly_derivative(
    output: list[int],
    source: list[int],
    output_length: int,
    source_length: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_poly_derivative."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_derivative",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyDerivative",
        [output, source, output_length, source_length, modulus],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid polynomial derivative",
        [
            [
                "buffer_length",
                "output",
                ["output_length"],
                ["output", "source", "output_length", "source_length", "modulus"],
            ],
            [
                "buffer_length",
                "source",
                ["source_length"],
                ["output", "source", "output_length", "source_length", "modulus"],
            ],
        ],
    )


def nmod_poly_evaluate(
    output: list[int],
    source: list[int],
    output_length: int,
    source_length: int,
    argument: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_poly_evaluate."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_evaluate",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyEvaluate",
        [output, source, output_length, source_length, argument, modulus],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid polynomial evaluation",
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
                    "argument",
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
                    "argument",
                    "modulus",
                ],
            ],
        ],
    )


def nmod_poly_compose(
    output: list[int],
    outer: list[int],
    inner: list[int],
    output_length: int,
    outer_length: int,
    inner_length: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_poly_compose."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_compose",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyCompose",
        [output, outer, inner, output_length, outer_length, inner_length, modulus],
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
        "invalid polynomial composition",
        [
            [
                "buffer_length",
                "output",
                ["output_length"],
                [
                    "output",
                    "outer",
                    "inner",
                    "output_length",
                    "outer_length",
                    "inner_length",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "outer",
                ["outer_length"],
                [
                    "output",
                    "outer",
                    "inner",
                    "output_length",
                    "outer_length",
                    "inner_length",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "inner",
                ["inner_length"],
                [
                    "output",
                    "outer",
                    "inner",
                    "output_length",
                    "outer_length",
                    "inner_length",
                    "modulus",
                ],
            ],
        ],
    )


def nmod_poly_reverse(
    output: list[int],
    source: list[int],
    output_length: int,
    source_length: int,
    reverse_length: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_poly_reverse."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_reverse",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyReverse",
        [output, source, output_length, source_length, reverse_length, modulus],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid polynomial reversal",
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
                    "reverse_length",
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
                    "reverse_length",
                    "modulus",
                ],
            ],
        ],
    )


def nmod_poly_shift_left(
    output: list[int],
    source: list[int],
    output_length: int,
    source_length: int,
    amount: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_poly_shift_left."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_shift_left",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyShiftLeft",
        [output, source, output_length, source_length, amount, modulus],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid polynomial left shift",
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
                    "amount",
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
                    "amount",
                    "modulus",
                ],
            ],
        ],
    )


def nmod_poly_shift_right(
    output: list[int],
    source: list[int],
    output_length: int,
    source_length: int,
    amount: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_poly_shift_right."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_shift_right",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyShiftRight",
        [output, source, output_length, source_length, amount, modulus],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid polynomial right shift",
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
                    "amount",
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
                    "amount",
                    "modulus",
                ],
            ],
        ],
    )


def nmod_poly_truncate(
    output: list[int],
    source: list[int],
    output_length: int,
    source_length: int,
    stop: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_poly_truncate."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_truncate",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyTruncate",
        [output, source, output_length, source_length, stop, modulus],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid polynomial truncation",
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
                    "stop",
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
                    "stop",
                    "modulus",
                ],
            ],
        ],
    )


def nmod_poly_integral(
    output: list[int],
    source: list[int],
    output_length: int,
    source_length: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_poly_integral."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_integral",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyIntegral",
        [output, source, output_length, source_length, modulus],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "prime polynomial integration requires degree smaller than the characteristic",
        [
            [
                "buffer_length",
                "output",
                ["output_length"],
                ["output", "source", "output_length", "source_length", "modulus"],
            ],
            [
                "buffer_length",
                "source",
                ["source_length"],
                ["output", "source", "output_length", "source_length", "modulus"],
            ],
        ],
    )


def nmod_poly_resultant(
    output: list[int],
    left: list[int],
    right: list[int],
    one: int,
    left_length: int,
    right_length: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_poly_resultant."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_resultant",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyResultant",
        [output, left, right, one, left_length, right_length, modulus],
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
        "invalid polynomial resultant",
        [
            [
                "buffer_length",
                "output",
                ["one"],
                [
                    "output",
                    "left",
                    "right",
                    "one",
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
                    "one",
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
                    "one",
                    "left_length",
                    "right_length",
                    "modulus",
                ],
            ],
        ],
    )


def nmod_poly_discriminant(
    output: list[int], source: list[int], one: int, source_length: int, modulus: int
) -> bool:
    """Call declared flint:nmod_poly_discriminant."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_discriminant",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyDiscriminant",
        [output, source, one, source_length, modulus],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid polynomial discriminant",
        [
            [
                "buffer_length",
                "output",
                ["one"],
                ["output", "source", "one", "source_length", "modulus"],
            ],
            [
                "buffer_length",
                "source",
                ["source_length"],
                ["output", "source", "one", "source_length", "modulus"],
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


def nmod_poly_divrem(
    quotient: list[int],
    remainder: list[int],
    left: list[int],
    right: list[int],
    quotient_length: int,
    remainder_length: int,
    left_length: int,
    right_length: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_poly_divrem."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_divrem",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyDivRem",
        [
            quotient,
            remainder,
            left,
            right,
            quotient_length,
            remainder_length,
            left_length,
            right_length,
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
        "invalid packed polynomial quotient and remainder",
        [
            [
                "buffer_length",
                "quotient",
                ["quotient_length"],
                [
                    "quotient",
                    "remainder",
                    "left",
                    "right",
                    "quotient_length",
                    "remainder_length",
                    "left_length",
                    "right_length",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "remainder",
                ["remainder_length"],
                [
                    "quotient",
                    "remainder",
                    "left",
                    "right",
                    "quotient_length",
                    "remainder_length",
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
                    "quotient",
                    "remainder",
                    "left",
                    "right",
                    "quotient_length",
                    "remainder_length",
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
                    "quotient",
                    "remainder",
                    "left",
                    "right",
                    "quotient_length",
                    "remainder_length",
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


def nmod_poly_xgcd(
    gcd_output: list[int],
    left_coefficient_output: list[int],
    right_coefficient_output: list[int],
    left: list[int],
    right: list[int],
    output_length: int,
    left_length: int,
    right_length: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_poly_xgcd."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_xgcd",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyXgcd",
        [
            gcd_output,
            left_coefficient_output,
            right_coefficient_output,
            left,
            right,
            output_length,
            left_length,
            right_length,
            modulus,
        ],
        [
            "UInt64Buffer",
            "UInt64Buffer",
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
        "polynomial xgcd failed",
        [
            [
                "buffer_length",
                "gcd_output",
                ["output_length"],
                [
                    "gcd_output",
                    "left_coefficient_output",
                    "right_coefficient_output",
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
                "left_coefficient_output",
                ["output_length"],
                [
                    "gcd_output",
                    "left_coefficient_output",
                    "right_coefficient_output",
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
                "right_coefficient_output",
                ["output_length"],
                [
                    "gcd_output",
                    "left_coefficient_output",
                    "right_coefficient_output",
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
                    "gcd_output",
                    "left_coefficient_output",
                    "right_coefficient_output",
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
                    "gcd_output",
                    "left_coefficient_output",
                    "right_coefficient_output",
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


def fq_context(
    modulus: list[int], modulus_length: int, characteristic: int
) -> FqContext:
    """Call declared flint:fq_context."""
    return FqContext(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fq_context",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_context",
            "@sagemath/sagejs-flint",
            "ffiFqContextCreate",
            "ffiFqContextClose",
            [modulus, modulus_length, characteristic],
            ["UInt64Buffer", "uint64", "uint64"],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "finite extension modulus is invalid or unsupported",
        )
    )


def fq_context_characteristic(context: FqContext) -> int:
    """Call declared flint:fq_context_characteristic."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fq_context_characteristic",
        "@sagemath/sagejs-flint",
        "ffiFqContextCharacteristic",
        [context._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_context"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fq_context_degree(context: FqContext) -> int:
    """Call declared flint:fq_context_degree."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fq_context_degree",
        "@sagemath/sagejs-flint",
        "ffiFqContextDegree",
        [context._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_context"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fq_element(
    context: FqContext, coordinates: list[int], coordinate_length: int
) -> FqElement:
    """Call declared flint:fq_element."""
    return FqElement(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fq_element",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element",
            "@sagemath/sagejs-flint",
            "ffiFqElementCreate",
            "ffiFqElementClose",
            [context._ffi_borrow(), coordinates, coordinate_length],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_context",
                "UInt64Buffer",
                "uint64",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "finite extension element coordinates are invalid",
        )
    )


def fq_element_copy(source: FqElement) -> FqElement:
    """Call declared flint:fq_element_copy."""
    return FqElement(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fq_element_copy",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element",
            "@sagemath/sagejs-flint",
            "ffiFqElementCopy",
            "ffiFqElementClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "finite extension copy failed",
        )
    )


def fq_element_extension_degree(element: FqElement) -> int:
    """Call declared flint:fq_element_extension_degree."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fq_element_extension_degree",
        "@sagemath/sagejs-flint",
        "ffiFqElementExtensionDegree",
        [element._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fq_element_coordinate(element: FqElement, basis_index: int) -> int:
    """Call declared flint:fq_element_coordinate."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fq_element_coordinate",
        "@sagemath/sagejs-flint",
        "ffiFqElementCoordinate",
        [element._ffi_borrow(), basis_index],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element",
            "uint64",
        ],
        "uint64",
        ["nullable", [], "error"],
        "IndexError",
        "finite extension basis index out of range",
        [],
    )


def fq_element_equal(left: FqElement, right: FqElement) -> bool:
    """Call declared flint:fq_element_equal."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fq_element_equal",
        "@sagemath/sagejs-flint",
        "ffiFqElementEqual",
        [left._ffi_borrow(), right._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element",
        ],
        "bool",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fq_element_add(left: FqElement, right: FqElement) -> FqElement:
    """Call declared flint:fq_element_add."""
    return FqElement(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fq_element_add",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element",
            "@sagemath/sagejs-flint",
            "ffiFqElementAdd",
            "ffiFqElementClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element",
            ],
            [None, None],
            "zero_is_error",
            "TypeError",
            "finite extension contexts differ",
        )
    )


def fq_element_sub(left: FqElement, right: FqElement) -> FqElement:
    """Call declared flint:fq_element_sub."""
    return FqElement(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fq_element_sub",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element",
            "@sagemath/sagejs-flint",
            "ffiFqElementSub",
            "ffiFqElementClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element",
            ],
            [None, None],
            "zero_is_error",
            "TypeError",
            "finite extension contexts differ",
        )
    )


def fq_element_mul(left: FqElement, right: FqElement) -> FqElement:
    """Call declared flint:fq_element_mul."""
    return FqElement(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fq_element_mul",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element",
            "@sagemath/sagejs-flint",
            "ffiFqElementMul",
            "ffiFqElementClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element",
            ],
            [None, None],
            "zero_is_error",
            "TypeError",
            "finite extension contexts differ",
        )
    )


def fq_element_neg(source: FqElement) -> FqElement:
    """Call declared flint:fq_element_neg."""
    return FqElement(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fq_element_neg",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element",
            "@sagemath/sagejs-flint",
            "ffiFqElementNeg",
            "ffiFqElementClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "finite extension negation failed",
        )
    )


def fq_element_inverse(source: FqElement) -> FqElement:
    """Call declared flint:fq_element_inverse."""
    return FqElement(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fq_element_inverse",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element",
            "@sagemath/sagejs-flint",
            "ffiFqElementInverse",
            "ffiFqElementClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "finite extension inverse failed",
        )
    )


def fq_element_pow(source: FqElement, exponent: int) -> FqElement:
    """Call declared flint:fq_element_pow."""
    return FqElement(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fq_element_pow",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element",
            "@sagemath/sagejs-flint",
            "ffiFqElementPow",
            "ffiFqElementClose",
            [source._ffi_borrow(), exponent],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element",
                "Integer",
            ],
            [None, None],
            "zero_is_error",
            "RuntimeError",
            "finite extension power failed",
        )
    )


def fq_element_is_zero(source: FqElement) -> bool:
    """Call declared flint:fq_element_is_zero."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fq_element_is_zero",
        "@sagemath/sagejs-flint",
        "ffiFqElementIsZero",
        [source._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element"
        ],
        "bool",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fq_element_is_one(source: FqElement) -> bool:
    """Call declared flint:fq_element_is_one."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fq_element_is_one",
        "@sagemath/sagejs-flint",
        "ffiFqElementIsOne",
        [source._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element"
        ],
        "bool",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fq_element_coordinate_bytes(element: FqElement) -> FlintByteRegion:
    """Call declared flint:fq_element_coordinate_bytes."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fq_element_coordinate_bytes",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFqElementCoordinateBytes",
            "ffiFlintByteRegionClose",
            [element._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_element"
            ],
            [None],
            "zero_is_error",
            "OverflowError",
            "finite extension element export is too large",
        )
    )


def fq_polynomial(
    context: FqContext,
    coordinates: list[int],
    coordinate_length: int,
    coefficient_count: int,
) -> FqPolynomial:
    """Call declared flint:fq_polynomial."""
    return FqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fq_polynomial",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFqPolynomialCreate",
            "ffiFqPolynomialClose",
            [context._ffi_borrow(), coordinates, coordinate_length, coefficient_count],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_context",
                "UInt64Buffer",
                "uint64",
                "uint64",
            ],
            [None, None, None, None],
            "zero_is_error",
            "ValueError",
            "finite extension polynomial coordinates are invalid",
        )
    )


def fq_polynomial_copy(source: FqPolynomial) -> FqPolynomial:
    """Call declared flint:fq_polynomial_copy."""
    return FqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fq_polynomial_copy",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFqPolynomialCopy",
            "ffiFqPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "extension polynomial copy failed",
        )
    )


def fq_polynomial_length(polynomial: FqPolynomial) -> int:
    """Call declared flint:fq_polynomial_length."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fq_polynomial_length",
        "@sagemath/sagejs-flint",
        "ffiFqPolynomialLength",
        [polynomial._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fq_polynomial_extension_degree(polynomial: FqPolynomial) -> int:
    """Call declared flint:fq_polynomial_extension_degree."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fq_polynomial_extension_degree",
        "@sagemath/sagejs-flint",
        "ffiFqPolynomialExtensionDegree",
        [polynomial._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fq_polynomial_coordinate(
    polynomial: FqPolynomial, coefficient_index: int, basis_index: int
) -> int:
    """Call declared flint:fq_polynomial_coordinate."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fq_polynomial_coordinate",
        "@sagemath/sagejs-flint",
        "ffiFqPolynomialCoordinate",
        [polynomial._ffi_borrow(), coefficient_index, basis_index],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial",
            "uint64",
            "uint64",
        ],
        "uint64",
        ["nullable", [], "error"],
        "IndexError",
        "extension polynomial coordinate index out of range",
        [],
    )


def fq_polynomial_equal(left: FqPolynomial, right: FqPolynomial) -> bool:
    """Call declared flint:fq_polynomial_equal."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fq_polynomial_equal",
        "@sagemath/sagejs-flint",
        "ffiFqPolynomialEqual",
        [left._ffi_borrow(), right._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial",
        ],
        "bool",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fq_polynomial_add(left: FqPolynomial, right: FqPolynomial) -> FqPolynomial:
    """Call declared flint:fq_polynomial_add."""
    return FqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fq_polynomial_add",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFqPolynomialAdd",
            "ffiFqPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "TypeError",
            "extension polynomial contexts differ",
        )
    )


def fq_polynomial_sub(left: FqPolynomial, right: FqPolynomial) -> FqPolynomial:
    """Call declared flint:fq_polynomial_sub."""
    return FqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fq_polynomial_sub",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFqPolynomialSub",
            "ffiFqPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "TypeError",
            "extension polynomial contexts differ",
        )
    )


def fq_polynomial_mul(left: FqPolynomial, right: FqPolynomial) -> FqPolynomial:
    """Call declared flint:fq_polynomial_mul."""
    return FqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fq_polynomial_mul",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFqPolynomialMul",
            "ffiFqPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "TypeError",
            "extension polynomial contexts differ",
        )
    )


def fq_polynomial_neg(source: FqPolynomial) -> FqPolynomial:
    """Call declared flint:fq_polynomial_neg."""
    return FqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fq_polynomial_neg",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFqPolynomialNeg",
            "ffiFqPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "extension polynomial negation failed",
        )
    )


def fq_polynomial_pow(source: FqPolynomial, exponent: int) -> FqPolynomial:
    """Call declared flint:fq_polynomial_pow."""
    return FqPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fq_polynomial_pow",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFqPolynomialPow",
            "ffiFqPolynomialClose",
            [source._ffi_borrow(), exponent],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "OverflowError",
            "extension polynomial exponent is too large",
        )
    )


def fq_polynomial_coordinate_bytes(polynomial: FqPolynomial) -> FlintByteRegion:
    """Call declared flint:fq_polynomial_coordinate_bytes."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fq_polynomial_coordinate_bytes",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFqPolynomialCoordinateBytes",
            "ffiFlintByteRegionClose",
            [polynomial._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fq_polynomial"
            ],
            [None],
            "zero_is_error",
            "OverflowError",
            "extension polynomial export is too large",
        )
    )


def fmpz_mod_polynomial(modulus: int, length: int) -> FmpzModPolynomial:
    """Call declared flint:fmpz_mod_polynomial."""
    return FmpzModPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzModPolynomialCreate",
            "ffiFmpzModPolynomialClose",
            [modulus, length],
            ["Integer", "uint64"],
            [None, None],
            "zero_is_error",
            "ValueError",
            "modulus must be prime and polynomial length must fit the host",
        )
    )


def fmpz_mod_polynomial_set_coefficient(
    polynomial: FmpzModPolynomial, index: int, coefficient: int
) -> bool:
    """Call declared flint:fmpz_mod_polynomial_set_coefficient."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_set_coefficient",
        "@sagemath/sagejs-flint",
        "ffiFmpzModPolynomialSetCoefficient",
        [polynomial._ffi_borrow(), index, coefficient],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            "uint64",
            "Integer",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "coefficient write requires an in-range unsealed polynomial",
        [],
    )


def fmpz_mod_polynomial_seal(polynomial: FmpzModPolynomial) -> bool:
    """Call declared flint:fmpz_mod_polynomial_seal."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_seal",
        "@sagemath/sagejs-flint",
        "ffiFmpzModPolynomialSeal",
        [polynomial._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial"
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "polynomial resource is already sealed",
        [],
    )


def fmpz_mod_polynomial_modulus(source: FmpzModPolynomial) -> int:
    """Call declared flint:fmpz_mod_polynomial_modulus."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_modulus",
        "@sagemath/sagejs-flint",
        "ffiFmpzModPolynomialModulus",
        [source._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial"
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "polynomial is unsealed",
        [],
    )


def fmpz_mod_polynomial_is_zero(source: FmpzModPolynomial) -> int:
    """Call declared flint:fmpz_mod_polynomial_is_zero."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_is_zero",
        "@sagemath/sagejs-flint",
        "ffiFmpzModPolynomialIsZero",
        [source._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial"
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "polynomial is unsealed",
        [],
    )


def fmpz_mod_polynomial_length(source: FmpzModPolynomial) -> int:
    """Call declared flint:fmpz_mod_polynomial_length."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_length",
        "@sagemath/sagejs-flint",
        "ffiFmpzModPolynomialLength",
        [source._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial"
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "polynomial is unsealed",
        [],
    )


def fmpz_mod_polynomial_entry_count(source: FmpzModPolynomial) -> int:
    """Call declared flint:fmpz_mod_polynomial_entry_count."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_entry_count",
        "@sagemath/sagejs-flint",
        "ffiFmpzModPolynomialEntryCount",
        [source._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpz_mod_polynomial_coefficient(source: FmpzModPolynomial, index: int) -> int:
    """Call declared flint:fmpz_mod_polynomial_coefficient."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_coefficient",
        "@sagemath/sagejs-flint",
        "ffiFmpzModPolynomialCoefficient",
        [source._ffi_borrow(), index],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            "uint64",
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "coefficient access requires a sealed polynomial and host-sized index",
        [],
    )


def fmpz_mod_polynomial_copy(source: FmpzModPolynomial) -> FmpzModPolynomial:
    """Call declared flint:fmpz_mod_polynomial_copy."""
    return FmpzModPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_copy",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzModPolynomialCopy",
            "ffiFmpzModPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "polynomial is unsealed",
        )
    )


def fmpz_mod_polynomial_equal(left: FmpzModPolynomial, right: FmpzModPolynomial) -> int:
    """Call declared flint:fmpz_mod_polynomial_equal."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_equal",
        "@sagemath/sagejs-flint",
        "ffiFmpzModPolynomialEqual",
        [left._ffi_borrow(), right._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "polynomial moduli do not match",
        [],
    )


def fmpz_mod_polynomial_add(
    left: FmpzModPolynomial, right: FmpzModPolynomial
) -> FmpzModPolynomial:
    """Call declared flint:fmpz_mod_polynomial_add."""
    return FmpzModPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_add",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzModPolynomialAdd",
            "ffiFmpzModPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "polynomial moduli do not match",
        )
    )


def fmpz_mod_polynomial_sub(
    left: FmpzModPolynomial, right: FmpzModPolynomial
) -> FmpzModPolynomial:
    """Call declared flint:fmpz_mod_polynomial_sub."""
    return FmpzModPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_sub",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzModPolynomialSub",
            "ffiFmpzModPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "polynomial moduli do not match",
        )
    )


def fmpz_mod_polynomial_mul(
    left: FmpzModPolynomial, right: FmpzModPolynomial
) -> FmpzModPolynomial:
    """Call declared flint:fmpz_mod_polynomial_mul."""
    return FmpzModPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_mul",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzModPolynomialMul",
            "ffiFmpzModPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "polynomial moduli do not match",
        )
    )


def fmpz_mod_polynomial_neg(source: FmpzModPolynomial) -> FmpzModPolynomial:
    """Call declared flint:fmpz_mod_polynomial_neg."""
    return FmpzModPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_neg",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzModPolynomialNeg",
            "ffiFmpzModPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "polynomial is unsealed",
        )
    )


def fmpz_mod_polynomial_pow(
    source: FmpzModPolynomial, exponent: int
) -> FmpzModPolynomial:
    """Call declared flint:fmpz_mod_polynomial_pow."""
    return FmpzModPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_pow",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzModPolynomialPow",
            "ffiFmpzModPolynomialClose",
            [source._ffi_borrow(), exponent],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "OverflowError",
            "polynomial exponent is too large",
        )
    )


def fmpz_mod_polynomial_derivative(source: FmpzModPolynomial) -> FmpzModPolynomial:
    """Call declared flint:fmpz_mod_polynomial_derivative."""
    return FmpzModPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_derivative",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzModPolynomialDerivative",
            "ffiFmpzModPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "polynomial is unsealed",
        )
    )


def fmpz_mod_polynomial_evaluate(source: FmpzModPolynomial, argument: int) -> int:
    """Call declared flint:fmpz_mod_polynomial_evaluate."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_evaluate",
        "@sagemath/sagejs-flint",
        "ffiFmpzModPolynomialEvaluate",
        [source._ffi_borrow(), argument],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            "Integer",
        ],
        "Integer",
        ["status", [1], None],
        "ValueError",
        "polynomial is unsealed",
        [],
    )


def fmpz_mod_polynomial_gcd(
    left: FmpzModPolynomial, right: FmpzModPolynomial
) -> FmpzModPolynomial:
    """Call declared flint:fmpz_mod_polynomial_gcd."""
    return FmpzModPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_gcd",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzModPolynomialGcd",
            "ffiFmpzModPolynomialClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "polynomial moduli do not match",
        )
    )


def fmpz_mod_polynomial_divrem_resource(
    dividend: FmpzModPolynomial, divisor: FmpzModPolynomial
) -> FmpzModPolynomialDivisionResult:
    """Call declared flint:fmpz_mod_polynomial_divrem_resource."""
    return FmpzModPolynomialDivisionResult(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_divrem_resource",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial_division_result",
            "@sagemath/sagejs-flint",
            "ffiFmpzModPolynomialDivremResource",
            "ffiFmpzModPolynomialDivisionResultClose",
            [dividend._ffi_borrow(), divisor._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "polynomial division requires equal moduli and a nonzero divisor",
        )
    )


def fmpz_mod_polynomial_division_result_quotient(
    division: FmpzModPolynomialDivisionResult,
) -> FmpzModPolynomial:
    """Call declared flint:fmpz_mod_polynomial_division_result_quotient."""
    return FmpzModPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__
            + ":fmpz_mod_polynomial_division_result_quotient",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzModPolynomialDivisionResultQuotient",
            "ffiFmpzModPolynomialClose",
            [division._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial_division_result"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "invalid division result",
        )
    )


def fmpz_mod_polynomial_division_result_remainder(
    division: FmpzModPolynomialDivisionResult,
) -> FmpzModPolynomial:
    """Call declared flint:fmpz_mod_polynomial_division_result_remainder."""
    return FmpzModPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__
            + ":fmpz_mod_polynomial_division_result_remainder",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzModPolynomialDivisionResultRemainder",
            "ffiFmpzModPolynomialClose",
            [division._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial_division_result"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "invalid division result",
        )
    )


def fmpz_mod_polynomial_xgcd_resource(
    left: FmpzModPolynomial, right: FmpzModPolynomial
) -> FmpzModPolynomialXgcdResult:
    """Call declared flint:fmpz_mod_polynomial_xgcd_resource."""
    return FmpzModPolynomialXgcdResult(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_xgcd_resource",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial_xgcd_result",
            "@sagemath/sagejs-flint",
            "ffiFmpzModPolynomialXgcdResource",
            "ffiFmpzModPolynomialXgcdResultClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "polynomial moduli do not match",
        )
    )


def fmpz_mod_polynomial_xgcd_result_gcd(
    xgcd: FmpzModPolynomialXgcdResult,
) -> FmpzModPolynomial:
    """Call declared flint:fmpz_mod_polynomial_xgcd_result_gcd."""
    return FmpzModPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_xgcd_result_gcd",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzModPolynomialXgcdResultGcd",
            "ffiFmpzModPolynomialClose",
            [xgcd._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial_xgcd_result"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "invalid xgcd result",
        )
    )


def fmpz_mod_polynomial_xgcd_result_left_coefficient(
    xgcd: FmpzModPolynomialXgcdResult,
) -> FmpzModPolynomial:
    """Call declared flint:fmpz_mod_polynomial_xgcd_result_left_coefficient."""
    return FmpzModPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__
            + ":fmpz_mod_polynomial_xgcd_result_left_coefficient",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzModPolynomialXgcdResultLeftCoefficient",
            "ffiFmpzModPolynomialClose",
            [xgcd._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial_xgcd_result"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "invalid xgcd result",
        )
    )


def fmpz_mod_polynomial_xgcd_result_right_coefficient(
    xgcd: FmpzModPolynomialXgcdResult,
) -> FmpzModPolynomial:
    """Call declared flint:fmpz_mod_polynomial_xgcd_result_right_coefficient."""
    return FmpzModPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__
            + ":fmpz_mod_polynomial_xgcd_result_right_coefficient",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzModPolynomialXgcdResultRightCoefficient",
            "ffiFmpzModPolynomialClose",
            [xgcd._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial_xgcd_result"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "invalid xgcd result",
        )
    )


def fmpz_mod_polynomial_factor_resource(
    source: FmpzModPolynomial,
) -> FmpzModPolynomialFactorization:
    """Call declared flint:fmpz_mod_polynomial_factor_resource."""
    return FmpzModPolynomialFactorization(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_factor_resource",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial_factorization",
            "@sagemath/sagejs-flint",
            "ffiFmpzModPolynomialFactorResource",
            "ffiFmpzModPolynomialFactorizationClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "factorization of 0 is not defined",
        )
    )


def fmpz_mod_polynomial_roots_resource(
    source: FmpzModPolynomial,
) -> FmpzModPolynomialRoots:
    """Call declared flint:fmpz_mod_polynomial_roots_resource."""
    return FmpzModPolynomialRoots(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_roots_resource",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial_roots",
            "@sagemath/sagejs-flint",
            "ffiFmpzModPolynomialRootsResource",
            "ffiFmpzModPolynomialRootsClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "factorization of 0 is not defined",
        )
    )


def fmpz_mod_polynomial_format(source: FmpzModPolynomial) -> FlintByteRegion:
    """Call declared flint:fmpz_mod_polynomial_format."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_format",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpzModPolynomialFormat",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "polynomial is unsealed",
        )
    )


def fmpz_mod_polynomial_serialize(source: FmpzModPolynomial) -> FlintByteRegion:
    """Call declared flint:fmpz_mod_polynomial_serialize."""
    return FlintByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_serialize",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region",
            "@sagemath/sagejs-flint",
            "ffiFmpzModPolynomialSerialize",
            "ffiFlintByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "polynomial is unsealed",
        )
    )


def fmpz_mod_polynomial_deserialize(source: FlintByteRegion) -> FmpzModPolynomial:
    """Call declared flint:fmpz_mod_polynomial_deserialize."""
    return FmpzModPolynomial(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":fmpz_mod_polynomial_deserialize",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_mod_polynomial",
            "@sagemath/sagejs-flint",
            "ffiFmpzModPolynomialDeserialize",
            "ffiFmpzModPolynomialClose",
            [source._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:byte_region"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "invalid arbitrary-prime polynomial serialization",
        )
    )


def number_field_order_pmaximal(
    multiplication_table: FmpzMatrix, prime: int
) -> FmpqMatrix:
    """Call declared flint:number_field_order_pmaximal."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":number_field_order_pmaximal",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiNumberFieldOrderPmaximal",
            "ffiFmpqMatrixClose",
            [multiplication_table._ffi_borrow(), prime],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
                "uint64",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "invalid local number-field order data",
        )
    )


def number_field_order_maximal_at_primes(
    multiplication_table: FmpzMatrix, primes: list[int], prime_count: int
) -> FmpqMatrix:
    """Call declared flint:number_field_order_maximal_at_primes."""
    return FmpqMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":number_field_order_maximal_at_primes",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpq_matrix",
            "@sagemath/sagejs-flint",
            "ffiNumberFieldOrderMaximalAtPrimes",
            "ffiFmpqMatrixClose",
            [multiplication_table._ffi_borrow(), primes, prime_count],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
                "UInt64Buffer",
                "uint64",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "invalid local number-field order data",
        )
    )


def number_field_order_from_polynomial_resource(
    polynomial: FmpzPolynomial, prime_hints: FmpzMatrix
) -> NumberFieldOrderResource:
    """Call declared flint:number_field_order_from_polynomial_resource."""
    return NumberFieldOrderResource(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":number_field_order_from_polynomial_resource",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:number_field_order_resource",
            "@sagemath/sagejs-flint",
            "ffiNumberFieldOrderFromPolynomialResource",
            "ffiNumberFieldOrderResourceClose",
            [polynomial._ffi_borrow(), prime_hints._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "invalid direct number-field order input",
        )
    )


def number_field_order_resource_status(resource: NumberFieldOrderResource) -> int:
    """Call declared flint:number_field_order_resource_status."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":number_field_order_resource_status",
        "@sagemath/sagejs-flint",
        "ffiNumberFieldOrderResourceStatus",
        [resource._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:number_field_order_resource"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def number_field_order_resource_degree(resource: NumberFieldOrderResource) -> int:
    """Call declared flint:number_field_order_resource_degree."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":number_field_order_resource_degree",
        "@sagemath/sagejs-flint",
        "ffiNumberFieldOrderResourceDegree",
        [resource._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:number_field_order_resource"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def number_field_order_resource_supplied_primes(
    resource: NumberFieldOrderResource,
) -> int:
    """Call declared flint:number_field_order_resource_supplied_primes."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":number_field_order_resource_supplied_primes",
        "@sagemath/sagejs-flint",
        "ffiNumberFieldOrderResourceSuppliedPrimes",
        [resource._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:number_field_order_resource"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def number_field_order_resource_resolved_primes(
    resource: NumberFieldOrderResource,
) -> int:
    """Call declared flint:number_field_order_resource_resolved_primes."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":number_field_order_resource_resolved_primes",
        "@sagemath/sagejs-flint",
        "ffiNumberFieldOrderResourceResolvedPrimes",
        [resource._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:number_field_order_resource"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def number_field_order_resource_native_primes(
    resource: NumberFieldOrderResource,
) -> int:
    """Call declared flint:number_field_order_resource_native_primes."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":number_field_order_resource_native_primes",
        "@sagemath/sagejs-flint",
        "ffiNumberFieldOrderResourceNativePrimes",
        [resource._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:number_field_order_resource"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def number_field_order_resource_unramified_primes(
    resource: NumberFieldOrderResource,
) -> int:
    """Call declared flint:number_field_order_resource_unramified_primes."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":number_field_order_resource_unramified_primes",
        "@sagemath/sagejs-flint",
        "ffiNumberFieldOrderResourceUnramifiedPrimes",
        [resource._ffi_borrow()],
        [
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:number_field_order_resource"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def number_field_order_with_round2_proof_resource(
    polynomial: FmpzPolynomial, prime_hints: FmpzMatrix
) -> NumberFieldAnalysisResource:
    """Call declared flint:number_field_order_with_round2_proof_resource."""
    return NumberFieldAnalysisResource(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__
            + ":number_field_order_with_round2_proof_resource",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:number_field_analysis_resource",
            "@sagemath/sagejs-flint",
            "ffiNumberFieldOrderWithRound2ProofResource",
            "ffiNumberFieldAnalysisResourceClose",
            [polynomial._ffi_borrow(), prime_hints._ffi_borrow()],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "invalid proof-carrying number-field order input",
        )
    )


def number_field_analyze_resource(
    polynomial: FmpzPolynomial, scale: int, trial_bound: int
) -> NumberFieldAnalysisResource:
    """Call declared flint:number_field_analyze_resource."""
    return NumberFieldAnalysisResource(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":number_field_analyze_resource",
            "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:number_field_analysis_resource",
            "@sagemath/sagejs-flint",
            "ffiNumberFieldAnalyzeResource",
            "ffiNumberFieldAnalysisResourceClose",
            [polynomial._ffi_borrow(), scale, trial_bound],
            [
                "resource:flint@48e40c062ae1ff3f33af7e1afe437795b12e1300c6b7d341f2dd7d44b3f89d5e:fmpz_polynomial",
                "Integer",
                "uint64",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "invalid fused number-field analysis input",
        )
    )


def integer_log_sqrt_balls_packed(
    output: list[int],
    source: list[int],
    output_length: int,
    count: int,
    one: int,
    precision: int,
) -> bool:
    """Call declared flint:integer_log_sqrt_balls_packed."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":integer_log_sqrt_balls_packed",
        "@sagemath/sagejs-flint",
        "ffiIntegerLogSqrtBallsPacked",
        [output, source, output_length, count, one, precision],
        ["IntegerBuffer", "IntegerBuffer", "uint64", "uint64", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT integer logarithm/square-root batch is invalid",
        [
            [
                "buffer_length",
                "output",
                ["output_length", "one"],
                ["output", "source", "output_length", "count", "one", "precision"],
            ],
            [
                "buffer_length",
                "source",
                ["count", "one"],
                ["output", "source", "output_length", "count", "one", "precision"],
            ],
        ],
    )

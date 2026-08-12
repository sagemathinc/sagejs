"""Public structural polynomial dispatch over canonical storage.

The public polynomial class delegates here lazily so adding substantial exact
algorithms does not enlarge the arithmetic bootstrap. Exact Node polynomials
remain sealed generated FLINT resources, word-prime polynomials cross one
packed boundary, and portable hosts use the storage-neutral ordinary source.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime

_structural_calculus_cache = runtime.undefined
_structural_flint_cache = runtime.undefined
_flint_ffi_cache = runtime.undefined
_generated_resources_cache = runtime.undefined


def _polynomial_kind(base: Any) -> str:
    if base is sage.ZZ:
        return "ZZ"
    if base is sage.QQ:
        return "QQ"
    if getattr(base, "_kind", None) == "GF":
        return "GF"
    return "legacy"


def _polynomial_structural_calculus_module() -> Any:
    global _structural_calculus_cache
    if _structural_calculus_cache is runtime.undefined:
        _structural_calculus_cache = __import__(
            "sagejs.polynomial_algorithms.structural_calculus",
            fromlist=["structural_calculus"],
        )
    return _structural_calculus_cache


def _polynomial_structural_flint_module() -> Any:
    global _structural_flint_cache
    if _structural_flint_cache is runtime.undefined:
        _structural_flint_cache = __import__(
            "sagejs.kernels.polynomial.structural_flint",
            fromlist=["structural_flint"],
        )
    return _structural_flint_cache


def _flint_ffi_module() -> Any:
    global _flint_ffi_cache
    if _flint_ffi_cache is runtime.undefined:
        _flint_ffi_cache = __import__("sagejs.ffi.flint", fromlist=["flint"])
    return _flint_ffi_cache


def _generated_flint_resources_available() -> bool:
    global _generated_resources_cache
    if _generated_resources_cache is runtime.undefined:
        process = runtime.reflect.get(runtime.global_object, "process")
        versions = (
            runtime.undefined
            if process is runtime.undefined
            else runtime.reflect.get(process, "versions")
        )
        node = (
            runtime.undefined
            if versions is runtime.undefined
            else runtime.reflect.get(versions, "node")
        )
        _generated_resources_cache = node is not runtime.undefined
    return bool(_generated_resources_cache)


def _trim_uint64_buffer(source: Any) -> Any:
    length = len(source)
    while length > 0 and source[length - 1] == 0:
        length -= 1
    if length == len(source):
        return source
    return runtime.uint64_buffer_prefix(source, length)


def compose(
    self: Any,
    inner: Any,
) -> Any:
    """Compose two polynomials without crossing the boundary per coefficient."""
    base = self._parent.base_ring()
    kind = _polynomial_kind(base)
    if kind == "ZZ" and self._has_fmpz_polynomial_resource():
        if inner._has_fmpz_polynomial_resource():
            kernel = _polynomial_structural_flint_module()
            return self._parent._from_fmpz_polynomial_resource(
                kernel.flint_integer_polynomial_compose(
                    self._exact_polynomial_resource(),
                    inner._exact_polynomial_resource(),
                )
            )
    if kind == "QQ" and self._has_fmpq_polynomial_resource():
        if inner._has_fmpq_polynomial_resource():
            kernel = _polynomial_structural_flint_module()
            return self._parent._from_fmpq_polynomial_resource(
                kernel.flint_rational_polynomial_compose(
                    self._exact_polynomial_resource(),
                    inner._exact_polynomial_resource(),
                )
            )
    if kind == "GF" and _generated_flint_resources_available():
        outer_length = self._coefficient_length()
        inner_length = inner._coefficient_length()
        if outer_length == 0:
            output_length = 0
        elif outer_length == 1 or inner_length <= 1:
            output_length = 1
        else:
            output_length = (outer_length - 1) * (inner_length - 1) + 1
        output = runtime.uint64_buffer(output_length)
        valid = _polynomial_structural_flint_module().flint_prime_polynomial_compose(
            output,
            self._storage,
            inner._storage,
            output_length,
            outer_length,
            inner_length,
            base._modulus,
        )
        if not valid:
            raise RuntimeError("packed prime-field polynomial composition failed")
        return self._new(_trim_uint64_buffer(output))
    structural = _polynomial_structural_calculus_module()
    return self._parent._from_coefficients(
        structural.dense_compose(
            self.coefficients(),
            inner.coefficients(),
            base(0),
        )
    )


def reverse(self: Any, degree: Any = None) -> Any:
    """Reverse coefficients after optional truncation or zero padding."""
    length = self._coefficient_length()
    requested_degree = None
    if degree is None:
        reverse_length = length
    else:
        if not runtime.is_exact_integer(degree):
            raise ValueError(
                "degree argument must be a nonnegative integer, got " + str(degree)
            )
        exact_degree = runtime.integer_bigint(degree)
        if exact_degree < 0:
            raise ValueError(
                "degree argument must be a nonnegative integer, got " + str(degree)
            )
        if exact_degree >= runtime.integer_bigint(runtime.number.MAX_SAFE_INTEGER):
            raise OverflowError("polynomial reverse degree is too large")
        requested_degree = runtime.number(exact_degree)
        reverse_length = requested_degree + 1
    base = self._parent.base_ring()
    kind = _polynomial_kind(base)
    if kind == "ZZ" and self._has_fmpz_polynomial_resource():
        kernel = _polynomial_structural_flint_module()
        return self._parent._from_fmpz_polynomial_resource(
            kernel.flint_integer_polynomial_reverse(
                self._exact_polynomial_resource(), reverse_length
            )
        )
    if kind == "QQ" and self._has_fmpq_polynomial_resource():
        kernel = _polynomial_structural_flint_module()
        return self._parent._from_fmpq_polynomial_resource(
            kernel.flint_rational_polynomial_reverse(
                self._exact_polynomial_resource(), reverse_length
            )
        )
    if kind == "GF" and _generated_flint_resources_available():
        kernel = _polynomial_structural_flint_module()
        output = runtime.uint64_buffer(reverse_length)
        valid = kernel.flint_prime_polynomial_reverse(
            output,
            self._storage,
            reverse_length,
            length,
            reverse_length,
            base._modulus,
        )
        if not valid:
            raise RuntimeError("packed prime-field polynomial reverse failed")
        return self._new(_trim_uint64_buffer(output))
    return self._parent._from_coefficients(
        _polynomial_structural_calculus_module().dense_reverse(
            self.coefficients(), base(0), requested_degree
        )
    )


def shift(self: Any, amount: Any) -> Any:
    """Multiply by a power of the generator, discarding negative exponents."""
    if not runtime.is_exact_integer(amount):
        raise TypeError("polynomial shift amount must be an integer")
    exact_amount = runtime.integer_bigint(amount)
    if abs(exact_amount) >= runtime.integer_bigint(runtime.number.MAX_SAFE_INTEGER):
        raise OverflowError("polynomial shift amount is too large")
    shift_amount = runtime.number(exact_amount)
    if shift_amount == 0 or self.is_zero():
        return self
    source_length = self._coefficient_length()
    left = shift_amount > 0
    magnitude = abs(shift_amount)
    output_length = (
        source_length + magnitude if left else max(0, source_length - magnitude)
    )
    base = self._parent.base_ring()
    kind = _polynomial_kind(base)
    if kind == "ZZ" and self._has_fmpz_polynomial_resource():
        kernel = _polynomial_structural_flint_module()
        resource = (
            kernel.flint_integer_polynomial_shift_left(
                self._exact_polynomial_resource(), magnitude
            )
            if left
            else kernel.flint_integer_polynomial_shift_right(
                self._exact_polynomial_resource(), magnitude
            )
        )
        return self._parent._from_fmpz_polynomial_resource(resource)
    if kind == "QQ" and self._has_fmpq_polynomial_resource():
        kernel = _polynomial_structural_flint_module()
        resource = (
            kernel.flint_rational_polynomial_shift_left(
                self._exact_polynomial_resource(), magnitude
            )
            if left
            else kernel.flint_rational_polynomial_shift_right(
                self._exact_polynomial_resource(), magnitude
            )
        )
        return self._parent._from_fmpq_polynomial_resource(resource)
    if kind == "GF" and _generated_flint_resources_available():
        kernel = _polynomial_structural_flint_module()
        output = runtime.uint64_buffer(output_length)
        operation = (
            kernel.flint_prime_polynomial_shift_left
            if left
            else kernel.flint_prime_polynomial_shift_right
        )
        valid = operation(
            output,
            self._storage,
            output_length,
            source_length,
            magnitude,
            base._modulus,
        )
        if not valid:
            raise RuntimeError("packed prime-field polynomial shift failed")
        return self._new(_trim_uint64_buffer(output))
    return self._parent._from_coefficients(
        _polynomial_structural_calculus_module().dense_shift(
            self.coefficients(), base(0), shift_amount
        )
    )


def left_shift(self: Any, amount: Any) -> Any:
    return self.shift(amount)


def right_shift(self: Any, amount: Any) -> Any:
    if not runtime.is_exact_integer(amount):
        raise TypeError("polynomial shift amount must be an integer")
    return self.shift(-runtime.integer_bigint(amount))


def truncate(self: Any, precision: Any) -> Any:
    """Return the polynomial modulo the requested power of the generator."""
    if not runtime.is_exact_integer(precision):
        raise TypeError("polynomial truncation precision must be an integer")
    exact_precision = runtime.integer_bigint(precision)
    if exact_precision < 0:
        coefficients = _polynomial_structural_calculus_module().dense_truncate(
            self.coefficients(),
            self._parent.base_ring()(0),
            runtime.number(exact_precision),
        )
        return self._parent._from_coefficients(coefficients)
    if exact_precision >= runtime.integer_bigint(runtime.number.MAX_SAFE_INTEGER):
        return self
    stop = min(runtime.number(exact_precision), self._coefficient_length())
    base = self._parent.base_ring()
    kind = _polynomial_kind(base)
    if kind == "ZZ" and self._has_fmpz_polynomial_resource():
        kernel = _polynomial_structural_flint_module()
        return self._parent._from_fmpz_polynomial_resource(
            kernel.flint_integer_polynomial_truncate(
                self._exact_polynomial_resource(), stop
            )
        )
    if kind == "QQ" and self._has_fmpq_polynomial_resource():
        kernel = _polynomial_structural_flint_module()
        return self._parent._from_fmpq_polynomial_resource(
            kernel.flint_rational_polynomial_truncate(
                self._exact_polynomial_resource(), stop
            )
        )
    if kind == "GF" and _generated_flint_resources_available():
        kernel = _polynomial_structural_flint_module()
        output = runtime.uint64_buffer(stop)
        valid = kernel.flint_prime_polynomial_truncate(
            output,
            self._storage,
            stop,
            self._coefficient_length(),
            stop,
            base._modulus,
        )
        if not valid:
            raise RuntimeError("packed prime-field polynomial truncation failed")
        return self._new(_trim_uint64_buffer(output))
    return self._parent._from_coefficients(self.coefficients()[:stop])


def integral(self: Any, variable: Any = None) -> Any:
    """Return the zero-constant formal antiderivative."""
    if variable is not None and not (
        hasattr(variable, "_parent")
        and variable._parent is self._parent
        and variable == self._parent.gen()
    ):
        raise ValueError("polynomial integration variable is not a generator")
    base = self._parent.base_ring()
    kind = _polynomial_kind(base)
    if kind == "ZZ" and self._has_fmpz_polynomial_resource():
        kernel = _polynomial_structural_flint_module()
        parent = sage.PolynomialRing(sage.QQ, self._parent.variable_name())
        return parent._from_fmpq_polynomial_resource(
            kernel.flint_integer_polynomial_integral(self._exact_polynomial_resource())
        )
    if kind == "QQ" and self._has_fmpq_polynomial_resource():
        kernel = _polynomial_structural_flint_module()
        return self._parent._from_fmpq_polynomial_resource(
            kernel.flint_rational_polynomial_integral(self._exact_polynomial_resource())
        )
    source_length = self._coefficient_length()
    if (
        kind == "GF"
        and _generated_flint_resources_available()
        and runtime.integer_bigint(source_length) < base._modulus
    ):
        kernel = _polynomial_structural_flint_module()
        output = runtime.uint64_buffer(source_length + 1)
        valid = kernel.flint_prime_polynomial_integral(
            output,
            self._storage,
            source_length + 1,
            source_length,
            base._modulus,
        )
        if not valid:
            raise RuntimeError("packed prime-field polynomial integral failed")
        return self._new(_trim_uint64_buffer(output))
    structural = _polynomial_structural_calculus_module()
    if kind == "ZZ":
        parent = sage.PolynomialRing(sage.QQ, self._parent.variable_name())
        output_base = sage.QQ
        coefficients = [output_base(value) for value in self.coefficients()]
    else:
        parent = self._parent
        output_base = base
        coefficients = self.coefficients()

    def divide_by_integer(coefficient: Any, denominator: int) -> Any:
        return coefficient / output_base(denominator)

    return parent._from_coefficients(
        structural.dense_integral(
            coefficients,
            output_base(0),
            divide_by_integer,
        )
    )


def resultant(self: Any, other: object) -> Any:
    """Return the resultant with another polynomial over the common parent."""
    operands = runtime.coercion_model.coercePair(self, other)
    if not hasattr(operands.left, "_coefficient_length"):
        raise TypeError("polynomial resultant requires polynomials")
    left = operands.left
    right = operands.right
    base = operands.parent.base_ring()
    kind = _polynomial_kind(base)
    if kind == "ZZ" and left._has_fmpz_polynomial_resource():
        if right._has_fmpz_polynomial_resource():
            kernel = _polynomial_structural_flint_module()
            return base(
                kernel.flint_integer_polynomial_resultant(
                    left._exact_polynomial_resource(),
                    right._exact_polynomial_resource(),
                )
            )
    if kind == "QQ" and left._has_fmpq_polynomial_resource():
        if right._has_fmpq_polynomial_resource():
            kernel = _polynomial_structural_flint_module()
            value = kernel.flint_rational_polynomial_resultant(
                left._exact_polynomial_resource(),
                right._exact_polynomial_resource(),
            )
            ffi = _flint_ffi_module()
            try:
                return base(
                    ffi.fmpq_value_numerator(value),
                    ffi.fmpq_value_denominator(value),
                )
            finally:
                value.close()
    if kind == "GF" and _generated_flint_resources_available():
        kernel = _polynomial_structural_flint_module()
        output = runtime.uint64_buffer(1)
        valid = kernel.flint_prime_polynomial_resultant(
            output,
            left._storage,
            right._storage,
            1,
            left._coefficient_length(),
            right._coefficient_length(),
            base._modulus,
        )
        if not valid:
            raise RuntimeError("packed prime-field polynomial resultant failed")
        return base(output[0])
    structural = _polynomial_structural_calculus_module()

    def exact_quotient(numerator: Any, denominator: Any) -> Any:
        if kind == "ZZ":
            return numerator // denominator
        return numerator / denominator

    return base(
        structural.dense_resultant(
            left.coefficients(),
            right.coefficients(),
            base(0),
            base(1),
            exact_quotient,
        )
    )


def discriminant(self: Any) -> Any:
    """Return the discriminant as an element of the coefficient ring."""
    base = self._parent.base_ring()
    kind = _polynomial_kind(base)
    if kind == "ZZ" and self._has_fmpz_polynomial_resource():
        kernel = _polynomial_structural_flint_module()
        return base(
            kernel.flint_integer_polynomial_discriminant(
                self._exact_polynomial_resource()
            )
        )
    if kind == "QQ" and self._has_fmpq_polynomial_resource():
        kernel = _polynomial_structural_flint_module()
        value = kernel.flint_rational_polynomial_discriminant(
            self._exact_polynomial_resource()
        )
        ffi = _flint_ffi_module()
        try:
            return base(
                ffi.fmpq_value_numerator(value),
                ffi.fmpq_value_denominator(value),
            )
        finally:
            value.close()
    if kind == "GF" and _generated_flint_resources_available():
        kernel = _polynomial_structural_flint_module()
        output = runtime.uint64_buffer(1)
        valid = kernel.flint_prime_polynomial_discriminant(
            output,
            self._storage,
            1,
            self._coefficient_length(),
            base._modulus,
        )
        if not valid:
            raise RuntimeError("packed prime-field polynomial discriminant failed")
        return base(output[0])
    structural = _polynomial_structural_calculus_module()

    def exact_quotient(numerator: Any, denominator: Any) -> Any:
        if kind == "ZZ":
            return numerator // denominator
        return numerator / denominator

    return base(
        structural.dense_discriminant(
            self.coefficients(),
            base(0),
            base(1),
            exact_quotient,
        )
    )

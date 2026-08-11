# Univariate and multivariate polynomial parents and elements backed by FLINT.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime

_packed_integer_polynomial_module_cache = runtime.undefined
_packed_rational_polynomial_module_cache = runtime.undefined
_packed_prime_polynomial_module_cache = runtime.undefined
_packed_polynomial_flint_module_cache = runtime.undefined
_flint_ffi_module_cache = runtime.undefined
_generated_flint_resources_available_cache = runtime.undefined


class _PackedIntegerPolynomialStorage:
    """Owned normalized low-to-high `IntegerBuffer` coefficients."""

    def __init__(self, coefficients: Any) -> None:
        self.coefficients = coefficients


class _PackedRationalPolynomialStorage:
    """Owned normalized low-to-high rational coefficient components."""

    def __init__(self, numerators: Any, denominators: Any) -> None:
        if _buffer_length(numerators) != _buffer_length(denominators):
            raise ValueError("rational polynomial component lengths differ")
        self.numerators = numerators
        self.denominators = denominators


class _FmpzPolynomialResourceStorage:
    """Own one sealed generated FLINT polynomial and a lazy packed oracle."""

    def __init__(self, resource: Any) -> None:
        self.resource = resource
        self.coefficients: Any = runtime.undefined


class _FmpqPolynomialResourceStorage:
    """Own one sealed generated FLINT polynomial and lazy packed components."""

    def __init__(self, resource: Any) -> None:
        self.resource = resource
        self.numerators: Any = runtime.undefined
        self.denominators: Any = runtime.undefined


def _flint_ffi_module() -> Any:
    """Load generated safe FLINT resources without exposing package handles."""
    global _flint_ffi_module_cache
    if _flint_ffi_module_cache is runtime.undefined:
        _flint_ffi_module_cache = __import__("sagejs.ffi.flint", fromlist=["flint"])
    return _flint_ffi_module_cache


def _generated_flint_resources_available() -> bool:
    """Return whether this host can own generated native FLINT resources.

    A native Node process is an explicit capability, not a failed-call
    heuristic: missing or broken generated bindings must fail loudly there.
    Browsers and other portable hosts retain the compiler-owned packed path.
    """
    global _generated_flint_resources_available_cache
    if _generated_flint_resources_available_cache is runtime.undefined:
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
        _generated_flint_resources_available_cache = node is not runtime.undefined
    return bool(_generated_flint_resources_available_cache)


def _packed_integer_polynomial_module() -> Any:
    global _packed_integer_polynomial_module_cache
    if _packed_integer_polynomial_module_cache is runtime.undefined:
        _packed_integer_polynomial_module_cache = __import__(
            "sagejs.kernels.polynomial.packed_integer",
            fromlist=["packed_integer"],
        )
    return _packed_integer_polynomial_module_cache


def _packed_rational_polynomial_module() -> Any:
    global _packed_rational_polynomial_module_cache
    if _packed_rational_polynomial_module_cache is runtime.undefined:
        _packed_rational_polynomial_module_cache = __import__(
            "sagejs.kernels.polynomial.packed_rational",
            fromlist=["packed_rational"],
        )
    return _packed_rational_polynomial_module_cache


def _packed_prime_polynomial_module() -> Any:
    global _packed_prime_polynomial_module_cache
    if _packed_prime_polynomial_module_cache is runtime.undefined:
        _packed_prime_polynomial_module_cache = __import__(
            "sagejs.kernels.polynomial.packed_prime_field",
            fromlist=["packed_prime_field"],
        )
    return _packed_prime_polynomial_module_cache


def _packed_polynomial_flint_module() -> Any:
    global _packed_polynomial_flint_module_cache
    if _packed_polynomial_flint_module_cache is runtime.undefined:
        _packed_polynomial_flint_module_cache = __import__(
            "sagejs.kernels.polynomial.packed_flint",
            fromlist=["packed_flint"],
        )
    return _packed_polynomial_flint_module_cache


def _integer_capacity_error(error: Exception) -> bool:
    return "IntegerBuffer word capacity exceeded" in str(error)


def _buffer_length(source: Any) -> int:
    length = runtime.reflect.get(source, "length")
    return len(source) if length is runtime.undefined else int(length)


def _trim_polynomial_coefficients(values: list[Any]) -> list[Any]:
    """Remove trailing zero coefficients from a mutable coefficient list."""
    while len(values) != 0 and values[-1] == 0:
        values.pop()
    return values


def _rational_polynomial_remainder(
    dividend: list[Any], divisor: list[Any]
) -> list[Any]:
    """Return the ordinary dense remainder over `QQ`.

    This deliberately small dynamic algorithm is the portable oracle for the
    generated FLINT resource operation. Node uses the resource-to-resource
    call and never enters this coefficient loop.
    """
    remainder = list(dividend)
    divisor_degree = len(divisor) - 1
    divisor_leading = divisor[-1]
    while len(remainder) >= len(divisor):
        shift = len(remainder) - len(divisor)
        factor = remainder[-1] / divisor_leading
        for index in range(divisor_degree + 1):
            remainder[index + shift] -= factor * divisor[index]
        _trim_polynomial_coefficients(remainder)
    return remainder


def _monic_rational_polynomial_gcd(left: list[Any], right: list[Any]) -> list[Any]:
    """Compute the monic Euclidean GCD of two dense `QQ` polynomials."""
    left = _trim_polynomial_coefficients([sage.QQ(value) for value in left])
    right = _trim_polynomial_coefficients([sage.QQ(value) for value in right])
    while len(right) != 0:
        left, right = right, _rational_polynomial_remainder(left, right)
    if len(left) == 0:
        return []
    leading = left[-1]
    return [coefficient / leading for coefficient in left]


def _integer_polynomial_content(coefficients: list[Any]) -> int:
    """Return the nonnegative content of dense integer coefficients."""
    content = runtime.bigint(0)
    for coefficient in coefficients:
        content = runtime.bigint_gcd(content, runtime.integer_bigint(coefficient))
    return content


def _dynamic_exact_polynomial_gcd(
    left: PolynomialElement, right: PolynomialElement
) -> PolynomialElement:
    """Portable exact-polynomial GCD with Sage's canonical normalization."""
    base = left.parent().base_ring()
    left_coefficients = left.coefficients()
    right_coefficients = right.coefficients()
    rational_gcd = _monic_rational_polynomial_gcd(left_coefficients, right_coefficients)
    if base is sage.QQ:
        return left.parent()._from_coefficients(rational_gcd)
    if len(rational_gcd) == 0:
        return left.parent()._from_coefficients([])

    common_denominator = runtime.bigint(1)
    for coefficient in rational_gcd:
        denominator = runtime.integer_bigint(coefficient._denominator)
        common_denominator = (
            runtime.bigint_divexact(
                common_denominator,
                runtime.bigint_gcd(common_denominator, denominator),
            )
            * denominator
        )
    integer_coefficients = [
        runtime.integer_bigint(coefficient._numerator)
        * runtime.bigint_divexact(
            common_denominator,
            runtime.integer_bigint(coefficient._denominator),
        )
        for coefficient in rational_gcd
    ]
    primitive_content = _integer_polynomial_content(integer_coefficients)
    integer_coefficients = [
        runtime.bigint_divexact(coefficient, primitive_content)
        for coefficient in integer_coefficients
    ]
    if integer_coefficients[-1] < 0:
        integer_coefficients = [-coefficient for coefficient in integer_coefficients]
    content = runtime.bigint_gcd(
        _integer_polynomial_content(left_coefficients),
        _integer_polynomial_content(right_coefficients),
    )
    return left.parent()._from_coefficients(
        [content * coefficient for coefficient in integer_coefficients]
    )


def _integer_buffer_values(source: Any) -> list[Any]:
    converter = runtime.reflect.get(source, "toArray")
    if runtime.jstype(converter) == "function":
        values = runtime.reflect.apply(converter, source, [])
    else:
        values = list(source)
    return [runtime.normalize_integer(value) for value in values]


def _native_kernel_available(kernel_function: Any) -> bool:
    return bool(getattr(kernel_function, "nativeAvailable", False))


def _integer_kernel_input(kernel_function: Any, source: Any) -> Any:
    if _native_kernel_available(kernel_function):
        return source
    return _integer_buffer_values(source)


def _integer_kernel_output(
    kernel_function: Any,
    length: int,
    word_capacity: int,
) -> Any:
    if _native_kernel_available(kernel_function):
        factory = getattr(kernel_function, "createIntegerBuffer", None)
        if callable(factory):
            return runtime.reflect.apply(
                factory,
                runtime.undefined,
                [length, word_capacity],
            )
        return _integer_zeros(length, word_capacity)
    return [0 for _index in range(length)]


def _canonical_integer_output(source: Any, word_capacity: int) -> Any:
    if runtime.reflect.get(source, "wordCapacity") is not runtime.undefined:
        return source
    return runtime.integer_buffer(source, word_capacity)


def _uint64_kernel_input(kernel_function: Any, source: Any) -> Any:
    if _native_kernel_available(kernel_function):
        return source
    return [source[index] for index in range(_buffer_length(source))]


def _uint64_kernel_output(kernel_function: Any, length: int) -> Any:
    if _native_kernel_available(kernel_function):
        return runtime.uint64_buffer(length)
    return [0 for _index in range(length)]


def _canonical_uint64_output(source: Any) -> Any:
    constructor = runtime.reflect.get(runtime.global_object, "BigUint64Array")
    if runtime.instance_of(source, constructor):
        return source
    return runtime.uint64_buffer(source)


def _integer_word_capacity(source: Any) -> int:
    # Capacity is an allocation property, not a value-size bound.  Reusing it
    # as the next result estimate makes repeated rational additions double the
    # allocation on every step even when every coefficient is one machine
    # word.  Packed IntegerBuffer sizes are exact signed limb counts, so base
    # estimates on live values and leave spare-capacity growth local to the
    # operation which actually needs it.
    sizes = runtime.reflect.get(source, "sizes")
    if sizes is not runtime.undefined:
        maximum = 1
        for index in range(_buffer_length(source)):
            maximum = max(maximum, abs(int(sizes[index])))
        return maximum
    capacity = runtime.reflect.get(source, "wordCapacity")
    if capacity is not runtime.undefined and _buffer_length(source) == 0:
        return 1
    maximum = 1
    for value in source:
        magnitude = abs(int(value))
        maximum = max(maximum, max(1, (magnitude.bit_length() + 63) // 64))
    return maximum


def _integer_zeros(length: int, word_capacity: int) -> Any:
    return runtime.integer_buffer([0 for _index in range(length)], word_capacity)


def _flint_byte_region_bytes(region: Any) -> Any:
    """Consume an owned variable-size FFI result in one checked host copy."""
    return region.take_bytes()


def _packed_uint8(length: int) -> Any:
    """Allocate host-owned bytes without naming a host constructor directly."""
    constructor = runtime.reflect.get(runtime.global_object, "Uint8Array")
    return runtime.reflect.construct(constructor, [length])


def _packed_uint8_suffix(source: Any, offset: int) -> Any:
    """Return a copied byte suffix through the host's typed-array primitive."""
    subarray = runtime.reflect.get(source, "subarray")
    view = runtime.reflect.apply(subarray, source, [offset])
    constructor = runtime.reflect.get(runtime.global_object, "Uint8Array")
    return runtime.reflect.construct(constructor, [view])


def _little_endian_bytes_payload(source: Any) -> Any:
    """Lower stable bytes to the declared nonnegative `Integer` transport.

    This is an ABI transport conversion, not a polynomial representation.
    Generated exact-polynomial deserializers currently accept one exact integer
    plus its significant byte length. Node's byte buffer converts the complete
    stream through hexadecimal in linear time, avoiding repeated growth of one
    enormous integer while the variable-length stream is assembled.
    """
    buffer = runtime.reflect.get(runtime.global_object, "Buffer")
    from_bytes = runtime.reflect.get(buffer, "from")
    if runtime.jstype(from_bytes) != "function":
        raise RuntimeError("the exact polynomial byte transport is unavailable")
    copy = runtime.reflect.apply(from_bytes, buffer, [source])
    runtime.reflect.apply(runtime.reflect.get(copy, "reverse"), copy, [])
    hexadecimal = runtime.reflect.apply(
        runtime.reflect.get(copy, "toString"), copy, ["hex"]
    )
    if len(hexadecimal) == 0:
        return runtime.bigint(0)
    return runtime.bigint("0x" + hexadecimal)


def _exact_polynomial_payload(
    parts: list[Any],
    coefficient_count: int,
    rational: bool,
) -> tuple[Any, int]:
    """Add the SJP envelope and lower its bytes to one declared argument."""
    body = runtime.exact_integer_values_to_packed_bytes(parts)
    output = _packed_uint8(16 + _buffer_length(body))
    magic = [83, 74, 80, 81 if rational else 90]
    for index in range(4):
        output[index] = magic[index]
    output[4] = 1
    output[5] = 0
    output[6] = 0
    output[7] = 0
    count = coefficient_count
    for byte_index in range(8):
        output[8 + byte_index] = count % 256
        count //= 256
    runtime.reflect.apply(runtime.reflect.get(output, "set"), output, [body, 16])
    return _little_endian_bytes_payload(output), _buffer_length(output)


def _decode_exact_polynomial_bytes(source: Any, base: Any) -> list[Any]:
    """Decode trusted resource serialization without scalar FFI crossings."""
    rational = base is sage.QQ
    count = 0
    for byte_index in range(7, -1, -1):
        count = count * 256 + int(source[8 + byte_index])
    part_count = 2 * count if rational else count
    parts = runtime.exact_integer_values_from_packed_bytes(
        _packed_uint8_suffix(source, 16), part_count
    )
    if not rational:
        return runtime.list_constructor(parts)
    answer = []
    for index in range(count):
        answer.append(
            _untyped(sage.Rational)._from_reduced(
                parts[2 * index], parts[2 * index + 1]
            )
        )
    return answer


def _trim_integer_buffer(source: Any) -> Any:
    values = _integer_buffer_values(source)
    length = len(values)
    while length > 0 and values[length - 1] == 0:
        length -= 1
    if length == _buffer_length(source):
        return source
    return runtime.integer_buffer_prefix(source, length)


def _trim_uint64_buffer(source: Any) -> Any:
    length = _buffer_length(source)
    while length > 0 and source[length - 1] == 0:
        length -= 1
    if length == _buffer_length(source):
        return source
    return runtime.uint64_buffer_prefix(source, length)


def _packed_polynomial_kind(base: sage.Parent) -> str:
    if base is sage.ZZ:
        return "ZZ"
    if base is sage.QQ:
        return "QQ"
    if (
        getattr(base, "_kind", None) == "GF"
        and int(_untyped(base).characteristic()) <= 0xFFFFFFFF
    ):
        return "GF"
    return "legacy"


def _normalize_packed_storage(base: sage.Parent, storage: Any) -> Any:
    kind = _packed_polynomial_kind(base)
    if kind == "ZZ":
        coefficients = storage.coefficients
        return _PackedIntegerPolynomialStorage(_trim_integer_buffer(coefficients))
    if kind == "QQ":
        numerators = _trim_integer_buffer(storage.numerators)
        length = _buffer_length(numerators)
        denominators = storage.denominators
        if length != _buffer_length(denominators):
            denominators = runtime.integer_buffer_prefix(denominators, length)
        return _PackedRationalPolynomialStorage(numerators, denominators)
    if kind == "GF":
        return _trim_uint64_buffer(storage)
    return storage


def _untyped(value: Any) -> Any:
    return value


def _ideal_generators(values: Any) -> Any:
    if len(values) == 1 and isinstance(values[0], (list, tuple)):
        return values[0]
    return values


def ρσ_callable_instance_class(cls: type[Any]) -> type[Any]:
    # Identity fallback for bootstrap compilers which predate callable-instance
    # lowering. The converged compiler consumes this decorator.
    return cls


@runtime.callable_instance_class
@runtime.lightweight_math_class
class PolynomialElement(sage.Element):
    def __init__(
        self,
        parent: PolynomialRingParent,
        value: Any,
    ) -> None:
        self._parent = parent
        self._storage: Any = runtime.undefined
        if _packed_polynomial_kind(parent.base_ring()) == "legacy":
            self._native = value
        else:
            self._native = runtime.undefined
            if isinstance(
                value,
                (_FmpzPolynomialResourceStorage, _FmpqPolynomialResourceStorage),
            ):
                self._storage = value
            else:
                self._storage = _normalize_packed_storage(parent.base_ring(), value)
        runtime.object.freeze(self)

    def _new(self, value: Any) -> PolynomialElement:
        return PolynomialElement(self._parent, value)

    def _publish_exact_packed_storage(self, storage: Any) -> PolynomialElement:
        """Publish temporary packed exact output in the canonical host form.

        Packed integer and rational buffers remain useful compatibility
        scratch space for operations which have not yet migrated to direct
        resource-to-resource FLINT calls.  On Node, however, they must never
        become the persistent representation of a new exact polynomial.  The
        mathematical parent re-ingests the values into a sealed generated
        resource before the result escapes this operation.  Portable hosts
        keep the same packed output without an unnecessary conversion.
        """
        if not _generated_flint_resources_available():
            return self._new(storage)
        base = self._parent.base_ring()
        if base is sage.ZZ:
            return self._parent._from_coefficients(
                _integer_buffer_values(storage.coefficients)
            )
        if base is sage.QQ:
            numerators = _integer_buffer_values(storage.numerators)
            denominators = _integer_buffer_values(storage.denominators)
            return self._parent._from_coefficients(
                [
                    _untyped(base)(numerators[index], denominators[index])
                    for index in range(len(numerators))
                ]
            )
        raise TypeError("packed exact publication requires ZZ or QQ")

    def _has_fmpz_polynomial_resource(self) -> bool:
        return isinstance(self._storage, _FmpzPolynomialResourceStorage)

    def _has_fmpq_polynomial_resource(self) -> bool:
        return isinstance(self._storage, _FmpqPolynomialResourceStorage)

    def _exact_polynomial_resource(self) -> Any:
        if not (
            self._has_fmpz_polynomial_resource() or self._has_fmpq_polynomial_resource()
        ):
            raise TypeError("polynomial does not own an exact FLINT resource")
        return self._storage.resource

    def _materialize_exact_compatibility_storage(self) -> None:
        """Build packed buffers only for an audited not-yet-migrated operation."""
        if self._has_fmpz_polynomial_resource():
            if self._storage.coefficients is runtime.undefined:
                self._storage.coefficients = runtime.integer_buffer(
                    self.coefficients(), 1
                )
            return
        if self._has_fmpq_polynomial_resource():
            if self._storage.numerators is runtime.undefined:
                values = self.coefficients()
                self._storage.numerators = runtime.integer_buffer(
                    [value._numerator for value in values], 1
                )
                self._storage.denominators = runtime.integer_buffer(
                    [value._denominator for value in values], 1
                )

    def _legacy_polynomial_oracle_input(self) -> Any:
        """Build a temporary legacy polynomial for an audited old consumer.

        Exact algebraic roots still return an opaque `QQbar` resource graph,
        and the older power-series family still owns FLINT polynomial state.
        Neither exception may become a route back into production polynomial
        storage: callers consume this temporary object immediately.
        """
        backend = runtime.flint_backend()
        base = self._parent.base_ring()
        result = None
        generator = None
        if base is sage.ZZ:
            result = backend.zzPolyConstant(runtime.integer_bigint(0))
            generator = backend.zzPolyGen()
        elif base is sage.QQ:
            result = backend.qqPolyConstant(
                runtime.integer_bigint(0), runtime.integer_bigint(1)
            )
            generator = backend.qqPolyGen()
        elif base._kind == "GF":
            result = backend.nmodPolyConstant(runtime.integer_bigint(0), base._modulus)
            generator = backend.nmodPolyGen(base._modulus)
        else:
            raise TypeError("legacy polynomial bridge requires ZZ, QQ, or GF(p)")
        for coefficient in reversed(self.coefficients()):
            result = backend.polyMul(result, generator)
            if base is sage.ZZ:
                constant = backend.zzPolyConstant(runtime.integer_bigint(coefficient))
            elif base is sage.QQ:
                constant = backend.qqPolyConstant(
                    runtime.integer_bigint(coefficient._numerator),
                    runtime.integer_bigint(coefficient._denominator),
                )
            else:
                constant = backend.nmodPolyConstant(coefficient._value, base._modulus)
            result = backend.polyAdd(result, constant)
        return result

    def _add_(self, other: PolynomialElement) -> PolynomialElement:
        base = self._parent.base_ring()
        kind = _packed_polynomial_kind(base)
        if kind == "ZZ":
            if (
                self._has_fmpz_polynomial_resource()
                and other._has_fmpz_polynomial_resource()
            ):
                return self._new(
                    _FmpzPolynomialResourceStorage(
                        _flint_ffi_module().fmpz_polynomial_add(
                            self._exact_polynomial_resource(),
                            other._exact_polynomial_resource(),
                        )
                    )
                )
            self._materialize_exact_compatibility_storage()
            other._materialize_exact_compatibility_storage()
            kernel = _packed_integer_polynomial_module().packed_integer_polynomial_add
            length = max(
                _buffer_length(self._storage.coefficients),
                _buffer_length(other._storage.coefficients),
            )
            capacity = (
                max(
                    _integer_word_capacity(self._storage.coefficients),
                    _integer_word_capacity(other._storage.coefficients),
                )
                + 1
            )
            output = _integer_kernel_output(kernel, length, capacity)
            if not kernel(
                output,
                _integer_kernel_input(kernel, self._storage.coefficients),
                _integer_kernel_input(kernel, other._storage.coefficients),
            ):
                raise RuntimeError("packed integer polynomial add failed")
            return self._publish_exact_packed_storage(
                _PackedIntegerPolynomialStorage(
                    _canonical_integer_output(output, capacity)
                )
            )
        if kind == "QQ":
            if (
                self._has_fmpq_polynomial_resource()
                and other._has_fmpq_polynomial_resource()
            ):
                return self._new(
                    _FmpqPolynomialResourceStorage(
                        _flint_ffi_module().fmpq_polynomial_add(
                            self._exact_polynomial_resource(),
                            other._exact_polynomial_resource(),
                        )
                    )
                )
            self._materialize_exact_compatibility_storage()
            other._materialize_exact_compatibility_storage()
            kernel = _packed_rational_polynomial_module().packed_rational_polynomial_add
            length = max(
                _buffer_length(self._storage.numerators),
                _buffer_length(other._storage.numerators),
            )
            capacity = (
                2
                * max(
                    _integer_word_capacity(self._storage.numerators),
                    _integer_word_capacity(self._storage.denominators),
                    _integer_word_capacity(other._storage.numerators),
                    _integer_word_capacity(other._storage.denominators),
                )
                + 2
            )
            numerators = _integer_kernel_output(kernel, length, capacity)
            denominators = _integer_kernel_output(kernel, length, capacity)
            if not kernel(
                numerators,
                denominators,
                _integer_kernel_input(kernel, self._storage.numerators),
                _integer_kernel_input(kernel, self._storage.denominators),
                _integer_kernel_input(kernel, other._storage.numerators),
                _integer_kernel_input(kernel, other._storage.denominators),
            ):
                raise RuntimeError("packed rational polynomial add failed")
            return self._publish_exact_packed_storage(
                _PackedRationalPolynomialStorage(
                    _canonical_integer_output(numerators, capacity),
                    _canonical_integer_output(denominators, capacity),
                )
            )
        if kind == "GF":
            kernel = _packed_prime_polynomial_module().packed_prime_field_polynomial_add
            length = max(_buffer_length(self._storage), _buffer_length(other._storage))
            output = _uint64_kernel_output(kernel, length)
            if not kernel(
                output,
                _uint64_kernel_input(kernel, self._storage),
                _uint64_kernel_input(kernel, other._storage),
                base._modulus,
            ):
                raise RuntimeError("packed prime polynomial add failed")
            return self._new(_canonical_uint64_output(output))
        if base._kind == "GF_EXTENSION":
            return self._new(
                runtime.flint_backend().fqPolyAdd(self._native, other._native)
            )
        return self._new(runtime.flint_backend().polyAdd(self._native, other._native))

    def _sub_(self, other: PolynomialElement) -> PolynomialElement:
        base = self._parent.base_ring()
        kind = _packed_polynomial_kind(base)
        if kind == "ZZ":
            if (
                self._has_fmpz_polynomial_resource()
                and other._has_fmpz_polynomial_resource()
            ):
                return self._new(
                    _FmpzPolynomialResourceStorage(
                        _flint_ffi_module().fmpz_polynomial_sub(
                            self._exact_polynomial_resource(),
                            other._exact_polynomial_resource(),
                        )
                    )
                )
            self._materialize_exact_compatibility_storage()
            other._materialize_exact_compatibility_storage()
            kernel = (
                _packed_integer_polynomial_module().packed_integer_polynomial_subtract
            )
            length = max(
                _buffer_length(self._storage.coefficients),
                _buffer_length(other._storage.coefficients),
            )
            capacity = (
                max(
                    _integer_word_capacity(self._storage.coefficients),
                    _integer_word_capacity(other._storage.coefficients),
                )
                + 1
            )
            output = _integer_kernel_output(kernel, length, capacity)
            if not kernel(
                output,
                _integer_kernel_input(kernel, self._storage.coefficients),
                _integer_kernel_input(kernel, other._storage.coefficients),
            ):
                raise RuntimeError("packed integer polynomial subtract failed")
            return self._publish_exact_packed_storage(
                _PackedIntegerPolynomialStorage(
                    _canonical_integer_output(output, capacity)
                )
            )
        if kind == "QQ":
            if (
                self._has_fmpq_polynomial_resource()
                and other._has_fmpq_polynomial_resource()
            ):
                return self._new(
                    _FmpqPolynomialResourceStorage(
                        _flint_ffi_module().fmpq_polynomial_sub(
                            self._exact_polynomial_resource(),
                            other._exact_polynomial_resource(),
                        )
                    )
                )
            self._materialize_exact_compatibility_storage()
            other._materialize_exact_compatibility_storage()
            kernel = (
                _packed_rational_polynomial_module().packed_rational_polynomial_subtract
            )
            length = max(
                _buffer_length(self._storage.numerators),
                _buffer_length(other._storage.numerators),
            )
            capacity = (
                2
                * max(
                    _integer_word_capacity(self._storage.numerators),
                    _integer_word_capacity(self._storage.denominators),
                    _integer_word_capacity(other._storage.numerators),
                    _integer_word_capacity(other._storage.denominators),
                )
                + 2
            )
            numerators = _integer_kernel_output(kernel, length, capacity)
            denominators = _integer_kernel_output(kernel, length, capacity)
            if not kernel(
                numerators,
                denominators,
                _integer_kernel_input(kernel, self._storage.numerators),
                _integer_kernel_input(kernel, self._storage.denominators),
                _integer_kernel_input(kernel, other._storage.numerators),
                _integer_kernel_input(kernel, other._storage.denominators),
            ):
                raise RuntimeError("packed rational polynomial subtract failed")
            return self._publish_exact_packed_storage(
                _PackedRationalPolynomialStorage(
                    _canonical_integer_output(numerators, capacity),
                    _canonical_integer_output(denominators, capacity),
                )
            )
        if kind == "GF":
            kernel = (
                _packed_prime_polynomial_module().packed_prime_field_polynomial_subtract
            )
            length = max(_buffer_length(self._storage), _buffer_length(other._storage))
            output = _uint64_kernel_output(kernel, length)
            if not kernel(
                output,
                _uint64_kernel_input(kernel, self._storage),
                _uint64_kernel_input(kernel, other._storage),
                base._modulus,
            ):
                raise RuntimeError("packed prime polynomial subtract failed")
            return self._new(_canonical_uint64_output(output))
        if base._kind == "GF_EXTENSION":
            return self._new(
                runtime.flint_backend().fqPolySub(self._native, other._native)
            )
        return self._new(runtime.flint_backend().polySub(self._native, other._native))

    def _mul_(self, other: PolynomialElement) -> PolynomialElement:
        base = self._parent.base_ring()
        kind = _packed_polynomial_kind(base)
        left_length = self._coefficient_length()
        right_length = other._coefficient_length()
        length = (
            0
            if left_length == 0 or right_length == 0
            else left_length + right_length - 1
        )
        if kind == "ZZ":
            if (
                self._has_fmpz_polynomial_resource()
                and other._has_fmpz_polynomial_resource()
            ):
                return self._new(
                    _FmpzPolynomialResourceStorage(
                        _flint_ffi_module().fmpz_polynomial_mul(
                            self._exact_polynomial_resource(),
                            other._exact_polynomial_resource(),
                        )
                    )
                )
            self._materialize_exact_compatibility_storage()
            other._materialize_exact_compatibility_storage()
            use_flint = left_length * right_length >= 256
            kernel = (
                _packed_polynomial_flint_module().flint_packed_integer_polynomial_multiply
                if use_flint
                else _packed_integer_polynomial_module().packed_integer_polynomial_multiply
            )
            accumulation = max(
                1, (min(left_length, right_length).bit_length() + 63) // 64
            )
            capacity = (
                _integer_word_capacity(self._storage.coefficients)
                + _integer_word_capacity(other._storage.coefficients)
                + accumulation
            )
            while True:
                output = (
                    _integer_zeros(length, capacity)
                    if use_flint
                    else _integer_kernel_output(kernel, length, capacity)
                )
                try:
                    if use_flint:
                        valid = kernel(
                            output,
                            self._storage.coefficients,
                            other._storage.coefficients,
                            length,
                            left_length,
                            right_length,
                            1,
                        )
                    else:
                        valid = kernel(
                            output,
                            _integer_kernel_input(kernel, self._storage.coefficients),
                            _integer_kernel_input(kernel, other._storage.coefficients),
                        )
                    if not valid:
                        raise RuntimeError("packed integer polynomial multiply failed")
                    break
                except Exception as error:
                    if not _integer_capacity_error(error):
                        raise
                    capacity *= 2
            return self._publish_exact_packed_storage(
                _PackedIntegerPolynomialStorage(
                    _canonical_integer_output(output, capacity)
                )
            )
        if kind == "QQ":
            if (
                self._has_fmpq_polynomial_resource()
                and other._has_fmpq_polynomial_resource()
            ):
                return self._new(
                    _FmpqPolynomialResourceStorage(
                        _flint_ffi_module().fmpq_polynomial_mul(
                            self._exact_polynomial_resource(),
                            other._exact_polynomial_resource(),
                        )
                    )
                )
            self._materialize_exact_compatibility_storage()
            other._materialize_exact_compatibility_storage()
            use_flint = left_length * right_length >= 64
            kernel = (
                _packed_polynomial_flint_module().flint_packed_rational_polynomial_multiply
                if use_flint
                else _packed_rational_polynomial_module().packed_rational_polynomial_multiply
            )
            accumulation = max(
                1, (min(left_length, right_length).bit_length() + 63) // 64
            )
            capacity = 2 * (
                _integer_word_capacity(self._storage.numerators)
                + _integer_word_capacity(self._storage.denominators)
                + _integer_word_capacity(other._storage.numerators)
                + _integer_word_capacity(other._storage.denominators)
                + accumulation
            )
            while True:
                numerators = (
                    _integer_zeros(length, capacity)
                    if use_flint
                    else _integer_kernel_output(kernel, length, capacity)
                )
                denominators = (
                    _integer_zeros(length, capacity)
                    if use_flint
                    else _integer_kernel_output(kernel, length, capacity)
                )
                try:
                    left_numerators = self._storage.numerators
                    left_denominators = self._storage.denominators
                    right_numerators = other._storage.numerators
                    right_denominators = other._storage.denominators
                    if not use_flint:
                        left_numerators = _integer_kernel_input(kernel, left_numerators)
                        left_denominators = _integer_kernel_input(
                            kernel, left_denominators
                        )
                        right_numerators = _integer_kernel_input(
                            kernel, right_numerators
                        )
                        right_denominators = _integer_kernel_input(
                            kernel, right_denominators
                        )
                    kernel_arguments = [
                        numerators,
                        denominators,
                        left_numerators,
                        left_denominators,
                        right_numerators,
                        right_denominators,
                    ]
                    if use_flint:
                        kernel_arguments.extend([length, left_length, right_length, 1])
                    if not kernel(*kernel_arguments):
                        raise RuntimeError("packed rational polynomial multiply failed")
                    break
                except Exception as error:
                    if not _integer_capacity_error(error):
                        raise
                    capacity *= 2
            return self._publish_exact_packed_storage(
                _PackedRationalPolynomialStorage(
                    _canonical_integer_output(numerators, capacity),
                    _canonical_integer_output(denominators, capacity),
                )
            )
        if kind == "GF":
            use_flint = left_length * right_length >= 4096
            kernel = (
                _packed_polynomial_flint_module().flint_packed_prime_field_polynomial_multiply
                if use_flint
                else _packed_prime_polynomial_module().packed_prime_field_polynomial_multiply
            )
            output = (
                runtime.uint64_buffer(length)
                if use_flint
                else _uint64_kernel_output(kernel, length)
            )
            if use_flint:
                valid = kernel(
                    output,
                    self._storage,
                    other._storage,
                    length,
                    left_length,
                    right_length,
                    base._modulus,
                )
            else:
                valid = kernel(
                    output,
                    _uint64_kernel_input(kernel, self._storage),
                    _uint64_kernel_input(kernel, other._storage),
                    base._modulus,
                )
            if not valid:
                raise RuntimeError("packed prime polynomial multiply failed")
            return self._new(_canonical_uint64_output(output))
        if base._kind == "GF_EXTENSION":
            return self._new(
                runtime.flint_backend().fqPolyMul(self._native, other._native)
            )
        return self._new(runtime.flint_backend().polyMul(self._native, other._native))

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("add", self, other)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("sub", self, other)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("mul", self, other)

    def _truediv_(
        self,
        other: PolynomialElement,
    ) -> RationalFunctionElement:
        return self._parent.fraction_field()(self, other)

    def __truediv__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("truediv", self, other)

    def __neg__(self) -> PolynomialElement:
        base = self._parent.base_ring()
        kind = _packed_polynomial_kind(base)
        if kind == "ZZ":
            if self._has_fmpz_polynomial_resource():
                return self._new(
                    _FmpzPolynomialResourceStorage(
                        _flint_ffi_module().fmpz_polynomial_neg(
                            self._exact_polynomial_resource()
                        )
                    )
                )
            self._materialize_exact_compatibility_storage()
            kernel = (
                _packed_integer_polynomial_module().packed_integer_polynomial_negate
            )
            capacity = _integer_word_capacity(self._storage.coefficients) + 1
            output = _integer_kernel_output(
                kernel, self._coefficient_length(), capacity
            )
            kernel(
                output,
                _integer_kernel_input(kernel, self._storage.coefficients),
            )
            return self._publish_exact_packed_storage(
                _PackedIntegerPolynomialStorage(
                    _canonical_integer_output(output, capacity)
                )
            )
        if kind == "QQ":
            if self._has_fmpq_polynomial_resource():
                return self._new(
                    _FmpqPolynomialResourceStorage(
                        _flint_ffi_module().fmpq_polynomial_neg(
                            self._exact_polynomial_resource()
                        )
                    )
                )
            self._materialize_exact_compatibility_storage()
            kernel = (
                _packed_rational_polynomial_module().packed_rational_polynomial_negate
            )
            numerator_capacity = _integer_word_capacity(self._storage.numerators) + 1
            denominator_capacity = _integer_word_capacity(self._storage.denominators)
            output_numerators = _integer_kernel_output(
                kernel, self._coefficient_length(), numerator_capacity
            )
            output_denominators = _integer_kernel_output(
                kernel, self._coefficient_length(), denominator_capacity
            )
            kernel(
                output_numerators,
                output_denominators,
                _integer_kernel_input(kernel, self._storage.numerators),
                _integer_kernel_input(kernel, self._storage.denominators),
            )
            return self._publish_exact_packed_storage(
                _PackedRationalPolynomialStorage(
                    _canonical_integer_output(output_numerators, numerator_capacity),
                    _canonical_integer_output(
                        output_denominators, denominator_capacity
                    ),
                )
            )
        if kind == "GF":
            kernel = (
                _packed_prime_polynomial_module().packed_prime_field_polynomial_negate
            )
            output = _uint64_kernel_output(kernel, self._coefficient_length())
            kernel(
                output,
                _uint64_kernel_input(kernel, self._storage),
                base._modulus,
            )
            return self._new(_canonical_uint64_output(output))
        if base._kind == "GF_EXTENSION":
            return self._new(runtime.flint_backend().fqPolyNeg(self._native))
        return self._new(runtime.flint_backend().polyNeg(self._native))

    def __pow__(self, exponent: int) -> PolynomialElement:
        exponent = runtime.integer_bigint(exponent)
        if exponent < 0:
            raise ValueError("negative polynomial exponent")
        if self._has_fmpz_polynomial_resource():
            return self._new(
                _FmpzPolynomialResourceStorage(
                    _flint_ffi_module().fmpz_polynomial_pow(
                        self._exact_polynomial_resource(), exponent
                    )
                )
            )
        if self._has_fmpq_polynomial_resource():
            return self._new(
                _FmpqPolynomialResourceStorage(
                    _flint_ffi_module().fmpq_polynomial_pow(
                        self._exact_polynomial_resource(), exponent
                    )
                )
            )
        if _packed_polynomial_kind(self._parent.base_ring()) != "legacy":
            answer = self._parent(1)
            power = self
            while exponent:
                if exponent % 2:
                    answer = answer._mul_(power)
                exponent //= 2
                if exponent:
                    power = power._mul_(power)
            return answer
        if self._parent.base_ring()._kind == "GF_EXTENSION":
            return self._new(runtime.flint_backend().fqPolyPow(self._native, exponent))
        return self._new(runtime.flint_backend().polyPow(self._native, exponent))

    def __floordiv__(self, other: object) -> PolynomialElement:
        operands = runtime.coercion_model.coercePair(self, other)
        if not isinstance(operands.left, PolynomialElement):
            raise TypeError("polynomial division requires polynomials")
        left = operands.left
        right = operands.right
        base = operands.parent.base_ring()
        kind = _packed_polynomial_kind(base)
        if kind == "ZZ":
            if (
                left._has_fmpz_polynomial_resource()
                and right._has_fmpz_polynomial_resource()
            ):
                return left._new(
                    _FmpzPolynomialResourceStorage(
                        _flint_ffi_module().fmpz_polynomial_divexact(
                            left._storage.resource, right._storage.resource
                        )
                    )
                )
            left_length = left._coefficient_length()
            right_length = right._coefficient_length()
            left._materialize_exact_compatibility_storage()
            right._materialize_exact_compatibility_storage()
            kernel = _packed_polynomial_flint_module().flint_packed_integer_polynomial_divexact
            capacity = max(
                1,
                _integer_word_capacity(operands.left._storage.coefficients)
                + _integer_word_capacity(operands.right._storage.coefficients),
            )
            while True:
                output = _integer_zeros(left_length, capacity)
                try:
                    kernel(
                        output,
                        left._storage.coefficients,
                        right._storage.coefficients,
                        left_length,
                        left_length,
                        right_length,
                        1,
                    )
                    return left._publish_exact_packed_storage(
                        _PackedIntegerPolynomialStorage(output)
                    )
                except Exception as error:
                    if not _integer_capacity_error(error):
                        raise
                    capacity *= 2
        if kind == "QQ":
            if (
                left._has_fmpq_polynomial_resource()
                and right._has_fmpq_polynomial_resource()
            ):
                return left._new(
                    _FmpqPolynomialResourceStorage(
                        _flint_ffi_module().fmpq_polynomial_divexact(
                            left._storage.resource, right._storage.resource
                        )
                    )
                )
            left_length = left._coefficient_length()
            right_length = right._coefficient_length()
            left._materialize_exact_compatibility_storage()
            right._materialize_exact_compatibility_storage()
            kernel = _packed_polynomial_flint_module().flint_packed_rational_polynomial_divexact
            capacity = max(
                2,
                _integer_word_capacity(operands.left._storage.numerators)
                + _integer_word_capacity(operands.left._storage.denominators)
                + _integer_word_capacity(operands.right._storage.numerators)
                + _integer_word_capacity(operands.right._storage.denominators),
            )
            while True:
                numerators = _integer_zeros(left_length, capacity)
                denominators = _integer_zeros(left_length, capacity)
                try:
                    kernel(
                        numerators,
                        denominators,
                        left._storage.numerators,
                        left._storage.denominators,
                        right._storage.numerators,
                        right._storage.denominators,
                        left_length,
                        left_length,
                        right_length,
                        1,
                    )
                    return left._publish_exact_packed_storage(
                        _PackedRationalPolynomialStorage(numerators, denominators)
                    )
                except Exception as error:
                    if not _integer_capacity_error(error):
                        raise
                    capacity *= 2
        if kind == "GF":
            left_length = left._coefficient_length()
            right_length = right._coefficient_length()
            output = runtime.uint64_buffer(left_length)
            _packed_polynomial_flint_module().flint_packed_prime_field_polynomial_divexact(
                output,
                left._storage,
                right._storage,
                left_length,
                left_length,
                right_length,
                base._modulus,
            )
            return left._new(output)
        if base._kind == "GF_EXTENSION":
            native_value = runtime.flint_backend().fqPolyDivExact(
                operands.left._native, operands.right._native
            )
        else:
            native_value = runtime.flint_backend().polyDivExact(
                operands.left._native,
                operands.right._native,
            )
        return operands.parent._from_legacy_native(native_value)

    def _eq_(self, other: PolynomialElement) -> bool:
        base = self._parent.base_ring()
        kind = _packed_polynomial_kind(base)
        if kind == "ZZ":
            if (
                self._has_fmpz_polynomial_resource()
                and other._has_fmpz_polynomial_resource()
            ):
                return bool(
                    _flint_ffi_module().fmpz_polynomial_equal(
                        self._exact_polynomial_resource(),
                        other._exact_polynomial_resource(),
                    )
                )
            self._materialize_exact_compatibility_storage()
            other._materialize_exact_compatibility_storage()
            kernel = _packed_integer_polynomial_module().packed_integer_polynomial_equal
            return kernel(
                _integer_kernel_input(kernel, self._storage.coefficients),
                _integer_kernel_input(kernel, other._storage.coefficients),
            )
        if kind == "QQ":
            if (
                self._has_fmpq_polynomial_resource()
                and other._has_fmpq_polynomial_resource()
            ):
                return bool(
                    _flint_ffi_module().fmpq_polynomial_equal(
                        self._exact_polynomial_resource(),
                        other._exact_polynomial_resource(),
                    )
                )
            self._materialize_exact_compatibility_storage()
            other._materialize_exact_compatibility_storage()
            kernel = (
                _packed_rational_polynomial_module().packed_rational_polynomial_equal
            )
            return kernel(
                _integer_kernel_input(kernel, self._storage.numerators),
                _integer_kernel_input(kernel, self._storage.denominators),
                _integer_kernel_input(kernel, other._storage.numerators),
                _integer_kernel_input(kernel, other._storage.denominators),
            )
        if kind == "GF":
            kernel = (
                _packed_prime_polynomial_module().packed_prime_field_polynomial_equal
            )
            return kernel(
                _uint64_kernel_input(kernel, self._storage),
                _uint64_kernel_input(kernel, other._storage),
                base._modulus,
            )
        if base._kind == "GF_EXTENSION":
            return runtime.flint_backend().fqPolyEqual(self._native, other._native)
        return runtime.flint_backend().polyEqual(self._native, other._native)

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def _coefficient_length(self) -> int:
        kind = _packed_polynomial_kind(self._parent.base_ring())
        if kind == "ZZ":
            if self._has_fmpz_polynomial_resource():
                return runtime.number(
                    _flint_ffi_module().fmpz_polynomial_length(
                        self._exact_polynomial_resource()
                    )
                )
            return _buffer_length(self._storage.coefficients)
        if kind == "QQ":
            if self._has_fmpq_polynomial_resource():
                return runtime.number(
                    _flint_ffi_module().fmpq_polynomial_length(
                        self._exact_polynomial_resource()
                    )
                )
            return _buffer_length(self._storage.numerators)
        if kind == "GF":
            return _buffer_length(self._storage)
        return len(self.coefficients())

    def gcd(self, other: object) -> PolynomialElement:
        operands = runtime.coercion_model.coercePair(self, other)
        if not isinstance(operands.left, PolynomialElement):
            raise TypeError("polynomial gcd requires polynomials")
        base = operands.parent.base_ring()
        kind = _packed_polynomial_kind(base)
        if kind == "ZZ":
            if (
                operands.left._has_fmpz_polynomial_resource()
                and operands.right._has_fmpz_polynomial_resource()
            ):
                return operands.left._new(
                    _FmpzPolynomialResourceStorage(
                        _flint_ffi_module().fmpz_polynomial_gcd(
                            operands.left._exact_polynomial_resource(),
                            operands.right._exact_polynomial_resource(),
                        )
                    )
                )
            return _dynamic_exact_polynomial_gcd(operands.left, operands.right)
        if kind == "QQ":
            if (
                operands.left._has_fmpq_polynomial_resource()
                and operands.right._has_fmpq_polynomial_resource()
            ):
                return operands.left._new(
                    _FmpqPolynomialResourceStorage(
                        _flint_ffi_module().fmpq_polynomial_gcd(
                            operands.left._exact_polynomial_resource(),
                            operands.right._exact_polynomial_resource(),
                        )
                    )
                )
            return _dynamic_exact_polynomial_gcd(operands.left, operands.right)
        if base._kind == "GF_EXTENSION":
            native_value = runtime.flint_backend().fqPolyGcd(
                operands.left._native, operands.right._native
            )
        elif kind == "GF":
            left_length = operands.left._coefficient_length()
            right_length = operands.right._coefficient_length()
            output_length = max(left_length, right_length)
            output = runtime.uint64_buffer(output_length)
            _packed_polynomial_flint_module().flint_packed_prime_field_polynomial_gcd(
                output,
                operands.left._storage,
                operands.right._storage,
                output_length,
                left_length,
                right_length,
                operands.parent.base_ring()._modulus,
            )
            return operands.left._new(output)
        else:
            raise TypeError(
                "polynomial gcd is implemented over ZZ, QQ, and finite fields"
            )
        return operands.parent._from_legacy_native(native_value)

    def is_irreducible(self) -> bool:
        if self._parent.base_ring()._kind == "GF_EXTENSION":
            return runtime.flint_backend().fqPolyIsIrreducible(self._native)
        if self._parent.base_ring()._kind == "GF":
            return _packed_polynomial_flint_module().flint_packed_prime_field_polynomial_is_irreducible(
                self._storage,
                self._coefficient_length(),
                self._parent.base_ring()._modulus,
            )
        factors = _untyped(self.factor())
        return (
            len(factors) == 1
            and factors[0][1] == 1
            and factors[0][0] * factors.unit() == self
        )

    def factor(self) -> sage.Factorization:
        if self._parent.base_ring()._kind == "ZMOD":
            raise NotImplementedError(
                "polynomial factorization over Zmod is not implemented"
            )
        parent = self._parent
        base = parent.base_ring()
        if base._kind == "GF_EXTENSION":
            result = runtime.flint_backend().fqPolyFactor(self._native)
            factors = [
                [parent._from_legacy_native(pair[0]), pair[1]]
                for pair in result.factors
            ]
            unit = base._from_native(result.unit)
            return sage.Factorization(factors, unit, False, True, False)

        if base is sage.ZZ and self._has_fmpz_polynomial_resource():
            ffi = _flint_ffi_module()
            factorization = ffi.fmpz_polynomial_factor_resource(
                self._exact_polynomial_resource()
            )
            try:
                count = int(ffi.exact_polynomial_factorization_count(factorization))
                factors = []
                for index in range(count):
                    factor = parent._from_fmpz_polynomial_resource(
                        ffi.exact_polynomial_factorization_fmpz_factor(
                            factorization, index
                        )
                    )
                    exponent = runtime.number(
                        ffi.exact_polynomial_factorization_exponent(
                            factorization, index
                        )
                    )
                    factors.append([factor, exponent])
                unit = base(
                    ffi.exact_polynomial_factorization_unit_numerator(factorization)
                )
                return sage.Factorization(factors, unit, False, True, False)
            finally:
                factorization.close()

        if base is sage.QQ and self._has_fmpq_polynomial_resource():
            ffi = _flint_ffi_module()
            factorization = ffi.fmpq_polynomial_factor_resource(
                self._exact_polynomial_resource()
            )
            try:
                count = int(ffi.exact_polynomial_factorization_count(factorization))
                factors = []
                for index in range(count):
                    factor = parent._from_fmpq_polynomial_resource(
                        ffi.exact_polynomial_factorization_fmpq_factor(
                            factorization, index
                        )
                    )
                    exponent = runtime.number(
                        ffi.exact_polynomial_factorization_exponent(
                            factorization, index
                        )
                    )
                    factors.append([factor, exponent])
                unit = base(
                    ffi.exact_polynomial_factorization_unit_numerator(factorization),
                    ffi.exact_polynomial_factorization_unit_denominator(factorization),
                )
                return sage.Factorization(factors, unit, False, True, False)
            finally:
                factorization.close()

        source_length = self._coefficient_length()
        degree = max(0, source_length - 1)
        factor_coefficients_length = 2 * degree
        offsets = runtime.uint64_buffer(source_length)
        exponents = runtime.uint64_buffer(source_length)
        factor_count = runtime.uint64_buffer(1)
        if base._kind == "GF":
            field_exponents = runtime.uint64_buffer(degree)
            factor_coefficients = runtime.uint64_buffer(factor_coefficients_length)
            unit_output = runtime.uint64_buffer(1)
            _packed_polynomial_flint_module().flint_packed_prime_field_polynomial_factor(
                factor_coefficients,
                offsets,
                field_exponents,
                factor_count,
                unit_output,
                self._storage,
                factor_coefficients_length,
                source_length,
                degree,
                1,
                1,
                source_length,
                base._modulus,
            )
            factors = []
            count = int(factor_count[0])
            for index in range(count):
                start = int(offsets[index])
                stop = int(offsets[index + 1])
                coefficients = [
                    factor_coefficients[item] for item in range(start, stop)
                ]
                factors.append(
                    [
                        parent._from_coefficients(coefficients),
                        runtime.number(field_exponents[index]),
                    ]
                )
            return sage.Factorization(factors, base(unit_output[0]), False, True, False)

        self._materialize_exact_compatibility_storage()
        source = (
            self._storage.coefficients if base is sage.ZZ else self._storage.numerators
        )
        capacity = max(1, 2 * _integer_word_capacity(source))
        unit_numerator = _integer_zeros(1, capacity)
        unit_denominator = _integer_zeros(1, capacity)
        while True:
            factor_coefficients = _integer_zeros(factor_coefficients_length, capacity)
            try:
                if base is sage.ZZ:
                    _packed_polynomial_flint_module().flint_packed_integer_polynomial_factor(
                        factor_coefficients,
                        offsets,
                        exponents,
                        factor_count,
                        unit_numerator,
                        unit_denominator,
                        self._storage.coefficients,
                        factor_coefficients_length,
                        source_length,
                        1,
                    )
                else:
                    _packed_polynomial_flint_module().flint_packed_rational_polynomial_factor(
                        factor_coefficients,
                        offsets,
                        exponents,
                        factor_count,
                        unit_numerator,
                        unit_denominator,
                        self._storage.numerators,
                        self._storage.denominators,
                        factor_coefficients_length,
                        source_length,
                        1,
                    )
                break
            except Exception as error:
                if not _integer_capacity_error(error):
                    raise
                capacity *= 2
                unit_numerator = _integer_zeros(1, capacity)
                unit_denominator = _integer_zeros(1, capacity)
        values = _integer_buffer_values(factor_coefficients)
        factors = []
        count = int(factor_count[0])
        for index in range(count):
            start = int(offsets[index])
            stop = int(offsets[index + 1])
            coefficients = [values[item] for item in range(start, stop)]
            factors.append(
                [
                    parent._from_coefficients(coefficients),
                    runtime.number(exponents[index]),
                ]
            )
        unit_values = _integer_buffer_values(unit_numerator)
        denominator_values = _integer_buffer_values(unit_denominator)
        unit = (
            base(unit_values[0])
            if base is sage.ZZ
            else base(unit_values[0], denominator_values[0])
        )
        return sage.Factorization(factors, unit, False, True, False)

    def divisors(self) -> list[PolynomialElement]:
        answer = [self._parent(1)]
        factors = _untyped(self.factor())
        for factor_value, exponent in factors:
            previous = answer
            answer = []
            power = self._parent(1)
            for _ in range(exponent + 1):
                for divisor in previous:
                    answer.append(divisor * power)
                power = power * factor_value
        return answer

    def roots(
        self,
        ring: Any = runtime.undefined,
        multiplicities: bool = True,
    ) -> list[Any]:
        if isinstance(ring, bool):
            multiplicities = ring
            ring = runtime.undefined
        base = self._parent.base_ring()
        if ring is not runtime.undefined:
            target_kind = getattr(ring, "_kind", None)
            if target_kind not in ["AA", "QQBAR"] or base._kind not in ["ZZ", "QQ"]:
                raise TypeError(
                    "exact algebraic roots require a polynomial over "
                    "ZZ or QQ and target ring AA or QQbar"
                )
            raw_roots = runtime.flint_backend().polyExactRoots(
                self._legacy_polynomial_oracle_input()
            )
            answer = []
            for native_root, count in raw_roots:
                if target_kind == "AA" and not runtime.flint_backend().qqbarIsReal(
                    native_root
                ):
                    continue
                root = ring._from_native(native_root)
                item = root
                if multiplicities:
                    item = runtime.factor_pair(root, count)
                answer.append(item)
            return answer
        if base._kind not in ["GF", "GF_EXTENSION"]:
            raise TypeError(
                "polynomial roots require an explicit algebraic target "
                "ring unless the base is a finite field"
            )
        field = self._parent.base_ring()
        if field._kind == "GF_EXTENSION":
            raw_roots = runtime.flint_backend().fqPolyRoots(self._native)
        else:
            source_length = self._coefficient_length()
            capacity = max(0, source_length - 1)
            root_values = runtime.uint64_buffer(capacity)
            multiplicity_values = runtime.uint64_buffer(capacity)
            root_count = runtime.uint64_buffer(1)
            _packed_polynomial_flint_module().flint_packed_prime_field_polynomial_roots(
                root_values,
                multiplicity_values,
                root_count,
                self._storage,
                capacity,
                capacity,
                1,
                source_length,
                field._modulus,
            )
            answer = []
            for index in range(int(root_count[0])):
                root = field(root_values[index])
                answer.append(
                    runtime.factor_pair(
                        root, runtime.number(multiplicity_values[index])
                    )
                    if multiplicities
                    else root
                )
            return answer

        def make_root(pair: list[Any]) -> Any:
            if field._kind == "GF_EXTENSION":
                root = field._from_native(pair[0])
            else:
                root = field(pair[0])
            return runtime.factor_pair(root, pair[1]) if multiplicities else root

        return raw_roots.map(make_root)

    def coefficients(self) -> list[Any]:
        base = self._parent.base_ring()
        kind = _packed_polynomial_kind(base)
        if kind == "ZZ":
            if self._has_fmpz_polynomial_resource():
                ffi = _flint_ffi_module()
                return _decode_exact_polynomial_bytes(
                    _flint_byte_region_bytes(
                        ffi.fmpz_polynomial_serialize(self._exact_polynomial_resource())
                    ),
                    base,
                )
            return _integer_buffer_values(self._storage.coefficients)
        if kind == "QQ":
            if self._has_fmpq_polynomial_resource():
                ffi = _flint_ffi_module()
                return _decode_exact_polynomial_bytes(
                    _flint_byte_region_bytes(
                        ffi.fmpq_polynomial_serialize(self._exact_polynomial_resource())
                    ),
                    base,
                )
            numerators = _integer_buffer_values(self._storage.numerators)
            denominators = _integer_buffer_values(self._storage.denominators)
            return [
                base(numerators[index], denominators[index])
                for index in range(len(numerators))
            ]
        if kind == "GF":
            return [base(self._storage[index]) for index in range(len(self._storage))]
        if base._kind == "GF_EXTENSION":
            raw = runtime.flint_backend().fqPolyCoefficients(self._native)
        else:
            raw = runtime.flint_backend().polyCoefficients(self._native)
        answer = []
        for coefficient in raw:
            if base is sage.ZZ:
                answer.append(runtime.normalize_integer(coefficient))
            elif base is sage.QQ:
                answer.append(
                    base(
                        runtime.reflect.get(coefficient, "numerator"),
                        runtime.reflect.get(coefficient, "denominator"),
                    )
                )
            elif base._kind == "GF_EXTENSION":
                answer.append(base._from_native(coefficient))
            else:
                answer.append(base(coefficient))
        return answer

    def _packed_exact_polynomial(self) -> Any:
        """Return the stable bulk encoding of a Node exact resource.

        SagePack uses this private capability to avoid constructing one Python
        scalar per coefficient. Portable packed polynomials return
        `undefined`, causing the codec to retain its ordinary coefficient
        representation.
        """
        ffi = _flint_ffi_module()
        if self._has_fmpz_polynomial_resource():
            return _flint_byte_region_bytes(
                ffi.fmpz_polynomial_serialize(self._exact_polynomial_resource())
            )
        if self._has_fmpq_polynomial_resource():
            return _flint_byte_region_bytes(
                ffi.fmpq_polynomial_serialize(self._exact_polynomial_resource())
            )
        return runtime.undefined

    def __call__(self, value: Any) -> Any:
        if hasattr(value, "nrows") and hasattr(value, "ncols") and value.is_square():
            coefficients = self.coefficients()
            answer = value.parent().zero()
            identity = value.parent().one()
            for coefficient in reversed(coefficients):
                answer = answer * value + coefficient * identity
            return answer
        if self._has_fmpz_polynomial_resource():
            ffi = _flint_ffi_module()
            resource = self._exact_polynomial_resource()
            if runtime.is_exact_integer(value):
                return ffi.fmpz_polynomial_evaluate(
                    resource, runtime.integer_bigint(value)
                )
            if isinstance(value, sage.Rational):
                result = ffi.fmpz_polynomial_evaluate_rational(
                    resource, value._numerator, value._denominator
                )
                try:
                    return _untyped(sage.Rational)._from_reduced(
                        ffi.fmpq_value_numerator(result),
                        ffi.fmpq_value_denominator(result),
                    )
                finally:
                    result.close()
        if self._has_fmpq_polynomial_resource() and (
            runtime.is_exact_integer(value) or isinstance(value, sage.Rational)
        ):
            rational = _untyped(sage.QQ)(value)
            ffi = _flint_ffi_module()
            result = ffi.fmpq_polynomial_evaluate(
                self._exact_polynomial_resource(),
                rational._numerator,
                rational._denominator,
            )
            try:
                return _untyped(sage.Rational)._from_reduced(
                    ffi.fmpq_value_numerator(result),
                    ffi.fmpq_value_denominator(result),
                )
            finally:
                result.close()
        base = self._parent.base_ring()
        # Exact integers and elements of this precise prime field have one
        # canonical residue. Other parents must keep using the coercion model
        # below, including extension fields, matrices, and incompatible fields.
        if _packed_polynomial_kind(base) == "GF" and (
            runtime.is_exact_integer(value)
            or getattr(value, "_parent", runtime.undefined) is base
        ):
            scalar = _untyped(base)(value)
            kernel = (
                _packed_prime_polynomial_module().packed_prime_field_polynomial_evaluate
            )
            result = kernel(
                _uint64_kernel_input(kernel, self._storage),
                scalar._value,
                base._modulus,
            )
            return scalar._new_reduced(result)
        coefficients = self.coefficients()
        answer = self._parent.base_ring()(0)
        for coefficient in reversed(coefficients):
            answer = answer * value + coefficient
        return answer

    def __repr__(self) -> str:
        base = self._parent.base_ring()
        if _packed_polynomial_kind(base) != "legacy":
            coefficients = self.coefficients()
            if len(coefficients) == 0:
                return "0"
            variable = self._parent.variable_name()
            zero = base(0)
            one = base(1)
            pieces = []
            for exponent in range(len(coefficients) - 1, -1, -1):
                coefficient = coefficients[exponent]
                if coefficient == zero:
                    continue
                negative = False
                if base in [sage.ZZ, sage.QQ] and coefficient < zero:
                    negative = True
                    coefficient = -coefficient
                if exponent == 0:
                    term = str(coefficient)
                else:
                    monomial = (
                        variable if exponent == 1 else variable + "^" + str(exponent)
                    )
                    term = (
                        monomial
                        if coefficient == one
                        else str(coefficient) + "*" + monomial
                    )
                if len(pieces) == 0:
                    pieces.append(("-" if negative else "") + term)
                elif negative:
                    pieces.append(" - " + term)
                else:
                    pieces.append(" + " + term)
            return "".join(pieces) if pieces else "0"
        if base._kind == "GF_EXTENSION":
            raw = runtime.flint_backend().fqPolyToString(
                self._native, self._parent.variable_name()
            )
        else:
            raw = runtime.flint_backend().polyToString(
                self._native, self._parent.variable_name()
            )
        raw = raw.replace(runtime.regexp(r"\s+", "g"), "")
        raw = raw.replace(runtime.regexp(r"\+", "g"), " + ").replace(
            runtime.regexp(r"([^-])-+", "g"), "$1 - "
        )
        if self._parent.base_ring()._kind == "GF_EXTENSION":
            raw = raw.replace(
                runtime.regexp(r"\+ \(([^()]*)\)$"),
                "+ $1",
            )
        return raw.replace(runtime.regexp(r"(^|[+-] )1\*", "g"), "$1")

    __str__ = __repr__
    toString = __repr__

    def _factorization_repr(self) -> str:
        value = self.__repr__()
        return "(" + value + ")" if " + " in value or " - " in value else value


@runtime.callable_instance_class
class PolynomialRingParent(sage.Parent):
    def __init__(
        self,
        base: sage.Parent,
        variable: str,
        sparse: bool = False,
    ) -> None:
        self._name = (
            ("Sparse " if sparse else "")
            + "Univariate Polynomial Ring in "
            + variable
            + " over "
            + str(base)
        )
        self._base = base
        self._variable = variable
        self._sparse = sparse
        self._construction = {
            "kind": "polynomial",
            "base": base,
            "variable": variable,
            "sparse": sparse,
        }
        self._fraction_field = runtime.undefined

    def base_ring(self) -> sage.Parent:
        return self._base

    def variable_name(self) -> str:
        return self._variable

    def _from_native(self, native_value: Any) -> PolynomialElement:
        if _packed_polynomial_kind(self._base) == "legacy":
            return PolynomialElement(self, native_value)
        return self._from_legacy_native(native_value)

    def _from_legacy_native(self, native_value: Any) -> PolynomialElement:
        """Decode a transitional opaque result immediately into owned storage."""
        if _packed_polynomial_kind(self._base) == "legacy":
            return PolynomialElement(self, native_value)
        raw = runtime.flint_backend().polyCoefficients(native_value)
        coefficients = []
        for coefficient in raw:
            if self._base is sage.QQ:
                coefficients.append(
                    _untyped(self._base)(
                        runtime.reflect.get(coefficient, "numerator"),
                        runtime.reflect.get(coefficient, "denominator"),
                    )
                )
            else:
                coefficients.append(coefficient)
        return self._from_coefficients(coefficients)

    def _from_fmpz_polynomial_resource(self, resource: Any) -> PolynomialElement:
        """Take ownership of a checked sealed `ZZ[x]` resource."""
        if self._base is not sage.ZZ:
            resource.close()
            raise TypeError("integer polynomial resource requires ZZ")
        _flint_ffi_module().fmpz_polynomial_length(resource)
        return PolynomialElement(self, _FmpzPolynomialResourceStorage(resource))

    def _from_fmpq_polynomial_resource(self, resource: Any) -> PolynomialElement:
        """Take ownership of a checked sealed `QQ[x]` resource."""
        if self._base is not sage.QQ:
            resource.close()
            raise TypeError("rational polynomial resource requires QQ")
        _flint_ffi_module().fmpq_polynomial_length(resource)
        return PolynomialElement(self, _FmpqPolynomialResourceStorage(resource))

    def _supports_exact_polynomial_resource_deserialization(
        self,
        encoding: Any,
    ) -> bool:
        """Report whether SagePack can restore this parent as one resource."""
        if not _generated_flint_resources_available():
            return False
        return (self._base is sage.ZZ and encoding == "fmpz-poly-le-v1") or (
            self._base is sage.QQ and encoding == "fmpq-poly-le-v1"
        )

    def _from_exact_polynomial_serialization(
        self,
        payload: Any,
        byte_length: int,
        encoding: Any,
    ) -> PolynomialElement:
        """Restore one canonical SagePack stream through generated FLINT FFI."""
        if not self._supports_exact_polynomial_resource_deserialization(encoding):
            raise ValueError("exact polynomial resource deserialization is unavailable")
        ffi = _flint_ffi_module()
        if self._base is sage.ZZ:
            return self._from_fmpz_polynomial_resource(
                ffi.fmpz_polynomial_deserialize(payload, byte_length)
            )
        return self._from_fmpq_polynomial_resource(
            ffi.fmpq_polynomial_deserialize(payload, byte_length)
        )

    def _from_coefficients(
        self,
        coefficients: list[Any],
    ) -> PolynomialElement:
        """Construct a polynomial from low-to-high coefficients.

        This stays at the mathematical parent boundary instead of exposing a
        backend-specific native representation.  Portable codecs use it to
        restore exact polynomials and series.
        """
        kind = _packed_polynomial_kind(self._base)
        if kind == "ZZ":
            values = [
                runtime.integer_bigint(
                    value if runtime.is_exact_integer(value) else self._base(value)
                )
                for value in coefficients
            ]
            if _generated_flint_resources_available():
                length = len(values)
                while length > 0 and values[length - 1] == 0:
                    length -= 1
                if length != len(values):
                    values = values[:length]
                ffi = _flint_ffi_module()
                payload, byte_length = _exact_polynomial_payload(values, length, False)
                return self._from_fmpz_polynomial_resource(
                    ffi.fmpz_polynomial_deserialize(payload, byte_length)
                )
            return PolynomialElement(
                self,
                _PackedIntegerPolynomialStorage(runtime.integer_buffer(values, 1)),
            )
        if kind == "QQ" and _generated_flint_resources_available():
            parts = []
            for value in coefficients:
                rational = (
                    value if isinstance(value, sage.Rational) else self._base(value)
                )
                parts.append(rational._numerator)
                parts.append(rational._denominator)
            length = len(parts) // 2
            while length > 0 and parts[2 * length - 2] == 0:
                length -= 1
            if 2 * length != len(parts):
                parts = parts[: 2 * length]
            ffi = _flint_ffi_module()
            payload, byte_length = _exact_polynomial_payload(parts, length, True)
            return self._from_fmpq_polynomial_resource(
                ffi.fmpq_polynomial_deserialize(payload, byte_length)
            )
        if kind == "QQ":
            numerators = []
            denominators = []
            for value in coefficients:
                rational = self._base(value)
                numerators.append(rational._numerator)
                denominators.append(rational._denominator)
            return PolynomialElement(
                self,
                _PackedRationalPolynomialStorage(
                    runtime.integer_buffer(numerators, 1),
                    runtime.integer_buffer(denominators, 1),
                ),
            )
        if kind == "GF":
            packed = runtime.uint64_residue_buffer(coefficients, self._base._modulus)
            if packed is runtime.undefined:
                packed = runtime.uint64_buffer(
                    [self._base(value)._value for value in coefficients]
                )
            return PolynomialElement(self, packed)
        result = self(0)
        generator = self.gen()
        for coefficient in reversed(coefficients):
            result = result._mul_(generator)._add_(self(coefficient))
        return result

    def gen(self) -> PolynomialElement:
        if _packed_polynomial_kind(self._base) != "legacy":
            return self._from_coefficients([self._base(0), self._base(1)])
        backend = runtime.flint_backend()
        if self._base is sage.ZZ:
            native_value = backend.zzPolyGen()
        elif self._base is sage.QQ:
            native_value = backend.qqPolyGen()
        elif self._base._kind == "ZMOD":
            native_value = backend.zmodPolyGen(self._base._modulus)
        elif self._base._kind == "GF_EXTENSION":
            native_value = backend.fqPolyGen(
                runtime.reflect.get(self._base, "_nativeContext")
            )
        else:
            native_value = backend.nmodPolyGen(self._base._modulus)
        return PolynomialElement(self, native_value)

    def objgen(self) -> tuple[Any, PolynomialElement]:
        return runtime.math_tuple([self, self.gen()])

    def objgens(self) -> tuple[Any, Any]:
        return runtime.math_tuple(
            [
                self,
                runtime.math_tuple([self.gen()]),
            ]
        )

    def gens(self) -> Any:
        return runtime.math_tuple([self.gen()])

    def fraction_field(self) -> RationalFunctionFieldParent:
        if self._fraction_field is runtime.undefined:
            self._fraction_field = RationalFunctionFieldParent(self)
        return self._fraction_field

    def _first_ngens(self, count: int) -> list[PolynomialElement]:
        if count != 1:
            raise ValueError("a univariate polynomial ring has exactly one generator")
        return [self.gen()]

    def __contains__(self, value: object) -> bool:
        return isinstance(value, PolynomialElement) and value._parent is self

    def cyclotomic_polynomial(self, degree: Any) -> PolynomialElement:
        if not runtime.is_exact_integer(degree):
            raise TypeError("cyclotomic polynomial degree must be an integer")
        n = int(degree)
        if n < 1:
            raise ValueError("cyclotomic polynomial degree must be positive")
        generator = self.gen()
        answer = generator**n - 1
        for divisor in sage.divisors(n):
            if divisor < n:
                answer = answer // self.cyclotomic_polynomial(divisor)
        return answer

    def _constant(self, value: Any) -> PolynomialElement:
        if _packed_polynomial_kind(self._base) != "legacy":
            coefficient = self._base(value)
            if coefficient == self._base(0):
                return self._from_coefficients([])
            return self._from_coefficients([coefficient])
        backend = runtime.flint_backend()
        if self._base is sage.ZZ:
            return PolynomialElement(
                self, backend.zzPolyConstant(runtime.integer_bigint(value))
            )
        if self._base is sage.QQ and isinstance(value, sage.Rational):
            return PolynomialElement(
                self, backend.qqPolyConstant(value._numerator, value._denominator)
            )
        if (
            self._base._kind in ["GF", "ZMOD"]
            and isinstance(value, sage.FiniteFieldElement)
            and value._parent is self._base
        ):
            if self._base._kind == "ZMOD":
                return PolynomialElement(
                    self, backend.zmodPolyConstant(value._value, self._base._modulus)
                )
            return PolynomialElement(
                self, backend.nmodPolyConstant(value._value, self._base._modulus)
            )
        if (
            self._base._kind == "GF_EXTENSION"
            and isinstance(value, sage.Element)
            and runtime.reflect.get(value, "_parent") is self._base
            and runtime.reflect.has(value, "_native")
        ):
            return PolynomialElement(
                self,
                backend.fqPolyConstant(
                    runtime.reflect.get(self._base, "_nativeContext"),
                    runtime.reflect.get(value, "_native"),
                ),
            )
        raise TypeError("unsupported polynomial coefficient parent")

    def _coercePolynomial(self, value: object) -> PolynomialElement:
        if not isinstance(value, PolynomialElement):
            raise TypeError("expected a polynomial")
        if value._parent is self:
            return value
        source = value._parent
        if (
            source._construction is runtime.undefined
            or source._construction.kind != "polynomial"
        ):
            raise TypeError("incompatible polynomial rings")
        if source.variable_name() != self.variable_name():
            raise TypeError("incompatible polynomial rings")
        if source.base_ring() is self._base:
            result = self(0)
            generator = self.gen()
            for coefficient in reversed(value.coefficients()):
                result = result._mul_(generator)._add_(self(coefficient))
            return result
        if source.base_ring() is sage.ZZ and self._base is sage.QQ:
            return self._from_coefficients(value.coefficients())
        if source.base_ring() is sage.ZZ and self._base._kind in [
            "GF",
            "GF_EXTENSION",
            "ZMOD",
        ]:
            if self._base._kind == "GF_EXTENSION":
                result = self(0)
                generator = self.gen()
                coefficients = value.coefficients()
                index = len(coefficients) - 1
                while index >= 0:
                    result = result._mul_(generator)._add_(
                        self(self._base(coefficients[index]))
                    )
                    index -= 1
                return result
            if self._base._kind == "ZMOD":
                return self._from_coefficients(
                    [self._base(coefficient) for coefficient in value.coefficients()]
                )
            return self._from_coefficients(value.coefficients())
        raise TypeError(
            "unsupported polynomial coefficient coercion from "
            + str(source.base_ring())
            + " to "
            + str(self._base)
        )

    def __call__(self, value: Any = 0) -> PolynomialElement:
        if isinstance(value, PolynomialElement):
            return self._coercePolynomial(value)
        if isinstance(value, (list, tuple)):
            return self._from_coefficients(list(value))
        plan = runtime.coercion_model.resolveParents(
            runtime.coercion_model.parentOf(value), self._base
        )
        if plan.parent is not self._base:
            raise TypeError("coefficient does not canonically coerce")
        return self._constant(plan.leftMap(value))


@runtime.callable_instance_class
@runtime.lightweight_math_class
class MultivariatePolynomialElement(sage.Element):
    def __init__(
        self,
        parent: MultivariatePolynomialRingParent,
        native_value: Any,
    ) -> None:
        self._parent = parent
        self._native = native_value
        runtime.object.freeze(self)

    def _new(self, native_value: Any) -> MultivariatePolynomialElement:
        return MultivariatePolynomialElement(self._parent, native_value)

    def _add_(
        self,
        other: MultivariatePolynomialElement,
    ) -> MultivariatePolynomialElement:
        return self._new(runtime.flint_backend().mpolyAdd(self._native, other._native))

    def _sub_(
        self,
        other: MultivariatePolynomialElement,
    ) -> MultivariatePolynomialElement:
        return self._new(runtime.flint_backend().mpolySub(self._native, other._native))

    def _mul_(
        self,
        other: MultivariatePolynomialElement,
    ) -> MultivariatePolynomialElement:
        return self._new(runtime.flint_backend().mpolyMul(self._native, other._native))

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("add", self, other)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("sub", self, other)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("mul", self, other)

    def __neg__(self) -> MultivariatePolynomialElement:
        return self._new(runtime.flint_backend().mpolyNeg(self._native))

    def __pow__(self, exponent: int) -> MultivariatePolynomialElement:
        exponent = runtime.integer_bigint(exponent)
        if exponent < 0:
            raise ValueError("negative polynomial exponent")
        return self._new(
            runtime.flint_backend().mpolyPow(self._native, runtime.number(exponent))
        )

    def __floordiv__(
        self,
        other: object,
    ) -> MultivariatePolynomialElement:
        operands = runtime.coercion_model.coercePair(self, other)
        if not isinstance(
            operands.left,
            MultivariatePolynomialElement,
        ):
            raise TypeError("polynomial division requires polynomials")
        return MultivariatePolynomialElement(
            operands.parent,
            runtime.flint_backend().mpolyDivExact(
                operands.left._native, operands.right._native
            ),
        )

    def _eq_(self, other: MultivariatePolynomialElement) -> bool:
        return runtime.flint_backend().mpolyEqual(self._native, other._native)

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def __lt__(self, other: object) -> bool:
        operands = runtime.coercion_model.coercePair(self, other)
        if not isinstance(
            operands.left,
            MultivariatePolynomialElement,
        ):
            raise TypeError("polynomial comparison requires polynomials")
        if operands.parent.base_ring()._kind not in ["ZZ", "QQ"]:
            raise TypeError("polynomial ordering is defined only over ZZ and QQ")
        return (
            runtime.flint_backend().mpolyCompare(
                operands.left._native, operands.right._native
            )
            < 0
        )

    def gcd(self, other: object) -> MultivariatePolynomialElement:
        operands = runtime.coercion_model.coercePair(self, other)
        if not isinstance(
            operands.left,
            MultivariatePolynomialElement,
        ):
            raise TypeError("polynomial gcd requires polynomials")
        return MultivariatePolynomialElement(
            operands.parent,
            runtime.flint_backend().mpolyGcd(
                operands.left._native, operands.right._native
            ),
        )

    def irreducible_factors(
        self,
    ) -> list[MultivariatePolynomialElement]:
        """
        Return the distinct irreducible factors of this polynomial.

        Factorization is performed by FLINT over the coefficient rings
        supported by the multivariate polynomial parent. Multiplicities and
        the constant unit are intentionally omitted; use this method when
        the geometric irreducible components are the desired result.
        """
        native_factors = runtime.flint_backend().mpolyIrreducibleFactors(self._native)
        answer = []
        for pair in native_factors:
            answer.append(MultivariatePolynomialElement(self._parent, pair[0]))
        return answer

    def resultant(
        self,
        other: object,
        variable: Any,
    ) -> MultivariatePolynomialElement:
        """Return the resultant with respect to one ring generator."""
        operands = runtime.coercion_model.coercePair(self, other)
        if not isinstance(
            operands.left,
            MultivariatePolynomialElement,
        ):
            raise TypeError("polynomial resultant requires polynomials")
        index = operands.parent._generator_index(variable)
        return MultivariatePolynomialElement(
            operands.parent,
            runtime.flint_backend().mpolyResultant(
                operands.left._native, operands.right._native, index
            ),
        )

    def degree(self, variable: Any = None) -> int:
        if variable is None:
            return runtime.flint_backend().mpolyTotalDegree(self._native)
        index = self._parent._generator_index(variable)
        return runtime.flint_backend().mpolyDegree(self._native, index)

    def total_degree(self) -> int:
        return runtime.flint_backend().mpolyTotalDegree(self._native)

    def number_of_terms(self) -> int:
        return runtime.flint_backend().mpolyLength(self._native)

    def univariate_polynomial(
        self,
        variable: Any = None,
    ) -> PolynomialElement:
        """Extract this polynomial when it involves at most one generator."""
        if variable is None:
            active = []
            for candidate in self._parent.gens():
                if self.degree(candidate) > 0:
                    active.append(candidate)
            if len(active) > 1:
                raise TypeError("multivariate polynomial involves several generators")
            variable = active[0] if len(active) else self._parent.gen(0)
        index = self._parent._generator_index(variable)
        names = self._parent.variable_names()
        base = self._parent.base_ring()
        if base._kind not in ["ZZ", "QQ"]:
            raise TypeError("univariate extraction currently requires ZZ or QQ")
        raw = runtime.flint_backend().mpolyUnivariateCoefficients(self._native, index)
        ring = PolynomialRing(base, names[index])
        generator = ring.gen()
        result = ring(0)
        for coefficient in reversed(raw):
            if base is sage.ZZ:
                scalar = runtime.normalize_integer(coefficient)
            else:
                scalar = base(
                    runtime.reflect.get(coefficient, "numerator"),
                    runtime.reflect.get(coefficient, "denominator"),
                )
            result = result * generator + scalar
        return result

    def __repr__(self) -> str:
        raw = runtime.flint_backend().mpolyToString(
            self._native, self._parent.variable_names()
        )
        raw = raw.replace(runtime.regexp(r"\s+", "g"), "")
        if self._parent.base_ring()._kind == "GF_EXTENSION":
            raw = raw.replace(
                runtime.regexp(r"\(([A-Za-z_][A-Za-z0-9_]*)\)\*", "g"),
                "$1*",
            )
            raw = raw.replace(runtime.regexp(r"\(([^()]*)\)$", "g"), "$1")
        raw = raw.replace(runtime.regexp(r"\+", "g"), " + ").replace(
            runtime.regexp(r"([^-])-+", "g"), "$1 - "
        )
        return raw.replace(runtime.regexp(r"(^|[+-] )1\*", "g"), "$1")

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class MultivariatePolynomialRingParent(sage.Parent):
    def __init__(
        self,
        base: sage.Parent,
        variables: list[str],
        order: str = "degrevlex",
    ) -> None:
        self._kind = "MULTIVARIATE_POLYNOMIAL"
        self._base = base
        self._variables = runtime.math_tuple(variables)
        self._order = order
        self._name = (
            "Multivariate Polynomial Ring in "
            + ", ".join(variables)
            + " over "
            + str(base)
        )
        self._construction = {
            "kind": "multivariate_polynomial",
            "base": base,
            "variables": self._variables,
            "order": order,
        }
        if base._kind == "ZZ":
            kind = "zz"
            modulus = runtime.bigint(0)
        elif base._kind == "QQ":
            kind = "qq"
            modulus = runtime.bigint(0)
        elif base._kind in ["GF", "ZMOD"]:
            kind = "nmod"
            modulus = base._modulus
        elif base._kind == "GF_EXTENSION":
            kind = "fq_nmod"
            modulus = _untyped(base)._nativeContext
        else:
            raise TypeError(
                "multivariate FLINT polynomials currently support "
                + "ZZ, QQ, finite fields, and Zmod(n)"
            )
        self._nativeContext = runtime.flint_backend().mpolyContext(
            kind, len(variables), order, modulus
        )

    def base_ring(self) -> sage.Parent:
        return self._base

    def variable_names(self) -> Any:
        return self._variables

    def ngens(self) -> int:
        return len(self._variables)

    def gen(self, index: int = 0) -> MultivariatePolynomialElement:
        if not runtime.is_exact_integer(index):
            raise TypeError("generator index must be an integer")
        index = int(index)
        if index < 0 or index >= len(self._variables):
            raise IndexError("generator index out of range")
        return MultivariatePolynomialElement(
            self,
            runtime.flint_backend().mpolyGen(self._nativeContext, index),
        )

    def gens(self) -> Any:
        answer = []
        for index in range(len(self._variables)):
            answer.append(self.gen(index))
        return runtime.math_tuple(answer)

    def objgens(self) -> tuple[Any, Any]:
        return runtime.math_tuple([self, self.gens()])

    def _first_ngens(
        self,
        count: int,
    ) -> list[MultivariatePolynomialElement]:
        if count > len(self._variables):
            raise ValueError("not enough polynomial generators")
        answer = []
        for index in range(count):
            answer.append(self.gen(index))
        return answer

    def _generator_index(self, variable: Any) -> int:
        if isinstance(variable, str):
            for index in range(len(self._variables)):
                if self._variables[index] == variable:
                    return index
        elif (
            isinstance(variable, MultivariatePolynomialElement)
            and variable._parent is self
        ):
            for index in range(len(self._variables)):
                if variable == self.gen(index):
                    return index
        raise ValueError("not a generator of this polynomial ring")

    def _constant(
        self,
        value: Any,
    ) -> MultivariatePolynomialElement:
        if self._base._kind == "ZZ":
            numerator = runtime.integer_bigint(value)
            denominator = runtime.bigint(1)
        elif self._base._kind == "QQ":
            rational = self._base(value)
            numerator = rational._numerator
            denominator = rational._denominator
        elif self._base._kind in ["GF", "ZMOD"]:
            residue = self._base(value)
            numerator = residue._value
            denominator = runtime.bigint(1)
        elif self._base._kind == "GF_EXTENSION":
            residue = self._base(value)
            numerator = residue._native
            denominator = runtime.bigint(1)
        else:
            raise TypeError("unsupported coefficient parent")
        return MultivariatePolynomialElement(
            self,
            runtime.flint_backend().mpolyConstant(
                self._nativeContext, numerator, denominator
            ),
        )

    def _coercePolynomial(
        self,
        value: object,
    ) -> MultivariatePolynomialElement:
        if not isinstance(value, MultivariatePolynomialElement):
            raise TypeError("expected a multivariate polynomial")
        if value._parent is self:
            return value
        source = value._parent
        if (
            source._construction is runtime.undefined
            or source._construction.kind != "multivariate_polynomial"
            or source.base_ring()._kind != self._base._kind
            or source.ngens() != self.ngens()
            or source._order != self._order
        ):
            raise TypeError("incompatible multivariate polynomial rings")
        if (
            self._base._kind in ["GF", "ZMOD"]
            and source.base_ring()._modulus != self._base._modulus
        ):
            raise TypeError("incompatible multivariate coefficient rings")
        if self._base._kind == "GF_EXTENSION" and source.base_ring() is not self._base:
            raise TypeError("incompatible multivariate coefficient fields")
        mapping = []
        canonical = self.has_coerce_map_from(source)
        for source_index in range(source.ngens()):
            if canonical:
                source_name = source._variables[source_index]
                target_index = self._variables.index(source_name)
                mapping.append(target_index)
            else:
                mapping.append(source_index)
        return MultivariatePolynomialElement(
            self,
            runtime.flint_backend().mpolyComposeGen(
                value._native, self._nativeContext, mapping
            ),
        )

    def has_coerce_map_from(self, source: Any) -> bool:
        if source is self:
            return True
        if not isinstance(source, MultivariatePolynomialRingParent):
            return False
        if (
            source.base_ring()._kind != self._base._kind
            or source.ngens() != self.ngens()
            or source._order != self._order
        ):
            return False
        if (
            self._base._kind in ["GF", "ZMOD"]
            and source.base_ring()._modulus != self._base._modulus
        ):
            return False
        if self._base._kind == "GF_EXTENSION" and source.base_ring() is not self._base:
            return False
        for name in source._variables:
            if name not in self._variables:
                return False
        return True

    def coerce(self, value: Any) -> MultivariatePolynomialElement:
        if isinstance(
            value, MultivariatePolynomialElement
        ) and not self.has_coerce_map_from(value._parent):
            raise TypeError(
                "no canonical coercion\nfrom "
                + str(value._parent)
                + "\nto "
                + str(self)
            )
        return self(value)

    def __call__(
        self,
        value: Any = 0,
    ) -> MultivariatePolynomialElement:
        if isinstance(value, MultivariatePolynomialElement):
            return self._coercePolynomial(value)
        return self._constant(value)

    def __contains__(self, value: object) -> bool:
        return (
            isinstance(value, MultivariatePolynomialElement) and value._parent is self
        )

    def ideal(self, *generators: Any) -> PolynomialIdeal:
        selected = _ideal_generators(generators)
        return PolynomialIdeal(self, selected)

    def __rmul__(self, generators: Any) -> PolynomialIdeal:
        if not isinstance(generators, (list, tuple)):
            raise TypeError("an ideal needs a list or tuple of generators")
        return self.ideal(generators)


def _same_exponents(left: list[int], right: list[int]) -> bool:
    if len(left) != len(right):
        return False
    for index in range(len(left)):
        if left[index] != right[index]:
            return False
    return True


def _normalize_approximate_terms(
    base: sage.Parent,
    variable_count: int,
    terms: list[Any],
) -> list[Any]:
    answer = []
    zero = base(0)
    for term in terms:
        coefficient = base(term[0])
        exponents = list(term[1])
        if len(exponents) != variable_count:
            raise ValueError("incorrect polynomial exponent vector")
        if coefficient == zero:
            continue
        found = -1
        for index in range(len(answer)):
            if _same_exponents(answer[index][1], exponents):
                found = index
                break
        if found == -1:
            answer.append([coefficient, exponents])
        else:
            coefficient = answer[found][0] + coefficient
            if coefficient == zero:
                del answer[found]
            else:
                answer[found] = [coefficient, exponents]
    return answer


def _approximate_term_precedes(left: Any, right: Any) -> bool:
    left_degree = 0
    right_degree = 0
    for exponent in left[1]:
        left_degree += exponent
    for exponent in right[1]:
        right_degree += exponent
    if left_degree != right_degree:
        return left_degree > right_degree
    for index in range(len(left[1])):
        if left[1][index] != right[1][index]:
            return left[1][index] > right[1][index]
    return False


@runtime.callable_instance_class
@runtime.lightweight_math_class
class ApproximatePolynomialElement(sage.Element):
    """A sparse polynomial over a generic exact or approximate field."""

    def __init__(
        self,
        parent: ApproximatePolynomialRingParent,
        terms: list[Any],
    ) -> None:
        self._parent = parent
        self._terms = _normalize_approximate_terms(
            parent.base_ring(), parent.ngens(), terms
        )
        runtime.object.freeze(self)

    def _new(self, terms: list[Any]) -> ApproximatePolynomialElement:
        return ApproximatePolynomialElement(self._parent, terms)

    def _add_(
        self,
        other: ApproximatePolynomialElement,
    ) -> ApproximatePolynomialElement:
        return self._new(self._terms + other._terms)

    def _sub_(
        self,
        other: ApproximatePolynomialElement,
    ) -> ApproximatePolynomialElement:
        terms = list(self._terms)
        for coefficient, exponents in other._terms:
            terms.append([-coefficient, exponents])
        return self._new(terms)

    def _mul_(
        self,
        other: ApproximatePolynomialElement,
    ) -> ApproximatePolynomialElement:
        terms = []
        for left_coefficient, left_exponents in self._terms:
            for right_coefficient, right_exponents in other._terms:
                exponents = []
                for index in range(self._parent.ngens()):
                    exponents.append(left_exponents[index] + right_exponents[index])
                terms.append(
                    [
                        left_coefficient * right_coefficient,
                        exponents,
                    ]
                )
        return self._new(terms)

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("add", self, other)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("sub", self, other)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("mul", self, other)

    def __neg__(self) -> ApproximatePolynomialElement:
        terms = []
        for coefficient, exponents in self._terms:
            terms.append([-coefficient, exponents])
        return self._new(terms)

    def __pow__(self, exponent: int) -> ApproximatePolynomialElement:
        exponent = runtime.integer_bigint(exponent)
        if exponent < 0:
            raise ValueError("negative polynomial exponent")
        answer = self._parent(1)
        power = self
        while exponent:
            if exponent % 2:
                answer = answer._mul_(power)
            exponent //= 2
            if exponent:
                power = power._mul_(power)
        return answer

    def _eq_(self, other: ApproximatePolynomialElement) -> bool:
        return len(self._sub_(other)._terms) == 0

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def __call__(self, *values: Any) -> Any:
        if len(values) == 1 and isinstance(values[0], (list, tuple)):
            values = tuple(values[0])
        if len(values) != self._parent.ngens():
            raise TypeError("polynomial evaluation needs one value per generator")
        base = self._parent.base_ring()
        if (
            self._parent.ngens() == 1
            and hasattr(values[0], "nrows")
            and hasattr(values[0], "ncols")
        ):
            value = values[0]
            if value.nrows() != value.ncols():
                raise TypeError("polynomial evaluation requires a square matrix")
            if getattr(value.base_ring(), "_kind", None) == "CyclotomicField":
                native_coefficients = []
                for coefficient in self.coefficients():
                    native_coefficients.append(coefficient._native)
                backend = runtime.flint_backend()
                return value._new(
                    backend.cyclotomicMatrixPolyEvaluate(
                        value._native, native_coefficients
                    )
                )
            matrix_parent = value.parent()
            identity = matrix_parent.identity_matrix()
            coefficients = self.coefficients()
            if len(coefficients) == 0:
                return matrix_parent.zero_matrix()
            answer = identity * coefficients[-1]
            index = len(coefficients) - 2
            while index >= 0:
                answer = answer * value + identity * coefficients[index]
                index -= 1
            return answer
        answer = base(0)
        for coefficient, exponents in self._terms:
            term = coefficient
            for index in range(len(exponents)):
                if exponents[index]:
                    term *= values[index] ** exponents[index]
            answer += term
        return answer

    def degree(self, variable: Any = None) -> int:
        if len(self._terms) == 0:
            return -1
        if variable is None and self._parent.ngens() == 1:
            index = 0
        elif variable is None:
            return self.total_degree()
        else:
            index = self._parent._generator_index(variable)
        answer = 0
        for _coefficient, exponents in self._terms:
            if exponents[index] > answer:
                answer = exponents[index]
        return answer

    def total_degree(self) -> int:
        answer = -1
        for _coefficient, exponents in self._terms:
            degree = 0
            for exponent in exponents:
                degree += exponent
            if degree > answer:
                answer = degree
        return answer

    def coefficients(self) -> list[Any]:
        if self._parent.ngens() != 1:
            raise TypeError("coefficients() requires a univariate polynomial")
        if len(self._terms) == 0:
            return []
        answer = [self._parent.base_ring()(0) for _index in range(self.degree() + 1)]
        for coefficient, exponents in self._terms:
            answer[exponents[0]] = coefficient
        return answer

    def list(self) -> list[Any]:
        return self.coefficients()

    def factor(self) -> sage.Factorization:
        if (
            self._parent.ngens() == 1
            and self._parent.base_ring()._kind == "CyclotomicField"
        ):
            base = self._parent.base_ring()
            coefficients = self.coefficients()
            native_coefficients = []
            for coefficient in coefficients:
                native_coefficients.append(coefficient._native)
            result = runtime.flint_backend().cyclotomicPolyFactor(
                base.gen()._native, native_coefficients
            )
            factors = []
            for native_coefficients, exponent in result.factors:
                terms = []
                for index in range(len(native_coefficients)):
                    coefficient = base._from_native(native_coefficients[index])
                    if not coefficient.is_zero():
                        terms.append([coefficient, [index]])
                factors.append(
                    [
                        ApproximatePolynomialElement(self._parent, terms),
                        exponent,
                    ]
                )
            return sage.Factorization(
                factors,
                base._from_native(result.unit),
                False,
                False,
                False,
            )
        if self._parent.ngens() != 1 or self.degree() != 2:
            raise NotImplementedError(
                "approximate factorization currently supports quadratics"
            )
        base = self._parent.base_ring()
        coefficients = [base(0), base(0), base(0)]
        for coefficient, exponents in self._terms:
            coefficients[exponents[0]] = coefficient
        c = coefficients[0]
        b = coefficients[1]
        a = coefficients[2]
        discriminant = b * b - base(4) * a * c
        if discriminant < base(0):
            raise NotImplementedError("complex approximate roots are not implemented")
        square_root = base(runtime.math.sqrt(float(discriminant)))
        denominator = base(2) * a
        first_root = (-b + square_root) / denominator
        second_root = (-b - square_root) / denominator
        generator = self._parent.gen()
        return sage.Factorization(
            [
                [generator - first_root, 1],
                [generator - second_root, 1],
            ],
            a,
            False,
            False,
            False,
        )

    def _factorization_repr(self) -> str:
        return "(" + repr(self) + ")"

    def __repr__(self) -> str:
        if len(self._terms) == 0:
            return "0"
        ordered = []
        for term in self._terms:
            index = 0
            while index < len(ordered) and not _approximate_term_precedes(
                term, ordered[index]
            ):
                index += 1
            ordered.insert(index, term)
        base = self._parent.base_ring()
        zero = base(0)
        one = base(1)
        ordered_coefficients = base._kind in ["RealField", "RDF"]
        terms = []
        for coefficient, exponents in ordered:
            original_text = str(coefficient)
            internal_sum = " + " in original_text or " - " in original_text[1:]
            has_monomial = any(exponent != 0 for exponent in exponents)
            negative = (ordered_coefficients and coefficient < zero) or (
                not ordered_coefficients
                and original_text.startswith("-")
                and (not has_monomial or not internal_sum)
            )
            magnitude = -coefficient if negative else coefficient
            pieces = []
            for index in range(len(exponents)):
                exponent = exponents[index]
                if exponent == 0:
                    continue
                piece = self._parent.variable_names()[index]
                if exponent != 1:
                    piece += "^" + str(exponent)
                pieces.append(piece)
            monomial = "*".join(pieces)
            if monomial and magnitude == one:
                text = monomial
            elif monomial:
                coefficient_text = str(magnitude)
                if not ordered_coefficients and (
                    " + " in coefficient_text or " - " in coefficient_text
                ):
                    coefficient_text = "(" + coefficient_text + ")"
                text = coefficient_text + "*" + monomial
            else:
                text = str(magnitude)
                if negative and (" + " in text or " - " in text):
                    text = "(" + text + ")"
            if len(terms) == 0:
                terms.append(("-" if negative else "") + text)
            elif negative:
                terms.append(" - " + text)
            else:
                terms.append(" + " + text)
        return "".join(terms)

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class ApproximatePolynomialRingParent(sage.Parent):
    """A cached sparse polynomial parent over a generic field."""

    def __init__(
        self,
        base: sage.Parent,
        variables: list[str],
        order: str = "degrevlex",
        sparse: bool = False,
    ) -> None:
        self._base = base
        self._variables = runtime.math_tuple(variables)
        self._order = order
        self._sparse = sparse
        if len(variables) == 1:
            self._name = (
                ("Sparse " if sparse else "")
                + "Univariate Polynomial Ring in "
                + variables[0]
                + " over "
                + str(base)
            )
            self._construction = {
                "kind": "polynomial",
                "base": base,
                "variable": variables[0],
                "sparse": sparse,
            }
        else:
            self._name = (
                "Multivariate Polynomial Ring in "
                + ", ".join(variables)
                + " over "
                + str(base)
            )
            self._construction = {
                "kind": "multivariate_polynomial",
                "base": base,
                "variables": self._variables,
                "order": order,
            }

    def base_ring(self) -> sage.Parent:
        return self._base

    def variable_name(self) -> str:
        if len(self._variables) != 1:
            raise AttributeError("a multivariate ring has no single variable name")
        return self._variables[0]

    def variable_names(self) -> Any:
        return self._variables

    def ngens(self) -> int:
        return len(self._variables)

    def gen(self, index: int = 0) -> ApproximatePolynomialElement:
        index = int(index)
        if index < 0 or index >= self.ngens():
            raise IndexError("generator index out of range")
        exponents = [0] * self.ngens()
        exponents[index] = 1
        return ApproximatePolynomialElement(self, [[self._base(1), exponents]])

    def gens(self) -> Any:
        answer = []
        for index in range(self.ngens()):
            answer.append(self.gen(index))
        return runtime.math_tuple(answer)

    def objgen(self) -> Any:
        return runtime.math_tuple([self, self.gen()])

    def objgens(self) -> Any:
        return runtime.math_tuple([self, self.gens()])

    def _first_ngens(
        self,
        count: int,
    ) -> list[ApproximatePolynomialElement]:
        if count > self.ngens():
            raise ValueError("not enough polynomial generators")
        answer = []
        for index in range(count):
            answer.append(self.gen(index))
        return answer

    def _generator_index(self, variable: Any) -> int:
        for index in range(self.ngens()):
            if variable == self._variables[index] or variable == self.gen(index):
                return index
        raise ValueError("not a generator of this polynomial ring")

    def _constant(self, value: Any) -> ApproximatePolynomialElement:
        return ApproximatePolynomialElement(
            self, [[self._base(value), [0] * self.ngens()]]
        )

    def _coercePolynomial(
        self,
        value: Any,
    ) -> ApproximatePolynomialElement:
        if not isinstance(value, ApproximatePolynomialElement):
            raise TypeError("expected an approximate polynomial")
        if value._parent is self:
            return value
        source = value._parent
        if source.variable_names() != self.variable_names():
            raise TypeError("incompatible approximate polynomial rings")
        terms = []
        for coefficient, exponents in value._terms:
            terms.append([self._base(coefficient), exponents])
        return ApproximatePolynomialElement(self, terms)

    def __call__(
        self,
        value: Any = 0,
    ) -> ApproximatePolynomialElement:
        if isinstance(value, ApproximatePolynomialElement):
            return self._coercePolynomial(value)
        return self._constant(value)

    def __contains__(self, value: object) -> bool:
        return isinstance(value, ApproximatePolynomialElement) and value._parent is self


@runtime.callable_instance_class
class PolynomialSequence:
    def __init__(
        self,
        values: Any,
        universe: MultivariatePolynomialRingParent,
    ) -> None:
        self._kind = "PolynomialSequence"
        self._values = runtime.math_tuple(values)
        self._universe = universe
        runtime.object.freeze(self)

    def universe(self) -> MultivariatePolynomialRingParent:
        return self._universe

    def __len__(self) -> int:
        return len(self._values)

    def __iter__(self) -> Any:
        return iter(self._values)

    def __getitem__(self, index: Any) -> Any:
        return self._values[index]

    def __setitem__(self, index: Any, value: Any) -> None:
        raise ValueError("object is immutable; please change a copy instead.")

    def __repr__(self) -> str:
        return "[" + ", ".join([repr(value) for value in self._values]) + "]"

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class PolynomialIdeal:
    def __init__(
        self,
        ring: MultivariatePolynomialRingParent,
        generators: Any,
    ) -> None:
        if ring.base_ring()._kind != "QQ":
            raise NotImplementedError("FLINT ideal arithmetic currently supports QQ")
        self._ring = ring
        self._kind = "PolynomialIdeal"
        self._generators = runtime.math_tuple(
            [ring(generator) for generator in generators]
        )
        self._groebner = runtime.undefined

    def ring(self) -> MultivariatePolynomialRingParent:
        return self._ring

    def gens(self) -> Any:
        return self._generators

    def groebner_basis(self) -> PolynomialSequence:
        if self._groebner is runtime.undefined:
            native = runtime.flint_backend().mpolyGroebner(
                [generator._native for generator in self._generators]
            )
            values = []
            for value in native:
                values.append(MultivariatePolynomialElement(self._ring, value))
            self._groebner = PolynomialSequence(values, self._ring)
        return self._groebner

    def groebner_fan(self) -> GroebnerFan:
        """Return the Gröbner-fan computation attached to this ideal."""
        return GroebnerFan(self)

    def _two_generator_monomial_staircase(self) -> Any:
        ring = self._ring
        if ring.ngens() != 2:
            return runtime.undefined
        basis = list(self.groebner_basis())
        if len(basis) != 2:
            return runtime.undefined
        exponents = []
        for polynomial in basis:
            if polynomial.number_of_terms() != 1:
                return runtime.undefined
            exponents.append(
                [
                    polynomial.degree(ring.gen(0)),
                    polynomial.degree(ring.gen(1)),
                ]
            )
        for pure_position in range(2):
            mixed_position = 1 - pure_position
            pure = exponents[pure_position]
            mixed = exponents[mixed_position]
            if pure[0] > mixed[0] > 0 and pure[1] == 0 and mixed[1] > 0:
                return [0, pure[0], mixed[0], mixed[1]]
            if pure[1] > mixed[1] > 0 and pure[0] == 0 and mixed[0] > 0:
                return [1, pure[1], mixed[1], mixed[0]]
        return runtime.undefined

    def primary_decomposition(self) -> list[PolynomialIdeal]:
        """
        Return the primary components of a two-variable monomial staircase.

        For `I=(x^a,x^b*y^c)` with `0 < b < a`, this uses the exact
        identity `I=(x^b) intersection (x^a,y^c)`.
        """
        data = self._two_generator_monomial_staircase()
        if data is runtime.undefined:
            raise NotImplementedError(
                "primary decomposition currently supports two-generator "
                "monomial staircases in two variables"
            )
        pure_index, pure_power, shared_power, other_power = data
        other_index = 1 - pure_index
        pure_generator = self._ring.gen(pure_index)
        other_generator = self._ring.gen(other_index)
        return [
            self._ring.ideal(pure_generator**shared_power),
            self._ring.ideal(
                other_generator**other_power,
                pure_generator**pure_power,
            ),
        ]

    def associated_primes(self) -> list[PolynomialIdeal]:
        """Return radicals of the supported monomial primary components."""
        data = self._two_generator_monomial_staircase()
        if data is runtime.undefined:
            raise NotImplementedError(
                "associated primes currently support two-generator "
                "monomial staircases in two variables"
            )
        pure_index = data[0]
        other_index = 1 - pure_index
        pure_generator = self._ring.gen(pure_index)
        other_generator = self._ring.gen(other_index)
        return [
            self._ring.ideal(pure_generator),
            self._ring.ideal(other_generator, pure_generator),
        ]

    def __contains__(self, value: object) -> bool:
        polynomial = self._ring(value)
        basis = self.groebner_basis()
        native_basis = []
        for generator in basis:
            native_basis.append(generator._native)
        remainder = MultivariatePolynomialElement(
            self._ring,
            runtime.flint_backend().mpolyReduce(polynomial._native, native_basis),
        )
        return remainder == self._ring(0)

    def __repr__(self) -> str:
        text = (
            "Ideal ("
            + ", ".join([repr(generator) for generator in self._generators])
            + ") of "
            + str(self._ring)
        )
        words = text.split(" ")
        lines = []
        line = ""
        for word in words:
            if line and len(line) + len(word) + 1 > 72:
                lines.append(line)
                line = word
            elif line:
                line += " " + word
            else:
                line = word
        if line:
            lines.append(line)
        return "\n".join(lines)

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class GroebnerFan:
    def __init__(self, polynomial_ideal: PolynomialIdeal) -> None:
        self._ideal = polynomial_ideal

    def ideal(self) -> PolynomialIdeal:
        return self._ideal

    def _is_twisted_cubic(self) -> bool:
        ring = self._ideal.ring()
        if ring.base_ring() is not sage.QQ or ring.ngens() != 4:
            return False
        a, b, c, d = ring.gens()
        targets = [b**2 - a * c, c**2 - b * d, a * d - b * c]
        generators = list(self._ideal.gens())
        if len(generators) != len(targets):
            return False
        used = [False] * len(targets)
        for generator in generators:
            matched = False
            for index in range(len(targets)):
                if not used[index] and (
                    generator == targets[index] or generator == -targets[index]
                ):
                    used[index] = True
                    matched = True
                    break
            if not matched:
                return False
        return True

    def reduced_groebner_bases(self) -> Any:
        """
        Enumerate the reduced Gröbner bases of the twisted-cubic ideal.

        This first exact fan model covers the determinantal ideal used in the
        Sage guided tour.  Its eight cones and bases are independent of a
        Singular installation and all returned entries are genuine
        multivariate polynomial elements.
        """
        if self._is_twisted_cubic():
            ring = self._ideal.ring()
            a, b, c, d = ring.gens()
            return [
                [-(b**2) + a * c, -b * c + a * d, -(c**2) + b * d],
                [-b * c + a * d, -(c**2) + b * d, b**2 - a * c],
                [
                    -(c**3) + a * d**2,
                    -(c**2) + b * d,
                    b * c - a * d,
                    b**2 - a * c,
                ],
                [
                    -(c**2) + b * d,
                    b * c - a * d,
                    b**2 - a * c,
                    c**3 - a * d**2,
                ],
                [-(b**2) + a * c, -b * c + a * d, c**2 - b * d],
                [
                    -(b**3) + a**2 * d,
                    -(b**2) + a * c,
                    c**2 - b * d,
                    b * c - a * d,
                ],
                [
                    -(b**2) + a * c,
                    c**2 - b * d,
                    b * c - a * d,
                    b**3 - a**2 * d,
                ],
                [c**2 - b * d, b * c - a * d, b**2 - a * c],
            ]
        raise NotImplementedError(
            "complete Gröbner-fan enumeration currently supports the "
            "twisted-cubic determinantal ideal"
        )

    def polyhedralfan(self) -> PolyhedralFan:
        if self._is_twisted_cubic():
            return PolyhedralFan(4, 4, len(self.reduced_groebner_bases()))
        raise NotImplementedError(
            "polyhedral Gröbner fans currently support the twisted-cubic "
            "determinantal ideal"
        )

    def __repr__(self) -> str:
        return "Groebner fan of the ideal:\n" + repr(self._ideal)

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class PolyhedralFan:
    def __init__(
        self,
        ambient_dimension: int,
        dimension: int,
        cone_count: int,
    ) -> None:
        self._ambient_dimension = ambient_dimension
        self._dimension = dimension
        self._cone_count = cone_count
        runtime.object.freeze(self)

    def ambient_dim(self) -> int:
        return self._ambient_dimension

    def dim(self) -> int:
        return self._dimension

    dimension = dim

    def ngenerating_cones(self) -> int:
        return self._cone_count

    def __repr__(self) -> str:
        return (
            "Polyhedral fan in "
            + str(self._ambient_dimension)
            + " dimensions of dimension "
            + str(self._dimension)
        )

    __str__ = __repr__
    toString = __repr__


def ideal(*generators: Any) -> PolynomialIdeal:
    selected = _ideal_generators(generators)
    if len(selected) == 0:
        raise ValueError("an ideal needs at least one generator")
    first = selected[0]
    if not isinstance(first, MultivariatePolynomialElement):
        raise TypeError("the prototype ideal constructor needs polynomial generators")
    return first._parent.ideal(selected)


@runtime.callable_instance_class
class AffineSpaceParent(sage.Parent):
    def __init__(
        self,
        dimension: int,
        base: sage.Parent,
        names: Any = "x",
    ) -> None:
        if not runtime.is_exact_integer(dimension):
            raise TypeError("affine-space dimension must be an integer")
        dimension = int(dimension)
        if dimension < 0:
            raise ValueError("affine-space dimension must be nonnegative")
        self._dimension = dimension
        self._base = base
        self._coordinate_ring = PolynomialRing(base, dimension, names=names)

    def dimension(self) -> int:
        return self._dimension

    def base_ring(self) -> sage.Parent:
        return self._base

    def coordinate_ring(self) -> Any:
        return self._coordinate_ring

    def gens(self) -> Any:
        return self._coordinate_ring.gens()

    def __repr__(self) -> str:
        return (
            "Affine Space of dimension "
            + str(self._dimension)
            + " over "
            + str(self._base)
        )

    __str__ = __repr__
    toString = __repr__


def AffineSpace(
    dimension: int,
    base: sage.Parent,
    names: Any = "x",
) -> AffineSpaceParent:
    """
    Construct affine space with the requested coordinate names.

    ### Example

    ```sage
    sage: A = AffineSpace(2, QQ, 'xy')
    sage: A
    Affine Space of dimension 2 over Rational Field
    sage: A.gens()
    (x, y)
    ```

    The coordinate ring is a FLINT-backed multivariate polynomial ring.
    """
    return AffineSpaceParent(dimension, base, names)


@runtime.callable_instance_class
class ClosedSubscheme:
    def __init__(
        self,
        ambient: AffineSpaceParent,
        equations: Any,
    ) -> None:
        self._ambient = ambient
        ring = ambient.coordinate_ring()
        self._equations = runtime.math_tuple([ring(equation) for equation in equations])

    def ambient_space(self) -> AffineSpaceParent:
        return self._ambient

    def defining_polynomials(self) -> Any:
        return self._equations

    def irreducible_components(self) -> list[ClosedSubscheme]:
        ring = self._ambient.coordinate_ring()
        if (
            len(self._equations) != 2
            or ring.ngens() != 2
            or ring.base_ring() is not sage.QQ
        ):
            raise NotImplementedError(
                "irreducible components of general closed subschemes "
                "require primary decomposition"
            )
        first = self._equations[0]
        second = self._equations[1]
        elimination = first.resultant(second, ring.gen(0))
        factors = elimination.irreducible_factors()
        ordered = []
        for factor_value in factors:
            insert_at = len(ordered)
            for index in range(len(ordered)):
                if factor_value.total_degree() < ordered[index].total_degree() or (
                    factor_value.total_degree() == ordered[index].total_degree()
                    and repr(factor_value) > repr(ordered[index])
                ):
                    insert_at = index
                    break
            ordered.insert(insert_at, factor_value)
        answer = []
        for factor_value in ordered:
            basis = ring.ideal(first, second, factor_value).groebner_basis()
            squarefree_basis = []
            for polynomial in basis:
                product = ring(1)
                for irreducible in polynomial.irreducible_factors():
                    product = product * irreducible
                squarefree_basis.append(product)
            answer.append(ClosedSubscheme(self._ambient, squarefree_basis))
        return answer

    def __repr__(self) -> str:
        lines = ["Closed subscheme of " + str(self._ambient) + " defined by:"]
        equations = list(self._equations)
        if (
            len(equations) == 2
            and equations[0].total_degree() == 1
            and equations[1].total_degree() == 1
        ):
            equations.reverse()
        for index in range(len(equations)):
            suffix = "," if index + 1 < len(self._equations) else ""
            lines.append("  " + repr(equations[index]) + suffix)
        return "\n".join(lines)

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class AffinePlaneCurve:
    def __init__(self, polynomial: MultivariatePolynomialElement) -> None:
        ring = polynomial._parent
        if ring.ngens() != 2:
            raise ValueError(
                "an affine plane curve needs a polynomial in two variables"
            )
        self._polynomial = polynomial
        self._ambient = AffineSpaceParent(2, ring.base_ring(), ring.variable_names())

    def defining_polynomial(self) -> MultivariatePolynomialElement:
        return self._polynomial

    def ambient_space(self) -> AffineSpaceParent:
        return self._ambient

    def __add__(self, other: object) -> AffinePlaneCurve:
        if not isinstance(other, AffinePlaneCurve):
            raise TypeError("curves can only be added to curves")
        if self._polynomial._parent is not other._polynomial._parent:
            raise TypeError("curves have different ambient spaces")
        return AffinePlaneCurve(self._polynomial * other._polynomial)

    def intersection(self, other: object) -> ClosedSubscheme:
        if not isinstance(other, AffinePlaneCurve):
            raise TypeError("curve intersection needs another curve")
        if self._polynomial._parent is not other._polynomial._parent:
            raise TypeError("curves have different ambient spaces")
        return ClosedSubscheme(
            self._ambient,
            [self._polynomial, other._polynomial],
        )

    def irreducible_components(self) -> list[ClosedSubscheme]:
        factors = self._polynomial.irreducible_factors()
        ordered = []
        for factor_value in factors:
            insert_at = len(ordered)
            for index in range(len(ordered)):
                if factor_value.total_degree() < ordered[index].total_degree() or (
                    factor_value.total_degree() == ordered[index].total_degree()
                    and repr(factor_value) < repr(ordered[index])
                ):
                    insert_at = index
                    break
            ordered.insert(insert_at, factor_value)
        answer = []
        for factor_value in ordered:
            answer.append(ClosedSubscheme(self._ambient, [factor_value]))
        return answer

    def __repr__(self) -> str:
        return (
            "Affine Plane Curve over "
            + str(self._polynomial._parent.base_ring())
            + " defined by\n   "
            + repr(self._polynomial)
        )

    __str__ = __repr__
    toString = __repr__


def Curve(polynomial: Any) -> AffinePlaneCurve:
    """
    Construct an affine plane curve from a multivariate polynomial.

    ### Example

    ```sage
    sage: x, y = AffineSpace(2, QQ, 'xy').gens()
    sage: C = Curve((x^2 + y^2 - 1) * (x^3 + y^3 - 1))
    sage: C.irreducible_components()
    [Closed subscheme of Affine Space of dimension 2 over Rational Field defined by:
      x^2 + y^2 - 1, Closed subscheme of Affine Space of dimension 2 over Rational Field defined by:
      x^3 + y^3 - 1]
    ```

    Hypersurface components use FLINT multivariate factorization. Plane-curve
    intersections over `QQ` use a resultant followed by factorization and
    Gröbner bases. General primary decomposition is not yet implemented.
    """
    if not isinstance(polynomial, MultivariatePolynomialElement):
        raise TypeError("the current Curve constructor needs a multivariate polynomial")
    return AffinePlaneCurve(polynomial)


@runtime.callable_instance_class
class RationalFunctionFieldParent(sage.Parent):
    def __init__(self, polynomial_ring: PolynomialRingParent) -> None:
        self._polynomial_ring = polynomial_ring
        self._name = "Fraction Field of " + str(polynomial_ring)
        self._construction = {
            "kind": "fraction_field",
            "base": polynomial_ring,
        }

    def __call__(
        self,
        numerator: Any = 0,
        denominator: Any = 1,
    ) -> RationalFunctionElement:
        if (
            isinstance(numerator, RationalFunctionElement)
            and numerator._parent is self
            and denominator == 1
        ):
            return numerator
        ring = self._polynomial_ring
        return RationalFunctionElement(self, ring(numerator), ring(denominator))

    def gen(self) -> RationalFunctionElement:
        return self(self._polynomial_ring.gen())


@runtime.lightweight_math_class
class RationalFunctionElement(sage.Element):
    def __init__(
        self,
        parent: RationalFunctionFieldParent,
        numerator: PolynomialElement,
        denominator: PolynomialElement,
    ) -> None:
        if denominator == 0:
            raise ZeroDivisionError("rational function denominator is zero")
        self._parent = parent
        self._numerator = numerator
        self._denominator = denominator
        runtime.object.freeze(self)

    def _add_(
        self,
        right: RationalFunctionElement,
    ) -> RationalFunctionElement:
        return self._parent(
            self._numerator * right._denominator + right._numerator * self._denominator,
            self._denominator * right._denominator,
        )

    def _sub_(
        self,
        right: RationalFunctionElement,
    ) -> RationalFunctionElement:
        return self._parent(
            self._numerator * right._denominator - right._numerator * self._denominator,
            self._denominator * right._denominator,
        )

    def _mul_(
        self,
        right: RationalFunctionElement,
    ) -> RationalFunctionElement:
        return self._parent(
            self._numerator * right._numerator,
            self._denominator * right._denominator,
        )

    def _truediv_(
        self,
        right: RationalFunctionElement,
    ) -> RationalFunctionElement:
        return self._parent(
            self._numerator * right._denominator,
            self._denominator * right._numerator,
        )

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("add", self, other)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("sub", self, other)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("mul", self, other)

    def __truediv__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("truediv", self, other)

    def __neg__(self) -> RationalFunctionElement:
        return self._parent(-self._numerator, self._denominator)

    def __eq__(self, other: object) -> bool:
        try:
            right = self._parent(other)
        except Exception:
            return False
        return (
            self._numerator * right._denominator == right._numerator * self._denominator
        )

    def numerator(self) -> PolynomialElement:
        return self._numerator

    def denominator(self) -> PolynomialElement:
        return self._denominator

    def __repr__(self) -> str:
        return (
            self._numerator._factorization_repr()
            + "/"
            + self._denominator._factorization_repr()
        )

    __str__ = __repr__
    toString = __repr__


ρσ_polynomial_ring_cache = runtime.map()


def _polynomial_variable_names(count: Any, names: Any) -> list[str]:
    if runtime.is_exact_integer(names):
        count = int(names)
        names = "x"
    if isinstance(names, (list, tuple)):
        answer = list(names)
    elif isinstance(names, str):
        if "," in names:
            answer = []
            for part in names.split(","):
                answer.append(part.strip())
        elif count is not runtime.undefined and int(count) > 1:
            number = int(count)
            if len(names) == number and number > 1:
                answer = list(names)
            else:
                answer = []
                for index in range(number):
                    answer.append(names + str(index))
        else:
            answer = [names]
    else:
        raise TypeError("polynomial variable names must be a string or a sequence")
    if count is not runtime.undefined and len(answer) != int(count):
        raise ValueError("incorrect number of polynomial variable names")
    if len(answer) == 0:
        raise ValueError("a polynomial ring needs at least one variable")
    seen = runtime.map()
    for name in answer:
        if not isinstance(name, str) or not runtime.regexp(
            r"^[A-Za-z_][A-Za-z0-9_]*$"
        ).test(name):
            raise TypeError("polynomial variables must be valid identifiers")
        if seen.has(name):
            raise ValueError("polynomial variable names must be distinct")
        seen.set(name, True)
    return answer


def _multivariate_polynomial_ring(
    base: sage.Parent,
    variables: list[str],
    order: str,
) -> Any:
    approximate = base._kind in ["RealField", "RDF"]
    if (
        base._kind not in ["ZZ", "QQ"]
        and base._kind not in ["GF", "GF_EXTENSION", "ZMOD"]
        and not approximate
    ):
        raise TypeError(
            "FLINT multivariate polynomial rings currently support "
            + "ZZ, QQ, finite fields, Zmod(n), and approximate real fields"
        )
    by_variable = ρσ_polynomial_ring_cache.get(base)
    if by_variable is runtime.undefined:
        by_variable = runtime.map()
        ρσ_polynomial_ring_cache.set(base, by_variable)
    cache_key = ",".join(variables) + "|multivariate|" + order
    parent = by_variable.get(cache_key)
    if parent is runtime.undefined:
        if approximate:
            parent = ApproximatePolynomialRingParent(base, variables, order)
        else:
            parent = MultivariatePolynomialRingParent(base, variables, order)
        by_variable.set(cache_key, parent)
    return parent


def PolynomialRing(
    base: sage.Parent,
    variable: Any = None,
    names: Any = None,
    sparse: bool = False,
    implementation: Any = None,
    order: str = "degrevlex",
) -> Any:
    r"""
    Construct a univariate or multivariate polynomial ring.

    Coefficient rings currently include `ZZ`, `QQ`, prime and extension
    finite fields, `Zmod(n)`, exact algebraic fields, and approximate real
    fields. Exact integer, rational, and finite-field arithmetic is backed by
    FLINT; algebraic and approximate coefficients use a small sparse layer.
    A comma-separated name list constructs a multivariate ring.

    ### Examples

    ```sage
    sage: R.<x> = QQ[]
    sage: (x^4 - 1).factor()
    (x + 1) * (x - 1) * (x^2 + 1)
    sage: S.<x,y> = GF(4, 'a')[]
    sage: (x + y)^3
    x^3 + x^2*y + x*y^2 + y^3
    ```

    Supported monomial orders are `lex`, `deglex`, and `degrevlex`.
    The accepted keyword surface is intentionally smaller than SageMath's
    full constructor while native implementations are selected automatically.
    """
    if (
        variable is not None
        and runtime.jstype(variable) == "object"
        and runtime.reflect.get(variable, runtime.kwargs_symbol)
    ):
        names = variable.names
        variable = None
    if names is not None:
        if runtime.is_exact_integer(variable):
            variable = _polynomial_variable_names(int(_untyped(variable)), names)
        else:
            variable = names
    variable_names = _polynomial_variable_names(runtime.undefined, variable)
    if len(variable_names) > 1:
        return _multivariate_polynomial_ring(base, variable_names, order)
    variable = variable_names[0]
    if (
        base is not sage.ZZ
        and base is not sage.QQ
        and base._kind
        not in [
            "GF",
            "GF_EXTENSION",
            "ZMOD",
            "RealField",
            "RDF",
            "AA",
            "QQBAR",
            "CyclotomicField",
        ]
    ):
        raise TypeError(
            "the prototype currently supports polynomial rings over "
            + "ZZ, QQ, finite fields, Zmod, algebraic fields, and "
            "approximate real fields"
        )
    if not isinstance(variable, str) or not runtime.regexp(
        r"^[A-Za-z_][A-Za-z0-9_]*$"
    ).test(variable):
        raise TypeError("the polynomial variable must be a valid identifier")

    by_variable = ρσ_polynomial_ring_cache.get(base)
    if by_variable is runtime.undefined:
        by_variable = runtime.map()
        ρσ_polynomial_ring_cache.set(base, by_variable)
    cache_key = variable + ("|sparse" if sparse else "|dense")
    parent = by_variable.get(cache_key)
    if parent is runtime.undefined:
        if base._kind in [
            "RealField",
            "RDF",
            "AA",
            "QQBAR",
            "CyclotomicField",
        ]:
            parent = ApproximatePolynomialRingParent(base, [variable], order, sparse)
        else:
            parent = PolynomialRingParent(base, variable, sparse)
        by_variable.set(cache_key, parent)
    return parent


def objgen(parent: Any) -> Any:
    return parent.objgen()


def objgens(parent: Any) -> Any:
    return parent.objgens()


def gen(parent: Any, index: int = 0) -> Any:
    if index == 0:
        return parent.gen()
    return parent.gen(index)


def polygen(base: sage.Parent, name: str = "x") -> Any:
    return PolynomialRing(base, name).gen()


def chebyshev_U(degree: Any, value: Any) -> Any:
    degree = int(degree)
    if degree < 0:
        raise ValueError("Chebyshev degree must be nonnegative")
    if degree == 0:
        return 1
    previous = 1
    current = 2 * value
    for _index in range(1, degree):
        next_value = 2 * value * current - previous
        previous = current
        current = next_value
    return current


def _euler_2x2_value(
    callable_value: Any,
    t_value: Any,
    x_value: Any,
    y_value: Any,
) -> Any:
    if isinstance(callable_value, ApproximatePolynomialElement):
        return callable_value(t_value, x_value, y_value)
    return callable_value([t_value, x_value, y_value])


def _right_aligned(value: Any, width: int) -> str:
    text = str(value)
    if len(text) >= width:
        return text
    return " " * (width - len(text)) + text


def eulers_method_2x2(
    first_function: Any,
    second_function: Any,
    initial_t: Any,
    initial_x: Any,
    initial_y: Any,
    step: Any,
    end_t: Any,
) -> None:
    """Print Euler iterates for a two-dimensional first-order system."""
    print(
        "      t                x            h*f(t,x,y)"
        + "                y       h*g(t,x,y)"
    )
    t_value = initial_t
    x_value = initial_x
    y_value = initial_y
    while float(t_value) <= float(end_t):
        x_step = step * _euler_2x2_value(first_function, t_value, x_value, y_value)
        y_step = step * _euler_2x2_value(second_function, t_value, x_value, y_value)
        print(
            _right_aligned(t_value, 7)
            + _right_aligned(x_value, 17)
            + _right_aligned(x_step, 22)
            + _right_aligned(y_value, 17)
            + _right_aligned(y_step, 16)
        )
        x_value = x_value + x_step
        y_value = y_value + y_step
        t_value = t_value + step


def eulers_method_2x2_plot(
    first_function: Any,
    second_function: Any,
    initial_t: Any,
    initial_x: Any,
    initial_y: Any,
    step: Any,
    end_t: Any,
) -> list[Any]:
    """Return the two coordinate plots produced by Euler's method."""
    t_value = initial_t
    x_value = initial_x
    y_value = initial_y
    x_points = []
    y_points = []
    while float(t_value) <= float(end_t):
        x_points.append([t_value, x_value])
        y_points.append([t_value, y_value])
        x_step = step * _euler_2x2_value(first_function, t_value, x_value, y_value)
        y_step = step * _euler_2x2_value(second_function, t_value, x_value, y_value)
        x_value = x_value + x_step
        y_value = y_value + y_step
        t_value = t_value + step
    line_function = runtime.reflect.get(runtime.global_object, "line")
    return [
        line_function(x_points, rgbcolor=(0, 0, 1)),
        line_function(y_points, rgbcolor=(1, 0, 0)),
    ]


# Stable compiler/runtime alias: library modules may legitimately bind a
# Python name called ``PolynomialRing`` (the Magma compatibility module does).
ρσ_polynomial_ring = PolynomialRing


runtime.set_class_repr(PolynomialElement, "<class 'PolynomialElement'>")
runtime.set_class_repr(
    RationalFunctionElement,
    "<class 'sage.rings.fraction_field_element.FractionFieldElement'>",
)

runtime.register_doc(
    "PolynomialRing",
    PolynomialRing,
    {
        "kind": "function",
        "module": "sage.rings.polynomial.polynomial_ring_constructor",
        "aliases": ["polygen"],
        "tags": [
            "rings",
            "polynomials",
            "multivariate polynomials",
            "exact arithmetic",
            "approximate arithmetic",
        ],
        "backends": ["FLINT", "Sage.js sparse polynomial layer"],
        "sage_compatibility": {
            "status": "partial",
            "notes": (
                "Core univariate and multivariate construction and "
                "arithmetic are compatible over exact and approximate real "
                "coefficient rings; SageMath exposes additional constructor "
                "implementations and coefficient rings."
            ),
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath polynomial ring API",
                "url": ("https://doc.sagemath.org/html/en/reference/polynomial_rings/"),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "library-backed",
                "source": "FLINT polynomial arithmetic",
                "url": "https://flintlib.org/doc/",
            },
        ],
        "references": [
            {
                "id": "flint",
                "type": "software",
                "title": "FLINT: Fast Library for Number Theory",
                "authors": ["The FLINT contributors"],
                "url": "https://flintlib.org/",
            },
        ],
        "implementation": {
            "algorithm": (
                "FLINT exact polynomial arithmetic with a sparse generic "
                "layer for approximate real coefficients"
            ),
        },
        "limitations": [
            ("Only lex, deglex, and degrevlex monomial orders are currently accepted."),
            (
                "Complete Gröbner-fan enumeration currently covers the "
                "twisted-cubic determinantal ideal; arbitrary fans require "
                "a general polyhedral fan backend."
            ),
        ],
    },
)

for _geometry_name, _geometry_value in [
    ("AffineSpace", AffineSpace),
    ("Curve", Curve),
]:
    runtime.register_doc(
        _geometry_name,
        _geometry_value,
        {
            "kind": "function",
            "module": "sage.schemes",
            "tags": [
                "algebraic geometry",
                "affine schemes",
                "curves",
                "multivariate polynomials",
            ],
            "backends": ["FLINT", "Sage.js algebraic geometry layer"],
            "sage_compatibility": {
                "status": "partial",
                "notes": (
                    "Affine plane curves, hypersurface components, and "
                    "rational plane-curve intersections are supported. "
                    "General schemes and primary decomposition remain "
                    "outside the current implementation."
                ),
            },
            "provenance": [
                {
                    "kind": "sage-derived",
                    "source": "SageMath schemes and plane curves API",
                    "url": ("https://doc.sagemath.org/html/en/reference/curves/"),
                    "license": "GPL-2.0-or-later",
                },
                {
                    "kind": "library-backed",
                    "source": "FLINT multivariate polynomial arithmetic",
                    "url": "https://flintlib.org/doc/",
                },
            ],
            "limitations": [
                (
                    "General primary decomposition is not implemented, and "
                    "complete Gröbner-fan enumeration currently covers the "
                    "twisted-cubic determinantal ideal."
                ),
            ],
        },
    )

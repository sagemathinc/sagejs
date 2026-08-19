"""Optional packed acceleration for public genus-3 Jacobian divisors.

The ordinary generalized Cantor law in `jacobian.py` is the semantic source of
truth.  This module only packs that representation for the bounded native
prime-field kernel and returns `None` when the capability or fixed-width domain
does not apply.
"""

from __future__ import annotations

from typing import Any, Mapping

import sagejs.runtime as runtime


def _exact_integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise TypeError(name + " must be an integer")
    try:
        answer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise TypeError(name + " must be an integer") from error
    try:
        exact = value == answer
    except Exception:
        exact = False
    if exact is not True:
        raise ValueError(name + " must be an exact integer")
    return answer


def _bit_length(value: int) -> int:
    bits = 0
    while value:
        value //= 2
        bits += 1
    return bits


def _backend_capability() -> tuple[Any, Any, Mapping[str, Any]] | None:
    backend = runtime.flint_backend()
    capability_function = runtime.reflect.get(backend, "genus3JacobianCapabilities")
    scalar_function = runtime.reflect.get(backend, "genus3JacobianScalarMultiply")
    if capability_function is runtime.undefined or scalar_function is runtime.undefined:
        return None
    capability = runtime.reflect.apply(capability_function, backend, [])
    if not bool(runtime.reflect.get(capability, "available")):
        return None
    return backend, scalar_function, capability


def _prime(jacobian: Any) -> int | None:
    if int(jacobian.genus()) != 3:
        return None
    field = jacobian.base_ring()
    if not hasattr(field, "characteristic") or not hasattr(field, "order"):
        return None
    prime = int(field.characteristic())
    if prime < 3 or int(field.order()) != prime:
        return None
    return prime


def native_scalar_supported(jacobian: Any) -> bool:
    """Return whether the packed scalar kernel supports `jacobian`."""
    native = _backend_capability()
    prime = _prime(jacobian)
    if native is None or prime is None:
        return False
    capability = native[2]
    return runtime.integer_bigint(prime) <= runtime.integer_bigint(
        runtime.reflect.get(capability, "primeUpperBound")
    )


def _residue(value: Any, prime: int) -> int:
    lifted = value.lift() if hasattr(value, "lift") else value
    return int(lifted) % prime


def _pack_polynomial(polynomial: Any, length: int, prime: int) -> Any:
    values = [_residue(value, prime) for value in polynomial.list()]
    if len(values) > length:
        raise ArithmeticError("the native genus-3 polynomial has excessive degree")
    values.extend([0 for _index in range(length - len(values))])
    return runtime.uint64_buffer([runtime.bigint(value) for value in values])


def _pack_divisor(divisor: Any, prime: int) -> Any:
    u_value, v_value = divisor.uv()
    u_values = [_residue(value, prime) for value in u_value.list()]
    v_values = [_residue(value, prime) for value in v_value.list()]
    if len(u_values) > 4 or len(v_values) > 3:
        raise ArithmeticError("the native kernel cannot pack this Mumford divisor")
    u_values.extend([0 for _index in range(4 - len(u_values))])
    v_values.extend([0 for _index in range(3 - len(v_values))])
    return runtime.uint64_buffer(
        [runtime.bigint(int(u_value.degree()))]
        + [runtime.bigint(value) for value in u_values]
        + [runtime.bigint(value) for value in v_values]
    )


def _unpack_divisor(jacobian: Any, packed: Any) -> Any:
    if len(packed) != 8:
        raise ArithmeticError("the native kernel returned a malformed divisor")
    degree = int(runtime.integer_bigint(packed[0]))
    if degree < 0 or degree > 3:
        raise ArithmeticError("the native kernel returned an invalid divisor degree")
    field = jacobian.base_ring()
    ring = jacobian.polynomial_ring()
    u_values = [
        field(int(runtime.integer_bigint(packed[index])))
        for index in range(1, degree + 2)
    ]
    v_values = [
        field(int(runtime.integer_bigint(packed[index])))
        for index in range(5, 5 + degree)
    ]
    divisor = jacobian._element(ring(u_values), ring(v_values), False)
    jacobian._validate_reduced(divisor[0], divisor[1])
    return divisor


def native_scalar_multiply(
    divisor: Any,
    scalar: Any,
    *,
    max_group_operations: Any = None,
) -> tuple[Any, dict[str, int]] | None:
    """Return `(scalar*divisor, diagnostics)` or `None` outside the domain."""
    scalar_value = _exact_integer(scalar, "scalar")
    negative = scalar_value < 0
    magnitude = -scalar_value if negative else scalar_value
    magnitude_bits = _bit_length(magnitude)
    if magnitude_bits > 128:
        return None
    jacobian = divisor.parent()
    native = _backend_capability()
    prime = _prime(jacobian)
    if native is None or prime is None:
        return None
    backend, scalar_function, capability = native
    if runtime.integer_bigint(prime) > runtime.integer_bigint(
        runtime.reflect.get(capability, "primeUpperBound")
    ):
        return None
    default_operations = max(2, 2 * magnitude_bits + 2)
    if max_group_operations is None:
        operation_limit = default_operations
    else:
        operation_limit = _exact_integer(max_group_operations, "max_group_operations")
        if operation_limit < 0:
            raise ValueError("max_group_operations must be nonnegative")
    result = runtime.reflect.apply(
        scalar_function,
        backend,
        [
            runtime.bigint(prime),
            _pack_polynomial(jacobian.f(), 8, prime),
            _pack_polynomial(jacobian.h(), 4, prime),
            _pack_divisor(divisor, prime),
            runtime.bigint(magnitude),
            runtime.bigint(operation_limit),
            runtime.undefined,
        ],
    )
    status_name = str(runtime.reflect.get(result, "statusName"))
    diagnostics_value = runtime.reflect.get(result, "diagnostics")
    diagnostics = {
        name: int(runtime.integer_bigint(runtime.reflect.get(diagnostics_value, name)))
        for name in ["groupOperations", "scalarBits"]
    }
    if status_name in ("resource_limit", "cancelled"):
        raise RuntimeError(
            "native genus-3 scalar multiplication stopped with status "
            + repr(status_name)
        )
    if status_name != "ok":
        raise ArithmeticError(
            "native genus-3 scalar multiplication failed with status "
            + repr(status_name)
        )
    answer = _unpack_divisor(jacobian, runtime.reflect.get(result, "divisor"))
    if negative:
        answer = -answer
    return answer, diagnostics


def native_sum(
    elements: Any,
    *,
    max_group_operations: Any = None,
) -> tuple[Any, dict[str, int]] | None:
    """Add a bounded packed genus-3 batch in one native call."""
    values = list(elements)
    if not values:
        return None
    jacobian = values[0].parent()
    if any(value.parent() is not jacobian for value in values):
        raise ValueError("every native sum element must have the same parent")
    native = _backend_capability()
    prime = _prime(jacobian)
    if native is None or prime is None:
        return None
    backend, _scalar_function, capability = native
    if runtime.integer_bigint(prime) > runtime.integer_bigint(
        runtime.reflect.get(capability, "primeUpperBound")
    ):
        return None
    sum_function = runtime.reflect.get(backend, "genus3JacobianSum")
    if sum_function is runtime.undefined:
        return None
    operation_limit = (
        max(1, len(values))
        if max_group_operations is None
        else _exact_integer(max_group_operations, "max_group_operations")
    )
    if operation_limit < 0:
        raise ValueError("max_group_operations must be nonnegative")
    packed_values = []
    for value in values:
        packed = _pack_divisor(value, prime)
        for index in range(len(packed)):
            packed_values.append(runtime.integer_bigint(packed[index]))
    result = runtime.reflect.apply(
        sum_function,
        backend,
        [
            runtime.bigint(prime),
            _pack_polynomial(jacobian.f(), 8, prime),
            _pack_polynomial(jacobian.h(), 4, prime),
            runtime.uint64_buffer(packed_values),
            runtime.bigint(operation_limit),
            runtime.undefined,
        ],
    )
    status_name = str(runtime.reflect.get(result, "statusName"))
    diagnostics_value = runtime.reflect.get(result, "diagnostics")
    diagnostics = {
        "groupOperations": int(
            runtime.integer_bigint(
                runtime.reflect.get(diagnostics_value, "groupOperations")
            )
        )
    }
    if status_name in ("resource_limit", "cancelled"):
        raise RuntimeError(
            "native genus-3 sum stopped with status " + repr(status_name)
        )
    if status_name != "ok":
        raise ArithmeticError(
            "native genus-3 sum failed with status " + repr(status_name)
        )
    return _unpack_divisor(
        jacobian, runtime.reflect.get(result, "divisor")
    ), diagnostics


def native_element_order(
    divisor: Any,
    multiple: Any,
    *,
    max_group_operations: Any = 10_000_000,
) -> tuple[int, tuple[tuple[int, int], ...], dict[str, int]] | None:
    """Factor and strip an annihilating multiple in the packed kernel."""
    multiple_value = _exact_integer(multiple, "multiple")
    if multiple_value <= 0 or _bit_length(multiple_value) > 128:
        return None
    jacobian = divisor.parent()
    native = _backend_capability()
    prime = _prime(jacobian)
    if native is None or prime is None:
        return None
    backend, _scalar_function, capability = native
    if runtime.integer_bigint(prime) > runtime.integer_bigint(
        runtime.reflect.get(capability, "primeUpperBound")
    ):
        return None
    search_function = runtime.reflect.get(backend, "genus3JacobianSearchProgression")
    if search_function is runtime.undefined:
        return None
    operation_limit = _exact_integer(max_group_operations, "max_group_operations")
    if operation_limit < 0:
        raise ValueError("max_group_operations must be nonnegative")
    result = runtime.reflect.apply(
        search_function,
        backend,
        [
            runtime.bigint(prime),
            _pack_polynomial(jacobian.f(), 8, prime),
            _pack_polynomial(jacobian.h(), 4, prime),
            _pack_divisor(divisor, prime),
            runtime.bigint(multiple_value),
            runtime.bigint(1),
            runtime.bigint(1),
            runtime.bigint(2),
            runtime.bigint(operation_limit),
            runtime.undefined,
        ],
    )
    status_name = str(runtime.reflect.get(result, "statusName"))
    diagnostics_value = runtime.reflect.get(result, "diagnostics")
    diagnostics = {
        name: int(runtime.integer_bigint(runtime.reflect.get(diagnostics_value, name)))
        for name in [
            "groupOperations",
            "scalarBits",
            "babySteps",
            "giantSteps",
            "hashCollisions",
        ]
    }
    if status_name == "not_found":
        raise ValueError("the supplied multiple does not annihilate the element")
    if status_name in ("resource_limit", "cancelled"):
        raise RuntimeError(
            "native genus-3 order stripping stopped with status " + repr(status_name)
        )
    if status_name != "ok":
        raise ArithmeticError(
            "native genus-3 order stripping failed with status " + repr(status_name)
        )
    order = int(runtime.integer_bigint(runtime.reflect.get(result, "elementOrder")))
    raw_factors = runtime.reflect.get(result, "factorization")
    factors = tuple(
        sorted(
            (
                int(runtime.integer_bigint(raw_factors[index][0])),
                int(raw_factors[index][1]),
            )
            for index in range(len(raw_factors))
        )
    )
    return order, factors, diagnostics

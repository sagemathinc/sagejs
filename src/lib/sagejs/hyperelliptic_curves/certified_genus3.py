"""Exact genus-3 local factors from rforest residues and Jacobian witnesses.

The rforest backend supplies only the coefficients of `det(I-T*W)` modulo
`p`.  This module turns one such residue triple into a local factor only
after exhaustive Weil lifting and exact Jacobian annihilation tests leave a
single candidate.  Deterministic sampling affects speed, never correctness:
ambiguous, unsupported, or resource-limited cases use the exact reference
backend.

The optional order kernel is deliberately hidden behind
`_native_order_certificates`. Its exact factor-and-strip routine proves
`e*D=0` and `(e/q)*D != 0` for every prime divisor `q` of the returned order;
this module independently validates the factorization and its product.
Certificates from injected or fallback providers are instead rechecked with
the ordinary Python group law before use.
"""

from __future__ import annotations

from typing import Any, Callable, Iterable, Iterator, Mapping

import sagejs as sage
import sagejs.runtime as runtime
from sagejs.hyperelliptic_curves.genus3_completion import (
    _is_genus3_weil_candidate,
    enumerate_genus3_weil_candidates,
    enumerate_genus3_weil_candidates_batch,
    genus3_candidate_kernel_available,
    jacobian_order_from_coefficients,
    twist_order_from_coefficients,
)
from sagejs.hyperelliptic_curves.group_structure import (
    JacobianResourceLimitError,
    add_pairs_batched,
    annihilation_tests_batched,
    factor_integer_bounded,
    group_element_key,
)
from sagejs.hyperelliptic_curves.jacobian import Jacobian, MumfordDivisor

Candidate = tuple[int, int, int]
OrderCertificateProvider = Callable[
    [Any, Any, int, int, int, str, Mapping[str, int]], Any
]
ExactFallback = Callable[[Any, int], Iterable[int]]
StageObserver = Callable[[str, Mapping[str, Any]], None]

_AUTO_RFOREST_MAX_INTERVAL_STOP = 100_000


def _observe(
    observer: StageObserver | None, event: str, details: Mapping[str, Any]
) -> None:
    """Emit deterministic stage boundaries for benchmark instrumentation."""
    if observer is not None:
        observer(event, details)


def _scalar_group_operations(value: int) -> tuple[int, int]:
    """Return exact binary double-and-add operations and scalar bits."""
    magnitude = abs(value)
    bits = 0
    additions = 0
    while magnitude:
        additions += magnitude % 2
        magnitude //= 2
        bits += 1
    return additions + max(0, bits - 1), bits


def _ceil_sqrt(value: int) -> int:
    if value <= 1:
        return value
    root = 1 << ((value.bit_length() + 1) // 2)
    while True:
        next_root = (root + value // root) // 2
        if next_root >= root:
            return root if root * root >= value else root + 1
        root = next_root


def _prepared_order_certificates(
    jacobian: Any,
    divisor: Any,
    base: int,
    stride: int,
    count: int,
    budgets: Mapping[str, int],
) -> Any:
    """Search one order progression with fixed-degree prepared BSGS batches."""
    if not hasattr(jacobian, "prepared_arithmetic"):
        return None
    baby_count = _ceil_sqrt(count)
    if baby_count > budgets["max_baby_steps"]:
        return {"status": "resource_limit", "native_status": "baby_steps"}
    giant_count = 1 + (count - 1) // baby_count
    maximum_candidate = base + (count - 1) * stride
    _maximum_operations, maximum_bits = _scalar_group_operations(maximum_candidate)
    maximum_batch = max(3, baby_count, giant_count, maximum_bits + 1)
    context = jacobian.prepared_arithmetic(
        algorithm="auto", max_batch_items=maximum_batch
    )
    if not context.native_available or not hasattr(context, "progression_batch"):
        return None

    scalar_values = (base, stride, baby_count * stride)
    scalar_operations = 0
    scalar_bits = 0
    for value in scalar_values:
        operations, bits = _scalar_group_operations(value)
        scalar_operations += operations
        scalar_bits += bits
    progression_operations = max(0, baby_count - 1) + max(0, giant_count - 1)

    total_operations = scalar_operations + progression_operations
    if total_operations > budgets["max_group_operations"]:
        return {"status": "resource_limit", "native_status": "group_operations"}
    base_product, step, giant_step = context.scalar_batch(
        (divisor, divisor, divisor),
        scalar_values,
        max_group_operations=max(
            1, max(_scalar_group_operations(value)[0] for value in scalar_values)
        ),
    )
    babies = context.progression_batch(
        jacobian.zero(),
        step,
        baby_count,
        packed=True,
        max_group_operations=max(0, baby_count - 1),
    )
    giants = context.progression_batch(
        -base_product,
        -giant_step,
        giant_count,
        packed=True,
        max_group_operations=max(0, giant_count - 1),
    )
    table: dict[Any, int] = {}
    hash_collisions = 0
    for index, value in enumerate(babies):
        if value not in table:
            table[value] = index
        else:
            hash_collisions += 1
    found_index = None
    for giant_index, value in enumerate(giants):
        baby_index = table.get(value)
        if baby_index is None:
            continue
        candidate_index = giant_index * baby_count + baby_index
        if candidate_index < count:
            found_index = candidate_index
            break
    diagnostics = {
        "groupOperations": total_operations,
        "scalarBits": scalar_bits,
        "babySteps": baby_count,
        "giantSteps": giant_count,
        "hashCollisions": hash_collisions,
        "preparedProgressions": 2,
        "packedProgressions": 2,
    }
    if found_index is None:
        return {"status": "not_found", "diagnostics": diagnostics}

    annihilating_multiple = base + found_index * stride
    factors = factor_integer_bounded(
        annihilating_multiple, budgets["max_trial_divisions"]
    )
    strip_scalars = [annihilating_multiple]
    strip_slices = []
    for prime_value, exponent in factors:
        start = len(strip_scalars)
        divisor_value = 1
        for _index in range(int(exponent)):
            divisor_value *= int(prime_value)
            strip_scalars.append(annihilating_multiple // divisor_value)
        strip_slices.append((int(prime_value), start, len(strip_scalars)))
    strip_operations = 0
    strip_bits = 0
    for value in strip_scalars:
        operations, bits = _scalar_group_operations(value)
        strip_operations += operations
        strip_bits += bits
    if total_operations + strip_operations > budgets["max_group_operations"]:
        return {"status": "resource_limit", "native_status": "group_operations"}
    strip_results = context.scalar_batch(
        tuple(divisor for _value in strip_scalars),
        tuple(strip_scalars),
        max_group_operations=max(
            1, max(_scalar_group_operations(value)[0] for value in strip_scalars)
        ),
    )
    if not strip_results[0].is_zero():
        raise ArithmeticError(
            "the prepared progression returned a non-annihilating multiple"
        )
    element_order = annihilating_multiple
    for prime, start, stop in strip_slices:
        for index in range(start, stop):
            if not strip_results[index].is_zero():
                break
            element_order //= prime
    diagnostics["groupOperations"] += strip_operations
    diagnostics["scalarBits"] += strip_bits
    return {
        "status": "found",
        "certificate": {
            "divisor": divisor,
            "element_order": element_order,
            "prime_factors": _factorization_of_divisor(element_order, factors),
        },
        "annihilating_multiple": annihilating_multiple,
        "diagnostics": diagnostics,
    }


def _legacy_native_order_certificates(
    jacobian: Any,
    divisor: Any,
    base: int,
    stride: int,
    count: int,
    kind: str,
    budgets: Mapping[str, int],
) -> Any:
    """Internal native-kernel adapter; `None` means capability unavailable.

    One call searches `base + i*stride` for `0 <= i < count` against one
    packed Mumford divisor. It returns `status="not_found"`, or
    `status="found"` with one `certificate` having `divisor`,
    `element_order`, and `prime_factors`. The adapter decodes the divisor into
    an element of `jacobian`. Native survivor masks may also be returned as
    diagnostics, but never decide mathematical correctness.
    """
    del kind
    backend = runtime.flint_backend()
    capability_function = runtime.reflect.get(backend, "genus3JacobianCapabilities")
    search_function = runtime.reflect.get(backend, "genus3JacobianSearchProgression")
    if capability_function is runtime.undefined or search_function is runtime.undefined:
        return None
    capability = runtime.reflect.apply(capability_function, backend, [])
    if not bool(runtime.reflect.get(capability, "available")):
        return None
    prime = int(jacobian.base_ring().characteristic())
    if runtime.integer_bigint(prime) > runtime.integer_bigint(
        runtime.reflect.get(capability, "primeUpperBound")
    ):
        return None

    def residue(value: Any) -> int:
        lifted = value.lift() if hasattr(value, "lift") else value
        return int(lifted) % prime

    def packed_polynomial(polynomial: Any, length: int) -> Any:
        values = [residue(value) for value in polynomial.list()]
        if len(values) > length:
            raise ArithmeticError("the native genus-3 model has excessive degree")
        values.extend([0 for _index in range(length - len(values))])
        return runtime.uint64_buffer([runtime.bigint(value) for value in values])

    u_value, v_value = divisor.uv()
    u_values = [residue(value) for value in u_value.list()]
    v_values = [residue(value) for value in v_value.list()]
    if len(u_values) > 4 or len(v_values) > 3:
        raise ArithmeticError("the native kernel cannot pack this Mumford divisor")
    u_values.extend([0 for _index in range(4 - len(u_values))])
    v_values.extend([0 for _index in range(3 - len(v_values))])
    packed_divisor = runtime.uint64_buffer(
        [runtime.bigint(int(u_value.degree()))]
        + [runtime.bigint(value) for value in u_values]
        + [runtime.bigint(value) for value in v_values]
    )
    result = runtime.reflect.apply(
        search_function,
        backend,
        [
            runtime.bigint(prime),
            packed_polynomial(jacobian.f(), 8),
            packed_polynomial(jacobian.h(), 4),
            packed_divisor,
            runtime.bigint(base),
            runtime.bigint(stride),
            runtime.bigint(count),
            runtime.bigint(budgets["max_baby_steps"]),
            runtime.bigint(budgets["max_group_operations"]),
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
        return {"status": "not_found", "diagnostics": diagnostics}
    if status_name in ["resource_limit", "cancelled"]:
        return {
            "status": "resource_limit",
            "native_status": status_name,
            "diagnostics": diagnostics,
        }
    if status_name != "ok":
        raise ArithmeticError(
            "the native genus-3 order search failed with status " + repr(status_name)
        )
    annihilating_multiple = int(
        runtime.integer_bigint(runtime.reflect.get(result, "annihilatingMultiple"))
    )
    if (
        annihilating_multiple < base
        or (annihilating_multiple - base) % stride != 0
        or (annihilating_multiple - base) // stride >= count
    ):
        raise ArithmeticError(
            "the native genus-3 certificate is outside its progression"
        )
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
    return {
        "status": "found",
        "certificate": {
            "divisor": divisor,
            "element_order": int(
                runtime.integer_bigint(runtime.reflect.get(result, "elementOrder"))
            ),
            "prime_factors": factors,
        },
        "annihilating_multiple": annihilating_multiple,
        "diagnostics": diagnostics,
    }


def _native_order_certificates(
    jacobian: Any,
    divisor: Any,
    base: int,
    stride: int,
    count: int,
    kind: str,
    budgets: Mapping[str, int],
) -> Any:
    """Use one-boundary FLINT BSGS, then the portable prepared fallback."""
    legacy = _legacy_native_order_certificates(
        jacobian, divisor, base, stride, count, kind, budgets
    )
    if legacy is not None:
        return legacy
    return _prepared_order_certificates(jacobian, divisor, base, stride, count, budgets)


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


def _positive_integer(value: Any, name: str) -> int:
    answer = _exact_integer(value, name)
    if answer < 1:
        raise ValueError(name + " must be positive")
    return answer


def _prime_integer(value: Any, name: str) -> int:
    answer = _positive_integer(value, name)
    if not sage.is_prime(answer):
        raise ValueError(name + " must be prime")
    return answer


def _reduce_rational_curve(curve: Any, prime: int) -> Any:
    frobenius = __import__(
        "sagejs.hyperelliptic_curves.frobenius",
        fromlist=["_rational_reduction"],
    )
    return frobenius._rational_reduction(curve, prime)


def _default_exact_fallback(curve: Any, prime: int) -> Iterable[int]:
    reduced = _reduce_rational_curve(curve, prime)
    return reduced._lpolynomial_coefficients("exhaustive")


def _checked_coefficients(
    values: Iterable[int],
    prime: int,
    residues: tuple[int, int, int] | None,
) -> tuple[int, ...]:
    coefficients = tuple(
        _exact_integer(value, "local-factor coefficient") for value in values
    )
    if len(coefficients) != 7:
        raise ArithmeticError("a genus-3 local factor must have seven coefficients")
    if coefficients[0] != 1 or coefficients[6] != prime**3:
        raise ArithmeticError(
            "the exact backend returned invalid endpoint coefficients"
        )
    if (
        coefficients[4] != prime * coefficients[2]
        or coefficients[5] != prime**2 * coefficients[1]
    ):
        raise ArithmeticError("the exact backend returned a nonreciprocal local factor")
    if not _is_genus3_weil_candidate(prime, *coefficients[1:4]):
        raise ArithmeticError("the exact backend returned a non-Weil local factor")
    if (
        residues is not None
        and tuple(value % prime for value in coefficients[1:4]) != residues
    ):
        raise ArithmeticError("the exact backend disagrees with the rforest residues")
    return coefficients


def _fallback_result(
    curve: Any,
    prime: int,
    residues: tuple[int, int, int] | None,
    fallback: ExactFallback,
    reason: str,
    diagnostics: Mapping[str, Any] | None = None,
    stage_observer: StageObserver | None = None,
) -> dict[str, Any]:
    _observe(stage_observer, "fallback_start", {"prime": prime, "reason": reason})
    coefficients = _checked_coefficients(fallback(curve, prime), prime, residues)
    _observe(stage_observer, "fallback_end", {"prime": prime, "reason": reason})
    details = {} if diagnostics is None else dict(diagnostics)
    details["fallback_reason"] = reason
    return {
        "status": "fallback",
        "coefficients": coefficients,
        "certificate": None,
        "diagnostics": details,
    }


def _unavailable_reduction_result(
    curve: Any, prime: int, reason: str, diagnostics: Mapping[str, Any]
) -> dict[str, Any] | None:
    """Return an omitted-row result when the supplied model cannot reduce."""
    try:
        _reduce_rational_curve(curve, prime)
    except ArithmeticError as error:
        return {
            "status": "omitted",
            "coefficients": None,
            "certificate": None,
            "diagnostics": {
                **dict(diagnostics),
                "fallback_reason": reason,
                "reduction_error": str(error),
            },
        }
    return None


def _prime_field(curve: Any, prime: int) -> Any:
    field = curve.base_ring()
    if (
        not hasattr(field, "characteristic")
        or not hasattr(field, "order")
        or int(field.characteristic()) != prime
        or int(field.order()) != prime
    ):
        raise NotImplementedError(
            "genus-3 Jacobian certification requires the prime-field reduction"
        )
    return field


def rforest_genus3_auto_supported(curve: Any, start: int, stop: int) -> bool:
    """Return whether the measured exact native genus-3 pipeline applies.

    The selector is intentionally fail-closed. It requires an odd-degree
    integral completed-square model, the rforest residue backend, the compiled
    exact Weil-lift kernel, and the native Jacobian certificate kernel. A
    singleton request at characteristic two stays on the reference backend.
    """
    if (
        int(curve.genus()) != 3
        or stop < max(start, 3)
        or (stop > start and stop > _AUTO_RFOREST_MAX_INTERVAL_STOP)
    ):
        return False
    try:
        rforest = __import__(
            "sagejs.hyperelliptic_curves.rforest",
            fromlist=["rforest_capabilities", "_completed_square_model"],
        )
        capability = rforest.rforest_capabilities()
        if capability is None or not genus3_candidate_kernel_available():
            return False
        coefficients, _excluded_denominator = rforest._completed_square_model(curve)
        if len(coefficients) != 8:
            return False
        backend = runtime.flint_backend()
        capability_function = runtime.reflect.get(backend, "genus3JacobianCapabilities")
        search_function = runtime.reflect.get(
            backend, "genus3JacobianSearchProgression"
        )
        if (
            capability_function is runtime.undefined
            or search_function is runtime.undefined
        ):
            return False
        group = runtime.reflect.apply(capability_function, backend, [])
        if not bool(runtime.reflect.get(group, "available")):
            return False
        return runtime.integer_bigint(stop) <= min(
            runtime.integer_bigint(runtime.reflect.get(capability, "primeUpperBound")),
            runtime.integer_bigint(runtime.reflect.get(group, "primeUpperBound")),
        )
    except Exception:
        return False


def _deterministic_points(
    curve: Any,
    prime: int,
    *,
    max_x_values: int,
    max_points: int,
) -> tuple[Any, ...]:
    """Return a platform-independent affine-point prefix.

    One root above each successful `x` is chosen by its least integer lift.
    This is independent of the finite-field square-root convention and avoids
    feeding consecutive inverse divisor classes to the partial-sum sampler.
    """
    field = _prime_field(curve, prime)
    f_value, h_value = curve.hyperelliptic_polynomials()
    two = field(2)
    four = field(4)
    points: list[Any] = []
    for integer_x in range(min(prime, max_x_values)):
        x_value = field(integer_x)
        # Coercion also normalizes the zero polynomial's host representation.
        h_at_x = field(0) if h_value.is_zero() else field(h_value(x_value))
        f_at_x = field(f_value(x_value))
        discriminant = h_at_x * h_at_x + four * f_at_x
        if discriminant == field(0):
            roots = ((-h_at_x) / two,)
        elif hasattr(discriminant, "is_square") and discriminant.is_square():
            square_root = discriminant.sqrt()
            root_pair = (
                (-h_at_x + square_root) / two,
                (-h_at_x - square_root) / two,
            )
            roots = (min(root_pair, key=lambda root: int(root.lift())),)
        else:
            roots = ()
        for y_value in roots:
            points.append((x_value, y_value))
            if len(points) >= max_points:
                return tuple(points)
    return tuple(points)


def _deterministic_elements(
    jacobian: Any,
    prime: int,
    *,
    max_x_values: int,
    max_elements: int,
) -> tuple[Any, ...]:
    points = _deterministic_points(
        jacobian.curve(),
        prime,
        max_x_values=max_x_values,
        max_points=max_elements,
    )
    if not points:
        return ()
    # The points were checked by the discriminant equation above. Constructing
    # their degree-one Mumford classes directly also avoids making the generic
    # point validator multiply the identically-zero h polynomial.
    ring = jacobian.polynomial_ring()
    elements: list[Any] = []
    element_keys: set[Any] = set()
    partial_sum = jacobian.zero()
    for x_value, y_value in points:
        divisor = jacobian._element(ring.gen() - x_value, ring(y_value), False)
        partial_sum = add_pairs_batched(
            (partial_sum,),
            (divisor,),
            algorithm="auto",
        )[0]
        for candidate in (divisor, partial_sum):
            key = group_element_key(candidate)
            if not candidate.is_zero() and key not in element_keys:
                element_keys.add(key)
                elements.append(candidate)
                if len(elements) >= max_elements:
                    return tuple(elements)
    return tuple(elements)


def _factorization_of_divisor(
    value: int, factors: Iterable[tuple[Any, Any]]
) -> tuple[tuple[int, int], ...]:
    remaining = value
    answer: list[tuple[int, int]] = []
    for prime_value, _available_exponent in factors:
        prime = int(prime_value)
        exponent = 0
        while remaining % prime == 0:
            remaining //= prime
            exponent += 1
        if exponent:
            answer.append((prime, exponent))
    if remaining != 1:
        raise ArithmeticError("failed to derive an element-order factorization")
    return tuple(answer)


def _dynamic_order_certificates(
    jacobian: Any,
    orders: tuple[int, ...],
    elements: tuple[Any, ...],
    max_trial_divisions: int,
) -> tuple[tuple[dict[str, Any], ...], int]:
    """Derive exact element orders from any annihilating candidate order."""
    certificates: list[dict[str, Any]] = []
    scalar_multiplications = 0
    for element in elements:
        annihilator = None
        # Keep native/host buffers bounded while amortizing preparation and
        # crossings across all candidate orders in the common small window.
        window = 256
        for start in range(0, len(orders), window):
            order_window = orders[start : start + window]
            tests = annihilation_tests_batched(
                element,
                order_window,
                algorithm="auto",
            )
            scalar_multiplications += len(order_window)
            for order, annihilates in zip(order_window, tests, strict=True):
                if annihilates:
                    annihilator = order
                    break
            if annihilator is not None:
                break
        if annihilator is None:
            raise ArithmeticError(
                "no Weil-candidate order annihilates a sampled Jacobian element"
            )
        factors = factor_integer_bounded(annihilator, max_trial_divisions)
        strip_candidates = []
        strip_slices = []
        for prime_value, exponent in factors:
            prime_factor = int(prime_value)
            start = len(strip_candidates)
            divisor = 1
            for _index in range(int(exponent)):
                divisor *= prime_factor
                strip_candidates.append(annihilator // divisor)
            strip_slices.append((prime_factor, start, len(strip_candidates)))
        strip_tests = annihilation_tests_batched(
            element,
            strip_candidates,
            algorithm="auto",
        )
        scalar_multiplications += len(strip_candidates)
        element_order = annihilator
        for prime_factor, start, stop in strip_slices:
            for index in range(start, stop):
                if not strip_tests[index]:
                    break
                element_order //= prime_factor
        certificates.append(
            {
                "divisor": element,
                "element_order": element_order,
                "prime_factors": _factorization_of_divisor(element_order, factors),
            }
        )
    return tuple(certificates), scalar_multiplications


def _checked_prime_factorization(
    value: int, raw_factors: Iterable[Any]
) -> tuple[tuple[int, int], ...]:
    factors: list[tuple[int, int]] = []
    product = 1
    previous = 1
    for raw_factor in raw_factors:
        try:
            raw_prime, raw_exponent = raw_factor
        except Exception as error:
            raise ArithmeticError(
                "an order certificate has a malformed factor"
            ) from error
        prime = _positive_integer(raw_prime, "factor prime")
        exponent = _positive_integer(raw_exponent, "factor exponent")
        if prime <= previous or not sage.is_prime(prime):
            raise ArithmeticError("order-certificate factors must be increasing primes")
        product *= prime**exponent
        previous = prime
        factors.append((prime, exponent))
    if product != value:
        raise ArithmeticError(
            "order-certificate factors do not multiply to the element order"
        )
    return tuple(factors)


def _check_order_certificate(
    jacobian: Any, raw: Any, native_exact: bool = False
) -> tuple[int, dict[str, Any], int]:
    if not hasattr(raw, "get"):
        raise ArithmeticError("the order kernel returned a malformed certificate")
    divisor = raw.get("divisor")
    if not isinstance(divisor, MumfordDivisor) or divisor.parent() is not jacobian:
        raise ArithmeticError(
            "an order certificate has a divisor in the wrong Jacobian"
        )
    element_order = _positive_integer(raw.get("element_order"), "element_order")
    raw_factors = raw.get("prime_factors")
    if raw_factors is None:
        raise ArithmeticError("an order certificate omitted its prime factorization")
    factors = _checked_prime_factorization(element_order, raw_factors)
    if native_exact:
        return (
            element_order,
            {
                "divisor": divisor,
                "element_order": element_order,
                "prime_factors": factors,
                "verification": "native_exact_factor_and_strip",
            },
            0,
        )
    tested_multiples = [element_order]
    tested_multiples.extend(element_order // prime for prime, _exponent in factors)
    tests = annihilation_tests_batched(
        divisor,
        tested_multiples,
        algorithm="reference",
    )
    scalar_multiplications = len(tested_multiples)
    if not tests[0]:
        raise ArithmeticError(
            "a certified element order does not annihilate its divisor"
        )
    for annihilates in tests[1:]:
        if annihilates:
            raise ArithmeticError("a certified element order is not exact")
    return (
        element_order,
        {
            "divisor": divisor,
            "element_order": element_order,
            "prime_factors": factors,
            "verification": "independent_python_group_law",
        },
        scalar_multiplications,
    )


def _certified_order_witnesses(
    jacobian: Any,
    orders: tuple[int, ...],
    progressions: tuple[dict[str, int], ...],
    elements: tuple[Any, ...],
    kind: str,
    certificate_provider: OrderCertificateProvider,
    max_trial_divisions: int,
    max_baby_steps: int,
    max_group_operations: int,
) -> tuple[tuple[int, ...], tuple[dict[str, Any], ...], dict[str, Any]]:
    kernel_diagnostics: list[Any] = []
    capability_unavailable = not elements
    witnesses: list[int] = []
    certificates: list[dict[str, Any]] = []
    recheck_operations = 0
    survivors = orders
    for element in elements:
        found = False
        for progression in progressions:
            raw = certificate_provider(
                jacobian,
                element,
                progression["base"],
                progression["stride"],
                progression["count"],
                kind,
                {
                    "max_trial_divisions": max_trial_divisions,
                    "max_baby_steps": max_baby_steps,
                    "max_group_operations": max_group_operations,
                },
            )
            if raw is None:
                capability_unavailable = True
                break
            if not hasattr(raw, "get"):
                raise ArithmeticError("the order kernel returned a malformed result")
            status = raw.get("status")
            if status == "resource_limit":
                raise JacobianResourceLimitError(
                    "the native order search exceeded its resource budget"
                )
            if status == "not_found":
                kernel_diagnostics.append(raw.get("diagnostics"))
                continue
            if status != "found" or raw.get("certificate") is None:
                raise ArithmeticError("the order kernel returned an invalid status")
            certificate = raw["certificate"]
            if not hasattr(certificate, "get") or certificate.get("divisor") != element:
                raise ArithmeticError(
                    "the order kernel certified a different divisor than requested"
                )
            witness, checked_certificate, operations = _check_order_certificate(
                jacobian,
                certificate,
                native_exact=certificate_provider is _native_order_certificates,
            )
            recheck_operations += operations
            if witness not in witnesses:
                witnesses.append(witness)
                certificates.append(checked_certificate)
                survivors = tuple(order for order in survivors if order % witness == 0)
            kernel_diagnostics.append(raw.get("diagnostics"))
            found = True
            break
        if capability_unavailable:
            break
        if not found:
            raise ArithmeticError(
                "no candidate-order progression annihilates a sampled divisor"
            )
        # Further witnesses cannot distinguish candidates with the same group
        # order.  Stop as soon as one candidate order remains; the caller will
        # use the twist if several Weil polynomials share it.
        if len(survivors) <= 1:
            break

    if capability_unavailable:
        raw_certificates, derivation_operations = _dynamic_order_certificates(
            jacobian, orders, elements, max_trial_divisions
        )
        backend = "python"
        checked_kernel_diagnostics: Any = None
        witnesses = []
        certificates = []
        recheck_operations = 0
        for raw_certificate in raw_certificates:
            witness, certificate, operations = _check_order_certificate(
                jacobian, raw_certificate
            )
            recheck_operations += operations
            if witness not in witnesses:
                witnesses.append(witness)
                certificates.append(certificate)
        survivors = tuple(
            order
            for order in orders
            if all(order % witness == 0 for witness in witnesses)
        )
    else:
        derivation_operations = 0
        backend = "kernel"
        checked_kernel_diagnostics = tuple(kernel_diagnostics)
    return (
        survivors,
        tuple(certificates),
        {
            "backend": backend,
            "certificate_count": len(certificates),
            "scalar_multiplications": derivation_operations + recheck_operations,
            "derivation_scalar_multiplications": derivation_operations,
            "recheck_scalar_multiplications": recheck_operations,
            "kernel_diagnostics": checked_kernel_diagnostics,
            "progression_count": len(progressions),
        },
    )


def _quadratic_twist(curve: Any, prime: int) -> Any:
    """Return a deterministic completed-square quadratic twist.

    In odd characteristic `y^2+h*y=f` is isomorphic to
    `z^2=h^2+4*f`.  Multiplying the right side by any nonsquare gives its
    quadratic twist and negates the odd local-factor coefficients.
    """
    field = _prime_field(curve, prime)
    nonsquare = None
    for value in range(2, prime):
        candidate = field(value)
        if not candidate.is_square():
            nonsquare = candidate
            break
    if nonsquare is None:
        raise ArithmeticError("failed to find a prime-field nonsquare")
    f_value, h_value = curve.hyperelliptic_polynomials()
    completed_square = (
        f_value if h_value.is_zero() else h_value * h_value + field(4) * f_value
    )
    model = __import__(
        "sagejs.hyperelliptic_curves.model",
        fromlist=["HyperellipticCurve_generic"],
    )
    return model.HyperellipticCurve_generic(nonsquare * completed_square)


def _completed_square_curve(curve: Any, prime: int) -> Any:
    """Normalize an odd-characteristic generalized model to `Y^2=h^2+4f`."""
    field = _prime_field(curve, prime)
    f_value, h_value = curve.hyperelliptic_polynomials()
    completed_square = h_value * h_value + field(4) * f_value
    model = __import__(
        "sagejs.hyperelliptic_curves.model",
        fromlist=["HyperellipticCurve_generic"],
    )
    return model.HyperellipticCurve_generic(completed_square)


def _unique_orders(values: Iterable[int]) -> tuple[int, ...]:
    answer: list[int] = []
    seen: set[int] = set()
    for value in values:
        if value not in seen:
            seen.add(value)
            answer.append(value)
    return tuple(answer)


def _order_progressions(
    candidates: tuple[Candidate, ...], prime: int, kind: str
) -> tuple[dict[str, int], ...]:
    """Partition candidate orders into maximal stride-`p` progressions.

    Candidate lifts with fixed `(c1,c2)` vary in `c3` by multiples of `p`, so
    both `L(1)` and `L(-1)` vary by stride `p` after sorting. Weil filtering
    may leave holes, which split a bucket into separate maximal progressions.
    Keeping coefficient buckets separate avoids treating accidental adjacency
    in the global order set as mathematical structure.
    """
    buckets: dict[tuple[int, int], set[int]] = {}
    for candidate in candidates:
        key = (candidate[0], candidate[1])
        order = (
            jacobian_order_from_coefficients(candidate, prime)
            if kind == "jacobian"
            else twist_order_from_coefficients(candidate, prime)
        )
        if key not in buckets:
            buckets[key] = set()
        buckets[key].add(order)

    answer: list[dict[str, int]] = []
    for values_set in buckets.values():
        values = sorted(values_set)
        start = 0
        while start < len(values):
            end = start + 1
            while end < len(values) and values[end] - values[end - 1] == prime:
                end += 1
            answer.append(
                {
                    "base": values[start],
                    "stride": prime,
                    "count": end - start,
                }
            )
            start = end
    return tuple(answer)


def _certify_candidates(
    reduced_curve: Any,
    prime: int,
    candidates: tuple[Candidate, ...],
    *,
    max_x_values: int,
    max_elements: int,
    max_trial_divisions: int,
    max_baby_steps: int,
    max_group_operations: int,
    certificate_provider: OrderCertificateProvider,
    stage_observer: StageObserver | None,
) -> tuple[tuple[Candidate, ...], dict[str, Any]]:
    diagnostics: dict[str, Any] = {}
    jacobian = Jacobian(reduced_curve)
    elements = _deterministic_elements(
        jacobian,
        prime,
        max_x_values=max_x_values,
        max_elements=1,
    )
    orders = _unique_orders(
        jacobian_order_from_coefficients(candidate, prime) for candidate in candidates
    )
    progressions = _order_progressions(candidates, prime, "jacobian")
    _observe(
        stage_observer,
        "primary_start",
        {"prime": prime, "orders": len(orders), "elements": len(elements)},
    )
    survivors, primary_certificates, primary_diagnostics = _certified_order_witnesses(
        jacobian,
        orders,
        progressions,
        elements,
        "jacobian",
        certificate_provider,
        max_trial_divisions,
        max_baby_steps,
        max_group_operations,
    )
    if len(survivors) > 1 and max_elements > 1:
        elements = _deterministic_elements(
            jacobian,
            prime,
            max_x_values=max_x_values,
            max_elements=max_elements,
        )
        survivors, primary_certificates, primary_diagnostics = (
            _certified_order_witnesses(
                jacobian,
                orders,
                progressions,
                elements,
                "jacobian",
                certificate_provider,
                max_trial_divisions,
                max_baby_steps,
                max_group_operations,
            )
        )
    survivor_set = set(survivors)
    remaining = tuple(
        candidate
        for candidate in candidates
        if jacobian_order_from_coefficients(candidate, prime) in survivor_set
    )
    if not remaining:
        raise ArithmeticError(
            "Jacobian order witnesses reject every rforest Weil candidate"
        )
    diagnostics["jacobian"] = {
        **primary_diagnostics,
        "elements": len(elements),
        "input_orders": len(orders),
        "surviving_orders": len(survivors),
        "surviving_candidates": len(remaining),
        "progressions": progressions,
        "certificates": primary_certificates,
    }
    _observe(stage_observer, "primary_end", {"prime": prime, **diagnostics["jacobian"]})
    if len(remaining) <= 1:
        return remaining, diagnostics

    twist = _quadratic_twist(reduced_curve, prime)
    twist_jacobian = Jacobian(twist)
    twist_elements = _deterministic_elements(
        twist_jacobian,
        prime,
        max_x_values=max_x_values,
        max_elements=1,
    )
    twist_orders = _unique_orders(
        twist_order_from_coefficients(candidate, prime) for candidate in remaining
    )
    twist_progressions = _order_progressions(remaining, prime, "twist")
    _observe(
        stage_observer,
        "twist_start",
        {"prime": prime, "orders": len(twist_orders), "elements": len(twist_elements)},
    )
    twist_survivors, twist_certificates, twist_diagnostics = _certified_order_witnesses(
        twist_jacobian,
        twist_orders,
        twist_progressions,
        twist_elements,
        "twist",
        certificate_provider,
        max_trial_divisions,
        max_baby_steps,
        max_group_operations,
    )
    if len(twist_survivors) > 1 and max_elements > 1:
        twist_elements = _deterministic_elements(
            twist_jacobian,
            prime,
            max_x_values=max_x_values,
            max_elements=max_elements,
        )
        twist_survivors, twist_certificates, twist_diagnostics = (
            _certified_order_witnesses(
                twist_jacobian,
                twist_orders,
                twist_progressions,
                twist_elements,
                "twist",
                certificate_provider,
                max_trial_divisions,
                max_baby_steps,
                max_group_operations,
            )
        )
    twist_survivor_set = set(twist_survivors)
    remaining = tuple(
        candidate
        for candidate in remaining
        if twist_order_from_coefficients(candidate, prime) in twist_survivor_set
    )
    if not remaining:
        raise ArithmeticError(
            "twist order witnesses reject every rforest Weil candidate"
        )
    diagnostics["twist"] = {
        **twist_diagnostics,
        "elements": len(twist_elements),
        "input_orders": len(twist_orders),
        "surviving_orders": len(twist_survivors),
        "surviving_candidates": len(remaining),
        "progressions": twist_progressions,
        "certificates": twist_certificates,
    }
    _observe(stage_observer, "twist_end", {"prime": prime, **diagnostics["twist"]})
    return remaining, diagnostics


def complete_genus3_residues_with_jacobian(
    curve: Any,
    prime: Any,
    residues: Iterable[int],
    *,
    exact_fallback: ExactFallback | None = None,
    order_certificate_provider: OrderCertificateProvider | None = None,
    max_candidates: int = 100_000,
    max_combinations: int = 2_000_000,
    max_x_values: int = 256,
    max_elements: int = 24,
    max_trial_divisions: int = 1_000_000,
    max_baby_steps: int = 100_000,
    max_group_operations: int = 10_000_000,
    stage_observer: StageObserver | None = None,
    _candidate_enumeration: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Certify one genus-3 factor or use an exact fallback.

    `curve` is the rational curve whose reduction is certified.  The return
    value always contains exact ascending coefficients.  `status` is
    `"unique"` only when Jacobian certificates reduce the exhaustive Weil
    candidate set to one; otherwise it is `"fallback"`.
    """
    prime = _prime_integer(prime, "prime")
    if prime == 2:
        raise ValueError("rforest residue certification requires an odd prime")
    normalized_values = tuple(
        _exact_integer(value, "residue") % prime for value in residues
    )
    if len(normalized_values) != 3:
        raise ValueError("genus-3 certification requires exactly three residues")
    normalized = (normalized_values[0], normalized_values[1], normalized_values[2])
    fallback = _default_exact_fallback if exact_fallback is None else exact_fallback
    kernel = (
        _native_order_certificates
        if order_certificate_provider is None
        else order_certificate_provider
    )
    max_candidates = _positive_integer(max_candidates, "max_candidates")
    max_combinations = _positive_integer(max_combinations, "max_combinations")
    max_x_values = _positive_integer(max_x_values, "max_x_values")
    max_elements = _positive_integer(max_elements, "max_elements")
    max_trial_divisions = _positive_integer(max_trial_divisions, "max_trial_divisions")
    max_baby_steps = _positive_integer(max_baby_steps, "max_baby_steps")
    max_group_operations = _positive_integer(
        max_group_operations, "max_group_operations"
    )

    _observe(stage_observer, "candidate_start", {"prime": prime})
    if _candidate_enumeration is None:
        enumeration = enumerate_genus3_weil_candidates(
            prime,
            normalized,
            max_candidates=max_candidates,
            max_combinations=max_combinations,
        )
    else:
        enumeration = dict(_candidate_enumeration)
        if (
            int(enumeration.get("prime", -1)) != prime
            or tuple(enumeration.get("residues", ())) != normalized
        ):
            raise ArithmeticError("a batched candidate result is misaligned")
    _observe(
        stage_observer,
        "candidate_end",
        {
            "prime": prime,
            "status": enumeration["status"],
            "candidate_count": enumeration["candidate_count"],
            "combinations_examined": enumeration["diagnostics"][
                "combinations_examined"
            ],
        },
    )
    if enumeration["status"] != "ok":
        return _fallback_result(
            curve,
            prime,
            normalized,
            fallback,
            "candidate_" + str(enumeration["status"]),
            {"enumeration": enumeration},
            stage_observer,
        )
    candidates = tuple(enumeration["candidates"])
    if not candidates:
        raise ArithmeticError("the rforest residues have no genus-3 Weil lift")

    try:
        reduced_curve = _completed_square_curve(
            _reduce_rational_curve(curve, prime), prime
        )
        remaining, certificate_diagnostics = _certify_candidates(
            reduced_curve,
            prime,
            candidates,
            max_x_values=max_x_values,
            max_elements=max_elements,
            max_trial_divisions=max_trial_divisions,
            max_baby_steps=max_baby_steps,
            max_group_operations=max_group_operations,
            certificate_provider=kernel,
            stage_observer=stage_observer,
        )
    except NotImplementedError as error:
        return _fallback_result(
            curve,
            prime,
            normalized,
            fallback,
            "unsupported_jacobian_model",
            {"enumeration": enumeration, "detail": str(error)},
            stage_observer,
        )
    except JacobianResourceLimitError as error:
        return _fallback_result(
            curve,
            prime,
            normalized,
            fallback,
            "certification_resource_limit",
            {"enumeration": enumeration, "detail": str(error)},
            stage_observer,
        )

    if len(remaining) != 1:
        return _fallback_result(
            curve,
            prime,
            normalized,
            fallback,
            "indeterminate",
            {
                "enumeration": enumeration,
                "certificate": certificate_diagnostics,
                "remaining_candidates": remaining,
            },
            stage_observer,
        )
    candidate = remaining[0]
    coefficients = (
        1,
        candidate[0],
        candidate[1],
        candidate[2],
        prime * candidate[1],
        prime**2 * candidate[0],
        prime**3,
    )
    return {
        "status": "unique",
        "coefficients": coefficients,
        "certificate": {
            "candidate": candidate,
            "initial_candidate_count": len(candidates),
            **certificate_diagnostics,
        },
        "diagnostics": {"enumeration": enumeration},
    }


def rforest_genus3_local_factor(
    curve: Any,
    prime: Any,
    *,
    exact_fallback: ExactFallback | None = None,
    order_certificate_provider: OrderCertificateProvider | None = None,
    max_candidates: int = 100_000,
    max_combinations: int = 2_000_000,
    max_x_values: int = 256,
    max_elements: int = 24,
    max_trial_divisions: int = 1_000_000,
    max_baby_steps: int = 100_000,
    max_group_operations: int = 10_000_000,
    stage_observer: StageObserver | None = None,
) -> dict[str, Any]:
    """Compute one exact rational genus-3 local factor through rforest.

    Unavailable rforest rows (including characteristic two, denominator
    exclusions, singular supplied models, and native resource limits) are not
    interpreted mathematically.  They trigger the same exact reference
    fallback used for an unresolved certificate.
    """
    prime = _prime_integer(prime, "prime")
    if int(curve.genus()) != 3:
        raise ValueError("certified rforest completion requires a genus-3 curve")
    fallback = _default_exact_fallback if exact_fallback is None else exact_fallback
    if prime == 2:
        return _fallback_result(
            curve,
            prime,
            None,
            fallback,
            "characteristic_two",
            stage_observer=stage_observer,
        )
    rforest = __import__(
        "sagejs.hyperelliptic_curves.rforest",
        fromlist=["rforest_hasse_witt_rows"],
    )
    try:
        _observe(stage_observer, "residue_start", {"start": prime, "stop": prime})
        batch = rforest.rforest_hasse_witt_rows(curve, prime, prime, max_rows=1)
        _observe(
            stage_observer,
            "residue_end",
            {"start": prime, "stop": prime, "rows": len(batch["rows"])},
        )
    except (NotImplementedError, OverflowError) as error:
        return _fallback_result(
            curve,
            prime,
            None,
            fallback,
            "rforest_unavailable",
            {"detail": str(error)},
            stage_observer,
        )
    rows = batch["rows"]
    if len(rows) != 1 or rows[0]["prime"] != prime:
        raise RuntimeError("rforest did not return the requested prime row")
    row = rows[0]
    if not row["available"]:
        return _fallback_result(
            curve,
            prime,
            None,
            fallback,
            "rforest_" + str(row["status"]),
            {"rforest_row": row},
            stage_observer,
        )
    return complete_genus3_residues_with_jacobian(
        curve,
        prime,
        row["residues"],
        exact_fallback=fallback,
        order_certificate_provider=order_certificate_provider,
        max_candidates=max_candidates,
        max_combinations=max_combinations,
        max_x_values=max_x_values,
        max_elements=max_elements,
        max_trial_divisions=max_trial_divisions,
        max_baby_steps=max_baby_steps,
        max_group_operations=max_group_operations,
        stage_observer=stage_observer,
    )


def rforest_genus3_local_factors(
    curve: Any,
    start: Any,
    stop: Any,
    *,
    exact_fallback: ExactFallback | None = None,
    order_certificate_provider: OrderCertificateProvider | None = None,
    max_candidates: int = 100_000,
    max_combinations: int = 2_000_000,
    max_x_values: int = 256,
    max_elements: int = 24,
    max_trial_divisions: int = 1_000_000,
    max_baby_steps: int = 100_000,
    max_group_operations: int = 10_000_000,
    stage_observer: StageObserver | None = None,
) -> Iterator[tuple[int, dict[str, Any]]]:
    """Yield a closed prime interval after exactly one rforest traversal."""
    start = _positive_integer(start, "start")
    stop = _positive_integer(stop, "stop")
    if stop < start:
        raise ValueError("stop must be at least start")
    if int(curve.genus()) != 3:
        raise ValueError("certified rforest completion requires a genus-3 curve")
    fallback = _default_exact_fallback if exact_fallback is None else exact_fallback
    rforest = __import__(
        "sagejs.hyperelliptic_curves.rforest",
        fromlist=["rforest_hasse_witt_rows"],
    )
    _observe(stage_observer, "residue_start", {"start": start, "stop": stop})
    try:
        batch = rforest.rforest_hasse_witt_rows(curve, start, stop)
    except (NotImplementedError, OverflowError) as error:
        _observe(
            stage_observer,
            "residue_end",
            {"start": start, "stop": stop, "rows": 0, "available": False},
        )
        for prime in range(start, stop + 1):
            if not sage.is_prime(prime):
                continue
            diagnostics = {"detail": str(error)}
            result = _unavailable_reduction_result(
                curve, prime, "rforest_unavailable", diagnostics
            )
            if result is None:
                result = _fallback_result(
                    curve,
                    prime,
                    None,
                    fallback,
                    "rforest_unavailable",
                    diagnostics,
                    stage_observer,
                )
            yield prime, result
        return
    _observe(
        stage_observer,
        "residue_end",
        {"start": start, "stop": stop, "rows": len(batch["rows"])},
    )
    rows = batch["rows"]
    candidate_window = 16
    for window_start in range(0, len(rows), candidate_window):
        window = rows[window_start : window_start + candidate_window]
        available = [row for row in window if row["available"]]
        enumerations = enumerate_genus3_weil_candidates_batch(
            [(int(row["prime"]), row["residues"]) for row in available],
            max_candidates=max_candidates,
            max_combinations=max_combinations,
        )
        enumeration_index = 0
        for row in window:
            prime = int(row["prime"])
            if not row["available"]:
                reason = "rforest_" + str(row["status"])
                result = _unavailable_reduction_result(
                    curve, prime, reason, {"rforest_row": row}
                )
                if result is None:
                    result = _fallback_result(
                        curve,
                        prime,
                        None,
                        fallback,
                        reason,
                        {"rforest_row": row},
                        stage_observer,
                    )
            else:
                enumeration = enumerations[enumeration_index]
                enumeration_index += 1
                result = complete_genus3_residues_with_jacobian(
                    curve,
                    prime,
                    row["residues"],
                    exact_fallback=fallback,
                    order_certificate_provider=order_certificate_provider,
                    max_candidates=max_candidates,
                    max_combinations=max_combinations,
                    max_x_values=max_x_values,
                    max_elements=max_elements,
                    max_trial_divisions=max_trial_divisions,
                    max_baby_steps=max_baby_steps,
                    max_group_operations=max_group_operations,
                    stage_observer=stage_observer,
                    _candidate_enumeration=enumeration,
                )
            yield prime, result


__all__ = [
    "complete_genus3_residues_with_jacobian",
    "rforest_genus3_local_factor",
    "rforest_genus3_local_factors",
]

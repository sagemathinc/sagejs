"""Exact fractional-ideal arithmetic for maximal number-field orders.

The implementation deliberately works with the canonical rational HNF
lattices already used by :class:`NumberFieldIdeal`.  Colon ideals are
intersections of scalar translates, which gives an especially small and
independently checkable implementation of inversion.  Valuations normalize a
fractional ideal by an exact integer denominator and then divide by a certified
prime ideal until containment stops.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime
from sagejs.native import (
    integer_buffer_values,
    kernel_integer_buffer,
    kernel_integer_zeros,
)

_nf = __import__("sagejs._baselib.number_fields", fromlist=["number_fields"])
NumberFieldIdeal = _nf.NumberFieldIdeal
_nf_coordinates = _nf._nf_coordinates
_nf_element_from_row = _nf._nf_element_from_row
_nf_global = _nf._nf_global
_nf_lcm = _nf._nf_lcm

SERIALIZATION_SCHEMA = "sagejs.number-fields.ideal.v1"
MAX_PACKED_IDEAL_PRODUCT_DEGREE = 16
MAX_PACKED_IDEAL_POWER_CHAIN = 256
MAX_PACKED_IDEAL_POWER_CHAIN_INTEGER_BITS = 16_384
MAX_PACKED_IDEAL_POWER_CHAIN_BUFFER_WORDS = 1_000_000
MAX_PACKED_ELEMENT_VALUATION_LATTICES = 4096
MAX_MULTIPLICATION_TENSOR_CACHE_ENTRIES = 32

_multiplication_tensor_cache: list[tuple[Any, tuple[int, ...], int]] = []
_ideal_product_kernel_override: Any = None
_ideal_power_chain_kernel_override: Any = None
_ideal_power_chains_kernel_override: Any = None
_element_membership_kernel_override: Any = None
_element_membership_batch_kernel_override: Any = None
_element_valuations_kernel_override: Any = None


def _same_order(left: Any, right: Any) -> None:
    if not isinstance(left, NumberFieldIdeal) or not isinstance(
        right, NumberFieldIdeal
    ):
        raise TypeError("ideal arithmetic requires number-field ideals")
    if left.ring() is not right.ring():
        raise TypeError("ideals must belong to the same order")


def _readable_ideal_product(left: Any, right: Any) -> Any:
    """Multiply ideal bases through ordinary exact field elements."""
    _same_order(left, right)
    rows = []
    for left_element in left.basis():
        for right_element in right.basis():
            rows.append(
                _nf_coordinates(
                    left_element * right_element,
                    left.number_field().degree(),
                )
            )
    return NumberFieldIdeal(left.ring(), rows, _check_closed=False)


def _field_multiplication_tensor(field: Any) -> tuple[tuple[int, ...], int]:
    for index, (cached_field, tensor, denominator) in enumerate(
        _multiplication_tensor_cache
    ):
        if cached_field is field:
            if index:
                _multiplication_tensor_cache.append(
                    _multiplication_tensor_cache.pop(index)
                )
            return tensor, denominator
    degree = int(field.degree())
    basis = []
    for index in range(degree):
        row = [sage.QQ(0)] * degree
        row[index] = sage.QQ(1)
        basis.append(_nf_element_from_row(field, row))
    products = []
    denominator = runtime.bigint(1)
    for left in basis:
        for right in basis:
            coordinates = _nf_coordinates(left * right, degree)
            products.append(coordinates)
            for value in coordinates:
                denominator = _nf_lcm(denominator, value._denominator)
    tensor_values = []
    for coordinates in products:
        for value in coordinates:
            scaled = value * denominator
            if scaled._denominator != 1:
                raise ArithmeticError(
                    "failed to clear a field multiplication denominator"
                )
            tensor_values.append(int(scaled._numerator))
    answer = (tuple(tensor_values), int(denominator))
    if len(_multiplication_tensor_cache) >= MAX_MULTIPLICATION_TENSOR_CACHE_ENTRIES:
        _multiplication_tensor_cache.pop(0)
    _multiplication_tensor_cache.append((field, answer[0], answer[1]))
    return answer


def _packed_ideal_basis(ideal: Any) -> tuple[tuple[int, ...], int]:
    try:
        cached = ideal._packed_basis_cache
    except AttributeError:
        # A source checkout can temporarily reuse a runtime bootstrap built
        # before this immutable cache slot was introduced.
        cached = runtime.undefined
    if cached is not runtime.undefined:
        return cached
    denominator = runtime.bigint(1)
    for row in ideal._basis_rows:
        for value in row:
            denominator = _nf_lcm(denominator, value._denominator)
    numerators = []
    for row in ideal._basis_rows:
        for value in row:
            scaled = value * denominator
            if scaled._denominator != 1:
                raise ArithmeticError("failed to clear an ideal-basis denominator")
            numerators.append(int(scaled._numerator))
    answer = (tuple(numerators), int(denominator))
    ideal._packed_basis_cache = answer
    return answer


def _packed_element_coordinates(element: Any, degree: int) -> tuple[list[int], int]:
    coordinates = _nf_coordinates(element, degree)
    denominator = runtime.bigint(1)
    for value in coordinates:
        denominator = _nf_lcm(denominator, value._denominator)
    numerators = []
    for value in coordinates:
        scaled = value * denominator
        if scaled._denominator != 1:
            raise ArithmeticError("failed to clear an element denominator")
        numerators.append(int(scaled._numerator))
    return numerators, int(denominator)


def _packed_membership_word_capacity(
    basis_values: list[tuple[tuple[int, ...], int]],
    vector: list[int],
    degree: int,
) -> int:
    """Bound every exact triangular-membership accumulator."""
    maximum = 1
    for numerator, denominator in basis_values:
        bounds: list[int] = []
        for coordinate in range(degree):
            value = abs(denominator * vector[coordinate])
            for source in range(coordinate):
                value += bounds[source] * abs(numerator[source * degree + coordinate])
            diagonal = abs(numerator[coordinate * degree + coordinate])
            if diagonal == 0:
                raise ArithmeticError("a nonzero ideal has a singular basis")
            maximum = max(maximum, value)
            bounds.append((value + diagonal - 1) // diagonal)
            maximum = max(maximum, bounds[-1])
    return max(16, (maximum.bit_length() + 63) // 64 + 1)


def _packed_kernel_zeros(kernel: Any, length: int, word_capacity: int) -> Any:
    """Allocate a compiled IntegerBuffer with explicit safe JS dimensions."""
    return kernel_integer_zeros(
        kernel, runtime.number(length), runtime.number(word_capacity)
    )


def _packed_element_membership(ideal: Any, element: Any) -> bool | None:
    """Test one exact element through the packed canonical HNF solver."""
    degree = int(ideal.number_field().degree())
    if degree < 1 or degree > MAX_PACKED_IDEAL_PRODUCT_DEGREE:
        return None
    if _element_membership_kernel_override is False:
        return None
    try:
        kernel_module = __import__(
            "sagejs.number_fields.bl_composite_kernel",
            fromlist=["bl_composite_kernel"],
        )
        kernel = (
            _element_membership_kernel_override
            if callable(_element_membership_kernel_override)
            else getattr(kernel_module, "packed_lattice_memberships_in_place", None)
        )
        if not callable(kernel):
            return None
        basis = _packed_ideal_basis(ideal)
        vector, vector_denominator = _packed_element_coordinates(element, degree)
        word_capacity = _packed_membership_word_capacity([basis], vector, degree)
        output = kernel_integer_zeros(kernel, 1, 1)
        if not kernel(
            output,
            kernel_integer_zeros(kernel, degree, word_capacity),
            kernel_integer_buffer(kernel, basis[0]),
            kernel_integer_buffer(kernel, [basis[1]]),
            kernel_integer_buffer(kernel, vector),
            vector_denominator,
            degree,
            1,
        ):
            return None
        values = tuple(int(value) for value in integer_buffer_values(output))
        if values == (0,):
            return False
        if values == (1,):
            return True
    except (ImportError, OverflowError, RuntimeError, TypeError, ValueError):
        pass
    return None


def ideal_contains_element(ideal: Any, value: Any) -> bool:
    """Return exact element membership with a readable matrix fallback."""
    if not isinstance(ideal, NumberFieldIdeal):
        raise TypeError("ideal membership requires a number-field ideal")
    try:
        element = ideal.number_field()(value)
    except Exception:
        return False
    if ideal.is_zero():
        return bool(element.is_zero())
    packed = _packed_element_membership(ideal, element)
    if packed is not None:
        return packed
    row = _nf_coordinates(element, ideal.number_field().degree())
    try:
        inverse = ideal._membership_inverse_cache
    except AttributeError:
        # A source checkout may reuse a runtime bootstrap built before this
        # immutable cache slot was introduced.
        inverse = runtime.undefined
    if inverse is runtime.undefined:
        ideal._membership_inverse_cache = ideal.basis_matrix().inverse()
        inverse = ideal._membership_inverse_cache
    coordinates = _nf_global("vector")(sage.QQ, row) * inverse
    return all(coordinate._denominator == 1 for coordinate in coordinates)


def _packed_elements_membership(ideal: Any, elements: tuple[Any, ...]) -> bool | None:
    """Test several elements against one HNF lattice in one packed call."""
    degree = int(ideal.number_field().degree())
    count = len(elements)
    if (
        degree < 1
        or degree > MAX_PACKED_IDEAL_PRODUCT_DEGREE
        or count < 1
        or count > MAX_PACKED_ELEMENT_VALUATION_LATTICES
    ):
        return None
    if _element_membership_batch_kernel_override is False:
        return None
    try:
        kernel_module = __import__(
            "sagejs.number_fields.bl_composite_kernel",
            fromlist=["bl_composite_kernel"],
        )
        kernel = (
            _element_membership_batch_kernel_override
            if callable(_element_membership_batch_kernel_override)
            else getattr(
                kernel_module,
                "packed_known_overorder_contains_vectors_in_place",
                None,
            )
        )
        if not callable(kernel):
            return None
        basis = _packed_ideal_basis(ideal)
        packed_vectors = [
            _packed_element_coordinates(element, degree) for element in elements
        ]
        word_capacity = max(
            _packed_membership_word_capacity([basis], vector, degree)
            for vector, _denominator in packed_vectors
        )
        return bool(
            kernel(
                kernel_integer_zeros(kernel, degree * degree, word_capacity),
                kernel_integer_buffer(kernel, basis[0]),
                kernel_integer_buffer(
                    kernel,
                    [
                        value
                        for vector, _denominator in packed_vectors
                        for value in vector
                    ],
                ),
                kernel_integer_buffer(
                    kernel,
                    [denominator for _vector, denominator in packed_vectors],
                ),
                basis[1],
                degree,
                count,
            )
        )
    except (ImportError, OverflowError, RuntimeError, TypeError, ValueError):
        return None


def ideal_contains_elements(ideal: Any, values: Any) -> bool:
    """Return whether every supplied exact element belongs to `ideal`."""
    if not isinstance(ideal, NumberFieldIdeal):
        raise TypeError("ideal membership requires a number-field ideal")
    try:
        elements = tuple(ideal.number_field()(value) for value in values)
    except Exception:
        return False
    if not elements:
        return True
    if ideal.is_zero():
        return all(element.is_zero() for element in elements)
    packed = _packed_elements_membership(ideal, elements)
    if packed is not None:
        return packed
    return all(ideal_contains_element(ideal, element) for element in elements)


def _packed_integral_element_valuations(
    element: Any,
    primes: tuple[Any, ...],
    maxima: tuple[int, ...],
) -> tuple[int, ...] | None:
    """Return exact integral valuations through one packed membership batch."""
    degree = int(element.parent().degree())
    lattice_count = sum(maxima)
    if (
        degree < 1
        or degree > MAX_PACKED_IDEAL_PRODUCT_DEGREE
        or lattice_count == 0
        or lattice_count > MAX_PACKED_ELEMENT_VALUATION_LATTICES
    ):
        return None
    if _element_valuations_kernel_override is False:
        return None
    kernel_module = __import__(
        "sagejs.number_fields.bl_composite_kernel", fromlist=["bl_composite_kernel"]
    )
    kernel = (
        _element_valuations_kernel_override
        if callable(_element_valuations_kernel_override)
        else getattr(kernel_module, "packed_lattice_memberships_in_place", None)
    )
    if not callable(kernel):
        return None
    try:
        packed_bases: list[tuple[tuple[int, ...], int]] = []
        for prime_ideal, maximum in zip(primes, maxima, strict=True):
            packed_bases.extend(packed_valuation_power_bases(prime_ideal, maximum))
        vector, vector_denominator = _packed_element_coordinates(element, degree)
        numerators = [value for basis, _denominator in packed_bases for value in basis]
        denominators = [denominator for _basis, denominator in packed_bases]
        word_capacity = _packed_membership_word_capacity(packed_bases, vector, degree)
        output = kernel_integer_zeros(kernel, lattice_count, 1)
        if not kernel(
            output,
            kernel_integer_zeros(kernel, degree, word_capacity),
            kernel_integer_buffer(kernel, numerators),
            kernel_integer_buffer(kernel, denominators),
            kernel_integer_buffer(kernel, vector),
            vector_denominator,
            degree,
            lattice_count,
        ):
            return None
        memberships = tuple(int(value) for value in integer_buffer_values(output))
        if len(memberships) != lattice_count or any(
            value not in (0, 1) for value in memberships
        ):
            return None
        answer: list[int] = []
        cursor = 0
        for maximum in maxima:
            values = memberships[cursor : cursor + maximum]
            cursor += maximum
            valuation = 0
            seen_failure = False
            for member in values:
                if member:
                    if seen_failure:
                        return None
                    valuation += 1
                else:
                    seen_failure = True
            answer.append(valuation)
        return tuple(answer)
    except (ImportError, OverflowError, RuntimeError, TypeError, ValueError):
        return None


def packed_ideal_product_basis_from_bases(
    field: Any,
    left_basis: tuple[int, ...],
    left_denominator: int,
    right_basis: tuple[int, ...],
    right_denominator: int,
) -> tuple[tuple[int, ...], int] | None:
    """Multiply two exact packed bases and return their canonical HNF."""
    degree = int(field.degree())
    if (
        degree < 1
        or degree > MAX_PACKED_IDEAL_PRODUCT_DEGREE
        or len(left_basis) != degree * degree
        or len(right_basis) != degree * degree
        or int(left_denominator) <= 0
        or int(right_denominator) <= 0
    ):
        return None
    kernel_module = __import__(
        "sagejs.number_fields.bl_composite_kernel", fromlist=["bl_composite_kernel"]
    )
    kernel = (
        _ideal_product_kernel_override
        if callable(_ideal_product_kernel_override)
        else getattr(kernel_module, "packed_ideal_product_hnf_in_place", None)
    )
    if not callable(kernel):
        return None
    try:
        tensor, tensor_denominator = _field_multiplication_tensor(field)
        maximum_bits = max(
            [1]
            + [abs(value).bit_length() for value in left_basis]
            + [abs(value).bit_length() for value in right_basis]
            + [abs(value).bit_length() for value in tensor]
        )
        product_bits = 3 * maximum_bits + (degree * degree).bit_length()
        word_capacity = max(16, (product_bits + 63) // 64 + 8 * degree)
        entry_count = degree * degree * degree
        output = kernel_integer_zeros(kernel, entry_count, word_capacity)
        source = kernel_integer_zeros(kernel, entry_count, word_capacity)
        workspace = kernel_integer_zeros(kernel, 2 * degree, word_capacity)
        if not kernel(
            output,
            source,
            workspace,
            kernel_integer_buffer(kernel, left_basis),
            kernel_integer_buffer(kernel, right_basis),
            kernel_integer_buffer(kernel, tensor),
            degree,
        ):
            return None
        values = tuple(int(value) for value in integer_buffer_values(output))
        denominator = left_denominator * right_denominator * tensor_denominator
        return values[: degree * degree], int(denominator)
    except (ImportError, OverflowError, RuntimeError, TypeError, ValueError):
        return None


def _packed_ideal_product(left: Any, right: Any) -> Any:
    degree = int(left.number_field().degree())
    if (
        degree < 1
        or degree > MAX_PACKED_IDEAL_PRODUCT_DEGREE
        or left.is_zero()
        or right.is_zero()
    ):
        return None
    try:
        left_values, left_denominator = _packed_ideal_basis(left)
        right_values, right_denominator = _packed_ideal_basis(right)
        packed = packed_ideal_product_basis_from_bases(
            left.number_field(),
            left_values,
            left_denominator,
            right_values,
            right_denominator,
        )
        if packed is None:
            return None
        values, denominator = packed
        rows = [
            [
                sage.QQ(int(values[row * degree + column])) / sage.QQ(denominator)
                for column in range(degree)
            ]
            for row in range(degree)
        ]
        return NumberFieldIdeal._from_canonical_basis_rows(left.ring(), rows)
    except (OverflowError, RuntimeError, TypeError, ValueError):
        return None


def packed_ideal_power_bases_from_basis(
    field: Any,
    basis: tuple[int, ...],
    basis_denominator: int,
    maximum: int,
) -> tuple[tuple[tuple[int, ...], int], ...] | None:
    """Return packed HNF powers from one canonical numerator basis.

    This is the representation-level boundary used by packed factor-base
    producers: no `NumberFieldIdeal` is needed merely to feed an exact HNF to
    the source-transparent power-chain kernel.
    """
    degree = int(field.degree())
    if (
        degree < 1
        or degree > MAX_PACKED_IDEAL_PRODUCT_DEGREE
        or maximum < 1
        or maximum > MAX_PACKED_IDEAL_POWER_CHAIN
        or len(basis) != degree * degree
        or int(basis_denominator) <= 0
    ):
        return None
    if _ideal_power_chain_kernel_override is False:
        return None
    kernel_module = __import__(
        "sagejs.number_fields.bl_composite_kernel", fromlist=["bl_composite_kernel"]
    )
    kernel = (
        _ideal_power_chain_kernel_override
        if callable(_ideal_power_chain_kernel_override)
        else getattr(kernel_module, "packed_ideal_power_chain_hnf_in_place", None)
    )
    if not callable(kernel):
        return None
    try:
        tensor, tensor_denominator = _field_multiplication_tensor(field)
        maximum_bits = max(
            [1]
            + [abs(value).bit_length() for value in basis]
            + [abs(value).bit_length() for value in tensor]
        )
        if maximum_bits > MAX_PACKED_IDEAL_POWER_CHAIN_INTEGER_BITS:
            return None
        growth_bits = maximum * (3 * maximum_bits + (degree * degree).bit_length())
        word_capacity = max(16, (growth_bits + 63) // 64 + 8 * degree)
        square = degree * degree
        product_entries = square * degree
        buffer_entries = maximum * square + 2 * product_entries + 2 * degree
        if word_capacity > MAX_PACKED_IDEAL_POWER_CHAIN_BUFFER_WORDS // buffer_entries:
            return None
        powers = _packed_kernel_zeros(kernel, maximum * square, word_capacity)
        if not kernel(
            powers,
            _packed_kernel_zeros(kernel, product_entries, word_capacity),
            _packed_kernel_zeros(kernel, product_entries, word_capacity),
            _packed_kernel_zeros(kernel, 2 * degree, word_capacity),
            kernel_integer_buffer(kernel, basis),
            kernel_integer_buffer(kernel, tensor),
            degree,
            maximum,
        ):
            return None
        values = tuple(int(value) for value in integer_buffer_values(powers))
        if len(values) != maximum * square:
            return None
        answer: list[tuple[tuple[int, ...], int]] = []
        denominator = runtime.bigint(basis_denominator)
        denominator_step = runtime.bigint(basis_denominator) * runtime.bigint(
            tensor_denominator
        )
        for exponent in range(maximum):
            offset = exponent * square
            answer.append((values[offset : offset + square], int(denominator)))
            denominator *= denominator_step
        return tuple(answer)
    except (ImportError, OverflowError, RuntimeError, TypeError, ValueError):
        return None


def packed_ideal_power_basis_chains_from_bases(
    field: Any,
    specifications: tuple[tuple[tuple[int, ...], int, int], ...],
) -> tuple[tuple[tuple[tuple[int, ...], int], ...], ...] | None:
    """Return several exact packed HNF power chains in one bounded call."""
    degree = int(field.degree())
    if (
        degree < 1
        or degree > MAX_PACKED_IDEAL_PRODUCT_DEGREE
        or not specifications
        or len(specifications) > MAX_PACKED_IDEAL_POWER_CHAIN
    ):
        return None
    if _ideal_power_chains_kernel_override is False:
        return None
    square = degree * degree
    total_power_count = 0
    maximum_power_count = 0
    bases: list[int] = []
    offsets = [0]
    for basis, basis_denominator, maximum in specifications:
        count = int(maximum)
        if (
            count < 1
            or count > MAX_PACKED_IDEAL_POWER_CHAIN
            or len(basis) != square
            or int(basis_denominator) <= 0
        ):
            return None
        total_power_count += count
        if total_power_count > MAX_PACKED_IDEAL_POWER_CHAIN:
            return None
        maximum_power_count = max(maximum_power_count, count)
        bases.extend(int(value) for value in basis)
        offsets.append(total_power_count)
    kernel_module = __import__(
        "sagejs.number_fields.bl_composite_kernel", fromlist=["bl_composite_kernel"]
    )
    kernel = (
        _ideal_power_chains_kernel_override
        if callable(_ideal_power_chains_kernel_override)
        else getattr(kernel_module, "packed_ideal_power_chains_hnf_in_place", None)
    )
    if not callable(kernel):
        return None
    try:
        tensor, tensor_denominator = _field_multiplication_tensor(field)
        maximum_bits = max(
            [1]
            + [abs(value).bit_length() for value in bases]
            + [abs(value).bit_length() for value in tensor]
        )
        if maximum_bits > MAX_PACKED_IDEAL_POWER_CHAIN_INTEGER_BITS:
            return None
        growth_bits = maximum_power_count * (3 * maximum_bits + square.bit_length())
        word_capacity = max(16, (growth_bits + 63) // 64 + 8 * degree)
        product_entries = square * degree
        buffer_entries = (
            total_power_count * square
            + 2 * product_entries
            + 2 * degree
            + len(bases)
            + len(offsets)
            + len(tensor)
        )
        if word_capacity > MAX_PACKED_IDEAL_POWER_CHAIN_BUFFER_WORDS // buffer_entries:
            return None
        powers = _packed_kernel_zeros(kernel, total_power_count * square, word_capacity)
        if not kernel(
            powers,
            _packed_kernel_zeros(kernel, product_entries, word_capacity),
            _packed_kernel_zeros(kernel, product_entries, word_capacity),
            _packed_kernel_zeros(kernel, 2 * degree, word_capacity),
            kernel_integer_buffer(kernel, bases),
            kernel_integer_buffer(kernel, offsets),
            kernel_integer_buffer(kernel, tensor),
            degree,
            len(specifications),
            total_power_count,
        ):
            return None
        values = tuple(int(value) for value in integer_buffer_values(powers))
        if len(values) != total_power_count * square:
            return None
        answer: list[tuple[tuple[tuple[int, ...], int], ...]] = []
        power_offset = 0
        for _basis, basis_denominator, maximum in specifications:
            denominator = runtime.bigint(basis_denominator)
            denominator_step = runtime.bigint(basis_denominator) * runtime.bigint(
                tensor_denominator
            )
            chain: list[tuple[tuple[int, ...], int]] = []
            for _exponent in range(int(maximum)):
                offset = power_offset * square
                chain.append((values[offset : offset + square], int(denominator)))
                denominator *= denominator_step
                power_offset += 1
            answer.append(tuple(chain))
        return tuple(answer)
    except (ImportError, OverflowError, RuntimeError, TypeError, ValueError):
        return None


def _compute_packed_ideal_power_bases(
    ideal: Any, maximum: int
) -> tuple[tuple[tuple[int, ...], int], ...] | None:
    """Return packed HNF bases for `I, I^2, ..., I^maximum`."""
    if ideal.is_zero():
        return None
    basis, basis_denominator = _packed_ideal_basis(ideal)
    return packed_ideal_power_bases_from_basis(
        ideal.number_field(), basis, basis_denominator, maximum
    )


def packed_valuation_power_bases(
    prime_ideal: Any, maximum: int
) -> tuple[tuple[tuple[int, ...], int], ...]:
    """Return cached packed HNF bases for the first valuation powers."""
    count = int(maximum)
    if count < 0 or count > MAX_PACKED_IDEAL_POWER_CHAIN:
        raise ValueError("the requested valuation-power count is out of range")
    try:
        cache = prime_ideal._packed_valuation_power_basis_cache
    except AttributeError:
        cache = []
        prime_ideal._packed_valuation_power_basis_cache = cache
    if len(cache) >= count:
        return tuple(cache[:count])
    if count:
        packed = _compute_packed_ideal_power_bases(prime_ideal, count)
        if packed is not None:
            cache.clear()
            cache.extend(packed)
            return tuple(cache)
    powers = prime_ideal._valuation_power_cache
    while len(powers) < count:
        powers.append(powers[-1] * prime_ideal)
    while len(cache) < count:
        cache.append(_packed_ideal_basis(powers[len(cache)]))
    return tuple(cache)


def ensure_valuation_powers(prime_ideal: Any, maximum: int) -> tuple[Any, ...]:
    """Populate an immutable prime's bounded valuation-power cache exactly."""
    count = int(maximum)
    if count < 0 or count > MAX_PACKED_IDEAL_POWER_CHAIN:
        raise ValueError("the requested valuation-power count is out of range")
    powers = prime_ideal._valuation_power_cache
    if len(powers) >= count:
        return tuple(powers[:count])
    if len(powers) == 1:
        packed = packed_valuation_power_bases(prime_ideal, count)
        degree = int(prime_ideal.number_field().degree())
        while len(powers) < count:
            numerators, denominator = packed[len(powers)]
            rows = [
                [
                    sage.QQ(numerators[row * degree + column]) / sage.QQ(denominator)
                    for column in range(degree)
                ]
                for row in range(degree)
            ]
            powers.append(
                NumberFieldIdeal._from_canonical_basis_rows(prime_ideal.ring(), rows)
            )
        return tuple(powers[:count])
    while len(powers) < count:
        powers.append(powers[-1] * prime_ideal)
    return tuple(powers[:count])


def ideal_product(left: Any, right: Any) -> Any:
    """Return the exact product through a packed HNF when available."""
    _same_order(left, right)
    if left.is_zero() or right.is_zero():
        return NumberFieldIdeal(left.ring(), [], _check_closed=False)
    packed = _packed_ideal_product(left, right)
    return _readable_ideal_product(left, right) if packed is None else packed


def ideal_contains(container: Any, contained: Any) -> bool:
    """Return whether `contained` is a sublattice of `container`."""
    _same_order(container, contained)
    return ideal_contains_elements(container, contained.basis())


def ideal_divides(divisor: Any, dividend: Any) -> bool:
    """Return exact integral-ideal divisibility in a maximal order.

    For integral ideals in a Dedekind domain, `divisor | dividend` precisely
    when `dividend` is contained in `divisor`.
    """
    _same_order(divisor, dividend)
    if not divisor.is_integral() or not dividend.is_integral():
        raise ValueError("ideal divisibility is defined here for integral ideals")
    return ideal_contains(divisor, dividend)


def scalar_translate(ideal: Any, scalar: Any) -> Any:
    if ideal.is_zero():
        return NumberFieldIdeal(ideal.ring(), [], _check_closed=False)
    value = ideal.number_field()(scalar)
    if value.is_zero():
        return NumberFieldIdeal(ideal.ring(), [], _check_closed=False)
    return NumberFieldIdeal(
        ideal.ring(),
        [
            _nf_coordinates(value * element, ideal.number_field().degree())
            for element in ideal.basis()
        ],
        _check_closed=False,
    )


def colon_ideal(numerator: Any, denominator: Any) -> Any:
    """Return `(numerator : denominator)` as an exact fractional ideal."""
    _same_order(numerator, denominator)
    if denominator.is_zero():
        raise ZeroDivisionError("the colon by the zero ideal is not supported")
    if numerator.is_zero():
        return NumberFieldIdeal(numerator.ring(), [], _check_closed=False)
    answer = None
    for element in denominator.basis():
        translated = scalar_translate(numerator, element.inverse())
        answer = translated if answer is None else answer.intersection(translated)
    if answer is None:
        raise ArithmeticError("a nonzero ideal has no lattice basis")
    # Recheck the defining universal property independently of the
    # intersection implementation.
    if not ideal_contains(numerator, answer * denominator):
        raise ArithmeticError("colon-ideal construction failed its containment check")
    return answer


def ideal_inverse(ideal: Any) -> Any:
    """Return the exact inverse of a nonzero ideal in a maximal order."""
    if not isinstance(ideal, NumberFieldIdeal):
        raise TypeError("ideal inversion requires a number-field ideal")
    if ideal.is_zero():
        raise ZeroDivisionError("the zero ideal is not invertible")
    order = ideal.ring()
    if not order.is_maximal():
        raise ValueError("ideal inversion currently requires a certified maximal order")
    inverse = colon_ideal(order.ideal(1), ideal)
    if inverse * ideal != order.ideal(1):
        raise ArithmeticError("the colon lattice is not an invertible-ideal inverse")
    return inverse


def ideal_quotient(numerator: Any, denominator: Any) -> Any:
    """Return the multiplicative quotient of two nonzero invertible ideals."""
    _same_order(numerator, denominator)
    if denominator.is_zero():
        raise ZeroDivisionError("ideal division by zero")
    return numerator * ideal_inverse(denominator)


def ideal_power(ideal: Any, exponent: Any) -> Any:
    power = runtime.integer_bigint(exponent)
    if power < 0:
        return ideal_power(ideal_inverse(ideal), -power)
    answer = ideal.ring().ideal(1)
    base = ideal
    while power:
        if power % runtime.bigint(2):
            answer = answer * base
        power //= runtime.bigint(2)
        if power:
            base = base * base
    return answer


def integrality_denominator(ideal: Any) -> Any:
    """Return the least positive integer `d` for which `d*ideal` is integral."""
    if not isinstance(ideal, NumberFieldIdeal):
        raise TypeError("an integrality denominator requires an ideal")
    if ideal.is_zero():
        return sage.ZZ(1)
    relative = ideal.basis_matrix() * ideal.ring().basis_matrix().inverse()
    denominator = runtime.bigint(1)
    for row in relative.rows():
        for value in row:
            denominator = _nf_lcm(denominator, value._denominator)
    scaled = scalar_translate(ideal, denominator)
    if not scaled.is_integral():
        raise ArithmeticError("failed to clear an ideal's integrality denominator")
    return sage.ZZ(denominator)


def numerator_ideal(ideal: Any) -> Any:
    return scalar_translate(ideal, integrality_denominator(ideal))


def _p_adic_valuation_integer(value: Any, prime: int) -> int:
    integer = runtime.integer_bigint(value)
    if integer < 0:
        integer = -integer
    if integer == 0:
        raise ValueError("the p-adic valuation of zero is infinite")
    answer = 0
    p = runtime.bigint(prime)
    while integer % p == 0:
        integer //= p
        answer += 1
    return answer


def ideal_valuation(ideal: Any, prime_ideal: Any) -> int:
    """Return the exact valuation of a nonzero fractional ideal at `P`."""
    _same_order(ideal, prime_ideal)
    if ideal.is_zero():
        raise ValueError("the valuation of the zero ideal is infinite")
    prime = int(prime_ideal.rational_prime())
    denominator = integrality_denominator(ideal)
    integral = scalar_translate(ideal, denominator)
    valuation = 0
    # Every successful containment removes one exact prime-ideal factor.  The
    # norm gives a strict, deterministic loop bound.
    norm = integral.norm()
    if norm._denominator != 1:
        raise ArithmeticError("an integral ideal has nonintegral norm")
    maximum = 0
    remaining_norm = runtime.integer_bigint(norm._numerator)
    while remaining_norm > 1 and remaining_norm % runtime.bigint(prime) == 0:
        remaining_norm //= runtime.bigint(prime)
        maximum += 1
    maximum += 1
    while ideal_contains(prime_ideal, integral):
        integral = ideal_quotient(integral, prime_ideal)
        if not integral.is_integral():
            raise ArithmeticError("prime-ideal division lost integrality")
        valuation += 1
        if valuation > maximum:
            raise ArithmeticError("ideal valuation exceeded its exact norm bound")
    return valuation - prime_ideal.ramification_index() * _p_adic_valuation_integer(
        denominator, prime
    )


def element_valuation(value: Any, prime_ideal: Any) -> int:
    """Return the exact valuation of `value` at one prime ideal."""
    return element_valuations(value, (prime_ideal,))[0]


def _element_valuations_impl(
    value: Any, prime_ideals: Any, *, return_norm: bool
) -> Any:
    """Return exact valuations and optionally the already-computed norm.

    The algebraic element, its absolute norm, and (for a fractional element)
    its principal ideal are constructed once.  Each returned entry retains
    the same exact prime-power lattice-membership test as `element_valuation`.
    """
    primes = tuple(prime_ideals)
    if not primes:
        return ((), None) if return_norm else ()
    reference = primes[0]
    if not isinstance(reference, NumberFieldIdeal):
        raise TypeError("element valuations require number-field prime ideals")
    for prime_ideal in primes[1:]:
        _same_order(reference, prime_ideal)
    field = reference.number_field()
    element = field(value)
    if element.is_zero():
        raise ValueError("the valuation of zero is infinite")
    order = reference.ring()
    if element in order:
        # For an algebraic integer alpha, `(alpha)` is contained in `P^k`
        # exactly when alpha is an element of `P^k`.  Testing lattice
        # membership while multiplying successive integral powers avoids the
        # colon-ideal inversions used by the fully general fractional-ideal
        # routine below.  The rational norm gives an exact finite loop bound:
        # every factor P contributes `f(P/p) * v_P(alpha)` to v_p(N(alpha)).
        norm = element.norm()
        if norm._denominator != 1:
            raise ArithmeticError("an algebraic integer has nonintegral norm")
        norm_valuations: dict[int, int] = {}
        maxima: list[int] = []
        for prime_ideal in primes:
            rational_prime = int(prime_ideal.rational_prime())
            norm_valuation = norm_valuations.get(rational_prime)
            if norm_valuation is None:
                norm_valuation = _p_adic_valuation_integer(
                    norm._numerator, rational_prime
                )
                norm_valuations[rational_prime] = norm_valuation
            residue_degree = int(prime_ideal.residue_degree())
            if residue_degree < 1:
                raise ArithmeticError("a prime ideal has invalid residue degree")
            maxima.append(norm_valuation // residue_degree)
        packed = _packed_integral_element_valuations(element, primes, tuple(maxima))
        if packed is not None:
            return (packed, norm) if return_norm else packed
        answer: list[int] = []
        for prime_ideal, maximum in zip(primes, maxima, strict=True):
            valuation = 0
            powers = ensure_valuation_powers(prime_ideal, maximum)
            while valuation < maximum and element in powers[valuation]:
                valuation += 1
            answer.append(valuation)
        valuations = tuple(answer)
        return (valuations, norm) if return_norm else valuations
    principal = order.ideal(element)
    valuations = tuple(
        ideal_valuation(principal, prime_ideal) for prime_ideal in primes
    )
    return (valuations, element.norm()) if return_norm else valuations


def element_valuations_with_norm(
    value: Any, prime_ideals: Any
) -> tuple[tuple[int, ...], Any]:
    """Return exact valuations together with their internally computed norm."""
    valuations, norm = _element_valuations_impl(value, prime_ideals, return_norm=True)
    if norm is None:
        raise ValueError("element valuations with norm require a nonempty prime base")
    return valuations, norm


def element_valuations(value: Any, prime_ideals: Any) -> tuple[int, ...]:
    """Return exact valuations of one element at several prime ideals."""
    return _element_valuations_impl(value, prime_ideals, return_norm=False)


def factor_integral_ideal(ideal: Any) -> Any:
    """Factor a nonzero integral ideal and exactly reconstruct its lattice."""
    if not isinstance(ideal, NumberFieldIdeal):
        raise TypeError("ideal factorization requires a number-field ideal")
    if ideal.is_zero():
        raise ValueError("the zero ideal has no finite prime factorization")
    if not ideal.is_integral():
        raise ValueError("factor_integral_ideal requires an integral ideal")
    norm = ideal.norm()
    if norm._denominator != 1:
        raise ArithmeticError("an integral ideal has nonintegral norm")
    prime_module = __import__(
        "sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"]
    )
    factors: list[list[Any]] = []
    for rational_prime, _norm_exponent in sage.factor(norm._numerator):
        decomposition = prime_module.factor_rational_prime(ideal.ring(), rational_prime)
        for prime_ideal, _ramification in decomposition:
            valuation = ideal_valuation(ideal, prime_ideal)
            if valuation:
                factors.append([prime_ideal, valuation])
    result: Any = sage.Factorization(
        factors,
        unit=ideal.ring().ideal(1),
        cr=False,
        sort=False,
        simplify=False,
    )
    reconstructed = ideal.ring().ideal(1)
    for prime_ideal, exponent in result:
        reconstructed = reconstructed * ideal_power(prime_ideal, exponent)
    if reconstructed != ideal:
        raise ArithmeticError(
            "prime-ideal factors do not reconstruct the input lattice"
        )
    return result


def _encode_rows(rows: list[list[Any]]) -> list[list[list[int]]]:
    return [
        [[int(value._numerator), int(value._denominator)] for value in row]
        for row in rows
    ]


def serialize_ideal(ideal: Any) -> dict[str, Any]:
    """Return the versioned canonical HNF payload for an exact ideal."""
    if not isinstance(ideal, NumberFieldIdeal):
        raise TypeError("only a number-field ideal can be serialized")
    prime_module = __import__(
        "sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"]
    )
    return {
        "schema": SERIALIZATION_SCHEMA,
        "field_instance": prime_module._identity_token(ideal.number_field()),
        "order_instance": prime_module._identity_token(ideal.ring()),
        "field_order_fingerprint": prime_module._field_order_fingerprint(ideal.ring()),
        "basis": _encode_rows(ideal._basis_rows),
    }


def ideal_from_dict(order: Any, data: dict[str, Any]) -> Any:
    if data.get("schema") != SERIALIZATION_SCHEMA:
        raise ValueError("unsupported ideal serialization schema")
    prime_module = __import__(
        "sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"]
    )
    if data.get("field_order_fingerprint") != prime_module._field_order_fingerprint(
        order
    ):
        raise ValueError("an ideal has a different exact field/order fingerprint")
    if data.get("field_instance") != prime_module._identity_token(
        order.number_field()
    ) or data.get("order_instance") != prime_module._identity_token(order):
        raise ValueError(
            "an ideal cannot be loaded into another field or order instance"
        )
    rows = [
        [sage.QQ(value[0]) / sage.QQ(value[1]) for value in row]
        for row in data["basis"]
    ]
    return NumberFieldIdeal(order, rows)


__all__ = [
    "colon_ideal",
    "element_valuation",
    "element_valuations",
    "ensure_valuation_powers",
    "factor_integral_ideal",
    "ideal_contains",
    "ideal_contains_element",
    "ideal_contains_elements",
    "ideal_divides",
    "ideal_from_dict",
    "ideal_inverse",
    "ideal_product",
    "ideal_power",
    "ideal_quotient",
    "ideal_valuation",
    "integrality_denominator",
    "numerator_ideal",
    "packed_valuation_power_bases",
    "packed_ideal_power_bases_from_basis",
    "packed_ideal_power_basis_chains_from_bases",
    "scalar_translate",
    "serialize_ideal",
]

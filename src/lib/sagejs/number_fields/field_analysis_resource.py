"""Independent decoder for the fused native number-field analysis resource.

The native call returns one immutable packed certificate.  This module checks
that certificate using ordinary exact Python arithmetic: it recomputes the
polynomial discriminant, authenticates the lazy coprime decomposition, checks
canonical row HNF, recomputes the order index, and verifies multiplicative
closure. The native Round-2 candidate is never treated as its own local
maximality proof; later public adoption must supply an independent fixed-point
checker before promoting it to a certified maximal order.
"""

from __future__ import annotations

from typing import Any

from sagejs.number_fields.buchmann_lenstra import polynomial_discriminant
from sagejs.number_fields.maximal_order_certification import check_order_lattice

ANALYSIS_COMPLETE_CANDIDATE = 0
ANALYSIS_FALLBACK_UNRESOLVED = 1
ANALYSIS_FALLBACK_ARBITRARY_PRIME = 2
ANALYSIS_FALLBACK_NATIVE_FAILURE = 3

COMPONENT_PROVEN_WORD_PRIME = 0
COMPONENT_UNRESOLVED = 1
COMPONENT_ARBITRARY_PRIME = 2

_MR64_BASES = [2, 325, 9375, 28178, 450775, 9780504, 1795265022]
_PROBABLE_BASES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41]


def _byte(payload: Any, index: int) -> int:
    value = int(payload[index])
    if value < 0 or value > 255:
        raise ValueError("field-analysis payload contains a non-byte value")
    return value


def _unsigned(payload: Any, offset: int, width: int) -> int:
    answer = 0
    for index in range(width):
        answer += _byte(payload, offset + index) << (8 * index)
    return answer


def _integer(payload: Any, offset: int) -> tuple[int, int]:
    if offset > len(payload) - 4:
        raise ValueError("truncated field-analysis integer header")
    header = _unsigned(payload, offset, 4)
    length = header & 0x7FFFFFFF
    negative = header >= 0x80000000
    offset += 4
    if length > len(payload) - offset:
        raise ValueError("truncated field-analysis integer")
    if negative and length == 0:
        raise ValueError("noncanonical negative zero in field-analysis payload")
    if length and _byte(payload, offset + length - 1) == 0:
        raise ValueError("noncanonical field-analysis integer encoding")
    value = _unsigned(payload, offset, length)
    return (-value if negative else value), offset + length


def _gcd(left: int, right: int) -> int:
    a = abs(int(left))
    b = abs(int(right))
    while b:
        a, b = b, a % b
    return a


def _determinant(rows: list[list[int]]) -> int:
    degree = len(rows)
    if degree == 0:
        return 1
    matrix = [list(row) for row in rows]
    sign = 1
    previous = 1
    for column in range(degree - 1):
        pivot_row = column
        while pivot_row < degree and matrix[pivot_row][column] == 0:
            pivot_row += 1
        if pivot_row == degree:
            return 0
        if pivot_row != column:
            matrix[column], matrix[pivot_row] = matrix[pivot_row], matrix[column]
            sign = -sign
        pivot = matrix[column][column]
        for row in range(column + 1, degree):
            for entry in range(column + 1, degree):
                numerator = (
                    matrix[row][entry] * pivot
                    - matrix[row][column] * matrix[column][entry]
                )
                if previous != 1:
                    if numerator % previous != 0:
                        raise ArithmeticError("fraction-free determinant was inexact")
                    numerator //= previous
                matrix[row][entry] = numerator
            matrix[row][column] = 0
        previous = pivot
    return sign * matrix[-1][-1]


def _miller_rabin_witness(number: int, base: int) -> bool:
    if base % number == 0:
        return False
    odd = number - 1
    shifts = 0
    while odd % 2 == 0:
        odd //= 2
        shifts += 1
    value = pow(base % number, odd, number)
    if value in (1, number - 1):
        return False
    for _index in range(shifts - 1):
        value = value * value % number
        if value == number - 1:
            return False
    return True


def _passes_probable_prime_screen(number: int, bases: list[int]) -> bool:
    if number < 2:
        return False
    for prime in (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47):
        if number == prime:
            return True
        if number % prime == 0:
            return False
    return not any(_miller_rabin_witness(number, base) for base in bases)


def _canonical_row_hnf(rows: list[list[int]]) -> bool:
    degree = len(rows)
    for row in range(degree):
        diagonal = rows[row][row]
        if diagonal <= 0:
            return False
        for column in range(row):
            if rows[row][column] != 0:
                return False
        for column in range(row + 1, degree):
            if rows[row][column] < 0 or rows[row][column] >= rows[column][column]:
                return False
    return True


class FieldAnalysisComponent:
    """One exact coprime component with a deliberately bounded proof state."""

    def __init__(self, value: int, exponent: int, state: int) -> None:
        self.value = int(value)
        self.exponent = int(exponent)
        self.state = int(state)

    def to_dict(self) -> dict[str, Any]:
        names = {
            COMPONENT_PROVEN_WORD_PRIME: "proven-word-prime",
            COMPONENT_UNRESOLVED: "unresolved",
            COMPONENT_ARBITRARY_PRIME: "arbitrary-prime-awaiting-proof",
        }
        return {
            "value": self.value,
            "exponent": self.exponent,
            "state": names[self.state],
        }


class NativeFieldAnalysisResult:
    """An immutable fused discriminant, decomposition, and order certificate."""

    def __init__(
        self,
        status: int,
        trial_bound: int,
        resolved_components: int,
        native_primes: int,
        scale: int,
        polynomial: list[int],
        components: list[FieldAnalysisComponent],
        basis_numerator: list[list[int]],
        basis_denominator: int,
        index: int,
        equation_discriminant: int,
        order_discriminant: int,
    ) -> None:
        self.status = status
        self.trial_bound = trial_bound
        self.resolved_components = resolved_components
        self.native_primes = native_primes
        self.scale = scale
        self.polynomial = list(polynomial)
        self.components = list(components)
        self.basis_numerator = [list(row) for row in basis_numerator]
        self.basis_denominator = basis_denominator
        self.index = index
        self.equation_discriminant = equation_discriminant
        self.order_discriminant = order_discriminant

    @property
    def candidate_complete(self) -> bool:
        """Whether native construction covered every exact component."""
        return self.status == ANALYSIS_COMPLETE_CANDIDATE

    @property
    def certified(self) -> bool:
        """Packed Round-2 construction is never its own maximality proof."""
        return False

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.number-fields/native-field-analysis-v1",
            "status": self.status,
            "candidate_complete": self.candidate_complete,
            "certified": self.certified,
            "trial_bound": self.trial_bound,
            "resolved_components": self.resolved_components,
            "native_primes": self.native_primes,
            "scale": self.scale,
            "polynomial": list(self.polynomial),
            "components": [component.to_dict() for component in self.components],
            "basis_numerator": [list(row) for row in self.basis_numerator],
            "basis_denominator": self.basis_denominator,
            "index": self.index,
            "equation_discriminant": self.equation_discriminant,
            "order_discriminant": self.order_discriminant,
        }


def _validate_analysis(result: NativeFieldAnalysisResult) -> None:
    if result.status not in (
        ANALYSIS_COMPLETE_CANDIDATE,
        ANALYSIS_FALLBACK_UNRESOLVED,
        ANALYSIS_FALLBACK_ARBITRARY_PRIME,
        ANALYSIS_FALLBACK_NATIVE_FAILURE,
    ):
        raise ValueError("unknown field-analysis status")
    coefficients = result.polynomial
    degree = len(coefficients) - 1
    if degree < 1 or coefficients[-1] != 1 or result.scale < 1:
        raise ValueError("field-analysis source polynomial/scale is invalid")
    discriminant = polynomial_discriminant(coefficients)
    if discriminant == 0 or discriminant != result.equation_discriminant:
        raise ValueError("field-analysis polynomial discriminant is inconsistent")

    product = 1
    proven = 0
    native = 0
    unresolved = 0
    arbitrary = 0
    for index, component in enumerate(result.components):
        if component.value < 2 or component.exponent < 1:
            raise ValueError("field-analysis component is not positive")
        for previous in result.components[:index]:
            if _gcd(component.value, previous.value) != 1:
                raise ValueError("field-analysis components are not coprime")
        product *= component.value**component.exponent
        if component.state == COMPONENT_PROVEN_WORD_PRIME:
            if component.value >= 1 << 64 or not _passes_probable_prime_screen(
                component.value, _MR64_BASES
            ):
                raise ValueError("field-analysis word-prime proof is invalid")
            proven += 1
            if component.exponent >= 2:
                native += 1
        elif component.state == COMPONENT_ARBITRARY_PRIME:
            if component.value < 1 << 64 or not _passes_probable_prime_screen(
                component.value, _PROBABLE_BASES
            ):
                raise ValueError("field-analysis arbitrary-prime hint is invalid")
            arbitrary += 1
        elif component.state == COMPONENT_UNRESOLVED:
            unresolved += 1
        else:
            raise ValueError("unknown field-analysis component state")
    if product != abs(discriminant):
        raise ValueError("field-analysis components do not reproduce the discriminant")
    if unresolved > 1 or arbitrary > 1 or unresolved + arbitrary > 1:
        raise ValueError("field-analysis certificate has multiple lazy residuals")

    expected_status = (
        ANALYSIS_FALLBACK_UNRESOLVED
        if unresolved
        else ANALYSIS_FALLBACK_ARBITRARY_PRIME
        if arbitrary
        else ANALYSIS_COMPLETE_CANDIDATE
    )
    if result.status != ANALYSIS_FALLBACK_NATIVE_FAILURE:
        if result.status != expected_status:
            raise ValueError("field-analysis status disagrees with its components")
        if result.resolved_components != proven or result.native_primes != native:
            raise ValueError("field-analysis resolution counts are inconsistent")
    elif result.resolved_components != 0 or result.native_primes != 0:
        raise ValueError("failed native analysis claimed completed local work")

    rows = result.basis_numerator
    if len(rows) != degree or any(len(row) != degree for row in rows):
        raise ValueError("field-analysis basis has the wrong shape")
    if result.basis_denominator < 1 or not _canonical_row_hnf(rows):
        raise ValueError("field-analysis basis is not canonical row HNF")
    content = result.basis_denominator
    for row in rows:
        for value in row:
            content = _gcd(content, value)
    if content != 1:
        raise ValueError("field-analysis basis has nonprimitive common content")
    determinant = abs(_determinant(rows))
    denominator_power = result.basis_denominator**degree
    if determinant == 0 or denominator_power % determinant != 0:
        raise ValueError("field-analysis basis has a nonintegral index")
    index = denominator_power // determinant
    if index != result.index or index < 1:
        raise ValueError("field-analysis order index is inconsistent")
    if result.order_discriminant * index * index != discriminant:
        raise ValueError("field-analysis order discriminant is inconsistent")
    lattice = check_order_lattice(coefficients, rows, result.basis_denominator)
    if not bool(lattice["valid"]):
        raise ValueError(
            "field-analysis basis is not an order: " + str(lattice["reason"])
        )


def decode_field_analysis_resource(
    payload: Any,
    *,
    expected_polynomial: list[int] | None = None,
    expected_scale: int | None = None,
) -> NativeFieldAnalysisResult:
    """Decode and independently authenticate a packed native certificate."""
    if len(payload) < 80:
        raise ValueError("truncated field-analysis resource")
    magic = [83, 74, 78, 70, 65, 1, 0, 0]
    if [_byte(payload, index) for index in range(8)] != magic:
        raise ValueError("unsupported field-analysis resource schema")
    degree = _unsigned(payload, 8, 8)
    status = _unsigned(payload, 16, 8)
    trial_bound = _unsigned(payload, 24, 8)
    component_count = _unsigned(payload, 32, 8)
    resolved_components = _unsigned(payload, 40, 8)
    native_primes = _unsigned(payload, 48, 8)
    entry_count = _unsigned(payload, 56, 8)
    version = _unsigned(payload, 64, 8)
    reserved = _unsigned(payload, 72, 8)
    if degree == 0 or degree > 1_000_000 or version != 1 or reserved != 0:
        raise ValueError("invalid field-analysis resource header")
    expected_entries = 5 + degree + 1 + 3 * component_count + degree * degree
    if entry_count != expected_entries:
        raise ValueError("field-analysis entry count is inconsistent")
    if entry_count > (len(payload) - 80) // 4:
        raise ValueError("truncated field-analysis integer stream")
    values: list[int] = []
    offset = 80
    for _index in range(entry_count):
        value, offset = _integer(payload, offset)
        values.append(value)
    if offset != len(payload):
        raise ValueError("field-analysis resource has trailing bytes")

    scale, denominator, index, equation_disc, order_disc = values[:5]
    polynomial_start = 5
    polynomial_end = polynomial_start + degree + 1
    polynomial = values[polynomial_start:polynomial_end]
    component_start = polynomial_end
    components = []
    for component_index in range(component_count):
        start = component_start + 3 * component_index
        components.append(
            FieldAnalysisComponent(values[start], values[start + 1], values[start + 2])
        )
    basis_start = component_start + 3 * component_count
    basis = [
        values[basis_start + row * degree : basis_start + (row + 1) * degree]
        for row in range(degree)
    ]
    result = NativeFieldAnalysisResult(
        status,
        trial_bound,
        resolved_components,
        native_primes,
        scale,
        polynomial,
        components,
        basis,
        denominator,
        index,
        equation_disc,
        order_disc,
    )
    _validate_analysis(result)
    if (
        expected_polynomial is not None
        and [int(value) for value in expected_polynomial] != polynomial
    ):
        raise ValueError("field-analysis certificate describes another polynomial")
    if expected_scale is not None and int(expected_scale) != scale:
        raise ValueError("field-analysis certificate describes another generator scale")
    return result


def native_field_analysis(
    coefficients_low_to_high: list[int],
    scale: int = 1,
    trial_bound: int = 1000,
) -> NativeFieldAnalysisResult:
    """Run one fused native analysis and authenticate its immutable result."""
    coefficients = [int(value) for value in coefficients_low_to_high]
    scale_value = int(scale)
    bound = int(trial_bound)
    if len(coefficients) < 2 or coefficients[-1] != 1:
        raise ValueError("field analysis requires a monic integral polynomial")
    if scale_value < 1:
        raise ValueError("field analysis requires a positive generator scale")
    if bound < 0 or bound > 65536:
        raise ValueError("field-analysis trial bound must be between 0 and 65536")

    flint = __import__("sagejs.ffi.flint", fromlist=["flint"])
    polynomial = flint.fmpz_polynomial(len(coefficients))
    try:
        for index, coefficient in enumerate(coefficients):
            flint.fmpz_polynomial_set_coefficient(polynomial, index, coefficient)
        flint.fmpz_polynomial_seal(polynomial)
        resource = flint.number_field_analyze_resource(polynomial, scale_value, bound)
        try:
            payload = resource.copy_bytes()
            return decode_field_analysis_resource(
                payload,
                expected_polynomial=coefficients,
                expected_scale=scale_value,
            )
        finally:
            resource.close()
    finally:
        polynomial.close()

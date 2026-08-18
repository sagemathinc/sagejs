"""Independent decoder for the fused native number-field analysis resource.

The native call returns one immutable packed certificate.  This module checks
that certificate using ordinary exact Python arithmetic: it recomputes the
polynomial discriminant, authenticates the lazy coprime decomposition, checks
canonical row HNF, recomputes the order index, verifies multiplicative closure,
and verifies compact terminal Round-2 fixed-point witnesses without replaying
the enlargement algorithm.
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


Rational = tuple[int, int]


def _fraction(numerator: int, denominator: int = 1) -> Rational:
    if denominator == 0:
        raise ZeroDivisionError("zero rational denominator")
    if denominator < 0:
        numerator = -numerator
        denominator = -denominator
    common = _gcd(numerator, denominator)
    return numerator // common, denominator // common


def _fraction_add(left: Rational, right: Rational) -> Rational:
    return _fraction(left[0] * right[1] + right[0] * left[1], left[1] * right[1])


def _fraction_subtract(left: Rational, right: Rational) -> Rational:
    return _fraction(left[0] * right[1] - right[0] * left[1], left[1] * right[1])


def _fraction_multiply(left: Rational, right: Rational) -> Rational:
    return _fraction(left[0] * right[0], left[1] * right[1])


def _fraction_divide(left: Rational, right: Rational) -> Rational:
    return _fraction(left[0] * right[1], left[1] * right[0])


def _inverse_fraction_matrix(rows: list[list[int | Rational]]) -> list[list[Rational]]:
    degree = len(rows)
    augmented = [
        [value if isinstance(value, tuple) else _fraction(value) for value in row]
        + [_fraction(1 if row_index == column else 0) for column in range(degree)]
        for row_index, row in enumerate(rows)
    ]
    for column in range(degree):
        pivot = column
        while pivot < degree and augmented[pivot][column][0] == 0:
            pivot += 1
        if pivot == degree:
            raise ValueError("fixed-point lattice is singular")
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
        scale = augmented[column][column]
        augmented[column] = [
            _fraction_divide(value, scale) for value in augmented[column]
        ]
        for row in range(degree):
            if row == column:
                continue
            scalar = augmented[row][column]
            if scalar[0]:
                augmented[row] = [
                    _fraction_subtract(
                        augmented[row][entry],
                        _fraction_multiply(scalar, augmented[column][entry]),
                    )
                    for entry in range(2 * degree)
                ]
    return [row[degree:] for row in augmented]


def _power_product(
    left: list[Rational], right: list[Rational], polynomial: list[int]
) -> list[Rational]:
    degree = len(polynomial) - 1
    product = [_fraction(0) for _index in range(2 * degree - 1)]
    for left_index, left_value in enumerate(left):
        for right_index, right_value in enumerate(right):
            product[left_index + right_index] = _fraction_add(
                product[left_index + right_index],
                _fraction_multiply(left_value, right_value),
            )
    for exponent in range(2 * degree - 2, degree - 1, -1):
        leading = product[exponent]
        if leading[0]:
            for index in range(degree):
                target = exponent - degree + index
                product[target] = _fraction_subtract(
                    product[target],
                    _fraction_multiply(leading, _fraction(polynomial[index])),
                )
    return product[:degree]


def _vector_times_matrix(
    vector: list[Rational], matrix: list[list[Rational]]
) -> list[Rational]:
    answer: list[Rational] = []
    for column in range(len(matrix)):
        value = _fraction(0)
        for row in range(len(vector)):
            value = _fraction_add(
                value, _fraction_multiply(vector[row], matrix[row][column])
            )
        answer.append(value)
    return answer


def _order_arithmetic(
    polynomial: list[int], numerator: list[list[int]], denominator: int
) -> tuple[list[list[list[int]]], list[int]]:
    degree = len(numerator)
    basis = [[_fraction(value, denominator) for value in row] for row in numerator]
    inverse = _inverse_fraction_matrix(basis)
    identity_values = _vector_times_matrix(
        [_fraction(1)] + [_fraction(0) for _index in range(degree - 1)], inverse
    )
    if any(value[1] != 1 for value in identity_values):
        raise ValueError("fixed-point order does not contain one")
    table: list[list[list[int]]] = []
    for left in basis:
        products: list[list[int]] = []
        for right in basis:
            coordinates = _vector_times_matrix(
                _power_product(left, right, polynomial), inverse
            )
            if any(value[1] != 1 for value in coordinates):
                raise ValueError("fixed-point order multiplication is not integral")
            products.append([value[0] for value in coordinates])
        table.append(products)
    return table, [value[0] for value in identity_values]


def _modular_rref(
    rows: list[list[int]], prime: int
) -> tuple[list[list[int]], list[int]]:
    if not rows:
        return [], []
    matrix = [[value % prime for value in row] for row in rows]
    columns = len(matrix[0])
    pivots: list[int] = []
    pivot_row = 0
    for column in range(columns):
        selected = pivot_row
        while selected < len(matrix) and matrix[selected][column] == 0:
            selected += 1
        if selected == len(matrix):
            continue
        matrix[pivot_row], matrix[selected] = matrix[selected], matrix[pivot_row]
        value = matrix[pivot_row][column]
        previous_remainder, remainder = prime, value
        previous_coefficient, coefficient = 0, 1
        while remainder:
            quotient = previous_remainder // remainder
            previous_remainder, remainder = (
                remainder,
                previous_remainder - quotient * remainder,
            )
            previous_coefficient, coefficient = (
                coefficient,
                previous_coefficient - quotient * coefficient,
            )
        if previous_remainder != 1:
            raise ValueError("nonunit pivot in fixed-point field matrix")
        inverse = previous_coefficient % prime
        matrix[pivot_row] = [value * inverse % prime for value in matrix[pivot_row]]
        for row in range(len(matrix)):
            if row == pivot_row:
                continue
            scalar = matrix[row][column]
            if scalar:
                matrix[row] = [
                    (matrix[row][entry] - scalar * matrix[pivot_row][entry]) % prime
                    for entry in range(columns)
                ]
        pivots.append(column)
        pivot_row += 1
        if pivot_row == len(matrix):
            break
    return matrix[:pivot_row], pivots


def _modular_right_kernel(rows: list[list[int]], prime: int) -> list[list[int]]:
    if not rows:
        return []
    reduced, pivots = _modular_rref(rows, prime)
    columns = len(rows[0])
    answer: list[list[int]] = []
    for free_column in range(columns):
        if free_column in pivots:
            continue
        vector = [0 for _column in range(columns)]
        vector[free_column] = 1
        for row, pivot in enumerate(pivots):
            vector[pivot] = -reduced[row][free_column] % prime
        answer.append(vector)
    canonical, _pivots = _modular_rref(answer, prime)
    return canonical


def _coordinate_product_mod(
    left: list[int], right: list[int], table: list[list[list[int]]], prime: int
) -> list[int]:
    degree = len(table)
    answer = [0 for _coordinate in range(degree)]
    for left_index, left_value in enumerate(left):
        if left_value % prime == 0:
            continue
        for right_index, right_value in enumerate(right):
            if right_value % prime == 0:
                continue
            scalar = left_value * right_value
            for coordinate in range(degree):
                answer[coordinate] = (
                    answer[coordinate]
                    + scalar * table[left_index][right_index][coordinate]
                ) % prime
    return answer


def _coordinate_power_mod(
    source: list[int],
    exponent: int,
    identity: list[int],
    table: list[list[list[int]]],
    prime: int,
) -> list[int]:
    answer = [value % prime for value in identity]
    base = [value % prime for value in source]
    while exponent:
        if exponent & 1:
            answer = _coordinate_product_mod(answer, base, table, prime)
        exponent >>= 1
        if exponent:
            base = _coordinate_product_mod(base, base, table, prime)
    return answer


def _p_radical_rows(
    table: list[list[list[int]]], identity: list[int], prime: int
) -> list[list[int]]:
    degree = len(table)
    if prime > degree:
        trace_vector = [
            sum(table[basis][column][column] for column in range(degree))
            for basis in range(degree)
        ]
        defining = [
            [
                sum(
                    table[left][right][coordinate] * trace_vector[coordinate]
                    for coordinate in range(degree)
                )
                for right in range(degree)
            ]
            for left in range(degree)
        ]
    else:
        exponent = prime
        while exponent < degree:
            exponent *= prime
        columns: list[list[int]] = []
        for basis in range(degree):
            source = [0 for _coordinate in range(degree)]
            source[basis] = 1
            columns.append(
                _coordinate_power_mod(source, exponent, identity, table, prime)
            )
        defining = [
            [columns[column][row] for column in range(degree)] for row in range(degree)
        ]
    return _modular_right_kernel(defining, prime)


def _radical_lattice(
    radical: list[list[int]], degree: int, prime: int
) -> list[list[int]]:
    pivots: list[int] = []
    for row in radical:
        pivot = next((index for index, value in enumerate(row) if value), degree)
        if pivot == degree:
            raise ValueError("fixed-point radical has a zero basis row")
        pivots.append(pivot)
    pivot_set = set(pivots)
    lattice = [list(row) for row in radical]
    for column in range(degree):
        if column not in pivot_set:
            lattice.append([prime if entry == column else 0 for entry in range(degree)])
    if len(lattice) != degree:
        raise ValueError("fixed-point radical does not define a full lattice")
    return lattice


def _selected_multiplier_rows(
    selectors: list[int],
    lattice: list[list[int]],
    table: list[list[list[int]]],
    prime: int,
) -> list[list[int]]:
    degree = len(table)
    inverse = _inverse_fraction_matrix(lattice)
    answer: list[list[int]] = []
    for selector in selectors:
        if selector < 0 or selector >= degree * degree:
            raise ValueError("fixed-point selector is out of range")
        ideal_row, coordinate = divmod(selector, degree)
        equation: list[int] = []
        for basis in range(degree):
            product = [
                sum(
                    lattice[ideal_row][source] * table[basis][source][target]
                    for source in range(degree)
                )
                for target in range(degree)
            ]
            coordinates = _vector_times_matrix(
                [_fraction(value) for value in product], inverse
            )
            if any(value[1] != 1 for value in coordinates):
                raise ValueError("fixed-point multiplier coordinate is inexact")
            equation.append(coordinates[coordinate][0] % prime)
        answer.append(equation)
    return answer


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


class FixedPointWitness:
    """Compact, independently checkable proof of one terminal local fixed point."""

    def __init__(
        self, prime: int, radical_rows: list[list[int]], selectors: list[int]
    ) -> None:
        self.prime = int(prime)
        self.radical_rows = [list(row) for row in radical_rows]
        self.selectors = [int(value) for value in selectors]

    def to_dict(self) -> dict[str, Any]:
        return {
            "prime": self.prime,
            "radical_rows": [list(row) for row in self.radical_rows],
            "selectors": list(self.selectors),
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
        fixed_point_witnesses: list[FixedPointWitness],
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
        self.fixed_point_witnesses = list(fixed_point_witnesses)
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
        """Whether every discriminant component has independent local proof."""
        return (
            self.candidate_complete
            and len(self.fixed_point_witnesses) == self.native_primes
        )

    @property
    def locally_certified_primes(self) -> list[int]:
        """Word primes with authenticated terminal fixed-point evidence."""
        return [witness.prime for witness in self.fixed_point_witnesses]

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.number-fields/native-field-analysis-v2",
            "status": self.status,
            "candidate_complete": self.candidate_complete,
            "certified": self.certified,
            "trial_bound": self.trial_bound,
            "resolved_components": self.resolved_components,
            "native_primes": self.native_primes,
            "scale": self.scale,
            "polynomial": list(self.polynomial),
            "components": [component.to_dict() for component in self.components],
            "locally_certified_primes": self.locally_certified_primes,
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
    required_primes: list[int] = []
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
                required_primes.append(component.value)
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
    if result.status == ANALYSIS_FALLBACK_NATIVE_FAILURE:
        required_primes = []
    if len(result.fixed_point_witnesses) != result.native_primes:
        raise ValueError("field-analysis fixed-point witness count is inconsistent")

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

    table, identity = _order_arithmetic(coefficients, rows, result.basis_denominator)
    if len(required_primes) != len(result.fixed_point_witnesses):
        raise ValueError("field-analysis omitted required local fixed-point evidence")
    for expected_prime, witness in zip(
        required_primes, result.fixed_point_witnesses, strict=True
    ):
        if witness.prime != expected_prime:
            raise ValueError("field-analysis fixed-point witness has the wrong prime")
        radical = witness.radical_rows
        if len(radical) > degree or any(len(row) != degree for row in radical):
            raise ValueError("field-analysis fixed-point radical has the wrong shape")
        if any(value < 0 or value >= witness.prime for row in radical for value in row):
            raise ValueError("field-analysis fixed-point radical is not reduced")
        recomputed_radical = _p_radical_rows(table, identity, witness.prime)
        if radical != recomputed_radical:
            raise ValueError(
                "field-analysis fixed-point radical is not the canonical nilradical"
            )
        if len(witness.selectors) != degree or len(set(witness.selectors)) != degree:
            raise ValueError("field-analysis fixed-point selectors are not distinct")
        selected = _selected_multiplier_rows(
            witness.selectors,
            _radical_lattice(radical, degree, witness.prime),
            table,
            witness.prime,
        )
        reduced, _pivots = _modular_rref(selected, witness.prime)
        if len(reduced) != degree:
            raise ValueError(
                "field-analysis multiplier minor does not prove a fixed point"
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
    magic = [83, 74, 78, 70, 65, 2, 0, 0]
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
    witness_count = _unsigned(payload, 72, 8)
    if (
        degree == 0
        or degree > 1_000_000
        or version != 2
        or witness_count > component_count
    ):
        raise ValueError("invalid field-analysis resource header")
    minimum_entries = (
        5
        + degree
        + 1
        + 3 * component_count
        + witness_count * (2 + degree)
        + degree * degree
    )
    if entry_count < minimum_entries:
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
    witness_start = component_start + 3 * component_count
    witness_cursor = witness_start
    witnesses: list[FixedPointWitness] = []
    for _witness_index in range(witness_count):
        if witness_cursor + 2 > len(values):
            raise ValueError("truncated fixed-point witness")
        prime = values[witness_cursor]
        radical_dimension = values[witness_cursor + 1]
        witness_cursor += 2
        if radical_dimension < 0 or radical_dimension > degree:
            raise ValueError("invalid fixed-point radical dimension")
        radical_entries = radical_dimension * degree
        witness_end = witness_cursor + radical_entries + degree
        if witness_end > len(values):
            raise ValueError("truncated fixed-point witness")
        radical = [
            values[witness_cursor + row * degree : witness_cursor + (row + 1) * degree]
            for row in range(radical_dimension)
        ]
        selector_start = witness_cursor + radical_entries
        selectors = values[selector_start:witness_end]
        witnesses.append(FixedPointWitness(prime, radical, selectors))
        witness_cursor = witness_end
    basis_start = witness_cursor
    if basis_start + degree * degree != len(values):
        raise ValueError("field-analysis witness stream has inconsistent length")
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
        witnesses,
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

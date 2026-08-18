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

from sagejs.native import (
    IntegerBuffer,
    integer_buffer_values,
    kernel_integer_buffer,
    kernel_integer_zeros,
    native,
    uint64,
)
from sagejs.number_fields.maximal_order_certification import _scaled_integral_inverse

ANALYSIS_COMPLETE_CANDIDATE = 0
ANALYSIS_FALLBACK_UNRESOLVED = 1
ANALYSIS_FALLBACK_ARBITRARY_PRIME = 2
ANALYSIS_FALLBACK_NATIVE_FAILURE = 3

AUTHENTICATED_FIELD_ANALYSIS_PROOF_SCHEMA = (
    "sagejs.number-fields/authenticated-field-analysis-proof-v1"
)

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


def _integer_power_product(
    left: list[int], right: list[int], polynomial: list[int]
) -> list[int]:
    degree = len(polynomial) - 1
    product = [0 for _index in range(2 * degree - 1)]
    for left_index, left_value in enumerate(left):
        if left_value == 0:
            continue
        for right_index, right_value in enumerate(right):
            product[left_index + right_index] += left_value * right_value
    for exponent in range(2 * degree - 2, degree - 1, -1):
        leading = product[exponent]
        if leading:
            for index in range(degree):
                product[exponent - degree + index] -= leading * polynomial[index]
    return product[:degree]


@native
def packed_field_analysis_decode_integers(
    payload: IntegerBuffer,
    output: IntegerBuffer,
    entry_count: uint64,
) -> bool:
    """Decode the canonical signed integer stream in one packed traversal."""
    if len(payload) < 80 or len(output) != entry_count:
        return False
    encoded_count = 0
    count_factor = 1
    for byte_index in range(8):
        byte = payload[56 + byte_index]
        if byte > 255:
            return False
        encoded_count += byte * count_factor
        count_factor *= 256
    if encoded_count != entry_count:
        return False
    offset = 80
    for output_index in range(entry_count):
        if offset + 4 > len(payload):
            return False
        header = 0
        header_factor = 1
        for byte_index in range(4):
            byte = payload[offset + byte_index]
            if byte > 255:
                return False
            header += byte * header_factor
            header_factor *= 256
        negative = header >= 2147483648
        length = header
        if negative:
            length -= 2147483648
        offset += 4
        if length > len(payload) - offset or (negative and length == 0):
            return False
        value = 0
        multiplier = 1
        for byte_index in range(length):
            byte = payload[offset + byte_index]
            if byte > 255:
                return False
            value += byte * multiplier
            multiplier *= 256
        if length != 0 and payload[offset + length - 1] == 0:
            return False
        if negative:
            value = -value
        output[output_index] = value
        offset += length
    return offset == len(payload)


@native
def packed_field_analysis_fixed_points_are_valid(
    workspace: IntegerBuffer,
    polynomial: IntegerBuffer,
    numerator: IntegerBuffer,
    denominator: int,
    primes: IntegerBuffer,
    radical_dimensions: IntegerBuffer,
    radicals: IntegerBuffer,
    selectors: IntegerBuffer,
    equation_discriminant: int,
    degree: uint64,
    witness_count: uint64,
) -> bool:
    """Recompute the discriminant, order arithmetic, and fixed points exactly.

    The packed body is the production checker and its own CPython/dynamic
    fallback.  It constructs the full order multiplication table, independently
    recomputes each canonical nilradical, and checks the supplied multiplier
    minor has full rank.  A compiled artifact keeps the whole proof inside one
    isolated GMP-backed core with no host callbacks.
    """
    square = degree * degree
    cube = square * degree
    inverse_offset = 0
    table_offset = square
    convolution_offset = table_offset + cube
    matrix_offset = convolution_offset + 2 * degree
    kernel_offset = matrix_offset + square
    selected_offset = kernel_offset + square
    pivot_offset = selected_offset + square
    answer_offset = pivot_offset + degree
    base_offset = answer_offset + degree
    temporary_offset = base_offset + degree
    product_offset = temporary_offset + degree
    sylvester_offset = product_offset + degree
    sylvester_size = 2 * degree - 1
    expected_workspace = sylvester_offset + sylvester_size * sylvester_size
    valid = (
        degree > 0
        and len(workspace) == expected_workspace
        and len(polynomial) == degree + 1
        and polynomial[degree] == 1
        and len(numerator) == square
        and denominator > 0
        and len(primes) == witness_count
        and len(radical_dimensions) == witness_count
        and len(radicals) == witness_count * square
        and len(selectors) == witness_count * degree
    )

    for disc_entry in range(sylvester_size * sylvester_size):
        workspace[sylvester_offset + disc_entry] = 0
    for f_shift in range(degree - 1):
        for f_coeff in range(degree + 1):
            workspace[
                sylvester_offset + f_shift * sylvester_size + f_shift + f_coeff
            ] = polynomial[degree - f_coeff]
    for d_shift in range(degree):
        for d_coeff in range(degree):
            derivative_exponent = degree - d_coeff
            workspace[
                sylvester_offset
                + (degree - 1 + d_shift) * sylvester_size
                + d_shift
                + d_coeff
            ] = derivative_exponent * polynomial[derivative_exponent]
    sign = 1
    previous = 1
    for det_column in range(sylvester_size - 1):
        pivot_row = det_column
        while (
            pivot_row < sylvester_size
            and workspace[sylvester_offset + pivot_row * sylvester_size + det_column]
            == 0
        ):
            pivot_row += 1
        if pivot_row == sylvester_size:
            valid = False
        elif pivot_row != det_column:
            for det_entry in range(sylvester_size):
                left_location = (
                    sylvester_offset + det_column * sylvester_size + det_entry
                )
                right_location = (
                    sylvester_offset + pivot_row * sylvester_size + det_entry
                )
                swapped = workspace[left_location]
                workspace[left_location] = workspace[right_location]
                workspace[right_location] = swapped
            sign = -sign
        if valid:
            pivot = workspace[
                sylvester_offset + det_column * sylvester_size + det_column
            ]
            for det_row in range(det_column + 1, sylvester_size):
                factor = workspace[
                    sylvester_offset + det_row * sylvester_size + det_column
                ]
                for det_entry in range(det_column + 1, sylvester_size):
                    location = sylvester_offset + det_row * sylvester_size + det_entry
                    exact = (
                        workspace[location] * pivot
                        - factor
                        * workspace[
                            sylvester_offset + det_column * sylvester_size + det_entry
                        ]
                    )
                    if previous != 1:
                        if exact % previous != 0:
                            valid = False
                        else:
                            exact //= previous
                    if valid:
                        workspace[location] = exact
                workspace[sylvester_offset + det_row * sylvester_size + det_column] = 0
            previous = pivot
    if valid:
        discriminant = (
            sign * workspace[sylvester_offset + sylvester_size * sylvester_size - 1]
        )
        if degree * (degree - 1) // 2 % 2:
            discriminant = -discriminant
        if discriminant == 0 or discriminant != equation_discriminant:
            valid = False

    reverse_row = 0
    while valid and reverse_row < degree:
        row = degree - reverse_row - 1
        diagonal = numerator[row * degree + row]
        if diagonal == 0:
            valid = False
        column = 0
        while valid and column < degree:
            value = 0
            if row == column:
                value = denominator
            source = row + 1
            while source < degree:
                value -= (
                    numerator[row * degree + source]
                    * workspace[inverse_offset + source * degree + column]
                )
                source += 1
            if value % diagonal != 0:
                valid = False
            else:
                workspace[inverse_offset + row * degree + column] = value // diagonal
            column += 1
        reverse_row += 1

    denominator_squared = denominator * denominator
    left = 0
    while valid and left < degree:
        right = 0
        while valid and right < degree:
            entry = 0
            while entry < 2 * degree:
                workspace[convolution_offset + entry] = 0
                entry += 1
            left_index = 0
            while left_index < degree:
                left_value = numerator[left * degree + left_index]
                if left_value:
                    right_index = 0
                    while right_index < degree:
                        right_value = numerator[right * degree + right_index]
                        if right_value:
                            workspace[
                                convolution_offset + left_index + right_index
                            ] += left_value * right_value
                        right_index += 1
                left_index += 1
            reduction_offset = 0
            while reduction_offset < degree - 1:
                exponent = 2 * degree - 2 - reduction_offset
                leading = workspace[convolution_offset + exponent]
                if leading:
                    coefficient = 0
                    while coefficient < degree:
                        workspace[
                            convolution_offset + exponent - degree + coefficient
                        ] -= leading * polynomial[coefficient]
                        coefficient += 1
                reduction_offset += 1
            column = 0
            while valid and column < degree:
                value = 0
                source = 0
                while source < degree:
                    value += (
                        workspace[convolution_offset + source]
                        * workspace[inverse_offset + source * degree + column]
                    )
                    source += 1
                if value % denominator_squared != 0:
                    valid = False
                else:
                    workspace[
                        table_offset + (left * degree + right) * degree + column
                    ] = value // denominator_squared
                column += 1
            right += 1
        left += 1

    witness = 0
    while valid and witness < witness_count:
        prime = primes[witness]
        radical_dimension = radical_dimensions[witness]
        if prime < 2 or radical_dimension > degree:
            valid = False
        entry = 0
        while entry < square:
            workspace[matrix_offset + entry] = 0
            workspace[kernel_offset + entry] = 0
            workspace[selected_offset + entry] = 0
            entry += 1

        if valid and prime > degree:
            basis = 0
            while basis < degree:
                value = 0
                column = 0
                while column < degree:
                    value += workspace[
                        table_offset + (basis * degree + column) * degree + column
                    ]
                    column += 1
                workspace[product_offset + basis] = value % prime
                basis += 1
            left = 0
            while left < degree:
                right = 0
                while right < degree:
                    value = 0
                    coordinate = 0
                    while coordinate < degree:
                        value += (
                            workspace[
                                table_offset
                                + (left * degree + right) * degree
                                + coordinate
                            ]
                            * workspace[product_offset + coordinate]
                        )
                        coordinate += 1
                    workspace[matrix_offset + left * degree + right] = value % prime
                    right += 1
                left += 1
        elif valid:
            exponent = prime
            while exponent < degree:
                exponent *= prime
            basis = 0
            while basis < degree:
                coordinate = 0
                while coordinate < degree:
                    workspace[answer_offset + coordinate] = (
                        workspace[inverse_offset + coordinate] % prime
                    )
                    workspace[base_offset + coordinate] = 0
                    if coordinate == basis:
                        workspace[base_offset + coordinate] = 1
                    coordinate += 1
                power = exponent
                while power:
                    if power % 2:
                        coordinate = 0
                        while coordinate < degree:
                            workspace[temporary_offset + coordinate] = 0
                            coordinate += 1
                        left = 0
                        while left < degree:
                            left_value = workspace[answer_offset + left] % prime
                            if left_value:
                                right = 0
                                while right < degree:
                                    right_value = workspace[base_offset + right] % prime
                                    if right_value:
                                        scalar = left_value * right_value
                                        coordinate = 0
                                        while coordinate < degree:
                                            location = temporary_offset + coordinate
                                            workspace[location] = (
                                                workspace[location]
                                                + scalar
                                                * workspace[
                                                    table_offset
                                                    + (left * degree + right) * degree
                                                    + coordinate
                                                ]
                                            ) % prime
                                            coordinate += 1
                                    right += 1
                            left += 1
                        coordinate = 0
                        while coordinate < degree:
                            workspace[answer_offset + coordinate] = workspace[
                                temporary_offset + coordinate
                            ]
                            coordinate += 1
                    power //= 2
                    if power:
                        coordinate = 0
                        while coordinate < degree:
                            workspace[temporary_offset + coordinate] = 0
                            coordinate += 1
                        left = 0
                        while left < degree:
                            left_value = workspace[base_offset + left] % prime
                            if left_value:
                                right = 0
                                while right < degree:
                                    right_value = workspace[base_offset + right] % prime
                                    if right_value:
                                        scalar = left_value * right_value
                                        coordinate = 0
                                        while coordinate < degree:
                                            location = temporary_offset + coordinate
                                            workspace[location] = (
                                                workspace[location]
                                                + scalar
                                                * workspace[
                                                    table_offset
                                                    + (left * degree + right) * degree
                                                    + coordinate
                                                ]
                                            ) % prime
                                            coordinate += 1
                                    right += 1
                            left += 1
                        coordinate = 0
                        while coordinate < degree:
                            workspace[base_offset + coordinate] = workspace[
                                temporary_offset + coordinate
                            ]
                            coordinate += 1
                coordinate = 0
                while coordinate < degree:
                    workspace[matrix_offset + coordinate * degree + basis] = workspace[
                        answer_offset + coordinate
                    ]
                    coordinate += 1
                basis += 1

        entry = 0
        while entry < square:
            workspace[selected_offset + entry] = workspace[matrix_offset + entry]
            entry += 1
        defining_rank = 0
        column = 0
        while valid and column < degree and defining_rank < degree:
            selected = defining_rank
            while (
                selected < degree
                and workspace[matrix_offset + selected * degree + column] % prime == 0
            ):
                selected += 1
            if selected < degree:
                if selected != defining_rank:
                    entry = 0
                    while entry < degree:
                        left_location = matrix_offset + defining_rank * degree + entry
                        right_location = matrix_offset + selected * degree + entry
                        swapped = workspace[left_location]
                        workspace[left_location] = workspace[right_location]
                        workspace[right_location] = swapped
                        entry += 1
                pivot = (
                    workspace[matrix_offset + defining_rank * degree + column] % prime
                )
                previous_remainder = prime
                remainder = pivot
                previous_coefficient = 0
                coefficient = 1
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
                    valid = False
                else:
                    inverse = previous_coefficient % prime
                    entry = 0
                    while entry < degree:
                        location = matrix_offset + defining_rank * degree + entry
                        workspace[location] = workspace[location] * inverse % prime
                        entry += 1
                    row = 0
                    while row < degree:
                        if row != defining_rank:
                            scalar = (
                                workspace[matrix_offset + row * degree + column] % prime
                            )
                            if scalar:
                                entry = 0
                                while entry < degree:
                                    location = matrix_offset + row * degree + entry
                                    workspace[location] = (
                                        workspace[location]
                                        - scalar
                                        * workspace[
                                            matrix_offset
                                            + defining_rank * degree
                                            + entry
                                        ]
                                    ) % prime
                                    entry += 1
                        row += 1
                    defining_rank += 1
            column += 1

        kernel_rows = radical_dimension
        if valid and kernel_rows + defining_rank != degree:
            valid = False
        search_start = 0
        row = 0
        while valid and row < kernel_rows:
            pivot_column = -1
            column = 0
            while column < degree:
                supplied = radicals[witness * square + row * degree + column]
                workspace[kernel_offset + row * degree + column] = supplied
                if pivot_column < 0 and supplied != 0:
                    pivot_column = column
                column += 1
            if (
                pivot_column < search_start
                or workspace[kernel_offset + row * degree + pivot_column] != 1
            ):
                valid = False
            else:
                workspace[pivot_offset + row] = pivot_column
                other_row = 0
                while other_row < kernel_rows:
                    if (
                        other_row != row
                        and radicals[
                            witness * square + other_row * degree + pivot_column
                        ]
                        != 0
                    ):
                        valid = False
                    other_row += 1
                search_start = pivot_column + 1
            row += 1
        row = 0
        while valid and row < degree:
            radical_row = 0
            while radical_row < kernel_rows:
                value = 0
                column = 0
                while column < degree:
                    value += (
                        workspace[selected_offset + row * degree + column]
                        * workspace[kernel_offset + radical_row * degree + column]
                    )
                    column += 1
                if value % prime != 0:
                    valid = False
                radical_row += 1
            row += 1

        selector_row = 0
        while valid and selector_row < degree:
            selector = selectors[witness * degree + selector_row]
            ideal_row = selector // degree
            selected_coordinate = selector % degree
            if ideal_row >= degree:
                valid = False
            ideal_free_column = -1
            selected_free_column = -1
            if valid and ideal_row >= kernel_rows:
                wanted = ideal_row - kernel_rows
                found = 0
                column = 0
                while column < degree:
                    is_pivot = False
                    pivot_row = 0
                    while pivot_row < kernel_rows:
                        if workspace[pivot_offset + pivot_row] == column:
                            is_pivot = True
                        pivot_row += 1
                    if not is_pivot:
                        if found == wanted:
                            ideal_free_column = column
                        found += 1
                    column += 1
                if ideal_free_column < 0:
                    valid = False
            if valid and selected_coordinate >= kernel_rows:
                wanted = selected_coordinate - kernel_rows
                found = 0
                column = 0
                while column < degree:
                    is_pivot = False
                    pivot_row = 0
                    while pivot_row < kernel_rows:
                        if workspace[pivot_offset + pivot_row] == column:
                            is_pivot = True
                        pivot_row += 1
                    if not is_pivot:
                        if found == wanted:
                            selected_free_column = column
                        found += 1
                    column += 1
                if selected_free_column < 0:
                    valid = False
            basis = 0
            while valid and basis < degree:
                target = 0
                while target < degree:
                    value = 0
                    source = 0
                    while source < degree:
                        lattice_value = 0
                        if ideal_row < kernel_rows:
                            lattice_value = workspace[
                                kernel_offset + ideal_row * degree + source
                            ]
                        elif source == ideal_free_column:
                            lattice_value = prime
                        if lattice_value:
                            value += (
                                lattice_value
                                * workspace[
                                    table_offset
                                    + (basis * degree + source) * degree
                                    + target
                                ]
                            )
                        source += 1
                    workspace[product_offset + target] = value
                    target += 1
                if selected_coordinate < kernel_rows:
                    coordinate_value = workspace[
                        product_offset + workspace[pivot_offset + selected_coordinate]
                    ]
                else:
                    coordinate_value = workspace[product_offset + selected_free_column]
                    pivot_row = 0
                    while pivot_row < kernel_rows:
                        coordinate_value -= (
                            workspace[
                                product_offset + workspace[pivot_offset + pivot_row]
                            ]
                            * workspace[
                                kernel_offset
                                + pivot_row * degree
                                + selected_free_column
                            ]
                        )
                        pivot_row += 1
                    if coordinate_value % prime != 0:
                        valid = False
                    else:
                        coordinate_value //= prime
                workspace[selected_offset + selector_row * degree + basis] = (
                    coordinate_value % prime
                )
                basis += 1
            selector_row += 1
        selected_rank = 0
        column = 0
        while valid and column < degree and selected_rank < degree:
            selected = selected_rank
            while (
                selected < degree
                and workspace[selected_offset + selected * degree + column] % prime == 0
            ):
                selected += 1
            if selected < degree:
                if selected != selected_rank:
                    entry = 0
                    while entry < degree:
                        left_location = selected_offset + selected_rank * degree + entry
                        right_location = selected_offset + selected * degree + entry
                        swapped = workspace[left_location]
                        workspace[left_location] = workspace[right_location]
                        workspace[right_location] = swapped
                        entry += 1
                pivot = (
                    workspace[selected_offset + selected_rank * degree + column] % prime
                )
                previous_remainder = prime
                remainder = pivot
                previous_coefficient = 0
                coefficient = 1
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
                    valid = False
                else:
                    inverse = previous_coefficient % prime
                    entry = column
                    while entry < degree:
                        location = selected_offset + selected_rank * degree + entry
                        workspace[location] = workspace[location] * inverse % prime
                        entry += 1
                    row = selected_rank + 1
                    while row < degree:
                        scalar = (
                            workspace[selected_offset + row * degree + column] % prime
                        )
                        if scalar:
                            entry = column
                            while entry < degree:
                                location = selected_offset + row * degree + entry
                                workspace[location] = (
                                    workspace[location]
                                    - scalar
                                    * workspace[
                                        selected_offset + selected_rank * degree + entry
                                    ]
                                ) % prime
                                entry += 1
                        row += 1
                    selected_rank += 1
            column += 1
        if valid and selected_rank != degree:
            valid = False
        witness += 1
    return valid


def _order_arithmetic(
    polynomial: list[int], numerator: list[list[int]], denominator: int
) -> tuple[list[list[list[int]]], list[int]]:
    degree = len(numerator)
    scaled_inverse = [[0 for _column in range(degree)] for _row in range(degree)]
    for row in range(degree - 1, -1, -1):
        diagonal = numerator[row][row]
        if diagonal == 0:
            raise ValueError("fixed-point order basis is singular")
        for column in range(degree):
            value = denominator if row == column else 0
            for source in range(row + 1, degree):
                value -= numerator[row][source] * scaled_inverse[source][column]
            if value % diagonal != 0:
                raise ValueError(
                    "fixed-point order does not contain the equation order"
                )
            scaled_inverse[row][column] = value // diagonal
    identity = list(scaled_inverse[0])
    denominator_squared = denominator * denominator
    table: list[list[list[int]]] = []
    for left in numerator:
        products: list[list[int]] = []
        for right in numerator:
            product = _integer_power_product(left, right, polynomial)
            coordinates: list[int] = []
            for column in range(degree):
                value = sum(
                    product[source] * scaled_inverse[source][column]
                    for source in range(degree)
                )
                if value % denominator_squared != 0:
                    raise ValueError("fixed-point order multiplication is not integral")
                coordinates.append(value // denominator_squared)
            products.append(coordinates)
        table.append(products)
    return table, identity


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
    determinant = abs(_determinant(lattice))
    inverse = _scaled_integral_inverse(lattice, determinant)
    if determinant == 0 or inverse is None:
        raise ValueError("fixed-point radical lattice is singular")
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
            coordinate_numerator = sum(
                product[source] * inverse[source][coordinate]
                for source in range(degree)
            )
            if coordinate_numerator % determinant != 0:
                raise ValueError("fixed-point multiplier coordinate is inexact")
            equation.append(coordinate_numerator // determinant % prime)
        answer.append(equation)
    return answer


def reference_field_analysis_fixed_points_are_valid(
    polynomial: list[int],
    numerator: list[list[int]],
    denominator: int,
    primes: list[int],
    radicals: list[list[list[int]]],
    selectors: list[list[int]],
) -> bool:
    """Run the allocation-heavy independent oracle for packed-kernel tests.

    Production authentication uses the source-transparent packed body above.
    This deliberately separate formulation retains nested Python matrices,
    determinant-based multiplier coordinates, and the original canonical
    right-kernel construction so differential tests do not merely replay the
    optimized representation.
    """
    if len(primes) != len(radicals) or len(primes) != len(selectors):
        return False
    degree = len(numerator)
    try:
        table, identity = _order_arithmetic(polynomial, numerator, denominator)
        for prime, radical, selected_coordinates in zip(
            primes, radicals, selectors, strict=True
        ):
            if _p_radical_rows(table, identity, prime) != radical:
                return False
            equations = _selected_multiplier_rows(
                selected_coordinates,
                _radical_lattice(radical, degree, prime),
                table,
                prime,
            )
            if len(_modular_rref(equations, prime)[0]) != degree:
                return False
    except (ArithmeticError, ValueError):
        return False
    return True


class _ImmutableCertificatePart:
    def __setattr__(self, name: str, value: Any) -> None:
        if bool(self.__dict__.get("_certificate_frozen", False)):
            raise AttributeError("field-analysis certificates are immutable")
        self.__dict__[name] = value

    def _freeze_certificate(self) -> None:
        self.__dict__["_certificate_frozen"] = True


class FieldAnalysisComponent(_ImmutableCertificatePart):
    """One exact coprime component with a deliberately bounded proof state."""

    def __init__(self, value: int, exponent: int, state: int) -> None:
        self.value = int(value)
        self.exponent = int(exponent)
        self.state = int(state)
        self._freeze_certificate()

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


class FixedPointWitness(_ImmutableCertificatePart):
    """Compact, independently checkable proof of one terminal local fixed point."""

    def __init__(
        self, prime: int, radical_rows: list[list[int]], selectors: list[int]
    ) -> None:
        self.prime = int(prime)
        self.radical_rows = tuple(
            tuple(int(value) for value in row) for row in radical_rows
        )
        self.selectors = tuple(int(value) for value in selectors)
        self._freeze_certificate()

    def to_dict(self) -> dict[str, Any]:
        return {
            "prime": self.prime,
            "radical_rows": [list(row) for row in self.radical_rows],
            "selectors": list(self.selectors),
        }


class NativeFieldAnalysisResult(_ImmutableCertificatePart):
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
        self.polynomial = tuple(int(value) for value in polynomial)
        self.components = tuple(components)
        self.fixed_point_witnesses = tuple(fixed_point_witnesses)
        self.basis_numerator = tuple(
            tuple(int(value) for value in row) for row in basis_numerator
        )
        self.basis_denominator = basis_denominator
        self.index = index
        self.equation_discriminant = equation_discriminant
        self.order_discriminant = order_discriminant
        self._freeze_certificate()

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
            and self.__dict__.get("_authentication_snapshot")
            == _analysis_authentication_snapshot(self)
        )

    @property
    def proof_schema(self) -> str:
        """Schema of the immutable independently authenticated proof envelope."""
        return AUTHENTICATED_FIELD_ANALYSIS_PROOF_SCHEMA

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


def _analysis_authentication_snapshot(
    result: NativeFieldAnalysisResult,
) -> tuple[Any, ...]:
    """Capture values, not mutable certificate-part identities."""
    return (
        AUTHENTICATED_FIELD_ANALYSIS_PROOF_SCHEMA,
        result.status,
        result.trial_bound,
        result.resolved_components,
        result.native_primes,
        result.scale,
        result.polynomial,
        tuple(
            (component.value, component.exponent, component.state)
            for component in result.components
        ),
        tuple(
            (witness.prime, witness.radical_rows, witness.selectors)
            for witness in result.fixed_point_witnesses
        ),
        result.basis_numerator,
        result.basis_denominator,
        result.index,
        result.equation_discriminant,
        result.order_discriminant,
    )


def _seal_authenticated_analysis(result: NativeFieldAnalysisResult) -> None:
    result.__dict__["_authentication_snapshot"] = _analysis_authentication_snapshot(
        result
    )


def authenticated_field_analysis_matches(
    result: Any,
    *,
    polynomial: list[int],
    scale: int,
    trial_bound: int,
    equation_discriminant: int | None = None,
    basis_numerator: list[list[int]] | None = None,
    basis_denominator: int | None = None,
    index: int | None = None,
    order_discriminant: int | None = None,
) -> bool:
    """Bind a live authenticated envelope to supplied certificate data."""
    if type(result) is not NativeFieldAnalysisResult or result.certified is not True:
        return False
    if tuple(int(value) for value in polynomial) != result.polynomial:
        return False
    if int(scale) != result.scale or int(trial_bound) != result.trial_bound:
        return False
    if (
        equation_discriminant is not None
        and int(equation_discriminant) != result.equation_discriminant
    ):
        return False
    if (
        basis_numerator is not None
        and tuple(tuple(int(value) for value in row) for row in basis_numerator)
        != result.basis_numerator
    ):
        return False
    if (
        basis_denominator is not None
        and int(basis_denominator) != result.basis_denominator
    ):
        return False
    if index is not None and int(index) != result.index:
        return False
    if (
        order_discriminant is not None
        and int(order_discriminant) != result.order_discriminant
    ):
        return False
    return True


def _validate_analysis(result: NativeFieldAnalysisResult) -> None:
    if result.status not in (
        ANALYSIS_COMPLETE_CANDIDATE,
        ANALYSIS_FALLBACK_UNRESOLVED,
        ANALYSIS_FALLBACK_ARBITRARY_PRIME,
        ANALYSIS_FALLBACK_NATIVE_FAILURE,
    ):
        raise ValueError("unknown field-analysis status")
    coefficients = list(result.polynomial)
    degree = len(coefficients) - 1
    if degree < 1 or coefficients[-1] != 1 or result.scale < 1:
        raise ValueError("field-analysis source polynomial/scale is invalid")
    discriminant = int(result.equation_discriminant)
    if discriminant == 0:
        raise ValueError("field-analysis polynomial discriminant is zero")

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

    rows = [list(row) for row in result.basis_numerator]
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
    if result.status == ANALYSIS_FALLBACK_NATIVE_FAILURE and (
        result.basis_denominator != 1
        or result.index != 1
        or result.order_discriminant != result.equation_discriminant
        or any(
            rows[row][column] != (1 if row == column else 0)
            for row in range(degree)
            for column in range(degree)
        )
    ):
        raise ValueError("failed native analysis did not preserve the identity order")
    if len(required_primes) != len(result.fixed_point_witnesses):
        raise ValueError("field-analysis omitted required local fixed-point evidence")
    packed_primes: list[int] = []
    packed_dimensions: list[int] = []
    packed_radicals: list[int] = []
    packed_selectors: list[int] = []
    for expected_prime, witness in zip(
        required_primes, result.fixed_point_witnesses, strict=True
    ):
        if witness.prime != expected_prime:
            raise ValueError("field-analysis fixed-point witness has the wrong prime")
        radical = [list(row) for row in witness.radical_rows]
        if len(radical) > degree or any(len(row) != degree for row in radical):
            raise ValueError("field-analysis fixed-point radical has the wrong shape")
        if any(value < 0 or value >= witness.prime for row in radical for value in row):
            raise ValueError("field-analysis fixed-point radical is not reduced")
        if len(witness.selectors) != degree or len(set(witness.selectors)) != degree:
            raise ValueError("field-analysis fixed-point selectors are not distinct")
        packed_primes.append(witness.prime)
        packed_dimensions.append(len(radical))
        for row in radical:
            packed_radicals.extend(row)
        packed_radicals.extend([0] * ((degree - len(radical)) * degree))
        packed_selectors.extend(witness.selectors)

    packed_numerator = [value for row in rows for value in row]
    square = degree * degree
    workspace_length = degree * square + 4 * square + 7 * degree + (2 * degree - 1) ** 2
    workspace = kernel_integer_zeros(
        packed_field_analysis_fixed_points_are_valid,
        workspace_length,
        64,
    )
    valid_fixed_points = packed_field_analysis_fixed_points_are_valid(
        workspace,
        kernel_integer_buffer(
            packed_field_analysis_fixed_points_are_valid, coefficients
        ),
        kernel_integer_buffer(
            packed_field_analysis_fixed_points_are_valid, packed_numerator
        ),
        result.basis_denominator,
        kernel_integer_buffer(
            packed_field_analysis_fixed_points_are_valid, packed_primes
        ),
        kernel_integer_buffer(
            packed_field_analysis_fixed_points_are_valid, packed_dimensions
        ),
        kernel_integer_buffer(
            packed_field_analysis_fixed_points_are_valid, packed_radicals
        ),
        kernel_integer_buffer(
            packed_field_analysis_fixed_points_are_valid, packed_selectors
        ),
        result.equation_discriminant,
        degree,
        len(result.fixed_point_witnesses),
    )
    if not valid_fixed_points:
        raise ValueError(
            "field-analysis order arithmetic or fixed-point evidence is invalid"
        )


def decode_field_analysis_resource(
    payload: Any,
    *,
    expected_polynomial: list[int] | None = None,
    expected_scale: int | None = None,
    expected_trial_bound: int | None = None,
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
    decoded_values = kernel_integer_zeros(
        packed_field_analysis_decode_integers, entry_count, 64
    )
    if not packed_field_analysis_decode_integers(
        kernel_integer_buffer(packed_field_analysis_decode_integers, payload),
        decoded_values,
        entry_count,
    ):
        raise ValueError("field-analysis resource has an invalid integer stream")
    values: list[int] = list(integer_buffer_values(decoded_values))

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
    if expected_trial_bound is not None and int(expected_trial_bound) != trial_bound:
        raise ValueError("field-analysis certificate used another trial bound")
    _seal_authenticated_analysis(result)
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
                expected_trial_bound=bound,
            )
        finally:
            resource.close()
    finally:
        polynomial.close()

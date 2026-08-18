"""Packed exact state kernels for Ford--Letard modified Round 4.

The public Round-4 implementation keeps its inspectable number-field objects
and exact global certificates.  This module supplies the source-transparent
storage boundary for its measured local state transitions.  All elements use
one positive denominator followed by a fixed power-basis numerator vector;
all polynomials use ascending coefficients.

The first kernel computes exactly the bounded `p`-adic image of a regular-
representation characteristic polynomial.  Berkowitz's division-free
recurrence works over `ZZ / p**N` even when `p` divides small integers,
unlike Newton sums.  If an element has denominator `p**s`, computing the
integer numerator matrix modulo `p**(N+s*n)` both proves every required
divisibility and recovers the characteristic coefficients modulo `p**N`.
The ordinary Python body is the dynamic oracle for the compiled GMP-backed
body.
"""

from __future__ import annotations

from sagejs.ffi.flint import fmpz_mat_charpoly
from sagejs.native import IntegerBuffer, native, uint64


# Stable control statuses.  Unsupported inputs and storage exhaustion are
# capability results; negative statuses are mathematical invariant failures.
ROUND4_STATE_OK = 1
ROUND4_STATE_UNSUPPORTED = 0
ROUND4_STATE_INVALID_SHAPE = -1
ROUND4_STATE_INVALID_PRIME = -2
ROUND4_STATE_INVALID_DENOMINATOR = -3
ROUND4_STATE_NONINTEGRAL = -4


@native
def _packed_positive_power_exponent(value: int, base: int) -> int:
    """Return `s` for `value == base**s`, or `-1` otherwise."""
    if value <= 0 or base <= 1:
        return -1
    exponent = 0
    remaining = value
    while remaining > 1 and remaining % base == 0:
        remaining //= base
        exponent += 1
    if remaining != 1:
        return -1
    return exponent


@native
def _packed_integer_power(base: int, exponent: int) -> int:
    answer = 1
    power = base
    remaining = exponent
    while remaining:
        if remaining % 2:
            answer *= power
        remaining //= 2
        if remaining:
            power *= power
    return answer


@native
def _packed_round4_fill_multiplication_matrix(
    matrix: IntegerBuffer,
    matrix_offset: int,
    defining: IntegerBuffer,
    element: IntegerBuffer,
    degree: uint64,
    modulus: int,
) -> bool:
    """Fill the numerator multiplication matrix column by column."""
    one = degree // degree
    for row in range(degree):
        matrix[matrix_offset + row * degree] = element[row + one] % modulus
    for column in range(degree):
        if column > 0:
            previous_leading = matrix[
                matrix_offset + (degree - one) * degree + column - one
            ]
            matrix[matrix_offset + column] = (-previous_leading * defining[0]) % modulus
            for next_row in range(degree):
                if next_row > 0:
                    matrix[matrix_offset + next_row * degree + column] = (
                        matrix[matrix_offset + (next_row - one) * degree + column - one]
                        - previous_leading * defining[next_row]
                    ) % modulus
    return True


@native
def _packed_round4_fill_exact_multiplication_matrix(
    matrix: IntegerBuffer,
    defining: IntegerBuffer,
    element: IntegerBuffer,
    degree: uint64,
) -> bool:
    """Fill the exact numerator multiplication matrix."""
    one = degree // degree
    for row in range(degree):
        matrix[row * degree] = element[row + one]
    for column in range(degree):
        if column > 0:
            previous_leading = matrix[(degree - one) * degree + column - one]
            matrix[column] = -previous_leading * defining[0]
            for row in range(degree):
                if row > 0:
                    matrix[row * degree + column] = (
                        matrix[(row - one) * degree + column - one]
                        - previous_leading * defining[row]
                    )
    return True


@native
def _packed_round4_berkowitz_characteristic(
    output_descending: IntegerBuffer,
    output_offset: int,
    matrix: IntegerBuffer,
    matrix_offset: int,
    workspace: IntegerBuffer,
    workspace_offset: int,
    degree: uint64,
    modulus: int,
) -> bool:
    """Compute `det(xI-A)` by the division-free Berkowitz recurrence.

    Workspace layout is two coefficient vectors, two matrix-vector buffers,
    and one Toeplitz column, each of length `degree + 1`.  The matrix is
    row-major.  All values are reduced modulo `modulus` after every exact
    operation, which bounds storage without weakening the result.
    """
    one = degree // degree
    width = degree + one
    first_offset = workspace_offset
    second_offset = workspace_offset + width
    vector_offset = workspace_offset + 2 * width
    next_vector_offset = workspace_offset + 3 * width
    toeplitz_offset = workspace_offset + 4 * width
    for index in range(5 * width):
        workspace[workspace_offset + index] = 0
    workspace[first_offset] = one
    coefficient_length = one
    use_first = True
    # Grow the trailing principal characteristic polynomial upward.
    for corner_index in range(degree):
        corner = degree - corner_index - one
        trailing = degree - corner - one
        workspace[toeplitz_offset] = one
        workspace[toeplitz_offset + one] = (
            -matrix[matrix_offset + corner * degree + corner]
        ) % modulus
        if trailing > 0:
            for row in range(trailing):
                workspace[vector_offset + row] = matrix[
                    matrix_offset + (corner + one + row) * degree + corner
                ]
            toeplitz_index = 2
            while toeplitz_index <= trailing + one:
                product = 0
                for column in range(trailing):
                    product += (
                        matrix[matrix_offset + corner * degree + corner + one + column]
                        * workspace[vector_offset + column]
                    )
                workspace[toeplitz_offset + toeplitz_index] = (-product) % modulus
                if toeplitz_index <= trailing:
                    for row in range(trailing):
                        value = 0
                        matrix_row = (
                            matrix_offset + (corner + one + row) * degree + corner + one
                        )
                        for column in range(trailing):
                            value += (
                                matrix[matrix_row + column]
                                * workspace[vector_offset + column]
                            )
                        workspace[next_vector_offset + row] = value % modulus
                    for row in range(trailing):
                        workspace[vector_offset + row] = workspace[
                            next_vector_offset + row
                        ]
                toeplitz_index += one
        source_offset = first_offset
        target_offset = second_offset
        if not use_first:
            source_offset = second_offset
            target_offset = first_offset
        new_length = coefficient_length + one
        for output_index in range(new_length):
            value = 0
            maximum = output_index
            if maximum >= coefficient_length:
                maximum = coefficient_length - one
            for source_index in range(maximum + one):
                value += (
                    workspace[source_offset + source_index]
                    * workspace[toeplitz_offset + output_index - source_index]
                )
            workspace[target_offset + output_index] = value % modulus
        coefficient_length = new_length
        use_first = not use_first
    source_offset = first_offset
    if not use_first:
        source_offset = second_offset
    for index in range(degree + one):
        output_descending[output_offset + index] = workspace[source_offset + index]
    return True


@native
def packed_round4_padic_characteristic(
    control: IntegerBuffer,
    output_ascending: IntegerBuffer,
    defining: IntegerBuffer,
    element: IntegerBuffer,
    prime_buffer: IntegerBuffer,
    workspace: IntegerBuffer,
    precision: uint64,
    degree: uint64,
) -> bool:
    """Recover an integral element characteristic polynomial modulo `p^N`.

    `defining` is the `degree + 1` ascending integral monic equation,
    `element` is `[denominator, numerator_0, ..., numerator_(n-1)]`, and
    `prime_buffer` contains one exact proved prime.  The output has
    `degree + 1` ascending centered residues modulo `p**precision`.

    `control[0]` is a stable status, `control[1]` the denominator
    exponent, `control[2]` the lifted modulus exponent, and `control[3]`
    the transcript transition index supplied by the caller and left intact.
    A false return therefore distinguishes a capability/invariant result via
    control without throwing across the native boundary.
    """
    zero = degree - degree
    if degree == zero:
        if len(control) > 0:
            control[0] = -1
        return False
    one = degree // degree
    width = degree + one
    expected_workspace = degree * degree + width + 5 * width
    valid = len(control) >= 4
    if len(output_ascending) != width or len(defining) != width:
        valid = False
    if len(element) != width or len(prime_buffer) != one:
        valid = False
    if len(workspace) != expected_workspace:
        valid = False
    if not valid:
        if len(control) > 0:
            control[0] = -1
        return False
    if defining[degree] != one or precision == zero:
        control[0] = 0
        return False
    prime = prime_buffer[zero]
    if prime <= one:
        control[0] = -2
        return False
    integer_one = prime // prime
    integer_zero = integer_one - integer_one
    denominator_exponent = _packed_positive_power_exponent(element[zero], prime)
    if denominator_exponent < zero:
        control[0] = -3
        return False
    lifted_exponent = precision + denominator_exponent * degree
    modulus = _packed_integer_power(prime, lifted_exponent)
    output_modulus = _packed_integer_power(prime, precision)
    matrix_offset = zero
    characteristic_offset = degree * degree
    berkowitz_offset = characteristic_offset + width
    matrix_completed = _packed_round4_fill_multiplication_matrix(
        workspace,
        matrix_offset,
        defining,
        element,
        degree,
        modulus,
    )
    characteristic_completed = _packed_round4_berkowitz_characteristic(
        workspace,
        characteristic_offset,
        workspace,
        matrix_offset,
        workspace,
        berkowitz_offset,
        degree,
        modulus,
    )
    denominator_power = integer_one
    if not matrix_completed or not characteristic_completed:
        control[0] = 0
        return False
    for descending_index in range(degree + one):
        ascending_index = degree - descending_index
        coefficient = workspace[characteristic_offset + descending_index]
        if coefficient % denominator_power != integer_zero:
            control[0] = -4
            control[1] = denominator_exponent
            control[2] = lifted_exponent
            return False
        coefficient = (coefficient // denominator_power) % output_modulus
        if coefficient > output_modulus // 2:
            coefficient -= output_modulus
        output_ascending[ascending_index] = coefficient
        denominator_power *= element[zero]
    control[0] = 1
    control[1] = denominator_exponent
    control[2] = lifted_exponent
    return True


@native
def packed_round4_exact_characteristic(
    control: IntegerBuffer,
    output_ascending: IntegerBuffer,
    matrix_workspace: IntegerBuffer,
    defining: IntegerBuffer,
    element: IntegerBuffer,
    prime_buffer: IntegerBuffer,
    degree: uint64,
) -> bool:
    """Compute one exact integral characteristic event with packed FLINT.

    This is the mature-library crossover for larger denominators and exact
    certificate sinks.  Matrix construction and denominator normalization
    remain the same ordinary typed source used by the dynamic path; the
    declared FLINT characteristic call is isolated inside the compiled core.
    `control` has the same status and monotone transcript-index convention
    as `packed_round4_padic_characteristic`.
    """
    zero = degree - degree
    if degree == zero:
        if len(control) > 0:
            control[0] = -1
        return False
    one = degree // degree
    width = degree + one
    valid = len(control) >= 4
    if len(output_ascending) != width or len(matrix_workspace) != degree * degree:
        valid = False
    if len(defining) != width or len(element) != width or len(prime_buffer) != one:
        valid = False
    if not valid:
        if len(control) > 0:
            control[0] = -1
        return False
    if defining[degree] != one:
        control[0] = 0
        return False
    prime = prime_buffer[zero]
    if prime <= one:
        control[0] = -2
        return False
    denominator_exponent = _packed_positive_power_exponent(element[zero], prime)
    if denominator_exponent < zero:
        control[0] = -3
        return False
    matrix_completed = _packed_round4_fill_exact_multiplication_matrix(
        matrix_workspace,
        defining,
        element,
        degree,
    )
    characteristic_completed = fmpz_mat_charpoly(
        output_ascending,
        matrix_workspace,
        width,
        degree,
        one,
    )
    if not matrix_completed or not characteristic_completed:
        control[0] = 0
        return False
    integer_one = prime // prime
    integer_zero = integer_one - integer_one
    denominator_power = _packed_integer_power(element[zero], degree)
    for coefficient_index in range(width):
        coefficient = output_ascending[coefficient_index]
        if coefficient % denominator_power != integer_zero:
            control[0] = -4
            control[1] = denominator_exponent
            return False
        output_ascending[coefficient_index] = coefficient // denominator_power
        if coefficient_index < degree:
            denominator_power //= element[zero]
    control[0] = 1
    control[1] = denominator_exponent
    control[2] = 0
    return True


__all__ = [
    "ROUND4_STATE_INVALID_DENOMINATOR",
    "ROUND4_STATE_INVALID_PRIME",
    "ROUND4_STATE_INVALID_SHAPE",
    "ROUND4_STATE_NONINTEGRAL",
    "ROUND4_STATE_OK",
    "ROUND4_STATE_UNSUPPORTED",
    "packed_round4_exact_characteristic",
    "packed_round4_padic_characteristic",
]

"""Source-transparent structural kernels for normalized packed `QQ[x]`."""

from __future__ import annotations

from sagejs.native import IntegerBuffer, native, uint64


@native
def packed_rational_polynomial_gcd(left: int, right: int) -> int:
    left = abs(left)
    right = abs(right)
    while right:
        left, right = right, left % right
    return left


@native
def packed_rational_polynomial_add_pair(
    left_numerator: int,
    left_denominator: int,
    right_numerator: int,
    right_denominator: int,
) -> tuple[int, int]:
    common = packed_rational_polynomial_gcd(left_denominator, right_denominator)
    left_scale = left_denominator // common
    right_scale = right_denominator // common
    numerator = left_numerator * right_scale + right_numerator * left_scale
    if numerator == 0:
        return 0, 1
    remaining = packed_rational_polynomial_gcd(numerator, common)
    numerator //= remaining
    denominator = left_scale * (right_denominator // remaining)
    return numerator, denominator


@native
def packed_rational_polynomial_multiply_pair(
    left_numerator: int,
    left_denominator: int,
    right_numerator: int,
    right_denominator: int,
) -> tuple[int, int]:
    if left_numerator == 0 or right_numerator == 0:
        return 0, 1
    left_common = packed_rational_polynomial_gcd(left_numerator, right_denominator)
    right_common = packed_rational_polynomial_gcd(right_numerator, left_denominator)
    return (
        (left_numerator // left_common) * (right_numerator // right_common),
        (left_denominator // right_common) * (right_denominator // left_common),
    )


@native
def packed_rational_polynomial_add(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    left_numerators: IntegerBuffer,
    left_denominators: IntegerBuffer,
    right_numerators: IntegerBuffer,
    right_denominators: IntegerBuffer,
) -> bool:
    length = len(left_numerators)
    if len(right_numerators) > length:
        length = len(right_numerators)
    valid = len(left_denominators) == len(left_numerators)
    if len(right_denominators) != len(right_numerators):
        valid = False
    if len(output_numerators) != length or len(output_denominators) != length:
        valid = False
    if valid:
        for index in range(length):
            left_numerator = 0
            left_denominator = 1
            right_numerator = 0
            right_denominator = 1
            if index < len(left_numerators):
                left_numerator = left_numerators[index]
                left_denominator = left_denominators[index]
            if index < len(right_numerators):
                right_numerator = right_numerators[index]
                right_denominator = right_denominators[index]
            numerator, denominator = packed_rational_polynomial_add_pair(
                left_numerator,
                left_denominator,
                right_numerator,
                right_denominator,
            )
            output_numerators[index] = numerator
            output_denominators[index] = denominator
    return valid


@native
def packed_rational_polynomial_subtract(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    left_numerators: IntegerBuffer,
    left_denominators: IntegerBuffer,
    right_numerators: IntegerBuffer,
    right_denominators: IntegerBuffer,
) -> bool:
    length = len(left_numerators)
    if len(right_numerators) > length:
        length = len(right_numerators)
    valid = len(left_denominators) == len(left_numerators)
    if len(right_denominators) != len(right_numerators):
        valid = False
    if len(output_numerators) != length or len(output_denominators) != length:
        valid = False
    if valid:
        for index in range(length):
            left_numerator = 0
            left_denominator = 1
            right_numerator = 0
            right_denominator = 1
            if index < len(left_numerators):
                left_numerator = left_numerators[index]
                left_denominator = left_denominators[index]
            if index < len(right_numerators):
                right_numerator = right_numerators[index]
                right_denominator = right_denominators[index]
            numerator, denominator = packed_rational_polynomial_add_pair(
                left_numerator,
                left_denominator,
                -right_numerator,
                right_denominator,
            )
            output_numerators[index] = numerator
            output_denominators[index] = denominator
    return valid


@native
def packed_rational_polynomial_negate(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
) -> bool:
    valid = len(source_numerators) == len(source_denominators)
    if len(output_numerators) != len(source_numerators):
        valid = False
    if len(output_denominators) != len(source_numerators):
        valid = False
    if valid:
        for index in range(len(source_numerators)):
            output_numerators[index] = -source_numerators[index]
            output_denominators[index] = source_denominators[index]
    return valid


@native
def packed_rational_polynomial_multiply(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    left_numerators: IntegerBuffer,
    left_denominators: IntegerBuffer,
    right_numerators: IntegerBuffer,
    right_denominators: IntegerBuffer,
) -> bool:
    expected = 0
    if len(left_numerators) != 0 and len(right_numerators) != 0:
        expected = len(left_numerators) + len(right_numerators) - 1
    valid = len(left_numerators) == len(left_denominators)
    if len(right_numerators) != len(right_denominators):
        valid = False
    if len(output_numerators) != expected or len(output_denominators) != expected:
        valid = False
    if valid:
        for index in range(expected):
            output_numerators[index] = 0
            output_denominators[index] = 1
        for left_index in range(len(left_numerators)):
            for right_index in range(len(right_numerators)):
                numerator, denominator = packed_rational_polynomial_multiply_pair(
                    left_numerators[left_index],
                    left_denominators[left_index],
                    right_numerators[right_index],
                    right_denominators[right_index],
                )
                target = left_index + right_index
                numerator, denominator = packed_rational_polynomial_add_pair(
                    output_numerators[target],
                    output_denominators[target],
                    numerator,
                    denominator,
                )
                output_numerators[target] = numerator
                output_denominators[target] = denominator
    return valid


@native
def packed_rational_polynomial_equal(
    left_numerators: IntegerBuffer,
    left_denominators: IntegerBuffer,
    right_numerators: IntegerBuffer,
    right_denominators: IntegerBuffer,
) -> bool:
    equal = len(left_numerators) == len(right_numerators)
    if len(left_denominators) != len(left_numerators):
        equal = False
    if len(right_denominators) != len(right_numerators):
        equal = False
    if equal:
        for index in range(len(left_numerators)):
            if left_numerators[index] != right_numerators[index]:
                equal = False
            if left_denominators[index] != right_denominators[index]:
                equal = False
    return equal


@native
def packed_integral_number_field_multiply_reduce(
    output: IntegerBuffer,
    left: IntegerBuffer,
    right: IntegerBuffer,
    defining: IntegerBuffer,
    workspace: IntegerBuffer,
    degree: uint64,
) -> bool:
    """Multiply canonical elements of `QQ[x]/(f)` for integral monic `f`.

    `left`, `right`, and `output` store one positive common denominator followed
    by exactly `degree` power-basis numerators.  `defining` stores the `degree`
    lower integer coefficients of the monic polynomial.  The caller owns a
    `2 * degree - 1` exact workspace sized from the input coefficient bound.
    The output denominator and all numerators are divided by their common gcd,
    so the representation is canonical.  Returning false reports only a shape
    or denominator invariant failure; the ordinary body is the dynamic oracle.
    """
    zero = degree - degree
    if degree == zero:
        return False
    one = degree // degree
    expected_element = degree + one
    expected_workspace = degree + degree - one
    valid = len(output) == expected_element
    if len(left) != expected_element or len(right) != expected_element:
        valid = False
    if len(defining) != degree or len(workspace) != expected_workspace:
        valid = False
    if valid and (left[0] <= 0 or right[0] <= 0):
        valid = False
    if not valid:
        return False
    for workspace_index in range(expected_workspace):
        workspace[workspace_index] = zero
    for left_index in range(degree):
        for right_index in range(degree):
            target = left_index + right_index
            workspace[target] = (
                workspace[target] + left[left_index + one] * right[right_index + one]
            )
    exponent = expected_workspace - one
    while exponent >= degree:
        leading = workspace[exponent]
        if leading != 0:
            shift = exponent - degree
            for defining_index in range(degree):
                workspace[shift + defining_index] = (
                    workspace[shift + defining_index]
                    - leading * defining[defining_index]
                )
        if exponent == degree:
            exponent = degree - one
        else:
            exponent = exponent - one
    denominator = left[0] * right[0]
    content = denominator
    for content_index in range(degree):
        content = packed_rational_polynomial_gcd(
            content,
            workspace[content_index],
        )
    output[0] = denominator // content
    for output_index in range(degree):
        output[output_index + one] = workspace[output_index] // content
    return True

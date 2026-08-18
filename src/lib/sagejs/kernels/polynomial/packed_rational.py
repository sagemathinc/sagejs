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


@native
def packed_integral_number_field_power_basis(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    multiplication_matrix: IntegerBuffer,
    multiplication_denominator: IntegerBuffer,
    workspace: IntegerBuffer,
    degree: uint64,
) -> bool:
    """Build `1, phi, ..., phi**(degree - 1)` by one exact orbit.

    `multiplication_matrix / multiplication_denominator[0]` is the row-major
    regular-representation matrix for multiplication by `phi` in the ambient
    power basis.  Row `k` of `output_numerators`, divided by
    `output_denominators[k]`, is the coordinate vector of `phi**k`.  Every row
    is divided by the gcd of its denominator and numerators.  The caller owns
    a `2 * degree` exact workspace sized from the matrix infinity norm.

    This is just repeated matrix-vector multiplication, so its output is
    certified by the same regular-representation identity as a sequence of
    field multiplications.  The ordinary body is the dynamic oracle.
    """
    zero = degree - degree
    if degree == zero:
        return False
    one = degree // degree
    valid = len(output_numerators) == degree * degree
    if len(output_denominators) != degree:
        valid = False
    if len(multiplication_matrix) != degree * degree:
        valid = False
    if len(multiplication_denominator) != one:
        valid = False
    if len(workspace) != degree + degree:
        valid = False
    if valid and multiplication_denominator[zero] <= zero:
        valid = False
    if not valid:
        return False
    integer_one = multiplication_denominator[zero] // multiplication_denominator[zero]
    integer_zero = integer_one - integer_one

    for index in range(degree + degree):
        workspace[index] = zero
    workspace[zero] = integer_one
    denominator = integer_one
    for exponent in range(degree):
        content = denominator
        for column in range(degree):
            content = packed_rational_polynomial_gcd(content, workspace[column])
        denominator = denominator // content
        output_denominators[exponent] = denominator
        output_offset = exponent * degree
        for column in range(degree):
            workspace[column] = workspace[column] // content
            output_numerators[output_offset + column] = workspace[column]
        if exponent + one < degree:
            for row in range(degree):
                value = integer_zero
                matrix_offset = row * degree
                for column in range(degree):
                    value = (
                        value
                        + multiplication_matrix[matrix_offset + column]
                        * workspace[column]
                    )
                workspace[degree + row] = value
            denominator = denominator * multiplication_denominator[zero]
            for row in range(degree):
                workspace[row] = workspace[degree + row]
                workspace[degree + row] = zero
    return True


@native
def packed_integral_number_field_exact_quotient(
    output: IntegerBuffer,
    multiplication_matrix: IntegerBuffer,
    multiplication_denominator: IntegerBuffer,
    dividend: IntegerBuffer,
    workspace: IntegerBuffer,
    degree: uint64,
) -> bool:
    """Solve an exact field quotient and certify it by multiplication.

    `multiplication_matrix / multiplication_denominator[0]` is the regular
    representation of the nonzero divisor.  `dividend` and `output` use the
    canonical common-denominator element layout.  The workspace contains an
    integer-cleared augmented matrix and one solution vector.

    Fraction-free Bareiss elimination makes every matrix update an exact
    division.  Its last pivot is the determinant; multiplying the rational
    solution by its absolute value gives integral Cramer numerators, allowing
    back substitution with one common denominator.  Before returning, the
    kernel verifies the original cleared multiplication equation exactly.
    """
    zero = degree - degree
    if degree == zero:
        return False
    one = degree // degree
    element_length = degree + one
    augmented_width = degree + one
    augmented_length = degree * augmented_width
    expected_workspace = augmented_length + degree
    valid = len(output) == element_length
    if len(multiplication_matrix) != degree * degree:
        valid = False
    if len(multiplication_denominator) != one:
        valid = False
    if len(dividend) != element_length:
        valid = False
    if len(workspace) != expected_workspace:
        valid = False
    if valid and (multiplication_denominator[zero] <= zero or dividend[zero] <= zero):
        valid = False
    if not valid:
        return False
    integer_one = multiplication_denominator[zero] // multiplication_denominator[zero]
    integer_zero = integer_one - integer_one

    for row in range(degree):
        augmented_offset = row * augmented_width
        matrix_offset = row * degree
        for column in range(degree):
            workspace[augmented_offset + column] = multiplication_matrix[
                matrix_offset + column
            ]
        workspace[augmented_offset + degree] = (
            multiplication_denominator[zero] * dividend[row + one]
        )

    previous_pivot = integer_one
    for pivot_index in range(degree - one):
        pivot_row = pivot_index
        while (
            pivot_row < degree
            and workspace[pivot_row * augmented_width + pivot_index] == integer_zero
        ):
            pivot_row = pivot_row + one
        if pivot_row == degree:
            return False
        if pivot_row != pivot_index:
            for column in range(augmented_width):
                first = pivot_index * augmented_width + column
                second = pivot_row * augmented_width + column
                temporary = workspace[first]
                workspace[first] = workspace[second]
                workspace[second] = temporary
        pivot_offset = pivot_index * augmented_width
        pivot = workspace[pivot_offset + pivot_index]
        for elimination_row in range(pivot_index + one, degree):
            row_offset = elimination_row * augmented_width
            lower = workspace[row_offset + pivot_index]
            for elimination_column in range(pivot_index + one, augmented_width):
                numerator = (
                    workspace[row_offset + elimination_column] * pivot
                    - lower * workspace[pivot_offset + elimination_column]
                )
                if numerator % previous_pivot != integer_zero:
                    return False
                workspace[row_offset + elimination_column] = numerator // previous_pivot
            workspace[row_offset + pivot_index] = integer_zero
        previous_pivot = pivot

    last_diagonal = (degree - one) * augmented_width + degree - one
    determinant = workspace[last_diagonal]
    if determinant == integer_zero:
        return False
    common_denominator = determinant
    if common_denominator < integer_zero:
        common_denominator = -common_denominator
    solution_offset = augmented_length
    for reverse_index in range(degree):
        back_row = degree - one - reverse_index
        back_row_offset = back_row * augmented_width
        numerator = workspace[back_row_offset + degree] * common_denominator
        for back_column in range(back_row + one, degree):
            numerator = (
                numerator
                - workspace[back_row_offset + back_column]
                * workspace[solution_offset + back_column]
            )
        diagonal = workspace[back_row_offset + back_row]
        if numerator % diagonal != integer_zero:
            return False
        workspace[solution_offset + back_row] = numerator // diagonal

    denominator = common_denominator * dividend[zero]
    content = denominator
    for index in range(degree):
        content = packed_rational_polynomial_gcd(
            content,
            workspace[solution_offset + index],
        )
    output[zero] = denominator // content
    for index in range(degree):
        output[index + one] = workspace[solution_offset + index] // content

    for row in range(degree):
        recovered = integer_zero
        matrix_offset = row * degree
        for column in range(degree):
            recovered = (
                recovered
                + multiplication_matrix[matrix_offset + column] * output[column + one]
            )
        recovered = recovered * dividend[zero]
        expected = multiplication_denominator[zero] * dividend[row + one] * output[zero]
        if recovered != expected:
            return False
    return True

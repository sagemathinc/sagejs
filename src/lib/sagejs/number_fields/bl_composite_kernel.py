"""Packed exact-integer kernels for composite Buchmann--Lenstra steps.

The public wrappers in `buchmann_lenstra` retain their readable list-based
reference algorithms.  This module only moves measured dense integer loops
across the source-transparent native boundary.  CPython and a Sage.js runtime
without a matching artifact execute these same ordinary Python bodies.
"""

from __future__ import annotations

from sagejs.native import IntegerBuffer, native, uint64


@native
def packed_cubic_order_norm_form_coefficients_in_place(
    output: IntegerBuffer,
    multiplication_table: IntegerBuffer,
) -> bool:
    """Interpolate a cubic order norm form from its multiplication table.

    The table uses `(basis factor, multiplied basis column, output row)`
    order.  `output` receives coefficients in the monomial order used by the
    two cubic norm-form kernels below.
    """
    if len(output) != 10 or len(multiplication_table) != 27:
        return False
    point = 0
    while point < 10:
        x = 0
        y = 0
        z = 0
        if point == 0:
            x = 1
        elif point == 1:
            y = 1
        elif point == 2:
            z = 1
        elif point == 3:
            x = 1
            y = 1
        elif point == 4:
            x = 1
            y = -1
        elif point == 5:
            x = 1
            z = 1
        elif point == 6:
            x = 1
            z = -1
        elif point == 7:
            y = 1
            z = 1
        elif point == 8:
            y = 1
            z = -1
        else:
            x = 1
            y = 1
            z = 1
        m00 = (
            x * multiplication_table[0]
            + y * multiplication_table[9]
            + z * multiplication_table[18]
        )
        m01 = (
            x * multiplication_table[3]
            + y * multiplication_table[12]
            + z * multiplication_table[21]
        )
        m02 = (
            x * multiplication_table[6]
            + y * multiplication_table[15]
            + z * multiplication_table[24]
        )
        m10 = (
            x * multiplication_table[1]
            + y * multiplication_table[10]
            + z * multiplication_table[19]
        )
        m11 = (
            x * multiplication_table[4]
            + y * multiplication_table[13]
            + z * multiplication_table[22]
        )
        m12 = (
            x * multiplication_table[7]
            + y * multiplication_table[16]
            + z * multiplication_table[25]
        )
        m20 = (
            x * multiplication_table[2]
            + y * multiplication_table[11]
            + z * multiplication_table[20]
        )
        m21 = (
            x * multiplication_table[5]
            + y * multiplication_table[14]
            + z * multiplication_table[23]
        )
        m22 = (
            x * multiplication_table[8]
            + y * multiplication_table[17]
            + z * multiplication_table[26]
        )
        output[point] = (
            m00 * (m11 * m22 - m12 * m21)
            - m01 * (m10 * m22 - m12 * m20)
            + m02 * (m10 * m21 - m11 * m20)
        )
        point += 1

    c300 = output[0]
    c030 = output[1]
    c003 = output[2]
    plus01 = output[3] - c300 - c030
    minus01 = output[4] - c300 + c030
    plus02 = output[5] - c300 - c003
    minus02 = output[6] - c300 + c003
    plus12 = output[7] - c030 - c003
    minus12 = output[8] - c030 + c003
    if (
        (plus01 + minus01) % 2 != 0
        or (plus01 - minus01) % 2 != 0
        or (plus02 + minus02) % 2 != 0
        or (plus02 - minus02) % 2 != 0
        or (plus12 + minus12) % 2 != 0
        or (plus12 - minus12) % 2 != 0
    ):
        return False
    c210 = (plus01 - minus01) // 2
    c120 = (plus01 + minus01) // 2
    c201 = (plus02 - minus02) // 2
    c102 = (plus02 + minus02) // 2
    c021 = (plus12 - minus12) // 2
    c012 = (plus12 + minus12) // 2
    c111 = output[9] - (c300 + c030 + c003 + c210 + c201 + c120 + c021 + c102 + c012)
    output[0] = c300
    output[1] = c030
    output[2] = c003
    output[3] = c210
    output[4] = c201
    output[5] = c120
    output[6] = c021
    output[7] = c102
    output[8] = c012
    output[9] = c111
    return True


@native
def packed_cubic_norm_form_target_slice(
    coefficients: IntegerBuffer,
    modulus: uint64,
    x_start: uint64,
    x_stop: uint64,
    positive_target: uint64,
    negative_target: uint64,
) -> uint64:
    """Search one bounded `x`-slice of a ternary cubic norm form.

    Return `0` for an invalid packed call, `1` when neither target is
    represented, and `2` as soon as either target is represented.  The caller
    keeps cancellation between bounded slices and independently replays the
    resulting obstruction when verifying the class-number certificate.
    """
    invalid: uint64 = 0
    absent: uint64 = 1
    represented: uint64 = 2
    if (
        len(coefficients) != 10
        or modulus < 2
        or x_start > x_stop
        or x_stop > modulus
        or positive_target >= modulus
        or negative_target >= modulus
    ):
        return invalid
    c300 = coefficients[0] % modulus
    c030 = coefficients[1] % modulus
    c003 = coefficients[2] % modulus
    c210 = coefficients[3] % modulus
    c201 = coefficients[4] % modulus
    c120 = coefficients[5] % modulus
    c021 = coefficients[6] % modulus
    c102 = coefficients[7] % modulus
    c012 = coefficients[8] % modulus
    c111 = coefficients[9] % modulus
    for x in range(x_start, x_stop):
        for y in range(modulus):
            for z in range(modulus):
                value = (
                    c300 * x * x * x
                    + c030 * y * y * y
                    + c003 * z * z * z
                    + c210 * x * x * y
                    + c201 * x * x * z
                    + c120 * x * y * y
                    + c021 * y * y * z
                    + c102 * x * z * z
                    + c012 * y * z * z
                    + c111 * x * y * z
                ) % modulus
                if value == positive_target or value == negative_target:
                    return represented
    return absent


@native
def packed_cubic_norm_smooth_candidates_in_place(
    metadata: IntegerBuffer,
    coefficient_output: IntegerBuffer,
    norm_output: IntegerBuffer,
    norm_coefficients: IntegerBuffer,
    rational_primes: IntegerBuffer,
    coefficient_bound: uint64,
    maximum_candidates: uint64,
) -> bool:
    """Enumerate canonical cubic box elements with smooth rational norm.

    Coefficients are maximal-order basis coordinates in the centered box of
    radius `coefficient_bound`.  Negation is removed by requiring the first
    nonzero coordinate to be positive.  The ten norm-form coefficients use
    the monomial order documented by `packed_cubic_norm_form_target_slice`.

    `metadata` receives candidate count, tested-vector count, overflow, and
    the requested bound.  The output arrays have fixed caller-owned capacity;
    overflow retains an exact prefix and lets the readable caller fall back.
    """
    maximum_bound: uint64 = 16
    maximum_prime_count: uint64 = 256
    valid = (
        len(metadata) == 4
        and len(norm_coefficients) == 10
        and len(rational_primes) <= maximum_prime_count
        and coefficient_bound > 0
        and coefficient_bound <= maximum_bound
        and maximum_candidates > 0
        and len(coefficient_output) == 3 * maximum_candidates
        and len(norm_output) == maximum_candidates
    )
    if not valid:
        return False
    previous_prime = 1
    for prime_index in range(len(rational_primes)):
        prime = rational_primes[prime_index]
        if prime <= previous_prime:
            return False
        previous_prime = prime
    metadata[0] = 0
    metadata[1] = 0
    metadata[2] = 0
    metadata[3] = coefficient_bound
    width = 2 * coefficient_bound + 1
    for x_index in range(width):
        x = x_index - coefficient_bound
        for y_index in range(width):
            y = y_index - coefficient_bound
            for z_index in range(width):
                z = z_index - coefficient_bound
                canonical = not (x == 0 and y == 0 and z == 0) and not (
                    x < 0 or (x == 0 and y < 0) or (x == 0 and y == 0 and z < 0)
                )
                if canonical:
                    metadata[1] += 1
                    norm = (
                        norm_coefficients[0] * x * x * x
                        + norm_coefficients[1] * y * y * y
                        + norm_coefficients[2] * z * z * z
                        + norm_coefficients[3] * x * x * y
                        + norm_coefficients[4] * x * x * z
                        + norm_coefficients[5] * x * y * y
                        + norm_coefficients[6] * y * y * z
                        + norm_coefficients[7] * x * z * z
                        + norm_coefficients[8] * y * z * z
                        + norm_coefficients[9] * x * y * z
                    )
                    if norm < 0:
                        norm = -norm
                    if norm > 1:
                        remaining = norm
                        for prime_index in range(len(rational_primes)):
                            prime = rational_primes[prime_index]
                            while remaining % prime == 0:
                                remaining //= prime
                        if remaining == 1:
                            candidate = metadata[0]
                            if candidate >= maximum_candidates:
                                metadata[2] = 1
                                return True
                            coefficient_output[3 * candidate] = x
                            coefficient_output[3 * candidate + 1] = y
                            coefficient_output[3 * candidate + 2] = z
                            norm_output[candidate] = norm
                            metadata[0] = candidate + 1
    return True


def _packed_upper_hnf_contains(
    numerators: IntegerBuffer,
    numerator_offset: int,
    basis_denominator: int,
    vector: IntegerBuffer,
    vector_denominator: int,
    degree: int,
    workspace: IntegerBuffer,
    workspace_offset: int,
) -> bool:
    coordinate = 0
    while coordinate < degree:
        value = basis_denominator * vector[coordinate]
        source = 0
        while source < coordinate:
            value -= (
                workspace[workspace_offset + source]
                * numerators[numerator_offset + source * degree + coordinate]
            )
            source += 1
        diagonal = numerators[numerator_offset + coordinate * degree + coordinate]
        if diagonal == 0 or value % diagonal != 0:
            return False
        quotient = value // diagonal
        workspace[workspace_offset + coordinate] = quotient
        if quotient % vector_denominator != 0:
            return False
        coordinate += 1
    return True


@native
def packed_factor_base_rows_in_place(
    metadata: IntegerBuffer,
    row_output: IntegerBuffer,
    smooth_output: IntegerBuffer,
    workspace: IntegerBuffer,
    coefficient_vectors: IntegerBuffer,
    absolute_norms: IntegerBuffer,
    order_basis_numerators: IntegerBuffer,
    prime_power_numerators: IntegerBuffer,
    prime_power_denominators: IntegerBuffer,
    factor_offsets: IntegerBuffer,
    factor_norms: IntegerBuffer,
    order_basis_denominator: int,
    degree: uint64,
    candidate_count: uint64,
    factor_count: uint64,
    prime_power_count: uint64,
) -> bool:
    """Compute many exact integral factor-base rows in one packed pass.

    Candidate vectors are order-basis coordinates.  Prime powers are packed as
    consecutive upper-HNF lattices, grouped by the monotone `factor_offsets`.
    Each row records the exact length of the nested containment prefix.  A row
    is marked smooth only when its factor-base norm equals the supplied exact
    absolute element norm.  The caller independently reconstructs retained
    row ideals and checks generator containment before certificate admission.
    """
    maximum_degree: uint64 = 16
    maximum_candidates: uint64 = 4096
    maximum_factors: uint64 = 4096
    maximum_prime_powers: uint64 = 4096
    square = degree * degree
    valid = (
        degree > 0
        and degree <= maximum_degree
        and candidate_count > 0
        and candidate_count <= maximum_candidates
        and factor_count > 0
        and factor_count <= maximum_factors
        and prime_power_count > 0
        and prime_power_count <= maximum_prime_powers
        and order_basis_denominator > 0
        and len(metadata) == 3
        and len(row_output) == candidate_count * factor_count
        and len(smooth_output) == candidate_count
        and len(workspace) == 2 * degree
        and len(coefficient_vectors) == candidate_count * degree
        and len(absolute_norms) == candidate_count
        and len(order_basis_numerators) == square
        and len(prime_power_numerators) == prime_power_count * square
        and len(prime_power_denominators) == prime_power_count
        and len(factor_offsets) == factor_count + 1
        and len(factor_norms) == factor_count
        and factor_offsets[0] == 0
        and factor_offsets[factor_count] == prime_power_count
    )
    factor_index = 0
    while valid and factor_index < factor_count:
        if (
            factor_offsets[factor_index] > factor_offsets[factor_index + 1]
            or factor_norms[factor_index] <= 1
        ):
            valid = False
        factor_index += 1
    power_index = 0
    while valid and power_index < prime_power_count:
        if prime_power_denominators[power_index] <= 0:
            valid = False
        row = 0
        while valid and row < degree:
            column = 0
            while column < row:
                if (
                    prime_power_numerators[power_index * square + row * degree + column]
                    != 0
                ):
                    valid = False
                column += 1
            if prime_power_numerators[power_index * square + row * degree + row] == 0:
                valid = False
            row += 1
        power_index += 1
    if not valid:
        return False
    metadata[0] = 0
    metadata[1] = candidate_count
    metadata[2] = prime_power_count
    candidate_index = 0
    while candidate_index < candidate_count:
        coordinate = 0
        while coordinate < degree:
            value = 0
            basis_index = 0
            while basis_index < degree:
                value += (
                    coefficient_vectors[candidate_index * degree + basis_index]
                    * order_basis_numerators[basis_index * degree + coordinate]
                )
                basis_index += 1
            workspace[coordinate] = value
            coordinate += 1
        row_norm = 1
        any_valuation = False
        factor_index = 0
        while factor_index < factor_count:
            valuation = 0
            power_index = factor_offsets[factor_index]
            stop = factor_offsets[factor_index + 1]
            member = True
            while member and power_index < stop:
                member = _packed_upper_hnf_contains(
                    prime_power_numerators,
                    power_index * square,
                    prime_power_denominators[power_index],
                    workspace,
                    order_basis_denominator,
                    degree,
                    workspace,
                    degree,
                )
                if member:
                    valuation += 1
                    any_valuation = True
                power_index += 1
            row_output[candidate_index * factor_count + factor_index] = valuation
            exponent = 0
            while exponent < valuation:
                row_norm *= factor_norms[factor_index]
                exponent += 1
            factor_index += 1
        norm = absolute_norms[candidate_index]
        if norm > 1 and any_valuation and row_norm == norm:
            smooth_output[candidate_index] = 1
            metadata[0] += 1
        else:
            smooth_output[candidate_index] = 0
        candidate_index += 1
    return True


def _packed_modular_inverse_or_zero(value: int, modulus: int) -> int:
    old_remainder = modulus
    remainder = value % modulus
    old_coefficient = 0
    coefficient = 1
    while remainder != 0:
        quotient = old_remainder // remainder
        old_remainder, remainder = (
            remainder,
            old_remainder - quotient * remainder,
        )
        old_coefficient, coefficient = (
            coefficient,
            old_coefficient - quotient * coefficient,
        )
    if old_remainder != 1:
        return 0
    return old_coefficient % modulus


def _packed_polynomial_length(
    values: IntegerBuffer,
    offset: int,
    capacity: int,
) -> int:
    length = capacity
    while length > 0 and values[offset + length - 1] == 0:
        length -= 1
    return length


def _packed_polynomial_copy_mod(
    target: IntegerBuffer,
    target_offset: int,
    source: IntegerBuffer,
    source_offset: int,
    source_length: int,
    capacity: int,
    modulus: int,
) -> int:
    index = 0
    while index < capacity:
        target[target_offset + index] = 0
        if index < source_length:
            target[target_offset + index] = source[source_offset + index] % modulus
        index += 1
    return _packed_polynomial_length(target, target_offset, capacity)


def _packed_polynomial_divide_mod(
    quotient: IntegerBuffer,
    quotient_offset: int,
    remainder: IntegerBuffer,
    remainder_offset: int,
    dividend: IntegerBuffer,
    dividend_offset: int,
    dividend_length: int,
    divisor: IntegerBuffer,
    divisor_offset: int,
    divisor_length: int,
    capacity: int,
    modulus: int,
    control: IntegerBuffer,
) -> int:
    index = 0
    while index < capacity:
        quotient[quotient_offset + index] = 0
        remainder[remainder_offset + index] = 0
        if index < dividend_length:
            remainder[remainder_offset + index] = (
                dividend[dividend_offset + index] % modulus
            )
        index += 1
    current_length = _packed_polynomial_length(remainder, remainder_offset, capacity)
    if divisor_length == 0:
        control[5] = 0
        return 0
    inverse = _packed_modular_inverse_or_zero(
        divisor[divisor_offset + divisor_length - 1], modulus
    )
    if inverse == 0:
        control[5] = 0
        return 0
    while current_length >= divisor_length and current_length > 0:
        shift = current_length - divisor_length
        scalar = remainder[remainder_offset + current_length - 1] * inverse % modulus
        quotient[quotient_offset + shift] = scalar
        index = 0
        while index < divisor_length:
            location = remainder_offset + shift + index
            remainder[location] = (
                remainder[location] - scalar * divisor[divisor_offset + index]
            ) % modulus
            index += 1
        current_length = _packed_polynomial_length(
            remainder, remainder_offset, current_length
        )
    return _packed_polynomial_length(quotient, quotient_offset, capacity)


def _packed_polynomial_gcd_mod(
    output: IntegerBuffer,
    output_offset: int,
    left: IntegerBuffer,
    left_offset: int,
    left_length: int,
    right: IntegerBuffer,
    right_offset: int,
    right_length: int,
    workspace: IntegerBuffer,
    workspace_offset: int,
    capacity: int,
    modulus: int,
    control: IntegerBuffer,
) -> int:
    first_offset = workspace_offset
    second_offset = workspace_offset + capacity
    remainder_offset = workspace_offset + 2 * capacity
    quotient_offset = workspace_offset + 3 * capacity
    first_length = _packed_polynomial_copy_mod(
        workspace,
        first_offset,
        left,
        left_offset,
        left_length,
        capacity,
        modulus,
    )
    second_length = _packed_polynomial_copy_mod(
        workspace,
        second_offset,
        right,
        right_offset,
        right_length,
        capacity,
        modulus,
    )
    while control[5] != 0 and second_length > 0:
        _quotient_length = _packed_polynomial_divide_mod(
            workspace,
            quotient_offset,
            workspace,
            remainder_offset,
            workspace,
            first_offset,
            first_length,
            workspace,
            second_offset,
            second_length,
            capacity,
            modulus,
            control,
        )
        remainder_length = _packed_polynomial_length(
            workspace, remainder_offset, capacity
        )
        index = 0
        while index < capacity:
            workspace[first_offset + index] = workspace[second_offset + index]
            workspace[second_offset + index] = workspace[remainder_offset + index]
            index += 1
        first_length = second_length
        second_length = remainder_length
    if control[5] == 0 or first_length == 0:
        return 0
    inverse = _packed_modular_inverse_or_zero(
        workspace[first_offset + first_length - 1], modulus
    )
    if inverse == 0:
        control[5] = 0
        return 0
    index = 0
    while index < capacity:
        output[output_offset + index] = 0
        if index < first_length:
            output[output_offset + index] = (
                workspace[first_offset + index] * inverse % modulus
            )
        index += 1
    return first_length


@native
def packed_composite_dedekind_enlargement_in_place(
    metadata: IntegerBuffer,
    output: IntegerBuffer,
    workspace: IntegerBuffer,
    polynomial: IntegerBuffer,
    modulus: int,
    degree: uint64,
) -> bool:
    """Construct all composite-Dedekind enlargement polynomials at once.

    The five fixed-width output records are the repeated gcd, squarefree
    quotient, integral correction, obstruction, and overorder generator.
    `metadata[0:5]` records their logical lengths.  A false result is a
    deliberate capability result: unit-pivot failure, a split, obstruction
    one, malformed input, or inexact correction all fall back to the readable
    split-aware algorithm.
    """
    capacity = degree + 1
    valid = (
        degree > 0
        and modulus > 1
        and len(metadata) == 6
        and len(output) == 5 * capacity
        and len(workspace) == 8 * capacity
        and len(polynomial) == capacity
        and polynomial[degree] == 1
    )
    index = 0
    while index < len(metadata):
        metadata[index] = 0
        index += 1
    if valid:
        metadata[5] = 1
    index = 0
    while index < len(output):
        output[index] = 0
        index += 1
    index = 0
    while index < len(workspace):
        workspace[index] = 0
        index += 1
    derivative_offset = 0
    mutual_offset = capacity
    division_remainder_offset = 2 * capacity
    gcd_workspace_offset = 4 * capacity
    index = 1
    while valid and index <= degree:
        workspace[derivative_offset + index - 1] = (index * polynomial[index]) % modulus
        index += 1
    derivative_length = _packed_polynomial_length(
        workspace, derivative_offset, capacity
    )
    repeated_length = 0
    if valid:
        repeated_length = _packed_polynomial_gcd_mod(
            output,
            0,
            polynomial,
            0,
            capacity,
            workspace,
            derivative_offset,
            derivative_length,
            workspace,
            gcd_workspace_offset,
            capacity,
            modulus,
            metadata,
        )
        valid = metadata[5] != 0 and repeated_length > 0
    squarefree_length = 0
    if valid:
        squarefree_length = _packed_polynomial_divide_mod(
            output,
            capacity,
            workspace,
            division_remainder_offset,
            polynomial,
            0,
            capacity,
            output,
            0,
            repeated_length,
            capacity,
            modulus,
            metadata,
        )
        valid = (
            metadata[5] != 0
            and _packed_polynomial_length(
                workspace, division_remainder_offset, capacity
            )
            == 0
        )
    # Lift the modular product as ordinary integers and divide the defining
    # polynomial difference coefficientwise by the exact component.
    if valid:
        index = 0
        while index < capacity:
            workspace[mutual_offset + index] = 0
            index += 1
        left = 0
        while left < squarefree_length:
            right = 0
            while right < repeated_length:
                workspace[mutual_offset + left + right] += (
                    output[capacity + left] * output[right]
                )
                right += 1
            left += 1
        index = 0
        while index < capacity:
            difference = polynomial[index] - workspace[mutual_offset + index]
            if difference % modulus != 0:
                valid = False
            else:
                output[2 * capacity + index] = difference // modulus
            index += 1
    correction_length = _packed_polynomial_length(output, 2 * capacity, capacity)
    mutual_length = 0
    if valid:
        mutual_length = _packed_polynomial_gcd_mod(
            workspace,
            mutual_offset,
            output,
            0,
            repeated_length,
            output,
            capacity,
            squarefree_length,
            workspace,
            gcd_workspace_offset,
            capacity,
            modulus,
            metadata,
        )
        valid = metadata[5] != 0 and mutual_length > 0
    obstruction_length = 0
    if valid:
        obstruction_length = _packed_polynomial_gcd_mod(
            output,
            3 * capacity,
            workspace,
            mutual_offset,
            mutual_length,
            output,
            2 * capacity,
            correction_length,
            workspace,
            gcd_workspace_offset,
            capacity,
            modulus,
            metadata,
        )
        valid = metadata[5] != 0 and not (
            obstruction_length == 1 and output[3 * capacity] == 1
        )
    generator_length = 0
    if valid:
        generator_length = _packed_polynomial_divide_mod(
            output,
            4 * capacity,
            workspace,
            division_remainder_offset,
            polynomial,
            0,
            capacity,
            output,
            3 * capacity,
            obstruction_length,
            capacity,
            modulus,
            metadata,
        )
        valid = (
            metadata[5] != 0
            and _packed_polynomial_length(
                workspace, division_remainder_offset, capacity
            )
            == 0
        )
    if valid:
        metadata[0] = repeated_length
        metadata[1] = squarefree_length
        # The readable certificate retains the full defining-polynomial width
        # for the exact correction, including a canonical trailing zero.
        metadata[2] = capacity
        metadata[3] = obstruction_length
        metadata[4] = generator_length
    return valid


@native
def packed_order_table_in_place(
    output: IntegerBuffer,
    workspace: IntegerBuffer,
    numerator: IntegerBuffer,
    polynomial: IntegerBuffer,
    denominator: int,
    degree: uint64,
    left_start: int,
    left_count: int,
) -> bool:
    """Check an upper row-HNF order and stream multiplication-table rows.

    The numerator is a row-major `degree` by `degree` matrix for the basis
    `numerator / denominator`.  When `left_count` is positive, a successful
    call writes the upper-triangular integral structure constants for
    `left_start <= left < left_start + left_count` to `output` in local
    `(left, right, coordinate)` order.  Entries with `right < left` are zero
    and the caller restores them by commutativity.  Passing `left_start == 0`,
    `left_count == 0`, and a one-record output performs the same containment
    and closure proof without materializing the degree-cubed table.

    `workspace` contains the scaled inverse followed by one power-basis
    convolution.  Its fixed word width and the streamed output width are
    independently bounded by the ordinary-Python wrapper.

    This is the normalized-integer equivalent of the readable rational-pair
    implementation retained by `buchmann_lenstra`.  It is deliberately a
    batched source-transparent boundary: no order objects or host callbacks
    occur inside the complete table computation.
    """
    square = degree * degree
    inverse_offset = 0
    product_offset = square
    check_only = left_start == 0 and left_count == 0 and len(output) == 1
    write_rows = (
        left_count > 0
        and left_start >= 0
        and left_start < degree
        and left_count <= degree - left_start
        and len(output) == left_count * square
    )
    valid = (
        degree > 0
        and denominator > 0
        and (check_only or write_rows)
        and len(workspace) == square + 2 * degree - 1
        and len(numerator) == square
        and len(polynomial) == degree + 1
        and polynomial[degree] == 1
    )

    # Canonical BL bases are upper row HNF.  Solve B * X = denominator * I
    # backwards, checking equation-order containment as each exact quotient is
    # formed.  Unsupported/noncanonical input fails closed to the readable
    # reference path in the wrapper.
    row = 0
    while valid and row < degree:
        column = 0
        while column < row:
            if numerator[row * degree + column] != 0:
                valid = False
            column += 1
        row += 1
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
    left = left_start
    left_end = left_start + left_count
    if check_only:
        while left_end < degree:
            left_end += 1
    while valid and left < left_end:
        right = left
        while valid and right < degree:
            entry = 0
            while entry < 2 * degree - 1:
                workspace[product_offset + entry] = 0
                entry += 1
            left_index = 0
            while left_index < degree:
                left_value = numerator[left * degree + left_index]
                if left_value != 0:
                    right_index = 0
                    while right_index < degree:
                        right_value = numerator[right * degree + right_index]
                        if right_value != 0:
                            workspace[product_offset + left_index + right_index] += (
                                left_value * right_value
                            )
                        right_index += 1
                left_index += 1
            reduction_offset = 0
            while reduction_offset < degree - 1:
                exponent = 2 * degree - 2 - reduction_offset
                leading = workspace[product_offset + exponent]
                if leading != 0:
                    coefficient = 0
                    while coefficient < degree:
                        workspace[product_offset + exponent - degree + coefficient] -= (
                            leading * polynomial[coefficient]
                        )
                        coefficient += 1
                reduction_offset += 1
            coordinate = 0
            while valid and coordinate < degree:
                value = 0
                source = 0
                while source < degree:
                    value += (
                        workspace[product_offset + source]
                        * workspace[inverse_offset + source * degree + coordinate]
                    )
                    source += 1
                if value % denominator_squared != 0:
                    valid = False
                elif write_rows:
                    output[
                        ((left - left_start) * degree + right) * degree + coordinate
                    ] = value // denominator_squared
                coordinate += 1
            right += 1
        left += 1
    return valid


@native
def packed_order_contains_vector_in_place(
    workspace: IntegerBuffer,
    numerator: IntegerBuffer,
    vector: IntegerBuffer,
    basis_denominator: int,
    vector_denominator: int,
    degree: uint64,
) -> bool:
    """Check one rational vector against an upper row-HNF basis.

    Sparse exact triangular solves first prove that the basis contains every
    equation-order basis vector.  A final solve and divisibility check proves
    `vector / vector_denominator` belongs to the basis lattice.  This compact
    boundary is used by the independent composite-Dedekind replay; it never
    trusts a transformation emitted by the construction kernel.
    """
    square = degree * degree
    valid = (
        degree > 0
        and basis_denominator > 0
        and vector_denominator > 0
        and len(workspace) == square
        and len(numerator) == square
        and len(vector) == degree
    )
    row = 0
    while valid and row < degree:
        column = 0
        while column < row:
            if numerator[row * degree + column] != 0:
                valid = False
            column += 1
        row += 1
    # Prove equation-order containment by solving the sparse right-hand sides
    # `z*N = d*e_j`.  Coordinates below `j` vanish, so starting each solve at
    # its pivot avoids the zero half of every triangular system while proving
    # exactly the same integrality as constructing `d*N^-1` densely.
    identity_row = 0
    while valid and identity_row < degree:
        coordinate = identity_row
        while valid and coordinate < degree:
            value = 0
            if coordinate == identity_row:
                value = basis_denominator
            source = identity_row
            while source < coordinate:
                value -= workspace[source] * numerator[source * degree + coordinate]
                source += 1
            diagonal = numerator[coordinate * degree + coordinate]
            if diagonal == 0 or value % diagonal != 0:
                valid = False
            else:
                workspace[coordinate] = value // diagonal
            coordinate += 1
        identity_row += 1
    coordinate = 0
    while valid and coordinate < degree:
        value = basis_denominator * vector[coordinate]
        source = 0
        while source < coordinate:
            value -= workspace[source] * numerator[source * degree + coordinate]
            source += 1
        diagonal = numerator[coordinate * degree + coordinate]
        if diagonal == 0 or value % diagonal != 0:
            valid = False
        else:
            workspace[coordinate] = value // diagonal
            if workspace[coordinate] % vector_denominator != 0:
                valid = False
        coordinate += 1
    return valid


@native
def packed_order_contains_vectors_in_place(
    workspace: IntegerBuffer,
    numerator: IntegerBuffer,
    vectors: IntegerBuffer,
    vector_denominators: IntegerBuffer,
    basis_denominator: int,
    degree: uint64,
    vector_count: uint64,
) -> bool:
    """Check a batch of rational vectors against an upper row-HNF basis.

    `vectors` is a row-major `vector_count` by `degree` matrix whose rows have
    the positive denominators in `vector_denominators`.  Sparse triangular
    solves first prove equation-order containment, then solve each rational
    membership directly.  A false result is mathematical rejection;
    fixed-width overflow remains a capability failure handled by the wrapper.
    """
    square = degree * degree
    valid = (
        degree > 0
        and vector_count > 0
        and basis_denominator > 0
        and len(workspace) == square
        and len(numerator) == square
        and len(vectors) == vector_count * degree
        and len(vector_denominators) == vector_count
    )
    row = 0
    while valid and row < degree:
        column = 0
        while column < row:
            if numerator[row * degree + column] != 0:
                valid = False
            column += 1
        row += 1
    identity_row = 0
    while valid and identity_row < degree:
        coordinate = identity_row
        while valid and coordinate < degree:
            value = 0
            if coordinate == identity_row:
                value = basis_denominator
            source = identity_row
            while source < coordinate:
                value -= workspace[source] * numerator[source * degree + coordinate]
                source += 1
            diagonal = numerator[coordinate * degree + coordinate]
            if diagonal == 0 or value % diagonal != 0:
                valid = False
            else:
                workspace[coordinate] = value // diagonal
            coordinate += 1
        identity_row += 1
    vector_index = 0
    while valid and vector_index < vector_count:
        vector_denominator = vector_denominators[vector_index]
        if vector_denominator <= 0:
            valid = False
        coordinate = 0
        while valid and coordinate < degree:
            value = basis_denominator * vectors[vector_index * degree + coordinate]
            source = 0
            while source < coordinate:
                value -= workspace[source] * numerator[source * degree + coordinate]
                source += 1
            diagonal = numerator[coordinate * degree + coordinate]
            if diagonal == 0 or value % diagonal != 0:
                valid = False
            else:
                workspace[coordinate] = value // diagonal
                if workspace[coordinate] % vector_denominator != 0:
                    valid = False
            coordinate += 1
        vector_index += 1
    return valid


@native
def packed_known_overorder_contains_vectors_in_place(
    workspace: IntegerBuffer,
    numerator: IntegerBuffer,
    vectors: IntegerBuffer,
    vector_denominators: IntegerBuffer,
    basis_denominator: int,
    degree: uint64,
    vector_count: uint64,
) -> bool:
    """Check memberships when equation-order containment is already proved.

    For the upper row-HNF numerator `B`, solve `z * B = d * v` directly from
    left to right.  The rational vector `v/s` belongs to `B/d` exactly when
    every coordinate of `z` is integral and divisible by `s`.  Callers may use
    this faster boundary only after an independent proof that `B/d` contains
    the equation order; copied or standalone order data must use
    `packed_order_contains_vectors_in_place` instead.
    """
    square = degree * degree
    valid = (
        degree > 0
        and vector_count > 0
        and basis_denominator > 0
        and len(workspace) == square
        and len(numerator) == square
        and len(vectors) == vector_count * degree
        and len(vector_denominators) == vector_count
    )
    row = 0
    while valid and row < degree:
        column = 0
        while column < row:
            if numerator[row * degree + column] != 0:
                valid = False
            column += 1
        row += 1
    vector_index = 0
    while valid and vector_index < vector_count:
        vector_denominator = vector_denominators[vector_index]
        if vector_denominator <= 0:
            valid = False
        coordinate = 0
        while valid and coordinate < degree:
            value = basis_denominator * vectors[vector_index * degree + coordinate]
            source = 0
            while source < coordinate:
                value -= workspace[source] * numerator[source * degree + coordinate]
                source += 1
            diagonal = numerator[coordinate * degree + coordinate]
            if diagonal == 0 or value % diagonal != 0:
                valid = False
            else:
                workspace[coordinate] = value // diagonal
                if workspace[coordinate] % vector_denominator != 0:
                    valid = False
            coordinate += 1
        vector_index += 1
    return valid


@native
def packed_lattice_memberships_in_place(
    output: IntegerBuffer,
    workspace: IntegerBuffer,
    numerators: IntegerBuffer,
    basis_denominators: IntegerBuffer,
    vector: IntegerBuffer,
    vector_denominator: int,
    degree: uint64,
    basis_count: uint64,
) -> bool:
    """Test one rational vector against several upper-HNF lattices.

    The `basis_count` numerator matrices are packed consecutively in
    row-major order.  Basis and vector denominators are positive.  On a valid
    fixed-shape input, `output[i]` is one exactly when the vector belongs to
    lattice `i`; the boolean return value reports only whether the packed
    computation was applicable.  This distinction lets callers retain a
    readable exact fallback for malformed shapes or fixed-width overflow.
    """
    maximum_degree: uint64 = 16
    maximum_bases: uint64 = 4096
    square = degree * degree
    valid = (
        degree > 0
        and degree <= maximum_degree
        and basis_count > 0
        and basis_count <= maximum_bases
        and vector_denominator > 0
        and len(output) == basis_count
        and len(workspace) == degree
        and len(numerators) == basis_count * square
        and len(basis_denominators) == basis_count
        and len(vector) == degree
    )
    basis_index = 0
    while valid and basis_index < basis_count:
        if basis_denominators[basis_index] <= 0:
            valid = False
        row = 0
        while valid and row < degree:
            column = 0
            while column < row:
                if numerators[basis_index * square + row * degree + column] != 0:
                    valid = False
                column += 1
            if numerators[basis_index * square + row * degree + row] == 0:
                valid = False
            row += 1
        basis_index += 1
    basis_index = 0
    while valid and basis_index < basis_count:
        member = True
        coordinate = 0
        offset = basis_index * square
        while member and coordinate < degree:
            value = basis_denominators[basis_index] * vector[coordinate]
            source = 0
            while source < coordinate:
                value -= (
                    workspace[source]
                    * numerators[offset + source * degree + coordinate]
                )
                source += 1
            diagonal = numerators[offset + coordinate * degree + coordinate]
            if value % diagonal != 0:
                member = False
            else:
                workspace[coordinate] = value // diagonal
                if workspace[coordinate] % vector_denominator != 0:
                    member = False
            coordinate += 1
        if member:
            output[basis_index] = 1
        else:
            output[basis_index] = 0
        basis_index += 1
    return valid


def _packed_row_hnf_in_place(
    output: IntegerBuffer,
    source: IntegerBuffer,
    workspace: IntegerBuffer,
    row_count: int,
    column_count: int,
) -> bool:
    """Write the deterministic full-rank row HNF into `output`.

    `source` and `output` are row-major `row_count` by `column_count`
    matrices.  The first `column_count` output rows contain the answer.
    `workspace` contains two temporary rows.  A false result means that the
    source does not have full column rank; malformed packed shapes raise.
    """
    entry_count = row_count * column_count
    if len(source) != entry_count or len(output) != entry_count:
        return False
    if len(workspace) != 2 * column_count:
        return False
    if column_count == 0:
        return True
    if row_count < column_count:
        return False

    for index in range(entry_count):
        output[index] = source[index]

    pivot_row = 0
    for column in range(column_count):
        candidate = pivot_row
        while candidate < row_count and output[candidate * column_count + column] == 0:
            candidate += 1
        if candidate < row_count:
            if candidate != pivot_row:
                for index in range(column_count):
                    upper_index = pivot_row * column_count + index
                    lower_index = candidate * column_count + index
                    temporary = output[upper_index]
                    output[upper_index] = output[lower_index]
                    output[lower_index] = temporary

            for row in range(pivot_row + 1, row_count):
                lower_column = row * column_count + column
                if output[lower_column] != 0:
                    upper_column = pivot_row * column_count + column
                    old_remainder = output[upper_column]
                    remainder = output[lower_column]
                    old_left = 1
                    left = 0
                    old_right = 0
                    right = 1
                    while remainder != 0:
                        quotient = old_remainder // remainder
                        next_remainder = old_remainder - quotient * remainder
                        next_left = old_left - quotient * left
                        next_right = old_right - quotient * right
                        old_remainder = remainder
                        remainder = next_remainder
                        old_left = left
                        left = next_left
                        old_right = right
                        right = next_right
                    if old_remainder < 0:
                        common = -old_remainder
                        left_coefficient = -old_left
                        right_coefficient = -old_right
                    else:
                        common = old_remainder
                        left_coefficient = old_left
                        right_coefficient = old_right
                    if common == 0:
                        return False

                    upper_scale = output[upper_column] // common
                    lower_scale = output[lower_column] // common
                    for index in range(column_count):
                        workspace[index] = output[pivot_row * column_count + index]
                        workspace[column_count + index] = output[
                            row * column_count + index
                        ]
                    for index in range(column_count):
                        output[pivot_row * column_count + index] = (
                            left_coefficient * workspace[index]
                            + right_coefficient * workspace[column_count + index]
                        )
                        output[row * column_count + index] = (
                            -lower_scale * workspace[index]
                            + upper_scale * workspace[column_count + index]
                        )

            pivot_index = pivot_row * column_count + column
            if output[pivot_index] < 0:
                for index in range(column_count):
                    location = pivot_row * column_count + index
                    output[location] = -output[location]
            pivot = output[pivot_index]
            for row in range(pivot_row):
                row_column = row * column_count + column
                quotient = output[row_column] // pivot
                for index in range(column_count):
                    location = row * column_count + index
                    output[location] -= (
                        quotient * output[pivot_row * column_count + index]
                    )
            pivot_row += 1

    return pivot_row >= column_count


@native
def packed_row_hnf_in_place(
    output: IntegerBuffer,
    source: IntegerBuffer,
    workspace: IntegerBuffer,
    row_count: uint64,
    column_count: uint64,
) -> bool:
    """Public checked ABI for deterministic full-rank row HNF."""
    return _packed_row_hnf_in_place(
        output,
        source,
        workspace,
        row_count,
        column_count,
    )


@native
def packed_ideal_product_hnf_in_place(
    output: IntegerBuffer,
    source: IntegerBuffer,
    workspace: IntegerBuffer,
    left_basis: IntegerBuffer,
    right_basis: IntegerBuffer,
    multiplication_tensor: IntegerBuffer,
    degree: uint64,
) -> bool:
    """Multiply two packed ideal bases and canonicalize their row lattice.

    The two bases and the multiplication tensor are integer numerators over
    caller-owned positive common denominators.  Tensor entry `(i,j,k)` is the
    coefficient of basis coordinate `k` in the product of power-basis
    coordinates `i` and `j`.  The caller combines those three denominators
    after this kernel returns the canonical numerator HNF.
    """
    maximum_degree: uint64 = 16
    row_count = degree * degree
    basis_entries = degree * degree
    product_entries = row_count * degree
    valid = (
        degree > 0
        and degree <= maximum_degree
        and len(output) == product_entries
        and len(source) == product_entries
        and len(workspace) == 2 * degree
        and len(left_basis) == basis_entries
        and len(right_basis) == basis_entries
        and len(multiplication_tensor) == degree * degree * degree
    )
    if not valid:
        return False
    left_row = 0
    while left_row < degree:
        right_row = 0
        while right_row < degree:
            product_row = left_row * degree + right_row
            coordinate = 0
            while coordinate < degree:
                value = 0
                left_coordinate = 0
                while left_coordinate < degree:
                    right_coordinate = 0
                    while right_coordinate < degree:
                        tensor_index = (
                            left_coordinate * degree + right_coordinate
                        ) * degree + coordinate
                        value += (
                            left_basis[left_row * degree + left_coordinate]
                            * right_basis[right_row * degree + right_coordinate]
                            * multiplication_tensor[tensor_index]
                        )
                        right_coordinate += 1
                    left_coordinate += 1
                source[product_row * degree + coordinate] = value
                coordinate += 1
            right_row += 1
        left_row += 1
    return _packed_row_hnf_in_place(
        output,
        source,
        workspace,
        row_count,
        degree,
    )


@native
def packed_ideal_power_chain_hnf_in_place(
    powers: IntegerBuffer,
    output: IntegerBuffer,
    source: IntegerBuffer,
    workspace: IntegerBuffer,
    basis: IntegerBuffer,
    multiplication_tensor: IntegerBuffer,
    degree: uint64,
    power_count: uint64,
) -> bool:
    """Compute canonical numerator HNFs for `I, I^2, ..., I^n`.

    All powers use the caller-owned common denominator convention.  The first
    `degree^2` entries of `output` retain the previous HNF between iterations;
    `powers` receives the canonical `degree` rows for every exponent.
    """
    maximum_degree: uint64 = 16
    maximum_power_count: uint64 = 256
    square = degree * degree
    product_entries = square * degree
    valid = (
        degree > 0
        and degree <= maximum_degree
        and power_count > 0
        and power_count <= maximum_power_count
        and len(powers) == power_count * square
        and len(output) == product_entries
        and len(source) == product_entries
        and len(workspace) == 2 * degree
        and len(basis) == square
        and len(multiplication_tensor) == product_entries
    )
    if not valid:
        return False

    index = 0
    while index < square:
        output[index] = basis[index]
        powers[index] = basis[index]
        index += 1

    exponent = 1
    while exponent < power_count:
        left_row = 0
        while left_row < degree:
            right_row = 0
            while right_row < degree:
                product_row = left_row * degree + right_row
                coordinate = 0
                while coordinate < degree:
                    value = 0
                    left_coordinate = 0
                    while left_coordinate < degree:
                        right_coordinate = 0
                        while right_coordinate < degree:
                            tensor_index = (
                                left_coordinate * degree + right_coordinate
                            ) * degree + coordinate
                            value += (
                                output[left_row * degree + left_coordinate]
                                * basis[right_row * degree + right_coordinate]
                                * multiplication_tensor[tensor_index]
                            )
                            right_coordinate += 1
                        left_coordinate += 1
                    source[product_row * degree + coordinate] = value
                    coordinate += 1
                right_row += 1
            left_row += 1
        if not _packed_row_hnf_in_place(
            output,
            source,
            workspace,
            square,
            degree,
        ):
            return False
        index = 0
        while index < square:
            powers[exponent * square + index] = output[index]
            index += 1
        exponent += 1
    return True


@native
def packed_prime_ideal_candidate_hnf_in_place(
    output: IntegerBuffer,
    source: IntegerBuffer,
    workspace: IntegerBuffer,
    order_basis_numerators: IntegerBuffer,
    modular_subspace: IntegerBuffer,
    prime: int,
    degree: uint64,
    subspace_row_count: uint64,
) -> bool:
    """Materialize one `p*O + subspace` lattice and canonicalize it.

    The order basis is a row-major numerator matrix over one positive common
    denominator chosen by the caller.  `modular_subspace` stores order-basis
    coordinates in `[0, prime)`.  `output` and `source` have exactly
    `degree + subspace_row_count` rows; the first `degree` output rows are
    the canonical row HNF numerator over the unchanged denominator.

    Fixed shapes and the public degree bound keep this ABI suitable for both
    the native host and Wasm.  Returning false leaves the readable rational
    lattice constructor as the exact fallback.
    """
    maximum_degree: uint64 = 16
    row_count = degree + subspace_row_count
    entry_count = row_count * degree
    valid = (
        degree > 0
        and degree <= maximum_degree
        and subspace_row_count <= degree
        and prime >= 2
        and len(output) == entry_count
        and len(source) == entry_count
        and len(workspace) == 2 * degree
        and len(order_basis_numerators) == degree * degree
        and len(modular_subspace) == subspace_row_count * degree
    )
    if not valid:
        return False

    for row in range(degree):
        for column in range(degree):
            source[row * degree + column] = (
                prime * order_basis_numerators[row * degree + column]
            )
    for row in range(subspace_row_count):
        for column in range(degree):
            value = 0
            for basis_index in range(degree):
                coordinate = modular_subspace[row * degree + basis_index]
                if coordinate < 0 or coordinate >= prime:
                    return False
                value += (
                    coordinate * order_basis_numerators[basis_index * degree + column]
                )
            source[(degree + row) * degree + column] = value
    return _packed_row_hnf_in_place(
        output,
        source,
        workspace,
        row_count,
        degree,
    )


@native
def packed_composite_dedekind_basis_in_place(
    metadata: IntegerBuffer,
    data_output: IntegerBuffer,
    hnf_output: IntegerBuffer,
    data_workspace: IntegerBuffer,
    hnf_source: IntegerBuffer,
    hnf_workspace: IntegerBuffer,
    power_workspace: IntegerBuffer,
    polynomial: IntegerBuffer,
    modulus: int,
    degree: uint64,
) -> bool:
    """Fuse composite-Dedekind data, generator rows, and row HNF.

    All polynomial evidence remains available in `data_output`; the first
    `degree` rows of `hnf_output` are the canonical numerator of the resulting
    overorder.  Failure retains the split-aware readable fallback.
    """
    capacity = degree + 1
    row_count = 2 * degree
    valid = (
        len(hnf_output) == row_count * degree
        and len(hnf_source) == row_count * degree
        and len(hnf_workspace) == 2 * degree
        and len(power_workspace) == 2 * degree - 1
    )
    if valid:
        valid = packed_composite_dedekind_enlargement_in_place(
            metadata,
            data_output,
            data_workspace,
            polynomial,
            modulus,
            degree,
        )
    entry = 0
    while entry < len(hnf_source):
        hnf_source[entry] = 0
        entry += 1
    row = 0
    while valid and row < degree:
        hnf_source[row * degree + row] = modulus
        row += 1
    generator_length = 0
    if valid:
        generator_length = metadata[4]
    exponent = 0
    while valid and exponent < degree:
        entry = 0
        while entry < len(power_workspace):
            power_workspace[entry] = 0
            entry += 1
        entry = 0
        while entry < generator_length:
            power_workspace[exponent + entry] = data_output[4 * capacity + entry]
            entry += 1
        reduction_offset = 0
        while reduction_offset < degree - 1:
            power_exponent = 2 * degree - 2 - reduction_offset
            leading = power_workspace[power_exponent]
            if leading != 0:
                coefficient = 0
                while coefficient < degree:
                    power_workspace[power_exponent - degree + coefficient] -= (
                        leading * polynomial[coefficient]
                    )
                    coefficient += 1
            reduction_offset += 1
        coordinate = 0
        while coordinate < degree:
            hnf_source[(degree + exponent) * degree + coordinate] = power_workspace[
                coordinate
            ]
            coordinate += 1
        exponent += 1
    if valid:
        valid = _packed_row_hnf_in_place(
            hnf_output,
            hnf_source,
            hnf_workspace,
            row_count,
            degree,
        )
    return valid


__all__ = [
    "packed_composite_dedekind_basis_in_place",
    "packed_composite_dedekind_enlargement_in_place",
    "packed_cubic_norm_form_target_slice",
    "packed_cubic_order_norm_form_coefficients_in_place",
    "packed_cubic_norm_smooth_candidates_in_place",
    "packed_factor_base_rows_in_place",
    "packed_lattice_memberships_in_place",
    "packed_known_overorder_contains_vectors_in_place",
    "packed_ideal_product_hnf_in_place",
    "packed_ideal_power_chain_hnf_in_place",
    "packed_order_contains_vector_in_place",
    "packed_order_contains_vectors_in_place",
    "packed_order_table_in_place",
    "packed_prime_ideal_candidate_hnf_in_place",
    "packed_row_hnf_in_place",
]

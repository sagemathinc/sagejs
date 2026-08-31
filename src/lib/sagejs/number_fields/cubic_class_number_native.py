"""Closed resident program for certified complex-cubic class groups.

The source-transparent entry point starts with a monic integral cubic and
keeps the maximal order, factor base, ideal powers, relations, unit, and
Belabas--Friedman analytic state in one lexical exact arena.  It publishes a
result only after the unconditional Minkowski generator theorem and, assuming
GRH for the Dedekind and Riemann zeta functions, a rigorous analytic
class-number-formula interval prove that both the relation and unit indices are
one.  Unsupported inputs and exhausted resource envelopes decline without
publishing mathematical state.
"""

from __future__ import annotations

from sagejs.ffi.flint import (
    FmpzMatrix,
    fmpz_polynomial,
    fmpz_polynomial_seal,
    fmpz_polynomial_set_coefficient,
    fmpz_matrix,
    fmpz_matrix_entry,
    fmpz_matrix_hnf_into,
    fmpz_matrix_set_entry,
    fmpz_matrix_snf,
    integer_log_sqrt_balls_resource,
    number_field_analysis_resource_project,
    number_field_analysis_resource_project_proof,
    number_field_analyze_resource,
)
from sagejs.native import IntegerBuffer, NativeExactArena, native, uint64
from sagejs.number_fields.field_analysis_resource import (
    packed_field_analysis_fixed_points_are_valid,
)


_CUBIC_WORKSPACE_LENGTH = 8192
_CUBIC_MAX_FACTORS = 64
_CUBIC_MAX_GROUPS = 64
_CUBIC_MAX_POWERS = 12
_CUBIC_MAX_RELATIONS = 512
_CUBIC_ANALYSIS_PROOF_CAPACITY = 512
_CUBIC_MAX_ORDER_WITNESSES = 16
_CUBIC_ROUND2_WORKSPACE_LENGTH = 109

# One reusable caller-owned exact workspace.  All offsets are private to the
# closed call graph and are authenticated again before publication.
_MULTIPLICATION_OFFSET = 0
_IDENTITY_OFFSET = 27
_FACTOR_OFFSET = 30
_FACTOR_STRIDE = 10
_GROUP_OFFSET = 670
_GROUP_STRIDE = 4
_POWER_OFFSET = 926
_HNF_SCRATCH_OFFSET = 7840
_MAP_SCRATCH_OFFSET = 7867
_ROW_SCRATCH_OFFSET = 7880
_NORM_FORM_OFFSET = 7944

_CUBIC_ANALYTIC_THRESHOLD = 581
_CUBIC_ANALYTIC_COEFFICIENT_OFFSET = 3000
_CUBIC_ANALYTIC_TERM_OFFSET = 4026
_CUBIC_ANALYTIC_TERM_STRIDE = 5
_CUBIC_ANALYTIC_MAX_TERMS = 256
_CUBIC_ANALYTIC_VALUE_OFFSET = 5306
_CUBIC_ANALYTIC_MAX_VALUES = 256
_CUBIC_ANALYTIC_PRECISION = 64


@native
def _cubic_positive_mod(value: int, modulus: int) -> int:
    answer = value % modulus
    if answer < 0:
        answer += modulus
    return answer


@native
def _cubic_inverse_mod(value: int, modulus: int) -> int:
    """Return a modular inverse or zero when none exists."""
    old_remainder = _cubic_positive_mod(value, modulus)
    remainder = modulus
    old_coefficient = 1
    coefficient = 0
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
    return _cubic_positive_mod(old_coefficient, modulus)


@native
def _cubic_extended_gcd(left: int, right: int) -> tuple[int, int, int]:
    """Return positive `g, s, t` with `s*left+t*right=g`."""
    old_remainder = left
    remainder = right
    old_left = 1
    current_left = 0
    old_right = 0
    current_right = 1
    while remainder != 0:
        quotient = old_remainder // remainder
        old_remainder, remainder = (
            remainder,
            old_remainder - quotient * remainder,
        )
        old_left, current_left = (
            current_left,
            old_left - quotient * current_left,
        )
        old_right, current_right = (
            current_right,
            old_right - quotient * current_right,
        )
    if old_remainder < 0:
        return (-old_remainder, -old_left, -old_right)
    return (old_remainder, old_left, old_right)


@native
def _cubic_analysis_fixed_points_are_valid(
    proof: IntegerBuffer,
    coefficients: IntegerBuffer,
    projection: IntegerBuffer,
    polynomial: IntegerBuffer,
    numerator: IntegerBuffer,
    primes: IntegerBuffer,
    radical_dimensions: IntegerBuffer,
    radicals: IntegerBuffer,
    selectors: IntegerBuffer,
    checker_workspace: IntegerBuffer,
) -> bool:
    """Bind and independently replay one proposed cubic maximal order."""
    if (
        len(proof) != _CUBIC_ANALYSIS_PROOF_CAPACITY
        or len(coefficients) != 4
        or len(projection) != 64
        or len(polynomial) != 4
        or len(numerator) != 9
        or len(primes) != _CUBIC_MAX_ORDER_WITNESSES
        or len(radical_dimensions) != _CUBIC_MAX_ORDER_WITNESSES
        or len(radicals) != 9 * _CUBIC_MAX_ORDER_WITNESSES
        or len(selectors) != 3 * _CUBIC_MAX_ORDER_WITNESSES
        or len(checker_workspace) != _CUBIC_ROUND2_WORKSPACE_LENGTH
    ):
        return False
    component_count = proof[3]
    entry_count = proof[6]
    witness_count = proof[7]
    if (
        proof[0] != 0
        or proof[1] != 1000
        or proof[2] != 3
        or component_count < 1
        or component_count != projection[10]
        or proof[4] != component_count
        or proof[5] != witness_count
        or witness_count < 0
        or witness_count > _CUBIC_MAX_ORDER_WITNESSES
        or entry_count < 18 + 3 * component_count
        or entry_count + 8 > len(proof)
    ):
        return False
    witness_count_u64: uint64 = 0
    while witness_count_u64 < witness_count:
        witness_count_u64 += 1

    cursor: uint64 = 8
    if (
        proof[cursor] != 1
        or proof[cursor + 1] != projection[5]
        or proof[cursor + 2] != projection[6]
        or proof[cursor + 3] != projection[7]
        or proof[cursor + 4] != projection[8]
    ):
        return False
    cursor += 5
    coefficient: uint64 = 0
    while coefficient < 4:
        if proof[cursor + coefficient] != coefficients[coefficient]:
            return False
        polynomial[coefficient] = coefficients[coefficient]
        coefficient += 1
    cursor += 4

    absolute_discriminant = projection[7]
    if absolute_discriminant < 0:
        absolute_discriminant = -absolute_discriminant
    component_product = 1
    required_witnesses: uint64 = 0
    component: uint64 = 0
    while component < component_count:
        prime = proof[cursor]
        exponent = proof[cursor + 1]
        state = proof[cursor + 2]
        projected = 11 + 3 * component
        if (
            prime != projection[projected]
            or exponent != projection[projected + 1]
            or state != projection[projected + 2]
            or exponent < 1
            or state != 0
            or prime < 2
            or prime > 1000003
        ):
            return False
        divisor = 2
        while divisor * divisor <= prime:
            if prime % divisor == 0:
                return False
            divisor += 1
        previous: uint64 = 0
        while previous < component:
            previous_prime = proof[cursor - 3 * (component - previous)]
            common, _left, _right = _cubic_extended_gcd(prime, previous_prime)
            if common != 1:
                return False
            previous += 1
        power: uint64 = 0
        factor = 1
        while power < exponent:
            factor *= prime
            power += 1
        component_product *= factor
        if exponent >= 2:
            required_witnesses += 1
        cursor += 3
        component += 1
    if (
        component_product != absolute_discriminant
        or required_witnesses != witness_count
    ):
        return False

    required_component: uint64 = 0
    witness: uint64 = 0
    while witness < witness_count_u64:
        while (
            required_component < component_count
            and proof[17 + 3 * required_component + 1] < 2
        ):
            required_component += 1
        if required_component >= component_count:
            return False
        prime = proof[cursor]
        dimension = proof[cursor + 1]
        if (
            prime != proof[17 + 3 * required_component]
            or dimension < 0
            or dimension > 3
        ):
            return False
        primes[witness] = prime
        radical_dimensions[witness] = dimension
        cursor += 2
        radical_entry: uint64 = 0
        while radical_entry < 9:
            radicals[9 * witness + radical_entry] = 0
            radical_entry += 1
        radical_entry = 0
        while radical_entry < 3 * dimension:
            value = proof[cursor + radical_entry]
            if value < 0 or value >= prime:
                return False
            radicals[9 * witness + radical_entry] = value
            radical_entry += 1
        cursor += radical_entry
        selector: uint64 = 0
        while selector < 3:
            selected = proof[cursor + selector]
            if selected < 0 or selected >= 9:
                return False
            earlier: uint64 = 0
            while earlier < selector:
                if proof[cursor + earlier] == selected:
                    return False
                earlier += 1
            selectors[3 * witness + selector] = selected
            selector += 1
        cursor += 3
        required_component += 1
        witness += 1

    if cursor + 9 != entry_count + 8:
        return False
    basis_start = 11 + 3 * component_count
    content = projection[5]
    determinant = 1
    row: uint64 = 0
    while row < 3:
        diagonal = proof[cursor + 3 * row + row]
        if diagonal <= 0:
            return False
        determinant *= diagonal
        column: uint64 = 0
        while column < 3:
            value = proof[cursor + 3 * row + column]
            if value != projection[basis_start + 3 * row + column]:
                return False
            if column < row and value != 0:
                return False
            if column > row:
                later_diagonal = proof[cursor + 3 * column + column]
                if value < 0 or value >= later_diagonal:
                    return False
            numerator[3 * row + column] = value
            common, _left, _right = _cubic_extended_gcd(content, value)
            content = common
            column += 1
        row += 1
    denominator = projection[5]
    if (
        content != 1
        or denominator * denominator * denominator != projection[6] * determinant
        or projection[8] * projection[6] * projection[6] != projection[7]
    ):
        return False
    return packed_field_analysis_fixed_points_are_valid(
        checker_workspace,
        polynomial,
        numerator,
        denominator,
        primes,
        radical_dimensions,
        radicals,
        selectors,
        projection[7],
        3,
        witness_count_u64,
    )


@native
def _cubic_workspace_hnf3(
    workspace: IntegerBuffer,
    base: uint64,
    row_count: uint64,
) -> bool:
    """Put a full-rank `row_count` by 3 row lattice in exact HNF in place."""
    if row_count < 3 or row_count > 9 or base + 3 * row_count > len(workspace):
        return False
    pivot: uint64 = 0
    column: uint64 = 0
    while column < 3:
        found = row_count
        row = pivot
        while row < row_count and found == row_count:
            if workspace[base + 3 * row + column] != 0:
                found = row
            row += 1
        if found == row_count:
            return False
        if found != pivot:
            entry: uint64 = 0
            while entry < 3:
                left_index = base + 3 * pivot + entry
                right_index = base + 3 * found + entry
                saved = workspace[left_index]
                workspace[left_index] = workspace[right_index]
                workspace[right_index] = saved
                entry += 1

        row = pivot + 1
        while row < row_count:
            while workspace[base + 3 * row + column] != 0:
                pivot_value = workspace[base + 3 * pivot + column]
                row_value = workspace[base + 3 * row + column]
                common, pivot_multiplier, row_multiplier = _cubic_extended_gcd(
                    pivot_value,
                    row_value,
                )
                if common <= 0:
                    return False
                old_pivot_zero = workspace[base + 3 * pivot]
                old_pivot_one = workspace[base + 3 * pivot + 1]
                old_pivot_two = workspace[base + 3 * pivot + 2]
                old_row_zero = workspace[base + 3 * row]
                old_row_one = workspace[base + 3 * row + 1]
                old_row_two = workspace[base + 3 * row + 2]
                workspace[base + 3 * pivot] = (
                    pivot_multiplier * old_pivot_zero + row_multiplier * old_row_zero
                )
                workspace[base + 3 * pivot + 1] = (
                    pivot_multiplier * old_pivot_one + row_multiplier * old_row_one
                )
                workspace[base + 3 * pivot + 2] = (
                    pivot_multiplier * old_pivot_two + row_multiplier * old_row_two
                )
                workspace[base + 3 * row] = (
                    -(row_value // common) * old_pivot_zero
                    + (pivot_value // common) * old_row_zero
                )
                workspace[base + 3 * row + 1] = (
                    -(row_value // common) * old_pivot_one
                    + (pivot_value // common) * old_row_one
                )
                workspace[base + 3 * row + 2] = (
                    -(row_value // common) * old_pivot_two
                    + (pivot_value // common) * old_row_two
                )
            row += 1
        if workspace[base + 3 * pivot + column] < 0:
            entry = 0
            while entry < 3:
                workspace[base + 3 * pivot + entry] = -workspace[
                    base + 3 * pivot + entry
                ]
                entry += 1
        pivot_value = workspace[base + 3 * pivot + column]
        row = 0
        while row < pivot:
            quotient = workspace[base + 3 * row + column] // pivot_value
            entry = 0
            while entry < 3:
                workspace[base + 3 * row + entry] -= (
                    quotient * workspace[base + 3 * pivot + entry]
                )
                entry += 1
            row += 1
        pivot += 1
        column += 1
    return pivot == 3


@native
def _cubic_multiply_coordinates(
    workspace: IntegerBuffer,
    left_zero: int,
    left_one: int,
    left_two: int,
    right_zero: int,
    right_one: int,
    right_two: int,
    output_offset: uint64,
) -> bool:
    """Multiply two elements using the resident order table."""
    if output_offset + 3 > len(workspace):
        return False
    workspace[output_offset] = (
        left_zero
        * (
            right_zero * workspace[_MULTIPLICATION_OFFSET]
            + right_one * workspace[_MULTIPLICATION_OFFSET + 3]
            + right_two * workspace[_MULTIPLICATION_OFFSET + 6]
        )
        + left_one
        * (
            right_zero * workspace[_MULTIPLICATION_OFFSET + 9]
            + right_one * workspace[_MULTIPLICATION_OFFSET + 12]
            + right_two * workspace[_MULTIPLICATION_OFFSET + 15]
        )
        + left_two
        * (
            right_zero * workspace[_MULTIPLICATION_OFFSET + 18]
            + right_one * workspace[_MULTIPLICATION_OFFSET + 21]
            + right_two * workspace[_MULTIPLICATION_OFFSET + 24]
        )
    )
    workspace[output_offset + 1] = (
        left_zero
        * (
            right_zero * workspace[_MULTIPLICATION_OFFSET + 1]
            + right_one * workspace[_MULTIPLICATION_OFFSET + 4]
            + right_two * workspace[_MULTIPLICATION_OFFSET + 7]
        )
        + left_one
        * (
            right_zero * workspace[_MULTIPLICATION_OFFSET + 10]
            + right_one * workspace[_MULTIPLICATION_OFFSET + 13]
            + right_two * workspace[_MULTIPLICATION_OFFSET + 16]
        )
        + left_two
        * (
            right_zero * workspace[_MULTIPLICATION_OFFSET + 19]
            + right_one * workspace[_MULTIPLICATION_OFFSET + 22]
            + right_two * workspace[_MULTIPLICATION_OFFSET + 25]
        )
    )
    workspace[output_offset + 2] = (
        left_zero
        * (
            right_zero * workspace[_MULTIPLICATION_OFFSET + 2]
            + right_one * workspace[_MULTIPLICATION_OFFSET + 5]
            + right_two * workspace[_MULTIPLICATION_OFFSET + 8]
        )
        + left_one
        * (
            right_zero * workspace[_MULTIPLICATION_OFFSET + 11]
            + right_one * workspace[_MULTIPLICATION_OFFSET + 14]
            + right_two * workspace[_MULTIPLICATION_OFFSET + 17]
        )
        + left_two
        * (
            right_zero * workspace[_MULTIPLICATION_OFFSET + 20]
            + right_one * workspace[_MULTIPLICATION_OFFSET + 23]
            + right_two * workspace[_MULTIPLICATION_OFFSET + 26]
        )
    )
    return True


@native
def _cubic_coordinate_norm(
    workspace: IntegerBuffer,
    zero: int,
    one: int,
    two: int,
) -> int:
    """Return the exact determinant of multiplication by one order element."""
    m00 = zero * workspace[0] + one * workspace[9] + two * workspace[18]
    m01 = zero * workspace[1] + one * workspace[10] + two * workspace[19]
    m02 = zero * workspace[2] + one * workspace[11] + two * workspace[20]
    m10 = zero * workspace[3] + one * workspace[12] + two * workspace[21]
    m11 = zero * workspace[4] + one * workspace[13] + two * workspace[22]
    m12 = zero * workspace[5] + one * workspace[14] + two * workspace[23]
    m20 = zero * workspace[6] + one * workspace[15] + two * workspace[24]
    m21 = zero * workspace[7] + one * workspace[16] + two * workspace[25]
    m22 = zero * workspace[8] + one * workspace[17] + two * workspace[26]
    return (
        m00 * (m11 * m22 - m12 * m21)
        - m01 * (m10 * m22 - m12 * m20)
        + m02 * (m10 * m21 - m11 * m20)
    )


@native
def _cubic_norm_form_value(
    workspace: IntegerBuffer,
    zero: int,
    one: int,
    two: int,
) -> int:
    """Evaluate the authenticated resident ternary cubic norm form."""
    zero_square = zero * zero
    one_square = one * one
    two_square = two * two
    return (
        workspace[_NORM_FORM_OFFSET] * zero_square * zero
        + workspace[_NORM_FORM_OFFSET + 1] * zero_square * one
        + workspace[_NORM_FORM_OFFSET + 2] * zero * one_square
        + workspace[_NORM_FORM_OFFSET + 3] * one_square * one
        + workspace[_NORM_FORM_OFFSET + 4] * zero_square * two
        + workspace[_NORM_FORM_OFFSET + 5] * zero * two_square
        + workspace[_NORM_FORM_OFFSET + 6] * two_square * two
        + workspace[_NORM_FORM_OFFSET + 7] * one_square * two
        + workspace[_NORM_FORM_OFFSET + 8] * one * two_square
        + workspace[_NORM_FORM_OFFSET + 9] * zero * one * two
    )


@native
def _cubic_ideal_product(
    workspace: IntegerBuffer,
    left_offset: uint64,
    right_offset: uint64,
    output_offset: uint64,
) -> bool:
    """Multiply two rank-three order lattices and retain their exact HNF."""
    left_row: uint64 = 0
    generated: uint64 = 0
    while left_row < 3:
        right_row: uint64 = 0
        while right_row < 3:
            if not _cubic_multiply_coordinates(
                workspace,
                workspace[left_offset + 3 * left_row],
                workspace[left_offset + 3 * left_row + 1],
                workspace[left_offset + 3 * left_row + 2],
                workspace[right_offset + 3 * right_row],
                workspace[right_offset + 3 * right_row + 1],
                workspace[right_offset + 3 * right_row + 2],
                _HNF_SCRATCH_OFFSET + 3 * generated,
            ):
                return False
            generated += 1
            right_row += 1
        left_row += 1
    if not _cubic_workspace_hnf3(workspace, _HNF_SCRATCH_OFFSET, 9):
        return False
    entry: uint64 = 0
    while entry < 9:
        workspace[output_offset + entry] = workspace[_HNF_SCRATCH_OFFSET + entry]
        entry += 1
    return True


@native
def _cubic_lattice_contains(
    workspace: IntegerBuffer,
    basis_offset: uint64,
    zero: int,
    one: int,
    two: int,
) -> bool:
    """Test membership in one upper-triangular full-rank row HNF."""
    diagonal_zero = workspace[basis_offset]
    diagonal_one = workspace[basis_offset + 4]
    diagonal_two = workspace[basis_offset + 8]
    if diagonal_zero <= 0 or diagonal_one <= 0 or diagonal_two <= 0:
        return False
    coefficient_zero = zero // diagonal_zero
    if coefficient_zero * diagonal_zero != zero:
        return False
    remaining_one = one - coefficient_zero * workspace[basis_offset + 1]
    coefficient_one = remaining_one // diagonal_one
    if coefficient_one * diagonal_one != remaining_one:
        return False
    remaining_two = (
        two
        - coefficient_zero * workspace[basis_offset + 2]
        - coefficient_one * workspace[basis_offset + 5]
    )
    coefficient_two = remaining_two // diagonal_two
    return coefficient_two * diagonal_two == remaining_two


@native
def _cubic_ceil_sqrt(value: int) -> int:
    if value < 0:
        return -1
    if value < 2:
        return value
    bits: uint64 = 0
    probe = value
    while probe > 0:
        probe //= 2
        bits += 1
    current = 1
    shift: uint64 = 0
    while shift < (bits + 1) // 2:
        current *= 2
        shift += 1
    following = (current + value // current) // 2
    while following < current:
        current = following
        following = (current + value // current) // 2
    if current * current < value:
        current += 1
    return current


@native
def _cubic_floor_sqrt(value: int) -> int:
    ceiling = _cubic_ceil_sqrt(value)
    if ceiling < 0:
        return -1
    if ceiling * ceiling > value:
        ceiling -= 1
    return ceiling


@native
def _cubic_dyadic_ceiling_quotient(numerator: int, denominator: int) -> int:
    return -((-numerator) // denominator)


@native
def _cubic_dyadic_multiply(
    left_lower: int,
    left_upper: int,
    right_lower: int,
    right_upper: int,
    scale: int,
) -> tuple[int, int]:
    first = left_lower * right_lower
    lower_product = first
    upper_product = first
    second = left_lower * right_upper
    if second < lower_product:
        lower_product = second
    if second > upper_product:
        upper_product = second
    third = left_upper * right_lower
    if third < lower_product:
        lower_product = third
    if third > upper_product:
        upper_product = third
    fourth = left_upper * right_upper
    if fourth < lower_product:
        lower_product = fourth
    if fourth > upper_product:
        upper_product = fourth
    return (
        lower_product // scale,
        _cubic_dyadic_ceiling_quotient(upper_product, scale),
    )


@native
def _cubic_dyadic_divide_positive(
    numerator_lower: int,
    numerator_upper: int,
    denominator_lower: int,
    denominator_upper: int,
    scale: int,
) -> tuple[int, int]:
    if denominator_lower <= 0 or denominator_upper < denominator_lower:
        return (1, 0)
    reciprocal_lower = (scale * scale) // denominator_upper
    reciprocal_upper = _cubic_dyadic_ceiling_quotient(
        scale * scale,
        denominator_lower,
    )
    return _cubic_dyadic_multiply(
        numerator_lower,
        numerator_upper,
        reciprocal_lower,
        reciprocal_upper,
        scale,
    )


@native
def _cubic_atanh_log_bounds(
    numerator: int,
    denominator: int,
    scale: int,
) -> tuple[int, int]:
    """Enclose `2*atanh(numerator/denominator)` at one exact scale."""
    if numerator < 0 or denominator <= numerator or scale <= 0:
        return (1, 0)
    if numerator == 0:
        return (0, 0)
    lower = 0
    upper = 0
    numerator_power = numerator
    denominator_power = denominator
    numerator_square = numerator * numerator
    denominator_square = denominator * denominator
    index: uint64 = 0
    while index < 4096:
        odd = 2 * index + 1
        term_denominator = odd * denominator_power
        term_numerator = 2 * scale * numerator_power
        lower += term_numerator // term_denominator
        upper += _cubic_dyadic_ceiling_quotient(
            term_numerator,
            term_denominator,
        )
        next_numerator_power = numerator_power * numerator_square
        next_denominator_power = denominator_power * denominator_square
        tail_numerator = 2 * scale * next_numerator_power * denominator_square
        tail_denominator = (
            (odd + 2) * next_denominator_power * (denominator_square - numerator_square)
        )
        if tail_numerator < tail_denominator:
            return (lower, upper + 1)
        numerator_power = next_numerator_power
        denominator_power = next_denominator_power
        index += 1
    return (1, 0)


@native
def _cubic_log_positive_rational_bounds(
    numerator: int,
    denominator: int,
    scale: int,
) -> tuple[int, int]:
    """Enclose the logarithm of one positive exact rational."""
    if numerator <= 0 or denominator <= 0 or scale <= 0:
        return (1, 0)
    exponent = 0
    normalized_numerator = numerator
    normalized_denominator = denominator
    while normalized_numerator >= 2 * normalized_denominator:
        normalized_denominator *= 2
        exponent += 1
    while normalized_numerator < normalized_denominator:
        normalized_numerator *= 2
        exponent -= 1
    normalized_lower, normalized_upper = _cubic_atanh_log_bounds(
        normalized_numerator - normalized_denominator,
        normalized_numerator + normalized_denominator,
        scale,
    )
    log_two_lower, log_two_upper = _cubic_atanh_log_bounds(1, 3, scale)
    if normalized_upper < normalized_lower or log_two_upper < log_two_lower:
        return (1, 0)
    if exponent >= 0:
        return (
            normalized_lower + exponent * log_two_lower,
            normalized_upper + exponent * log_two_upper,
        )
    return (
        normalized_lower + exponent * log_two_upper,
        normalized_upper + exponent * log_two_lower,
    )


@native
def _cubic_log_interval_bounds(
    lower_numerator: int,
    upper_numerator: int,
    denominator: int,
    scale: int,
) -> tuple[int, int]:
    if lower_numerator <= 0 or upper_numerator < lower_numerator:
        return (1, 0)
    lower_bound, ignored_upper = _cubic_log_positive_rational_bounds(
        lower_numerator,
        denominator,
        scale,
    )
    ignored_lower, upper_bound = _cubic_log_positive_rational_bounds(
        upper_numerator,
        denominator,
        scale,
    )
    if ignored_upper < lower_bound or upper_bound < ignored_lower:
        return (1, 0)
    return (lower_bound, upper_bound)


@native
def _cubic_arctan_reciprocal_bounds(
    denominator: int,
    scale: int,
) -> tuple[int, int]:
    """Enclose `atan(1/denominator)` by its alternating series."""
    if denominator <= 1 or scale <= 0:
        return (1, 0)
    lower = 0
    upper = 0
    power = denominator
    denominator_square = denominator * denominator
    index: uint64 = 0
    sign = 1
    while index < 80:
        term_denominator = (2 * index + 1) * power
        floor_term = scale // term_denominator
        ceiling_term = _cubic_dyadic_ceiling_quotient(
            scale,
            term_denominator,
        )
        if sign > 0:
            lower += floor_term
            upper += ceiling_term
        else:
            lower -= ceiling_term
            upper -= floor_term
        power *= denominator_square
        sign = -sign
        index += 1
    remainder_denominator = (2 * index + 1) * power
    remainder_upper = _cubic_dyadic_ceiling_quotient(
        scale,
        remainder_denominator,
    )
    if sign > 0:
        upper += remainder_upper
    else:
        lower -= remainder_upper
    return (lower, upper)


@native
def _cubic_log_two_pi_bounds(scale: int) -> tuple[int, int]:
    atan_five_lower, atan_five_upper = _cubic_arctan_reciprocal_bounds(
        5,
        scale,
    )
    atan_239_lower, atan_239_upper = _cubic_arctan_reciprocal_bounds(
        239,
        scale,
    )
    pi_lower = 16 * atan_five_lower - 4 * atan_239_upper
    pi_upper = 16 * atan_five_upper - 4 * atan_239_lower
    log_pi_lower, log_pi_upper = _cubic_log_interval_bounds(
        pi_lower,
        pi_upper,
        scale,
        scale,
    )
    log_two_lower, log_two_upper = _cubic_atanh_log_bounds(1, 3, scale)
    if log_pi_upper < log_pi_lower or log_two_upper < log_two_lower:
        return (1, 0)
    return (
        log_two_lower + log_pi_lower,
        log_two_upper + log_pi_upper,
    )


@native
def _cubic_scaled_polynomial_value(
    coefficients: IntegerBuffer,
    argument: int,
    scale: int,
) -> int:
    argument_square = argument * argument
    return (
        argument_square * argument
        + coefficients[2] * argument_square * scale
        + coefficients[1] * argument * scale * scale
        + coefficients[0] * scale * scale * scale
    )


@native
def _cubic_regulator_bounds(
    coefficients: IntegerBuffer,
    denominator: int,
    basis_zero_zero: int,
    basis_zero_one: int,
    basis_zero_two: int,
    basis_one_one: int,
    basis_one_two: int,
    basis_two_two: int,
    unit_zero: int,
    unit_one: int,
    unit_two: int,
    scale: int,
) -> tuple[int, int]:
    """Enclose the rank-one regulator of one authenticated cubic unit."""
    root_bound = 1
    coefficient_index: uint64 = 0
    while coefficient_index < 3:
        candidate = coefficients[coefficient_index]
        if candidate < 0:
            candidate = -candidate
        if candidate + 1 > root_bound:
            root_bound = candidate + 1
        coefficient_index += 1
    root_lower = -root_bound * scale
    root_upper = root_bound * scale
    lower_value = _cubic_scaled_polynomial_value(
        coefficients,
        root_lower,
        scale,
    )
    upper_value = _cubic_scaled_polynomial_value(
        coefficients,
        root_upper,
        scale,
    )
    if lower_value >= 0 or upper_value <= 0:
        return (1, 0)
    bisections: uint64 = 0
    while root_upper - root_lower > 1 and bisections < 256:
        middle = (root_lower + root_upper) // 2
        middle_value = _cubic_scaled_polynomial_value(
            coefficients,
            middle,
            scale,
        )
        if middle_value < 0:
            root_lower = middle
        elif middle_value > 0:
            root_upper = middle
        else:
            root_lower = middle
            root_upper = middle
        bisections += 1
    if root_upper - root_lower > 1:
        return (1, 0)

    raw_zero = unit_zero * basis_zero_zero
    raw_one = unit_zero * basis_zero_one + unit_one * basis_one_one
    raw_two = (
        unit_zero * basis_zero_two + unit_one * basis_one_two + unit_two * basis_two_two
    )
    root_square_lower, root_square_upper = _cubic_dyadic_multiply(
        root_lower,
        root_upper,
        root_lower,
        root_upper,
        scale,
    )
    if raw_two >= 0:
        value_lower = raw_two * root_square_lower
        value_upper = raw_two * root_square_upper
    else:
        value_lower = raw_two * root_square_upper
        value_upper = raw_two * root_square_lower
    if raw_one >= 0:
        value_lower += raw_one * root_lower
        value_upper += raw_one * root_upper
    else:
        value_lower += raw_one * root_upper
        value_upper += raw_one * root_lower
    value_lower += raw_zero * scale
    value_upper += raw_zero * scale
    absolute_lower = 0
    absolute_upper = 0
    if value_lower > 0:
        absolute_lower = value_lower
        absolute_upper = value_upper
    elif value_upper < 0:
        absolute_lower = -value_upper
        absolute_upper = -value_lower
    else:
        return (1, 0)
    logarithm_lower, logarithm_upper = _cubic_log_interval_bounds(
        absolute_lower,
        absolute_upper,
        denominator * scale,
        scale,
    )
    if logarithm_lower > 0:
        return (logarithm_lower, logarithm_upper)
    if logarithm_upper < 0:
        return (-logarithm_upper, -logarithm_lower)
    return (1, 0)


@native
def _cubic_bf_tail_bounds(
    endpoints: FmpzMatrix,
    scale: int,
) -> tuple[int, int]:
    """Replay the explicit degree-three Belabas--Friedman tail bound."""
    log_threshold_lower = fmpz_matrix_entry(endpoints, 0, 0)
    log_threshold_upper = fmpz_matrix_entry(endpoints, 1, 0)
    sqrt_threshold_lower = fmpz_matrix_entry(endpoints, 2, 0)
    sqrt_threshold_upper = fmpz_matrix_entry(endpoints, 3, 0)
    log_ninth_lower = fmpz_matrix_entry(endpoints, 4, 0)
    log_ninth_upper = fmpz_matrix_entry(endpoints, 5, 0)
    log_three_threshold_lower = fmpz_matrix_entry(endpoints, 8, 0)
    log_three_threshold_upper = fmpz_matrix_entry(endpoints, 9, 0)
    log_discriminant_lower = fmpz_matrix_entry(endpoints, 12, 0)
    log_discriminant_upper = fmpz_matrix_entry(endpoints, 13, 0)
    if (
        log_threshold_lower <= 0
        or sqrt_threshold_lower <= 0
        or log_ninth_lower <= 0
        or log_three_threshold_lower <= 0
        or log_discriminant_lower <= 0
    ):
        return (1, 0)
    sqrt_log_lower = _cubic_floor_sqrt(log_discriminant_lower * scale)
    sqrt_log_upper = _cubic_ceil_sqrt(log_discriminant_upper * scale)
    if sqrt_log_lower <= 0 or sqrt_log_upper < sqrt_log_lower:
        return (1, 0)

    c1_lower = (581 * scale) // 250
    c1_upper = _cubic_dyadic_ceiling_quotient(581 * scale, 250)
    c2_lower = (97 * scale) // 25
    c2_upper = _cubic_dyadic_ceiling_quotient(97 * scale, 25)
    c4_lower = (213 * scale) // 50
    c4_upper = _cubic_dyadic_ceiling_quotient(213 * scale, 50)
    numerator_lower, numerator_upper = _cubic_dyadic_multiply(
        c1_lower,
        c1_upper,
        log_discriminant_lower,
        log_discriminant_upper,
        scale,
    )
    denominator_lower, denominator_upper = _cubic_dyadic_multiply(
        sqrt_threshold_lower,
        sqrt_threshold_upper,
        log_three_threshold_lower,
        log_three_threshold_upper,
        scale,
    )
    a1_lower, a1_upper = _cubic_dyadic_divide_positive(
        numerator_lower,
        numerator_upper,
        denominator_lower,
        denominator_upper,
        scale,
    )
    ratio_lower, ratio_upper = _cubic_dyadic_divide_positive(
        c2_lower,
        c2_upper,
        log_ninth_lower,
        log_ninth_upper,
        scale,
    )
    a2_lower = scale + ratio_lower
    a2_upper = scale + ratio_upper
    ratio_lower, ratio_upper = _cubic_dyadic_divide_positive(
        2 * scale,
        2 * scale,
        sqrt_log_lower,
        sqrt_log_upper,
        scale,
    )
    a3_lower = scale + ratio_lower
    a3_upper = scale + ratio_upper
    a3_square_lower, a3_square_upper = _cubic_dyadic_multiply(
        a3_lower,
        a3_upper,
        a3_lower,
        a3_upper,
        scale,
    )
    main_lower, main_upper = _cubic_dyadic_multiply(
        a2_lower,
        a2_upper,
        a3_square_lower,
        a3_square_upper,
        scale,
    )
    numerator_lower = 2 * c4_lower
    numerator_upper = 2 * c4_upper
    denominator_lower, denominator_upper = _cubic_dyadic_multiply(
        sqrt_threshold_lower,
        sqrt_threshold_upper,
        log_discriminant_lower,
        log_discriminant_upper,
        scale,
    )
    a4_lower, a4_upper = _cubic_dyadic_divide_positive(
        numerator_lower,
        numerator_upper,
        denominator_lower,
        denominator_upper,
        scale,
    )
    return _cubic_dyadic_multiply(
        a1_lower,
        a1_upper,
        main_lower + a4_lower,
        main_upper + a4_upper,
        scale,
    )


@native
def _cubic_bf_finite_bounds(
    workspace: IntegerBuffer,
    values: FmpzMatrix,
    endpoints: FmpzMatrix,
    term_count: uint64,
    value_count: uint64,
    scale: int,
) -> tuple[int, int]:
    """Evaluate the aggregated BF finite prime sum in resident dyadics."""
    log_threshold_lower = fmpz_matrix_entry(endpoints, 0, 0)
    log_threshold_upper = fmpz_matrix_entry(endpoints, 1, 0)
    sqrt_threshold_lower = fmpz_matrix_entry(endpoints, 2, 0)
    sqrt_threshold_upper = fmpz_matrix_entry(endpoints, 3, 0)
    log_ninth_lower = fmpz_matrix_entry(endpoints, 4, 0)
    log_ninth_upper = fmpz_matrix_entry(endpoints, 5, 0)
    sqrt_ninth_lower = fmpz_matrix_entry(endpoints, 6, 0)
    sqrt_ninth_upper = fmpz_matrix_entry(endpoints, 7, 0)
    log_three_threshold_lower = fmpz_matrix_entry(endpoints, 8, 0)
    log_three_threshold_upper = fmpz_matrix_entry(endpoints, 9, 0)
    scale_zero_lower, scale_zero_upper = _cubic_dyadic_multiply(
        sqrt_threshold_lower,
        sqrt_threshold_upper,
        log_threshold_lower,
        log_threshold_upper,
        scale,
    )
    scale_one_lower, scale_one_upper = _cubic_dyadic_multiply(
        sqrt_ninth_lower,
        sqrt_ninth_upper,
        log_ninth_lower,
        log_ninth_upper,
        scale,
    )
    total_lower = 0
    total_upper = 0
    term_index: uint64 = 0
    while term_index < term_count:
        term_base: uint64 = (
            _CUBIC_ANALYTIC_TERM_OFFSET + _CUBIC_ANALYTIC_TERM_STRIDE * term_index
        )
        multiplicity = workspace[term_base]
        scale_index = workspace[term_base + 1]
        norm = workspace[term_base + 2]
        exponent = workspace[term_base + 3]
        value_index: uint64 = 0
        while (
            value_index < value_count
            and fmpz_matrix_entry(values, value_index, 0) != norm
        ):
            value_index += 1
        if value_index == value_count:
            return (1, 0)
        endpoint_offset: uint64 = 4 * value_index
        logarithm_lower = fmpz_matrix_entry(endpoints, endpoint_offset, 0)
        logarithm_upper = fmpz_matrix_entry(endpoints, endpoint_offset + 1, 0)
        root_lower = fmpz_matrix_entry(endpoints, endpoint_offset + 2, 0)
        root_upper = fmpz_matrix_entry(endpoints, endpoint_offset + 3, 0)
        if (
            multiplicity == 0
            or scale_index < 0
            or scale_index > 1
            or norm < 2
            or exponent < 1
            or logarithm_lower <= 0
        ):
            return (1, 0)
        norm_power = 1
        power_index = 0
        while power_index < exponent:
            norm_power *= norm
            power_index += 1
        denominator = exponent * norm_power
        if scale_index == 0:
            first_lower, first_upper = _cubic_dyadic_divide_positive(
                scale_zero_lower,
                scale_zero_upper,
                denominator * scale,
                denominator * scale,
                scale,
            )
        else:
            first_lower, first_upper = _cubic_dyadic_divide_positive(
                scale_one_lower,
                scale_one_upper,
                denominator * scale,
                denominator * scale,
                scale,
            )
        half_power = 1
        power_index = 0
        while power_index < exponent // 2:
            half_power *= norm
            power_index += 1
        if exponent % 2 == 0:
            half_lower = half_power * scale
            half_upper = half_lower
        else:
            half_lower = half_power * root_lower
            half_upper = half_power * root_upper
        second_lower, second_upper = _cubic_dyadic_divide_positive(
            logarithm_lower,
            logarithm_upper,
            half_lower,
            half_upper,
            scale,
        )
        summand_lower = first_lower - second_upper
        summand_upper = first_upper - second_lower
        if multiplicity >= 0:
            summand_lower *= multiplicity
            summand_upper *= multiplicity
        else:
            saved_lower = summand_lower
            summand_lower = summand_upper * multiplicity
            summand_upper = saved_lower * multiplicity
        total_lower += summand_lower
        total_upper += summand_upper
        term_index += 1
    denominator_lower, denominator_upper = _cubic_dyadic_multiply(
        2 * scale,
        2 * scale,
        sqrt_threshold_lower,
        sqrt_threshold_upper,
        scale,
    )
    denominator_lower, denominator_upper = _cubic_dyadic_multiply(
        denominator_lower,
        denominator_upper,
        log_three_threshold_lower,
        log_three_threshold_upper,
        scale,
    )
    multiplier_lower, multiplier_upper = _cubic_dyadic_divide_positive(
        3 * scale,
        3 * scale,
        denominator_lower,
        denominator_upper,
        scale,
    )
    return _cubic_dyadic_multiply(
        multiplier_lower,
        multiplier_upper,
        total_lower,
        total_upper,
        scale,
    )


@native
def _cubic_map_is_multiplicative(
    workspace: IntegerBuffer,
    map_zero: int,
    map_one: int,
    map_two: int,
    modulus: int,
) -> bool:
    """Authenticate one unital map from the resident order to `F_p`."""
    left: uint64 = 0
    while left < 3:
        right: uint64 = 0
        while right < 3:
            image = (
                workspace[(left * 3 + right) * 3] * map_zero
                + workspace[(left * 3 + right) * 3 + 1] * map_one
                + workspace[(left * 3 + right) * 3 + 2] * map_two
            )
            left_image = map_zero
            right_image = map_zero
            if left == 1:
                left_image = map_one
            elif left == 2:
                left_image = map_two
            if right == 1:
                right_image = map_one
            elif right == 2:
                right_image = map_two
            if _cubic_positive_mod(image - left_image * right_image, modulus) != 0:
                return False
            right += 1
        left += 1
    return True


@native
def _cubic_prime_kernel_basis(
    workspace: IntegerBuffer,
    prime: int,
    map_zero: int,
    map_one: int,
    map_two: int,
    output_offset: uint64,
) -> bool:
    """Construct the exact HNF of the kernel of an order map to `F_p`."""
    pivot: uint64 = 0
    pivot_value = _cubic_positive_mod(map_zero, prime)
    if pivot_value == 0:
        pivot = 1
        pivot_value = _cubic_positive_mod(map_one, prime)
    if pivot_value == 0:
        pivot = 2
        pivot_value = _cubic_positive_mod(map_two, prime)
    inverse = _cubic_inverse_mod(pivot_value, prime)
    if inverse == 0 or output_offset + 9 > len(workspace):
        return False
    entry: uint64 = 0
    while entry < 9:
        workspace[output_offset + entry] = 0
        entry += 1
    workspace[output_offset + pivot] = prime
    row: uint64 = 1
    coordinate: uint64 = 0
    while coordinate < 3:
        if coordinate != pivot:
            image = map_zero
            if coordinate == 1:
                image = map_one
            elif coordinate == 2:
                image = map_two
            workspace[output_offset + 3 * row + coordinate] = 1
            workspace[output_offset + 3 * row + pivot] = -_cubic_positive_mod(
                image * inverse,
                prime,
            )
            row += 1
        coordinate += 1
    return _cubic_workspace_hnf3(workspace, output_offset, 3)


@native
def certified_complex_cubic_class_group_v1(
    output: IntegerBuffer,
    coefficients: IntegerBuffer,
    workspace: IntegerBuffer,
    analysis_proof: IntegerBuffer,
    verification_polynomial: IntegerBuffer,
    verification_numerator: IntegerBuffer,
    verification_primes: IntegerBuffer,
    verification_radical_dimensions: IntegerBuffer,
    verification_radicals: IntegerBuffer,
    verification_selectors: IntegerBuffer,
    verification_workspace: IntegerBuffer,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> bool:
    """Certify a complex-cubic class group from its defining polynomial.

    Status `2` means the exact algebraic presentation and the rigorous
    Belabas--Friedman suffix have jointly proved index one under GRH.  Every
    other return is a fail-closed decline and the caller must use the ordinary
    exact path.
    """
    if (
        len(output) != 64
        or len(coefficients) != 4
        or len(workspace) != _CUBIC_WORKSPACE_LENGTH
        or len(analysis_proof) != _CUBIC_ANALYSIS_PROOF_CAPACITY
        or len(verification_polynomial) != 4
        or len(verification_numerator) != 9
        or len(verification_primes) != _CUBIC_MAX_ORDER_WITNESSES
        or len(verification_radical_dimensions) != _CUBIC_MAX_ORDER_WITNESSES
        or len(verification_radicals) != 9 * _CUBIC_MAX_ORDER_WITNESSES
        or len(verification_selectors) != 3 * _CUBIC_MAX_ORDER_WITNESSES
        or len(verification_workspace) != _CUBIC_ROUND2_WORKSPACE_LENGTH
        or coefficients[3] != 1
        or memory_limit < 1048576
        or temporary_limit < 1048576
    ):
        return False
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        polynomial = arena.foreign_resource(fmpz_polynomial, 4)
        coefficient_index: uint64 = 0
        while coefficient_index < 4:
            if not fmpz_polynomial_set_coefficient(
                polynomial,
                coefficient_index,
                coefficients[coefficient_index],
            ):
                return False
            coefficient_index += 1
        if not fmpz_polynomial_seal(polynomial):
            return False
        analysis = arena.foreign_resource(
            number_field_analyze_resource,
            polynomial,
            1,
            1000,
        )
        one_column: uint64 = 1
        if not number_field_analysis_resource_project(
            output,
            analysis,
            len(output),
            one_column,
        ):
            return False
        if not number_field_analysis_resource_project_proof(
            analysis_proof,
            analysis,
            len(analysis_proof),
            one_column,
        ):
            return False
        if not _cubic_analysis_fixed_points_are_valid(
            analysis_proof,
            coefficients,
            output,
            verification_polynomial,
            verification_numerator,
            verification_primes,
            verification_radical_dimensions,
            verification_radicals,
            verification_selectors,
            verification_workspace,
        ):
            return False

        constant = coefficients[0]
        linear = coefficients[1]
        quadratic = coefficients[2]
        equation_discriminant = (
            quadratic * quadratic * linear * linear
            - 4 * linear * linear * linear
            - 4 * quadratic * quadratic * quadratic * constant
            - 27 * constant * constant
            + 18 * quadratic * linear * constant
        )
        if (
            output[0] != 0
            or output[4] != 1
            or output[5] < 1
            or output[6] < 1
            or output[7] != equation_discriminant
            or output[8] * output[6] * output[6] != equation_discriminant
            or output[8] >= -1
            or output[9] != 3
            or output[10] < 1
            or output[10] > 12
        ):
            return False
        order_discriminant = output[8]
        equation_order_index = output[6]
        absolute_discriminant = -order_discriminant
        denominator = output[5]
        component_count = output[10]
        basis_start = 11 + 3 * component_count
        basis_zero_zero = output[basis_start]
        basis_zero_one = output[basis_start + 1]
        basis_zero_two = output[basis_start + 2]
        basis_one_one = output[basis_start + 4]
        basis_one_two = output[basis_start + 5]
        basis_two_two = output[basis_start + 8]
        if (
            basis_zero_zero <= 0
            or basis_one_one <= 0
            or basis_two_two <= 0
            or output[basis_start + 3] != 0
            or output[basis_start + 6] != 0
            or output[basis_start + 7] != 0
            or denominator * denominator * denominator
            != output[6] * basis_zero_zero * basis_one_one * basis_two_two
        ):
            return False

        # Build the exact multiplication table in the projected integral
        # basis.  Products are first reduced in the defining power basis and
        # then solved through the canonical upper-triangular order basis.
        left_basis: uint64 = 0
        while left_basis < 3:
            right_basis: uint64 = 0
            while right_basis < 3:
                left_zero = output[basis_start + 3 * left_basis]
                left_one = output[basis_start + 3 * left_basis + 1]
                left_two = output[basis_start + 3 * left_basis + 2]
                right_zero = output[basis_start + 3 * right_basis]
                right_one = output[basis_start + 3 * right_basis + 1]
                right_two = output[basis_start + 3 * right_basis + 2]
                raw_zero = left_zero * right_zero
                raw_one = left_zero * right_one + left_one * right_zero
                raw_two = (
                    left_zero * right_two + left_one * right_one + left_two * right_zero
                )
                raw_three = left_one * right_two + left_two * right_one
                raw_four = left_two * right_two
                reduced_zero = (
                    raw_zero - constant * raw_three + quadratic * constant * raw_four
                )
                reduced_one = (
                    raw_one
                    - linear * raw_three
                    + (quadratic * linear - constant) * raw_four
                )
                reduced_two = (
                    raw_two
                    - quadratic * raw_three
                    + (quadratic * quadratic - linear) * raw_four
                )
                if (
                    reduced_zero % denominator != 0
                    or reduced_one % denominator != 0
                    or reduced_two % denominator != 0
                ):
                    return False
                target_zero = reduced_zero // denominator
                target_one = reduced_one // denominator
                target_two = reduced_two // denominator
                coordinate_zero = target_zero // basis_zero_zero
                if coordinate_zero * basis_zero_zero != target_zero:
                    return False
                remaining_one = target_one - coordinate_zero * basis_zero_one
                coordinate_one = remaining_one // basis_one_one
                if coordinate_one * basis_one_one != remaining_one:
                    return False
                remaining_two = (
                    target_two
                    - coordinate_zero * basis_zero_two
                    - coordinate_one * basis_one_two
                )
                coordinate_two = remaining_two // basis_two_two
                if coordinate_two * basis_two_two != remaining_two:
                    return False
                table_offset = (left_basis * 3 + right_basis) * 3
                workspace[table_offset] = coordinate_zero
                workspace[table_offset + 1] = coordinate_one
                workspace[table_offset + 2] = coordinate_two
                right_basis += 1
            left_basis += 1

        # Express 1 in the integral basis and authenticate it against every
        # table row.  This avoids assuming that a canonical Round-2 basis
        # begins with the identity.
        identity_zero = denominator // basis_zero_zero
        if identity_zero * basis_zero_zero != denominator:
            return False
        identity_one = (-identity_zero * basis_zero_one) // basis_one_one
        if identity_zero * basis_zero_one + identity_one * basis_one_one != 0:
            return False
        identity_two = (
            -identity_zero * basis_zero_two - identity_one * basis_one_two
        ) // basis_two_two
        if (
            identity_zero * basis_zero_two
            + identity_one * basis_one_two
            + identity_two * basis_two_two
            != 0
        ):
            return False
        workspace[_IDENTITY_OFFSET] = identity_zero
        workspace[_IDENTITY_OFFSET + 1] = identity_one
        workspace[_IDENTITY_OFFSET + 2] = identity_two
        basis_index: uint64 = 0
        while basis_index < 3:
            basis_coordinate_zero = 0
            basis_coordinate_one = 0
            basis_coordinate_two = 0
            if basis_index == 0:
                basis_coordinate_zero = 1
            elif basis_index == 1:
                basis_coordinate_one = 1
            else:
                basis_coordinate_two = 1
            if not _cubic_multiply_coordinates(
                workspace,
                identity_zero,
                identity_one,
                identity_two,
                basis_coordinate_zero,
                basis_coordinate_one,
                basis_coordinate_two,
                _MAP_SCRATCH_OFFSET,
            ):
                return False
            if (
                workspace[_MAP_SCRATCH_OFFSET] != basis_coordinate_zero
                or workspace[_MAP_SCRATCH_OFFSET + 1] != basis_coordinate_one
                or workspace[_MAP_SCRATCH_OFFSET + 2] != basis_coordinate_two
            ):
                return False
            basis_index += 1

        # Expand the determinant norm into its ten homogeneous cubic
        # coefficients once.  Polarization at exact integral points is much
        # cheaper than reconstructing a 3-by-3 determinant for every relation
        # or unit candidate, and the final independent point binds the compact
        # form back to the resident multiplication table.
        norm_zero = _cubic_coordinate_norm(workspace, 1, 0, 0)
        norm_one = _cubic_coordinate_norm(workspace, 0, 1, 0)
        norm_two = _cubic_coordinate_norm(workspace, 0, 0, 1)
        norm_zero_one_plus = _cubic_coordinate_norm(workspace, 1, 1, 0)
        norm_zero_one_minus = _cubic_coordinate_norm(workspace, 1, -1, 0)
        norm_zero_two_plus = _cubic_coordinate_norm(workspace, 1, 0, 1)
        norm_zero_two_minus = _cubic_coordinate_norm(workspace, 1, 0, -1)
        norm_one_two_plus = _cubic_coordinate_norm(workspace, 0, 1, 1)
        norm_one_two_minus = _cubic_coordinate_norm(workspace, 0, 1, -1)
        zero_zero_one_numerator = norm_zero_one_plus - norm_zero_one_minus
        zero_one_one_numerator = norm_zero_one_plus + norm_zero_one_minus
        zero_zero_two_numerator = norm_zero_two_plus - norm_zero_two_minus
        zero_two_two_numerator = norm_zero_two_plus + norm_zero_two_minus
        one_one_two_numerator = norm_one_two_plus - norm_one_two_minus
        one_two_two_numerator = norm_one_two_plus + norm_one_two_minus
        if (
            zero_zero_one_numerator % 2 != 0
            or zero_one_one_numerator % 2 != 0
            or zero_zero_two_numerator % 2 != 0
            or zero_two_two_numerator % 2 != 0
            or one_one_two_numerator % 2 != 0
            or one_two_two_numerator % 2 != 0
        ):
            return False
        workspace[_NORM_FORM_OFFSET] = norm_zero
        workspace[_NORM_FORM_OFFSET + 1] = zero_zero_one_numerator // 2 - norm_one
        workspace[_NORM_FORM_OFFSET + 2] = zero_one_one_numerator // 2 - norm_zero
        workspace[_NORM_FORM_OFFSET + 3] = norm_one
        workspace[_NORM_FORM_OFFSET + 4] = zero_zero_two_numerator // 2 - norm_two
        workspace[_NORM_FORM_OFFSET + 5] = zero_two_two_numerator // 2 - norm_zero
        workspace[_NORM_FORM_OFFSET + 6] = norm_two
        workspace[_NORM_FORM_OFFSET + 7] = one_one_two_numerator // 2 - norm_two
        workspace[_NORM_FORM_OFFSET + 8] = one_two_two_numerator // 2 - norm_one
        norm_all_one = _cubic_coordinate_norm(workspace, 1, 1, 1)
        workspace[_NORM_FORM_OFFSET + 9] = norm_all_one
        norm_coefficient_index: uint64 = 0
        while norm_coefficient_index < 9:
            workspace[_NORM_FORM_OFFSET + 9] -= workspace[
                _NORM_FORM_OFFSET + norm_coefficient_index
            ]
            norm_coefficient_index += 1
        if _cubic_norm_form_value(workspace, 2, -1, 1) != (
            _cubic_coordinate_norm(workspace, 2, -1, 1)
        ):
            return False

        sqrt_discriminant = _cubic_ceil_sqrt(absolute_discriminant)
        if sqrt_discriminant < 1:
            return False
        # For a complex cubic, Minkowski's constant is 8/(9*pi).  The
        # classical lower bound pi > 28/9 gives 8/(9*pi) < 2/7.  Hence every
        # ideal class has an integral representative below this purely
        # integral conservative envelope.  `sqrt_discriminant` is itself an
        # upper bound, so no floating-point approximation enters the proof.
        generator_bound = (2 * sqrt_discriminant + 6) // 7
        if generator_bound < 2 or generator_bound > 257:
            return False

        factor_count: uint64 = 0
        group_count: uint64 = 0
        prime = 2
        while prime <= generator_bound:
            prime_is_prime = True
            divisor = 2
            while divisor * divisor <= prime:
                if prime % divisor == 0:
                    prime_is_prime = False
                divisor += 1
            if prime_is_prime:
                map_count: uint64 = 0
                map_entry: uint64 = 0
                while map_entry < 9:
                    workspace[_MAP_SCRATCH_OFFSET + map_entry] = 0
                    map_entry += 1
                if denominator % prime != 0:
                    inverse_denominator = _cubic_inverse_mod(denominator, prime)
                    if inverse_denominator == 0:
                        return False
                    root = 0
                    while root < prime:
                        root_square = _cubic_positive_mod(root * root, prime)
                        root_cube = _cubic_positive_mod(root_square * root, prime)
                        polynomial_value = _cubic_positive_mod(
                            constant
                            + linear * root
                            + quadratic * root_square
                            + root_cube,
                            prime,
                        )
                        if polynomial_value == 0:
                            if map_count >= 3:
                                return False
                            map_zero = _cubic_positive_mod(
                                (
                                    basis_zero_zero
                                    + basis_zero_one * root
                                    + basis_zero_two * root_square
                                )
                                * inverse_denominator,
                                prime,
                            )
                            map_one = _cubic_positive_mod(
                                (basis_one_one * root + basis_one_two * root_square)
                                * inverse_denominator,
                                prime,
                            )
                            map_two = _cubic_positive_mod(
                                basis_two_two * root_square * inverse_denominator,
                                prime,
                            )
                            if not _cubic_map_is_multiplicative(
                                workspace,
                                map_zero,
                                map_one,
                                map_two,
                                prime,
                            ):
                                return False
                            map_base: uint64 = _MAP_SCRATCH_OFFSET + 3 * map_count
                            workspace[map_base] = map_zero
                            workspace[map_base + 1] = map_one
                            workspace[map_base + 2] = map_two
                            map_count += 1
                        root += 1
                else:
                    identity_pivot: uint64 = 0
                    while (
                        identity_pivot < 3
                        and _cubic_positive_mod(
                            workspace[_IDENTITY_OFFSET + identity_pivot],
                            prime,
                        )
                        == 0
                    ):
                        identity_pivot += 1
                    if identity_pivot == 3:
                        return False
                    identity_pivot_value = _cubic_positive_mod(
                        workspace[_IDENTITY_OFFSET + identity_pivot],
                        prime,
                    )
                    identity_inverse = _cubic_inverse_mod(
                        identity_pivot_value,
                        prime,
                    )
                    if identity_inverse == 0:
                        return False
                    first_free: uint64 = 0
                    while first_free == identity_pivot:
                        first_free += 1
                    second_free: uint64 = first_free + 1
                    while second_free == identity_pivot:
                        second_free += 1
                    first_value = 0
                    while first_value < prime:
                        second_value = 0
                        while second_value < prime:
                            map_zero = 0
                            map_one = 0
                            map_two = 0
                            if first_free == 0:
                                map_zero = first_value
                            elif first_free == 1:
                                map_one = first_value
                            else:
                                map_two = first_value
                            if second_free == 0:
                                map_zero = second_value
                            elif second_free == 1:
                                map_one = second_value
                            else:
                                map_two = second_value
                            identity_sum = (
                                identity_zero * map_zero
                                + identity_one * map_one
                                + identity_two * map_two
                            )
                            pivot_image = _cubic_positive_mod(
                                (1 - identity_sum) * identity_inverse,
                                prime,
                            )
                            if identity_pivot == 0:
                                map_zero = pivot_image
                            elif identity_pivot == 1:
                                map_one = pivot_image
                            else:
                                map_two = pivot_image
                            if _cubic_map_is_multiplicative(
                                workspace,
                                map_zero,
                                map_one,
                                map_two,
                                prime,
                            ):
                                if map_count >= 3:
                                    return False
                                map_base = _MAP_SCRATCH_OFFSET + 3 * map_count
                                workspace[map_base] = map_zero
                                workspace[map_base + 1] = map_one
                                workspace[map_base + 2] = map_two
                                map_count += 1
                            second_value += 1
                        first_value += 1

                if map_count > 0:
                    if (
                        group_count >= _CUBIC_MAX_GROUPS
                        or factor_count + map_count + 1 > _CUBIC_MAX_FACTORS
                    ):
                        return False
                    group_base: uint64 = _GROUP_OFFSET + _GROUP_STRIDE * group_count
                    group_factor_start = factor_count
                    map_index: uint64 = 0
                    while map_index < map_count:
                        factor_base: uint64 = (
                            _FACTOR_OFFSET + _FACTOR_STRIDE * factor_count
                        )
                        map_base: uint64 = _MAP_SCRATCH_OFFSET + 3 * map_index
                        ramification = 1
                        if map_count == 1 and absolute_discriminant % prime == 0:
                            ramification = 3
                        elif map_count == 2:
                            ramification = 0
                        workspace[factor_base] = prime
                        workspace[factor_base + 1] = ramification
                        workspace[factor_base + 2] = 1
                        workspace[factor_base + 3] = workspace[map_base]
                        workspace[factor_base + 4] = workspace[map_base + 1]
                        workspace[factor_base + 5] = workspace[map_base + 2]
                        workspace[factor_base + 6] = 1
                        workspace[factor_base + 7] = group_count
                        workspace[factor_base + 8] = 0
                        workspace[factor_base + 9] = 0
                        power_base: uint64 = (
                            _POWER_OFFSET + factor_count * _CUBIC_MAX_POWERS * 9
                        )
                        if not _cubic_prime_kernel_basis(
                            workspace,
                            prime,
                            workspace[map_base],
                            workspace[map_base + 1],
                            workspace[map_base + 2],
                            power_base,
                        ):
                            return False
                        factor_count += 1
                        map_index += 1
                    if map_count == 1 and absolute_discriminant % prime != 0:
                        factor_base = _FACTOR_OFFSET + _FACTOR_STRIDE * factor_count
                        workspace[factor_base] = prime
                        workspace[factor_base + 1] = 1
                        workspace[factor_base + 2] = 2
                        workspace[factor_base + 3] = 0
                        workspace[factor_base + 4] = 0
                        workspace[factor_base + 5] = 0
                        workspace[factor_base + 6] = 0
                        workspace[factor_base + 7] = group_count
                        workspace[factor_base + 8] = 1
                        workspace[factor_base + 9] = 0
                        factor_count += 1
                    group_factor_count = factor_count - group_factor_start
                    workspace[group_base] = prime
                    workspace[group_base + 1] = group_factor_start
                    workspace[group_base + 2] = group_factor_count
                    workspace[group_base + 3] = 0

                    # A two-map ramified cubic has local type (2,1),(1,1).
                    # Determine which kernel has e=2 from exact P^2 membership.
                    if map_count == 2:
                        local_index: uint64 = 0
                        ramification_sum = 0
                        while local_index < 2:
                            local_factor = group_factor_start + local_index
                            factor_base = _FACTOR_OFFSET + _FACTOR_STRIDE * local_factor
                            power_base = (
                                _POWER_OFFSET + local_factor * _CUBIC_MAX_POWERS * 9
                            )
                            if not _cubic_ideal_product(
                                workspace,
                                power_base,
                                power_base,
                                power_base + 9,
                            ):
                                return False
                            workspace[factor_base + 6] = 2
                            ramification = 1
                            if _cubic_lattice_contains(
                                workspace,
                                power_base + 9,
                                prime * identity_zero,
                                prime * identity_one,
                                prime * identity_two,
                            ):
                                ramification = 2
                            workspace[factor_base + 1] = ramification
                            ramification_sum += ramification
                            local_index += 1
                        if ramification_sum != 3:
                            return False
                    group_count += 1
            prime += 1
        if factor_count < 1 or group_count < 1:
            return False

        # Plan exact prime-power storage from the actual smooth norm batch.
        # This is the class-group analogue of PARI's stack discipline: the
        # first bounded pass accounts for space, and only then are the exact
        # ideal powers materialized once for the admission pass.
        relation_box = 2
        group_index: uint64 = 0
        while group_index < group_count:
            group_base: uint64 = _GROUP_OFFSET + _GROUP_STRIDE * group_index
            workspace[group_base + 3] = 0
            group_index += 1
        planning_zero = -relation_box
        while planning_zero <= relation_box:
            planning_one = -relation_box
            while planning_one <= relation_box:
                planning_two = -relation_box
                while planning_two <= relation_box:
                    planning_sign = planning_zero
                    if planning_sign == 0:
                        planning_sign = planning_one
                    if planning_sign == 0:
                        planning_sign = planning_two
                    if planning_sign > 0:
                        planning_norm = _cubic_norm_form_value(
                            workspace,
                            planning_zero,
                            planning_one,
                            planning_two,
                        )
                        if planning_norm < 0:
                            planning_norm = -planning_norm
                        if planning_norm > 1:
                            planning_remaining = planning_norm
                            group_index = 0
                            while group_index < group_count:
                                group_base = _GROUP_OFFSET + _GROUP_STRIDE * group_index
                                rational_prime = workspace[group_base]
                                while planning_remaining % rational_prime == 0:
                                    planning_remaining //= rational_prime
                                group_index += 1
                            if planning_remaining == 1:
                                group_index = 0
                                while group_index < group_count:
                                    group_base = (
                                        _GROUP_OFFSET + _GROUP_STRIDE * group_index
                                    )
                                    rational_prime = workspace[group_base]
                                    valuation_source = planning_norm
                                    planned_valuation = 0
                                    while valuation_source % rational_prime == 0:
                                        valuation_source //= rational_prime
                                        planned_valuation += 1
                                    if planned_valuation > workspace[group_base + 3]:
                                        workspace[group_base + 3] = planned_valuation
                                    group_index += 1
                    planning_two += 1
                planning_one += 1
            planning_zero += 1

        factor_index: uint64 = 0
        while factor_index < factor_count:
            factor_base: uint64 = _FACTOR_OFFSET + _FACTOR_STRIDE * factor_index
            if workspace[factor_base + 8] == 0:
                planned_valuation = 0
                group_index = 0
                while group_index < group_count:
                    group_base = _GROUP_OFFSET + _GROUP_STRIDE * group_index
                    if workspace[factor_base + 7] == group_index:
                        planned_valuation = workspace[group_base + 3]
                    group_index += 1
                if planned_valuation > _CUBIC_MAX_POWERS:
                    return False
                power_base: uint64 = (
                    _POWER_OFFSET + factor_index * _CUBIC_MAX_POWERS * 9
                )
                power_index: uint64 = 1
                while power_index < planned_valuation:
                    if not _cubic_ideal_product(
                        workspace,
                        power_base + 9 * (power_index - 1),
                        power_base,
                        power_base + 9 * power_index,
                    ):
                        return False
                    power_index += 1
                workspace[factor_base + 6] = planned_valuation
            factor_index += 1

        # There are exactly ((2*b+1)^3-1)/2 canonical nonzero candidates.
        # Size the resident matrix for this invocation rather than sending
        # hundreds of known-zero rows through FLINT's HNF machinery.
        relation_capacity: uint64 = group_count + 62
        if relation_capacity > _CUBIC_MAX_RELATIONS:
            return False
        relation_matrix = arena.foreign_resource(
            fmpz_matrix,
            relation_capacity,
            factor_count,
        )
        relation_hnf = arena.foreign_resource(
            fmpz_matrix,
            relation_capacity,
            factor_count,
        )
        relation_count: uint64 = 0
        group_index = 0
        while group_index < group_count:
            factor_index = 0
            while factor_index < factor_count:
                factor_base = _FACTOR_OFFSET + _FACTOR_STRIDE * factor_index
                if workspace[factor_base + 7] == group_index:
                    if not fmpz_matrix_set_entry(
                        relation_matrix,
                        relation_count,
                        factor_index,
                        workspace[factor_base + 1],
                    ):
                        return False
                factor_index += 1
            relation_count += 1
            group_index += 1

        coordinate_zero = -relation_box
        while coordinate_zero <= relation_box:
            coordinate_one = -relation_box
            while coordinate_one <= relation_box:
                coordinate_two = -relation_box
                while coordinate_two <= relation_box:
                    nonzero = (
                        coordinate_zero != 0
                        or coordinate_one != 0
                        or coordinate_two != 0
                    )
                    canonical_sign = coordinate_zero
                    if canonical_sign == 0:
                        canonical_sign = coordinate_one
                    if canonical_sign == 0:
                        canonical_sign = coordinate_two
                    if nonzero and canonical_sign > 0:
                        norm = _cubic_norm_form_value(
                            workspace,
                            coordinate_zero,
                            coordinate_one,
                            coordinate_two,
                        )
                        if norm < 0:
                            norm = -norm
                        if norm > 1:
                            remaining_norm = norm
                            group_index = 0
                            while group_index < group_count:
                                group_base = _GROUP_OFFSET + _GROUP_STRIDE * group_index
                                rational_prime = workspace[group_base]
                                rational_valuation = 0
                                while remaining_norm % rational_prime == 0:
                                    remaining_norm //= rational_prime
                                    rational_valuation += 1
                                workspace[group_base + 3] = rational_valuation
                                group_index += 1
                            if remaining_norm == 1:
                                factor_index: uint64 = 0
                                while factor_index < factor_count:
                                    workspace[_ROW_SCRATCH_OFFSET + factor_index] = 0
                                    factor_index += 1
                                valid_relation = True
                                group_index = 0
                                while valid_relation and group_index < group_count:
                                    group_base = (
                                        _GROUP_OFFSET + _GROUP_STRIDE * group_index
                                    )
                                    rational_valuation = workspace[group_base + 3]
                                    weighted_valuation = 0
                                    if rational_valuation > _CUBIC_MAX_POWERS:
                                        valid_relation = False
                                    factor_index = 0
                                    while factor_index < factor_count:
                                        factor_base = (
                                            _FACTOR_OFFSET
                                            + _FACTOR_STRIDE * factor_index
                                        )
                                        if (
                                            workspace[factor_base + 7] == group_index
                                            and workspace[factor_base + 8] == 0
                                        ):
                                            residue_degree = workspace[factor_base + 2]
                                            power_base = (
                                                _POWER_OFFSET
                                                + factor_index * _CUBIC_MAX_POWERS * 9
                                            )
                                            valuation: uint64 = 0
                                            power_index: uint64 = 0
                                            while (
                                                power_index < rational_valuation
                                                and _cubic_lattice_contains(
                                                    workspace,
                                                    power_base + 9 * power_index,
                                                    coordinate_zero,
                                                    coordinate_one,
                                                    coordinate_two,
                                                )
                                            ):
                                                valuation += 1
                                                power_index += 1
                                            workspace[
                                                _ROW_SCRATCH_OFFSET + factor_index
                                            ] = valuation
                                            weighted_valuation += (
                                                residue_degree * valuation
                                            )
                                        factor_index += 1
                                    missing = rational_valuation - weighted_valuation
                                    factor_index = 0
                                    while factor_index < factor_count:
                                        factor_base = (
                                            _FACTOR_OFFSET
                                            + _FACTOR_STRIDE * factor_index
                                        )
                                        if (
                                            workspace[factor_base + 7] == group_index
                                            and workspace[factor_base + 8] == 1
                                        ):
                                            residue_degree = workspace[factor_base + 2]
                                            if (
                                                missing < 0
                                                or missing % residue_degree != 0
                                            ):
                                                valid_relation = False
                                            else:
                                                auxiliary_valuation = (
                                                    missing // residue_degree
                                                )
                                                workspace[
                                                    _ROW_SCRATCH_OFFSET + factor_index
                                                ] = auxiliary_valuation
                                                weighted_valuation += (
                                                    residue_degree * auxiliary_valuation
                                                )
                                                missing = 0
                                        factor_index += 1
                                    if weighted_valuation != rational_valuation:
                                        valid_relation = False
                                    group_index += 1
                                if valid_relation:
                                    if relation_count >= relation_capacity:
                                        return False
                                    factor_index = 0
                                    while factor_index < factor_count:
                                        if not fmpz_matrix_set_entry(
                                            relation_matrix,
                                            relation_count,
                                            factor_index,
                                            workspace[
                                                _ROW_SCRATCH_OFFSET + factor_index
                                            ],
                                        ):
                                            return False
                                        factor_index += 1
                                    relation_count += 1
                    coordinate_two += 1
                coordinate_one += 1
            coordinate_zero += 1

        if relation_count < factor_count or not fmpz_matrix_hnf_into(
            relation_hnf,
            relation_matrix,
        ):
            return False
        relation_rank: uint64 = 0
        relation_row: uint64 = 0
        while relation_row < relation_capacity:
            row_nonzero = False
            factor_index = 0
            while factor_index < factor_count:
                if (
                    fmpz_matrix_entry(
                        relation_hnf,
                        relation_row,
                        factor_index,
                    )
                    != 0
                ):
                    row_nonzero = True
                factor_index += 1
            if row_nonzero:
                relation_rank += 1
            relation_row += 1
        if relation_rank != factor_count:
            return False
        relation_smith = arena.foreign_resource(
            fmpz_matrix_snf,
            relation_matrix,
        )
        class_number_upper = 1
        invariant_count: uint64 = 0
        factor_index = 0
        while factor_index < factor_count:
            invariant = fmpz_matrix_entry(
                relation_smith,
                factor_index,
                factor_index,
            )
            if invariant < 0:
                invariant = -invariant
            if invariant < 1:
                return False
            if factor_index > 0:
                previous_invariant = fmpz_matrix_entry(
                    relation_smith,
                    factor_index - 1,
                    factor_index - 1,
                )
                if previous_invariant < 0:
                    previous_invariant = -previous_invariant
                if invariant % previous_invariant != 0:
                    return False
            class_number_upper *= invariant
            if invariant > 1:
                if invariant_count >= 8:
                    return False
                workspace[_ROW_SCRATCH_OFFSET + invariant_count] = invariant
                invariant_count += 1
            factor_index += 1

        # Rank one means any nontrivial norm-plus-or-minus-one element supplies
        # a finite-index
        # unit subgroup.  The analytic suffix will prove whether its index is
        # one.  Search a deterministic bounded box and prefer the smallest
        # coefficient L1 norm, avoiding an accidental high power when the
        # fundamental unit is already present.
        unit_box = 9
        unit_found = False
        unit_score = 1
        unit_zero = 0
        unit_one = 0
        unit_two = 0
        while unit_score <= 3 * unit_box and not unit_found:
            candidate_zero = -unit_box
            while candidate_zero <= unit_box and not unit_found:
                absolute_zero = candidate_zero
                if absolute_zero < 0:
                    absolute_zero = -absolute_zero
                candidate_one = -unit_box
                while candidate_one <= unit_box and not unit_found:
                    absolute_one = candidate_one
                    if absolute_one < 0:
                        absolute_one = -absolute_one
                    remaining_score = unit_score - absolute_zero - absolute_one
                    if remaining_score >= 0 and remaining_score <= unit_box:
                        sign_variant: uint64 = 0
                        sign_count: uint64 = 1
                        if remaining_score > 0:
                            sign_count = 2
                        while sign_variant < sign_count and not unit_found:
                            candidate_two = remaining_score
                            if sign_variant == 1:
                                candidate_two = -remaining_score
                            candidate_sign = candidate_zero
                            if candidate_sign == 0:
                                candidate_sign = candidate_one
                            if candidate_sign == 0:
                                candidate_sign = candidate_two
                            is_identity = (
                                candidate_zero == identity_zero
                                and candidate_one == identity_one
                                and candidate_two == identity_two
                            )
                            is_negative_identity = (
                                candidate_zero == -identity_zero
                                and candidate_one == -identity_one
                                and candidate_two == -identity_two
                            )
                            if (
                                candidate_sign > 0
                                and not is_identity
                                and not is_negative_identity
                            ):
                                candidate_norm = _cubic_norm_form_value(
                                    workspace,
                                    candidate_zero,
                                    candidate_one,
                                    candidate_two,
                                )
                                if candidate_norm == 1 or candidate_norm == -1:
                                    unit_found = True
                                    unit_zero = candidate_zero
                                    unit_one = candidate_one
                                    unit_two = candidate_two
                            sign_variant += 1
                    candidate_one += 1
                candidate_zero += 1
            if not unit_found:
                unit_score += 1
        if not unit_found:
            return False

        # Isolate the unique real embedding and certify the regulator of the
        # retained rank-one unit before reusing the large ideal workspace.
        analytic_scale = 1
        analytic_bit: uint64 = 0
        while analytic_bit < _CUBIC_ANALYTIC_PRECISION:
            analytic_scale *= 2
            analytic_bit += 1
        regulator_lower, regulator_upper = _cubic_regulator_bounds(
            coefficients,
            denominator,
            basis_zero_zero,
            basis_zero_one,
            basis_zero_two,
            basis_one_one,
            basis_one_two,
            basis_two_two,
            unit_zero,
            unit_one,
            unit_two,
            analytic_scale,
        )
        if regulator_lower <= 0 or regulator_upper < regulator_lower:
            return False

        # Build the exact local Euler data for the fixed BF cutoff.  The
        # coefficient at n is the number of prime ideals of norm n minus the
        # rational-zeta contribution at rational primes.  At index primes the
        # resident maximal-order algebra, rather than the defining polynomial,
        # supplies the degree-one maps.
        analytic_threshold: uint64 = _CUBIC_ANALYTIC_THRESHOLD
        analytic_index: uint64 = 0
        while analytic_index < analytic_threshold:
            workspace[_CUBIC_ANALYTIC_COEFFICIENT_OFFSET + analytic_index] = 0
            analytic_index += 1
        analytic_prime: uint64 = 2
        while analytic_prime < analytic_threshold:
            analytic_is_prime = True
            analytic_divisor: uint64 = 2
            while analytic_divisor * analytic_divisor <= analytic_prime:
                if analytic_prime % analytic_divisor == 0:
                    analytic_is_prime = False
                analytic_divisor += 1
            if analytic_is_prime:
                workspace[_CUBIC_ANALYTIC_COEFFICIENT_OFFSET + analytic_prime] -= 1
                analytic_local_degree: uint64 = 0
                analytic_norm: uint64 = 1
                if denominator % analytic_prime != 0:
                    analytic_constant_mod: uint64 = constant % analytic_prime
                    analytic_linear_mod: uint64 = linear % analytic_prime
                    analytic_quadratic_mod: uint64 = quadratic % analytic_prime
                    analytic_root: uint64 = 0
                    analytic_multiplicity_sum: uint64 = 0
                    while analytic_root < analytic_prime:
                        analytic_root_square: uint64 = (
                            analytic_root * analytic_root
                        ) % analytic_prime
                        analytic_value: uint64 = (
                            analytic_constant_mod
                            + analytic_linear_mod * analytic_root
                            + analytic_quadratic_mod * analytic_root_square
                            + analytic_root_square * analytic_root
                        ) % analytic_prime
                        if analytic_value == 0:
                            analytic_first_hasse: uint64 = (
                                analytic_linear_mod
                                + 2 * analytic_quadratic_mod * analytic_root
                                + 3 * analytic_root_square
                            ) % analytic_prime
                            analytic_second_hasse: uint64 = (
                                analytic_quadratic_mod + 3 * analytic_root
                            ) % analytic_prime
                            analytic_root_multiplicity: uint64 = 1
                            if analytic_first_hasse == 0:
                                analytic_root_multiplicity = 2
                                if analytic_second_hasse == 0:
                                    analytic_root_multiplicity = 3
                            analytic_multiplicity_sum += analytic_root_multiplicity
                            analytic_local_degree += analytic_root_multiplicity
                            workspace[
                                _CUBIC_ANALYTIC_COEFFICIENT_OFFSET + analytic_prime
                            ] += 1
                        analytic_root += 1
                    if analytic_multiplicity_sum > 3:
                        return False
                    analytic_remaining_degree: uint64 = 3 - analytic_multiplicity_sum
                    if analytic_remaining_degree > 0:
                        analytic_norm = 1
                        analytic_degree_index: uint64 = 0
                        while analytic_degree_index < analytic_remaining_degree:
                            analytic_norm *= analytic_prime
                            analytic_degree_index += 1
                        if analytic_norm < analytic_threshold:
                            workspace[
                                _CUBIC_ANALYTIC_COEFFICIENT_OFFSET + analytic_norm
                            ] += 1
                        analytic_local_degree += analytic_remaining_degree
                else:
                    # Exhausting the two free images is deliberately capped.
                    # A field outside this transparent envelope declines and
                    # uses the exact dynamic implementation.
                    if analytic_prime > 31:
                        return False
                    analytic_identity_pivot: uint64 = 0
                    while (
                        analytic_identity_pivot < 3
                        and _cubic_positive_mod(
                            workspace[_IDENTITY_OFFSET + analytic_identity_pivot],
                            analytic_prime,
                        )
                        == 0
                    ):
                        analytic_identity_pivot += 1
                    if analytic_identity_pivot == 3:
                        return False
                    analytic_pivot_value = _cubic_positive_mod(
                        workspace[_IDENTITY_OFFSET + analytic_identity_pivot],
                        analytic_prime,
                    )
                    analytic_pivot_inverse = _cubic_inverse_mod(
                        analytic_pivot_value,
                        analytic_prime,
                    )
                    if analytic_pivot_inverse == 0:
                        return False
                    analytic_first_free: uint64 = 0
                    while analytic_first_free == analytic_identity_pivot:
                        analytic_first_free += 1
                    analytic_second_free: uint64 = analytic_first_free + 1
                    while analytic_second_free == analytic_identity_pivot:
                        analytic_second_free += 1
                    analytic_map_count: uint64 = 0
                    analytic_first_value = 0
                    while analytic_first_value < analytic_prime:
                        analytic_second_value = 0
                        while analytic_second_value < analytic_prime:
                            analytic_map_zero = 0
                            analytic_map_one = 0
                            analytic_map_two = 0
                            if analytic_first_free == 0:
                                analytic_map_zero = analytic_first_value
                            elif analytic_first_free == 1:
                                analytic_map_one = analytic_first_value
                            else:
                                analytic_map_two = analytic_first_value
                            if analytic_second_free == 0:
                                analytic_map_zero = analytic_second_value
                            elif analytic_second_free == 1:
                                analytic_map_one = analytic_second_value
                            else:
                                analytic_map_two = analytic_second_value
                            analytic_identity_sum = (
                                identity_zero * analytic_map_zero
                                + identity_one * analytic_map_one
                                + identity_two * analytic_map_two
                            )
                            analytic_pivot_image = _cubic_positive_mod(
                                (1 - analytic_identity_sum) * analytic_pivot_inverse,
                                analytic_prime,
                            )
                            if analytic_identity_pivot == 0:
                                analytic_map_zero = analytic_pivot_image
                            elif analytic_identity_pivot == 1:
                                analytic_map_one = analytic_pivot_image
                            else:
                                analytic_map_two = analytic_pivot_image
                            if _cubic_map_is_multiplicative(
                                workspace,
                                analytic_map_zero,
                                analytic_map_one,
                                analytic_map_two,
                                analytic_prime,
                            ):
                                analytic_map_count += 1
                            analytic_second_value += 1
                        analytic_first_value += 1
                    if analytic_map_count == 0:
                        analytic_local_degree = 3
                        analytic_norm = analytic_prime * analytic_prime * analytic_prime
                        if analytic_norm < analytic_threshold:
                            workspace[
                                _CUBIC_ANALYTIC_COEFFICIENT_OFFSET + analytic_norm
                            ] += 1
                    elif analytic_map_count == 1:
                        workspace[
                            _CUBIC_ANALYTIC_COEFFICIENT_OFFSET + analytic_prime
                        ] += 1
                        if absolute_discriminant % analytic_prime == 0:
                            analytic_local_degree = 3
                        else:
                            analytic_local_degree = 3
                            analytic_norm = analytic_prime * analytic_prime
                            if analytic_norm < analytic_threshold:
                                workspace[
                                    _CUBIC_ANALYTIC_COEFFICIENT_OFFSET + analytic_norm
                                ] += 1
                    elif analytic_map_count == 2:
                        if absolute_discriminant % analytic_prime != 0:
                            return False
                        workspace[
                            _CUBIC_ANALYTIC_COEFFICIENT_OFFSET + analytic_prime
                        ] += 2
                        analytic_local_degree = 3
                    elif analytic_map_count == 3:
                        workspace[
                            _CUBIC_ANALYTIC_COEFFICIENT_OFFSET + analytic_prime
                        ] += 3
                        analytic_local_degree = 3
                    else:
                        return False
                if analytic_local_degree != 3:
                    return False
            analytic_prime += 1

        # Aggregate the BF prime-power plan and deduplicate its transcendental
        # inputs before allocating the two resident FLINT matrices.
        analytic_value_count: uint64 = 5
        workspace[_CUBIC_ANALYTIC_VALUE_OFFSET] = analytic_threshold
        workspace[_CUBIC_ANALYTIC_VALUE_OFFSET + 1] = analytic_threshold // 9
        workspace[_CUBIC_ANALYTIC_VALUE_OFFSET + 2] = 3 * analytic_threshold
        workspace[_CUBIC_ANALYTIC_VALUE_OFFSET + 3] = absolute_discriminant
        workspace[_CUBIC_ANALYTIC_VALUE_OFFSET + 4] = class_number_upper
        analytic_term_count: uint64 = 0
        analytic_scale_index: uint64 = 0
        while analytic_scale_index < 2:
            analytic_cutoff: uint64 = analytic_threshold
            if analytic_scale_index == 1:
                analytic_cutoff = analytic_threshold // 9
            analytic_norm_index: uint64 = 2
            while analytic_norm_index < analytic_cutoff:
                analytic_multiplicity = workspace[
                    _CUBIC_ANALYTIC_COEFFICIENT_OFFSET + analytic_norm_index
                ]
                if analytic_scale_index == 1:
                    analytic_multiplicity = -analytic_multiplicity
                if analytic_multiplicity != 0:
                    analytic_exponent: uint64 = 1
                    analytic_power: uint64 = analytic_norm_index
                    while analytic_power < analytic_cutoff:
                        if analytic_term_count >= _CUBIC_ANALYTIC_MAX_TERMS:
                            return False
                        analytic_value_index: uint64 = 0
                        while (
                            analytic_value_index < analytic_value_count
                            and workspace[
                                _CUBIC_ANALYTIC_VALUE_OFFSET + analytic_value_index
                            ]
                            != analytic_norm_index
                        ):
                            analytic_value_index += 1
                        if analytic_value_index == analytic_value_count:
                            if analytic_value_count >= _CUBIC_ANALYTIC_MAX_VALUES:
                                return False
                            workspace[
                                _CUBIC_ANALYTIC_VALUE_OFFSET + analytic_value_count
                            ] = analytic_norm_index
                            analytic_value_count += 1
                        analytic_term_base: uint64 = (
                            _CUBIC_ANALYTIC_TERM_OFFSET
                            + _CUBIC_ANALYTIC_TERM_STRIDE * analytic_term_count
                        )
                        workspace[analytic_term_base] = analytic_multiplicity
                        workspace[analytic_term_base + 1] = analytic_scale_index
                        workspace[analytic_term_base + 2] = analytic_norm_index
                        workspace[analytic_term_base + 3] = analytic_exponent
                        workspace[analytic_term_base + 4] = analytic_value_index
                        analytic_term_count += 1
                        analytic_exponent += 1
                        if (
                            analytic_power
                            > (analytic_cutoff - 1) // analytic_norm_index
                        ):
                            analytic_power = analytic_cutoff
                        else:
                            analytic_power *= analytic_norm_index
                analytic_norm_index += 1
            analytic_scale_index += 1
        if analytic_term_count < 1:
            return False

        analytic_values = arena.foreign_resource(
            fmpz_matrix,
            analytic_value_count,
            one_column,
        )
        analytic_endpoints = arena.foreign_resource(
            fmpz_matrix,
            4 * analytic_value_count,
            one_column,
        )
        analytic_index = 0
        while analytic_index < analytic_value_count:
            if not fmpz_matrix_set_entry(
                analytic_values,
                analytic_index,
                0,
                workspace[_CUBIC_ANALYTIC_VALUE_OFFSET + analytic_index],
            ):
                return False
            analytic_index += 1
        analytic_precision: uint64 = _CUBIC_ANALYTIC_PRECISION
        if not integer_log_sqrt_balls_resource(
            analytic_endpoints,
            analytic_values,
            analytic_precision,
        ):
            return False

        tail_lower, tail_upper = _cubic_bf_tail_bounds(
            analytic_endpoints,
            analytic_scale,
        )
        finite_lower, finite_upper = _cubic_bf_finite_bounds(
            workspace,
            analytic_values,
            analytic_endpoints,
            analytic_term_count,
            analytic_value_count,
            analytic_scale,
        )
        if tail_lower < 0 or tail_upper < tail_lower or finite_upper < finite_lower:
            return False
        zeta_lower = finite_lower - tail_upper
        zeta_upper = finite_upper + tail_upper
        log_regulator_lower, log_regulator_upper = _cubic_log_interval_bounds(
            regulator_lower,
            regulator_upper,
            analytic_scale,
            analytic_scale,
        )
        log_two_pi_lower, log_two_pi_upper = _cubic_log_two_pi_bounds(analytic_scale)
        log_discriminant_lower = fmpz_matrix_entry(
            analytic_endpoints,
            12,
            0,
        )
        log_discriminant_upper = fmpz_matrix_entry(
            analytic_endpoints,
            13,
            0,
        )
        log_class_lower = fmpz_matrix_entry(analytic_endpoints, 16, 0)
        log_class_upper = fmpz_matrix_entry(analytic_endpoints, 17, 0)
        if (
            log_regulator_upper < log_regulator_lower
            or log_two_pi_upper < log_two_pi_lower
            or log_discriminant_lower <= 0
            or log_class_lower < 0
        ):
            return False
        half_discriminant_lower = log_discriminant_lower // 2
        half_discriminant_upper = _cubic_dyadic_ceiling_quotient(
            log_discriminant_upper,
            2,
        )
        algebraic_lower = (
            log_class_lower
            + log_regulator_lower
            + log_two_pi_lower
            - half_discriminant_upper
        )
        algebraic_upper = (
            log_class_upper
            + log_regulator_upper
            + log_two_pi_upper
            - half_discriminant_lower
        )
        index_log_lower = algebraic_lower - zeta_upper
        index_log_upper = algebraic_upper - zeta_lower
        log_two_lower, log_two_upper = _cubic_atanh_log_bounds(
            1,
            3,
            analytic_scale,
        )
        # Under the GRH hypothesis of Belabas--Friedman Theorem 1, this is a
        # rigorous enclosure for the zeta residue.  The Minkowski factor base
        # makes the relation index integral, and
        # the retained unit subgroup has integral index in the full unit
        # lattice.  Their product is a positive integer.  An upper logarithm
        # strictly below log(2) therefore proves both indices are one.
        if (
            index_log_upper < 0
            or index_log_upper >= log_two_lower
            or log_two_upper < log_two_lower
        ):
            return False

        output_index: uint64 = 0
        while output_index < len(output):
            output[output_index] = 0
            output_index += 1
        output[0] = 2
        output[1] = class_number_upper
        output[2] = invariant_count
        output_index = 0
        while output_index < invariant_count:
            output[3 + output_index] = workspace[_ROW_SCRATCH_OFFSET + output_index]
            output_index += 1
        output[20] = generator_bound
        output[21] = factor_count
        output[22] = group_count
        output[23] = relation_count
        output[24] = 1
        output[25] = unit_zero
        output[26] = unit_one
        output[27] = unit_two
        output[28] = order_discriminant
        output[29] = equation_order_index
        output[30] = denominator
        output[31] = relation_box
        output[32] = unit_box
        output[33] = relation_rank
        output[34] = equation_discriminant
        output[35] = 1
        output[36] = analytic_threshold
        output[37] = analytic_term_count
        output[38] = analytic_value_count
        output[39] = analytic_precision
        output[40] = regulator_lower
        output[41] = regulator_upper
        output[42] = zeta_lower
        output[43] = zeta_upper
        output[44] = index_log_lower
        output[45] = index_log_upper
        output[46] = tail_upper
        output[47] = analytic_scale
        return True


__all__ = [
    "certified_complex_cubic_class_group_v1",
]

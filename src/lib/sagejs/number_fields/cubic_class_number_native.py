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
    fmpz_matrix_hnf_into,
    fmpz_matrix_hnf_transform,
    fmpz_matrix_lll_transform,
    fmpz_matrix_snf,
    fmpz_matrix_snf_into,
    integer_log_sqrt_balls_resource,
    number_field_analysis_resource_project,
    number_field_analysis_resource_project_proof,
    number_field_analyze_resource,
    positive_rational_log_balls_resource,
)
from sagejs.native import (
    IntegerBuffer,
    NativeExactArena,
    NativeIntegerVector,
    checked_uint64,
    native,
    uint64,
)
from sagejs.number_fields.field_analysis_resource import (
    _packed_word_prime_is_proven,
    packed_field_analysis_fixed_points_are_valid,
)


_CUBIC_WORKSPACE_LENGTH = 8192
_CUBIC_MAX_FACTORS = 64
_CUBIC_MAX_GROUPS = 64
_CUBIC_MAX_POWERS = 12
_CUBIC_MAX_RELATIONS = 1024
_CUBIC_MAX_COMPOUND_PAIRS = 128
_CUBIC_COMPOUND_MULTIPLIERS = 4
_CUBIC_MAX_RELATION_EFFORT = 8
_CUBIC_INITIAL_ADJACENT_IDEALS = 3
_CUBIC_SECOND_ADJACENT_IDEALS = 4
_CUBIC_PARI_INITIAL_ADJACENT_IDEALS = 5
_CUBIC_PARI_EXPANDED_ADJACENT_IDEALS = 8
_CUBIC_NARROW_ADJACENT_MAX_FACTORS = 11
_CUBIC_RELATION_REDUNDANCY_TAIL = 6
_CUBIC_RELATION_RECOVERY_TAIL = 18
_CUBIC_REDUCED_ENUMERATION_MAX_CANDIDATES = 500
_CUBIC_REDUCED_ENUMERATION_MAX_COORDINATE = 32
# Bound binary exponent reconstruction independently of the exact-coordinate
# publication capacity.  Both envelopes are fixed and fail closed so arena and
# output storage remain reviewable; exact norm checks remain authoritative.
_CUBIC_ARCHIMEDEAN_EXPONENT_LIMIT = 4096
_CUBIC_MAX_FACTOR_SEARCH_BOUND = 257
_CUBIC_MAX_GRH_BOUND_SEARCH = 4096
_CUBIC_DIRECT_MINKOWSKI_MAX_BOUND = 8
_CUBIC_ANALYSIS_PROOF_CAPACITY = 512
_CUBIC_MAX_ORDER_WITNESSES = 16
_CUBIC_ROUND2_WORKSPACE_LENGTH = 109
# Unit enumeration is only an opportunistic front-end to exact unit recovery
# from relation dependencies. Searching through coordinate-L1 score 9 keeps
# the cheap successes while avoiding the exhaustive shell that dominates pure
# cubics such as x^3 - 91. The analytic index-one test remains the authority.
_CUBIC_SMALL_UNIT_SCORE_LIMIT = 9

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

_CUBIC_ANALYTIC_THRESHOLD = 997
_CUBIC_ANALYTIC_COEFFICIENT_OFFSET = 3000
_CUBIC_ANALYTIC_TERM_OFFSET = 4026
_CUBIC_ANALYTIC_TERM_STRIDE = 5
_CUBIC_ANALYTIC_MAX_TERMS = 256
_CUBIC_ANALYTIC_VALUE_OFFSET = 5306
_CUBIC_ANALYTIC_MAX_VALUES = 256
_CUBIC_ANALYTIC_PRECISION = 64
_CUBIC_PROOF_ANALYTIC_GRH = 1
_CUBIC_PROOF_TRIVIAL_MINKOWSKI = 2
_CUBIC_PROOF_TRIVIAL_GRH = 3


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
            or not _packed_word_prime_is_proven(prime)
        ):
            return False
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


def _cubic_workspace_hnf3(
    workspace: NativeIntegerVector,
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


def _cubic_multiply_coordinates(
    workspace: NativeIntegerVector,
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


def _cubic_matrix_multiply_coordinates(
    workspace: NativeIntegerVector,
    left: FmpzMatrix,
    left_row: uint64,
    right: FmpzMatrix,
    right_row: uint64,
    target: FmpzMatrix,
    target_row: uint64,
) -> bool:
    """Multiply exact coordinates without crossing a fixed-width buffer."""
    left_zero = left[left_row, 0]
    left_one = left[left_row, 1]
    left_two = left[left_row, 2]
    right_zero = right[right_row, 0]
    right_one = right[right_row, 1]
    right_two = right[right_row, 2]
    result_zero = (
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
    result_one = (
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
    result_two = (
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
    target[target_row, 0] = result_zero
    target[target_row, 1] = result_one
    target[target_row, 2] = result_two
    return True


def _cubic_matrix_power_coordinates(
    workspace: NativeIntegerVector,
    source: FmpzMatrix,
    source_row: uint64,
    exponent: int,
    values: FmpzMatrix,
    result_row: uint64,
    square_row: uint64,
) -> bool:
    """Exponentiate inside arena-owned exact coordinate rows."""
    if exponent < 0:
        return False
    values[result_row, 0] = workspace[_IDENTITY_OFFSET]
    values[result_row, 1] = workspace[_IDENTITY_OFFSET + 1]
    values[result_row, 2] = workspace[_IDENTITY_OFFSET + 2]
    coordinate: uint64 = 0
    while coordinate < 3:
        values[square_row, coordinate] = source[source_row, coordinate]
        coordinate += 1
    while exponent > 0:
        if exponent % 2 == 1 and not _cubic_matrix_multiply_coordinates(
            workspace,
            values,
            result_row,
            values,
            square_row,
            values,
            result_row,
        ):
            return False
        exponent //= 2
        if exponent > 0 and not _cubic_matrix_multiply_coordinates(
            workspace,
            values,
            square_row,
            values,
            square_row,
            values,
            square_row,
        ):
            return False
    return True


def _cubic_matrix_exact_quotient_coordinates(
    workspace: NativeIntegerVector,
    values: FmpzMatrix,
    numerator_row: uint64,
    denominator_row: uint64,
    quotient_row: uint64,
    replay_row: uint64,
) -> bool:
    """Solve an exact quotient entirely in arena-owned coordinates."""
    numerator_zero = values[numerator_row, 0]
    numerator_one = values[numerator_row, 1]
    numerator_two = values[numerator_row, 2]
    denominator_zero = values[denominator_row, 0]
    denominator_one = values[denominator_row, 1]
    denominator_two = values[denominator_row, 2]

    # Columns of multiplication by the denominator in the order basis.
    a00 = (
        denominator_zero * workspace[_MULTIPLICATION_OFFSET]
        + denominator_one * workspace[_MULTIPLICATION_OFFSET + 9]
        + denominator_two * workspace[_MULTIPLICATION_OFFSET + 18]
    )
    a10 = (
        denominator_zero * workspace[_MULTIPLICATION_OFFSET + 1]
        + denominator_one * workspace[_MULTIPLICATION_OFFSET + 10]
        + denominator_two * workspace[_MULTIPLICATION_OFFSET + 19]
    )
    a20 = (
        denominator_zero * workspace[_MULTIPLICATION_OFFSET + 2]
        + denominator_one * workspace[_MULTIPLICATION_OFFSET + 11]
        + denominator_two * workspace[_MULTIPLICATION_OFFSET + 20]
    )
    a01 = (
        denominator_zero * workspace[_MULTIPLICATION_OFFSET + 3]
        + denominator_one * workspace[_MULTIPLICATION_OFFSET + 12]
        + denominator_two * workspace[_MULTIPLICATION_OFFSET + 21]
    )
    a11 = (
        denominator_zero * workspace[_MULTIPLICATION_OFFSET + 4]
        + denominator_one * workspace[_MULTIPLICATION_OFFSET + 13]
        + denominator_two * workspace[_MULTIPLICATION_OFFSET + 22]
    )
    a21 = (
        denominator_zero * workspace[_MULTIPLICATION_OFFSET + 5]
        + denominator_one * workspace[_MULTIPLICATION_OFFSET + 14]
        + denominator_two * workspace[_MULTIPLICATION_OFFSET + 23]
    )
    a02 = (
        denominator_zero * workspace[_MULTIPLICATION_OFFSET + 6]
        + denominator_one * workspace[_MULTIPLICATION_OFFSET + 15]
        + denominator_two * workspace[_MULTIPLICATION_OFFSET + 24]
    )
    a12 = (
        denominator_zero * workspace[_MULTIPLICATION_OFFSET + 7]
        + denominator_one * workspace[_MULTIPLICATION_OFFSET + 16]
        + denominator_two * workspace[_MULTIPLICATION_OFFSET + 25]
    )
    a22 = (
        denominator_zero * workspace[_MULTIPLICATION_OFFSET + 8]
        + denominator_one * workspace[_MULTIPLICATION_OFFSET + 17]
        + denominator_two * workspace[_MULTIPLICATION_OFFSET + 26]
    )
    determinant = (
        a00 * (a11 * a22 - a12 * a21)
        - a01 * (a10 * a22 - a12 * a20)
        + a02 * (a10 * a21 - a11 * a20)
    )
    if determinant == 0:
        return False
    quotient_zero_numerator = (
        numerator_zero * (a11 * a22 - a12 * a21)
        - a01 * (numerator_one * a22 - a12 * numerator_two)
        + a02 * (numerator_one * a21 - a11 * numerator_two)
    )
    quotient_one_numerator = (
        a00 * (numerator_one * a22 - a12 * numerator_two)
        - numerator_zero * (a10 * a22 - a12 * a20)
        + a02 * (a10 * numerator_two - numerator_one * a20)
    )
    quotient_two_numerator = (
        a00 * (a11 * numerator_two - numerator_one * a21)
        - a01 * (a10 * numerator_two - numerator_one * a20)
        + numerator_zero * (a10 * a21 - a11 * a20)
    )
    if (
        quotient_zero_numerator % determinant != 0
        or quotient_one_numerator % determinant != 0
        or quotient_two_numerator % determinant != 0
    ):
        return False
    values[quotient_row, 0] = quotient_zero_numerator // determinant
    values[quotient_row, 1] = quotient_one_numerator // determinant
    values[quotient_row, 2] = quotient_two_numerator // determinant
    if not _cubic_matrix_multiply_coordinates(
        workspace, values, denominator_row, values, quotient_row, values, replay_row
    ):
        return False
    return (
        values[replay_row, 0] == numerator_zero
        and values[replay_row, 1] == numerator_one
        and values[replay_row, 2] == numerator_two
    )


def _cubic_coordinate_norm(
    workspace: NativeIntegerVector,
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


def _cubic_norm_form_value(
    workspace: NativeIntegerVector,
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


def _cubic_ideal_product(
    workspace: NativeIntegerVector,
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


def _cubic_compound_prime_ideal_basis(
    workspace: NativeIntegerVector,
    multiplier_factor_index: uint64,
    source_factor_index: uint64,
    multiplier_exponent: uint64,
    output_offset: uint64,
) -> bool:
    """Build `P_multiplier^e * P_source` in one reusable lattice slot."""
    if multiplier_exponent < 1 or output_offset + 9 > len(workspace):
        return False
    multiplier_offset: uint64 = (
        _POWER_OFFSET + multiplier_factor_index * _CUBIC_MAX_POWERS * 9
    )
    source_offset: uint64 = _POWER_OFFSET + source_factor_index * _CUBIC_MAX_POWERS * 9
    entry: uint64 = 0
    while entry < 9:
        workspace[output_offset + entry] = workspace[multiplier_offset + entry]
        entry += 1
    exponent_index: uint64 = 1
    while exponent_index < multiplier_exponent:
        if not _cubic_ideal_product(
            workspace,
            output_offset,
            multiplier_offset,
            output_offset,
        ):
            return False
        exponent_index += 1
    return _cubic_ideal_product(
        workspace,
        output_offset,
        source_offset,
        output_offset,
    )


def _cubic_lattice_contains(
    workspace: NativeIntegerVector,
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


def _cubic_append_smooth_principal_relation(
    workspace: NativeIntegerVector,
    relation_matrix: FmpzMatrix,
    relation_elements: FmpzMatrix,
    relation_count: uint64,
    relation_capacity: uint64,
    factor_count: uint64,
    group_count: uint64,
    coordinate_zero: int,
    coordinate_one: int,
    coordinate_two: int,
) -> uint64:
    """Authenticate and append one smooth principal relation.

    The unchanged count means that the candidate is not useful.  A negative
    result above the capacity is a resource or resident-FFI failure and must fail the caller
    closed.
    """
    norm = _cubic_norm_form_value(
        workspace,
        coordinate_zero,
        coordinate_one,
        coordinate_two,
    )
    if norm < 0:
        norm = -norm
    if norm == 1:
        if relation_count >= relation_capacity:
            return relation_capacity + 1
        factor_index: uint64 = 0
        while factor_index < factor_count:
            relation_matrix[relation_count, factor_index] = 0
            factor_index += 1
        relation_elements[relation_count, 0] = coordinate_zero
        relation_elements[relation_count, 1] = coordinate_one
        relation_elements[relation_count, 2] = coordinate_two
        return relation_count + 1
    if norm < 1:
        return relation_count
    remaining_norm = norm
    group_index: uint64 = 0
    while group_index < group_count:
        group_base: uint64 = _GROUP_OFFSET + _GROUP_STRIDE * group_index
        rational_prime = workspace[group_base]
        rational_valuation = 0
        while remaining_norm % rational_prime == 0:
            remaining_norm //= rational_prime
            rational_valuation += 1
        workspace[group_base + 3] = rational_valuation
        group_index += 1
    if remaining_norm != 1:
        return relation_count

    factor_index: uint64 = 0
    while factor_index < factor_count:
        workspace[_ROW_SCRATCH_OFFSET + factor_index] = 0
        factor_index += 1
    valid_relation = True
    group_index = 0
    while valid_relation and group_index < group_count:
        group_base = _GROUP_OFFSET + _GROUP_STRIDE * group_index
        rational_valuation = workspace[group_base + 3]
        weighted_valuation = 0
        if rational_valuation > _CUBIC_MAX_POWERS:
            valid_relation = False
        factor_index = 0
        while factor_index < factor_count:
            factor_base: uint64 = _FACTOR_OFFSET + _FACTOR_STRIDE * factor_index
            if (
                workspace[factor_base + 7] == group_index
                and workspace[factor_base + 8] == 0
            ):
                residue_degree = workspace[factor_base + 2]
                power_base: uint64 = (
                    _POWER_OFFSET + factor_index * _CUBIC_MAX_POWERS * 9
                )
                valuation: uint64 = 0
                power_index: uint64 = 0
                while power_index < rational_valuation and _cubic_lattice_contains(
                    workspace,
                    power_base + 9 * power_index,
                    coordinate_zero,
                    coordinate_one,
                    coordinate_two,
                ):
                    valuation += 1
                    power_index += 1
                workspace[_ROW_SCRATCH_OFFSET + factor_index] = valuation
                weighted_valuation += residue_degree * valuation
            factor_index += 1
        missing = rational_valuation - weighted_valuation
        factor_index = 0
        while factor_index < factor_count:
            factor_base = _FACTOR_OFFSET + _FACTOR_STRIDE * factor_index
            if (
                workspace[factor_base + 7] == group_index
                and workspace[factor_base + 8] == 1
            ):
                residue_degree = workspace[factor_base + 2]
                if missing < 0 or missing % residue_degree != 0:
                    valid_relation = False
                else:
                    auxiliary_valuation = missing // residue_degree
                    workspace[_ROW_SCRATCH_OFFSET + factor_index] = auxiliary_valuation
                    weighted_valuation += residue_degree * auxiliary_valuation
                    missing = 0
            factor_index += 1
        if weighted_valuation != rational_valuation:
            valid_relation = False
        group_index += 1
    if not valid_relation:
        return relation_count
    if relation_count >= relation_capacity:
        return relation_capacity + 1
    factor_index = 0
    while factor_index < factor_count:
        relation_matrix[relation_count, factor_index] = workspace[
            _ROW_SCRATCH_OFFSET + factor_index
        ]
        factor_index += 1
    relation_elements[relation_count, 0] = coordinate_zero
    relation_elements[relation_count, 1] = coordinate_one
    relation_elements[relation_count, 2] = coordinate_two
    return relation_count + 1


def _cubic_plan_smooth_norm(
    workspace: NativeIntegerVector,
    group_count: uint64,
    norm: int,
) -> bool:
    """Account prime-power storage for one factor-base-smooth norm."""
    if norm < 0:
        norm = -norm
    if norm <= 1:
        return False
    remaining = norm
    group_index: uint64 = 0
    while group_index < group_count:
        group_base: uint64 = _GROUP_OFFSET + _GROUP_STRIDE * group_index
        rational_prime = workspace[group_base]
        while remaining % rational_prime == 0:
            remaining //= rational_prime
        group_index += 1
    if remaining != 1:
        return False
    group_index = 0
    while group_index < group_count:
        group_base = _GROUP_OFFSET + _GROUP_STRIDE * group_index
        rational_prime = workspace[group_base]
        valuation_source = norm
        planned_valuation = 0
        while valuation_source % rational_prime == 0:
            valuation_source //= rational_prime
            planned_valuation += 1
        if planned_valuation > workspace[group_base + 3]:
            workspace[group_base + 3] = planned_valuation
        group_index += 1
    return True


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
def _cubic_bounded_bit_length(value: int, limit: uint64) -> uint64:
    """Return `abs(value).bit_length()`, stopping just above `limit`."""
    magnitude = value
    if magnitude < 0:
        magnitude = -magnitude
    bits: uint64 = 0
    while magnitude > 0 and bits <= limit:
        magnitude //= 2
        bits += 1
    return bits


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


def _cubic_arb_log_positive_rational_bounds(
    numerators: FmpzMatrix,
    denominators: FmpzMatrix,
    endpoints: FmpzMatrix,
    numerator: int,
    denominator: int,
    precision: uint64,
) -> tuple[int, int]:
    """Return outward dyadic bounds for one exact positive rational log."""
    if numerator <= 0 or denominator <= 0:
        return (1, 0)
    numerators[0, 0] = numerator
    denominators[0, 0] = denominator
    one: uint64 = 1
    if not positive_rational_log_balls_resource(
        endpoints,
        numerators,
        denominators,
        one,
        precision,
    ):
        return (1, 0)
    lower = endpoints[0, 0]
    upper = endpoints[1, 0]
    if upper < lower:
        return (1, 0)
    return (lower, upper)


@native
def _cubic_log_interval_bounds(
    numerators: FmpzMatrix,
    denominators: FmpzMatrix,
    endpoints: FmpzMatrix,
    lower_numerator: int,
    upper_numerator: int,
    denominator: int,
    precision: uint64,
) -> tuple[int, int]:
    if lower_numerator <= 0 or upper_numerator < lower_numerator:
        return (1, 0)
    lower_bound, ignored_upper = _cubic_arb_log_positive_rational_bounds(
        numerators,
        denominators,
        endpoints,
        lower_numerator,
        denominator,
        precision,
    )
    ignored_lower, upper_bound = _cubic_arb_log_positive_rational_bounds(
        numerators,
        denominators,
        endpoints,
        upper_numerator,
        denominator,
        precision,
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
def _cubic_log_two_pi_bounds(
    numerators: FmpzMatrix,
    denominators: FmpzMatrix,
    endpoints: FmpzMatrix,
    scale: int,
    precision: uint64,
) -> tuple[int, int]:
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
        numerators,
        denominators,
        endpoints,
        pi_lower,
        pi_upper,
        scale,
        precision,
    )
    log_two_lower, log_two_upper = _cubic_arb_log_positive_rational_bounds(
        numerators,
        denominators,
        endpoints,
        2,
        1,
        precision,
    )
    if log_pi_upper < log_pi_lower or log_two_upper < log_two_lower:
        return (1, 0)
    return (
        log_two_lower + log_pi_lower,
        log_two_upper + log_pi_upper,
    )


def _cubic_degree_one_prime_count(
    workspace: NativeIntegerVector,
    coefficients: IntegerBuffer,
    equation_order_index: int,
    identity_zero: int,
    identity_one: int,
    identity_two: int,
    prime: int,
) -> uint64:
    """Count degree-one primes in the certified maximal order above `prime`."""
    root_count: uint64 = 0
    if equation_order_index % prime != 0:
        root = 0
        while root < prime:
            root_square = _cubic_positive_mod(root * root, prime)
            root_cube = _cubic_positive_mod(root_square * root, prime)
            if (
                _cubic_positive_mod(
                    coefficients[0]
                    + coefficients[1] * root
                    + coefficients[2] * root_square
                    + root_cube,
                    prime,
                )
                == 0
            ):
                root_count += 1
            root += 1
        return root_count

    # At primes dividing the defining-order index, enumerate unital algebra
    # homomorphisms `O_K -> F_p` from the exact multiplication table.  Their
    # kernels are precisely the degree-one maximal ideals above `p`.
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
        return 4
    identity_pivot_value = _cubic_positive_mod(
        workspace[_IDENTITY_OFFSET + identity_pivot],
        prime,
    )
    identity_inverse = _cubic_inverse_mod(identity_pivot_value, prime)
    if identity_inverse == 0:
        return 4
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
                root_count += 1
                if root_count > 3:
                    return 4
            second_value += 1
        first_value += 1
    return root_count


@native
def _cubic_grh_prime_degree_contribution(
    transcendental_endpoints: FmpzMatrix,
    prime: int,
    residue_degree: uint64,
    bound: int,
    scale: int,
) -> tuple[int, int]:
    """Enclose the positive `SA`/`SB` contribution of one prime ideal."""
    norm = 1
    degree_index: uint64 = 0
    while degree_index < residue_degree:
        norm *= prime
        degree_index += 1
    if norm > bound:
        return (0, 0)
    maximum_power: uint64 = 0
    norm_power = 1
    while norm_power <= bound // norm:
        norm_power *= norm
        maximum_power += 1
    if maximum_power == 0:
        return (0, 0)

    endpoint_offset: uint64 = checked_uint64(4 * prime)
    log_prime_lower = transcendental_endpoints[endpoint_offset, 0]
    log_prime_upper = transcendental_endpoints[endpoint_offset + 1, 0]
    if log_prime_upper < log_prime_lower:
        return (-1, -1)
    log_norm_lower = residue_degree * log_prime_lower
    log_norm_upper = residue_degree * log_prime_upper

    # The shared Arb batch encloses `scale*sqrt(norm)` exactly outwards.
    # Reciprocal monotonicity then gives a rigorous interval for
    # `scale/sqrt(norm)` without constructing `norm*scale^2` in GMP.
    root_offset: uint64 = checked_uint64(4 * norm)
    root_lower = transcendental_endpoints[root_offset + 2, 0]
    root_upper = transcendental_endpoints[root_offset + 3, 0]
    if root_lower <= 0 or root_upper < root_lower:
        return (-1, -1)
    q_lower = (scale * scale) // root_upper
    q_upper = _cubic_dyadic_ceiling_quotient(
        scale * scale,
        root_lower,
    )
    q_power_lower = q_lower
    q_power_upper = q_upper
    geometric_lower = 0
    geometric_upper = 0
    weighted_lower = 0
    weighted_upper = 0
    power_index: uint64 = 1
    while power_index <= maximum_power:
        geometric_lower += q_power_lower
        geometric_upper += q_power_upper
        weighted_lower += power_index * q_power_lower
        weighted_upper += power_index * q_power_upper
        if power_index < maximum_power:
            q_power_lower, q_power_upper = _cubic_dyadic_multiply(
                q_power_lower,
                q_power_upper,
                q_lower,
                q_upper,
                scale,
            )
        power_index += 1
    sa_lower, ignored_sa_upper = _cubic_dyadic_multiply(
        log_norm_lower,
        log_norm_upper,
        geometric_lower,
        geometric_upper,
        scale,
    )
    log_norm_square_lower, log_norm_square_upper = _cubic_dyadic_multiply(
        log_norm_lower,
        log_norm_upper,
        log_norm_lower,
        log_norm_upper,
        scale,
    )
    ignored_sb_lower, sb_upper = _cubic_dyadic_multiply(
        log_norm_square_lower,
        log_norm_square_upper,
        weighted_lower,
        weighted_upper,
        scale,
    )
    return (sa_lower, sb_upper)


def _cubic_grh_generator_bound_is_certified(
    log_numerators: FmpzMatrix,
    log_denominators: FmpzMatrix,
    log_endpoints: FmpzMatrix,
    transcendental_endpoints: FmpzMatrix,
    workspace: NativeIntegerVector,
    coefficients: IntegerBuffer,
    equation_order_index: int,
    identity_zero: int,
    identity_one: int,
    identity_two: int,
    absolute_discriminant: int,
    bound: int,
    scale: int,
    precision: uint64,
) -> bool:
    """Certify the explicit GRH class-group generator inequality."""
    if bound < 2 or absolute_discriminant < 2 or scale <= 0:
        return False
    bound_offset: uint64 = checked_uint64(4 * bound)
    log_bound_lower = transcendental_endpoints[bound_offset, 0]
    log_bound_upper = transcendental_endpoints[bound_offset + 1, 0]
    log_discriminant_lower = transcendental_endpoints[0, 0]
    log_discriminant_upper = transcendental_endpoints[1, 0]
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
    log_eight_pi_lower, log_eight_pi_upper = _cubic_log_interval_bounds(
        log_numerators,
        log_denominators,
        log_endpoints,
        8 * pi_lower,
        8 * pi_upper,
        scale,
        precision,
    )
    if (
        log_bound_upper < log_bound_lower
        or log_discriminant_upper < log_discriminant_lower
        or pi_upper < pi_lower
        or log_eight_pi_upper < log_eight_pi_lower
    ):
        return False

    # In signature `(1,1)`, the explicit inequality uses
    #
    #   cN = 4*Catalan + 3*pi^2/2,
    #   cD = log(D) - 3*(Euler + log(8*pi)) - pi/2.
    #
    # Use tiny transparent rational authorities for both constants.  The
    # alternating Catalan series is bounded above by every even partial sum;
    # seven terms already give `G < 0.9185`.  Also
    #
    #   H_n - log(n) - 1/(2*n) < gamma.
    #
    # Indeed, if `a_n = H_n-log(n)`, then
    #
    #   a_n-gamma = sum_{k>=n}(log(1+1/k)-1/(k+1)) < 1/(2*n),
    #
    # because `log(1+x)-x/(1+x) < x^2/(2*(1+x))` for `x>0` and the
    # resulting rational series telescopes.  At `n=32` this is dramatically
    # sharper than the one-sided integral bound `H_n-log(n+1) < gamma`, while
    # retaining a tiny exact proof authority and the same bounded loop.
    catalan_upper = 0
    catalan_index: uint64 = 0
    while catalan_index <= 6:
        catalan_odd = 2 * catalan_index + 1
        catalan_denominator = catalan_odd * catalan_odd
        if catalan_index % 2 == 0:
            catalan_upper += _cubic_dyadic_ceiling_quotient(
                scale,
                catalan_denominator,
            )
        else:
            catalan_upper -= scale // catalan_denominator
        catalan_index += 1
    harmonic_lower = 0
    harmonic_index: uint64 = 1
    while harmonic_index <= 32:
        harmonic_lower += scale // harmonic_index
        harmonic_index += 1
    log_thirty_two_lower = transcendental_endpoints[128, 0]
    log_thirty_two_upper = transcendental_endpoints[129, 0]
    gamma_lower = (
        harmonic_lower
        - log_thirty_two_upper
        - _cubic_dyadic_ceiling_quotient(scale, 64)
    )
    if (
        catalan_upper <= 0
        or log_thirty_two_upper < log_thirty_two_lower
        or gamma_lower <= 0
    ):
        return False
    pi_square_lower, pi_square_upper = _cubic_dyadic_multiply(
        pi_lower,
        pi_upper,
        pi_lower,
        pi_upper,
        scale,
    )
    c_n_upper = 4 * catalan_upper + _cubic_dyadic_ceiling_quotient(
        3 * pi_square_upper,
        2,
    )
    c_three_lower = gamma_lower + log_eight_pi_lower
    c_d_upper = log_discriminant_upper - 3 * c_three_lower - pi_lower // 2

    sa_lower = 0
    sb_upper = 0
    prime = 2
    while prime <= bound:
        prime_is_prime = True
        divisor = 2
        while divisor * divisor <= prime:
            if prime % divisor == 0:
                prime_is_prime = False
            divisor += 1
        if prime_is_prime:
            root_count = _cubic_degree_one_prime_count(
                workspace,
                coefficients,
                equation_order_index,
                identity_zero,
                identity_one,
                identity_two,
                prime,
            )
            if root_count > 3:
                return False
            degree_one_count: uint64 = root_count
            degree_two_count: uint64 = 0
            degree_three_count: uint64 = 0
            if absolute_discriminant % prime != 0:
                if root_count == 0:
                    degree_three_count = 1
                elif root_count == 1:
                    degree_two_count = 1
                elif root_count != 3:
                    return False
            elif root_count == 0 or root_count > 2:
                return False
            degree_count: uint64 = degree_one_count
            residue_degree: uint64 = 1
            degree_variant: uint64 = 0
            while degree_variant < 3:
                if degree_variant == 1:
                    degree_count = degree_two_count
                    residue_degree = 2
                elif degree_variant == 2:
                    degree_count = degree_three_count
                    residue_degree = 3
                if degree_count > 0:
                    contribution_sa_lower, contribution_sb_upper = (
                        _cubic_grh_prime_degree_contribution(
                            transcendental_endpoints,
                            prime,
                            residue_degree,
                            bound,
                            scale,
                        )
                    )
                    if contribution_sa_lower < 0 or contribution_sb_upper < 0:
                        return False
                    sa_lower += degree_count * contribution_sa_lower
                    sb_upper += degree_count * contribution_sb_upper
                degree_variant += 1
        prime += 1
    numerator_upper = c_n_upper + 2 * sb_upper
    ignored_quotient_lower, quotient_upper = _cubic_dyadic_divide_positive(
        numerator_upper,
        numerator_upper,
        log_bound_lower,
        log_bound_upper,
        scale,
    )
    if quotient_upper < ignored_quotient_lower:
        return False
    return c_d_upper + quotient_upper - 2 * sa_lower < 0


def _cubic_grh_generator_bound(
    log_numerators: FmpzMatrix,
    log_denominators: FmpzMatrix,
    log_endpoints: FmpzMatrix,
    transcendental_endpoints: FmpzMatrix,
    workspace: NativeIntegerVector,
    coefficients: IntegerBuffer,
    equation_order_index: int,
    identity_zero: int,
    identity_one: int,
    identity_two: int,
    absolute_discriminant: int,
    unconditional_bound: int,
    scale: int,
    precision: uint64,
) -> int:
    """Return a certified GRH cutoff no larger than the fallback bound."""
    if unconditional_bound <= 2:
        return unconditional_bound
    low = 1
    high = 2
    while high < unconditional_bound and not _cubic_grh_generator_bound_is_certified(
        log_numerators,
        log_denominators,
        log_endpoints,
        transcendental_endpoints,
        workspace,
        coefficients,
        equation_order_index,
        identity_zero,
        identity_one,
        identity_two,
        absolute_discriminant,
        high,
        scale,
        precision,
    ):
        low = high
        high *= 2
        if high > unconditional_bound:
            high = unconditional_bound
    if not _cubic_grh_generator_bound_is_certified(
        log_numerators,
        log_denominators,
        log_endpoints,
        transcendental_endpoints,
        workspace,
        coefficients,
        equation_order_index,
        identity_zero,
        identity_one,
        identity_two,
        absolute_discriminant,
        high,
        scale,
        precision,
    ):
        return unconditional_bound
    while high - low > 1:
        middle = (low + high) // 2
        if _cubic_grh_generator_bound_is_certified(
            log_numerators,
            log_denominators,
            log_endpoints,
            transcendental_endpoints,
            workspace,
            coefficients,
            equation_order_index,
            identity_zero,
            identity_one,
            identity_two,
            absolute_discriminant,
            middle,
            scale,
            precision,
        ):
            high = middle
        else:
            low = middle
    return high


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
def _cubic_real_log_bounds(
    log_numerators: FmpzMatrix,
    log_denominators: FmpzMatrix,
    log_endpoints: FmpzMatrix,
    coefficients: IntegerBuffer,
    denominator: int,
    basis_zero_zero: int,
    basis_zero_one: int,
    basis_zero_two: int,
    basis_one_one: int,
    basis_one_two: int,
    basis_two_two: int,
    element_zero: int,
    element_one: int,
    element_two: int,
    scale: int,
    precision: uint64,
) -> tuple[int, int]:
    """Enclose the signed real-place log absolute value of one element."""
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
    while root_upper - root_lower > 1 and bisections < 1024:
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

    raw_zero = element_zero * basis_zero_zero
    raw_one = element_zero * basis_zero_one + element_one * basis_one_one
    raw_two = (
        element_zero * basis_zero_two
        + element_one * basis_one_two
        + element_two * basis_two_two
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
        log_numerators,
        log_denominators,
        log_endpoints,
        absolute_lower,
        absolute_upper,
        denominator * scale,
        precision,
    )
    return (logarithm_lower, logarithm_upper)


@native
def _cubic_regulator_bounds(
    log_numerators: FmpzMatrix,
    log_denominators: FmpzMatrix,
    log_endpoints: FmpzMatrix,
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
    precision: uint64,
) -> tuple[int, int]:
    """Enclose the positive regulator of one authenticated cubic unit."""
    logarithm_lower, logarithm_upper = _cubic_real_log_bounds(
        log_numerators,
        log_denominators,
        log_endpoints,
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
        scale,
        precision,
    )
    if logarithm_upper < logarithm_lower:
        return (1, 0)
    if logarithm_lower > 0:
        return (logarithm_lower, logarithm_upper)
    if logarithm_upper < 0:
        return (-logarithm_upper, -logarithm_lower)
    return (1, 0)


def _cubic_small_unit_probe(
    log_numerators: FmpzMatrix,
    log_denominators: FmpzMatrix,
    log_endpoints: FmpzMatrix,
    workspace: NativeIntegerVector,
    coefficients: IntegerBuffer,
    denominator: int,
    basis_zero_zero: int,
    basis_zero_one: int,
    basis_zero_two: int,
    basis_one_one: int,
    basis_one_two: int,
    basis_two_two: int,
    identity_zero: int,
    identity_one: int,
    identity_two: int,
    scale: int,
    precision: uint64,
) -> tuple[int, int, int, int, int, int]:
    """Return the best unit on the first cheap populated L1 shell, if any."""
    unit_box = _CUBIC_SMALL_UNIT_SCORE_LIMIT
    unit_found = False
    unit_score = 1
    unit_zero = 0
    unit_one = 0
    unit_two = 0
    regulator_lower = 0
    regulator_upper = 0
    while unit_score <= _CUBIC_SMALL_UNIT_SCORE_LIMIT and not unit_found:
        candidate_zero = -unit_box
        while candidate_zero <= unit_box:
            absolute_zero = candidate_zero
            if absolute_zero < 0:
                absolute_zero = -absolute_zero
            candidate_one = -unit_box
            while candidate_one <= unit_box:
                absolute_one = candidate_one
                if absolute_one < 0:
                    absolute_one = -absolute_one
                remaining_score = unit_score - absolute_zero - absolute_one
                if remaining_score >= 0 and remaining_score <= unit_box:
                    sign_variant: uint64 = 0
                    sign_count: uint64 = 1
                    if remaining_score > 0:
                        sign_count = 2
                    while sign_variant < sign_count:
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
                                (
                                    candidate_regulator_lower,
                                    candidate_regulator_upper,
                                ) = _cubic_regulator_bounds(
                                    log_numerators,
                                    log_denominators,
                                    log_endpoints,
                                    coefficients,
                                    denominator,
                                    basis_zero_zero,
                                    basis_zero_one,
                                    basis_zero_two,
                                    basis_one_one,
                                    basis_one_two,
                                    basis_two_two,
                                    candidate_zero,
                                    candidate_one,
                                    candidate_two,
                                    scale,
                                    precision,
                                )
                                if (
                                    candidate_regulator_lower > 0
                                    and candidate_regulator_upper
                                    >= candidate_regulator_lower
                                    and (
                                        not unit_found
                                        or candidate_regulator_upper < regulator_lower
                                    )
                                ):
                                    unit_found = True
                                    unit_zero = candidate_zero
                                    unit_one = candidate_one
                                    unit_two = candidate_two
                                    regulator_lower = candidate_regulator_lower
                                    regulator_upper = candidate_regulator_upper
                        sign_variant += 1
                candidate_one += 1
            candidate_zero += 1
        unit_score += 1
    if unit_found:
        return (
            1,
            unit_zero,
            unit_one,
            unit_two,
            regulator_lower,
            regulator_upper,
        )
    return (0, 0, 0, 0, 0, 0)


@native
def _cubic_nearest_quotient(numerator: int, denominator: int) -> int:
    """Round one exact quotient to the nearest integer, symmetrically."""
    if denominator == 0:
        return 0
    if denominator < 0:
        numerator = -numerator
        denominator = -denominator
    if numerator < 0:
        return -((-numerator + denominator // 2) // denominator)
    return (numerator + denominator // 2) // denominator


@native
def _cubic_complex_multiply_fixed(
    left_real: int,
    left_imaginary: int,
    right_real: int,
    right_imaginary: int,
    scale: int,
) -> tuple[int, int]:
    """Multiply two fixed-point complex values with nearest rounding."""
    return (
        _cubic_nearest_quotient(
            left_real * right_real - left_imaginary * right_imaginary,
            scale,
        ),
        _cubic_nearest_quotient(
            left_real * right_imaginary + left_imaginary * right_real,
            scale,
        ),
    )


@native
def _cubic_fixed_polynomial_embedding(
    coefficient_zero: int,
    coefficient_one: int,
    coefficient_two: int,
    root_real: int,
    root_imaginary: int,
    scale: int,
) -> tuple[int, int]:
    """Evaluate a quadratic at one fixed-point real or complex root."""
    square_real = _cubic_nearest_quotient(
        root_real * root_real - root_imaginary * root_imaginary,
        scale,
    )
    square_imaginary = _cubic_nearest_quotient(
        2 * root_real * root_imaginary,
        scale,
    )
    return (
        coefficient_zero * scale
        + coefficient_one * root_real
        + coefficient_two * square_real,
        coefficient_one * root_imaginary + coefficient_two * square_imaginary,
    )


@native
def _cubic_determinant_three(
    zero_zero: int,
    zero_one: int,
    zero_two: int,
    one_zero: int,
    one_one: int,
    one_two: int,
    two_zero: int,
    two_one: int,
    two_two: int,
) -> int:
    """Return the exact determinant of a row-major three-by-three matrix."""
    return (
        zero_zero * (one_one * two_two - one_two * two_one)
        - zero_one * (one_zero * two_two - one_two * two_zero)
        + zero_two * (one_zero * two_one - one_one * two_zero)
    )


@native
def _cubic_complex_root_approximations(
    coefficients: IntegerBuffer,
    scale: int,
) -> tuple[int, int, int, int]:
    """Return fixed-point real and upper-half-plane roots of a complex cubic."""
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
    lower_value = _cubic_scaled_polynomial_value(coefficients, root_lower, scale)
    upper_value = _cubic_scaled_polynomial_value(coefficients, root_upper, scale)
    if lower_value >= 0 or upper_value <= 0:
        return (0, 0, 0, 0)
    bisections: uint64 = 0
    while root_upper - root_lower > 1 and bisections < 1024:
        root_middle = (root_lower + root_upper) // 2
        middle_value = _cubic_scaled_polynomial_value(
            coefficients,
            root_middle,
            scale,
        )
        if middle_value < 0:
            root_lower = root_middle
        elif middle_value > 0:
            root_upper = root_middle
        else:
            root_lower = root_middle
            root_upper = root_middle
        bisections += 1
    if root_upper - root_lower > 1:
        return (0, 0, 0, 0)
    real_root = (root_lower + root_upper) // 2
    complex_real_root = (-coefficients[2] * scale - real_root) // 2
    pair_norm = coefficients[1] * scale - _cubic_nearest_quotient(
        2 * real_root * complex_real_root,
        scale,
    )
    complex_imaginary_square = pair_norm * scale - complex_real_root * complex_real_root
    if complex_imaginary_square <= 0:
        return (0, 0, 0, 0)
    complex_imaginary_root = _cubic_floor_sqrt(complex_imaginary_square)
    if complex_imaginary_root <= 0:
        return (0, 0, 0, 0)
    return (1, real_root, complex_real_root, complex_imaginary_root)


def _cubic_fill_ideal_t2_embedding(
    source: FmpzMatrix,
    workspace: NativeIntegerVector,
    basis_offset: uint64,
    basis_zero_zero: int,
    basis_zero_one: int,
    basis_zero_two: int,
    basis_one_one: int,
    basis_one_two: int,
    basis_two_two: int,
    real_root: int,
    complex_real_root: int,
    complex_imaginary_root: int,
    scale: int,
) -> bool:
    """Fill the integer T2 embedding of one row ideal basis."""
    sqrt_two = _cubic_floor_sqrt(2 * scale * scale)
    if sqrt_two <= 0:
        return False
    row: uint64 = 0
    while row < 3:
        element_zero = workspace[basis_offset + 3 * row]
        element_one = workspace[basis_offset + 3 * row + 1]
        element_two = workspace[basis_offset + 3 * row + 2]
        raw_zero = element_zero * basis_zero_zero
        raw_one = element_zero * basis_zero_one + element_one * basis_one_one
        raw_two = (
            element_zero * basis_zero_two
            + element_one * basis_one_two
            + element_two * basis_two_two
        )
        real_value, ignored_imaginary = _cubic_fixed_polynomial_embedding(
            raw_zero,
            raw_one,
            raw_two,
            real_root,
            0,
            scale,
        )
        complex_real_value, complex_imaginary_value = _cubic_fixed_polynomial_embedding(
            raw_zero,
            raw_one,
            raw_two,
            complex_real_root,
            complex_imaginary_root,
            scale,
        )
        complex_real_value = _cubic_nearest_quotient(
            complex_real_value * sqrt_two,
            scale,
        )
        complex_imaginary_value = _cubic_nearest_quotient(
            complex_imaginary_value * sqrt_two,
            scale,
        )
        source[row, 0] = real_value
        source[row, 1] = complex_real_value
        source[row, 2] = complex_imaginary_value
        row += 1
    return True


def _cubic_transformed_ideal_coordinates(
    workspace: NativeIntegerVector,
    basis_offset: uint64,
    transforms: FmpzMatrix,
    transform_row_offset: uint64,
    coefficient_zero: int,
    coefficient_one: int,
    coefficient_two: int,
) -> tuple[int, int, int]:
    """Map one reduced-basis coefficient row back to order coordinates."""
    coordinate_zero = 0
    coordinate_one = 0
    coordinate_two = 0
    source_row: uint64 = 0
    while source_row < 3:
        source_coefficient = (
            coefficient_zero * transforms[transform_row_offset, source_row]
            + coefficient_one * transforms[transform_row_offset + 1, source_row]
            + coefficient_two * transforms[transform_row_offset + 2, source_row]
        )
        coordinate_zero += source_coefficient * workspace[basis_offset + 3 * source_row]
        coordinate_one += (
            source_coefficient * workspace[basis_offset + 3 * source_row + 1]
        )
        coordinate_two += (
            source_coefficient * workspace[basis_offset + 3 * source_row + 2]
        )
        source_row += 1
    return (coordinate_zero, coordinate_one, coordinate_two)


def _cubic_coordinates_are_scalar(
    workspace: NativeIntegerVector,
    coordinate_zero: int,
    coordinate_one: int,
    coordinate_two: int,
) -> bool:
    """Return whether one order coordinate row is a rational integer."""
    pivot: uint64 = 0
    while pivot < 3 and workspace[_IDENTITY_OFFSET + pivot] == 0:
        pivot += 1
    if pivot == 3:
        return False
    pivot_coordinate = coordinate_zero
    if pivot == 1:
        pivot_coordinate = coordinate_one
    elif pivot == 2:
        pivot_coordinate = coordinate_two
    pivot_identity = workspace[_IDENTITY_OFFSET + pivot]
    if pivot_coordinate % pivot_identity != 0:
        return False
    multiple = pivot_coordinate // pivot_identity
    return (
        coordinate_zero == multiple * workspace[_IDENTITY_OFFSET]
        and coordinate_one == multiple * workspace[_IDENTITY_OFFSET + 1]
        and coordinate_two == multiple * workspace[_IDENTITY_OFFSET + 2]
    )


def _cubic_prepare_reduced_ideal_ellipsoid(
    workspace: NativeIntegerVector,
    basis_offset: uint64,
    embedding_reduced: FmpzMatrix,
    transforms: FmpzMatrix,
    transform_row_offset: uint64,
    parameters: FmpzMatrix,
    parameter_row: uint64,
) -> bool:
    """Store an exact coefficient box containing PARI's reduced ellipsoid."""
    g00 = 0
    g01 = 0
    g02 = 0
    g11 = 0
    g12 = 0
    g22 = 0
    embedding_column: uint64 = 0
    while embedding_column < 3:
        row_zero = embedding_reduced[0, embedding_column]
        row_one = embedding_reduced[1, embedding_column]
        row_two = embedding_reduced[2, embedding_column]
        g00 += row_zero * row_zero
        g01 += row_zero * row_one
        g02 += row_zero * row_two
        g11 += row_one * row_one
        g12 += row_one * row_two
        g22 += row_two * row_two
        embedding_column += 1
    determinant = (
        g00 * (g11 * g22 - g12 * g12)
        - g01 * (g01 * g22 - g12 * g02)
        + g02 * (g01 * g12 - g11 * g02)
    )
    cofactor_zero = g11 * g22 - g12 * g12
    cofactor_one = g00 * g22 - g02 * g02
    cofactor_two = g00 * g11 - g01 * g01
    if (
        g00 <= 0
        or g11 <= 0
        or g22 <= 0
        or determinant <= 0
        or cofactor_zero <= 0
        or cofactor_one <= 0
        or cofactor_two <= 0
    ):
        return False

    first_zero, first_one, first_two = _cubic_transformed_ideal_coordinates(
        workspace,
        basis_offset,
        transforms,
        transform_row_offset,
        1,
        0,
        0,
    )
    bound_eight = 8 * g00
    bound_two = 2 * g11
    bound = bound_eight
    if _cubic_coordinates_are_scalar(
        workspace,
        first_zero,
        first_one,
        first_two,
    ):
        if bound_two > bound:
            bound = bound_two
    elif bound_two < bound:
        bound = bound_two
    limit_zero_square = _cubic_dyadic_ceiling_quotient(
        bound * cofactor_zero,
        determinant,
    )
    limit_one_square = _cubic_dyadic_ceiling_quotient(
        bound * cofactor_one,
        determinant,
    )
    limit_two_square = _cubic_dyadic_ceiling_quotient(
        bound * cofactor_two,
        determinant,
    )
    limit_zero = _cubic_ceil_sqrt(limit_zero_square)
    limit_one = _cubic_ceil_sqrt(limit_one_square)
    limit_two = _cubic_ceil_sqrt(limit_two_square)
    if (
        limit_zero < 0
        or limit_one < 0
        or limit_two < 0
        or limit_zero > _CUBIC_REDUCED_ENUMERATION_MAX_COORDINATE
        or limit_one > _CUBIC_REDUCED_ENUMERATION_MAX_COORDINATE
        or limit_two > _CUBIC_REDUCED_ENUMERATION_MAX_COORDINATE
    ):
        return False
    parameters[parameter_row, 0] = g00
    parameters[parameter_row, 1] = g01
    parameters[parameter_row, 2] = g02
    parameters[parameter_row, 3] = g11
    parameters[parameter_row, 4] = g12
    parameters[parameter_row, 5] = g22
    parameters[parameter_row, 6] = bound
    parameters[parameter_row, 7] = limit_zero
    parameters[parameter_row, 8] = limit_one
    parameters[parameter_row, 9] = limit_two
    return True


def _cubic_reduced_ellipsoid_candidate(
    workspace: NativeIntegerVector,
    basis_offset: uint64,
    transforms: FmpzMatrix,
    transform_row_offset: uint64,
    parameters: FmpzMatrix,
    parameter_row: uint64,
    coefficient_zero: int,
    coefficient_one: int,
    coefficient_two: int,
) -> tuple[int, int, int, int]:
    """Authenticate one primitive nonscalar point in a reduced ellipsoid."""
    canonical_sign = coefficient_two
    if canonical_sign == 0:
        canonical_sign = coefficient_one
    if canonical_sign == 0:
        canonical_sign = coefficient_zero
    if canonical_sign <= 0:
        return (0, 0, 0, 0)
    absolute_zero = coefficient_zero
    absolute_one = coefficient_one
    absolute_two = coefficient_two
    if absolute_zero < 0:
        absolute_zero = -absolute_zero
    if absolute_one < 0:
        absolute_one = -absolute_one
    if absolute_two < 0:
        absolute_two = -absolute_two
    content, ignored_left, ignored_right = _cubic_extended_gcd(
        absolute_zero,
        absolute_one,
    )
    content, ignored_left, ignored_right = _cubic_extended_gcd(content, absolute_two)
    if content != 1:
        return (0, 0, 0, 0)
    g00 = parameters[parameter_row, 0]
    g01 = parameters[parameter_row, 1]
    g02 = parameters[parameter_row, 2]
    g11 = parameters[parameter_row, 3]
    g12 = parameters[parameter_row, 4]
    g22 = parameters[parameter_row, 5]
    bound = parameters[parameter_row, 6]
    t2 = (
        g00 * coefficient_zero * coefficient_zero
        + 2 * g01 * coefficient_zero * coefficient_one
        + 2 * g02 * coefficient_zero * coefficient_two
        + g11 * coefficient_one * coefficient_one
        + 2 * g12 * coefficient_one * coefficient_two
        + g22 * coefficient_two * coefficient_two
    )
    if t2 <= 0 or t2 > bound:
        return (0, 0, 0, 0)
    coordinate_zero, coordinate_one, coordinate_two = (
        _cubic_transformed_ideal_coordinates(
            workspace,
            basis_offset,
            transforms,
            transform_row_offset,
            coefficient_zero,
            coefficient_one,
            coefficient_two,
        )
    )
    if _cubic_coordinates_are_scalar(
        workspace,
        coordinate_zero,
        coordinate_one,
        coordinate_two,
    ):
        return (0, 0, 0, 0)
    return (1, coordinate_zero, coordinate_one, coordinate_two)


def _cubic_plan_reduced_ideal_ellipsoid(
    workspace: NativeIntegerVector,
    basis_offset: uint64,
    transforms: FmpzMatrix,
    transform_row_offset: uint64,
    parameters: FmpzMatrix,
    parameter_row: uint64,
    group_count: uint64,
) -> uint64:
    """Account exact prime powers for every bounded ellipsoid candidate."""
    limit_zero = parameters[parameter_row, 7]
    limit_one = parameters[parameter_row, 8]
    limit_two = parameters[parameter_row, 9]
    candidate_count: uint64 = 0
    coefficient_two = -limit_two
    while coefficient_two <= limit_two:
        coefficient_one = -limit_one
        while coefficient_one <= limit_one:
            coefficient_zero = -limit_zero
            while coefficient_zero <= limit_zero:
                status, coordinate_zero, coordinate_one, coordinate_two = (
                    _cubic_reduced_ellipsoid_candidate(
                        workspace,
                        basis_offset,
                        transforms,
                        transform_row_offset,
                        parameters,
                        parameter_row,
                        coefficient_zero,
                        coefficient_one,
                        coefficient_two,
                    )
                )
                if status == 1:
                    candidate_count += 1
                    if candidate_count > _CUBIC_REDUCED_ENUMERATION_MAX_CANDIDATES:
                        return candidate_count
                    norm = _cubic_norm_form_value(
                        workspace,
                        coordinate_zero,
                        coordinate_one,
                        coordinate_two,
                    )
                    ignored_smooth = _cubic_plan_smooth_norm(
                        workspace,
                        group_count,
                        norm,
                    )
                coefficient_zero += 1
            coefficient_one += 1
        coefficient_two += 1
    return candidate_count


def _cubic_append_reduced_ideal_ellipsoid(
    workspace: NativeIntegerVector,
    basis_offset: uint64,
    transforms: FmpzMatrix,
    transform_row_offset: uint64,
    parameters: FmpzMatrix,
    parameter_row: uint64,
    relation_matrix: FmpzMatrix,
    relation_elements: FmpzMatrix,
    relation_count: uint64,
    relation_capacity: uint64,
    factor_count: uint64,
    group_count: uint64,
) -> tuple[uint64, uint64]:
    """Admit every bounded ellipsoid candidate through exact valuations."""
    limit_zero = parameters[parameter_row, 7]
    limit_one = parameters[parameter_row, 8]
    limit_two = parameters[parameter_row, 9]
    candidate_count: uint64 = 0
    coefficient_two = -limit_two
    while coefficient_two <= limit_two:
        coefficient_one = -limit_one
        while coefficient_one <= limit_one:
            coefficient_zero = -limit_zero
            while coefficient_zero <= limit_zero:
                status, coordinate_zero, coordinate_one, coordinate_two = (
                    _cubic_reduced_ellipsoid_candidate(
                        workspace,
                        basis_offset,
                        transforms,
                        transform_row_offset,
                        parameters,
                        parameter_row,
                        coefficient_zero,
                        coefficient_one,
                        coefficient_two,
                    )
                )
                if status == 1:
                    candidate_count += 1
                    if candidate_count > _CUBIC_REDUCED_ENUMERATION_MAX_CANDIDATES:
                        overflow_relation_count: uint64 = relation_capacity
                        overflow_relation_count += 1
                        return (overflow_relation_count, candidate_count)
                    relation_count = _cubic_append_smooth_principal_relation(
                        workspace,
                        relation_matrix,
                        relation_elements,
                        relation_count,
                        relation_capacity,
                        factor_count,
                        group_count,
                        coordinate_zero,
                        coordinate_one,
                        coordinate_two,
                    )
                    if relation_count > relation_capacity:
                        return (relation_count, candidate_count)
                coefficient_zero += 1
            coefficient_one += 1
        coefficient_two += 1
    return (relation_count, candidate_count)


@native
def _cubic_copy_relation_support_tail(
    relation_matrix: FmpzMatrix,
    relation_elements: FmpzMatrix,
    relation_support: FmpzMatrix,
    relation_count: uint64,
    factor_count: uint64,
    tail_start: uint64,
    target_matrix: FmpzMatrix,
    target_elements: FmpzMatrix,
) -> uint64:
    """Copy canonical class support followed by a redundant witness tail."""
    target_row: uint64 = 0
    copy_pass: uint64 = 0
    while copy_pass < 2:
        source_row: uint64 = 0
        if copy_pass == 1:
            source_row = tail_start
        while source_row < relation_count:
            copy_support_row = copy_pass == 0 and relation_support[source_row, 0] != 0
            copy_tail_row = copy_pass == 1 and relation_support[source_row, 0] == 0
            if copy_support_row or copy_tail_row:
                column: uint64 = 0
                while column < factor_count:
                    target_matrix[target_row, column] = relation_matrix[
                        source_row, column
                    ]
                    column += 1
                coordinate: uint64 = 0
                while coordinate < 3:
                    target_elements[target_row, coordinate] = relation_elements[
                        source_row, coordinate
                    ]
                    coordinate += 1
                target_row += 1
            source_row += 1
        copy_pass += 1
    return target_row


def _cubic_relation_prefix_has_archimedean_unit(
    log_numerators: FmpzMatrix,
    log_denominators: FmpzMatrix,
    log_endpoints: FmpzMatrix,
    workspace: NativeIntegerVector,
    coefficients: IntegerBuffer,
    relation_candidates: FmpzMatrix,
    relation_elements: FmpzMatrix,
    relation_count: uint64,
    factor_count: uint64,
    denominator: int,
    basis_zero_zero: int,
    basis_zero_one: int,
    basis_zero_two: int,
    basis_one_one: int,
    basis_one_two: int,
    basis_two_two: int,
    analytic_scale: int,
    analytic_precision: uint64,
    prefix_matrix: FmpzMatrix,
    prefix_hnf: FmpzMatrix,
    prefix_transform: FmpzMatrix,
    prefix_dependencies: FmpzMatrix,
    prefix_dependencies_reduced: FmpzMatrix,
    prefix_dependency_transform: FmpzMatrix,
    prefix_logs: FmpzMatrix,
    prefix_unit_combinations: FmpzMatrix,
    prefix_unit_result: FmpzMatrix,
) -> int:
    """Return whether a relation prefix proves a non-torsion exact unit.

    The return value is `1` when the exact unit was reconstructed into
    `prefix_unit_result`, `0` when the prefix has incomplete relation rank or
    no reconstructible dependency, and `-1` for an invalid exact computation.
    The analytic index proof still independently certifies whichever relation
    set and unit are selected.
    """
    if relation_count < factor_count:
        return 0
    relation_row: uint64 = 0
    while relation_row < relation_count:
        factor_index: uint64 = 0
        while factor_index < factor_count:
            prefix_matrix[relation_row, factor_index] = relation_candidates[
                relation_row, factor_index
            ]
            factor_index += 1
        relation_row += 1
    if not fmpz_matrix_hnf_transform(
        prefix_hnf,
        prefix_transform,
        prefix_matrix,
    ):
        return -1
    relation_rank: uint64 = 0
    relation_row = 0
    while relation_row < relation_count:
        row_nonzero = False
        factor_index = 0
        while factor_index < factor_count:
            if prefix_hnf[relation_row, factor_index] != 0:
                row_nonzero = True
            factor_index += 1
        if row_nonzero:
            relation_rank += 1
        relation_row += 1
    if relation_rank != factor_count or relation_rank >= relation_count:
        return 0

    dependency_count: uint64 = relation_count - relation_rank
    dependency_row: uint64 = 0
    while dependency_row < dependency_count:
        relation_index: uint64 = 0
        while relation_index < relation_count:
            prefix_dependencies[dependency_row, relation_index] = prefix_transform[
                relation_rank + dependency_row, relation_index
            ]
            relation_index += 1
        dependency_row += 1
    if not fmpz_matrix_lll_transform(
        prefix_dependencies_reduced,
        prefix_dependency_transform,
        prefix_dependencies,
    ):
        return -1

    coefficient_bits: uint64 = 0
    dependency_row = 0
    while dependency_row < dependency_count:
        relation_index = 0
        while relation_index < relation_count:
            candidate_bits = _cubic_bounded_bit_length(
                prefix_dependencies_reduced[dependency_row, relation_index],
                512,
            )
            if candidate_bits > 512:
                return -1
            if candidate_bits > coefficient_bits:
                coefficient_bits = candidate_bits
            relation_index += 1
        dependency_row += 1
    dependency_scale = analytic_scale
    precision_extra: uint64 = 2 * coefficient_bits + 64
    precision_index: uint64 = 0
    while precision_index < precision_extra:
        dependency_scale *= 2
        precision_index += 1
    dependency_precision: uint64 = analytic_precision + precision_extra

    relation_index: uint64 = 0
    while relation_index < relation_count:
        witness_log_lower, witness_log_upper = _cubic_real_log_bounds(
            log_numerators,
            log_denominators,
            log_endpoints,
            coefficients,
            denominator,
            basis_zero_zero,
            basis_zero_one,
            basis_zero_two,
            basis_one_one,
            basis_one_two,
            basis_two_two,
            relation_elements[relation_index, 0],
            relation_elements[relation_index, 1],
            relation_elements[relation_index, 2],
            dependency_scale,
            dependency_precision,
        )
        if witness_log_upper < witness_log_lower:
            return -1
        prefix_logs[relation_index, 0] = witness_log_lower
        prefix_logs[relation_index, 1] = witness_log_upper
        relation_index += 1

    unit_candidate_found = False
    best_regulator_lower = 0
    best_regulator_upper = 0
    dependency_row = 0
    while dependency_row < dependency_count:
        dependency_log_lower = 0
        dependency_log_upper = 0
        dependency_nonzero = False
        relation_index = 0
        while relation_index < relation_count:
            dependency_exponent = prefix_dependencies_reduced[
                dependency_row, relation_index
            ]
            if dependency_exponent != 0:
                dependency_nonzero = True
                witness_log_lower = prefix_logs[relation_index, 0]
                witness_log_upper = prefix_logs[relation_index, 1]
                if dependency_exponent > 0:
                    dependency_log_lower += dependency_exponent * witness_log_lower
                    dependency_log_upper += dependency_exponent * witness_log_upper
                else:
                    dependency_log_lower += dependency_exponent * witness_log_upper
                    dependency_log_upper += dependency_exponent * witness_log_lower
            relation_index += 1
        dependency_orientation = 0
        dependency_regulator_lower = dependency_log_lower
        dependency_regulator_upper = dependency_log_upper
        if dependency_log_lower > 0:
            dependency_orientation = 1
        elif dependency_log_upper < 0:
            dependency_orientation = -1
            dependency_regulator_lower = -dependency_log_upper
            dependency_regulator_upper = -dependency_log_lower
        if dependency_nonzero and dependency_orientation != 0:
            relation_index = 0
            while relation_index < relation_count:
                prefix_unit_combinations[1, relation_index] = (
                    dependency_orientation
                    * prefix_dependencies_reduced[dependency_row, relation_index]
                )
                relation_index += 1
            if not unit_candidate_found:
                relation_index = 0
                while relation_index < relation_count:
                    prefix_unit_combinations[0, relation_index] = (
                        prefix_unit_combinations[1, relation_index]
                    )
                    relation_index += 1
                unit_candidate_found = True
                best_regulator_lower = dependency_regulator_lower
                best_regulator_upper = dependency_regulator_upper
            else:
                candidate_middle = (
                    dependency_regulator_lower + dependency_regulator_upper
                )
                best_middle = best_regulator_lower + best_regulator_upper
                if candidate_middle < best_middle:
                    relation_index = 0
                    while relation_index < relation_count:
                        saved_exponent = prefix_unit_combinations[0, relation_index]
                        prefix_unit_combinations[0, relation_index] = (
                            prefix_unit_combinations[1, relation_index]
                        )
                        prefix_unit_combinations[1, relation_index] = saved_exponent
                        relation_index += 1
                    saved_lower = best_regulator_lower
                    saved_upper = best_regulator_upper
                    best_regulator_lower = dependency_regulator_lower
                    best_regulator_upper = dependency_regulator_upper
                    dependency_regulator_lower = saved_lower
                    dependency_regulator_upper = saved_upper
                reduction_step: uint64 = 0
                reduction_active = True
                while reduction_active and reduction_step < 1024:
                    candidate_middle = (
                        dependency_regulator_lower + dependency_regulator_upper
                    )
                    best_middle = best_regulator_lower + best_regulator_upper
                    reduction_quotient = (
                        candidate_middle + best_middle // 2
                    ) // best_middle
                    if reduction_quotient < 1:
                        reduction_quotient = 1
                    remainder_lower = (
                        dependency_regulator_lower
                        - reduction_quotient * best_regulator_upper
                    )
                    remainder_upper = (
                        dependency_regulator_upper
                        - reduction_quotient * best_regulator_lower
                    )
                    remainder_orientation = 0
                    if remainder_lower > 0:
                        remainder_orientation = 1
                    elif remainder_upper < 0:
                        remainder_orientation = -1
                        saved_lower = remainder_lower
                        remainder_lower = -remainder_upper
                        remainder_upper = -saved_lower
                    if (
                        remainder_orientation == 0
                        or remainder_upper >= best_regulator_lower
                    ):
                        reduction_active = False
                    else:
                        relation_index = 0
                        while relation_index < relation_count:
                            best_exponent = prefix_unit_combinations[0, relation_index]
                            candidate_exponent = prefix_unit_combinations[
                                1, relation_index
                            ]
                            remainder_exponent = remainder_orientation * (
                                candidate_exponent - reduction_quotient * best_exponent
                            )
                            prefix_unit_combinations[0, relation_index] = (
                                remainder_exponent
                            )
                            prefix_unit_combinations[1, relation_index] = best_exponent
                            relation_index += 1
                        dependency_regulator_lower = best_regulator_lower
                        dependency_regulator_upper = best_regulator_upper
                        best_regulator_lower = remainder_lower
                        best_regulator_upper = remainder_upper
                    reduction_step += 1
        dependency_row += 1
    if not unit_candidate_found:
        return 0

    (
        reconstruction_status,
        reconstructed_zero,
        reconstructed_one,
        reconstructed_two,
    ) = _cubic_reconstruct_archimedean_unit(
        workspace,
        coefficients,
        denominator,
        basis_zero_zero,
        basis_zero_one,
        basis_zero_two,
        basis_one_one,
        basis_one_two,
        basis_two_two,
        relation_elements,
        prefix_unit_combinations,
        relation_count,
        best_regulator_lower,
        best_regulator_upper,
        analytic_scale,
        dependency_scale,
    )
    if reconstruction_status != 1:
        return 0
    reconstructed_regulator_lower, reconstructed_regulator_upper = (
        _cubic_regulator_bounds(
            log_numerators,
            log_denominators,
            log_endpoints,
            coefficients,
            denominator,
            basis_zero_zero,
            basis_zero_one,
            basis_zero_two,
            basis_one_one,
            basis_one_two,
            basis_two_two,
            reconstructed_zero,
            reconstructed_one,
            reconstructed_two,
            analytic_scale,
            analytic_precision,
        )
    )
    dependency_scale_quotient = dependency_scale // analytic_scale
    if (
        reconstructed_regulator_lower <= 0
        or reconstructed_regulator_upper < reconstructed_regulator_lower
        or reconstructed_regulator_lower * dependency_scale_quotient
        > best_regulator_upper
        or (
            best_regulator_lower
            > reconstructed_regulator_upper * dependency_scale_quotient
        )
    ):
        return 0
    prefix_unit_result[0, 0] = reconstructed_zero
    prefix_unit_result[0, 1] = reconstructed_one
    prefix_unit_result[0, 2] = reconstructed_two
    prefix_unit_result[0, 3] = reconstructed_regulator_lower
    prefix_unit_result[0, 4] = reconstructed_regulator_upper
    return 1


def _cubic_plan_reduced_ideal_shell(
    workspace: NativeIntegerVector,
    embedding_source: FmpzMatrix,
    embedding_reduced: FmpzMatrix,
    embedding_transform: FmpzMatrix,
    transforms: FmpzMatrix,
    transform_row_offset: uint64,
    basis_offset: uint64,
    basis_zero_zero: int,
    basis_zero_one: int,
    basis_zero_two: int,
    basis_one_one: int,
    basis_one_two: int,
    basis_two_two: int,
    real_root: int,
    complex_real_root: int,
    complex_imaginary_root: int,
    scale: int,
    group_count: uint64,
) -> uint64:
    """Plan and retain the best four-direction shell for one exact ideal."""
    if not _cubic_fill_ideal_t2_embedding(
        embedding_source,
        workspace,
        basis_offset,
        basis_zero_zero,
        basis_zero_one,
        basis_zero_two,
        basis_one_one,
        basis_one_two,
        basis_two_two,
        real_root,
        complex_real_root,
        complex_imaginary_root,
        scale,
    ) or not fmpz_matrix_lll_transform(
        embedding_reduced,
        embedding_transform,
        embedding_source,
    ):
        return 0
    transform_row: uint64 = 0
    while transform_row < 3:
        transform_column: uint64 = 0
        while transform_column < 3:
            transforms[transform_row_offset + transform_row, transform_column] = (
                embedding_transform[transform_row, transform_column]
            )
            transform_column += 1
        transform_row += 1

    best_score = -1
    best_pair: uint64 = 0
    pair: uint64 = 0
    while pair < 3:
        first: uint64 = 0
        second: uint64 = 1
        if pair == 1:
            second = 2
        elif pair == 2:
            first = 1
            second = 2
        score = 0
        direction: uint64 = 0
        while direction < 4:
            left = 1
            right = 0
            if direction == 1:
                left = 0
                right = 1
            elif direction == 2:
                right = 1
            elif direction == 3:
                left = -1
                right = 1
            coefficient_zero = 0
            coefficient_one = 0
            coefficient_two = 0
            if first == 0:
                coefficient_zero = left
            elif first == 1:
                coefficient_one = left
            else:
                coefficient_two = left
            if second == 0:
                coefficient_zero = right
            elif second == 1:
                coefficient_one = right
            else:
                coefficient_two = right
            coordinate_zero, coordinate_one, coordinate_two = (
                _cubic_transformed_ideal_coordinates(
                    workspace,
                    basis_offset,
                    transforms,
                    transform_row_offset,
                    coefficient_zero,
                    coefficient_one,
                    coefficient_two,
                )
            )
            norm = _cubic_norm_form_value(
                workspace,
                coordinate_zero,
                coordinate_one,
                coordinate_two,
            )
            if norm < 0:
                norm = -norm
            if _cubic_plan_smooth_norm(workspace, group_count, norm):
                score += 1
            direction += 1
        if score > best_score:
            best_score = score
            best_pair = pair
        pair += 1
    return best_pair + 1


def _cubic_reconstruct_archimedean_unit(
    workspace: NativeIntegerVector,
    coefficients: IntegerBuffer,
    denominator: int,
    basis_zero_zero: int,
    basis_zero_one: int,
    basis_zero_two: int,
    basis_one_one: int,
    basis_one_two: int,
    basis_two_two: int,
    relation_elements: FmpzMatrix,
    unit_combinations: FmpzMatrix,
    relation_count: uint64,
    regulator_lower: int,
    regulator_upper: int,
    analytic_scale: int,
    dependency_log_scale: int,
) -> tuple[int, int, int, int]:
    """Recover a compact exact unit from a reduced archimedean relation.

    This is the rank-one complex-cubic analogue of PARI's `getfu`: retain the
    relation product in compact exponent form, exponentiate only its normalized
    embeddings, solve the real embedding matrix, round once, and authenticate
    the resulting order coordinates exactly.
    """
    reconstruction_scale = analytic_scale * analytic_scale * analytic_scale
    if dependency_log_scale > reconstruction_scale:
        reconstruction_scale = dependency_log_scale

    root_bound = 1
    coefficient_index: uint64 = 0
    while coefficient_index < 3:
        candidate = coefficients[coefficient_index]
        if candidate < 0:
            candidate = -candidate
        if candidate + 1 > root_bound:
            root_bound = candidate + 1
        coefficient_index += 1
    root_lower = -root_bound * reconstruction_scale
    root_upper = root_bound * reconstruction_scale
    lower_value = _cubic_scaled_polynomial_value(
        coefficients,
        root_lower,
        reconstruction_scale,
    )
    upper_value = _cubic_scaled_polynomial_value(
        coefficients,
        root_upper,
        reconstruction_scale,
    )
    if lower_value >= 0 or upper_value <= 0:
        return (10, 0, 0, 0)
    bisections: uint64 = 0
    while root_upper - root_lower > 1 and bisections < 1024:
        root_middle = (root_lower + root_upper) // 2
        middle_value = _cubic_scaled_polynomial_value(
            coefficients,
            root_middle,
            reconstruction_scale,
        )
        if middle_value < 0:
            root_lower = root_middle
        elif middle_value > 0:
            root_upper = root_middle
        else:
            root_lower = root_middle
            root_upper = root_middle
        bisections += 1
    if root_upper - root_lower > 1:
        return (11, 0, 0, 0)
    real_root = (root_lower + root_upper) // 2
    complex_real_root = (-coefficients[2] * reconstruction_scale - real_root) // 2
    pair_norm = coefficients[1] * reconstruction_scale - _cubic_nearest_quotient(
        2 * real_root * complex_real_root,
        reconstruction_scale,
    )
    complex_imaginary_square = (
        pair_norm * reconstruction_scale - complex_real_root * complex_real_root
    )
    if complex_imaginary_square <= 0:
        return (12, 0, 0, 0)
    complex_imaginary_root = _cubic_floor_sqrt(complex_imaginary_square)
    if complex_imaginary_root <= 0:
        return (13, 0, 0, 0)

    phase_real = reconstruction_scale
    phase_imaginary = 0
    real_sign = 1
    relation_index: uint64 = 0
    while relation_index < relation_count:
        exponent = unit_combinations[0, relation_index]
        if exponent != 0:
            element_zero = relation_elements[relation_index, 0]
            element_one = relation_elements[relation_index, 1]
            element_two = relation_elements[relation_index, 2]
            raw_zero = element_zero * basis_zero_zero
            raw_one = element_zero * basis_zero_one + element_one * basis_one_one
            raw_two = (
                element_zero * basis_zero_two
                + element_one * basis_one_two
                + element_two * basis_two_two
            )
            element_real_value, ignored_imaginary = _cubic_fixed_polynomial_embedding(
                raw_zero,
                raw_one,
                raw_two,
                real_root,
                0,
                reconstruction_scale,
            )
            element_complex_real, element_complex_imaginary = (
                _cubic_fixed_polynomial_embedding(
                    raw_zero,
                    raw_one,
                    raw_two,
                    complex_real_root,
                    complex_imaginary_root,
                    reconstruction_scale,
                )
            )
            phase_norm = _cubic_floor_sqrt(
                element_complex_real * element_complex_real
                + element_complex_imaginary * element_complex_imaginary
            )
            if element_real_value == 0 or phase_norm <= 0:
                return (14, 0, 0, 0)
            absolute_exponent = exponent
            if absolute_exponent < 0:
                absolute_exponent = -absolute_exponent
                element_complex_imaginary = -element_complex_imaginary
            if element_real_value < 0 and absolute_exponent % 2 == 1:
                real_sign = -real_sign
            power_real = _cubic_nearest_quotient(
                element_complex_real * reconstruction_scale,
                phase_norm,
            )
            power_imaginary = _cubic_nearest_quotient(
                element_complex_imaginary * reconstruction_scale,
                phase_norm,
            )
            while absolute_exponent > 0:
                if absolute_exponent % 2 == 1:
                    phase_real, phase_imaginary = _cubic_complex_multiply_fixed(
                        phase_real,
                        phase_imaginary,
                        power_real,
                        power_imaginary,
                        reconstruction_scale,
                    )
                absolute_exponent //= 2
                if absolute_exponent > 0:
                    power_real, power_imaginary = _cubic_complex_multiply_fixed(
                        power_real,
                        power_imaginary,
                        power_real,
                        power_imaginary,
                        reconstruction_scale,
                    )
        relation_index += 1

    phase_norm = _cubic_floor_sqrt(
        phase_real * phase_real + phase_imaginary * phase_imaginary
    )
    if phase_norm <= 0:
        return (15, 0, 0, 0)
    phase_real = _cubic_nearest_quotient(
        phase_real * reconstruction_scale,
        phase_norm,
    )
    phase_imaginary = _cubic_nearest_quotient(
        phase_imaginary * reconstruction_scale,
        phase_norm,
    )

    regulator_middle = (regulator_lower + regulator_upper) // 2
    scaled_regulator = _cubic_nearest_quotient(
        regulator_middle * reconstruction_scale,
        dependency_log_scale,
    )
    log_two_lower, log_two_upper = _cubic_atanh_log_bounds(
        1,
        3,
        reconstruction_scale,
    )
    if scaled_regulator <= 0 or log_two_upper < log_two_lower:
        return (16, 0, 0, 0)
    log_two_middle = (log_two_lower + log_two_upper) // 2
    two_exponent: uint64 = 0
    while (
        scaled_regulator >= log_two_middle
        and two_exponent < _CUBIC_ARCHIMEDEAN_EXPONENT_LIMIT
    ):
        scaled_regulator -= log_two_middle
        two_exponent += 1
    if scaled_regulator >= log_two_middle:
        return (17, 0, 0, 0)
    exponential = reconstruction_scale
    exponential_term = reconstruction_scale
    series_index: uint64 = 1
    while series_index < 1024 and exponential_term != 0:
        exponential_term = _cubic_nearest_quotient(
            exponential_term * scaled_regulator,
            reconstruction_scale * series_index,
        )
        exponential += exponential_term
        series_index += 1
    while two_exponent > 0:
        exponential *= 2
        two_exponent -= 1
    real_target = real_sign * exponential
    complex_magnitude_square = (
        reconstruction_scale
        * reconstruction_scale
        * reconstruction_scale
        // exponential
    )
    complex_magnitude = _cubic_floor_sqrt(complex_magnitude_square)
    if complex_magnitude <= 0:
        return (18, 0, 0, 0)
    complex_target_real = _cubic_nearest_quotient(
        phase_real * complex_magnitude,
        reconstruction_scale,
    )
    complex_target_imaginary = _cubic_nearest_quotient(
        phase_imaginary * complex_magnitude,
        reconstruction_scale,
    )

    basis_zero_real, ignored_imaginary = _cubic_fixed_polynomial_embedding(
        basis_zero_zero,
        basis_zero_one,
        basis_zero_two,
        real_root,
        0,
        reconstruction_scale,
    )
    basis_one_real, ignored_imaginary = _cubic_fixed_polynomial_embedding(
        0,
        basis_one_one,
        basis_one_two,
        real_root,
        0,
        reconstruction_scale,
    )
    basis_two_real, ignored_imaginary = _cubic_fixed_polynomial_embedding(
        0,
        0,
        basis_two_two,
        real_root,
        0,
        reconstruction_scale,
    )
    basis_zero_complex_real, basis_zero_complex_imaginary = (
        _cubic_fixed_polynomial_embedding(
            basis_zero_zero,
            basis_zero_one,
            basis_zero_two,
            complex_real_root,
            complex_imaginary_root,
            reconstruction_scale,
        )
    )
    basis_one_complex_real, basis_one_complex_imaginary = (
        _cubic_fixed_polynomial_embedding(
            0,
            basis_one_one,
            basis_one_two,
            complex_real_root,
            complex_imaginary_root,
            reconstruction_scale,
        )
    )
    basis_two_complex_real, basis_two_complex_imaginary = (
        _cubic_fixed_polynomial_embedding(
            0,
            0,
            basis_two_two,
            complex_real_root,
            complex_imaginary_root,
            reconstruction_scale,
        )
    )
    target_real = denominator * real_target
    target_complex_real = denominator * complex_target_real
    target_complex_imaginary = denominator * complex_target_imaginary
    embedding_determinant = _cubic_determinant_three(
        basis_zero_real,
        basis_one_real,
        basis_two_real,
        basis_zero_complex_real,
        basis_one_complex_real,
        basis_two_complex_real,
        basis_zero_complex_imaginary,
        basis_one_complex_imaginary,
        basis_two_complex_imaginary,
    )
    if embedding_determinant == 0:
        return (19, 0, 0, 0)
    unit_zero = _cubic_nearest_quotient(
        _cubic_determinant_three(
            target_real,
            basis_one_real,
            basis_two_real,
            target_complex_real,
            basis_one_complex_real,
            basis_two_complex_real,
            target_complex_imaginary,
            basis_one_complex_imaginary,
            basis_two_complex_imaginary,
        ),
        embedding_determinant,
    )
    unit_one = _cubic_nearest_quotient(
        _cubic_determinant_three(
            basis_zero_real,
            target_real,
            basis_two_real,
            basis_zero_complex_real,
            target_complex_real,
            basis_two_complex_real,
            basis_zero_complex_imaginary,
            target_complex_imaginary,
            basis_two_complex_imaginary,
        ),
        embedding_determinant,
    )
    unit_two = _cubic_nearest_quotient(
        _cubic_determinant_three(
            basis_zero_real,
            basis_one_real,
            target_real,
            basis_zero_complex_real,
            basis_one_complex_real,
            target_complex_real,
            basis_zero_complex_imaginary,
            basis_one_complex_imaginary,
            target_complex_imaginary,
        ),
        embedding_determinant,
    )
    exact_norm = _cubic_norm_form_value(
        workspace,
        unit_zero,
        unit_one,
        unit_two,
    )
    if exact_norm != 1 and exact_norm != -1:
        # Status 2 is a private fail-closed diagnostic: the embedding solve
        # produced integral coordinates, but exact norm authentication rejected
        # them.  Callers must never publish this candidate.
        return (2, unit_zero, unit_one, unit_two)
    return (1, unit_zero, unit_one, unit_two)


def _cubic_coordinate_trace(
    workspace: NativeIntegerVector,
    coordinate_zero: int,
    coordinate_one: int,
    coordinate_two: int,
) -> int:
    """Return the exact field trace from the resident multiplication table."""
    return (
        coordinate_zero
        * (
            workspace[_MULTIPLICATION_OFFSET]
            + workspace[_MULTIPLICATION_OFFSET + 4]
            + workspace[_MULTIPLICATION_OFFSET + 8]
        )
        + coordinate_one
        * (
            workspace[_MULTIPLICATION_OFFSET + 9]
            + workspace[_MULTIPLICATION_OFFSET + 13]
            + workspace[_MULTIPLICATION_OFFSET + 17]
        )
        + coordinate_two
        * (
            workspace[_MULTIPLICATION_OFFSET + 18]
            + workspace[_MULTIPLICATION_OFFSET + 22]
            + workspace[_MULTIPLICATION_OFFSET + 26]
        )
    )


@native
def _cubic_floor_fifth_root(value: int) -> int:
    """Return the nonnegative floor fifth root by a bounded exact search."""
    if value < 0:
        return -1
    if value < 2:
        return value
    lower = 0
    upper = 1
    doubling_steps: uint64 = 0
    while upper * upper * upper * upper * upper <= value:
        upper *= 2
        doubling_steps += 1
        if doubling_steps > 1024:
            return -1
    bisection_steps: uint64 = 0
    while upper - lower > 1:
        middle = (lower + upper) // 2
        middle_fifth = middle * middle * middle * middle * middle
        if middle_fifth <= value:
            lower = middle
        else:
            upper = middle
        bisection_steps += 1
        if bisection_steps > 1024:
            return -1
    return lower


def _cubic_exact_unit_fifth_root(
    workspace: NativeIntegerVector,
    coefficients: IntegerBuffer,
    denominator: int,
    basis_zero_zero: int,
    basis_zero_one: int,
    basis_zero_two: int,
    basis_one_one: int,
    basis_one_two: int,
    basis_two_two: int,
    identity_zero: int,
    identity_one: int,
    identity_two: int,
    unit_zero: int,
    unit_one: int,
    unit_two: int,
    scale: int,
) -> tuple[int, int, int, int]:
    """Recover an exact fifth root of a cubic unit when one is visible.

    For a putative root `v`, write its characteristic polynomial as
    `Y^3-tY^2+sY-n`.  The real embedding of `u=v^5` gives a tiny deterministic
    list of trace candidates `t`; Newton's identity

    `Tr(v^5)=t^5-5t^3s+5ts^2+5t^2n-5sn`

    then leaves only a bounded integral search for `s`.  In the formal cubic
    algebra generated by `v`, express `v` in the basis `1,u,u^2`, evaluate that
    expression in the resident order, and accept only after exact integral
    division, norm, and fifth-power replay.  Missing a root is never negative
    saturation evidence; it merely makes the closed program decline.
    """
    root_status, real_root, ignored_real, ignored_imaginary = (
        _cubic_complex_root_approximations(coefficients, scale)
    )
    if root_status != 1 or denominator <= 0:
        return (0, 0, 0, 0)
    raw_zero = unit_zero * basis_zero_zero
    raw_one = unit_zero * basis_zero_one + unit_one * basis_one_one
    raw_two = (
        unit_zero * basis_zero_two + unit_one * basis_one_two + unit_two * basis_two_two
    )
    unit_real_numerator, ignored_embedding = _cubic_fixed_polynomial_embedding(
        raw_zero,
        raw_one,
        raw_two,
        real_root,
        0,
        scale,
    )
    unit_real = _cubic_nearest_quotient(unit_real_numerator, denominator)
    if unit_real == 0:
        return (0, 0, 0, 0)
    absolute_unit_real = unit_real
    real_sign = 1
    if absolute_unit_real < 0:
        absolute_unit_real = -absolute_unit_real
        real_sign = -1
    scale_square = scale * scale
    real_root_fifth = _cubic_floor_fifth_root(
        absolute_unit_real * scale_square * scale_square
    )
    if real_root_fifth <= 0:
        return (0, 0, 0, 0)
    real_root_fifth *= real_sign
    trace_center = _cubic_nearest_quotient(real_root_fifth, scale)
    # The exact fifth-root approximation gives the bound needed for
    # `|s| <= 2*sqrt(|sigma(v)|)+1`.
    root_absolute_ceiling = real_root_fifth
    if root_absolute_ceiling < 0:
        root_absolute_ceiling = -root_absolute_ceiling
    root_absolute_ceiling = (root_absolute_ceiling + scale - 1) // scale
    second_symmetric_bound = 2 * _cubic_ceil_sqrt(root_absolute_ceiling) + 2
    if second_symmetric_bound < 2 or second_symmetric_bound > 4096:
        return (0, 0, 0, 0)

    unit_norm = _cubic_norm_form_value(
        workspace,
        unit_zero,
        unit_one,
        unit_two,
    )
    if unit_norm != 1 and unit_norm != -1:
        return (0, 0, 0, 0)
    unit_trace = _cubic_coordinate_trace(
        workspace,
        unit_zero,
        unit_one,
        unit_two,
    )
    if not _cubic_multiply_coordinates(
        workspace,
        unit_zero,
        unit_one,
        unit_two,
        unit_zero,
        unit_one,
        unit_two,
        _MAP_SCRATCH_OFFSET,
    ):
        return (0, 0, 0, 0)
    unit_square_zero = workspace[_MAP_SCRATCH_OFFSET]
    unit_square_one = workspace[_MAP_SCRATCH_OFFSET + 1]
    unit_square_two = workspace[_MAP_SCRATCH_OFFSET + 2]

    trace_delta = -4
    while trace_delta <= 4:
        root_trace = trace_center + trace_delta
        trace_square = root_trace * root_trace
        trace_cube = trace_square * root_trace
        trace_fifth = trace_cube * trace_square
        second_symmetric = -second_symmetric_bound
        while second_symmetric <= second_symmetric_bound:
            second_square = second_symmetric * second_symmetric
            if (
                trace_fifth
                - 5 * trace_cube * second_symmetric
                + 5 * root_trace * second_square
                + 5 * trace_square * unit_norm
                - 5 * second_symmetric * unit_norm
                == unit_trace
            ):
                formal_square_coefficient = (
                    trace_cube - 2 * root_trace * second_symmetric + unit_norm
                )
                formal_linear_coefficient = (
                    -trace_square * second_symmetric
                    + second_square
                    + root_trace * unit_norm
                )
                formal_constant_coefficient = unit_norm * (
                    trace_square - second_symmetric
                )
                formal_raw_zero = (
                    formal_constant_coefficient * formal_constant_coefficient
                )
                formal_raw_one = (
                    2 * formal_constant_coefficient * formal_linear_coefficient
                )
                formal_raw_two = (
                    2 * formal_constant_coefficient * formal_square_coefficient
                    + formal_linear_coefficient * formal_linear_coefficient
                )
                formal_raw_three = (
                    2 * formal_linear_coefficient * formal_square_coefficient
                )
                formal_raw_four = formal_square_coefficient * formal_square_coefficient
                formal_unit_square_zero = (
                    formal_raw_zero
                    + unit_norm * formal_raw_three
                    + root_trace * unit_norm * formal_raw_four
                )
                formal_unit_square_one = (
                    formal_raw_one
                    - second_symmetric * formal_raw_three
                    + (unit_norm - root_trace * second_symmetric) * formal_raw_four
                )
                formal_unit_square_two = (
                    formal_raw_two
                    + root_trace * formal_raw_three
                    + (trace_square - second_symmetric) * formal_raw_four
                )
                determinant = (
                    formal_linear_coefficient * formal_unit_square_two
                    - formal_square_coefficient * formal_unit_square_one
                )
                if determinant != 0:
                    constant_numerator = (
                        -formal_constant_coefficient * formal_unit_square_two
                        + formal_square_coefficient * formal_unit_square_zero
                    )
                    linear_numerator = formal_unit_square_two
                    square_numerator = -formal_square_coefficient
                    candidate_zero_numerator = (
                        constant_numerator * identity_zero
                        + linear_numerator * unit_zero
                        + square_numerator * unit_square_zero
                    )
                    candidate_one_numerator = (
                        constant_numerator * identity_one
                        + linear_numerator * unit_one
                        + square_numerator * unit_square_one
                    )
                    candidate_two_numerator = (
                        constant_numerator * identity_two
                        + linear_numerator * unit_two
                        + square_numerator * unit_square_two
                    )
                    if (
                        candidate_zero_numerator % determinant == 0
                        and candidate_one_numerator % determinant == 0
                        and candidate_two_numerator % determinant == 0
                    ):
                        candidate_zero = candidate_zero_numerator // determinant
                        candidate_one = candidate_one_numerator // determinant
                        candidate_two = candidate_two_numerator // determinant
                        candidate_norm = _cubic_norm_form_value(
                            workspace,
                            candidate_zero,
                            candidate_one,
                            candidate_two,
                        )
                        if candidate_norm == unit_norm:
                            if not _cubic_multiply_coordinates(
                                workspace,
                                candidate_zero,
                                candidate_one,
                                candidate_two,
                                candidate_zero,
                                candidate_one,
                                candidate_two,
                                _MAP_SCRATCH_OFFSET,
                            ):
                                return (0, 0, 0, 0)
                            if not _cubic_multiply_coordinates(
                                workspace,
                                workspace[_MAP_SCRATCH_OFFSET],
                                workspace[_MAP_SCRATCH_OFFSET + 1],
                                workspace[_MAP_SCRATCH_OFFSET + 2],
                                workspace[_MAP_SCRATCH_OFFSET],
                                workspace[_MAP_SCRATCH_OFFSET + 1],
                                workspace[_MAP_SCRATCH_OFFSET + 2],
                                _MAP_SCRATCH_OFFSET + 3,
                            ):
                                return (0, 0, 0, 0)
                            if not _cubic_multiply_coordinates(
                                workspace,
                                workspace[_MAP_SCRATCH_OFFSET + 3],
                                workspace[_MAP_SCRATCH_OFFSET + 4],
                                workspace[_MAP_SCRATCH_OFFSET + 5],
                                candidate_zero,
                                candidate_one,
                                candidate_two,
                                _MAP_SCRATCH_OFFSET + 6,
                            ):
                                return (0, 0, 0, 0)
                            if (
                                workspace[_MAP_SCRATCH_OFFSET + 6] == unit_zero
                                and workspace[_MAP_SCRATCH_OFFSET + 7] == unit_one
                                and workspace[_MAP_SCRATCH_OFFSET + 8] == unit_two
                            ):
                                return (
                                    1,
                                    candidate_zero,
                                    candidate_one,
                                    candidate_two,
                                )
            second_symmetric += 1
        trace_delta += 1
    return (0, 0, 0, 0)


def _cubic_exact_unit_square_root(
    workspace: NativeIntegerVector,
    coefficients: IntegerBuffer,
    denominator: int,
    basis_zero_zero: int,
    basis_zero_one: int,
    basis_zero_two: int,
    basis_one_one: int,
    basis_one_two: int,
    basis_two_two: int,
    identity_zero: int,
    identity_one: int,
    identity_two: int,
    unit_zero: int,
    unit_one: int,
    unit_two: int,
    scale: int,
    exact_rows: FmpzMatrix,
) -> tuple[int, int, int, int]:
    """Recover an exact square root of `u` or `-u` in a cubic order.

    If `v^2=z`, the elementary symmetric functions of `v` satisfy

    `(t^2-Tr(z))^2 - 8*n*t - 4*e2(z) = 0`,

    where `t=Tr(v)` and `n=Norm(v)` is `+1` or `-1`.  Once those integers are
    known, Cayley--Hamilton gives `v=(t*z+n)/(z+s)` with
    `s=(t^2-Tr(z))/2`.  We try both torsion translates of the retained unit,
    solve the quotient in the resident order, and accept only exact squares.
    """
    root_status, real_root, ignored_real, ignored_imaginary = (
        _cubic_complex_root_approximations(coefficients, scale)
    )
    if root_status != 1 or denominator <= 0:
        return (0, 0, 0, 0)
    torsion_sign = -1
    while torsion_sign <= 1:
        if torsion_sign != 0:
            target_zero = torsion_sign * unit_zero
            target_one = torsion_sign * unit_one
            target_two = torsion_sign * unit_two
            raw_zero = target_zero * basis_zero_zero
            raw_one = target_zero * basis_zero_one + target_one * basis_one_one
            raw_two = (
                target_zero * basis_zero_two
                + target_one * basis_one_two
                + target_two * basis_two_two
            )
            target_real_numerator, ignored_embedding = (
                _cubic_fixed_polynomial_embedding(
                    raw_zero,
                    raw_one,
                    raw_two,
                    real_root,
                    0,
                    scale,
                )
            )
            target_real = _cubic_nearest_quotient(
                target_real_numerator,
                denominator,
            )
            if target_real > 0:
                square_root_real = _cubic_floor_sqrt(target_real * scale)
                if square_root_real > 0:
                    trace_center = _cubic_nearest_quotient(
                        square_root_real,
                        scale,
                    )
                    target_trace = _cubic_coordinate_trace(
                        workspace,
                        target_zero,
                        target_one,
                        target_two,
                    )
                    if not _cubic_multiply_coordinates(
                        workspace,
                        target_zero,
                        target_one,
                        target_two,
                        target_zero,
                        target_one,
                        target_two,
                        _MAP_SCRATCH_OFFSET,
                    ):
                        return (0, 0, 0, 0)
                    target_square_trace = _cubic_coordinate_trace(
                        workspace,
                        workspace[_MAP_SCRATCH_OFFSET],
                        workspace[_MAP_SCRATCH_OFFSET + 1],
                        workspace[_MAP_SCRATCH_OFFSET + 2],
                    )
                    target_second_numerator = (
                        target_trace * target_trace - target_square_trace
                    )
                    if target_second_numerator % 2 == 0:
                        target_second = target_second_numerator // 2
                        trace_delta = -4
                        while trace_delta <= 4:
                            root_trace = trace_center + trace_delta
                            root_second_numerator = (
                                root_trace * root_trace - target_trace
                            )
                            if root_second_numerator % 2 == 0:
                                root_second = root_second_numerator // 2
                                root_norm = -1
                                while root_norm <= 1:
                                    if root_norm != 0 and (
                                        root_second_numerator * root_second_numerator
                                        - 8 * root_norm * root_trace
                                        - 4 * target_second
                                        == 0
                                    ):
                                        exact_rows[0, 0] = (
                                            root_trace * target_zero
                                            + root_norm * identity_zero
                                        )
                                        exact_rows[0, 1] = (
                                            root_trace * target_one
                                            + root_norm * identity_one
                                        )
                                        exact_rows[0, 2] = (
                                            root_trace * target_two
                                            + root_norm * identity_two
                                        )
                                        exact_rows[1, 0] = (
                                            target_zero + root_second * identity_zero
                                        )
                                        exact_rows[1, 1] = (
                                            target_one + root_second * identity_one
                                        )
                                        exact_rows[1, 2] = (
                                            target_two + root_second * identity_two
                                        )
                                        if _cubic_matrix_exact_quotient_coordinates(
                                            workspace,
                                            exact_rows,
                                            0,
                                            1,
                                            2,
                                            3,
                                        ):
                                            candidate_zero = exact_rows[2, 0]
                                            candidate_one = exact_rows[2, 1]
                                            candidate_two = exact_rows[2, 2]
                                            candidate_norm = _cubic_norm_form_value(
                                                workspace,
                                                candidate_zero,
                                                candidate_one,
                                                candidate_two,
                                            )
                                            if candidate_norm == root_norm:
                                                if not _cubic_multiply_coordinates(
                                                    workspace,
                                                    candidate_zero,
                                                    candidate_one,
                                                    candidate_two,
                                                    candidate_zero,
                                                    candidate_one,
                                                    candidate_two,
                                                    _MAP_SCRATCH_OFFSET,
                                                ):
                                                    return (0, 0, 0, 0)
                                                if (
                                                    workspace[_MAP_SCRATCH_OFFSET]
                                                    == target_zero
                                                    and workspace[
                                                        _MAP_SCRATCH_OFFSET + 1
                                                    ]
                                                    == target_one
                                                    and workspace[
                                                        _MAP_SCRATCH_OFFSET + 2
                                                    ]
                                                    == target_two
                                                ):
                                                    return (
                                                        1,
                                                        candidate_zero,
                                                        candidate_one,
                                                        candidate_two,
                                                    )
                                    root_norm += 2
                            trace_delta += 1
        torsion_sign += 2
    return (0, 0, 0, 0)


@native
def _cubic_bf_tail_bounds(
    endpoints: FmpzMatrix,
    scale: int,
) -> tuple[int, int]:
    """Replay the explicit degree-three Belabas--Friedman tail bound."""
    log_threshold_lower = endpoints[0, 0]
    log_threshold_upper = endpoints[1, 0]
    sqrt_threshold_lower = endpoints[2, 0]
    sqrt_threshold_upper = endpoints[3, 0]
    log_ninth_lower = endpoints[4, 0]
    log_ninth_upper = endpoints[5, 0]
    log_three_threshold_lower = endpoints[8, 0]
    log_three_threshold_upper = endpoints[9, 0]
    log_discriminant_lower = endpoints[12, 0]
    log_discriminant_upper = endpoints[13, 0]
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


def _cubic_bf_finite_bounds(
    workspace: NativeIntegerVector,
    values: FmpzMatrix,
    endpoints: FmpzMatrix,
    term_count: uint64,
    value_count: uint64,
    scale: int,
) -> tuple[int, int]:
    """Evaluate the aggregated BF finite prime sum in resident dyadics."""
    log_threshold_lower = endpoints[0, 0]
    log_threshold_upper = endpoints[1, 0]
    sqrt_threshold_lower = endpoints[2, 0]
    sqrt_threshold_upper = endpoints[3, 0]
    log_ninth_lower = endpoints[4, 0]
    log_ninth_upper = endpoints[5, 0]
    sqrt_ninth_lower = endpoints[6, 0]
    sqrt_ninth_upper = endpoints[7, 0]
    log_three_threshold_lower = endpoints[8, 0]
    log_three_threshold_upper = endpoints[9, 0]
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
        while value_index < value_count and values[value_index, 0] != norm:
            value_index += 1
        if value_index == value_count:
            return (1, 0)
        endpoint_offset: uint64 = 4 * value_index
        logarithm_lower = endpoints[endpoint_offset, 0]
        logarithm_upper = endpoints[endpoint_offset + 1, 0]
        root_lower = endpoints[endpoint_offset + 2, 0]
        root_upper = endpoints[endpoint_offset + 3, 0]
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


def _cubic_map_is_multiplicative(
    workspace: NativeIntegerVector,
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


def _cubic_prime_kernel_basis(
    workspace: NativeIntegerVector,
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


def _cubic_complementary_prime_basis(
    workspace: NativeIntegerVector,
    prime: int,
    map_zero: int,
    map_one: int,
    map_two: int,
    prime_kernel_offset: uint64,
    output_offset: uint64,
) -> bool:
    """Construct the residue-degree-two prime complementary to `ker(map)`.

    At an unramified `(1,2)` prime, `O/pO` is `F_p x F_{p^2}`.  If `P` is
    the kernel of the projection `map`, its annihilator is the one-dimensional
    complementary factor.  Find its normalized idempotent `e` from
    `map(e)=1` and `e*P=0 (mod p)`, lift `span(e)` together with `pO`, and
    authenticate the resulting lattice `Q` by the exact identity `P*Q=pO`.
    Only primes with `p^2` in the retained factor base need this path, so the
    bounded two-coordinate search is tiny in the qualified cubic regime.
    """
    if (
        prime < 2
        or prime_kernel_offset + 9 > len(workspace)
        or output_offset + 9 > len(workspace)
    ):
        return False
    pivot: uint64 = 0
    pivot_value = _cubic_positive_mod(map_zero, prime)
    if pivot_value == 0:
        pivot = 1
        pivot_value = _cubic_positive_mod(map_one, prime)
    if pivot_value == 0:
        pivot = 2
        pivot_value = _cubic_positive_mod(map_two, prime)
    inverse = _cubic_inverse_mod(pivot_value, prime)
    if inverse == 0:
        return False
    first_free: uint64 = 0
    while first_free == pivot:
        first_free += 1
    second_free: uint64 = first_free + 1
    while second_free == pivot:
        second_free += 1
    idempotent_zero = 0
    idempotent_one = 0
    idempotent_two = 0
    found = False
    first_value = 0
    while first_value < prime and not found:
        second_value = 0
        while second_value < prime and not found:
            candidate_zero = 0
            candidate_one = 0
            candidate_two = 0
            if first_free == 0:
                candidate_zero = first_value
            elif first_free == 1:
                candidate_one = first_value
            else:
                candidate_two = first_value
            if second_free == 0:
                candidate_zero = second_value
            elif second_free == 1:
                candidate_one = second_value
            else:
                candidate_two = second_value
            free_image = (
                candidate_zero * map_zero
                + candidate_one * map_one
                + candidate_two * map_two
            )
            pivot_coordinate = _cubic_positive_mod(
                (1 - free_image) * inverse,
                prime,
            )
            if pivot == 0:
                candidate_zero = pivot_coordinate
            elif pivot == 1:
                candidate_one = pivot_coordinate
            else:
                candidate_two = pivot_coordinate
            annihilates_kernel = True
            kernel_row: uint64 = 0
            while kernel_row < 3 and annihilates_kernel:
                if not _cubic_multiply_coordinates(
                    workspace,
                    candidate_zero,
                    candidate_one,
                    candidate_two,
                    workspace[prime_kernel_offset + 3 * kernel_row],
                    workspace[prime_kernel_offset + 3 * kernel_row + 1],
                    workspace[prime_kernel_offset + 3 * kernel_row + 2],
                    _MAP_SCRATCH_OFFSET,
                ):
                    return False
                coordinate: uint64 = 0
                while coordinate < 3:
                    if (
                        _cubic_positive_mod(
                            workspace[_MAP_SCRATCH_OFFSET + coordinate],
                            prime,
                        )
                        != 0
                    ):
                        annihilates_kernel = False
                    coordinate += 1
                kernel_row += 1
            if annihilates_kernel:
                idempotent_zero = candidate_zero
                idempotent_one = candidate_one
                idempotent_two = candidate_two
                found = True
            second_value += 1
        first_value += 1
    if not found:
        return False

    entry: uint64 = 0
    while entry < 12:
        workspace[_HNF_SCRATCH_OFFSET + entry] = 0
        entry += 1
    workspace[_HNF_SCRATCH_OFFSET] = prime
    workspace[_HNF_SCRATCH_OFFSET + 4] = prime
    workspace[_HNF_SCRATCH_OFFSET + 8] = prime
    workspace[_HNF_SCRATCH_OFFSET + 9] = idempotent_zero
    workspace[_HNF_SCRATCH_OFFSET + 10] = idempotent_one
    workspace[_HNF_SCRATCH_OFFSET + 11] = idempotent_two
    if not _cubic_workspace_hnf3(workspace, _HNF_SCRATCH_OFFSET, 4):
        return False
    if (
        workspace[_HNF_SCRATCH_OFFSET]
        * workspace[_HNF_SCRATCH_OFFSET + 4]
        * workspace[_HNF_SCRATCH_OFFSET + 8]
        != prime * prime
    ):
        return False
    entry = 0
    while entry < 9:
        workspace[output_offset + entry] = workspace[_HNF_SCRATCH_OFFSET + entry]
        entry += 1

    if not _cubic_ideal_product(
        workspace,
        prime_kernel_offset,
        output_offset,
        _MAP_SCRATCH_OFFSET,
    ):
        return False
    entry = 0
    while entry < 9:
        expected = 0
        if entry == 0 or entry == 4 or entry == 8:
            expected = prime
        if workspace[_MAP_SCRATCH_OFFSET + entry] != expected:
            return False
        entry += 1
    return True


def _cubic_factor_norm(
    workspace: NativeIntegerVector,
    factor_index: uint64,
) -> int:
    """Return the exact norm stored for one factor-base ideal."""
    factor_base: uint64 = _FACTOR_OFFSET + _FACTOR_STRIDE * factor_index
    factor_norm = 1
    factor_degree: uint64 = 0
    while factor_degree < workspace[factor_base + 2]:
        factor_norm *= workspace[factor_base]
        factor_degree += 1
    return factor_norm


def _cubic_next_factor_by_norm(
    workspace: NativeIntegerVector,
    factor_count: uint64,
    previous_norm: int,
    previous_index: uint64,
    have_previous: uint64,
) -> uint64:
    """Return the next canonical factor in stable increasing-norm order."""
    next_index: uint64 = factor_count
    next_norm: int = 0
    factor_index: uint64 = 0
    while factor_index < factor_count:
        factor_norm = _cubic_factor_norm(workspace, factor_index)
        follows_previous = have_previous == 0 or factor_norm > previous_norm
        if factor_norm == previous_norm and factor_index > previous_index:
            follows_previous = True
        if follows_previous and (
            next_index == factor_count
            or factor_norm < next_norm
            or (factor_norm == next_norm and factor_index < next_index)
        ):
            next_index = factor_index
            next_norm = factor_norm
        factor_index += 1
    return next_index


@native
def _cubic_small_relation_prefix_is_trivial(
    relations: FmpzMatrix,
    relation_count: uint64,
    factor_count: uint64,
) -> bool:
    """Recognize index one in dimensions one and two by determinantal gcd."""
    content = 0
    if factor_count == 1:
        row: uint64 = 0
        while row < relation_count:
            content, ignored_left, ignored_right = _cubic_extended_gcd(
                content,
                relations[row, 0],
            )
            if content == 1:
                return True
            row += 1
        return False
    if factor_count != 2:
        return False
    left_row: uint64 = 0
    while left_row < relation_count:
        right_row: uint64 = 0
        while right_row < left_row:
            determinant = (
                relations[left_row, 0] * relations[right_row, 1]
                - relations[left_row, 1] * relations[right_row, 0]
            )
            content, ignored_left, ignored_right = _cubic_extended_gcd(
                content,
                determinant,
            )
            if content == 1:
                return True
            right_row += 1
        left_row += 1
    return False


def _cubic_publish_trivial_relation_transcript(
    workspace: NativeIntegerVector,
    relation_matrix: FmpzMatrix,
    relation_elements: FmpzMatrix,
    relation_count: uint64,
    factor_count: uint64,
    transcript_factor_rows: IntegerBuffer,
    transcript_relation_rows: IntegerBuffer,
    transcript_relation_elements: IntegerBuffer,
) -> bool:
    """Publish the exact finite presentation used by a trivial quotient.

    The caller requests this only on a separate, untimed audit run.  The
    ordinary object layer treats every published integer as an untrusted
    theorem witness: it reconstructs the theorem-qualified factor base,
    checks every retained principal-ideal equality, and recomputes the row
    lattice.  Exact-sized caller buffers keep this evidence out of the hot
    scalar class-number boundary.
    """
    factor_values: uint64 = 9 * factor_count
    relation_values: uint64 = relation_count * factor_count
    element_values: uint64 = 3 * relation_count
    if factor_values == 0:
        factor_values = 1
    if relation_values == 0:
        relation_values = 1
    if element_values == 0:
        element_values = 1
    if (
        len(transcript_factor_rows) != factor_values
        or len(transcript_relation_rows) != relation_values
        or len(transcript_relation_elements) != element_values
    ):
        return False

    factor_index: uint64 = 0
    while factor_index < factor_count:
        power_base: uint64 = _POWER_OFFSET + factor_index * _CUBIC_MAX_POWERS * 9
        entry: uint64 = 0
        while entry < 9:
            transcript_factor_rows[9 * factor_index + entry] = workspace[
                power_base + entry
            ]
            entry += 1
        factor_index += 1

    relation_index: uint64 = 0
    while relation_index < relation_count:
        factor_index = 0
        while factor_index < factor_count:
            transcript_relation_rows[relation_index * factor_count + factor_index] = (
                relation_matrix[relation_index, factor_index]
            )
            factor_index += 1
        coordinate: uint64 = 0
        while coordinate < 3:
            transcript_relation_elements[3 * relation_index + coordinate] = (
                relation_elements[relation_index, coordinate]
            )
            coordinate += 1
        relation_index += 1
    return True


@native
def certified_complex_cubic_class_group_v1(
    output: IntegerBuffer,
    coefficients: IntegerBuffer,
    analysis_proof: IntegerBuffer,
    verification_polynomial: IntegerBuffer,
    verification_numerator: IntegerBuffer,
    verification_primes: IntegerBuffer,
    verification_radical_dimensions: IntegerBuffer,
    verification_radicals: IntegerBuffer,
    verification_selectors: IntegerBuffer,
    verification_workspace: IntegerBuffer,
    transcript_factor_rows: IntegerBuffer,
    transcript_relation_rows: IntegerBuffer,
    transcript_relation_elements: IntegerBuffer,
    transcript_mode: uint64,
    relation_effort: uint64,
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
        or len(analysis_proof) != _CUBIC_ANALYSIS_PROOF_CAPACITY
        or len(verification_polynomial) != 4
        or len(verification_numerator) != 9
        or len(verification_primes) != _CUBIC_MAX_ORDER_WITNESSES
        or len(verification_radical_dimensions) != _CUBIC_MAX_ORDER_WITNESSES
        or len(verification_radicals) != 9 * _CUBIC_MAX_ORDER_WITNESSES
        or len(verification_selectors) != 3 * _CUBIC_MAX_ORDER_WITNESSES
        or len(verification_workspace) != _CUBIC_ROUND2_WORKSPACE_LENGTH
        or len(transcript_factor_rows) < 1
        or len(transcript_factor_rows) > 9 * _CUBIC_MAX_FACTORS
        or len(transcript_relation_rows) < 1
        or len(transcript_relation_rows) > _CUBIC_MAX_RELATIONS * _CUBIC_MAX_FACTORS
        or len(transcript_relation_elements) < 1
        or len(transcript_relation_elements) > 3 * _CUBIC_MAX_RELATIONS
        or transcript_mode > 1
        or (
            transcript_mode == 0
            and (
                len(transcript_factor_rows) != 1
                or len(transcript_relation_rows) != 1
                or len(transcript_relation_elements) != 1
            )
        )
        or relation_effort < 1
        or relation_effort > _CUBIC_MAX_RELATION_EFFORT
        or coefficients[3] != 1
        or memory_limit < 1048576
        or temporary_limit < 1048576
    ):
        return False
    # Effort grows monotonically through bounded PARI-style stages.
    scheduled_compound_multiplier_limit: uint64 = 0
    if relation_effort == 6:
        scheduled_compound_multiplier_limit = 1
    elif relation_effort == 7:
        scheduled_compound_multiplier_limit = 2
    elif relation_effort == 8:
        scheduled_compound_multiplier_limit = _CUBIC_COMPOUND_MULTIPLIERS
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        workspace = arena.integer_vector(_CUBIC_WORKSPACE_LENGTH, 0)
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
        # Private decline diagnostics: a successful publication clears this
        # slot below.  Direct kernel audits can inspect the last completed
        # phase without granting any authority to a rejected result.
        output[63] = 1

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

        # Polarize the norm once and bind it back at an independent point.
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
        output[63] = 2

        analytic_scale = 1
        analytic_bit: uint64 = 0
        while analytic_bit < _CUBIC_ANALYTIC_PRECISION:
            analytic_scale *= 2
            analytic_bit += 1
        log_numerators = arena.foreign_resource(fmpz_matrix, 1, one_column)
        log_denominators = arena.foreign_resource(fmpz_matrix, 1, one_column)
        log_endpoints = arena.foreign_resource(fmpz_matrix, 2, one_column)

        sqrt_discriminant = _cubic_ceil_sqrt(absolute_discriminant)
        if sqrt_discriminant < 1:
            return False
        # Minkowski and pi > 28/9 give the integral upper bound below.
        minkowski_generator_bound = (2 * sqrt_discriminant + 6) // 7
        if (
            minkowski_generator_bound < 2
            or minkowski_generator_bound > _CUBIC_MAX_GRH_BOUND_SEARCH
        ):
            return False
        bdf_value_limit = minkowski_generator_bound
        if bdf_value_limit < 32:
            bdf_value_limit = 32
        bdf_value_count: uint64 = checked_uint64(bdf_value_limit + 1)
        bdf_values = arena.foreign_resource(
            fmpz_matrix,
            bdf_value_count,
            one_column,
        )
        bdf_endpoints = arena.foreign_resource(
            fmpz_matrix,
            4 * bdf_value_count,
            one_column,
        )
        bdf_values[0, 0] = absolute_discriminant
        bdf_value_index: uint64 = 1
        while bdf_value_index < bdf_value_count:
            bdf_values[bdf_value_index, 0] = bdf_value_index
            bdf_value_index += 1
        if not integer_log_sqrt_balls_resource(
            bdf_endpoints,
            bdf_values,
            _CUBIC_ANALYTIC_PRECISION,
        ):
            return False
        generator_bound = minkowski_generator_bound
        use_grh_generator_base = False
        if minkowski_generator_bound > _CUBIC_DIRECT_MINKOWSKI_MAX_BOUND:
            grh_generator_bound = _cubic_grh_generator_bound(
                log_numerators,
                log_denominators,
                log_endpoints,
                bdf_endpoints,
                workspace,
                coefficients,
                equation_order_index,
                identity_zero,
                identity_one,
                identity_two,
                absolute_discriminant,
                minkowski_generator_bound,
                analytic_scale,
                _CUBIC_ANALYTIC_PRECISION,
            )
            if grh_generator_bound < minkowski_generator_bound:
                generator_bound = grh_generator_bound
                use_grh_generator_base = True
        if (
            generator_bound < 2
            or generator_bound > minkowski_generator_bound
            or generator_bound > _CUBIC_MAX_FACTOR_SEARCH_BOUND
        ):
            return False

        # Retain exactly the certified GRH or unconditional generator base.
        factor_search_bound = generator_bound

        factor_count: uint64 = 0
        group_count: uint64 = 0
        prime = 2
        while prime <= factor_search_bound:
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
                    if (
                        map_count == 1
                        and absolute_discriminant % prime != 0
                        and prime * prime <= factor_search_bound
                    ):
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
                        power_base: uint64 = (
                            _POWER_OFFSET + factor_count * _CUBIC_MAX_POWERS * 9
                        )
                        degree_one_power_base: uint64 = (
                            _POWER_OFFSET + group_factor_start * _CUBIC_MAX_POWERS * 9
                        )
                        map_base: uint64 = _MAP_SCRATCH_OFFSET
                        if not _cubic_complementary_prime_basis(
                            workspace,
                            prime,
                            workspace[map_base],
                            workspace[map_base + 1],
                            workspace[map_base + 2],
                            degree_one_power_base,
                            power_base,
                        ):
                            return False
                        workspace[factor_base + 6] = 1
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
        if (factor_count == 0 and group_count != 0) or (
            factor_count != 0 and group_count == 0
        ):
            return False
        output[63] = 3

        # An empty proved generator base makes the class group trivial.
        if factor_count == 0:
            if transcript_mode == 1 and (
                len(transcript_factor_rows) != 1
                or len(transcript_relation_rows) != 1
                or len(transcript_relation_elements) != 1
            ):
                return False
            output_index: uint64 = 0
            while output_index < len(output):
                output[output_index] = 0
                output_index += 1
            output[0] = 2
            output[1] = 1
            output[20] = generator_bound
            output[24] = 1
            output[25] = identity_zero
            output[26] = identity_one
            output[27] = identity_two
            output[28] = order_discriminant
            output[29] = equation_order_index
            output[30] = denominator
            output[34] = equation_discriminant
            output[35] = _CUBIC_PROOF_TRIVIAL_MINKOWSKI
            if use_grh_generator_base:
                output[35] = _CUBIC_PROOF_TRIVIAL_GRH
            return True

        (
            small_unit_status,
            unit_zero,
            unit_one,
            unit_two,
            regulator_lower,
            regulator_upper,
        ) = _cubic_small_unit_probe(
            log_numerators,
            log_denominators,
            log_endpoints,
            workspace,
            coefficients,
            denominator,
            basis_zero_zero,
            basis_zero_one,
            basis_zero_two,
            basis_one_one,
            basis_one_two,
            basis_two_two,
            identity_zero,
            identity_one,
            identity_two,
            analytic_scale,
            _CUBIC_ANALYTIC_PRECISION,
        )
        unit_found = small_unit_status == 1
        unit_box = 9

        # Plan exact prime-power storage before materializing it.
        relation_box = 2
        if not unit_found:
            relation_box = 3

        # PARI's stable norm permutation starts with three independent ideals
        # of sufficient norm product, then local redundancies and the rest.
        # Exact retries traverse five, then eight, positions backward.
        adjacent_ideal_count: uint64 = 0
        adjacent_candidate_count: uint64 = 0
        adjacent_prefix_start: uint64 = 0
        adjacent_factor_cursor: uint64 = 0
        adjacent_prefix: uint64 = _CUBIC_INITIAL_ADJACENT_IDEALS
        if relation_effort == 2:
            adjacent_prefix = _CUBIC_SECOND_ADJACENT_IDEALS
        elif relation_effort == 3:
            adjacent_prefix = _CUBIC_PARI_INITIAL_ADJACENT_IDEALS
        elif relation_effort == 4:
            adjacent_prefix = _CUBIC_PARI_EXPANDED_ADJACENT_IDEALS
        use_canonical_prefix = (
            relation_effort <= 2
            and factor_count <= _CUBIC_NARROW_ADJACENT_MAX_FACTORS
            and factor_count > adjacent_prefix
        )
        use_pari_permutation = (
            (relation_effort == 3 or relation_effort == 4)
            and factor_count <= _CUBIC_NARROW_ADJACENT_MAX_FACTORS
            and factor_count > adjacent_prefix
        )
        if use_canonical_prefix or use_pari_permutation:
            adjacent_prefix_start = factor_count - adjacent_prefix
        if use_pari_permutation:
            # During planning slot +9 holds a one-based permutation position.
            # Values above `factor_count` temporarily encode locally redundant
            # ideals encountered while constructing PARI's sub-factor-base.
            subbase_count: uint64 = 0
            subbase_redundant_count: uint64 = 0
            subbase_product: int = 1
            sorted_count: uint64 = 0
            previous_norm: int = 0
            previous_index: uint64 = 0
            have_previous: uint64 = 0
            while sorted_count < factor_count and (
                subbase_count < 3 or subbase_product <= generator_bound
            ):
                sorted_factor_index: uint64 = _cubic_next_factor_by_norm(
                    workspace,
                    factor_count,
                    previous_norm,
                    previous_index,
                    have_previous,
                )
                if sorted_factor_index >= factor_count:
                    return False
                sorted_factor_base: uint64 = (
                    _FACTOR_OFFSET + _FACTOR_STRIDE * sorted_factor_index
                )
                sorted_factor_norm = _cubic_factor_norm(
                    workspace,
                    sorted_factor_index,
                )
                sorted_prime = workspace[sorted_factor_base]
                sorted_same_previous = False
                if sorted_factor_index > 0:
                    previous_factor_base: uint64 = _FACTOR_OFFSET + _FACTOR_STRIDE * (
                        sorted_factor_index - 1
                    )
                    sorted_same_previous = (
                        workspace[previous_factor_base] == sorted_prime
                    )
                sorted_same_next = False
                if sorted_factor_index + 1 < factor_count:
                    next_factor_base: uint64 = _FACTOR_OFFSET + _FACTOR_STRIDE * (
                        sorted_factor_index + 1
                    )
                    sorted_same_next = workspace[next_factor_base] == sorted_prime
                sorted_group_is_complete = (
                    sorted_same_previous
                    or sorted_same_next
                    or workspace[sorted_factor_base + 1]
                    * workspace[sorted_factor_base + 2]
                    == 3
                )
                sorted_factor_is_redundant = (
                    sorted_group_is_complete and not sorted_same_next
                )
                if sorted_factor_is_redundant:
                    subbase_redundant_count += 1
                    workspace[sorted_factor_base + 9] = (
                        factor_count + subbase_redundant_count
                    )
                else:
                    subbase_count += 1
                    workspace[sorted_factor_base + 9] = subbase_count
                    subbase_product *= sorted_factor_norm
                previous_norm = sorted_factor_norm
                previous_index = sorted_factor_index
                have_previous = 1
                sorted_count += 1

            permutation_count: uint64 = subbase_count + subbase_redundant_count
            permutation_factor_index: uint64 = 0
            while permutation_factor_index < factor_count:
                permutation_factor_base: uint64 = (
                    _FACTOR_OFFSET + _FACTOR_STRIDE * permutation_factor_index
                )
                permutation_marker = workspace[permutation_factor_base + 9]
                if permutation_marker > factor_count:
                    workspace[permutation_factor_base + 9] = (
                        subbase_count + permutation_marker - factor_count
                    )
                permutation_factor_index += 1

            sorted_count = 0
            previous_norm = 0
            previous_index = 0
            have_previous = 0
            while sorted_count < factor_count:
                sorted_factor_index = _cubic_next_factor_by_norm(
                    workspace,
                    factor_count,
                    previous_norm,
                    previous_index,
                    have_previous,
                )
                if sorted_factor_index >= factor_count:
                    return False
                sorted_factor_base = (
                    _FACTOR_OFFSET + _FACTOR_STRIDE * sorted_factor_index
                )
                sorted_factor_norm = _cubic_factor_norm(
                    workspace,
                    sorted_factor_index,
                )
                if workspace[sorted_factor_base + 9] == 0:
                    permutation_count += 1
                    workspace[sorted_factor_base + 9] = permutation_count
                previous_norm = sorted_factor_norm
                previous_index = sorted_factor_index
                have_previous = 1
                sorted_count += 1
            if permutation_count != factor_count:
                return False
        while adjacent_factor_cursor < factor_count:
            adjacent_factor_index: uint64 = adjacent_factor_cursor
            adjacent_factor_base: uint64 = (
                _FACTOR_OFFSET + _FACTOR_STRIDE * adjacent_factor_index
            )
            schedule_adjacent = True
            if use_canonical_prefix:
                schedule_adjacent = adjacent_factor_index >= adjacent_prefix_start
            elif use_pari_permutation:
                schedule_adjacent = (
                    workspace[adjacent_factor_base + 9] > adjacent_prefix_start
                )
            if (
                relation_effort >= 2
                and relation_effort <= 4
                and workspace[adjacent_factor_base + 8] == 1
            ):
                schedule_adjacent = True
            if schedule_adjacent:
                workspace[adjacent_factor_base + 9] = 1
                adjacent_ideal_count += 1
                if workspace[adjacent_factor_base + 8] == 0:
                    adjacent_candidate_count += 4
            else:
                workspace[adjacent_factor_base + 9] = 0
            adjacent_factor_cursor += 1
        compound_pair_count: uint64 = 0
        compound_multiplier_index: uint64 = 0
        compound_multiplier_count: uint64 = 0
        while (
            not unit_found
            and compound_multiplier_index < factor_count
            and compound_multiplier_count < scheduled_compound_multiplier_limit
        ):
            compound_multiplier_base: uint64 = (
                _FACTOR_OFFSET + _FACTOR_STRIDE * compound_multiplier_index
            )
            if workspace[compound_multiplier_base + 8] == 0:
                compound_source_index: uint64 = compound_multiplier_index + 1
                while compound_source_index < factor_count:
                    compound_source_base: uint64 = (
                        _FACTOR_OFFSET + _FACTOR_STRIDE * compound_source_index
                    )
                    if workspace[compound_source_base + 8] == 0:
                        compound_pair_count += 1
                        if compound_pair_count > _CUBIC_MAX_COMPOUND_PAIRS:
                            return False
                    compound_source_index += 1
                compound_multiplier_count += 1
            compound_multiplier_index += 1
        adjacent_embedding_source = arena.foreign_resource(fmpz_matrix, 3, 3)
        adjacent_embedding_reduced = arena.foreign_resource(fmpz_matrix, 3, 3)
        adjacent_embedding_transform = arena.foreign_resource(fmpz_matrix, 3, 3)
        adjacent_transform_rows: uint64 = 3 * factor_count
        if adjacent_transform_rows == 0:
            adjacent_transform_rows = 1
        adjacent_transforms = arena.foreign_resource(
            fmpz_matrix,
            adjacent_transform_rows,
            3,
        )
        adjacent_parameter_rows: uint64 = factor_count
        if adjacent_parameter_rows == 0:
            adjacent_parameter_rows = 1
        adjacent_ellipsoid_parameters = arena.foreign_resource(
            fmpz_matrix,
            adjacent_parameter_rows,
            11,
        )
        compound_plan_rows: uint64 = compound_pair_count
        if compound_plan_rows == 0:
            compound_plan_rows = 1
        compound_plans = arena.foreign_resource(
            fmpz_matrix,
            compound_plan_rows,
            2,
        )
        compound_transform_rows: uint64 = 3 * compound_pair_count
        if compound_transform_rows == 0:
            compound_transform_rows = 1
        compound_transforms = arena.foreign_resource(
            fmpz_matrix,
            compound_transform_rows,
            3,
        )
        (
            adjacent_root_status,
            adjacent_real_root,
            adjacent_complex_real_root,
            adjacent_complex_imaginary_root,
        ) = _cubic_complex_root_approximations(coefficients, analytic_scale)
        if adjacent_ideal_count > 0 and adjacent_root_status != 1:
            return False
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

        # Plan one checked T2/LLL shell or ellipsoid per selected ideal.
        adjacent_factor_index = 0
        while adjacent_factor_index < factor_count:
            factor_base = _FACTOR_OFFSET + _FACTOR_STRIDE * adjacent_factor_index
            if workspace[factor_base + 9] != 0:
                power_base = (
                    _POWER_OFFSET + adjacent_factor_index * _CUBIC_MAX_POWERS * 9
                )
                adjacent_basis: uint64 = power_base
                if not _cubic_fill_ideal_t2_embedding(
                    adjacent_embedding_source,
                    workspace,
                    adjacent_basis,
                    basis_zero_zero,
                    basis_zero_one,
                    basis_zero_two,
                    basis_one_one,
                    basis_one_two,
                    basis_two_two,
                    adjacent_real_root,
                    adjacent_complex_real_root,
                    adjacent_complex_imaginary_root,
                    analytic_scale,
                ) or not fmpz_matrix_lll_transform(
                    adjacent_embedding_reduced,
                    adjacent_embedding_transform,
                    adjacent_embedding_source,
                ):
                    return False
                adjacent_transform_row: uint64 = 3 * adjacent_factor_index
                transform_row: uint64 = 0
                while transform_row < 3:
                    transform_column: uint64 = 0
                    while transform_column < 3:
                        adjacent_transforms[
                            adjacent_transform_row + transform_row, transform_column
                        ] = adjacent_embedding_transform[
                            transform_row, transform_column
                        ]
                        transform_column += 1
                    transform_row += 1
                use_adjacent_ellipsoid = (
                    workspace[factor_base + 8] == 1 or relation_effort >= 3
                )
                if use_adjacent_ellipsoid:
                    if not _cubic_prepare_reduced_ideal_ellipsoid(
                        workspace,
                        adjacent_basis,
                        adjacent_embedding_reduced,
                        adjacent_transforms,
                        adjacent_transform_row,
                        adjacent_ellipsoid_parameters,
                        adjacent_factor_index,
                    ):
                        return False
                    adjacent_ellipsoid_count: uint64 = (
                        _cubic_plan_reduced_ideal_ellipsoid(
                            workspace,
                            adjacent_basis,
                            adjacent_transforms,
                            adjacent_transform_row,
                            adjacent_ellipsoid_parameters,
                            adjacent_factor_index,
                            group_count,
                        )
                    )
                    if (
                        adjacent_ellipsoid_count
                        > _CUBIC_REDUCED_ENUMERATION_MAX_CANDIDATES
                    ):
                        return False
                    adjacent_ellipsoid_parameters[adjacent_factor_index, 10] = (
                        adjacent_ellipsoid_count
                    )
                    adjacent_candidate_count += adjacent_ellipsoid_count
                    workspace[factor_base + 9] = 4
                if workspace[factor_base + 8] == 0:
                    adjacent_best_score = -1
                    adjacent_best_pair: uint64 = 0
                    adjacent_pair: uint64 = 0
                    while adjacent_pair < 3:
                        adjacent_first: uint64 = 0
                        adjacent_second: uint64 = 1
                        if adjacent_pair == 1:
                            adjacent_second = 2
                        elif adjacent_pair == 2:
                            adjacent_first = 1
                            adjacent_second = 2
                        adjacent_score = 0
                        adjacent_direction: uint64 = 0
                        while adjacent_direction < 4:
                            adjacent_left = 1
                            adjacent_right = 0
                            if adjacent_direction == 1:
                                adjacent_left = 0
                                adjacent_right = 1
                            elif adjacent_direction == 2:
                                adjacent_right = 1
                            elif adjacent_direction == 3:
                                adjacent_left = -1
                                adjacent_right = 1
                            adjacent_zero = 0
                            adjacent_one = 0
                            adjacent_two = 0
                            if adjacent_first == 0:
                                adjacent_zero = adjacent_left
                            elif adjacent_first == 1:
                                adjacent_one = adjacent_left
                            else:
                                adjacent_two = adjacent_left
                            if adjacent_second == 0:
                                adjacent_zero = adjacent_right
                            elif adjacent_second == 1:
                                adjacent_one = adjacent_right
                            else:
                                adjacent_two = adjacent_right
                            (
                                planning_coordinate_zero,
                                planning_coordinate_one,
                                planning_coordinate_two,
                            ) = _cubic_transformed_ideal_coordinates(
                                workspace,
                                adjacent_basis,
                                adjacent_transforms,
                                adjacent_transform_row,
                                adjacent_zero,
                                adjacent_one,
                                adjacent_two,
                            )
                            planning_adjacent_norm = _cubic_norm_form_value(
                                workspace,
                                planning_coordinate_zero,
                                planning_coordinate_one,
                                planning_coordinate_two,
                            )
                            if planning_adjacent_norm < 0:
                                planning_adjacent_norm = -planning_adjacent_norm
                            planning_candidate_is_smooth = _cubic_plan_smooth_norm(
                                workspace,
                                group_count,
                                planning_adjacent_norm,
                            )
                            if planning_candidate_is_smooth:
                                adjacent_score += 1
                            adjacent_direction += 1
                        if adjacent_score > adjacent_best_score:
                            adjacent_best_score = adjacent_score
                            adjacent_best_pair = adjacent_pair
                        adjacent_pair += 1
                    if use_adjacent_ellipsoid:
                        workspace[factor_base + 9] = adjacent_best_pair + 5
                    else:
                        workspace[factor_base + 9] = adjacent_best_pair + 1
            adjacent_factor_index += 1

        # Retain PARI's compound norm target, but do not construct any product
        # ideals yet.  The ordinary relation prefix first gets an exact unit-
        # rank test below; only a rigorously archimedean-trivial prefix pays
        # for the next `small_norm` stage.
        largest_factor_norm = 1
        compound_factor_index: uint64 = 0
        while compound_factor_index < factor_count:
            compound_factor_base: uint64 = (
                _FACTOR_OFFSET + _FACTOR_STRIDE * compound_factor_index
            )
            compound_factor_norm = 1
            compound_degree_index: uint64 = 0
            while compound_degree_index < workspace[compound_factor_base + 2]:
                compound_factor_norm *= workspace[compound_factor_base]
                compound_degree_index += 1
            if compound_factor_norm > largest_factor_norm:
                largest_factor_norm = compound_factor_norm
            compound_factor_index += 1
        compound_norm_target = largest_factor_norm * largest_factor_norm
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
                # One very divisible smooth candidate must not reject the
                # whole field.  Materialize the qualified power prefix; the
                # admission pass below simply skips a row whose valuation is
                # beyond that prefix.
                if planned_valuation > _CUBIC_MAX_POWERS:
                    planned_valuation = _CUBIC_MAX_POWERS
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
        output[63] = 4

        # The admission matrix has the explicit candidate envelope.  Once the
        # exact smooth rows are known, copy only that live prefix into the HNF
        # and transform resources; unused capacity must not tax every FLINT
        # reduction or perturb the kernel basis with artificial zero rows.
        relation_capacity: uint64 = (
            group_count + 62 + adjacent_candidate_count + 4 * compound_pair_count
        )
        if not unit_found:
            relation_capacity = (
                group_count + 171 + adjacent_candidate_count + 4 * compound_pair_count
            )
        if relation_capacity > _CUBIC_MAX_RELATIONS:
            return False
        relation_candidates = arena.foreign_resource(
            fmpz_matrix,
            relation_capacity,
            factor_count,
        )
        relation_elements = arena.foreign_resource(
            fmpz_matrix,
            relation_capacity,
            3,
        )
        dependency_coordinates = arena.foreign_resource(
            fmpz_matrix,
            9,
            3,
        )
        relation_row: uint64 = 0
        while relation_row < relation_capacity:
            relation_elements[relation_row, 0] = identity_zero
            relation_elements[relation_row, 1] = identity_one
            relation_elements[relation_row, 2] = identity_two
            relation_row += 1
        relation_count: uint64 = 0
        group_index = 0
        while group_index < group_count:
            group_base = _GROUP_OFFSET + _GROUP_STRIDE * group_index
            relation_group_factor_start = workspace[group_base + 1]
            relation_group_factor_count = workspace[group_base + 2]
            relation_first_factor_base = (
                _FACTOR_OFFSET + _FACTOR_STRIDE * relation_group_factor_start
            )
            # The principal row for `(p)` is valid only when every prime ideal
            # above `p` is represented.  In the GRH norm-bounded base a split
            # type `(1,2)` prime can retain the norm-`p` factor while omitting
            # its norm-`p^2` conjugate.  Recording only the visible component
            # would assert the false relation `(p) = P_1` and can collapse a
            # genuine class.  A singleton group is complete precisely for a
            # totally ramified cubic prime; every other complete splitting
            # type has at least two represented factors.
            complete_rational_factorization = relation_group_factor_count > 1 or (
                relation_group_factor_count == 1
                and workspace[relation_first_factor_base + 1] == 3
            )
            if complete_rational_factorization:
                factor_index = 0
                while factor_index < factor_count:
                    factor_base = _FACTOR_OFFSET + _FACTOR_STRIDE * factor_index
                    if workspace[factor_base + 7] == group_index:
                        relation_candidates[relation_count, factor_index] = workspace[
                            factor_base + 1
                        ]
                    factor_index += 1
                relation_elements[relation_count, 0] = (
                    workspace[group_base] * identity_zero
                )
                relation_elements[relation_count, 1] = (
                    workspace[group_base] * identity_one
                )
                relation_elements[relation_count, 2] = (
                    workspace[group_base] * identity_two
                )
                relation_count += 1
            group_index += 1

        trivial_relation_prefix = _cubic_small_relation_prefix_is_trivial(
            relation_candidates,
            relation_count,
            factor_count,
        )
        coordinate_zero = -relation_box
        while coordinate_zero <= relation_box and not trivial_relation_prefix:
            coordinate_one = -relation_box
            while coordinate_one <= relation_box and not trivial_relation_prefix:
                coordinate_two = -relation_box
                while coordinate_two <= relation_box and not trivial_relation_prefix:
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
                        next_relation_count = _cubic_append_smooth_principal_relation(
                            workspace,
                            relation_candidates,
                            relation_elements,
                            relation_count,
                            relation_capacity,
                            factor_count,
                            group_count,
                            coordinate_zero,
                            coordinate_one,
                            coordinate_two,
                        )
                        if next_relation_count > relation_capacity:
                            return False
                        if next_relation_count > relation_count:
                            trivial_relation_prefix = (
                                _cubic_small_relation_prefix_is_trivial(
                                    relation_candidates,
                                    next_relation_count,
                                    factor_count,
                                )
                            )
                        relation_count = next_relation_count
                    coordinate_two += 1
                coordinate_one += 1
            coordinate_zero += 1

        adjacent_factor_index = 0
        while adjacent_factor_index < factor_count and not trivial_relation_prefix:
            factor_base = _FACTOR_OFFSET + _FACTOR_STRIDE * adjacent_factor_index
            adjacent_pair_code = workspace[factor_base + 9]
            if adjacent_pair_code > 0:
                power_base = (
                    _POWER_OFFSET + adjacent_factor_index * _CUBIC_MAX_POWERS * 9
                )
                adjacent_basis = power_base
                adjacent_transform_row = 3 * adjacent_factor_index
                if workspace[factor_base + 8] == 1 or adjacent_pair_code >= 5:
                    (
                        next_relation_count,
                        admitted_ellipsoid_count,
                    ) = _cubic_append_reduced_ideal_ellipsoid(
                        workspace,
                        adjacent_basis,
                        adjacent_transforms,
                        adjacent_transform_row,
                        adjacent_ellipsoid_parameters,
                        adjacent_factor_index,
                        relation_candidates,
                        relation_elements,
                        relation_count,
                        relation_capacity,
                        factor_count,
                        group_count,
                    )
                    if (
                        next_relation_count > relation_capacity
                        or admitted_ellipsoid_count
                        != adjacent_ellipsoid_parameters[adjacent_factor_index, 10]
                    ):
                        return False
                    relation_count = next_relation_count
                if workspace[factor_base + 8] == 0:
                    admission_pair = adjacent_pair_code - 1
                    if adjacent_pair_code >= 5:
                        admission_pair = adjacent_pair_code - 5
                    if admission_pair < 0 or admission_pair > 2:
                        return False
                    adjacent_first = 0
                    adjacent_second = 1
                    if admission_pair == 1:
                        adjacent_second = 2
                    elif admission_pair == 2:
                        adjacent_first = 1
                        adjacent_second = 2
                    adjacent_direction: uint64 = 0
                    while adjacent_direction < 4:
                        adjacent_left = 1
                        adjacent_right = 0
                        if adjacent_direction == 1:
                            adjacent_left = 0
                            adjacent_right = 1
                        elif adjacent_direction == 2:
                            adjacent_right = 1
                        elif adjacent_direction == 3:
                            adjacent_left = -1
                            adjacent_right = 1
                        adjacent_zero = 0
                        adjacent_one = 0
                        adjacent_two = 0
                        if adjacent_first == 0:
                            adjacent_zero = adjacent_left
                        elif adjacent_first == 1:
                            adjacent_one = adjacent_left
                        else:
                            adjacent_two = adjacent_left
                        if adjacent_second == 0:
                            adjacent_zero = adjacent_right
                        elif adjacent_second == 1:
                            adjacent_one = adjacent_right
                        else:
                            adjacent_two = adjacent_right
                        (
                            coordinate_zero,
                            coordinate_one,
                            coordinate_two,
                        ) = _cubic_transformed_ideal_coordinates(
                            workspace,
                            adjacent_basis,
                            adjacent_transforms,
                            adjacent_transform_row,
                            adjacent_zero,
                            adjacent_one,
                            adjacent_two,
                        )
                        next_relation_count = _cubic_append_smooth_principal_relation(
                            workspace,
                            relation_candidates,
                            relation_elements,
                            relation_count,
                            relation_capacity,
                            factor_count,
                            group_count,
                            coordinate_zero,
                            coordinate_one,
                            coordinate_two,
                        )
                        if next_relation_count > relation_capacity:
                            return False
                        relation_count = next_relation_count
                        adjacent_direction += 1
            adjacent_factor_index += 1

        # The first adaptive call keeps the ordinary relation set unchanged.
        # A later authorized retry reaches this point with a nonzero scheduled
        # multiplier limit.  The compact dependency pipeline below therefore
        # gets the first opportunity to reconstruct a unit.
        compound_search_active = (
            not trivial_relation_prefix
            and not unit_found
            and scheduled_compound_multiplier_limit > 0
        )
        used_compound_multiplier_limit: uint64 = 0
        if compound_search_active:
            used_compound_multiplier_limit = scheduled_compound_multiplier_limit

        # Later efforts add PARI-style reduced products `P_0^e P_j`.
        compound_plan_index: uint64 = 0
        compound_multiplier_index = 0
        compound_multiplier_count = 0
        while (
            compound_search_active
            and compound_multiplier_index < factor_count
            and compound_multiplier_count < scheduled_compound_multiplier_limit
        ):
            compound_multiplier_base = (
                _FACTOR_OFFSET + _FACTOR_STRIDE * compound_multiplier_index
            )
            if workspace[compound_multiplier_base + 8] == 0:
                compound_multiplier_norm = 1
                compound_degree_index = 0
                while compound_degree_index < workspace[compound_multiplier_base + 2]:
                    compound_multiplier_norm *= workspace[compound_multiplier_base]
                    compound_degree_index += 1
                compound_multiplier_exponent: uint64 = 1
                compound_power_norm = compound_multiplier_norm
                while (
                    compound_power_norm
                    <= compound_norm_target // compound_multiplier_norm
                    and compound_multiplier_exponent < 24
                ):
                    compound_power_norm *= compound_multiplier_norm
                    compound_multiplier_exponent += 1
                compound_source_index = compound_multiplier_index + 1
                while compound_source_index < factor_count:
                    compound_source_base = (
                        _FACTOR_OFFSET + _FACTOR_STRIDE * compound_source_index
                    )
                    if workspace[compound_source_base + 8] == 0:
                        if compound_plan_index >= compound_pair_count:
                            return False
                        if not _cubic_compound_prime_ideal_basis(
                            workspace,
                            compound_multiplier_index,
                            compound_source_index,
                            compound_multiplier_exponent,
                            _MAP_SCRATCH_OFFSET,
                        ):
                            return False
                        compound_transform_row: uint64 = 3 * compound_plan_index
                        compound_pair_code = _cubic_plan_reduced_ideal_shell(
                            workspace,
                            adjacent_embedding_source,
                            adjacent_embedding_reduced,
                            adjacent_embedding_transform,
                            compound_transforms,
                            compound_transform_row,
                            _MAP_SCRATCH_OFFSET,
                            basis_zero_zero,
                            basis_zero_one,
                            basis_zero_two,
                            basis_one_one,
                            basis_one_two,
                            basis_two_two,
                            adjacent_real_root,
                            adjacent_complex_real_root,
                            adjacent_complex_imaginary_root,
                            analytic_scale,
                            group_count,
                        )
                        if compound_pair_code == 0:
                            return False
                        compound_plans[compound_plan_index, 0] = (
                            compound_multiplier_exponent
                        )
                        compound_plans[compound_plan_index, 1] = compound_pair_code
                        compound_plan_index += 1
                    compound_source_index += 1
                compound_multiplier_count += 1
            compound_multiplier_index += 1
        if compound_search_active and compound_plan_index != compound_pair_count:
            return False

        # The compound planning pass may demand deeper exact prime powers than
        # the ordinary prefix.  Extend only those already-resident lattices;
        # no base factor or relation is rebuilt.
        factor_index = 0
        while compound_search_active and factor_index < factor_count:
            factor_base = _FACTOR_OFFSET + _FACTOR_STRIDE * factor_index
            if workspace[factor_base + 8] == 0:
                planned_valuation = 0
                group_index = 0
                while group_index < group_count:
                    group_base = _GROUP_OFFSET + _GROUP_STRIDE * group_index
                    if workspace[factor_base + 7] == group_index:
                        planned_valuation = workspace[group_base + 3]
                    group_index += 1
                if planned_valuation > _CUBIC_MAX_POWERS:
                    planned_valuation = _CUBIC_MAX_POWERS
                power_base = _POWER_OFFSET + factor_index * _CUBIC_MAX_POWERS * 9
                power_index = 1
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

        compound_plan_index = 0
        compound_multiplier_index = 0
        compound_multiplier_count = 0
        while (
            compound_search_active
            and compound_multiplier_index < factor_count
            and compound_multiplier_count < scheduled_compound_multiplier_limit
        ):
            compound_multiplier_base = (
                _FACTOR_OFFSET + _FACTOR_STRIDE * compound_multiplier_index
            )
            if workspace[compound_multiplier_base + 8] == 0:
                compound_admission_multiplier_norm = 1
                compound_admission_degree_index: uint64 = 0
                while (
                    compound_admission_degree_index
                    < workspace[compound_multiplier_base + 2]
                ):
                    compound_admission_multiplier_norm *= workspace[
                        compound_multiplier_base
                    ]
                    compound_admission_degree_index += 1
                compound_admission_exponent: uint64 = 1
                compound_admission_power_norm = compound_admission_multiplier_norm
                while (
                    compound_admission_power_norm
                    <= compound_norm_target // compound_admission_multiplier_norm
                    and compound_admission_exponent < 24
                ):
                    compound_admission_power_norm *= compound_admission_multiplier_norm
                    compound_admission_exponent += 1
                compound_source_index = compound_multiplier_index + 1
                while compound_source_index < factor_count:
                    compound_source_base = (
                        _FACTOR_OFFSET + _FACTOR_STRIDE * compound_source_index
                    )
                    if workspace[compound_source_base + 8] == 0:
                        if compound_plan_index >= compound_pair_count:
                            return False
                        compound_admission_pair_code = compound_plans[
                            compound_plan_index, 1
                        ]
                        if (
                            compound_plans[compound_plan_index, 0]
                            != compound_admission_exponent
                            or compound_admission_pair_code < 1
                            or compound_admission_pair_code > 3
                            or not _cubic_compound_prime_ideal_basis(
                                workspace,
                                compound_multiplier_index,
                                compound_source_index,
                                compound_admission_exponent,
                                _MAP_SCRATCH_OFFSET,
                            )
                        ):
                            return False
                        compound_transform_row = 3 * compound_plan_index
                        compound_pair = compound_admission_pair_code - 1
                        compound_first: uint64 = 0
                        compound_second: uint64 = 1
                        if compound_pair == 1:
                            compound_second = 2
                        elif compound_pair == 2:
                            compound_first = 1
                            compound_second = 2
                        compound_direction: uint64 = 0
                        while compound_direction < 4:
                            compound_left = 1
                            compound_right = 0
                            if compound_direction == 1:
                                compound_left = 0
                                compound_right = 1
                            elif compound_direction == 2:
                                compound_right = 1
                            elif compound_direction == 3:
                                compound_left = -1
                                compound_right = 1
                            compound_zero = 0
                            compound_one = 0
                            compound_two = 0
                            if compound_first == 0:
                                compound_zero = compound_left
                            elif compound_first == 1:
                                compound_one = compound_left
                            else:
                                compound_two = compound_left
                            if compound_second == 0:
                                compound_zero = compound_right
                            elif compound_second == 1:
                                compound_one = compound_right
                            else:
                                compound_two = compound_right
                            (
                                coordinate_zero,
                                coordinate_one,
                                coordinate_two,
                            ) = _cubic_transformed_ideal_coordinates(
                                workspace,
                                _MAP_SCRATCH_OFFSET,
                                compound_transforms,
                                compound_transform_row,
                                compound_zero,
                                compound_one,
                                compound_two,
                            )
                            next_relation_count = (
                                _cubic_append_smooth_principal_relation(
                                    workspace,
                                    relation_candidates,
                                    relation_elements,
                                    relation_count,
                                    relation_capacity,
                                    factor_count,
                                    group_count,
                                    coordinate_zero,
                                    coordinate_one,
                                    coordinate_two,
                                )
                            )
                            if next_relation_count > relation_capacity:
                                return False
                            relation_count = next_relation_count
                            compound_direction += 1
                        compound_plan_index += 1
                    compound_source_index += 1
                compound_multiplier_count += 1
            compound_multiplier_index += 1
        if compound_search_active and compound_plan_index != compound_pair_count:
            return False

        uncompacted_relation_count: uint64 = relation_count
        output[50] = factor_count
        output[51] = group_count
        output[52] = relation_count
        output[63] = 41
        relation_matrix = arena.foreign_resource(
            fmpz_matrix,
            relation_count,
            factor_count,
        )
        relation_row = 0
        while relation_row < relation_count:
            factor_index = 0
            while factor_index < factor_count:
                relation_matrix[relation_row, factor_index] = relation_candidates[
                    relation_row, factor_index
                ]
                factor_index += 1
            relation_row += 1
        relation_hnf = arena.foreign_resource(
            fmpz_matrix,
            relation_count,
            factor_count,
        )
        if relation_count < factor_count or not fmpz_matrix_hnf_into(
            relation_hnf,
            relation_matrix,
        ):
            return False
        relation_rank: uint64 = 0
        relation_row: uint64 = 0
        while relation_row < relation_count:
            row_nonzero = False
            factor_index = 0
            while factor_index < factor_count:
                if relation_hnf[relation_row, factor_index] != 0:
                    row_nonzero = True
                factor_index += 1
            if row_nonzero:
                relation_rank += 1
            relation_row += 1
        output[53] = relation_rank
        output[63] = 42
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
            invariant = relation_smith[factor_index, factor_index]
            if invariant < 0:
                invariant = -invariant
            if invariant < 1:
                return False
            if factor_index > 0:
                previous_invariant = relation_smith[factor_index - 1, factor_index - 1]
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
        output[54] = class_number_upper
        output[55] = invariant_count
        output[63] = 43

        # Principal rows present an upper group surjecting onto the class
        # group. If that exact quotient is trivial, no unit or analytic index
        # calculation can strengthen the class-group conclusion.
        if class_number_upper == 1:
            if transcript_mode == 1 and not _cubic_publish_trivial_relation_transcript(
                workspace,
                relation_matrix,
                relation_elements,
                relation_count,
                factor_count,
                transcript_factor_rows,
                transcript_relation_rows,
                transcript_relation_elements,
            ):
                return False
            output_index = 0
            while output_index < len(output):
                output[output_index] = 0
                output_index += 1
            output[0] = 2
            output[1] = 1
            output[19] = used_compound_multiplier_limit
            output[20] = generator_bound
            output[21] = factor_count
            output[22] = group_count
            output[23] = relation_count
            output[24] = 1
            output[25] = identity_zero
            output[26] = identity_one
            output[27] = identity_two
            output[28] = order_discriminant
            output[29] = equation_order_index
            output[30] = denominator
            output[31] = relation_box
            output[32] = unit_box
            output[33] = relation_rank
            output[34] = equation_discriminant
            output[35] = _CUBIC_PROOF_TRIVIAL_MINKOWSKI
            if use_grh_generator_base:
                output[35] = _CUBIC_PROOF_TRIVIAL_GRH
            return True

        # Retain exactly the rows that change the incremental canonical HNF,
        # avoiding a transformation of the wide collection matrix.
        relation_support = arena.foreign_resource(
            fmpz_matrix,
            relation_count,
            1,
        )
        incremental_basis = arena.foreign_resource(
            fmpz_matrix,
            factor_count,
            factor_count,
        )
        incremental_source = arena.foreign_resource(
            fmpz_matrix,
            factor_count + 1,
            factor_count,
        )
        incremental_hnf = arena.foreign_resource(
            fmpz_matrix,
            factor_count + 1,
            factor_count,
        )
        support_count: uint64 = 0
        compact_source_row: uint64 = 0
        while compact_source_row < relation_count:
            incremental_row: uint64 = 0
            while incremental_row < factor_count:
                incremental_column: uint64 = 0
                while incremental_column < factor_count:
                    incremental_source[incremental_row, incremental_column] = (
                        incremental_basis[incremental_row, incremental_column]
                    )
                    incremental_column += 1
                incremental_row += 1
            incremental_column = 0
            while incremental_column < factor_count:
                incremental_source[factor_count, incremental_column] = relation_matrix[
                    compact_source_row, incremental_column
                ]
                incremental_column += 1
            if not fmpz_matrix_hnf_into(incremental_hnf, incremental_source):
                return False
            support_used = False
            incremental_row = 0
            while incremental_row < factor_count:
                incremental_column = 0
                while incremental_column < factor_count:
                    if (
                        incremental_hnf[incremental_row, incremental_column]
                        != incremental_basis[incremental_row, incremental_column]
                    ):
                        support_used = True
                    incremental_column += 1
                incremental_row += 1
            if support_used:
                if support_count >= factor_count + 64:
                    output[59] = 421
                    output[60] = support_count
                    return False
                relation_support[compact_source_row, 0] = 1
                support_count += 1
                incremental_row = 0
                while incremental_row < factor_count:
                    incremental_column = 0
                    while incremental_column < factor_count:
                        incremental_basis[incremental_row, incremental_column] = (
                            incremental_hnf[incremental_row, incremental_column]
                        )
                        incremental_column += 1
                    incremental_row += 1
            compact_source_row += 1
        if support_count < factor_count:
            return False
        incremental_row = 0
        while incremental_row < factor_count:
            incremental_column = 0
            while incremental_column < factor_count:
                if (
                    incremental_basis[incremental_row, incremental_column]
                    != relation_hnf[incremental_row, incremental_column]
                ):
                    output[59] = 422
                    output[60] = support_count
                    return False
                incremental_column += 1
            incremental_row += 1

        # Preserve a bounded tail of final reduced-ideal witnesses not already in
        # the HNF support.  These redundant principal relations are useful for
        # finding a short generator of the rank-one unit lattice.
        compact_tail_start: uint64 = 0
        if relation_count > _CUBIC_RELATION_REDUNDANCY_TAIL:
            compact_tail_start = relation_count - _CUBIC_RELATION_REDUNDANCY_TAIL
        compact_tail_count: uint64 = 0
        compact_source_row = compact_tail_start
        while compact_source_row < relation_count:
            if relation_support[compact_source_row, 0] == 0:
                compact_tail_count += 1
            compact_source_row += 1
        compact_relation_count: uint64 = support_count + compact_tail_count
        compact_relation_matrix = arena.foreign_resource(
            fmpz_matrix,
            compact_relation_count,
            factor_count,
        )
        compact_relation_hnf = arena.foreign_resource(
            fmpz_matrix,
            compact_relation_count,
            factor_count,
        )
        compact_relation_elements = arena.foreign_resource(
            fmpz_matrix,
            compact_relation_count,
            3,
        )
        compact_row: uint64 = _cubic_copy_relation_support_tail(
            relation_matrix,
            relation_elements,
            relation_support,
            relation_count,
            factor_count,
            compact_tail_start,
            compact_relation_matrix,
            compact_relation_elements,
        )
        if compact_row != compact_relation_count:
            return False
        if not fmpz_matrix_hnf_into(
            compact_relation_hnf,
            compact_relation_matrix,
        ):
            return False
        compact_rank: uint64 = 0
        compact_row = 0
        while compact_row < compact_relation_count:
            compact_nonzero = False
            compact_column: uint64 = 0
            while compact_column < factor_count:
                if compact_relation_hnf[compact_row, compact_column] != 0:
                    compact_nonzero = True
                compact_column += 1
            if compact_nonzero:
                compact_rank += 1
            compact_row += 1
        if compact_rank != factor_count:
            return False
        compact_smith = arena.foreign_resource(
            fmpz_matrix,
            compact_relation_count,
            factor_count,
        )
        if not fmpz_matrix_snf_into(compact_smith, compact_relation_matrix):
            return False
        compact_index = 1
        compact_column = 0
        while compact_column < factor_count:
            compact_invariant = compact_smith[compact_column, compact_column]
            if compact_invariant < 0:
                compact_invariant = -compact_invariant
            if compact_invariant < 1:
                return False
            compact_index *= compact_invariant
            compact_column += 1
        if compact_index != class_number_upper:
            return False
        dependency_relation_elements = compact_relation_elements
        relation_count = compact_relation_count
        output[52] = relation_count

        # Reconstruct missing units from exact HNF dependencies.
        dependency_scan_active = not unit_found
        relation_transform = arena.foreign_resource(
            fmpz_matrix,
            relation_count,
            relation_count,
        )
        if dependency_scan_active and not fmpz_matrix_hnf_transform(
            compact_relation_hnf,
            relation_transform,
            compact_relation_matrix,
        ):
            return False
        output[59] = 431
        dependency_count: uint64 = relation_count - relation_rank
        dependency_relations = arena.foreign_resource(
            fmpz_matrix,
            dependency_count,
            relation_count,
        )
        dependency_reduced = arena.foreign_resource(
            fmpz_matrix,
            dependency_count,
            relation_count,
        )
        dependency_lll_transform = arena.foreign_resource(
            fmpz_matrix,
            dependency_count,
            dependency_count,
        )
        if dependency_scan_active:
            if dependency_count == 0:
                return False
            dependency_row: uint64 = 0
            while dependency_row < dependency_count:
                relation_index: uint64 = 0
                while relation_index < relation_count:
                    dependency_relations[dependency_row, relation_index] = (
                        relation_transform[
                            relation_rank + dependency_row, relation_index
                        ]
                    )
                    relation_index += 1
                dependency_row += 1
            if not fmpz_matrix_lll_transform(
                dependency_reduced,
                dependency_lll_transform,
                dependency_relations,
            ):
                return False
        # Plan log precision from the resident dependency coefficients.
        dependency_coefficient_bits: uint64 = 0
        if dependency_scan_active:
            dependency_probe_row: uint64 = 0
            while dependency_probe_row < dependency_count:
                relation_index: uint64 = 0
                while relation_index < relation_count:
                    coefficient_bits = _cubic_bounded_bit_length(
                        dependency_reduced[dependency_probe_row, relation_index],
                        512,
                    )
                    if coefficient_bits > 512:
                        return False
                    if coefficient_bits > dependency_coefficient_bits:
                        dependency_coefficient_bits = coefficient_bits
                    relation_index += 1
                dependency_probe_row += 1
        output[59] = 432
        output[60] = dependency_coefficient_bits
        dependency_log_scale = analytic_scale
        # Budget for both dependency combination and Euclidean cleanup.
        dependency_precision_extra: uint64 = 2 * dependency_coefficient_bits + 64
        dependency_precision_index: uint64 = 0
        while dependency_precision_index < dependency_precision_extra:
            dependency_log_scale *= 2
            dependency_precision_index += 1
        dependency_log_precision: uint64 = (
            _CUBIC_ANALYTIC_PRECISION + dependency_precision_extra
        )
        relation_logs = arena.foreign_resource(
            fmpz_matrix,
            relation_count,
            2,
        )
        if dependency_scan_active:
            relation_index: uint64 = 0
            while relation_index < relation_count:
                (
                    witness_log_lower,
                    witness_log_upper,
                ) = _cubic_real_log_bounds(
                    log_numerators,
                    log_denominators,
                    log_endpoints,
                    coefficients,
                    denominator,
                    basis_zero_zero,
                    basis_zero_one,
                    basis_zero_two,
                    basis_one_one,
                    basis_one_two,
                    basis_two_two,
                    dependency_relation_elements[relation_index, 0],
                    dependency_relation_elements[relation_index, 1],
                    dependency_relation_elements[relation_index, 2],
                    dependency_log_scale,
                    dependency_log_precision,
                )
                if witness_log_upper < witness_log_lower:
                    return False
                relation_logs[relation_index, 0] = witness_log_lower
                relation_logs[relation_index, 1] = witness_log_upper
                relation_index += 1
        output[59] = 433
        unit_combinations = arena.foreign_resource(
            fmpz_matrix,
            2,
            relation_count,
        )
        dependency_row = 0
        while dependency_scan_active and dependency_row < dependency_count:
            dependency_nonzero = False
            dependency_log_lower = 0
            dependency_log_upper = 0
            relation_index: uint64 = 0
            while relation_index < relation_count:
                dependency_exponent = dependency_reduced[dependency_row, relation_index]
                if dependency_exponent != 0:
                    dependency_nonzero = True
                    witness_log_lower = relation_logs[relation_index, 0]
                    witness_log_upper = relation_logs[relation_index, 1]
                    if dependency_exponent > 0:
                        dependency_log_lower += dependency_exponent * witness_log_lower
                        dependency_log_upper += dependency_exponent * witness_log_upper
                    else:
                        dependency_log_lower += dependency_exponent * witness_log_upper
                        dependency_log_upper += dependency_exponent * witness_log_lower
                relation_index += 1
            dependency_orientation = 0
            dependency_regulator_lower = dependency_log_lower
            dependency_regulator_upper = dependency_log_upper
            if dependency_log_lower > 0:
                dependency_orientation = 1
            elif dependency_log_upper < 0:
                dependency_orientation = -1
                dependency_regulator_lower = -dependency_log_upper
                dependency_regulator_upper = -dependency_log_lower
            if dependency_nonzero and dependency_orientation != 0:
                relation_index = 0
                while relation_index < relation_count:
                    dependency_exponent = dependency_reduced[
                        dependency_row, relation_index
                    ]
                    unit_combinations[1, relation_index] = (
                        dependency_orientation * dependency_exponent
                    )
                    relation_index += 1
                if not unit_found:
                    relation_index = 0
                    while relation_index < relation_count:
                        unit_combinations[0, relation_index] = unit_combinations[
                            1, relation_index
                        ]
                        relation_index += 1
                    unit_found = True
                    regulator_lower = dependency_regulator_lower
                    regulator_upper = dependency_regulator_upper
                else:
                    candidate_middle = (
                        dependency_regulator_lower + dependency_regulator_upper
                    )
                    best_middle = regulator_lower + regulator_upper
                    if candidate_middle < best_middle:
                        relation_index = 0
                        while relation_index < relation_count:
                            saved_exponent = unit_combinations[0, relation_index]
                            unit_combinations[0, relation_index] = unit_combinations[
                                1, relation_index
                            ]
                            unit_combinations[1, relation_index] = saved_exponent
                            relation_index += 1
                        saved_lower = regulator_lower
                        saved_upper = regulator_upper
                        regulator_lower = dependency_regulator_lower
                        regulator_upper = dependency_regulator_upper
                        dependency_regulator_lower = saved_lower
                        dependency_regulator_upper = saved_upper
                    reduction_step: uint64 = 0
                    reduction_active = True
                    while reduction_active and reduction_step < 1024:
                        candidate_middle = (
                            dependency_regulator_lower + dependency_regulator_upper
                        )
                        best_middle = regulator_lower + regulator_upper
                        reduction_quotient = (
                            candidate_middle + best_middle // 2
                        ) // best_middle
                        if reduction_quotient < 1:
                            reduction_quotient = 1
                        remainder_lower = (
                            dependency_regulator_lower
                            - reduction_quotient * regulator_upper
                        )
                        remainder_upper = (
                            dependency_regulator_upper
                            - reduction_quotient * regulator_lower
                        )
                        remainder_orientation = 0
                        if remainder_lower > 0:
                            remainder_orientation = 1
                        elif remainder_upper < 0:
                            remainder_orientation = -1
                            saved_lower = remainder_lower
                            remainder_lower = -remainder_upper
                            remainder_upper = -saved_lower
                        if (
                            remainder_orientation == 0
                            or remainder_upper >= regulator_lower
                        ):
                            reduction_active = False
                        else:
                            relation_index = 0
                            while relation_index < relation_count:
                                best_exponent = unit_combinations[0, relation_index]
                                candidate_exponent = unit_combinations[
                                    1, relation_index
                                ]
                                remainder_exponent = remainder_orientation * (
                                    candidate_exponent
                                    - reduction_quotient * best_exponent
                                )
                                unit_combinations[0, relation_index] = (
                                    remainder_exponent
                                )
                                unit_combinations[1, relation_index] = best_exponent
                                relation_index += 1
                            dependency_regulator_lower = regulator_lower
                            dependency_regulator_upper = regulator_upper
                            regulator_lower = remainder_lower
                            regulator_upper = remainder_upper
                        reduction_step += 1
            dependency_row += 1
        output[59] = 434
        # If class-lattice compaction loses the unit, add a bounded witness tail.
        if not unit_found:
            recovery_tail_start: uint64 = 0
            if uncompacted_relation_count > _CUBIC_RELATION_RECOVERY_TAIL:
                recovery_tail_start = (
                    uncompacted_relation_count - _CUBIC_RELATION_RECOVERY_TAIL
                )
            recovery_tail_count: uint64 = 0
            recovery_source_row: uint64 = recovery_tail_start
            while recovery_source_row < uncompacted_relation_count:
                if relation_support[recovery_source_row, 0] == 0:
                    recovery_tail_count += 1
                recovery_source_row += 1
            recovery_relation_count: uint64 = support_count + recovery_tail_count
            recovery_relation_matrix = arena.foreign_resource(
                fmpz_matrix,
                recovery_relation_count,
                factor_count,
            )
            recovery_relation_elements = arena.foreign_resource(
                fmpz_matrix,
                recovery_relation_count,
                3,
            )
            recovery_row: uint64 = _cubic_copy_relation_support_tail(
                relation_matrix,
                relation_elements,
                relation_support,
                uncompacted_relation_count,
                factor_count,
                recovery_tail_start,
                recovery_relation_matrix,
                recovery_relation_elements,
            )
            if recovery_row != recovery_relation_count:
                return False
            prefix_matrix = arena.foreign_resource(
                fmpz_matrix,
                recovery_relation_count,
                factor_count,
            )
            prefix_hnf = arena.foreign_resource(
                fmpz_matrix,
                recovery_relation_count,
                factor_count,
            )
            prefix_transform = arena.foreign_resource(
                fmpz_matrix,
                recovery_relation_count,
                recovery_relation_count,
            )
            prefix_dependency_rows: uint64 = 1
            if recovery_relation_count > factor_count:
                prefix_dependency_rows = recovery_relation_count - factor_count
            prefix_dependencies = arena.foreign_resource(
                fmpz_matrix,
                prefix_dependency_rows,
                recovery_relation_count,
            )
            prefix_dependencies_reduced = arena.foreign_resource(
                fmpz_matrix,
                prefix_dependency_rows,
                recovery_relation_count,
            )
            prefix_dependency_transform = arena.foreign_resource(
                fmpz_matrix,
                prefix_dependency_rows,
                prefix_dependency_rows,
            )
            prefix_logs = arena.foreign_resource(
                fmpz_matrix,
                recovery_relation_count,
                2,
            )
            prefix_unit_combinations = arena.foreign_resource(
                fmpz_matrix,
                2,
                recovery_relation_count,
            )
            prefix_unit_result = arena.foreign_resource(
                fmpz_matrix,
                1,
                5,
            )
            prefix_unit_status = _cubic_relation_prefix_has_archimedean_unit(
                log_numerators,
                log_denominators,
                log_endpoints,
                workspace,
                coefficients,
                recovery_relation_matrix,
                recovery_relation_elements,
                recovery_relation_count,
                factor_count,
                denominator,
                basis_zero_zero,
                basis_zero_one,
                basis_zero_two,
                basis_one_one,
                basis_one_two,
                basis_two_two,
                analytic_scale,
                _CUBIC_ANALYTIC_PRECISION,
                prefix_matrix,
                prefix_hnf,
                prefix_transform,
                prefix_dependencies,
                prefix_dependencies_reduced,
                prefix_dependency_transform,
                prefix_logs,
                prefix_unit_combinations,
                prefix_unit_result,
            )
            if prefix_unit_status < 0:
                return False
            if prefix_unit_status == 1:
                unit_zero = prefix_unit_result[0, 0]
                unit_one = prefix_unit_result[0, 1]
                unit_two = prefix_unit_result[0, 2]
                regulator_lower = prefix_unit_result[0, 3]
                regulator_upper = prefix_unit_result[0, 4]
                unit_found = True
                dependency_scan_active = False
        if unit_found:
            output[61] = 1
        if not unit_found:
            return False
        if dependency_scan_active:
            dependency_scale_quotient = dependency_log_scale // analytic_scale
            regulator_at_dependency_scale = True
            (
                reconstruction_status,
                reconstructed_zero,
                reconstructed_one,
                reconstructed_two,
            ) = _cubic_reconstruct_archimedean_unit(
                workspace,
                coefficients,
                denominator,
                basis_zero_zero,
                basis_zero_one,
                basis_zero_two,
                basis_one_one,
                basis_one_two,
                basis_two_two,
                dependency_relation_elements,
                unit_combinations,
                relation_count,
                regulator_lower,
                regulator_upper,
                analytic_scale,
                dependency_log_scale,
            )
            output[59] = 435
            output[62] = reconstruction_status
            if reconstruction_status == 2:
                output[56] = reconstructed_zero
                output[57] = reconstructed_one
                output[58] = reconstructed_two
            dependency_materialization_active = reconstruction_status != 1
            if reconstruction_status == 1:
                (
                    reconstructed_regulator_lower,
                    reconstructed_regulator_upper,
                ) = _cubic_regulator_bounds(
                    log_numerators,
                    log_denominators,
                    log_endpoints,
                    coefficients,
                    denominator,
                    basis_zero_zero,
                    basis_zero_one,
                    basis_zero_two,
                    basis_one_one,
                    basis_one_two,
                    basis_two_two,
                    reconstructed_zero,
                    reconstructed_one,
                    reconstructed_two,
                    analytic_scale,
                    _CUBIC_ANALYTIC_PRECISION,
                )
                if (
                    reconstructed_regulator_lower > 0
                    and reconstructed_regulator_upper >= reconstructed_regulator_lower
                    and reconstructed_regulator_lower * dependency_scale_quotient
                    <= regulator_upper
                    and regulator_lower
                    <= reconstructed_regulator_upper * dependency_scale_quotient
                ):
                    unit_zero = reconstructed_zero
                    unit_one = reconstructed_one
                    unit_two = reconstructed_two
                    regulator_lower = reconstructed_regulator_lower
                    regulator_upper = reconstructed_regulator_upper
                    regulator_at_dependency_scale = False
                    dependency_materialization_active = False

            if dependency_materialization_active:
                output[59] = 436
                # Bound the small exact-product fallback before exponentiation.
                dependency_exponent_total = 0
                relation_index = 0
                while relation_index < relation_count:
                    dependency_exponent = unit_combinations[0, relation_index]
                    if dependency_exponent < 0:
                        dependency_exponent = -dependency_exponent
                    if dependency_exponent > 4096:
                        output[59] = 437
                        output[60] = dependency_exponent
                        return False
                    dependency_exponent_total += dependency_exponent
                    if dependency_exponent_total > 16384:
                        output[59] = 438
                        output[60] = dependency_exponent_total
                        return False
                    relation_index += 1
                coordinate_index: uint64 = 0
                while coordinate_index < 3:
                    identity_coordinate = identity_zero
                    if coordinate_index == 1:
                        identity_coordinate = identity_one
                    elif coordinate_index == 2:
                        identity_coordinate = identity_two
                    dependency_coordinates[0, coordinate_index] = identity_coordinate
                    dependency_coordinates[1, coordinate_index] = identity_coordinate
                    coordinate_index += 1
                relation_index = 0
                while relation_index < relation_count:
                    dependency_exponent = unit_combinations[0, relation_index]
                    absolute_exponent = dependency_exponent
                    if absolute_exponent < 0:
                        absolute_exponent = -absolute_exponent
                    if absolute_exponent > 0:
                        if not _cubic_matrix_power_coordinates(
                            workspace,
                            dependency_relation_elements,
                            relation_index,
                            absolute_exponent,
                            dependency_coordinates,
                            2,
                            3,
                        ):
                            return False
                        product_row: uint64 = 0
                        if dependency_exponent < 0:
                            product_row = 1
                        if not _cubic_matrix_multiply_coordinates(
                            workspace,
                            dependency_coordinates,
                            product_row,
                            dependency_coordinates,
                            2,
                            dependency_coordinates,
                            product_row,
                        ):
                            return False
                    relation_index += 1
                if not _cubic_matrix_exact_quotient_coordinates(
                    workspace,
                    dependency_coordinates,
                    0,
                    1,
                    4,
                    5,
                ):
                    return False
                unit_zero = dependency_coordinates[4, 0]
                unit_one = dependency_coordinates[4, 1]
                unit_two = dependency_coordinates[4, 2]
                dependency_norm = _cubic_norm_form_value(
                    workspace,
                    unit_zero,
                    unit_one,
                    unit_two,
                )
                if dependency_norm != 1 and dependency_norm != -1:
                    return False
            if regulator_at_dependency_scale:
                regulator_lower //= dependency_scale_quotient
                regulator_upper = (
                    regulator_upper + dependency_scale_quotient - 1
                ) // dependency_scale_quotient
        output[56] = unit_zero
        output[57] = unit_one
        output[58] = unit_two
        output[63] = 44

        if regulator_lower <= 0 or regulator_upper < regulator_lower:
            return False
        output[63] = 5

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
        output[63] = 6

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
        output[63] = 7

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
            analytic_values[analytic_index, 0] = workspace[
                _CUBIC_ANALYTIC_VALUE_OFFSET + analytic_index
            ]
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
            log_numerators,
            log_denominators,
            log_endpoints,
            regulator_lower,
            regulator_upper,
            analytic_scale,
            analytic_precision,
        )
        log_two_pi_lower, log_two_pi_upper = _cubic_log_two_pi_bounds(
            log_numerators,
            log_denominators,
            log_endpoints,
            analytic_scale,
            analytic_precision,
        )
        log_discriminant_lower = analytic_endpoints[12, 0]
        log_discriminant_upper = analytic_endpoints[13, 0]
        log_class_lower = analytic_endpoints[16, 0]
        log_class_upper = analytic_endpoints[17, 0]
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
        log_two_lower, log_two_upper = _cubic_arb_log_positive_rational_bounds(
            log_numerators,
            log_denominators,
            log_endpoints,
            2,
            1,
            analytic_precision,
        )
        saturation_attempts: uint64 = 0
        saturation_search_active = (
            index_log_upper >= log_two_lower and log_two_upper >= log_two_lower
        )
        while saturation_search_active and saturation_attempts < 8:
            (
                saturation_root_status,
                saturation_root_zero,
                saturation_root_one,
                saturation_root_two,
            ) = _cubic_exact_unit_square_root(
                workspace,
                coefficients,
                denominator,
                basis_zero_zero,
                basis_zero_one,
                basis_zero_two,
                basis_one_one,
                basis_one_two,
                basis_two_two,
                identity_zero,
                identity_one,
                identity_two,
                unit_zero,
                unit_one,
                unit_two,
                analytic_scale,
                dependency_coordinates,
            )
            saturation_prime = 2
            if saturation_root_status != 1:
                (
                    saturation_root_status,
                    saturation_root_zero,
                    saturation_root_one,
                    saturation_root_two,
                ) = _cubic_exact_unit_fifth_root(
                    workspace,
                    coefficients,
                    denominator,
                    basis_zero_zero,
                    basis_zero_one,
                    basis_zero_two,
                    basis_one_one,
                    basis_one_two,
                    basis_two_two,
                    identity_zero,
                    identity_one,
                    identity_two,
                    unit_zero,
                    unit_one,
                    unit_two,
                    analytic_scale,
                )
                saturation_prime = 5
            if saturation_root_status != 1:
                saturation_search_active = False
            else:
                (
                    saturation_regulator_lower,
                    saturation_regulator_upper,
                ) = _cubic_regulator_bounds(
                    log_numerators,
                    log_denominators,
                    log_endpoints,
                    coefficients,
                    denominator,
                    basis_zero_zero,
                    basis_zero_one,
                    basis_zero_two,
                    basis_one_one,
                    basis_one_two,
                    basis_two_two,
                    saturation_root_zero,
                    saturation_root_one,
                    saturation_root_two,
                    analytic_scale,
                    analytic_precision,
                )
                if (
                    saturation_regulator_lower <= 0
                    or saturation_regulator_upper < saturation_regulator_lower
                    or saturation_regulator_lower * saturation_prime > regulator_upper
                    or regulator_lower > saturation_regulator_upper * saturation_prime
                ):
                    return False
                unit_zero = saturation_root_zero
                unit_one = saturation_root_one
                unit_two = saturation_root_two
                regulator_lower = saturation_regulator_lower
                regulator_upper = saturation_regulator_upper
                log_regulator_lower, log_regulator_upper = _cubic_log_interval_bounds(
                    log_numerators,
                    log_denominators,
                    log_endpoints,
                    regulator_lower,
                    regulator_upper,
                    analytic_scale,
                    analytic_precision,
                )
                if log_regulator_upper < log_regulator_lower:
                    return False
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
                saturation_attempts += 1
                saturation_search_active = index_log_upper >= log_two_lower
        output[40] = regulator_lower
        output[41] = regulator_upper
        output[42] = zeta_lower
        output[43] = zeta_upper
        output[44] = index_log_lower
        output[45] = index_log_upper
        output[46] = tail_upper
        output[47] = analytic_scale
        output[48] = log_two_lower
        output[49] = log_two_upper
        output[63] = 8
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
        output[19] = used_compound_multiplier_limit
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
        output[35] = _CUBIC_PROOF_ANALYTIC_GRH
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

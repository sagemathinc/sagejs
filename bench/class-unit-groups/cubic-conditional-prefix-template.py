"""Source-copy experiment: admission tail comes verbatim from production.

The builder replaces the final placeholder with the existing admission and
return blocks. No production entry point imports or dispatches on this file.
"""

from __future__ import annotations


def _cubic_conditional_centered_value(
    low: int, high: int, numerator: int, denominator: int, index: int
) -> int:
    center = (denominator - 2 * numerator) // (2 * denominator)
    if center < low:
        center = low
    if center > high:
        center = high
    left = center - low
    right = high - center
    paired = left
    if right < paired:
        paired = right
    if index <= 2 * paired:
        if index % 2 == 1:
            return center + (index + 1) // 2
        return center - index // 2
    if right > left:
        return center + index - paired
    return center - index + paired


def _cubic_append_reduced_ideal_ellipsoid(
    search: CubicSearchWorkspace,
    modular_workspace: UInt64Buffer,
    basis_offset: uint64,
    transform_row_offset: uint64,
    parameters: FmpzMatrix,
    parameter_row: uint64,
    relation_count: uint64,
    relation_capacity: uint64,
    factor_count: uint64,
    group_count: uint64,
    relation_target: uint64,
    streaming_relation_collection: bool,
    online_relation_quotient_enabled: bool,
    online_relation_count: uint64,
    online_relation_status: int,
    coefficient_zero: int,
    coefficient_one: int,
    coefficient_two: int,
    candidate_count: uint64,
    proposal_budget: uint64,
    lower_bound: int,
) -> tuple[uint64, uint64, uint64, int, int, int, int]:
    """Prune blocks in a monotone virtual box, preserving budget accounting.

    The first two cursor coordinates encode interval ordinals, not actual
    lattice coefficients. Feasible conditional intervals occupy prefixes of
    each virtual row/plane; the other slots are skipped in constant time.
    The last cursor coordinate remains z. Every skip consumes virtual slots,
    clamped to this call's budget. A pause can land inside a skipped block.
    The original caller's flat-position difference remains the budget used.
    """
    limit_zero = parameters[parameter_row, 7]
    limit_one = parameters[parameter_row, 8]
    limit_two = parameters[parameter_row, 9]
    if (
        proposal_budget == 0
        or online_relation_status < 0
        or online_relation_status == 2
    ):
        return (
            relation_count,
            candidate_count,
            online_relation_count,
            online_relation_status,
            coefficient_zero,
            coefficient_one,
            coefficient_two,
        )
    a = parameters[parameter_row, 0]
    b = parameters[parameter_row, 1]
    c = parameters[parameter_row, 2]
    d = parameters[parameter_row, 3]
    e = parameters[parameter_row, 4]
    f = parameters[parameter_row, 5]
    bound = parameters[parameter_row, 6]
    delta = a * d - b * b
    determinant = a * (d * f - e * e) - b * (b * f - c * e) + c * (b * e - c * d)
    h = a * e - b * c
    width_zero = 2 * limit_zero + 1
    width_one = 2 * limit_one + 1
    cached_two = coefficient_two - 1
    cached_one = coefficient_one - 1
    y_low = 1
    y_high = 0
    x_low = 1
    x_high = 0
    y_numerator = 0
    x_numerator = 0
    actual_one = 0
    proposal_count: uint64 = 0
    while (
        coefficient_two <= limit_two
        and proposal_count < proposal_budget
        and online_relation_status >= 0
        and online_relation_status != 2
        and not (
            streaming_relation_collection
            and _cubic_modular_relation_collection_complete(
                modular_workspace, relation_count, relation_target, factor_count
            )
        )
    ):
        ordinal_zero = coefficient_zero + limit_zero
        ordinal_one = coefficient_one + limit_one
        if coefficient_two != cached_two:
            cached_two = coefficient_two
            cached_one = coefficient_one - 1
            y_low = 1
            y_high = 0
            remaining = bound * delta - determinant * coefficient_two * coefficient_two
            if coefficient_two >= 0 and remaining >= 0:
                y_numerator = h * coefficient_two
                radius = _cubic_floor_sqrt(a * remaining)
                y_low = -((radius + y_numerator) // delta)
                y_high = (radius - y_numerator) // delta
                if y_low < -limit_one:
                    y_low = -limit_one
                if y_high > limit_one:
                    y_high = limit_one
                if coefficient_two == 0 and y_low < 0:
                    y_low = 0
        status = 0
        coordinate_zero = 0
        coordinate_one = 0
        coordinate_two = 0
        skip = 1
        if ordinal_one > y_high - y_low:
            skip = (width_one - ordinal_one) * width_zero - ordinal_zero
        else:
            if coefficient_one != cached_one:
                cached_one = coefficient_one
                actual_one = _cubic_conditional_centered_value(
                    y_low, y_high, y_numerator, delta, ordinal_one
                )
                x_numerator = b * actual_one + c * coefficient_two
                square = (
                    a
                    * (
                        bound
                        - d * actual_one * actual_one
                        - 2 * e * actual_one * coefficient_two
                        - f * coefficient_two * coefficient_two
                    )
                    + x_numerator * x_numerator
                )
                radius = _cubic_floor_sqrt(square)
                x_low = -((radius + x_numerator) // a)
                x_high = (radius - x_numerator) // a
                if x_low < -limit_zero:
                    x_low = -limit_zero
                if x_high > limit_zero:
                    x_high = limit_zero
                if coefficient_two == 0 and actual_one == 0 and x_low < 1:
                    x_low = 1
            if ordinal_zero > x_high - x_low:
                skip = width_zero - ordinal_zero
            else:
                actual_zero = _cubic_conditional_centered_value(
                    x_low, x_high, x_numerator, a, ordinal_zero
                )
                status, coordinate_zero, coordinate_one, coordinate_two = (
                    _cubic_reduced_ellipsoid_candidate(
                        search.integers,
                        basis_offset,
                        search.transforms,
                        transform_row_offset,
                        parameters,
                        parameter_row,
                        actual_zero,
                        actual_one,
                        coefficient_two,
                        lower_bound,
                    )
                )
        remaining_budget: int = proposal_budget - proposal_count
        if skip > remaining_budget:
            skip = remaining_budget
        proposal_count += checked_uint64(skip)
        position = ordinal_zero + skip
        coefficient_zero = position % width_zero - limit_zero
        position = ordinal_one + position // width_zero
        coefficient_one = position % width_one - limit_one
        coefficient_two += position // width_one
        # ORIGINAL_ADMISSION_AND_RETURN

"""Source-transparent fixed-scale genus-2 Kummer height iteration."""

from __future__ import annotations

from sagejs.native import (
    IntegerBuffer,
    NativeIntegerVector,
    UInt64Buffer,
    native,
    uint64,
)


@native
def _modular_kummer_height_recurrence_point(
    output: IntegerBuffer,
    output_offset: uint64,
    coefficients: IntegerBuffer,
    exponents: UInt64Buffer,
    term_counts: UInt64Buffer,
    coordinate0: int,
    coordinate1: int,
    coordinate2: int,
    coordinate3: int,
    discriminant_bound: int,
    modulus: int,
    steps: uint64,
) -> int:
    """Iterate one sparse-quartic point into a point-major output span."""
    zero: uint64 = 0
    one: uint64 = 1
    four: uint64 = 4
    total_terms: uint64 = zero
    table_index: uint64 = zero
    while table_index < four:
        total_terms = total_terms + term_counts[table_index]
        table_index = table_index + one

    state0 = coordinate0 % modulus
    state1 = coordinate1 % modulus
    state2 = coordinate2 % modulus
    state3 = coordinate3 % modulus
    step: uint64 = zero
    while step < steps:
        raw0 = 0
        raw1 = 0
        raw2 = 0
        raw3 = 0
        term_index: uint64 = zero
        table_index = zero
        while table_index < four:
            table_end = term_index + term_counts[table_index]
            total = 0
            while term_index < table_end:
                value = coefficients[term_index] % modulus
                coordinate: uint64 = zero
                while coordinate < four:
                    exponent: uint64 = exponents[term_index * four + coordinate]
                    if exponent > four:
                        return -1
                    if coordinate == 0:
                        base = state0
                    elif coordinate == 1:
                        base = state1
                    elif coordinate == 2:
                        base = state2
                    else:
                        base = state3
                    power_index: uint64 = zero
                    while power_index < exponent:
                        value = value * base % modulus
                        power_index = power_index + one
                    coordinate = coordinate + one
                total = (total + value) % modulus
                term_index = term_index + one
            if table_index == 0:
                raw0 = total
            elif table_index == 1:
                raw1 = total
            elif table_index == 2:
                raw2 = total
            else:
                raw3 = total
            table_index = table_index + one

        common = discriminant_bound
        coordinate = zero
        while coordinate < four:
            if coordinate == 0:
                value = raw0
            elif coordinate == 1:
                value = raw1
            elif coordinate == 2:
                value = raw2
            else:
                value = raw3
            while value != 0:
                remainder = common % value
                common = value
                value = remainder
            coordinate = coordinate + one
        if common == 0:
            return -2
        output[output_offset + step] = common
        state0 = raw0 // common
        state1 = raw1 // common
        state2 = raw2 // common
        state3 = raw3 // common
        step = step + one
    return steps


@native
def modular_kummer_height_recurrence(
    output: IntegerBuffer,
    coefficients: IntegerBuffer,
    exponents: UInt64Buffer,
    term_counts: UInt64Buffer,
    coordinate0: int,
    coordinate1: int,
    coordinate2: int,
    coordinate3: int,
    discriminant_bound: int,
    modulus: int,
    steps: uint64,
) -> int:
    """Iterate sparse quartics modulo the Müller--Stoll precision bound.

    The four coordinates and sparse `coefficients` are arbitrary exact
    integers; `exponents` contains four unsigned entries per term.  The
    `output` row records the primitive content factor
    `gcd(D,delta_1,...,delta_4)` at each step.  Mutable buffers must not alias.

    Return `steps` on success, `-1` for an invalid shape, exponent, or modulus,
    and `-2` if the modular image loses all precision.  The source body is both
    the ordinary Python oracle and the isolated tagged-int64/GMP native core.
    """
    four: uint64 = 4
    if (
        len(output) != steps
        or len(term_counts) != four
        or discriminant_bound <= 0
        or modulus <= 0
    ):
        return -1
    total_terms: uint64 = 0
    table_index: uint64 = 0
    while table_index < four:
        total_terms = total_terms + term_counts[table_index]
        table_index = table_index + 1
    if len(coefficients) != total_terms or len(exponents) != total_terms * four:
        return -1
    return _modular_kummer_height_recurrence_point(
        output,
        0,
        coefficients,
        exponents,
        term_counts,
        coordinate0,
        coordinate1,
        coordinate2,
        coordinate3,
        discriminant_bound,
        modulus,
        steps,
    )


@native
def modular_kummer_height_recurrence_batch(
    output: IntegerBuffer,
    states: IntegerBuffer,
    coefficients: IntegerBuffer,
    exponents: UInt64Buffer,
    term_counts: UInt64Buffer,
    statuses: UInt64Buffer,
    discriminant_bound: int,
    modulus: int,
    point_count: uint64,
    steps: uint64,
) -> int:
    """Iterate a bounded point-major modular Kummer batch.

    The model tables and modulus are shared, but every point has an independent
    four-coordinate state and `steps`-entry output span.  `statuses[i]` is one
    after success and two if point `i` loses all modular precision.  No output
    from a non-success status is a certificate.  Mutable buffers must be
    pairwise disjoint.
    """
    four: uint64 = 4
    maximum_points: uint64 = 64
    maximum_steps: uint64 = 1024
    maximum_rows: uint64 = 16384
    if (
        point_count == 0
        or point_count > maximum_points
        or steps > maximum_steps
        or point_count * steps > maximum_rows
        or len(states) != point_count * four
        or len(output) != point_count * steps
        or len(statuses) != point_count
        or len(term_counts) != four
        or discriminant_bound <= 0
        or modulus <= 0
    ):
        return -1
    total_terms: uint64 = 0
    table_index: uint64 = 0
    while table_index < four:
        total_terms = total_terms + term_counts[table_index]
        table_index = table_index + 1
    if len(coefficients) != total_terms or len(exponents) != total_terms * four:
        return -1

    completed: uint64 = 0
    failed = False
    while completed < point_count:
        state_offset = completed * four
        status = _modular_kummer_height_recurrence_point(
            output,
            completed * steps,
            coefficients,
            exponents,
            term_counts,
            states[state_offset],
            states[state_offset + 1],
            states[state_offset + 2],
            states[state_offset + 3],
            discriminant_bound,
            modulus,
            steps,
        )
        if status == steps:
            statuses[completed] = 1
        elif status == -2:
            statuses[completed] = 2
            failed = True
        else:
            return -1
        completed = completed + 1
    if failed:
        return -2
    return point_count


@native
def exact_kummer_small_step_batch(
    output: IntegerBuffer,
    states: IntegerBuffer,
    coefficients: IntegerBuffer,
    exponents: UInt64Buffer,
    term_counts: UInt64Buffer,
    statuses: UInt64Buffer,
    point_count: uint64,
    steps: uint64,
) -> int:
    """Replay at most two exact Flynn steps for a point-major batch.

    Each seven-entry output row is `(content, source_height, raw_height,
    normalized_0,...,normalized_3)`. This bounded exact replay is the local
    modular/dyadic differential oracle, not the high-precision production
    recurrence. Mutable buffers must be pairwise disjoint.
    """
    four: uint64 = 4
    seven: uint64 = 7
    maximum_points: uint64 = 64
    maximum_steps: uint64 = 2
    if (
        point_count == 0
        or point_count > maximum_points
        or steps > maximum_steps
        or len(states) != point_count * four
        or len(output) != point_count * steps * seven
        or len(statuses) != point_count
        or len(term_counts) != four
    ):
        return -1
    total_terms: uint64 = 0
    table_index: uint64 = 0
    while table_index < four:
        total_terms = total_terms + term_counts[table_index]
        table_index = table_index + 1
    if len(coefficients) != total_terms or len(exponents) != total_terms * four:
        return -1

    point: uint64 = 0
    while point < point_count:
        state_offset = point * four
        state0 = states[state_offset]
        state1 = states[state_offset + 1]
        state2 = states[state_offset + 2]
        state3 = states[state_offset + 3]
        step: uint64 = 0
        while step < steps:
            source_height = abs(state0)
            if abs(state1) > source_height:
                source_height = abs(state1)
            if abs(state2) > source_height:
                source_height = abs(state2)
            if abs(state3) > source_height:
                source_height = abs(state3)
            if source_height == 0:
                statuses[point] = 2
                return -2

            raw0 = 0
            raw1 = 0
            raw2 = 0
            raw3 = 0
            term_index: uint64 = 0
            table_index = 0
            while table_index < four:
                table_end = term_index + term_counts[table_index]
                total = 0
                while term_index < table_end:
                    value = coefficients[term_index]
                    coordinate: uint64 = 0
                    while coordinate < four:
                        exponent = exponents[term_index * four + coordinate]
                        if exponent > four:
                            return -1
                        if coordinate == 0:
                            base = state0
                        elif coordinate == 1:
                            base = state1
                        elif coordinate == 2:
                            base = state2
                        else:
                            base = state3
                        power_index: uint64 = 0
                        while power_index < exponent:
                            value = value * base
                            power_index = power_index + 1
                        coordinate = coordinate + 1
                    total = total + value
                    term_index = term_index + 1
                if table_index == 0:
                    raw0 = total
                elif table_index == 1:
                    raw1 = total
                elif table_index == 2:
                    raw2 = total
                else:
                    raw3 = total
                table_index = table_index + 1

            raw_height = abs(raw0)
            if abs(raw1) > raw_height:
                raw_height = abs(raw1)
            if abs(raw2) > raw_height:
                raw_height = abs(raw2)
            if abs(raw3) > raw_height:
                raw_height = abs(raw3)
            common = 0
            coordinate = 0
            while coordinate < four:
                if coordinate == 0:
                    value = raw0
                elif coordinate == 1:
                    value = raw1
                elif coordinate == 2:
                    value = raw2
                else:
                    value = raw3
                if value < 0:
                    value = -value
                while value != 0:
                    remainder = common % value
                    common = value
                    value = remainder
                coordinate = coordinate + 1
            if common == 0:
                statuses[point] = 2
                return -2

            state0 = raw0 // common
            state1 = raw1 // common
            state2 = raw2 // common
            state3 = raw3 // common
            sign = 1
            if state0 != 0:
                if state0 < 0:
                    sign = -1
            elif state1 != 0:
                if state1 < 0:
                    sign = -1
            elif state2 != 0:
                if state2 < 0:
                    sign = -1
            elif state3 < 0:
                sign = -1
            if sign < 0:
                state0 = -state0
                state1 = -state1
                state2 = -state2
                state3 = -state3

            output_offset = (point * steps + step) * seven
            output[output_offset] = common
            output[output_offset + 1] = source_height
            output[output_offset + 2] = raw_height
            output[output_offset + 3] = state0
            output[output_offset + 4] = state1
            output[output_offset + 5] = state2
            output[output_offset + 6] = state3
            step = step + 1
        states[state_offset] = state0
        states[state_offset + 1] = state1
        states[state_offset + 2] = state2
        states[state_offset + 3] = state3
        statuses[point] = 1
        point = point + 1
    return point_count


@native
def _height_ceiling_quotient(numerator: int, denominator: int) -> int:
    return -((-numerator) // denominator)


@native
def _height_atanh_log_bounds(
    numerator: int, denominator: int, scale: int
) -> tuple[int, int]:
    """Enclose `2*atanh(numerator/denominator)` at exact scale."""
    if denominator <= 0 or numerator <= -denominator or numerator >= denominator:
        return (1, 0)
    if scale <= 0:
        return (1, 0)
    sign = 1
    if numerator < 0:
        numerator = -numerator
        sign = -1
    if numerator == 0:
        return (0, 0)
    lower = 0
    upper = 0
    numerator_power = numerator
    denominator_power = denominator
    numerator_square = numerator * numerator
    denominator_square = denominator * denominator
    for index in range(4096):
        odd = 2 * index + 1
        term_denominator = odd * denominator_power
        term_numerator = 2 * scale * numerator_power
        lower = lower + term_numerator // term_denominator
        upper = upper + _height_ceiling_quotient(term_numerator, term_denominator)

        next_numerator_power = numerator_power * numerator_square
        next_denominator_power = denominator_power * denominator_square
        tail_numerator = 2 * scale * next_numerator_power * denominator_square
        tail_denominator = (
            (odd + 2) * next_denominator_power * (denominator_square - numerator_square)
        )
        if tail_numerator < tail_denominator:
            # Every term is positive and the omitted geometric majorant is
            # strictly below one unit at `scale`.
            if sign < 0:
                return (-(upper + 1), -lower)
            return (lower, upper + 1)
        numerator_power = next_numerator_power
        denominator_power = next_denominator_power
    return (1, 0)


@native
def _positive_dyadic_log_bounds(
    numerator: int,
    scale: int,
    work_scale: int,
    log_two_lower: int,
    log_two_upper: int,
) -> tuple[int, int]:
    """Enclose `log(numerator/scale)` at `work_scale` exactly."""
    if numerator <= 0 or scale <= 0 or work_scale <= 0:
        return (1, 0)
    power = scale
    exponent = 0
    if numerator >= scale:
        while power * 2 <= numerator:
            power = power * 2
            exponent = exponent + 1
    else:
        while power > numerator:
            power = power // 2
            exponent = exponent - 1
    # Choose the nearest power of two. Comparing squares avoids an irrational
    # threshold and puts the atanh argument in
    # `[-(sqrt(2)-1)/(sqrt(2)+1), +(sqrt(2)-1)/(sqrt(2)+1)]`, roughly halving
    # the number of exact series terms required by the former `[1,2)` range.
    if numerator * numerator > 2 * power * power:
        power = power * 2
        exponent = exponent + 1
    normalized_lower, normalized_upper = _height_atanh_log_bounds(
        numerator - power, numerator + power, work_scale
    )
    if normalized_upper < normalized_lower:
        return (1, 0)
    if exponent >= 0:
        return (
            exponent * log_two_lower + normalized_lower,
            exponent * log_two_upper + normalized_upper,
        )
    return (
        exponent * log_two_upper + normalized_lower,
        exponent * log_two_lower + normalized_upper,
    )


@native
def dyadic_log_interval_batch(
    output: IntegerBuffer,
    endpoints: IntegerBuffer,
    input_precision_bits: uint64,
    output_precision_bits: uint64,
) -> bool:
    """Batch rigorous logarithms of positive dyadic intervals.

    Input row `(a,b)` denotes `[a/2^input_precision_bits,
    b/2^input_precision_bits]`; the output row uses denominator
    `2^output_precision_bits`. Nearest-power-of-two range reduction places the
    absolute atanh argument below
    `(sqrt(2)-1)/(sqrt(2)+1)`. The signed series has an explicit geometric
    remainder below one work unit, and twenty guard bits are rounded down/up
    exactly at publication.
    """
    maximum_precision: uint64 = 4096
    maximum_intervals: uint64 = 1048576
    two: uint64 = 2
    if (
        input_precision_bits < 16
        or input_precision_bits > maximum_precision
        or output_precision_bits < 16
        or output_precision_bits > maximum_precision
        or len(endpoints) % two != 0
        or len(endpoints) // two > maximum_intervals
        or len(output) != len(endpoints)
    ):
        return False
    work_precision = output_precision_bits + 20
    work_scale = 1
    for _work_bit in range(work_precision):
        work_scale = work_scale * 2
    input_scale = 1
    for _input_bit in range(input_precision_bits):
        input_scale = input_scale * 2
    guard_scale = 1
    for _guard_bit in range(20):
        guard_scale = guard_scale * 2
    log_two_lower, log_two_upper = _height_atanh_log_bounds(1, 3, work_scale)
    if log_two_upper < log_two_lower:
        return False

    interval: uint64 = 0
    while interval < len(endpoints) // two:
        offset = interval * two
        lower_numerator = endpoints[offset]
        upper_numerator = endpoints[offset + 1]
        if lower_numerator <= 0 or upper_numerator < lower_numerator:
            return False
        lower_log_lower, lower_log_upper = _positive_dyadic_log_bounds(
            lower_numerator,
            input_scale,
            work_scale,
            log_two_lower,
            log_two_upper,
        )
        upper_log_lower, upper_log_upper = _positive_dyadic_log_bounds(
            upper_numerator,
            input_scale,
            work_scale,
            log_two_lower,
            log_two_upper,
        )
        if lower_log_upper < lower_log_lower or upper_log_upper < upper_log_lower:
            return False
        output[offset] = lower_log_lower // guard_scale
        output[offset + 1] = _height_ceiling_quotient(upper_log_upper, guard_scale)
        interval = interval + 1
    return True


@native
def _dyadic_kummer_height_recurrence_point(
    output: IntegerBuffer,
    output_base: uint64,
    state: IntegerBuffer,
    state_base: uint64,
    coefficients: IntegerBuffer,
    exponents: UInt64Buffer,
    term_counts: UInt64Buffer,
    workspace_memory_limit: uint64,
    scale: int,
    steps: uint64,
) -> int:
    """Iterate one dyadic point into point-major state and output spans."""
    zero: uint64 = 0
    one: uint64 = 1
    two: uint64 = 2
    four: uint64 = 4
    ten: uint64 = 10
    forty: uint64 = 40
    total_terms: uint64 = zero
    table_index: uint64 = zero
    while table_index < four:
        total_terms = total_terms + term_counts[table_index]
        table_index = table_index + one
    with NativeIntegerVector(forty + four * two, workspace_memory_limit) as scratch:
        scratch_base: uint64 = zero
        step: uint64 = zero
        while step < steps:
            coordinate: uint64 = zero
            while coordinate < four:
                power_offset = scratch_base + coordinate * ten
                state_offset = state_base + coordinate * two
                scratch[power_offset] = scale
                scratch[power_offset + 1] = scale
                scratch[power_offset + 2] = state[state_offset]
                scratch[power_offset + 3] = state[state_offset + 1]
                exponent: uint64 = two
                while exponent <= four:
                    left_offset = power_offset + (exponent - one) * two
                    right_offset = state_offset
                    left_lower = scratch[left_offset]
                    left_upper = scratch[left_offset + one]
                    right_lower = state[right_offset]
                    right_upper = state[right_offset + one]
                    if left_lower >= 0:
                        if right_lower >= 0:
                            product_lower = left_lower * right_lower
                            product_upper = left_upper * right_upper
                        elif right_upper <= 0:
                            product_lower = left_upper * right_lower
                            product_upper = left_lower * right_upper
                        else:
                            product_lower = left_upper * right_lower
                            product_upper = left_upper * right_upper
                    elif left_upper <= 0:
                        if right_lower >= 0:
                            product_lower = left_lower * right_upper
                            product_upper = left_upper * right_lower
                        elif right_upper <= 0:
                            product_lower = left_upper * right_upper
                            product_upper = left_lower * right_lower
                        else:
                            product_lower = left_lower * right_upper
                            product_upper = left_lower * right_lower
                    elif right_lower >= 0:
                        product_lower = left_lower * right_upper
                        product_upper = left_upper * right_upper
                    elif right_upper <= 0:
                        product_lower = left_upper * right_lower
                        product_upper = left_lower * right_lower
                    else:
                        product0 = left_lower * right_lower
                        product1 = left_lower * right_upper
                        product2 = left_upper * right_lower
                        product3 = left_upper * right_upper
                        product_lower = product0
                        if product1 < product_lower:
                            product_lower = product1
                        if product2 < product_lower:
                            product_lower = product2
                        if product3 < product_lower:
                            product_lower = product3
                        product_upper = product0
                        if product1 > product_upper:
                            product_upper = product1
                        if product2 > product_upper:
                            product_upper = product2
                        if product3 > product_upper:
                            product_upper = product3
                    target = power_offset + exponent * two
                    scratch[target] = product_lower // scale
                    scratch[target + 1] = -((-product_upper) // scale)
                    exponent = exponent + one
                coordinate = coordinate + one

            term_index: uint64 = zero
            table_index = zero
            while table_index < four:
                table_end = term_index + term_counts[table_index]
                total_lower = 0
                total_upper = 0
                while term_index < table_end:
                    coefficient = coefficients[term_index]
                    value_lower = coefficient * scale
                    value_upper = value_lower
                    coordinate = zero
                    while coordinate < four:
                        exponent = exponents[term_index * four + coordinate]
                        if exponent > four:
                            return -1
                        if exponent != 0:
                            power_offset = (
                                scratch_base + coordinate * ten + exponent * two
                            )
                            right_lower = scratch[power_offset]
                            right_upper = scratch[power_offset + one]
                            if value_lower >= 0:
                                if right_lower >= 0:
                                    product_lower = value_lower * right_lower
                                    product_upper = value_upper * right_upper
                                elif right_upper <= 0:
                                    product_lower = value_upper * right_lower
                                    product_upper = value_lower * right_upper
                                else:
                                    product_lower = value_upper * right_lower
                                    product_upper = value_upper * right_upper
                            elif value_upper <= 0:
                                if right_lower >= 0:
                                    product_lower = value_lower * right_upper
                                    product_upper = value_upper * right_lower
                                elif right_upper <= 0:
                                    product_lower = value_upper * right_upper
                                    product_upper = value_lower * right_lower
                                else:
                                    product_lower = value_lower * right_upper
                                    product_upper = value_lower * right_lower
                            elif right_lower >= 0:
                                product_lower = value_lower * right_upper
                                product_upper = value_upper * right_upper
                            elif right_upper <= 0:
                                product_lower = value_upper * right_lower
                                product_upper = value_lower * right_lower
                            else:
                                product0 = value_lower * right_lower
                                product1 = value_lower * right_upper
                                product2 = value_upper * right_lower
                                product3 = value_upper * right_upper
                                product_lower = product0
                                if product1 < product_lower:
                                    product_lower = product1
                                if product2 < product_lower:
                                    product_lower = product2
                                if product3 < product_lower:
                                    product_lower = product3
                                product_upper = product0
                                if product1 > product_upper:
                                    product_upper = product1
                                if product2 > product_upper:
                                    product_upper = product2
                                if product3 > product_upper:
                                    product_upper = product3
                            value_lower = product_lower // scale
                            value_upper = -((-product_upper) // scale)
                        coordinate = coordinate + one
                    total_lower += value_lower
                    total_upper += value_upper
                    term_index = term_index + one
                scratch[scratch_base + forty + table_index * two] = total_lower
                scratch[scratch_base + forty + one + table_index * two] = total_upper
                table_index = table_index + one

            maximum_lower = 0
            maximum_upper = 0
            coordinate = zero
            while coordinate < four:
                raw_offset = scratch_base + forty + coordinate * two
                lower = scratch[raw_offset]
                upper = scratch[raw_offset + 1]
                if lower >= 0:
                    absolute_lower = lower
                    absolute_upper = upper
                elif upper <= 0:
                    absolute_lower = -upper
                    absolute_upper = -lower
                else:
                    absolute_lower = 0
                    absolute_upper = -lower
                    if upper > absolute_upper:
                        absolute_upper = upper
                if absolute_lower > maximum_lower:
                    maximum_lower = absolute_lower
                if absolute_upper > maximum_upper:
                    maximum_upper = absolute_upper
                coordinate = coordinate + one
            if maximum_lower <= 0:
                return -2

            output_offset = output_base + step * ten
            output[output_offset] = maximum_lower
            output[output_offset + 1] = maximum_upper
            coordinate = zero
            while coordinate < four:
                raw_offset = scratch_base + forty + coordinate * two
                lower = scratch[raw_offset]
                upper = scratch[raw_offset + 1]
                if lower >= 0:
                    normalized_lower = lower * scale // maximum_upper
                    normalized_upper = -((-upper * scale) // maximum_lower)
                elif upper <= 0:
                    normalized_lower = lower * scale // maximum_lower
                    normalized_upper = -((-upper * scale) // maximum_upper)
                else:
                    normalized_lower = lower * scale // maximum_lower
                    normalized_upper = -((-upper * scale) // maximum_lower)
                state_offset = state_base + coordinate * two
                state[state_offset] = normalized_lower
                state[state_offset + 1] = normalized_upper
                output[output_offset + two + coordinate * two] = normalized_lower
                output[output_offset + two + one + coordinate * two] = normalized_upper
                coordinate = coordinate + one
            step = step + one
    return steps


@native
def dyadic_kummer_height_recurrence(
    output: IntegerBuffer,
    state: IntegerBuffer,
    coefficients: IntegerBuffer,
    exponents: UInt64Buffer,
    term_counts: UInt64Buffer,
    workspace_memory_limit: uint64,
    scale: int,
    steps: uint64,
) -> int:
    """Iterate four sparse quartics on certified fixed-scale intervals.

    `state` contains four `(lower, upper)` numerator pairs at common positive
    denominator `scale`. `coefficients` and the four unsigned `exponents` per
    sparse term are partitioned into four quartics by `term_counts`. Every
    output row contains the image-scale pair followed by the eight normalized
    state endpoints. `workspace_memory_limit` bounds the lexical 48-coordinate
    exact workspace. The caller-owned buffers must be distinct.

    Return `steps` on success, `-1` for an invalid shape or sparse exponent,
    and `-2` when an image interval is not separated from projective zero.
    The same typed body is the ordinary Python fallback and the GMP-backed
    isolated native core.
    """
    four: uint64 = 4
    eight: uint64 = 8
    ten: uint64 = 10
    if (
        len(state) != eight
        or len(term_counts) != four
        or len(output) != steps * ten
        or scale <= 0
    ):
        return -1
    total_terms: uint64 = 0
    table_index: uint64 = 0
    while table_index < four:
        total_terms = total_terms + term_counts[table_index]
        table_index = table_index + 1
    if len(coefficients) != total_terms or len(exponents) != total_terms * four:
        return -1
    return _dyadic_kummer_height_recurrence_point(
        output,
        0,
        state,
        0,
        coefficients,
        exponents,
        term_counts,
        workspace_memory_limit,
        scale,
        steps,
    )


@native
def dyadic_kummer_height_recurrence_batch(
    output: IntegerBuffer,
    states: IntegerBuffer,
    coefficients: IntegerBuffer,
    exponents: UInt64Buffer,
    term_counts: UInt64Buffer,
    statuses: UInt64Buffer,
    workspace_memory_limit: uint64,
    scale: int,
    point_count: uint64,
    steps: uint64,
) -> int:
    """Iterate a bounded point-major outward dyadic Kummer batch.

    Every point retains an independent eight-endpoint state and `steps` output
    rows, while its 48-coordinate exact workspace is lexical and bounded by
    `workspace_memory_limit`. `statuses[i]` is one after success and two if
    point `i` cannot separate its projective image from zero. No output from a
    non-success status is a certificate. Mutable buffers must be pairwise
    disjoint.
    """
    four: uint64 = 4
    eight: uint64 = 8
    ten: uint64 = 10
    maximum_points: uint64 = 64
    maximum_steps: uint64 = 1024
    maximum_rows: uint64 = 16384
    if (
        point_count == 0
        or point_count > maximum_points
        or steps > maximum_steps
        or point_count * steps > maximum_rows
        or len(states) != point_count * eight
        or len(output) != point_count * steps * ten
        or len(statuses) != point_count
        or len(term_counts) != four
        or scale <= 0
    ):
        return -1
    total_terms: uint64 = 0
    table_index: uint64 = 0
    while table_index < four:
        total_terms = total_terms + term_counts[table_index]
        table_index = table_index + 1
    if len(coefficients) != total_terms or len(exponents) != total_terms * four:
        return -1

    completed: uint64 = 0
    failed = False
    while completed < point_count:
        status = _dyadic_kummer_height_recurrence_point(
            output,
            completed * steps * ten,
            states,
            completed * eight,
            coefficients,
            exponents,
            term_counts,
            workspace_memory_limit,
            scale,
            steps,
        )
        if status == steps:
            statuses[completed] = 1
        elif status == -2:
            statuses[completed] = 2
            failed = True
        else:
            return -1
        completed = completed + 1
    if failed:
        return -2
    return point_count


__all__ = [
    "dyadic_log_interval_batch",
    "dyadic_kummer_height_recurrence",
    "dyadic_kummer_height_recurrence_batch",
    "exact_kummer_small_step_batch",
    "modular_kummer_height_recurrence",
    "modular_kummer_height_recurrence_batch",
]

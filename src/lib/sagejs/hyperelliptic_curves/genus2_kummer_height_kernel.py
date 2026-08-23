"""Source-transparent fixed-scale genus-2 Kummer height iteration."""

from __future__ import annotations

from sagejs.native import IntegerBuffer, UInt64Buffer, native, uint64


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
    zero: uint64 = 0
    one: uint64 = 1
    four: uint64 = 4
    if (
        len(output) != steps
        or len(term_counts) != four
        or discriminant_bound <= 0
        or modulus <= 0
    ):
        return -1
    total_terms: uint64 = zero
    table_index: uint64 = zero
    while table_index < four:
        total_terms = total_terms + term_counts[table_index]
        table_index = table_index + one
    if len(coefficients) != total_terms or len(exponents) != total_terms * four:
        return -1

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
        output[step] = common
        state0 = raw0 // common
        state1 = raw1 // common
        state2 = raw2 // common
        state3 = raw3 // common
        step = step + one
    return steps


@native
def dyadic_kummer_height_recurrence(
    output: IntegerBuffer,
    state: IntegerBuffer,
    coefficients: IntegerBuffer,
    exponents: UInt64Buffer,
    term_counts: UInt64Buffer,
    scratch: IntegerBuffer,
    scale: int,
    steps: uint64,
) -> int:
    """Iterate four sparse quartics on certified fixed-scale intervals.

    `state` contains four `(lower, upper)` numerator pairs at common positive
    denominator `scale`. `coefficients` and the four unsigned `exponents` per
    sparse term are partitioned into four quartics by `term_counts`. Every
    output row contains the image-scale pair followed by the eight normalized
    state endpoints.  The caller-owned buffers must be distinct.

    Return `steps` on success, `-1` for an invalid shape or sparse exponent,
    and `-2` when an image interval is not separated from projective zero.
    The same typed body is the ordinary Python fallback and the GMP-backed
    isolated native core.
    """
    zero: uint64 = 0
    one: uint64 = 1
    two: uint64 = 2
    four: uint64 = 4
    eight: uint64 = 8
    ten: uint64 = 10
    forty: uint64 = 40
    forty_eight: uint64 = 48
    if (
        len(state) != eight
        or len(term_counts) != four
        or len(scratch) < forty_eight
        or len(output) != steps * ten
        or scale <= 0
    ):
        return -1
    total_terms: uint64 = zero
    table_index: uint64 = zero
    while table_index < four:
        total_terms = total_terms + term_counts[table_index]
        table_index = table_index + one
    if len(coefficients) != total_terms or len(exponents) != total_terms * four:
        return -1

    step: uint64 = zero
    while step < steps:
        coordinate: uint64 = zero
        while coordinate < four:
            power_offset = coordinate * ten
            state_offset = coordinate * two
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
                        power_offset = coordinate * ten + exponent * two
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
            scratch[forty + table_index * two] = total_lower
            scratch[forty + one + table_index * two] = total_upper
            table_index = table_index + one

        maximum_lower = 0
        maximum_upper = 0
        coordinate = zero
        while coordinate < four:
            raw_offset = forty + coordinate * two
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

        output_offset = step * ten
        output[output_offset] = maximum_lower
        output[output_offset + 1] = maximum_upper
        coordinate = zero
        while coordinate < four:
            raw_offset = forty + coordinate * two
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
            state_offset = coordinate * two
            state[state_offset] = normalized_lower
            state[state_offset + 1] = normalized_upper
            output[output_offset + two + state_offset] = normalized_lower
            output[output_offset + two + one + state_offset] = normalized_upper
            coordinate = coordinate + one
        step = step + one
    return steps


__all__ = [
    "dyadic_kummer_height_recurrence",
    "modular_kummer_height_recurrence",
]

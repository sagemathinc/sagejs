"""Source-transparent fixed-scale genus-2 Kummer height iteration."""

from __future__ import annotations

from sagejs.native import IntegerBuffer, UInt64Buffer, native, uint64


@native
def dyadic_kummer_height_recurrence(
    output: IntegerBuffer,
    state: IntegerBuffer,
    terms: IntegerBuffer,
    term_counts: UInt64Buffer,
    scratch: IntegerBuffer,
    scale: int,
    steps: uint64,
) -> int:
    """Iterate four sparse quartics on certified fixed-scale intervals.

    `state` contains four `(lower, upper)` numerator pairs at common positive
    denominator `scale`.  Each sparse term is `(coefficient,e0,e1,e2,e3)` and
    `term_counts` partitions the flat term buffer into four quartics.  Every
    output row contains the image-scale pair followed by the eight normalized
    state endpoints.  The caller-owned buffers must be distinct.

    Return `steps` on success, `-1` for an invalid shape or sparse exponent,
    and `-2` when an image interval is not separated from projective zero.
    The same typed body is the ordinary Python fallback and the GMP-backed
    isolated native core.
    """
    if (
        len(state) != 8
        or len(term_counts) != 4
        or len(scratch) < 48
        or len(output) != steps * 10
        or scale <= 0
    ):
        return -1
    total_terms = 0
    table_index = 0
    while table_index < 4:
        total_terms += term_counts[table_index]
        table_index += 1
    if len(terms) != total_terms * 5:
        return -1

    step = 0
    while step < steps:
        coordinate = 0
        while coordinate < 4:
            power_offset = coordinate * 10
            state_offset = coordinate * 2
            scratch[power_offset] = scale
            scratch[power_offset + 1] = scale
            scratch[power_offset + 2] = state[state_offset]
            scratch[power_offset + 3] = state[state_offset + 1]
            exponent = 2
            while exponent <= 4:
                left_offset = power_offset + (exponent - 1) * 2
                right_offset = state_offset
                product0 = scratch[left_offset] * state[right_offset]
                product1 = scratch[left_offset] * state[right_offset + 1]
                product2 = scratch[left_offset + 1] * state[right_offset]
                product3 = scratch[left_offset + 1] * state[right_offset + 1]
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
                target = power_offset + exponent * 2
                scratch[target] = product_lower // scale
                scratch[target + 1] = -((-product_upper) // scale)
                exponent += 1
            coordinate += 1

        term_index = 0
        table_index = 0
        while table_index < 4:
            table_end = term_index + term_counts[table_index]
            total_lower = 0
            total_upper = 0
            while term_index < table_end:
                term_offset = term_index * 5
                coefficient = terms[term_offset]
                value_lower = coefficient * scale
                value_upper = value_lower
                coordinate = 0
                while coordinate < 4:
                    exponent = terms[term_offset + coordinate + 1]
                    if exponent < 0 or exponent > 4:
                        return -1
                    if exponent != 0:
                        power_offset = coordinate * 10 + exponent * 2
                        product0 = value_lower * scratch[power_offset]
                        product1 = value_lower * scratch[power_offset + 1]
                        product2 = value_upper * scratch[power_offset]
                        product3 = value_upper * scratch[power_offset + 1]
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
                    coordinate += 1
                total_lower += value_lower
                total_upper += value_upper
                term_index += 1
            scratch[40 + table_index * 2] = total_lower
            scratch[41 + table_index * 2] = total_upper
            table_index += 1

        maximum_lower = 0
        maximum_upper = 0
        coordinate = 0
        while coordinate < 4:
            raw_offset = 40 + coordinate * 2
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
            coordinate += 1
        if maximum_lower <= 0:
            return -2

        output_offset = step * 10
        output[output_offset] = maximum_lower
        output[output_offset + 1] = maximum_upper
        coordinate = 0
        while coordinate < 4:
            raw_offset = 40 + coordinate * 2
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
            state_offset = coordinate * 2
            state[state_offset] = normalized_lower
            state[state_offset + 1] = normalized_upper
            output[output_offset + 2 + state_offset] = normalized_lower
            output[output_offset + 3 + state_offset] = normalized_upper
            coordinate += 1
        step += 1
    return steps


__all__ = ["dyadic_kummer_height_recurrence"]

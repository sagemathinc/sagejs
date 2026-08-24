"""Source-transparent exact genus-3 Weil-candidate scan.

The output buffer contains two metadata entries followed by packed candidate
triples.  Entry zero is the number of Weil candidates encountered and entry
one is the number of congruent coefficient triples examined.  A negative
return value means the combination limit was reached; otherwise the return
value is the number of candidates stored, which may be smaller than the count
when the caller deliberately supplied a short buffer.

All arithmetic in the typed body is exact.  CPython executes the same function
with ordinary integers and lists; Sage.js can lower it to the GMP-backed exact
native kernel.
"""

from __future__ import annotations

from sagejs.native import IntegerBuffer, native


@native
def scan_genus3_weil_candidates(
    output: IntegerBuffer,
    prime: int,
    residue1: int,
    residue2: int,
    residue3: int,
    max_combinations: int,
) -> int:
    """Scan congruent coefficient triples and store every exact Weil lift."""
    if len(output) < 2 or (len(output) - 2) % 3 != 0:
        return -2

    coefficient1_bound_squared = 36 * prime
    coefficient1_bound = 1
    while coefficient1_bound * coefficient1_bound <= coefficient1_bound_squared:
        coefficient1_bound *= 2
    root = coefficient1_bound
    next_root = (root + coefficient1_bound_squared // root) // 2
    while next_root < root:
        root = next_root
        next_root = (root + coefficient1_bound_squared // root) // 2
    coefficient1_bound = root

    coefficient3_bound_squared = 400 * prime * prime * prime
    coefficient3_bound = 1
    while coefficient3_bound * coefficient3_bound <= coefficient3_bound_squared:
        coefficient3_bound *= 2
    root = coefficient3_bound
    next_root = (root + coefficient3_bound_squared // root) // 2
    while next_root < root:
        root = next_root
        next_root = (root + coefficient3_bound_squared // root) // 2
    coefficient3_bound = root

    capacity = (len(output) - 2) // 3
    candidate_count = 0
    combinations_examined = 0
    coefficient1 = -coefficient1_bound + (residue1 + coefficient1_bound) % prime
    while coefficient1 <= coefficient1_bound:
        coefficient2_lower = -((-coefficient1 * coefficient1 + 6 * prime) // 2)
        coefficient2_upper = (coefficient1 * coefficient1 + 9 * prime) // 3
        coefficient2 = coefficient2_lower + (residue2 - coefficient2_lower) % prime
        while coefficient2 <= coefficient2_upper:
            coefficient3 = -coefficient3_bound + (residue3 + coefficient3_bound) % prime
            while coefficient3 <= coefficient3_bound:
                combinations_examined += 1
                if combinations_examined > max_combinations:
                    output[0] = candidate_count
                    output[1] = combinations_examined - 1
                    return -1

                # For Q(X)=X^3+a*X^2+b*X+c, the squared-root polynomial
                # S(Y)=prod(Y-x_i^2) has the coefficients below.  A
                # nonnegative discriminant makes all x_i real.  Since the
                # generated c2 bound gives 4p at least the mean of x_i^2,
                # S'(4p)>=0 puts 4p beyond the larger critical point; then
                # S(4p)>=0 is exactly the condition max(x_i^2)<=4p.
                a_value = coefficient1
                b_value = coefficient2 - 3 * prime
                c_value = coefficient3 - 2 * prime * coefficient1
                discriminant = (
                    a_value * a_value * b_value * b_value
                    - 4 * b_value * b_value * b_value
                    - 4 * a_value * a_value * a_value * c_value
                    - 27 * c_value * c_value
                    + 18 * a_value * b_value * c_value
                )
                if discriminant >= 0:
                    squared_coefficient2 = -(a_value * a_value - 2 * b_value)
                    squared_coefficient1 = b_value * b_value - 2 * a_value * c_value
                    squared_coefficient0 = -(c_value * c_value)
                    endpoint = 4 * prime
                    derivative_at_endpoint = (
                        3 * endpoint * endpoint
                        + 2 * squared_coefficient2 * endpoint
                        + squared_coefficient1
                    )
                    value_at_endpoint = (
                        (endpoint + squared_coefficient2) * endpoint
                        + squared_coefficient1
                    ) * endpoint + squared_coefficient0
                    if derivative_at_endpoint >= 0 and value_at_endpoint >= 0:
                        if candidate_count < capacity:
                            offset = 2 + 3 * candidate_count
                            output[offset] = coefficient1
                            output[offset + 1] = coefficient2
                            output[offset + 2] = coefficient3
                        candidate_count += 1
                coefficient3 += prime
            coefficient2 += prime
        coefficient1 += prime

    output[0] = candidate_count
    output[1] = combinations_examined
    stored = candidate_count
    if stored > capacity:
        stored = capacity
    return stored


@native
def scan_genus3_weil_candidates_batch(
    output: IntegerBuffer,
    rows: IntegerBuffer,
    row_count: int,
    capacity: int,
    max_combinations: int,
) -> int:
    """Scan many `(p,r1,r2,r3)` rows across one native boundary.

    Each output row has metadata `(status,count,combinations)` followed by
    `capacity` candidate triples. Status zero is complete and `-1` denotes a
    combination limit. A complete count larger than capacity is reported
    exactly; the caller can retry just that exceptional row.
    """
    stride = 3 + 3 * capacity
    if (
        row_count < 0
        or capacity < 1
        or len(rows) < 4 * row_count
        or len(output) < stride * row_count
    ):
        return -2
    row_index = 0
    while row_index < row_count:
        input_offset = 4 * row_index
        output_offset = stride * row_index
        prime = rows[input_offset]
        residue1 = rows[input_offset + 1]
        residue2 = rows[input_offset + 2]
        residue3 = rows[input_offset + 3]

        coefficient1_bound_squared = 36 * prime
        coefficient1_bound = 1
        while coefficient1_bound * coefficient1_bound <= coefficient1_bound_squared:
            coefficient1_bound *= 2
        root = coefficient1_bound
        next_root = (root + coefficient1_bound_squared // root) // 2
        while next_root < root:
            root = next_root
            next_root = (root + coefficient1_bound_squared // root) // 2
        coefficient1_bound = root

        coefficient3_bound_squared = 400 * prime * prime * prime
        coefficient3_bound = 1
        while coefficient3_bound * coefficient3_bound <= coefficient3_bound_squared:
            coefficient3_bound *= 2
        root = coefficient3_bound
        next_root = (root + coefficient3_bound_squared // root) // 2
        while next_root < root:
            root = next_root
            next_root = (root + coefficient3_bound_squared // root) // 2
        coefficient3_bound = root

        candidate_count = 0
        combinations_examined = 0
        limited = 0
        coefficient1 = -coefficient1_bound + (residue1 + coefficient1_bound) % prime
        while coefficient1 <= coefficient1_bound and limited == 0:
            coefficient2_lower = -((-coefficient1 * coefficient1 + 6 * prime) // 2)
            coefficient2_upper = (coefficient1 * coefficient1 + 9 * prime) // 3
            coefficient2 = coefficient2_lower + (residue2 - coefficient2_lower) % prime
            while coefficient2 <= coefficient2_upper and limited == 0:
                coefficient3 = (
                    -coefficient3_bound + (residue3 + coefficient3_bound) % prime
                )
                while coefficient3 <= coefficient3_bound and limited == 0:
                    combinations_examined += 1
                    if combinations_examined > max_combinations:
                        combinations_examined -= 1
                        limited = 1
                    else:
                        a_value = coefficient1
                        b_value = coefficient2 - 3 * prime
                        c_value = coefficient3 - 2 * prime * coefficient1
                        discriminant = (
                            a_value * a_value * b_value * b_value
                            - 4 * b_value * b_value * b_value
                            - 4 * a_value * a_value * a_value * c_value
                            - 27 * c_value * c_value
                            + 18 * a_value * b_value * c_value
                        )
                        if discriminant >= 0:
                            squared_coefficient2 = -(a_value * a_value - 2 * b_value)
                            squared_coefficient1 = (
                                b_value * b_value - 2 * a_value * c_value
                            )
                            squared_coefficient0 = -(c_value * c_value)
                            endpoint = 4 * prime
                            derivative_at_endpoint = (
                                3 * endpoint * endpoint
                                + 2 * squared_coefficient2 * endpoint
                                + squared_coefficient1
                            )
                            value_at_endpoint = (
                                (endpoint + squared_coefficient2) * endpoint
                                + squared_coefficient1
                            ) * endpoint + squared_coefficient0
                            if derivative_at_endpoint >= 0 and value_at_endpoint >= 0:
                                if candidate_count < capacity:
                                    position = output_offset + 3 + 3 * candidate_count
                                    output[position] = coefficient1
                                    output[position + 1] = coefficient2
                                    output[position + 2] = coefficient3
                                candidate_count += 1
                        coefficient3 += prime
                coefficient2 += prime
            coefficient1 += prime

        output[output_offset] = 0
        if limited:
            output[output_offset] = -1
        output[output_offset + 1] = candidate_count
        output[output_offset + 2] = combinations_examined
        row_index += 1
    return row_count


@native
def scan_genus3_candidate_progressions(
    output: IntegerBuffer,
    prime: int,
    residue1: int,
    residue2: int,
    residue3: int,
    primary_witnesses: IntegerBuffer,
    primary_witness_count: int,
    twist_witnesses: IntegerBuffer,
    twist_witness_count: int,
    order_kind: int,
    max_combinations: int,
) -> int:
    """Scan, filter, and compress one row without publishing candidates.

    Output metadata is `(candidate_count, survivor_count, combinations,
    progression_count, c1, c2, c3)`, followed by `(base,count)` progression
    pairs. The candidate fields are meaningful only for one survivor.
    Returns the progression count, `-1` on the combination limit, `-2` for
    invalid input, or `-3` when the progression output is too short.
    """
    if (
        len(output) < 7
        or (len(output) - 7) % 2 != 0
        or prime <= 2
        or primary_witness_count < 0
        or twist_witness_count < 0
        or primary_witness_count > len(primary_witnesses)
        or twist_witness_count > len(twist_witnesses)
        or order_kind < 0
        or order_kind > 1
        or max_combinations < 1
    ):
        return -2
    witness_index = 0
    while witness_index < primary_witness_count:
        if primary_witnesses[witness_index] <= 0:
            return -2
        witness_index += 1
    witness_index = 0
    while witness_index < twist_witness_count:
        if twist_witnesses[witness_index] <= 0:
            return -2
        witness_index += 1

    coefficient1_bound_squared = 36 * prime
    coefficient1_bound = 1
    while coefficient1_bound * coefficient1_bound <= coefficient1_bound_squared:
        coefficient1_bound *= 2
    root = coefficient1_bound
    next_root = (root + coefficient1_bound_squared // root) // 2
    while next_root < root:
        root = next_root
        next_root = (root + coefficient1_bound_squared // root) // 2
    coefficient1_bound = root

    coefficient3_bound_squared = 400 * prime * prime * prime
    coefficient3_bound = 1
    while coefficient3_bound * coefficient3_bound <= coefficient3_bound_squared:
        coefficient3_bound *= 2
    root = coefficient3_bound
    next_root = (root + coefficient3_bound_squared // root) // 2
    while next_root < root:
        root = next_root
        next_root = (root + coefficient3_bound_squared // root) // 2
    coefficient3_bound = root

    progression_capacity = (len(output) - 7) // 2
    candidate_count = 0
    survivor_count = 0
    combinations_examined = 0
    progression_count = 0
    run_active = 0
    run_coefficient1 = 0
    run_coefficient2 = 0
    run_first_order = 0
    run_last_order = 0
    run_count = 0
    coefficient1 = -coefficient1_bound + (residue1 + coefficient1_bound) % prime
    while coefficient1 <= coefficient1_bound:
        coefficient2_lower = -((-coefficient1 * coefficient1 + 6 * prime) // 2)
        coefficient2_upper = (coefficient1 * coefficient1 + 9 * prime) // 3
        coefficient2 = coefficient2_lower + (residue2 - coefficient2_lower) % prime
        while coefficient2 <= coefficient2_upper:
            coefficient3 = -coefficient3_bound + (residue3 + coefficient3_bound) % prime
            while coefficient3 <= coefficient3_bound:
                combinations_examined += 1
                if combinations_examined > max_combinations:
                    output[0] = candidate_count
                    output[1] = survivor_count
                    output[2] = combinations_examined - 1
                    output[3] = progression_count
                    return -1

                a_value = coefficient1
                b_value = coefficient2 - 3 * prime
                c_value = coefficient3 - 2 * prime * coefficient1
                discriminant = (
                    a_value * a_value * b_value * b_value
                    - 4 * b_value * b_value * b_value
                    - 4 * a_value * a_value * a_value * c_value
                    - 27 * c_value * c_value
                    + 18 * a_value * b_value * c_value
                )
                is_candidate = 0
                if discriminant >= 0:
                    squared_coefficient2 = -(a_value * a_value - 2 * b_value)
                    squared_coefficient1 = b_value * b_value - 2 * a_value * c_value
                    squared_coefficient0 = -(c_value * c_value)
                    endpoint = 4 * prime
                    derivative_at_endpoint = (
                        3 * endpoint * endpoint
                        + 2 * squared_coefficient2 * endpoint
                        + squared_coefficient1
                    )
                    value_at_endpoint = (
                        (endpoint + squared_coefficient2) * endpoint
                        + squared_coefficient1
                    ) * endpoint + squared_coefficient0
                    if derivative_at_endpoint >= 0 and value_at_endpoint >= 0:
                        is_candidate = 1
                if is_candidate:
                    candidate_count += 1
                    jacobian_order = (
                        prime * prime * prime
                        + 1
                        + (prime * prime + 1) * coefficient1
                        + (prime + 1) * coefficient2
                        + coefficient3
                    )
                    twist_order = (
                        prime * prime * prime
                        + 1
                        - (prime * prime + 1) * coefficient1
                        + (prime + 1) * coefficient2
                        - coefficient3
                    )
                    accepted = 1
                    witness_index = 0
                    while witness_index < primary_witness_count:
                        if jacobian_order % primary_witnesses[witness_index] != 0:
                            accepted = 0
                        witness_index += 1
                    witness_index = 0
                    while witness_index < twist_witness_count:
                        if twist_order % twist_witnesses[witness_index] != 0:
                            accepted = 0
                        witness_index += 1
                    if accepted == 1:
                        survivor_count += 1
                        output[4] = coefficient1
                        output[5] = coefficient2
                        output[6] = coefficient3
                        order = jacobian_order
                        if order_kind == 1:
                            order = twist_order
                        adjacent = 0
                        if (
                            run_active == 1
                            and coefficient1 == run_coefficient1
                            and coefficient2 == run_coefficient2
                        ):
                            difference = order - run_last_order
                            if difference == prime or difference == -prime:
                                adjacent = 1
                        if adjacent:
                            run_last_order = order
                            run_count += 1
                        else:
                            if run_active == 1:
                                base = run_first_order
                                if run_last_order < base:
                                    base = run_last_order
                                if progression_count < progression_capacity:
                                    position = 7 + 2 * progression_count
                                    output[position] = base
                                    output[position + 1] = run_count
                                progression_count += 1
                            run_active = 1
                            run_coefficient1 = coefficient1
                            run_coefficient2 = coefficient2
                            run_first_order = order
                            run_last_order = order
                            run_count = 1
                coefficient3 += prime
            coefficient2 += prime
        coefficient1 += prime

    if run_active == 1:
        base = run_first_order
        if run_last_order < base:
            base = run_last_order
        if progression_count < progression_capacity:
            position = 7 + 2 * progression_count
            output[position] = base
            output[position + 1] = run_count
        progression_count += 1
    output[0] = candidate_count
    output[1] = survivor_count
    output[2] = combinations_examined
    output[3] = progression_count
    if progression_count > progression_capacity:
        return -3
    return progression_count


__all__ = [
    "scan_genus3_weil_candidates",
    "scan_genus3_weil_candidates_batch",
    "scan_genus3_candidate_progressions",
]

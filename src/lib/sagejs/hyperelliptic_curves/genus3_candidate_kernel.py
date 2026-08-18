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


__all__ = ["scan_genus3_weil_candidates"]

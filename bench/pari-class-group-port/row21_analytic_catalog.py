"""Row-21 maximal-order prime-degree catalog for analytic normalization.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This bounded degree-five bridge derives every local residue-degree pattern
from the authenticated maximal-order multiplication table.  It deliberately
uses the radical/quotient path at all rational primes, including the equation
index divisors, so no Kummer factor ordering or frozen analytic pattern is an
input.
"""

from sagejs.native import IntegerBuffer, integer_buffer_view, native

from .pradical import pari_small_pradical
from .quotient_split_recursive import pari_small_quotient_split_recursive
from .relation_cache import pari_word_mod_inverse


@native
def _row21_poly_degree(work: IntegerBuffer, offset: int, bound: int) -> int:
    while bound >= 0 and work[offset + bound] == 0:
        bound -= 1
    return bound


@native
def _row21_poly_remainder(
    work: IntegerBuffer,
    dividend: int,
    dividend_degree: int,
    divisor: int,
    divisor_degree: int,
    prime: int,
    output: int,
    scratch: int,
) -> int:
    for i in range(11):
        work[scratch + i] = 0
        work[output + i] = 0
    for i in range(dividend_degree + 1):
        work[scratch + i] = work[dividend + i]
    inverse = pari_word_mod_inverse(work[divisor + divisor_degree], prime)
    for k in range(dividend_degree, divisor_degree - 1, -1):
        factor = work[scratch + k] * inverse % prime
        if factor != 0:
            for j in range(divisor_degree + 1):
                work[scratch + k - divisor_degree + j] = (
                    work[scratch + k - divisor_degree + j] - factor * work[divisor + j]
                ) % prime
    for i in range(divisor_degree):
        work[output + i] = work[scratch + i]
    return _row21_poly_degree(work, output, divisor_degree - 1)


@native
def _row21_poly_gcd_degree(
    work: IntegerBuffer,
    left: int,
    left_degree: int,
    right: int,
    right_degree: int,
    prime: int,
    first: int,
    second: int,
    remainder: int,
    scratch: int,
) -> int:
    for i in range(11):
        work[first + i] = 0
        work[second + i] = 0
    for i in range(left_degree + 1):
        work[first + i] = work[left + i]
    for i in range(right_degree + 1):
        work[second + i] = work[right + i]
    a_degree = left_degree
    b_degree = right_degree
    while b_degree >= 0:
        r_degree = _row21_poly_remainder(
            work,
            first,
            a_degree,
            second,
            b_degree,
            prime,
            remainder,
            scratch,
        )
        for i in range(11):
            work[first + i] = work[second + i]
            work[second + i] = work[remainder + i]
        a_degree = b_degree
        b_degree = r_degree
    return a_degree


@native
def _row21_squarefree_polynomial(
    polynomial: IntegerBuffer,
    prime: int,
    work: IntegerBuffer,
    output: int,
) -> int:
    source = 0
    derivative = 12
    first = 24
    second = 36
    remainder = 48
    scratch = 60
    gcd_copy = 72
    quotient = output
    for i in range(11):
        work[source + i] = 0
        work[derivative + i] = 0
        work[quotient + i] = 0
    for i in range(6):
        work[source + i] = polynomial[i] % prime
    for i in range(1, 6):
        work[derivative + i - 1] = i * work[source + i] % prime
    derivative_degree = _row21_poly_degree(work, derivative, 4)
    if derivative_degree < 0:
        # The only admitted inseparable quintic case is a characteristic-five
        # p-th power.  Its squarefree part is the coefficientwise p-th root;
        # coefficients are already elements of the prime field.
        if prime != 5:
            raise ValueError("unsupported zero derivative in analytic catalog")
        work[output] = work[source]
        work[output + 1] = work[source + 5]
        return 1
    gcd_degree = _row21_poly_gcd_degree(
        work,
        source,
        5,
        derivative,
        derivative_degree,
        prime,
        first,
        second,
        remainder,
        scratch,
    )
    for i in range(11):
        work[gcd_copy + i] = work[first + i]
        work[scratch + i] = work[source + i]
    inverse = pari_word_mod_inverse(work[gcd_copy + gcd_degree], prime)
    quotient_degree = 5 - gcd_degree
    for k in range(5, gcd_degree - 1, -1):
        factor = work[scratch + k] * inverse % prime
        work[quotient + k - gcd_degree] = factor
        if factor != 0:
            for j in range(gcd_degree + 1):
                work[scratch + k - gcd_degree + j] = (
                    work[scratch + k - gcd_degree + j] - factor * work[gcd_copy + j]
                ) % prime
    return quotient_degree


@native
def _row21_poly_mulmod(
    work: IntegerBuffer,
    left: int,
    left_degree: int,
    right: int,
    right_degree: int,
    modulus: int,
    modulus_degree: int,
    prime: int,
    output: int,
    product: int,
    scratch: int,
) -> int:
    for i in range(11):
        work[product + i] = 0
    for i in range(left_degree + 1):
        for j in range(right_degree + 1):
            work[product + i + j] = (
                work[product + i + j] + work[left + i] * work[right + j]
            ) % prime
    return _row21_poly_remainder(
        work,
        product,
        left_degree + right_degree,
        modulus,
        modulus_degree,
        prime,
        output,
        scratch,
    )


@native
def _row21_x_power_mod(
    work: IntegerBuffer,
    modulus: int,
    modulus_degree: int,
    exponent: int,
    prime: int,
    output: int,
) -> int:
    result = 108
    base = 120
    temporary = 132
    product = 144
    scratch = 156
    for i in range(11):
        work[result + i] = 0
        work[base + i] = 0
    work[result] = 1
    work[base + 1] = 1
    result_degree = 0
    base_degree = 1
    while exponent != 0:
        if exponent % 2 != 0:
            result_degree = _row21_poly_mulmod(
                work,
                result,
                result_degree,
                base,
                base_degree,
                modulus,
                modulus_degree,
                prime,
                temporary,
                product,
                scratch,
            )
            for i in range(11):
                work[result + i] = work[temporary + i]
        exponent //= 2
        if exponent != 0:
            base_degree = _row21_poly_mulmod(
                work,
                base,
                base_degree,
                base,
                base_degree,
                modulus,
                modulus_degree,
                prime,
                temporary,
                product,
                scratch,
            )
            for i in range(11):
                work[base + i] = work[temporary + i]
    for i in range(11):
        work[output + i] = work[result + i]
    return result_degree


@native
def pari_row21_analytic_degree_catalog(
    polynomial: IntegerBuffer,
    table: IntegerBuffer,
    primes: IntegerBuffer,
    prime_count: int,
    workspace: IntegerBuffer,
    pattern_offsets: IntegerBuffer,
    pattern_counts: IntegerBuffer,
    pattern_degrees: IntegerBuffer,
    pattern_multiplicities: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Publish grouped residue-degree counts for the row-21 quintic.

    The output capacity is at most `5 * prime_count`.  `state` is
    `[status, primes, groups, prime ideals]`.  Primehood and an increasing
    caller-owned prime catalog are preconditions.  Scratch is reused between
    primes; only the active output prefixes are authoritative after success.
    """
    n = 5
    capacity = n * prime_count
    if prime_count < 1 or len(state) < 4:
        raise ValueError("invalid row21 analytic catalog dimensions")
    if (
        len(polynomial) < 6
        or len(table) < 125
        or len(primes) < prime_count
        or len(workspace) < 12000
        or len(pattern_offsets) < prime_count
        or len(pattern_counts) < prime_count
        or len(pattern_degrees) < capacity
        or len(pattern_multiplicities) < capacity
    ):
        raise ValueError("short row21 analytic catalog storage")
    previous = 1
    for i in range(prime_count):
        if primes[i] <= previous or primes[i] > 3037000493:
            raise ValueError("invalid row21 analytic prime catalog")
        previous = primes[i]
    state[0] = -1
    state[1] = 0
    state[2] = 0
    state[3] = 0
    groups = 0
    ideals = 0
    for at in range(prime_count):
        prime = primes[at]
        pattern_offsets[at] = groups
        pattern_counts[at] = 0
        count = 0
        if prime == 2 or prime == 3 or prime == 47:
            radical_rank = pari_small_pradical(
                table,
                n,
                prime,
                integer_buffer_view(workspace, 0, 256),
                integer_buffer_view(workspace, 256, 8),
                integer_buffer_view(workspace, 264, 8),
                integer_buffer_view(workspace, 272, 8),
                integer_buffer_view(workspace, 280, 32),
                integer_buffer_view(workspace, 312, 32),
                integer_buffer_view(workspace, 344, 8),
            )
            count = pari_small_quotient_split_recursive(
                table,
                integer_buffer_view(workspace, 312, 32),
                integer_buffer_view(workspace, 280, 32),
                n,
                radical_rank,
                prime,
                integer_buffer_view(workspace, 512, 512),
                integer_buffer_view(workspace, 1024, 512),
                integer_buffer_view(workspace, 1536, 8),
                integer_buffer_view(workspace, 1544, 8),
                integer_buffer_view(workspace, 1552, 32),
                integer_buffer_view(workspace, 1584, 128),
                integer_buffer_view(workspace, 1712, 8),
                integer_buffer_view(workspace, 1720, 8),
                integer_buffer_view(workspace, 1728, 8),
                integer_buffer_view(workspace, 1736, 256),
                integer_buffer_view(workspace, 1992, 128),
                integer_buffer_view(workspace, 2120, 8),
                integer_buffer_view(workspace, 2128, 8),
                integer_buffer_view(workspace, 2136, 32),
                integer_buffer_view(workspace, 2168, 128),
                integer_buffer_view(workspace, 2296, 8),
                integer_buffer_view(workspace, 2304, 128),
                integer_buffer_view(workspace, 2432, 8),
                integer_buffer_view(workspace, 2440, 8),
            )
            for degree in range(1, n + 1):
                multiplicity = 0
                for j in range(count):
                    if n - workspace[2432 + j] == degree:
                        multiplicity += 1
                if multiplicity != 0:
                    pattern_degrees[groups] = degree
                    pattern_multiplicities[groups] = multiplicity
                    groups += 1
                    pattern_counts[at] += 1
        else:
            squarefree = 3000
            powered = 3180
            difference = 3192
            local = 3000
            squarefree_degree = _row21_squarefree_polynomial(
                polynomial, prime, workspace, squarefree
            )
            linear = 0
            for x in range(prime):
                value = 0
                for i in range(squarefree_degree, -1, -1):
                    value = (value * x + workspace[squarefree + i]) % prime
                if value == 0:
                    linear += 1
            gcd_degree = linear
            if squarefree_degree > 1:
                power_degree = _row21_x_power_mod(
                    workspace,
                    squarefree,
                    squarefree_degree,
                    prime * prime,
                    prime,
                    powered,
                )
                for i in range(11):
                    workspace[difference + i] = workspace[powered + i]
                workspace[difference + 1] = (workspace[difference + 1] - 1) % prime
                difference_degree = _row21_poly_degree(
                    workspace, difference, power_degree
                )
                gcd_degree = _row21_poly_gcd_degree(
                    workspace,
                    squarefree,
                    squarefree_degree,
                    difference,
                    difference_degree,
                    prime,
                    local + 204,
                    local + 216,
                    local + 228,
                    local + 240,
                )
            quadratic = (gcd_degree - linear) // 2
            remainder_degree = squarefree_degree - linear - 2 * quadratic
            if linear != 0:
                pattern_degrees[groups] = 1
                pattern_multiplicities[groups] = linear
                groups += 1
                pattern_counts[at] += 1
                count += linear
            if quadratic != 0:
                pattern_degrees[groups] = 2
                pattern_multiplicities[groups] = quadratic
                groups += 1
                pattern_counts[at] += 1
                count += quadratic
            if remainder_degree != 0:
                if remainder_degree < 3 or remainder_degree > 5:
                    state[0] = prime
                    state[1] = squarefree_degree
                    state[2] = linear
                    state[3] = gcd_degree
                    raise ValueError("invalid row21 residual factor degree")
                pattern_degrees[groups] = remainder_degree
                pattern_multiplicities[groups] = 1
                groups += 1
                pattern_counts[at] += 1
                count += 1
        ideals += count
        state[1] = at + 1
        state[2] = groups
        state[3] = ideals
    state[0] = 0
    return 0


__all__ = ["pari_row21_analytic_degree_catalog"]

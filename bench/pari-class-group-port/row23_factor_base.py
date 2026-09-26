"""Ordinary-prime factor-base descriptors for development-panel row 23.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

The selected bound is below the sole equation-index prime 131. Thus every
selected prime is unramified and Kummer-eligible. This degree-five owner
enumerates the linear/quadratic factors admitted by the norm bound, constructs
their maximal-order generators from authenticated `invzk`, and computes the
descriptor multiplication matrix from the prepared basis tensor.
"""

from sagejs.native import IntegerBuffer, integer_buffer_view, native

from .prime_descriptor_sort import pari_prime_descriptor_sort


@native
def _row23_center(value: int, prime: int) -> int:
    result = abs(value) % prime
    if value < 0:
        result = -result
    if result > prime // 2:
        result -= prime
    elif result < -(prime // 2):
        result += prime
    return result


@native
def _row23_irreducible_quadratic(a: int, b: int, prime: int) -> bool:
    discriminant = (a * a - 4 * b) % prime
    if discriminant == 0:
        return False
    result = 1
    base = discriminant
    exponent = (prime - 1) // 2
    while exponent != 0:
        if exponent & 1:
            result = result * base % prime
        base = base * base % prime
        exponent >>= 1
    return result == prime - 1


@native
def _row23_polynomial_to_basis(
    invzk: IntegerBuffer,
    polynomial: IntegerBuffer,
    degree: int,
    prime: int,
    output: IntegerBuffer,
) -> int:
    n = 5
    for i in range(n):
        output[i] = 0
        for j in range(degree + 1):
            output[i] += invzk[j * n + i] * polynomial[j]
        output[i] = _row23_center(output[i], prime)
    return 0


@native
def pari_row23_prime_descriptors(
    polynomial: IntegerBuffer,
    invzk: IntegerBuffer,
    table: IntegerBuffer,
    prime: int,
    max_residue_degree: int,
    workspace: IntegerBuffer,
    descriptors: IntegerBuffer,
    ranks: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Publish sorted Kummer descriptors admitted by the row-23 norm bound.

    State is `[status, factors_checked, selected_count, degree_sum]`.
    """
    n = 5
    stride = 33
    if (
        prime < 3
        or prime >= 131
        or prime % 2 == 0
        or max_residue_degree < 1
        or max_residue_degree > 2
        or len(polynomial) < 6
        or len(invzk) < 25
        or len(table) < 125
        or len(workspace) < 512
        or len(descriptors) < 5 * stride
        or len(ranks) < 5
        or len(state) < 4
    ):
        raise ValueError("row23 ordinary-prime descriptor domain")
    if polynomial[5] != 1:
        raise ValueError("row23 defining polynomial must be monic")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    state[3] = 0
    current = integer_buffer_view(workspace, 0, 6)
    factor = integer_buffer_view(workspace, 6, 3)
    division = integer_buffer_view(workspace, 9, 6)
    quotient = integer_buffer_view(workspace, 15, 6)
    generator = integer_buffer_view(workspace, 21, 5)
    quotient_basis = integer_buffer_view(workspace, 26, 5)
    column = integer_buffer_view(workspace, 31, 5)
    unsorted = integer_buffer_view(workspace, 40, 165)
    factor_degrees = integer_buffer_view(workspace, 205, 5)
    factors = integer_buffer_view(workspace, 210, 15)
    sort_generators = integer_buffer_view(workspace, 225, 25)
    order = integer_buffer_view(workspace, 250, 5)
    for i in range(6):
        current[i] = polynomial[i] % prime
    current_degree = 5
    factor_count = 0
    for root in range(prime):
        factor[0] = (-root) % prime
        factor[1] = 1
        for i in range(current_degree + 1):
            division[i] = current[i]
        for k in range(current_degree, 0, -1):
            leading = division[k]
            division[k - 1] = (division[k - 1] - leading * factor[0]) % prime
            quotient[k - 1] = leading
        if division[0] == 0:
            factors[factor_count * 3] = factor[0]
            factors[factor_count * 3 + 1] = 1
            factors[factor_count * 3 + 2] = 0
            factor_degrees[factor_count] = 1
            factor_count += 1
            current_degree -= 1
            for i in range(current_degree + 1):
                current[i] = quotient[i]
    if max_residue_degree >= 2:
        for a in range(prime):
            for b in range(prime):
                if not _row23_irreducible_quadratic(a, b, prime):
                    continue
                factor[0] = b
                factor[1] = a
                factor[2] = 1
                for i in range(current_degree + 1):
                    division[i] = current[i]
                for i in range(6):
                    quotient[i] = 0
                for k in range(current_degree, 1, -1):
                    leading = division[k]
                    quotient[k - 2] = leading
                    division[k - 2] = (division[k - 2] - leading * b) % prime
                    division[k - 1] = (division[k - 1] - leading * a) % prime
                if division[0] == 0 and division[1] == 0:
                    factors[factor_count * 3] = b
                    factors[factor_count * 3 + 1] = a
                    factors[factor_count * 3 + 2] = 1
                    factor_degrees[factor_count] = 2
                    factor_count += 1
                    current_degree -= 2
                    for i in range(current_degree + 1):
                        current[i] = quotient[i]
    state[1] = factor_count
    for position in range(factor_count):
        degree = factor_degrees[position]
        for i in range(3):
            factor[i] = factors[position * 3 + i]
        for i in range(6):
            division[i] = polynomial[i] % prime
            quotient[i] = 0
        for k in range(5, degree - 1, -1):
            leading = division[k]
            quotient[k - degree] = leading
            for j in range(degree + 1):
                division[k - degree + j] = (
                    division[k - degree + j] - leading * factor[j]
                ) % prime
        _row23_polynomial_to_basis(invzk, factor, degree, prime, generator)
        _row23_polynomial_to_basis(invzk, quotient, 5 - degree, prime, quotient_basis)
        base = position * stride
        unsorted[base] = prime
        unsorted[base + 1] = 1
        unsorted[base + 2] = degree
        for i in range(n):
            unsorted[base + 3 + i] = generator[i]
            sort_generators[position * n + i] = generator[i]
            unsorted[base + 8 + i] = quotient_basis[i]
        for basis_column in range(1, n):
            for k in range(n):
                value = 0
                for j in range(n):
                    value += table[(basis_column * n + j) * n + k] * quotient_basis[j]
                column[k] = value
            for i in range(n):
                unsorted[base + 8 + basis_column * n + i] = column[i]
        ranks[position] = 5 - degree
        state[3] += degree
    pari_prime_descriptor_sort(
        factor_degrees,
        sort_generators,
        n,
        factor_count,
        order,
        integer_buffer_view(workspace, 255, 5),
    )
    for position in range(factor_count):
        source = order[position]
        ranks[position] = 5 - unsorted[source * stride + 2]
        for i in range(stride):
            descriptors[position * stride + i] = unsorted[source * stride + i]
    state[2] = factor_count
    state[0] = 0
    return factor_count


__all__ = ["pari_row23_prime_descriptors"]

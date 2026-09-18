"""Bounded degree-five factor-base dependencies for development row 21.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This supplies the two degree-five gaps between the authenticated prepared
number field and the existing translated PARI 2.17.4 factor-base machinery:
the distinct factor-degree pattern of the defining polynomial modulo an
ordinary small prime, and `pr_hnf` for a prepared prime descriptor.  The
trial factorizer is intentionally bounded to monic quintics and primes below
4096; it strips every monic linear and irreducible quadratic factor, after
which the remaining factor of a quintic is necessarily irreducible.
"""

from sagejs.native import (
    Float64Buffer,
    IntegerBuffer,
    integer_buffer_view,
    native,
)

from .bad_subfactor import pari_bad_subfactor_flags
from .discriminant_log import pari_discriminant_log
from .initial_base import pari_prepared_initial_base
from .pradical import pari_small_pradical
from .prime_complements import pari_small_prime_complements
from .prime_descriptor import pari_prepared_prime_descriptor
from .prime_descriptor_sort import pari_prime_descriptor_sort
from .quotient_split_recursive import pari_small_quotient_split_recursive
from .relation_cache import pari_word_mod_inverse
from .subfactor_base import pari_prepared_subfactor_base
from .subfactor_product import pari_subfactor_product


@native
def _row21_powmod(base: int, exponent: int, modulus: int) -> int:
    result = 1
    base %= modulus
    while exponent != 0:
        if exponent & 1:
            result = result * base % modulus
        base = base * base % modulus
        exponent >>= 1
    return result


@native
def _row21_quadratic_irreducible(a: int, b: int, prime: int) -> bool:
    """Whether `x^2+a*x+b` is irreducible over `F_prime`."""
    if prime == 2:
        return a == 1 and b == 1
    discriminant = (a * a - 4 * b) % prime
    if discriminant == 0:
        return False
    return _row21_powmod(discriminant, (prime - 1) // 2, prime) == prime - 1


@native
def _row21_strip_factor(
    current: IntegerBuffer,
    current_degree: int,
    factor: IntegerBuffer,
    factor_degree: int,
    work: IntegerBuffer,
) -> int:
    """Divide repeatedly by one monic factor; return multiplicity."""
    multiplicity = 0
    while current_degree >= factor_degree:
        for i in range(current_degree + 1):
            work[i] = current[i]
        for k in range(current_degree, factor_degree - 1, -1):
            leading = work[k]
            if leading != 0:
                for j in range(factor_degree + 1):
                    work[k - factor_degree + j] -= leading * factor[j]
        divisible = True
        for i in range(factor_degree):
            if work[i] != 0:
                divisible = False
        if not divisible:
            return multiplicity
        current_degree -= factor_degree
        for i in range(current_degree + 1):
            current[i] = work[i + factor_degree]
        multiplicity += 1
    return multiplicity


@native
def pari_row21_quintic_factor_degrees(
    polynomial: IntegerBuffer,
    prime: int,
    degrees: IntegerBuffer,
    exponents: IntegerBuffer,
    workspace: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Return sorted distinct factor degrees of a monic quintic modulo `p`.

    `state=[status,count,total_degree]`.  The polynomial is low-to-high.
    The caller treats index-dividing primes through maximal-order radical
    decomposition instead; this function rejects no ordinary ramification.
    """
    if prime < 2 or prime >= 4096 or len(polynomial) < 6:
        raise ValueError("row21 quintic factor domain")
    if len(degrees) < 5 or len(exponents) < 5 or len(workspace) < 32 or len(state) < 3:
        raise ValueError("short row21 quintic factor storage")
    if polynomial[5] != 1:
        raise ValueError("row21 quintic must be monic")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    current = workspace
    # current 0..5, factor 6..8, remainder 9..14, quotient 15..19.
    for i in range(6):
        current[i] = polynomial[i] % prime
    factor = workspace
    work = workspace
    current_degree = 5
    count = 0

    for root in range(prime):
        factor[6] = (-root) % prime
        factor[7] = 1
        # Inline the tiny view offsets to keep this source graph allocation-free.
        multiplicity = 0
        while current_degree >= 1:
            for i in range(current_degree + 1):
                work[9 + i] = current[i]
            for i in range(current_degree):
                work[15 + i] = 0
            for k in range(current_degree, 0, -1):
                leading = work[9 + k]
                work[15 + k - 1] = leading
                if leading != 0:
                    work[9 + k - 1] = (work[9 + k - 1] - leading * factor[6]) % prime
                    work[9 + k] = 0
            if work[9] != 0:
                break
            current_degree -= 1
            for i in range(current_degree + 1):
                current[i] = work[15 + i]
            multiplicity += 1
        if multiplicity != 0:
            degrees[count] = 1
            exponents[count] = multiplicity
            count += 1

    for a in range(prime):
        for b in range(prime):
            if not _row21_quadratic_irreducible(a, b, prime):
                continue
            factor[6] = b
            factor[7] = a
            factor[8] = 1
            multiplicity = 0
            while current_degree >= 2:
                for i in range(current_degree + 1):
                    work[9 + i] = current[i]
                for i in range(current_degree - 1):
                    work[15 + i] = 0
                for k in range(current_degree, 1, -1):
                    leading = work[9 + k]
                    work[15 + k - 2] = leading
                    if leading != 0:
                        work[9 + k - 2] = (
                            work[9 + k - 2] - leading * factor[6]
                        ) % prime
                        work[9 + k - 1] = (
                            work[9 + k - 1] - leading * factor[7]
                        ) % prime
                        work[9 + k] = 0
                if work[9] != 0 or work[10] != 0:
                    break
                current_degree -= 2
                for i in range(current_degree + 1):
                    current[i] = work[15 + i]
                multiplicity += 1
            if multiplicity != 0:
                degrees[count] = 2
                exponents[count] = multiplicity
                count += 1

    if current_degree != 0:
        degrees[count] = current_degree
        exponents[count] = 1
        count += 1
    total = 0
    for i in range(count):
        total += degrees[i] * exponents[i]
    if total != 5:
        raise ValueError("row21 quintic factor degree identity")
    state[0] = 0
    state[1] = count
    state[2] = total
    return count


@native
def pari_row21_prime_ideal_hnf(
    basis_table: IntegerBuffer,
    generator: IntegerBuffer,
    prime: int,
    multiplication: IntegerBuffer,
    work: IntegerBuffer,
    pivots: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Degree-five `zk_multable` followed by `ZM_hnfmodprime`."""
    n = 5
    if prime < 2 or prime >= 18446744073709551616:
        raise ValueError("row21 prime-ideal HNF prime frontier")
    if (
        len(basis_table) < 125
        or len(generator) < n
        or len(multiplication) < 25
        or len(work) < 25
        or len(pivots) < n
        or len(output) < 25
    ):
        raise ValueError("short row21 prime-ideal HNF storage")
    for k in range(n):
        multiplication[k * n] = generator[k]
    for i in range(1, n):
        for k in range(n):
            value = 0
            for j in range(n):
                value += basis_table[(i * n + j) * n + k] * generator[j]
            multiplication[k * n + i] = value
    for i in range(25):
        work[i] = multiplication[i] % prime
        output[i] = 0
    for i in range(n):
        pivots[i] = -1
        output[i * n + i] = prime
    remaining = n
    for row in range(n - 1, -1, -1):
        column = remaining - 1
        while column >= 0 and work[row * n + column] == 0:
            column -= 1
        if column < 0:
            continue
        destination = remaining - 1
        pivot = work[row * n + column]
        if column != destination:
            for i in range(n):
                temporary = work[i * n + destination]
                work[i * n + destination] = work[i * n + column]
                work[i * n + column] = temporary
        if pivot != 1:
            inverse = pari_word_mod_inverse(pivot, prime)
            for i in range(row):
                work[i * n + destination] = work[i * n + destination] * inverse % prime
        work[row * n + destination] = 1
        for j in range(destination - 1, -1, -1):
            multiplier = work[row * n + j]
            if multiplier != 0:
                for i in range(n):
                    work[i * n + j] -= multiplier * work[i * n + destination]
                for i in range(row):
                    work[i * n + j] %= prime
        pivots[destination] = row
        remaining -= 1
    rank = n - remaining
    for j in range(remaining, n):
        for i in range(n):
            output[i * n + pivots[j]] = work[i * n + j]
    for i in range(n - 1, -1, -1):
        if output[i * n + i] == 1:
            for j in range(i + 1, n):
                multiplier = output[i * n + j]
                if multiplier != 0:
                    for k in range(n):
                        output[k * n + j] -= multiplier * output[k * n + i]
                    for k in range(i):
                        value = output[k * n + j]
                        if value >= 18446744073709551616:
                            output[k * n + j] = value % prime
                        elif value <= -18446744073709551616:
                            output[k * n + j] = -((-value) % prime)
        else:
            for j in range(i + 1, n):
                output[i * n + j] %= prime
    return rank


@native
def pari_row21_initial_base(
    discriminant: int,
    real_places: int,
    primes: IntegerBuffer,
    pattern_offsets: IntegerBuffer,
    pattern_counts: IntegerBuffer,
    pattern_degrees: IntegerBuffer,
    multiplicities: IntegerBuffer,
    full_offsets: IntegerBuffer,
    full_counts: IntegerBuffer,
    full_degrees: IntegerBuffer,
    configuration: Float64Buffer,
    norms: IntegerBuffer,
    constants_logs: Float64Buffer,
    sums: Float64Buffer,
    factor_logs: Float64Buffer,
    selected_primes: IntegerBuffer,
    offsets: IntegerBuffer,
    counts: IntegerBuffer,
    complete_groups: IntegerBuffer,
    selected_indices: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Derive C1/C2 and translated FBgen selection from degree patterns."""
    if len(configuration) < 3 or len(state) < 8:
        raise ValueError("short row21 initial-base state")
    configuration[0] = pari_discriminant_log(discriminant)
    configuration[1] = 0.0
    configuration[2] = 0.0
    c1, c2, kc, kcz, kcz2, kc2, product = pari_prepared_initial_base(
        5,
        real_places,
        configuration,
        primes,
        pattern_offsets,
        pattern_counts,
        pattern_degrees,
        multiplicities,
        full_offsets,
        full_counts,
        full_degrees,
        norms,
        constants_logs,
        sums,
        factor_logs,
        selected_primes,
        offsets,
        counts,
        complete_groups,
        selected_indices,
    )
    state[0] = c1
    state[1] = c2
    state[2] = kc
    state[3] = kcz
    state[4] = kcz2
    state[5] = kc2
    state[6] = product
    state[7] = 1
    return kc


@native
def pari_row21_prime_descriptors(
    table: IntegerBuffer,
    prime: int,
    real_places: int,
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    max_residue_degree: int,
    workspace: IntegerBuffer,
    descriptors: IntegerBuffer,
    ranks: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Publish only the norm-eligible maximal-order descriptor prefix.

    The quotient split is complete, but residue-degree-four ideals are not
    sent through the deliberately smaller uniformizer corridor when FBgen
    would discard them. State is `[status, radical_rank, full, selected]`.
    """
    n = 5
    stride = 33
    if (
        prime < 2
        or real_places != 3
        or max_residue_degree < 1
        or max_residue_degree > 3
        or len(table) < 125
        or len(matrix_m) < 25
        or len(matrix_p) < 25
        or len(matrix_e) < 25
        or len(workspace) < 12000
        or len(descriptors) < 5 * stride
        or len(ranks) < 5
        or len(state) < 4
    ):
        raise ValueError("row21 prime descriptor prefix domain")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    state[3] = 0
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
    state[1] = radical_rank
    phi = integer_buffer_view(workspace, 280, 32)
    radical = integer_buffer_view(workspace, 312, 32)
    final_ideals = integer_buffer_view(workspace, 2304, 128)
    final_ranks = integer_buffer_view(workspace, 2432, 8)
    count = pari_small_quotient_split_recursive(
        table,
        radical,
        phi,
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
        final_ideals,
        final_ranks,
        integer_buffer_view(workspace, 2440, 8),
    )
    state[2] = count
    complements = integer_buffer_view(workspace, 3600, 128)
    complement_ranks = integer_buffer_view(workspace, 3728, 8)
    pari_small_prime_complements(
        final_ideals,
        final_ranks,
        count,
        n,
        prime,
        integer_buffer_view(workspace, 2560, 1024),
        integer_buffer_view(workspace, 3584, 16),
        complements,
        complement_ranks,
        integer_buffer_view(workspace, 3736, 8),
    )
    unsorted = integer_buffer_view(workspace, 5564, 200)
    degrees = integer_buffer_view(workspace, 5500, 8)
    generators = integer_buffer_view(workspace, 5508, 40)
    packed = integer_buffer_view(workspace, 5400, 40)
    selected_count = 0
    for j in range(count):
        residue_degree = n - final_ranks[j]
        if residue_degree > max_residue_degree:
            continue
        pari_prepared_prime_descriptor(
            table,
            integer_buffer_view(final_ideals, j * 25, 25),
            integer_buffer_view(complements, j * 25, 25),
            n,
            final_ranks[j],
            complement_ranks[j],
            prime,
            1,
            real_places,
            matrix_m,
            matrix_p,
            matrix_e,
            integer_buffer_view(workspace, 4096, 1024),
            integer_buffer_view(workspace, 5120, 8),
            integer_buffer_view(workspace, 5128, 8),
            integer_buffer_view(workspace, 5136, 8),
            integer_buffer_view(workspace, 5144, 8),
            integer_buffer_view(workspace, 5152, 8),
            integer_buffer_view(workspace, 5160, 8),
            integer_buffer_view(workspace, 5168, 8),
            integer_buffer_view(workspace, 5176, 128),
            integer_buffer_view(workspace, 5304, 8),
            integer_buffer_view(workspace, 5312, 32),
            integer_buffer_view(workspace, 5344, 8),
            integer_buffer_view(workspace, 5352, 8),
            integer_buffer_view(workspace, 5360, 32),
            packed,
            integer_buffer_view(workspace, 5392, 8),
        )
        ranks[selected_count] = final_ranks[j]
        degrees[selected_count] = packed[2]
        for i in range(stride):
            unsorted[selected_count * stride + i] = packed[i]
        for i in range(n):
            generators[selected_count * n + i] = packed[3 + i]
        selected_count += 1
    order = integer_buffer_view(workspace, 5548, 8)
    pari_prime_descriptor_sort(
        degrees,
        generators,
        n,
        selected_count,
        order,
        integer_buffer_view(workspace, 5556, 8),
    )
    for j in range(selected_count):
        source = order[j]
        ranks[j] = ranks[source]
        for i in range(stride):
            descriptors[j * stride + i] = unsorted[source * stride + i]
    state[3] = selected_count
    state[0] = 0
    return selected_count


@native
def pari_row21_subfactor_base(
    norms: IntegerBuffer,
    group_offsets: IntegerBuffer,
    group_sizes: IntegerBuffer,
    complete_groups: IntegerBuffer,
    group_count: int,
    complex_pairs: int,
    log_discriminant: float,
    c2: int,
    bad: IntegerBuffer,
    configuration: Float64Buffer,
    order: IntegerBuffer,
    scratch: IntegerBuffer,
    stack: IntegerBuffer,
    chosen: IntegerBuffer,
    rejected: IntegerBuffer,
    permutation: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Compute `bad_subFB`, source permutation, and the initial subFB."""
    if len(state) < 4 or len(configuration) < 1:
        raise ValueError("short row21 subfactor state")
    pari_bad_subfactor_flags(
        group_offsets,
        group_sizes,
        complete_groups,
        group_count,
        len(norms),
        bad,
    )
    configuration[0] = pari_subfactor_product(5, complex_pairs, log_discriminant, c2)
    count, maxdep_size, maxdep = pari_prepared_subfactor_base(
        norms,
        bad,
        configuration,
        3,
        order,
        scratch,
        stack,
        chosen,
        rejected,
        permutation,
    )
    state[0] = count
    state[1] = maxdep_size
    state[2] = maxdep
    state[3] = 1
    return count


__all__ = [
    "pari_row21_prime_ideal_hnf",
    "pari_row21_initial_base",
    "pari_row21_prime_descriptors",
    "pari_row21_quintic_factor_degrees",
    "pari_row21_subfactor_base",
]

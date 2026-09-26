"""Row-23 degree-five index-prime descriptor and ideal-packet owner.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This composes the translated PARI 2.17.4 maximal-order `primedec` path with
the `pr_hnf` prime-modulus construction. The deliberately narrow boundary
is frozen development-panel row 23: degree five, totally real, and the
equation-index prime 131.  Neither a prime descriptor nor an ideal HNF is an
input.
"""

from sagejs.native import IntegerBuffer, integer_buffer_view, native

from .prepared_index_prime import pari_prepared_index_prime_descriptors
from .relation_cache import pari_word_mod_inverse


ROW23_WORKSPACE = 12600
ROW23_DESCRIPTOR_STRIDE = 33


@native
def _row23_basis_multiplication_table(
    basis_table: IntegerBuffer,
    generator: IntegerBuffer,
    multiplication: IntegerBuffer,
) -> int:
    """Translate `zk_multable`/`zk_ei_mul` for the fixed degree-five cut."""
    n = 5
    for k in range(n):
        multiplication[k * n] = generator[k]
    for i in range(1, n):
        for k in range(n):
            value = 0
            for j in range(n):
                coefficient = basis_table[(i * n + j) * n + k]
                if coefficient == 1:
                    value += generator[j]
                elif coefficient == -1:
                    value -= generator[j]
                elif coefficient != 0:
                    value += coefficient * generator[j]
            multiplication[k * n + i] = value
    return 0


@native
def _row23_prime_modulus_hnf(
    original: IntegerBuffer,
    prime: int,
    work: IntegerBuffer,
    pivots: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Translate `ZM_hnfmodprime` for one five-by-five matrix."""
    n = 5
    for i in range(n * n):
        work[i] = original[i] % prime
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
    if rank == n:
        for i in range(n * n):
            output[i] = 0
        for i in range(n):
            output[i * n + i] = 1
        return rank
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
def pari_row23_index_prime_packet(
    basis_table: IntegerBuffer,
    admission_matrix_m: IntegerBuffer,
    admission_matrix_p: IntegerBuffer,
    admission_matrix_e: IntegerBuffer,
    workspace: IntegerBuffer,
    descriptors: IntegerBuffer,
    descriptor_ranks: IntegerBuffer,
    packet_ideals: IntegerBuffer,
    packet_norms: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Compute every prime above 131 and publish its descriptor and HNF.

    State is `[status,count,stride,modular_rank_sum,published_packets]`.
    All successful descriptors and packet HNFs are staged inside the private
    workspace, so caller-owned mathematical outputs are published together.
    """
    n = 5
    prime = 131
    stride = ROW23_DESCRIPTOR_STRIDE
    if (
        len(basis_table) < 125
        or len(admission_matrix_m) < 25
        or len(admission_matrix_p) < 25
        or len(admission_matrix_e) < 25
        or len(workspace) < ROW23_WORKSPACE
        or len(descriptors) < n * stride
        or len(descriptor_ranks) < n
        or len(packet_ideals) < n * n * n
        or len(packet_norms) < n
        or len(state) < 5
    ):
        raise ValueError("short row23 index-prime packet storage")

    state[0] = -1
    state[1] = 0
    state[2] = stride
    state[3] = 0
    state[4] = 0
    descriptor_workspace = integer_buffer_view(workspace, 0, 12000)
    staged_descriptors = integer_buffer_view(workspace, 12000, n * stride)
    staged_ranks = integer_buffer_view(workspace, 12165, n)
    staged_ideals = integer_buffer_view(workspace, 12170, n * n * n)
    staged_norms = integer_buffer_view(workspace, 12295, n)
    generator = integer_buffer_view(workspace, 12300, n)
    multiplication = integer_buffer_view(workspace, 12305, n * n)
    hnf_work = integer_buffer_view(workspace, 12330, n * n)
    pivots = integer_buffer_view(workspace, 12355, n)
    ideal = integer_buffer_view(workspace, 12360, n * n)

    count = pari_prepared_index_prime_descriptors(
        basis_table,
        n,
        prime,
        n,
        admission_matrix_m,
        admission_matrix_p,
        admission_matrix_e,
        descriptor_workspace,
        staged_descriptors,
        staged_ranks,
        integer_buffer_view(workspace, 12385, 4),
    )
    modular_rank_sum = 0
    for position in range(count):
        base = position * stride
        for k in range(n):
            generator[k] = staged_descriptors[base + 3 + k]
        _row23_basis_multiplication_table(basis_table, generator, multiplication)
        modular_rank_sum += _row23_prime_modulus_hnf(
            multiplication, prime, hnf_work, pivots, ideal
        )
        norm = 1
        for k in range(staged_descriptors[base + 2]):
            norm *= prime
        for k in range(n * n):
            staged_ideals[position * n * n + k] = ideal[k]
        staged_norms[position] = norm

    for position in range(count):
        descriptor_ranks[position] = staged_ranks[position]
        packet_norms[position] = staged_norms[position]
        for k in range(stride):
            descriptors[position * stride + k] = staged_descriptors[
                position * stride + k
            ]
        for k in range(n * n):
            packet_ideals[position * n * n + k] = staged_ideals[position * n * n + k]
    state[1] = count
    state[3] = modular_rank_sum
    state[4] = count
    state[0] = 0
    return count

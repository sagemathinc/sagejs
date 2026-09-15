"""PARI 2.17.4 buch2.c FBgen selection from prepared prime decompositions.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Prime decomposition and cached binary64 logarithms remain explicit inputs.
"""

from sagejs.native import IntegerBuffer, Float64Buffer, native


@native
def pari_prepared_factor_base(
    degree: int,
    relation_bound: int,
    checking_bound: int,
    primes: IntegerBuffer,
    full_offsets: IntegerBuffer,
    full_counts: IntegerBuffer,
    full_degrees: IntegerBuffer,
    logarithms: Float64Buffer,
    selected_primes: IntegerBuffer,
    offsets: IntegerBuffer,
    counts: IntegerBuffer,
    complete_groups: IntegerBuffer,
    selected_indices: IntegerBuffer,
) -> tuple[int, int, int, int, int]:
    """Return KC, KCZ, KCZ2, KC2, prodZ from the FBgen selection loop.

    logarithms[0] is log(C2+0.5); subsequent entries are cached log(primes[i]).
    Prime input contains a sentinel beyond C2, and each full decomposition is
    sorted by residue degree in the upstream idealprimedec ordering. Selected
    indices identify borrowed prepared prime ideals; no ideal is reconstructed.
    Offsets/counts/complete_groups are indexed directly by rational prime.
    """
    if degree < 2 or relation_bound < 1 or checking_bound < relation_bound:
        raise ValueError("invalid prepared factor-base bounds")
    if len(primes) == 0 or primes[len(primes) - 1] <= checking_bound:
        raise ValueError("prepared factor base requires a prime sentinel")
    for p in range(checking_bound + 1):
        offsets[p] = -1
        counts[p] = 0
        complete_groups[p] = 0
    rational_count = 0
    ideal_count = 0
    active_ideals = 0
    active_primes = 0
    position = 0
    while position < len(primes):
        p = primes[position]
        if active_ideals == 0 and p > relation_bound:
            active_primes = rational_count
            active_ideals = ideal_count
        if p > checking_bound:
            break
        start = full_offsets[position]
        size = full_counts[position]
        if size < 1:
            raise ValueError("missing prepared prime decomposition")
        if full_degrees[start] != degree:
            limit = int(logarithms[0] / logarithms[position + 1])
            k = 0
            while k < size and full_degrees[start + k] <= limit:
                k += 1
            if k != 0:
                selected_primes[rational_count] = p
                rational_count += 1
                offsets[p] = ideal_count
                counts[p] = k
                if k == size:
                    complete_groups[p] = 1
                for j in range(k):
                    selected_indices[ideal_count + j] = start + j
                ideal_count += k
        if p == checking_bound:
            break
        position += 1
    if active_ideals == 0:
        active_primes = rational_count
        active_ideals = ideal_count
    product = 1
    for i in range(active_primes):
        product *= selected_primes[i]
    return active_ideals, active_primes, rational_count, ideal_count, product

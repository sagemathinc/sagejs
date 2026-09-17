"""Derive connected-root factor metadata from the row-14 initial capsule.

The capsule supplies only the authenticated prepared number field, the initial
factor-base descriptors, and the pre-search schedule.  Ideal HNFs are
recomputed from the prepared multiplication table and descriptor generators.
The authenticated descriptor tau is preserved: reconstructing PARI's exact
ramified antiuniformizer choice requires the omitted prime-decomposition path.
No later relation, HNF, class, or unit data is accepted by this boundary.
"""

from sagejs.native import IntegerBuffer, native

from .prime_ideal_hnf import pari_prime_ideal_hnf


@native
def pari_row14_capsule_factor_metadata(
    table: IntegerBuffer,
    primes: IntegerBuffer,
    generators: IntegerBuffer,
    ramification: IntegerBuffer,
    residue_degrees: IntegerBuffer,
    source_tau: IntegerBuffer,
    rational_primes: IntegerBuffer,
    permutation: IntegerBuffer,
    subfactor: IntegerBuffer,
    degree: int,
    group_offsets: IntegerBuffer,
    group_counts: IntegerBuffer,
    group_complete: IntegerBuffer,
    relation_primes: IntegerBuffer,
    relation_e: IntegerBuffer,
    relation_f: IntegerBuffer,
    group_tau: IntegerBuffer,
    packet_ideals: IntegerBuffer,
    packet_norms: IntegerBuffer,
    search_ideals: IntegerBuffer,
    packet_generator: IntegerBuffer,
    packet_multiplication: IntegerBuffer,
    packet_work: IntegerBuffer,
    packet_pivots: IntegerBuffer,
    packet_ideal: IntegerBuffer,
) -> tuple[int, int]:
    """Publish live factor metadata and return `(rows, complete_groups)`.

    Descriptor order is preserved.  Rational groups are the exact ordered
    partition induced by `rational_primes`; completeness is the standard
    degree identity `sum(e*f) == degree`.  The selected search permutation is
    one-based and its prefix must be the declared subfactor.
    """
    rows = int(len(primes))
    groups = int(len(rational_primes))
    square = degree * degree
    if degree < 3 or degree > 4 or rows < 1 or groups < 1:
        raise ValueError("invalid row-14 factor metadata dimensions")
    if (
        len(table) < degree * square
        or len(generators) != rows * degree
        or len(ramification) != rows
        or len(residue_degrees) != rows
        or len(source_tau) != rows * square
        or len(permutation) != rows
        or len(subfactor) < 1
        or len(subfactor) > rows
        or len(group_offsets) < groups
        or len(group_counts) < groups
        or len(group_complete) < groups
        or len(relation_primes) < rows
        or len(relation_e) < rows
        or len(relation_f) < rows
        or len(group_tau) < rows * square
        or len(packet_ideals) < rows * square
        or len(packet_norms) < rows
        or len(search_ideals) < rows
        or len(packet_generator) < degree
        or len(packet_multiplication) < square
        or len(packet_work) < square
        or len(packet_pivots) < degree
        or len(packet_ideal) < square
    ):
        raise ValueError("short row-14 factor metadata storage")

    for i in range(rows):
        selected = int(permutation[i])
        if selected < 1 or selected > rows:
            raise ValueError("row-14 permutation entry outside factor base")
        for j in range(i):
            if permutation[j] == selected:
                raise ValueError("row-14 permutation is not unique")
        search_ideals[i] = selected
    for i in range(len(subfactor)):
        if subfactor[i] != permutation[i]:
            raise ValueError("row-14 subfactor is not the search prefix")

    position = 0
    complete_groups = 0
    for group in range(groups):
        prime = int(rational_primes[group])
        if prime < 2 or (group > 0 and rational_primes[group - 1] >= prime):
            raise ValueError("invalid row-14 rational prime order")
        start = position
        weighted_degree = 0
        while position < rows and primes[position] == prime:
            e = int(ramification[position])
            f = int(residue_degrees[position])
            if e < 1 or f < 1 or e * f > degree:
                raise ValueError("invalid row-14 prime descriptor degree")
            weighted_degree += e * f
            position += 1
        if position == start or weighted_degree > degree:
            raise ValueError("invalid row-14 rational prime group")
        group_offsets[group] = start
        group_counts[group] = position - start
        if weighted_degree == degree:
            group_complete[group] = 1
            complete_groups += 1
        else:
            group_complete[group] = 0
    if position != rows:
        raise ValueError("row-14 descriptor tail is not grouped")

    for position in range(rows):
        prime = int(primes[position])
        e = int(ramification[position])
        f = int(residue_degrees[position])
        relation_primes[position] = prime
        relation_e[position] = e
        relation_f[position] = f
        for i in range(degree):
            packet_generator[i] = generators[position * degree + i]
        pari_prime_ideal_hnf(
            table,
            packet_generator,
            degree,
            prime,
            0,
            packet_multiplication,
            packet_work,
            packet_pivots,
            packet_ideal,
        )
        norm = 1
        for i in range(f):
            norm *= prime
        packet_norms[position] = norm
        for i in range(square):
            packet_ideals[position * square + i] = packet_ideal[i]

        for i in range(square):
            group_tau[position * square + i] = source_tau[position * square + i]
    return rows, complete_groups


__all__ = ["pari_row14_capsule_factor_metadata"]

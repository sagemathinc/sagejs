"""Construct selected prime-ideal packets from prepared PARI descriptors.

PARI algorithm attribution: The PARI group, GPL-2.0-or-later.
The selected indices are the actual output of translated FBgen. Prime
decomposition and the maximal-order multiplication table remain prepared.
No ideal HNF or ideal norm is an input.
"""

from sagejs.native import IntegerBuffer, native
from .prime_ideal_hnf import pari_prime_ideal_hnf


@native
def pari_selected_ideal_packets(
    basis_table: IntegerBuffer,
    primes: IntegerBuffer,
    residue_degrees: IntegerBuffer,
    inert_flags: IntegerBuffer,
    generators: IntegerBuffer,
    catalog_count: int,
    selected_indices: IntegerBuffer,
    selected_count: int,
    degree: int,
    generator: IntegerBuffer,
    multiplication: IntegerBuffer,
    work: IntegerBuffer,
    pivots: IntegerBuffer,
    ideal: IntegerBuffer,
    packet_ideals: IntegerBuffer,
    packet_norms: IntegerBuffer,
) -> int:
    """Gather zero-based catalog descriptors and construct row-major packets.

    `selected_count` can be the active KC prefix of a longer KC2 selection.
    Preserve selected order exactly. All owners are disjoint. Validate sizes,
    indices and selected descriptor scalar domains before writing; invalid
    mathematical descriptors/table data can still fail after earlier packets.
    Primality and descriptor consistency are prepared-input preconditions.
    Output tails beyond the selected prefix are untouched.
    """
    if degree < 3 or degree > 4 or catalog_count < 0 or selected_count < 0:
        raise ValueError("invalid selected ideal dimensions")
    square = degree * degree
    if (
        len(basis_table) < square * degree
        or len(primes) < catalog_count
        or len(residue_degrees) < catalog_count
        or len(inert_flags) < catalog_count
        or len(generators) < catalog_count * degree
        or len(selected_indices) < selected_count
        or len(generator) < degree
        or len(multiplication) < square
        or len(work) < square
        or len(pivots) < degree
        or len(ideal) < square
        or len(packet_ideals) < selected_count * square
        or len(packet_norms) < selected_count
    ):
        raise ValueError("short selected ideal storage")
    for position in range(selected_count):
        index = selected_indices[position]
        if index < 0 or index >= catalog_count:
            raise ValueError("selected ideal index outside catalog")
        if (
            primes[index] < 2
            or primes[index] >= 18446744073709551616
            or residue_degrees[index] < 1
            or residue_degrees[index] > degree
            or (inert_flags[index] != 0 and inert_flags[index] != 1)
        ):
            raise ValueError("invalid selected prime descriptor")
    for position in range(selected_count):
        index = selected_indices[position]
        for k in range(degree):
            generator[k] = generators[index * degree + k]
        pari_prime_ideal_hnf(
            basis_table,
            generator,
            degree,
            primes[index],
            inert_flags[index],
            multiplication,
            work,
            pivots,
            ideal,
        )
        norm = 1
        for k in range(residue_degrees[index]):
            norm *= primes[index]
        for k in range(square):
            packet_ideals[position * square + k] = ideal[k]
        packet_norms[position] = norm
    return selected_count

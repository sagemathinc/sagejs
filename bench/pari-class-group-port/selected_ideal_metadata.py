"""Gather PARI factor-base descriptor fields in translated FBgen order.

PARI correspondence: `buch2.c` FBgen/subFBgen retain selected prime
descriptors in `F->LP`; valuation and relation code reads `pr_get_e`,
`pr_get_f`, and `pr_get_tau` from those descriptors. This representation
adapter copies those fields without recomputing prime decomposition or tau.
PARI attribution: The PARI group, GPL-2.0-or-later.
"""

from sagejs.native import IntegerBuffer, native


@native
def pari_selected_ideal_metadata(
    primes: IntegerBuffer,
    ramification: IntegerBuffer,
    residue_degrees: IntegerBuffer,
    inert_flags: IntegerBuffer,
    tau: IntegerBuffer,
    catalog_count: int,
    selected_indices: IntegerBuffer,
    selected_count: int,
    degree: int,
    selected_primes: IntegerBuffer,
    selected_ramification: IntegerBuffer,
    selected_degrees: IntegerBuffer,
    selected_inert: IntegerBuffer,
    selected_tau: IntegerBuffer,
) -> int:
    """Copy selected descriptors to disjoint row-major admission owners.

    The active KC prefix may be shorter than the checking-base selection.
    Validate all selected scalar fields and storage before any write; leave
    output tails untouched. Raw tau matrices and mathematical consistency
    are prepared-input preconditions. Inert tau uses an all-zero matrix.
    """
    if degree < 2 or catalog_count < 0 or selected_count < 0:
        raise ValueError("invalid selected metadata dimensions")
    square = degree * degree
    if (
        len(primes) < catalog_count
        or len(ramification) < catalog_count
        or len(residue_degrees) < catalog_count
        or len(inert_flags) < catalog_count
        or len(tau) < catalog_count * square
        or len(selected_indices) < selected_count
        or len(selected_primes) < selected_count
        or len(selected_ramification) < selected_count
        or len(selected_degrees) < selected_count
        or len(selected_inert) < selected_count
        or len(selected_tau) < selected_count * square
    ):
        raise ValueError("short selected metadata storage")
    for i in range(selected_count):
        j = selected_indices[i]
        if j < 0 or j >= catalog_count:
            raise ValueError("selected metadata index outside catalog")
        if (
            primes[j] < 2
            or primes[j] >= 18446744073709551616
            or ramification[j] < 1
            or ramification[j] > degree
            or residue_degrees[j] < 1
            or residue_degrees[j] > degree
            or (inert_flags[j] != 0 and inert_flags[j] != 1)
        ):
            raise ValueError("invalid selected metadata descriptor")
    for i in range(selected_count):
        j = selected_indices[i]
        selected_primes[i] = primes[j]
        selected_ramification[i] = ramification[j]
        selected_degrees[i] = residue_degrees[j]
        selected_inert[i] = inert_flags[j]
        for k in range(square):
            selected_tau[i * square + k] = tau[j * square + k]
    return selected_count

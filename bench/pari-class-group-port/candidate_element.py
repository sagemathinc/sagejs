"""PARI 2.17.4 Fincke_Pohst_ideal candidate filtering before factorgen.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
The reduced ideal matrix is row-major; the cursor coordinates are one-based.
"""

from math import gcd

from sagejs.native import Int64Buffer, IntegerBuffer, native


@native
def pari_candidate_element(
    coordinates: Int64Buffer,
    ideal: IntegerBuffer,
    degree: int,
    element: IntegerBuffer,
    counters: Int64Buffer,
    track_small: int,
) -> int:
    """Return 0 for rejection, 1 for factorgen input, -1 at its attempt limit.

    counters holds try_factor and Nsmall; track_small represents DEBUGLEVEL
    and a non-null Nsmall pointer. Keep source order: nonprimitive
    rejection leaves element untouched, scalar rejection follows multiplication,
    and the 501st nonscalar attempt increments try_factor but not Nsmall.
    The caller stops the ideal search on -1. No factorization is performed.
    """
    if degree < 2 or degree > 10:
        raise ValueError("unsupported candidate degree")
    if len(coordinates) < degree + 1 or len(ideal) < degree * degree:
        raise ValueError("candidate coordinate or ideal storage too small")
    if len(element) < degree or len(counters) < 2:
        raise ValueError("candidate output or counter storage too small")
    content = 0
    for i in range(degree):
        content = gcd(content, int(coordinates[i + 1]))
    if content != 1:
        return 0
    nonscalar = 0
    for i in range(degree):
        value = 0
        for j in range(degree):
            value += ideal[i * degree + j] * int(coordinates[j + 1])
        element[i] = value
        if i > 0 and value != 0:
            nonscalar = 1
    if nonscalar == 0:
        return 0
    counters[0] += 1
    if counters[0] > 500:
        return -1
    if track_small != 0:
        counters[1] += 1
    return 1

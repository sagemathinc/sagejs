"""PARI 2.17.4 `bibli2.c` prime-descriptor comparison and tiny gen_sortspec.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Compare residue degrees, then signed integral generators lexicographically
(`ZV.c:ZV_cmp`). Return the zero-based sorting permutation; gathering complete
descriptors replaces source `sort_extract` deep copies at the caller boundary.
"""

from sagejs.native import IntegerBuffer, native


@native
def _prime_descriptor_compare(
    degrees: IntegerBuffer,
    generators: IntegerBuffer,
    n: int,
    a: int,
    b: int,
    diagnostic: IntegerBuffer,
) -> int:
    diagnostic[0] += 1
    k = degrees[a] - degrees[b]
    if k > 0:
        return 1
    if k < 0:
        return -1
    for i in range(n):
        diagnostic[1] += 1
        if generators[a * n + i] > generators[b * n + i]:
            return 1
        if generators[a * n + i] < generators[b * n + i]:
            return -1
    return 0


@native
def pari_prime_descriptor_sort(
    degrees: IntegerBuffer,
    generators: IntegerBuffer,
    n: int,
    count: int,
    order: IntegerBuffer,
    diagnostic: IntegerBuffer,
) -> int:
    """Source stable permutation for at most four primes over one p.

    Generators are contiguous n-vectors; retain actual signed inert generator
    (p,0,...), not a metadata placeholder. All owners are disjoint. Diagnostic
    gives comparator/coordinate counts; outputs outside active prefixes stay
    untouched. Canonical mathematical descriptor consistency is precondition.
    """
    if n < 3 or n > 4 or count < 0 or count > n:
        raise ValueError("prime descriptor sort degree/count frontier")
    if (
        len(degrees) < count
        or len(generators) < n * count
        or len(order) < count
        or len(diagnostic) < 2
    ):
        raise ValueError("short prime descriptor sort storage")
    for i in range(count):
        if degrees[i] < 1 or degrees[i] > n:
            raise ValueError("invalid prime descriptor residue degree")
    diagnostic[0] = 0
    diagnostic[1] = 0
    if count == 1:
        check = _prime_descriptor_compare(degrees, generators, n, 0, 0, diagnostic)
        order[0] = check
    elif count == 2:
        if _prime_descriptor_compare(degrees, generators, n, 0, 1, diagnostic) <= 0:
            order[0] = 0
            order[1] = 1
        else:
            order[0] = 1
            order[1] = 0
    elif count == 3:
        p0 = 0
        p1 = 1
        p2 = 2
        if _prime_descriptor_compare(degrees, generators, n, 0, 1, diagnostic) <= 0:
            if _prime_descriptor_compare(degrees, generators, n, 1, 2, diagnostic) > 0:
                if (
                    _prime_descriptor_compare(degrees, generators, n, 0, 2, diagnostic)
                    <= 0
                ):
                    p1 = 2
                    p2 = 1
                else:
                    p0 = 2
                    p1 = 0
                    p2 = 1
        else:
            if _prime_descriptor_compare(degrees, generators, n, 0, 2, diagnostic) <= 0:
                p0 = 1
                p1 = 0
            elif (
                _prime_descriptor_compare(degrees, generators, n, 1, 2, diagnostic) <= 0
            ):
                p0 = 1
                p1 = 2
                p2 = 0
            else:
                p0 = 2
                p1 = 1
                p2 = 0
        order[0] = p0
        order[1] = p1
        order[2] = p2
    elif count == 4:
        a0 = 0
        a1 = 1
        b0 = 2
        b1 = 3
        if _prime_descriptor_compare(degrees, generators, n, 0, 1, diagnostic) > 0:
            a0 = 1
            a1 = 0
        if _prime_descriptor_compare(degrees, generators, n, 2, 3, diagnostic) > 0:
            b0 = 3
            b1 = 2
        ix = 0
        iy = 0
        output = 0
        while ix < 2 and iy < 2:
            a = a0
            b = b0
            if ix == 1:
                a = a1
            if iy == 1:
                b = b1
            if _prime_descriptor_compare(degrees, generators, n, a, b, diagnostic) <= 0:
                order[output] = a
                ix += 1
            else:
                order[output] = b
                iy += 1
            output += 1
        while ix < 2:
            a = a0
            if ix == 1:
                a = a1
            order[output] = a
            output += 1
            ix += 1
        while iy < 2:
            b = b0
            if iy == 1:
                b = b1
            order[output] = b
            output += 1
            iy += 1
    return count

"""PARI 2.17.4 Fincke_Pohst_ideal post-factorization relation assembly.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Successful factorgen output and the exact candidate are prepared inputs.
"""

from math import gcd

from sagejs.native import IntegerBuffer, native

from .relation_cache import pari_prepared_set_fact


@native
def pari_add_factor_entry(
    ideal: int, power: int, indices: IntegerBuffer, exponents: IntegerBuffer, count: int
) -> int:
    """Preserve add_to_fact's first-match accumulation or final append."""
    for i in range(count):
        if indices[i] == ideal:
            exponents[i] += power
            return count
    if count >= len(indices) or count >= len(exponents):
        raise ValueError("factor entry capacity exhausted")
    indices[count] = ideal
    exponents[count] = power
    return count + 1


@native
def pari_content_relation_update(
    ideal: int,
    content: int,
    primes: IntegerBuffer,
    ramification: IntegerBuffer,
    relation: IntegerBuffer,
) -> int:
    """Apply fact_update's ramification-weighted rational-prime valuation."""
    if ideal < 1 or ideal > len(primes) or content < 1:
        raise ValueError("invalid content relation update")
    prime = primes[ideal - 1]
    if prime < 2:
        raise ValueError("invalid rational prime")
    value = content
    valuation = 0
    while value % prime == 0:
        value //= prime
        valuation += 1
    if valuation != 0:
        relation[ideal - 1] -= ramification[ideal - 1] * valuation
    return 0


@native
def pari_prepared_smooth_relation(
    jid: int,
    jid0: int,
    e0: int,
    indices: IntegerBuffer,
    exponents: IntegerBuffer,
    count: int,
    subfactor: IntegerBuffer,
    extra: IntegerBuffer,
    extra_count: int,
    primes: IntegerBuffer,
    ramification: IntegerBuffer,
    candidate: IntegerBuffer,
    relation: IntegerBuffer,
) -> tuple[int, int, int]:
    """Return factor count, untouched nz hint, and positive candidate content.

    Mutate the factor list, construct R, then divide the candidate by content
    and adjust R. The second extra-factor pass skips ideals already in fact.
    This does not perform norm factoring, cache insertion or automorphisms.
    """
    if len(primes) != len(relation) or len(ramification) != len(primes):
        raise ValueError("invalid smooth relation layout")
    if count < 0 or count > len(indices) or count > len(exponents):
        raise ValueError("invalid smooth factor count")
    if jid < 1 or jid > len(primes) or jid0 < 0 or jid0 > len(primes) or e0 < 0:
        raise ValueError("invalid distinguished ideal")
    if jid == jid0:
        count = pari_add_factor_entry(jid, 1 + e0, indices, exponents, count)
    else:
        count = pari_add_factor_entry(jid, 1, indices, exponents, count)
        if jid0 != 0:
            count = pari_add_factor_entry(jid0, e0, indices, exponents, count)
    nz = pari_prepared_set_fact(
        indices, exponents, count, subfactor, extra, extra_count, relation
    )
    content = 0
    for i in range(len(candidate)):
        content = gcd(content, candidate[i])
    if content == 0:
        raise ValueError("zero smooth candidate")
    if content != 1:
        for i in range(len(candidate)):
            candidate[i] //= content
        for entry in range(count):
            pari_content_relation_update(
                indices[entry], content, primes, ramification, relation
            )
        for entry in range(extra_count):
            if extra[entry] != 0:
                ideal = subfactor[entry]
                found = 0
                position = 0
                while position < count:
                    if indices[position] == ideal:
                        found = 1
                        break
                    position += 1
                if found == 0:
                    pari_content_relation_update(
                        ideal, content, primes, ramification, relation
                    )
    return count, nz, content

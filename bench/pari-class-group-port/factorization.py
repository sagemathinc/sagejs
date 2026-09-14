"""PARI 2.17.4 word-factorization front end, explicit unresolved cofactor.

Derived from ifactor1.c factoru_sign/tridiv_boundu and gen2.c u_lvalrem_stop.
Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Prime catalog and cumulative prime products are prepared arithmetic constants,
not factorizations of the requested input. Remaining primality/search paths
are not silently replaced. A residual other than 1 means incomplete.
"""

from math import gcd, sqrt
from sagejs.native import IntegerBuffer, native


@native
def pari_trial_bound_word(n: int) -> int:
    """64-bit tridiv_boundu, including its unreachable repeated 56 cutoff."""
    exponent = n.bit_length() - 1
    if exponent < 30:
        return 1 << 12
    if exponent < 34:
        return 1 << 13
    if exponent < 37:
        return 1 << 14
    if exponent < 42:
        return 1 << 15
    if exponent < 47:
        return 1 << 16
    if exponent < 56:
        return 1 << 17
    if exponent < 56:
        return 1 << 18
    if exponent < 62:
        return 1 << 19
    return 1 << 18


@native
def pari_catalog_contains(primes: IntegerBuffer, n: int) -> int:
    """Prepared sorted prime-table membership, binary-search leaf."""
    low = 0
    high = int(len(primes))
    while low < high:
        middle = (low + high) // 2
        if primes[middle] < n:
            low = middle + 1
        else:
            high = middle
    if low < len(primes):
        if primes[low] == n:
            return 1
    return 0


@native
def pari_word_factor_front(
    n: int,
    primes: IntegerBuffer,
    products: IntegerBuffer,
    factorlimit: int,
    out_primes: IntegerBuffer,
    out_exponents: IntegerBuffer,
    count: int,
    fast: int,
) -> tuple[int, int]:
    """Return count and unresolved cofactor after translated factoru stages.

    Only all=0 and the ordinary/fast-disabled hints are represented. An
    unresolved cofactor is a checkpoint, not PARI's completed return value.
    Scalar v2 and square-root leaves use Python-expressible equivalents.
    """
    if n < 1 or n.bit_length() > 64 or len(primes) == 0 or count < 0:
        raise ValueError("word factor front input outside prepared contract")
    if n == 1:
        return count, 1
    exponent = 0
    while n % 2 == 0:
        n //= 2
        exponent += 1
    if exponent != 0:
        out_primes[count] = 2
        out_exponents[count] = exponent
        count += 1
        if n == 1:
            return count, 1
    maxp = primes[len(primes) - 1]
    if n <= maxp and pari_catalog_contains(primes, n) != 0:
        out_primes[count] = n
        out_exponents[count] = 1
        return count + 1, 1
    # Within uint64, rounded binary64 sqrt differs from floor by at most one;
    # the exact multiply fixes it. Native round(sqrt) uses exact integer IR.
    limit = round(sqrt(n))
    if limit * limit > n:
        limit -= 1
    bound = pari_trial_bound_word(n)
    if bound < limit:
        limit = bound
    if fast != 0 and limit >= 128:
        b = limit.bit_length() - 1 - 6
        if b > len(products):
            b = int(len(products))
        if b == 0:
            raise ValueError("missing prepared prime products")
        nr = gcd(n, products[b - 1] % n)
        if nr != 1:
            start = count
            end, residual = pari_word_factor_front(
                nr, primes, products, factorlimit, out_primes, out_exponents, count, 0
            )
            # Only consume factors actually obtained by the recursive stage.
            # The caller still owns the full residual, including powers.
            for j in range(start, end):
                p = out_primes[j]
                exponent = 0
                while n % p == 0:
                    n //= p
                    exponent += 1
                out_exponents[j] = exponent
            count = end
            if residual != 1:
                return count, n
            if n == 1:
                return count, 1
            if n <= maxp and pari_catalog_contains(primes, n) != 0:
                out_primes[count] = n
                out_exponents[count] = 1
                return count + 1, 1
        # The second prime-iterator pass or primality/factor-search frontier.
        # Never return the residual as a prime without translating that branch.
        return count, n
    for j in range(1, len(primes)):
        p = primes[j]
        if p > limit:
            return count, n
        if p == 673:
            # uisprime_661 is a separate, still-untranslated decision here.
            return count, n
        quotient = n // p
        remainder = n % p
        exponent = 0
        while remainder == 0:
            exponent += 1
            n = quotient
            quotient = n // p
            remainder = n % p
        if exponent != 0:
            out_primes[count] = p
            out_exponents[count] = exponent
            count += 1
        if quotient <= p:
            if n != 1:
                out_primes[count] = n
                out_exponents[count] = 1
                count += 1
            return count, 1
    return count, n

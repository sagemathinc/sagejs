"""PARI 2.17.4 word-factorization front end, explicit unresolved cofactor.

Derived from ifactor1.c factoru_sign/tridiv_boundu, gen2.c u_lvalrem_stop,
prime.c word primality tests, and arith1.c krouu_s.
Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Prime catalog and cumulative prime products are prepared arithmetic constants,
not factorizations of the requested input. Remaining prime-generation/search paths
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
def pari_word_modpow(a: int, exponent: int, n: int) -> int:
    """Arithmetic leaf substitution for Fl_powu: binary exact modular power.

    This does not reproduce PARI's word reduction kernel or its cost.
    """
    result = 1
    a %= n
    while exponent != 0:
        if exponent % 2 != 0:
            result = result * a % n
        exponent //= 2
        if exponent != 0:
            a = a * a % n
    return result


@native
def pari_word_psp(a: int, n: int) -> int:
    """prime.c _uispsp/uispsp decisions; exact modular arithmetic leaves."""
    a %= n
    if a == 0:
        return 1
    odd_part = n - 1
    exponent = 0
    while odd_part % 2 == 0:
        odd_part //= 2
        exponent += 1
    c = pari_word_modpow(a, odd_part, n)
    if c == 1 or c == n - 1:
        return 1
    for j in range(1, exponent):
        c = c * c % n
        if c == n - 1:
            return 1
    return 0


@native
def pari_word_kronecker_odd(x: int, y: int) -> int:
    """arith1.c krouu_s with initial sign one and positive odd y."""
    sign = 1
    while x != 0:
        exponent = 0
        while x % 2 == 0:
            x //= 2
            exponent += 1
        if exponent % 2 != 0 and (y % 8 == 3 or y % 8 == 5):
            sign = -sign
        if x % 4 == 3 and y % 4 == 3:
            sign = -sign
        z = y % x
        y = x
        x = z
    if y == 1:
        return sign
    return 0


@native
def pari_word_lucas(n: int) -> int:
    """prime.c get_disc/u_LucasMod_pre/uislucaspsp_pre decisions."""
    if n == 18446744073709551615:
        return 0
    b = 3
    i = 0
    while True:
        discriminant = b * b - 4
        if pari_word_kronecker_odd(n % discriminant, discriminant) < 0:
            break
        if i == 64:
            root = round(sqrt(n))
            if root * root == n:
                return 0
        b += 2
        i += 1
    m = n + 1
    exponent = 0
    while m % 2 == 0:
        m //= 2
        exponent += 1
    value = b
    next_value = b * b - 2
    bit = m.bit_length() - 2
    while bit >= 0:
        if (m >> bit) % 2 != 0:
            value = (value * next_value - b) % n
            next_value = (next_value * next_value - 2) % n
        else:
            next_value = (value * next_value - b) % n
            value = (value * value - 2) % n
        bit -= 1
    if value == 2 or value == n - 2:
        return 1
    for j in range(1, exponent):
        if value == 0:
            return 1
        value = (value * value - 2) % n
        if value == 2:
            return 0
    return 0


@native
def pari_word_prime_core(n: int) -> int:
    """64-bit prime.c _uisprime, assuming its caller's small-prime checks."""
    if n < 341531:
        return pari_word_psp(9345883071009581737, n)
    if n < 1050535501:
        if pari_word_psp(336781006125, n) == 0:
            return 0
        return pari_word_psp(9639812373923155, n)
    if n < 350269456337:
        if pari_word_psp(4230279247111683200, n) == 0:
            return 0
        if pari_word_psp(14694767155120705706, n) == 0:
            return 0
        return pari_word_psp(16641139526367750375, n)
    if pari_word_psp(2, n) == 0:
        return 0
    return pari_word_lucas(n)


@native
def pari_word_prime(
    n: int, primes: IntegerBuffer, prime_limit: int, no_small: int
) -> int:
    """uisprime or uisprime_661; no_small requires no divisor <= 661.

    Prepared prime catalog must contain all primes through prime_limit,
    which is the upstream maxprimelim value, not just the final prime.
    """
    if n < 0 or n.bit_length() > 64 or len(primes) == 0:
        raise ValueError("word primality input outside prepared contract")
    if n % 2 == 0:
        if n == 2:
            return 1
        return 0
    if n <= prime_limit:
        return pari_catalog_contains(primes, n)
    if no_small != 0:
        if n < 1016801:
            if n < 452929:
                return 1
            return pari_word_psp(2, n)
    else:
        if n % 3 == 0 or n % 5 == 0 or n % 7 == 0 or n % 11 == 0:
            return 0
        if n % 13 == 0 or n % 17 == 0 or n % 19 == 0 or n % 23 == 0:
            return 0
        if n % 29 == 0 or n % 31 == 0 or n % 37 == 0 or n % 41 == 0:
            return 0
    return pari_word_prime_core(n)


@native
def pari_complete_word_from_catalog(
    n: int,
    primes: IntegerBuffer,
    prime_limit: int,
    out_primes: IntegerBuffer,
    out_exponents: IntegerBuffer,
    count: int,
) -> tuple[int, int]:
    """Complete a cofactor only when the prepared catalog proves enough.

    This is an algorithmic bridge for the still-unported `ifac_factoru` stage,
    not a translation of its Pollard--Brent implementation.  The prepared
    catalog contract says that `primes` contains every prime through
    `prime_limit`.  Trial division is therefore conclusive only when the exact
    square root of the cofactor is within that authenticated interval.
    """
    if n < 1 or count < 0 or prime_limit < 2 or len(primes) == 0:
        raise ValueError("catalog completion input outside prepared contract")
    limit = round(sqrt(n))
    if limit * limit > n:
        limit -= 1
    if limit > prime_limit:
        return count, n
    if primes[len(primes) - 1] < limit:
        raise ValueError("prepared prime catalog ends before required bound")
    j = 1
    while j < len(primes):
        p = primes[j]
        if p > limit:
            break
        exponent = 0
        while n % p == 0:
            n //= p
            exponent += 1
        if exponent != 0:
            if count >= len(out_primes) or count >= len(out_exponents):
                raise ValueError("factor output capacity exhausted")
            if count != 0 and out_primes[count - 1] >= p:
                raise ValueError("catalog completion would break factor order")
            out_primes[count] = p
            out_exponents[count] = exponent
            count += 1
            if n == 1:
                return count, 1
            limit = round(sqrt(n))
            if limit * limit > n:
                limit -= 1
        j += 1
    if n != 1:
        if count >= len(out_primes) or count >= len(out_exponents):
            raise ValueError("factor output capacity exhausted")
        if count != 0 and out_primes[count - 1] >= n:
            raise ValueError("catalog completion would break factor order")
        out_primes[count] = n
        out_exponents[count] = 1
        count += 1
    return count, 1


@native
def pari_word_factor_front(
    n: int,
    primes: IntegerBuffer,
    products: IntegerBuffer,
    factorlimit: int,
    prime_limit: int,
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
                nr,
                primes,
                products,
                factorlimit,
                prime_limit,
                out_primes,
                out_exponents,
                count,
                0,
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
                return pari_complete_word_from_catalog(
                    n,
                    primes,
                    prime_limit,
                    out_primes,
                    out_exponents,
                    count,
                )
            if n == 1:
                return count, 1
            if n <= maxp and pari_catalog_contains(primes, n) != 0:
                out_primes[count] = n
                out_exponents[count] = 1
                return count + 1, 1
        # PARI hands this range to `ifac_factoru`.  Use the authenticated
        # catalog bridge when it is conclusive, or preserve the cofactor.
        if limit > factorlimit:
            return pari_complete_word_from_catalog(
                n,
                primes,
                prime_limit,
                out_primes,
                out_exponents,
                count,
            )
        no_small = 0
        if limit >= 661:
            no_small = 1
        if pari_word_prime(n, primes, prime_limit, no_small) != 0:
            out_primes[count] = n
            out_exponents[count] = 1
            return count + 1, 1
        # The prepared catalog can replace the acceleration stage only when it
        # reaches the residual's exact square root.  Otherwise retain the
        # unresolved cofactor as an explicit fail-closed boundary.
        return pari_complete_word_from_catalog(
            n,
            primes,
            prime_limit,
            out_primes,
            out_exponents,
            count,
        )
    old_count = -1
    j = 1
    while j < len(primes):
        p = primes[j]
        if p > limit:
            break
        if p == 673:
            if pari_word_prime(n, primes, prime_limit, 1) != 0:
                out_primes[count] = n
                out_exponents[count] = 1
                return count + 1, 1
            old_count = count
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
        j += 1
    # Prime generation beyond the prepared catalog remains an explicit boundary.
    if limit > prime_limit:
        return count, n
    if old_count != count:
        no_small = 0
        if limit >= 661:
            no_small = 1
        if pari_word_prime(n, primes, prime_limit, no_small) != 0:
            out_primes[count] = n
            out_exponents[count] = 1
            return count + 1, 1
    return count, n

"""PARI 2.17.4 modular resultant valuation for cubic/quartic Kummer work.

Copyright (C) The PARI group; GPL-2.0-or-later, without warranty.
Translation of base2.c ZpX_resultant_val and Zlx_sylvester_echelon,
and hnf_snf.c zlm_echelon (square matrices, early_abort=1).
Primehood, monic f, and disjoint owners are caller preconditions.
The explicit word-modulus corridor is a representation frontier, not a bound
on the mathematical answer. Inputs are ascending polynomial coefficients.
"""

from sagejs.native import IntegerBuffer, native
from .relation_cache import pari_word_mod_inverse


@native
def pari_kummer_resultant_valuation(
    f: IntegerBuffer,
    g: IntegerBuffer,
    n: int,
    degree_g: int,
    p: int,
    limit: int,
    work: IntegerBuffer,
    trace: IntegerBuffer,
) -> int:
    """Return source valuation; trace triples are (m, actual modulus, value).

    trace[0] counts attempts; value=-1 denotes precision failure. Workspace
    contains the mutable n-square matrix then n remainder coefficients.
    Output scratch may be partial on a later precision frontier.
    """
    if n < 3 or n > 4 or degree_g < 0 or degree_g >= n:
        raise ValueError("Kummer resultant degree frontier")
    if p < 2 or p > 3037000493 or limit < 1 or limit > 64:
        raise ValueError("Kummer resultant precision frontier")
    if (
        len(f) < n + 1
        or len(g) < degree_g + 1
        or len(work) < n * n + n
        or len(trace) < 25
    ):
        raise ValueError("short Kummer resultant storage")
    if f[n] != 1:
        raise ValueError("Kummer resultant monic frontier")
    m = 3
    if p == 2:
        m = 16
    elif p == 3:
        m = 10
    elif p == 5:
        m = 6
    elif p == 7:
        m = 5
    elif p == 11 or p == 13:
        m = 4
    elif p >= 41:
        m = 2
    q = 0
    trace[0] = 0
    while True:
        if m > limit:
            m = limit
        if q == 0:
            q = 1
            for i in range(m):
                q = q * p
                if q > 3037000493:
                    raise ValueError("Kummer resultant word modulus frontier")
        else:
            q = q * q
            if q > 3037000493:
                raise ValueError("Kummer resultant word modulus frontier")
        h = n * n
        for i in range(n):
            work[h + i] = 0
            if i <= degree_g:
                work[h + i] = g[i] % q
        for j in range(n):
            for i in range(n):
                work[j * n + i] = work[h + i]
            if j + 1 < n:
                leading = work[h + n - 1]
                for i in range(n - 1, 0, -1):
                    work[h + i] = (work[h + i - 1] - leading * (f[i] % q)) % q
                work[h] = (-leading * (f[0] % q)) % q
        value = 0
        for i in range(n - 1, -1, -1):
            kmin = -1
            vmin = 65
            unit = 0
            pivot_power = 1
            for k in range(i + 1):
                u = work[k * n + i]
                if u != 0:
                    v = 0
                    power = 1
                    while u % p == 0:
                        u = u // p
                        power = power * p
                        v += 1
                    if v < vmin:
                        vmin = v
                        kmin = k
                        unit = u
                        pivot_power = power
                        if v == 0:
                            break
            if kmin < 0:
                value = -1
                break
            if kmin != i:
                for row in range(n):
                    temp = work[i * n + row]
                    work[i * n + row] = work[kmin * n + row]
                    work[kmin * n + row] = temp
            reduced_q = q // pivot_power
            unit = unit % reduced_q
            if unit != 1:
                inverse = pari_word_mod_inverse(unit, reduced_q)
                for row in range(i):
                    work[i * n + row] = work[i * n + row] * inverse % q
            work[i * n + i] = pivot_power
            for j in range(i - 1, -1, -1):
                a = work[j * n + i]
                if a != 0:
                    t = (-(a // pivot_power)) % reduced_q
                    for row in range(n):
                        work[j * n + row] = (
                            work[j * n + row] + t * work[i * n + row]
                        ) % q
            value += vmin
        count = trace[0]
        trace[1 + 3 * count] = m
        trace[2 + 3 * count] = q
        trace[3 + 3 * count] = value
        trace[0] = count + 1
        if value >= 0:
            return value
        if m == limit:
            return limit
        m *= 2

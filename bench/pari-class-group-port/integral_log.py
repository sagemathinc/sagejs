"""PARI 2.17.4 `ispower.c:logintall` for positive integral inputs.

Copyright (C) 2000 The PARI group. GPL-2.0-or-later, without warranty.
Preserve the word, naive, and binary-splitting branches. Exact Python products
with an explicit overflow comparison replace the word multiplication sentinel.
Caller-owned scratch replaces PARI's temporary vector of powers.
"""

from sagejs.native import IntegerBuffer, native


@native
def pari_integral_log(bound: int, base: int, powers: IntegerBuffer) -> int:
    """Return floor(log_base(bound)), following logintall's integer branches."""
    if bound < 1 or base < 2:
        raise ValueError("integral logarithm requires positive bound and base >= 2")
    eb = bound.bit_length() - 1
    if bound < 18446744073709551616:
        if base >= 18446744073709551616:
            return 0
        if base == 2:
            return eb
        r = base
        exponent = 1
        while True:
            if r >= bound:
                if r != bound:
                    exponent -= 1
                return exponent
            r *= base
            if r >= 18446744073709551616:
                return exponent
            exponent += 1
    if base == 2:
        return eb
    ey = base.bit_length() - 1
    maximum = eb // ey
    if maximum <= 13:
        r = base
        exponent = 1
        while True:
            if r >= bound:
                if r != bound:
                    exponent -= 1
                return exponent
            r *= base
            exponent += 1
    # Equivalent integer size bound, without upstream's floating log2.
    if len(powers) < eb.bit_length() + 1:
        raise ValueError("insufficient integral logarithm scratch")
    powers[0] = base
    i = 0
    q = base
    while True:
        r = powers[i]
        if r == bound:
            return 1 << i
        if r > bound:
            i -= 1
            break
        q = r
        if (1 << (i + 1)) > maximum:
            break
        i += 1
        powers[i] = q * q
    exponent = 1 << i
    while True:
        i -= 1
        if i < 0:
            break
        r = q * powers[i]
        if r <= bound:
            exponent += 1 << i
            q = r
            if r == bound:
                break
    return exponent

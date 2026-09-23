"""PARI 2.17.4 binary flag-zero Cantor factorization, degrees two to four.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Unlike degree-only factorization, source flag zero uses squarefree/Shoup DDF
and randomized EDF. Packed low-bit-first polynomials preserve its operations.
"""

from sagejs.native import IntegerBuffer, native
from .f2x_small import (
    _f2x_xor,
    pari_f2x_small_degree,
    pari_f2x_small_gcd,
    pari_f2x_small_deriv,
    pari_f2x_small_div,
    pari_f2x_small_sqrt,
    pari_f2x_small_sqr,
    pari_f2x_small_rem,
)
from .flx_small_factor import pari_flx_small_sort_factor
from .pari_random import pari_random_word


@native
def pari_f2x_small_polynomial_factor(
    polynomial: int,
    factors: IntegerBuffer,
    exponents: IntegerBuffer,
    workspace: IntegerBuffer,
    random_state: IntegerBuffer,
    diagnostic: IntegerBuffer,
) -> int:
    """Return packed factor polynomials/exponents in exact source sort order.

    All owners disjoint. Workspace24 holds four squarefree layers, four DDF
    blocks, then twelve sorting words (four reserved). RNG is resident source
    state66; diagnostic[0] counts random_F2x calls. Active outputs only; shape
    errors are atomic, arithmetic failure can alter scratch/RNG. No RNG cap.
    """
    if polynomial < 4 or polynomial >= 32:
        raise ValueError("binary polynomial factor degree frontier")
    degree = pari_f2x_small_degree(polynomial)
    if (
        len(factors) < degree
        or len(exponents) < degree
        or len(workspace) < 24
        or len(random_state) < 66
        or len(diagnostic) < 1
    ):
        raise ValueError("short binary polynomial factor storage")
    diagnostic[0] = 0
    if degree == 2:
        if polynomial == 7:
            factors[0] = polynomial
            exponents[0] = 1
            return 1
        if polynomial == 6:
            factors[0] = 2
            factors[1] = 3
            exponents[0] = 1
            exponents[1] = 1
            return 2
        factors[0] = 2 + polynomial % 2
        exponents[0] = 2
        return 1
    for i in range(4):
        workspace[i] = 1
    f = polynomial
    multiplicity = 1
    while True:
        r = pari_f2x_small_gcd(f, pari_f2x_small_deriv(f))
        if pari_f2x_small_degree(r) == 0:
            workspace[multiplicity - 1] = f
            break
        t = pari_f2x_small_div(f, r)
        if pari_f2x_small_degree(t) > 0:
            j = 1
            while True:
                v = pari_f2x_small_gcd(r, t)
                tv = pari_f2x_small_div(t, v)
                if pari_f2x_small_degree(tv) > 0:
                    workspace[j * multiplicity - 1] = tv
                if pari_f2x_small_degree(v) <= 0:
                    break
                r = pari_f2x_small_div(r, v)
                t = v
                j += 1
            if pari_f2x_small_degree(r) == 0:
                break
        f = pari_f2x_small_sqrt(r)
        multiplicity *= 2
    last = degree
    while last > 0 and pari_f2x_small_degree(workspace[last - 1]) == 0:
        last -= 1
    count = 0
    for layer in range(last):
        component = workspace[layer]
        n = pari_f2x_small_degree(component)
        if n == 0:
            continue
        xp = pari_f2x_small_rem(pari_f2x_small_sqr(2), component)
        for i in range(n):
            workspace[4 + i] = 1
        if n == 1:
            workspace[4] = component
        else:
            z = xp
            tr = component
            for j in range(1, n // 2 + 1):
                u = pari_f2x_small_gcd(tr, _f2x_xor(z, 2))
                if pari_f2x_small_degree(u) != 0:
                    workspace[4 + j - 1] = u
                    tr = pari_f2x_small_div(tr, u)
                if pari_f2x_small_degree(tr) == 0:
                    break
                z = pari_f2x_small_rem(pari_f2x_small_sqr(z), tr)
            if pari_f2x_small_degree(tr) != 0:
                workspace[4 + pari_f2x_small_degree(tr) - 1] = tr
        for i in range(1, n + 1):
            block = workspace[4 + i - 1]
            ni = pari_f2x_small_degree(block)
            if ni == 0:
                continue
            if ni == i:
                factors[count] = block
                exponents[count] = layer + 1
                count += 1
                continue
            # In F2, the only repeated-degree squarefree block of total
            # degree<=4 is the two linear factors x and x+1. Source still
            # enters random EDF; its two recursive leaves have r==1.
            if i != 1 or ni != 2:
                raise ValueError("binary small EDF frontier")
            xp_reduced = pari_f2x_small_rem(xp, block)
            divisor = 0  # Definite-assignment aid; every loop exit replaces it.
            while True:
                g = pari_random_word(random_state) % 4
                diagnostic[0] += 1
                # F2xq_frobtrace for d=1 returns g, without squaring.
                if g == 0:
                    continue
                divisor = pari_f2x_small_gcd(g, block)
                dd = pari_f2x_small_degree(divisor)
                if dd > 0 and dd < ni:
                    break
            quotient = pari_f2x_small_div(block, divisor)
            factors[count] = divisor
            factors[count + 1] = quotient
            exponents[count] = layer + 1
            exponents[count + 1] = layer + 1
            count += 2
    # F2x objects here have one word: gen_cmp_RgX/cmpGuGu compares that
    # packed word. Reuse the exact small stable sorter with numeric keys.
    pari_flx_small_sort_factor(workspace, 8, count, factors, exponents)
    return count

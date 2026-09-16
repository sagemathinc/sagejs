"""PARI 2.17.4 odd-prime flag-zero factor output, degrees at most four.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Translate Flx_factor_i/Flx_factor_Cantor/Flx_factor_Shoup, retaining actual
factor coefficients, squarefree layers, DDF/EDF selection and source sorting.
Prepared canonical monic input and resident source RNG are caller-owned.
"""

from sagejs.native import IntegerBuffer, native
from .flx_small import pari_flx_copy, pari_flx_normalize
from .flx_small_factor import pari_flx_small_squarefree, pari_flx_small_ddf_polynomials
from .small_prime_polynomial_roots import _roots_quad
from .flx_small_edf import pari_flx_small_edf


@native
def _factor_compare(w: IntegerBuffer, out: int, degrees: int, a: int, b: int) -> int:
    if w[degrees + a] > w[degrees + b]:
        return 1
    if w[degrees + a] < w[degrees + b]:
        return -1
    for i in range(w[degrees + a], -1, -1):
        if w[out + 9 * a + i] > w[out + 9 * b + i]:
            return 1
        if w[out + 9 * a + i] < w[out + 9 * b + i]:
            return -1
    return 0


@native
def _factor_sort(
    w: IntegerBuffer, count: int, out: int, degrees: int, exponents: int, scratch: int
) -> int:
    """gen_sortspec's <=4 stable comparison schedule, polynomial comparator."""
    order = scratch + 44
    for i in range(count):
        pari_flx_copy(w, out + 9 * i, w[degrees + i], scratch + 9 * i)
        w[scratch + 36 + i] = w[degrees + i]
        w[scratch + 40 + i] = w[exponents + i]
    if count == 1:
        _factor_compare(w, out, degrees, 0, 0)
        w[order] = 0
    elif count == 2:
        if _factor_compare(w, out, degrees, 0, 1) <= 0:
            w[order] = 0
            w[order + 1] = 1
        else:
            w[order] = 1
            w[order + 1] = 0
    elif count == 3:
        p0 = 0
        p1 = 1
        p2 = 2
        if _factor_compare(w, out, degrees, 0, 1) <= 0:
            if _factor_compare(w, out, degrees, 1, 2) > 0:
                if _factor_compare(w, out, degrees, 0, 2) <= 0:
                    p1, p2 = 2, 1
                else:
                    p0, p1, p2 = 2, 0, 1
        elif _factor_compare(w, out, degrees, 0, 2) <= 0:
            p0, p1 = 1, 0
        elif _factor_compare(w, out, degrees, 1, 2) <= 0:
            p0, p1, p2 = 1, 2, 0
        else:
            p0, p1, p2 = 2, 1, 0
        w[order] = p0
        w[order + 1] = p1
        w[order + 2] = p2
    elif count == 4:
        a0, a1 = 0, 1
        b0, b1 = 2, 3
        if _factor_compare(w, out, degrees, 0, 1) > 0:
            a0, a1 = 1, 0
        if _factor_compare(w, out, degrees, 2, 3) > 0:
            b0, b1 = 3, 2
        ix, iy, cursor = 0, 0, 0
        while ix < 2 and iy < 2:
            a, b = a0, b0
            if ix == 1:
                a = a1
            if iy == 1:
                b = b1
            if _factor_compare(w, out, degrees, a, b) <= 0:
                w[order + cursor] = a
                ix += 1
            else:
                w[order + cursor] = b
                iy += 1
            cursor += 1
        while ix < 2:
            a = a0
            if ix == 1:
                a = a1
            w[order + cursor] = a
            cursor += 1
            ix += 1
        while iy < 2:
            b = b0
            if iy == 1:
                b = b1
            w[order + cursor] = b
            cursor += 1
            iy += 1
    for i in range(count):
        j = w[order + i]
        w[degrees + i] = w[scratch + 36 + j]
        w[exponents + i] = w[scratch + 40 + j]
        pari_flx_copy(w, scratch + 9 * j, w[degrees + i], out + 9 * i)
    return count


@native
def pari_flx_small_polynomial_factor(
    w: IntegerBuffer,
    a: int,
    degree: int,
    p: int,
    out: int,
    degrees: int,
    exponents: int,
    scratch: int,
    random_state: IntegerBuffer,
    diagnostic: IntegerBuffer,
    minpoly_diagnostic: IntegerBuffer,
) -> int:
    """Flag-zero factorization, with four nine-slot outputs and metadata.

    All input/output/metadata/scratch spans are disjoint; scratch16941.
    Canonical monic input, degree0..4, odd prime, initialized RNG66. Diagnostic
    is delegated to each EDF call, not an accumulated whole-factor counter.
    Source RNG state is never reset between squarefree/DDF components.
    """
    if degree < 0 or degree > 4 or p < 3 or p > 3037000493 or p % 2 == 0:
        raise ValueError("odd polynomial factor frontier")
    if (
        a < 0
        or out < 0
        or degrees < 0
        or exponents < 0
        or scratch < 0
        or len(w) < a + 9
        or len(w) < out + 36
        or len(w) < degrees + 4
        or len(w) < exponents + 4
        or len(w) < scratch + 16941
        or len(random_state) < 66
        or len(diagnostic) < 3
        or len(minpoly_diagnostic) < 1
    ):
        raise ValueError("short odd polynomial factor storage")
    if w[a + degree] != 1:
        raise ValueError("odd polynomial factor monic frontier")
    for i in range(degree):
        if w[a + i] < 0 or w[a + i] >= p:
            raise ValueError("odd polynomial factor canonical input required")
    # Nonoverlap is a low-level packed-entry caller precondition.
    if degree == 0:
        return 0
    if degree == 1:
        pari_flx_copy(w, a, 1, out)
        w[degrees] = 1
        w[exponents] = 1
        return 1
    if degree == 2:
        r = _roots_quad(w, a, p, 1)
        if r == p:
            pari_flx_copy(w, a, 2, out)
            w[degrees] = 2
            w[exponents] = 1
            return 1
        s = w[a + 1] + r
        if s >= p:
            s -= p
        if s != 0:
            s = p - s
        if r != 0:
            r = p - r
        if s != 0:
            s = p - s
        if s < r:
            r, s = s, r
        for i in range(9):
            w[out + i] = 0
        w[out] = r
        w[out + 1] = 1
        w[degrees] = 1
        w[exponents] = 1
        if s == r:
            w[exponents] = 2
            return 1
        for i in range(9):
            w[out + 9 + i] = 0
        w[out + 9] = s
        w[out + 10] = 1
        w[degrees + 1] = 1
        w[exponents + 1] = 1
        return 2
    f = scratch
    layers = scratch + 9
    layer_degrees = scratch + 45
    components = scratch + 139
    component_degrees = scratch + 175
    ddfwork = scratch + 179
    normalized = scratch + 451
    xp = scratch + 460
    edfout = scratch + 469
    edfdegrees = scratch + 505
    edfwork = scratch + 509
    sortwork = scratch + 16893
    pari_flx_copy(w, a, degree, f)
    last = pari_flx_small_squarefree(
        w, f, degree, p, layers, layer_degrees, scratch + 49
    )
    count = 0
    for layer in range(last):
        dt = w[layer_degrees + layer]
        if dt == 0:
            continue
        pari_flx_small_ddf_polynomials(
            w, layers + 9 * layer, dt, p, components, component_degrees, ddfwork
        )
        dxp = dt - 1
        while dxp >= 0 and w[ddfwork + 9 + dxp] == 0:
            dxp -= 1
        pari_flx_copy(w, ddfwork + 9, dxp, xp)
        for i in range(1, dt + 1):
            ni = w[component_degrees + i - 1]
            if ni == 0:
                continue
            pari_flx_normalize(w, components + 9 * (i - 1), ni, p, normalized)
            if ni == i:
                pari_flx_copy(w, normalized, ni, out + 9 * count)
                w[degrees + count] = ni
                w[exponents + count] = layer + 1
                count += 1
            else:
                number = pari_flx_small_edf(
                    w,
                    normalized,
                    ni,
                    xp,
                    dxp,
                    i,
                    p,
                    edfout,
                    edfdegrees,
                    edfwork,
                    random_state,
                    diagnostic,
                    minpoly_diagnostic,
                )
                for j in range(number):
                    pari_flx_copy(w, edfout + 9 * j, w[edfdegrees + j], out + 9 * count)
                    w[degrees + count] = w[edfdegrees + j]
                    w[exponents + count] = layer + 1
                    count += 1
    return _factor_sort(w, count, out, degrees, exponents, sortwork)

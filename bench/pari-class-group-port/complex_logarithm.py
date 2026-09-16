"""PARI 2.17.4 low-precision `glog` for two explicit real components.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
The component precisions and zero error exponents are part of the input.
"""

from sagejs.native import IntegerBuffer, native

from .complex_argument import pari_real_components_argument
from .pi_constant import pari_pi_constant
from .real_logarithm import pari_real_logarithm_multiword
from .short_product import pari_short_square, pari_signed_real_sum


@native
def pari_real_pair_precision(
    mx: int, px: int, ex: int, my: int, py: int, ey: int
) -> int:
    """The two-t_REAL branch of gen3.c:precCOMPLEX, in mantissa bits."""
    difference = ey - ex
    if mx == 0:
        if my == 0:
            error = ex
            if ey < error:
                error = ey
            if error < 0:
                return ((-error + 63) // 64) * 64
            return 64
        if difference <= 0:
            if ex < 0:
                return ((-ex + 63) // 64) * 64
            return 64
        result = ((difference + 63) // 64) * 64
        if result > py:
            result = py
        return result
    if my == 0:
        if difference >= 0:
            if ey < 0:
                return ((-ey + 63) // 64) * 64
            return 64
        result = ((-difference + 63) // 64) * 64
        if result > px:
            result = px
        return result
    if difference < 0:
        low_precision = py
        high_precision = px
        difference = -difference
    else:
        low_precision = px
        high_precision = py
    if difference != 0:
        extra = ((difference + 63) // 64) * 64
        if high_precision - extra > low_precision:
            return low_precision + extra
        return high_precision
    if px < py:
        return px
    return py


@native
def pari_real_pair_logarithm(
    mx: int,
    px: int,
    ex: int,
    my: int,
    py: int,
    ey: int,
    requested_precision: int,
    log_cache: IntegerBuffer,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int, int, int, int, int]:
    """Return upstream result kind (1 real, 2 complex) and both real triples.

    This accepts real components only, not exact integer/rational components.
    A real result has an absent imaginary component encoded (0, -1, 0).
    Real zeros retain their absolute-error exponents. Shared constant workspaces
    are disjoint owners; log(2) and pi have distinct resident caches.
    """
    if (
        requested_precision < 64
        or requested_precision > 384
        or requested_precision % 64 != 0
    ):
        raise ValueError("unsupported complex logarithm precision")
    if mx == 0 and my == 0:
        raise ValueError("logarithm of zero")
    if (mx == 0 and px != 0) or (my == 0 and py != 0):
        raise ValueError("zero components carry no mantissa precision")
    if mx != 0:
        if px < 64 or px > 384 or px % 64 != 0 or abs(mx).bit_length() != px:
            raise ValueError("unsupported real-component precision")
    if my != 0:
        if py < 64 or py > 384 or py % 64 != 0 or abs(my).bit_length() != py:
            raise ValueError("unsupported imaginary-component precision")
    if my == 0:
        lm, lp, le = pari_real_logarithm_multiword(
            mx, px, ex, log_cache, a, b, p, q, stack
        )
        if mx > 0:
            return 1, lm, lp, le, 0, -1, 0
        am, ap, ae = pari_pi_constant(px, pi_cache, a, b, p, q, stack)
        return 2, lm, lp, le, am, ap, ae
    precision = pari_real_pair_precision(mx, px, ex, my, py, ey)
    if precision < requested_precision:
        precision = requested_precision
    if mx == 0:
        am, ap, ae = pari_pi_constant(precision, pi_cache, a, b, p, q, stack)
        if my < 0:
            am = -am
        lm, lp, le = pari_real_logarithm_multiword(
            my, py, ey, log_cache, a, b, p, q, stack
        )
        return 2, lm, lp, le, am, ap, ae - 1
    # In the selected range glog uses garg and log(cxnorm)/2, not complex AGM.
    am, ap, ae = pari_real_components_argument(
        mx, px, ex, my, py, ey, pi_cache, a, b, p, q, stack
    )
    xm, xp, xe = pari_short_square(mx, px, ex)
    ym, yp, ye = pari_short_square(my, py, ey)
    nm, np, ne = pari_signed_real_sum(xm, xp, xe, ym, yp, ye)
    lm, lp, le = pari_real_logarithm_multiword(nm, np, ne, log_cache, a, b, p, q, stack)
    return 2, lm, lp, le - 1, am, ap, ae

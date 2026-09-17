"""PARI 2.17.4 `trans1.c:pi_ramanujan`, `constpi` and `mppi`.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Retain upstream term selection, binary splitting and real rounding order.
The resident cache replaces the lifetime of PARI's thread-local clone.
"""

from sagejs.native import IntegerBuffer, checked_float64, native

from .binary_splitting import pari_abpq_sum
from .exponential import pari_real_resize
from .real_conversion import pari_integer_to_real
from .real_square_root import pari_real_square_root_abs
from .short_product import pari_real_integer_division, pari_short_product


@native
def pari_pi_constant(
    precision: int,
    cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int]:
    """Return mppi at a word precision, reusing a computed resident cache.

    Scratch buffers and cache are disjoint. The input precision limit leaves
    the upstream 64-bit guard word within the coordinated 154,112-bit probe
    boundary.
    """
    if precision < 64 or precision > 154112 or precision % 64 != 0:
        raise ValueError("unsupported pi precision")
    if len(cache) < 3:
        raise ValueError("pi cache requires three entries")
    if cache[1] < precision:
        terms = int(1.0 + checked_float64(precision) / 47.11041314)
        required_stack = 91
        if terms > 4096:
            required_stack = 105
        if (
            len(a) <= terms
            or len(b) <= terms
            or len(p) <= terms
            or len(q) <= terms
            or len(stack) < required_stack
        ):
            raise ValueError("pi coefficient workspace exhausted")
        a[0] = 13591409
        b[0] = 1
        p[0] = 1
        q[0] = 1
        for n in range(1, terms + 1):
            a[n] = 545140134 * n + 13591409
            b[n] = 1
            p[n] = ((6 * n - 5) * (2 * n - 1)) * (1 - 6 * n)
            q[n] = (n * n) * (10939058860032000 * n)
        rp, rq, rb, rt = pari_abpq_sum(a, b, p, q, 0, terms, stack)
        working = precision + 64
        um, up, ue = pari_integer_to_real(rq * 53360, working)
        um, up, ue = pari_real_integer_division(rt, um, up, ue)
        sm, sp, se = pari_integer_to_real(640320, working)
        sm, sp, se = pari_real_square_root_abs(sm, sp, se)
        um, up, ue = pari_short_product(um, up, ue, sm, sp, se)
        cm, cp, ce = pari_real_resize(um, up, ue, precision)
        cache[0] = cm
        cache[1] = cp
        cache[2] = ce
    return pari_real_resize(cache[0], cache[1], cache[2], precision)

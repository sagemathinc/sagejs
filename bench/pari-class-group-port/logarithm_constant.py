"""PARI 2.17.4 log2_split/constlog2/mplog2 with caller-owned cache state.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
The three rational atanh computations remain in the native source call graph.
"""

from sagejs.native import IntegerBuffer, native

from .binary_splitting import pari_atanhuu
from .exponential import pari_real_resize
from .short_product import pari_signed_real_sum, pari_word_integer_real_product


@native
def pari_log2_constant(
    precision: int,
    cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int]:
    """Compute mplog2, reusing a previously computed higher-precision value.

    Cache stores mantissa, precision and exponent, initially all zero.
    All mutable buffers are disjoint and have caller-selected limb capacity.
    The single guard word is preserved; unsupported precision is not clamped.
    """
    if precision < 64 or precision > 4352 or precision % 64 != 0:
        raise ValueError("unsupported logarithm constant precision")
    if len(cache) < 3:
        raise ValueError("logarithm constant cache requires three entries")
    if cache[1] < precision:
        working = precision + 64
        um, up, ue = pari_atanhuu(1, 26, working, a, b, p, q, stack)
        vm, vp, ve = pari_atanhuu(1, 4801, working, a, b, p, q, stack)
        wm, wp, we = pari_atanhuu(1, 8749, working, a, b, p, q, stack)
        vm = -vm
        ve += 1
        we += 3
        um, up, ue = pari_word_integer_real_product(18, um, up, ue)
        vm, vp, ve = pari_signed_real_sum(vm, vp, ve, wm, wp, we)
        um, up, ue = pari_signed_real_sum(um, up, ue, vm, vp, ve)
        cm, cp, ce = pari_real_resize(um, up, ue, precision)
        cache[0] = cm
        cache[1] = cp
        cache[2] = ce
    return pari_real_resize(cache[0], cache[1], cache[2], precision)

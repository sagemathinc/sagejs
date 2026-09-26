"""PARI 2.17.4 generic integer/real product through multiword mulir.

Derived from `src/kernel/none/mp_indep.c:mulir`. Copyright (C) The PARI
group. GPL-2.0-or-later, without warranty. Packed integer multiplication
replaces upstream limb storage, not its branch or rounding decisions.
"""

from sagejs.native import native

from .real_conversion import pari_integer_to_real
from .short_product import pari_short_product, pari_word_integer_real_product


@native
def pari_integer_real_product(
    integer: int, mantissa: int, precision: int, exponent: int
) -> tuple[int, int, int]:
    """Follow generic gmul and mulir below the 64-bit GMP crossover.

    Precision -1 represents an exact integer; generic zero multiplication
    returns exact zero. Nonzero reals admit 64..2304 bits, below the pinned
    3520-bit MULRR_MULII_LIMIT. The integer may be arbitrarily large.
    Do not replace the itor/short-product branch with exact multiplication:
    its intermediate rounding and omitted low cross-products are observable.
    """
    if integer == 0:
        return 0, -1, 0
    if mantissa != 0 and (
        precision < 64
        or precision > 154112
        or precision % 64 != 0
        or abs(mantissa).bit_length() != precision
    ):
        raise ValueError("unsupported integer-real product precision")
    bits = abs(integer).bit_length()
    if bits <= 64:
        return pari_word_integer_real_product(integer, mantissa, precision, exponent)
    if mantissa == 0:
        return 0, 0, exponent + bits - 1
    lx = (bits + 63) // 64 + 2
    lz = precision // 64 + 2
    if lx < lz // 2:
        # itor(x, lg2prec(lx)) is exact here. muliispec_mirror followed by
        # mulrrz_end uses the full product and its leading guard bit.
        product = abs(integer * mantissa)
        shift = product.bit_length() - precision
        result = (product + (1 << (shift - 1))) >> shift
        exponent += shift
        if result.bit_length() > precision:
            result >>= 1
            exponent += 1
        if (integer < 0) != (mantissa < 0):
            result = -result
        return result, precision, exponent
    im, ip, ie = pari_integer_to_real(integer, precision)
    return pari_short_product(im, ip, ie, mantissa, precision, exponent)

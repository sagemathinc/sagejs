"""PARI 2.17.4 real/complex logarithm columns times exact matrices.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Translate RgV.c RgMrow_ZC_mul_i and RgMrow_RgC_mul_i plus the required
gen1.c scalar dispatch. Both skip rules remain distinct. Column tasks execute
serially here, not through upstream gen_parapply. This representation and
scheduling difference is explicit, not a claim of equal runtime cost.
"""

from sagejs.native import IntegerBuffer, native

from .integer_real_product import pari_integer_real_product
from .integer_real_sum import pari_integer_real_sum
from .short_product import pari_signed_real_sum


@native
def pari_log_scalar_sum(
    am: int, ap: int, ae: int, bm: int, bp: int, be: int
) -> tuple[int, int, int]:
    """gadd restricted to exact integers and prepared reals."""
    if ap == -1:
        if bp == -1:
            return am + bm, -1, 0
        return pari_integer_real_sum(am, bm, bp, be)
    if bp == -1:
        return pari_integer_real_sum(bm, am, ap, ae)
    return pari_signed_real_sum(am, ap, ae, bm, bp, be)


@native
def pari_log_scalar_product(
    integer: int, m: int, p: int, e: int
) -> tuple[int, int, int]:
    if p == -1:
        return integer * m, -1, 0
    return pari_integer_real_product(integer, m, p, e)


@native
def pari_log_entry_product(
    integer: int, kind: int, rm: int, rp: int, re: int, im: int, ip: int, ie: int
) -> tuple[int, int, int, int, int, int, int]:
    """gmul integer with real/complex, including exact-zero result identity."""
    if integer == 0:
        return 1, 0, -1, 0, 0, -1, 0
    rm, rp, re = pari_log_scalar_product(integer, rm, rp, re)
    if kind == 1:
        return 1, rm, rp, re, 0, -1, 0
    im, ip, ie = pari_log_scalar_product(integer, im, ip, ie)
    return 2, rm, rp, re, im, ip, ie


@native
def pari_log_entry_sum(
    ak: int,
    ar: int,
    arp: int,
    are: int,
    ai: int,
    aip: int,
    aie: int,
    bk: int,
    br: int,
    brp: int,
    bre: int,
    bi: int,
    bip: int,
    bie: int,
) -> tuple[int, int, int, int, int, int, int]:
    """gadd complex branches preserve imaginary-first and exact-zero collapse."""
    if ak == 2 and bk == 2:
        ai, aip, aie = pari_log_scalar_sum(ai, aip, aie, bi, bip, bie)
        ar, arp, are = pari_log_scalar_sum(ar, arp, are, br, brp, bre)
        if ai == 0 and aip == -1:
            return 1, ar, arp, are, 0, -1, 0
        return 2, ar, arp, are, ai, aip, aie
    ar, arp, are = pari_log_scalar_sum(ar, arp, are, br, brp, bre)
    if ak == 2:
        return 2, ar, arp, are, ai, aip, aie
    if bk == 2:
        return 2, ar, arp, are, bi, bip, bie
    return 1, ar, arp, are, 0, -1, 0


@native
def pari_validate_log_entries(entries: IntegerBuffer, count: int) -> int:
    """Check prepared entries and return whether matrix dispatch is inexact."""
    if count < 0 or len(entries) < count * 7:
        raise ValueError("short prepared logarithm entries")
    inexact = 0
    for j in range(count):
        base = 7 * j
        kind = entries[base]
        if kind != 1 and kind != 2:
            raise ValueError("unsupported logarithm entry kind")
        if kind == 2 or entries[base + 2] != -1:
            inexact = 1
        for k in range(kind):
            m = entries[base + 1 + 3 * k]
            p = entries[base + 2 + 3 * k]
            e = entries[base + 3 + 3 * k]
            if p == -1:
                if e != 0:
                    raise ValueError("invalid exact logarithm component")
            elif m == 0:
                if p != 0:
                    raise ValueError("invalid zero logarithm precision")
            elif p < 64 or p > 4352 or p % 64 != 0 or abs(m).bit_length() != p:
                raise ValueError("invalid real logarithm component")
    return inexact


@native
def pari_log_matrix_transform(
    entries: IntegerBuffer,
    coefficients: IntegerBuffer,
    rows: int,
    inner: int,
    columns: int,
    generic: bool,
    output: IntegerBuffer,
) -> int:
    """Follow special RgM_ZM_mul or generic gmul(C,U), at nonempty inner size.

    Entries use seven-field column-major logarithm storage. All owners must
    be disjoint. Generic all-integer matrices dispatch elsewhere upstream and
    explicitly reject here. Errors after input checks may partially write
    output; no public certificate is published. No blocked/Strassen sum or
    compensated summation may replace the source accumulation order.
    """
    if rows < 0 or inner < 1 or columns < 0:
        raise ValueError("unsupported logarithm matrix dimensions")
    if len(entries) < rows * inner * 7 or len(coefficients) < inner * columns:
        raise ValueError("short logarithm transform input")
    if len(output) < rows * columns * 7:
        raise ValueError("short logarithm transform output")
    inexact = pari_validate_log_entries(entries, rows * inner)
    if generic and inexact == 0 and rows != 0 and columns != 0:
        raise ValueError("generic integer-only matrix dispatch is not this path")
    for j in range(columns):
        for i in range(rows):
            base = i * 7
            k, rm, rp, re, im, ip, ie = pari_log_entry_product(
                coefficients[j * inner],
                entries[base],
                entries[base + 1],
                entries[base + 2],
                entries[base + 3],
                entries[base + 4],
                entries[base + 5],
                entries[base + 6],
            )
            for h in range(1, inner):
                base = (h * rows + i) * 7
                coefficient = coefficients[j * inner + h]
                skip = coefficient == 0
                if generic:
                    skip = (
                        entries[base] == 1
                        and entries[base + 1] == 0
                        and entries[base + 2] == -1
                    )
                if skip:
                    continue
                bk, br, brp, bre, bi, bip, bie = pari_log_entry_product(
                    coefficient,
                    entries[base],
                    entries[base + 1],
                    entries[base + 2],
                    entries[base + 3],
                    entries[base + 4],
                    entries[base + 5],
                    entries[base + 6],
                )
                k, rm, rp, re, im, ip, ie = pari_log_entry_sum(
                    k,
                    rm,
                    rp,
                    re,
                    im,
                    ip,
                    ie,
                    bk,
                    br,
                    brp,
                    bre,
                    bi,
                    bip,
                    bie,
                )
            base = (j * rows + i) * 7
            output[base] = k
            output[base + 1] = rm
            output[base + 2] = rp
            output[base + 3] = re
            output[base + 4] = im
            output[base + 5] = ip
            output[base + 6] = ie
    return 0

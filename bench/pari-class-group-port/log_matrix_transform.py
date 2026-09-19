"""PARI 2.17.4 real/complex logarithm columns times exact matrices.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Translate RgV.c RgMrow_ZC_mul_i and RgMrow_RgC_mul_i plus the required
gen1.c scalar dispatch. Both skip rules remain distinct. Column tasks execute
serially here, not through upstream gen_parapply. This representation and
scheduling difference is explicit, not a claim of equal runtime cost.
"""

from sagejs.native import (
    Int64Buffer,
    IntegerBuffer,
    checked_int64,
    checked_uint64,
    int64,
    native,
    native_inline,
    uint64,
)

from .integer_real_product import pari_integer_real_product
from .integer_real_sum import pari_integer_real_sum
from .short_product import pari_signed_real_sum
from .short_product_bounded import (
    pari_bounded_signed_real_sum,
    pari_bounded_word_integer_real_product,
)


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
def _pari_log_word_scalar_product(
    integer: int64, mantissa: int, precision: int, exponent: int
) -> tuple[int, int, int]:
    """Single-word specialization of the exact/real scalar product."""
    if precision == -1:
        return integer * mantissa, -1, 0
    if integer == 0:
        return 0, -1, 0
    if integer <= -9223372036854775808:
        raise ValueError("unsupported signed-word logarithm coefficient")
    magnitude: uint64 = 0
    if integer < 0:
        magnitude = checked_uint64(-integer)
    else:
        magnitude = checked_uint64(integer)
    bits: int64 = 0
    while magnitude != 0:
        magnitude >>= 1
        bits += 1
    if mantissa == 0:
        return 0, 0, exponent + bits - 1
    if integer == 1:
        return mantissa, precision, exponent
    if integer == -1:
        return -mantissa, precision, exponent
    product = abs(integer * mantissa)
    shift = product.bit_length() - precision
    result = (product + (1 << (shift - 1))) >> shift
    exponent += shift
    if result.bit_length() > precision:
        result >>= 1
        exponent += 1
    if (integer < 0 and mantissa > 0) or (integer > 0 and mantissa < 0):
        result = -result
    return result, precision, exponent


@native
def _pari_log_entry_product_word(
    integer: int64,
    kind: int,
    rm: int,
    rp: int,
    re: int,
    im: int,
    ip: int,
    ie: int,
) -> tuple[int, int, int, int, int, int, int]:
    """Multiply one prepared entry by a checked signed-word coefficient."""
    if integer == 0:
        return 1, 0, -1, 0, 0, -1, 0
    rm, rp, re = _pari_log_word_scalar_product(integer, rm, rp, re)
    if kind == 1:
        return 1, rm, rp, re, 0, -1, 0
    im, ip, ie = _pari_log_word_scalar_product(integer, im, ip, ie)
    return 2, rm, rp, re, im, ip, ie


@native_inline
def _pari_log_entry_product_bounded_word_zero_exact(
    integer: int64,
    kind: int64,
    rm: int,
    rp: int64,
    re: int64,
    im: int,
    ip: int64,
    ie: int64,
) -> tuple[int64, int, int64, int64, int, int64, int64]:
    """Multiply a prepared entry after proving every exact component is zero."""
    if integer == 0:
        return (
            checked_int64(1),
            0,
            checked_int64(-1),
            checked_int64(0),
            0,
            checked_int64(-1),
            checked_int64(0),
        )
    if rp == -1:
        rm = 0
        re = 0
    else:
        rm, rp, re = pari_bounded_word_integer_real_product(integer, rm, rp, re)
    if kind == 1:
        return checked_int64(1), rm, rp, re, 0, checked_int64(-1), checked_int64(0)
    if ip == -1:
        im = 0
        ie = 0
    else:
        im, ip, ie = pari_bounded_word_integer_real_product(integer, im, ip, ie)
    return checked_int64(2), rm, rp, re, im, ip, ie


@native_inline
def _pari_log_entry_sum_bounded_zero_exact(
    ak: int64,
    ar: int,
    arp: int64,
    are: int64,
    ai: int,
    aip: int64,
    aie: int64,
    bk: int64,
    br: int,
    brp: int64,
    bre: int64,
    bi: int,
    bip: int64,
    bie: int64,
) -> tuple[int64, int, int64, int64, int, int64, int64]:
    """Add prepared entries after proving every exact component is zero."""
    if arp == -1:
        ar, arp, are = br, brp, bre
    elif brp != -1:
        ar, arp, are = pari_bounded_signed_real_sum(ar, arp, are, br, brp, bre)
    if ak == 2 and bk == 2:
        if aip == -1:
            ai, aip, aie = bi, bip, bie
        elif bip != -1:
            ai, aip, aie = pari_bounded_signed_real_sum(ai, aip, aie, bi, bip, bie)
        if aip == -1:
            return (
                checked_int64(1),
                ar,
                arp,
                are,
                0,
                checked_int64(-1),
                checked_int64(0),
            )
        return checked_int64(2), ar, arp, are, ai, aip, aie
    if ak == 2:
        return checked_int64(2), ar, arp, are, ai, aip, aie
    if bk == 2:
        return checked_int64(2), ar, arp, are, bi, bip, bie
    return checked_int64(1), ar, arp, are, 0, checked_int64(-1), checked_int64(0)


@native_inline
def _pari_log_entry_add_scaled_bounded_zero_exact(
    entries: IntegerBuffer,
    source: int64,
    destination: int64,
    coefficient: int64,
) -> int64:
    """Add one scaled entry while bounded metadata stays inside this call."""
    bk, br, brp, bre, bi, bip, bie = _pari_log_entry_product_bounded_word_zero_exact(
        coefficient,
        checked_int64(entries[source]),
        entries[source + 1],
        checked_int64(entries[source + 2]),
        checked_int64(entries[source + 3]),
        entries[source + 4],
        checked_int64(entries[source + 5]),
        checked_int64(entries[source + 6]),
    )
    ak, ar, arp, are, ai, aip, aie = _pari_log_entry_sum_bounded_zero_exact(
        checked_int64(entries[destination]),
        entries[destination + 1],
        checked_int64(entries[destination + 2]),
        checked_int64(entries[destination + 3]),
        entries[destination + 4],
        checked_int64(entries[destination + 5]),
        checked_int64(entries[destination + 6]),
        bk,
        br,
        brp,
        bre,
        bi,
        bip,
        bie,
    )
    entries[destination] = ak
    entries[destination + 1] = ar
    entries[destination + 2] = arp
    entries[destination + 3] = are
    entries[destination + 4] = ai
    entries[destination + 5] = aip
    entries[destination + 6] = aie
    return 0


@native
def _pari_log_entries_have_only_zero_exacts(
    entries: IntegerBuffer, count: int64
) -> bool:
    """Return whether every exact real/imaginary component is zero."""
    if count < 0 or len(entries) < 7 * count:
        raise ValueError("short prepared logarithm entries")
    for i in range(count):
        base: int64 = 7 * i
        kind: int64 = checked_int64(entries[base])
        if entries[base + 2] == -1 and entries[base + 1] != 0:
            return False
        if kind == 2 and entries[base + 5] == -1 and entries[base + 4] != 0:
            return False
    return True


@native
def _pari_pack_log_metadata_zero_exact(
    entries: IntegerBuffer,
    count: int64,
    metadata: Int64Buffer,
    metadata_offset: int64,
) -> bool:
    """Pack kind/precision/exponent metadata after validating exact zeros."""
    if (
        count < 0
        or metadata_offset < 0
        or len(entries) < 7 * count
        or len(metadata) < metadata_offset + 5 * count
    ):
        raise ValueError("short prepared logarithm metadata")
    for i in range(count):
        base: int64 = 7 * i
        target: int64 = metadata_offset + 5 * i
        kind: int64 = checked_int64(entries[base])
        if entries[base + 2] == -1 and entries[base + 1] != 0:
            return False
        if kind == 2 and entries[base + 5] == -1 and entries[base + 4] != 0:
            return False
        metadata[target] = kind
        metadata[target + 1] = checked_int64(entries[base + 2])
        metadata[target + 2] = checked_int64(entries[base + 3])
        metadata[target + 3] = checked_int64(entries[base + 5])
        metadata[target + 4] = checked_int64(entries[base + 6])
    return True


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
def _pari_validate_log_entries_int64(entries: IntegerBuffer, count: int64) -> int64:
    """Check prepared entries and return whether matrix dispatch is inexact."""
    if count < 0 or len(entries) < count * 7:
        raise ValueError("short prepared logarithm entries")
    inexact: int64 = 0
    j: int64 = 0
    k: int64 = 0
    position: int64 = 0
    precision_position: int64 = 0
    mantissa_position: int64 = 0
    exponent_position: int64 = 0
    for j in range(count):
        base: int64 = 7 * j
        kind = entries[base]
        if kind != 1 and kind != 2:
            raise ValueError("unsupported logarithm entry kind")
        precision_position = base + 2
        if kind == 2 or entries[precision_position] != -1:
            inexact = 1
        kind64: int64 = checked_int64(kind)
        for k in range(kind64):
            position = base + 3 * k
            mantissa_position = position + 1
            precision_position = position + 2
            exponent_position = position + 3
            m = entries[mantissa_position]
            p = entries[precision_position]
            e = entries[exponent_position]
            if p == -1:
                if e != 0:
                    raise ValueError("invalid exact logarithm component")
            elif m == 0:
                if p != 0:
                    raise ValueError("invalid zero logarithm precision")
            elif p < 64 or p > 154112 or p % 64 != 0 or abs(m).bit_length() != p:
                raise ValueError("invalid real logarithm component")
    return inexact


@native
def pari_validate_log_entries(entries: IntegerBuffer, count: int) -> int:
    """Validate logs with one checked transition to fixed-width indexing."""
    return _pari_validate_log_entries_int64(entries, checked_int64(count))


@native
def _pari_log_matrix_transform_int64(
    entries: IntegerBuffer,
    coefficients: IntegerBuffer,
    rows: int64,
    inner: int64,
    columns: int64,
    generic: bool,
    output: IntegerBuffer,
) -> int64:
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
    inexact: int64 = _pari_validate_log_entries_int64(entries, rows * inner)
    if generic and inexact == 0 and rows != 0 and columns != 0:
        raise ValueError("generic integer-only matrix dispatch is not this path")
    i: int64 = 0
    j: int64 = 0
    h: int64 = 0
    base: int64 = 0
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


@native
def _pari_log_matrix_transform_word_coefficients_nongeneric(
    entries: IntegerBuffer,
    coefficients: Int64Buffer,
    exact_tail: IntegerBuffer,
    word_rows: int64,
    rows: int64,
    inner: int64,
    columns: int64,
    output: IntegerBuffer,
) -> int64:
    """Transform logs by a checked signed-word matrix on the `RgM_ZM_mul` path."""
    if rows < 0 or inner < 1 or columns < 0:
        raise ValueError("unsupported word logarithm matrix dimensions")
    if word_rows < 0 or word_rows > inner:
        raise ValueError("invalid word logarithm transform split")
    if len(entries) < rows * inner * 7 or len(coefficients) < word_rows * columns:
        raise ValueError("short word logarithm transform input")
    if len(exact_tail) < inner * columns:
        raise ValueError("short exact logarithm transform tail")
    if len(output) < rows * columns * 7:
        raise ValueError("short word logarithm transform output")
    inexact: int64 = _pari_validate_log_entries_int64(entries, rows * inner)
    i: int64 = 0
    j: int64 = 0
    h: int64 = 0
    base: int64 = 0
    coefficient: int64 = 0
    exact_start: int64 = 1
    if word_rows > 1:
        exact_start = word_rows
    for j in range(columns):
        for i in range(rows):
            base = i * 7
            if word_rows != 0:
                coefficient = coefficients[j * word_rows]
            else:
                coefficient = checked_int64(exact_tail[j * inner])
            k, rm, rp, re, im, ip, ie = _pari_log_entry_product_word(
                coefficient,
                entries[base],
                entries[base + 1],
                entries[base + 2],
                entries[base + 3],
                entries[base + 4],
                entries[base + 5],
                entries[base + 6],
            )
            for h in range(1, word_rows):
                base = (h * rows + i) * 7
                coefficient = coefficients[j * word_rows + h]
                skip = coefficient == 0
                if skip:
                    continue
                bk, br, brp, bre, bi, bip, bie = _pari_log_entry_product_word(
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
            for h in range(exact_start, inner):
                base = (h * rows + i) * 7
                exact_coefficient = exact_tail[j * inner + h]
                skip = exact_coefficient == 0
                if skip:
                    continue
                bk, br, brp, bre, bi, bip, bie = pari_log_entry_product(
                    exact_coefficient,
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


@native
def _pari_log_matrix_transform_bounded_word_zero_exact(
    entries: IntegerBuffer,
    coefficients: Int64Buffer,
    rows: int64,
    inner: int64,
    columns: int64,
    generic: bool,
    metadata_offset: int64,
    output: IntegerBuffer,
) -> int64:
    """Transform logs after proving bounded coefficients and zero exact parts."""
    if rows < 0 or inner < 1 or columns < 0:
        raise ValueError("unsupported bounded logarithm matrix dimensions")
    if (
        len(entries) < rows * inner * 7
        or len(coefficients) < inner * columns
        or len(coefficients) < metadata_offset + 5 * rows * inner
    ):
        raise ValueError("short bounded logarithm transform input")
    if len(output) < rows * columns * 7:
        raise ValueError("short bounded logarithm transform output")
    inexact: int64 = _pari_validate_log_entries_int64(entries, rows * inner)
    if generic and inexact == 0 and rows != 0 and columns != 0:
        raise ValueError("generic integer-only matrix dispatch is not this path")
    i: int64 = 0
    j: int64 = 0
    h: int64 = 0
    base: int64 = 0
    coefficient: int64 = 0
    for j in range(columns):
        for i in range(rows):
            base = i * 7
            metadata_base: int64 = metadata_offset + 5 * i
            coefficient = coefficients[j * inner]
            k, rm, rp, re, im, ip, ie = _pari_log_entry_product_bounded_word_zero_exact(
                coefficient,
                coefficients[metadata_base],
                entries[base + 1],
                coefficients[metadata_base + 1],
                coefficients[metadata_base + 2],
                entries[base + 4],
                coefficients[metadata_base + 3],
                coefficients[metadata_base + 4],
            )
            for h in range(1, inner):
                base = (h * rows + i) * 7
                metadata_base = metadata_offset + 5 * (h * rows + i)
                coefficient = coefficients[j * inner + h]
                skip: bool = coefficient == 0
                if generic:
                    skip = (
                        entries[base] == 1
                        and entries[base + 1] == 0
                        and entries[base + 2] == -1
                    )
                if skip:
                    continue
                bk, br, brp, bre, bi, bip, bie = (
                    _pari_log_entry_product_bounded_word_zero_exact(
                        coefficient,
                        coefficients[metadata_base],
                        entries[base + 1],
                        coefficients[metadata_base + 1],
                        coefficients[metadata_base + 2],
                        entries[base + 4],
                        coefficients[metadata_base + 3],
                        coefficients[metadata_base + 4],
                    )
                )
                k, rm, rp, re, im, ip, ie = _pari_log_entry_sum_bounded_zero_exact(
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
    """Checked public bridge to the fixed-width matrix control plane."""
    return _pari_log_matrix_transform_int64(
        entries,
        coefficients,
        checked_int64(rows),
        checked_int64(inner),
        checked_int64(columns),
        generic,
        output,
    )

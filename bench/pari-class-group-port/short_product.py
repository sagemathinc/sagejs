"""Prepared-mantissa prototype of PARI 2.17.4's short real product.

Derived from `src/kernel/none/mp_indep.c:mulrrz_i`, `mulrrz_3`, and
`mulrrz_end`. Copyright (C) The PARI group. GPL-2.0-or-later; without
warranty. See repository LICENSE.

This represents PARI's short-product branch with 64-bit words and the
full-integer product selected above the pinned host's 3,520-bit crossover. It is not a
general PARI real runtime. The one-word branch uses portable half-word machine
arithmetic; the large branch deliberately spells the backend multiplication as
ordinary Python integer multiplication, then performs PARI's normalization and
rounding in readable Python. Squares have a separate upstream algorithm and
must not be routed here merely because their values agree.
"""

from sagejs.native import (
    IntegerBuffer,
    checked_int64,
    checked_uint64,
    diagnostic_stage_switch,
    native,
    uint64,
)
from math import gcd
from .short_product_bounded import pari_bounded_real_matrix_norm_fused


@native
def pari_mulll_words(a: uint64, b: uint64) -> tuple[uint64, uint64]:
    """Return low/high words of an unsigned product using portable half words.

    This implements the representation primitive `mulll`, not PARI's
    architecture-specific assembly. Four 32-bit products suffice. Every
    intermediate is below `2**64`; explicit low-word masking also preserves
    ordinary CPython semantics. No arbitrary-precision product is required.
    """
    a = checked_uint64(a)
    b = checked_uint64(b)
    bits = checked_uint64(32)
    mask = checked_uint64(4294967295)
    a0 = a & mask
    a1 = a >> bits
    b0 = b & mask
    b1 = b >> bits
    t = a0 * b0
    low0 = t & mask
    t = a1 * b0 + (t >> bits)
    middle = t & mask
    high0 = t >> bits
    t = a0 * b1 + middle
    high = a1 * b1 + high0 + (t >> bits)
    low = ((t & mask) << bits) | low0
    return low, high


@native
def pari_one_word_product(
    mx: int, ex: int, my: int, py: int, ey: int
) -> tuple[int, int, int]:
    """Translate `mulrrz_3`/`mulrrz_3end` for positive normalized operands.

    The caller checks mantissa normalization; `mx` has 64 bits and `my` has
    at least 64. Retain the upper cross-product word for unequal precision,
    then the same guard-bit rounding and normalization as PARI.
    """
    one = checked_uint64(1)
    highbit = checked_uint64(9223372036854775808)
    mask = checked_uint64(18446744073709551615)
    a = checked_uint64(mx)
    b = checked_uint64(my >> (py - 64))
    low, high = pari_mulll_words(a, b)
    if py > 64:
        c = checked_uint64((my >> (py - 128)) & int(mask))
        unused, cross = pari_mulll_words(a, c)
        previous = low
        low = (low + cross) & mask
        if low < previous:
            high += one
    exponent = ex + ey
    if high >= highbit:
        if low & highbit:
            high += one
        exponent += 1
    else:
        high = (high << one) | (low >> checked_uint64(63))
        if low & checked_uint64(4611686018427387904):
            high = (high + one) & mask
            if high == checked_uint64(0):
                high = highbit
                exponent += 1
    return int(high), 64, exponent


@native
def pari_prime_to_part(x: int, factor_product: int) -> int:
    """Translate `base4.c:Z_ppo` for nonzero x and positive factor product.

    Preserve the shrinking GCD operand and exact-division sequence. GMP's GCD
    is a declared arithmetic substitution for PARI's `gcdii`, not a claim that
    the backends have the same cost. Zero x is outside can_factor's contract.
    """
    if x == 0 or factor_product <= 0:
        raise ValueError("prime-to part requires nonzero x and positive product")
    f = factor_product
    while True:
        f = gcd(x, f)
        if f == 1:
            return x
        x //= f


@native
def pari_smoothness_precheck(norm: int, factor_product: int) -> int:
    """Return can_factor's initial smoothness gate, not ideal factorization."""
    if abs(norm) == 1:
        return 1
    if abs(pari_prime_to_part(norm, factor_product)) != 1:
        return 0
    return 1


@native
def pari_round_real(m: int, e: int, exponent: int) -> tuple[int, int]:
    """Translate `gen3.c:round_i` and the real branch of `grndtoi`.

    Copyright (C) The PARI group, GPL-2.0-or-later, without warranty.
    Input is `m / 2**e` with PARI's stored exponent, also for zero.
    """
    if m == 0 or exponent < -1:
        return 0, exponent
    if e <= 0:
        return m << -e, -e
    half = 1 << (e - 1)
    shifted = m + half
    # PARI shifti/remi2n truncate toward zero, unlike Python // and %.
    q = abs(shifted) >> e
    if shifted < 0:
        q = -q
    residual = shifted - (q << e)
    if residual == 0:
        return q, -1
    if shifted < 0:
        q -= 1
        residual += half
    else:
        residual -= half
    if residual:
        error = abs(residual).bit_length() - 1 - e
    else:
        error = -e
    return q, error


@native
def pari_prepare_monic_cubic_norm_form(
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    form0: IntegerBuffer,
    form1: IntegerBuffer,
    form2: IntegerBuffer,
) -> int:
    """Recover a prepared `[1, *, *]` basis's exact cubic norm form."""
    if (
        len(matrix_m) < 9
        or len(matrix_p) < 9
        or len(matrix_e) < 9
        or len(form0) < 3
        or len(form1) < 3
        or len(form2) < 3
    ):
        raise ValueError("short cubic norm-form storage")
    values = form0
    n100 = 1
    values[0] = 0
    values[1] = 1
    values[2] = 0
    m010, p010, e010 = pari_bounded_real_matrix_norm_fused(
        matrix_m, matrix_p, matrix_e, values, checked_int64(3)
    )
    n010, error010 = pari_round_real(m010, int(p010) - int(e010) - 1, int(e010))
    values[0] = 0
    values[1] = 0
    values[2] = 1
    m001, p001, e001 = pari_bounded_real_matrix_norm_fused(
        matrix_m, matrix_p, matrix_e, values, checked_int64(3)
    )
    n001, error001 = pari_round_real(m001, int(p001) - int(e001) - 1, int(e001))
    values[0] = 1
    values[1] = 1
    values[2] = 0
    m110, p110, e110 = pari_bounded_real_matrix_norm_fused(
        matrix_m, matrix_p, matrix_e, values, checked_int64(3)
    )
    n110, error110 = pari_round_real(m110, int(p110) - int(e110) - 1, int(e110))
    values[1] = -1
    m1n10, p1n10, e1n10 = pari_bounded_real_matrix_norm_fused(
        matrix_m, matrix_p, matrix_e, values, checked_int64(3)
    )
    n1n10, error1n10 = pari_round_real(m1n10, int(p1n10) - int(e1n10) - 1, int(e1n10))
    values[0] = 1
    values[1] = 0
    values[2] = 1
    m101, p101, e101 = pari_bounded_real_matrix_norm_fused(
        matrix_m, matrix_p, matrix_e, values, checked_int64(3)
    )
    n101, error101 = pari_round_real(m101, int(p101) - int(e101) - 1, int(e101))
    values[2] = -1
    m10n1, p10n1, e10n1 = pari_bounded_real_matrix_norm_fused(
        matrix_m, matrix_p, matrix_e, values, checked_int64(3)
    )
    n10n1, error10n1 = pari_round_real(m10n1, int(p10n1) - int(e10n1) - 1, int(e10n1))
    values[0] = 0
    values[1] = 1
    values[2] = 1
    m011, p011, e011 = pari_bounded_real_matrix_norm_fused(
        matrix_m, matrix_p, matrix_e, values, checked_int64(3)
    )
    n011, error011 = pari_round_real(m011, int(p011) - int(e011) - 1, int(e011))
    values[2] = -1
    m01n1, p01n1, e01n1 = pari_bounded_real_matrix_norm_fused(
        matrix_m, matrix_p, matrix_e, values, checked_int64(3)
    )
    n01n1, error01n1 = pari_round_real(m01n1, int(p01n1) - int(e01n1) - 1, int(e01n1))
    values[0] = 1
    values[1] = 1
    values[2] = 1
    m111, p111, e111 = pari_bounded_real_matrix_norm_fused(
        matrix_m, matrix_p, matrix_e, values, checked_int64(3)
    )
    n111, error111 = pari_round_real(m111, int(p111) - int(e111) - 1, int(e111))
    if (
        error010 > -32
        or error001 > -32
        or error110 > -32
        or error1n10 > -32
        or error101 > -32
        or error10n1 > -32
        or error011 > -32
        or error01n1 > -32
        or error111 > -32
    ):
        return 0
    c_plus_e = n110 - n100 - n010
    minus_c_plus_e = n1n10 - n100 + n010
    c = (c_plus_e - minus_c_plus_e) // 2
    e = (c_plus_e + minus_c_plus_e) // 2
    d_plus_f = n101 - n100 - n001
    minus_d_plus_f = n10n1 - n100 + n001
    d = (d_plus_f - minus_d_plus_f) // 2
    f = (d_plus_f + minus_d_plus_f) // 2
    g_plus_h = n011 - n010 - n001
    minus_g_plus_h = n01n1 + n010 - n001
    g = (g_plus_h - minus_g_plus_h) // 2
    h = (g_plus_h + minus_g_plus_h) // 2
    mixed = n111 - n100 - n010 - n001 - c - d - e - f - g - h
    form0[0] = n010
    form0[1] = n001
    form0[2] = c
    form1[0] = d
    form1[1] = e
    form1[2] = f
    form2[0] = g
    form2[1] = h
    form2[2] = mixed
    return 1


@native
def pari_real_integer_division(
    integer: int, m: int, p: int, e: int
) -> tuple[int, int, int]:
    """Translate GMP PARI 2.17.4 `divri`, including `divri_with_gmp`.

    Large divisors are truncated before normalization, as upstream. Rounding
    compares only the leading remainder word with half the leading divisor
    word, rather than testing `2*r > divisor`. These choices are intentional
    upstream correspondence, not a correctly-rounded division specification.
    """
    if integer == 0:
        raise ZeroDivisionError("zero ideal norm divisor")
    divisor = abs(integer)
    bits = divisor.bit_length()
    if m == 0:
        return 0, 0, e - bits + 1
    if bits < 64:
        return pari_real_word_division(integer, m, p, e)
    if p < 64 or p > 154112 or p % 64 != 0 or abs(m).bit_length() != p:
        raise ValueError("invalid prepared real")
    limbs = (bits + 63) // 64
    kept = limbs
    if kept > p // 64 + 1:
        kept = p // 64 + 1
    normalized = (divisor >> (64 * (limbs - kept))) << (64 * limbs - bits)
    numerator = abs(m) << (64 * kept)
    quotient = numerator // normalized
    remainder = numerator % normalized
    if (remainder >> (64 * (kept - 1))) > (normalized >> (64 * (kept - 1) + 1)):
        quotient += 1
    e -= bits - 1
    high = quotient >> p
    if high == 0:
        e -= 1
    elif high == 1:
        quotient >>= 1
    else:
        quotient = 1 << (p - 1)
        e += 1
    if (m < 0) != (integer < 0):
        quotient = -quotient
    return quotient, p, e


@native
def pari_real_word_division(
    integer: int, m: int, p: int, e: int
) -> tuple[int, int, int]:
    """Translate GMP `divri`'s word divisor path through `divru`.

    The guard in the divisor-above-leading-word branch is the raw remainder,
    not another quotient word. Preserve that upstream distinction. Full
    integer division here replaces PARI's word loop; its cost is not a
    language-only comparison. PARI's `is_bigint` routes even a single limb
    with its high bit set to `divri_with_gmp`; the general entry above handles it.
    """
    if integer == 0:
        raise ZeroDivisionError("zero ideal norm divisor")
    divisor = abs(integer)
    bits = divisor.bit_length()
    if bits > 64:
        raise ValueError("big ideal norm divisor is not translated")
    if m == 0:
        return 0, 0, e - bits + 1
    if p < 64 or p > 154112 or p % 64 != 0 or abs(m).bit_length() != p:
        raise ValueError("invalid prepared real")
    signed = m
    if integer < 0:
        signed = -signed
    if divisor == 1 << (bits - 1):
        return signed, p, e - bits + 1
    magnitude = abs(m)
    if divisor <= magnitude >> (p - 64):
        quotient = magnitude // divisor
        guard = ((magnitude % divisor) << 64) // divisor
    else:
        numerator = magnitude << 64
        quotient = numerator // divisor
        guard = numerator % divisor
        e -= 64
    shift = p - quotient.bit_length()
    result = (quotient << shift) + (guard >> (64 - shift))
    e -= shift
    if (guard >> (63 - shift)) % 2 != 0:
        result += 1
    if result.bit_length() > p:
        result >>= 1
        e += 1
    if signed < 0:
        result = -result
    return result, p, e


@native
def pari_short_product(
    mx: int, px: int, ex: int, my: int, py: int, ey: int
) -> tuple[int, int, int]:
    """Return signed mantissa, precision, exponent for distinct real operands.

    Nonzero inputs represent `m * 2**(expo + 1 - precision)` with a full
    normalized mantissa. Zero retains its stored exponent and uses precision
    zero. Above the pristine x86-64 build's 3,520-bit `MULRR_MULII_LIMIT`,
    translate `mulrrz_int`: multiply the shorter
    mantissa by either the equally sized mantissa or the leading shorter-width
    plus one guard word of the longer mantissa, then apply `mulrrz_end`'s
    normalization and round-to-nearest guard-bit rule. The final 1,024 bits of
    the admitted range are reserved for the log(2) construction guard;
    unsupported inputs fail explicitly.
    """
    if mx == 0 or my == 0:
        return 0, 0, ex + ey
    if px < 64 or py < 64 or px > 154112 or py > 154112:
        raise ValueError("short-product prototype precision out of range")
    if px % 64 != 0 or py % 64 != 0:
        raise ValueError("short-product prototype requires 64-bit words")
    if abs(mx).bit_length() != px or abs(my).bit_length() != py:
        raise ValueError("short-product prototype requires full mantissas")
    negative = 0
    if mx < 0:
        negative = 1
        mx = -mx
    if my < 0:
        negative = 1 - negative
        my = -my
    if px > py:
        mx, my = my, mx
        px, py = py, px
    if px == 64:
        result, precision, exponent = pari_one_word_product(mx, ex, my, py, ey)
        if negative:
            result = -result
        return result, precision, exponent
    nx = checked_uint64(px // 64)
    ny = checked_uint64(py // 64)
    one = checked_uint64(1)
    word_bits = checked_uint64(64)
    full_product_limit = checked_uint64(3520)
    if px > full_product_limit:
        # PARI's `mulrrz_int` asks `muliispec_mirror` for all shorter words and,
        # for unequal precisions, exactly one additional leading word of the
        # longer operand.  Bits below that word cannot affect the retained
        # mantissa or its guard word and are intentionally not multiplied.
        unequal = 0
        if px < py:
            unequal = 1
            my >>= py - px - 64
        product = mx * my
        bits = product.bit_length()
        exponent = ex + ey + bits - 2 * px + 1 - 64 * unequal
        discard = bits - px
        result = (product + (1 << (discard - 1))) >> discard
        if result.bit_length() > px:
            result >>= 1
            exponent += 1
        if negative:
            result = -result
        return result, px, exponent
    # Keep short-branch loop bookkeeping machine-sized, as in PARI;
    # mantissas/products remain exact integers.
    # Select the same unsigned word as remainder modulo 2**64, without
    # requesting general integer division from the native backend.
    word_mask = (1 << 64) - 1
    high = 0
    for i in range(nx):
        a = (mx >> (word_bits * (nx - one - i))) & word_mask
        stop = nx - i + one
        if stop > ny:
            stop = ny
        for j in range(stop):
            b = (my >> (word_bits * (ny - one - j))) & word_mask
            term = a * b
            if i + j < nx:
                shift = word_bits * (nx - one - i - j)
                high += term << shift
            else:
                # The upstream short product discards each low half here;
                # summing full products first would introduce absent carries.
                high += term >> 64
    bits = high.bit_length()
    exponent = ex + ey + bits - px - 63
    discard = bits - px
    result = (high + (1 << (discard - 1))) >> discard
    if result.bit_length() > px:
        result >>= 1
        exponent += 1
    if negative:
        result = -result
    return result, px, exponent


@native
def pari_prepared_real_norm(
    mantissas: IntegerBuffer,
    precisions: IntegerBuffer,
    exponents: IntegerBuffer,
    count: int,
) -> tuple[int, int, int]:
    """Translate the nonempty all-real `base1.c:embed_norm` product loop.

    Embeddings are externally prepared scaffolding, not computed here. Each
    value retains its own precision and stored zero exponent. There are no
    per-product host calls. Mixed signatures and squaring remain unported.
    """
    if count < 1:
        raise ValueError("prepared real norm requires a nonempty vector")
    value = mantissas[0]
    precision = precisions[0]
    exponent = exponents[0]
    for i in range(1, count):
        value, precision, exponent = pari_short_product(
            value, precision, exponent, mantissas[i], precisions[i], exponents[i]
        )
    return value, precision, exponent


@native
def pari_positive_real_sum(
    mx: int, px: int, ex: int, my: int, py: int, ey: int
) -> tuple[int, int, int]:
    """Translate nonnegative `addrr_sign` precision and truncation decisions.

    Prepared operands use the same full-mantissa contract as the product.
    Opposite signs and cancellation are deliberately outside this prototype.
    """
    if mx < 0 or my < 0:
        raise ValueError("positive real sum does not implement subtraction")
    if mx == 0:
        if my == 0 or ey <= ex:
            if ey > ex:
                ex = ey
            return 0, 0, ex
        precision = 64 * ((ey - ex + 63) // 64)
        if precision > py:
            precision = py
        return my >> (py - precision), precision, ey
    if my == 0:
        if ex <= ey:
            return 0, 0, ey
        precision = 64 * ((ex - ey + 63) // 64)
        if precision > px:
            precision = px
        return mx >> (px - precision), precision, ex
    if px < 64 or py < 64 or px > 154112 or py > 154112:
        raise ValueError("positive real sum prototype precision out of range")
    if px % 64 != 0 or py % 64 != 0:
        raise ValueError("positive real sum requires 64-bit words")
    if mx.bit_length() != px or my.bit_length() != py:
        raise ValueError("positive real sum requires full mantissas")
    if ex > ey:
        mx, my = my, mx
        px, py = py, px
        ex, ey = ey, ex
    gap = ey - ex
    words = gap // 64
    available = py // 64 - words
    if available <= 0:
        return my, py, ey
    precision = py
    if gap == 0:
        if px < precision:
            precision = px
    elif available > px // 64:
        precision = px + 64 * (words + 1)
        if gap % 64 < 4:
            precision -= 64
    bx = ex + 1 - px
    by = ey + 1 - py
    bottom = bx
    if by < bottom:
        bottom = by
    total = (mx << (bx - bottom)) + (my << (by - bottom))
    bits = total.bit_length()
    exponent = bottom + bits - 1
    if bits > precision:
        total >>= bits - precision
    else:
        total <<= precision - bits
    return total, precision, exponent


@native
def pari_short_square(mx: int, px: int, ex: int) -> tuple[int, int, int]:
    """Use PARI's short or full-integer square across its square crossover.

    `sqrz_i` uses the same truncated word sum at these precisions, but switches
    to `sqrispec_mirror` above the pinned 64-bit GMP square crossover.  The
    latter computes the full positive integer square and `mulrrz_end` rounds
    it back to the input precision.
    """
    if mx == 0:
        return 0, 0, 2 * ex
    if px < 64 or px > 154112 or px % 64 != 0 or abs(mx).bit_length() != px:
        raise ValueError("short square prototype precision out of range")
    if px <= 512:
        return pari_short_product(mx, px, ex, mx, px, ex)
    product = mx * mx
    bits = product.bit_length()
    exponent = 2 * ex + bits - 2 * px + 1
    discard = bits - px
    result = (product + (1 << (discard - 1))) >> discard
    if result.bit_length() > px:
        result >>= 1
        exponent += 1
    return result, px, exponent


@native
def pari_prepared_mixed_norm(
    mantissas: IntegerBuffer,
    precisions: IntegerBuffer,
    exponents: IntegerBuffer,
    real_count: int,
    complex_count: int,
) -> tuple[int, int, int]:
    """Nonempty real and complex `embed_norm` branches, prepared inputs only.

    Store real embeddings first, then consecutive real/imaginary components.
    Both products preserve their upstream order and are combined only at end.
    """
    if real_count < 1 or complex_count < 1:
        raise ValueError("mixed norm requires both real and complex embeddings")
    real_m, real_p, real_e = pari_prepared_real_norm(
        mantissas, precisions, exponents, real_count
    )
    i = real_count
    a, ap, ae = pari_short_square(mantissas[i], precisions[i], exponents[i])
    b, bp, be = pari_short_square(mantissas[i + 1], precisions[i + 1], exponents[i + 1])
    value, precision, exponent = pari_positive_real_sum(a, ap, ae, b, bp, be)
    for i in range(real_count + 2, real_count + 2 * complex_count, 2):
        a, ap, ae = pari_short_square(mantissas[i], precisions[i], exponents[i])
        b, bp, be = pari_short_square(
            mantissas[i + 1], precisions[i + 1], exponents[i + 1]
        )
        m, p, e = pari_positive_real_sum(a, ap, ae, b, bp, be)
        value, precision, exponent = pari_short_product(
            value, precision, exponent, m, p, e
        )
    return pari_short_product(real_m, real_p, real_e, value, precision, exponent)


@native
def pari_signed_real_sum(
    mx: int, px: int, ex: int, my: int, py: int, ey: int
) -> tuple[int, int, int]:
    """Prepared `addrr_sign` prototype, including opposite-sign cancellation.

    Align and truncate the operands to PARI's working word window before
    subtracting. Remove canceled whole words, then apply the upstream optional
    extension-word removal and rounding. Do not round an exact rational sum
    at an independently chosen precision.
    """
    if mx == 0 or my == 0 or (mx > 0 and my > 0) or (mx < 0 and my < 0):
        m, p, e = pari_positive_real_sum(abs(mx), px, ex, abs(my), py, ey)
        if mx < 0 or my < 0:
            m = -m
        return m, p, e
    if px < 64 or py < 64 or px > 154112 or py > 154112:
        raise ValueError("signed real sum prototype precision out of range")
    if px % 64 != 0 or py % 64 != 0:
        raise ValueError("signed real sum requires 64-bit words")
    if abs(mx).bit_length() != px or abs(my).bit_length() != py:
        raise ValueError("signed real sum requires full mantissas")
    if ex > ey:
        mx, my = my, mx
        px, py = py, px
        ex, ey = ey, ex
    gap = ey - ex
    whole = gap // 64
    remainder = gap % 64
    if py // 64 - whole <= 0:
        return my, py, ey
    extended = 0
    precision = py
    if gap == 0:
        if px < precision:
            precision = px
    elif py // 64 - whole > px // 64:
        precision = px + 64 * (whole + 1)
        extended = 1
    shift = px + gap - precision
    if shift >= 0:
        a = abs(mx) >> shift
    else:
        a = abs(mx) << -shift
    b = abs(my) >> (py - precision)
    difference = b - a
    negative = 0
    if difference < 0:
        difference = -difference
        if mx < 0:
            negative = 1
    elif my < 0:
        negative = 1
    if difference == 0:
        return 0, 0, ey + 1 - precision
    canceled = precision - difference.bit_length()
    fraction = canceled % 64
    precision -= 64 * (canceled // 64)
    exponent = ey - canceled
    result = difference << fraction
    if extended != 0 and remainder - fraction < 5 and precision > 64:
        precision -= 64
        result = (result + (1 << 63)) >> 64
        if result.bit_length() > precision:
            result >>= 1
            exponent += 1
    if negative:
        result = -result
    return result, precision, exponent


@native
def pari_word_integer_real_product(
    integer: int, mantissa: int, precision: int, exponent: int
) -> tuple[int, int, int]:
    """Generic `gmul` integer/real branch with a single-word integer.

    Precision -1 denotes an exact integer in the prepared scalar interchange.
    In particular, generic multiplication by integer zero returns integer zero,
    not the real zero returned by a direct call to `mulir(0, real)`.
    """
    if integer == 0:
        return 0, -1, 0
    bits = abs(integer).bit_length()
    if bits > 64:
        raise ValueError("multiword integer-real product is not ported")
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
def pari_word_integer_real_sum(
    integer: int, mantissa: int, precision: int, exponent: int
) -> tuple[int, int, int]:
    """Translate `addir_sign` for an exact single-word integer argument."""
    if integer == 0:
        return mantissa, precision, exponent
    bits = abs(integer).bit_length()
    if bits > 64:
        raise ValueError("multiword integer-real sum is not ported")
    gap = exponent - (bits - 1)
    if mantissa == 0:
        if gap >= 0:
            return mantissa, precision, exponent
        converted_precision = 64 * ((-gap + 63) // 64)
        return integer << (converted_precision - bits), converted_precision, bits - 1
    if gap > 0:
        converted_precision = precision - 64 * (gap // 64)
        if converted_precision < 64:
            return mantissa, precision, exponent
    else:
        converted_precision = precision + 64 * ((-gap + 63) // 64)
    converted = integer << (converted_precision - bits)
    return pari_signed_real_sum(
        converted, converted_precision, bits - 1, mantissa, precision, exponent
    )


@native
def pari_prepared_embedding_row(
    mantissas: IntegerBuffer,
    precisions: IntegerBuffer,
    exponents: IntegerBuffer,
    coefficients: IntegerBuffer,
    offset: int,
    degree: int,
) -> tuple[int, int, int]:
    """Prepared real-component row of `RgMrow_RgC_mul_i` in source order.

    Precision -1 marks an exact integer entry; all other entries are prepared
    reals. Complex rows are split into real/imaginary component rows outside
    the kernel. The supplied coordinate integers must fit one unsigned word
    in magnitude for real multiplication; unsupported inputs fail explicitly.
    """
    if degree < 1:
        raise ValueError("embedding row must be nonempty")
    if precisions[offset] == -1:
        value = mantissas[offset] * coefficients[0]
        precision = -1
        exponent = 0
    else:
        value, precision, exponent = pari_word_integer_real_product(
            coefficients[0], mantissas[offset], precisions[offset], exponents[offset]
        )
    for j in range(1, degree):
        k = offset + j
        # Upstream skips exact integer-zero matrix entries, not real zeros.
        if precisions[k] != -1 or mantissas[k] != 0:
            if precisions[k] == -1:
                term = mantissas[k] * coefficients[j]
                term_precision = -1
                term_exponent = 0
            else:
                term, term_precision, term_exponent = pari_word_integer_real_product(
                    coefficients[j], mantissas[k], precisions[k], exponents[k]
                )
            if precision == -1:
                if term_precision == -1:
                    value += term
                else:
                    value, precision, exponent = pari_word_integer_real_sum(
                        value, term, term_precision, term_exponent
                    )
            elif term_precision == -1:
                value, precision, exponent = pari_word_integer_real_sum(
                    term, value, precision, exponent
                )
            else:
                value, precision, exponent = pari_signed_real_sum(
                    value, precision, exponent, term, term_precision, term_exponent
                )
    return value, precision, exponent


@native
def pari_prepared_matrix_norm(
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    coefficients: IntegerBuffer,
    values_m: IntegerBuffer,
    values_p: IntegerBuffer,
    values_e: IntegerBuffer,
    degree: int,
    real_count: int,
) -> tuple[int, int, int]:
    """Prepared `nf_M` and coordinates to embedding norm in one native call.

    Matrix rows are flattened real/imaginary components, each of length
    `degree`. The three output workspaces each have at least `degree` slots.
    This bounded prototype requires real-valued resulting components; exact
    integer-only norm branches fail explicitly rather than being coerced.
    """
    if degree < 1 or real_count < 1 or real_count > degree:
        raise ValueError("unsupported prepared matrix signature")
    if (degree - real_count) % 2 != 0:
        raise ValueError("invalid prepared matrix signature")
    if real_count == degree and degree <= 5:
        bounded = 1
        for i in range(degree * degree):
            metadata_precision = matrix_p[i]
            metadata_exponent = matrix_e[i]
            if metadata_precision != -1 and (
                metadata_precision < 64
                or metadata_precision > 154112
                or metadata_precision % 64 != 0
            ):
                bounded = 0
            if (
                metadata_exponent < -9223372036854775808
                or metadata_exponent > 9223372036854775807
            ):
                bounded = 0
        if bounded != 0:
            bounded_m, bounded_p, bounded_e = pari_bounded_real_matrix_norm_fused(
                matrix_m,
                matrix_p,
                matrix_e,
                coefficients,
                checked_int64(degree),
            )
            return bounded_m, int(bounded_p), int(bounded_e)
    for i in range(degree):
        m, p, e = pari_prepared_embedding_row(
            matrix_m, matrix_p, matrix_e, coefficients, i * degree, degree
        )
        if p == -1:
            raise ValueError("exact integer norm component is not ported")
        values_m[i] = m
        values_p[i] = p
        values_e[i] = e
    if real_count == degree:
        return pari_prepared_real_norm(values_m, values_p, values_e, degree)
    return pari_prepared_mixed_norm(
        values_m, values_p, values_e, real_count, (degree - real_count) // 2
    )


@native
def pari_prepared_factorgen_numerical(
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    coefficients: IntegerBuffer,
    values_m: IntegerBuffer,
    values_p: IntegerBuffer,
    values_e: IntegerBuffer,
    degree: int,
    real_count: int,
    ideal_norm: int,
    bounded_real: int,
) -> tuple[int, int, int]:
    """Translate `buch2.c:factorgen` through its `e > -32` rejection.

    Zero ideal_norm represents upstream's absent NI pointer; supplied ideal
    norms must be positive. Output is integer norm, error exponent, and the
    numerical gate (1 means proceed to can_factor, not accept a relation).
    All matrix/norm prototype restrictions still apply.
    """
    if ideal_norm < 0:
        raise ValueError("ideal norm must be positive or absent")
    if bounded_real == 2:
        c0 = coefficients[0]
        c1 = coefficients[1]
        c2 = coefficients[2]
        norm = (
            c0 * c0 * c0
            + values_m[0] * c1 * c1 * c1
            + values_m[1] * c2 * c2 * c2
            + values_m[2] * c0 * c0 * c1
            + values_p[0] * c0 * c0 * c2
            + values_p[1] * c0 * c1 * c1
            + values_p[2] * c0 * c2 * c2
            + values_e[0] * c1 * c1 * c2
            + values_e[1] * c1 * c2 * c2
            + values_e[2] * c0 * c1 * c2
        )
        if ideal_norm != 0:
            if norm % ideal_norm != 0:
                raise ValueError("nonintegral prepared cubic norm quotient")
            norm //= ideal_norm
        return norm, -64, 1
    diagnostic_stage_switch(1)
    if bounded_real != 0:
        if real_count != degree or degree < 1 or degree > 5:
            raise ValueError("invalid trusted bounded real matrix signature")
        m, bounded_p, bounded_e = pari_bounded_real_matrix_norm_fused(
            matrix_m,
            matrix_p,
            matrix_e,
            coefficients,
            checked_int64(degree),
        )
        p = int(bounded_p)
        e = int(bounded_e)
    else:
        m, p, e = pari_prepared_matrix_norm(
            matrix_m,
            matrix_p,
            matrix_e,
            coefficients,
            values_m,
            values_p,
            values_e,
            degree,
            real_count,
        )
    diagnostic_stage_switch(2)
    if ideal_norm != 0:
        m, p, e = pari_real_integer_division(ideal_norm, m, p, e)
    diagnostic_stage_switch(3)
    norm, error = pari_round_real(m, p - e - 1, e)
    diagnostic_stage_switch(0)
    if error > -32:
        return norm, error, 0
    return norm, error, 1

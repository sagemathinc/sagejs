"""Prepared-mantissa prototype of PARI 2.17.4's short real product.

Derived from `src/kernel/none/mp_indep.c:mulrrz_i`, `mulrrz_3`, and
`mulrrz_end`. Copyright (C) The PARI group. GPL-2.0-or-later; without
warranty. See repository LICENSE.

This represents only the short-product branch with 64-bit words. It is not
a general PARI real runtime. Word products and carries are expressed with
exact Python integers, rather than PARI's machine carry intrinsics. That
representation difference must be measured, not called compiler overhead
without a same-representation control. Squares have a separate upstream
algorithm and must not be routed here merely because their values agree.
"""

from sagejs.native import IntegerBuffer, native
from math import gcd


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
    if p < 64 or p > 2048 or p % 64 != 0 or abs(m).bit_length() != p:
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
    if p < 64 or p > 2048 or p % 64 != 0 or abs(m).bit_length() != p:
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
    zero. The prototype admits at most 2,048 bits per operand, below the pinned
    short-product crossover; unsupported inputs fail explicitly.
    """
    if mx == 0 or my == 0:
        return 0, 0, ex + ey
    if px < 64 or py < 64 or px > 2048 or py > 2048:
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
    nx = px // 64
    ny = py // 64
    word = 1 << 64
    high = 0
    for i in range(nx):
        a = (mx >> (64 * (nx - 1 - i))) % word
        stop = nx - i + 1
        if stop > ny:
            stop = ny
        for j in range(stop):
            b = (my >> (64 * (ny - 1 - j))) % word
            term = a * b
            shift = 64 * (nx - 1 - i - j)
            if shift >= 0:
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
    if px < 64 or py < 64 or px > 2048 or py > 2048:
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
    """Use the shared short-product word sum below the square crossover.

    `sqrz_i` uses the same truncated word sum at these precisions, but switches
    to a full square earlier than multiplication. Limit this prototype to 512
    bits, below the pinned 64-bit GMP square crossover, rather than silently
    applying the short algorithm beyond it.
    """
    if mx == 0:
        return 0, 0, 2 * ex
    if px > 512:
        raise ValueError("short square prototype precision out of range")
    return pari_short_product(mx, px, ex, mx, px, ex)


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
    if px < 64 or py < 64 or px > 2048 or py > 2048:
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
) -> tuple[int, int, int]:
    """Translate `buch2.c:factorgen` through its `e > -32` rejection.

    Zero ideal_norm represents upstream's absent NI pointer; supplied ideal
    norms must be positive. Output is integer norm, error exponent, and the
    numerical gate (1 means proceed to can_factor, not accept a relation).
    All matrix/norm prototype restrictions still apply.
    """
    if ideal_norm < 0:
        raise ValueError("ideal norm must be positive or absent")
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
    if ideal_norm != 0:
        m, p, e = pari_real_integer_division(ideal_norm, m, p, e)
    norm, error = pari_round_real(m, p - e - 1, e)
    if error > -32:
        return norm, error, 0
    return norm, error, 1

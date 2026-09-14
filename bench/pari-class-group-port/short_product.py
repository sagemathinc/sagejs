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

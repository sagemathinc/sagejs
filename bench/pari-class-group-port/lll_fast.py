"""PARI 2.17.4 `lll.c:fplll_fast` on resident column-major buffers.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This is the fast pass, not PARI's complete LLL driver or its mandatory DPE pass.
"""

from sagejs.native import Float64Buffer, IntegerBuffer, native

from .lll_babai import pari_babai_dot, pari_babai_fast
from .lll_float_preparation import pari_lll_scale, pari_lll_set_line


@native
def pari_rotate_integer(
    values: IntegerBuffer, rows: int, old: int, new: int, temporary: IntegerBuffer
) -> int:
    """Rotate one flat column; unlike PARI's pointer rotation, copy its entries."""
    for i in range(rows):
        temporary[i] = values[old * rows + i]
    for j in range(old, new, -1):
        for i in range(rows):
            values[j * rows + i] = values[(j - 1) * rows + i]
    for i in range(rows):
        values[new * rows + i] = temporary[i]
    return 0


@native
def pari_rotate_float(
    values: Float64Buffer, rows: int, old: int, new: int, temporary: Float64Buffer
) -> int:
    """Rotate one float row/column block without changing its scalar order."""
    for i in range(rows):
        temporary[i] = values[old * rows + i]
    for j in range(old, new, -1):
        for i in range(rows):
            values[j * rows + i] = values[(j - 1) * rows + i]
    for i in range(rows):
        values[new * rows + i] = temporary[i]
    return 0


@native
def pari_rotate_gram(
    gram: Float64Buffer,
    d: int,
    old: int,
    new: int,
    maximum: int,
    temporary: Float64Buffer,
) -> int:
    """`rotateG_fast`, preserving the populated triangular cache."""
    for i in range(old + 1):
        temporary[i] = gram[old * d + i]
    for i in range(old + 1, maximum):
        temporary[i] = gram[i * d + old]
    for i in range(old, new, -1):
        for j in range(new):
            gram[i * d + j] = gram[(i - 1) * d + j]
        gram[i * d + new] = temporary[i - 1]
        for j in range(new + 1, i + 1):
            gram[i * d + j] = gram[(i - 1) * d + j - 1]
        for j in range(old + 1, maximum):
            gram[j * d + i] = gram[j * d + i - 1]
    for i in range(new):
        gram[new * d + i] = temporary[i]
    gram[new * d + new] = temporary[old]
    for i in range(old + 1, maximum):
        gram[i * d + new] = temporary[i]
    return 0


@native
def pari_lll_fast(
    basis: IntegerBuffer,
    transform: IntegerBuffer,
    n: int,
    d: int,
    transform_rows: int,
    delta: float,
    eta: float,
    keep_first: bool,
    mu: Float64Buffer,
    r: Float64Buffer,
    s: Float64Buffer,
    approximate: Float64Buffer,
    exponents: IntegerBuffer,
    gram: Float64Buffer,
    alpha: IntegerBuffer,
    column: IntegerBuffer,
    column_exponents: IntegerBuffer,
    normalized: Float64Buffer,
    temporary: Float64Buffer,
) -> int:
    """Run the fast pass, returning leading-zero count or upstream failure -1.

    All buffers are independent and caller-owned. `column`, `column_exponents`
    and `normalized` have at least max(n,d,transform_rows) entries, `temporary`
    at least one. Initialize transform as desired (normally identity), or use
    transform_rows=0 for U=NULL. The Babai zero-divisor policy remains explicit.
    """
    for j in range(d):
        for i in range(d):
            gram[j * d + i] = 0.0
            mu[j * d + i] = 0.0
            r[j * d + i] = 0.0
        s[j] = 0.0
        for i in range(n):
            column[i] = basis[j * n + i]
        exponents[j] = pari_lll_set_line(
            column, n, normalized, column_exponents, temporary
        )
        for i in range(n):
            approximate[j * n + i] = normalized[i]
    maximum_seen = 0
    max_gram = d
    zeros = 0
    while zeros < d:
        gram[zeros * d + zeros] = pari_babai_dot(approximate, n, zeros, zeros)
        if not (gram[zeros * d + zeros] <= 0.0):
            break
        zeros += 1
    kappa = zeros
    if zeros < d:
        r[zeros * d + zeros] = gram[zeros * d + zeros]
    for i in range(zeros, d):
        alpha[i] = 0
    while kappa + 1 < d:
        kappa += 1
        if kappa > maximum_seen:
            maximum_seen = kappa
            max_gram = kappa + 1
            for i in range(zeros, kappa + 1):
                gram[kappa * d + i] = pari_babai_dot(approximate, n, kappa, i)
        status = pari_babai_fast(
            basis,
            transform,
            n,
            d,
            transform_rows,
            kappa,
            alpha[kappa],
            zeros,
            max_gram,
            eta,
            mu,
            r,
            s,
            approximate,
            exponents,
            gram,
            column,
            column_exponents,
            normalized,
            temporary,
        )
        if status != 0:
            return -1
        value = pari_lll_scale(
            r[(kappa - 1) * d + kappa - 1] * delta,
            2 * (exponents[kappa - 1] - exponents[kappa]),
        )
        if (keep_first and kappa == 1) or value <= s[kappa - 1]:
            alpha[kappa] = kappa
            r[kappa * d + kappa] = (
                s[kappa - 1] - mu[kappa * d + kappa - 1] * r[kappa * d + kappa - 1]
            )
            continue
        old = kappa
        while True:
            kappa -= 1
            threshold = zeros + 1
            if keep_first:
                threshold += 1
            if kappa < threshold:
                break
            value = pari_lll_scale(
                r[(kappa - 1) * d + kappa - 1] * delta,
                2 * (exponents[kappa - 1] - exponents[old]),
            )
            if not (s[kappa - 1] <= value):
                break
        for i in range(kappa, old):
            if kappa <= alpha[i]:
                alpha[i] = kappa
        for i in range(old, kappa, -1):
            alpha[i] = alpha[i - 1]
        for i in range(old + 1, maximum_seen + 1):
            if kappa < alpha[i]:
                alpha[i] = kappa
        alpha[kappa] = kappa
        pari_rotate_float(mu, d, old, kappa, normalized)
        pari_rotate_float(r, d, old, kappa, normalized)
        r[kappa * d + kappa] = s[kappa]
        pari_rotate_integer(basis, n, old, kappa, column)
        pari_rotate_float(approximate, n, old, kappa, normalized)
        pari_rotate_integer(transform, transform_rows, old, kappa, column)
        pari_rotate_integer(exponents, 1, old, kappa, column)
        pari_rotate_gram(gram, d, old, kappa, max_gram, normalized)
        if kappa == zeros and gram[kappa * d + kappa] <= 0.0:
            zeros += 1
            kappa += 1
            gram[kappa * d + kappa] = pari_babai_dot(approximate, n, kappa, kappa)
            r[kappa * d + kappa] = gram[kappa * d + kappa]
    return zeros

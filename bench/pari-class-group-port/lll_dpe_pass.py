"""PARI 2.17.4 `lll.c:fplll_dpe`, the extended-exponent LLL pass.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This pass does not replace the upstream driver and its precision fallbacks.
"""

from sagejs.native import Float64Buffer, IntegerBuffer, native

from .lll_babai_dpe import pari_babai_dpe
from .lll_dpe import (
    pari_dpe_compare,
    pari_dpe_integer,
    pari_dpe_multiply,
    pari_dpe_normalize,
    pari_dpe_subtract_product,
)
from .lll_fast import pari_rotate_float, pari_rotate_integer


@native
def pari_rotate_exact_gram(
    gram: IntegerBuffer,
    d: int,
    old: int,
    new: int,
    maximum: int,
    temporary: IntegerBuffer,
) -> int:
    """`rotateG`: rotate the populated exact lower triangle in place."""
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
def pari_lll_dpe(
    gram: IntegerBuffer,
    basis: IntegerBuffer,
    transform: IntegerBuffer,
    n: int,
    d: int,
    transform_rows: int,
    incremental_gram: bool,
    delta: float,
    eta: float,
    keep_first: bool,
    mu: Float64Buffer,
    mu_exponents: IntegerBuffer,
    r: Float64Buffer,
    r_exponents: IntegerBuffer,
    s: Float64Buffer,
    s_exponents: IntegerBuffer,
    alpha: IntegerBuffer,
    integer_scratch: IntegerBuffer,
    float_scratch: Float64Buffer,
) -> int:
    """Return upstream leading-zero count, or -1 on Babai precision failure.

    All buffers are independent and caller-owned. Scratch vectors have at
    least max(n,d,transform_rows,1) entries. With `incremental_gram`, clear and
    build G as upstream does for G=NULL; otherwise use its supplied triangle.
    A failed incremental pass leaves private scratch G which the caller must
    discard (upstream publishes NULL). The output r diagonal retains DPE
    pairs; conversion to PARI real objects is a separate publication boundary.
    """
    delta_value, delta_exponent = pari_dpe_normalize(delta, 0)
    eta_value, eta_exponent = pari_dpe_normalize(eta, 0)
    for j in range(d):
        for i in range(d):
            if incremental_gram:
                gram[j * d + i] = 0
            mu[j * d + i] = 0.0
            mu_exponents[j * d + i] = 0
            r[j * d + i] = 0.0
            r_exponents[j * d + i] = 0
        s[j] = 0.0
        s_exponents[j] = 0
    max_gram = d
    if incremental_gram:
        max_gram = 2
    maximum_seen = 0
    zeros = 0
    while zeros < d:
        if incremental_gram:
            total = 0
            for i in range(n):
                total += basis[zeros * n + i] * basis[zeros * n + i]
            gram[zeros * d + zeros] = total
        value, exponent = pari_dpe_integer(gram[zeros * d + zeros], float_scratch)
        r[zeros * d + zeros] = value
        r_exponents[zeros * d + zeros] = exponent
        if gram[zeros * d + zeros] != 0:
            break
        zeros += 1
    kappa = zeros
    for i in range(zeros, d):
        alpha[i] = 0
    while kappa + 1 < d:
        kappa += 1
        if kappa > maximum_seen:
            maximum_seen = kappa
            if incremental_gram:
                for j in range(zeros, kappa + 1):
                    total = 0
                    for i in range(n):
                        total += basis[kappa * n + i] * basis[j * n + i]
                    gram[kappa * d + j] = total
                max_gram = maximum_seen + 1
        status = pari_babai_dpe(
            gram,
            basis,
            transform,
            n,
            d,
            transform_rows,
            kappa,
            alpha[kappa],
            zeros,
            max_gram,
            eta_value,
            eta_exponent,
            mu,
            mu_exponents,
            r,
            r_exponents,
            s,
            s_exponents,
            float_scratch,
        )
        if status != 0:
            return -1
        lovasz = keep_first and kappa == 1
        if not lovasz:
            value, exponent = pari_dpe_multiply(
                r[(kappa - 1) * d + kappa - 1],
                r_exponents[(kappa - 1) * d + kappa - 1],
                delta_value,
                delta_exponent,
            )
            lovasz = (
                pari_dpe_compare(value, exponent, s[kappa - 1], s_exponents[kappa - 1])
                <= 0
            )
        if lovasz:
            alpha[kappa] = kappa
            value, exponent = pari_dpe_subtract_product(
                s[kappa - 1],
                s_exponents[kappa - 1],
                mu[kappa * d + kappa - 1],
                mu_exponents[kappa * d + kappa - 1],
                r[kappa * d + kappa - 1],
                r_exponents[kappa * d + kappa - 1],
            )
            r[kappa * d + kappa] = value
            r_exponents[kappa * d + kappa] = exponent
            continue
        old = kappa
        while True:
            kappa -= 1
            threshold = zeros + 1
            if keep_first:
                threshold += 1
            if kappa < threshold:
                break
            value, exponent = pari_dpe_multiply(
                r[(kappa - 1) * d + kappa - 1],
                r_exponents[(kappa - 1) * d + kappa - 1],
                delta_value,
                delta_exponent,
            )
            if (
                pari_dpe_compare(value, exponent, s[kappa - 1], s_exponents[kappa - 1])
                < 0
            ):
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
        pari_rotate_float(mu, d, old, kappa, float_scratch)
        pari_rotate_integer(mu_exponents, d, old, kappa, integer_scratch)
        pari_rotate_float(r, d, old, kappa, float_scratch)
        pari_rotate_integer(r_exponents, d, old, kappa, integer_scratch)
        r[kappa * d + kappa] = s[kappa]
        r_exponents[kappa * d + kappa] = s_exponents[kappa]
        pari_rotate_integer(basis, n, old, kappa, integer_scratch)
        pari_rotate_integer(transform, transform_rows, old, kappa, integer_scratch)
        pari_rotate_exact_gram(gram, d, old, kappa, max_gram, integer_scratch)
        if kappa == zeros and gram[kappa * d + kappa] == 0:
            zeros += 1
            kappa += 1
            value, exponent = pari_dpe_integer(gram[kappa * d + kappa], float_scratch)
            r[kappa * d + kappa] = value
            r_exponents[kappa * d + kappa] = exponent
    return zeros

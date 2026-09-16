"""PARI 2.17.4 `lll.c:Babai_dpe`, with an exact resident Gram matrix.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
The pinned upstream ABI has 64-bit longs. Indices are zero-based and all
matrices retain PARI's column/first-index order in independent flat buffers.
"""

from math import ldexp

from sagejs.native import Float64Buffer, IntegerBuffer, native

from .lll_dpe import (
    pari_dpe_add,
    pari_dpe_divide,
    pari_dpe_integer,
    pari_dpe_normalize,
    pari_dpe_subtract,
    pari_dpe_subtract_product,
)


@native
def pari_babai_dpe(
    gram: IntegerBuffer,
    basis: IntegerBuffer,
    transform: IntegerBuffer,
    n: int,
    d: int,
    transform_rows: int,
    kappa: int,
    start: int,
    zeros: int,
    max_gram: int,
    eta: float,
    eta_exponent: int,
    mu: Float64Buffer,
    mu_exponents: IntegerBuffer,
    r: Float64Buffer,
    r_exponents: IntegerBuffer,
    s: Float64Buffer,
    s_exponents: IntegerBuffer,
    temporary: Float64Buffer,
) -> int:
    """Run `Babai_dpe`, including its exponent-history failure decision.

    `zeros` counts leading zero columns; `max_gram` is exclusive. `n=0` and
    `transform_rows=0` suppress upstream B/U updates respectively. `eta` is
    already normalized. The Gram matrix stores its lower triangle only.
    Scratch has one float; every other buffer is independent resident state.

    Signed exact products replace PARI's specialized add/submul integer
    primitives; floating branches retain upstream rounding and normalization.
    This representation choice has not yet been performance-qualified.
    """
    aa = start
    if aa < zeros:
        aa = zeros
    maximum = -2
    previous = -2
    while True:
        older = previous
        previous = maximum
        maximum = -2
        for j in range(aa, kappa):
            value, exponent = pari_dpe_integer(gram[kappa * d + j], temporary)
            for k in range(zeros, j):
                value, exponent = pari_dpe_subtract_product(
                    value,
                    exponent,
                    mu[j * d + k],
                    mu_exponents[j * d + k],
                    r[kappa * d + k],
                    r_exponents[kappa * d + k],
                )
            r[kappa * d + j] = value
            r_exponents[kappa * d + j] = exponent
            value, exponent = pari_dpe_divide(
                value, exponent, r[j * d + j], r_exponents[j * d + j]
            )
            mu[kappa * d + j] = value
            mu_exponents[kappa * d + j] = exponent
            if exponent > maximum:
                maximum = exponent
        if older != -2 and older <= previous + 5:
            return 1

        go_on = False
        for j in range(kappa - 1, zeros - 1, -1):
            exponent = mu_exponents[kappa * d + j]
            if exponent > eta_exponent or (
                exponent == eta_exponent and abs(mu[kappa * d + j]) > abs(eta)
            ):
                go_on = True
                break
        if not go_on:
            break

        for j in range(kappa - 1, zeros - 1, -1):
            value = mu[kappa * d + j]
            exponent = mu_exponents[kappa * d + j]
            if exponent < 0:
                continue
            small = exponent <= 0 or (exponent == 1 and abs(value) <= 0.75)
            positive = value > 0.0
            shift = 0
            magnitude = 1
            if not small:
                if exponent < 63:
                    magnitude = round(ldexp(abs(value), exponent))
                else:
                    shift = exponent - 63
                    magnitude = round(ldexp(abs(value), 63))
            for k in range(zeros, j):
                product = mu[j * d + k]
                product_exponent = mu_exponents[j * d + k]
                if not small:
                    # dpe_muluz normalizes BEFORE applying the power of two,
                    # including when multiplication produces a zero sentinel.
                    product, product_exponent = pari_dpe_normalize(
                        product * float(magnitude), product_exponent
                    )
                    product_exponent += shift
                if positive:
                    updated, updated_exponent = pari_dpe_subtract(
                        mu[kappa * d + k],
                        mu_exponents[kappa * d + k],
                        product,
                        product_exponent,
                    )
                else:
                    updated, updated_exponent = pari_dpe_add(
                        mu[kappa * d + k],
                        mu_exponents[kappa * d + k],
                        product,
                        product_exponent,
                    )
                mu[kappa * d + k] = updated
                mu_exponents[kappa * d + k] = updated_exponent

            multiplier = magnitude << shift
            if not positive:
                multiplier = -multiplier
            for i in range(n):
                basis[kappa * n + i] -= multiplier * basis[j * n + i]
            for i in range(transform_rows):
                transform[kappa * transform_rows + i] -= (
                    multiplier * transform[j * transform_rows + i]
                )
            # The diagonal needs the OLD cross term. Update it before the
            # triangular cross entries, exactly as in all six upstream cases.
            gram[kappa * d + kappa] += (
                multiplier * multiplier * gram[j * d + j]
                - 2 * multiplier * gram[kappa * d + j]
            )
            for i in range(j + 1):
                gram[kappa * d + i] -= multiplier * gram[j * d + i]
            for i in range(j + 1, kappa):
                gram[kappa * d + i] -= multiplier * gram[i * d + j]
            for i in range(kappa + 1, max_gram):
                gram[i * d + kappa] -= multiplier * gram[i * d + j]
        aa = zeros

    value, exponent = pari_dpe_integer(gram[kappa * d + kappa], temporary)
    s[zeros] = value
    s_exponents[zeros] = exponent
    for k in range(zeros, kappa - 1):
        value, exponent = pari_dpe_subtract_product(
            s[k],
            s_exponents[k],
            mu[kappa * d + k],
            mu_exponents[kappa * d + k],
            r[kappa * d + k],
            r_exponents[kappa * d + k],
        )
        s[k + 1] = value
        s_exponents[k + 1] = exponent
    return 0

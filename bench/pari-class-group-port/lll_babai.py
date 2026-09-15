"""PARI 2.17.4 `lll.c:Babai_fast` with resident flat workspaces.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Matrices use column-major storage; GSO arrays retain PARI's first-index order.
The public indices are zero-based. Floating division retains PARI's explicit
C infinity/NaN policy through a source helper rather than changing Python `/`.
"""

from math import frexp, ldexp

from sagejs.native import Float64Buffer, IntegerBuffer, native

from .lll_float_preparation import pari_lll_divide, pari_lll_scale, pari_lll_set_line


@native
def pari_babai_dot(values: Float64Buffer, n: int, first: int, second: int) -> float:
    """Retain `dbldotproduct`'s initial product and summation order."""
    total = values[first * n] * values[second * n]
    for i in range(1, n):
        total += values[first * n + i] * values[second * n + i]
    return total


@native
def pari_babai_fast(
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
    mu: Float64Buffer,
    r: Float64Buffer,
    s: Float64Buffer,
    approximate: Float64Buffer,
    exponents: IntegerBuffer,
    gram: Float64Buffer,
    column: IntegerBuffer,
    column_exponents: IntegerBuffer,
    normalized: Float64Buffer,
    temporary: Float64Buffer,
) -> int:
    """Run upstream Babai iterations, returning its stagnation flag.

    `zeros` is the number of leading zero columns; `max_gram` is an exclusive
    column bound. All buffers are independent, pre-sized, caller-owned storage.
    Set `transform_rows=0` for upstream U=NULL. No mathematical retry cap is
    inserted; the upstream three-generation exponent test is preserved.
    """
    aa = start
    if aa < zeros:
        aa = zeros
    maximum = -2
    previous = -2
    changed = False
    while True:
        older = previous
        previous = maximum
        maximum = -2
        for j in range(aa, kappa):
            value = gram[kappa * d + j]
            for k in range(zeros, j):
                value -= mu[j * d + k] * r[kappa * d + k]
            r[kappa * d + j] = value
            mu[kappa * d + j] = pari_lll_divide(value, r[j * d + j])
            difference = exponents[kappa] - exponents[j]
            if difference > maximum:
                maximum = difference
        if older != -2 and older <= previous + 5:
            return 1
        go_on = False
        for j in range(kappa - 1, zeros - 1, -1):
            value = pari_lll_scale(mu[kappa * d + j], exponents[kappa] - exponents[j])
            if abs(value) > eta:
                go_on = True
                break
        if not go_on:
            break
        for j in range(kappa - 1, zeros - 1, -1):
            shift = exponents[j] - exponents[kappa]
            value = pari_lll_scale(mu[kappa * d + j], -shift)
            absolute = abs(value)
            if absolute <= 0.5:
                continue
            changed = True
            if absolute <= 1.5:
                if mu[kappa * d + j] > 0.0:
                    for k in range(zeros, j):
                        mu[kappa * d + k] -= pari_lll_scale(mu[j * d + k], shift)
                    for i in range(n):
                        basis[kappa * n + i] -= basis[j * n + i]
                    for i in range(transform_rows):
                        transform[kappa * transform_rows + i] -= transform[
                            j * transform_rows + i
                        ]
                else:
                    for k in range(zeros, j):
                        mu[kappa * d + k] += pari_lll_scale(mu[j * d + k], shift)
                    for i in range(n):
                        basis[kappa * n + i] += basis[j * n + i]
                    for i in range(transform_rows):
                        transform[kappa * transform_rows + i] += transform[
                            j * transform_rows + i
                        ]
                continue
            multiplier = 0
            power = 0
            if absolute < 9007199254740992.0:
                multiplier = round(value)
                rounded = float(multiplier)
                for k in range(zeros, j):
                    mu[kappa * d + k] -= pari_lll_scale(rounded * mu[j * d + k], shift)
            else:
                mantissa, exponent = frexp(mu[kappa * d + j])
                multiplier = int(ldexp(mantissa, 53))
                power = exponent - shift - 53
                if power <= 0:
                    multiplier = multiplier << -power
                    power = 0
                for k in range(zeros, j):
                    mu[kappa * d + k] -= pari_lll_scale(
                        float(multiplier) * mu[j * d + k], power + shift
                    )
            # PARI selects signed small-integer multiply/add primitives here.
            # Exact arithmetic preserves the update; allocation costs differ.
            for i in range(n):
                basis[kappa * n + i] -= (basis[j * n + i] * multiplier) << power
            for i in range(transform_rows):
                transform[kappa * transform_rows + i] -= (
                    transform[j * transform_rows + i] * multiplier
                ) << power
        for i in range(n):
            column[i] = basis[kappa * n + i]
        exponents[kappa] = pari_lll_set_line(
            column, n, normalized, column_exponents, temporary
        )
        for i in range(n):
            approximate[kappa * n + i] = normalized[i]
        for i in range(zeros, kappa):
            gram[kappa * d + i] = pari_babai_dot(approximate, n, kappa, i)
        aa = zeros
    if changed:
        for i in range(kappa, max_gram):
            gram[i * d + kappa] = pari_babai_dot(approximate, n, kappa, i)
    s[zeros] = gram[kappa * d + kappa]
    for k in range(zeros, kappa - 1):
        s[k + 1] = s[k] - mu[kappa * d + k] * r[kappa * d + k]
    return 0

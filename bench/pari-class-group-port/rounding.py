"""PARI 2.17.4 real-to-integer rounding, prepared mantissa boundary only.

Translated from `gen3.c:round_i` and the real branch of `grndtoi`.
Copyright (C) The PARI group. SPDX-License-Identifier: GPL-2.0-or-later.
Distributed under GPL v2 or later, without warranty; see repository LICENSE.

This is a compiled rounding block, not a compiled norm implementation.
Input is the full signed PARI mantissa, its denominator exponent and the stored
real exponent. Do not normalize trailing zero bits or discard zero precision.
"""

from sagejs.native import native


@native
def pari_round_real(m: int, e: int, exponent: int) -> tuple[int, int]:
    """Return `(rounded_integer, error_exponent)` for a prepared PARI real.

    `x = m / 2**e`; `exponent` is PARI's stored `expo(x)`, also for zero.
    Inputs must come from a valid real representation. This does not handle PARI
    integer/complex objects, nor emulate floating arithmetic that produced `x`.
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

"""PARI 2.17.4 lll.c:sizered for the rank-two experiment's FLATTER blocks.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This preserves the inverse/product/round/product order, not a direct solve.
"""

from sagejs.native import IntegerBuffer, native
from .householder import pari_qr_add, pari_qr_load, pari_qr_multiply, pari_qr_store
from .exponential import pari_real_reciprocal
from .real_division import pari_real_division
from .short_product import pari_round_real


@native
def pari_lll_multiply(
    left: IntegerBuffer,
    right: IntegerBuffer,
    rows: int,
    inner: int,
    columns: int,
    out: IntegerBuffer,
) -> int:
    """RgM_mul generic integer/real dot products, including integer-zero skips."""
    for j in range(columns):
        for i in range(rows):
            sm, sp, se = 0, -1, 0
            for k in range(inner):
                m, p, e = pari_qr_load(left, i * inner + k)
                v, q, f = pari_qr_load(right, k * columns + j)
                if k == 0 or m != 0 or p != -1:
                    # Generic gmul differs from mpmul for integer zero.
                    if (m == 0 and p == -1) or (v == 0 and q == -1):
                        m, p, e = 0, -1, 0
                    else:
                        m, p, e = pari_qr_multiply(m, p, e, v, q, f)
                    if k == 0:
                        sm, sp, se = m, p, e
                    else:
                        sm, sp, se = pari_qr_add(sm, sp, se, m, p, e)
            pari_qr_store(out, i * columns + j, sm, sp, se)
    return 0


@native
def pari_lll_sizered(
    t1: IntegerBuffer,
    t3: IntegerBuffer,
    r1: IntegerBuffer,
    r2: IntegerBuffer,
    n: int,
    columns: int,
    inverse: IntegerBuffer,
    first: IntegerBuffer,
    second: IntegerBuffer,
    final: IntegerBuffer,
    rounded: IntegerBuffer,
    out: IntegerBuffer,
) -> int:
    """sizered for 1x1/2x2 left blocks, with independent caller-owned scratch."""
    if n < 1 or n > 2 or columns < 1 or columns > 2:
        raise ValueError("unsupported FLATTER size-reduction block")
    if len(t1) < n * n or len(t3) < columns * columns:
        raise ValueError("size-reduction transform storage too small")
    if len(r1) < 3 * n * n or len(r2) < 3 * n * columns:
        raise ValueError("size-reduction input storage too small")
    if len(inverse) < 12 or len(first) < 12 or len(second) < 12 or len(final) < 12:
        raise ValueError("size-reduction real scratch too small")
    if len(rounded) < 4 or len(out) < 4:
        raise ValueError("size-reduction integer scratch too small")
    determinant = t1[0]
    if n == 2:
        determinant = t1[0] * t1[3] - t1[1] * t1[2]
    if abs(determinant) != 1:
        raise ValueError("left transform must be unimodular")
    for i in range(n * n):
        pari_qr_store(inverse, i, 0, -1, 0)
    for i in range(n):
        m, p, e = pari_qr_load(r1, i * n + i)
        if p < 64 or m == 0:
            raise ValueError("size-reduction diagonal must be a nonzero real")
        m, p, e = pari_real_reciprocal(m, p, e)
        pari_qr_store(inverse, i * n + i, m, p, e)
    if n == 2:
        m, p, e = pari_qr_load(r1, 1)
        if not (m == 0 and p == -1):
            v, q, f = pari_qr_load(inverse, 3)
            m, p, e = pari_qr_multiply(m, p, e, v, q, f)
            v, q, f = pari_qr_load(r1, 0)
            m, p, e = pari_real_division(-m, p, e, v, q, f)
            pari_qr_store(inverse, 1, m, p, e)
    pari_lll_multiply(inverse, r2, n, n, columns, first)
    for i in range(columns * columns):
        pari_qr_store(inverse, i, t3[i], -1, 0)
    pari_lll_multiply(first, inverse, n, columns, columns, second)
    if n == 1:
        pari_qr_store(inverse, 0, determinant, -1, 0)
    else:
        pari_qr_store(inverse, 0, t1[3] * determinant, -1, 0)
        pari_qr_store(inverse, 1, -t1[1] * determinant, -1, 0)
        pari_qr_store(inverse, 2, -t1[2] * determinant, -1, 0)
        pari_qr_store(inverse, 3, t1[0] * determinant, -1, 0)
    pari_lll_multiply(inverse, second, n, n, columns, final)
    for i in range(n * columns):
        m, p, e = pari_qr_load(final, i)
        if p == -1:
            rounded[i] = m
        else:
            value, error = pari_round_real(m, p - 1 - e, e)
            rounded[i] = value
    for j in range(columns):
        for i in range(n):
            value = 0
            for k in range(n):
                value -= t1[i * n + k] * rounded[k * columns + j]
            out[i * columns + j] = value
    return 0

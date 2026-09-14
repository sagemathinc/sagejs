"""PARI 2.17.4 bibli1.c Householder QR for the ideal collector.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Packed scalar triples use precision -1 for exact integers and 0 for real zero.
Matrix slots are row-major. Scratch and output storage are caller-owned.
"""

from sagejs.native import IntegerBuffer, native

from .exponential import pari_real_reciprocal, pari_real_resize
from .real_conversion import pari_integer_to_real
from .real_square_root import pari_real_square_root_abs
from .short_product import (
    pari_short_product,
    pari_short_square,
    pari_signed_real_sum,
    pari_word_integer_real_product,
    pari_word_integer_real_sum,
)


@native
def pari_qr_store(a: IntegerBuffer, slot: int, m: int, p: int, e: int) -> int:
    a[3 * slot] = m
    a[3 * slot + 1] = p
    a[3 * slot + 2] = e
    return 0


@native
def pari_qr_load(a: IntegerBuffer, slot: int) -> tuple[int, int, int]:
    return a[3 * slot], a[3 * slot + 1], a[3 * slot + 2]


@native
def pari_qr_add(m: int, p: int, e: int, v: int, q: int, f: int) -> tuple[int, int, int]:
    if p == -1:
        if q == -1:
            return m + v, -1, 0
        return pari_word_integer_real_sum(m, v, q, f)
    if q == -1:
        return pari_word_integer_real_sum(v, m, p, e)
    return pari_signed_real_sum(m, p, e, v, q, f)


@native
def pari_qr_multiply(
    m: int, p: int, e: int, v: int, q: int, f: int
) -> tuple[int, int, int]:
    """mpmul, not generic gmul: integer-zero products remain real zeros."""
    if p == -1 and q == -1:
        return m * v, -1, 0
    if p != -1 and q != -1:
        return pari_short_product(m, p, e, v, q, f)
    if q == -1:
        m, v = v, m
        p, q = q, p
        e, f = f, e
    if m == 0:
        if q > 0:
            return 0, 0, f - q
        if f < 0:
            return 0, 0, 2 * f
        return 0, 0, 0
    return pari_word_integer_real_product(m, v, q, f)


@native
def pari_qr_square(m: int, p: int, e: int) -> tuple[int, int, int]:
    if p == -1:
        return m * m, -1, 0
    return pari_short_square(m, p, e)


@native
def pari_prepared_householder(
    matrix: IntegerBuffer,
    n: int,
    precision: int,
    result: IntegerBuffer,
    vectors: IntegerBuffer,
    betas: IntegerBuffer,
    norms: IntegerBuffer,
    column: IntegerBuffer,
) -> int:
    """QR_init followed by gaussred_from_QR, returning 0 on upstream failure.

    Input is the prepared square integer/real matrix, not a QR factorization.
    Initial requested precision is at most 512 bits (current square leaf).
    Unsupported multiword mixed-integer arithmetic fails explicitly.
    On failure only the returned status, not incomplete scratch, is meaningful.
    """
    if n < 1 or n > 10 or precision < 64 or precision > 512 or precision % 64 != 0:
        raise ValueError("unsupported QR shape or precision")
    if len(matrix) < 3 * n * n or len(result) < 3 * n * n:
        raise ValueError("QR matrix storage too small")
    if len(vectors) < 3 * n * n or len(betas) < 3 * n:
        raise ValueError("QR reflector storage too small")
    if len(norms) < 3 * n or len(column) < 3 * n:
        raise ValueError("QR column storage too small")
    for i in range(n * n):
        pari_qr_store(result, i, 0, -1, 0)
    for j in range(n):
        for i in range(n):
            m, p, e = pari_qr_load(matrix, i * n + j)
            pari_qr_store(column, i, m, p, e)
        # ApplyAllQ / ApplyQ in upstream reflector and dot-product order.
        for h in range(j):
            sm, sp, se = pari_qr_load(vectors, h * n + h)
            m, p, e = pari_qr_load(column, h)
            sm, sp, se = pari_qr_multiply(sm, sp, se, m, p, e)
            for i in range(h + 1, n):
                v, q, f = pari_qr_load(vectors, h * n + i)
                m, p, e = pari_qr_load(column, i)
                m, p, e = pari_qr_multiply(v, q, f, m, p, e)
                sm, sp, se = pari_qr_add(sm, sp, se, m, p, e)
            m, p, e = pari_qr_load(betas, h)
            sm, sp, se = pari_qr_multiply(m, p, e, sm, sp, se)
            for i in range(h, n):
                v, q, f = pari_qr_load(vectors, h * n + i)
                if v != 0:
                    v, q, f = pari_qr_multiply(sm, sp, se, v, q, f)
                    m, p, e = pari_qr_load(column, i)
                    m, p, e = pari_qr_add(m, p, e, -v, q, f)
                    pari_qr_store(column, i, m, p, e)
        # FindApplyQ; keep integer squares exact until gsqrt dispatch.
        xm, xp, xe = pari_qr_load(column, j)
        sm, sp, se = pari_qr_square(xm, xp, xe)
        if j < n - 1:
            for i in range(j + 1, n):
                m, p, e = pari_qr_load(column, i)
                pari_qr_store(vectors, j * n + i, m, p, e)
                m, p, e = pari_qr_square(m, p, e)
                sm, sp, se = pari_qr_add(sm, sp, se, m, p, e)
            if sm == 0:
                return 0
            m, p, e = sm, sp, se
            if p == -1:
                m, p, e = pari_integer_to_real(m, precision)
            m, p, e = pari_real_square_root_abs(m, p, e)
            if xm < 0:
                m = -m
            v, q, f = pari_qr_add(xm, xp, xe, m, p, e)
            pari_qr_store(vectors, j * n + j, v, q, f)
            pari_qr_store(result, j * n + j, -m, p, e)
            if xm == 0:
                if sp == -1:
                    v, q, f = pari_integer_to_real(sm, precision)
                else:
                    v, q, f = pari_real_resize(sm, sp, se, precision)
            else:
                v, q, f = pari_qr_multiply(m, p, e, xm, xp, xe)
                v, q, f = pari_qr_add(sm, sp, se, v, q, f)
            v, q, f = pari_real_reciprocal(v, q, f)
            pari_qr_store(betas, j, v, q, f)
        else:
            pari_qr_store(result, j * n + j, xm, xp, xe)
        pari_qr_store(norms, j, sm, sp, se)
        for i in range(j):
            m, p, e = pari_qr_load(column, i)
            pari_qr_store(result, i * n + j, m, p, e)
        if sp != -1 and sp <= 64 and se >= 32:
            return 0
    # Store transposed L directly: normalize its upper-triangular rows.
    for j in range(n - 1):
        m, p, e = pari_qr_load(result, j * n + j)
        m, p, e = pari_real_reciprocal(m, p, e)
        for i in range(j + 1, n):
            v, q, f = pari_qr_load(result, j * n + i)
            v, q, f = pari_qr_multiply(m, p, e, v, q, f)
            pari_qr_store(result, j * n + i, v, q, f)
    for j in range(n):
        m, p, e = pari_qr_load(norms, j)
        pari_qr_store(result, j * n + j, m, p, e)
    return 1

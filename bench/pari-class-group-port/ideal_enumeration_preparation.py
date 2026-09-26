"""PARI 2.17.4 Fincke_Pohst_ideal's post-LLL numerical preparation.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Translate buch2.c's I*U, G*ideal and QR/bound preparation. Supplied U is
explicit scaffolding until connected to the translated LLL entry.
"""

from sagejs.native import Float64Buffer, IntegerBuffer, native

from .enumeration_preparation import pari_prepare_enumeration
from .householder import pari_qr_add, pari_qr_load, pari_qr_store
from .short_product import pari_word_integer_real_product


@native
def pari_ideal_embedding(
    original_ideal: IntegerBuffer,
    transform: IntegerBuffer,
    embedding: IntegerBuffer,
    n: int,
    ideal: IntegerBuffer,
    matrix: IntegerBuffer,
) -> int:
    """Return skipfirst after ZM_mul(I,U) and RgM_mul(G,ideal).

    I and output ideal are row-major, U is column-major (the LLL output),
    and G/matrix use row-major scalar triples. Buffers must be disjoint.
    Generic gmul/gadd retain exact-zero and real-zero distinctions. Mixed
    integer-real arithmetic still has the declared single-word capability.
    """
    if (
        n < 1
        or n > 10
        or len(original_ideal) < n * n
        or len(transform) < n * n
        or len(ideal) < n * n
        or len(embedding) < 3 * n * n
        or len(matrix) < 3 * n * n
    ):
        raise ValueError("invalid ideal embedding storage")
    for i in range(n):
        for j in range(n):
            value = 0
            for k in range(n):
                value += original_ideal[i * n + k] * transform[j * n + k]
            ideal[i * n + j] = value
    skipfirst = 1
    for i in range(1, n):
        if ideal[i * n] != 0:
            skipfirst = 0
    # RgMrow_RgC_mul_i evaluates the first product even if G[i,0] is zero,
    # then skips only exact integer-zero matrix entries, never real zeros.
    for i in range(n):
        for j in range(n):
            m, p, e = pari_qr_load(embedding, i * n)
            if p == -1:
                m = m * ideal[j]
                e = 0
            else:
                m, p, e = pari_word_integer_real_product(ideal[j], m, p, e)
            for k in range(1, n):
                v, q, f = pari_qr_load(embedding, i * n + k)
                if q != -1 or v != 0:
                    if q == -1:
                        v = v * ideal[k * n + j]
                        f = 0
                    else:
                        v, q, f = pari_word_integer_real_product(
                            ideal[k * n + j], v, q, f
                        )
                    m, p, e = pari_qr_add(m, p, e, v, q, f)
            pari_qr_store(matrix, i * n + j, m, p, e)
    return skipfirst


@native
def pari_ideal_prepare_enumeration(
    original_ideal: IntegerBuffer,
    transform: IntegerBuffer,
    embedding: IntegerBuffer,
    n: int,
    precision: int,
    scale: float,
    ideal: IntegerBuffer,
    matrix: IntegerBuffer,
    flags: IntegerBuffer,
    reduction: IntegerBuffer,
    vectors: IntegerBuffer,
    betas: IntegerBuffer,
    norms: IntegerBuffer,
    column: IntegerBuffer,
    float_q: Float64Buffer,
    float_v: Float64Buffer,
    bound: Float64Buffer,
    cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> int:
    """Connect ideal/embedding products to QR and the enumeration bound.

    flags[0] is upstream skipfirst. Status has pari_prepare_enumeration's
    meaning: -1 QR failure, 0 conversion rejection, positive last root degree.
    U is supplied, not discovered here; no class-group completion is claimed.
    """
    if len(flags) < 1:
        raise ValueError("missing ideal preparation flag storage")
    flags[0] = pari_ideal_embedding(
        original_ideal, transform, embedding, n, ideal, matrix
    )
    return pari_prepare_enumeration(
        matrix,
        n,
        precision,
        scale,
        reduction,
        vectors,
        betas,
        norms,
        column,
        float_q,
        float_v,
        bound,
        cache,
        a,
        b,
        p,
        q,
        stack,
    )

"""Connected PARI 2.17.4 ranked ideal reduction and enumeration preparation.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Prepared nf G/G0 and the candidate ideal are inputs, not an upstream LLL
answer. Rank remains supplied and missing precision fallbacks stay explicit.
"""

from sagejs.native import Float64Buffer, IntegerBuffer, native

from .flatter import pari_flatter_product
from .ideal_enumeration_preparation import pari_ideal_prepare_enumeration
from .lll_ranked_basis import pari_lll_ranked_basis


@native
def pari_ideal_ranked_preparation(
    original_ideal: IntegerBuffer,
    rounded_embedding: IntegerBuffer,
    embedding: IntegerBuffer,
    n: int,
    rank: int,
    precision: int,
    scale: float,
    original: IntegerBuffer,
    basis: IntegerBuffer,
    transform: IntegerBuffer,
    ideal: IntegerBuffer,
    flags: IntegerBuffer,
    selection: IntegerBuffer,
    stages: IntegerBuffer,
    flatter_input: IntegerBuffer,
    current: IntegerBuffer,
    flatter_transform: IntegerBuffer,
    total_work: IntegerBuffer,
    step_t: IntegerBuffer,
    step_s: IntegerBuffer,
    product: IntegerBuffer,
    next_basis: IntegerBuffer,
    qr_input: IntegerBuffer,
    qr: IntegerBuffer,
    vectors: IntegerBuffer,
    betas: IntegerBuffer,
    norms: IntegerBuffer,
    column: IntegerBuffer,
    y: IntegerBuffer,
    diagnostic: IntegerBuffer,
    r1: IntegerBuffer,
    r2: IntegerBuffer,
    r3: IntegerBuffer,
    t1: IntegerBuffer,
    t2: IntegerBuffer,
    t3: IntegerBuffer,
    integers: IntegerBuffer,
    inverse: IntegerBuffer,
    first: IntegerBuffer,
    second: IntegerBuffer,
    final: IntegerBuffer,
    rounded: IntegerBuffer,
    mu: Float64Buffer,
    r: Float64Buffer,
    s: Float64Buffer,
    approximate: Float64Buffer,
    exponents: IntegerBuffer,
    float_gram: Float64Buffer,
    gram: IntegerBuffer,
    mu_exponents: IntegerBuffer,
    r_exponents: IntegerBuffer,
    s_exponents: IntegerBuffer,
    alpha: IntegerBuffer,
    column_exponents: IntegerBuffer,
    float_scratch: Float64Buffer,
    temporary: Float64Buffer,
    float_q: Float64Buffer,
    float_v: Float64Buffer,
    bound: Float64Buffer,
    cache: IntegerBuffer,
    root_a: IntegerBuffer,
    root_b: IntegerBuffer,
    root_p: IntegerBuffer,
    root_q: IntegerBuffer,
    root_stack: IntegerBuffer,
) -> int:
    """Fincke_Pohst_ideal preparation with no supplied LLL transformation.

    All scratch buffers are disjoint. QR storage is reused after LLL has
    finished. On success qr_input is G*ideal and qr is its Gauss reduction.
    Return 0 on success, 1..4 for the ranked LLL dependency statuses, 5 for
    subsequent QR failure, 6 for float conversion rejection. flags holds
    skipfirst and the final bound root degree; neither is a class invariant.
    """
    if (
        n < 3
        or n > 4
        or len(flags) < 2
        or len(rounded_embedding) < n * n
        or len(original_ideal) < n * n
        or len(original) < n * n
    ):
        raise ValueError("invalid ranked ideal preparation input")
    flags[0] = -1
    flags[1] = -1
    pari_flatter_product(rounded_embedding, original_ideal, n, original)
    status = pari_lll_ranked_basis(
        original,
        n,
        rank,
        basis,
        transform,
        selection,
        stages,
        flatter_input,
        current,
        flatter_transform,
        total_work,
        step_t,
        step_s,
        product,
        next_basis,
        qr_input,
        qr,
        vectors,
        betas,
        norms,
        column,
        y,
        diagnostic,
        r1,
        r2,
        r3,
        t1,
        t2,
        t3,
        integers,
        inverse,
        first,
        second,
        final,
        rounded,
        mu,
        r,
        s,
        approximate,
        exponents,
        float_gram,
        gram,
        mu_exponents,
        r_exponents,
        s_exponents,
        alpha,
        column_exponents,
        float_scratch,
        temporary,
    )
    if status != 0:
        return status
    status = pari_ideal_prepare_enumeration(
        original_ideal,
        transform,
        embedding,
        n,
        precision,
        scale,
        ideal,
        qr_input,
        flags,
        qr,
        vectors,
        betas,
        norms,
        column,
        float_q,
        float_v,
        bound,
        cache,
        root_a,
        root_b,
        root_p,
        root_q,
        root_stack,
    )
    if status < 0:
        return 5
    if status == 0:
        return 6
    flags[1] = status
    return 0

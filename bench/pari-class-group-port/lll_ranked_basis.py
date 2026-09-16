"""Connected PARI 2.17.4 rank-supplied LLL_IM preparation for degrees 3/4.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This remains an explicit segment: rank computation and heuristic/proved
precision fallback implementations are not supplied by this entry.
"""

from sagejs.native import Float64Buffer, IntegerBuffer, native

from .flatter import pari_flatter, pari_flatter_product
from .lll_dpe_pass import pari_lll_dpe
from .lll_fast import pari_lll_fast
from .lll_selection import pari_lll_select_full_rank


@native
def pari_lll_ranked_basis(
    original: IntegerBuffer,
    n: int,
    rank: int,
    basis: IntegerBuffer,
    transform: IntegerBuffer,
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
) -> int:
    """Connect selector, FLATTER, fast and DPE in one closed native call.

    `original` is row-major; output basis/U are column-major, as in the LLL
    pass implementations. Rank is a separately measured supplied dependency.
    Only LLL_IM, delta=.99, eta=.51, without KEEP_FIRST is included here.
    All scratch buffers are independent, using the called routines' sizes.
    Selection has five slots; stages has four (FLATTER called, fast status,
    DPE status, final zeros), initialized to 0/-999/-999/-999.

    Return 0 on completion; 1 for unported rank, 2 for FLATTER precision
    boundary, 3 for required heuristic pass, 4 for required proved pass.
    These unresolved statuses are NOT PARI algorithm failures or rejections.
    """
    if len(stages) < 4:
        raise ValueError("LLL stage storage too small")
    stages[0] = 0
    for i in range(1, 4):
        stages[i] = -999
    use_flatter, upper, lower = pari_lll_select_full_rank(
        original, n, rank, False, qr_input, qr, vectors, betas, norms, column, selection
    )
    if use_flatter < 0:
        return 1
    if use_flatter != 0:
        stages[0] = 1
        for i in range(n):
            for j in range(n):
                value = original[i * n + j]
                if lower != 0:
                    value = original[(n - 1 - i) * n + n - 1 - j]
                flatter_input[i * n + j] = value
        status = pari_flatter(
            flatter_input,
            n,
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
        )
        if status != 1:
            return 2
        # fplll_flatter publishes U*T and B*T even though the FLATTER helper
        # has an equivalent current basis internally. Retain those products.
        for i in range(n):
            for j in range(n):
                step_t[i * n + j] = 0
                if i == j:
                    step_t[i * n + j] = 1
        pari_flatter_product(step_t, flatter_transform, n, total_work)
        pari_flatter_product(flatter_input, flatter_transform, n, product)
        for i in range(n):
            for j in range(n):
                source_row = i
                if lower != 0:
                    source_row = n - 1 - i
                basis[j * n + i] = product[source_row * n + j]
                transform[j * n + i] = total_work[source_row * n + j]
    else:
        for i in range(n):
            for j in range(n):
                basis[j * n + i] = original[i * n + j]
                transform[j * n + i] = 0
                if i == j:
                    transform[j * n + i] = 1
    fast_status = pari_lll_fast(
        basis,
        transform,
        n,
        n,
        n,
        0.99,
        0.51,
        False,
        mu,
        r,
        s,
        approximate,
        exponents,
        float_gram,
        alpha,
        column,
        column_exponents,
        float_scratch,
        temporary,
    )
    stages[1] = fast_status
    if fast_status < 0:
        return 3
    dpe_status = pari_lll_dpe(
        gram,
        basis,
        transform,
        n,
        n,
        n,
        True,
        0.99,
        0.51,
        False,
        mu,
        mu_exponents,
        r,
        r_exponents,
        s,
        s_exponents,
        alpha,
        column_exponents,
        float_scratch,
    )
    stages[2] = dpe_status
    if dpe_status < 0:
        return 4
    stages[3] = dpe_status
    return 0

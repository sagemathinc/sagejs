"""PARI 2.17.4 QR/cursor/filter path up to the factorgen boundary.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Prepared ideal and embedding matrices still come from external scaffolding.
"""

from sagejs.native import Float64Buffer, Int64Buffer, IntegerBuffer, native

from .candidate_element import pari_candidate_element
from .enumeration_batch import pari_qr_enumeration_batch


@native
def pari_next_factor_candidate(
    matrix: IntegerBuffer,
    ideal: IntegerBuffer,
    n: int,
    precision: int,
    scale: float,
    skipfirst: int,
    track_small: int,
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
    x: Int64Buffer,
    y: Float64Buffer,
    z: Float64Buffer,
    inc: Int64Buffer,
    state: Int64Buffer,
    cursor_output: Int64Buffer,
    element: IntegerBuffer,
    counters: Int64Buffer,
) -> int:
    """Yield 1 at factorgen input, 0 on exhaustion, -3 at the factor limit.

    QR/conversion failures retain -1/-2. Counters are try_factor and Nsmall;
    initialize both to zero for a new ideal. All buffers are distinct and
    caller-owned, with the same unchanged-input resume contract as the raw
    enumeration batch. Rejections stay inside this call; admission is still
    an explicit outer boundary. A limit return is sticky without advancing
    the cursor or changing the element again.
    """
    if len(counters) < 2:
        raise ValueError("candidate search counter storage too small")
    if counters[0] > 500:
        return -3
    while True:
        count, status = pari_qr_enumeration_batch(
            matrix,
            n,
            precision,
            scale,
            skipfirst,
            1,
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
            x,
            y,
            z,
            inc,
            state,
            cursor_output,
        )
        if status < 0:
            return status
        if count == 0:
            return 0
        accepted = pari_candidate_element(x, ideal, n, element, counters, track_small)
        if accepted < 0:
            return -3
        if accepted != 0:
            return 1

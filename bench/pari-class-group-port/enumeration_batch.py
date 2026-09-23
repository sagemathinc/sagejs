"""Connected PARI numerical preparation and resumable candidate enumeration.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Candidate export is scaffolding: factor admission and relations are still absent.
"""

from sagejs.native import (
    Float64Buffer,
    Int64Buffer,
    IntegerBuffer,
    checked_uint64,
    native,
)

from .enumeration import pari_fp_next
from .enumeration_preparation import pari_prepare_enumeration


@native
def pari_qr_enumeration_batch(
    matrix: IntegerBuffer,
    n: int,
    precision: int,
    scale: float,
    skipfirst: int,
    batch: int,
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
    output: Int64Buffer,
) -> tuple[int, int]:
    """Prepare once, then return candidate batches without rebuilding QR.

    Each output record has the cumulative trial counter then n coordinates.
    Status 1 is cursor exhaustion, 0 a filled batch, -1 QR failure and -2
    coefficient conversion failure. State has the cursor's four slots plus
    the last root degree; initialize it to zero. A positive state[4] may also
    be supplied by the connected ideal preparation, with all QR outputs already
    resident; this does not initialize or advance the enumeration cursor.
    All buffers must be distinct.
    A resumed call uses the resident preparation: callers must not change the
    matrix, dimensions, precision, trial scale or skipfirst between batches.
    """
    if n < 2 or n > 10 or batch < 1 or (skipfirst != 0 and skipfirst != 1):
        raise ValueError("invalid enumeration batch configuration")
    if len(state) < 5 or len(output) < batch * (n + 1):
        raise ValueError("enumeration batch output or state too small")
    if len(x) < n + 1 or len(y) < n + 1 or len(z) < n + 1 or len(inc) < n + 1:
        raise ValueError("enumeration batch cursor storage too small")
    if state[4] == 0:
        status = pari_prepare_enumeration(
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
        if status == -1:
            return 0, -1
        if status == 0:
            return 0, -2
        state[4] = status
    count = 0
    while count < batch:
        available = pari_fp_next(
            float_q,
            float_v,
            x,
            y,
            z,
            inc,
            state,
            checked_uint64(n),
            bound[0],
            checked_uint64(skipfirst),
        )
        if available == 0:
            return count, 1
        output[count * (n + 1)] = state[1]
        for i in range(n):
            output[count * (n + 1) + i + 1] = x[i + 1]
        count += 1
    return count, 0

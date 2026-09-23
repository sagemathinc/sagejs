"""PARI 2.17.4 det2 and real-domain det_simple_gauss, dimensions 0..4.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This is a source-transparent numerical dependency, not an exact determinant
replacement or regulator certificate. Exact-only n>=3 remains a frontier
before get_pivot_fun's different first-nonzero schedule.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .regulator_scalar import (
    pari_validate_regulator_values,
    pari_regulator_scalar_add,
    pari_regulator_scalar_multiply,
    pari_regulator_scalar_divide,
)
from .regulator_approx_zero import pari_regulator_pivot_max_unchecked


@native
def pari_regulator_determinant(
    values: IntegerBuffer,
    n: int,
    work: IntegerBuffer,
    output: IntegerBuffer,
    pivot_rows: Int64Buffer,
    state: Int64Buffer,
) -> int:
    """Return 0 for det2 evaluation, -1 for exact-only n>=3 dispatch.

    Column-major triples follow regulator_scalar. State: algorithm 0/1/2/3,
    completed elimination steps, swaps, early-return column (0 if none),
    status. Exact frontier leaves output/work/pivots untouched and publishes
    [-1,0,0,0,-1]. All owners are disjoint; fixed-limb failures may leave
    partial work and output, so state[4] remains -1 until completion.

    Approximate-zero rejection returns the CURRENT DIAGONAL verbatim, not
    exact zero and not the accumulated pivot product. n=2 always evaluates
    a*d-b*c, even for exact inputs, before any pivot-domain dispatch.
    """
    if n < 0 or n > 4:
        raise ValueError("det2 prototype dimension outside 0..4")
    if len(output) < 3 or len(state) < 5:
        raise ValueError("short determinant result workspace")
    if n >= 3 and (len(work) < 3 * n * n or len(pivot_rows) < n - 1):
        raise ValueError("short determinant Gaussian workspace")
    pari_validate_regulator_values(values, n * n)
    inexact = False
    for i in range(n * n):
        if values[3 * i + 1] >= 0:
            inexact = True
    for i in range(5):
        state[i] = 0
    state[4] = -1
    if n >= 3 and not inexact:
        state[0] = -1
        return -1
    if n == 0:
        output[0] = 1
        output[1] = -1
        output[2] = 0
    elif n == 1:
        for i in range(3):
            output[i] = values[i]
        state[0] = 1
    elif n == 2:
        am, ap, ae = pari_regulator_scalar_multiply(
            values[0], values[1], values[2], values[9], values[10], values[11]
        )
        bm, bp, be = pari_regulator_scalar_multiply(
            values[6], values[7], values[8], values[3], values[4], values[5]
        )
        am, ap, ae = pari_regulator_scalar_add(am, ap, ae, -bm, bp, be)
        output[0] = am
        output[1] = ap
        output[2] = ae
        state[0] = 2
    else:
        state[0] = 3
        for i in range(3 * n * n):
            work[i] = values[i]
        sign = 1
        xm, xp, xe = 1, -1, 0
        for i in range(n - 1):
            # Reference is values, NEVER work, including after row swaps.
            row = pari_regulator_pivot_max_unchecked(
                work, values, n, i + 1, pivot_rows, False
            )
            pivot_rows[i] = row
            if row > n:
                at = (i * n + i) * 3
                for k in range(3):
                    output[k] = work[at + k]
                state[3] = i + 1
                state[4] = 0
                return 0
            row -= 1
            if row != i:
                for j in range(i, n):
                    at = (j * n + i) * 3
                    other = (j * n + row) * 3
                    for k in range(3):
                        temporary = work[at + k]
                        work[at + k] = work[other + k]
                        work[other + k] = temporary
                sign = -sign
                state[2] += 1
            at = (i * n + i) * 3
            pm, pp, pe = work[at], work[at + 1], work[at + 2]
            xm, xp, xe = pari_regulator_scalar_multiply(xm, xp, xe, pm, pp, pe)
            for k in range(i + 1, n):
                at = (k * n + i) * 3
                mm, mp, me = work[at], work[at + 1], work[at + 2]
                if mm == 0:
                    continue
                mm, mp, me = pari_regulator_scalar_divide(mm, mp, me, pm, pp, pe)
                for j in range(i + 1, n):
                    at = (i * n + j) * 3
                    bm, bp, be = pari_regulator_scalar_multiply(
                        mm, mp, me, work[at], work[at + 1], work[at + 2]
                    )
                    at = (k * n + j) * 3
                    bm, bp, be = pari_regulator_scalar_add(
                        work[at], work[at + 1], work[at + 2], -bm, bp, be
                    )
                    work[at] = bm
                    work[at + 1] = bp
                    work[at + 2] = be
            state[1] += 1
        if sign < 0:
            xm = -xm
        at = (n * n - 1) * 3
        xm, xp, xe = pari_regulator_scalar_multiply(
            xm, xp, xe, work[at], work[at + 1], work[at + 2]
        )
        output[0] = xm
        output[1] = xp
        output[2] = xe
    state[4] = 0
    return 0

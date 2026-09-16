"""PARI 2.17.4 RgM_inv real-domain basecase, square dimensions 1..4.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Exact-only inputs stop before QM_inv. Generic elimination and get_col keep
the original reference matrix and scalar operation order. No certification.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native
from .regulator_scalar import (
    pari_validate_regulator_values,
    pari_regulator_scalar_add,
    pari_regulator_scalar_multiply,
    pari_regulator_scalar_divide,
    pari_regulator_qmake,
)
from .regulator_approx_zero import pari_regulator_pivot_max_unchecked


@native
def pari_regulator_inverse(
    values: IntegerBuffer,
    n: int,
    work: IntegerBuffer,
    rhs: IntegerBuffer,
    output: IntegerBuffer,
    pivots: Int64Buffer,
    state: Int64Buffer,
) -> int:
    """0=inverse, 1=singular, -1=exact dispatch frontier.

    State contains status, completed pivot count and row-swap count. Owners
    must be disjoint. Invalid shapes/scalars reject before writes. Numerical
    failures may leave scratch modified; output publishes only on success.
    The 2x2 direct adjugate does not initialize Gaussian scratch or pivots.
    """
    if n < 1 or n > 4:
        raise ValueError("inverse prototype dimension outside 1..4")
    if (
        len(work) < 3 * n * n
        or len(rhs) < 3 * n * n
        or len(output) < 3 * n * n
        or len(pivots) < n
        or len(state) < 3
    ):
        raise ValueError("short inverse workspace")
    pari_validate_regulator_values(values, n * n)
    inexact = False
    for i in range(n * n):
        if values[3 * i + 1] >= 0:
            inexact = True
    state[0] = -1
    state[1] = 0
    state[2] = 0
    if not inexact:
        return -1
    if n == 2:
        am, ap, ae = pari_regulator_scalar_multiply(
            values[0], values[1], values[2], values[9], values[10], values[11]
        )
        bm, bp, be = pari_regulator_scalar_multiply(
            values[6], values[7], values[8], values[3], values[4], values[5]
        )
        dm, dp, de = pari_regulator_scalar_add(am, ap, ae, -bm, bp, be)
        if dm == 0:
            state[0] = 1
            return 1
        # ginv constructs exact reciprocals directly, without Qdivii's gcd.
        if dp == -1:
            dm, dp, de = pari_regulator_qmake(1, dm)
        elif dp == -2:
            dm, dp, de = pari_regulator_qmake(de, dm)
        else:
            dm, dp, de = pari_regulator_scalar_divide(1, -1, 0, dm, dp, de)
        # Stage in rhs so output is not published until every scalar succeeds.
        for i in range(4):
            at = 3 * i
            source = at
            sign = -1
            if i == 0:
                source, sign = 9, 1
            elif i == 3:
                source, sign = 0, 1
            am, ap, ae = pari_regulator_scalar_multiply(
                dm,
                dp,
                de,
                sign * values[source],
                values[source + 1],
                values[source + 2],
            )
            rhs[at] = am
            rhs[at + 1] = ap
            rhs[at + 2] = ae
    else:
        for j in range(n):
            for i in range(n):
                at = 3 * (j * n + i)
                for k in range(3):
                    work[at + k] = values[at + k]
                rhs[at] = 0
                if i == j:
                    rhs[at] = 1
                rhs[at + 1] = -1
                rhs[at + 2] = 0
        for i in range(n):
            k = (
                pari_regulator_pivot_max_unchecked(
                    work, values, n, i + 1, pivots, False
                )
                - 1
            )
            pivots[i] = k + 1
            if k == n:
                state[0] = 1
                return 1
            if k != i:
                for j in range(i, n):
                    for t in range(3):
                        a, b = 3 * (j * n + i) + t, 3 * (j * n + k) + t
                        saved = work[a]
                        work[a] = work[b]
                        work[b] = saved
                for j in range(n):
                    for t in range(3):
                        a, b = 3 * (j * n + i) + t, 3 * (j * n + k) + t
                        saved = rhs[a]
                        rhs[a] = rhs[b]
                        rhs[b] = saved
                state[2] += 1
            state[1] = i + 1
            pivot = 3 * (i * n + i)
            if i == n - 1:
                break
            for k in range(i + 1, n):
                at = 3 * (i * n + k)
                if work[at] == 0:
                    continue
                mm, mp, me = pari_regulator_scalar_divide(
                    work[at],
                    work[at + 1],
                    work[at + 2],
                    work[pivot],
                    work[pivot + 1],
                    work[pivot + 2],
                )
                for j in range(i + 1, n):
                    a, b = 3 * (j * n + k), 3 * (j * n + i)
                    tm, tp, te = pari_regulator_scalar_multiply(
                        mm, mp, me, work[b], work[b + 1], work[b + 2]
                    )
                    tm, tp, te = pari_regulator_scalar_add(
                        work[a], work[a + 1], work[a + 2], -tm, tp, te
                    )
                    work[a] = tm
                    work[a + 1] = tp
                    work[a + 2] = te
                for j in range(n):
                    a, b = 3 * (j * n + k), 3 * (j * n + i)
                    tm, tp, te = pari_regulator_scalar_multiply(
                        mm, mp, me, rhs[b], rhs[b + 1], rhs[b + 2]
                    )
                    tm, tp, te = pari_regulator_scalar_add(
                        rhs[a], rhs[a + 1], rhs[a + 2], -tm, tp, te
                    )
                    rhs[a] = tm
                    rhs[a + 1] = tp
                    rhs[a + 2] = te
        # get_col: stage the back solution in rhs, lower rows first. This
        # aliases no still-needed right-hand-side row in the current column.
        for column in range(n):
            for i in range(n - 1, -1, -1):
                at = 3 * (column * n + i)
                mm, mp, me = rhs[at], rhs[at + 1], rhs[at + 2]
                for j in range(i + 1, n):
                    a, b = 3 * (j * n + i), 3 * (column * n + j)
                    tm, tp, te = pari_regulator_scalar_multiply(
                        work[a],
                        work[a + 1],
                        work[a + 2],
                        rhs[b],
                        rhs[b + 1],
                        rhs[b + 2],
                    )
                    mm, mp, me = pari_regulator_scalar_add(mm, mp, me, -tm, tp, te)
                a = 3 * (i * n + i)
                mm, mp, me = pari_regulator_scalar_divide(
                    mm, mp, me, work[a], work[a + 1], work[a + 2]
                )
                rhs[at] = mm
                rhs[at + 1] = mp
                rhs[at + 2] = me
    for i in range(3 * n * n):
        output[i] = rhs[i]
    state[0] = 0
    return 0

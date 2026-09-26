"""PARI 2.17.4 ZV.c ZM_hnfdivrem with quotient output.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
The stored quotient is the negated nearest quotient: R = X + H Q.
This follows the source body and class_group_gen's Ur=U+DY convention,
not the inconsistent x=yQ+R comment above ZM_hnfdivrem.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native
from .hnflll import pari_hnflll_round_quotient
from .regulator_hnf import pari_regulator_hnf_lincomb


@native
def pari_hnf_divrem(
    original: IntegerBuffer,
    hnf: IntegerBuffer,
    rows: int,
    columns: int,
    remainder: IntegerBuffer,
    quotient: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Reduce columns by positive column HNF, preserving source sign/order.

    State is status, row steps, nonzero quotients, positive quotients,
    negative quotients, zero quotients. Owners are disjoint, column-major.
    Shape/capacity/HNF validation precedes all writes; arithmetic resource
    exceptions can leave partial results with status -1. Unused tails remain
    untouched. PARI's newly allocated vectors become resident elementwise
    updates, with the same exact coefficient branches; no timing claim.
    """
    if rows < 0 or columns < 0:
        raise ValueError("negative HNF reduction shape")
    size = rows * columns
    if (
        len(original) < size
        or len(hnf) < rows * rows
        or len(remainder) < size
        or len(quotient) < size
        or len(state) < 6
    ):
        raise ValueError("short HNF reduction owner")
    for i in range(rows):
        diagonal = hnf[i * rows + i]
        if diagonal <= 0:
            raise ValueError("nonpositive HNF diagonal")
        for j in range(rows):
            value = hnf[j * rows + i]
            if j < i and value != 0:
                raise ValueError("HNF must be upper triangular")
            if j > i and (value < 0 or value >= diagonal):
                raise ValueError("HNF upper entries must be reduced")
    for i in range(6):
        state[i] = 0
    state[0] = -1
    for column in range(columns):
        base = column * rows
        for i in range(rows):
            remainder[base + i] = original[base + i]
        i = rows - 1
        while i >= 0:
            q = pari_hnflll_round_quotient(remainder[base + i], hnf[i * rows + i])
            state[1] += 1
            if q != 0:
                q = -q
                for j in range(rows):
                    remainder[base + j] = pari_regulator_hnf_lincomb(
                        1, q, remainder[base + j], hnf[i * rows + j]
                    )
                state[2] += 1
                if q > 0:
                    state[3] += 1
                else:
                    state[4] += 1
            else:
                state[5] += 1
            quotient[base + i] = q
            i -= 1
    state[0] = 0
    return 0

"""PARI 2.17.4 ZM_hnf: hnf_i(remove=1), no transformation, width <=7.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Literal hnf_snf.c ZC_elem, ZM_reduce and hnf_i schedule. Multiword Bezout
uses the documented hnf_bezout arithmetic adapter, not a cost model of GMP
gcdext. Exact integer arithmetic primitives use the native integer backend;
PARI stack allocation, pointer swaps and fused integer primitives become
resident packed copies and exact integer expressions. No timing claim.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native
from .hnf_bezout import pari_hnf_bezout


@native
def pari_regulator_hnf_lincomb(u: int, v: int, x: int, y: int) -> int:
    """Scalar operations selected by ZV.c:ZC_lincomb's coefficient branches."""
    if u == 0:
        return v * y
    if v == 0:
        return u * x
    if v == 1 or v == -1:
        if u == 1 or u == -1:
            if u != v:
                result = x - y
            else:
                result = x + y
            if u < 0:
                result = -result
            return result
        if v > 0:
            return y + x * u
        return x * u - y
    if u == 1:
        return x + y * v
    if u == -1:
        return y * v - x
    return u * x + v * y


@native
def pari_regulator_hnf(
    original: IntegerBuffer,
    rows: int,
    columns: int,
    work: IntegerBuffer,
    column_scratch: IntegerBuffer,
    output: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """0=HNF, -1=width dispatch frontier before ZM_hnfall.

    All matrices are column-major, owners disjoint. Output holds the first
    rows*state[1] integers; unused capacity is untouched. Full work retains
    the source's leading zero columns. State: status, live columns, removed
    columns, row iterations, ZC_elem calls, empty-ak swaps, u-zero branches,
    v-zero branches, general Bezout branches, negative pivot columns,
    nonzero quotient reductions, zero pivots. Dimensions/index arithmetic
    is exact Python int, not unboxed machine-word arithmetic.

    Invalid shapes/capacities reject before writes. Width frontier changes
    only state. Arithmetic/capacity exceptions can leave partial work;
    state[0] remains -1 until output publication completes.
    """
    if rows < 0 or columns < 0:
        raise ValueError("negative HNF dimension")
    size = rows * columns
    if (
        len(original) < size
        or len(work) < size
        or len(column_scratch) < rows
        or len(output) < size
        or len(state) < 12
    ):
        raise ValueError("short HNF workspace")
    for i in range(12):
        state[i] = 0
    state[0] = -1
    if columns > 7:
        return -1
    for i in range(size):
        work[i] = original[i]
    deficient = columns
    lower = 0
    if rows > columns:
        lower = rows - columns
    row = rows
    if columns == 0:
        row = 0
    while row > lower:
        j = deficient - 1
        while j > 0:
            a = work[(j - 1) * rows + row - 1]
            if a != 0:
                state[4] += 1
                k = j - 1
                if j == 1:
                    k = deficient
                b = work[(k - 1) * rows + row - 1]
                if b == 0:
                    for i in range(rows):
                        at, bt = (j - 1) * rows + i, (k - 1) * rows + i
                        saved = work[at]
                        work[at] = work[bt]
                        work[bt] = saved
                    state[5] += 1
                else:
                    d, u, v = pari_hnf_bezout(a, b)
                    if u == 0:
                        q = -(a // b)
                        for i in range(rows - 1, -1, -1):
                            work[(j - 1) * rows + i] += work[(k - 1) * rows + i] * q
                        state[6] += 1
                    elif v == 0:
                        q = -(b // a)
                        for i in range(rows - 1, -1, -1):
                            work[(k - 1) * rows + i] += work[(j - 1) * rows + i] * q
                        for i in range(rows):
                            at, bt = (j - 1) * rows + i, (k - 1) * rows + i
                            saved = work[at]
                            work[at] = work[bt]
                            work[bt] = saved
                        state[7] += 1
                    else:
                        if d != 1 and d != -1:
                            a, b = a // d, b // d
                        a = -a
                        # Preserve the old k column and the source schedule:
                        # create all of new k, then all of new j.
                        for i in range(rows):
                            column_scratch[i] = work[(k - 1) * rows + i]
                        for i in range(rows):
                            work[(k - 1) * rows + i] = pari_regulator_hnf_lincomb(
                                u, v, work[(j - 1) * rows + i], column_scratch[i]
                            )
                        for i in range(rows):
                            work[(j - 1) * rows + i] = pari_regulator_hnf_lincomb(
                                a, b, column_scratch[i], work[(j - 1) * rows + i]
                            )
                        state[8] += 1
            j -= 1
        d = work[(deficient - 1) * rows + row - 1]
        if d != 0:
            if d < 0:
                for i in range(rows):
                    work[(deficient - 1) * rows + i] = -work[(deficient - 1) * rows + i]
                d = -d
                state[9] += 1
            # ZM_reduce sees the already-positive pivot in this caller.
            for j in range(deficient, columns):
                q = work[j * rows + row - 1] // d
                if q == 0:
                    continue
                q = -q
                for i in range(rows - 1, -1, -1):
                    work[j * rows + i] += work[(deficient - 1) * rows + i] * q
                state[10] += 1
            deficient -= 1
        else:
            state[11] += 1
            if lower != 0:
                lower -= 1
        row -= 1
        state[3] += 1
    live = columns - deficient
    for i in range(rows * live):
        output[i] = work[rows * deficient + i]
    state[1] = live
    state[2] = deficient
    state[0] = 0
    return 0

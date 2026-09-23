"""PARI 2.17.4 invariant-only Smith output for an accepted square HNF.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Translate hnf_snf.c:ZM_snfall_i's square-HNF, return_vec=1, U=V=NULL
path, and buch2.c:class_group_gen's stripping of unit factors. The diagonal
schedule is also used by class_group_gen's transformation-producing call:
U and V bookkeeping does not influence the diagonal computation. This is
NOT a port of ideal generators, principal-ideal maps, or a completeness test.
The caller must establish that W presents the class group before publishing
these invariants as field results. PARI's multiword Bezout leaf uses the
explicitly documented hnf_bezout arithmetic-backend substitution.
"""

from math import gcd
from sagejs.native import IntegerBuffer, Int64Buffer, native
from .hnf_bezout import pari_hnf_bezout
from .regulator_hnf import pari_regulator_hnf_lincomb


@native
def pari_class_invariant_output(
    original: IntegerBuffer,
    dimension: int,
    work: IntegerBuffer,
    column: IntegerBuffer,
    invariants: IntegerBuffer,
    class_number: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Return decreasing invariant factors, omitting 1; state[1] is count.

    Square matrices are column-major, owners must be disjoint. Non-HNF input
    returns -1 before writes except state[0]; dimension/capacity errors raise
    before any write. Valid HNF includes the empty matrix (trivial group).
    State stores status, count, column steps, row steps, divisibility repairs,
    modular reductions. Work exposes the source's full final matrix; unused
    output capacity is untouched. Resource exceptions can partially write
    scratch, with state[0]=-1 until final publication. No timing claim.
    """
    n = dimension
    if n < 0:
        raise ValueError("negative Smith dimension")
    if (
        len(original) < n * n
        or len(work) < n * n
        or len(column) < n
        or len(invariants) < n
        or len(class_number) < 1
        or len(state) < 6
    ):
        raise ValueError("short Smith owner")
    for i in range(n):
        diagonal = original[i * n + i]
        if diagonal <= 0:
            state[0] = -1
            return -1
        for j in range(i):
            if original[j * n + i] != 0:
                state[0] = -1
                return -1
        for j in range(i + 1, n):
            value = original[j * n + i]
            if value < 0 or value >= diagonal:
                state[0] = -1
                return -1
    for i in range(6):
        state[i] = 0
    state[0] = -1
    for i in range(n * n):
        work[i] = original[i]
    mdet = 1
    if n > 0:
        mdet = original[0]
        for i in range(1, n):
            mdet *= original[i * n + i]
    determinant_words = (mdet.bit_length() + 63) // 64
    for i in range(n - 1, 0, -1):
        while True:
            changed = False
            for j in range(i - 1, -1, -1):
                b = work[j * n + i]
                if b == 0:
                    continue
                a = work[i * n + i]
                state[2] += 1
                # ZC_elem(b,a,x,NULL,j,i), including coefficient shortcuts.
                if a == 0:
                    for k in range(n):
                        saved = work[j * n + k]
                        work[j * n + k] = work[i * n + k]
                        work[i * n + k] = saved
                else:
                    d, u, v = pari_hnf_bezout(b, a)
                    if u == 0:
                        q = -(b // a)
                        for k in range(n - 1, -1, -1):
                            work[j * n + k] += work[i * n + k] * q
                    elif v == 0:
                        q = -(a // b)
                        for k in range(n - 1, -1, -1):
                            work[i * n + k] += work[j * n + k] * q
                        for k in range(n):
                            saved = work[j * n + k]
                            work[j * n + k] = work[i * n + k]
                            work[i * n + k] = saved
                    else:
                        if d != 1 and d != -1:
                            b, a = b // d, a // d
                        b = -b
                        for k in range(n):
                            column[k] = work[i * n + k]
                        for k in range(n):
                            work[i * n + k] = pari_regulator_hnf_lincomb(
                                u, v, work[j * n + k], column[k]
                            )
                        for k in range(n):
                            work[j * n + k] = pari_regulator_hnf_lincomb(
                                b, a, column[k], work[j * n + k]
                            )
            for j in range(i - 1, -1, -1):
                b = work[i * n + j]
                if b == 0:
                    continue
                a = work[i * n + i]
                # bezout_step has its own equal-magnitude shortcut.
                if abs(a) == abs(b):
                    d = abs(a)
                    u = 1
                    if a < 0:
                        u = -1
                    v = 0
                    if a == b:
                        a, b = 1, 1
                    else:
                        a, b = u, -u
                else:
                    d, u, v = pari_hnf_bezout(a, b)
                    a, b = a // d, b // d
                for k in range(i):
                    t = u * work[k * n + i] + v * work[k * n + j]
                    work[k * n + j] = a * work[k * n + j] - b * work[k * n + i]
                    work[k * n + i] = t
                work[i * n + j] = 0
                work[i * n + i] = d
                state[3] += 1
                changed = True
            if not changed:
                bad_row = -1
                b = work[i * n + i]
                if b != 1 and b != -1:
                    for k in range(i):
                        for j in range(i):
                            if work[j * n + k] % b != 0:
                                bad_row = k
                                break
                        if bad_row >= 0:
                            break
                if bad_row < 0:
                    break
                for j in range(i + 1):
                    work[j * n + i] += work[j * n + bad_row]
                state[4] += 1
            # ZM_redpart compares integer limb lengths, not magnitudes.
            for row in range(i + 1):
                for col in range(i + 1):
                    value = work[col * n + row]
                    if (abs(value).bit_length() + 63) // 64 > determinant_words:
                        reduced = abs(value) % mdet
                        if value < 0:
                            reduced = -reduced
                        work[col * n + row] = reduced
                        state[5] += 1
    for k in range(n - 1, -1, -1):
        d = gcd(work[k * n + k], mdet)
        work[k * n + k] = d
        if d != 1 and d != -1:
            mdet //= d
    count = 0
    for j in range(n):
        d = work[j * n + j]
        if d == 1 or d == -1:
            break
        invariants[count] = d
        count += 1
    h = 1
    if count > 6:
        # ZV_prod dispatches to gen_product at seven entries. Materialize
        # producttree_scheme in the now-unused column owner; reverse stores
        # replace PARI's alternating vectors without changing leaf order.
        column[0] = count
        width = 1
        for level in range((count - 1).bit_length() - 1):
            for j in range(width - 1, -1, -1):
                size = column[j]
                half = size >> 1
                column[2 * j] = size - half
                column[2 * j + 1] = half
            width *= 2
        offset = 0
        for j in range(width):
            size = column[j]
            if size == 1:
                column[j] = invariants[offset]
            else:
                column[j] = invariants[offset] * invariants[offset + 1]
            offset += size
        while width > 1:
            for j in range(width // 2):
                column[j] = column[2 * j] * column[2 * j + 1]
            width //= 2
        h = column[0]
    elif count > 0:
        h = invariants[0]
        for j in range(1, count):
            h *= invariants[j]
    class_number[0] = h
    state[1] = count
    state[0] = 0
    return 0

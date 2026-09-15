"""PARI 2.17.4 RgM_pivots on the regulator matrix [T | real unit logs].

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Keep the exact-integer dispatch and generic Gaussian operation order. This
does not compute a determinant, regulator, or termination result.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .regulator_preparation import (
    pari_regulator_pivot_unchecked,
    pari_validate_regulator_scalars,
)
from .hnfspec_rank_prefix import pari_rectangular_initial_pivots
from .log_matrix_transform import pari_log_scalar_product, pari_log_scalar_sum
from .short_product import pari_short_product, pari_real_integer_division
from .real_division import pari_real_division


@native
def pari_regulator_scalar_product(
    am: int, ap: int, ae: int, bm: int, bp: int, be: int
) -> tuple[int, int, int]:
    """Required gmul dispatch, with local (-1, -2, 2) denoting -1/2.

    The fraction occurs only as the first reciprocal pivot in a signature
    with a complex place. It is not stored in the logarithm matrix. Input
    logarithms are real or exact zero; arbitrary rational logs are excluded.
    """
    if ap == -2:
        if am != -1 or ae != 2:
            raise ValueError("unsupported regulator pivot fraction")
        if bp == -1:
            if bm != 0:
                raise ValueError("nonzero integer logarithm in fraction product")
            return 0, -1, 0
        bm, bp, be = pari_real_integer_division(2, bm, bp, be)
        return -bm, bp, be
    if ap == -1:
        return pari_log_scalar_product(am, bm, bp, be)
    if bp == -1:
        return pari_log_scalar_product(bm, am, ap, ae)
    return pari_short_product(am, ap, ae, bm, bp, be)


@native
def pari_regulator_negative_reciprocal(m: int, p: int, e: int) -> tuple[int, int, int]:
    """gdiv(-1, pivot): Qdivii for T, ginv(gneg(real)) below Newton."""
    if p == -1:
        if m == 1:
            return -1, -1, 0
        if m == 2:
            return -1, -2, 2
        raise ValueError("unsupported exact regulator pivot")
    if m == 0:
        raise ZeroDivisionError("zero regulator pivot")
    if p < 64 or p > 1856 or p % 64 != 0:
        raise ValueError("regulator reciprocal exceeds division window")
    # gdiv's +/-1 shortcut precedes divir. invr_basecase constructs real_1
    # at p+64, then divrr/affrr; the denominator is already negated.
    return pari_real_division(1 << (p + 63), p + 64, 0, -m, p, e)


@native
def pari_regulator_pivots(
    values: IntegerBuffer,
    rows: int,
    columns: int,
    work: IntegerBuffer,
    occupied: Int64Buffer,
    pivots: Int64Buffer,
    state: Int64Buffer,
    rank_input: IntegerBuffer,
    rank_work: IntegerBuffer,
    rank_occupied: IntegerBuffer,
    rank_pivots: IntegerBuffer,
    rank_best: IntegerBuffer,
    rank_state: IntegerBuffer,
) -> int:
    """Return 0 with [nullity, integer-dispatch flag, 0], or rank frontier.

    Input is column-major triples, beginning with exact T entries 1 or 2;
    later entries are prepared reals or exact zero. Scratch owners are
    disjoint. Inexact entries are capped at1856bits so the existing divrr
    leaf admits the required guard word. First-pass validation is extra
    prototype overhead, not part of the upstream numerical schedule.
    The integer branch preserves work and occupied; pivots publish only on
    certified success. Generic elimination uses a validated internal callback.
    """
    if rows < 2 or columns < 1:
        raise ValueError("invalid regulator rank dimensions")
    size = rows * columns
    if (
        len(work) < 3 * size
        or len(occupied) < rows
        or len(pivots) < columns
        or len(state) < 3
        or len(rank_input) < size
        or len(rank_work) < size
        or len(rank_occupied) < rows
        or len(rank_pivots) < columns
        or len(rank_best) < columns
        or len(rank_state) < 10
    ):
        raise ValueError("short regulator rank workspace")
    pari_validate_regulator_scalars(values, size)
    integer_only = True
    for j in range(columns):
        for i in range(rows):
            base = 3 * (j * rows + i)
            m = values[base]
            p = values[base + 1]
            if j == 0:
                if p != -1 or (m != 1 and m != 2):
                    raise ValueError("regulator first column must be exact T")
            elif p == -1:
                if m != 0:
                    raise ValueError("nonzero exact regulator logarithm")
            else:
                integer_only = False
                if p > 1856:
                    raise ValueError("regulator precision exceeds division window")
    state[0] = -1
    state[1] = 0
    state[2] = -1
    if integer_only:
        state[1] = 1
        for i in range(rows):
            for j in range(columns):
                rank_input[i * columns + j] = values[3 * (j * rows + i)]
        status = pari_rectangular_initial_pivots(
            rank_input,
            rows,
            columns,
            rank_work,
            rank_occupied,
            rank_pivots,
            rank_best,
            rank_state,
        )
        state[2] = status
        if status != 0:
            return status
        for j in range(columns):
            pivots[j] = rank_pivots[j]
        state[0] = rank_state[2]
        return 0
    for i in range(3 * size):
        work[i] = values[i]
    for i in range(rows):
        occupied[i] = 0
    nullity = 0
    for k in range(columns):
        row = pari_regulator_pivot_unchecked(work, rows, k + 1, occupied) - 1
        if row == rows:
            nullity += 1
            pivots[k] = 0
        else:
            occupied[row] = k + 1
            pivots[k] = row + 1
            base = 3 * (k * rows + row)
            pm, pp, pe = pari_regulator_negative_reciprocal(
                work[base], work[base + 1], work[base + 2]
            )
            for i in range(k + 1, columns):
                base = 3 * (i * rows + row)
                m, p, e = pari_regulator_scalar_product(
                    pm, pp, pe, work[base], work[base + 1], work[base + 2]
                )
                work[base] = m
                work[base + 1] = p
                work[base + 2] = e
            for t in range(rows):
                if occupied[t] == 0:
                    base = 3 * (k * rows + t)
                    pm = work[base]
                    pp = work[base + 1]
                    pe = work[base + 2]
                    work[base] = 0
                    work[base + 1] = -1
                    work[base + 2] = 0
                    for i in range(k + 1, columns):
                        pivot_base = 3 * (i * rows + row)
                        m, p, e = pari_regulator_scalar_product(
                            pm,
                            pp,
                            pe,
                            work[pivot_base],
                            work[pivot_base + 1],
                            work[pivot_base + 2],
                        )
                        base = 3 * (i * rows + t)
                        m, p, e = pari_log_scalar_sum(
                            work[base], work[base + 1], work[base + 2], m, p, e
                        )
                        work[base] = m
                        work[base + 1] = p
                        work[base + 2] = e
            for i in range(k, columns):
                base = 3 * (i * rows + row)
                work[base] = 0
                work[base + 1] = -1
                work[base + 2] = 0
    state[0] = nullity
    state[2] = 0
    return 0

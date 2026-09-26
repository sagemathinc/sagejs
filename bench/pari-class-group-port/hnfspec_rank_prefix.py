"""PARI 2.17.4 initial rectangular ZM_pivots and row-rank-profile frontier.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

Reuse literal Gaussian pivot elimination only when min(rows, columns)<8.
At larger shapes, stop before CUP. At dubious rank, stop before indexrank_all
and rational verification: neither frontier supplies a certified rank/profile.
The first two modular-small primes are pinned source sieve values, not RNG.
Exact IntegerBuffer residue arithmetic is inherited from lll_rank; this is
not an unboxed word-cost or complete HNF claim. Buffers must be disjoint.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .lll_rank import pari_flm_rectangular_pivots
from .hnfspec_cleanup import pari_hnfspec_cleanup


@native
def pari_rectangular_initial_pivots(
    original: IntegerBuffer,
    rows: int,
    columns: int,
    matrix: IntegerBuffer,
    occupied: IntegerBuffer,
    pivots: IntegerBuffer,
    best: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Return 0 certified, -1 before verification, -2 before CUP dispatch.

    Inputs and modular output are row-major. state: completed trials, last
    prime, rbest, zc, rmin, imax, has_dbest, nr, profile length, status.
    The final three slots are owned by the profile entry below. The source's
    NULL dbest is represented by has_dbest=0; its buffer is then untouched.
    """
    if rows < 0 or columns < 0:
        raise ValueError("invalid rectangular rank dimensions")
    if len(original) < rows * columns or len(matrix) < rows * columns:
        raise ValueError("short rectangular rank matrix")
    if (
        len(occupied) < rows
        or len(pivots) < columns
        or len(best) < columns
        or len(state) < 10
    ):
        raise ValueError("short rectangular rank state")
    for i in range(10):
        state[i] = 0
    state[2] = columns
    if columns == 0:
        return 0
    zeros = 0
    for j in range(columns):
        zero = 1
        for i in range(rows):
            if original[i * columns + j] != 0:
                zero = 0
        zeros += zero
    state[3] = zeros
    if zeros == columns:
        for j in range(columns):
            pivots[j] = 0
        return 0
    minimum = zeros
    if columns - rows > minimum:
        minimum = columns - rows
    state[4] = minimum
    small = rows
    if columns < small:
        small = columns
    imax = 3
    if small < 16:
        imax = 1
    elif small < 64:
        imax = 2
    state[5] = imax
    # CUP shapes stop on the first dispatch; Gaussian shapes have imax=1,
    # hence exactly these two sieve primes cover the entire initial phase.
    for trial in range(2):
        prime = 2147483659
        if trial == 1:
            prime = 2147483693
        state[1] = prime
        for i in range(rows * columns):
            matrix[i] = original[i] % prime
        if rows >= 8 and columns >= 8:
            state[9] = -2
            return -2
        nullity = pari_flm_rectangular_pivots(
            matrix, rows, columns, prime, occupied, pivots
        )
        state[0] = trial + 1
        if nullity == minimum:
            state[2] = nullity
            return 0
        if nullity < state[2]:
            state[2] = nullity
            state[6] = 1
            for i in range(columns):
                best[i] = pivots[i]
    state[9] = -1
    return -1


@native
def pari_hnfspec_rank_prefix(
    extra: IntegerBuffer,
    cleanup_state: Int64Buffer,
    matrix: IntegerBuffer,
    occupied: IntegerBuffer,
    pivots: IntegerBuffer,
    best: IntegerBuffer,
    profile: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Consume the actual resident output of pari_hnfspec_cleanup.

    Column-major extramat is already row-major shallowtrans(extramat): no
    matrix copy or invented rank input. On failure profile stays untouched;
    state[7:9] are -1, never mistaken for certified rank/dimensions. Prefix
    HIGHBIT-stop is an ordinary completed cleanup and may enter this stage.
    No caller may pass a failed/incomplete cleanup checkpoint.
    """
    if len(cleanup_state) < 10 or len(state) < 10:
        raise ValueError("short rank profile state")
    columns = cleanup_state[3]
    lnz = cleanup_state[2]
    if columns < 0 or lnz < 1 or len(extra) < columns * (lnz - 1):
        raise ValueError("invalid rank profile dimensions")
    if len(profile) < lnz:
        raise ValueError("short rank profile permutation")
    if columns == 0:
        # Literal hnfspec_i special branch, including its header-sized lnz.
        for i in range(10):
            state[i] = 0
        for i in range(lnz):
            profile[i] = i + 1
        state[7] = lnz
        state[8] = lnz
        return 0
    status = pari_rectangular_initial_pivots(
        extra,
        columns,
        lnz - 1,
        matrix,
        occupied,
        pivots,
        best,
        state,
    )
    if status != 0:
        state[7] = -1
        state[8] = -1
        return status
    redundant = state[2]
    first = 0
    second = redundant
    for i in range(lnz - 1):
        if pivots[i] != 0:
            profile[second] = i + 1
            second += 1
        else:
            profile[first] = i + 1
            first += 1
    state[7] = redundant
    state[8] = lnz - 1
    return 0


@native
def pari_hnfspec_cleanup_rank_prefix(
    mat0: Int64Buffer,
    rows: int,
    columns: int,
    perm: Int64Buffer,
    k0: int,
    c_rows: int,
    mat: Int64Buffer,
    dense: IntegerBuffer,
    transform: IntegerBuffer,
    vmax: Int64Buffer,
    found: Int64Buffer,
    sparse_state: Int64Buffer,
    bottom: IntegerBuffer,
    updated_dense: IntegerBuffer,
    extra: IntegerBuffer,
    cleanup_state: Int64Buffer,
    matrix: IntegerBuffer,
    occupied: IntegerBuffer,
    pivots: IntegerBuffer,
    best: IntegerBuffer,
    profile: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Fuse original sparse input through cleanup and initial rank profile.

    All owners stay resident across direct compiled calls. Added rank owners
    conservatively reserve original dimensions, not unknown live dimensions:
    matrix rows*columns, occupied columns, pivots/best rows, profile rows+1.
    Added capacity failures reject before cleanup mutates anything. Later
    arithmetic/allocation errors may leave partial mutation, as in cleanup.
    Return 0 certifies this profile only; -1/-2 retain the documented rank
    frontiers and never complete HNF. sparse_state[5] retains HIGHBIT status.
    """
    if rows < 0 or columns < 0:
        raise ValueError("invalid fused rank dimensions")
    if len(matrix) < rows * columns or len(occupied) < columns:
        raise ValueError("short fused rank matrix workspace")
    if (
        len(pivots) < rows
        or len(best) < rows
        or len(profile) < rows + 1
        or len(state) < 10
    ):
        raise ValueError("short fused rank state")
    cleanup_status = pari_hnfspec_cleanup(
        mat0,
        rows,
        columns,
        perm,
        k0,
        c_rows,
        mat,
        dense,
        transform,
        vmax,
        found,
        sparse_state,
        bottom,
        updated_dense,
        extra,
        cleanup_state,
    )
    if cleanup_status != 0 and cleanup_status != 1:
        raise ValueError("incomplete cleanup checkpoint")
    return pari_hnfspec_rank_prefix(
        extra,
        cleanup_state,
        matrix,
        occupied,
        pivots,
        best,
        profile,
        state,
    )

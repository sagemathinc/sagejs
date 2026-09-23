"""PARI 2.17.4 initial `ZM_pivots` schedule with explicit CUP workspace.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
The 64-bit source prime schedule is retained. Nonmaximal modular rank stops
before rational verification; unsupported CUP multiplication also stops.
This is not a complete integer rank algorithm. All owners must be disjoint.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .flm_cup import pari_flm_cup
from .lll_rank import pari_flm_rectangular_pivots


@native
def pari_rectangular_cup_initial_pivots(
    original: IntegerBuffer,
    rows: int,
    columns: int,
    matrix: IntegerBuffer,
    occupied: IntegerBuffer,
    pivots: IntegerBuffer,
    best: IntegerBuffer,
    state: IntegerBuffer,
    arena: IntegerBuffer,
    frames: IntegerBuffer,
    solve_state: Int64Buffer,
    cup_state: Int64Buffer,
) -> int:
    """Return 0 certified, -1 before exact verification, -2 before Strassen.

    Row-major input and scratch. Ten state entries retain the Gaussian prefix
    layout: trials, prime, best nullity, zero columns, minimum nullity, imax,
    has_best, reserved, reserved, status. Only completed trials are counted.
    On -2 pivots retain the preceding completed trial (or caller contents).
    CUP owners use its documented capacities; small shapes do not use them.
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
    if rows >= 8 and columns >= 8:
        capacity = rows * columns
        depth = rows // 4 + 1
        if (
            len(arena) < 8 * capacity * depth
            or len(frames) < 3 * (columns.bit_length() + 1)
            or len(solve_state) < 8
            or len(cup_state) < 8
        ):
            raise ValueError("short CUP rank workspace")
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
    for trial in range(imax + 1):
        prime = 2147483659
        if trial == 1:
            prime = 2147483693
        elif trial == 2:
            prime = 2147483713
        elif trial == 3:
            prime = 2147483743
        state[1] = prime
        for i in range(rows * columns):
            matrix[i] = original[i] % prime
        if rows >= 8 and columns >= 8:
            status = pari_flm_cup(
                matrix,
                rows,
                columns,
                prime,
                arena,
                frames,
                solve_state,
                pivots,
                cup_state,
            )
            if status != 0:
                state[9] = -2
                return -2
            nullity = cup_state[2]
        else:
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
def pari_hnfspec_cup_rank_prefix(
    extra: IntegerBuffer,
    cleanup_state: Int64Buffer,
    matrix: IntegerBuffer,
    occupied: IntegerBuffer,
    pivots: IntegerBuffer,
    best: IntegerBuffer,
    profile: IntegerBuffer,
    state: IntegerBuffer,
    arena: IntegerBuffer,
    frames: IntegerBuffer,
    solve_state: Int64Buffer,
    cup_state: Int64Buffer,
) -> int:
    """Assemble the source row profile only after certified initial rank.

    Consume completed resident cleanup only. Column-major extramat is already
    row-major shallowtrans(extramat). On a frontier, profile stays untouched
    and state[7:9] are -1. The empty branch retains source header-sized lnz.
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
        for i in range(10):
            state[i] = 0
        for i in range(lnz):
            profile[i] = i + 1
        state[7] = lnz
        state[8] = lnz
        return 0
    status = pari_rectangular_cup_initial_pivots(
        extra,
        columns,
        lnz - 1,
        matrix,
        occupied,
        pivots,
        best,
        state,
        arena,
        frames,
        solve_state,
        cup_state,
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
